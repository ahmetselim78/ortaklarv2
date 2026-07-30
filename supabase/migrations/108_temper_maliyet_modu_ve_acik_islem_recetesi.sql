-- 108 - Tarihceli temper maliyet modu ve acik recete islemleri
--
-- Bu migration gercek stok, fiyat, mod veya recete verisi seed etmez.
-- Temper dis hizmet karti fiziksel 105 katalog sayilarini degistirmeyen ayri
-- bir hizmet sablonunda tanimlidir; kullanici mevcut katalog kurulum butonuyla
-- eksik karti idempotent olarak olusturur.

BEGIN;

SET search_path = public, extensions, pg_catalog;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Cam veya yan malzeme satan mevcut tedarikciler hizmeti fiyatlamaya devam
-- eder. Yalniz temper isi yapan fasoncular da baska bir stok kapsami verilmeden
-- cari kartinda acikca temsil edilebilir.
ALTER TABLE public.cari
  DROP CONSTRAINT IF EXISTS cari_tedarik_kapsamlari_deger_check;
ALTER TABLE public.cari
  ADD CONSTRAINT cari_tedarik_kapsamlari_deger_check CHECK (
    tedarik_kapsamlari <@
      ARRAY['cam', 'cita', 'yan_malzeme', 'temper_hizmeti']::text[]
  );

COMMENT ON COLUMN public.cari.tedarik_kapsamlari IS
  'Tedarikcinin saglayabildigi cam, cita, yan malzeme veya yalniz temper hizmeti kapsamlarini tutar.';

-- ---------------------------------------------------------------------------
-- Envanter olmayan temper dis hizmet maliyet girdisi
-- ---------------------------------------------------------------------------

CREATE TABLE public.maliyet_hizmet_stok_sablonu (
  kod text PRIMARY KEY,
  ad text NOT NULL,
  kategori text NOT NULL CHECK (kategori = 'yan_malzeme'),
  grup text NOT NULL,
  birim text NOT NULL
    CHECK (lower(replace(birim, '²', '2')) = 'm2'),
  ticari_kapsam public.stok_ticari_kapsami NOT NULL
    DEFAULT 'maliyet_bileseni'
    CHECK (ticari_kapsam = 'maliyet_bileseni'),
  aktif boolean NOT NULL DEFAULT true CHECK (aktif),
  hizmet_turu text NOT NULL UNIQUE
    CHECK (hizmet_turu IN ('temper_dis_hizmet')),
  aciklama text
);

COMMENT ON TABLE public.maliyet_hizmet_stok_sablonu IS
  'Fiziksel 105 katalog sayilarini degistirmeden, kullanici eylemiyle kurulacak envantersiz maliyet hizmet kartlari.';

INSERT INTO public.maliyet_hizmet_stok_sablonu (
  kod,
  ad,
  kategori,
  grup,
  birim,
  ticari_kapsam,
  aktif,
  hizmet_turu,
  aciklama
)
VALUES (
  'HIZMET-TEMPER-DIS',
  'Temper Dis Hizmet',
  'yan_malzeme',
  'MALIYET HIZMETI',
  'm2',
  'maliyet_bileseni',
  true,
  'temper_dis_hizmet',
  'Temper dis hizmet TRY/m2 maliyet girdisi'
);

CREATE TABLE public.maliyet_hizmet_stoklari (
  stok_id uuid PRIMARY KEY REFERENCES public.stok(id) ON DELETE RESTRICT,
  hizmet_turu text NOT NULL UNIQUE
    CHECK (hizmet_turu IN ('temper_dis_hizmet')),
  fiyat_birimi text NOT NULL DEFAULT 'm2'
    CHECK (lower(replace(fiyat_birimi, '²', '2')) = 'm2'),
  envanter_takipli boolean NOT NULL DEFAULT false
    CHECK (envanter_takipli = false),
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.maliyet_hizmet_stoklari IS
  'Fiyat seciminde stok altyapisini kullanan fakat gercek miktar/envanter hareketi tutulmayan maliyet hizmet kartlari.';

CREATE OR REPLACE FUNCTION public.temper_hizmet_stogunu_tanit_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.kod <> 'HIZMET-TEMPER-DIS' THEN
    RETURN NEW;
  END IF;

  IF NEW.kategori <> 'yan_malzeme'
     OR lower(replace(NEW.birim, '²', '2')) <> 'm2'
     OR COALESCE(NEW.mevcut_miktar, 0) <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_HIZMET_STOK_KARTI_GECERSIZ',
      DETAIL = 'Temper dis hizmet karti yan_malzeme, m2 ve sifir miktarli olmalidir.';
  END IF;

  INSERT INTO public.maliyet_hizmet_stoklari (
    stok_id,
    hizmet_turu,
    fiyat_birimi,
    envanter_takipli,
    aciklama
  )
  VALUES (
    NEW.id,
    'temper_dis_hizmet',
    'm2',
    false,
    'Temper dis hizmet TRY/m2 maliyet girdisi'
  )
  ON CONFLICT (stok_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER temper_hizmet_stogu_tanit_v4
  AFTER INSERT ON public.stok
  FOR EACH ROW EXECUTE FUNCTION public.temper_hizmet_stogunu_tanit_v4();

-- Migrationdan once ayni kodla guvenli kart olusturulmussa yalniz hizmet rolunu
-- tanit; kart yoksa gercek stok verisi olusturma.
INSERT INTO public.maliyet_hizmet_stoklari (
  stok_id,
  hizmet_turu,
  fiyat_birimi,
  envanter_takipli,
  aciklama
)
SELECT
  stok.id,
  'temper_dis_hizmet',
  'm2',
  false,
  'Temper dis hizmet TRY/m2 maliyet girdisi'
FROM public.stok stok
WHERE stok.kod = 'HIZMET-TEMPER-DIS'
  AND stok.kategori = 'yan_malzeme'
  AND lower(replace(stok.birim, '²', '2')) = 'm2'
  AND COALESCE(stok.mevcut_miktar, 0) = 0
ON CONFLICT (stok_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.maliyet_hizmet_katalogu_durumu_internal_v4()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH satirlar AS (
    SELECT
      sablon.kod,
      sablon.ad,
      sablon.hizmet_turu,
      stok_row.id AS stok_id,
      stok_row.id IS NOT NULL AS mevcut,
      stok_row.id IS NOT NULL
        AND stok_row.ad IS NOT DISTINCT FROM sablon.ad
        AND stok_row.kategori IS NOT DISTINCT FROM sablon.kategori
        AND stok_row.grup IS NOT DISTINCT FROM sablon.grup
        AND lower(replace(stok_row.birim, '²', '2'))
          = lower(replace(sablon.birim, '²', '2'))
        AND stok_row.ticari_kapsam IS NOT DISTINCT FROM sablon.ticari_kapsam
        AND stok_row.aktif
        AND COALESCE(stok_row.mevcut_miktar, 0) = 0
        AND hizmet.stok_id IS NOT NULL
        AND NOT hizmet.envanter_takipli AS uyumlu
    FROM public.maliyet_hizmet_stok_sablonu sablon
    LEFT JOIN public.stok stok_row
      ON lower(btrim(stok_row.kod)) = lower(btrim(sablon.kod))
    LEFT JOIN public.maliyet_hizmet_stoklari hizmet
      ON hizmet.stok_id = stok_row.id
     AND hizmet.hizmet_turu = sablon.hizmet_turu
  )
  SELECT jsonb_build_object(
    'toplam', count(*)::integer,
    'mevcut', count(*) FILTER (WHERE mevcut)::integer,
    'uyumlu', count(*) FILTER (WHERE uyumlu)::integer,
    'cakisan', count(*) FILTER (WHERE mevcut AND NOT uyumlu)::integer,
    'eksik', count(*) FILTER (WHERE NOT mevcut)::integer,
    'kurulu', bool_and(uyumlu),
    'hizmetler', COALESCE(jsonb_agg(jsonb_build_object(
      'kod', kod,
      'ad', ad,
      'hizmet_turu', hizmet_turu,
      'stok_id', stok_id,
      'mevcut', mevcut,
      'uyumlu', uyumlu
    ) ORDER BY kod), '[]'::jsonb)
  )
  FROM satirlar
$$;

-- 105'in fiziksel katalog durum sayilari aynen korunur. Yalniz genel
-- "kurulu" bayragi, ayri hizmet sablonu da eksiksiz ve uyumluysa true olur.
CREATE OR REPLACE FUNCTION public.stok_baslangic_katalogu_durumu()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fiziksel jsonb;
  v_hizmet jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'INVENTORY_READ_YETKISI_GEREKLI';
  END IF;

  v_fiziksel := public.stok_baslangic_katalogu_durumu_internal();
  v_hizmet := public.maliyet_hizmet_katalogu_durumu_internal_v4();

  RETURN v_fiziksel || jsonb_build_object(
    'kurulu',
      (v_fiziksel ->> 'kurulu')::boolean
      AND COALESCE((v_hizmet ->> 'kurulu')::boolean, false),
    'hizmet_katalog_surumu', '108',
    'hizmet_toplam', (v_hizmet ->> 'toplam')::integer,
    'hizmet_mevcut', (v_hizmet ->> 'mevcut')::integer,
    'hizmet_uyumlu', (v_hizmet ->> 'uyumlu')::integer,
    'hizmet_cakisan', (v_hizmet ->> 'cakisan')::integer,
    'hizmet_eksik', (v_hizmet ->> 'eksik')::integer,
    'hizmetler', v_hizmet -> 'hizmetler'
  );
END;
$$;

-- 105 kurucusunu fiziksel katalog icin dahili adla koru. Ayni mevcut buton
-- artik once fiziksel katalogu, sonra ayri hizmet katalogunu kurar.
ALTER FUNCTION public.stok_baslangic_katalogunu_kur(text)
  RENAME TO stok_baslangic_katalogunu_kur_temel_105;

REVOKE ALL ON FUNCTION public.stok_baslangic_katalogunu_kur_temel_105(text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stok_baslangic_katalogunu_kur(
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payload jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_fiziksel jsonb;
  v_hizmet_onceki jsonb;
  v_hizmet_sonra jsonb;
  v_hizmet_eklenen integer := 0;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'create') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'INVENTORY_CREATE_YETKISI_GEREKLI';
  END IF;

  SELECT jsonb_build_object(
    'fiziksel_katalog_surumu', '105',
    'fiziksel_sablon_satir_sayisi',
      (SELECT count(*) FROM public.stok_baslangic_katalogu_sablonu),
    'hizmet_katalog_surumu', '108',
    'hizmet_sablon_satir_sayisi',
      (SELECT count(*) FROM public.maliyet_hizmet_stok_sablonu)
  )
  INTO v_payload;

  v_idempotency := public.ticari_idempotency_baslat(
    'stok_baslangic_katalogunu_kur_v108',
    p_idempotency_key,
    v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('stok_baslangic_katalogu:105+108', 0)
  );

  v_fiziksel := public.stok_baslangic_katalogunu_kur_temel_105(
    left(p_idempotency_key, 140) || ':fiziksel-105'
  );
  v_hizmet_onceki := public.maliyet_hizmet_katalogu_durumu_internal_v4();

  PERFORM set_config(
    'app.audit_context',
    jsonb_build_object(
      'rpc_adi', 'stok_baslangic_katalogunu_kur',
      'idempotency_key', p_idempotency_key,
      'gerekce', 'Baslangic maliyet hizmet katalogu kurulumu',
      'kaynak', 'stok_katalogu'
    )::text,
    true
  );

  WITH eklenen AS (
    INSERT INTO public.stok (
      kod,
      ad,
      kategori,
      grup,
      birim,
      birim_fiyat,
      mevcut_miktar,
      aktif,
      ticari_kapsam
    )
    SELECT
      sablon.kod,
      sablon.ad,
      sablon.kategori,
      sablon.grup,
      sablon.birim,
      NULL,
      0,
      sablon.aktif,
      sablon.ticari_kapsam
    FROM public.maliyet_hizmet_stok_sablonu sablon
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.stok stok_row
      WHERE lower(btrim(stok_row.kod)) = lower(btrim(sablon.kod))
    )
    RETURNING id
  )
  SELECT count(*)::integer
  INTO v_hizmet_eklenen
  FROM eklenen;

  v_hizmet_sonra := public.maliyet_hizmet_katalogu_durumu_internal_v4();
  v_yanit := v_fiziksel || jsonb_build_object(
    'kurulu',
      (v_fiziksel ->> 'kurulu')::boolean
      AND COALESCE((v_hizmet_sonra ->> 'kurulu')::boolean, false),
    'hizmet_katalog_surumu', '108',
    'hizmet_toplam', (v_hizmet_sonra ->> 'toplam')::integer,
    'hizmet_mevcut',
      COALESCE((v_hizmet_onceki ->> 'mevcut')::integer, 0),
    'hizmet_eklenen', v_hizmet_eklenen,
    'hizmet_eksik', (v_hizmet_sonra ->> 'eksik')::integer,
    'hizmet_cakisan', (v_hizmet_sonra ->> 'cakisan')::integer,
    'hizmetler', v_hizmet_sonra -> 'hizmetler'
  );

  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.maliyet_hizmet_stogu_envanter_guard_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.maliyet_hizmet_stoklari hizmet
    WHERE hizmet.stok_id = NEW.stok_id
      AND NOT hizmet.envanter_takipli
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MALIYET_HIZMET_STOGUNDA_ENVANTER_HAREKETI_YASAK',
      DETAIL = 'Hizmet karti yalniz maliyet fiyati icindir; miktar veya stok hareketi tutulmaz.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER maliyet_hizmet_stogu_envanter_guard_v4
  BEFORE INSERT ON public.stok_hareketleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_hizmet_stogu_envanter_guard_v4();

-- ---------------------------------------------------------------------------
-- Tarihceli ve birbirini dislayan temper maliyet modu
-- ---------------------------------------------------------------------------

CREATE TABLE public.temper_maliyet_modu_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mod text NOT NULL CHECK (mod IN ('dis_hizmet', 'ic_uretim')),
  dis_hizmet_stok_id uuid REFERENCES public.stok(id) ON DELETE RESTRICT,
  gecerlilik_donemi daterange NOT NULL,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  gerekce text NOT NULL CHECK (length(btrim(gerekce)) >= 5),
  idempotency_id uuid REFERENCES public.islem_idempotency(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (mod = 'dis_hizmet' AND dis_hizmet_stok_id IS NOT NULL)
    OR
    (mod = 'ic_uretim' AND dis_hizmet_stok_id IS NULL)
  ),
  CHECK (
    NOT isempty(gecerlilik_donemi)
    AND lower_inc(gecerlilik_donemi)
    AND NOT upper_inc(gecerlilik_donemi)
  )
);

ALTER TABLE public.temper_maliyet_modu_surmleri
  ADD CONSTRAINT temper_maliyet_modu_donem_cakismasi
  EXCLUDE USING gist (gecerlilik_donemi WITH &&);

CREATE UNIQUE INDEX temper_maliyet_modu_idempotency_idx
  ON public.temper_maliyet_modu_surmleri(idempotency_id)
  WHERE idempotency_id IS NOT NULL;

CREATE INDEX temper_maliyet_modu_tarih_idx
  ON public.temper_maliyet_modu_surmleri(lower(gecerlilik_donemi) DESC);

CREATE TABLE public.temper_ic_uretim_maliyet_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mod_surumu_id uuid NOT NULL
    REFERENCES public.temper_maliyet_modu_surmleri(id) ON DELETE RESTRICT,
  sira_no integer NOT NULL CHECK (sira_no > 0),
  bilesen_turu text NOT NULL
    CHECK (bilesen_turu IN ('amortisman', 'enerji', 'iscilik')),
  aciklama text NOT NULL CHECK (length(btrim(aciklama)) >= 2),
  tuketim_birimi text NOT NULL CHECK (
    nullif(btrim(tuketim_birimi), '') IS NOT NULL
    AND length(tuketim_birimi) <= 40
  ),
  m2_basina_tuketim numeric(20,10) NOT NULL CHECK (m2_basina_tuketim > 0),
  birim_maliyet_try numeric(20,8) NOT NULL CHECK (birim_maliyet_try >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mod_surumu_id, sira_no),
  UNIQUE (mod_surumu_id, bilesen_turu)
);

COMMENT ON TABLE public.temper_maliyet_modu_surmleri IS
  'Temper maliyetinin sorgu tarihinde yalniz dis hizmet veya yalniz ic uretim olarak cozulmesini saglayan append-only surumler.';
COMMENT ON TABLE public.temper_ic_uretim_maliyet_kalemleri IS
  'Ic temper hattinin m2 basina amortisman, enerji ve iscilik tuketim/rayic snapshotlari.';

-- ---------------------------------------------------------------------------
-- Recetede stok bilesenlerinden ayri, cami ikinci kez maliyetlemeyen islemler
-- ---------------------------------------------------------------------------

CREATE TABLE public.stok_urun_maliyet_recete_islemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recete_surumu_id uuid NOT NULL
    REFERENCES public.stok_urun_maliyet_recete_surmleri(id) ON DELETE RESTRICT,
  sira_no integer NOT NULL CHECK (sira_no > 0),
  islem_turu text NOT NULL CHECK (islem_turu IN ('temper')),
  tuketim_tipi text NOT NULL DEFAULT 'alan'
    CHECK (tuketim_tipi = 'alan'),
  hedef_cam_sira_nolari integer[] NOT NULL,
  pane_sayisi integer GENERATED ALWAYS AS (
    cardinality(hedef_cam_sira_nolari)
  ) STORED,
  alan_katsayisi numeric(20,10) NOT NULL DEFAULT 1
    CHECK (alan_katsayisi > 0),
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recete_surumu_id, sira_no),
  CHECK (cardinality(hedef_cam_sira_nolari) > 0)
);

