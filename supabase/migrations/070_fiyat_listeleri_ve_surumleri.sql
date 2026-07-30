-- 070 — Tarihçeli/sürümlü satış fiyat listeleri ve tür bazlı kalemler.

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.fiyat_listeleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kod text NOT NULL UNIQUE CHECK (kod ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  ad text NOT NULL CHECK (nullif(btrim(ad), '') IS NOT NULL),
  tur text NOT NULL CHECK (tur IN ('ana', 'musteri')),
  miras_ana_fiyat_listesi_id uuid
    REFERENCES public.fiyat_listeleri(id) ON DELETE RESTRICT,
  cari_id uuid REFERENCES public.cari(id) ON DELETE RESTRICT,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (tur = 'ana' AND miras_ana_fiyat_listesi_id IS NULL AND cari_id IS NULL)
    OR
    (tur = 'musteri' AND miras_ana_fiyat_listesi_id IS NOT NULL AND cari_id IS NOT NULL)
  ),
  CHECK (miras_ana_fiyat_listesi_id IS NULL OR miras_ana_fiyat_listesi_id <> id)
);

CREATE UNIQUE INDEX fiyat_listeleri_aktif_musteri_idx
  ON public.fiyat_listeleri(cari_id)
  WHERE tur = 'musteri' AND aktif;

CREATE INDEX fiyat_listeleri_miras_idx
  ON public.fiyat_listeleri(miras_ana_fiyat_listesi_id)
  WHERE miras_ana_fiyat_listesi_id IS NOT NULL;

CREATE TABLE public.fiyat_listesi_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiyat_listesi_id uuid NOT NULL
    REFERENCES public.fiyat_listeleri(id) ON DELETE RESTRICT,
  surum_no integer NOT NULL CHECK (surum_no > 0),
  durum public.ticari_surum_durumu NOT NULL DEFAULT 'taslak',
  gecerli_baslangic date NOT NULL,
  gecerli_bitis date,
  onceki_surum_id uuid
    REFERENCES public.fiyat_listesi_surmleri(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlayan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlanma_tarihi timestamptz,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiyat_listesi_id, surum_no),
  CHECK (gecerli_bitis IS NULL OR gecerli_bitis >= gecerli_baslangic),
  CHECK (onceki_surum_id IS NULL OR onceki_surum_id <> id),
  CHECK (
    (durum = 'taslak' AND yayinlayan_kullanici_id IS NULL AND yayinlanma_tarihi IS NULL)
    OR
    (durum IN ('yayinda', 'arsiv')
      AND yayinlayan_kullanici_id IS NOT NULL
      AND yayinlanma_tarihi IS NOT NULL)
  ),
  CONSTRAINT fiyat_listesi_yayin_gecerlilik_cakismasi
    EXCLUDE USING gist (
      fiyat_listesi_id WITH =,
      daterange(
        gecerli_baslangic,
        COALESCE(gecerli_bitis, 'infinity'::date),
        '[]'
      ) WITH &&
    )
    WHERE (durum = 'yayinda')
);

CREATE INDEX fiyat_listesi_surumu_gecerlilik_idx
  ON public.fiyat_listesi_surmleri(
    fiyat_listesi_id,
    durum,
    gecerli_baslangic,
    gecerli_bitis
  );

