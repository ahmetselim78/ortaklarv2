BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(17);

SELECT ok(
  to_regprocedure(
    'public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid)'
  ) IS NOT NULL
  AND position(
    'AYNI_BASLANGICTA_TEMPER_FIYAT_SECIMI_VAR'
    IN pg_get_functiondef(
      'public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid)'::regprocedure
    )
  ) > 0
  AND position(
    'RETURN v_mevcut.id'
    IN pg_get_functiondef(
      'public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid)'::regprocedure
    )
  ) = 0,
  'internal secim fonksiyonu ayni baslangici semantik cakisma sayar'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid)'::regprocedure,
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.temper_dis_hizmet_fiyat_sec_v4(jsonb,text)'::regprocedure,
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.temper_dis_hizmet_fiyat_sec_v4(jsonb,text)'::regprocedure,
    'EXECUTE'
  ),
  'onarim internal siniri kapali, dis RPC yetkilerini degistirmeden birakir'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '97800000-0000-4000-8000-000000000001',
  'temper-v110-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '97800000-0000-4000-8000-000000000001';

INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '97800000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

INSERT INTO auth.sessions(id, user_id, created_at, updated_at)
VALUES (
  '97800000-0000-4000-8000-000000000002',
  '97800000-0000-4000-8000-000000000001',
  now(),
  now()
);

INSERT INTO public.user_devices (
  id,
  auth_user_id,
  client_device_id,
  auto_display_name,
  device_type,
  os_family,
  browser_family
)
VALUES (
  '97800000-0000-4000-8000-000000000003',
  '97800000-0000-4000-8000-000000000001',
  '97800000-0000-4000-8000-000000000004',
  'Temper v110 pgTAP',
  'desktop',
  'Windows',
  'Chrome'
);

INSERT INTO public.user_device_sessions (
  auth_user_id,
  device_id,
  auth_session_id,
  signed_in_at
)
VALUES (
  '97800000-0000-4000-8000-000000000001',
  '97800000-0000-4000-8000-000000000003',
  '97800000-0000-4000-8000-000000000002',
  now()
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"97800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"97800000-0000-4000-8000-000000000002"}',
  true
);

SELECT public.stok_baslangic_katalogunu_kur(
  'temper-v110-catalog-install'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok stok
    JOIN public.maliyet_hizmet_stoklari hizmet
      ON hizmet.stok_id = stok.id
    WHERE stok.kod = 'HIZMET-TEMPER-DIS'
      AND stok.aktif
      AND hizmet.hizmet_turu = 'temper_dis_hizmet'
  ),
  1,
  'temper hizmet karti katalog butonuyla hazirdir'
);

INSERT INTO public.cari (
  id,
  kod,
  ad,
  tipi,
  aktif,
  tedarik_kapsamlari,
  tedarikci_calisma_modeli
)
VALUES (
  '97800000-0000-4000-8000-000000000010',
  'TEMPER-V110-TED',
  'Temper V110 Hizmet Tedarikcisi',
  'tedarikci',
  true,
  ARRAY['temper_hizmeti'],
  'manuel_fiyat'
);

CREATE TEMP TABLE temper_v110_offer AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '97800000-0000-4000-8000-000000000010',
    'fiyat_tarihi', '2288-01-01T00:00:00+03:00',
    'gecerlilik_baslangici', '2288-01-01',
    'gecerlilik_bitisi', '2300-01-01',
    'kalemler', jsonb_build_array(jsonb_build_object(
      'stok_id', (
        SELECT id FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'
      ),
      'birim_fiyat', 50,
      'fiyat_birimi', 'm2',
      'stok_ana_birimi', 'm2',
      'varyant', 'standart',
      'vade_gunu', 60,
      'marka', 'Temper V110'
    ))
  ),
  'temper-v110-offer'
) AS result;

SELECT is(
  ((SELECT result FROM temper_v110_offer) ->> 'adet')::integer,
  1,
  'V110 icin tek TRY/m2 temper teklifi kaydedilir'
);

CREATE TEMP TABLE temper_v110_price AS
SELECT fiyat.*
FROM public.stok_alis_fiyatlari fiyat
WHERE fiyat.id = (
  (
    (SELECT result FROM temper_v110_offer)
      -> 'fiyat_ids' ->> 0
  )::uuid
);

