-- 091 - Stok maliyet dönemleri için veritabanı seviyesinde bütünlük kuralları

SET search_path = public, extensions, pg_catalog;

ALTER TABLE public.stok_maliyet_profilleri
  ADD CONSTRAINT stok_maliyet_profili_donem_cakismasi
  EXCLUDE USING gist (
    stok_id WITH =,
    gecerlilik_donemi WITH &&
  );

ALTER TABLE public.stok_maliyet_yapi_surmleri
  ADD CONSTRAINT stok_maliyet_yapi_donem_cakismasi
  EXCLUDE USING gist (
    stok_id WITH =,
    gecerlilik_donemi WITH &&
  );

-- Katman yapısı bugün yalnız ölçü + kontrollü sınıf taşır. Bu nedenle aynı
-- tarihte aynı sınıf/ölçü için tek kanonik stok profili bulunması gerekir;
-- bir fiyat grubu yine farklı ölçülerde birden fazla stoğa bağlanabilir.
ALTER TABLE public.stok_maliyet_profilleri
  ADD CONSTRAINT stok_maliyet_cam_sinifi_cakismasi
  EXCLUDE USING gist (
    cam_fiyat_grubu_id WITH =,
    olcu_mm WITH =,
    gecerlilik_donemi WITH &&
  )
  WHERE (profil_turu = 'cam'),
  ADD CONSTRAINT stok_maliyet_cita_sinifi_cakismasi
  EXCLUDE USING gist (
    olcu_mm WITH =,
    cita_malzeme_turu WITH =,
    gecerlilik_donemi WITH &&
  )
  WHERE (profil_turu = 'cita');

ALTER TABLE public.stok_maliyet_kaynagi_atamalari
  ADD CONSTRAINT stok_maliyet_kaynagi_donem_cakismasi
  EXCLUDE USING gist (
    stok_id WITH =,
    gecerlilik_donemi WITH &&
  );

CREATE OR REPLACE FUNCTION public.stok_maliyet_profili_stogu_dogrula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kategori text;
  v_birim text;
BEGIN
  SELECT kategori, birim INTO v_kategori, v_birim
  FROM public.stok
  WHERE id = NEW.stok_id AND aktif;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'AKTIF_STOK_GEREKLI';
  END IF;
  IF (NEW.profil_turu = 'cam' AND v_kategori <> 'cam')
     OR (NEW.profil_turu = 'cita' AND v_kategori <> 'cita')
     OR (NEW.profil_turu = 'sarf' AND v_kategori <> 'yan_malzeme') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STOK_MALIYET_PROFILI_KATEGORI_UYUSMAZLIGI';
  END IF;
  IF lower(btrim(NEW.stok_ana_birimi)) <> lower(btrim(v_birim)) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'STOK_ANA_BIRIMI_UYUSMUYOR',
      DETAIL = format('Stok birimi %s, profil ana birimi %s.', v_birim, NEW.stok_ana_birimi);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stok_maliyet_profili_stok_guard
  BEFORE INSERT OR UPDATE ON public.stok_maliyet_profilleri
  FOR EACH ROW EXECUTE FUNCTION public.stok_maliyet_profili_stogu_dogrula();

CREATE OR REPLACE FUNCTION public.stok_maliyet_surumu_degisimini_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MALIYET_SURUMU_SILINEMEZ';
  END IF;
  IF OLD.stok_id IS DISTINCT FROM NEW.stok_id
     OR lower(OLD.gecerlilik_donemi) IS DISTINCT FROM lower(NEW.gecerlilik_donemi)
     OR NOT upper_inf(OLD.gecerlilik_donemi)
     OR upper_inf(NEW.gecerlilik_donemi)
     OR (to_jsonb(OLD) - 'gecerlilik_donemi')
        IS DISTINCT FROM (to_jsonb(NEW) - 'gecerlilik_donemi') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MALIYET_SURUMU_DEGISTIRILEMEZ';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stok_maliyet_profilleri_surumu_guard
  BEFORE UPDATE OR DELETE ON public.stok_maliyet_profilleri
  FOR EACH ROW EXECUTE FUNCTION public.stok_maliyet_surumu_degisimini_koru();
CREATE TRIGGER stok_maliyet_yapi_surmleri_guard
  BEFORE UPDATE OR DELETE ON public.stok_maliyet_yapi_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.stok_maliyet_surumu_degisimini_koru();

CREATE OR REPLACE FUNCTION public.stok_alis_fiyati_baglantilarini_dogrula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profil_turu text;
  v_profil_stok_birimi text;
  v_tedarik_kapsamlari text[];
  v_baglanti_tedarikcisi uuid;
  v_baglanti_durumu text;
