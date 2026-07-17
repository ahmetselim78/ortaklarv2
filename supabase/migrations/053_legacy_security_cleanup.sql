-- 053 — Nihai güvenlik temizliği
-- Bu migration, aktif legacy hesapların Auth geçişi kanıtlanmadıysa bilinçli
-- olarak durur. Düz metin parola kolonuna geri dönüş migration'ı yoktur.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.hr_personel p
    WHERE p.is_aktif
      AND NOT EXISTS (
        SELECT 1 FROM public.app_users au
        JOIN public.user_roles ur ON ur.auth_user_id = au.auth_user_id
        WHERE au.personel_id = p.id
          AND au.auth_migrated_at IS NOT NULL
          AND au.is_active
      )
  ) THEN
    RAISE EXCEPTION 'Aktif legacy personellerin Auth geçişi tamamlanmadan giris_sifresi kaldırılamaz';
  END IF;
END
$$;

UPDATE public.hr_personel SET giris_sifresi = NULL WHERE giris_sifresi IS NOT NULL;
ALTER TABLE public.hr_personel DROP COLUMN IF EXISTS giris_sifresi;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;

-- Uygulamanın ihtiyaç duyduğu sınırlı fonksiyonlar yeniden açıkça verilir.
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_personel_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_aal2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_aal2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_access_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_password_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sonraki_sayac(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saatlik_sayac_arttir(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saatlik_fire_arttir(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_admin_operation(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_admin_operation(uuid, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_system_error(text,text,text,text,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_system_error_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_access(uuid,uuid,uuid,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_user_role(uuid,uuid) TO authenticated;

CREATE OR REPLACE VIEW public.security_release_gate
WITH (security_invoker = true)
AS
SELECT
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND (roles && ARRAY['anon']::name[] OR qual = 'true' OR with_check = 'true')
  ) AS rls_dar,
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hr_personel' AND column_name = 'giris_sifresi'
  ) AS legacy_parola_yok,
  NOT EXISTS (
    SELECT 1 FROM public.app_users au
    WHERE au.is_active AND au.account_type <> 'canary'
      AND (au.auth_migrated_at IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.auth_user_id = au.auth_user_id
      ))
  ) AS auth_gecisi_tamam
WHERE public.is_admin_aal2();

REVOKE ALL ON public.security_release_gate FROM anon;
GRANT SELECT ON public.security_release_gate TO authenticated;
