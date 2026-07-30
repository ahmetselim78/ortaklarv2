BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('maliyet_cam_hammaddeleri'),
        ('maliyet_citalari'),
        ('maliyet_sarf_malzemeleri'),
        ('maliyet_sarf_katsayi_surmleri'),
        ('maliyet_hesaplama_ayar_surmleri'),
        ('maliyet_alis_fiyatlari')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE to_regclass('public.' || name) IS NOT NULL
  ),
  6,
  'sade maliyet modelinin altı tablosu kurulur'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'maliyet_alis_fiyatlari'
      AND column_name = 'tedarikci_id'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'maliyet_alis_fiyatlari'
      AND column_name = 'vade_gunu'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'maliyet_alis_fiyatlari'
      AND column_name = 'gecerli_baslangic'
  ),
  'alış fiyatı tedarikçi, vade ve başlangıç tarihi taşır'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'maliyet_alis_fiyatlari',
        'maliyet_sarf_katsayi_surmleri',
        'maliyet_hesaplama_ayar_surmleri'
      )
      AND column_name = 'gecerli_bitis'
  ),
  0,
  'sade maliyet tarihçesinde geçerlilik bitiş tarihi yoktur'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'maliyet_cam_hammaddeleri'
      AND column_name IN ('kod', 'ad')
  ),
  'cam tanımı kod veya genel ad istemez'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'maliyet_citalari'
      AND column_name IN ('kod', 'ad')
  ),
  'çıta tanımı kod veya genel ad istemez'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'maliyet_sarf_malzemeleri'
      AND column_name = 'ad'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'maliyet_sarf_malzemeleri'
      AND column_name = 'kod'
  ),
  'yalnız sarf malzemesi alanına özgü ad taşır'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.maliyet_cam_hammaddeleri
    WHERE kalinlik_mm = 4
      AND cam_turu IN ('duz', 'konfor', 'sinerji')
  ),
  3,
  '4 mm Düz, Konfor ve Sinerji başlangıç tanımları hazırdır'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.maliyet_citalari
    WHERE genislik_mm = 16
      AND malzeme_turu = 'aluminyum'
  ),
  '16 mm Alüminyum Çıta başlangıç tanımı hazırdır'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('maliyet_sarf_katsayi_surmleri'),
        ('maliyet_hesaplama_ayar_surmleri'),
        ('maliyet_alis_fiyatlari')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
      WHERE trigger_row.tgrelid = to_regclass('public.' || expected.name)
        AND NOT trigger_row.tgisinternal
        AND function_row.proname = 'maliyet_tarihceli_kaydi_koru'
        AND (trigger_row.tgtype & 2) = 2
        AND (trigger_row.tgtype & 8) = 8
        AND (trigger_row.tgtype & 16) = 16
    )
  ),
  3,
  'fiyat, katsayı ve ayar tarihçesi UPDATE/DELETE işlemlerine kapalıdır'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('maliyet_cam_hammaddeleri'),
        ('maliyet_citalari'),
        ('maliyet_sarf_malzemeleri'),
        ('maliyet_sarf_katsayi_surmleri'),
        ('maliyet_hesaplama_ayar_surmleri'),
        ('maliyet_alis_fiyatlari')
    )
    SELECT count(*)::integer
    FROM expected
    JOIN pg_class table_row ON table_row.oid = to_regclass('public.' || expected.name)
    WHERE table_row.relrowsecurity AND table_row.relforcerowsecurity
  ),
  6,
  'tüm sade maliyet tablolarında RLS ve FORCE RLS açıktır'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('maliyet_cam_hammaddeleri'),
        ('maliyet_citalari'),
        ('maliyet_sarf_malzemeleri'),
        ('maliyet_sarf_katsayi_surmleri'),
        ('maliyet_hesaplama_ayar_surmleri'),
        ('maliyet_alis_fiyatlari')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE has_table_privilege('authenticated', 'public.' || name, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || name, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || name, 'DELETE')
  ),
  0,
  'authenticated rolü sade maliyet tablolarına doğrudan yazamaz'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('maliyet_malzeme_kaydet'),
        ('maliyet_sarf_katsayisi_kaydet'),
        ('maliyet_hesaplama_ayari_kaydet'),
        ('maliyet_alis_fiyati_kaydet'),
        ('maliyet_guncel_alis_fiyatlari'),
        ('maliyet_urun_maliyetlerini_hesapla')
    )
    SELECT count(*)::integer
    FROM expected
    JOIN pg_proc function_row ON function_row.proname = expected.name
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
  ),
  3,
  'authenticated rolü legacy sade maliyet katmanında yalnız okuma ve hesaplama RPClerini çağırabilir'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('maliyet_malzeme_kaydet'),
        ('maliyet_sarf_katsayisi_kaydet'),
        ('maliyet_hesaplama_ayari_kaydet'),
        ('maliyet_alis_fiyati_kaydet'),
        ('maliyet_guncel_alis_fiyatlari'),
        ('maliyet_urun_maliyetlerini_hesapla')
    )
    SELECT count(*)::integer
    FROM expected
    JOIN pg_proc function_row ON function_row.proname = expected.name
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND has_function_privilege('anon', function_row.oid, 'EXECUTE')
  ),
  0,
  'anon/PUBLIC sade maliyet RPC fonksiyonlarını çağıramaz'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('maliyet_malzeme_kaydet'),
        ('maliyet_sarf_katsayisi_kaydet'),
        ('maliyet_hesaplama_ayari_kaydet'),
        ('maliyet_alis_fiyati_kaydet'),
        ('maliyet_guncel_alis_fiyatlari'),
        ('maliyet_urun_maliyetlerini_hesapla')
    )
    SELECT count(*)::integer
    FROM expected
    JOIN pg_proc function_row ON function_row.proname = expected.name
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND function_row.prosecdef
  ),
  6,
  'tüm dış sade maliyet RPC fonksiyonları SECURITY DEFINER kullanır'
);

SELECT ok(
  position(
    'fiyat.vade_gunu::numeric / 365'
    IN pg_get_functiondef(
      'public.maliyet_guncel_alis_fiyatlari(date)'::regprocedure
    )
  ) > 0
  AND position(
    'fiyat.gecerli_baslangic DESC'
    IN pg_get_functiondef(
      'public.maliyet_guncel_alis_fiyatlari(date)'::regprocedure
    )
  ) > 0,
  'güncel tedarikçi fiyatı basit faiz ve son başlangıç tarihiyle çözülür'
);

SELECT ok(
  position(
    'cam_bilesenleri'
    IN pg_get_functiondef(
      'public.maliyet_urun_maliyetlerini_hesapla(date,numeric,numeric)'::regprocedure
    )
  ) > 0
  AND position(
    'cita_bilesenleri'
    IN pg_get_functiondef(
      'public.maliyet_urun_maliyetlerini_hesapla(date,numeric,numeric)'::regprocedure
    )
  ) > 0
  AND position(
    'sarf_bilesenleri'
    IN pg_get_functiondef(
      'public.maliyet_urun_maliyetlerini_hesapla(date,numeric,numeric)'::regprocedure
    )
  ) > 0,
  'ürün motoru cam, çıta ve sarf maliyetlerini ayrı hesaplar'
);

SELECT * FROM finish();
ROLLBACK;
