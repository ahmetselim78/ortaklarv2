-- 034 - Cam aile katalogu ve OCR varsayilanlari
-- Cam stogu artik kombinasyon degil aile bilgisidir:
--   Isicam, Isicam Sinerji, Isicam Konfor
-- Kompozisyon siparis_detaylari.katman_yapisi alaninda tutulur.

begin;

alter table stok
  add column if not exists aktif boolean not null default true;

-- Eski "4+16+4 Konfor" gibi kayitlarda bastaki kompozisyonu stok adindan ayir.
update stok
   set ad = trim(regexp_replace(ad, '^\s*\d+(\s*\+\s*\d+){1,4}\s*', '', 'g'))
 where kategori = 'cam'
   and ad ~ '^\s*\d+(\s*\+\s*\d+){1,4}\s*';

-- OCR/stok dili aile diline cekilir. Belirsiz "Sinerji Konfor" gibi kayitlara dokunulmaz.
update stok
   set ad = 'Isıcam Konfor',
       kalinlik_mm = null,
       birim = coalesce(nullif(birim, ''), 'm2'),
       aktif = true
 where kategori = 'cam'
   and ad ~* 'konfor'
   and ad !~* 'sinerji';

update stok
   set ad = 'Isıcam Sinerji',
       kalinlik_mm = null,
       birim = coalesce(nullif(birim, ''), 'm2'),
       aktif = true
 where kategori = 'cam'
   and ad ~* 'sinerji'
   and ad !~* 'konfor';

update stok
   set ad = 'Isıcam',
       kalinlik_mm = null,
       birim = coalesce(nullif(birim, ''), 'm2'),
       aktif = true
 where kategori = 'cam'
   and ad ~* '(çift\s*cam|cift\s*cam|ciftcam|ısıcam|isicam)'
   and ad !~* '(konfor|sinerji)';

do $$
begin
  if not exists (
    select 1 from stok
     where kategori = 'cam'
       and (ad ilike 'Isıcam' or ad ilike 'Isicam')
  ) then
    insert into stok (kod, ad, kategori, kalinlik_mm, birim, birim_fiyat, aktif)
    values ('S-' || lpad(sonraki_sayac('stok_kod', 1)::text, 4, '0'), 'Isıcam', 'cam', null, 'm2', null, true);
  end if;

  if not exists (
    select 1 from stok
     where kategori = 'cam'
       and (ad ilike 'Isıcam Sinerji' or ad ilike 'Isicam Sinerji')
  ) then
    insert into stok (kod, ad, kategori, kalinlik_mm, birim, birim_fiyat, aktif)
    values ('S-' || lpad(sonraki_sayac('stok_kod', 1)::text, 4, '0'), 'Isıcam Sinerji', 'cam', null, 'm2', null, true);
  end if;

  if not exists (
    select 1 from stok
     where kategori = 'cam'
       and (ad ilike 'Isıcam Konfor' or ad ilike 'Isicam Konfor')
  ) then
    insert into stok (kod, ad, kategori, kalinlik_mm, birim, birim_fiyat, aktif)
    values ('S-' || lpad(sonraki_sayac('stok_kod', 1)::text, 4, '0'), 'Isıcam Konfor', 'cam', null, 'm2', null, true);
  end if;
end$$;

commit;
