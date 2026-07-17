BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);

SELECT ok(NOT has_table_privilege('anon', 'public.cari', 'SELECT'), 'anon cari okuyamaz');
SELECT ok(NOT has_table_privilege('anon', 'public.siparisler', 'SELECT'), 'anon sipariş okuyamaz');
SELECT ok(NOT has_table_privilege('anon', 'public.hr_personel', 'SELECT'), 'anon personel okuyamaz');
SELECT ok(NOT has_table_privilege('anon', 'public.telegram_ayarlari', 'SELECT'), 'anon Telegram ayarı okuyamaz');
SELECT ok(NOT has_function_privilege('anon', 'public.sonraki_sayac(text,integer)', 'EXECUTE'), 'anon sayaç RPC çalıştıramaz');
SELECT ok(NOT has_function_privilege('anon', 'public.saatlik_sayac_arttir(uuid,integer)', 'EXECUTE'), 'anon saatlik sayaç RPC çalıştıramaz');
SELECT ok(NOT has_function_privilege('authenticated', 'public.write_audit_event()', 'EXECUTE'), 'istemci audit trigger fonksiyonunu doğrudan çağıramaz');
SELECT ok(NOT has_table_privilege('authenticated', 'public.audit_events', 'UPDATE'), 'audit güncellenemez');
SELECT ok(NOT has_table_privilege('authenticated', 'public.audit_events', 'DELETE'), 'audit silinemez');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon']::name[]), 0, 'anon RLS politikası yok');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true')), 0, 'geniş true politikası yok');
SELECT is((SELECT count(*)::integer FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_personel' AND column_name='giris_sifresi'), 0, 'düz metin parola kolonu yok');
SELECT is((SELECT count(*)::integer FROM pg_trigger WHERE tgrelid='public.yikama_loglari'::regclass AND tgname LIKE 'audit_%' AND NOT tgisinternal), 0, 'yıkama logları ikinci kez audit edilmez');
SELECT ok(has_function_privilege('service_role', 'public.report_system_error(text,text,text,text,text,text,jsonb,text)', 'EXECUTE'), 'hata Edge servisi sınırlı RPCyi çalıştırabilir');
SELECT ok(NOT has_function_privilege('authenticated', 'public.report_system_error(text,text,text,text,text,text,jsonb,text)', 'EXECUTE'), 'istemci hata tablosu RPCsini doğrudan spam edemez');

SELECT * FROM finish();
ROLLBACK;
