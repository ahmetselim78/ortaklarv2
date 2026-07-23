BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(27);

SELECT has_table('public', 'user_devices', 'cihaz tablosu var');
SELECT has_table('public', 'user_device_sessions', 'cihaz oturumu tablosu var');
SELECT is(
  (SELECT count(*)::integer FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('user_devices', 'user_device_sessions')
     AND column_name IN ('access_token', 'refresh_token', 'password', 'ip', 'ip_address')),
  0,
  'cihaz oturumu şeması token, parola veya IP saklamaz'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_devices', 'SELECT'),
  'authenticated cihaz tablosunu doğrudan okuyamaz'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_device_sessions', 'INSERT,UPDATE,DELETE'),
  'authenticated oturum tablosuna doğrudan yazamaz'
);
SELECT ok(
  has_function_privilege('service_role', 'public.register_device_session(uuid,uuid,uuid,text,text,text,text,text,uuid)', 'EXECUTE'),
  'yalnız servis cihaz oturumu kaydedebilir'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.register_device_session(uuid,uuid,uuid,text,text,text,text,text,uuid)', 'EXECUTE'),
  'istemci kayıt RPCsini doğrudan çağıramaz'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('94000000-0000-0000-0000-000000000001', 'session-admin-1@example.test', '{}'::jsonb, now(), now()),
  ('94000000-0000-0000-0000-000000000002', 'session-admin-2@example.test', '{}'::jsonb, now(), now());

UPDATE public.app_users
SET is_active = true, must_change_password = false
WHERE auth_user_id IN (
  '94000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000002'
);

INSERT INTO public.user_roles(auth_user_id, role_id)
SELECT auth_user_id, '10000000-0000-0000-0000-000000000001'::uuid
FROM public.app_users
WHERE auth_user_id IN (
  '94000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000002'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

INSERT INTO auth.sessions(id, user_id, created_at, updated_at)
VALUES
  ('94100000-0000-4000-8000-000000000001', '94000000-0000-0000-0000-000000000001', now(), now()),
  ('94100000-0000-4000-8000-000000000002', '94000000-0000-0000-0000-000000000001', now(), now()),
  ('94100000-0000-4000-8000-000000000003', '94000000-0000-0000-0000-000000000002', now(), now());

INSERT INTO public.user_devices(
  id, auth_user_id, client_device_id, auto_display_name, device_type, os_family, browser_family
)
VALUES
  ('94200000-0000-4000-8000-000000000001', '94000000-0000-0000-0000-000000000001', '94300000-0000-4000-8000-000000000001', 'Admin 1 Chrome', 'desktop', 'Windows', 'Chrome'),
  ('94200000-0000-4000-8000-000000000002', '94000000-0000-0000-0000-000000000001', '94300000-0000-4000-8000-000000000002', 'Admin 1 Firefox', 'desktop', 'Windows', 'Firefox'),
  ('94200000-0000-4000-8000-000000000003', '94000000-0000-0000-0000-000000000002', '94300000-0000-4000-8000-000000000003', 'Admin 2 Chrome', 'desktop', 'Linux', 'Chrome');

INSERT INTO public.user_device_sessions(
  auth_user_id, device_id, auth_session_id, signed_in_at
)
VALUES
  ('94000000-0000-0000-0000-000000000001', '94200000-0000-4000-8000-000000000001', '94100000-0000-4000-8000-000000000001', now()),
  ('94000000-0000-0000-0000-000000000001', '94200000-0000-4000-8000-000000000002', '94100000-0000-4000-8000-000000000002', now()),
  ('94000000-0000-0000-0000-000000000002', '94200000-0000-4000-8000-000000000003', '94100000-0000-4000-8000-000000000003', now());

UPDATE public.device_session_settings
SET enforcement_mode = 'enforce', enforcement_started_at = now(), revocation_enabled = true;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","session_id":"94100000-0000-4000-8000-000000000001"}',
  true
);

SELECT ok(public.current_session_is_active(), 'kayıtlı aktif session kabul edilir');
SELECT ok(public.current_session_is_allowed(), 'aktif session merkezi erişimden geçer');
SELECT ok(public.has_permission('sessions', 'read'), 'administrator sessions/read iznine sahiptir');

SELECT is(
  (public.admin_revoke_device_sessions(
    '94000000-0000-0000-0000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    'single',
    '94100000-0000-4000-8000-000000000003',
    NULL
  ) ->> 'count')::integer,
  1,
  'tek hedef oturum uygulama katmanında iptal edilir'
);
SELECT is(
  (SELECT status FROM public.user_device_sessions WHERE auth_session_id = '94100000-0000-4000-8000-000000000003'),
  'revoked',
  'hedef oturum revoked kalır'
);
SELECT is(
  (SELECT status FROM public.user_device_sessions WHERE auth_session_id = '94100000-0000-4000-8000-000000000001'),
  'active',
  'yöneticinin diğer cihazı etkilenmez'
);
SELECT ok(
  public.revoke_auth_device_session('94100000-0000-4000-8000-000000000003'),
  'hedef Auth session silinir ve doğrulanır'
);
SELECT is(
  (SELECT count(*)::integer FROM auth.sessions WHERE id = '94100000-0000-4000-8000-000000000003'),
  0,
  'hedef Auth session artık yoktur'
);
SELECT is(
  (SELECT count(*)::integer FROM auth.sessions WHERE id = '94100000-0000-4000-8000-000000000001'),
  1,
  'diğer cihazın Auth session kaydı korunur'
);
SELECT ok(
  (SELECT auth_revocation_confirmed_at IS NOT NULL FROM public.user_device_sessions WHERE auth_session_id = '94100000-0000-4000-8000-000000000003'),
  'Auth iptali uygulama kaydında doğrulanır'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","session_id":"94100000-0000-4000-8000-000000000003"}',
  true
);
SELECT ok(NOT public.current_session_is_active(), 'revoked session aktif sayılmaz');
SELECT ok(NOT public.current_session_is_allowed(), 'revoked session observation dışında da reddedilir');
SELECT is(public.current_session_denial_reason(), 'SESSION_REVOKED', 'revoked session açık hata kodu üretir');
SELECT throws_ok(
  $$SELECT public.touch_device_session(
    '94000000-0000-0000-0000-000000000002',
    '94100000-0000-4000-8000-000000000003',
    'heartbeat', NULL
  )$$,
  'PT401',
  'SESSION_REVOKED',
  'revoked session heartbeat ile yeniden açılamaz'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","session_id":"94400000-0000-4000-8000-000000000099"}',
  true
);
SELECT ok(NOT public.current_session_is_allowed(), 'enforcement kayıtsız oturumu reddeder');
SELECT is(public.current_session_denial_reason(), 'LEGACY_SESSION_REAUTH_REQUIRED', 'kayıtsız eski oturum yeniden giriş ister');

SELECT throws_ok(
  $$SELECT public.admin_revoke_device_sessions(
    '94000000-0000-0000-0000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    'single',
    '94100000-0000-4000-8000-000000000001',
    NULL
  )$$,
  'P0001',
  'Mevcut yönetici oturumu uzaktan sonlandırılamaz',
  'yönetici kendi mevcut cihazını uzaktan kapatamaz'
);

DELETE FROM auth.sessions WHERE id = '94100000-0000-4000-8000-000000000001';
SELECT throws_ok(
  $$SELECT public.admin_revoke_device_sessions(
    '94000000-0000-0000-0000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    'single',
    '94100000-0000-4000-8000-000000000002',
    NULL
  )$$,
  'P0001',
  'Sistemde en az bir aktif yönetici oturumu kalmalıdır',
  'son teknik yönetici oturumu korunur'
);

UPDATE public.device_session_settings SET enforcement_mode = 'observe';
SELECT ok(public.current_session_is_allowed(), 'observation kayıtsız oturumu geçici kabul eder');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","session_id":"94100000-0000-4000-8000-000000000003"}',
  true
);
SELECT ok(NOT public.current_session_is_allowed(), 'observation terminal oturumu yeniden açmaz');

SELECT * FROM finish();
ROLLBACK;
