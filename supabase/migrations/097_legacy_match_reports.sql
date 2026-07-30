-- 097 - Legacy eşleştirme raporu ve kontrollü manuel onay

SET search_path = public, extensions, pg_catalog;

ALTER TABLE public.maliyet_legacy_eslestirmeleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maliyet_legacy_eslestirmeleri FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.maliyet_legacy_eslestirmeleri FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.maliyet_legacy_eslestirmeleri TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.maliyet_legacy_eslestirmeleri TO service_role;

DROP POLICY IF EXISTS maliyet_legacy_eslestirmeleri_read
  ON public.maliyet_legacy_eslestirmeleri;
CREATE POLICY maliyet_legacy_eslestirmeleri_read
  ON public.maliyet_legacy_eslestirmeleri
  FOR SELECT TO authenticated
  USING (public.has_permission('costing', 'read'));

DROP TRIGGER IF EXISTS audit_maliyet_legacy_eslestirmeleri
  ON public.maliyet_legacy_eslestirmeleri;
CREATE TRIGGER audit_maliyet_legacy_eslestirmeleri
  AFTER INSERT OR UPDATE OR DELETE ON public.maliyet_legacy_eslestirmeleri
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

CREATE OR REPLACE FUNCTION public.legacy_maliyet_eslestirme_raporu(
  p_sonuc text DEFAULT NULL,
  p_onay_durumu text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;
  RETURN jsonb_build_object(
    'ozet',
    (
      SELECT COALESCE(
        jsonb_object_agg(ozet.sonuc, ozet.adet ORDER BY ozet.sonuc),
        '{}'::jsonb
      )
      FROM (
        SELECT sonuc, count(*) AS adet
        FROM public.maliyet_legacy_eslestirmeleri
        GROUP BY sonuc
      ) ozet
    ),
    'kayitlar',
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', eslesme.id,
            'kaynak_tablo', eslesme.kaynak_tablo,
            'kaynak_kayit_id', eslesme.kaynak_kayit_id,
            'hedef_stok_id', eslesme.hedef_stok_id,
            'hedef_stok_kodu', stok.kod,
            'hedef_stok_adi', stok.ad,
            'eslestirme_yontemi', eslesme.eslestirme_yontemi,
            'eslestirme_puani', eslesme.eslestirme_puani,
            'sonuc', eslesme.sonuc,
            'otomatik', eslesme.otomatik,
            'onay_durumu', eslesme.onay_durumu,
            'adaylar', eslesme.adaylar,
            'kaynak_veri', eslesme.kaynak_veri,
            'onaylayan_kullanici_id', eslesme.onaylayan_kullanici_id,
            'onay_tarihi', eslesme.onay_tarihi,
            'aciklama', eslesme.aciklama
          )
          ORDER BY eslesme.created_at, eslesme.kaynak_tablo
        ),
        '[]'::jsonb
      )
      FROM public.maliyet_legacy_eslestirmeleri eslesme
      LEFT JOIN public.stok stok ON stok.id = eslesme.hedef_stok_id
      WHERE (p_sonuc IS NULL OR eslesme.sonuc = p_sonuc)
        AND (p_onay_durumu IS NULL OR eslesme.onay_durumu = p_onay_durumu)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.legacy_eslestirme_onayla(
  p_eslestirme_id uuid,
  p_hedef_stok_id uuid,
  p_onay boolean,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_eslesme public.maliyet_legacy_eslestirmeleri%ROWTYPE;
  v_stok public.stok%ROWTYPE;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_payload jsonb;
  v_yanit jsonb;
  v_beklenen_kategori text;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);
  IF length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LEGACY_ESLESTIRME_GEREKCESI_ZORUNLU';
  END IF;
  IF p_onay AND p_hedef_stok_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'HEDEF_STOK_GEREKLI';
  END IF;
  v_payload := jsonb_build_object(
    'eslestirme_id', p_eslestirme_id,
    'hedef_stok_id', p_hedef_stok_id,
    'onay', p_onay,
    'gerekce', btrim(p_gerekce)
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'legacy_eslestirme_onayla', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  SELECT * INTO v_eslesme
  FROM public.maliyet_legacy_eslestirmeleri
  WHERE id = p_eslestirme_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'LEGACY_ESLESTIRME_BULUNAMADI';
  END IF;
  IF v_eslesme.onay_durumu <> 'bekliyor' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'LEGACY_ESLESTIRME_ZATEN_SONUCLANDIRILMIS';
  END IF;

  IF p_onay THEN
    SELECT * INTO v_stok
    FROM public.stok
    WHERE id = p_hedef_stok_id AND aktif;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AKTIF_HEDEF_STOK_BULUNAMADI';
    END IF;
    v_beklenen_kategori := CASE
      WHEN v_eslesme.kaynak_tablo = 'maliyet_cam_hammaddeleri' THEN 'cam'
      WHEN v_eslesme.kaynak_tablo = 'maliyet_citalari' THEN 'cita'
      WHEN v_eslesme.kaynak_tablo = 'maliyet_sarf_malzemeleri' THEN 'yan_malzeme'
      ELSE NULL
    END;
    IF v_beklenen_kategori IS NOT NULL
       AND v_stok.kategori <> v_beklenen_kategori THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEGACY_ESLESTIRME_KATEGORI_UYUSMAZLIGI';
    END IF;
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'legacy_eslestirme_onayla', p_idempotency_key, p_gerekce, 'legacy_duzeltme_raporu'
  );
  UPDATE public.maliyet_legacy_eslestirmeleri
  SET
    hedef_stok_id = CASE WHEN p_onay THEN p_hedef_stok_id ELSE hedef_stok_id END,
    otomatik = false,
    onay_durumu = CASE WHEN p_onay THEN 'onaylandi' ELSE 'reddedildi' END,
    onaylayan_kullanici_id = auth.uid(),
    onay_tarihi = now(),
    aciklama = btrim(p_gerekce)
  WHERE id = p_eslestirme_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'eslestirme_id', p_eslestirme_id,
    'hedef_stok_id', CASE WHEN p_onay THEN p_hedef_stok_id ELSE NULL END,
    'onay_durumu', CASE WHEN p_onay THEN 'onaylandi' ELSE 'reddedildi' END
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

REVOKE ALL ON FUNCTION public.legacy_maliyet_eslestirme_raporu(text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.legacy_eslestirme_onayla(uuid, uuid, boolean, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legacy_maliyet_eslestirme_raporu(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_eslestirme_onayla(uuid, uuid, boolean, text, text)
  TO authenticated;
