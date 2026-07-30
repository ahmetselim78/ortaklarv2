-- 075 - Merkezi idempotency, fiyat önizleme kayıtları ve optimistic locking

CREATE TABLE public.islem_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kullanici_id uuid NOT NULL REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  islem_tipi text NOT NULL CHECK (length(islem_tipi) BETWEEN 1 AND 100),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  durum text NOT NULL CHECK (durum IN ('isleniyor', 'basarili', 'basarisiz')),
  deneme_sayisi integer NOT NULL DEFAULT 1 CHECK (deneme_sayisi > 0),
  sonuc_json jsonb,
  hata_kodu text,
  hata_mesaji text,
  tekrar_edilebilir boolean NOT NULL DEFAULT false,
  olusturulma_tarihi timestamptz NOT NULL DEFAULT now(),
  baslama_tarihi timestamptz NOT NULL DEFAULT now(),
  tamamlanma_tarihi timestamptz,
  UNIQUE (kullanici_id, islem_tipi, idempotency_key),
  CONSTRAINT islem_idempotency_sonuc_check CHECK (
    (durum = 'basarili' AND sonuc_json IS NOT NULL AND tamamlanma_tarihi IS NOT NULL)
    OR
    (durum = 'basarisiz' AND hata_kodu IS NOT NULL AND tamamlanma_tarihi IS NOT NULL)
    OR
    (durum = 'isleniyor' AND tamamlanma_tarihi IS NULL)
  )
);

CREATE INDEX islem_idempotency_kullanici_tarih_idx
  ON public.islem_idempotency(kullanici_id, olusturulma_tarihi DESC);
CREATE INDEX islem_idempotency_isleniyor_idx
  ON public.islem_idempotency(baslama_tarihi)
  WHERE durum = 'isleniyor';

