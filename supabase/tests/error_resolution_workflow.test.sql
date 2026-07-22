BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(19);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('93000000-0000-0000-0000-000000000001', 'error-admin@example.test', '{}'::jsonb, now(), now()),
  ('93000000-0000-0000-0000-000000000002', 'error-viewer@example.test', '{}'::jsonb, now(), now());

UPDATE public.app_users
SET is_active = true, must_change_password = false
WHERE auth_user_id IN (
  '93000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000002'
);

INSERT INTO public.user_roles (auth_user_id, role_id)
VALUES
  ('93000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('93000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004');

INSERT INTO public.system_errors (
  id, fingerprint, source, severity, status, title, sanitized_message
)
VALUES
  ('93000000-0000-0000-0000-000000000101', 'error-workflow-1', 'client_unhandled', 'error', 'open', 'Test 1', 'Temiz test hatası 1'),
  ('93000000-0000-0000-0000-000000000102', 'error-workflow-2', 'edge_function', 'critical', 'open', 'Test 2', 'Temiz test hatası 2');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',
  true
);

SELECT throws_ok(
  $$SELECT * FROM public.acknowledge_system_errors_for_ai_export(ARRAY['93000000-0000-0000-0000-000000000101'::uuid])$$,
  'P0001',
  'AAL2 hata yönetimi yetkisi gerekli',
  'errors/manage izni olmayan AAL2 kullanıcı hata aktarımını başlatamaz'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

SELECT throws_ok(
  $$SELECT public.resolve_system_errors_from_report(ARRAY['93000000-0000-0000-0000-000000000101'::uuid])$$,
  'P0001',
  'AAL2 hata yönetimi yetkisi gerekli',
  'yönetici AAL1 oturumuyla çözüm raporu uygulayamaz'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.acknowledge_system_errors_for_ai_export(uuid[])', 'EXECUTE'),
  'anon AI hata aktarım fonksiyonunu çalıştıramaz'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.acknowledge_system_errors_for_ai_export(uuid[])', 'EXECUTE'),
  'authenticated rolü AI hata aktarım fonksiyonunu çağırabilir'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.resolve_system_errors_from_report(uuid[])', 'EXECUTE'),
  'anon çözüm raporu fonksiyonunu çalıştıramaz'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.resolve_system_errors_from_report(uuid[])', 'EXECUTE'),
  'authenticated rolü çözüm raporu fonksiyonunu çağırabilir'
);

SELECT throws_ok(
  $$SELECT * FROM public.acknowledge_system_errors_for_ai_export(ARRAY[
    '93000000-0000-0000-0000-000000000101'::uuid,
    '93000000-0000-0000-0000-000000000101'::uuid
  ])$$,
  'P0001',
  'Aynı hata kimliği birden fazla kez gönderilemez',
  'AI aktarımı yinelenen hata kimliklerini reddeder'
);

SELECT throws_ok(
  $$SELECT * FROM public.acknowledge_system_errors_for_ai_export(
    array_fill('93000000-0000-0000-0000-000000000101'::uuid, ARRAY[5001])
  )$$,
  'P0001',
  'AI dışa aktarımı 1 ile 5000 arasında hata içermelidir',
  'AI aktarımı 5000 kimlik sınırını uygular'
);

SELECT is(
  (SELECT count(*) FROM public.acknowledge_system_errors_for_ai_export(ARRAY[
    '93000000-0000-0000-0000-000000000101'::uuid,
    '93000000-0000-0000-0000-000000000102'::uuid
  ])),
  2::bigint,
  'iki açık hata AI aktarımında incelemeye alınır'
);

SELECT is(
  (SELECT count(*) FROM public.system_errors WHERE id IN (
    '93000000-0000-0000-0000-000000000101',
    '93000000-0000-0000-0000-000000000102'
  ) AND status = 'acknowledged'),
  2::bigint,
  'aktarılan hataların durumu acknowledged olur'
);

SELECT is(
  (SELECT count(*) FROM public.system_errors WHERE id IN (
    '93000000-0000-0000-0000-000000000101',
    '93000000-0000-0000-0000-000000000102'
  ) AND acknowledged_by = '93000000-0000-0000-0000-000000000001'::uuid AND acknowledged_at IS NOT NULL),
  2::bigint,
  'inceleme aktörü ve zamanı kaydedilir'
);

SELECT is(
  (SELECT count(*) FROM public.acknowledge_system_errors_for_ai_export(ARRAY[
    '93000000-0000-0000-0000-000000000101'::uuid,
    '93000000-0000-0000-0000-000000000102'::uuid
  ])),
  0::bigint,
  'aynı hata ikinci kez aktarılırsa açık kayıt bulunmadığı için sonuç boştur'
);

SELECT throws_ok(
  $$SELECT public.resolve_system_errors_from_report(ARRAY[
    '93000000-0000-0000-0000-000000000101'::uuid,
    '93000000-0000-0000-0000-000000000101'::uuid
  ])$$,
  'P0001',
  'Aynı hata kimliği birden fazla kez gönderilemez',
  'çözüm raporu yinelenen hata kimliklerini reddeder'
);

SELECT throws_ok(
  $$SELECT public.resolve_system_errors_from_report(ARRAY['93000000-0000-0000-0000-000000000199'::uuid])$$,
  'P0001',
  'Çözüm raporundaki bazı hata kayıtları bulunamadı',
  'çözüm raporu bulunmayan hata kimliğini reddeder'
);

SELECT throws_ok(
  $$SELECT public.resolve_system_errors_from_report(
    array_fill('93000000-0000-0000-0000-000000000101'::uuid, ARRAY[501])
  )$$,
  'P0001',
  'Çözüm raporu 1 ile 500 arasında hata içermelidir',
  'çözüm raporu 500 kimlik sınırını uygular'
);

SELECT is(
  public.resolve_system_errors_from_report(ARRAY[
    '93000000-0000-0000-0000-000000000101'::uuid,
    '93000000-0000-0000-0000-000000000102'::uuid
  ]),
  2,
  'iki hata çözüm raporuyla kapatılır'
);

SELECT is(
  (SELECT count(*) FROM public.system_errors WHERE id IN (
    '93000000-0000-0000-0000-000000000101',
    '93000000-0000-0000-0000-000000000102'
  ) AND status = 'resolved'),
  2::bigint,
  'çözüm raporundaki hataların durumu resolved olur'
);

SELECT is(
  (SELECT count(*) FROM public.system_errors WHERE id IN (
    '93000000-0000-0000-0000-000000000101',
    '93000000-0000-0000-0000-000000000102'
  ) AND resolved_by = '93000000-0000-0000-0000-000000000001'::uuid AND resolved_at IS NOT NULL),
  2::bigint,
  'çözüm aktörü ve zamanı kaydedilir'
);

SELECT is(
  public.resolve_system_errors_from_report(ARRAY[
    '93000000-0000-0000-0000-000000000101'::uuid,
    '93000000-0000-0000-0000-000000000102'::uuid
  ]),
  0,
  'önceden çözülmüş hatalar ikinci kez sayılmaz'
);

SELECT * FROM finish();
ROLLBACK;
