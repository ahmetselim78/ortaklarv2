-- 092 - Stok maliyet yetkileri, RLS ve zenginleştirilmiş audit bağlamı

SET search_path = public, extensions, pg_catalog;

INSERT INTO public.permissions(module, action, description_tr)
VALUES
  ('costing', 'read', 'Stok maliyeti, aktif kaynak ve fiyat geçmişini görüntüleme'),
  ('costing', 'create', 'Alış fiyatı ve cam bağlantısı taslağı oluşturma'),
  ('costing', 'update', 'Maliyet profili ve taslak bağlantı kalemlerini düzenleme'),
  ('costing', 'delete', 'Kullanılmamış maliyet taslaklarını iptal etme'),
  ('costing', 'manage', 'Fiyat/bağlantı aktifleştirme, kapatma ve legacy doğrulama')
ON CONFLICT (module, action)
DO UPDATE SET description_tr = EXCLUDED.description_tr;

INSERT INTO public.role_permissions(role_id, permission_id)
SELECT rol.id, izin.id
FROM public.roles rol
JOIN public.permissions izin ON izin.module = 'costing'
WHERE rol.slug = 'administrator'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role_id, permission_id)
SELECT rol.id, izin.id
FROM public.roles rol
JOIN public.permissions izin
  ON izin.module = 'costing' AND izin.action IN ('read', 'create', 'update')
WHERE rol.slug = 'office_planning'
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cam_fiyat_gruplari',
    'stok_maliyet_profilleri',
    'stok_maliyet_yapi_surmleri',
    'stok_alis_fiyatlari',
    'stok_maliyet_kaynagi_atamalari',
    'cam_tedarik_baglantilari',
    'cam_tedarik_baglanti_kalemleri',
    'cam_tedarik_baglanti_kalem_stoklari'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (public.has_permission(%L, %L))',
      v_table || '_costing_read', v_table, 'costing', 'read'
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.write_audit_event()',
      'audit_' || v_table, v_table
    );
  END LOOP;
END;
$$;

-- RPC'ler gerekçe, idempotency anahtarı ve kaynak ekranı bu transaction-local
-- bağlama yazar. Genel audit trigger'ı mevcut bütün tablolarda bu bilgiyi taşır.
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
  v_context jsonb;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  v_row := COALESCE(v_new, v_old);
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers := '{}'::jsonb;
  END;
  BEGIN
    v_context := NULLIF(current_setting('app.audit_context', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_context := '{}'::jsonb;
  END;

  INSERT INTO public.audit_events (
    actor_user_id, actor_personel_id, request_id, table_name, record_id,
    action, old_data, new_data, changed_fields, metadata
  ) VALUES (
    auth.uid(),
    public.current_personel_id(),
    COALESCE(v_headers ->> 'x-request-id', gen_random_uuid()::text),
    TG_TABLE_NAME,
    public.audit_record_id(v_row),
    TG_OP,
    public.audit_sanitize(v_old),
    public.audit_sanitize(v_new),
    public.audit_changed_fields(v_old, v_new),
    public.audit_sanitize(
      jsonb_build_object(
        'schema', TG_TABLE_SCHEMA,
        'aal', COALESCE(auth.jwt() ->> 'aal', 'aal1'),
        'auth_session_id', public.current_auth_session_id()
      ) || COALESCE(v_context, '{}'::jsonb)
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.write_audit_event() IS
  'Append-only audit kaydına AAL, auth session, idempotency, gerekçe ve kaynak ekran bağlamını ekler.';

