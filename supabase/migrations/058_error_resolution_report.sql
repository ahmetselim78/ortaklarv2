-- 058 — AI çözüm raporundaki hata kayıtlarını güvenli biçimde topluca kapatır.

CREATE OR REPLACE FUNCTION public.resolve_system_errors_from_report(p_error_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_requested_count integer;
  v_existing_count integer;
  v_resolved_count integer;
BEGIN
  IF NOT (public.has_permission('errors', 'manage') AND public.current_aal2()) THEN
    RAISE EXCEPTION 'AAL2 hata yönetimi yetkisi gerekli';
  END IF;

  v_requested_count := cardinality(p_error_ids);
  IF v_requested_count IS NULL OR v_requested_count < 1 OR v_requested_count > 500 THEN
    RAISE EXCEPTION 'Çözüm raporu 1 ile 500 arasında hata içermelidir';
  END IF;
  IF v_requested_count <> (SELECT count(DISTINCT error_id)::integer FROM unnest(p_error_ids) AS requested(error_id)) THEN
    RAISE EXCEPTION 'Aynı hata kimliği birden fazla kez gönderilemez';
  END IF;

  SELECT count(*)::integer INTO v_existing_count
  FROM public.system_errors
  WHERE id = ANY(p_error_ids);
  IF v_existing_count <> v_requested_count THEN
    RAISE EXCEPTION 'Çözüm raporundaki bazı hata kayıtları bulunamadı';
  END IF;

  UPDATE public.system_errors
  SET
    status = 'resolved',
    resolved_by = auth.uid(),
    resolved_at = now()
  WHERE id = ANY(p_error_ids)
    AND status <> 'resolved';

  GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
  RETURN v_resolved_count;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_system_errors_from_report(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_errors_from_report(uuid[]) TO authenticated;
