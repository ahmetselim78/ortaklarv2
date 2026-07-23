-- 063 — Cihaz oturumu işlemleri ve gözlem modu.
-- Kayıtsız legacy oturumlar gözlem modunda geçer; terminal kayıtlar her zaman reddedilir.

CREATE OR REPLACE FUNCTION public.current_auth_session_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_session_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_device_sessions uds
    WHERE uds.auth_session_id = public.current_auth_session_id()
      AND uds.auth_user_id = auth.uid()
      AND uds.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.current_session_is_allowed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_session_id uuid := public.current_auth_session_id();
  v_status text;
  v_mode text;
BEGIN
  SELECT enforcement_mode INTO v_mode
  FROM public.device_session_settings WHERE singleton;

  IF v_session_id IS NULL THEN
    RETURN COALESCE(v_mode, 'observe') = 'observe';
  END IF;

  SELECT status INTO v_status
  FROM public.user_device_sessions
  WHERE auth_session_id = v_session_id AND auth_user_id = auth.uid();

  IF FOUND THEN
    RETURN v_status = 'active';
  END IF;

  RETURN COALESCE(v_mode, 'observe') = 'observe';
END;
$$;

CREATE OR REPLACE FUNCTION public.current_session_denial_reason()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_session_id uuid := public.current_auth_session_id();
  v_status text;
  v_mode text;
BEGIN
  SELECT enforcement_mode INTO v_mode
  FROM public.device_session_settings WHERE singleton;

  IF v_session_id IS NULL THEN
    RETURN CASE WHEN COALESCE(v_mode, 'observe') = 'enforce' THEN 'SESSION_REQUIRED' ELSE NULL END;
  END IF;

  SELECT status INTO v_status
  FROM public.user_device_sessions
  WHERE auth_session_id = v_session_id AND auth_user_id = auth.uid();

  IF FOUND AND v_status <> 'active' THEN RETURN 'SESSION_REVOKED'; END IF;
  IF NOT FOUND AND COALESCE(v_mode, 'observe') = 'enforce' THEN
    RETURN 'LEGACY_SESSION_REAUTH_REQUIRED';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT au.auth_user_id
  FROM public.app_users au
  WHERE au.auth_user_id = auth.uid()
    AND au.is_active
    AND public.current_session_is_allowed()
$$;

CREATE OR REPLACE FUNCTION public.current_personel_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT au.personel_id
  FROM public.app_users au
  WHERE au.auth_user_id = auth.uid()
    AND au.is_active
    AND public.current_session_is_allowed()
$$;

