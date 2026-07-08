-- =========================================================
-- 039 — siparis_detaylari.katman_yapisi kolonunu kaldır
-- =========================================================
-- Kompozisyon bilgisi yalnızca stok kartında tutulur (stok.katman_yapisi + stok.ad).
-- 038 ile veriler NULL yapıldı; bu migration kolonu tamamen düşürür.

alter table siparis_detaylari
  drop constraint if exists siparis_detaylari_katman_yapisi_format_check;

alter table siparis_detaylari
  drop column if exists katman_yapisi;
