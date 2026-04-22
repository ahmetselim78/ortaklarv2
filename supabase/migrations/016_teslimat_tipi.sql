-- 016 — siparisler tablosuna teslimat_tipi kolonu ekleme
alter table siparisler
  add column if not exists teslimat_tipi text not null default 'teslim_alacak';
