-- 120 - Pasif tedarikciyi gecmisi degistirmeden yeniden etkinlestirme

SET search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.tedarikci_aktiflestir(
  p_tedarikci_id uuid,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_tedarikci public.cari%ROWTYPE;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);

  IF length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEDARIKCI_AKTIFLESTIRME_GEREKCESI_ZORUNLU';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_aktiflestir',
    p_idempotency_key,
    jsonb_build_object(
      'tedarikci_id', p_tedarikci_id,
      'gerekce', btrim(p_gerekce)
    )
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  SELECT *
  INTO v_tedarikci
  FROM public.cari
  WHERE id = p_tedarikci_id
    AND tipi = 'tedarikci'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'TEDARIKCI_BULUNAMADI';
  END IF;

  IF v_tedarikci.aktif THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEDARIKCI_ZATEN_AKTIF';
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_aktiflestir',
    p_idempotency_key,
    p_gerekce,
    'admin_stok_cari_maliyet'
  );

  UPDATE public.cari
  SET aktif = true
  WHERE id = p_tedarikci_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'tedarikci_id', p_tedarikci_id,
    'aktif', true,
    'gecmis_kayitlar_yeniden_acildi', false
  );

  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

REVOKE ALL ON FUNCTION public.tedarikci_aktiflestir(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tedarikci_aktiflestir(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.tedarikci_aktiflestir(uuid, text, text) IS
  'AAL2 ve costing.manage ile pasif tedarikci kartini yeniden etkinlestirir; eski fiyat ve baglantilari otomatik acmaz.';
