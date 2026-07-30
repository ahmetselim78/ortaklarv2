-- 107 - Tedarikçi siparişi -> mal kabul -> stok -> cari yaşam döngüsü
--
-- Eski tedarikci_siparisleri satırları ve RPC imzaları korunur. Yeni kalem,
-- mal kabul ve cari bağlantıları nullable/ayrı tablolardadır; geçmiş kayıtlar
-- için sessiz veya tahmine dayalı bir backfill yapılmaz.

SET search_path = public, extensions, pg_catalog;

-- Tedarikçi faturası tedarikçinin alacağını, tedarikçi ödemesi bu alacağı
-- azaltan borç hareketini temsil eder. Müşteri tahsilatı türleri değiştirilmez.
ALTER TABLE public.cari_hareketleri
  DROP CONSTRAINT IF EXISTS cari_hareketleri_hareket_turu_check;

ALTER TABLE public.cari_hareketleri
  ADD CONSTRAINT cari_hareketleri_hareket_turu_check CHECK (
    hareket_turu IN (
      'siparis_borcu',
      'siparis_farki_borc',
      'siparis_farki_alacak',
      'siparis_iptal_borc',
      'siparis_iptal_alacak',
      'tahsilat',
      'on_odeme',
      'acilis_borcu',
      'acilis_alacagi',
      'manuel_duzeltme_borc',
      'manuel_duzeltme_alacak',
      'ters_kayit',
      'baglanti_on_odeme',
      'baglanti_fiyat_farki_borc',
      'baglanti_fiyat_farki_alacak',
      'tedarikci_faturasi',
      'tedarikci_odemesi'
    )
  );

ALTER TABLE public.tedarikci_siparisleri
  ADD COLUMN IF NOT EXISTS fatura_cari_hareket_id uuid
    REFERENCES public.cari_hareketleri(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS odeme_cari_hareket_id uuid
    REFERENCES public.cari_hareketleri(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS fatura_onaylandi_at timestamptz,
  ADD COLUMN IF NOT EXISTS odeme_onaylandi_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS tedarikci_siparisleri_fatura_hareket_unique
  ON public.tedarikci_siparisleri(fatura_cari_hareket_id)
  WHERE fatura_cari_hareket_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tedarikci_siparisleri_odeme_hareket_unique
  ON public.tedarikci_siparisleri(odeme_cari_hareket_id)
  WHERE odeme_cari_hareket_id IS NOT NULL;

CREATE TABLE public.tedarikci_siparis_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tedarikci_siparisi_id uuid NOT NULL
    REFERENCES public.tedarikci_siparisleri(id) ON DELETE RESTRICT,
  satir_no integer NOT NULL CHECK (satir_no > 0),
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  miktar numeric(20,6) NOT NULL CHECK (miktar > 0),
  birim text NOT NULL CHECK (nullif(btrim(birim), '') IS NOT NULL),
  net_birim_fiyat numeric(20,8) NOT NULL CHECK (net_birim_fiyat > 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  stok_alis_fiyati_id uuid
    REFERENCES public.stok_alis_fiyatlari(id) ON DELETE RESTRICT,
  fiyat_varyanti text,
  vade_gunu integer CHECK (vade_gunu IS NULL OR vade_gunu BETWEEN 0 AND 3650),
  net_tutar numeric(20,2) GENERATED ALWAYS AS (
    round(miktar * net_birim_fiyat, 2)
  ) STORED,
  aciklama text,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tedarikci_siparisi_id, satir_no),
  UNIQUE (id, tedarikci_siparisi_id)
);

CREATE INDEX tedarikci_siparis_kalemleri_stok_idx
  ON public.tedarikci_siparis_kalemleri(stok_id, created_at DESC);

CREATE INDEX tedarikci_siparis_kalemleri_fiyat_idx
  ON public.tedarikci_siparis_kalemleri(stok_alis_fiyati_id)
  WHERE stok_alis_fiyati_id IS NOT NULL;

CREATE TABLE public.tedarikci_mal_kabulleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tedarikci_siparisi_id uuid NOT NULL
    REFERENCES public.tedarikci_siparisleri(id) ON DELETE RESTRICT,
  kabul_tarihi timestamptz NOT NULL,
  belge_no text,
  aciklama text NOT NULL CHECK (length(btrim(aciklama)) >= 3),
  idempotency_id uuid NOT NULL UNIQUE
    REFERENCES public.islem_idempotency(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tedarikci_siparisi_id)
);

CREATE INDEX tedarikci_mal_kabulleri_siparis_tarih_idx
  ON public.tedarikci_mal_kabulleri(
    tedarikci_siparisi_id,
    kabul_tarihi DESC,
    created_at DESC
  );

