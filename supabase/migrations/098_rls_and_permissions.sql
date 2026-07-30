-- 098 - Kritik stok maliyet işlemlerini RPC sınırında tutan güvenlik kuralları

SET search_path = public, extensions, pg_catalog;

CREATE INDEX IF NOT EXISTS stok_maliyet_kaynagi_acik_idx
  ON public.stok_maliyet_kaynagi_atamalari(stok_id, lower(gecerlilik_donemi))
  WHERE upper_inf(gecerlilik_donemi);
CREATE INDEX IF NOT EXISTS stok_maliyet_kaynagi_gelecek_idx
  ON public.stok_maliyet_kaynagi_atamalari(lower(gecerlilik_donemi), stok_id);
CREATE INDEX IF NOT EXISTS stok_alis_fiyatlari_aktif_cozumleme_idx
  ON public.stok_alis_fiyatlari(stok_id, durum, fiyat_tarihi DESC);
CREATE INDEX IF NOT EXISTS cam_baglanti_kalem_stok_stok_idx
  ON public.cam_tedarik_baglanti_kalem_stoklari(stok_id, baglanti_kalemi_id);

CREATE OR REPLACE FUNCTION public.stok_legacy_maliyet_alanlarini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND (NEW.birim_fiyat IS NOT NULL OR NEW.tedarikci_id IS NOT NULL))
     OR (
       TG_OP = 'UPDATE'
       AND (
         OLD.birim_fiyat IS DISTINCT FROM NEW.birim_fiyat
         OR OLD.tedarikci_id IS DISTINCT FROM NEW.tedarikci_id
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'STOK_LEGACY_FIYAT_ALANLARI_YENI_YAZIMA_KAPALI',
      DETAIL = 'Alış fiyatları / tedarikçi yönetimi bölümünü kullanın.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stok_legacy_maliyet_alanlari_guard ON public.stok;
CREATE TRIGGER stok_legacy_maliyet_alanlari_guard
  BEFORE INSERT OR UPDATE ON public.stok
  FOR EACH ROW EXECUTE FUNCTION public.stok_legacy_maliyet_alanlarini_koru();

CREATE OR REPLACE FUNCTION public.tedarikci_pasiflestirme_rpc_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.aktif AND NOT NEW.aktif
     AND current_setting('app.tedarikci_pasiflestirme_rpc', true)
       IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'TEDARIKCI_PASIFLESTIRME_RPC_GEREKLI',
      DETAIL = 'Aktif maliyet kaynakları ve gelecek dönemler atomik olarak kontrol edilmelidir.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tedarikci_pasiflestirme_guard ON public.cari;
CREATE TRIGGER tedarikci_pasiflestirme_guard
  BEFORE UPDATE OF aktif ON public.cari
  FOR EACH ROW
  WHEN (OLD.tipi = 'tedarikci')
  EXECUTE FUNCTION public.tedarikci_pasiflestirme_rpc_guard();

CREATE OR REPLACE FUNCTION public.tedarikci_pasiflestir(
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
  v_aktif_cam integer;
  v_aktif_fiyat integer;
  v_gelecek integer;
  v_bagli_stok integer;
  v_bekleyen integer;
  v_engeller jsonb;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);
  IF length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEDARIKCI_PASIFLESTIRME_GEREKCESI_ZORUNLU';
  END IF;
  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_pasiflestir', p_idempotency_key,
    jsonb_build_object('tedarikci_id', p_tedarikci_id, 'gerekce', btrim(p_gerekce))
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  SELECT * INTO v_tedarikci
  FROM public.cari
  WHERE id = p_tedarikci_id AND tipi = 'tedarikci'
  FOR UPDATE;
  IF NOT FOUND OR NOT v_tedarikci.aktif THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AKTIF_TEDARIKCI_BULUNAMADI';
  END IF;
  SELECT count(*) INTO v_aktif_cam
  FROM public.cam_tedarik_baglantilari
  WHERE tedarikci_id = p_tedarikci_id AND durum = 'aktif';
  SELECT count(*) INTO v_aktif_fiyat
  FROM public.stok_maliyet_kaynagi_atamalari atama
  JOIN public.stok_alis_fiyatlari fiyat ON fiyat.id = atama.fiyat_id
  WHERE fiyat.tedarikci_id = p_tedarikci_id
    AND atama.gecerlilik_donemi @> now();
  SELECT count(*) INTO v_gelecek
  FROM public.stok_maliyet_kaynagi_atamalari atama
  JOIN public.stok_alis_fiyatlari fiyat ON fiyat.id = atama.fiyat_id
  WHERE fiyat.tedarikci_id = p_tedarikci_id
    AND lower(atama.gecerlilik_donemi) > now();
  SELECT count(DISTINCT fiyat.stok_id) INTO v_bagli_stok
  FROM public.stok_alis_fiyatlari fiyat
  WHERE fiyat.tedarikci_id = p_tedarikci_id;
  SELECT count(*) INTO v_bekleyen
  FROM public.stok_alis_fiyatlari fiyat
  WHERE fiyat.tedarikci_id = p_tedarikci_id
    AND fiyat.fiyat_tarihi > now()
    AND fiyat.durum IN ('dogrulanmis', 'duzeltme')
    AND NOT EXISTS (
      SELECT 1 FROM public.stok_maliyet_kaynagi_atamalari atama
      WHERE atama.fiyat_id = fiyat.id
    );
  v_engeller := jsonb_build_object(
    'aktif_cam_baglantisi_sayisi', v_aktif_cam,
    'aktif_stok_fiyati_sayisi', v_aktif_fiyat,
    'gelecek_tarihli_fiyat_donemi_sayisi', v_gelecek,
    'bagli_stok_sayisi', v_bagli_stok,
    'bekleyen_fiyat_degisikligi_sayisi', v_bekleyen
  );
  IF v_aktif_cam + v_aktif_fiyat + v_gelecek + v_bekleyen > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEDARIKCI_AKTIF_MALIYET_KAYNAKLARI_NEDENIYLE_PASIFLESTIRILEMEZ',
      DETAIL = v_engeller::text;
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_pasiflestir', p_idempotency_key, p_gerekce, 'cari_tedarikci_detayi'
  );
  PERFORM set_config('app.tedarikci_pasiflestirme_rpc', 'true', true);
  UPDATE public.cari SET aktif = false WHERE id = p_tedarikci_id;
  v_yanit := jsonb_build_object(
    'basarili', true, 'tedarikci_id', p_tedarikci_id,
    'aktif', false, 'engeller', v_engeller
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

REVOKE ALL ON FUNCTION public.tedarikci_pasiflestir(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tedarikci_pasiflestir(uuid, text, text)
  TO authenticated;

COMMENT ON TRIGGER stok_legacy_maliyet_alanlari_guard ON public.stok IS
  'stok.birim_fiyat ve stok.tedarikci_id yalnız legacy gösterim içindir; yeni fiyatlar stok_alis_fiyatlari RPC''leriyle yazılır.';
