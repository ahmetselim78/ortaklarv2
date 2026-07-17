-- 049 — Append-only audit. Trigger insert'i ana işlemle aynı transaction'dadır;
-- insert başarısız olursa ana işlem de rollback olur.

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_personel_id uuid,
  request_id text,
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','INTENT','SUCCESS','FAILURE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX audit_events_occurred_idx ON public.audit_events(occurred_at DESC);
CREATE INDEX audit_events_actor_idx ON public.audit_events(actor_user_id, occurred_at DESC);
CREATE INDEX audit_events_table_record_idx ON public.audit_events(table_name, record_id, occurred_at DESC);
CREATE INDEX audit_events_action_idx ON public.audit_events(action, occurred_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_events FROM anon, authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO service_role;

CREATE POLICY audit_admin_read ON public.audit_events FOR SELECT TO authenticated
USING (public.has_permission('audit', 'read') AND public.current_aal2());

CREATE OR REPLACE FUNCTION public.audit_sanitize(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_key text;
  v_item jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value) = 'object' THEN
    FOR v_key, v_item IN SELECT key, value FROM jsonb_each(p_value) LOOP
      IF lower(v_key) ~ '(password|parola|sifre|şifre|token|secret|authorization|cookie|service.role|api.key|giris_sifresi)' THEN
        v_result := v_result || jsonb_build_object(v_key, '[TEMİZLENDİ]');
      ELSE
        v_result := v_result || jsonb_build_object(v_key, public.audit_sanitize(v_item));
      END IF;
    END LOOP;
    RETURN v_result;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    RETURN (SELECT COALESCE(jsonb_agg(public.audit_sanitize(value)), '[]'::jsonb) FROM jsonb_array_elements(p_value));
  END IF;
  RETURN p_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_record_id(p_row jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    p_row ->> 'id',
    p_row ->> 'auth_user_id',
    NULLIF(concat_ws(':', p_row ->> 'role_id', p_row ->> 'permission_id'), ''),
    p_row ->> 'anahtar',
    md5(p_row::text)
  )
$$;

CREATE OR REPLACE FUNCTION public.audit_changed_fields(p_old jsonb, p_new jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::text[])
  FROM (
    SELECT key FROM jsonb_object_keys(COALESCE(p_old, '{}'::jsonb)) AS old_keys(key)
    UNION
    SELECT key FROM jsonb_object_keys(COALESCE(p_new, '{}'::jsonb)) AS new_keys(key)
  ) keys
  WHERE (p_old -> key) IS DISTINCT FROM (p_new -> key)
$$;

CREATE OR REPLACE FUNCTION public.write_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_headers jsonb;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  v_row := COALESCE(v_new, v_old);
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers := '{}'::jsonb;
  END;

  INSERT INTO public.audit_events (
    actor_user_id, actor_personel_id, request_id, table_name, record_id,
    action, old_data, new_data, changed_fields, metadata
  ) VALUES (
    auth.uid(), public.current_personel_id(), COALESCE(v_headers ->> 'x-request-id', gen_random_uuid()::text),
    TG_TABLE_NAME, public.audit_record_id(v_row), TG_OP,
    public.audit_sanitize(v_old), public.audit_sanitize(v_new),
    public.audit_changed_fields(v_old, v_new),
    jsonb_build_object('schema', TG_TABLE_SCHEMA)
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Audit satırları normal veya ayrıcalıklı SQL ile değiştirilemez. Arşivleme
-- satır silmez; doğrulanmış aylık kopyalar GCS'de tutulur.
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Audit kayıtları append-only''dir';
END;
$$;

CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'app_users','hr_personel','hr_personel_istasyon_yetkileri',
    'roles','role_permissions','user_roles',
    'siparisler','siparis_detaylari','uretim_emirleri','uretim_emri_detaylari',
    'gunluk_uretim_raporlari','gunluk_uretim_istasyon_kayitlari',
    'tamir_kayitlari','ayarlar','telegram_ayarlari','telegram_rapor_saatleri',
    'uretim_istasyonlari','stok'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'audit_' || v_table, v_table);
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_audit_event()',
        'audit_' || v_table, v_table
      );
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.begin_admin_operation(
  p_operation text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_admin_aal2() THEN RAISE EXCEPTION 'AAL2 yönetici yetkisi gerekli'; END IF;
  IF length(p_operation) > 100 OR length(p_target_type) > 100 OR length(p_target_id) > 200 THEN
    RAISE EXCEPTION 'Audit intent parametresi çok uzun';
  END IF;
  INSERT INTO public.audit_events (
    id, actor_user_id, actor_personel_id, table_name, record_id, action, new_data, metadata
  ) VALUES (
    v_id, auth.uid(), public.current_personel_id(), 'admin_operation', p_target_id, 'INTENT',
    jsonb_build_object('operation', p_operation, 'target_type', p_target_type),
    public.audit_sanitize(COALESCE(p_metadata, '{}'::jsonb))
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_admin_operation(
  p_intent_id uuid,
  p_success boolean,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_admin_aal2() THEN RAISE EXCEPTION 'AAL2 yönetici yetkisi gerekli'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_events
    WHERE id = p_intent_id AND action = 'INTENT' AND actor_user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Audit intent bulunamadı'; END IF;
  INSERT INTO public.audit_events (
    id, actor_user_id, actor_personel_id, table_name, record_id, action, new_data, metadata
  ) VALUES (
    v_id, auth.uid(), public.current_personel_id(), 'admin_operation', p_intent_id::text,
    CASE WHEN p_success THEN 'SUCCESS' ELSE 'FAILURE' END,
    jsonb_build_object('intent_id', p_intent_id), public.audit_sanitize(COALESCE(p_metadata, '{}'::jsonb))
  );
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_sanitize(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_record_id(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_changed_fields(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_audit_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_audit_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_admin_operation(text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_admin_operation(uuid, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_admin_operation(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_admin_operation(uuid, boolean, jsonb) TO authenticated;
