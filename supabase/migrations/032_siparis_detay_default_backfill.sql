-- Eski/eksik kayitlarda batch secimini kilitleyen bos detay degerlerini duzelt.
UPDATE siparis_detaylari
SET adet = 1
WHERE adet IS NULL OR adet <= 0;

UPDATE siparis_detaylari
SET uretim_durumu = 'bekliyor'
WHERE uretim_durumu IS NULL;

ALTER TABLE siparis_detaylari
ALTER COLUMN adet SET DEFAULT 1;

ALTER TABLE siparis_detaylari
ALTER COLUMN uretim_durumu SET DEFAULT 'bekliyor';
