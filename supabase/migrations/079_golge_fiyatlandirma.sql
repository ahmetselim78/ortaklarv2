-- 079 - Legacy akışı etkilemeyen asenkron gölge fiyatlandırma

CREATE TABLE public.golge_fiyatlandirma_kuyrugu (
  siparis_id uuid PRIMARY KEY REFERENCES public.siparisler(id) ON DELETE CASCADE,
  durum text NOT NULL DEFAULT 'bekliyor'
    CHECK (durum IN ('bekliyor', 'isleniyor', 'tamamlandi', 'basarisiz')),
  deneme_sayisi integer NOT NULL DEFAULT 0 CHECK (deneme_sayisi >= 0),
  son_degisim_at timestamptz NOT NULL DEFAULT now(),
  kilitlendi_at timestamptz,
  tamamlandi_at timestamptz,
  son_hata text
);

CREATE TABLE public.golge_fiyatlandirma_calismalari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siparis_id uuid NOT NULL REFERENCES public.siparisler(id) ON DELETE RESTRICT,
  cari_id uuid NOT NULL REFERENCES public.cari(id) ON DELETE RESTRICT,
  durum text NOT NULL CHECK (durum IN ('basarili', 'eksik_veri', 'hata')),
  girdi_hash text NOT NULL,
  fiyat_baglam_hash text,
  sonuc_hash text,
  hesaplama_surumu text,
  legacy_toplam numeric(18,2),
  kanonik_toplam numeric(18,2),
  fark_tutari numeric(18,2),
  fark_yuzdesi numeric(12,4),
  dusuk_marj boolean,
  eksikler jsonb NOT NULL DEFAULT '[]'::jsonb,
  sonuc_json jsonb,
  hata_kodu text,
  hata_mesaji text,
  hesaplama_suresi_ms integer NOT NULL CHECK (hesaplama_suresi_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX golge_fiyatlandirma_kuyruk_idx
  ON public.golge_fiyatlandirma_kuyrugu(durum, son_degisim_at)
  WHERE durum IN ('bekliyor', 'basarisiz');
CREATE INDEX golge_fiyatlandirma_siparis_tarih_idx
  ON public.golge_fiyatlandirma_calismalari(siparis_id, created_at DESC);
CREATE INDEX golge_fiyatlandirma_cari_durum_idx
  ON public.golge_fiyatlandirma_calismalari(cari_id, durum, created_at DESC);

CREATE OR REPLACE FUNCTION public.golge_siparis_kuyruga_al()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mod public.ticari_modul_modu;
BEGIN
  SELECT mod INTO v_mod FROM public.ticari_modul_durumu WHERE singleton;
  IF v_mod <> 'golge' THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.golge_fiyatlandirma_kuyrugu (
      siparis_id, durum, son_degisim_at, kilitlendi_at, tamamlandi_at, son_hata
    )
    SELECT DISTINCT siparis_id, 'bekliyor', now(), NULL, NULL, NULL
    FROM yeni_satirlar
    WHERE siparis_id IS NOT NULL
    ON CONFLICT (siparis_id) DO UPDATE
    SET durum = 'bekliyor',
        son_degisim_at = now(),
        kilitlendi_at = NULL,
        tamamlandi_at = NULL,
        son_hata = NULL;
  EXCEPTION WHEN OTHERS THEN
    -- Gölge telemetrisi, yetkili legacy sipariş transaction'ını engellemez.
    RETURN NULL;
  END;

  RETURN NULL;
END;
$$;

CREATE TRIGGER golge_siparis_detay_insert_queue
  AFTER INSERT ON public.siparis_detaylari
  REFERENCING NEW TABLE AS yeni_satirlar
  FOR EACH STATEMENT EXECUTE FUNCTION public.golge_siparis_kuyruga_al();

CREATE TRIGGER golge_siparis_detay_update_queue
  AFTER UPDATE ON public.siparis_detaylari
  REFERENCING NEW TABLE AS yeni_satirlar
  FOR EACH STATEMENT EXECUTE FUNCTION public.golge_siparis_kuyruga_al();

CREATE OR REPLACE FUNCTION public.golge_siparis_basligi_kuyruga_al()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mod public.ticari_modul_modu;
BEGIN
  SELECT mod INTO v_mod FROM public.ticari_modul_durumu WHERE singleton;
  IF v_mod <> 'golge' OR COALESCE(NEW.fiyatlandirildi, false) THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.golge_fiyatlandirma_kuyrugu (
      siparis_id, durum, son_degisim_at, kilitlendi_at, tamamlandi_at, son_hata
    )
    VALUES (NEW.id, 'bekliyor', now(), NULL, NULL, NULL)
    ON CONFLICT (siparis_id) DO UPDATE
    SET durum = 'bekliyor',
        son_degisim_at = now(),
        kilitlendi_at = NULL,
        tamamlandi_at = NULL,
        son_hata = NULL;
  EXCEPTION WHEN OTHERS THEN
    -- Gölge telemetrisi, yetkili legacy sipariş transaction'ını engellemez.
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER golge_siparis_basligi_queue
  AFTER INSERT OR UPDATE OF cari_id, tarih, teslim_tarihi, teslimat_tipi
  ON public.siparisler
  FOR EACH ROW EXECUTE FUNCTION public.golge_siparis_basligi_kuyruga_al();

CREATE OR REPLACE FUNCTION public.golge_fiyatlandirma_calistir(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kuyruk record;
  v_payload jsonb;
  v_sonuc jsonb;
  v_legacy_toplam numeric(18,2);
  v_kanonik_toplam numeric(18,2);
  v_baslangic timestamptz;
  v_sure integer;
  v_tamamlanan integer := 0;
  v_basarisiz integer := 0;
BEGIN
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR (
      auth.uid() IS NOT NULL
      AND public.has_permission('pricing', 'manage')
      AND public.current_aal2()
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'GOLGE_CALISTIRMA_YETKISI_GEREKLI';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'GOLGE_LIMIT_GECERSIZ';
  END IF;

  FOR v_kuyruk IN
    SELECT kuyruk.siparis_id
    FROM public.golge_fiyatlandirma_kuyrugu kuyruk
    WHERE (
      kuyruk.durum = 'bekliyor'
      OR (
        kuyruk.durum = 'basarisiz'
        AND kuyruk.deneme_sayisi < 3
      )
      OR (
        kuyruk.durum = 'isleniyor'
        AND kuyruk.kilitlendi_at < now() - interval '10 minutes'
      )
    )
      AND kuyruk.son_degisim_at < now() - interval '5 seconds'
    ORDER BY kuyruk.son_degisim_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.golge_fiyatlandirma_kuyrugu
    SET durum = 'isleniyor',
        deneme_sayisi = deneme_sayisi + 1,
        kilitlendi_at = now(),
        son_hata = NULL
    WHERE siparis_id = v_kuyruk.siparis_id;

    BEGIN
      v_baslangic := clock_timestamp();

      SELECT jsonb_build_object(
        'belge_turu', 'golge',
        'cari_id', siparis.cari_id,
        'tarih', siparis.tarih,
        'para_birimi', NULL,
        'teslim_tarihi', siparis.teslim_tarihi,
        'notlar', siparis.notlar,
        'alt_musteri', siparis.alt_musteri,
        'harici_siparis_no', siparis.harici_siparis_no,
        'teslimat_tipi', siparis.teslimat_tipi,
        'kaynak', siparis.kaynak,
        'satirlar', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'detay_id', detay.id,
              'stok_id', detay.stok_id,
              'genislik_mm', detay.genislik_mm,
              'yukseklik_mm', detay.yukseklik_mm,
              'adet', detay.adet,
              'cita_stok_id', detay.cita_stok_id,
              'kenar_islemi', detay.kenar_islemi,
              'notlar', detay.notlar,
              'poz', detay.poz,
              'menfez_cap_mm', detay.menfez_cap_mm,
              'kucuk_cam', detay.kucuk_cam
            )
            ORDER BY detay.created_at, detay.id
          )
          FROM public.siparis_detaylari detay
          WHERE detay.siparis_id = siparis.id
            AND COALESCE(detay.aktif, true)
        ), '[]'::jsonb)
      )
      INTO v_payload
      FROM public.siparisler siparis
      WHERE siparis.id = v_kuyruk.siparis_id;

      IF v_payload IS NULL THEN
        RAISE EXCEPTION 'Sipariş bulunamadı';
      END IF;

      SELECT round(COALESCE(sum(
        detay.genislik_mm * detay.yukseklik_mm / 1000000::numeric
          * detay.adet * COALESCE(stok_row.birim_fiyat, 0)
      ), 0), 2)
      INTO v_legacy_toplam
      FROM public.siparis_detaylari detay
      LEFT JOIN public.stok stok_row ON stok_row.id = detay.stok_id
      WHERE detay.siparis_id = v_kuyruk.siparis_id
        AND COALESCE(detay.aktif, true);

      v_sonuc := public.fiyat_hesapla_internal(v_payload, NULL);
      v_kanonik_toplam := public.ticari_guvenli_numeric(v_sonuc ->> 'genel_toplam');
      v_sure := GREATEST(
        0,
        round(extract(epoch FROM (clock_timestamp() - v_baslangic)) * 1000)::integer
      );

      INSERT INTO public.golge_fiyatlandirma_calismalari (
        siparis_id, cari_id, durum, girdi_hash, fiyat_baglam_hash,
        sonuc_hash, hesaplama_surumu, legacy_toplam, kanonik_toplam,
        fark_tutari, fark_yuzdesi, dusuk_marj, eksikler, sonuc_json,
        hesaplama_suresi_ms
      )
      SELECT
        siparis.id,
        siparis.cari_id,
        CASE WHEN COALESCE((v_sonuc ->> 'gecerli')::boolean, false)
          THEN 'basarili' ELSE 'eksik_veri' END,
        v_sonuc ->> 'girdi_hash',
        v_sonuc ->> 'fiyat_baglam_hash',
        v_sonuc ->> 'sonuc_hash',
        v_sonuc ->> 'hesaplama_surumu',
        v_legacy_toplam,
        v_kanonik_toplam,
        round(v_kanonik_toplam - v_legacy_toplam, 2),
        CASE WHEN v_legacy_toplam = 0 THEN NULL
          ELSE round((v_kanonik_toplam - v_legacy_toplam) / v_legacy_toplam * 100, 4) END,
        COALESCE((v_sonuc ->> 'dusuk_marj')::boolean, false),
        COALESCE(v_sonuc -> 'hatalar', '[]'::jsonb),
        v_sonuc,
        v_sure
      FROM public.siparisler siparis
      WHERE siparis.id = v_kuyruk.siparis_id;

      UPDATE public.golge_fiyatlandirma_kuyrugu
      SET durum = 'tamamlandi',
          tamamlandi_at = now(),
          kilitlendi_at = NULL
      WHERE siparis_id = v_kuyruk.siparis_id;
      v_tamamlanan := v_tamamlanan + 1;
    EXCEPTION WHEN OTHERS THEN
      v_sure := GREATEST(
        0,
        round(extract(epoch FROM (clock_timestamp() - v_baslangic)) * 1000)::integer
      );
      INSERT INTO public.golge_fiyatlandirma_calismalari (
        siparis_id, cari_id, durum, girdi_hash, hata_kodu, hata_mesaji,
        hesaplama_suresi_ms
      )
      SELECT
        siparis.id,
        siparis.cari_id,
        'hata',
        public.ticari_json_hash(COALESCE(v_payload, '{}'::jsonb)),
        SQLSTATE,
        left(SQLERRM, 2000),
        v_sure
      FROM public.siparisler siparis
      WHERE siparis.id = v_kuyruk.siparis_id;

      UPDATE public.golge_fiyatlandirma_kuyrugu
      SET durum = 'basarisiz',
          kilitlendi_at = NULL,
          son_hata = left(SQLSTATE || ': ' || SQLERRM, 2000)
      WHERE siparis_id = v_kuyruk.siparis_id;
      v_basarisiz := v_basarisiz + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'tamamlanan', v_tamamlanan,
    'basarisiz', v_basarisiz
  );
