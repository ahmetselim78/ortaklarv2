-- 050 — Sınırlı merkezi hata takibi, dedup ve alarm rate-limit bilgisi

CREATE TABLE public.system_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('react_boundary','client_unhandled','rpc_api','edge_function','backup_restore','authorization')),
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('warning','error','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  title text NOT NULL,
  sanitized_message text NOT NULL,
  route text,
  function_name text,
  sample_context jsonb NOT NULL DEFAULT '{}',
  occurrence_count bigint NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_alert_at timestamptz,
  created_by uuid,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz
);

CREATE INDEX system_errors_status_last_seen_idx ON public.system_errors(status, last_seen_at DESC);
CREATE INDEX system_errors_source_idx ON public.system_errors(source, last_seen_at DESC);

ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_errors FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_errors FROM anon, authenticated;
GRANT SELECT ON public.system_errors TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.system_errors TO service_role;

CREATE POLICY system_errors_admin_read ON public.system_errors FOR SELECT TO authenticated
USING (public.has_permission('errors', 'read') AND public.current_aal2());

CREATE OR REPLACE FUNCTION public.error_scrub_text(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE v_result text := COALESCE(p_value, '');
BEGIN
  v_result := regexp_replace(v_result, 'Bearer[[:space:]]+[A-Za-z0-9._~+/=-]+', 'Bearer [TEMİZLENDİ]', 'gi');
  v_result := regexp_replace(v_result, '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', '[E-POSTA]', 'gi');
  v_result := regexp_replace(v_result, '(password|parola|sifre|şifre|token|secret|authorization|api[_-]?key)[[:space:]]*[:=][[:space:]]*[^[:space:],;&]+', '\1=[TEMİZLENDİ]', 'gi');
  v_result := regexp_replace(v_result, '(^|[^0-9])([+]?[0-9][0-9 ()-]{8,}[0-9])([^0-9]|$)', '\1[TELEFON]\3', 'g');
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.error_sanitize(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE v_result jsonb := '{}'::jsonb; v_key text; v_item jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF jsonb_typeof(p_value) = 'object' THEN
    FOR v_key, v_item IN SELECT key, value FROM jsonb_each(p_value) LOOP
      IF lower(v_key) ~ '(password|parola|sifre|şifre|token|secret|authorization|cookie|service.role|api.key|email|telefon|phone)' THEN
        v_result := v_result || jsonb_build_object(v_key, '[TEMİZLENDİ]');
      ELSE
        v_result := v_result || jsonb_build_object(v_key, public.error_sanitize(v_item));
      END IF;
    END LOOP;
    RETURN v_result;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    RETURN (SELECT COALESCE(jsonb_agg(public.error_sanitize(value)), '[]'::jsonb) FROM jsonb_array_elements(p_value));
  END IF;
  RETURN p_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_system_error(
  p_source text,
  p_severity text,
  p_title text,
  p_message text,
  p_route text DEFAULT NULL,
  p_function_name text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_fingerprint text DEFAULT NULL
)
RETURNS TABLE(error_id uuid, should_alert boolean, occurrence_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_fp text; v_row public.system_errors%ROWTYPE; v_alert boolean;
BEGIN
  IF auth.role() <> 'service_role' AND public.current_app_user_id() IS NULL THEN
    RAISE EXCEPTION 'Aktif oturum gerekli';
  END IF;
  IF p_source NOT IN ('react_boundary','client_unhandled','rpc_api','edge_function','backup_restore','authorization')
     OR p_severity NOT IN ('warning','error','critical') THEN
    RAISE EXCEPTION 'Geçersiz hata sınıfı';
  END IF;
  v_fp := COALESCE(NULLIF(p_fingerprint, ''), md5(concat_ws('|', p_source, p_title, p_message, p_route, p_function_name)));
  v_fp := left(v_fp, 128);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_fp, 0));

  SELECT * INTO v_row FROM public.system_errors WHERE fingerprint = v_fp FOR UPDATE;
  IF FOUND THEN
    v_alert := p_severity = 'critical' AND (v_row.last_alert_at IS NULL OR v_row.last_alert_at < now() - interval '15 minutes');
    UPDATE public.system_errors SET
      severity = CASE WHEN p_severity = 'critical' THEN 'critical' ELSE severity END,
      sanitized_message = left(public.error_scrub_text(p_message), 2000),
      route = left(split_part(public.error_scrub_text(p_route), '?', 1), 500),
      function_name = left(public.error_scrub_text(p_function_name), 200),
      sample_context = public.error_sanitize(COALESCE(p_context, '{}'::jsonb)),
      occurrence_count = system_errors.occurrence_count + 1,
      last_seen_at = now(),
      status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END,
      last_alert_at = CASE WHEN v_alert THEN now() ELSE last_alert_at END
    WHERE id = v_row.id
    RETURNING id, system_errors.occurrence_count INTO error_id, occurrence_count;
  ELSE
    v_alert := p_severity = 'critical';
    INSERT INTO public.system_errors (
      fingerprint, source, severity, title, sanitized_message, route,
      function_name, sample_context, created_by, last_alert_at
    ) VALUES (
      v_fp, p_source, p_severity, left(public.error_scrub_text(p_title), 300), left(public.error_scrub_text(p_message), 2000),
      left(split_part(public.error_scrub_text(p_route), '?', 1), 500),
      left(public.error_scrub_text(p_function_name), 200), public.error_sanitize(COALESCE(p_context, '{}'::jsonb)), auth.uid(),
      CASE WHEN v_alert THEN now() END
    ) RETURNING id, system_errors.occurrence_count INTO error_id, occurrence_count;
  END IF;
  should_alert := v_alert;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_system_error_status(p_error_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT (public.has_permission('errors', 'manage') AND public.current_aal2()) THEN
    RAISE EXCEPTION 'AAL2 hata yönetimi yetkisi gerekli';
  END IF;
  IF p_status NOT IN ('open','acknowledged','resolved') THEN RAISE EXCEPTION 'Geçersiz durum'; END IF;
  UPDATE public.system_errors SET
    status = p_status,
    acknowledged_by = CASE WHEN p_status = 'acknowledged' THEN auth.uid() ELSE acknowledged_by END,
    acknowledged_at = CASE WHEN p_status = 'acknowledged' THEN now() ELSE acknowledged_at END,
    resolved_by = CASE WHEN p_status = 'resolved' THEN auth.uid() ELSE NULL END,
    resolved_at = CASE WHEN p_status = 'resolved' THEN now() ELSE NULL END
  WHERE id = p_error_id;
END;
$$;

REVOKE ALL ON FUNCTION public.error_sanitize(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.error_scrub_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_system_error(text,text,text,text,text,text,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_system_error_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_system_error(text,text,text,text,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_system_error_status(uuid,text) TO authenticated;
