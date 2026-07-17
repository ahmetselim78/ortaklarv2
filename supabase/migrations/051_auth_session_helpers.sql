-- 051 — İstemci oturum bağlamı ve geçici parola tamamlama yardımcıları

CREATE OR REPLACE FUNCTION public.my_access_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
    'role', jsonb_build_object('slug', r.slug, 'name_tr', r.name_tr),
    'permissions', COALESCE(
      jsonb_agg(DISTINCT jsonb_build_object('module', p.module, 'action', p.action))
        FILTER (WHERE p.id IS NOT NULL),
      '[]'::jsonb
    ),
    'aal', COALESCE(auth.jwt() ->> 'aal', 'aal1')
  )
  FROM public.app_users au
  LEFT JOIN public.user_roles ur ON ur.auth_user_id = au.auth_user_id
  LEFT JOIN public.roles r ON r.id = ur.role_id AND r.is_active
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
  LEFT JOIN public.permissions p ON p.id = rp.permission_id
  WHERE au.auth_user_id = auth.uid()
  GROUP BY au.auth_user_id, au.personel_id, au.username, au.display_name,
           au.account_type, au.is_active, au.must_change_password,
           au.auth_migrated_at, r.slug, r.name_tr
$$;

CREATE OR REPLACE FUNCTION public.complete_password_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum gerekli'; END IF;
  UPDATE public.app_users
  SET must_change_password = false, auth_migrated_at = COALESCE(auth_migrated_at, now()), updated_at = now()
  WHERE auth_user_id = auth.uid() AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aktif uygulama kullanıcısı bulunamadı'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.my_access_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_password_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_password_change() TO authenticated;
