-- 036 - Kombinasyon bazli stok sistemi
-- Cam stoklari artik eski programdaki gibi tek tek kombinasyon kartlaridir.

begin;

alter table stok
  add column if not exists grup text,
  add column if not exists katman_yapisi text,
  add column if not exists aktif boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stok_katman_yapisi_format_check'
  ) then
    alter table stok
      add constraint stok_katman_yapisi_format_check
      check (katman_yapisi is null or katman_yapisi ~ '^\d+(\+\d+){1,4}$');
  end if;
end$$;

-- 034 ile olusan aile stoklarini yeni siparis secimlerinden dusur.
update stok
   set aktif = false
 where kategori = 'cam'
   and katman_yapisi is null
   and kod like 'S-%'
   and ad in ('Isıcam', 'Isicam', 'Isıcam Sinerji', 'Isicam Sinerji', 'Isıcam Konfor', 'Isicam Konfor');

insert into stok (kod, ad, kategori, grup, katman_yapisi, kalinlik_mm, birim, birim_fiyat, aktif)
values
  ('01002', '4 mm DC', 'cam', 'DÜZCAM', null, 4, 'm2', null, true),
  ('01003', '5 mm DC', 'cam', 'DÜZCAM', null, 5, 'm2', null, true),
  ('01004', '6 mm DC', 'cam', 'DÜZCAM', null, 6, 'm2', null, true),
  ('01005', '8 mm DC', 'cam', 'DÜZCAM', null, 8, 'm2', null, true),
  ('01006', '10 mm DC', 'cam', 'DÜZCAM', null, 10, 'm2', null, true),
  ('01008', 'Buzlu Cam', 'cam', 'BUZLUCAM', null, null, 'm2', null, true),
  ('01009', 'Renkli Cam', 'cam', 'BUZLUCAM', null, null, 'm2', null, true),
  ('01012', 'Satina Beyaz', 'cam', 'BUZLUCAM', null, null, 'm2', null, true),
  ('01013', '4mm Fume', 'cam', 'BUZLUCAM', null, 4, 'm2', null, true),
  ('01014', '8mm Fume', 'cam', 'BUZLUCAM', null, 8, 'm2', null, true),
  ('01015', '4mm Bronz', 'cam', 'BUZLUCAM', null, 4, 'm2', null, true),
  ('01016', '4+4 Lamine', 'cam', 'DÜZCAM', '4+4', null, 'm2', null, true),
  ('01017', '4 mm Ayna', 'cam', 'AYNA', null, 4, 'm2', null, true),
  ('01018', '4 mm Bronz Reflekte', 'cam', 'AYNA', null, 4, 'm2', null, true),
  ('01019', '4 mm Fume Reflekte', 'cam', 'AYNA', null, 4, 'm2', null, true),
  ('01020', '4 mm Sinerji', 'cam', 'LOW-E', null, 4, 'm2', null, true),
  ('01022', '4 mm Konfor', 'cam', 'KONFOR', null, 4, 'm2', null, true),
  ('01023', '6 mm Konfor', 'cam', 'KONFOR', null, 6, 'm2', null, true),
  ('07122', '4+4LAMINE+12+4MM DUZ', 'cam', 'ISICAM', '4+4+12+4', null, 'm2', null, true),

  ('10000', '4+9+4 ISICAM C', 'cam', 'ISICAM', '4+9+4', null, 'm2', null, true),
  ('10001', '4+11+4 ISICAM C', 'cam', 'ISICAM', '4+11+4', null, 'm2', null, true),
  ('10002', '4+12+4 ISICAM C', 'cam', 'ISICAM', '4+12+4', null, 'm2', null, true),
  ('10003', '4+14+4 ISICAM C', 'cam', 'ISICAM', '4+14+4', null, 'm2', null, true),
  ('10004', '4+15+4 ISICAM C', 'cam', 'ISICAM', '4+15+4', null, 'm2', null, true),
  ('10005', '4+16+4 ISICAM C', 'cam', 'ISICAM', '4+16+4', null, 'm2', null, true),
  ('10006', '4+18+4 ISICAM C', 'cam', 'ISICAM', '4+18+4', null, 'm2', null, true),
  ('10007', '4+20+4 ISICAM C', 'cam', 'ISICAM', '4+20+4', null, 'm2', null, true),
  ('10008', '4+22+4 ISICAM C', 'cam', 'ISICAM', '4+22+4', null, 'm2', null, true),

  ('10100', '4+9+4 ISICAM C BUZLU', 'cam', 'ISICAM', '4+9+4', null, 'm2', null, true),
  ('10101', '4+11+4 ISICAM C BUZLU', 'cam', 'ISICAM', '4+11+4', null, 'm2', null, true),
  ('10102', '4+12+4 ISICAM C BUZLU', 'cam', 'ISICAM', '4+12+4', null, 'm2', null, true),
  ('10103', '4+14+4 ISICAM C BUZLU', 'cam', 'ISICAM', '4+14+4', null, 'm2', null, true),
  ('10104', '4+15+4 ISICAM C BUZLU', 'cam', 'ISICAM', '4+15+4', null, 'm2', null, true),
  ('10105', '4+16+4 ISICAM C BUZLU', 'cam', 'ISICAM', '4+16+4', null, 'm2', null, true),
  ('10106', '4+20+4 ISICAM C BUZLU', 'cam', 'ISICAM', '4+20+4', null, 'm2', null, true),
  ('10107', '4+22+4 ISICAM C BUZLU', 'cam', 'ISICAM', '4+22+4', null, 'm2', null, true),

  ('10200', 'K 4+9+4 FUME ISICAM', 'cam', 'ISICAM', '4+9+4', null, 'm2', null, true),
  ('10201', 'K 4+11+4 FUME ISICAM', 'cam', 'ISICAM', '4+11+4', null, 'm2', null, true),
  ('10202', 'K 4+12+4 FUME ISICAM', 'cam', 'ISICAM', '4+12+4', null, 'm2', null, true),
  ('10203', 'K 4+14+4 FUME ISICAM', 'cam', 'ISICAM', '4+14+4', null, 'm2', null, true),
  ('10204', 'K 4+16+4 CIFT FUME ISICAM', 'cam', 'ISICAM', '4+16+4', null, 'm2', null, true),
  ('10205', 'K 4+16+4 FUME KONFOR', 'cam', 'ISICAM-KONFOR', '4+16+4', null, 'm2', null, true),
  ('10206', 'K 4+22+4 FUME ISICAM', 'cam', 'ISICAM', '4+22+4', null, 'm2', null, true),
  ('10207', 'K 4+15+4 FUME ISICAM', 'cam', 'ISICAM', '4+15+4', null, 'm2', null, true),
  ('10208', 'K 4+16+4 FUME ISICAM', 'cam', 'ISICAM', '4+16+4', null, 'm2', null, true),

  ('10300', '4+9+4 ISICAM C REFLEKTE', 'cam', 'ISICAM', '4+9+4', null, 'm2', null, true),
  ('10301', '4+11+4 ISICAM C REFLEKTE', 'cam', 'ISICAM', '4+11+4', null, 'm2', null, true),
  ('10302', '4+12+4 ISICAM C REFLEKTE', 'cam', 'ISICAM', '4+12+4', null, 'm2', null, true),
  ('10303', '4+14+4 ISICAM C REFLEKTE', 'cam', 'ISICAM', '4+14+4', null, 'm2', null, true),
  ('10304', '4+15+4 ISICAM C REFLEKTE', 'cam', 'ISICAM', '4+15+4', null, 'm2', null, true),
  ('10305', '4+16+4 ISICAM C REFLEKTE', 'cam', 'ISICAM', '4+16+4', null, 'm2', null, true),
  ('10306', '4+18+4 ISICAM C REFLEKTE', 'cam', 'ISICAM', '4+18+4', null, 'm2', null, true),
  ('10307', '4+20+4 ISICAM C REFLEKTE', 'cam', 'ISICAM', '4+20+4', null, 'm2', null, true),
  ('10308', '4+22+4 ISICAM C REFLEKTE', 'cam', 'ISICAM', '4+22+4', null, 'm2', null, true),

  ('10400', 'S 4+9+4 ISICAM SINERJI', 'cam', 'ISICAM-S', '4+9+4', null, 'm2', null, true),
  ('10401', 'S 4+11+4 ISICAM SINERJI', 'cam', 'ISICAM-S', '4+11+4', null, 'm2', null, true),
  ('10402', 'S 4+12+4 ISICAM SINERJI', 'cam', 'ISICAM-S', '4+12+4', null, 'm2', null, true),
  ('10403', 'S 4+14+4 ISICAM SINERJI', 'cam', 'ISICAM-S', '4+14+4', null, 'm2', null, true),
  ('10404', 'S 4+15+4 ISICAM SINERJI', 'cam', 'ISICAM-S', '4+15+4', null, 'm2', null, true),
  ('10405', 'S 4+16+4 ISICAM SINERJI', 'cam', 'ISICAM-S', '4+16+4', null, 'm2', null, true),
  ('10406', 'S 4+18+4 ISICAM SINERJI', 'cam', 'ISICAM-S', '4+18+4', null, 'm2', null, true),
  ('10407', 'S 4+20+4 ISICAM SINERJI', 'cam', 'ISICAM-S', '4+20+4', null, 'm2', null, true),
  ('10408', 'S 4+22+4 ISICAM SINERJI', 'cam', 'ISICAM-S', '4+22+4', null, 'm2', null, true),

  ('10500', 'K 4+9+4 ISICAM SINERJI BUZLU', 'cam', 'ISICAM-S', '4+9+4', null, 'm2', null, true),
  ('10501', 'K 4+11+4 ISICAM SINERJI BUZLU', 'cam', 'ISICAM-S', '4+11+4', null, 'm2', null, true),
  ('10502', 'K 4+12+4 ISICAM SINERJI BUZLU', 'cam', 'ISICAM-S', '4+12+4', null, 'm2', null, true),
  ('10503', 'K 4+14+4 ISICAM SINERJI BUZLU', 'cam', 'ISICAM-S', '4+14+4', null, 'm2', null, true),
  ('10504', 'K 4+15+4 ISICAM SINERJI BUZLU', 'cam', 'ISICAM-S', '4+15+4', null, 'm2', null, true),
  ('10505', 'K 4+16+4 ISICAM SINERJI BUZLU', 'cam', 'ISICAM-S', '4+16+4', null, 'm2', null, true),
  ('10506', 'K 4+18+4 ISICAM SINERJI BUZLU', 'cam', 'ISICAM-S', '4+18+4', null, 'm2', null, true),
  ('10507', 'K 4+20+4 ISICAM SINERJI BUZLU', 'cam', 'ISICAM-S', '4+20+4', null, 'm2', null, true),
  ('10508', 'K 4+22+4 ISICAM SINERJI BUZLU', 'cam', 'ISICAM-S', '4+22+4', null, 'm2', null, true),

  ('10600', 'K 4+9+4 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '4+9+4', null, 'm2', null, true),
  ('10601', 'K 4+11+4 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '4+11+4', null, 'm2', null, true),
  ('10602', 'K 4+12+4 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '4+12+4', null, 'm2', null, true),
  ('10603', 'K 4+14+4 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '4+14+4', null, 'm2', null, true),
  ('10604', 'K 4+15+4 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '4+15+4', null, 'm2', null, true),
  ('10605', 'K 4+16+4 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '4+16+4', null, 'm2', null, true),
  ('10606', 'K 4+18+4 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '4+18+4', null, 'm2', null, true),
  ('10607', 'K 4+20+4 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '4+20+4', null, 'm2', null, true),
  ('10608', 'K 4+22+4 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '4+22+4', null, 'm2', null, true),

  ('10700', 'K 4+9+4 ISICAM KONFOR BUZLU', 'cam', 'ISICAM-KONFOR', '4+9+4', null, 'm2', null, true),
  ('10701', 'K 4+11+4 ISICAM KONFOR BUZLU', 'cam', 'ISICAM-KONFOR', '4+11+4', null, 'm2', null, true),
  ('10702', 'K 4+12+4 ISICAM KONFOR BUZLU', 'cam', 'ISICAM-KONFOR', '4+12+4', null, 'm2', null, true),
  ('10703', 'K 4+14+4 ISICAM KONFOR BUZLU', 'cam', 'ISICAM-KONFOR', '4+14+4', null, 'm2', null, true),
  ('10704', 'K 4+15+4 ISICAM KONFOR BUZLU', 'cam', 'ISICAM-KONFOR', '4+15+4', null, 'm2', null, true),
  ('10705', 'K 4+16+4 ISICAM KONFOR BUZLU', 'cam', 'ISICAM-KONFOR', '4+16+4', null, 'm2', null, true),
  ('10706', 'K 4+18+4 ISICAM KONFOR BUZLU', 'cam', 'ISICAM-KONFOR', '4+18+4', null, 'm2', null, true),
  ('10707', 'K 4+20+4 ISICAM KONFOR BUZLU', 'cam', 'ISICAM-KONFOR', '4+20+4', null, 'm2', null, true),
  ('10708', 'K 4+22+4 ISICAM KONFOR BUZLU', 'cam', 'ISICAM-KONFOR', '4+22+4', null, 'm2', null, true),

  ('10800', '4+9+4+9+4 3+ ISICAM KLASIK', 'cam', 'ÜÇLÜ CAM', '4+9+4+9+4', null, 'm2', null, true),
  ('10801', '4+11+4+11+4 3+ ISICAM KLASIK', 'cam', 'ÜÇLÜ CAM', '4+11+4+11+4', null, 'm2', null, true),
  ('10802', '4+12+4+12+4 3+ ISICAM KLASIK', 'cam', 'ÜÇLÜ CAM', '4+12+4+12+4', null, 'm2', null, true),
  ('10803', '4+14+4+14+4 3+ ISICAM KLASIK', 'cam', 'ÜÇLÜ CAM', '4+14+4+14+4', null, 'm2', null, true),
  ('10804', '4+16+4+16+4 3+ ISICAM KLASIK', 'cam', 'ÜÇLÜ CAM', '4+16+4+16+4', null, 'm2', null, true),
  ('10900', '4+9+4+9+4 3+ ISICAM SINERJI', 'cam', 'ÜÇLÜ CAM', '4+9+4+9+4', null, 'm2', null, true),
  ('10901', '4+11+4+11+4 3+ ISICAM SINERJI', 'cam', 'ÜÇLÜ CAM', '4+11+4+11+4', null, 'm2', null, true),
  ('10902', '4+16+4+16+4 3+ ISICAM SINERJI', 'cam', 'ÜÇLÜ CAM', '4+16+4+16+4', null, 'm2', null, true),

  ('11000', 'K 6+12+6 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '6+12+6', null, 'm2', null, true),
  ('11001', 'K 6+18+6 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '6+18+6', null, 'm2', null, true),
  ('11002', 'K 6+14+6 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '6+14+6', null, 'm2', null, true),
  ('11003', 'K 6+16+6 ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '6+16+6', null, 'm2', null, true),
  ('11004', '4+16+4 TEMP ISICAM C', 'cam', 'ISICAM', '4+16+4', null, 'm2', null, true),
  ('11005', '4+14+4 TEMP ISICAM C', 'cam', 'ISICAM', '4+14+4', null, 'm2', null, true),
  ('11006', '4+14+5 TEMP ISICAM C', 'cam', 'ISICAM', '4+14+5', null, 'm2', null, true),
  ('11007', 'S 4+16+4 TEMP ISICAM SINERJI', 'cam', 'ISICAM-S', '4+16+4', null, 'm2', null, true),
  ('11008', 'K 4+16+4TEMP ISICAM KONFOR', 'cam', 'ISICAM-KONFOR', '4+16+4', null, 'm2', null, true),
  ('11009', 'C-6+16+6 ISICAM KLASIK', 'cam', 'ISICAM', '6+16+6', null, 'm2', null, true),
  ('11010', '4 16 4 FUME SATINA ISICAM', 'cam', 'ISICAM', '4+16+4', null, 'm2', null, true),
  ('11011', 'S 4+16+4 ISICAM RENKLI', 'cam', 'ISICAM-S', '4+16+4', null, 'm2', null, true),
  ('20000', '4+9+4+9+4 3+ ISICAM KONFOR', 'cam', 'ÜÇLÜ CAM', '4+9+4+9+4', null, 'm2', null, true),
  ('20001', '4+11+4+11+4 3+ ISICAM KONFOR', 'cam', 'ÜÇLÜ CAM', '4+11+4+11+4', null, 'm2', null, true),
  ('20002', '4+12+4+12+4 3+ ISICAM KONFOR', 'cam', 'ÜÇLÜ CAM', '4+12+4+12+4', null, 'm2', null, true),
  ('20003', '4+14+4+14+4 3+ ISICAM KONFOR', 'cam', 'ÜÇLÜ CAM', '4+14+4+14+4', null, 'm2', null, true),
  ('20004', '4+16+4+16+4 3+ ISICAM KONFOR', 'cam', 'ÜÇLÜ CAM', '4+16+4+16+4', null, 'm2', null, true)
on conflict (kod) do update set
  ad = excluded.ad,
  kategori = excluded.kategori,
  grup = excluded.grup,
  katman_yapisi = excluded.katman_yapisi,
  kalinlik_mm = excluded.kalinlik_mm,
  birim = excluded.birim,
  aktif = excluded.aktif;

commit;
