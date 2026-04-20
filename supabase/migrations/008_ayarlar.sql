-- =========================================================
-- 008 — Uygulama Ayarları
-- Genel uygulama ayarlarını JSON olarak saklar
-- =========================================================

create table if not exists ayarlar (
  id           uuid        primary key default gen_random_uuid(),
  anahtar      text        not null unique,  -- 'etiket_ayarlari', 'genel_ayarlar' vb.
  deger        jsonb       not null default '{}',
  guncelleme   timestamptz not null default now()
);

-- Varsayılan etiket ayarlarını ekle
insert into ayarlar (anahtar, deger)
values (
  'etiket_ayarlari',
  '{
    "yazici": {
      "ip_adresi": "",
      "port": 9100
    },
    "boyut": {
      "genislik_mm": 100,
      "yukseklik_mm": 50
    },
    "icerik": {
      "barkod": true,
      "cam_kodu": true,
      "musteri_adi": true,
      "boyut": true,
      "sira_no": true,
      "siparis_no": false,
      "tarih": false
    },
    "yazdirma_kosulu": "otomatik",
    "dpl_sablonu": ""
  }'::jsonb
)
on conflict (anahtar) do nothing;

-- RLS
alter table ayarlar enable row level security;
create policy "ayarlar_herkese_acik" on ayarlar
  for all using (true) with check (true);
