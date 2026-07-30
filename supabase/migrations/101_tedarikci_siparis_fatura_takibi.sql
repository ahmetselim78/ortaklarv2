-- 100 - Tedarikçi çalışma modeli ve portal sipariş/fatura/ödeme takibi

SET search_path = public, extensions, pg_catalog;

ALTER TABLE public.cari
  ADD COLUMN tedarikci_calisma_modeli text;

UPDATE public.cari
SET tedarikci_calisma_modeli = CASE
  WHEN upper(ad) LIKE '%ŞİŞECAM%'
    OR upper(ad) LIKE '%ŞIŞECAM%'
    OR upper(ad) LIKE '%SISECAM%'
    THEN 'sisecam_portal'
  ELSE 'manuel_fiyat'
END
WHERE tipi = 'tedarikci'
  AND tedarikci_calisma_modeli IS NULL;

ALTER TABLE public.cari
  ADD CONSTRAINT cari_tedarikci_calisma_modeli_check CHECK (
    (tipi = 'tedarikci' AND tedarikci_calisma_modeli IN ('sisecam_portal', 'manuel_fiyat'))
    OR (tipi <> 'tedarikci' AND tedarikci_calisma_modeli IS NULL)
  );

COMMENT ON COLUMN public.cari.tedarikci_calisma_modeli IS
  'Şişecam için fiyat sirküleri/portal siparişi; diğer tedarikçiler için stok bazlı manuel fiyat akışı.';

CREATE TABLE public.tedarikci_siparisleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tedarikci_id uuid NOT NULL REFERENCES public.cari(id) ON DELETE RESTRICT,
  portal_siparis_no text NOT NULL
    CHECK (nullif(btrim(portal_siparis_no), '') IS NOT NULL),
  siparis_tarihi date NOT NULL,
  vade_gunu integer NOT NULL CHECK (vade_gunu BETWEEN 0 AND 3650),
  para_birimi public.para_birimi_kodu NOT NULL DEFAULT 'TRY',
  siparis_tutari numeric(20,2)
    CHECK (siparis_tutari IS NULL OR siparis_tutari > 0),
  fatura_no text,
  fatura_tarihi date,
  fatura_tutari numeric(20,2)
    CHECK (fatura_tutari IS NULL OR fatura_tutari > 0),
  odeme_tarihi date,
  aciklama text,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  son_guncelleyen_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tedarikci_id, portal_siparis_no),
  CHECK (
    (fatura_no IS NULL AND fatura_tarihi IS NULL AND fatura_tutari IS NULL AND odeme_tarihi IS NULL)
    OR (
      nullif(btrim(fatura_no), '') IS NOT NULL
      AND fatura_tarihi IS NOT NULL
      AND (odeme_tarihi IS NULL OR odeme_tarihi >= fatura_tarihi)
    )
  )
);

CREATE INDEX tedarikci_siparisleri_tedarikci_tarih_idx
  ON public.tedarikci_siparisleri(tedarikci_id, siparis_tarihi DESC, created_at DESC);
CREATE INDEX tedarikci_siparisleri_fatura_bekleyen_idx
  ON public.tedarikci_siparisleri(tedarikci_id, siparis_tarihi)
  WHERE fatura_no IS NULL;
CREATE INDEX tedarikci_siparisleri_odeme_bekleyen_idx
  ON public.tedarikci_siparisleri(tedarikci_id, fatura_tarihi)
  WHERE fatura_no IS NOT NULL AND odeme_tarihi IS NULL;

COMMENT ON TABLE public.tedarikci_siparisleri IS
  'Portal siparişi açılışından fatura ve ödemeye kadar tedarikçi satın alma takibi.';
COMMENT ON COLUMN public.tedarikci_siparisleri.vade_gunu IS
  'Fatura tarihine eklenecek satın alma vadesi. Son ödeme tarihi fatura gelmeden oluşmaz.';