CREATE TABLE public.tedarikci_mal_kabul_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mal_kabul_id uuid NOT NULL,
  tedarikci_siparisi_id uuid NOT NULL,
  siparis_kalemi_id uuid NOT NULL,
  miktar numeric(20,6) NOT NULL CHECK (miktar > 0),
  stok_hareketi_id uuid NOT NULL UNIQUE
    REFERENCES public.stok_hareketleri(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tedarikci_mal_kabul_kalemleri_kabul_fk
    FOREIGN KEY (mal_kabul_id, tedarikci_siparisi_id)
    REFERENCES public.tedarikci_mal_kabulleri(id, tedarikci_siparisi_id)
    ON DELETE RESTRICT,
  CONSTRAINT tedarikci_mal_kabul_kalemleri_siparis_kalemi_fk
    FOREIGN KEY (siparis_kalemi_id, tedarikci_siparisi_id)
    REFERENCES public.tedarikci_siparis_kalemleri(id, tedarikci_siparisi_id)
    ON DELETE RESTRICT,
  UNIQUE (mal_kabul_id, siparis_kalemi_id)
);

CREATE INDEX tedarikci_mal_kabul_kalemleri_siparis_kalemi_idx
  ON public.tedarikci_mal_kabul_kalemleri(siparis_kalemi_id, created_at);

COMMENT ON TABLE public.tedarikci_siparis_kalemleri IS
  'Tedarikçi siparişinin stok kartına bağlı miktar ve net alış fiyatı snapshot satırları.';
COMMENT ON COLUMN public.tedarikci_siparis_kalemleri.stok_alis_fiyati_id IS
  'Sipariş anında seçilmiş alış fiyatı kaydı; yoksa satır fiyatı bağımsız snapshot olarak kalır.';
COMMENT ON COLUMN public.tedarikci_siparis_kalemleri.fiyat_varyanti IS
  'ME/JU gibi tedarikçiye özgü fiyat varyantının sipariş anındaki etiketi.';
COMMENT ON TABLE public.tedarikci_mal_kabulleri IS
  'Bir sipariş için birden fazla kısmi mal kabulüne izin veren değişmez kabul başlığı.';
COMMENT ON TABLE public.tedarikci_mal_kabul_kalemleri IS
  'Her kabul miktarını tam olarak bir append-only alış stok hareketine bağlar.';

CREATE OR REPLACE FUNCTION public.tedarikci_siparis_kalemini_dogrula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_siparis public.tedarikci_siparisleri%ROWTYPE;
  v_stok public.stok%ROWTYPE;
  v_fiyat public.stok_alis_fiyatlari%ROWTYPE;