-- Ana listede stok bazlı sabit fiyat; müşteri listesinde sabit stok fiyatı
-- veya stok/grup/genel yüzde katmanı aynı tabloda açık bir XOR modeliyle tutulur.
CREATE TABLE public.fiyat_listesi_urun_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiyat_listesi_surumu_id uuid NOT NULL
    REFERENCES public.fiyat_listesi_surmleri(id) ON DELETE RESTRICT,
  kapsam_tipi public.ticari_kapsam_tipi NOT NULL DEFAULT 'stok',
  stok_id uuid REFERENCES public.stok(id) ON DELETE RESTRICT,
  stok_grubu text,
  birim_fiyat numeric(18,6),
  yuzde_fark numeric(9,4),
  para_birimi public.para_birimi_kodu,
  kdv_grubu_id uuid NOT NULL,
  minimum_m2 numeric(18,6),
  en_adimi_mm numeric(18,6),
  boy_adimi_mm numeric(18,6),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kapsam_tipi = 'stok' AND stok_id IS NOT NULL AND stok_grubu IS NULL)
    OR
    (kapsam_tipi = 'stok_grubu' AND stok_id IS NULL AND nullif(btrim(stok_grubu), '') IS NOT NULL)
    OR
    (kapsam_tipi = 'genel' AND stok_id IS NULL AND stok_grubu IS NULL)
  ),
  CHECK ((birim_fiyat IS NOT NULL)::integer + (yuzde_fark IS NOT NULL)::integer = 1),
  CHECK (birim_fiyat IS NULL OR birim_fiyat >= 0),
  CHECK (yuzde_fark IS NULL OR yuzde_fark > -100),
  CHECK (minimum_m2 IS NULL OR minimum_m2 > 0),
  CHECK (en_adimi_mm IS NULL OR en_adimi_mm > 0),
  CHECK (boy_adimi_mm IS NULL OR boy_adimi_mm > 0),
  CHECK (
    (birim_fiyat IS NOT NULL
      AND kapsam_tipi = 'stok'
      AND para_birimi IS NOT NULL)
    OR
    (yuzde_fark IS NOT NULL
      AND para_birimi IS NULL
      AND minimum_m2 IS NULL
      AND en_adimi_mm IS NULL
      AND boy_adimi_mm IS NULL)
  )
);

CREATE UNIQUE INDEX fiyat_urun_kalemi_stok_unique
  ON public.fiyat_listesi_urun_kalemleri(fiyat_listesi_surumu_id, stok_id)
  WHERE kapsam_tipi = 'stok';

CREATE UNIQUE INDEX fiyat_urun_kalemi_grup_unique
  ON public.fiyat_listesi_urun_kalemleri(fiyat_listesi_surumu_id, stok_grubu)
  WHERE kapsam_tipi = 'stok_grubu';

CREATE UNIQUE INDEX fiyat_urun_kalemi_genel_unique
  ON public.fiyat_listesi_urun_kalemleri(fiyat_listesi_surumu_id)
  WHERE kapsam_tipi = 'genel';

CREATE TABLE public.fiyat_listesi_kenar_islem_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiyat_listesi_surumu_id uuid NOT NULL
    REFERENCES public.fiyat_listesi_surmleri(id) ON DELETE RESTRICT,
  islem_turu text NOT NULL CHECK (nullif(btrim(islem_turu), '') IS NOT NULL),
  birim_fiyat numeric(18,6) NOT NULL CHECK (birim_fiyat >= 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  kdv_grubu_id uuid NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiyat_listesi_surumu_id, islem_turu)
);

CREATE TABLE public.fiyat_listesi_menfez_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiyat_listesi_surumu_id uuid NOT NULL
    REFERENCES public.fiyat_listesi_surmleri(id) ON DELETE RESTRICT,
  menfez_turu text NOT NULL DEFAULT 'standart'
    CHECK (nullif(btrim(menfez_turu), '') IS NOT NULL),
  cap_alt_mm numeric(18,6) NOT NULL CHECK (cap_alt_mm >= 0),
  cap_ust_mm numeric(18,6) NOT NULL CHECK (cap_ust_mm >= cap_alt_mm),
  birim_fiyat numeric(18,6) NOT NULL CHECK (birim_fiyat >= 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  kdv_grubu_id uuid NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiyat_menfez_cap_araligi_cakismasi
    EXCLUDE USING gist (
      fiyat_listesi_surumu_id WITH =,
      menfez_turu WITH =,
      numrange(cap_alt_mm, cap_ust_mm, '[]') WITH &&
    )
    WHERE (aktif)
);

CREATE TABLE public.fiyat_listesi_kucuk_cam_kurallari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiyat_listesi_surumu_id uuid NOT NULL
    REFERENCES public.fiyat_listesi_surmleri(id) ON DELETE RESTRICT,
  alan_ust_siniri_m2 numeric(18,6) NOT NULL CHECK (alan_ust_siniri_m2 > 0),
  sabit_ek_tutar numeric(18,6),
  yuzde_ek_bedel numeric(9,4),
  para_birimi public.para_birimi_kodu,
  kdv_grubu_id uuid NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiyat_listesi_surumu_id, alan_ust_siniri_m2),
  CHECK (
    (sabit_ek_tutar IS NOT NULL)::integer
      + (yuzde_ek_bedel IS NOT NULL)::integer = 1
  ),
  CHECK (sabit_ek_tutar IS NULL OR sabit_ek_tutar >= 0),
  CHECK (yuzde_ek_bedel IS NULL OR yuzde_ek_bedel >= 0),
  CHECK (
    (sabit_ek_tutar IS NOT NULL AND para_birimi IS NOT NULL)
    OR
    (yuzde_ek_bedel IS NOT NULL AND para_birimi IS NULL)
  )
);

