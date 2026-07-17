-- 052 — Auth yönetim transaction yardımcıları ve Telegram sır temizliği

CREATE OR REPLACE FUNCTION public.admin_set_user_access(
  p_auth_user_id uuid,
  p_personel_id uuid,
  p_role_id uuid,
  p_display_name text,
  p_username text,
  p_account_type text,
  p_must_change_password boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_admin_aal2() THEN RAISE EXCEPTION 'AAL2 yönetici yetkisi gerekli'; END IF;
  IF p_account_type NOT IN ('personal','device','canary') THEN RAISE EXCEPTION 'Geçersiz hesap tipi'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = p_role_id AND is_active) THEN RAISE EXCEPTION 'Aktif rol bulunamadı'; END IF;
  IF p_account_type = 'device' AND p_role_id <> '10000000-0000-0000-0000-000000000004'::uuid THEN
    RAISE EXCEPTION 'Cihaz hesabı yalnız Görüntüleyici/Cihaz rolünü kullanabilir';
  END IF;
  IF p_personel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hr_personel WHERE id = p_personel_id) THEN RAISE EXCEPTION 'Personel bulunamadı'; END IF;

  INSERT INTO public.app_users (
    auth_user_id, personel_id, username, display_name, account_type,
    is_active, must_change_password, auth_migrated_at, updated_at
  ) VALUES (
    p_auth_user_id, p_personel_id, NULLIF(trim(p_username), ''), left(trim(p_display_name), 200),
    p_account_type, true, p_must_change_password, now(), now()
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    personel_id = EXCLUDED.personel_id,
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    account_type = EXCLUDED.account_type,
    is_active = true,
    must_change_password = EXCLUDED.must_change_password,
    auth_migrated_at = COALESCE(public.app_users.auth_migrated_at, now()),
    updated_at = now();

  INSERT INTO public.user_roles (auth_user_id, role_id, assigned_by, assigned_at)
  VALUES (p_auth_user_id, p_role_id, auth.uid(), now())
  ON CONFLICT (auth_user_id) DO UPDATE SET
    role_id = EXCLUDED.role_id, assigned_by = auth.uid(), assigned_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(p_auth_user_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_personel_id uuid;
BEGIN
  IF NOT public.is_admin_aal2() THEN RAISE EXCEPTION 'AAL2 yönetici yetkisi gerekli'; END IF;
  UPDATE public.app_users SET is_active = p_active, updated_at = now()
  WHERE auth_user_id = p_auth_user_id RETURNING personel_id INTO v_personel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;
  IF v_personel_id IS NOT NULL THEN
    UPDATE public.hr_personel SET is_aktif = p_active WHERE id = v_personel_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_user_role(p_auth_user_id uuid, p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_admin_aal2() THEN RAISE EXCEPTION 'AAL2 yönetici yetkisi gerekli'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE auth_user_id = p_auth_user_id AND is_active) THEN
    RAISE EXCEPTION 'Aktif kullanıcı bulunamadı';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = p_role_id AND is_active) THEN
    RAISE EXCEPTION 'Aktif rol bulunamadı';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.app_users
    WHERE auth_user_id = p_auth_user_id AND account_type = 'device'
  ) AND p_role_id <> '10000000-0000-0000-0000-000000000004'::uuid THEN
    RAISE EXCEPTION 'Cihaz hesabı yalnız Görüntüleyici/Cihaz rolünü kullanabilir';
  END IF;

  INSERT INTO public.user_roles (auth_user_id, role_id, assigned_by, assigned_at)
  VALUES (p_auth_user_id, p_role_id, auth.uid(), now())
  ON CONFLICT (auth_user_id) DO UPDATE SET
    role_id = EXCLUDED.role_id, assigned_by = auth.uid(), assigned_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_access(uuid,uuid,uuid,text,text,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_active(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_assign_user_role(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_access(uuid,uuid,uuid,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_user_role(uuid,uuid) TO authenticated;

-- pg_cron, Edge Function'ı normal kullanıcı JWT'siyle çağırmaz. URL ve ayrı
-- cron kimliği Supabase Vault'ta şifreli saklanır; değerler migration'a yazılmaz.
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE OR REPLACE FUNCTION public.telegram_otomatik_rapor_gonder()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, net, vault
AS $$
DECLARE
  v_edge_url text;
  v_cron_secret text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_edge_url
  FROM vault.decrypted_secrets WHERE name = 'telegram_edge_url' LIMIT 1;
  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets WHERE name = 'telegram_cron_secret' LIMIT 1;

  IF NULLIF(v_edge_url, '') IS NULL OR NULLIF(v_cron_secret, '') IS NULL THEN
    RAISE EXCEPTION 'Telegram cron Vault sırları yapılandırılmamış';
  END IF;

  SELECT net.http_post(
    url := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) INTO v_request_id;
  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id);
END;
$$;

REVOKE ALL ON FUNCTION public.telegram_otomatik_rapor_gonder() FROM PUBLIC, anon, authenticated;

-- Telegram sırları artık Edge Secrets'tadır. Önce veri yok edilir, sonra kolonlar
-- kaldırılır; admin paneli bu değerleri hiçbir zaman okuyamaz.
UPDATE public.telegram_ayarlari SET bot_token = '', chat_id = '';
ALTER TABLE public.telegram_ayarlari DROP COLUMN IF EXISTS bot_token;
ALTER TABLE public.telegram_ayarlari DROP COLUMN IF EXISTS chat_id;
DELETE FROM public.ayarlar WHERE anahtar = 'telegram_edge_config';
