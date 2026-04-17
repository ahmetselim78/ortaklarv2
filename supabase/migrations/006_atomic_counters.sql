-- =============================================================
-- Atomic ID generation — sayac tablosu + fonksiyon
-- Race condition sorununu çözer (TOCTOU)
-- =============================================================

-- 1. Sayac tablosu
CREATE TABLE IF NOT EXISTS sayaclar (
  anahtar TEXT PRIMARY KEY,
  deger   INTEGER NOT NULL DEFAULT 0
);

-- 2. Atomic artırma fonksiyonu (UPSERT ile row-level lock)
CREATE OR REPLACE FUNCTION sonraki_sayac(p_anahtar TEXT, p_adet INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE
  yeni_deger INTEGER;
BEGIN
  INSERT INTO sayaclar (anahtar, deger)
  VALUES (p_anahtar, p_adet)
  ON CONFLICT (anahtar) DO UPDATE SET deger = sayaclar.deger + p_adet
  RETURNING deger INTO yeni_deger;

  RETURN yeni_deger;
END;
$$ LANGUAGE plpgsql;

-- 3. Mevcut verilerden sayac başlatma

-- cam_kodu: GLS-XXXX (minimum 1000, ilk üretilen = 1001)
INSERT INTO sayaclar (anahtar, deger)
SELECT 'cam_kodu',
       GREATEST(COALESCE(MAX(CAST(REPLACE(cam_kodu, 'GLS-', '') AS INTEGER)), 0), 1000)
FROM siparis_detaylari
WHERE cam_kodu ~ '^GLS-\d+$'
ON CONFLICT (anahtar) DO UPDATE SET deger = GREATEST(sayaclar.deger, EXCLUDED.deger);

-- cari_kod: C-XXXX
INSERT INTO sayaclar (anahtar, deger)
SELECT 'cari_kod',
       COALESCE(MAX(CAST(REPLACE(kod, 'C-', '') AS INTEGER)), 0)
FROM cari
WHERE kod ~ '^C-\d+$'
ON CONFLICT (anahtar) DO UPDATE SET deger = GREATEST(sayaclar.deger, EXCLUDED.deger);

-- stok_kod: S-XXXX
INSERT INTO sayaclar (anahtar, deger)
SELECT 'stok_kod',
       COALESCE(MAX(CAST(REPLACE(kod, 'S-', '') AS INTEGER)), 0)
FROM stok
WHERE kod ~ '^S-\d+$'
ON CONFLICT (anahtar) DO UPDATE SET deger = GREATEST(sayaclar.deger, EXCLUDED.deger);

-- siparis_no: SIP-YYYY-XXXX (yıl bazlı)
INSERT INTO sayaclar (anahtar, deger)
SELECT 'siparis_no_' || EXTRACT(YEAR FROM NOW())::TEXT,
       COALESCE(MAX(CAST(SPLIT_PART(siparis_no, '-', 3) AS INTEGER)), 0)
FROM siparisler
WHERE siparis_no LIKE 'SIP-' || EXTRACT(YEAR FROM NOW())::TEXT || '-%'
ON CONFLICT (anahtar) DO UPDATE SET deger = GREATEST(sayaclar.deger, EXCLUDED.deger);

-- batch_no: BATCH-YYYY-XXXX (yıl bazlı)
INSERT INTO sayaclar (anahtar, deger)
SELECT 'batch_no_' || EXTRACT(YEAR FROM NOW())::TEXT,
       COALESCE(MAX(CAST(SPLIT_PART(batch_no, '-', 3) AS INTEGER)), 0)
FROM uretim_emirleri
WHERE batch_no LIKE 'BATCH-' || EXTRACT(YEAR FROM NOW())::TEXT || '-%'
ON CONFLICT (anahtar) DO UPDATE SET deger = GREATEST(sayaclar.deger, EXCLUDED.deger);

-- 4. Aynı cam parçasının aynı batch'e iki kez eklenmesini engelle
ALTER TABLE uretim_emri_detaylari
  ADD CONSTRAINT uretim_emri_detaylari_unique_cam
  UNIQUE (uretim_emri_id, siparis_detay_id);

-- 5. RLS
ALTER TABLE sayaclar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON sayaclar FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON sayaclar FOR ALL TO anon USING (true) WITH CHECK (true);
