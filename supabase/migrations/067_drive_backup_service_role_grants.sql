-- drive-backup-admin Edge Function durum kayıtlarını service_role ile yazar.
-- RLS atlama yetkisi tablo ayrıcalıklarının yerini tutmadığı için bu izinler
-- açıkça verilmelidir.

GRANT INSERT, UPDATE ON TABLE public.drive_backup_runs TO service_role;
