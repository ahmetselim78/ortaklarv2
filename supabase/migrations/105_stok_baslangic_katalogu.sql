-- 105 - Temiz kurulumda bos stok, kullanici istegiyle idempotent baslangic katalogu
--
-- Tarihsel 034/036 migrationlari degistirilmez. Bu migration yalniz gercekten
-- pristine oldugu kanitlanan kurulumlarda onlarin seed stoklarini kaldirir.
-- Mevcut kullanici veya is verisi bulunan bir kurulumda tek bir stok dahi silmez.

BEGIN;

SET search_path = public, extensions, pg_catalog;

CREATE TABLE IF NOT EXISTS public.stok_baslangic_katalogu_sablonu (
  kod text PRIMARY KEY CHECK (nullif(btrim(kod), '') IS NOT NULL),
  ad text NOT NULL CHECK (nullif(btrim(ad), '') IS NOT NULL),
  kategori text NOT NULL CHECK (kategori IN ('cam', 'cita', 'yan_malzeme')),
  grup text,
  katman_yapisi text,
  kalinlik_mm numeric,
  birim text NOT NULL CHECK (nullif(btrim(birim), '') IS NOT NULL),
  birim_fiyat numeric,
  aktif boolean NOT NULL DEFAULT true,
  ticari_kapsam public.stok_ticari_kapsami NOT NULL DEFAULT 'maliyet_bileseni',
  CHECK (katman_yapisi IS NULL OR katman_yapisi ~ '^[0-9]+([+][0-9]+){1,4}$')
);

ALTER TABLE public.stok_baslangic_katalogu_sablonu
  ADD COLUMN IF NOT EXISTS ticari_kapsam public.stok_ticari_kapsami
    NOT NULL DEFAULT 'maliyet_bileseni';

COMMENT ON TABLE public.stok_baslangic_katalogu_sablonu IS
  '036 cam katalogu ile standart aluminyum cita ve sarf kartlarinin degismez kurulum sablonu; stok tablosuna migration sirasinda veri eklemez.';

INSERT INTO public.stok_baslangic_katalogu_sablonu (
  kod, ad, kategori, grup, katman_yapisi, kalinlik_mm, birim, birim_fiyat, aktif
)
VALUES
  ('01002', '4 mm DC', 'cam', 'DÜZCAM', null, 4, 'm2', null, true),
  ('01003', '5 mm DC', 'cam', 'DÜZCAM', null, 5, 'm2', null, true),
  ('01004', '6 mm DC', 'cam', 'DÜZCAM', null, 6, 'm2', null, true),
  ('01005', '8 mm DC', 'cam', 'DÜZCAM', null, 8, 'm2', null, true),
  ('01006', '10 mm DC', 'cam', 'DÜZCAM', null, 10, 'm2', null, true),
  ('01008', 'Buzlu Cam', 'cam', 'BUZLUCAM', null, 4, 'm2', null, true),
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
  ('20004', '4+16+4+16+4 3+ ISICAM KONFOR', 'cam', 'ÜÇLÜ CAM', '4+16+4+16+4', null, 'm2', null, true),

  ('CITA-AL-009', '9 mm Alüminyum Çıta', 'cita', 'ALÜMİNYUM ÇITA', null, 9, 'm', null, true),
  ('CITA-AL-011', '11 mm Alüminyum Çıta', 'cita', 'ALÜMİNYUM ÇITA', null, 11, 'm', null, true),
  ('CITA-AL-012', '12 mm Alüminyum Çıta', 'cita', 'ALÜMİNYUM ÇITA', null, 12, 'm', null, true),
  ('CITA-AL-014', '14 mm Alüminyum Çıta', 'cita', 'ALÜMİNYUM ÇITA', null, 14, 'm', null, true),
  ('CITA-AL-015', '15 mm Alüminyum Çıta', 'cita', 'ALÜMİNYUM ÇITA', null, 15, 'm', null, true),
  ('CITA-AL-016', '16 mm Alüminyum Çıta', 'cita', 'ALÜMİNYUM ÇITA', null, 16, 'm', null, true),
  ('CITA-AL-018', '18 mm Alüminyum Çıta', 'cita', 'ALÜMİNYUM ÇITA', null, 18, 'm', null, true),
  ('CITA-AL-020', '20 mm Alüminyum Çıta', 'cita', 'ALÜMİNYUM ÇITA', null, 20, 'm', null, true),
  ('CITA-AL-022', '22 mm Alüminyum Çıta', 'cita', 'ALÜMİNYUM ÇITA', null, 22, 'm', null, true),

  ('SARF-BUTIL', 'Butil', 'yan_malzeme', 'SARF', null, null, 'kg', null, true),
  ('SARF-PU', 'Poliüretan', 'yan_malzeme', 'SARF', null, null, 'litre', null, true),
  ('SARF-NEM-ALICI', 'Nem Alıcı', 'yan_malzeme', 'SARF', null, null, 'kg', null, true),
  ('SARF-THIOKOL', 'Thiokol (Polisülfid)', 'yan_malzeme', 'SARF', null, null, 'kg', null, false)
