BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);

SELECT has_table('public', 'stok_hareketleri', 'stok hareket tablosu vardır');
SELECT has_column('public', 'stok_hareketleri', 'net_miktar', 'işaretli net miktar üretilir');
SELECT has_column('public', 'stok', 'minimum_miktar', 'minimum stok seviyesi kartta tutulur');
SELECT has_column('public', 'stok', 'stok_yeri', 'stok yeri kartta tutulur');
SELECT has_function('public', 'stok_hareketi_kaydet', ARRAY['jsonb', 'text'], 'hareket kayıt RPCsi vardır');
SELECT has_function('public', 'stok_hareketlerini_getir', ARRAY['uuid', 'integer'], 'hareket geçmişi RPCsi vardır');
SELECT has_function('public', 'stok_panel_ozeti_getir', ARRAY[]::text[], 'stok panel özeti RPCsi vardır');

SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.stok_hareketleri'::regclass),
  'stok hareketlerinde RLS ve FORCE RLS etkindir'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.stok_hareketleri', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.stok_hareketleri', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.stok_hareketleri', 'DELETE'),
  'authenticated rolü hareket tablosuna doğrudan yazamaz'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.stok_hareketleri'::regclass AND tgname = 'stok_hareketleri_immutable' AND NOT tgisinternal),
  'stok hareketleri append-only trigger ile korunur'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.stok'::regclass AND tgname = 'stok_kodu_ve_miktari_guard' AND NOT tgisinternal),
  'stok kodu ve legacy miktar doğrudan değiştirilemez'
);

CREATE TEMP TABLE stok_hareket_test_ids(stok_id uuid);
WITH yeni AS (
  INSERT INTO public.stok(kod, ad, kategori, marka, birim, aktif)
  VALUES ('HAREKET-TEST-' || substr(gen_random_uuid()::text, 1, 8), 'Test Sarfı', 'yan_malzeme', 'Test', 'kg', true)
  RETURNING id
)
INSERT INTO stok_hareket_test_ids SELECT id FROM yeni;

INSERT INTO public.stok_hareketleri(
  stok_id, hareket_turu, miktar, birim, aciklama, idempotency_key
)
SELECT stok_id, 'devir_girisi', 10, 'kg', 'Test açılışı', 'test-giris-' || stok_id::text
FROM stok_hareket_test_ids;

INSERT INTO public.stok_hareketleri(
  stok_id, hareket_turu, miktar, birim, aciklama, idempotency_key
)
SELECT stok_id, 'uretim_cikisi', 3, 'kg', 'Test tüketimi', 'test-cikis-' || stok_id::text
FROM stok_hareket_test_ids;

SELECT is(
  (SELECT sum(net_miktar) FROM public.stok_hareketleri WHERE stok_id = (SELECT stok_id FROM stok_hareket_test_ids)),
  7::numeric,
  'giriş ve çıkışlardan bakiye doğru hesaplanır'
);

SELECT throws_ok(
  $$UPDATE public.stok_hareketleri SET aciklama = 'Değişmemeli' WHERE stok_id = (SELECT stok_id FROM stok_hareket_test_ids)$$,
  '55000', 'STOK_HAREKETI_DEGISTIRILEMEZ', 'geçmiş hareket değiştirilemez'
);

SELECT throws_ok(
  $$UPDATE public.stok SET kod = 'YENI-KOD' WHERE id = (SELECT stok_id FROM stok_hareket_test_ids)$$,
  '55000', 'STOK_KODU_DEGISTIRILEMEZ', 'stok kodu ilk kayıttan sonra değiştirilemez'
);

SELECT throws_ok(
  $$DELETE FROM public.stok WHERE id = (SELECT stok_id FROM stok_hareket_test_ids)$$,
  '23514', 'HAREKETLI_STOK_SILINEMEZ', 'hareketli stok kartı silinemez'
);

SELECT * FROM finish();
ROLLBACK;
