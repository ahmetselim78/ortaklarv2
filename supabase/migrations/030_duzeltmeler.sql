-- ============================================================
-- 030 - Mantik duzeltmeleri ve guvenli sayac RPC'leri
-- ============================================================

-- Tamir istasyonu kodu bu kolonu kullaniyor; 014 dosyasi farkli icerikte.
ALTER TABLE tamir_kayitlari
  ADD COLUMN IF NOT EXISTS tamamlanma_notu text;

-- Es zamanli taramalarda kayip sayim olmamasi icin atomik +N RPC.
CREATE OR REPLACE FUNCTION public.saatlik_sayac_arttir(
  p_id uuid,
  p_delta integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yeni_deger integer;
BEGIN
  UPDATE gunluk_uretim_takip
  SET gerceklesen_adet = GREATEST(0, gerceklesen_adet + p_delta)
  WHERE id = p_id
  RETURNING gerceklesen_adet INTO yeni_deger;

  IF yeni_deger IS NULL THEN
    RAISE EXCEPTION 'gunluk_uretim_takip satiri bulunamadi: %', p_id;
  END IF;

  RETURN yeni_deger;
END;
$$;

CREATE OR REPLACE FUNCTION public.saatlik_fire_arttir(
  p_id uuid,
  p_delta integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yeni_deger integer;
BEGIN
  UPDATE gunluk_uretim_takip
  SET fire_adet = GREATEST(0, fire_adet + p_delta)
  WHERE id = p_id
  RETURNING fire_adet INTO yeni_deger;

  IF yeni_deger IS NULL THEN
    RAISE EXCEPTION 'gunluk_uretim_takip satiri bulunamadi: %', p_id;
  END IF;

  RETURN yeni_deger;
END;
$$;

GRANT EXECUTE ON FUNCTION public.saatlik_sayac_arttir(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saatlik_fire_arttir(uuid, integer) TO anon, authenticated;

-- Performans indeksleri
CREATE INDEX IF NOT EXISTS idx_siparisler_durum
  ON siparisler(durum);

CREATE INDEX IF NOT EXISTS idx_siparis_detaylari_siparis_id
  ON siparis_detaylari(siparis_id);

CREATE INDEX IF NOT EXISTS idx_uretim_emri_detaylari_siparis_detay_id
  ON uretim_emri_detaylari(siparis_detay_id);

CREATE INDEX IF NOT EXISTS idx_gunluk_uretim_raporlari_tarih
  ON gunluk_uretim_raporlari(tarih);

-- Temel butunluk kontrolleri. NOT VALID mevcut veriye dokunmaz;
-- yeni ekleme/guncellemeler yine kontrol edilir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siparis_detaylari_adet_positive_check'
  ) THEN
    ALTER TABLE siparis_detaylari
      ADD CONSTRAINT siparis_detaylari_adet_positive_check
      CHECK (adet > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siparis_detaylari_olcu_positive_check'
  ) THEN
    ALTER TABLE siparis_detaylari
      ADD CONSTRAINT siparis_detaylari_olcu_positive_check
      CHECK (genislik_mm > 0 AND yukseklik_mm > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gunluk_uretim_takip_adet_nonnegative_check'
  ) THEN
    ALTER TABLE gunluk_uretim_takip
      ADD CONSTRAINT gunluk_uretim_takip_adet_nonnegative_check
      CHECK (hedef_adet >= 0 AND gerceklesen_adet >= 0 AND fire_adet >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gunluk_uretim_raporlari_personel_nonnegative_check'
  ) THEN
    ALTER TABLE gunluk_uretim_raporlari
      ADD CONSTRAINT gunluk_uretim_raporlari_personel_nonnegative_check
      CHECK (toplam_personel >= 0) NOT VALID;
  END IF;
END;
$$;
