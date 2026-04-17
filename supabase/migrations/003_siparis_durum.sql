-- Sipariş durum constraint'ini güncelle
-- 'onaylandi' ve 'uretimdee' kaldırılıyor, yerine 'batchte', 'yikamada', 'eksik_var' geliyor

-- 1. Mevcut constraint'i kaldır
ALTER TABLE siparisler DROP CONSTRAINT IF EXISTS siparisler_durum_check;

-- 2. Yeni constraint ekle
ALTER TABLE siparisler ADD CONSTRAINT siparisler_durum_check
  CHECK (durum IN ('beklemede','batchte','yikamada','tamamlandi','eksik_var','iptal'));

-- 3. Mevcut 'onaylandi' olanları 'beklemede'ye çek
UPDATE siparisler SET durum = 'beklemede' WHERE durum = 'onaylandi';

-- 4. Mevcut 'uretimdee' olanları 'batchte'ye çek
UPDATE siparisler SET durum = 'batchte' WHERE durum = 'uretimdee';