END;
$$;

CREATE TRIGGER golge_fiyatlandirma_calismalari_immutable
  BEFORE UPDATE OR DELETE ON public.golge_fiyatlandirma_calismalari
  FOR EACH ROW EXECUTE FUNCTION public.ticari_kayit_degistirilemez();

ALTER TABLE public.golge_fiyatlandirma_kuyrugu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golge_fiyatlandirma_kuyrugu FORCE ROW LEVEL SECURITY;
ALTER TABLE public.golge_fiyatlandirma_calismalari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golge_fiyatlandirma_calismalari FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.golge_fiyatlandirma_kuyrugu FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.golge_fiyatlandirma_calismalari FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.golge_fiyatlandirma_kuyrugu, public.golge_fiyatlandirma_calismalari
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golge_fiyatlandirma_kuyrugu
  TO service_role;
GRANT SELECT, INSERT ON public.golge_fiyatlandirma_calismalari TO service_role;

CREATE POLICY golge_kuyruk_pricing_read
  ON public.golge_fiyatlandirma_kuyrugu FOR SELECT TO authenticated
  USING (public.has_permission('pricing', 'read'));
CREATE POLICY golge_calismalari_pricing_read
  ON public.golge_fiyatlandirma_calismalari FOR SELECT TO authenticated
  USING (public.has_permission('pricing', 'read'));

REVOKE ALL ON FUNCTION public.golge_siparis_kuyruga_al()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.golge_siparis_basligi_kuyruga_al()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.golge_fiyatlandirma_calistir(integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golge_fiyatlandirma_calistir(integer)
  TO authenticated, service_role;
