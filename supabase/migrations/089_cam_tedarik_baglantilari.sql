-- 089 - Bilgi amaçlı parasal limit taşıyan cam tedarikçi bağlantıları

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.cam_tedarik_baglantilari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tedarikci_id uuid NOT NULL REFERENCES public.cari(id) ON DELETE RESTRICT,
  baglanti_no text NOT NULL UNIQUE CHECK (nullif(btrim(baglanti_no), '') IS NOT NULL),
  toplam_tutar numeric(20,2) NOT NULL CHECK (toplam_tutar > 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  baslangic_tarihi date NOT NULL,
  kapanis_tarihi date,
  durum text NOT NULL DEFAULT 'taslak'
    CHECK (durum IN ('taslak', 'aktif', 'kapali', 'iptal')),
  aciklama text,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  aktiflestiren_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  kapatan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  kapatma_nedeni text,
  idempotency_id uuid REFERENCES public.islem_idempotency(id) ON DELETE RESTRICT,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kapanis_tarihi IS NULL OR kapanis_tarihi >= baslangic_tarihi),
  CHECK (
    (durum = 'taslak'
      AND aktiflestiren_kullanici_id IS NULL
      AND kapatan_kullanici_id IS NULL
      AND kapanis_tarihi IS NULL)
    OR
    (durum = 'aktif'
      AND aktiflestiren_kullanici_id IS NOT NULL
      AND kapatan_kullanici_id IS NULL
      AND kapanis_tarihi IS NULL)
    OR
    (durum IN ('kapali', 'iptal')
      AND kapatan_kullanici_id IS NOT NULL
      AND length(btrim(COALESCE(kapatma_nedeni, ''))) >= 5)
  )
);

CREATE INDEX cam_tedarik_baglantilari_tedarikci_idx
  ON public.cam_tedarik_baglantilari(tedarikci_id, durum, baslangic_tarihi DESC);

CREATE OR REPLACE FUNCTION public.cam_baglantisi_durumunu_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CAM_BAGLANTISI_SILINEMEZ';
  END IF;
  IF OLD.durum = 'taslak' AND NEW.durum NOT IN ('taslak', 'aktif', 'iptal') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CAM_BAGLANTISI_DURUM_GECISI_GECERSIZ';
  ELSIF OLD.durum = 'aktif' AND NEW.durum NOT IN ('aktif', 'kapali') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CAM_BAGLANTISI_DURUM_GECISI_GECERSIZ';
  ELSIF OLD.durum IN ('kapali', 'iptal') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CAM_BAGLANTISI_DEGISTIRILEMEZ';
  END IF;
  IF OLD.durum = 'aktif' AND NEW.durum = 'aktif'
     AND (to_jsonb(OLD) - 'updated_at' - 'revision_no')
         IS DISTINCT FROM (to_jsonb(NEW) - 'updated_at' - 'revision_no') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AKTIF_CAM_BAGLANTISI_DEGISTIRILEMEZ';
  END IF;
  NEW.updated_at := now();
  NEW.revision_no := OLD.revision_no + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cam_tedarik_baglantilari_guard
  BEFORE UPDATE OR DELETE ON public.cam_tedarik_baglantilari
  FOR EACH ROW EXECUTE FUNCTION public.cam_baglantisi_durumunu_koru();

COMMENT ON COLUMN public.cam_tedarik_baglantilari.toplam_tutar IS
  'Bilgi amaçlı bağlantı tutarıdır; satın alma veya tüketimle otomatik azaltılmaz.';

