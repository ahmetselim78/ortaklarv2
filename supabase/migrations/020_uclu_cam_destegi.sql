-- =========================================================
-- 020 — Üçlü Cam Desteği (4+ara1+orta+ara2+iç)
-- =========================================================
-- Mevcut yapı: dis_kalinlik_mm + ara_bosluk_mm + stok.kalinlik_mm (iç)
-- → sadece çift cam (2 katman) modelleyebiliyor.
--
-- Bu migration üçlü camı (asimetrik destekli) ekler:
--   katman_sayisi = 2 → 4+16+4              (mevcut davranış)
--   katman_sayisi = 3 → 4+12+4+16+5         (orta_kalinlik_mm + ara_bosluk_2_mm)
-- =========================================================

-- Katman sayısı (2 = çift, 3 = üçlü). Default 2 → mevcut satırlar etkilenmez.
alter table siparis_detaylari
  add column if not exists katman_sayisi smallint not null default 2;

-- Üçlü cam için ek alanlar (çift camda NULL kalır).
alter table siparis_detaylari
  add column if not exists orta_kalinlik_mm numeric;

alter table siparis_detaylari
  add column if not exists ara_bosluk_2_mm numeric;

-- Constraint: katman_sayisi 2 ya da 3 olmalı.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'siparis_detaylari_katman_sayisi_check'
  ) then
    alter table siparis_detaylari
      add constraint siparis_detaylari_katman_sayisi_check
      check (katman_sayisi in (2, 3));
  end if;
end$$;

-- Constraint: üçlü camda orta_kalinlik_mm ve ara_bosluk_2_mm zorunlu.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'siparis_detaylari_uclu_alanlar_check'
  ) then
    alter table siparis_detaylari
      add constraint siparis_detaylari_uclu_alanlar_check
      check (
        katman_sayisi = 2
        or (orta_kalinlik_mm is not null and ara_bosluk_2_mm is not null)
      );
  end if;
end$$;