BEGIN
  SELECT profil.profil_turu, profil.stok_ana_birimi
  INTO v_profil_turu, v_profil_stok_birimi
  FROM public.stok_maliyet_profilleri profil
  WHERE profil.stok_id = NEW.stok_id
    AND profil.gecerlilik_donemi @>
      (NEW.fiyat_tarihi AT TIME ZONE 'Europe/Istanbul')::date
  LIMIT 1;
  IF v_profil_turu IS NULL AND NEW.kaynak_turu <> 'legacy_unverified' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STOK_MALIYET_PROFILI_GEREKLI';
  END IF;
  IF NEW.kaynak_turu = 'legacy_unverified' THEN
    RETURN NEW;
  END IF;
  IF lower(btrim(NEW.stok_ana_birimi))
     <> lower(btrim(v_profil_stok_birimi)) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'FIYAT_STOK_ANA_BIRIMI_UYUSMUYOR';
  END IF;

  SELECT tedarik_kapsamlari
  INTO v_tedarik_kapsamlari
  FROM public.cari
  WHERE id = NEW.tedarikci_id AND tipi = 'tedarikci' AND aktif;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'AKTIF_TEDARIKCI_GEREKLI';
  END IF;
  IF (v_profil_turu = 'cam' AND NOT ('cam' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[]))))
     OR (v_profil_turu = 'cita' AND NOT ('cita' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[]))))
     OR (v_profil_turu = 'sarf' AND NOT ('yan_malzeme' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEDARIKCI_KAPSAMI_UYUSMUYOR';
  END IF;

  IF NEW.kaynak_turu = 'cam_baglantisi' THEN
    SELECT tedarikci_id, durum
    INTO v_baglanti_tedarikcisi, v_baglanti_durumu
    FROM public.cam_tedarik_baglantilari
    WHERE id = NEW.cam_baglantisi_id;
    IF v_baglanti_tedarikcisi IS DISTINCT FROM NEW.tedarikci_id
       OR v_baglanti_durumu <> 'taslak' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CAM_BAGLANTISI_FIYAT_KAYNAGI_GECERSIZ';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stok_alis_fiyati_baglanti_guard
  BEFORE INSERT ON public.stok_alis_fiyatlari
  FOR EACH ROW EXECUTE FUNCTION public.stok_alis_fiyati_baglantilarini_dogrula();

CREATE OR REPLACE FUNCTION public.stok_maliyet_kaynagi_atamasini_dogrula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fiyat public.stok_alis_fiyatlari%ROWTYPE;
BEGIN
  SELECT * INTO v_fiyat
  FROM public.stok_alis_fiyatlari
  WHERE id = NEW.fiyat_id;
  IF NOT FOUND OR v_fiyat.stok_id <> NEW.stok_id
     OR v_fiyat.durum NOT IN ('dogrulanmis', 'duzeltme')
     OR v_fiyat.kaynak_turu = 'legacy_unverified' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ATANABILIR_DOGRULANMIS_FIYAT_GEREKLI';
  END IF;
  IF NEW.kaynak_turu = 'dogrudan_fiyat' AND NEW.kaynak_id <> NEW.fiyat_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DOGRUDAN_FIYAT_KAYNAGI_GECERSIZ';
  END IF;
  IF NEW.kaynak_turu = 'cam_baglantisi'
     AND NEW.kaynak_id IS DISTINCT FROM v_fiyat.cam_baglantisi_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CAM_BAGLANTISI_KAYNAGI_GECERSIZ';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stok_maliyet_kaynagi_atama_guard
  BEFORE INSERT ON public.stok_maliyet_kaynagi_atamalari
  FOR EACH ROW EXECUTE FUNCTION public.stok_maliyet_kaynagi_atamasini_dogrula();

CREATE OR REPLACE FUNCTION public.cam_baglantisi_stok_eslesmesini_dogrula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_grup_id uuid;
BEGIN
  SELECT kalem.cam_fiyat_grubu_id
  INTO v_grup_id
  FROM public.cam_tedarik_baglanti_kalemleri kalem
  WHERE kalem.id = NEW.baglanti_kalemi_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stok_maliyet_profilleri profil
    WHERE profil.stok_id = NEW.stok_id
      AND profil.profil_turu = 'cam'
      AND profil.cam_fiyat_grubu_id = v_grup_id
      AND profil.gecerlilik_donemi && daterange(current_date, NULL, '[)')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CAM_BAGLANTISI_STOK_GRUBU_UYUSMUYOR';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cam_baglantisi_stok_eslesme_guard
  BEFORE INSERT OR UPDATE ON public.cam_tedarik_baglanti_kalem_stoklari
  FOR EACH ROW EXECUTE FUNCTION public.cam_baglantisi_stok_eslesmesini_dogrula();
