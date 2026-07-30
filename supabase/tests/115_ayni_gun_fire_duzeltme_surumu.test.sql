BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

SELECT is(
  (
    SELECT count(*)::integer
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stok_fire_orani_surmleri'
      AND column_name IN (
        'yerine_gecilen_gecerlilik_donemi',
        'yerine_gecen_fire_surumu_id',
        'yerine_gecme_tarihi',
        'yerine_gecme_zamani',
        'yerine_gecme_gerekcesi',
        'yerine_gecme_idempotency_id',
        'yerine_geciren_kullanici_id'
      )
  ),
  7,
  'ayni gun yerine gecme izi fire surumunde eksiksiz tutulur'
);

SELECT ok(
  position(
    'AYNI_BASLANGICTA_FIRE_SURUMU_VAR'
    IN pg_get_functiondef(
      'public.stok_fire_orani_kaydet_v3(jsonb,text)'::regprocedure
    )
  ) = 0,
  'fire RPCsi ayni baslangici artik hata olarak reddetmez'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '91500000-0000-4000-8000-000000000001',
  'fire-ayni-gun-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '91500000-0000-4000-8000-000000000001';

INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '91500000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91500000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);

INSERT INTO public.stok (
  id, kod, ad, kategori, birim, aktif, ticari_kapsam
)
VALUES (
  '91500000-0000-4000-8000-000000000010',
  'FIRE-AYNI-GUN-TEST',
  'Ayni Gun Fire Test Stogu',
  'yan_malzeme',
  'kg',
  true,
  'maliyet_bileseni'
);

INSERT INTO public.stok_fire_orani_surmleri (
  id,
  stok_id,
  fire_orani,
  gecerlilik_donemi,
  revision_no,
  aciklama,
  olusturan_kullanici_id
)
VALUES (
  '91500000-0000-4000-8000-000000000020',
  '91500000-0000-4000-8000-000000000010',
  4,
  daterange('2098-04-15', NULL, '[)'),
  1,
  'Ilk fire orani',
  '91500000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE fire_duzeltme_bir AS
SELECT public.stok_fire_orani_kaydet_v3(
  jsonb_build_object(
    'stok_id', '91500000-0000-4000-8000-000000000010',
    'fire_orani', 7,
    'baslangic', '2098-04-15',
    'aciklama', 'Ayni gun ilk fire duzeltmesi',
    'kaynak_ekran', 'pgtap'
  ),
  'fire-ayni-gun-duzeltme-1'
) AS sonuc;

SELECT is(
  ((SELECT sonuc FROM fire_duzeltme_bir) ->> 'fire_orani')::numeric,
  7::numeric,
  'ayni gun fire duzeltmesi yeni orani dondurur'
);

SELECT is(
  ((SELECT sonuc FROM fire_duzeltme_bir) ->> 'revision_no')::integer,
  2,
  'ayni gun duzeltmesi yeni revision olusturur'
);

SELECT is(
  (SELECT sonuc ->> 'duzeltilen_fire_surumu_id' FROM fire_duzeltme_bir),
  '91500000-0000-4000-8000-000000000020',
  'yanit yerine gecilen revision kimligini aciklar'
);

SELECT ok(
  (
    SELECT
      isempty(gecerlilik_donemi)
      AND yerine_gecen_fire_surumu_id::text
        = (SELECT sonuc ->> 'fire_surumu_id' FROM fire_duzeltme_bir)
    FROM public.stok_fire_orani_surmleri
    WHERE id = '91500000-0000-4000-8000-000000000020'
  ),
  'eski revision silinmez ve yeni revisiona baglanir'
);

SELECT is(
  (
    SELECT yerine_gecilen_gecerlilik_donemi
    FROM public.stok_fire_orani_surmleri
    WHERE id = '91500000-0000-4000-8000-000000000020'
  ),
  daterange('2098-04-15', NULL, '[)'),
  'eski revisionin asil gecerlilik donemi kaybolmaz'
);

SELECT is(
  (
    SELECT fire_orani
    FROM public.stok_fire_orani_surmleri
    WHERE stok_id = '91500000-0000-4000-8000-000000000010'
      AND gecerlilik_donemi @> DATE '2098-04-15'
  ),
  7.0000::numeric,
  'duzeltilen oran ayni gun hemen etkin olur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok_fire_orani_surmleri
    WHERE stok_id = '91500000-0000-4000-8000-000000000010'
  ),
  2,
  'ilk ve duzeltilen fire revisionlari birlikte korunur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.audit_events
    WHERE table_name = 'stok_fire_orani_surmleri'
      AND metadata ->> 'rpc_adi' = 'stok_fire_orani_kaydet_v3'
      AND metadata ->> 'idempotency_key' = 'fire-ayni-gun-duzeltme-1'
      AND action IN ('UPDATE', 'INSERT')
  ),
  2,
  'yerine gecilen ve yeni revision ayni RPC audit baglaminda izlenir'
);