ON CONFLICT (kod) DO UPDATE SET
  ad = EXCLUDED.ad,
  kategori = EXCLUDED.kategori,
  grup = EXCLUDED.grup,
  katman_yapisi = EXCLUDED.katman_yapisi,
  kalinlik_mm = EXCLUDED.kalinlik_mm,
  birim = EXCLUDED.birim,
  birim_fiyat = EXCLUDED.birim_fiyat,
  aktif = EXCLUDED.aktif;

-- Hammadde cam, cita ve sarflar maliyet girdisidir. Uretilen Isicam
-- kartlari ise varsayilan olarak satilabilir urundur; kapsam sonradan elle
-- degistirilebilir.
UPDATE public.stok_baslangic_katalogu_sablonu
SET ticari_kapsam = CASE
  WHEN kategori = 'cam'
    AND (kod = '07122' OR kod ~ '^(10|11|20)')
    THEN 'satilabilir'::public.stok_ticari_kapsami
  ELSE 'maliyet_bileseni'::public.stok_ticari_kapsami
END;

ALTER TABLE public.stok_baslangic_katalogu_sablonu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stok_baslangic_katalogu_sablonu FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.stok_baslangic_katalogu_sablonu FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stok_baslangic_katalogu_sablonu TO service_role;

-- 034/036 seed temizligi: kosullardan biri dahi saglanmazsa hicbir DELETE calismaz.
-- Es zamanli bir stok duzenlemesi, kontrol ile silme arasinda satirin seklini
-- degistiremesin. Migration tamamlanana kadar stok yazarlari bekler.
LOCK TABLE public.stok IN SHARE ROW EXCLUSIVE MODE;

DO $migration_cleanup$
DECLARE
  v_pristine boolean := false;
  v_legacy_stok_ids uuid[];
