-- 073 — Sürümlü KDV/vade, müşteri ticari profilleri ve TCMB kur cache'i.

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.kdv_gruplari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kod text NOT NULL UNIQUE CHECK (kod ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  ad text NOT NULL CHECK (nullif(btrim(ad), '') IS NOT NULL),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kdv_grup_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kdv_grubu_id uuid NOT NULL
    REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT,
  surum_no integer NOT NULL CHECK (surum_no > 0),
  durum public.ticari_surum_durumu NOT NULL DEFAULT 'taslak',
  kdv_orani numeric(7,4) NOT NULL CHECK (kdv_orani >= 0 AND kdv_orani <= 100),
  gecerli_baslangic date NOT NULL,
  gecerli_bitis date,
  onceki_surum_id uuid
    REFERENCES public.kdv_grup_surmleri(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlayan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlanma_tarihi timestamptz,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kdv_grubu_id, surum_no),
  CHECK (gecerli_bitis IS NULL OR gecerli_bitis >= gecerli_baslangic),
  CHECK (onceki_surum_id IS NULL OR onceki_surum_id <> id),
  CHECK (
    (durum = 'taslak' AND yayinlayan_kullanici_id IS NULL AND yayinlanma_tarihi IS NULL)
    OR
    (durum IN ('yayinda', 'arsiv')
      AND yayinlayan_kullanici_id IS NOT NULL
      AND yayinlanma_tarihi IS NOT NULL)
  ),
  CONSTRAINT kdv_grup_yayin_gecerlilik_cakismasi
    EXCLUDE USING gist (
      kdv_grubu_id WITH =,
      daterange(
        gecerli_baslangic,
        COALESCE(gecerli_bitis, 'infinity'::date),
        '[]'
      ) WITH &&
    )
    WHERE (durum = 'yayinda')
);

CREATE INDEX kdv_grup_surumu_gecerlilik_idx
  ON public.kdv_grup_surmleri(
    kdv_grubu_id,
    durum,
    gecerli_baslangic,
    gecerli_bitis
  );

-- 070 fiyat kalemleri KDV tablosundan önce yaratıldığı için FK'ler burada eklenir.
ALTER TABLE public.fiyat_listesi_urun_kalemleri
  ADD CONSTRAINT fiyat_urun_kalemi_kdv_grubu_fk
  FOREIGN KEY (kdv_grubu_id) REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT;
ALTER TABLE public.fiyat_listesi_kenar_islem_kalemleri
  ADD CONSTRAINT fiyat_kenar_islem_kdv_grubu_fk
  FOREIGN KEY (kdv_grubu_id) REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT;
ALTER TABLE public.fiyat_listesi_menfez_kalemleri
  ADD CONSTRAINT fiyat_menfez_kdv_grubu_fk
  FOREIGN KEY (kdv_grubu_id) REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT;
ALTER TABLE public.fiyat_listesi_kucuk_cam_kurallari
  ADD CONSTRAINT fiyat_kucuk_cam_kdv_grubu_fk
  FOREIGN KEY (kdv_grubu_id) REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT;
ALTER TABLE public.fiyat_listesi_nakliye_kurallari
  ADD CONSTRAINT fiyat_nakliye_kdv_grubu_fk
  FOREIGN KEY (kdv_grubu_id) REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT;
ALTER TABLE public.fiyat_listesi_diger_kalemleri
  ADD CONSTRAINT fiyat_diger_kalem_kdv_grubu_fk
  FOREIGN KEY (kdv_grubu_id) REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT;

