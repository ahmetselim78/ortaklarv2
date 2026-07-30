BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
UPDATE public.device_session_settings SET enforcement_mode = 'observe';
SELECT plan(5);

SELECT has_function(
  'public',
  'sonraki_sayac',
  ARRAY['text', 'integer'],
  'cari kodu icin kullanilan sayac RPCsi vardir'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '94000000-0000-0000-0000-000000000112',
  'cari-counter@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '94000000-0000-0000-0000-000000000112';

INSERT INTO public.user_roles (auth_user_id, role_id)
VALUES (
  '94000000-0000-0000-0000-000000000112',
  '10000000-0000-0000-0000-000000000001'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000000112","role":"authenticated","aal":"aal1"}',
  true
);

INSERT INTO public.cari (kod, ad, tipi)
VALUES ('C-900000', 'Cari Sayac Testi', 'tedarikci');

UPDATE public.sayaclar
SET deger = 1
WHERE anahtar = 'cari_kod';

SELECT is(
  public.sonraki_sayac('cari_kod', 1),
  900001,
  'geride kalan sayac mevcut en buyuk cari kodunun ardina tasinir'
);

SELECT is(
  public.sonraki_sayac('cari_kod', 1),
  900002,
  'izleyen cari kodu atomik olarak artmaya devam eder'
);

SELECT ok(
  (SELECT deger = 900002 FROM public.sayaclar WHERE anahtar = 'cari_kod'),
  'onarilan sayac degeri sayaclar tablosunda saklanir'
);

SELECT lives_ok(
  $$INSERT INTO public.cari (kod, ad, tipi)
    VALUES ('C-900002', 'Onarilan Sayacla Cari', 'tedarikci')$$,
  'onarilan sayacin verdigi kodla yeni tedarikci eklenebilir'
);

SELECT * FROM finish();
ROLLBACK;
