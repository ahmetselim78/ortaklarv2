-- 037 - Eski aile stok referanslari icin not
-- Toplu stok_id guncellemesi uygulama tarafinda yapilir:
--   Admin/Stok paneli -> "Eski Stok Referanslarini Duzenle"
--   lib/stokMigrasyon.ts -> eskiStokReferanslariniMigrate()
--
-- Bu migration yalnizca 034 aile stoklarinin pasif oldugunu dogrular.

begin;

update stok
   set aktif = false
 where kategori = 'cam'
   and katman_yapisi is null
   and kod like 'S-%'
   and ad in ('Isıcam', 'Isicam', 'Isıcam Sinerji', 'Isicam Sinerji', 'Isıcam Konfor', 'Isicam Konfor')
   and aktif = true;

commit;