CREATE TABLE public.fiyat_listesi_nakliye_kurallari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiyat_listesi_surumu_id uuid NOT NULL
    REFERENCES public.fiyat_listesi_surmleri(id) ON DELETE RESTRICT,
  hesaplama_tipi public.nakliye_hesaplama_tipi NOT NULL,
  birim_fiyat numeric(18,6) NOT NULL CHECK (birim_fiyat >= 0),
  minimum_tutar numeric(18,6) CHECK (minimum_tutar IS NULL OR minimum_tutar >= 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  kdv_grubu_id uuid NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiyat_listesi_surumu_id, hesaplama_tipi)
);

CREATE TABLE public.fiyat_listesi_diger_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiyat_listesi_surumu_id uuid NOT NULL
    REFERENCES public.fiyat_listesi_surmleri(id) ON DELETE RESTRICT,
  kalem_kodu text NOT NULL CHECK (kalem_kodu ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  kalem_adi text NOT NULL CHECK (nullif(btrim(kalem_adi), '') IS NOT NULL),
  hesaplama_birimi public.hesaplama_birimi NOT NULL,
  birim_fiyat numeric(18,6) NOT NULL CHECK (birim_fiyat >= 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  kdv_grubu_id uuid NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiyat_listesi_surumu_id, kalem_kodu)
);

CREATE INDEX fiyat_urun_kalemleri_cozumleme_idx
  ON public.fiyat_listesi_urun_kalemleri(
    fiyat_listesi_surumu_id,
    kapsam_tipi,
    stok_id,
    stok_grubu
  )
  WHERE aktif;
CREATE INDEX fiyat_kenar_islem_cozumleme_idx
  ON public.fiyat_listesi_kenar_islem_kalemleri(
    fiyat_listesi_surumu_id,
    islem_turu
  )
  WHERE aktif;
CREATE INDEX fiyat_menfez_cozumleme_idx
  ON public.fiyat_listesi_menfez_kalemleri(
    fiyat_listesi_surumu_id,
    menfez_turu,
    cap_alt_mm,
    cap_ust_mm
  )
  WHERE aktif;

CREATE OR REPLACE FUNCTION public.fiyat_listesi_baglantisini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ana_tur text;
  v_cari_tipi text;