CREATE OR REPLACE FUNCTION public.tedarikci_siparislerini_getir(
  p_tedarikci_id uuid
)
RETURNS TABLE (
  id uuid,
  tedarikci_id uuid,
  portal_siparis_no text,
  siparis_tarihi date,
  vade_gunu integer,
  para_birimi public.para_birimi_kodu,
  siparis_tutari numeric,
  fatura_no text,
  fatura_tarihi date,
  fatura_tutari numeric,
  son_odeme_tarihi date,
  odeme_tarihi date,
  durum text,
  kalan_gun integer,
  aciklama text,
  revision_no integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  RETURN QUERY
  SELECT
    siparis.id,
    siparis.tedarikci_id,
    siparis.portal_siparis_no,
    siparis.siparis_tarihi,
    siparis.vade_gunu,
    siparis.para_birimi,
    siparis.siparis_tutari,
    siparis.fatura_no,
    siparis.fatura_tarihi,
    siparis.fatura_tutari,
    CASE
      WHEN siparis.fatura_tarihi IS NULL THEN NULL
      ELSE siparis.fatura_tarihi + siparis.vade_gunu
    END AS son_odeme_tarihi,
    siparis.odeme_tarihi,
    CASE
      WHEN siparis.fatura_no IS NULL THEN 'fatura_bekliyor'
      WHEN siparis.odeme_tarihi IS NOT NULL THEN 'odendi'
      WHEN siparis.fatura_tarihi + siparis.vade_gunu < current_date THEN 'gecikti'
      ELSE 'odeme_bekliyor'
    END AS durum,
    CASE
      WHEN siparis.fatura_tarihi IS NULL OR siparis.odeme_tarihi IS NOT NULL THEN NULL
      ELSE (siparis.fatura_tarihi + siparis.vade_gunu) - current_date
    END AS kalan_gun,
    siparis.aciklama,
    siparis.revision_no,
    siparis.created_at,
    siparis.updated_at
  FROM public.tedarikci_siparisleri siparis
  WHERE siparis.tedarikci_id = p_tedarikci_id
  ORDER BY siparis.siparis_tarihi DESC, siparis.created_at DESC;
END;
$$;

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
  v_tutar numeric := NULLIF(p_payload ->> 'siparis_tutari', '')::numeric;
  v_vade integer := (p_payload ->> 'vade_gunu')::integer;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('create', false);

  SELECT * INTO v_tedarikci
  FROM public.cari
  WHERE id = (p_payload ->> 'tedarikci_id')::uuid
    AND tipi = 'tedarikci'
    AND aktif;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AKTIF_TEDARIKCI_GEREKLI';
  END IF;
  IF v_tedarikci.tedarikci_calisma_modeli IS DISTINCT FROM 'sisecam_portal' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEDARIKCI_PORTAL_MODELI_GEREKLI';
  END IF;
  IF nullif(btrim(p_payload ->> 'portal_siparis_no'), '') IS NULL
     OR NULLIF(p_payload ->> 'siparis_tarihi', '') IS NULL
     OR v_vade NOT BETWEEN 0 AND 3650
     OR (v_tutar IS NOT NULL AND v_tutar <= 0) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEDARIKCI_SIPARIS_BILGILERI_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_siparisi_olustur', p_idempotency_key, p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_siparisi_olustur', p_idempotency_key,
    COALESCE(NULLIF(p_payload ->> 'aciklama', ''), 'Portal siparişi kaydedildi.'),
    'cari_tedarikci_detayi'
  );

  INSERT INTO public.tedarikci_siparisleri (
    tedarikci_id, portal_siparis_no, siparis_tarihi, vade_gunu,
    para_birimi, siparis_tutari, aciklama, olusturan_kullanici_id
  ) VALUES (
    v_tedarikci.id,
    btrim(p_payload ->> 'portal_siparis_no'),
    (p_payload ->> 'siparis_tarihi')::date,
    v_vade,
    COALESCE(p_payload ->> 'para_birimi', 'TRY')::public.para_birimi_kodu,
    v_tutar,
    NULLIF(btrim(p_payload ->> 'aciklama'), ''),
    auth.uid()
  )
  RETURNING id INTO v_siparis_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'siparis_id', v_siparis_id,
    'durum', 'fatura_bekliyor'
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'PORTAL_SIPARIS_NO_ZATEN_VAR';
END;
$$;

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
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);
  IF nullif(btrim(p_payload ->> 'fatura_no'), '') IS NULL
     OR NULLIF(p_payload ->> 'fatura_tarihi', '') IS NULL
     OR (v_tutar IS NOT NULL AND v_tutar <= 0) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FATURA_BILGILERI_GECERSIZ';
  END IF;

  v_payload := p_payload || jsonb_build_object(
    'siparis_id', p_siparis_id,
    'revision_no', p_revision_no
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_siparisine_fatura_isle', p_idempotency_key, v_payload
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
  IF v_siparis.fatura_no IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'FATURA_ZATEN_ISLENDI';
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_siparisine_fatura_isle', p_idempotency_key,
    'Tedarikçi faturası siparişe işlendi.', 'cari_tedarikci_detayi'
  );
  UPDATE public.tedarikci_siparisleri
  SET
    fatura_no = btrim(p_payload ->> 'fatura_no'),
    fatura_tarihi = (p_payload ->> 'fatura_tarihi')::date,
    fatura_tutari = v_tutar,
    son_guncelleyen_kullanici_id = auth.uid(),
    revision_no = revision_no + 1,
    updated_at = now()
  WHERE id = p_siparis_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'siparis_id', p_siparis_id,
    'durum', 'odeme_bekliyor',
    'son_odeme_tarihi', (p_payload ->> 'fatura_tarihi')::date + v_siparis.vade_gunu
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

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
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);
  v_payload := jsonb_build_object(
    'siparis_id', p_siparis_id,
    'revision_no', p_revision_no,
    'odeme_tarihi', p_odeme_tarihi
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_siparisini_odendi_isaretle', p_idempotency_key, v_payload
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
  IF v_siparis.fatura_no IS NULL OR v_siparis.fatura_tarihi IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ODEME_ICIN_FATURA_GEREKLI';
  END IF;
  IF v_siparis.odeme_tarihi IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SIPARIS_ZATEN_ODENDI';
  END IF;
  IF p_odeme_tarihi IS NULL OR p_odeme_tarihi < v_siparis.fatura_tarihi THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ODEME_TARIHI_GECERSIZ';
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_siparisini_odendi_isaretle', p_idempotency_key,
    'Tedarikçi faturası ödendi olarak işaretlendi.', 'cari_tedarikci_detayi'
  );
  UPDATE public.tedarikci_siparisleri
  SET
    odeme_tarihi = p_odeme_tarihi,
    son_guncelleyen_kullanici_id = auth.uid(),
    revision_no = revision_no + 1,
    updated_at = now()
  WHERE id = p_siparis_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'siparis_id', p_siparis_id,
    'durum', 'odendi',
    'odeme_tarihi', p_odeme_tarihi
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

