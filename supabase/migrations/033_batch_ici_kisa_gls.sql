-- 033 - Batch ici kisa GLS (fiziksel isaret = uretim_emri_detaylari.sira_no)

begin;

-- Sira numarasi artik batch icindeki fiziksel GLS'tir.
-- Once mevcut null/duplikasyonlari, var olan gecerli sira numaralarini bozmadan duzelt.
with isaretli as (
  select
    id,
    uretim_emri_id,
    sira_no,
    max(sira_no) over (partition by uretim_emri_id) as max_sira,
    row_number() over (partition by uretim_emri_id, sira_no order by id) as tekrar_no
  from uretim_emri_detaylari
),
duzeltilecek as (
  select *
  from isaretli
  where sira_no is null or tekrar_no > 1 or sira_no <= 0
),
yeni_siralar as (
  select
    id,
    coalesce(max_sira, 0) + row_number() over (partition by uretim_emri_id order by id) as yeni_sira
  from duzeltilecek
)
update uretim_emri_detaylari ued
   set sira_no = ys.yeni_sira
  from yeni_siralar ys
 where ued.id = ys.id;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uretim_emri_detaylari_sira_no_positive_check'
  ) then
    alter table uretim_emri_detaylari
      add constraint uretim_emri_detaylari_sira_no_positive_check
      check (sira_no is null or sira_no > 0);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uretim_emri_detaylari_unique_sira_no'
  ) then
    alter table uretim_emri_detaylari
      add constraint uretim_emri_detaylari_unique_sira_no
      unique (uretim_emri_id, sira_no);
  end if;
end$$;

-- Yikama logu ayni sira numarasinin farkli batchlerde karismamasi icin
-- dogrudan uretim_emri_detaylari kaydina baglanir.
alter table yikama_loglari
  add column if not exists uretim_emri_detay_id uuid
    references uretim_emri_detaylari(id) on delete set null;

update yikama_loglari yl
   set uretim_emri_detay_id = ued.id
  from uretim_emri_detaylari ued
 where yl.uretim_emri_detay_id is null
   and yl.siparis_detay_id = ued.siparis_detay_id;

create index if not exists idx_yikama_loglari_uretim_emri_detay_id
  on yikama_loglari(uretim_emri_detay_id);

-- Yeni siparisler uygulamada tekil fiziksel cama bolunecek.
-- Mevcut bekleyen, batch'e alinmamis adetli satirlari da guvenli bicimde tekillestir.
do $$
declare
  r record;
  i integer;
  yeni_sayac integer;
begin
  for r in
    select d.*
      from siparis_detaylari d
      join siparisler s on s.id = d.siparis_id
     where d.adet > 1
       and s.durum in ('beklemede', 'eksik_var')
       and coalesce(d.uretim_durumu, 'bekliyor') in ('bekliyor', 'kesildi')
       and not exists (
         select 1
           from uretim_emri_detaylari ued
          where ued.siparis_detay_id = d.id
       )
  loop
    for i in 2..r.adet loop
      yeni_sayac := sonraki_sayac('cam_kodu', 1);
      insert into siparis_detaylari (
        siparis_id,
        stok_id,
        cam_kodu,
        genislik_mm,
        yukseklik_mm,
        adet,
        kenar_islemi,
        notlar,
        uretim_durumu,
        created_at,
        cita_stok_id,
        poz,
        menfez_cap_mm,
        kucuk_cam,
        katman_yapisi
      ) values (
        r.siparis_id,
        r.stok_id,
        'GLS-' || yeni_sayac::text,
        r.genislik_mm,
        r.yukseklik_mm,
        1,
        r.kenar_islemi,
        r.notlar,
        r.uretim_durumu,
        r.created_at,
        r.cita_stok_id,
        r.poz,
        r.menfez_cap_mm,
        r.kucuk_cam,
        r.katman_yapisi
      );
    end loop;

    update siparis_detaylari
       set adet = 1
     where id = r.id;
  end loop;
end$$;

commit;