BEGIN
  SELECT
    (SELECT count(*) FROM public.stok)
      = (SELECT count(*) FROM public.stok_baslangic_katalogu_sablonu WHERE kategori = 'cam') + 3
    AND (SELECT count(*) FROM public.stok s
         WHERE s.kategori = 'cam'
           AND s.kod LIKE 'S-%'
           AND s.ad IN ('Isıcam', 'Isicam', 'Isıcam Sinerji', 'Isicam Sinerji', 'Isıcam Konfor', 'Isicam Konfor')
           AND NOT s.aktif
           AND s.grup IS NULL
           AND s.katman_yapisi IS NULL
           AND s.kalinlik_mm IS NULL
           AND s.birim = 'm2'
           AND s.birim_fiyat IS NULL
           AND s.tedarikci_id IS NULL
           AND s.marka IS NULL
           AND COALESCE(s.mevcut_miktar, 0) = 0
           AND s.ticari_kapsam = 'kapsam_disi'
           AND s.minimum_miktar = 0
           AND s.stok_yeri IS NULL) = 3
    AND NOT EXISTS (
      SELECT 1
      FROM public.stok_baslangic_katalogu_sablonu sablon
      LEFT JOIN public.stok stok_row
        ON stok_row.kod = sablon.kod
      WHERE sablon.kategori = 'cam'
        AND (
          stok_row.id IS NULL
          OR stok_row.ad IS DISTINCT FROM sablon.ad
          OR stok_row.kategori IS DISTINCT FROM sablon.kategori
          OR stok_row.grup IS DISTINCT FROM sablon.grup
          OR stok_row.katman_yapisi IS DISTINCT FROM sablon.katman_yapisi
          OR stok_row.kalinlik_mm IS DISTINCT FROM
            CASE WHEN sablon.kod = '01008' THEN NULL::numeric ELSE sablon.kalinlik_mm END
          OR stok_row.birim IS DISTINCT FROM sablon.birim
          OR stok_row.birim_fiyat IS NOT NULL
          OR stok_row.tedarikci_id IS NOT NULL
          OR stok_row.marka IS NOT NULL
          OR COALESCE(stok_row.mevcut_miktar, 0) <> 0
          OR NOT stok_row.aktif
          OR stok_row.ticari_kapsam <> 'kapsam_disi'
          OR stok_row.minimum_miktar <> 0
          OR stok_row.stok_yeri IS NOT NULL
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.stok stok_row
      LEFT JOIN public.stok_baslangic_katalogu_sablonu sablon
        ON sablon.kategori = 'cam' AND sablon.kod = stok_row.kod
      WHERE sablon.kod IS NULL
        AND NOT (
          stok_row.kategori = 'cam'
          AND stok_row.kod LIKE 'S-%'
          AND stok_row.ad IN ('Isıcam', 'Isicam', 'Isıcam Sinerji', 'Isicam Sinerji', 'Isıcam Konfor', 'Isicam Konfor')
          AND NOT stok_row.aktif
        )
    )
    AND NOT EXISTS (SELECT 1 FROM auth.users)
    AND NOT EXISTS (SELECT 1 FROM public.app_users)
    AND NOT EXISTS (SELECT 1 FROM public.cari)
    AND NOT EXISTS (SELECT 1 FROM public.siparisler)
    AND NOT EXISTS (SELECT 1 FROM public.siparis_detaylari)
    AND NOT EXISTS (SELECT 1 FROM public.teklifler)
    AND NOT EXISTS (SELECT 1 FROM public.fiyat_listeleri)
    AND NOT EXISTS (SELECT 1 FROM public.cari_hareketleri)
    AND NOT EXISTS (SELECT 1 FROM public.tedarikci_siparisleri)
    AND NOT EXISTS (SELECT 1 FROM public.stok_hareketleri)
    AND NOT EXISTS (SELECT 1 FROM public.stok_alis_fiyatlari)
    AND NOT EXISTS (SELECT 1 FROM public.stok_maliyet_kaynagi_atamalari)
    AND NOT EXISTS (SELECT 1 FROM public.cam_tedarik_baglantilari)
    AND NOT EXISTS (SELECT 1 FROM public.cam_tedarik_baglanti_kalem_stoklari)
    AND NOT EXISTS (SELECT 1 FROM public.urun_maliyet_receteleri)
    AND NOT EXISTS (SELECT 1 FROM public.urun_maliyet_recete_kalemleri)
    AND NOT EXISTS (SELECT 1 FROM public.maliyet_stok_kalemleri)
    AND NOT EXISTS (SELECT 1 FROM public.maliyet_alis_fiyatlari)
    AND NOT EXISTS (SELECT 1 FROM public.maliyet_sarf_malzemeleri)
    AND NOT EXISTS (SELECT 1 FROM public.maliyet_hesaplama_ayar_surmleri)
    AND NOT EXISTS (SELECT 1 FROM public.islem_idempotency)
    AND (SELECT count(*) FROM public.maliyet_cam_hammaddeleri) = 3
    AND NOT EXISTS (
      SELECT 1 FROM public.maliyet_cam_hammaddeleri
      WHERE kalinlik_mm <> 4
         OR cam_turu NOT IN ('duz', 'konfor', 'sinerji')
         OR ozel_tur_adi IS NOT NULL
         OR NOT aktif
         OR olusturan_kullanici_id IS NOT NULL
    )
    AND (SELECT count(*) FROM public.maliyet_citalari) = 1
    AND EXISTS (
      SELECT 1 FROM public.maliyet_citalari
      WHERE genislik_mm = 16
        AND malzeme_turu = 'aluminyum'
        AND ozel_malzeme_adi IS NULL
        AND aktif
        AND olusturan_kullanici_id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.stok_maliyet_profilleri profil
      JOIN public.stok stok_row ON stok_row.id = profil.stok_id
      WHERE profil.aciklama IS DISTINCT FROM
        CASE
          WHEN profil.profil_turu = 'cam' THEN '096 kesin legacy cam eşleşmesi'
          WHEN profil.profil_turu = 'cita' THEN '096 kesin legacy çıta eşleşmesi'
          WHEN profil.profil_turu = 'sarf' THEN '096 kesin legacy sarf eşleşmesi'
        END
         OR stok_row.kod NOT IN (
           SELECT kod FROM public.stok_baslangic_katalogu_sablonu WHERE kategori = 'cam'
         )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.stok_maliyet_yapi_surmleri surum
      JOIN public.stok stok_row ON stok_row.id = surum.stok_id
      WHERE surum.aciklama <> '096 legacy stok katman yapısı başlangıç sürümü'
         OR stok_row.kod NOT IN (
           SELECT kod FROM public.stok_baslangic_katalogu_sablonu WHERE kategori = 'cam'
         )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.maliyet_legacy_eslestirmeleri eslesme
      WHERE NOT eslesme.otomatik
         OR eslesme.onaylayan_kullanici_id IS NOT NULL
         OR eslesme.onay_tarihi IS NOT NULL
         OR eslesme.kaynak_tablo NOT IN ('maliyet_cam_hammaddeleri', 'maliyet_citalari')
    )
  INTO v_pristine;

  IF v_pristine THEN
    SELECT array_agg(stok_row.id)
    INTO v_legacy_stok_ids
    FROM public.stok stok_row
    WHERE stok_row.kod IN (
      SELECT kod
      FROM public.stok_baslangic_katalogu_sablonu
      WHERE kategori = 'cam'
    )
    OR (
      stok_row.kategori = 'cam'
      AND stok_row.kod LIKE 'S-%'
      AND stok_row.ad IN ('Isıcam', 'Isicam', 'Isıcam Sinerji', 'Isicam Sinerji', 'Isıcam Konfor', 'Isicam Konfor')
      AND NOT stok_row.aktif
    );

    DELETE FROM public.maliyet_legacy_eslestirmeleri
    WHERE otomatik
      AND onaylayan_kullanici_id IS NULL
      AND kaynak_tablo IN ('maliyet_cam_hammaddeleri', 'maliyet_citalari')
      AND hedef_stok_id = ANY(v_legacy_stok_ids);

    DELETE FROM public.stok_maliyet_profilleri
    WHERE stok_id = ANY(v_legacy_stok_ids)
      AND aciklama IN (
        '096 kesin legacy cam eşleşmesi',
        '096 kesin legacy çıta eşleşmesi',
        '096 kesin legacy sarf eşleşmesi'
      );

    DELETE FROM public.stok_maliyet_yapi_surmleri
    WHERE stok_id = ANY(v_legacy_stok_ids)
      AND aciklama = '096 legacy stok katman yapısı başlangıç sürümü';

    DELETE FROM public.stok
    WHERE id = ANY(v_legacy_stok_ids);

    RAISE NOTICE 'Pristine kurulum: 034/036 legacy stok seedleri güvenle kaldırıldı.';
  ELSE
    RAISE NOTICE 'Mevcut veri algılandı: 034/036 stoklarına dokunulmadı.';
  END IF;
END;
$migration_cleanup$;

CREATE OR REPLACE FUNCTION public.stok_baslangic_katalogu_durumu_internal()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH satirlar AS (
    SELECT
      sablon.kategori,
      stok_row.id IS NOT NULL AS mevcut,
      stok_row.id IS NOT NULL
        AND (
          stok_row.ad IS DISTINCT FROM sablon.ad
          OR stok_row.kategori IS DISTINCT FROM sablon.kategori
          OR stok_row.grup IS DISTINCT FROM sablon.grup
          OR stok_row.katman_yapisi IS DISTINCT FROM sablon.katman_yapisi
          OR stok_row.kalinlik_mm IS DISTINCT FROM sablon.kalinlik_mm
          OR stok_row.birim IS DISTINCT FROM sablon.birim
          OR stok_row.ticari_kapsam IS DISTINCT FROM sablon.ticari_kapsam
        ) AS cakisan
    FROM public.stok_baslangic_katalogu_sablonu sablon
    LEFT JOIN public.stok stok_row
      ON lower(btrim(stok_row.kod)) = lower(btrim(sablon.kod))
  ),
  kategori AS (
    SELECT
      kategori,
      count(*)::integer AS toplam,
      count(*) FILTER (WHERE mevcut)::integer AS mevcut,
      count(*) FILTER (WHERE mevcut AND NOT cakisan)::integer AS uyumlu,
      count(*) FILTER (WHERE cakisan)::integer AS cakisan,
      count(*) FILTER (WHERE NOT mevcut)::integer AS eksik
    FROM satirlar
    GROUP BY kategori
  ),
  ozet AS (
    SELECT
      count(*)::integer AS toplam,
      count(*) FILTER (WHERE mevcut)::integer AS mevcut,
      count(*) FILTER (WHERE mevcut AND NOT cakisan)::integer AS uyumlu,
      count(*) FILTER (WHERE cakisan)::integer AS cakisan,
      count(*) FILTER (WHERE NOT mevcut)::integer AS eksik
    FROM satirlar
  )
  SELECT jsonb_build_object(
    'katalog_surumu', '105',
    'toplam', ozet.toplam,
    'mevcut', ozet.mevcut,
    'uyumlu', ozet.uyumlu,
    'cakisan', ozet.cakisan,
    'eksik', ozet.eksik,
    'kurulu', ozet.eksik = 0,
    'kategoriler', COALESCE((
      SELECT jsonb_object_agg(
        kategori.kategori,
        jsonb_build_object(
          'toplam', kategori.toplam,
          'mevcut', kategori.mevcut,
          'uyumlu', kategori.uyumlu,
          'cakisan', kategori.cakisan,
          'eksik', kategori.eksik
        )
        ORDER BY kategori.kategori
      )
      FROM kategori
    ), '{}'::jsonb)
  )
  FROM ozet
$$;

CREATE OR REPLACE FUNCTION public.stok_baslangic_katalogu_durumu()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'INVENTORY_READ_YETKISI_GEREKLI';
  END IF;

  RETURN public.stok_baslangic_katalogu_durumu_internal();
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_baslangic_katalogunu_kur(
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payload jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_onceki jsonb;
  v_sonra jsonb;
  v_eklenen integer := 0;
  v_eklenen_kategori jsonb := '{}'::jsonb;
  v_kategori_dagilimi jsonb := '{}'::jsonb;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'create') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'INVENTORY_CREATE_YETKISI_GEREKLI';
  END IF;

  SELECT jsonb_build_object(
    'katalog_surumu', '105',
    'sablon_satir_sayisi', count(*)
  )
  INTO v_payload
  FROM public.stok_baslangic_katalogu_sablonu;

  v_idempotency := public.ticari_idempotency_baslat(
    'stok_baslangic_katalogunu_kur',
    p_idempotency_key,
    v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM set_config(
    'app.audit_context',
    jsonb_build_object(
      'rpc_adi', 'stok_baslangic_katalogunu_kur',
      'idempotency_key', p_idempotency_key,
      'gerekce', 'Başlangıç stok kataloğu kurulumu',
      'kaynak', 'stok_katalogu'
    )::text,
    true
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended('stok_baslangic_katalogu:105', 0)
  );

  v_onceki := public.stok_baslangic_katalogu_durumu_internal();

  WITH eklenen AS (
    INSERT INTO public.stok (
      kod, ad, kategori, grup, katman_yapisi, kalinlik_mm,
      birim, birim_fiyat, aktif, ticari_kapsam
    )
    SELECT
      sablon.kod,
      sablon.ad,
      sablon.kategori,
      sablon.grup,
      sablon.katman_yapisi,
      sablon.kalinlik_mm,
      sablon.birim,
      sablon.birim_fiyat,
      sablon.aktif,
      sablon.ticari_kapsam
    FROM public.stok_baslangic_katalogu_sablonu sablon
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.stok stok_row
      WHERE lower(btrim(stok_row.kod)) = lower(btrim(sablon.kod))
    )
    RETURNING kategori
  ),
  kategori AS (
    SELECT kategori, count(*)::integer AS adet
    FROM eklenen
    GROUP BY kategori
  )
  SELECT
    COALESCE(sum(adet), 0)::integer,
    COALESCE(jsonb_object_agg(kategori, adet ORDER BY kategori), '{}'::jsonb)
  INTO v_eklenen, v_eklenen_kategori
  FROM kategori;

  v_sonra := public.stok_baslangic_katalogu_durumu_internal();

  SELECT COALESCE(
    jsonb_object_agg(
      kategori,
      detay
        || jsonb_build_object(
          'mevcut',
          COALESCE((
            v_onceki -> 'kategoriler' -> kategori ->> 'mevcut'
          )::integer, 0),
          'eklenen',
          COALESCE((v_eklenen_kategori ->> kategori)::integer, 0)
        )
      ORDER BY kategori
    ),
    '{}'::jsonb
  )
  INTO v_kategori_dagilimi
  FROM jsonb_each(v_sonra -> 'kategoriler') AS kategori_sonucu(kategori, detay);

  v_yanit := jsonb_build_object(
    'basarili', true,
    'katalog_surumu', '105',
    'toplam', (v_sonra ->> 'toplam')::integer,
    'eklenen', v_eklenen,
    'mevcut', (v_onceki ->> 'mevcut')::integer,
    'eksik', (v_sonra ->> 'eksik')::integer,
    'cakisan', (v_sonra ->> 'cakisan')::integer,
    'kurulu', (v_sonra ->> 'kurulu')::boolean,
    'kategori_dagilimi', v_kategori_dagilimi,
    'kategoriler', v_kategori_dagilimi,
    'eklenen_kategori_dagilimi', jsonb_build_object(
      'cam', COALESCE((v_eklenen_kategori ->> 'cam')::integer, 0),
      'cita', COALESCE((v_eklenen_kategori ->> 'cita')::integer, 0),
      'yan_malzeme', COALESCE((v_eklenen_kategori ->> 'yan_malzeme')::integer, 0)
    )
  );

  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

REVOKE ALL ON FUNCTION public.stok_baslangic_katalogu_durumu_internal()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_baslangic_katalogu_durumu()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_baslangic_katalogunu_kur(text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.stok_baslangic_katalogu_durumu()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_baslangic_katalogunu_kur(text)
  TO authenticated;

COMMIT;
