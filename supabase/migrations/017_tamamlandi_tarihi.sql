-- 017 — siparisler tablosuna tamamlandi_tarihi kolonu ekleme
alter table siparisler
  add column if not exists tamamlandi_tarihi timestamptz;
