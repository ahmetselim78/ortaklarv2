-- =========================================================
-- 009 — Takvim Notları
-- Her güne özel not saklar; takvim bileşeni tarafından kullanılır.
-- tarih sütununa UNIQUE kısıtı var: her gün için en fazla 1 not.
-- =========================================================

create table if not exists takvim_notlari (
  id         uuid        primary key default gen_random_uuid(),
  tarih      date        not null unique,
  not_metni  text        not null default '',
  created_at timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);

-- RLS
alter table takvim_notlari enable row level security;
create policy "takvim_notlari_herkese_acik" on takvim_notlari
  for all using (true) with check (true);