CREATE TEMP TABLE fire_duzeltme_replay AS
SELECT public.stok_fire_orani_kaydet_v3(
  jsonb_build_object(
    'stok_id', '91500000-0000-4000-8000-000000000010',
    'fire_orani', 7,
    'baslangic', '2098-04-15',
    'aciklama', 'Ayni gun ilk fire duzeltmesi',
    'kaynak_ekran', 'pgtap'
  ),
  'fire-ayni-gun-duzeltme-1'
) AS sonuc;

SELECT is(
  (SELECT sonuc ->> 'fire_surumu_id' FROM fire_duzeltme_replay),
  (SELECT sonuc ->> 'fire_surumu_id' FROM fire_duzeltme_bir),
  'ayni idempotency replayi onceki revision sonucunu dondurur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok_fire_orani_surmleri
    WHERE stok_id = '91500000-0000-4000-8000-000000000010'
  ),
  2,
  'idempotency replayi ek revision olusturmaz'
);

CREATE TEMP TABLE fire_duzeltme_iki AS
SELECT public.stok_fire_orani_kaydet_v3(
  jsonb_build_object(
    'stok_id', '91500000-0000-4000-8000-000000000010',
    'fire_orani', 9,
    'baslangic', '2098-04-15',
    'aciklama', 'Ayni gun ikinci fire duzeltmesi',
    'kaynak_ekran', 'pgtap'
  ),
  'fire-ayni-gun-duzeltme-2'
) AS sonuc;

SELECT is(
  ((SELECT sonuc FROM fire_duzeltme_iki) ->> 'revision_no')::integer,
  3,
  'ayni gunde ardisik duzeltmeler revision zincirini ilerletir'
);

SELECT ok(
  (
    SELECT
      count(*) = 3
      AND count(*) FILTER (WHERE isempty(gecerlilik_donemi)) = 2
      AND count(*) FILTER (
        WHERE gecerlilik_donemi @> DATE '2098-04-15'
          AND fire_orani = 9
          AND revision_no = 3
      ) = 1
    FROM public.stok_fire_orani_surmleri
    WHERE stok_id = '91500000-0000-4000-8000-000000000010'
  ),
  'revision zincirinde yalniz son duzeltme etkin kalir'
);

SELECT throws_ok(
  $$
    UPDATE public.stok_fire_orani_surmleri
    SET fire_orani = 12
    WHERE stok_id = '91500000-0000-4000-8000-000000000010'
      AND gecerlilik_donemi @> DATE '2098-04-15'
  $$,
  '55000',
  'MALIYET_V3_SURUMU_DEGISTIRILEMEZ',
  'fire orani mevcut revision uzerinde degistirilemez'
);

SELECT throws_ok(
  $$
    DELETE FROM public.stok_fire_orani_surmleri
    WHERE id = '91500000-0000-4000-8000-000000000020'
  $$,
  '55000',
  'MALIYET_V3_SURUMU_SILINEMEZ',
  'yerine gecilen revision dahi silinemez'
);

SELECT * FROM finish();
ROLLBACK;
