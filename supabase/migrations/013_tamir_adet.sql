-- =========================================================
-- 013 — Tamir Adet
-- tamir_kayitlari tablosuna kaç adet camın tamire
-- gönderildiğini takip eden adet sütunu ekleniyor.
-- =========================================================

alter table tamir_kayitlari
  add column if not exists adet integer not null default 1;