CREATE INDEX urun_maliyet_recete_islem_recete_idx
  ON public.stok_urun_maliyet_recete_islemleri(recete_surumu_id, sira_no);

COMMENT ON TABLE public.stok_urun_maliyet_recete_islemleri IS
  'Acik recetede hangi cam siralarina temper gibi bir islem uygulandigini gosterir; ham cam stok maliyetini tekrar etmez.';

CREATE OR REPLACE FUNCTION public.urun_maliyet_recete_islemini_dogrula_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cam_sayisi integer;
  v_hedef integer;
BEGIN
  SELECT count(*)::integer
  INTO v_cam_sayisi
  FROM public.stok_urun_maliyet_recete_kalemleri kalem
  WHERE kalem.recete_surumu_id = NEW.recete_surumu_id
    AND kalem.rol = 'cam';

  IF v_cam_sayisi = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_ISLEMI_ICIN_RECETEDE_CAM_GEREKLI';
  END IF;

  IF (
    SELECT count(*) <> count(DISTINCT hedef)
    FROM unnest(NEW.hedef_cam_sira_nolari) AS hedef
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_HEDEF_CAM_SIRASI_TEKRARLI';
  END IF;

  FOREACH v_hedef IN ARRAY NEW.hedef_cam_sira_nolari LOOP
    IF v_hedef <= 0 OR v_hedef > v_cam_sayisi THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TEMPER_HEDEF_CAM_SIRASI_GECERSIZ',
        DETAIL = format('Recetede %s cam vardir; hedef sira %s.', v_cam_sayisi, v_hedef);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER urun_maliyet_recete_islem_guard_v4
  BEFORE INSERT OR UPDATE ON public.stok_urun_maliyet_recete_islemleri
  FOR EACH ROW EXECUTE FUNCTION public.urun_maliyet_recete_islemini_dogrula_v4();

-- ---------------------------------------------------------------------------
-- Dis hizmet fiyati: genel fallback veya urun bazli snapshot secimi
-- ---------------------------------------------------------------------------

CREATE TABLE public.temper_dis_hizmet_fiyat_secim_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mod_surumu_id uuid NOT NULL
    REFERENCES public.temper_maliyet_modu_surmleri(id) ON DELETE RESTRICT,
  urun_stok_id uuid REFERENCES public.stok(id) ON DELETE RESTRICT,
  hizmet_stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  fiyat_id uuid NOT NULL REFERENCES public.stok_alis_fiyatlari(id) ON DELETE RESTRICT,
  gecerlilik_donemi tstzrange NOT NULL,
  gerekce text NOT NULL CHECK (length(btrim(gerekce)) >= 5),
  idempotency_id uuid REFERENCES public.islem_idempotency(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    NOT isempty(gecerlilik_donemi)
    AND lower_inc(gecerlilik_donemi)
    AND NOT upper_inc(gecerlilik_donemi)
  )
);

ALTER TABLE public.temper_dis_hizmet_fiyat_secim_surmleri
  ADD CONSTRAINT temper_dis_hizmet_genel_secim_cakismasi
  EXCLUDE USING gist (
    mod_surumu_id WITH =,
    hizmet_stok_id WITH =,
    gecerlilik_donemi WITH &&
  )
  WHERE (urun_stok_id IS NULL);

ALTER TABLE public.temper_dis_hizmet_fiyat_secim_surmleri
  ADD CONSTRAINT temper_dis_hizmet_urun_secim_cakismasi
  EXCLUDE USING gist (
    mod_surumu_id WITH =,
    urun_stok_id WITH =,
    hizmet_stok_id WITH =,
    gecerlilik_donemi WITH &&
  )
  WHERE (urun_stok_id IS NOT NULL);

CREATE INDEX temper_dis_hizmet_fiyat_secim_arama_idx
  ON public.temper_dis_hizmet_fiyat_secim_surmleri (
    mod_surumu_id,
    urun_stok_id,
    hizmet_stok_id,
    lower(gecerlilik_donemi) DESC
  );

COMMENT ON TABLE public.temper_dis_hizmet_fiyat_secim_surmleri IS
  'Belirli bir dis hizmet mod surumunde urun ozel secimin genel secimi ezdigi, kesin fiyat_id tutan tarihsel snapshotlar.';