SELECT ok(
  (
    SELECT birim_fiyat = 50
      AND para_birimi = 'TRY'
      AND fiyat_birimi = 'm2'
      AND stok_ana_birimi = 'm2'
      AND vade_gunu = 60
    FROM temper_v110_price
  ),
  'secilecek hizmet fiyati dogrulanmis TRY/m2 snapshotidir'
);

CREATE TEMP TABLE temper_v110_mode AS
SELECT public.temper_maliyet_modu_kaydet_v4(
  jsonb_build_object(
    'mod', 'dis_hizmet',
    'baslangic', '2290-01-01',
    'bitis', '2299-01-01',
    'gerekce', 'V110 dis temper hizmet modu'
  ),
  'temper-v110-mode'
) AS result;

SELECT ok(
  (SELECT result ->> 'mod' = 'dis_hizmet' FROM temper_v110_mode)
  AND (
    SELECT (result ->> 'gecerlilik_baslangici')::date = '2290-01-01'
    FROM temper_v110_mode
  ),
  'dis hizmet modu fiyat secim donemini kapsayacak sekilde acilir'
);

CREATE TEMP TABLE temper_v110_e1 AS
SELECT public.temper_dis_hizmet_fiyat_sec_v4(
  jsonb_build_object(
    'fiyat_id', (SELECT id FROM temper_v110_price),
    'baslangic', '2291-01-01T00:00:00+03:00',
    'bitis', '2295-01-01T00:00:00+03:00',
    'gerekce', 'Birinci genel temper secimi'
  ),
  'temper-v110-e1'
) AS result;

SELECT ok(
  (SELECT result ->> 'kapsam' = 'genel' FROM temper_v110_e1)
  AND (
    SELECT (result ->> 'secilen_adet')::integer = 1
    FROM temper_v110_e1
  ),
  'E1 genel fiyat secimi bir kez olusturulur'
);

CREATE TEMP TABLE temper_v110_e1_snapshot AS
SELECT
  secim.id,
  secim.fiyat_id,
  secim.gecerlilik_donemi,
  secim.gerekce,
  secim.idempotency_id
FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
WHERE secim.id = (
  (
    (SELECT result FROM temper_v110_e1)
      -> 'secilenler' -> 0 ->> 'secim_id'
  )::uuid
);

SELECT ok(
  (
    SELECT fiyat_id = (SELECT id FROM temper_v110_price)
      AND gecerlilik_donemi = tstzrange(
        '2291-01-01T00:00:00+03:00',
        '2295-01-01T00:00:00+03:00',
        '[)'
      )
      AND gerekce = 'Birinci genel temper secimi'
      AND idempotency_id IS NOT NULL
    FROM temper_v110_e1_snapshot
  ),
  'E1 fiyat, donem, gerekce ve idempotency iziyle saklanir'
);

CREATE TEMP TABLE temper_v110_same_key_replay AS
SELECT public.temper_dis_hizmet_fiyat_sec_v4(
  jsonb_build_object(
    'fiyat_id', (SELECT id FROM temper_v110_price),
    'baslangic', '2291-01-01T00:00:00+03:00',
    'bitis', '2295-01-01T00:00:00+03:00',
    'gerekce', 'Birinci genel temper secimi'
  ),
  'temper-v110-e1'
) AS result;

SELECT is(
  (SELECT result::text FROM temper_v110_same_key_replay),
  (SELECT result::text FROM temper_v110_e1),
  'yalniz ayni anahtar ve ayni payload onceki E1 sonucunu dondurur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri
    WHERE mod_surumu_id = (
      ((SELECT result FROM temper_v110_mode) ->> 'mod_surumu_id')::uuid
    )
      AND urun_stok_id IS NULL
  ),
  1,
  'same-key replay yeni secim satiri olusturmaz'
);

SELECT throws_ok(
  $$
    SELECT public.temper_dis_hizmet_fiyat_sec_v4(
      jsonb_build_object(
        'fiyat_id', (SELECT id FROM temper_v110_price),
        'baslangic', '2291-01-01T00:00:00+03:00',
        'bitis', '2294-01-01T00:00:00+03:00',
        'gerekce', 'Ayni gun farkli bitis ve gerekce'
      ),
      'temper-v110-different-semantics'
    )
  $$,
  '23P01',
  'AYNI_BASLANGICTA_TEMPER_FIYAT_SECIMI_VAR',
  'yeni anahtarla ayni fiyat/baslangic fakat farkli bitis ve gerekce cakisir'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'id', secim.id,
      'fiyat_id', secim.fiyat_id,
      'gecerlilik_donemi', secim.gecerlilik_donemi::text,
      'gerekce', secim.gerekce,
      'idempotency_id', secim.idempotency_id
    )::text
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
    WHERE secim.id = (SELECT id FROM temper_v110_e1_snapshot)
  ),
  (
    SELECT jsonb_build_object(
      'id', id,
      'fiyat_id', fiyat_id,
      'gecerlilik_donemi', gecerlilik_donemi::text,
      'gerekce', gerekce,
      'idempotency_id', idempotency_id
    )::text
    FROM temper_v110_e1_snapshot
  ),
  'reddedilen farkli semantik E1 snapshotini degistirmez'
);

