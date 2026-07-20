BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(6);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'tamir_kayitlari'
     AND policyname IN (
       'station_screen_read',
       'station_screen_tamir_create',
       'station_screen_tamir_update',
       'station_screen_tamir_delete'
     )),
  4,
  'Tamir İstasyonu dört işlemde Üretim İstasyonları çatısına bağlıdır'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('95000000-0000-0000-0000-000000000001', 'station-umbrella@example.test', '{}'::jsonb, now(), now());

UPDATE public.app_users
SET is_active = true
WHERE auth_user_id = '95000000-0000-0000-0000-000000000001';

INSERT INTO public.roles (id, slug, name_tr)
VALUES ('95000000-0000-0000-0000-000000000002', 'station_umbrella_test', 'İstasyon Çatı Test Rolü');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '95000000-0000-0000-0000-000000000002', permission.id
FROM public.permissions permission
WHERE permission.module = 'production_stations'
  AND permission.action IN ('read', 'update');

INSERT INTO public.user_roles (auth_user_id, role_id)
VALUES (
  '95000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000002'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"95000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

SELECT ok(public.has_permission('production_stations', 'update'), 'çatı rolü dört istasyon ekranını kullanabilir');
SELECT ok(NOT public.has_permission('dashboard', 'read'), 'Gösterge için ayrıca dashboard izni gerekmez');
SELECT ok(NOT public.has_permission('repair', 'read'), 'Tamir ekranı için ayrıca repair/read izni gerekmez');
SELECT ok(NOT public.has_permission('repair', 'create'), 'Tamire gönderme için ayrıca repair/create izni gerekmez');
SELECT ok(NOT public.has_permission('production_entry', 'read'), 'Üretim Girişi ayrı bir rol modülü olarak kalır');

SELECT * FROM finish();
ROLLBACK;