-- Cam fiyatı yalnız Şişecam/portal modelinde bağlantıdan gelmek zorundadır.
-- Manuel fiyat modelindeki tedarikçiler, özel camı doğrudan stok bazında fiyatlayabilir.
CREATE OR REPLACE FUNCTION public.stok_maliyet_fiyatini_aktiflestir_internal(
  p_fiyat_id uuid,
  p_baslangic timestamptz,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS public.stok_maliyet_kaynagi_atamalari
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fiyat public.stok_alis_fiyatlari%ROWTYPE;
  v_mevcut public.stok_maliyet_kaynagi_atamalari%ROWTYPE;
  v_sonraki_baslangic timestamptz;
  v_atama public.stok_maliyet_kaynagi_atamalari%ROWTYPE;
  v_kaynak_turu text;
  v_kaynak_id uuid;
  v_profil_turu text;
  v_tedarikci_modeli text;
BEGIN
  IF p_baslangic IS NULL OR length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AKTIFLESTIRME_BILGILERI_GECERSIZ';
  END IF;

  SELECT * INTO v_fiyat
  FROM public.stok_alis_fiyatlari
  WHERE id = p_fiyat_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOK_ALIS_FIYATI_BULUNAMADI';
  END IF;
  IF v_fiyat.durum NOT IN ('dogrulanmis', 'duzeltme')
     OR v_fiyat.kaynak_turu = 'legacy_unverified' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DOGRULANMIS_FIYAT_GEREKLI';
  END IF;
  SELECT profil_turu INTO v_profil_turu
  FROM public.stok_maliyet_profilleri
  WHERE stok_id = v_fiyat.stok_id
    AND gecerlilik_donemi @> (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date
  LIMIT 1;
  SELECT tedarikci_calisma_modeli INTO v_tedarikci_modeli
  FROM public.cari
  WHERE id = v_fiyat.tedarikci_id;
  IF v_profil_turu = 'cam'
     AND v_fiyat.kaynak_turu <> 'cam_baglantisi'
     AND COALESCE(v_tedarikci_modeli, 'manuel_fiyat') <> 'manuel_fiyat' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'CAM_MALIYET_KAYNAGI_BAGLANTI_OLMALI',
      DETAIL = 'Portal/sirküler modelindeki cam fiyatları aktif bir cam tedarik bağlantısı üzerinden yönetilmelidir.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('stok_maliyet:' || v_fiyat.stok_id::text, 0));

  SELECT * INTO v_mevcut
  FROM public.stok_maliyet_kaynagi_atamalari
  WHERE stok_id = v_fiyat.stok_id
    AND gecerlilik_donemi @> p_baslangic
  FOR UPDATE;

  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) = p_baslangic THEN
      IF v_mevcut.fiyat_id = p_fiyat_id THEN
        RETURN v_mevcut;
      END IF;
      RAISE EXCEPTION USING
        ERRCODE = '23P01',
        MESSAGE = 'AYNI_BASLANGICTA_FARKLI_FIYAT_VAR',
        DETAIL = 'Yeni dönem başlangıcı mevcut dönem başlangıcından sonra olmalıdır.';
    END IF;
    UPDATE public.stok_maliyet_kaynagi_atamalari
    SET
      gecerlilik_donemi = tstzrange(lower(gecerlilik_donemi), p_baslangic, '[)'),
      kapatan_kullanici_id = auth.uid(),
      kapatma_nedeni = btrim(p_gerekce),
      closed_at = now()
    WHERE id = v_mevcut.id;
  END IF;

  SELECT min(lower(gecerlilik_donemi))
  INTO v_sonraki_baslangic
  FROM public.stok_maliyet_kaynagi_atamalari
  WHERE stok_id = v_fiyat.stok_id
    AND lower(gecerlilik_donemi) > p_baslangic;

  v_kaynak_turu := CASE
    WHEN v_fiyat.kaynak_turu = 'cam_baglantisi' THEN 'cam_baglantisi'
    ELSE 'dogrudan_fiyat'
  END;
  v_kaynak_id := CASE
    WHEN v_kaynak_turu = 'cam_baglantisi' THEN v_fiyat.cam_baglantisi_id
    ELSE v_fiyat.id
  END;

  INSERT INTO public.stok_maliyet_kaynagi_atamalari (
    stok_id, fiyat_id, kaynak_turu, kaynak_id, gecerlilik_donemi,
    aktiflestiren_kullanici_id, aktiflestirme_nedeni, idempotency_key
  ) VALUES (
    v_fiyat.stok_id, v_fiyat.id, v_kaynak_turu, v_kaynak_id,
    tstzrange(p_baslangic, v_sonraki_baslangic, '[)'),
    auth.uid(), btrim(p_gerekce), p_idempotency_key
  )
  RETURNING * INTO v_atama;
  RETURN v_atama;
END;
$$;

ALTER TABLE public.tedarikci_siparisleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tedarikci_siparisleri FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tedarikci_siparisleri FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tedarikci_siparisleri TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tedarikci_siparisleri TO service_role;

CREATE POLICY tedarikci_siparisleri_costing_read
  ON public.tedarikci_siparisleri
  FOR SELECT TO authenticated
  USING (public.has_permission('costing', 'read'));

CREATE TRIGGER audit_tedarikci_siparisleri
  AFTER INSERT OR UPDATE OR DELETE ON public.tedarikci_siparisleri
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

REVOKE ALL ON FUNCTION public.tedarikci_siparislerini_getir(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tedarikci_siparisi_olustur(jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tedarikci_siparisine_fatura_isle(uuid, integer, jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tedarikci_siparisini_odendi_isaretle(uuid, integer, date, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tedarikci_siparislerini_getir(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tedarikci_siparisi_olustur(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tedarikci_siparisine_fatura_isle(uuid, integer, jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tedarikci_siparisini_odendi_isaretle(uuid, integer, date, text)
  TO authenticated;

COMMENT ON FUNCTION public.tedarikci_siparislerini_getir(uuid) IS
  'Siparişleri fatura bekliyor, ödeme bekliyor, gecikti veya ödendi durumuyla döndürür.';
