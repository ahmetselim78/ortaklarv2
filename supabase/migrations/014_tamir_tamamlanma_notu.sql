-- Üretim emirleri için 'iptal' durumu ekle
ALTER TABLE uretim_emirleri DROP CONSTRAINT IF EXISTS uretim_emirleri_durum_check;

ALTER TABLE uretim_emirleri ADD CONSTRAINT uretim_emirleri_durum_check
  CHECK (durum IN ('hazirlaniyor','onaylandi','export_edildi','yikamada','tamamlandi','eksik_var','iptal'));
