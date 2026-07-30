-- 121 - Cari karti degisikliklerini append-only audit zincirine dahil et

SET search_path = public, extensions, pg_catalog;

DROP TRIGGER IF EXISTS audit_cari ON public.cari;
CREATE TRIGGER audit_cari
  AFTER INSERT OR UPDATE OR DELETE ON public.cari
  FOR EACH ROW
  EXECUTE FUNCTION public.write_audit_event();

COMMENT ON TRIGGER audit_cari ON public.cari IS
  'Cari karti ve tedarikci aktiflik degisikliklerini append-only audit_events tablosuna yazar.';
