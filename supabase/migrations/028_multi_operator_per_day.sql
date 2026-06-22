-- ============================================================
-- 028 — Günde birden fazla operatör girişi desteği
-- ============================================================
-- Daha önce gunluk_uretim_raporlari.tarih sütununda UNIQUE kısıtı vardı.
-- Bu kısıt nedeniyle ikinci operatör aynı gün giriş yaptığında
-- birinci operatörün kaydı siliniyordu (upsert çakışması).
-- Bu migration ile UNIQUE kısıtı kaldırılarak aynı gün için
-- birden fazla operatörün bağımsız kayıt girebilmesi sağlanır.
-- ============================================================

ALTER TABLE gunluk_uretim_raporlari
  DROP CONSTRAINT IF EXISTS gunluk_uretim_raporlari_tarih_key;
