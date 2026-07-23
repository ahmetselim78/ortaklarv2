-- 065 — 063'ün ilk dağıtımındaki altı parametreli admin liste RPC'sini
-- sunucu taraflı rol/hesap/tarih filtreleri içeren güncel imzaya taşır.

DROP FUNCTION IF EXISTS public.admin_list_device_sessions(integer,integer,text,text,text,boolean);

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
  IF p_status NOT IN ('all', 'active', 'inactive') THEN
    RAISE EXCEPTION 'Geçersiz durum filtresi';
  END IF;

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
      EXISTS (
        SELECT 1 FROM auth.sessions axs
        WHERE axs.id = s.auth_session_id AND axs.user_id = s.auth_user_id
      ) AS auth_active,
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
      EXISTS (
        SELECT 1 FROM auth.sessions axs
        WHERE axs.id = s.auth_session_id AND axs.user_id = s.auth_user_id
      ) AS auth_active,
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

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_device_sessions(
  integer,integer,text,text,text,boolean,text,text,timestamptz,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_device_sessions(
  integer,integer,text,text,text,boolean,text,text,timestamptz,timestamptz
) TO service_role;

NOTIFY pgrst, 'reload schema';