CREATE TABLE public.vade_profilleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kod text NOT NULL UNIQUE CHECK (kod ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  ad text NOT NULL CHECK (nullif(btrim(ad), '') IS NOT NULL),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vade_profili_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vade_profili_id uuid NOT NULL
    REFERENCES public.vade_profilleri(id) ON DELETE RESTRICT,
  surum_no integer NOT NULL CHECK (surum_no > 0),
  durum public.ticari_surum_durumu NOT NULL DEFAULT 'taslak',
  gecerli_baslangic date NOT NULL,
  gecerli_bitis date,
  onceki_surum_id uuid
    REFERENCES public.vade_profili_surmleri(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlayan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlanma_tarihi timestamptz,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vade_profili_id, surum_no),
  CHECK (gecerli_bitis IS NULL OR gecerli_bitis >= gecerli_baslangic),
  CHECK (onceki_surum_id IS NULL OR onceki_surum_id <> id),
  CHECK (
    (durum = 'taslak' AND yayinlayan_kullanici_id IS NULL AND yayinlanma_tarihi IS NULL)
    OR
    (durum IN ('yayinda', 'arsiv')
      AND yayinlayan_kullanici_id IS NOT NULL
      AND yayinlanma_tarihi IS NOT NULL)
  ),
  CONSTRAINT vade_profili_yayin_gecerlilik_cakismasi
    EXCLUDE USING gist (
      vade_profili_id WITH =,
      daterange(
        gecerli_baslangic,
        COALESCE(gecerli_bitis, 'infinity'::date),
        '[]'
      ) WITH &&
    )
    WHERE (durum = 'yayinda')
);

CREATE INDEX vade_profili_surumu_gecerlilik_idx
  ON public.vade_profili_surmleri(
    vade_profili_id,
    durum,
    gecerli_baslangic,
    gecerli_bitis
  );

CREATE TABLE public.vade_profili_kademeleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vade_profili_surumu_id uuid NOT NULL
    REFERENCES public.vade_profili_surmleri(id) ON DELETE RESTRICT,
  gun_alt_siniri integer NOT NULL CHECK (gun_alt_siniri >= 0),
  gun_ust_siniri integer NOT NULL CHECK (gun_ust_siniri >= gun_alt_siniri),
  vade_farki_yuzdesi numeric(9,4) NOT NULL CHECK (vade_farki_yuzdesi >= 0),
  sira_no integer NOT NULL DEFAULT 1 CHECK (sira_no > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vade_profili_surumu_id, sira_no),
  CONSTRAINT vade_kademesi_gun_araligi_cakismasi
    EXCLUDE USING gist (
      vade_profili_surumu_id WITH =,
      int4range(gun_alt_siniri, gun_ust_siniri, '[]') WITH &&
    )
);

CREATE INDEX vade_profili_kademeleri_cozumleme_idx
  ON public.vade_profili_kademeleri(
    vade_profili_surumu_id,
    gun_alt_siniri,
    gun_ust_siniri
  );

