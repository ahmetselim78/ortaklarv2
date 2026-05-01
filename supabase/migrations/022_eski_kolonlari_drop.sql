-- =========================================================
-- 022 — Eski kolonların temizliği
-- =========================================================
-- 021'de sd.katman_yapisi tek doğruluk kaynağı oldu.
-- Üretim/önizleme test sürecinden sonra eski kolonlar artık ölü ağırlık.
--
-- Bu migration:
--   * siparis_detaylari'dan kompozisyon-türev kolonlarını düşürür
--     (dis_kalinlik_mm, ara_bosluk_mm, katman_sayisi,
--      orta_kalinlik_mm, ara_bosluk_2_mm)
--   * stok'tan kullanılmayan tip & renk kolonlarını düşürür
--
-- KEEP edilenler:
--   * stok.kalinlik_mm  → cam stok kaydında zorunlu
--   * stok.tedarikci_id → cita & yan_malzeme için kullanılıyor
--   * sd.katman_yapisi  → 021'de eklendi, format check ile korunuyor
--
-- ÖNEMLİ: Kod tarafında bu kolonlara hiçbir SELECT/INSERT/UPDATE
-- atıfı kalmamış olmalı. (PozGirisPage, pdfParser, StokForm,
-- cam.ts, types/* temizlendi.)
-- =========================================================

begin;

-- 1) siparis_detaylari — kompozisyon-türev kolonları
alter table siparis_detaylari
  drop column if exists dis_kalinlik_mm,
  drop column if exists ara_bosluk_mm,
  drop column if exists katman_sayisi,
  drop column if exists orta_kalinlik_mm,
  drop column if exists ara_bosluk_2_mm;

-- 2) stok — kullanılmayan tip/renk
alter table stok
  drop column if exists tip,
  drop column if exists renk;

-- 3) Eski 020 constraint'leri varsa düşür (021'de düşürülmüş olabilir,
--    burada idempotent kalsın)
alter table siparis_detaylari
  drop constraint if exists siparis_detaylari_uclu_alanlar_check,
  drop constraint if exists siparis_detaylari_katman_sayisi_check;

commit;

-- =========================================================
-- Doğrulama (manuel):
--   \d siparis_detaylari    → katman_yapisi var, eskiler yok
--   \d stok                 → tip & renk yok
-- =========================================================
