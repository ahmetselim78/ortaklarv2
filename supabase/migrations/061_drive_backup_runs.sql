-- Google Drive yedekleme işi durum kayıtları. Yazma yalnız ortak servis sırrını
-- doğrulayan Edge Function tarafından yapılır; istemciler salt okunurdur.

CREATE TABLE public.drive_backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source text NOT NULL CHECK (trigger_source IN ('scheduled', 'manual')),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  drive_file_id text,
  drive_file_name text,
  monthly_drive_file_id text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  error_message text CHECK (error_message IS NULL OR length(error_message) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drive_backup_runs_completion_check CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR (status IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX drive_backup_runs_started_at_idx ON public.drive_backup_runs (started_at DESC);
CREATE UNIQUE INDEX drive_backup_runs_single_running_idx
  ON public.drive_backup_runs ((1)) WHERE status = 'running';

ALTER TABLE public.drive_backup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_backup_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY drive_backup_runs_admin_aal2_select
  ON public.drive_backup_runs FOR SELECT TO authenticated
  USING (public.is_admin_aal2());

REVOKE ALL ON TABLE public.drive_backup_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.drive_backup_runs TO authenticated;

COMMENT ON TABLE public.drive_backup_runs IS
  'Google Drive günlük/aylık şifreli yedekleme çalıştırma durumu; AAL2 yöneticilere salt okunur.';
