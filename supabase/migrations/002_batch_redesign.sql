-- 1. ara_bosluk_mm kolonunu ekle (varsa atla)
ALTER TABLE siparis_detaylari ADD COLUMN IF NOT EXISTS ara_bosluk_mm NUMERIC;

-- 2. Eski durum constraint'ini kaldır
ALTER TABLE uretim_emirleri DROP CONSTRAINT IF EXISTS uretim_emirleri_durum_check;

-- 3. Yeni durum constraint'ini ekle (eksik_var dahil)
ALTER TABLE uretim_emirleri ADD CONSTRAINT uretim_emirleri_durum_check
  CHECK (durum IN ('hazirlaniyor','onaylandi','export_edildi','yikamada','tamamlandi','eksik_var'));
