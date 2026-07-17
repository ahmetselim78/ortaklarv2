-- 054 — Hesap yönetiminde yönetici kilitlenmesini önleyen son savunma katmanı

CREATE OR REPLACE FUNCTION public.guard_admin_account_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_is_administrator boolean;
  v_active_administrators integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (NOT OLD.is_active OR NEW.is_active) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND NOT OLD.is_active THEN
    RETURN OLD;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = OLD.auth_user_id
      AND r.slug = 'administrator'
      AND r.is_active
  ) INTO v_is_administrator;

  IF NOT v_is_administrator THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ortaklarv2:administrator-guard', 0));

  IF auth.uid() = OLD.auth_user_id THEN
    RAISE EXCEPTION 'Kendi yönetici hesabınızı pasifleştiremez veya silemezsiniz';
  END IF;

  SELECT count(*)::integer INTO v_active_administrators
  FROM public.app_users au
  JOIN public.user_roles ur ON ur.auth_user_id = au.auth_user_id
  JOIN public.roles r ON r.id = ur.role_id
  WHERE au.is_active AND r.is_active AND r.slug = 'administrator';

  IF v_active_administrators <= 1 THEN
    RAISE EXCEPTION 'Son aktif yönetici hesabı pasifleştirilemez veya silinemez';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_admin_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_is_administrator boolean;
  v_new_is_administrator boolean := false;
  v_target_is_active boolean;
  v_active_administrators integer;
BEGIN
  SELECT r.slug = 'administrator' AND r.is_active
  INTO v_old_is_administrator
  FROM public.roles r
  WHERE r.id = OLD.role_id;

  IF TG_OP = 'UPDATE' THEN
    SELECT r.slug = 'administrator' AND r.is_active
    INTO v_new_is_administrator
    FROM public.roles r
    WHERE r.id = NEW.role_id;
  END IF;

  IF NOT COALESCE(v_old_is_administrator, false) OR COALESCE(v_new_is_administrator, false) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT au.is_active INTO v_target_is_active
  FROM public.app_users au
  WHERE au.auth_user_id = OLD.auth_user_id;

  IF NOT COALESCE(v_target_is_active, false) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ortaklarv2:administrator-guard', 0));

  IF auth.uid() = OLD.auth_user_id THEN
    RAISE EXCEPTION 'Kendi yönetici rolünüzü değiştiremezsiniz';
  END IF;

  SELECT count(*)::integer INTO v_active_administrators
  FROM public.app_users au
  JOIN public.user_roles ur ON ur.auth_user_id = au.auth_user_id
  JOIN public.roles r ON r.id = ur.role_id
  WHERE au.is_active AND r.is_active AND r.slug = 'administrator';

  IF v_active_administrators <= 1 THEN
    RAISE EXCEPTION 'Son aktif yöneticinin rolü değiştirilemez';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_administrator_role_baseline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role_slug text;
  v_permission_module text;
  v_permission_action text;
BEGIN
  SELECT slug INTO v_role_slug FROM public.roles WHERE id = OLD.role_id;
  SELECT module, action INTO v_permission_module, v_permission_action
  FROM public.permissions WHERE id = OLD.permission_id;

  IF v_role_slug = 'administrator'
     AND v_permission_module = 'admin'
     AND v_permission_action = 'manage' THEN
    RAISE EXCEPTION 'Yönetici rolünün admin/manage izni kaldırılamaz';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_administrator_role_definition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.slug = 'administrator'
     AND (NEW.slug IS DISTINCT FROM OLD.slug OR NOT NEW.is_active OR NOT NEW.is_system) THEN
    RAISE EXCEPTION 'Yerleşik yönetici rolü yeniden adlandırılamaz veya pasifleştirilemez';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_admin_account_lifecycle_trigger ON public.app_users;
CREATE TRIGGER guard_admin_account_lifecycle_trigger
  BEFORE UPDATE OF is_active OR DELETE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_account_lifecycle();

DROP TRIGGER IF EXISTS guard_admin_role_assignment_trigger ON public.user_roles;
CREATE TRIGGER guard_admin_role_assignment_trigger
  BEFORE UPDATE OF role_id OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_role_assignment();

DROP TRIGGER IF EXISTS guard_administrator_role_baseline_trigger ON public.role_permissions;
CREATE TRIGGER guard_administrator_role_baseline_trigger
  BEFORE UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_administrator_role_baseline();

DROP TRIGGER IF EXISTS guard_administrator_role_definition_trigger ON public.roles;
CREATE TRIGGER guard_administrator_role_definition_trigger
  BEFORE UPDATE OF slug, is_active, is_system ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_administrator_role_definition();

REVOKE ALL ON FUNCTION public.guard_admin_account_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_admin_role_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_administrator_role_baseline() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_administrator_role_definition() FROM PUBLIC, anon, authenticated;

