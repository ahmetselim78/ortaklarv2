-- =========================================================
-- 019 — Sipariş Kaynağı + Temiz Cam Detay Kolonları
-- =========================================================

-- 1) siparisler.kaynak: PDF mi manuel mi?
alter table siparisler
  add column if not exists kaynak text not null default 'manuel'
  check (kaynak in ('pdf', 'manuel'));

-- Backfill: PDF'den geldiği "Sipariş No: ..." notlarından anlaşılan kayıtları işaretle
update siparisler
   set kaynak = 'pdf'
 where kaynak = 'manuel'
   and notlar is not null
   and notlar ilike 'PDF Import%';

-- 2) siparis_detaylari: PDF özel bilgiler için ayrı kolonlar
alter table siparis_detaylari
  add column if not exists dis_kalinlik_mm numeric;     -- 4 / 5 / 6 / 8

alter table siparis_detaylari
  add column if not exists menfez_cap_mm integer;       -- Ø işareti yanındaki çap

alter table siparis_detaylari
  add column if not exists kucuk_cam boolean not null default false;  -- * işareti

-- Backfill: notlar string'inden bilgileri ayrı kolonlara taşı
update siparis_detaylari
   set menfez_cap_mm = coalesce(menfez_cap_mm,
                                nullif(substring(notlar from 'Menfez\s*Ø\s*(\d+)'), '')::int)
 where notlar ~* 'Menfez\s*Ø\s*\d+';

update siparis_detaylari
   set kucuk_cam = true
 where kucuk_cam = false
   and notlar ~* '(%20|kucuk|küçük)';

-- 3) Poz tutarlılığı: Bazı eski kayıtlarda poz `notlar`'a "Poz: K1" şeklinde
-- yazılmış olabilir. Boş poz + notlarda "Poz: X" varsa poz kolonuna taşı.
update siparis_detaylari
   set poz = trim(substring(notlar from 'Poz\s*[:\-]\s*([A-Za-z0-9]+)'))
 where (poz is null or poz = '')
   and notlar ~* 'Poz\s*[:\-]\s*[A-Za-z0-9]+';
