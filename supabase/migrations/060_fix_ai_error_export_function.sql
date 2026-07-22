-- 060 — AI dışa aktarma fonksiyonundaki çıktı alanı/SQL kolon adı çakışmasını düzeltir.

CREATE OR REPLACE FUNCTION public.acknowledge_system_errors_for_ai_export(p_error_ids uuid[])
RETURNS TABLE(error_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_requested_count integer;
BEGIN
  IF NOT (public.has_permission('errors', 'manage') AND public.current_aal2()) THEN
    RAISE EXCEPTION 'AAL2 hata yönetimi yetkisi gerekli';
  END IF;

  v_requested_count := cardinality(p_error_ids);
  IF v_requested_count IS NULL OR v_requested_count < 1 OR v_requested_count > 5000 THEN
    RAISE EXCEPTION 'AI dışa aktarımı 1 ile 5000 arasında hata içermelidir';
  END IF;
  IF v_requested_count <> (SELECT count(DISTINCT requested.error_id)::integer FROM unnest(p_error_ids) AS requested(error_id)) THEN
    RAISE EXCEPTION 'Aynı hata kimliği birden fazla kez gönderilemez';
  END IF;

  RETURN QUERY
  UPDATE public.system_errors
  SET
    status = 'acknowledged',
    acknowledged_by = auth.uid(),
    acknowledged_at = now()
  WHERE id = ANY(p_error_ids)
    AND status = 'open'
  RETURNING id;
END;
$$;