BEGIN
  IF NEW.tur = 'musteri' THEN
    SELECT tur INTO v_ana_tur
    FROM public.fiyat_listeleri
    WHERE id = NEW.miras_ana_fiyat_listesi_id;

    IF v_ana_tur IS DISTINCT FROM 'ana' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'MUSTERI_LISTESI_YALNIZ_ANA_LISTEYI_MIRAS_ALABILIR';
    END IF;

    SELECT tipi INTO v_cari_tipi
    FROM public.cari
    WHERE id = NEW.cari_id;

    IF v_cari_tipi IS DISTINCT FROM 'musteri' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'MUSTERI_FIYAT_LISTESI_YALNIZ_MUSTERI_CARISI_ICINDIR';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       OLD.tur,
       OLD.miras_ana_fiyat_listesi_id,
       OLD.cari_id
     ) IS DISTINCT FROM (
       NEW.tur,
       NEW.miras_ana_fiyat_listesi_id,
       NEW.cari_id
     )
     AND EXISTS (
       SELECT 1
       FROM public.fiyat_listesi_surmleri version_row
       WHERE version_row.fiyat_listesi_id = OLD.id
         AND version_row.durum IN ('yayinda', 'arsiv')
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'YAYINLANMIS_LISTENIN_BAGLANTISI_DEGISTIRILEMEZ';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fiyat_listesi_surumu_baglantisini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_onceki_liste_id uuid;
  v_onceki_surum_no integer;
BEGIN
  IF NEW.onceki_surum_id IS NOT NULL THEN
    SELECT fiyat_listesi_id, surum_no
      INTO v_onceki_liste_id, v_onceki_surum_no
    FROM public.fiyat_listesi_surmleri
    WHERE id = NEW.onceki_surum_id;

    IF v_onceki_liste_id IS DISTINCT FROM NEW.fiyat_listesi_id
       OR v_onceki_surum_no >= NEW.surum_no THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'ONCEKI_FIYAT_SURUMU_GECERSIZ';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fiyat_urun_kalemi_liste_turunu_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_liste_turu text;
BEGIN
  SELECT list_row.tur INTO v_liste_turu
  FROM public.fiyat_listesi_surmleri version_row
  JOIN public.fiyat_listeleri list_row ON list_row.id = version_row.fiyat_listesi_id
  WHERE version_row.id = NEW.fiyat_listesi_surumu_id;

  IF v_liste_turu = 'ana'
     AND (NEW.birim_fiyat IS NULL OR NEW.kapsam_tipi <> 'stok') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ANA_LISTE_STOK_BAZLI_SABIT_FIYAT_ISTIYOR';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fiyat_listesi_baglantisini_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiyat_listesi_surumu_baglantisini_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiyat_urun_kalemi_liste_turunu_koru()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER fiyat_listesi_baglanti_guard
  BEFORE INSERT OR UPDATE ON public.fiyat_listeleri
  FOR EACH ROW EXECUTE FUNCTION public.fiyat_listesi_baglantisini_koru();
CREATE TRIGGER fiyat_listesi_updated_at
  BEFORE UPDATE ON public.fiyat_listeleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at();

CREATE TRIGGER fiyat_listesi_surumu_baglanti_guard
  BEFORE INSERT OR UPDATE ON public.fiyat_listesi_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.fiyat_listesi_surumu_baglantisini_koru();
CREATE TRIGGER fiyat_listesi_surumu_immutable
  BEFORE UPDATE OR DELETE ON public.fiyat_listesi_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_surumu_degisiklige_karsi_koru();
CREATE TRIGGER fiyat_listesi_surumu_revision
  BEFORE UPDATE ON public.fiyat_listesi_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at_ve_revision();

CREATE TRIGGER fiyat_urun_kalemi_list_type_guard
  BEFORE INSERT OR UPDATE ON public.fiyat_listesi_urun_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.fiyat_urun_kalemi_liste_turunu_koru();

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'fiyat_listesi_urun_kalemleri',
    'fiyat_listesi_kenar_islem_kalemleri',
    'fiyat_listesi_menfez_kalemleri',
    'fiyat_listesi_kucuk_cam_kurallari',
    'fiyat_listesi_nakliye_kurallari',
    'fiyat_listesi_diger_kalemleri'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.ticari_taslak_kalemini_koru(%L, %L)',
      v_table || '_draft_guard',
      v_table,
      'fiyat_listesi_surmleri',
      'fiyat_listesi_surumu_id'
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'fiyat_listeleri',
    'fiyat_listesi_surmleri',
    'fiyat_listesi_urun_kalemleri',
    'fiyat_listesi_kenar_islem_kalemleri',
    'fiyat_listesi_menfez_kalemleri',
    'fiyat_listesi_kucuk_cam_kurallari',
    'fiyat_listesi_nakliye_kurallari',
    'fiyat_listesi_diger_kalemleri'
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
      v_table || '_read',
      v_table,
      'pricing',
      'read'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (public.has_permission(%L, %L))',
      v_table || '_create',
      v_table,
      'pricing',
      'create'
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
      v_table || '_delete',
      v_table,
      'pricing',
      'delete'
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.write_audit_event()',
      'audit_' || v_table,
      v_table
    );
  END LOOP;
END;
$$;

COMMENT ON TABLE public.fiyat_listesi_surmleri IS
  'Tarih aralığı çakışmayan, yayınlandıktan sonra içerik olarak değişmez satış fiyatı sürümleri.';
COMMENT ON COLUMN public.fiyat_listesi_urun_kalemleri.yuzde_fark IS
  'Müşteri katmanında ana fiyat üzerine uygulanan tek, en özel yüzde fark; üst üste bindirilmez.';
