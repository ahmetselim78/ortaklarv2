-- 047 — Merkezi RBAC ve sabit izin kataloğu

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9_]*$'),
  name_tr text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL CHECK (action IN ('read', 'create', 'update', 'delete', 'manage')),
  description_tr text NOT NULL,
  UNIQUE (module, action)
);

CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE public.user_roles (
  auth_user_id uuid PRIMARY KEY REFERENCES public.app_users(auth_user_id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX role_permissions_permission_idx ON public.role_permissions(permission_id);
CREATE INDEX user_roles_role_idx ON public.user_roles(role_id);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.role_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles, public.permissions, public.role_permissions, public.user_roles TO service_role;

INSERT INTO public.roles (id, slug, name_tr, is_system) VALUES
  ('10000000-0000-0000-0000-000000000001', 'administrator', 'Yönetici', true),
  ('10000000-0000-0000-0000-000000000002', 'office_planning', 'Ofis/Planlama', true),
  ('10000000-0000-0000-0000-000000000003', 'operator', 'Operatör', true),
  ('10000000-0000-0000-0000-000000000004', 'viewer_device', 'Görüntüleyici/Cihaz', true)
ON CONFLICT (slug) DO UPDATE SET name_tr = EXCLUDED.name_tr, is_system = true;

INSERT INTO public.permissions (module, action, description_tr)
SELECT module, action, module || ' / ' || action
FROM unnest(ARRAY[
  'dashboard','cari','inventory','orders','production','repair','shipping',
  'hourly_tracking','production_entry','settings','users','roles','telegram',
  'files','ocr','audit','errors','admin'
]) AS module
CROSS JOIN unnest(ARRAY['read','create','update','delete','manage']) AS action
ON CONFLICT (module, action) DO NOTHING;

-- Yönetici: katalogdaki bütün izinler.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'administrator'
ON CONFLICT DO NOTHING;

-- Ofis/Planlama.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r JOIN public.permissions p ON (
  (p.module IN ('dashboard','cari','inventory','orders','production','repair','shipping','hourly_tracking','production_entry','settings','files','ocr')
   AND p.action IN ('read','create','update'))
  OR (p.module IN ('orders','production','shipping') AND p.action = 'manage')
)
WHERE r.slug = 'office_planning'
ON CONFLICT DO NOTHING;

-- Operatör.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r JOIN public.permissions p ON (
  (p.module IN ('dashboard','inventory','orders','production','repair','hourly_tracking','production_entry','files') AND p.action = 'read')
  OR (p.module IN ('repair','hourly_tracking','production_entry','files') AND p.action IN ('create','update'))
)
WHERE r.slug = 'operator'
ON CONFLICT DO NOTHING;

-- Görüntüleyici/Cihaz.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r JOIN public.permissions p
  ON p.module IN ('dashboard','inventory','orders','production','hourly_tracking','production_entry')
 AND p.action = 'read'
WHERE r.slug = 'viewer_device'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.current_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_module text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
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

REVOKE ALL ON FUNCTION public.current_aal2() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_permission(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_aal2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_aal2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_aal2() TO authenticated;

DROP POLICY IF EXISTS app_users_self_read ON public.app_users;
CREATE POLICY app_users_read
  ON public.app_users FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.has_permission('users', 'read'));
CREATE POLICY app_users_admin_insert
  ON public.app_users FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_aal2());
CREATE POLICY app_users_admin_update
  ON public.app_users FOR UPDATE TO authenticated
  USING (public.is_admin_aal2()) WITH CHECK (public.is_admin_aal2());
CREATE POLICY app_users_admin_delete
  ON public.app_users FOR DELETE TO authenticated
  USING (public.is_admin_aal2());

CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated
  USING (public.has_permission('roles', 'read') OR public.current_app_user_id() IS NOT NULL);
CREATE POLICY roles_manage_insert ON public.roles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_aal2() AND NOT is_system);
CREATE POLICY roles_manage_update ON public.roles FOR UPDATE TO authenticated
  USING (public.is_admin_aal2()) WITH CHECK (public.is_admin_aal2());
CREATE POLICY roles_manage_delete ON public.roles FOR DELETE TO authenticated
  USING (public.is_admin_aal2() AND NOT is_system);

CREATE POLICY permissions_read ON public.permissions FOR SELECT TO authenticated
  USING (public.current_app_user_id() IS NOT NULL);

CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated
  USING (public.current_app_user_id() IS NOT NULL);
CREATE POLICY role_permissions_insert ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_aal2());
CREATE POLICY role_permissions_delete ON public.role_permissions FOR DELETE TO authenticated
  USING (public.is_admin_aal2());

CREATE POLICY user_roles_self_or_admin_read ON public.user_roles FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.has_permission('users', 'read'));
CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_aal2());
CREATE POLICY user_roles_update ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_admin_aal2()) WITH CHECK (public.is_admin_aal2());
CREATE POLICY user_roles_delete ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_admin_aal2());
