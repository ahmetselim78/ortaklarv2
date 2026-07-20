BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(9);

SELECT is(
  (SELECT array_agg(action ORDER BY action)::text[] FROM public.permissions WHERE module = 'production_stations'),
  ARRAY['manage', 'read', 'update']::text[],
  'Üretim İstasyonları yalnız gerekli RBAC aşamalarını içerir'
);

SELECT ok(
  to_regclass('public.role_production_station_permissions') IS NULL,
  'roller üretim girişi istasyon listesi taşımaz'
);

SELECT is(
  (SELECT count(*)::integer FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'production_stations_limited'),
  0,
  'rollerde üretim girişi istasyon kapsamı alanı yoktur'
);

SELECT ok(
  position('role_production_station_permissions' in pg_get_functiondef('public.uretim_istasyon_yetkisi_kontrol()'::regprocedure)) = 0,
  'üretim girişi istasyon triggerı rol kapsamına bağlı değildir'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'station_screen_read'),
  10,
  'istasyon ekranlarının okuduğu tablolarda ayrı okuma politikası vardır'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'station_screen_update'),
  3,
  'Poz Giriş durum güncellemeleri ayrı update politikasıyla korunur'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('94000000-0000-0000-0000-000000000001', 'station-role@example.test', '{}'::jsonb, now(), now());

UPDATE public.app_users
SET is_active = true
WHERE auth_user_id = '94000000-0000-0000-0000-000000000001';

INSERT INTO public.roles (id, slug, name_tr)
VALUES ('94000000-0000-0000-0000-000000000002', 'station_only_test', 'İstasyon Test Rolü');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '94000000-0000-0000-0000-000000000002', permission.id
FROM public.permissions permission
WHERE permission.module = 'production_stations'
  AND permission.action IN ('read', 'update');

INSERT INTO public.user_roles (auth_user_id, role_id)
VALUES (
  '94000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000002'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

SELECT ok(
  public.has_permission('production_stations', 'read'),
  'yalnız istasyon rolü Üretim İstasyonları bölümünü görebilir'
);

SELECT ok(
  public.has_permission('production_stations', 'update'),
  'yalnız istasyon rolü Poz Giriş ve Kumanda Panelini kullanabilir'
);

SELECT ok(
  NOT public.has_permission('production', 'read'),
  'istasyon yetkisi Üretim Emirleri yetkisi vermez'
);

SELECT * FROM finish();
ROLLBACK;