-- ---------------------------------------------------------------------------
-- Butunluk ve append-only korumalari
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.temper_maliyet_modunu_dogrula_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Eski mod snapshotinin yalniz ust sinirini kapatmak, gecmiste kullanilan
  -- hizmet kartinin bugun de aktif olmasini gerektirmez. Saf kisaltmayi
  -- semantic yeniden dogrulamadan gecir; append-only trigger ayni upper-only
  -- degisikligini bagimsiz olarak sinirlar.
  IF TG_OP = 'UPDATE'
     AND current_setting(
       'app.maliyet_v3_surum_kapatma',
       true
     ) = 'true'
     AND (to_jsonb(OLD) - 'gecerlilik_donemi')
       IS NOT DISTINCT FROM (to_jsonb(NEW) - 'gecerlilik_donemi')
     AND lower(OLD.gecerlilik_donemi)
       IS NOT DISTINCT FROM lower(NEW.gecerlilik_donemi)
     AND NOT upper_inf(NEW.gecerlilik_donemi)
     AND (
       upper_inf(OLD.gecerlilik_donemi)
       OR upper(NEW.gecerlilik_donemi) < upper(OLD.gecerlilik_donemi)
     )
     AND upper(NEW.gecerlilik_donemi) > lower(NEW.gecerlilik_donemi) THEN
    RETURN NEW;
  END IF;

  IF NEW.mod = 'dis_hizmet' AND NOT EXISTS (
    SELECT 1
    FROM public.maliyet_hizmet_stoklari hizmet
    JOIN public.stok stok ON stok.id = hizmet.stok_id
    WHERE hizmet.stok_id = NEW.dis_hizmet_stok_id
      AND hizmet.hizmet_turu = 'temper_dis_hizmet'
      AND NOT hizmet.envanter_takipli
      AND stok.aktif
      AND lower(replace(stok.birim, '²', '2')) = 'm2'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_DIS_HIZMET_MALIYET_STOGU_GECERSIZ';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER temper_maliyet_modu_guard_v4
  BEFORE INSERT OR UPDATE ON public.temper_maliyet_modu_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.temper_maliyet_modunu_dogrula_v4();

CREATE OR REPLACE FUNCTION public.temper_ic_uretim_kalem_tamligini_dogrula_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_turler text[];
BEGIN
  IF NEW.mod <> 'ic_uretim' THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(kalem.bilesen_turu ORDER BY kalem.bilesen_turu)
  INTO v_turler
  FROM public.temper_ic_uretim_maliyet_kalemleri kalem
  WHERE kalem.mod_surumu_id = NEW.id;

  IF v_turler IS DISTINCT FROM ARRAY['amortisman', 'enerji', 'iscilik']::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_IC_URETIM_UC_TEMEL_KALEM_GEREKLI',
      DETAIL = 'Amortisman, enerji ve iscilik kalemleri ayri ayri zorunludur.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER temper_ic_uretim_kalem_tamligi_v4
  AFTER INSERT ON public.temper_maliyet_modu_surmleri
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.temper_ic_uretim_kalem_tamligini_dogrula_v4();

CREATE OR REPLACE FUNCTION public.temper_dis_hizmet_secimini_dogrula_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fiyat public.stok_alis_fiyatlari%ROWTYPE;
  v_mod public.temper_maliyet_modu_surmleri%ROWTYPE;
  v_baslangic_tarihi date;
  v_bitis_tarihi date;
BEGIN
  -- Bir secimin yalniz ust sinirini kapatmak gecmisteki urun/recete
  -- uygunlugunu yeniden yorumlamaz. Ornegin secim acildiktan sonra urunde yeni
  -- bir recete surumu baslamis olabilir; [A,sonsuz) snapshotini [A,D) yapmak
  -- icin tek bir recetenin A-D araligini kaplamasi gerekmez. Semantik alanlarin
  -- ayni ve islemin saf ust-sinir kisaltmasi oldugunu burada da dogrula;
  -- append-only trigger ayni kurali bagimsiz olarak uygular.
  IF TG_OP = 'UPDATE'
     AND current_setting(
       'app.maliyet_v3_surum_kapatma',
       true
     ) = 'true'
     AND (to_jsonb(OLD) - 'gecerlilik_donemi')
       IS NOT DISTINCT FROM (to_jsonb(NEW) - 'gecerlilik_donemi')
     AND lower(OLD.gecerlilik_donemi)
       IS NOT DISTINCT FROM lower(NEW.gecerlilik_donemi)
     AND NOT upper_inf(NEW.gecerlilik_donemi)
     AND (
       upper_inf(OLD.gecerlilik_donemi)
       OR upper(NEW.gecerlilik_donemi) < upper(OLD.gecerlilik_donemi)
     )
     AND upper(NEW.gecerlilik_donemi) > lower(NEW.gecerlilik_donemi) THEN
    RETURN NEW;
  END IF;

  IF NEW.urun_stok_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.stok urun
    WHERE urun.id = NEW.urun_stok_id
      AND urun.aktif
      AND urun.kategori = 'cam'
      AND urun.katman_yapisi IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_FIYAT_SECIMI_ICIN_AKTIF_CAM_URUNU_GEREKLI';
  END IF;

  -- Urun override'i yalniz secim doneminin tamaminda acik temper islemi olan
  -- bir receteye uygulanabilir. Bu koruma 07122 gibi katmanli fakat temper
  -- edilmeyen urunlerin UI filtresi atlanarak yanlis fiyatlanmasini engeller.
  IF NEW.urun_stok_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.stok_urun_maliyet_recete_surmleri recete
    JOIN public.stok_urun_maliyet_recete_islemleri islem
      ON islem.recete_surumu_id = recete.id
     AND islem.islem_turu = 'temper'
    WHERE recete.urun_stok_id = NEW.urun_stok_id
      AND tstzrange(
        CASE
          WHEN lower_inf(recete.gecerlilik_donemi) THEN NULL
          ELSE lower(recete.gecerlilik_donemi)::timestamp
            AT TIME ZONE 'Europe/Istanbul'
        END,
        CASE
          WHEN upper_inf(recete.gecerlilik_donemi) THEN NULL
          ELSE upper(recete.gecerlilik_donemi)::timestamp
            AT TIME ZONE 'Europe/Istanbul'
        END,
        '[)'
      ) @> NEW.gecerlilik_donemi
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_URUN_RECETESI_SECIM_DONEMINI_KAPSAMIYOR',
      DETAIL = 'Urun ozel temper fiyati icin secim doneminin tamaminda temper islemi iceren aktif recete gerekir.';
  END IF;

  v_baslangic_tarihi :=
    (lower(NEW.gecerlilik_donemi) AT TIME ZONE 'Europe/Istanbul')::date;
  v_bitis_tarihi := CASE
    WHEN upper_inf(NEW.gecerlilik_donemi) THEN NULL
    ELSE (upper(NEW.gecerlilik_donemi) AT TIME ZONE 'Europe/Istanbul')::date
  END;

  SELECT *
  INTO v_mod
  FROM public.temper_maliyet_modu_surmleri mod_surumu
  WHERE mod_surumu.id = NEW.mod_surumu_id
    AND mod_surumu.mod = 'dis_hizmet'
    AND mod_surumu.dis_hizmet_stok_id = NEW.hizmet_stok_id
    AND mod_surumu.gecerlilik_donemi @> v_baslangic_tarihi
  LIMIT 1;

  IF NOT FOUND
     OR (
       v_bitis_tarihi IS NULL
       AND NOT upper_inf(v_mod.gecerlilik_donemi)
     )
     OR (
       v_bitis_tarihi IS NOT NULL
       AND NOT upper_inf(v_mod.gecerlilik_donemi)
       AND v_bitis_tarihi > upper(v_mod.gecerlilik_donemi)
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_DIS_HIZMET_MODU_SECIM_DONEMINI_KAPSAMIYOR';
  END IF;

  SELECT *
  INTO v_fiyat
  FROM public.stok_alis_fiyatlari fiyat
  WHERE fiyat.id = NEW.fiyat_id
    AND fiyat.stok_id = NEW.hizmet_stok_id
    AND fiyat.durum IN ('dogrulanmis', 'duzeltme')
    AND fiyat.kaynak_turu <> 'legacy_unverified'
    AND fiyat.para_birimi = 'TRY'
    AND lower(replace(fiyat.fiyat_birimi, '²', '2')) = 'm2'
    AND lower(replace(fiyat.stok_ana_birimi, '²', '2')) = 'm2';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_DIS_HIZMET_TRY_M2_FIYATI_GEREKLI';
  END IF;

  IF NOT (v_fiyat.teklif_gecerlilik_donemi @> v_baslangic_tarihi)
     OR (
       v_bitis_tarihi IS NULL
       AND NOT upper_inf(v_fiyat.teklif_gecerlilik_donemi)
     )
     OR (
       v_bitis_tarihi IS NOT NULL
       AND NOT upper_inf(v_fiyat.teklif_gecerlilik_donemi)
       AND v_bitis_tarihi > upper(v_fiyat.teklif_gecerlilik_donemi)
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_DIS_HIZMET_FIYATI_SECIM_DONEMINI_KAPSAMIYOR';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER temper_dis_hizmet_secim_guard_v4
  BEFORE INSERT OR UPDATE ON public.temper_dis_hizmet_fiyat_secim_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.temper_dis_hizmet_secimini_dogrula_v4();

CREATE TRIGGER temper_maliyet_modu_surumu_immutable_v4
  BEFORE UPDATE OR DELETE ON public.temper_maliyet_modu_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_v3_surumu_degisimini_koru();

CREATE TRIGGER temper_dis_hizmet_secimi_immutable_v4
  BEFORE UPDATE OR DELETE ON public.temper_dis_hizmet_fiyat_secim_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_v3_surumu_degisimini_koru();

CREATE TRIGGER temper_ic_uretim_kalemi_immutable_v4
  BEFORE UPDATE OR DELETE ON public.temper_ic_uretim_maliyet_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_v3_append_only_koru();

CREATE TRIGGER urun_maliyet_recete_islemi_immutable_v4
  BEFORE UPDATE OR DELETE ON public.stok_urun_maliyet_recete_islemleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_v3_append_only_koru();

CREATE TRIGGER maliyet_hizmet_stogu_immutable_v4
  BEFORE UPDATE OR DELETE ON public.maliyet_hizmet_stoklari
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_v3_append_only_koru();

-- ---------------------------------------------------------------------------
-- Mod ve dis hizmet fiyat secimi yazma RPC'leri
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.temper_maliyet_modu_kaydet_v4(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_mod text := lower(COALESCE(NULLIF(p_payload ->> 'mod', ''), ''));
  v_baslangic date := COALESCE(
    NULLIF(p_payload ->> 'baslangic', '')::date,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_baslangic_an timestamptz;
  v_istenen_bitis date := NULLIF(p_payload ->> 'bitis', '')::date;
  v_sonraki_baslangic date;
  v_bitis date;
  v_gerekce text := btrim(COALESCE(p_payload ->> 'gerekce', ''));
  v_hizmet_stok_id uuid := NULLIF(p_payload ->> 'dis_hizmet_stok_id', '')::uuid;
  v_mevcut public.temper_maliyet_modu_surmleri%ROWTYPE;
  v_mod_surumu_id uuid;
  v_revision integer;
  v_kalemler jsonb := '[]'::jsonb;
  v_yanit jsonb;
BEGIN
  v_baslangic_an :=
    v_baslangic::timestamp AT TIME ZONE 'Europe/Istanbul';

  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);

  IF v_mod NOT IN ('dis_hizmet', 'ic_uretim')
     OR length(v_gerekce) < 5
     OR (v_istenen_bitis IS NOT NULL AND v_istenen_bitis <= v_baslangic) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEMPER_MALIYET_MODU_BILGILERI_GECERSIZ';
  END IF;

  IF v_mod = 'dis_hizmet' THEN
    IF p_payload ? 'ic_uretim_kalemleri'
       AND jsonb_array_length(COALESCE(p_payload -> 'ic_uretim_kalemleri', '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'DIS_HIZMET_MODUNDA_IC_URETIM_KALEMI_OLAMAZ';
    END IF;

    IF v_hizmet_stok_id IS NULL THEN
      SELECT hizmet.stok_id
      INTO v_hizmet_stok_id
      FROM public.maliyet_hizmet_stoklari hizmet
      JOIN public.stok stok ON stok.id = hizmet.stok_id
      WHERE hizmet.hizmet_turu = 'temper_dis_hizmet'
        AND stok.aktif
      LIMIT 1;
    END IF;

    IF v_hizmet_stok_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'TEMPER_DIS_HIZMET_STOGU_KURULMAMIS',
        DETAIL = 'Baslangic stok katalogu butonuyla HIZMET-TEMPER-DIS kartini olusturun.';
    END IF;
  ELSE
    v_hizmet_stok_id := NULL;

    IF jsonb_typeof(p_payload -> 'ic_uretim_kalemleri') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload -> 'ic_uretim_kalemleri') <> 3
       OR (
         SELECT count(DISTINCT value ->> 'bilesen_turu')
         FROM jsonb_array_elements(p_payload -> 'ic_uretim_kalemleri')
       ) <> 3
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_payload -> 'ic_uretim_kalemleri') kalem(value)
         WHERE lower(COALESCE(value ->> 'bilesen_turu', ''))
                 NOT IN ('amortisman', 'enerji', 'iscilik')
            OR COALESCE((value ->> 'sira_no')::integer, 0) <= 0
            OR length(btrim(COALESCE(value ->> 'aciklama', ''))) < 2
            OR length(btrim(COALESCE(value ->> 'tuketim_birimi', ''))) = 0
            OR COALESCE((value ->> 'm2_basina_tuketim')::numeric, 0) <= 0
            OR COALESCE((value ->> 'birim_maliyet_try')::numeric, -1) < 0
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TEMPER_IC_URETIM_UC_TEMEL_KALEM_GEREKLI',
        DETAIL = 'Amortisman, enerji ve iscilik kalemleri gecerli degerlerle ayri ayri zorunludur.';
    END IF;
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'temper_maliyet_modu_kaydet_v4',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'temper_maliyet_modu_kaydet_v4',
    p_idempotency_key,
    v_gerekce,
    COALESCE(p_payload ->> 'kaynak_ekran', 'temper_maliyet_v4')
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('temper_maliyet_modu_v4', 0)
  );

  SELECT *
  INTO v_mevcut
  FROM public.temper_maliyet_modu_surmleri mod_surumu
  WHERE mod_surumu.gecerlilik_donemi @> v_baslangic
  FOR UPDATE;

  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) = v_baslangic THEN
      RAISE EXCEPTION USING
        ERRCODE = '23P01',
        MESSAGE = 'AYNI_BASLANGICTA_TEMPER_MALIYET_MODU_VAR';
    END IF;

    IF v_mevcut.mod = 'dis_hizmet' AND EXISTS (
      SELECT 1
      FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
      WHERE secim.mod_surumu_id = v_mevcut.id
        AND lower(secim.gecerlilik_donemi) >= v_baslangic_an
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'TEMPER_MOD_GECISINDEN_SONRA_PLANLI_FIYAT_SECIMI_VAR',
        DETAIL = 'Mod gecis tarihinden sonra baslayan eski moda bagli fiyat secimleri varken gecis yapilamaz.';
    END IF;

    PERFORM set_config('app.maliyet_v3_surum_kapatma', 'true', true);

    -- Onceki dis hizmet moduna ait ve gecis aninda acik olan genel/urun
    -- secimlerini ayni sinirda kapat. Secimler ayrica mod_surumu_id ile
    -- kapsamlandigi icin daha sonra dis hizmete donuldugunde eski snapshotlar
    -- yeni donemin secimlerini bloklamaz.
    IF v_mevcut.mod = 'dis_hizmet' THEN
      UPDATE public.temper_dis_hizmet_fiyat_secim_surmleri
      SET gecerlilik_donemi = tstzrange(
        lower(gecerlilik_donemi),
        v_baslangic_an,
        '[)'
      )
      WHERE mod_surumu_id = v_mevcut.id
        AND lower(gecerlilik_donemi) < v_baslangic_an
        AND gecerlilik_donemi @> v_baslangic_an;
    END IF;

    UPDATE public.temper_maliyet_modu_surmleri
    SET gecerlilik_donemi =
      daterange(lower(gecerlilik_donemi), v_baslangic, '[)')
    WHERE id = v_mevcut.id;
  END IF;

  SELECT min(lower(gecerlilik_donemi))
  INTO v_sonraki_baslangic
  FROM public.temper_maliyet_modu_surmleri
  WHERE lower(gecerlilik_donemi) > v_baslangic;

  v_bitis := CASE
    WHEN v_istenen_bitis IS NULL THEN v_sonraki_baslangic
    WHEN v_sonraki_baslangic IS NULL THEN v_istenen_bitis
    ELSE LEAST(v_istenen_bitis, v_sonraki_baslangic)
  END;

  v_revision := COALESCE((
    SELECT max(revision_no) + 1
    FROM public.temper_maliyet_modu_surmleri
  ), 1);

  INSERT INTO public.temper_maliyet_modu_surmleri (
    mod,
    dis_hizmet_stok_id,
    gecerlilik_donemi,
    revision_no,
    gerekce,
    idempotency_id,
    olusturan_kullanici_id
  )
  VALUES (
    v_mod,
    v_hizmet_stok_id,
    daterange(v_baslangic, v_bitis, '[)'),
    v_revision,
    v_gerekce,
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_mod_surumu_id;

  IF v_mod = 'ic_uretim' THEN
    INSERT INTO public.temper_ic_uretim_maliyet_kalemleri (
      mod_surumu_id,
      sira_no,
      bilesen_turu,
      aciklama,
      tuketim_birimi,
      m2_basina_tuketim,
      birim_maliyet_try
    )
    SELECT
      v_mod_surumu_id,
      kalem.sira_no,
      lower(kalem.bilesen_turu),
      btrim(kalem.aciklama),
      btrim(kalem.tuketim_birimi),
      kalem.m2_basina_tuketim,
      kalem.birim_maliyet_try
    FROM jsonb_to_recordset(p_payload -> 'ic_uretim_kalemleri') AS kalem(
      sira_no integer,
      bilesen_turu text,
      aciklama text,
      tuketim_birimi text,
      m2_basina_tuketim numeric,
      birim_maliyet_try numeric
    )
    ORDER BY kalem.sira_no;

    SET CONSTRAINTS temper_ic_uretim_kalem_tamligi_v4 IMMEDIATE;
    SET CONSTRAINTS temper_ic_uretim_kalem_tamligi_v4 DEFERRED;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'kalem_id', kalem.id,
    'sira_no', kalem.sira_no,
    'bilesen_turu', kalem.bilesen_turu,
    'aciklama', kalem.aciklama,
    'tuketim_birimi', kalem.tuketim_birimi,
    'm2_basina_tuketim', kalem.m2_basina_tuketim,
    'birim_maliyet_try', kalem.birim_maliyet_try
  ) ORDER BY kalem.sira_no), '[]'::jsonb)
  INTO v_kalemler
  FROM public.temper_ic_uretim_maliyet_kalemleri kalem
  WHERE kalem.mod_surumu_id = v_mod_surumu_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'mod_surumu_id', v_mod_surumu_id,
    'mod', v_mod,
    'revision_no', v_revision,
    'dis_hizmet_stok_id', v_hizmet_stok_id,
    'gecerlilik_baslangici', v_baslangic,
    'gecerlilik_bitisi', v_bitis,
    'gerekce', v_gerekce,
    'ic_uretim_kalemleri', v_kalemler
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(
  p_urun_stok_id uuid,
  p_hizmet_stok_id uuid,
  p_fiyat_id uuid,
  p_baslangic timestamptz,
  p_bitis timestamptz,
  p_gerekce text,
  p_idempotency_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mod public.temper_maliyet_modu_surmleri%ROWTYPE;
  v_fiyat public.stok_alis_fiyatlari%ROWTYPE;
  v_mevcut public.temper_dis_hizmet_fiyat_secim_surmleri%ROWTYPE;
  v_sonraki_baslangic timestamptz;
  v_mod_bitis timestamptz;
  v_teklif_bitis timestamptz;
  v_bitis timestamptz := p_bitis;
  v_secim_id uuid;
BEGIN
  IF p_baslangic IS NULL
     OR length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEMPER_DIS_HIZMET_FIYAT_SECIMI_GECERSIZ';
  END IF;

  SELECT *
  INTO v_mod
  FROM public.temper_maliyet_modu_surmleri mod_surumu
  WHERE mod_surumu.mod = 'dis_hizmet'
    AND mod_surumu.dis_hizmet_stok_id = p_hizmet_stok_id
    AND mod_surumu.gecerlilik_donemi @>
      (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_DIS_HIZMET_MODU_AKTIF_DEGIL';
  END IF;

  SELECT *
  INTO v_fiyat
  FROM public.stok_alis_fiyatlari fiyat
  WHERE fiyat.id = p_fiyat_id
    AND fiyat.stok_id = p_hizmet_stok_id
    AND fiyat.durum IN ('dogrulanmis', 'duzeltme')
    AND fiyat.kaynak_turu <> 'legacy_unverified'
    AND fiyat.para_birimi = 'TRY'
    AND lower(replace(fiyat.fiyat_birimi, '²', '2')) = 'm2'
    AND lower(replace(fiyat.stok_ana_birimi, '²', '2')) = 'm2'
    AND (fiyat.fiyat_tarihi AT TIME ZONE 'Europe/Istanbul')::date
      <= (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date
    AND fiyat.teklif_gecerlilik_donemi @>
      (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_DIS_HIZMET_TRY_M2_FIYATI_GEREKLI';
  END IF;

  IF NOT upper_inf(v_mod.gecerlilik_donemi) THEN
    v_mod_bitis :=
      upper(v_mod.gecerlilik_donemi)::timestamp
      AT TIME ZONE 'Europe/Istanbul';
    v_bitis := CASE
      WHEN v_bitis IS NULL THEN v_mod_bitis
      ELSE LEAST(v_bitis, v_mod_bitis)
    END;
  END IF;

  IF NOT upper_inf(v_fiyat.teklif_gecerlilik_donemi) THEN
    v_teklif_bitis :=
      upper(v_fiyat.teklif_gecerlilik_donemi)::timestamp
      AT TIME ZONE 'Europe/Istanbul';
    v_bitis := CASE
      WHEN v_bitis IS NULL THEN v_teklif_bitis
      ELSE LEAST(v_bitis, v_teklif_bitis)
    END;
  END IF;

  IF v_bitis IS NOT NULL AND v_bitis <= p_baslangic THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEMPER_DIS_HIZMET_FIYAT_SECIM_DONEMI_GECERSIZ';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'temper_dis_hizmet_secim_v4:'
    || p_hizmet_stok_id::text
    || ':'
    || COALESCE(p_urun_stok_id::text, 'genel'),
    0
  ));

  SELECT *
  INTO v_mevcut
  FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
  WHERE secim.mod_surumu_id = v_mod.id
    AND secim.hizmet_stok_id = p_hizmet_stok_id
    AND secim.urun_stok_id IS NOT DISTINCT FROM p_urun_stok_id
    AND secim.gecerlilik_donemi @> p_baslangic
  FOR UPDATE;

  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) = p_baslangic THEN
      IF v_mevcut.fiyat_id = p_fiyat_id THEN
        RETURN v_mevcut.id;
      END IF;
      RAISE EXCEPTION USING
        ERRCODE = '23P01',
        MESSAGE = 'AYNI_BASLANGICTA_FARKLI_TEMPER_FIYAT_SECIMI_VAR';
    END IF;

    PERFORM set_config('app.maliyet_v3_surum_kapatma', 'true', true);
    UPDATE public.temper_dis_hizmet_fiyat_secim_surmleri
    SET gecerlilik_donemi =
      tstzrange(lower(gecerlilik_donemi), p_baslangic, '[)')
    WHERE id = v_mevcut.id;
  END IF;

  SELECT min(lower(gecerlilik_donemi))
  INTO v_sonraki_baslangic
  FROM public.temper_dis_hizmet_fiyat_secim_surmleri
  WHERE mod_surumu_id = v_mod.id
    AND hizmet_stok_id = p_hizmet_stok_id
    AND urun_stok_id IS NOT DISTINCT FROM p_urun_stok_id
    AND lower(gecerlilik_donemi) > p_baslangic;

  v_bitis := CASE
    WHEN v_bitis IS NULL THEN v_sonraki_baslangic
    WHEN v_sonraki_baslangic IS NULL THEN v_bitis
    ELSE LEAST(v_bitis, v_sonraki_baslangic)
  END;

  INSERT INTO public.temper_dis_hizmet_fiyat_secim_surmleri (
    mod_surumu_id,
    urun_stok_id,
    hizmet_stok_id,
    fiyat_id,
    gecerlilik_donemi,
    gerekce,
    idempotency_id,
    olusturan_kullanici_id
  )
  VALUES (
    v_mod.id,
    p_urun_stok_id,
    p_hizmet_stok_id,
    p_fiyat_id,
    tstzrange(p_baslangic, v_bitis, '[)'),
    btrim(p_gerekce),
    p_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_secim_id;

  RETURN v_secim_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.temper_dis_hizmet_fiyat_sec_v4(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_fiyat_id uuid := NULLIF(p_payload ->> 'fiyat_id', '')::uuid;
  v_tek_urun_id uuid := NULLIF(p_payload ->> 'urun_stok_id', '')::uuid;
  v_urun_ids uuid[];
  v_urun_id uuid;
  v_baslangic_tarihi date := COALESCE(
    (
      NULLIF(p_payload ->> 'baslangic', '')::timestamptz
        AT TIME ZONE 'Europe/Istanbul'
    )::date,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_bitis_tarihi date := (
    NULLIF(p_payload ->> 'bitis', '')::timestamptz
      AT TIME ZONE 'Europe/Istanbul'
  )::date;
  v_baslangic timestamptz;
  v_bitis timestamptz;
  v_gerekce text := btrim(COALESCE(p_payload ->> 'gerekce', ''));
  v_mod public.temper_maliyet_modu_surmleri%ROWTYPE;
  v_secim_id uuid;
  v_secilenler jsonb := '[]'::jsonb;
  v_kapsam text;
  v_yanit jsonb;
BEGIN
  -- Maliyet sorgulari tarih seviyesindedir. Secim sinirlarini Istanbul gun
  -- basina normalize ederek bugun girilen fiyat/atamanin bugun cozulmesini
  -- sagla; saat seviyesinde gorunmez bir bosluk olusturma.
  v_baslangic :=
    v_baslangic_tarihi::timestamp AT TIME ZONE 'Europe/Istanbul';
  v_bitis := CASE
    WHEN v_bitis_tarihi IS NULL THEN NULL
    ELSE v_bitis_tarihi::timestamp AT TIME ZONE 'Europe/Istanbul'
  END;

  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);

  IF v_fiyat_id IS NULL
     OR length(v_gerekce) < 5
     OR (v_bitis IS NOT NULL AND v_bitis <= v_baslangic)
     OR (
       v_tek_urun_id IS NOT NULL
       AND p_payload ? 'urun_stok_ids'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEMPER_DIS_HIZMET_FIYAT_SECIMI_GECERSIZ';
  END IF;

  IF p_payload ? 'urun_stok_ids' THEN
    IF jsonb_typeof(p_payload -> 'urun_stok_ids') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload -> 'urun_stok_ids') = 0
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(
           p_payload -> 'urun_stok_ids'
         ) eleman(value)
         WHERE jsonb_typeof(eleman.value) IS DISTINCT FROM 'string'
            OR nullif(btrim(eleman.value #>> '{}'), '') IS NULL
            OR public.ticari_guvenli_uuid(
              eleman.value #>> '{}'
            ) IS NULL
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TEMPER_URUN_LISTESI_GECERSIZ';
    END IF;

    SELECT array_agg(DISTINCT value::uuid ORDER BY value::uuid)
    INTO v_urun_ids
    FROM jsonb_array_elements_text(p_payload -> 'urun_stok_ids');

    IF v_urun_ids IS NULL
       OR cardinality(v_urun_ids) = 0
       OR array_position(v_urun_ids, NULL::uuid) IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TEMPER_URUN_LISTESI_GECERSIZ';
    END IF;

    v_kapsam := 'urun_listesi';
  ELSIF v_tek_urun_id IS NOT NULL THEN
    v_urun_ids := ARRAY[v_tek_urun_id];
    v_kapsam := 'urun';
  ELSE
    v_kapsam := 'genel';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'temper_dis_hizmet_fiyat_sec_v4',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  -- Mod gecisi ve fiyat secimi ayni global kilitte serilestirilir; secim
  -- kapanmak uzere olan eski mod surumune yarista baglanamaz.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('temper_maliyet_modu_v4', 0)
  );

  SELECT *
  INTO v_mod
  FROM public.temper_maliyet_modu_surmleri mod_surumu
  WHERE mod_surumu.mod = 'dis_hizmet'
    AND mod_surumu.gecerlilik_donemi @>
      (v_baslangic AT TIME ZONE 'Europe/Istanbul')::date
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_DIS_HIZMET_MODU_AKTIF_DEGIL';
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'temper_dis_hizmet_fiyat_sec_v4',
    p_idempotency_key,
    v_gerekce,
    COALESCE(p_payload ->> 'kaynak_ekran', 'temper_maliyet_v4')
  );

  IF v_urun_ids IS NULL THEN
    v_secim_id := public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(
      NULL,
      v_mod.dis_hizmet_stok_id,
      v_fiyat_id,
      v_baslangic,
      v_bitis,
      v_gerekce,
      v_idempotency_id
    );
    v_secilenler := jsonb_build_array(jsonb_build_object(
      'secim_id', v_secim_id,
      'urun_stok_id', NULL,
      'kapsam', 'genel',
      'fiyat_id', v_fiyat_id
    ));
  ELSE
    FOREACH v_urun_id IN ARRAY v_urun_ids LOOP
      v_secim_id := public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(
        v_urun_id,
        v_mod.dis_hizmet_stok_id,
        v_fiyat_id,
        v_baslangic,
        v_bitis,
        v_gerekce,
        v_idempotency_id
      );
      v_secilenler := v_secilenler || jsonb_build_array(jsonb_build_object(
        'secim_id', v_secim_id,
        'urun_stok_id', v_urun_id,
        'kapsam', 'urun',
        'fiyat_id', v_fiyat_id
      ));
    END LOOP;
  END IF;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'kapsam', v_kapsam,
    'mod_surumu_id', v_mod.id,
    'hizmet_stok_id', v_mod.dis_hizmet_stok_id,
    'fiyat_id', v_fiyat_id,
    'secilen_adet', jsonb_array_length(v_secilenler),
    'secilenler', v_secilenler
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

-- ---------------------------------------------------------------------------
-- Tarihsel temper maliyeti cozumleyicisi ve izleme paneli
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.temper_maliyetini_coz_v4(
  p_urun_stok_id uuid DEFAULT NULL,
  p_tarih date DEFAULT NULL,
  p_alan_m2 numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tarih date := COALESCE(
    p_tarih,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_an timestamptz :=
    v_tarih::timestamp AT TIME ZONE 'Europe/Istanbul';
  v_mod public.temper_maliyet_modu_surmleri%ROWTYPE;
  v_dis record;
  v_kalem record;
  v_kalem_miktari numeric;
  v_kalem_toplami numeric;
  v_toplam numeric := 0;
  v_kalemler jsonb := '[]'::jsonb;
  v_hatalar jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  IF p_alan_m2 IS NULL OR p_alan_m2 <= 0 THEN
    RETURN jsonb_build_object(
      'gecerli', false,
      'urun_stok_id', p_urun_stok_id,
      'tarih', v_tarih,
      'alan_m2', p_alan_m2,
      'mod', NULL,
      'mod_surumu_id', NULL,
      'birim_maliyet_try', NULL,
      'toplam_maliyet', NULL,
      'dis_hizmet_fiyati', NULL,
      'ic_uretim_kalemleri', '[]'::jsonb,
      'hatalar', jsonb_build_array(jsonb_build_object(
        'kod', 'TEMPER_ALANI_GECERSIZ',
        'mesaj', 'Temper alani pozitif m2 olmalidir.'
      ))
    );
  END IF;

  SELECT *
  INTO v_mod
  FROM public.temper_maliyet_modu_surmleri mod_surumu
  WHERE mod_surumu.gecerlilik_donemi @> v_tarih
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'gecerli', false,
      'urun_stok_id', p_urun_stok_id,
      'tarih', v_tarih,
      'alan_m2', p_alan_m2,
      'mod', NULL,
      'mod_surumu_id', NULL,
      'birim_maliyet_try', NULL,
      'toplam_maliyet', NULL,
      'dis_hizmet_fiyati', NULL,
      'ic_uretim_kalemleri', '[]'::jsonb,
      'hatalar', jsonb_build_array(jsonb_build_object(
        'kod', 'TEMPER_MALIYET_MODU_EKSIK',
        'mesaj', 'Sorgu tarihinde dis hizmet veya ic uretim temper modu yok.'
      ))
    );
  END IF;

  IF v_mod.mod = 'dis_hizmet' THEN
    SELECT
      secim.id AS secim_id,
      CASE WHEN secim.urun_stok_id IS NULL THEN 'genel' ELSE 'urun' END
        AS secim_kapsami,
      secim.urun_stok_id,
      fiyat.id AS fiyat_id,
      fiyat.tedarikci_id,
      tedarikci.ad AS tedarikci_adi,
      fiyat.birim_fiyat,
      fiyat.para_birimi::text AS para_birimi,
      fiyat.fiyat_birimi,
      fiyat.paket_miktari,
      fiyat.donusum_katsayisi,
      round(
        fiyat.birim_fiyat
        / (COALESCE(fiyat.paket_miktari, 1) * fiyat.donusum_katsayisi),
        10
      ) AS stok_birim_fiyati,
      fiyat.vade_gunu,
      fiyat.vade_turu,
      fiyat.fiyat_varyanti,
      fiyat.marka,
      fiyat.fiyat_tarihi,
      lower(secim.gecerlilik_donemi) AS secim_baslangici,
      CASE WHEN upper_inf(secim.gecerlilik_donemi)
        THEN NULL ELSE upper(secim.gecerlilik_donemi) END AS secim_bitisi
    INTO v_dis
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
    JOIN public.stok_alis_fiyatlari fiyat ON fiyat.id = secim.fiyat_id
    JOIN public.cari tedarikci ON tedarikci.id = fiyat.tedarikci_id
    WHERE secim.mod_surumu_id = v_mod.id
      AND secim.hizmet_stok_id = v_mod.dis_hizmet_stok_id
      AND secim.gecerlilik_donemi @> v_an
      AND (
        (p_urun_stok_id IS NOT NULL AND secim.urun_stok_id = p_urun_stok_id)
        OR secim.urun_stok_id IS NULL
      )
      AND fiyat.teklif_gecerlilik_donemi @> v_tarih
      AND (fiyat.fiyat_tarihi AT TIME ZONE 'Europe/Istanbul')::date
        <= v_tarih
    ORDER BY
      CASE WHEN secim.urun_stok_id IS NULL THEN 1 ELSE 0 END,
      lower(secim.gecerlilik_donemi) DESC,
      secim.created_at DESC,
      secim.id DESC
    LIMIT 1;

    IF v_dis.secim_id IS NULL THEN
      v_hatalar := jsonb_build_array(jsonb_build_object(
        'kod', 'TEMPER_DIS_HIZMET_FIYAT_SECIMI_EKSIK',
        'urun_stok_id', p_urun_stok_id,
        'hizmet_stok_id', v_mod.dis_hizmet_stok_id,
        'mesaj', 'Urun ozel veya genel TRY/m2 temper dis hizmet fiyati secilmemis.'
      ));
    ELSE
      v_toplam := p_alan_m2 * v_dis.stok_birim_fiyati;
    END IF;

    RETURN jsonb_build_object(
      'gecerli', jsonb_array_length(v_hatalar) = 0,
      'urun_stok_id', p_urun_stok_id,
      'tarih', v_tarih,
      'alan_m2', round(p_alan_m2, 8),
      'mod', 'dis_hizmet',
      'mod_surumu_id', v_mod.id,
      'mod_revision_no', v_mod.revision_no,
      'birim_maliyet_try', CASE
        WHEN jsonb_array_length(v_hatalar) > 0 THEN NULL
        ELSE round(v_dis.stok_birim_fiyati, 8)
      END,
      'toplam_maliyet', CASE
        WHEN jsonb_array_length(v_hatalar) > 0 THEN NULL
        ELSE round(v_toplam, 6)
      END,
      'dis_hizmet_fiyati', CASE
        WHEN v_dis.secim_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'secim_id', v_dis.secim_id,
          'secim_kapsami', v_dis.secim_kapsami,
          'secim_urun_stok_id', v_dis.urun_stok_id,
          'fiyat_id', v_dis.fiyat_id,
          'hizmet_stok_id', v_mod.dis_hizmet_stok_id,
          'tedarikci_id', v_dis.tedarikci_id,
          'tedarikci_adi', v_dis.tedarikci_adi,
          'birim_fiyat', v_dis.birim_fiyat,
          'stok_birim_fiyati', v_dis.stok_birim_fiyati,
          'para_birimi', v_dis.para_birimi,
          'fiyat_birimi', v_dis.fiyat_birimi,
          'vade_gunu', v_dis.vade_gunu,
          'vade_turu', v_dis.vade_turu,
          'varyant', v_dis.fiyat_varyanti,
          'marka', v_dis.marka,
          'fiyat_tarihi', v_dis.fiyat_tarihi,
          'secim_baslangici', v_dis.secim_baslangici,
          'secim_bitisi', v_dis.secim_bitisi
        )
      END,
      'ic_uretim_kalemleri', '[]'::jsonb,
      'hatalar', v_hatalar
    );
  END IF;

  FOR v_kalem IN
    SELECT *
    FROM public.temper_ic_uretim_maliyet_kalemleri kalem
    WHERE kalem.mod_surumu_id = v_mod.id
    ORDER BY kalem.sira_no, kalem.id
  LOOP
    v_kalem_miktari := p_alan_m2 * v_kalem.m2_basina_tuketim;
    v_kalem_toplami := v_kalem_miktari * v_kalem.birim_maliyet_try;
    v_toplam := v_toplam + v_kalem_toplami;
    v_kalemler := v_kalemler || jsonb_build_array(jsonb_build_object(
      'kalem_id', v_kalem.id,
      'sira_no', v_kalem.sira_no,
      'bilesen_turu', v_kalem.bilesen_turu,
      'aciklama', v_kalem.aciklama,
      'tuketim_birimi', v_kalem.tuketim_birimi,
      'm2_basina_tuketim', v_kalem.m2_basina_tuketim,
      'miktar', round(v_kalem_miktari, 8),
      'birim_maliyet_try', v_kalem.birim_maliyet_try,
      'toplam_maliyet', round(v_kalem_toplami, 6)
    ));
  END LOOP;

  IF jsonb_array_length(v_kalemler) <> 3
     OR NOT (
       SELECT COALESCE(
         array_agg(value ->> 'bilesen_turu' ORDER BY value ->> 'bilesen_turu'),
         ARRAY[]::text[]
       ) = ARRAY['amortisman', 'enerji', 'iscilik']::text[]
       FROM jsonb_array_elements(v_kalemler)
     ) THEN
    v_hatalar := jsonb_build_array(jsonb_build_object(
      'kod', 'TEMPER_IC_URETIM_KALEMLERI_EKSIK',
      'mesaj', 'Amortisman, enerji ve iscilik izleri eksiksiz olmalidir.'
    ));
  END IF;

  RETURN jsonb_build_object(
    'gecerli', jsonb_array_length(v_hatalar) = 0,
    'urun_stok_id', p_urun_stok_id,
    'tarih', v_tarih,
    'alan_m2', round(p_alan_m2, 8),
    'mod', 'ic_uretim',
    'mod_surumu_id', v_mod.id,
    'mod_revision_no', v_mod.revision_no,
    'birim_maliyet_try', CASE
      WHEN jsonb_array_length(v_hatalar) > 0 THEN NULL
      ELSE round(v_toplam / p_alan_m2, 8)
    END,
    'toplam_maliyet', CASE
      WHEN jsonb_array_length(v_hatalar) > 0 THEN NULL
      ELSE round(v_toplam, 6)
    END,
    'dis_hizmet_fiyati', NULL,
    'ic_uretim_kalemleri', v_kalemler,
    'hatalar', v_hatalar
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.temper_maliyet_paneli_getir_v4(
  p_tarih date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tarih date := COALESCE(
    p_tarih,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_an timestamptz :=
    v_tarih::timestamp AT TIME ZONE 'Europe/Istanbul';
  v_hizmet_stok record;
  v_kaynak_paneli jsonb;
  v_hizmet_paneli jsonb;
  v_aktif_cozum jsonb;
  v_mod_surumleri jsonb;
  v_secimler jsonb;
  v_urun record;
  v_urun_cozum jsonb;
  v_urun_cozumleri jsonb := '[]'::jsonb;
  v_eksikler jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT
    stok.id AS stok_id,
    stok.kod AS stok_kodu,
    stok.ad AS stok_adi,
    stok.birim
  INTO v_hizmet_stok
  FROM public.maliyet_hizmet_stoklari hizmet
  JOIN public.stok stok ON stok.id = hizmet.stok_id
  WHERE hizmet.hizmet_turu = 'temper_dis_hizmet'
    AND stok.aktif
  LIMIT 1;

  IF v_hizmet_stok.stok_id IS NULL THEN
    v_hizmet_paneli := NULL;
  ELSE
    v_kaynak_paneli := public.stok_maliyet_kaynak_paneli_getir_v3(v_tarih);
    SELECT value
    INTO v_hizmet_paneli
    FROM jsonb_array_elements(v_kaynak_paneli -> 'stoklar')
    WHERE value ->> 'stok_id' = v_hizmet_stok.stok_id::text
    LIMIT 1;

    v_hizmet_paneli := jsonb_build_object(
      'stok_id', v_hizmet_stok.stok_id,
      'stok_kodu', v_hizmet_stok.stok_kodu,
      'stok_adi', v_hizmet_stok.stok_adi,
      'birim', v_hizmet_stok.birim,
      'aktif_fiyat', COALESCE(v_hizmet_paneli -> 'aktif_fiyat', 'null'::jsonb),
      'alternatifler', COALESCE(v_hizmet_paneli -> 'alternatifler', '[]'::jsonb)
    );
  END IF;

  -- NULL urun cozumunu geriye uyumlu genel-fallback gorunumu olarak koru.
  -- Readiness ise yalniz genel fiyatla belirlenemez: her aktif temper receteli
  -- urun, urun override -> genel fallback sirasi ile ayri cozulur.
  v_aktif_cozum := public.temper_maliyetini_coz_v4(NULL, v_tarih, 1);

  FOR v_urun IN
    SELECT
      urun.id AS stok_id,
      urun.kod AS stok_kodu,
      urun.ad AS stok_adi,
      recete.id AS recete_surumu_id
    FROM public.stok_urun_maliyet_recete_surmleri recete
    JOIN public.stok urun
      ON urun.id = recete.urun_stok_id
     AND urun.aktif
    WHERE recete.gecerlilik_donemi @> v_tarih
      AND EXISTS (
        SELECT 1
        FROM public.stok_urun_maliyet_recete_islemleri islem
        WHERE islem.recete_surumu_id = recete.id
          AND islem.islem_turu = 'temper'
      )
    ORDER BY urun.kod, urun.id
  LOOP
    v_urun_cozum := public.temper_maliyetini_coz_v4(
      v_urun.stok_id,
      v_tarih,
      1
    );

    v_urun_cozumleri := v_urun_cozumleri || jsonb_build_array(
      jsonb_build_object(
        'stok_id', v_urun.stok_id,
        'stok_kodu', v_urun.stok_kodu,
        'stok_adi', v_urun.stok_adi,
        'recete_surumu_id', v_urun.recete_surumu_id,
        'gecerli', COALESCE((v_urun_cozum ->> 'gecerli')::boolean, false),
        'mod', v_urun_cozum ->> 'mod',
        'birim_maliyet_try', v_urun_cozum -> 'birim_maliyet_try',
        'hatalar', COALESCE(v_urun_cozum -> 'hatalar', '[]'::jsonb),
        'cozum', v_urun_cozum
      )
    );

    IF NOT COALESCE((v_urun_cozum ->> 'gecerli')::boolean, false) THEN
      v_eksikler := v_eksikler || jsonb_build_array(jsonb_build_object(
        'kod', 'TEMPER_URUN_MALIYETI_EKSIK',
        'stok_id', v_urun.stok_id,
        'stok_kodu', v_urun.stok_kodu,
        'stok_adi', v_urun.stok_adi,
        'detaylar', COALESCE(v_urun_cozum -> 'hatalar', '[]'::jsonb)
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_urun_cozumleri) = 0 THEN
    v_eksikler := v_eksikler || jsonb_build_array(jsonb_build_object(
      'kod', 'AKTIF_TEMPER_RECETESI_EKSIK',
      'mesaj', 'Sorgu tarihinde temper islemi iceren aktif urun recetesi yok.'
    ));
  END IF;

  -- Aktif modun hic olmamasi urun matrisi bos olsa dahi global bir eksiktir.
  -- Dis hizmette yalniz urun override kullanilmasi ise genel-fallback hatasini
  -- panelin tamamini yanlislikla hazir degil durumuna dusurmez.
  IF v_aktif_cozum #>> '{hatalar,0,kod}' = 'TEMPER_MALIYET_MODU_EKSIK'
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v_eksikler) eksik(value)
       WHERE value ->> 'kod' = 'TEMPER_URUN_MALIYETI_EKSIK'
     ) THEN
    v_eksikler := v_eksikler
      || COALESCE(v_aktif_cozum -> 'hatalar', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'mod_surumu_id', mod_surumu.id,
    'mod', mod_surumu.mod,
    'revision_no', mod_surumu.revision_no,
    'gecerlilik_baslangici', lower(mod_surumu.gecerlilik_donemi),
    'gecerlilik_bitisi', CASE
      WHEN upper_inf(mod_surumu.gecerlilik_donemi) THEN NULL
      ELSE upper(mod_surumu.gecerlilik_donemi)
    END,
    'gerekce', mod_surumu.gerekce,
    'dis_hizmet_stok_id', mod_surumu.dis_hizmet_stok_id,
    'ic_uretim_kalemleri', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'kalem_id', kalem.id,
        'sira_no', kalem.sira_no,
        'bilesen_turu', kalem.bilesen_turu,
        'aciklama', kalem.aciklama,
        'tuketim_birimi', kalem.tuketim_birimi,
        'm2_basina_tuketim', kalem.m2_basina_tuketim,
        'birim_maliyet_try', kalem.birim_maliyet_try
      ) ORDER BY kalem.sira_no)
      FROM public.temper_ic_uretim_maliyet_kalemleri kalem
      WHERE kalem.mod_surumu_id = mod_surumu.id
    ), '[]'::jsonb)
  ) ORDER BY lower(mod_surumu.gecerlilik_donemi) DESC), '[]'::jsonb)
  INTO v_mod_surumleri
  FROM public.temper_maliyet_modu_surmleri mod_surumu;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'secim_id', secim.id,
    'mod_surumu_id', secim.mod_surumu_id,
    'urun_stok_id', secim.urun_stok_id,
    'urun_stok_kodu', urun.kod,
    'fiyat_id', fiyat.id,
    'tedarikci_id', fiyat.tedarikci_id,
    'tedarikci_adi', tedarikci.ad,
    'birim_fiyat', fiyat.birim_fiyat,
    'para_birimi', fiyat.para_birimi,
    'fiyat_birimi', fiyat.fiyat_birimi,
    'vade_gunu', fiyat.vade_gunu,
    'marka', fiyat.marka,
    'gecerlilik_baslangici', lower(secim.gecerlilik_donemi),
    'gecerlilik_bitisi', CASE
      WHEN upper_inf(secim.gecerlilik_donemi) THEN NULL
      ELSE upper(secim.gecerlilik_donemi)
    END,
    'gerekce', secim.gerekce
  ) ORDER BY
    CASE WHEN secim.urun_stok_id IS NULL THEN 0 ELSE 1 END,
    urun.kod,
    lower(secim.gecerlilik_donemi) DESC), '[]'::jsonb)
  INTO v_secimler
  FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
  JOIN public.temper_maliyet_modu_surmleri secim_modu
    ON secim_modu.id = secim.mod_surumu_id
   AND secim_modu.mod = 'dis_hizmet'
   AND secim_modu.gecerlilik_donemi @> v_tarih
  JOIN public.stok_alis_fiyatlari fiyat ON fiyat.id = secim.fiyat_id
  JOIN public.cari tedarikci ON tedarikci.id = fiyat.tedarikci_id
  LEFT JOIN public.stok urun ON urun.id = secim.urun_stok_id
  WHERE secim.gecerlilik_donemi @> v_an;

  RETURN jsonb_build_object(
    'tarih', v_tarih,
    'hazir',
      jsonb_array_length(v_urun_cozumleri) > 0
      AND jsonb_array_length(v_eksikler) = 0,
    'hizmet_stogu', v_hizmet_paneli,
    'aktif_cozum', v_aktif_cozum,
    'urun_cozumleri', v_urun_cozumleri,
    'mod_surumleri', v_mod_surumleri,
    'urun_fiyat_secimleri', v_secimler,
    'eksikler', v_eksikler
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 036 ozel urunleri: 07122 ve temperli 11004-11008
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.maliyet_ozel_recete_onerisi_v4(
  p_urun_stok_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_urun public.stok%ROWTYPE;
  v_aile text;
  v_cam_kodlari text[];
  v_cita_kodu text;
  v_temper_hedefleri integer[];
  v_nedenler jsonb := '[]'::jsonb;
  v_kalemler jsonb := '[]'::jsonb;
  v_islemler jsonb := '[]'::jsonb;
  v_stok_id uuid;
  v_sira integer := 0;
  v_cam_kodu text;
  v_sarf record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT *
  INTO v_urun
  FROM public.stok
  WHERE id = p_urun_stok_id
    AND aktif
    AND kategori = 'cam';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'AKTIF_CAM_URUNU_BULUNAMADI';
  END IF;

  CASE v_urun.kod
    WHEN '07122' THEN
      v_aile := 'lamine_07122';
      v_cam_kodlari := ARRAY['01016', '01002'];
      v_cita_kodu := 'CITA-AL-012';
      v_temper_hedefleri := NULL;
    WHEN '11004' THEN
      v_aile := 'temper_4_16_4';
      v_cam_kodlari := ARRAY['01002', '01002'];
      v_cita_kodu := 'CITA-AL-016';
      v_temper_hedefleri := ARRAY[2];
    WHEN '11005' THEN
      v_aile := 'temper_4_14_4';
      v_cam_kodlari := ARRAY['01002', '01002'];
      v_cita_kodu := 'CITA-AL-014';
      v_temper_hedefleri := ARRAY[2];
    WHEN '11006' THEN
      v_aile := 'temper_4_14_5';
      v_cam_kodlari := ARRAY['01002', '01003'];
      v_cita_kodu := 'CITA-AL-014';
      v_temper_hedefleri := ARRAY[2];
    WHEN '11007' THEN
      v_aile := 'temper_sinerji_4_16_4';
      v_cam_kodlari := ARRAY['01020', '01002'];
      v_cita_kodu := 'CITA-AL-016';
      v_temper_hedefleri := ARRAY[2];
    WHEN '11008' THEN
      v_aile := 'temper_konfor_4_16_4';
      v_cam_kodlari := ARRAY['01022', '01002'];
      v_cita_kodu := 'CITA-AL-016';
      v_temper_hedefleri := ARRAY[2];
    ELSE
      RETURN NULL;
  END CASE;

  -- Ilk cam
  v_cam_kodu := v_cam_kodlari[1];
  SELECT stok.id
  INTO v_stok_id
  FROM public.stok stok
  WHERE stok.kod = v_cam_kodu AND stok.aktif;

  IF v_stok_id IS NULL THEN
    v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
      'kod', 'RECETE_BILESEN_STOGU_EKSIK',
      'stok_kodu', v_cam_kodu,
      'rol', 'cam',
      'cam_sirasi', 1
    ));
  ELSE
    v_sira := v_sira + 1;
    v_kalemler := v_kalemler || jsonb_build_array(jsonb_build_object(
      'sira_no', v_sira,
      'bilesen_stok_id', v_stok_id,
      'stok_kodu', v_cam_kodu,
      'rol', 'cam',
      'tuketim_tipi', 'alan',
      'katsayi', 1,
      'bosluk_sirasi', NULL,
      'alternatif_grubu', NULL
    ));
  END IF;

  -- Tek boslugun aluminyum citasi
  v_stok_id := NULL;
  SELECT stok.id
  INTO v_stok_id
  FROM public.stok stok
  WHERE stok.kod = v_cita_kodu AND stok.aktif;

  IF v_stok_id IS NULL THEN
    v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
      'kod', 'RECETE_BILESEN_STOGU_EKSIK',
      'stok_kodu', v_cita_kodu,
      'rol', 'cita',
      'bosluk_sirasi', 1
    ));
  ELSE
    v_sira := v_sira + 1;
    v_kalemler := v_kalemler || jsonb_build_array(jsonb_build_object(
      'sira_no', v_sira,
      'bilesen_stok_id', v_stok_id,
      'stok_kodu', v_cita_kodu,
      'rol', 'cita',
      'tuketim_tipi', 'cevre',
      'katsayi', 1,
      'bosluk_sirasi', 1,
      'alternatif_grubu', NULL
    ));
  END IF;

  -- Ikinci cam
  v_cam_kodu := v_cam_kodlari[2];
  v_stok_id := NULL;
  SELECT stok.id
  INTO v_stok_id
  FROM public.stok stok
  WHERE stok.kod = v_cam_kodu AND stok.aktif;

  IF v_stok_id IS NULL THEN
    v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
      'kod', 'RECETE_BILESEN_STOGU_EKSIK',
      'stok_kodu', v_cam_kodu,
      'rol', 'cam',
      'cam_sirasi', 2
    ));
  ELSE
    v_sira := v_sira + 1;
    v_kalemler := v_kalemler || jsonb_build_array(jsonb_build_object(
      'sira_no', v_sira,
      'bilesen_stok_id', v_stok_id,
      'stok_kodu', v_cam_kodu,
      'rol', 'cam',
      'tuketim_tipi', 'alan',
      'katsayi', 1,
      'bosluk_sirasi', NULL,
      'alternatif_grubu', NULL
    ));
  END IF;

  -- 07122 ve 11004-11008 icin tek boslugun standart sarflari.
  FOR v_sarf IN
    SELECT *
    FROM (
      VALUES
        ('SARF-BUTIL'::text, 0.007::numeric, NULL::text),
        ('SARF-NEM-ALICI'::text, 0.0375::numeric, NULL::text),
        ('SARF-PU'::text, 0.0725::numeric, 'ikincil_dolgu'::text)
    ) AS sarf(stok_kodu, katsayi, alternatif_grubu)
  LOOP
    v_stok_id := NULL;
    SELECT stok.id
    INTO v_stok_id
    FROM public.stok stok
    WHERE stok.kod = v_sarf.stok_kodu AND stok.aktif;

    IF v_stok_id IS NULL THEN
      v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
        'kod', 'RECETE_BILESEN_STOGU_EKSIK',
        'stok_kodu', v_sarf.stok_kodu,
        'rol', 'sarf',
        'bosluk_sirasi', 1
      ));
    ELSE
      v_sira := v_sira + 1;
      v_kalemler := v_kalemler || jsonb_build_array(jsonb_build_object(
        'sira_no', v_sira,
        'bilesen_stok_id', v_stok_id,
        'stok_kodu', v_sarf.stok_kodu,
        'rol', 'sarf',
        'tuketim_tipi', 'cevre',
        'katsayi', v_sarf.katsayi,
        'bosluk_sirasi', 1,
        'alternatif_grubu', v_sarf.alternatif_grubu
      ));
    END IF;
  END LOOP;

  IF v_temper_hedefleri IS NOT NULL THEN
    v_islemler := jsonb_build_array(jsonb_build_object(
      'sira_no', 1,
      'islem_turu', 'temper',
      'tuketim_tipi', 'alan',
      'hedef_cam_sira_nolari', to_jsonb(v_temper_hedefleri),
      'pane_sayisi', cardinality(v_temper_hedefleri),
      'alan_katsayisi', 1,
      'aciklama', 'Ikinci cam paneline temper islemi'
    ));
  END IF;

  RETURN jsonb_build_object(
    'durum', CASE
      WHEN jsonb_array_length(v_nedenler) = 0 THEN 'hazir'
      ELSE 'eksik'
    END,
    'urun_stok_id', v_urun.id,
    'stok_kodu', v_urun.kod,
    'urun_adi', v_urun.ad,
    'aile', v_aile,
    'katman_yapisi', v_urun.katman_yapisi,
    'nedenler', v_nedenler,
    'kalemler', v_kalemler,
    'islemler', v_islemler
  );
