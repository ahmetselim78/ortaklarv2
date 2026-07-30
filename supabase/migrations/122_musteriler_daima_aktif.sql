-- 122 - Musteri carileri daima aktif tut

SET search_path = public, extensions, pg_catalog;

UPDATE public.cari
SET aktif = true
WHERE tipi = 'musteri'
  AND aktif = false;

ALTER TABLE public.cari
  DROP CONSTRAINT IF EXISTS cari_musteriler_daima_aktif_check;

ALTER TABLE public.cari
  ADD CONSTRAINT cari_musteriler_daima_aktif_check
  CHECK (tipi <> 'musteri' OR aktif);

COMMENT ON CONSTRAINT cari_musteriler_daima_aktif_check ON public.cari IS
  'Musteri carileri pasiflestirilemez; aktiflik yonetimi yalniz tedarikciler icin kullanilir.';