CREATE TABLE public.musteri_ticari_profilleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cari_id uuid NOT NULL UNIQUE REFERENCES public.cari(id) ON DELETE RESTRICT,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.musteri_ticari_profil_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  musteri_ticari_profili_id uuid NOT NULL
    REFERENCES public.musteri_ticari_profilleri(id) ON DELETE RESTRICT,
  surum_no integer NOT NULL CHECK (surum_no > 0),
  durum public.ticari_surum_durumu NOT NULL DEFAULT 'taslak',
  gecerli_baslangic date NOT NULL,
  gecerli_bitis date,
  ana_fiyat_listesi_id uuid NOT NULL
    REFERENCES public.fiyat_listeleri(id) ON DELETE RESTRICT,
  musteri_fiyat_listesi_id uuid
    REFERENCES public.fiyat_listeleri(id) ON DELETE RESTRICT,
  varsayilan_para_birimi public.para_birimi_kodu NOT NULL DEFAULT 'TRY',
  varsayilan_kdv_grubu_id uuid NOT NULL
    REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT,
  varsayilan_vade_gunu integer NOT NULL DEFAULT 0 CHECK (varsayilan_vade_gunu >= 0),
  vade_profili_id uuid REFERENCES public.vade_profilleri(id) ON DELETE RESTRICT,
  vade_profili_surumu_id uuid
    REFERENCES public.vade_profili_surmleri(id) ON DELETE RESTRICT,
  nakliye_hesaplama_tipi public.nakliye_hesaplama_tipi,
  sabit_nakliye_satis_tutari numeric(18,6),
  sabit_nakliye_maliyet_tutari numeric(18,6),
  m2_nakliye_satis_tutari numeric(18,6),
  m2_nakliye_maliyet_tutari numeric(18,6),
  minimum_marj_yuzdesi_override numeric(9,4),
  varsayilan_belge_notu text,
  teklif_gecerlilik_gunu integer NOT NULL DEFAULT 15
    CHECK (teklif_gecerlilik_gunu > 0),
  onceki_surum_id uuid
    REFERENCES public.musteri_ticari_profil_surmleri(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlayan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlanma_tarihi timestamptz,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (musteri_ticari_profili_id, surum_no),
  CHECK (gecerli_bitis IS NULL OR gecerli_bitis >= gecerli_baslangic),
  CHECK (onceki_surum_id IS NULL OR onceki_surum_id <> id),
  CHECK (
    (vade_profili_id IS NULL AND vade_profili_surumu_id IS NULL)
    OR
    (vade_profili_id IS NOT NULL AND vade_profili_surumu_id IS NOT NULL)
  ),
  CHECK (
    minimum_marj_yuzdesi_override IS NULL
    OR (
      minimum_marj_yuzdesi_override >= 0
      AND minimum_marj_yuzdesi_override <= 100
    )
  ),
  CHECK (
    sabit_nakliye_satis_tutari IS NULL OR sabit_nakliye_satis_tutari >= 0
  ),
  CHECK (
    sabit_nakliye_maliyet_tutari IS NULL OR sabit_nakliye_maliyet_tutari >= 0
  ),
  CHECK (m2_nakliye_satis_tutari IS NULL OR m2_nakliye_satis_tutari >= 0),
  CHECK (m2_nakliye_maliyet_tutari IS NULL OR m2_nakliye_maliyet_tutari >= 0),
  CHECK (
    (nakliye_hesaplama_tipi IS NULL
      AND sabit_nakliye_satis_tutari IS NULL
      AND sabit_nakliye_maliyet_tutari IS NULL
      AND m2_nakliye_satis_tutari IS NULL
      AND m2_nakliye_maliyet_tutari IS NULL)
    OR
    (nakliye_hesaplama_tipi = 'siparis_sabiti'
      AND (sabit_nakliye_satis_tutari IS NOT NULL
        OR sabit_nakliye_maliyet_tutari IS NOT NULL)
      AND m2_nakliye_satis_tutari IS NULL
      AND m2_nakliye_maliyet_tutari IS NULL)
    OR
    (nakliye_hesaplama_tipi = 'm2'
      AND (m2_nakliye_satis_tutari IS NOT NULL
        OR m2_nakliye_maliyet_tutari IS NOT NULL)
      AND sabit_nakliye_satis_tutari IS NULL
      AND sabit_nakliye_maliyet_tutari IS NULL)
  ),
  CHECK (
    (durum = 'taslak' AND yayinlayan_kullanici_id IS NULL AND yayinlanma_tarihi IS NULL)
    OR
    (durum IN ('yayinda', 'arsiv')
      AND yayinlayan_kullanici_id IS NOT NULL
      AND yayinlanma_tarihi IS NOT NULL)
  ),
  CONSTRAINT musteri_profil_yayin_gecerlilik_cakismasi
    EXCLUDE USING gist (
      musteri_ticari_profili_id WITH =,
      daterange(
        gecerli_baslangic,
        COALESCE(gecerli_bitis, 'infinity'::date),
        '[]'
      ) WITH &&
    )
    WHERE (durum = 'yayinda')
);

CREATE INDEX musteri_ticari_profil_surumu_gecerlilik_idx
  ON public.musteri_ticari_profil_surmleri(
    musteri_ticari_profili_id,
    durum,
    gecerli_baslangic,
    gecerli_bitis
  );
CREATE INDEX musteri_ticari_profil_fiyat_listeleri_idx
  ON public.musteri_ticari_profil_surmleri(
    ana_fiyat_listesi_id,
    musteri_fiyat_listesi_id
  );