SELECT throws_ok(
  $$
    SELECT public.temper_dis_hizmet_fiyat_sec_v4(
      jsonb_build_object(
        'fiyat_id', (SELECT id FROM temper_v110_price),
        'baslangic', '2291-01-01T00:00:00+03:00',
        'bitis', '2295-01-01T00:00:00+03:00',
        'gerekce', 'Birinci genel temper secimi'
      ),
      'temper-v110-exact-payload-new-key'
    )
  $$,
  '23P01',
  'AYNI_BASLANGICTA_TEMPER_FIYAT_SECIMI_VAR',
  'birebir ayni payload bile yeni idempotency anahtariyla cakisir'
);

SELECT ok(
  (
    SELECT count(*) = 1
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
    WHERE secim.mod_surumu_id = (
      ((SELECT result FROM temper_v110_mode) ->> 'mod_surumu_id')::uuid
    )
      AND secim.urun_stok_id IS NULL
  )
  AND (
    SELECT secim.gecerlilik_donemi = snapshot.gecerlilik_donemi
      AND secim.gerekce = snapshot.gerekce
      AND secim.fiyat_id = snapshot.fiyat_id
      AND secim.idempotency_id = snapshot.idempotency_id
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
    CROSS JOIN temper_v110_e1_snapshot snapshot
    WHERE secim.id = snapshot.id
  ),
  'new-key exact payload reddi de E1i tek ve degismemis birakir'
);

CREATE TEMP TABLE temper_v110_e2 AS
SELECT public.temper_dis_hizmet_fiyat_sec_v4(
  jsonb_build_object(
    'fiyat_id', (SELECT id FROM temper_v110_price),
    'baslangic', '2293-01-01T00:00:00+03:00',
    'bitis', '2297-01-01T00:00:00+03:00',
    'gerekce', 'Sonraki donem genel temper secimi'
  ),
  'temper-v110-e2'
) AS result;

SELECT ok(
  (
    (
      (SELECT result FROM temper_v110_e2)
        -> 'secilenler' -> 0 ->> 'secim_id'
    )::uuid
  ) <> (SELECT id FROM temper_v110_e1_snapshot),
  'daha ileri bir baslangic yeni E2 surumunu normal sekilde olusturur'
);

SELECT ok(
  (
    SELECT gecerlilik_donemi = tstzrange(
      '2291-01-01T00:00:00+03:00',
      '2293-01-01T00:00:00+03:00',
      '[)'
    )
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri
    WHERE id = (SELECT id FROM temper_v110_e1_snapshot)
  )
  AND (
    SELECT gecerlilik_donemi = tstzrange(
      '2293-01-01T00:00:00+03:00',
      '2297-01-01T00:00:00+03:00',
      '[)'
    )
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri
    WHERE id = (
      (
        (SELECT result FROM temper_v110_e2)
          -> 'secilenler' -> 0 ->> 'secim_id'
      )::uuid
    )
  ),
  'E2 E1in yalniz ust sinirini kapatir ve kendi donemini acar'
);

SELECT ok(
  (
    public.temper_maliyetini_coz_v4(NULL, '2292-01-01', 1)
      #>> '{dis_hizmet_fiyati,secim_id}'
  )::uuid = (SELECT id FROM temper_v110_e1_snapshot)
  AND (
    public.temper_maliyetini_coz_v4(NULL, '2294-01-01', 1)
      #>> '{dis_hizmet_fiyati,secim_id}'
  )::uuid = (
    (
      (SELECT result FROM temper_v110_e2)
        -> 'secilenler' -> 0 ->> 'secim_id'
    )::uuid
  ),
  'maliyet cozumleyicisi tarihine gore E1 veya E2 snapshotini kullanir'
);

SELECT * FROM finish();
ROLLBACK;
