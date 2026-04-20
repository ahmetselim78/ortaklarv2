-- =========================================================
-- 007 — Tamir İstasyonu
-- Üretim hatlarından gelen kırık/sorunlu camların takibi
-- =========================================================

create table if not exists tamir_kayitlari (
  id                 uuid        primary key default gen_random_uuid(),
  cam_kodu           text        not null,
  siparis_detay_id   uuid        references siparis_detaylari(id) on delete set null,
  uretim_emri_id     uuid        references uretim_emirleri(id) on delete set null,
  batch_no           text        not null default '',
  sira_no            integer,

  -- Hangi üretim alt istasyonundan geldi
  kaynak_istasyon    text        not null default 'manuel',
  constraint tamir_kaynak_check check (kaynak_istasyon in ('poz_giris', 'kumanda', 'manuel')),

  -- Sorun türü
  sorun_tipi         text        not null default 'diger',
  constraint tamir_sorun_check check (sorun_tipi in ('kirik', 'cizik', 'olcum_hatasi', 'diger')),

  -- Operatör açıklaması
  aciklama           text,

  -- Tamir durumu
  durum              text        not null default 'bekliyor',
  constraint tamir_durum_check check (durum in ('bekliyor', 'tamir_ediliyor', 'tamamlandi', 'hurda')),

  -- Denormalize gösterim alanları (hızlı okuma için)
  musteri            text        not null default '',
  nihai_musteri      text        not null default '',
  siparis_no         text        not null default '',
  genislik_mm        numeric,
  yukseklik_mm       numeric,
  stok_ad            text        not null default '',

  created_at         timestamptz not null default now(),
  tamamlanma_tarihi  timestamptz
);

-- Indexler
create index if not exists tamir_kayitlari_durum_idx    on tamir_kayitlari (durum);
create index if not exists tamir_kayitlari_cam_kodu_idx on tamir_kayitlari (cam_kodu);
create index if not exists tamir_kayitlari_created_idx  on tamir_kayitlari (created_at desc);

-- RLS
alter table tamir_kayitlari enable row level security;
create policy "tamir_herkese_acik" on tamir_kayitlari
  for all using (true) with check (true);