END;
$$;

-- 106'nin genel onericisini dahili adla koru; dis sozlesmedeki V3 adini ozel
-- 07122/temper onerilerini de kapsayacak sekilde tekrar yayinla.
ALTER FUNCTION public.maliyet_recete_onerisi_v3(uuid)
  RENAME TO maliyet_recete_onerisi_temel_v3;

REVOKE ALL ON FUNCTION public.maliyet_recete_onerisi_temel_v3(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.maliyet_recete_onerisi_v3(
  p_urun_stok_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_oneri jsonb;
BEGIN
  v_oneri := public.maliyet_ozel_recete_onerisi_v4(p_urun_stok_id);
  IF v_oneri IS NULL THEN
    v_oneri := public.maliyet_recete_onerisi_temel_v3(p_urun_stok_id);
  END IF;
  RETURN v_oneri || jsonb_build_object(
    'islemler', COALESCE(v_oneri -> 'islemler', '[]'::jsonb)
  );
END;
$$;

-- 106 kurucusunun mevcut-recete korumasini aynen kullan; yalniz yeni kurulan
-- recetelere onerideki acik operasyonlari ekle.
ALTER FUNCTION public.standart_urun_recetelerini_kur_v3(date, uuid[], boolean)
  RENAME TO standart_urun_recetelerini_kur_temel_v3;

REVOKE ALL ON FUNCTION public.standart_urun_recetelerini_kur_temel_v3(
  date, uuid[], boolean
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.standart_urun_recetelerini_kur_v3(
  p_baslangic date DEFAULT NULL,
  p_urun_stok_ids uuid[] DEFAULT NULL,
  p_uygula boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_yanit jsonb;
  v_kurulan jsonb;
  v_oneri jsonb;
  v_islem jsonb;
  v_islem_sayisi integer := 0;
BEGIN
  v_yanit := public.standart_urun_recetelerini_kur_temel_v3(
    p_baslangic,
    p_urun_stok_ids,
    p_uygula
  );

  IF NOT p_uygula THEN
    RETURN v_yanit;
  END IF;

  FOR v_kurulan IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_yanit -> 'kurulanlar', '[]'::jsonb))
  LOOP
    v_oneri := public.maliyet_recete_onerisi_v3(
      (v_kurulan ->> 'stok_id')::uuid
    );

    FOR v_islem IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(v_oneri -> 'islemler', '[]'::jsonb))
    LOOP
      INSERT INTO public.stok_urun_maliyet_recete_islemleri (
        recete_surumu_id,
        sira_no,
        islem_turu,
        tuketim_tipi,
        hedef_cam_sira_nolari,
        alan_katsayisi,
        aciklama
      )
      VALUES (
        (v_kurulan ->> 'recete_surumu_id')::uuid,
        (v_islem ->> 'sira_no')::integer,
        v_islem ->> 'islem_turu',
        COALESCE(NULLIF(v_islem ->> 'tuketim_tipi', ''), 'alan'),
        ARRAY(
          SELECT jsonb_array_elements_text(
            v_islem -> 'hedef_cam_sira_nolari'
          )::integer
        ),
        COALESCE(NULLIF(v_islem ->> 'alan_katsayisi', '')::numeric, 1),
        NULLIF(v_islem ->> 'aciklama', '')
      );
      v_islem_sayisi := v_islem_sayisi + 1;
    END LOOP;
  END LOOP;

  RETURN v_yanit || jsonb_build_object(
    'islem_sayisi', v_islem_sayisi
  );
END;
$$;

-- Manuel recetenin V3 stok kalemleriyle tam geriye uyumlu V4 girisi.
-- Islemler ayri tabloda tutuldugu icin ham cam ikinci kez stok kalemi olmaz.
CREATE OR REPLACE FUNCTION public.urun_maliyet_recetesi_kaydet_v4(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_v3_yanit jsonb;
  v_recete_id uuid;
  v_islem jsonb;
  v_islem_sayisi integer := 0;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);

  IF p_payload ? 'islemler'
     AND jsonb_typeof(p_payload -> 'islemler') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RECETE_ISLEMLERI_DIZI_OLMALI';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'urun_maliyet_recetesi_kaydet_v4',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  v_v3_yanit := public.urun_maliyet_recetesi_kaydet_v3(
    p_payload - 'islemler',
    left(p_idempotency_key, 140) || ':kalemler-v3'
  );
  v_recete_id := (v_v3_yanit ->> 'recete_surumu_id')::uuid;

  FOR v_islem IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_payload -> 'islemler', '[]'::jsonb))
  LOOP
    INSERT INTO public.stok_urun_maliyet_recete_islemleri (
      recete_surumu_id,
      sira_no,
      islem_turu,
      tuketim_tipi,
      hedef_cam_sira_nolari,
      alan_katsayisi,
      aciklama
    )
    VALUES (
      v_recete_id,
      (v_islem ->> 'sira_no')::integer,
      v_islem ->> 'islem_turu',
      COALESCE(NULLIF(v_islem ->> 'tuketim_tipi', ''), 'alan'),
      ARRAY(
        SELECT jsonb_array_elements_text(
          v_islem -> 'hedef_cam_sira_nolari'
        )::integer
      ),
      COALESCE(NULLIF(v_islem ->> 'alan_katsayisi', '')::numeric, 1),
      NULLIF(v_islem ->> 'aciklama', '')
    );
    v_islem_sayisi := v_islem_sayisi + 1;
  END LOOP;

  v_yanit := v_v3_yanit || jsonb_build_object(
    'islem_sayisi', v_islem_sayisi,
    'islemler', COALESCE(p_payload -> 'islemler', '[]'::jsonb)
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

-- V3 ham-malzeme hesaplayicisini dahili adla koru ve ayni dis imzaya yalniz
-- acik operasyon maliyetlerini ekleyen uyumlu bir zarf yerlestir.
ALTER FUNCTION public.urun_maliyeti_detayli_hesapla_v3(
  uuid, date, numeric, numeric
) RENAME TO urun_maliyeti_detayli_hesapla_temel_v3;

REVOKE ALL ON FUNCTION public.urun_maliyeti_detayli_hesapla_temel_v3(
  uuid, date, numeric, numeric
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.urun_maliyeti_detayli_hesapla_v3(
  p_stok_id uuid,
  p_tarih date DEFAULT NULL,
  p_en_mm numeric DEFAULT NULL,
  p_boy_mm numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tarih date := COALESCE(
    p_tarih,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_taban jsonb;
  v_recete_id uuid;
  v_alan numeric;
  v_islem record;
  v_cozum jsonb;
  v_islemler jsonb := '[]'::jsonb;
  v_islem_hatalari jsonb := '[]'::jsonb;
  v_islem_toplam numeric := 0;
  v_taban_toplam numeric;
  v_taban_baz numeric;
BEGIN
  v_taban := public.urun_maliyeti_detayli_hesapla_temel_v3(
    p_stok_id,
    v_tarih,
    p_en_mm,
    p_boy_mm
  );

  v_recete_id := NULLIF(v_taban ->> 'recete_surumu_id', '')::uuid;
  v_alan := NULLIF(v_taban ->> 'referans_alan_m2', '')::numeric;
  IF v_recete_id IS NULL OR v_alan IS NULL THEN
    RETURN v_taban || jsonb_build_object(
      'hesaplama_surumu', 'acik-recete-temper-v4',
      'islem_maliyeti', 0,
      'islemler', '[]'::jsonb
    );
  END IF;

  FOR v_islem IN
    SELECT *
    FROM public.stok_urun_maliyet_recete_islemleri
    WHERE recete_surumu_id = v_recete_id
    ORDER BY sira_no, id
  LOOP
    v_cozum := public.temper_maliyetini_coz_v4(
      p_stok_id,
      v_tarih,
      v_alan * v_islem.pane_sayisi * v_islem.alan_katsayisi
    );

    IF COALESCE((v_cozum ->> 'gecerli')::boolean, false) THEN
      v_islem_toplam := v_islem_toplam
        + COALESCE((v_cozum ->> 'toplam_maliyet')::numeric, 0);
    ELSE
      v_islem_hatalari := v_islem_hatalari || jsonb_build_array(
        jsonb_build_object(
          'kod', 'RECETE_ISLEM_MALIYETI_COZULEMEDI',
          'islem_sira_no', v_islem.sira_no,
          'islem_turu', v_islem.islem_turu,
          'detaylar', COALESCE(v_cozum -> 'hatalar', '[]'::jsonb)
        )
      );
    END IF;

    v_islemler := v_islemler || jsonb_build_array(jsonb_build_object(
      'sira_no', v_islem.sira_no,
      'islem_turu', v_islem.islem_turu,
      'tuketim_tipi', v_islem.tuketim_tipi,
      'hedef_cam_sira_nolari', to_jsonb(v_islem.hedef_cam_sira_nolari),
      'pane_sayisi', v_islem.pane_sayisi,
      'alan_katsayisi', v_islem.alan_katsayisi,
      'maliyet_alan_m2',
        round(v_alan * v_islem.pane_sayisi * v_islem.alan_katsayisi, 8),
      'toplam_maliyet',
        COALESCE((v_cozum ->> 'toplam_maliyet')::numeric, 0),
      'temper_cozumu', v_cozum
    ));
  END LOOP;

  v_taban_toplam := COALESCE((v_taban ->> 'toplam_maliyet')::numeric, 0);
  v_taban_baz := COALESCE((v_taban ->> 'baz_maliyet')::numeric, 0);

  RETURN v_taban || jsonb_build_object(
    'gecerli',
      COALESCE((v_taban ->> 'gecerli')::boolean, false)
      AND jsonb_array_length(v_islem_hatalari) = 0,
    'hesaplama_surumu', 'acik-recete-temper-v4',
    'islem_maliyeti', round(v_islem_toplam, 2),
    'baz_maliyet', round(v_taban_baz + v_islem_toplam, 2),
    'toplam_maliyet', round(v_taban_toplam + v_islem_toplam, 2),
    'm2_maliyet', CASE
      WHEN v_alan = 0 THEN 0
      ELSE round((v_taban_toplam + v_islem_toplam) / v_alan, 2)
    END,
    'islemler', v_islemler,
    'hatalar',
      COALESCE(v_taban -> 'hatalar', '[]'::jsonb) || v_islem_hatalari,
    'eksikler',
      COALESCE(v_taban -> 'hatalar', '[]'::jsonb) || v_islem_hatalari
  );
END;
$$;

-- Temper dis hizmetini gercekte veren firma cam tedarikcisi de olabilir.
-- Istisna yalniz hizmet esleme tablosundaki temper kartina aittir; diger
-- cam/cita/yan_malzeme kapsam kurallari degismez.
CREATE OR REPLACE FUNCTION public.stok_alis_fiyati_baglantilarini_dogrula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profil_turu text;
  v_stok_kategorisi text;
  v_stok_birimi text;
  v_hizmet_turu text;
  v_tedarik_kapsamlari text[];
  v_baglanti_tedarikcisi uuid;
  v_baglanti_durumu text;
BEGIN
  SELECT stok.kategori, stok.birim, hizmet.hizmet_turu
  INTO v_stok_kategorisi, v_stok_birimi, v_hizmet_turu
  FROM public.stok stok
  LEFT JOIN public.maliyet_hizmet_stoklari hizmet
    ON hizmet.stok_id = stok.id
  WHERE stok.id = NEW.stok_id
    AND stok.aktif;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'AKTIF_STOK_GEREKLI';
  END IF;

  SELECT profil.profil_turu
  INTO v_profil_turu
  FROM public.stok_maliyet_profilleri profil
  WHERE profil.stok_id = NEW.stok_id
    AND profil.gecerlilik_donemi @>
      (NEW.fiyat_tarihi AT TIME ZONE 'Europe/Istanbul')::date
  LIMIT 1;

  v_profil_turu := COALESCE(
    v_profil_turu,
    CASE v_stok_kategorisi
      WHEN 'cam' THEN 'cam'
      WHEN 'cita' THEN 'cita'
      WHEN 'yan_malzeme' THEN 'sarf'
    END
  );

  IF v_profil_turu IS NULL AND NEW.kaynak_turu <> 'legacy_unverified' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'FIYATLANABILIR_STOK_KATEGORISI_GEREKLI';
  END IF;

  IF NEW.kaynak_turu = 'legacy_unverified' THEN
    RETURN NEW;
  END IF;

  IF lower(btrim(NEW.stok_ana_birimi))
     <> lower(btrim(v_stok_birimi)) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'FIYAT_STOK_ANA_BIRIMI_UYUSMUYOR';
  END IF;

  SELECT cari.tedarik_kapsamlari
  INTO v_tedarik_kapsamlari
  FROM public.cari
  WHERE cari.id = NEW.tedarikci_id
    AND cari.tipi = 'tedarikci'
    AND cari.aktif;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'AKTIF_TEDARIKCI_GEREKLI';
  END IF;

  IF v_hizmet_turu = 'temper_dis_hizmet' THEN
    IF NOT (
      'cam' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[]))
      OR 'yan_malzeme' = ANY(
        COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
      )
      OR 'temper_hizmeti' = ANY(
        COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
      )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TEDARIKCI_KAPSAMI_UYUSMUYOR';
    END IF;
  ELSIF (v_profil_turu = 'cam'
          AND NOT ('cam' = ANY(
            COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
          )))
     OR (v_profil_turu = 'cita'
          AND NOT ('cita' = ANY(
            COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
          )))
     OR (v_profil_turu = 'sarf'
          AND NOT ('yan_malzeme' = ANY(
            COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
          ))) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEDARIKCI_KAPSAMI_UYUSMUYOR';
  END IF;

  IF NEW.kaynak_turu = 'cam_baglantisi' THEN
    SELECT baglanti.tedarikci_id, baglanti.durum
    INTO v_baglanti_tedarikcisi, v_baglanti_durumu
    FROM public.cam_tedarik_baglantilari baglanti
    WHERE baglanti.id = NEW.cam_baglantisi_id;

    IF v_baglanti_tedarikcisi IS DISTINCT FROM NEW.tedarikci_id
       OR v_baglanti_durumu <> 'taslak' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'CAM_BAGLANTISI_FIYAT_KAYNAGI_GECERSIZ';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_tedarikci_id uuid;
  v_tedarik_kapsamlari text[];
  v_fiyat_tarihi timestamptz;
  v_baslangic date;
  v_bitis date;
  v_kalem jsonb;
  v_stok record;
  v_fiyat_id uuid;
  v_fiyat_ids jsonb := '[]'::jsonb;
  v_para_birimi text;
  v_fiyat_birimi text;
  v_varyant text;
  v_vade integer;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('create', false);

  IF jsonb_typeof(p_payload -> 'kalemler') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload -> 'kalemler') = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FIYAT_TEKLIFI_KALEMLERI_ZORUNLU';
  END IF;

  v_tedarikci_id := NULLIF(p_payload ->> 'tedarikci_id', '')::uuid;
  SELECT cari.tedarik_kapsamlari
  INTO v_tedarik_kapsamlari
  FROM public.cari
  WHERE cari.id = v_tedarikci_id
    AND cari.tipi = 'tedarikci'
    AND cari.aktif;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'AKTIF_TEDARIKCI_BULUNAMADI';
  END IF;

  v_fiyat_tarihi := COALESCE(
    NULLIF(p_payload ->> 'fiyat_tarihi', '')::timestamptz,
    clock_timestamp()
  );
  v_baslangic := COALESCE(
    NULLIF(p_payload ->> 'gecerlilik_baslangici', '')::date,
    (v_fiyat_tarihi AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_bitis := NULLIF(p_payload ->> 'gecerlilik_bitisi', '')::date;

  IF v_bitis IS NOT NULL AND v_bitis <= v_baslangic THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FIYAT_TEKLIFI_DONEMI_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'stok_tedarikci_fiyat_tekliflerini_kaydet_v3',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_tedarikci_fiyat_tekliflerini_kaydet_v3',
    p_idempotency_key,
    COALESCE(p_payload ->> 'aciklama', 'Tedarikci fiyat teklifi kaydi'),
    COALESCE(p_payload ->> 'kaynak_ekran', 'maliyet_v3')
  );

  FOR v_kalem IN
    SELECT value
    FROM jsonb_array_elements(p_payload -> 'kalemler')
  LOOP
    SELECT
      stok.id,
      stok.kategori,
      stok.birim,
      hizmet.hizmet_turu
    INTO v_stok
    FROM public.stok stok
    LEFT JOIN public.maliyet_hizmet_stoklari hizmet
      ON hizmet.stok_id = stok.id
    WHERE stok.id = NULLIF(v_kalem ->> 'stok_id', '')::uuid
      AND stok.aktif;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'FIYAT_TEKLIFI_AKTIF_STOK_GEREKLI';
    END IF;

    IF v_stok.hizmet_turu = 'temper_dis_hizmet' THEN
      IF NOT (
        'cam' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[]))
        OR 'yan_malzeme' = ANY(
          COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
        )
        OR 'temper_hizmeti' = ANY(
          COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
        )
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'TEDARIKCI_KAPSAMI_UYUSMUYOR';
      END IF;
    ELSIF (v_stok.kategori = 'cam'
            AND NOT ('cam' = ANY(
              COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
            )))
       OR (v_stok.kategori = 'cita'
            AND NOT ('cita' = ANY(
              COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
            )))
       OR (v_stok.kategori = 'yan_malzeme'
            AND NOT ('yan_malzeme' = ANY(
              COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])
            ))) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TEDARIKCI_KAPSAMI_UYUSMUYOR';
    END IF;

    v_para_birimi := upper(COALESCE(
      NULLIF(v_kalem ->> 'para_birimi', ''),
      'TRY'
    ));
    v_fiyat_birimi := COALESCE(
      NULLIF(v_kalem ->> 'fiyat_birimi', ''),
      v_stok.birim
    );
    v_varyant := lower(COALESCE(
      NULLIF(v_kalem ->> 'varyant', ''),
      'genel'
    ));
    v_vade := COALESCE(
      NULLIF(v_kalem ->> 'vade_gunu', '')::integer,
      0
    );

    IF v_para_birimi <> 'TRY'
       OR (
         (
           v_stok.kategori = 'cam'
           OR v_stok.hizmet_turu = 'temper_dis_hizmet'
         )
         AND lower(replace(v_fiyat_birimi, '²', '2')) <> 'm2'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'V3_FIYAT_BIRIMI_DESTEKLENMIYOR',
        DETAIL = 'Cam ve temper hizmet teklifleri TRY/m2 olmalidir.';
    END IF;

    INSERT INTO public.stok_alis_fiyatlari (
      stok_id,
      tedarikci_id,
      birim_fiyat,
      para_birimi,
      fiyat_birimi,
      paket_miktari,
      stok_ana_birimi,
      donusum_katsayisi,
      donusum_aciklamasi,
      vade_gunu,
      fiyat_tarihi,
      kaynak_turu,
      kaynak_referansi,
      durum,
      olusturan_kullanici_id,
      fiyat_varyanti,
      marka,
      fiyat_liste_kodu,
      teklif_gecerlilik_donemi
    )
    VALUES (
      v_stok.id,
      v_tedarikci_id,
      (v_kalem ->> 'birim_fiyat')::numeric,
      v_para_birimi::public.para_birimi_kodu,
      v_fiyat_birimi,
      NULLIF(v_kalem ->> 'paket_miktari', '')::numeric,
      COALESCE(
        NULLIF(v_kalem ->> 'stok_ana_birimi', ''),
        v_stok.birim
      ),
      COALESCE(
        NULLIF(v_kalem ->> 'donusum_katsayisi', '')::numeric,
        1
      ),
      NULLIF(btrim(v_kalem ->> 'donusum_aciklamasi'), ''),
      v_vade,
      COALESCE(
        NULLIF(v_kalem ->> 'fiyat_tarihi', '')::timestamptz,
        v_fiyat_tarihi
      ),
      'dogrudan',
      COALESCE(
        NULLIF(v_kalem ->> 'kaynak_referansi', ''),
        NULLIF(p_payload ->> 'kaynak_referansi', '')
      ),
      'dogrulanmis',
      auth.uid(),
      v_varyant,
      NULLIF(v_kalem ->> 'marka', ''),
      COALESCE(
        NULLIF(v_kalem ->> 'fiyat_liste_kodu', ''),
        NULLIF(p_payload ->> 'fiyat_liste_kodu', '')
      ),
      daterange(
        COALESCE(
          NULLIF(v_kalem ->> 'gecerlilik_baslangici', '')::date,
          v_baslangic
        ),
        COALESCE(
          NULLIF(v_kalem ->> 'gecerlilik_bitisi', '')::date,
          v_bitis
        ),
        '[)'
      )
    )
    RETURNING id INTO v_fiyat_id;

    v_fiyat_ids := v_fiyat_ids || jsonb_build_array(v_fiyat_id);
  END LOOP;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'tedarikci_id', v_tedarikci_id,
    'adet', jsonb_array_length(v_fiyat_ids),
    'fiyat_ids', v_fiyat_ids
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS, audit ve RPC yetkileri
-- ---------------------------------------------------------------------------

-- Hizmet sablonu bir uygulama metadata tablosudur. Authenticated kullanici
-- sablonu dogrudan okuyup/yazmaz; durum ve kurulum RPC'leri uzerinden kullanir.
ALTER TABLE public.maliyet_hizmet_stok_sablonu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maliyet_hizmet_stok_sablonu FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.maliyet_hizmet_stok_sablonu
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.maliyet_hizmet_stok_sablonu TO service_role;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'maliyet_hizmet_stoklari',
    'temper_maliyet_modu_surmleri',
    'temper_ic_uretim_maliyet_kalemleri',
    'stok_urun_maliyet_recete_islemleri',
    'temper_dis_hizmet_fiyat_secim_surmleri'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      v_table
    );
    EXECUTE format(
      'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',
      v_table
    );
    EXECUTE format(
      'REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',
      v_table
    );
    EXECUTE format(
      'GRANT SELECT ON public.%I TO authenticated',
      v_table
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (public.has_permission(%L, %L))',
      v_table || '_costing_read_v4',
      v_table,
      'costing',
      'read'
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.write_audit_event()',
      'audit_' || v_table || '_v4',
      v_table
    );
  END LOOP;
