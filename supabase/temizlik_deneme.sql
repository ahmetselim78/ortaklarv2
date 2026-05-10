-- ============================================================
-- DENEME ORTAMI - Siparişler ve Üretim Emirleri Temizleme
-- ============================================================
-- Bu script, siparişler ve üretim emirlerine ait tüm verileri
-- siler. Foreign key sırasına göre yapılmalıdır.
-- Supabase SQL Editor'da çalıştırın.
-- ============================================================

BEGIN;

-- 1. Yıkama loglarını temizle (siparis_detaylari'na bağlı)
DELETE FROM yikama_loglari;

-- 2. Üretim emri detaylarını temizle
DELETE FROM uretim_emri_detaylari;

-- 3. Sipariş detaylarını temizle
DELETE FROM siparis_detaylari;

-- 4. Üretim emirlerini temizle
DELETE FROM uretim_emirleri;

-- 5. Siparişleri temizle
DELETE FROM siparisler;

-- 6. Sayaçları sıfırla (cam_kodu, siparis_no, batch_no numaraları)
--    Sadece sipariş/batch/cam sayaçlarını sıfırla, cari ve stok kodlarına dokunma
UPDATE sayaclar SET deger = 0
WHERE anahtar LIKE 'siparis_no_%'
   OR anahtar LIKE 'batch_no_%'
   OR anahtar = 'cam_kodu';

COMMIT;

-- Kontrol sorguları
SELECT 'siparisler' AS tablo, COUNT(*) AS kayit_sayisi FROM siparisler
UNION ALL
SELECT 'siparis_detaylari', COUNT(*) FROM siparis_detaylari
UNION ALL
SELECT 'uretim_emirleri', COUNT(*) FROM uretim_emirleri
UNION ALL
SELECT 'uretim_emri_detaylari', COUNT(*) FROM uretim_emri_detaylari
UNION ALL
SELECT 'yikama_loglari', COUNT(*) FROM yikama_loglari;
