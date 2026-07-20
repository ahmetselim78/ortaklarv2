-- 055 — Rol yönetimi için güvenli ve atomik yönetici işlemleri.
-- Yetkilerin tamamı tek transaction içinde uygulanır; rol silme ise atama varsa
-- hem açık bir hata verir hem de mevcut ON DELETE RESTRICT bağıyla korunur.

CREATE OR REPLACE FUNCTION public.admin_set_role_permissions(p_changes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_change jsonb;
  v_role_id uuid;
  v_permission_ids uuid[];
  v_role_slug text;
BEGIN
  IF NOT public.is_admin_aal2() THEN
    RAISE EXCEPTION 'AAL2 yönetici yetkisi gerekli';
  END IF;

  IF jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) > 100 THEN
    RAISE EXCEPTION 'Geçersiz rol yetkisi değişiklikleri';
  END IF;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    BEGIN
      v_role_id := (v_change ->> 'role_id')::uuid;
      SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
      INTO v_permission_ids
      FROM jsonb_array_elements_text(COALESCE(v_change -> 'permission_ids', '[]'::jsonb));
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Geçersiz rol veya yetki kimliği';
    END;

    SELECT slug INTO v_role_slug
    FROM public.roles
    WHERE id = v_role_id
    FOR UPDATE;

    IF v_role_slug IS NULL THEN
      RAISE EXCEPTION 'Rol bulunamadı';
    END IF;

    IF cardinality(v_permission_ids) <> (
      SELECT count(DISTINCT permission_id)::integer
      FROM unnest(v_permission_ids) AS requested(permission_id)
    ) THEN
      RAISE EXCEPTION 'Aynı yetki birden fazla kez gönderilemez';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_permission_ids) AS requested(permission_id)
      LEFT JOIN public.permissions p ON p.id = requested.permission_id
      WHERE p.id IS NULL
    ) THEN
      RAISE EXCEPTION 'Bilinmeyen yetki seçildi';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.permissions selected_permission
      WHERE selected_permission.id = ANY(v_permission_ids)
        AND selected_permission.action <> 'read'
        AND NOT EXISTS (
          SELECT 1
          FROM public.permissions read_permission
          WHERE read_permission.id = ANY(v_permission_ids)
            AND read_permission.module = selected_permission.module
            AND read_permission.action = 'read'
        )
    ) THEN
      RAISE EXCEPTION 'Görüntüleme yetkisi olmadan üst aşama yetkisi eklenemez';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.permissions manage_permission
      WHERE manage_permission.id = ANY(v_permission_ids)
        AND manage_permission.action = 'manage'
        AND EXISTS (
          SELECT 1
          FROM public.permissions module_permission
          WHERE module_permission.module = manage_permission.module
            AND NOT (module_permission.id = ANY(v_permission_ids))
        )
    ) THEN
      RAISE EXCEPTION 'Tam yönetim yetkisi modülün tüm aşamalarını içermelidir';
    END IF;

    IF v_role_slug = 'administrator' AND NOT EXISTS (
      SELECT 1
      FROM public.permissions p
      WHERE p.id = ANY(v_permission_ids)
        AND p.module = 'admin'
        AND p.action = 'manage'
    ) THEN
      RAISE EXCEPTION 'Yönetici rolünün admin/manage izni kaldırılamaz';
    END IF;

    DELETE FROM public.role_permissions rp
    WHERE rp.role_id = v_role_id
      AND NOT (rp.permission_id = ANY(v_permission_ids));

    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, requested.permission_id
    FROM unnest(v_permission_ids) AS requested(permission_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_role(p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.roles%ROWTYPE;
BEGIN
  IF NOT public.is_admin_aal2() THEN
    RAISE EXCEPTION 'AAL2 yönetici yetkisi gerekli';
  END IF;

  SELECT * INTO v_role
  FROM public.roles
  WHERE id = p_role_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rol bulunamadı';
  END IF;

  IF v_role.is_system THEN
    RAISE EXCEPTION 'system_role: Sistem rolleri silinemez';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role_id = p_role_id) THEN
    RAISE EXCEPTION 'role_in_use: Rol bir veya daha fazla kullanıcıya atanmış';
  END IF;

  DELETE FROM public.roles WHERE id = p_role_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_role_permissions(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role_permissions(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_role(uuid) TO authenticated;
