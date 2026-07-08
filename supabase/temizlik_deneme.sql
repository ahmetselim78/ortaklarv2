-- ============================================================
-- DENEME ORTAMI - Tüm Migration Tablolarını Temizleme
-- ============================================================
-- Bu script, migrationlarla oluşturulan tüm tablo verilerini
-- siler. Bağımlı tablolar önce temizlenir.
-- Supabase SQL Editor'da çalıştırın.
-- ============================================================

BEGIN;

-- 1. En alt seviyedeki bağlı kayıtlar
DELETE FROM gunluk_uretim_arac_yuklemeleri;
DELETE FROM gunluk_uretim_istasyon_kayitlari;
DELETE FROM yikama_loglari;
DELETE FROM uretim_emri_detaylari;
DELETE FROM sevkiyat_planlari;
DELETE FROM tamir_kayitlari;

-- 2. Günlük üretim ve rapor tabloları
DELETE FROM gunluk_uretim_raporlari;
DELETE FROM uretim_istasyonlari;
DELETE FROM gunluk_uretim_takip;

-- 3. Telegram ve personel tabloları
DELETE FROM telegram_rapor_log;
DELETE FROM telegram_rapor_saatleri;
DELETE FROM telegram_ayarlari;
DELETE FROM hr_personel;

-- 4. Ayarlar ve şablon tabloları
DELETE FROM uretim_saatlik_hedefler;
DELETE FROM uretim_saat_sablonlari;
DELETE FROM takvim_notlari;
DELETE FROM ayarlar;

-- 5. Ana iş tabloları
DELETE FROM uretim_emirleri;
DELETE FROM siparis_detaylari;
DELETE FROM siparisler;

-- 6. Katalog / yardımcı tablolar
DELETE FROM araclar;
DELETE FROM stok;
DELETE FROM cari;

-- 7. Sayaçları sıfırla
UPDATE sayaclar SET deger = 0;

COMMIT;

-- Kontrol sorguları
SELECT 'cari' AS tablo, COUNT(*) AS kayit_sayisi FROM cari
UNION ALL
SELECT 'stok', COUNT(*) FROM stok
UNION ALL
SELECT 'siparisler', COUNT(*) FROM siparisler
UNION ALL
SELECT 'siparis_detaylari', COUNT(*) FROM siparis_detaylari
UNION ALL
SELECT 'uretim_emirleri', COUNT(*) FROM uretim_emirleri
UNION ALL
SELECT 'uretim_emri_detaylari', COUNT(*) FROM uretim_emri_detaylari
UNION ALL
SELECT 'yikama_loglari', COUNT(*) FROM yikama_loglari
UNION ALL
SELECT 'tamir_kayitlari', COUNT(*) FROM tamir_kayitlari
UNION ALL
SELECT 'sevkiyat_planlari', COUNT(*) FROM sevkiyat_planlari
UNION ALL
SELECT 'araclar', COUNT(*) FROM araclar
UNION ALL
SELECT 'hr_personel', COUNT(*) FROM hr_personel
UNION ALL
SELECT 'telegram_ayarlari', COUNT(*) FROM telegram_ayarlari
UNION ALL
SELECT 'telegram_rapor_saatleri', COUNT(*) FROM telegram_rapor_saatleri
UNION ALL
SELECT 'telegram_rapor_log', COUNT(*) FROM telegram_rapor_log
UNION ALL
SELECT 'uretim_saat_sablonlari', COUNT(*) FROM uretim_saat_sablonlari
UNION ALL
SELECT 'uretim_saatlik_hedefler', COUNT(*) FROM uretim_saatlik_hedefler
UNION ALL
SELECT 'gunluk_uretim_takip', COUNT(*) FROM gunluk_uretim_takip
UNION ALL
SELECT 'uretim_istasyonlari', COUNT(*) FROM uretim_istasyonlari
UNION ALL
SELECT 'gunluk_uretim_raporlari', COUNT(*) FROM gunluk_uretim_raporlari
UNION ALL
SELECT 'gunluk_uretim_istasyon_kayitlari', COUNT(*) FROM gunluk_uretim_istasyon_kayitlari
UNION ALL
SELECT 'gunluk_uretim_arac_yuklemeleri', COUNT(*) FROM gunluk_uretim_arac_yuklemeleri
UNION ALL
SELECT 'takvim_notlari', COUNT(*) FROM takvim_notlari
UNION ALL
SELECT 'ayarlar', COUNT(*) FROM ayarlar
UNION ALL
SELECT 'sayaclar', COUNT(*) FROM sayaclar;