BEGIN
  SELECT * INTO v_siparis
  FROM public.tedarikci_siparisleri
  WHERE id = NEW.tedarikci_siparisi_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'TEDARIKCI_SIPARISI_BULUNAMADI';
  END IF;
  IF v_siparis.fatura_no IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'FATURALANMIS_SIPARISE_KALEM_EKLENEMEZ';
  END IF;
  IF NEW.para_birimi IS DISTINCT FROM v_siparis.para_birimi THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SIPARIS_KALEMI_PARA_BIRIMI_UYUSMUYOR';
  END IF;

  SELECT * INTO v_stok
  FROM public.stok
  WHERE id = NEW.stok_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'STOK_KARTI_BULUNAMADI';
  END IF;
  IF NOT v_stok.aktif THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PASIF_STOK_SIPARIS_KALEMI_OLAMAZ';
  END IF;
  IF lower(btrim(NEW.birim)) IS DISTINCT FROM lower(btrim(v_stok.birim)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SIPARIS_KALEMI_STOK_BIRIMI_UYUSMUYOR';
  END IF;

  IF NEW.stok_alis_fiyati_id IS NOT NULL THEN
    SELECT * INTO v_fiyat
    FROM public.stok_alis_fiyatlari
    WHERE id = NEW.stok_alis_fiyati_id;
    IF NOT FOUND
       OR v_fiyat.stok_id IS DISTINCT FROM NEW.stok_id
       OR v_fiyat.tedarikci_id IS DISTINCT FROM v_siparis.tedarikci_id
       OR v_fiyat.para_birimi IS DISTINCT FROM NEW.para_birimi THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'SIPARIS_KALEMI_FIYAT_KAYNAGI_UYUSMUYOR';
    END IF;
  END IF;

  NEW.fiyat_varyanti := NULLIF(btrim(COALESCE(NEW.fiyat_varyanti, '')), '');
  NEW.aciklama := NULLIF(btrim(COALESCE(NEW.aciklama, '')), '');
  RETURN NEW;
END;
$$;

CREATE TRIGGER tedarikci_siparis_kalemleri_dogrulama
  BEFORE INSERT ON public.tedarikci_siparis_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.tedarikci_siparis_kalemini_dogrula();

CREATE OR REPLACE FUNCTION public.tedarikci_satin_alma_kaydini_degistirilemez_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'TEDARIKCI_SATIN_ALMA_KAYDI_DEGISTIRILEMEZ',
    DETAIL = 'Sipariş fiyatı ve mal kabul kayıtları snapshot/append-only tutulur.';
END;
$$;

CREATE TRIGGER tedarikci_siparis_kalemleri_immutable
  BEFORE UPDATE OR DELETE ON public.tedarikci_siparis_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.tedarikci_satin_alma_kaydini_degistirilemez_koru();

CREATE TRIGGER tedarikci_mal_kabulleri_immutable
  BEFORE UPDATE OR DELETE ON public.tedarikci_mal_kabulleri
  FOR EACH ROW EXECUTE FUNCTION public.tedarikci_satin_alma_kaydini_degistirilemez_koru();

CREATE TRIGGER tedarikci_mal_kabul_kalemleri_immutable
  BEFORE UPDATE OR DELETE ON public.tedarikci_mal_kabul_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.tedarikci_satin_alma_kaydini_degistirilemez_koru();

CREATE OR REPLACE FUNCTION public.tedarikci_mal_kabul_kalemini_dogrula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kalem public.tedarikci_siparis_kalemleri%ROWTYPE;
  v_onceki_kabul numeric;
BEGIN
  SELECT * INTO v_kalem
  FROM public.tedarikci_siparis_kalemleri
  WHERE id = NEW.siparis_kalemi_id
    AND tedarikci_siparisi_id = NEW.tedarikci_siparisi_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'TEDARIKCI_SIPARIS_KALEMI_BULUNAMADI';
  END IF;

  SELECT COALESCE(sum(kabul.miktar), 0)
  INTO v_onceki_kabul
  FROM public.tedarikci_mal_kabul_kalemleri kabul
  WHERE kabul.siparis_kalemi_id = NEW.siparis_kalemi_id;

  IF v_onceki_kabul + NEW.miktar > v_kalem.miktar THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MAL_KABUL_MIKTARI_SIPARISI_ASIYOR',
      DETAIL = format(
        'Sipariş: %s, önceki kabul: %s, yeni kabul: %s',
        v_kalem.miktar,
        v_onceki_kabul,
        NEW.miktar
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stok_hareketleri hareket
    JOIN public.tedarikci_siparisleri siparis
      ON siparis.id = NEW.tedarikci_siparisi_id
    WHERE hareket.id = NEW.stok_hareketi_id
      AND hareket.stok_id = v_kalem.stok_id
      AND hareket.tedarikci_siparisi_id = NEW.tedarikci_siparisi_id
      AND hareket.tedarikci_id = siparis.tedarikci_id
      AND hareket.hareket_turu = 'alis_girisi'
      AND hareket.kaynak_turu = 'tedarikci_siparisi'
      AND hareket.miktar = NEW.miktar
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MAL_KABUL_STOK_HAREKETI_UYUSMUYOR';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tedarikci_mal_kabul_kalemleri_dogrulama
  BEFORE INSERT ON public.tedarikci_mal_kabul_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.tedarikci_mal_kabul_kalemini_dogrula();

-- Mevcut RPC imzası korunur. kalemler alanı opsiyoneldir; dolayısıyla eski
-- portal istemcileri yalnız başlık oluşturmaya devam edebilir.
CREATE OR REPLACE FUNCTION public.tedarikci_siparisi_olustur(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tedarikci public.cari%ROWTYPE;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_siparis_id uuid;
  v_yanit jsonb;
  v_siparis_no text := btrim(COALESCE(
    NULLIF(p_payload ->> 'portal_siparis_no', ''),
    NULLIF(p_payload ->> 'siparis_no', '')
  ));
  v_tutar numeric := NULLIF(p_payload ->> 'siparis_tutari', '')::numeric;
  v_hesaplanan_tutar numeric := 0;
  v_vade integer := COALESCE(NULLIF(p_payload ->> 'vade_gunu', '')::integer, 0);
  v_para_birimi public.para_birimi_kodu :=
    COALESCE(NULLIF(p_payload ->> 'para_birimi', ''), 'TRY')::public.para_birimi_kodu;
  v_kalemler jsonb := COALESCE(p_payload -> 'kalemler', '[]'::jsonb);
  v_kalem jsonb;
  v_sira bigint;
  v_stok_id uuid;
  v_alis_fiyati_id uuid;
  v_miktar numeric;
  v_net_birim_fiyat numeric;
  v_satir_no integer;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('create', false);

  SELECT * INTO v_tedarikci
  FROM public.cari
  WHERE id = public.ticari_guvenli_uuid(p_payload ->> 'tedarikci_id')
    AND tipi = 'tedarikci'
    AND aktif;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AKTIF_TEDARIKCI_GEREKLI';
  END IF;
  IF nullif(v_siparis_no, '') IS NULL
     OR NULLIF(p_payload ->> 'siparis_tarihi', '') IS NULL
     OR v_vade NOT BETWEEN 0 AND 3650
     OR (v_tutar IS NOT NULL AND v_tutar <= 0)
     OR jsonb_typeof(v_kalemler) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEDARIKCI_SIPARIS_BILGILERI_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_siparisi_olustur',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_siparisi_olustur',
    p_idempotency_key,
    COALESCE(NULLIF(p_payload ->> 'aciklama', ''), 'Tedarikçi siparişi kaydedildi.'),
    'cari_tedarikci_detayi'
  );

  INSERT INTO public.tedarikci_siparisleri (
    tedarikci_id,
    portal_siparis_no,
    siparis_tarihi,
    vade_gunu,
    para_birimi,
    siparis_tutari,
    aciklama,
    olusturan_kullanici_id
  )
  VALUES (
    v_tedarikci.id,
    v_siparis_no,
    (p_payload ->> 'siparis_tarihi')::date,
    v_vade,
    v_para_birimi,
    v_tutar,
    NULLIF(btrim(COALESCE(p_payload ->> 'aciklama', '')), ''),
    auth.uid()
  )
  RETURNING id INTO v_siparis_id;

  FOR v_kalem, v_sira IN
    SELECT value, ordinality
    FROM jsonb_array_elements(v_kalemler) WITH ORDINALITY
  LOOP
    v_stok_id := public.ticari_guvenli_uuid(v_kalem ->> 'stok_id');
    v_alis_fiyati_id := public.ticari_guvenli_uuid(COALESCE(
      NULLIF(v_kalem ->> 'stok_alis_fiyati_id', ''),
      NULLIF(v_kalem ->> 'aktif_fiyat_id', '')
    ));
    v_miktar := NULLIF(v_kalem ->> 'miktar', '')::numeric;
    v_net_birim_fiyat := NULLIF(v_kalem ->> 'net_birim_fiyat', '')::numeric;
    v_satir_no := COALESCE(NULLIF(v_kalem ->> 'satir_no', '')::integer, v_sira::integer);

    IF v_stok_id IS NULL
       OR v_miktar IS NULL OR v_miktar <= 0
       OR v_net_birim_fiyat IS NULL OR v_net_birim_fiyat <= 0
       OR nullif(btrim(COALESCE(v_kalem ->> 'birim', '')), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEDARIKCI_SIPARIS_KALEMI_GECERSIZ';
    END IF;

    INSERT INTO public.tedarikci_siparis_kalemleri (
      tedarikci_siparisi_id,
      satir_no,
      stok_id,
      miktar,
      birim,
      net_birim_fiyat,
      para_birimi,
      stok_alis_fiyati_id,
      fiyat_varyanti,
      vade_gunu,
      aciklama,
      olusturan_kullanici_id
    )
    VALUES (
      v_siparis_id,
      v_satir_no,
      v_stok_id,
      v_miktar,
      btrim(v_kalem ->> 'birim'),
      v_net_birim_fiyat,
      v_para_birimi,
      v_alis_fiyati_id,
      COALESCE(
        NULLIF(v_kalem ->> 'fiyat_varyanti', ''),
        NULLIF(v_kalem ->> 'varyant', '')
      ),
      NULLIF(v_kalem ->> 'vade_gunu', '')::integer,
      NULLIF(v_kalem ->> 'aciklama', ''),
      auth.uid()
    );
    v_hesaplanan_tutar := v_hesaplanan_tutar + round(v_miktar * v_net_birim_fiyat, 2);
  END LOOP;

  IF v_tutar IS NULL AND jsonb_array_length(v_kalemler) > 0 THEN
    UPDATE public.tedarikci_siparisleri
    SET siparis_tutari = round(v_hesaplanan_tutar, 2),
        updated_at = now()
    WHERE id = v_siparis_id;
    v_tutar := round(v_hesaplanan_tutar, 2);
  END IF;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'siparis_id', v_siparis_id,
    'durum', 'fatura_bekliyor',
    'kalem_sayisi', jsonb_array_length(v_kalemler),
    'siparis_tutari', v_tutar,
    'para_birimi', v_para_birimi
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'TEDARIKCI_SIPARIS_NO_VEYA_SATIR_ZATEN_VAR';
END;
$$;

CREATE OR REPLACE FUNCTION public.tedarikci_mal_kabulu_kaydet(
  p_siparis_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_siparis public.tedarikci_siparisleri%ROWTYPE;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_idempotency_payload jsonb;
  v_mal_kabul_id uuid;
  v_kabul_tarihi timestamptz;
  v_kalemler jsonb := COALESCE(p_payload -> 'kalemler', '[]'::jsonb);
  v_kalem_girdisi jsonb;
  v_siparis_kalemi public.tedarikci_siparis_kalemleri%ROWTYPE;
  v_siparis_kalemi_id uuid;
  v_miktar numeric;
  v_hareket jsonb;
  v_hareket_id uuid;
  v_hareketler jsonb := '[]'::jsonb;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_UPDATE_YETKISI_GEREKLI';
  END IF;
  IF jsonb_typeof(v_kalemler) <> 'array'
     OR jsonb_array_length(v_kalemler) = 0
     OR length(btrim(COALESCE(p_payload ->> 'aciklama', ''))) < 3
     OR NULLIF(p_payload ->> 'kabul_tarihi', '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MAL_KABUL_BILGILERI_GECERSIZ';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_kalemler) kalem
    GROUP BY kalem ->> 'siparis_kalemi_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MAL_KABUL_KALEMI_TEKRAR_EDIYOR';
  END IF;

  v_idempotency_payload := jsonb_build_object(
    'siparis_id', p_siparis_id,
    'payload', p_payload
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_mal_kabulu_kaydet',
    p_idempotency_key,
    v_idempotency_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  SELECT * INTO v_siparis
  FROM public.tedarikci_siparisleri
  WHERE id = p_siparis_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'TEDARIKCI_SIPARISI_BULUNAMADI';
  END IF;

  v_kabul_tarihi := CASE
    WHEN (p_payload ->> 'kabul_tarihi') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN ((p_payload ->> 'kabul_tarihi')::date::timestamp AT TIME ZONE 'Europe/Istanbul')
    ELSE (p_payload ->> 'kabul_tarihi')::timestamptz
  END;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_mal_kabulu_kaydet',
    p_idempotency_key,
    btrim(p_payload ->> 'aciklama'),
    'stok_mal_kabul'
  );

  INSERT INTO public.tedarikci_mal_kabulleri (
    tedarikci_siparisi_id,
    kabul_tarihi,
    belge_no,
    aciklama,
    idempotency_id,
    olusturan_kullanici_id
  )
  VALUES (
    p_siparis_id,
    v_kabul_tarihi,
    NULLIF(btrim(COALESCE(p_payload ->> 'belge_no', '')), ''),
    btrim(p_payload ->> 'aciklama'),
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_mal_kabul_id;

  FOR v_kalem_girdisi IN
    SELECT value FROM jsonb_array_elements(v_kalemler)
  LOOP
    v_siparis_kalemi_id :=
      public.ticari_guvenli_uuid(v_kalem_girdisi ->> 'siparis_kalemi_id');
    v_miktar := NULLIF(v_kalem_girdisi ->> 'miktar', '')::numeric;
    IF v_siparis_kalemi_id IS NULL OR v_miktar IS NULL OR v_miktar <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MAL_KABUL_KALEMI_GECERSIZ';
    END IF;

    SELECT * INTO v_siparis_kalemi
    FROM public.tedarikci_siparis_kalemleri
    WHERE id = v_siparis_kalemi_id
      AND tedarikci_siparisi_id = p_siparis_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'TEDARIKCI_SIPARIS_KALEMI_BULUNAMADI';
    END IF;

    v_hareket := public.stok_hareketi_kaydet(
      jsonb_build_object(
        'stok_id', v_siparis_kalemi.stok_id,
        'hareket_turu', 'alis_girisi',
        'miktar', v_miktar,
        'tedarikci_id', v_siparis.tedarikci_id,
        'alis_fiyati_id', v_siparis_kalemi.stok_alis_fiyati_id,
        'tedarikci_siparisi_id', p_siparis_id,
        'islem_tarihi', v_kabul_tarihi,
        'belge_no', NULLIF(btrim(COALESCE(p_payload ->> 'belge_no', '')), ''),
        'aciklama', btrim(p_payload ->> 'aciklama')
      ),
      'mal-kabul:' || v_mal_kabul_id::text || ':' || v_siparis_kalemi.id::text
    );
    v_hareket_id := (v_hareket ->> 'id')::uuid;

    INSERT INTO public.tedarikci_mal_kabul_kalemleri (
      mal_kabul_id,
      tedarikci_siparisi_id,
      siparis_kalemi_id,
      miktar,
      stok_hareketi_id
    )
    VALUES (
      v_mal_kabul_id,
      p_siparis_id,
      v_siparis_kalemi.id,
      v_miktar,
      v_hareket_id
    );

    v_hareketler := v_hareketler || jsonb_build_array(
      jsonb_build_object(
        'siparis_kalemi_id', v_siparis_kalemi.id,
        'stok_id', v_siparis_kalemi.stok_id,
        'miktar', v_miktar,
        'stok_hareketi_id', v_hareket_id
      )
    );
  END LOOP;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'siparis_id', p_siparis_id,
    'mal_kabul_id', v_mal_kabul_id,
    'hareketler', v_hareketler
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

-- Mevcut fatura RPCsi artık fatura başlığını ve tedarikçi cari alacağını aynı
-- transactionda yazar. Aynı sipariş için sistem kaynak tekilliği ikinci bir
-- borçlandırmayı ayrıca engeller.
CREATE OR REPLACE FUNCTION public.tedarikci_siparisine_fatura_isle(
  p_siparis_id uuid,
  p_revision_no integer,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_siparis public.tedarikci_siparisleri%ROWTYPE;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_payload jsonb;
  v_tutar numeric := NULLIF(p_payload ->> 'fatura_tutari', '')::numeric;
  v_hareket_id uuid;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);
  IF auth.uid() IS NULL OR NOT public.has_permission('finance', 'create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FINANCE_CREATE_YETKISI_GEREKLI';
  END IF;
  IF nullif(btrim(p_payload ->> 'fatura_no'), '') IS NULL
     OR NULLIF(p_payload ->> 'fatura_tarihi', '') IS NULL
     OR v_tutar IS NULL OR v_tutar <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FATURA_BILGILERI_GECERSIZ';
  END IF;

  v_payload := p_payload || jsonb_build_object(
    'siparis_id', p_siparis_id,
    'revision_no', p_revision_no
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_siparisine_fatura_isle',
    p_idempotency_key,
    v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  SELECT * INTO v_siparis
  FROM public.tedarikci_siparisleri
  WHERE id = p_siparis_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'TEDARIKCI_SIPARISI_BULUNAMADI';
  END IF;
  IF v_siparis.revision_no <> p_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'TEDARIKCI_SIPARISI_REVIZYON_CAKISMASI';
  END IF;
  IF v_siparis.fatura_no IS NOT NULL OR v_siparis.fatura_cari_hareket_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'FATURA_ZATEN_ISLENDI';
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_siparisine_fatura_isle',
    p_idempotency_key,
    'Tedarikçi faturası ve cari alacağı onaylandı.',
    'cari_tedarikci_detayi'
  );

  INSERT INTO public.cari_hareketleri (
    cari_id,
    para_birimi,
    yon,
    hareket_turu,
    tutar,
    islem_tarihi,
    aciklama,
    kaynak_sinifi,
    kaynak_turu,
    kaynak_id,
    idempotency_id,
    islemi_yapan
  )
  VALUES (
    v_siparis.tedarikci_id,
    v_siparis.para_birimi::text,
    'alacak',
    'tedarikci_faturasi',
    round(v_tutar, 2),
    ((p_payload ->> 'fatura_tarihi')::date::timestamp AT TIME ZONE 'Europe/Istanbul'),
    btrim(p_payload ->> 'fatura_no') || ' tedarikçi faturası',
    'sistem',
    'tedarikci_faturasi',
    p_siparis_id,
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_hareket_id;

  UPDATE public.tedarikci_siparisleri
  SET fatura_no = btrim(p_payload ->> 'fatura_no'),
      fatura_tarihi = (p_payload ->> 'fatura_tarihi')::date,
      fatura_tutari = round(v_tutar, 2),
      fatura_cari_hareket_id = v_hareket_id,
      fatura_onaylandi_at = now(),
      son_guncelleyen_kullanici_id = auth.uid(),
      revision_no = revision_no + 1,
      updated_at = now()
  WHERE id = p_siparis_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'siparis_id', p_siparis_id,
    'durum', 'odeme_bekliyor',
    'revision_no', v_siparis.revision_no + 1,
    'cari_hareket_id', v_hareket_id,
    'son_odeme_tarihi', (p_payload ->> 'fatura_tarihi')::date + v_siparis.vade_gunu
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

-- Eski ödeme RPC imzası korunur ve tam ödeme yapar. Müşteri tahsilat RPCsi
-- değiştirilmez. Açık eski bir faturada cari hareket yoksa, kullanıcı ödeme
-- onayı verdiği anda fatura alacağı güvenle oluşturulur; sessiz backfill yoktur.
CREATE OR REPLACE FUNCTION public.tedarikci_siparisini_odendi_isaretle(
  p_siparis_id uuid,
  p_revision_no integer,
  p_odeme_tarihi date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_siparis public.tedarikci_siparisleri%ROWTYPE;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_payload jsonb;
  v_fatura_hareket_id uuid;
  v_odeme_hareket_id uuid;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);
  IF auth.uid() IS NULL OR NOT public.has_permission('finance', 'create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FINANCE_CREATE_YETKISI_GEREKLI';
  END IF;

  v_payload := jsonb_build_object(
    'siparis_id', p_siparis_id,
    'revision_no', p_revision_no,
    'odeme_tarihi', p_odeme_tarihi
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_siparisini_odendi_isaretle',
    p_idempotency_key,
    v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  SELECT * INTO v_siparis
  FROM public.tedarikci_siparisleri
  WHERE id = p_siparis_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'TEDARIKCI_SIPARISI_BULUNAMADI';
  END IF;
  IF v_siparis.revision_no <> p_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'TEDARIKCI_SIPARISI_REVIZYON_CAKISMASI';
  END IF;
  IF v_siparis.fatura_no IS NULL
     OR v_siparis.fatura_tarihi IS NULL
     OR v_siparis.fatura_tutari IS NULL
     OR v_siparis.fatura_tutari <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ODEME_ICIN_TUTARLI_FATURA_GEREKLI';
  END IF;
  IF v_siparis.odeme_tarihi IS NOT NULL OR v_siparis.odeme_cari_hareket_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIPARIS_ZATEN_ODENDI';
  END IF;
  IF p_odeme_tarihi IS NULL OR p_odeme_tarihi < v_siparis.fatura_tarihi THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ODEME_TARIHI_GECERSIZ';
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_siparisini_odendi_isaretle',
    p_idempotency_key,
    'Tedarikçi faturasının tam ödemesi cari hesaba işlendi.',
    'cari_tedarikci_detayi'
  );

  v_fatura_hareket_id := v_siparis.fatura_cari_hareket_id;
  IF v_fatura_hareket_id IS NULL THEN
    SELECT hareket.id INTO v_fatura_hareket_id
    FROM public.cari_hareketleri hareket
    WHERE hareket.kaynak_sinifi = 'sistem'
      AND hareket.kaynak_turu = 'tedarikci_faturasi'
      AND hareket.kaynak_id = p_siparis_id
      AND hareket.para_birimi = v_siparis.para_birimi::text;

    IF v_fatura_hareket_id IS NULL THEN
      INSERT INTO public.cari_hareketleri (
        cari_id,
        para_birimi,
        yon,
        hareket_turu,
        tutar,
        islem_tarihi,
        aciklama,
        kaynak_sinifi,
        kaynak_turu,
        kaynak_id,
        idempotency_id,
        islemi_yapan
      )
      VALUES (
        v_siparis.tedarikci_id,
        v_siparis.para_birimi::text,
        'alacak',
        'tedarikci_faturasi',
        round(v_siparis.fatura_tutari, 2),
        (v_siparis.fatura_tarihi::timestamp AT TIME ZONE 'Europe/Istanbul'),
        v_siparis.fatura_no || ' legacy tedarikçi faturası ödeme onayında işlendi',
        'sistem',
        'tedarikci_faturasi',
        p_siparis_id,
        v_idempotency_id,
        auth.uid()
      )
      RETURNING id INTO v_fatura_hareket_id;
    END IF;
  END IF;

  INSERT INTO public.cari_hareketleri (
    cari_id,
    para_birimi,
    yon,
    hareket_turu,
    tutar,
    islem_tarihi,
    aciklama,
    kaynak_sinifi,
    kaynak_turu,
    kaynak_id,
    idempotency_id,
    islemi_yapan
  )
  VALUES (
    v_siparis.tedarikci_id,
    v_siparis.para_birimi::text,
    'borc',
    'tedarikci_odemesi',
    round(v_siparis.fatura_tutari, 2),
    (p_odeme_tarihi::timestamp AT TIME ZONE 'Europe/Istanbul'),
    v_siparis.fatura_no || ' tedarikçi ödemesi',
    'sistem',
    'tedarikci_odemesi',
    p_siparis_id,
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_odeme_hareket_id;

  UPDATE public.tedarikci_siparisleri
  SET odeme_tarihi = p_odeme_tarihi,
      fatura_cari_hareket_id = v_fatura_hareket_id,
      odeme_cari_hareket_id = v_odeme_hareket_id,
      odeme_onaylandi_at = now(),
      son_guncelleyen_kullanici_id = auth.uid(),
      revision_no = revision_no + 1,
      updated_at = now()
  WHERE id = p_siparis_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'siparis_id', p_siparis_id,
    'durum', 'odendi',
    'revision_no', v_siparis.revision_no + 1,
    'odeme_tarihi', p_odeme_tarihi,
    'fatura_cari_hareket_id', v_fatura_hareket_id,
    'odeme_cari_hareket_id', v_odeme_hareket_id
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

ALTER TABLE public.tedarikci_siparis_kalemleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tedarikci_siparis_kalemleri FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tedarikci_mal_kabulleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tedarikci_mal_kabulleri FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tedarikci_mal_kabul_kalemleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tedarikci_mal_kabul_kalemleri FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.tedarikci_siparis_kalemleri
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tedarikci_mal_kabulleri
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tedarikci_mal_kabul_kalemleri
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.tedarikci_siparis_kalemleri TO authenticated;
GRANT SELECT ON public.tedarikci_mal_kabulleri TO authenticated;
GRANT SELECT ON public.tedarikci_mal_kabul_kalemleri TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tedarikci_siparis_kalemleri TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tedarikci_mal_kabulleri TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tedarikci_mal_kabul_kalemleri TO service_role;

CREATE POLICY tedarikci_siparis_kalemleri_read
  ON public.tedarikci_siparis_kalemleri
  FOR SELECT TO authenticated
  USING (
    public.has_permission('costing', 'read')
    OR public.has_permission('inventory', 'read')
    OR public.has_permission('finance', 'read')
  );

CREATE POLICY tedarikci_mal_kabulleri_read
  ON public.tedarikci_mal_kabulleri
  FOR SELECT TO authenticated
  USING (
    public.has_permission('costing', 'read')
    OR public.has_permission('inventory', 'read')
  );

CREATE POLICY tedarikci_mal_kabul_kalemleri_read
  ON public.tedarikci_mal_kabul_kalemleri
  FOR SELECT TO authenticated
  USING (
    public.has_permission('costing', 'read')
    OR public.has_permission('inventory', 'read')
  );

CREATE TRIGGER audit_tedarikci_siparis_kalemleri
  AFTER INSERT OR UPDATE OR DELETE ON public.tedarikci_siparis_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

CREATE TRIGGER audit_tedarikci_mal_kabulleri
  AFTER INSERT OR UPDATE OR DELETE ON public.tedarikci_mal_kabulleri
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

CREATE TRIGGER audit_tedarikci_mal_kabul_kalemleri
  AFTER INSERT OR UPDATE OR DELETE ON public.tedarikci_mal_kabul_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

REVOKE ALL ON FUNCTION public.tedarikci_siparis_kalemini_dogrula()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tedarikci_satin_alma_kaydini_degistirilemez_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tedarikci_mal_kabul_kalemini_dogrula()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tedarikci_mal_kabulu_kaydet(uuid, jsonb, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tedarikci_mal_kabulu_kaydet(uuid, jsonb, text)
  TO authenticated;

-- Değiştirilen eski RPClerin explicit yetkilerini koru.
REVOKE ALL ON FUNCTION public.tedarikci_siparisi_olustur(jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tedarikci_siparisine_fatura_isle(uuid, integer, jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tedarikci_siparisini_odendi_isaretle(uuid, integer, date, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tedarikci_siparisi_olustur(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tedarikci_siparisine_fatura_isle(uuid, integer, jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tedarikci_siparisini_odendi_isaretle(uuid, integer, date, text)
  TO authenticated;

COMMENT ON FUNCTION public.tedarikci_mal_kabulu_kaydet(uuid, jsonb, text) IS
  'Kısmi/çoklu mal kabulünü ve karşılık gelen append-only alış stok hareketlerini atomik kaydeder.';
COMMENT ON FUNCTION public.tedarikci_siparisine_fatura_isle(uuid, integer, jsonb, text) IS
  'Tedarikçi faturasını ve tedarikçi cari alacağını aynı transactionda, tam bir kez kaydeder.';
COMMENT ON FUNCTION public.tedarikci_siparisini_odendi_isaretle(uuid, integer, date, text) IS
  'Tedarikçi faturasının tam ödemesini borç yönlü cari hareketle kaydeder; müşteri tahsilat akışını değiştirmez.';