CREATE TABLE public.doviz_kurlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kur_tarihi date NOT NULL,
  para_birimi public.para_birimi_kodu NOT NULL,
  kur_tipi public.doviz_kur_tipi NOT NULL,
  try_karsiligi numeric(18,6) NOT NULL CHECK (try_karsiligi > 0),
  tcmb_kaynak_tarihi date,
  kaynak public.doviz_kur_kaynagi NOT NULL,
  manuel_gerekce text,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kur_tarihi, para_birimi, kur_tipi, revision_no),
  CHECK (para_birimi <> 'TRY'),
  CHECK (tcmb_kaynak_tarihi IS NULL OR tcmb_kaynak_tarihi <= kur_tarihi),
  CHECK (
    (kaynak = 'otomatik'
      AND tcmb_kaynak_tarihi IS NOT NULL
      AND manuel_gerekce IS NULL)
    OR
    (kaynak = 'manuel'
      AND nullif(btrim(manuel_gerekce), '') IS NOT NULL
      AND olusturan_kullanici_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX doviz_kurlari_tek_aktif_revision_idx
  ON public.doviz_kurlari(kur_tarihi, para_birimi, kur_tipi)
  WHERE aktif;
CREATE INDEX doviz_kurlari_cozumleme_idx
  ON public.doviz_kurlari(
    para_birimi,
    kur_tipi,
    kur_tarihi DESC,
    tcmb_kaynak_tarihi DESC
  )
  WHERE aktif;

CREATE OR REPLACE FUNCTION public.ticari_onceki_surumu_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_parent_column text := TG_ARGV[0];
  v_parent_id uuid;
  v_onceki_parent_id uuid;
  v_onceki_surum_no integer;
BEGIN
  IF NEW.onceki_surum_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_parent_id := NULLIF(to_jsonb(NEW) ->> v_parent_column, '')::uuid;
  EXECUTE format(
    'SELECT %I, surum_no FROM public.%I WHERE id = $1',
    v_parent_column,
    TG_TABLE_NAME
  )
  INTO v_onceki_parent_id, v_onceki_surum_no
  USING NEW.onceki_surum_id;

  IF v_onceki_parent_id IS DISTINCT FROM v_parent_id
     OR v_onceki_surum_no >= NEW.surum_no THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ONCEKI_SURUM_BAGLANTISI_GECERSIZ';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.musteri_ticari_profili_carisini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cari_tipi text;
BEGIN
  SELECT tipi INTO v_cari_tipi
  FROM public.cari
  WHERE id = NEW.cari_id;

  IF v_cari_tipi IS DISTINCT FROM 'musteri' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TICARI_PROFIL_YALNIZ_MUSTERI_CARISI_ICINDIR';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.cari_id IS DISTINCT FROM NEW.cari_id
     AND EXISTS (
       SELECT 1
       FROM public.musteri_ticari_profil_surmleri version_row
       WHERE version_row.musteri_ticari_profili_id = OLD.id
         AND version_row.durum IN ('yayinda', 'arsiv')
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'YAYINLANMIS_PROFILIN_CARISI_DEGISTIRILEMEZ';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.musteri_ticari_profil_baglantilarini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cari_id uuid;
  v_ana_tur text;
  v_musteri_tur text;
  v_musteri_cari_id uuid;
  v_musteri_ana_liste_id uuid;
  v_vade_parent_id uuid;
BEGIN
  SELECT cari_id INTO v_cari_id
  FROM public.musteri_ticari_profilleri
  WHERE id = NEW.musteri_ticari_profili_id;

  SELECT tur INTO v_ana_tur
  FROM public.fiyat_listeleri
  WHERE id = NEW.ana_fiyat_listesi_id;

  IF v_ana_tur IS DISTINCT FROM 'ana' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PROFIL_ANA_FIYAT_LISTESI_GECERSIZ';
  END IF;

  IF NEW.musteri_fiyat_listesi_id IS NOT NULL THEN
    SELECT tur, cari_id, miras_ana_fiyat_listesi_id
      INTO v_musteri_tur, v_musteri_cari_id, v_musteri_ana_liste_id
    FROM public.fiyat_listeleri
    WHERE id = NEW.musteri_fiyat_listesi_id;

    IF v_musteri_tur IS DISTINCT FROM 'musteri'
       OR v_musteri_cari_id IS DISTINCT FROM v_cari_id
       OR v_musteri_ana_liste_id IS DISTINCT FROM NEW.ana_fiyat_listesi_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PROFIL_MUSTERI_FIYAT_LISTESI_GECERSIZ';
    END IF;
  END IF;

  IF NEW.vade_profili_surumu_id IS NOT NULL THEN
    SELECT vade_profili_id INTO v_vade_parent_id
    FROM public.vade_profili_surmleri
    WHERE id = NEW.vade_profili_surumu_id;

    IF v_vade_parent_id IS DISTINCT FROM NEW.vade_profili_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PROFIL_VADE_SURUMU_GECERSIZ';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Kur satırları append-only'dir. Yalnız aktif satırı pasifleştirmek serbesttir;
-- yeni değer daima yeni revision satırı olarak eklenir.
CREATE OR REPLACE FUNCTION public.doviz_kuru_degisikligini_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DOVIZ_KURU_SILINEMEZ';
  END IF;

  IF OLD.aktif
     AND NOT NEW.aktif
     AND (to_jsonb(OLD) - 'aktif') = (to_jsonb(NEW) - 'aktif') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'DOVIZ_KURU_DEGISTIRILEMEZ_YENI_REVISION_GEREKLI';
END;
$$;

REVOKE ALL ON FUNCTION public.ticari_onceki_surumu_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.musteri_ticari_profili_carisini_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.musteri_ticari_profil_baglantilarini_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.doviz_kuru_degisikligini_koru()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER kdv_gruplari_updated_at
  BEFORE UPDATE ON public.kdv_gruplari
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at();
CREATE TRIGGER kdv_grup_surumu_previous_guard
  BEFORE INSERT OR UPDATE ON public.kdv_grup_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_onceki_surumu_koru('kdv_grubu_id');
CREATE TRIGGER kdv_grup_surumu_immutable
  BEFORE UPDATE OR DELETE ON public.kdv_grup_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_surumu_degisiklige_karsi_koru();
CREATE TRIGGER kdv_grup_surumu_revision
  BEFORE UPDATE ON public.kdv_grup_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at_ve_revision();

CREATE TRIGGER vade_profilleri_updated_at
  BEFORE UPDATE ON public.vade_profilleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at();
CREATE TRIGGER vade_profili_surumu_previous_guard
  BEFORE INSERT OR UPDATE ON public.vade_profili_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_onceki_surumu_koru('vade_profili_id');
CREATE TRIGGER vade_profili_surumu_immutable
  BEFORE UPDATE OR DELETE ON public.vade_profili_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_surumu_degisiklige_karsi_koru();
CREATE TRIGGER vade_profili_surumu_revision
  BEFORE UPDATE ON public.vade_profili_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at_ve_revision();
CREATE TRIGGER vade_profili_kademeleri_draft_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.vade_profili_kademeleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_taslak_kalemini_koru(
    'vade_profili_surmleri',
    'vade_profili_surumu_id'
  );

CREATE TRIGGER musteri_ticari_profili_cari_guard
  BEFORE INSERT OR UPDATE ON public.musteri_ticari_profilleri
  FOR EACH ROW EXECUTE FUNCTION public.musteri_ticari_profili_carisini_koru();
CREATE TRIGGER musteri_ticari_profilleri_updated_at
  BEFORE UPDATE ON public.musteri_ticari_profilleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at();
CREATE TRIGGER musteri_ticari_profil_surumu_previous_guard
  BEFORE INSERT OR UPDATE ON public.musteri_ticari_profil_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_onceki_surumu_koru(
    'musteri_ticari_profili_id'
  );
CREATE TRIGGER musteri_ticari_profil_surumu_link_guard
  BEFORE INSERT OR UPDATE ON public.musteri_ticari_profil_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.musteri_ticari_profil_baglantilarini_koru();
CREATE TRIGGER musteri_ticari_profil_surumu_immutable
  BEFORE UPDATE OR DELETE ON public.musteri_ticari_profil_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_surumu_degisiklige_karsi_koru();
CREATE TRIGGER musteri_ticari_profil_surumu_revision
  BEFORE UPDATE ON public.musteri_ticari_profil_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at_ve_revision();

CREATE TRIGGER doviz_kurlari_immutable
  BEFORE UPDATE OR DELETE ON public.doviz_kurlari
  FOR EACH ROW EXECUTE FUNCTION public.doviz_kuru_degisikligini_koru();

-- Edge Function yalnız bu dar service-role RPC'sini çağırır.
CREATE OR REPLACE FUNCTION public.tcmb_doviz_kurlarini_kaydet(
  p_kur_tarihi date,
  p_tcmb_kaynak_tarihi date,
  p_kurlar jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item record;
  v_aktif_id uuid;
  v_aktif_kaynak public.doviz_kur_kaynagi;
  v_aktif_deger numeric(18,6);
  v_aktif_kaynak_tarihi date;
  v_revision_no integer;
  v_eklenen integer := 0;
  v_degismeyen integer := 0;
  v_manuel_korunan integer := 0;
BEGIN
  IF p_kur_tarihi IS NULL
     OR p_tcmb_kaynak_tarihi IS NULL
     OR p_tcmb_kaynak_tarihi > p_kur_tarihi THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TCMB_KUR_TARIHLERI_GECERSIZ';
  END IF;

  IF jsonb_typeof(p_kurlar) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TCMB_KUR_PAYLOAD_DIZI_OLMALI';
  END IF;

  IF jsonb_array_length(p_kurlar) <> 8 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TCMB_KUR_PAYLOAD_SEKIZ_KALEM_OLMALI';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_kurlar) item
    WHERE COALESCE(item ->> 'para_birimi', '') NOT IN ('USD', 'EUR')
       OR COALESCE(item ->> 'kur_tipi', '') NOT IN (
         'doviz_alis',
         'doviz_satis',
         'efektif_alis',
         'efektif_satis'
       )
       OR jsonb_typeof(item -> 'try_karsiligi') IS DISTINCT FROM 'number'
       OR CASE
         WHEN jsonb_typeof(item -> 'try_karsiligi') = 'number'
           THEN (item ->> 'try_karsiligi')::numeric <= 0
         ELSE true
       END
  ) OR (
    SELECT count(DISTINCT concat_ws(
      ':',
      item ->> 'para_birimi',
      item ->> 'kur_tipi'
    ))
    FROM jsonb_array_elements(p_kurlar) item
  ) <> 8 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TCMB_KUR_PAYLOAD_GECERSIZ';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('tcmb:' || p_kur_tarihi::text, 0)
  );

  FOR v_item IN
    SELECT
      item ->> 'para_birimi' AS para_birimi,
      item ->> 'kur_tipi' AS kur_tipi,
      (item ->> 'try_karsiligi')::numeric(18,6) AS try_karsiligi
    FROM jsonb_array_elements(p_kurlar) item
  LOOP
    v_aktif_id := NULL;
    v_aktif_kaynak := NULL;
    v_aktif_deger := NULL;
    v_aktif_kaynak_tarihi := NULL;

    SELECT id, kaynak, try_karsiligi, tcmb_kaynak_tarihi
      INTO v_aktif_id, v_aktif_kaynak, v_aktif_deger, v_aktif_kaynak_tarihi
    FROM public.doviz_kurlari
    WHERE kur_tarihi = p_kur_tarihi
      AND para_birimi = v_item.para_birimi::public.para_birimi_kodu
      AND kur_tipi = v_item.kur_tipi::public.doviz_kur_tipi
      AND aktif
    FOR UPDATE;

    IF v_aktif_id IS NOT NULL AND v_aktif_kaynak = 'manuel' THEN
      v_manuel_korunan := v_manuel_korunan + 1;
      CONTINUE;
    END IF;

    IF v_aktif_id IS NOT NULL
       AND v_aktif_kaynak = 'otomatik'
       AND v_aktif_deger = v_item.try_karsiligi
       AND v_aktif_kaynak_tarihi = p_tcmb_kaynak_tarihi THEN
      v_degismeyen := v_degismeyen + 1;
      CONTINUE;
    END IF;

    IF v_aktif_id IS NOT NULL THEN
      UPDATE public.doviz_kurlari
      SET aktif = false
      WHERE id = v_aktif_id;
    END IF;

    SELECT COALESCE(max(revision_no), 0) + 1
      INTO v_revision_no
    FROM public.doviz_kurlari
    WHERE kur_tarihi = p_kur_tarihi
      AND para_birimi = v_item.para_birimi::public.para_birimi_kodu
      AND kur_tipi = v_item.kur_tipi::public.doviz_kur_tipi;

    INSERT INTO public.doviz_kurlari(
      kur_tarihi,
      para_birimi,
      kur_tipi,
      try_karsiligi,
      tcmb_kaynak_tarihi,
      kaynak,
      revision_no,
      aktif
    )
    VALUES (
      p_kur_tarihi,
      v_item.para_birimi::public.para_birimi_kodu,
      v_item.kur_tipi::public.doviz_kur_tipi,
      v_item.try_karsiligi,
      p_tcmb_kaynak_tarihi,
      'otomatik',
      v_revision_no,
      true
    );

    v_eklenen := v_eklenen + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'kur_tarihi', p_kur_tarihi,
    'tcmb_kaynak_tarihi', p_tcmb_kaynak_tarihi,
    'eklenen_revision_sayisi', v_eklenen,
    'degismeyen_sayisi', v_degismeyen,
    'manuel_korunan_sayisi', v_manuel_korunan
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tcmb_doviz_kurlarini_kaydet(date, date, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tcmb_doviz_kurlarini_kaydet(date, date, jsonb)
  TO service_role;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'kdv_gruplari',
    'kdv_grup_surmleri',
    'vade_profilleri',
    'vade_profili_surmleri',
    'vade_profili_kademeleri',
    'musteri_ticari_profilleri',
    'musteri_ticari_profil_surmleri'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      v_table
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (public.has_permission(%L, %L))',
      v_table || '_read', v_table, 'pricing', 'read'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (public.has_permission(%L, %L))',
      v_table || '_create', v_table, 'pricing', 'create'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (public.has_permission(%L, %L))
       WITH CHECK (public.has_permission(%L, %L))',
      v_table || '_update',
      v_table,
      'pricing',
      'update',
      'pricing',
      'update'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (public.has_permission(%L, %L))',
      v_table || '_delete', v_table, 'pricing', 'delete'
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.write_audit_event()',
      'audit_' || v_table, v_table
    );
  END LOOP;
END;
$$;

ALTER TABLE public.doviz_kurlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doviz_kurlari FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.doviz_kurlari FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.doviz_kurlari TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.doviz_kurlari TO service_role;

CREATE POLICY doviz_kurlari_read
  ON public.doviz_kurlari FOR SELECT TO authenticated
  USING (public.has_permission('pricing', 'read'));

CREATE TRIGGER audit_doviz_kurlari
  AFTER INSERT OR UPDATE OR DELETE ON public.doviz_kurlari
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

COMMENT ON TABLE public.doviz_kurlari IS
  'Kur_tarihi istenen belge tarihini, tcmb_kaynak_tarihi fiilen kullanılan resmi kaynak tarihini tutar. TRY motor içinde daima 1 kabul edilir.';
COMMENT ON TABLE public.musteri_ticari_profil_surmleri IS
  'Sipariş ve teklif fiyat revizyonlarına değerleriyle birlikte snapshot edilen tarihçeli müşteri ticari varsayımları.';
