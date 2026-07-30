BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);

SELECT has_function('public', 'stok_katalogu_getir', ARRAY[]::text[], 'tek sorguluk stok kataloğu RPCsi vardır');
SELECT has_function('public', 'stok_karti_olustur', ARRAY['jsonb'], 'stok oluşturma RPCsi vardır');
SELECT has_function('public', 'stok_karti_guncelle', ARRAY['uuid', 'jsonb'], 'kullanılmamış stok güncelleme RPCsi vardır');
SELECT has_function('public', 'stok_aktiflik_ayarla', ARRAY['uuid', 'boolean'], 'aktiflik RPCsi vardır');
SELECT has_function('public', 'stok_karti_sil', ARRAY['uuid'], 'stok silme RPCsi vardır');
SELECT has_function('public', 'stok_satis_kapsami_ayarla', ARRAY['uuid', 'boolean'], 'satış kapsamı RPCsi vardır');
SELECT has_function('public', 'stok_maliyet_kapsami_ayarla', ARRAY['uuid', 'boolean'], 'maliyet kapsamı RPCsi vardır');

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.stok', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.stok', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.stok', 'DELETE'),
  'authenticated rolü stok tablosuna doğrudan yazamaz'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.stok'::regclass
      AND tgname = 'stok_kullanilan_karti_koru_trigger'
      AND NOT tgisinternal
  ),
  'kullanılan stok kartını koruyan trigger etkindir'
);

CREATE TEMP TABLE stok_katalog_test_ids(stok_id uuid, siparis_id uuid);
WITH yeni AS (
  INSERT INTO public.stok(kod, ad, kategori, kalinlik_mm, birim, aktif)
  VALUES ('KATALOG-TEST-' || substr(gen_random_uuid()::text, 1, 8), 'Test Çıta', 'cita', 99, 'm', true)
  RETURNING id
)
INSERT INTO stok_katalog_test_ids(stok_id) SELECT id FROM yeni;

SELECT lives_ok(
  $$UPDATE public.stok SET ad = 'Kullanılmamış Test Çıta' WHERE id = (SELECT stok_id FROM stok_katalog_test_ids)$$,
  'kullanılmamış kartın teknik kimliği düzeltilebilir'
);

WITH yeni_siparis AS (
  INSERT INTO public.siparisler(siparis_no, tarih)
  VALUES ('KATALOG-TEST-' || substr(gen_random_uuid()::text, 1, 8), current_date)
  RETURNING id
)
UPDATE stok_katalog_test_ids SET siparis_id = yeni_siparis.id FROM yeni_siparis;

INSERT INTO public.siparis_detaylari(
  siparis_id, stok_id, cam_kodu, genislik_mm, yukseklik_mm, adet
)
SELECT siparis_id, stok_id, 'GLS-KATALOG-' || substr(gen_random_uuid()::text, 1, 8), 100, 100, 1
FROM stok_katalog_test_ids;

SELECT throws_ok(
  $$UPDATE public.stok SET ad = 'Değişmemeli' WHERE id = (SELECT stok_id FROM stok_katalog_test_ids)$$,
  '23514',
  'KULLANILAN_STOK_KIMLIGI_DEGISTIRILEMEZ',
  'ilk dış referanstan sonra teknik kimlik değiştirilemez'
);

SELECT lives_ok(
  $$UPDATE public.stok SET aktif = false WHERE id = (SELECT stok_id FROM stok_katalog_test_ids)$$,
  'kullanılan kart pasifleştirilebilir'
);

SELECT lives_ok(
  $$UPDATE public.stok SET aktif = true WHERE id = (SELECT stok_id FROM stok_katalog_test_ids)$$,
  'kullanılan kart yeniden aktifleştirilebilir'
);

SELECT throws_ok(
  $$DELETE FROM public.stok WHERE id = (SELECT stok_id FROM stok_katalog_test_ids)$$,
  '23514',
  'KULLANILAN_STOK_SILINEMEZ',
  'kullanılan kart silinemez'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.stok_kullanim_ozeti_internal((SELECT stok_id FROM stok_katalog_test_ids))
    WHERE alan = 'siparis' AND adet = 1
  ),
  'kullanım özeti sipariş bağlantısını sayar'
);

SELECT * FROM finish();
ROLLBACK;