ALTER TABLE public.cari_hareketleri
  ADD CONSTRAINT cari_hareketleri_idempotency_fk
  FOREIGN KEY (idempotency_id)
  REFERENCES public.islem_idempotency(id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.ticari_json_hash(p_deger jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, extensions
AS $$
  SELECT encode(extensions.digest(convert_to(p_deger::text, 'UTF8'), 'sha256'), 'hex')
$$;

COMMENT ON FUNCTION public.ticari_json_hash(jsonb) IS
  'jsonb anahtar sıralamasını kullanan deterministik SHA-256 hash üretir.';

CREATE OR REPLACE FUNCTION public.ticari_idempotency_baslat(
  p_islem_tipi text,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kullanici_id uuid := auth.uid();
  v_hash text;
  v_kayit public.islem_idempotency%ROWTYPE;
BEGIN
  IF v_kullanici_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OTURUM_GEREKLI';
  END IF;
  IF p_islem_tipi IS NULL OR length(p_islem_tipi) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_ISLEM_TIPI_GECERSIZ';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_KEY_GECERSIZ';
  END IF;

  v_hash := public.ticari_json_hash(COALESCE(p_payload, '{}'::jsonb));

  INSERT INTO public.islem_idempotency (
    kullanici_id,
    islem_tipi,
    idempotency_key,
    request_hash,
    durum
  )
  VALUES (
    v_kullanici_id,
    p_islem_tipi,
    p_idempotency_key,
    v_hash,
    'isleniyor'
  )
  ON CONFLICT (kullanici_id, islem_tipi, idempotency_key) DO NOTHING
  RETURNING * INTO v_kayit;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'aksiyon', 'yeni',
      'idempotency_id', v_kayit.id,
      'request_hash', v_hash
    );
  END IF;

  SELECT *
  INTO v_kayit
  FROM public.islem_idempotency
  WHERE kullanici_id = v_kullanici_id
    AND islem_tipi = p_islem_tipi
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_kayit.request_hash <> v_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'IDEMPOTENCY_PAYLOAD_CONFLICT',
      DETAIL = 'Aynı idempotency anahtarı farklı bir payload ile kullanıldı.';
  END IF;

  IF v_kayit.durum = 'basarili' THEN
    RETURN jsonb_build_object(
      'aksiyon', 'onceki_sonuc',
      'idempotency_id', v_kayit.id,
      'request_hash', v_hash,
      'sonuc', v_kayit.sonuc_json
    );
  END IF;

  IF v_kayit.durum = 'isleniyor' THEN
    IF v_kayit.baslama_tarihi >= now() - interval '5 minutes' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'IDEMPOTENCY_ISLEM_DEVAM_EDIYOR',
        DETAIL = 'Aynı işlem halen yürütülüyor; kısa süre sonra güvenle tekrar deneyin.';
    END IF;

    UPDATE public.islem_idempotency
    SET deneme_sayisi = deneme_sayisi + 1,
        baslama_tarihi = now(),
        hata_kodu = NULL,
        hata_mesaji = NULL,
        tamamlanma_tarihi = NULL,
        tekrar_edilebilir = false
    WHERE id = v_kayit.id;

    RETURN jsonb_build_object(
      'aksiyon', 'yarim_islem_tekrari',
      'idempotency_id', v_kayit.id,
      'request_hash', v_hash
    );
  END IF;

  IF v_kayit.durum = 'basarisiz' AND v_kayit.tekrar_edilebilir THEN
    UPDATE public.islem_idempotency
    SET durum = 'isleniyor',
        deneme_sayisi = deneme_sayisi + 1,
        baslama_tarihi = now(),
        tamamlanma_tarihi = NULL,
        hata_kodu = NULL,
        hata_mesaji = NULL,
        tekrar_edilebilir = false
    WHERE id = v_kayit.id;

    RETURN jsonb_build_object(
      'aksiyon', 'guvenli_tekrar',
      'idempotency_id', v_kayit.id,
      'request_hash', v_hash
    );
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'IDEMPOTENCY_YENI_ANAHTAR_GEREKLI',
    DETAIL = COALESCE(v_kayit.hata_kodu, 'Bu hata düzeltilmiş bir payload ve yeni anahtar gerektirir.');
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_idempotency_onceki_sonuc(
  p_islem_tipi text,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kayit public.islem_idempotency%ROWTYPE;
  v_hash text := public.ticari_json_hash(COALESCE(p_payload, '{}'::jsonb));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OTURUM_GEREKLI';
  END IF;

  SELECT *
  INTO v_kayit
  FROM public.islem_idempotency
  WHERE kullanici_id = auth.uid()
    AND islem_tipi = p_islem_tipi
    AND idempotency_key = p_idempotency_key;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_kayit.request_hash <> v_hash THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_PAYLOAD_CONFLICT';
  END IF;
  IF v_kayit.durum = 'basarili' THEN
    RETURN v_kayit.sonuc_json;
  END IF;
  IF v_kayit.durum = 'isleniyor'
     AND v_kayit.baslama_tarihi >= now() - interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_ISLEM_DEVAM_EDIYOR';
  END IF;
  IF v_kayit.durum = 'basarisiz' AND NOT v_kayit.tekrar_edilebilir THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_YENI_ANAHTAR_GEREKLI';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_idempotency_basarili(
  p_idempotency_id uuid,
  p_sonuc jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sonuc jsonb := COALESCE(p_sonuc, '{}'::jsonb);
BEGIN
  UPDATE public.islem_idempotency
  SET durum = 'basarili',
      sonuc_json = v_sonuc,
      hata_kodu = NULL,
      hata_mesaji = NULL,
      tekrar_edilebilir = false,
      tamamlanma_tarihi = now()
  WHERE id = p_idempotency_id
    AND kullanici_id = auth.uid()
    AND durum = 'isleniyor';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_DURUM_CAKISMASI';
  END IF;

  RETURN v_sonuc;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_idempotency_basarisiz(
  p_idempotency_id uuid,
  p_hata_kodu text,
  p_hata_mesaji text,
  p_tekrar_edilebilir boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.islem_idempotency
  SET durum = 'basarisiz',
      sonuc_json = NULL,
      hata_kodu = p_hata_kodu,
      hata_mesaji = left(COALESCE(p_hata_mesaji, ''), 2000),
      tekrar_edilebilir = COALESCE(p_tekrar_edilebilir, false),
      tamamlanma_tarihi = now()
  WHERE id = p_idempotency_id
    AND kullanici_id = auth.uid()
    AND durum = 'isleniyor';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_DURUM_CAKISMASI';
  END IF;
END;
$$;

CREATE TABLE public.fiyat_onizlemeleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kullanici_id uuid NOT NULL REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  belge_turu text NOT NULL CHECK (belge_turu IN ('siparis', 'teklif', 'golge')),
  belge_id uuid,
  girdi_json jsonb NOT NULL,
  girdi_hash text NOT NULL CHECK (girdi_hash ~ '^[0-9a-f]{64}$'),
  fiyat_baglami jsonb NOT NULL,
  fiyat_baglam_hash text NOT NULL CHECK (fiyat_baglam_hash ~ '^[0-9a-f]{64}$'),
  sonuc_json jsonb NOT NULL,
  sonuc_hash text NOT NULL CHECK (sonuc_hash ~ '^[0-9a-f]{64}$'),
  kullanilan_surumluler jsonb NOT NULL DEFAULT '{}'::jsonb,
  hesaplama_surumu text NOT NULL,
  olusturulma_tarihi timestamptz NOT NULL DEFAULT now(),
  sona_erme_tarihi timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  gecersiz_kilindi_at timestamptz,
  CONSTRAINT fiyat_onizlemeleri_sure_check CHECK (sona_erme_tarihi > olusturulma_tarihi)
);

CREATE INDEX fiyat_onizlemeleri_sahip_sure_idx
  ON public.fiyat_onizlemeleri(kullanici_id, sona_erme_tarihi DESC);
CREATE INDEX fiyat_onizlemeleri_belge_idx
  ON public.fiyat_onizlemeleri(belge_turu, belge_id, olusturulma_tarihi DESC)
  WHERE belge_id IS NOT NULL;

ALTER TABLE public.siparisler
  ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fiyatlandirildi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS para_birimi text,
  ADD COLUMN IF NOT EXISTS fiyatlandirma_tarihi date,
  ADD COLUMN IF NOT EXISTS iptal_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS iptal_gerekcesi text,
  ADD COLUMN IF NOT EXISTS iptal_eden uuid REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT;

ALTER TABLE public.siparisler
  DROP CONSTRAINT IF EXISTS siparisler_revision_no_check,
  ADD CONSTRAINT siparisler_revision_no_check CHECK (revision_no > 0),
  DROP CONSTRAINT IF EXISTS siparisler_para_birimi_check,
  ADD CONSTRAINT siparisler_para_birimi_check CHECK (para_birimi IS NULL OR para_birimi IN ('TRY', 'USD', 'EUR')),
  DROP CONSTRAINT IF EXISTS siparisler_fiyatlama_alanlari_check,
  ADD CONSTRAINT siparisler_fiyatlama_alanlari_check CHECK (
    NOT fiyatlandirildi
    OR (para_birimi IS NOT NULL AND fiyatlandirma_tarihi IS NOT NULL)
  );

CREATE INDEX siparisler_revision_idx ON public.siparisler(id, revision_no);
CREATE INDEX siparisler_fiyatlandirildi_idx
  ON public.siparisler(fiyatlandirildi, tarih)
  WHERE fiyatlandirildi;

CREATE OR REPLACE FUNCTION public.siparis_fiyatli_kimlik_degisimini_engelle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.fiyatlandirildi
     AND (
       NEW.cari_id IS DISTINCT FROM OLD.cari_id
       OR NEW.tarih IS DISTINCT FROM OLD.tarih
       OR NEW.para_birimi IS DISTINCT FROM OLD.para_birimi
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SIPARIS_KIMLIK_ALANLARI_DEGISTIRILEMEZ',
      DETAIL = 'Fiyatlanmış siparişte müşteri, sipariş tarihi ve para birimi değiştirilemez; iptal edip yeni sipariş oluşturun.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER siparis_fiyatli_kimlik_kilidi
  BEFORE UPDATE ON public.siparisler
  FOR EACH ROW EXECUTE FUNCTION public.siparis_fiyatli_kimlik_degisimini_engelle();

ALTER TABLE public.islem_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.islem_idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fiyat_onizlemeleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiyat_onizlemeleri FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.islem_idempotency FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fiyat_onizlemeleri FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.islem_idempotency TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.islem_idempotency TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.fiyat_onizlemeleri TO service_role;

CREATE POLICY islem_idempotency_own_read
  ON public.islem_idempotency FOR SELECT TO authenticated
  USING (kullanici_id = auth.uid());

CREATE POLICY fiyat_onizlemeleri_own_read
  ON public.fiyat_onizlemeleri FOR SELECT TO authenticated
  USING (kullanici_id = auth.uid());

REVOKE ALL ON FUNCTION public.ticari_json_hash(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ticari_json_hash(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ticari_idempotency_baslat(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_idempotency_onceki_sonuc(text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_idempotency_basarili(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_idempotency_basarisiz(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.siparis_fiyatli_kimlik_degisimini_engelle() FROM PUBLIC, anon, authenticated;
