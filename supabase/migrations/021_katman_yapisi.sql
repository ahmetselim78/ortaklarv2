-- =========================================================
-- 021 — Tek 'katman_yapisi' alanı + Stok adı temizliği
-- =========================================================
-- Model değişikliği:
--   ÖNCE: stok.kalinlik_mm + sd.dis_kalinlik_mm + sd.ara_bosluk_mm
--         (+ 020: katman_sayisi + orta_kalinlik_mm + ara_bosluk_2_mm)
--   ŞİMDİ: sd.katman_yapisi TEXT  →  '4+16+4', '4+12+4+16+5', '4+14+5'
--
-- Eski kolonlar HENÜZ DROP edilmiyor — production test sonrası 022'de düşürülür.
-- Geriye dönüşlü olsun diye uygulamada fallback var.
-- =========================================================

-- 1) Yeni alan
alter table siparis_detaylari
  add column if not exists katman_yapisi text;

-- 2) Mevcut çift cam satırlarını backfill et:
--    "{dis}+{ara}+{ic}"  (ic = stok.kalinlik_mm)
update siparis_detaylari sd
   set katman_yapisi = trim(both '+' from
     coalesce((sd.dis_kalinlik_mm)::text, '') || '+' ||
     coalesce((sd.ara_bosluk_mm)::text, '')   || '+' ||
     coalesce((s.kalinlik_mm)::text, ''))
  from stok s
 where sd.stok_id = s.id
   and sd.katman_yapisi is null
   and sd.dis_kalinlik_mm is not null
   and sd.ara_bosluk_mm  is not null
   and s.kalinlik_mm     is not null;

-- 3) Stok adlarındaki kompozisyon prefix'ini temizle.
--    '4+16+4 Buzlu'        -> 'Buzlu'
--    '4+16+4+16+4 KONFOR'  -> 'KONFOR'
--    '4+14+5 TEMP'         -> 'TEMP'
--    Dokunulmaması gerekenler (örn. 'Buzlu 4mm') aynen kalır — regex sadece
--    BAŞTAKİ "sayı+sayı..." dizisini hedefler.
update stok
   set ad = trim(regexp_replace(ad, '^\s*\d+(\s*\+\s*\d+)+\s*', '', 'g'))
 where kategori = 'cam'
   and ad ~ '^\s*\d+(\s*\+\s*\d+)+';

-- 4) 020 numaralı migration ile gelen 3-katman check constraint'lerini düşür:
--    Artık katman_yapisi TEK doğruluk kaynağı. Eski kolonlar deprecated, NULL kalabilir.
alter table siparis_detaylari
  drop constraint if exists siparis_detaylari_uclu_alanlar_check;

alter table siparis_detaylari
  drop constraint if exists siparis_detaylari_katman_sayisi_check;

-- 5) Hafif format kontrolü: katman_yapisi sadece "sayı(+sayı){1..4}" desenine uymalı.
--    NULL serbest (eski kayıt + henüz girilmemiş satır). Boş string kabul edilmez.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'siparis_detaylari_katman_yapisi_format_check'
  ) then
    alter table siparis_detaylari
      add constraint siparis_detaylari_katman_yapisi_format_check
      check (katman_yapisi is null or katman_yapisi ~ '^\d+(\+\d+){1,4}$');
  end if;
end$$;
