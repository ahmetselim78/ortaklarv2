-- Üretim emirleri için 'onaylandi' kaldırıldı, 'iptal' eklendi
ALTER TABLE uretim_emirleri DROP CONSTRAINT IF EXISTS uretim_emirleri_durum_check;

ALTER TABLE uretim_emirleri ADD CONSTRAINT uretim_emirleri_durum_check
  CHECK (durum IN ('hazirlaniyor','export_edildi','yikamada','tamamlandi','eksik_var','iptal'));

-- Eğer 'onaylandi' durumunda kayıtlar varsa 'hazirlaniyor'a çek
UPDATE uretim_emirleri SET durum = 'hazirlaniyor' WHERE durum = 'onaylandi';
