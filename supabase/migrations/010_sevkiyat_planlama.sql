-- =========================================================
-- 010 — Şirket Araçları & Sevkiyat Planlaması
-- =========================================================

-- Araçlar tablosu
create table if not exists araclar (
  id           uuid        primary key default gen_random_uuid(),
  plaka        text        not null unique,
  ad           text        not null,          -- Örn: "Ford Transit Beyaz"
  kapasite_m2  numeric(8,2),                  -- Taşıma kapasitesi (isteğe bağlı)
  aktif        boolean     not null default true,
  notlar       text,
  created_at   timestamptz not null default now()
);

-- Sevkiyat planları: hangi sipariş, hangi araç, hangi tarih
create table if not exists sevkiyat_planlari (
  id           uuid        primary key default gen_random_uuid(),
  siparis_id   uuid        not null references siparisler(id) on delete cascade,
  arac_id      uuid        not null references araclar(id) on delete cascade,
  tarih        date        not null,
  notlar       text,
  created_at   timestamptz not null default now(),
  guncelleme   timestamptz not null default now(),
  -- Bir sipariş aynı tarih için sadece bir araçta planlanabilir
  unique (siparis_id, tarih)
);

-- RLS
alter table araclar enable row level security;
create policy "araclar_herkese_acik" on araclar
  for all using (true) with check (true);

alter table sevkiyat_planlari enable row level security;
create policy "sevkiyat_planlari_herkese_acik" on sevkiyat_planlari
  for all using (true) with check (true);

-- Örnek araçlar (isteğe bağlı, uygulama üzerinden de eklenebilir)
insert into araclar (plaka, ad) values
  ('34 ABC 001', 'Araç 1'),
  ('34 ABC 002', 'Araç 2')
on conflict (plaka) do nothing;
