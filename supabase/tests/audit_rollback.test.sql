BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(2);

-- Test transaction'ı içinde audit insert'lerini bilinçli olarak bozan geçici
-- constraint eklenir. ROLLBACK ile şema tamamen eski haline döner.
ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_test_forced_failure
  CHECK (current_setting('app.audit_force_fail', true) IS DISTINCT FROM 'on')
  NOT VALID;
SET LOCAL app.audit_force_fail = 'on';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.roles (id, slug, name_tr, is_system)
    VALUES ('90000000-0000-0000-0000-000000000001', 'audit_test_role', 'Audit Test', false);
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.roles WHERE id = '90000000-0000-0000-0000-000000000001'),
  'kritik rol işlemi audit yazılamazsa rollback olur'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.gunluk_uretim_raporlari (id, tarih, toplam_personel)
    VALUES ('90000000-0000-0000-0000-000000000002', DATE '2999-12-31', 1);
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.gunluk_uretim_raporlari WHERE id = '90000000-0000-0000-0000-000000000002'),
  'normal üretim işlemi audit yazılamazsa rollback olur'
);

SELECT * FROM finish();
ROLLBACK;
