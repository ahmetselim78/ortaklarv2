-- 088 - Bir stok için tarih aralığında kullanılan maliyet fiyatı

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.stok_maliyet_kaynagi_atamalari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  fiyat_id uuid NOT NULL REFERENCES public.stok_alis_fiyatlari(id) ON DELETE RESTRICT,
  kaynak_turu text NOT NULL CHECK (kaynak_turu IN ('dogrudan_fiyat', 'cam_baglantisi')),
  kaynak_id uuid NOT NULL,
  gecerlilik_donemi tstzrange NOT NULL,
  aktiflestiren_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  kapatan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  aktiflestirme_nedeni text NOT NULL CHECK (length(btrim(aktiflestirme_nedeni)) >= 5),
  kapatma_nedeni text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK (NOT isempty(gecerlilik_donemi)),
  CHECK (lower_inc(gecerlilik_donemi) AND NOT upper_inc(gecerlilik_donemi)),
  CHECK (
    (upper_inf(gecerlilik_donemi)
      AND kapatan_kullanici_id IS NULL
      AND kapatma_nedeni IS NULL
      AND closed_at IS NULL)
    OR
    (NOT upper_inf(gecerlilik_donemi)
      AND kapatan_kullanici_id IS NOT NULL
      AND length(btrim(COALESCE(kapatma_nedeni, ''))) >= 5
      AND closed_at IS NOT NULL)
  )
);

CREATE INDEX stok_maliyet_kaynagi_stok_idx
  ON public.stok_maliyet_kaynagi_atamalari(stok_id, lower(gecerlilik_donemi) DESC);
CREATE INDEX stok_maliyet_kaynagi_fiyat_idx
  ON public.stok_maliyet_kaynagi_atamalari(fiyat_id);
CREATE INDEX stok_maliyet_kaynagi_kaynak_idx
  ON public.stok_maliyet_kaynagi_atamalari(kaynak_turu, kaynak_id);

CREATE OR REPLACE FUNCTION public.stok_maliyet_kaynagi_degisimini_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MALIYET_KAYNAK_DONEMI_SILINEMEZ';
  END IF;

  IF OLD.stok_id IS DISTINCT FROM NEW.stok_id
     OR OLD.fiyat_id IS DISTINCT FROM NEW.fiyat_id
     OR OLD.kaynak_turu IS DISTINCT FROM NEW.kaynak_turu
     OR OLD.kaynak_id IS DISTINCT FROM NEW.kaynak_id
     OR lower(OLD.gecerlilik_donemi) IS DISTINCT FROM lower(NEW.gecerlilik_donemi)
     OR OLD.aktiflestiren_kullanici_id IS DISTINCT FROM NEW.aktiflestiren_kullanici_id
     OR OLD.aktiflestirme_nedeni IS DISTINCT FROM NEW.aktiflestirme_nedeni
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR NOT upper_inf(OLD.gecerlilik_donemi)
     OR upper_inf(NEW.gecerlilik_donemi) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MALIYET_KAYNAK_DONEMI_DEGISTIRILEMEZ';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stok_maliyet_kaynagi_guard
  BEFORE UPDATE OR DELETE ON public.stok_maliyet_kaynagi_atamalari
  FOR EACH ROW EXECUTE FUNCTION public.stok_maliyet_kaynagi_degisimini_koru();

COMMENT ON COLUMN public.stok_maliyet_kaynagi_atamalari.gecerlilik_donemi IS
  '[başlangıç, bitiş) zaman aralığı; exclusion constraint aynı stokta çakışmayı engeller.';

