-- 062 — Cihaz kurulumu ve uygulama oturumu şeması.
-- Auth access/refresh tokenları bu tablolarda kesinlikle tutulmaz.

CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES public.app_users(auth_user_id) ON DELETE CASCADE,
  client_device_id uuid NOT NULL,
  auto_display_name varchar(80) NOT NULL,
  custom_display_name varchar(80),
  device_type text NOT NULL DEFAULT 'unknown'
    CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'unknown')),
  os_family text NOT NULL DEFAULT 'unknown'
    CHECK (os_family IN ('Windows', 'Android', 'iOS', 'macOS', 'Linux', 'unknown')),
  browser_family text NOT NULL DEFAULT 'unknown'
    CHECK (browser_family IN ('Chrome', 'Edge', 'Firefox', 'Safari', 'unknown')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_devices_user_client_unique UNIQUE (auth_user_id, client_device_id),
  CONSTRAINT user_devices_id_user_unique UNIQUE (id, auth_user_id),
  CONSTRAINT user_devices_auto_name_length CHECK (length(trim(auto_display_name)) BETWEEN 1 AND 80),
  CONSTRAINT user_devices_custom_name_length CHECK (
    custom_display_name IS NULL OR length(trim(custom_display_name)) BETWEEN 1 AND 80
  )
);

CREATE TABLE public.user_device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES public.app_users(auth_user_id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  auth_session_id uuid NOT NULL UNIQUE,
  signed_in_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_action_at timestamptz,
  last_action_type text CHECK (
    last_action_type IS NULL OR last_action_type ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  last_token_refresh_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'revoked', 'replaced', 'auth_missing')),
  termination_reason text
    CHECK (termination_reason IS NULL OR termination_reason IN (
      'manual_logout', 'admin_single', 'admin_all', 'token_replaced', 'auth_deleted', 'unknown'
    )),
  ended_at timestamptz,
  terminated_by uuid REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  replaced_by_session_id uuid,
  auth_revocation_confirmed_at timestamptz,
  auth_revocation_last_attempt_at timestamptz,
  auth_revocation_attempt_count integer NOT NULL DEFAULT 0
    CHECK (auth_revocation_attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_device_sessions_device_user_fk
    FOREIGN KEY (device_id, auth_user_id)
    REFERENCES public.user_devices(id, auth_user_id)
    ON DELETE CASCADE,
  CONSTRAINT user_device_sessions_terminal_state_check CHECK (
    (status = 'active' AND ended_at IS NULL AND termination_reason IS NULL)
    OR (status <> 'active' AND ended_at IS NOT NULL AND termination_reason IS NOT NULL)
  )
);

CREATE INDEX user_devices_user_seen_idx
  ON public.user_devices(auth_user_id, last_seen_at DESC);
CREATE INDEX user_device_sessions_user_status_seen_idx
  ON public.user_device_sessions(auth_user_id, status, last_seen_at DESC);
CREATE INDEX user_device_sessions_device_signed_in_idx
  ON public.user_device_sessions(device_id, signed_in_at DESC);
CREATE INDEX user_device_sessions_active_idx
  ON public.user_device_sessions(auth_session_id, auth_user_id)
  WHERE status = 'active';
CREATE INDEX user_device_sessions_reconcile_idx
  ON public.user_device_sessions(status, auth_revocation_confirmed_at, auth_revocation_attempt_count)
  WHERE status IN ('active', 'revoked');

CREATE TABLE public.device_session_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enforcement_mode text NOT NULL DEFAULT 'observe'
    CHECK (enforcement_mode IN ('observe', 'enforce')),
  enforcement_started_at timestamptz,
  revocation_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.device_session_settings(singleton) VALUES (true);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_device_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.device_session_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_session_settings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_devices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_device_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.device_session_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_device_sessions TO service_role;
GRANT SELECT, UPDATE ON TABLE public.device_session_settings TO service_role;

INSERT INTO public.permissions(module, action, description_tr) VALUES
  ('sessions', 'read', 'Cihaz ve oturum kayıtlarını görüntüleme'),
  ('sessions', 'manage', 'Cihaz adlarını ve uzak oturum sonlandırmayı yönetme')
ON CONFLICT (module, action) DO UPDATE SET description_tr = EXCLUDED.description_tr;

INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'sessions' AND p.action IN ('read', 'manage')
WHERE r.slug = 'administrator'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.user_devices IS
  'Parmak izi toplamadan, kullanıcı başına rastgele tarayıcı kurulumu kaydı.';
COMMENT ON TABLE public.user_device_sessions IS
  'JWT session_id ile cihazı bağlayan, token içermeyen uygulama oturumu kaydı.';
COMMENT ON TABLE public.device_session_settings IS
  'Cihaz oturumu gözlem/zorlama rollout durumu; istemci erişimine kapalıdır.';
