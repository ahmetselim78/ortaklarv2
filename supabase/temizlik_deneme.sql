-- ============================================================
-- DENEME ORTAMI - Seçili tabloları temizleme
-- ============================================================
-- Bu script yalnızca istenen tabloları sıfırlar.
-- Supabase SQL Editor'da çalıştırın.
-- ============================================================

BEGIN;

-- 1. Tamir paneli kayıtları
DELETE FROM tamir_kayitlari;

-- 2. Üretim ve sipariş kayıtları
DELETE FROM uretim_emirleri;
DELETE FROM siparisler;

-- 3. Katalog / yardımcı tablolar
DELETE FROM cari;
DELETE FROM stok;

COMMIT;

-- Kontrol sorguları
SELECT 'cari' AS tablo, COUNT(*) AS kayit_sayisi FROM cari
UNION ALL
SELECT 'stok', COUNT(*) FROM stok
UNION ALL
SELECT 'siparisler', COUNT(*) FROM siparisler
UNION ALL
SELECT 'uretim_emirleri', COUNT(*) FROM uretim_emirleri
UNION ALL
SELECT 'tamir_kayitlari', COUNT(*) FROM tamir_kayitlari;
