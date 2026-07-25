-- Durum güncellemesi güncellenen kaydın kimliğini `.select('id')` ile geri
-- okuduğu için service_role ayrıca SELECT ayrıcalığına ihtiyaç duyar.

GRANT SELECT ON TABLE public.drive_backup_runs TO service_role;
