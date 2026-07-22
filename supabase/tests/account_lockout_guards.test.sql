BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(8);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('91000000-0000-0000-0000-000000000001', 'guard-admin-1@example.test', '{}'::jsonb, now(), now()),
  ('91000000-0000-0000-0000-000000000002', 'guard-admin-2@example.test', '{}'::jsonb, now(), now());

UPDATE public.app_users
SET is_active = true
WHERE auth_user_id IN (
  '91000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000002'
);

INSERT INTO public.user_roles (auth_user_id, role_id)
VALUES
  ('91000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('91000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);

SELECT throws_ok(
  $$UPDATE public.app_users SET is_active = false WHERE auth_user_id = '91000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Kendi yönetici hesabınızı pasifleştiremez veya silemezsiniz',
  'yönetici kendi hesabını pasifleştiremez'
);

SELECT throws_ok(
  $$UPDATE public.user_roles SET role_id = '10000000-0000-0000-0000-000000000002' WHERE auth_user_id = '91000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Kendi yönetici rolünüzü değiştiremezsiniz',
  'yönetici kendi rolünü düşüremez'
);

SELECT lives_ok(
  $$UPDATE public.app_users SET is_active = false WHERE auth_user_id = '91000000-0000-0000-0000-000000000002'$$,
  'iki yöneticiden biri diğer yönetici tarafından pasifleştirilebilir'
);

SELECT is(
  (SELECT is_active FROM public.app_users WHERE auth_user_id = '91000000-0000-0000-0000-000000000002'),
  false,
  'pasifleştirme durumu kaydedilir'
);

-- Test veritabanında bootstrap edilmiş gerçek yöneticiler bulunabilir. Son yönetici
-- kontrollerini deterministik yapmak için test yöneticisi dışındaki aktif
-- yöneticiler bu transaction içinde pasifleştirilir; ROLLBACK hepsini geri alır.
UPDATE public.app_users au
SET is_active = false
WHERE au.auth_user_id <> '91000000-0000-0000-0000-000000000001'
  AND au.is_active
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = au.auth_user_id
      AND r.slug = 'administrator'
      AND r.is_active
  );

SELECT set_config('request.jwt.claims', '{}', true);

SELECT throws_ok(
  $$UPDATE public.app_users SET is_active = false WHERE auth_user_id = '91000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Son aktif yönetici hesabı pasifleştirilemez veya silinemez',
  'son aktif yönetici servis katmanından da pasifleştirilemez'
);

SELECT throws_ok(
  $$UPDATE public.user_roles SET role_id = '10000000-0000-0000-0000-000000000002' WHERE auth_user_id = '91000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Son aktif yöneticinin rolü değiştirilemez',
  'son aktif yöneticinin rolü düşürülemez'
);

SELECT throws_ok(
  $$DELETE FROM public.role_permissions rp USING public.roles r, public.permissions p WHERE rp.role_id = r.id AND rp.permission_id = p.id AND r.slug = 'administrator' AND p.module = 'admin' AND p.action = 'manage'$$,
  'P0001',
  'Yönetici rolünün admin/manage izni kaldırılamaz',
  'yönetici rolünün temel izni kaldırılamaz'
);

SELECT throws_ok(
  $$UPDATE public.roles SET is_active = false WHERE slug = 'administrator'$$,
  'P0001',
  'Yerleşik yönetici rolü yeniden adlandırılamaz veya pasifleştirilemez',
  'yerleşik yönetici rolü pasifleştirilemez'
);

SELECT * FROM finish();
ROLLBACK;
