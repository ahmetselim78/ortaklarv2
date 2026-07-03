-- ============================================================
-- 029 — gunluk_uretim_raporlari için (tarih, operator_id) UNIQUE kısıtı
-- ============================================================
-- 028 migration'ı ile tarih sütunundaki UNIQUE kısıtı kaldırılmıştı
-- (aynı gün birden fazla operatörün bağımsız kayıt girebilmesi için).
-- Ancak uygulama tarafında upsert işlemi hâlâ
-- `onConflict: 'tarih'` kullanıyordu. Veritabanında bu sütun(lar)
-- için bir UNIQUE/EXCLUSION kısıtı kalmayınca PostgREST upsert isteği
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" hatasıyla HTTP 400 döndürüyordu — üretim giriş
-- ekranında "kayıt edilemiyor" hatasının kök nedeni budur.
--
-- Çözüm: Her operatörün her gün için tek bir raporu olacak şekilde
-- (tarih, operator_id) bileşik UNIQUE kısıtı ekleniyor. Uygulama kodu
-- da onConflict: 'tarih,operator_id' kullanacak şekilde güncellendi.
-- ============================================================

ALTER TABLE gunluk_uretim_raporlari
  ADD CONSTRAINT gunluk_uretim_raporlari_tarih_operator_key UNIQUE (tarih, operator_id);
