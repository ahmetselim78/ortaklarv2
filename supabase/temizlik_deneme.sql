-- ============================================================
-- DENEME ORTAMI - Seçili tabloları temizleme
-- ============================================================
-- Bu script yalnızca istenen tabloları sıfırlar.
-- YALNIZCA izole deneme projesinde Supabase SQL Editor'da çalıştırın.
-- Çalıştırmadan önce hedef proje ref'ini iki kez kontrol edin ve aşağıdaki
-- SET LOCAL satırını bilinçli olarak yorumdan çıkarın.
-- ============================================================

BEGIN;

-- SET LOCAL ortaklar.allow_test_data_cleanup = 'DENEME_VERISINI_SIL';

DO $guard$
BEGIN
  IF current_setting('ortaklar.allow_test_data_cleanup', true)
       IS DISTINCT FROM 'DENEME_VERISINI_SIL' THEN
    RAISE EXCEPTION
      'Güvenlik durdurması: yalnız izole deneme projesinde onay SET LOCAL satırını etkinleştirin';
  END IF;
END
$guard$;

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