CREATE OR REPLACE FUNCTION public.current_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
    AND public.current_session_is_allowed()
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_module text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.current_session_is_allowed() AND EXISTS (
    SELECT 1
    FROM public.app_users au
    JOIN public.user_roles ur ON ur.auth_user_id = au.auth_user_id
    JOIN public.roles r ON r.id = ur.role_id AND r.is_active
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE au.auth_user_id = auth.uid()
      AND au.is_active
      AND NOT au.must_change_password
      AND p.module = p_module
      AND p.action = p_action
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT public.current_aal2() AND public.has_permission('admin', 'manage')
$$;

CREATE OR REPLACE FUNCTION public.my_access_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_denial text := public.current_session_denial_reason();
  v_result jsonb;
BEGIN
  IF v_denial IS NOT NULL THEN
    RAISE SQLSTATE 'PT401' USING MESSAGE = v_denial;
  END IF;

  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'auth_user_id', au.auth_user_id,
      'personel_id', au.personel_id,
      'username', au.username,
      'display_name', au.display_name,
      'account_type', au.account_type,
      'is_active', au.is_active,
      'must_change_password', au.must_change_password,
      'auth_migrated_at', au.auth_migrated_at
    ),
    'role', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('slug', r.slug, 'name_tr', r.name_tr) END,
    'permissions', COALESCE(
      jsonb_agg(DISTINCT jsonb_build_object('module', p.module, 'action', p.action))
        FILTER (WHERE p.id IS NOT NULL),
      '[]'::jsonb
    ),
    'aal', COALESCE(auth.jwt() ->> 'aal', 'aal1')
  ) INTO v_result
  FROM public.app_users au
  LEFT JOIN public.user_roles ur ON ur.auth_user_id = au.auth_user_id
  LEFT JOIN public.roles r ON r.id = ur.role_id AND r.is_active
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
  LEFT JOIN public.permissions p ON p.id = rp.permission_id
  WHERE au.auth_user_id = auth.uid()
  GROUP BY au.auth_user_id, au.personel_id, au.username, au.display_name,
           au.account_type, au.is_active, au.must_change_password,
           au.auth_migrated_at, r.id, r.slug, r.name_tr;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_device_session(
  p_auth_user_id uuid,
  p_auth_session_id uuid,
  p_client_device_id uuid,
  p_auto_display_name text,
  p_device_type text,
  p_os_family text,
  p_browser_family text,
  p_event text,
  p_previous_auth_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_device_id uuid;
  v_auth_created_at timestamptz;
  v_existing_status text;
  v_existing_session boolean := false;
  v_mode text;
  v_enforcement_started_at timestamptz;
BEGIN
  IF p_event NOT IN ('signed_in', 'initial_session', 'token_refreshed', 'visible', 'heartbeat') THEN
    RAISE EXCEPTION 'Geçersiz cihaz oturumu olayı';
  END IF;
  IF p_device_type NOT IN ('desktop', 'mobile', 'tablet', 'unknown')
     OR p_os_family NOT IN ('Windows', 'Android', 'iOS', 'macOS', 'Linux', 'unknown')
     OR p_browser_family NOT IN ('Chrome', 'Edge', 'Firefox', 'Safari', 'unknown') THEN
    RAISE EXCEPTION 'Geçersiz cihaz bilgisi';
  END IF;
  IF length(trim(p_auto_display_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Geçersiz cihaz adı';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE auth_user_id = p_auth_user_id AND is_active
  ) THEN RAISE EXCEPTION 'Aktif uygulama kullanıcısı bulunamadı'; END IF;

  SELECT s.created_at INTO v_auth_created_at
  FROM auth.sessions s
  WHERE s.id = p_auth_session_id AND s.user_id = p_auth_user_id;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT401' USING MESSAGE = 'SESSION_NOT_FOUND'; END IF;

  SELECT status INTO v_existing_status
  FROM public.user_device_sessions
  WHERE auth_session_id = p_auth_session_id AND auth_user_id = p_auth_user_id;
  v_existing_session := FOUND;
  IF v_existing_session AND v_existing_status <> 'active' THEN
    RAISE SQLSTATE 'PT401' USING MESSAGE = 'SESSION_REVOKED';
  END IF;

  SELECT enforcement_mode, enforcement_started_at
  INTO v_mode, v_enforcement_started_at
  FROM public.device_session_settings WHERE singleton;
  IF NOT v_existing_session AND COALESCE(v_mode, 'observe') = 'enforce'
     AND v_auth_created_at < v_enforcement_started_at THEN
    RAISE SQLSTATE 'PT401' USING MESSAGE = 'LEGACY_SESSION_REAUTH_REQUIRED';
  END IF;

  INSERT INTO public.user_devices(
    auth_user_id, client_device_id, auto_display_name,
    device_type, os_family, browser_family
  ) VALUES (
    p_auth_user_id, p_client_device_id, left(trim(p_auto_display_name), 80),
    p_device_type, p_os_family, p_browser_family
  )
  ON CONFLICT (auth_user_id, client_device_id) DO UPDATE SET
    auto_display_name = EXCLUDED.auto_display_name,
    device_type = EXCLUDED.device_type,
    os_family = EXCLUDED.os_family,
    browser_family = EXCLUDED.browser_family,
    last_seen_at = now(),
    updated_at = now()
  RETURNING id INTO v_device_id;

  IF p_previous_auth_session_id IS NOT NULL AND p_previous_auth_session_id <> p_auth_session_id THEN
    UPDATE public.user_device_sessions SET
      status = 'replaced', termination_reason = 'token_replaced', ended_at = now(),
      replaced_by_session_id = p_auth_session_id, updated_at = now()
    WHERE auth_session_id = p_previous_auth_session_id
      AND auth_user_id = p_auth_user_id
      AND status = 'active';
  END IF;

  INSERT INTO public.user_device_sessions(
    auth_user_id, device_id, auth_session_id, signed_in_at,
    last_seen_at, last_token_refresh_at
  ) VALUES (
    p_auth_user_id, v_device_id, p_auth_session_id, v_auth_created_at,
    now(), CASE WHEN p_event = 'token_refreshed' THEN now() ELSE NULL END
  )
  ON CONFLICT (auth_session_id) DO UPDATE SET
    device_id = EXCLUDED.device_id,
    last_seen_at = now(),
    last_token_refresh_at = CASE
      WHEN p_event = 'token_refreshed' THEN now()
      ELSE public.user_device_sessions.last_token_refresh_at
    END,
    updated_at = now();

  RETURN jsonb_build_object(
    'device_id', v_device_id,
    'auth_session_id', p_auth_session_id,
    'server_time', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_device_session(
  p_auth_user_id uuid,
  p_auth_session_id uuid,
  p_event text,
  p_action_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_event NOT IN ('heartbeat', 'visible', 'token_refreshed', 'action') THEN
    RAISE EXCEPTION 'Geçersiz oturum dokunma olayı';
  END IF;
  IF p_action_type IS NOT NULL AND p_action_type !~ '^[a-z][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'Geçersiz işlem türü';
  END IF;

  UPDATE public.user_device_sessions SET
    last_seen_at = now(),
    last_action_at = CASE WHEN p_event = 'action' THEN now() ELSE last_action_at END,
    last_action_type = CASE WHEN p_event = 'action' THEN p_action_type ELSE last_action_type END,
    last_token_refresh_at = CASE WHEN p_event = 'token_refreshed' THEN now() ELSE last_token_refresh_at END,
    updated_at = now()
  WHERE auth_user_id = p_auth_user_id
    AND auth_session_id = p_auth_session_id
    AND status = 'active';
  IF NOT FOUND THEN RAISE SQLSTATE 'PT401' USING MESSAGE = 'SESSION_REVOKED'; END IF;

  UPDATE public.user_devices d SET last_seen_at = now(), updated_at = now()
  FROM public.user_device_sessions s
  WHERE s.auth_user_id = p_auth_user_id
    AND s.auth_session_id = p_auth_session_id
    AND s.device_id = d.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_device_session(
  p_auth_user_id uuid,
  p_auth_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.user_device_sessions SET
    status = 'ended', termination_reason = 'manual_logout',
    ended_at = now(), updated_at = now()
  WHERE auth_user_id = p_auth_user_id
    AND auth_session_id = p_auth_session_id
    AND status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_device_sessions(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_device_type text DEFAULT NULL,
  p_recent_only boolean DEFAULT false,
  p_role_slug text DEFAULT NULL,
  p_account_type text DEFAULT NULL,
  p_signed_in_from timestamptz DEFAULT NULL,
  p_signed_in_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_total bigint;
  v_items jsonb;
BEGIN
  IF p_status NOT IN ('all', 'active', 'inactive') THEN RAISE EXCEPTION 'Geçersiz durum filtresi'; END IF;

  WITH rows AS (
    SELECT
      s.id, s.auth_user_id, s.auth_session_id, s.signed_in_at, s.last_seen_at,
      s.last_action_at, s.last_action_type, s.last_token_refresh_at,
      s.status, s.termination_reason, s.ended_at, s.terminated_by,
      s.auth_revocation_confirmed_at, s.auth_revocation_last_attempt_at,
      s.auth_revocation_attempt_count,
      d.id AS device_id, d.auto_display_name, d.custom_display_name,
      d.device_type, d.os_family, d.browser_family,
      au.display_name AS user_display_name, au.username, au.account_type,
      r.slug AS role_slug, r.name_tr AS role_name,
      EXISTS (SELECT 1 FROM auth.sessions axs WHERE axs.id = s.auth_session_id AND axs.user_id = s.auth_user_id) AS auth_active,
      s.last_seen_at >= now() - interval '2 minutes' AS recently_seen
    FROM public.user_device_sessions s
    JOIN public.user_devices d ON d.id = s.device_id
    JOIN public.app_users au ON au.auth_user_id = s.auth_user_id
    LEFT JOIN public.user_roles ur ON ur.auth_user_id = au.auth_user_id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    WHERE (
      NULLIF(trim(COALESCE(p_search, '')), '') IS NULL
      OR au.display_name ILIKE '%' || trim(p_search) || '%'
      OR COALESCE(au.username, '') ILIKE '%' || trim(p_search) || '%'
      OR d.auto_display_name ILIKE '%' || trim(p_search) || '%'
      OR COALESCE(d.custom_display_name, '') ILIKE '%' || trim(p_search) || '%'
    )
    AND (p_device_type IS NULL OR d.device_type = p_device_type)
    AND (p_role_slug IS NULL OR r.slug = p_role_slug)
    AND (p_account_type IS NULL OR au.account_type = p_account_type)
    AND (p_signed_in_from IS NULL OR s.signed_in_at >= p_signed_in_from)
    AND (p_signed_in_to IS NULL OR s.signed_in_at < p_signed_in_to + interval '1 day')
    AND (NOT p_recent_only OR s.last_seen_at >= now() - interval '2 minutes')
  ), filtered AS (
    SELECT * FROM rows
    WHERE p_status = 'all'
       OR (p_status = 'active' AND status = 'active' AND auth_active)
       OR (p_status = 'inactive' AND NOT (status = 'active' AND auth_active))
  )
  SELECT count(*) INTO v_total FROM filtered;

  WITH rows AS (
    SELECT
      s.id, s.auth_user_id, s.auth_session_id, s.signed_in_at, s.last_seen_at,
      s.last_action_at, s.last_action_type, s.last_token_refresh_at,
      s.status, s.termination_reason, s.ended_at, s.terminated_by,
      s.auth_revocation_confirmed_at, s.auth_revocation_last_attempt_at,
      s.auth_revocation_attempt_count,
      d.id AS device_id, d.auto_display_name, d.custom_display_name,
      d.device_type, d.os_family, d.browser_family,
      au.display_name AS user_display_name, au.username, au.account_type,
      r.slug AS role_slug, r.name_tr AS role_name,
      EXISTS (SELECT 1 FROM auth.sessions axs WHERE axs.id = s.auth_session_id AND axs.user_id = s.auth_user_id) AS auth_active,
      s.last_seen_at >= now() - interval '2 minutes' AS recently_seen
    FROM public.user_device_sessions s
    JOIN public.user_devices d ON d.id = s.device_id
    JOIN public.app_users au ON au.auth_user_id = s.auth_user_id
    LEFT JOIN public.user_roles ur ON ur.auth_user_id = au.auth_user_id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    WHERE (
      NULLIF(trim(COALESCE(p_search, '')), '') IS NULL
      OR au.display_name ILIKE '%' || trim(p_search) || '%'
      OR COALESCE(au.username, '') ILIKE '%' || trim(p_search) || '%'
      OR d.auto_display_name ILIKE '%' || trim(p_search) || '%'
      OR COALESCE(d.custom_display_name, '') ILIKE '%' || trim(p_search) || '%'
    )
    AND (p_device_type IS NULL OR d.device_type = p_device_type)
    AND (p_role_slug IS NULL OR r.slug = p_role_slug)
    AND (p_account_type IS NULL OR au.account_type = p_account_type)
    AND (p_signed_in_from IS NULL OR s.signed_in_at >= p_signed_in_from)
    AND (p_signed_in_to IS NULL OR s.signed_in_at < p_signed_in_to + interval '1 day')
    AND (NOT p_recent_only OR s.last_seen_at >= now() - interval '2 minutes')
  ), filtered AS (
    SELECT * FROM rows
    WHERE p_status = 'all'
       OR (p_status = 'active' AND status = 'active' AND auth_active)
       OR (p_status = 'inactive' AND NOT (status = 'active' AND auth_active))
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(page_rows) ORDER BY page_rows.last_seen_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT * FROM filtered
    ORDER BY last_seen_at DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  ) page_rows;

  RETURN jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page, 'page_size', v_page_size);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_rename_device(
  p_device_id uuid,
  p_custom_display_name text,
  p_actor_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_custom_display_name IS NOT NULL
     AND length(trim(p_custom_display_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Cihaz adı 1-80 karakter olmalıdır';
  END IF;
  UPDATE public.user_devices SET
    custom_display_name = NULLIF(left(trim(p_custom_display_name), 80), ''),
    updated_at = now()
  WHERE id = p_device_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cihaz bulunamadı'; END IF;

  INSERT INTO public.audit_events(actor_user_id, table_name, record_id, action, new_data, metadata)
  VALUES (
    p_actor_user_id, 'user_devices', p_device_id::text, 'UPDATE',
    jsonb_build_object('custom_display_name', NULLIF(left(trim(p_custom_display_name), 80), '')),
    jsonb_build_object('operation', 'ADMIN_RENAME')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_device_sessions(
  p_actor_user_id uuid,
  p_actor_session_id uuid,
  p_scope text,
  p_target_session_id uuid DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_session_ids uuid[];
  v_target_has_admin boolean;
  v_remaining_admin_sessions integer;
  v_enabled boolean;
  v_reason text;
BEGIN
  SELECT revocation_enabled INTO v_enabled
  FROM public.device_session_settings WHERE singleton;
  IF NOT COALESCE(v_enabled, false) THEN RAISE EXCEPTION 'Oturum sonlandırma özelliği henüz etkin değil'; END IF;
  IF p_scope NOT IN ('single', 'all') THEN RAISE EXCEPTION 'Geçersiz sonlandırma kapsamı'; END IF;

  IF p_scope = 'single' THEN
    IF p_target_session_id IS NULL THEN RAISE EXCEPTION 'Hedef oturum gerekli'; END IF;
    IF p_target_session_id = p_actor_session_id THEN
      RAISE EXCEPTION 'Mevcut yönetici oturumu uzaktan sonlandırılamaz';
    END IF;
    SELECT array_agg(auth_session_id) INTO v_session_ids
    FROM public.user_device_sessions
    WHERE auth_session_id = p_target_session_id AND status = 'active';
    v_reason := 'admin_single';
  ELSE
    IF p_target_user_id IS NULL THEN RAISE EXCEPTION 'Hedef kullanıcı gerekli'; END IF;
    SELECT array_agg(auth_session_id) INTO v_session_ids
    FROM public.user_device_sessions
    WHERE auth_user_id = p_target_user_id
      AND status = 'active'
      AND NOT (p_target_user_id = p_actor_user_id AND auth_session_id = p_actor_session_id);
    v_reason := 'admin_all';
  END IF;

  IF COALESCE(cardinality(v_session_ids), 0) = 0 THEN RAISE EXCEPTION 'Sonlandırılacak aktif oturum bulunamadı'; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_device_sessions s
    JOIN public.user_roles ur ON ur.auth_user_id = s.auth_user_id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE s.auth_session_id = ANY(v_session_ids) AND r.slug = 'administrator'
  ) INTO v_target_has_admin;

  IF v_target_has_admin THEN
    SELECT count(*)::integer INTO v_remaining_admin_sessions
    FROM public.user_device_sessions s
    JOIN public.app_users au ON au.auth_user_id = s.auth_user_id AND au.is_active
    JOIN public.user_roles ur ON ur.auth_user_id = s.auth_user_id
    JOIN public.roles r ON r.id = ur.role_id AND r.slug = 'administrator' AND r.is_active
    WHERE s.status = 'active'
      AND NOT (s.auth_session_id = ANY(v_session_ids))
      AND EXISTS (SELECT 1 FROM auth.sessions axs WHERE axs.id = s.auth_session_id AND axs.user_id = s.auth_user_id);
    IF v_remaining_admin_sessions < 1 THEN
      RAISE EXCEPTION 'Sistemde en az bir aktif yönetici oturumu kalmalıdır';
    END IF;
  END IF;

  UPDATE public.user_device_sessions SET
    status = 'revoked', termination_reason = v_reason,
    ended_at = now(), terminated_by = p_actor_user_id,
    auth_revocation_last_attempt_at = NULL,
    updated_at = now()
  WHERE auth_session_id = ANY(v_session_ids) AND status = 'active';

  INSERT INTO public.audit_events(actor_user_id, table_name, record_id, action, new_data, metadata)
  SELECT
    p_actor_user_id, 'user_device_sessions', session_id::text, 'UPDATE',
    jsonb_build_object('status', 'revoked', 'termination_reason', v_reason),
    jsonb_build_object('operation', 'ADMIN_REVOKE', 'scope', p_scope)
  FROM unnest(v_session_ids) AS session_id;

  RETURN jsonb_build_object('auth_session_ids', to_jsonb(v_session_ids), 'count', cardinality(v_session_ids));
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_auth_device_session(p_auth_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  UPDATE public.user_device_sessions SET
    auth_revocation_last_attempt_at = now(),
    auth_revocation_attempt_count = auth_revocation_attempt_count + 1,
    updated_at = now()
  WHERE auth_session_id = p_auth_session_id AND status = 'revoked'
  RETURNING auth_user_id INTO v_user_id;
  IF NOT FOUND THEN RETURN false; END IF;

  BEGIN
    DELETE FROM auth.sessions WHERE id = p_auth_session_id AND user_id = v_user_id;
    IF EXISTS (SELECT 1 FROM auth.sessions WHERE id = p_auth_session_id AND user_id = v_user_id) THEN
      UPDATE public.device_session_settings SET revocation_enabled = false, updated_at = now()
      WHERE singleton;
      RETURN false;
    END IF;
    UPDATE public.user_device_sessions SET
      auth_revocation_confirmed_at = now(), updated_at = now()
    WHERE auth_session_id = p_auth_session_id;
    RETURN true;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.device_session_settings SET revocation_enabled = false, updated_at = now()
    WHERE singleton;
    RETURN false;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_device_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_missing integer := 0;
  v_retried integer := 0;
  v_row record;
BEGIN
  UPDATE public.user_device_sessions s SET
    status = 'auth_missing', termination_reason = 'auth_deleted',
    ended_at = now(), updated_at = now()
  WHERE s.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM auth.sessions axs WHERE axs.id = s.auth_session_id AND axs.user_id = s.auth_user_id);
  GET DIAGNOSTICS v_missing = ROW_COUNT;

  FOR v_row IN
    SELECT auth_session_id
    FROM public.user_device_sessions
    WHERE status = 'revoked'
      AND auth_revocation_confirmed_at IS NULL
      AND auth_revocation_attempt_count < 10
      AND (
        auth_revocation_last_attempt_at IS NULL
        OR auth_revocation_last_attempt_at < now() - interval '5 minutes'
      )
    ORDER BY ended_at
    LIMIT 100
  LOOP
    PERFORM public.revoke_auth_device_session(v_row.auth_session_id);
    v_retried := v_retried + 1;
  END LOOP;

  RETURN jsonb_build_object('auth_missing', v_missing, 'revocation_retries', v_retried);
END;
$$;

REVOKE ALL ON FUNCTION public.current_auth_session_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_session_is_active() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_session_is_allowed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_session_denial_reason() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_auth_session_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_session_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_session_is_allowed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_session_denial_reason() TO authenticated;

REVOKE ALL ON FUNCTION public.register_device_session(uuid,uuid,uuid,text,text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_device_session(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.end_device_session(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_device_sessions(integer,integer,text,text,text,boolean,text,text,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_rename_device(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_device_sessions(uuid,uuid,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_auth_device_session(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_device_sessions() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_device_session(uuid,uuid,uuid,text,text,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_device_session(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.end_device_session(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_device_sessions(integer,integer,text,text,text,boolean,text,text,timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_rename_device(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_device_sessions(uuid,uuid,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_auth_device_session(uuid) TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('device-session-reconcile');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'device-session-reconcile',
  '*/5 * * * *',
  $$SELECT public.reconcile_device_sessions();$$
);