END;
$$;

-- SECURITY DEFINER yardimcilari yalniz dis RPC sinirlarindan veya trigger
-- mekanizmasindan cagrilabilir.
REVOKE ALL ON FUNCTION public.temper_hizmet_stogunu_tanit_v4()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maliyet_hizmet_katalogu_durumu_internal_v4()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maliyet_hizmet_stogu_envanter_guard_v4()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.temper_maliyet_modunu_dogrula_v4()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.temper_ic_uretim_kalem_tamligini_dogrula_v4()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.temper_dis_hizmet_secimini_dogrula_v4()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.urun_maliyet_recete_islemini_dogrula_v4()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(
    uuid, uuid, uuid, timestamptz, timestamptz, text, uuid
  )
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maliyet_ozel_recete_onerisi_v4(uuid)
  FROM PUBLIC, anon, authenticated;

-- Eski V3/V105 uygulamalarinin adlandirilmis ic kopyalari hicbir istemci
-- rolune acik degildir.
REVOKE ALL ON FUNCTION public.stok_baslangic_katalogunu_kur_temel_105(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maliyet_recete_onerisi_temel_v3(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.standart_urun_recetelerini_kur_temel_v3(
  date, uuid[], boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.urun_maliyeti_detayli_hesapla_temel_v3(
  uuid, date, numeric, numeric
) FROM PUBLIC, anon, authenticated;

-- Dis RPC'lerde varsayilan PUBLIC calistirma yetkisi kapatilir. Yetkilendirme
-- hem rol grant'i hem de RPC icindeki permission/AAL2 denetimiyle yapilir.
REVOKE ALL ON FUNCTION public.stok_baslangic_katalogu_durumu()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_baslangic_katalogunu_kur(text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.temper_maliyet_modu_kaydet_v4(jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.temper_dis_hizmet_fiyat_sec_v4(jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.temper_maliyetini_coz_v4(uuid, date, numeric)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.temper_maliyet_paneli_getir_v4(date)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maliyet_recete_onerisi_v3(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.standart_urun_recetelerini_kur_v3(
  date, uuid[], boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.urun_maliyet_recetesi_kaydet_v4(jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.urun_maliyeti_detayli_hesapla_v3(
  uuid, date, numeric, numeric
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION
  public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(jsonb, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.stok_baslangic_katalogu_durumu()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_baslangic_katalogunu_kur(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.temper_maliyet_modu_kaydet_v4(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.temper_dis_hizmet_fiyat_sec_v4(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.temper_maliyetini_coz_v4(
  uuid, date, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.temper_maliyet_paneli_getir_v4(date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.maliyet_recete_onerisi_v3(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.standart_urun_recetelerini_kur_v3(
  date, uuid[], boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.urun_maliyet_recetesi_kaydet_v4(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.urun_maliyeti_detayli_hesapla_v3(
  uuid, date, numeric, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(jsonb, text)
  TO authenticated;

COMMENT ON FUNCTION public.stok_baslangic_katalogunu_kur(text) IS
  '105 fiziksel katalogunu ve 108 envantersiz maliyet hizmet kartlarini ayni mevcut butonla idempotent kurar.';
COMMENT ON FUNCTION public.temper_maliyet_modu_kaydet_v4(jsonb, text) IS
  'Global temper maliyet modunu tarihsel ve cakismasiz olarak dis_hizmet veya ic_uretim seklinde kaydeder; ic uretimde amortisman, enerji ve iscilik zorunludur.';
COMMENT ON FUNCTION public.temper_dis_hizmet_fiyat_sec_v4(jsonb, text) IS
  'TRY/m2 temper dis hizmet fiyatini genel, tek urun veya urun listesi kapsaminda tarihsel snapshot olarak secer.';
COMMENT ON FUNCTION public.temper_maliyetini_coz_v4(uuid, date, numeric) IS
  'Sorgu tarihinde aktif tek temper modunu cozer; dis hizmette urun override/genel fallback, ic uretimde uc maliyet kalemi kullanir.';
COMMENT ON FUNCTION public.temper_maliyet_paneli_getir_v4(date) IS
  'Temper modu, dis hizmet alternatifleri/secimleri, ic uretim kalemleri ve eksikleri tek izleme panelinde dondurur.';
COMMENT ON FUNCTION public.urun_maliyet_recetesi_kaydet_v4(jsonb, text) IS
  'V3 stok kalemlerine ek olarak cam paneli hedefli acik islemleri kaydeder; temper islemi ham cami ikinci kez stok kalemi yapmaz.';
COMMENT ON FUNCTION public.urun_maliyeti_detayli_hesapla_v3(
  uuid, date, numeric, numeric
) IS
  'V3 ham malzeme maliyetine recetedeki tarihsel temper islem maliyetini, cam maliyetini tekrar etmeden ekler.';
COMMENT ON FUNCTION
  public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(jsonb, text) IS
  'Cam, yan malzeme veya yalniz temper_hizmeti kapsamli tedarikcilerin envantersiz temper hizmeti TRY/m2 fiyatlarini marka, varyant ve vade snapshotiyla kaydeder; temper_hizmeti kapsami fiziksel stok fiyatlama yetkisi vermez.';

COMMIT;
