-- =========================================================
-- 011 — Tamir Durumu Güncelleme
-- "tamir_ediliyor" adımı kaldırılıyor:
--   bekliyor → tamamlandı (direkt geçiş)
-- Hurdaya ayrılan camlar üretim kuyruğuna geri düşer:
--   hurda kaydı → siparis_detaylari.uretim_durumu = 'bekliyor'
-- =========================================================

-- 1. Mevcut tamir_ediliyor kayıtları bekliyora al
update tamir_kayitlari
  set durum = 'bekliyor'
  where durum = 'tamir_ediliyor';

-- 2. Kısıtlamayı yeniden oluştur (tamir_ediliyor çıkarıldı)
alter table tamir_kayitlari
  drop constraint if exists tamir_durum_check;

alter table tamir_kayitlari
  add constraint tamir_durum_check
  check (durum in ('bekliyor', 'tamamlandi', 'hurda'));
