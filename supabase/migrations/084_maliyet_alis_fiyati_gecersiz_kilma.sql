-- 084 - Hatalı maliyet alış fiyatlarını tarihçeyi bozmadan geçersiz kılma

CREATE TABLE public.maliyet_alis_fiyati_gecersiz_kilmalari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alis_fiyati_id uuid NOT NULL UNIQUE
    REFERENCES public.maliyet_alis_fiyatlari(id) ON DELETE RESTRICT,
  gerekce text NOT NULL CHECK (length(btrim(gerekce)) BETWEEN 5 AND 1000),
  idempotency_id uuid NOT NULL UNIQUE
    REFERENCES public.islem_idempotency(id) ON DELETE RESTRICT,
  gecersiz_kilan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX maliyet_alis_fiyati_gecersiz_kilma_tarih_idx
  ON public.maliyet_alis_fiyati_gecersiz_kilmalari (created_at DESC);

CREATE TRIGGER maliyet_alis_fiyati_gecersiz_kilma_append_only
  BEFORE UPDATE OR DELETE ON public.maliyet_alis_fiyati_gecersiz_kilmalari
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_tarihceli_kaydi_koru();

ALTER TABLE public.maliyet_alis_fiyati_gecersiz_kilmalari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maliyet_alis_fiyati_gecersiz_kilmalari FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.maliyet_alis_fiyati_gecersiz_kilmalari
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.maliyet_alis_fiyati_gecersiz_kilmalari TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.maliyet_alis_fiyati_gecersiz_kilmalari TO service_role;

CREATE POLICY maliyet_alis_fiyati_gecersiz_kilma_admin_read
  ON public.maliyet_alis_fiyati_gecersiz_kilmalari
  FOR SELECT TO authenticated
  USING (
    public.has_permission('admin', 'manage')
    AND public.current_aal2()
  );

CREATE TRIGGER audit_maliyet_alis_fiyati_gecersiz_kilmalari
  AFTER INSERT OR UPDATE OR DELETE
  ON public.maliyet_alis_fiyati_gecersiz_kilmalari
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

CREATE OR REPLACE FUNCTION public.maliyet_alis_fiyati_gecersiz_kil(
  p_fiyat_id uuid,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fiyat public.maliyet_alis_fiyatlari%ROWTYPE;
  v_mevcut public.maliyet_alis_fiyati_gecersiz_kilmalari%ROWTYPE;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_gecersiz_kilma_id uuid;
  v_payload jsonb;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('admin', 'manage') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ADMIN_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;
  IF p_fiyat_id IS NULL OR length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MALIYET_FIYATI_GECERSIZ_KILMA_GEREKCESI_ZORUNLU';
  END IF;

  v_payload := jsonb_build_object(
    'fiyat_id', p_fiyat_id,
    'gerekce', btrim(p_gerekce)
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'maliyet_alis_fiyati_gecersiz_kil',
    p_idempotency_key,
    v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  SELECT *
  INTO v_fiyat
  FROM public.maliyet_alis_fiyatlari
  WHERE id = p_fiyat_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'MALIYET_ALIS_FIYATI_BULUNAMADI';
  END IF;

  SELECT *
  INTO v_mevcut
  FROM public.maliyet_alis_fiyati_gecersiz_kilmalari
  WHERE alis_fiyati_id = p_fiyat_id;

  IF FOUND THEN
    v_yanit := jsonb_build_object(
      'basarili', true,
      'zaten_gecersiz', true,
      'alis_fiyati_id', p_fiyat_id,
      'gecersiz_kilma_id', v_mevcut.id
    );
    RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
  END IF;

  INSERT INTO public.maliyet_alis_fiyati_gecersiz_kilmalari (
    alis_fiyati_id,
    gerekce,
    idempotency_id,
    gecersiz_kilan_kullanici_id
  )
  VALUES (
    p_fiyat_id,
    btrim(p_gerekce),
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_gecersiz_kilma_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'zaten_gecersiz', false,
    'alis_fiyati_id', p_fiyat_id,
    'gecersiz_kilma_id', v_gecersiz_kilma_id
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.maliyet_alis_fiyati_tarihcesi(
  p_arama text DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  fiyat_id uuid,
  malzeme_turu text,
  malzeme_id uuid,
  malzeme_adi text,
  alis_birimi text,
  tedarikci_id uuid,
  tedarikci_adi text,
  birim_fiyat numeric,
  para_birimi text,
  vade_gunu integer,
  fiyat_tarihi date,
  aciklama text,
  olusturan_kullanici text,
  olusturulma_tarihi timestamptz,
  gecersiz boolean,
  gecersiz_kilma_gerekcesi text,
  gecersiz_kilan_kullanici text,
  gecersiz_kilma_tarihi timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('admin', 'manage') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ADMIN_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;

  RETURN QUERY
  WITH fiyatlar AS (
    SELECT
      fiyat.id AS fiyat_id,
      fiyat.malzeme_turu,
      COALESCE(
        fiyat.cam_hammaddesi_id,
        fiyat.cita_id,
        fiyat.sarf_malzeme_id
      ) AS malzeme_id,
      CASE fiyat.malzeme_turu
        WHEN 'cam' THEN
          cam.kalinlik_mm::text || ' mm '
          || public.maliyet_cam_turu_etiketi(cam.cam_turu, cam.ozel_tur_adi)
        WHEN 'cita' THEN
          cita.genislik_mm::text || ' mm '
          || public.maliyet_cita_turu_etiketi(
            cita.malzeme_turu,
            cita.ozel_malzeme_adi
          ) || ' Çıta'
        ELSE sarf.ad
      END AS malzeme_adi,
      CASE fiyat.malzeme_turu
        WHEN 'cam' THEN 'm²'
        WHEN 'cita' THEN 'metre'
        ELSE sarf.alis_birimi
      END AS alis_birimi,
      fiyat.tedarikci_id,
      tedarikci.ad AS tedarikci_adi,
      fiyat.birim_fiyat,
      fiyat.para_birimi::text AS para_birimi,
      fiyat.vade_gunu,
      fiyat.gecerli_baslangic AS fiyat_tarihi,
      fiyat.aciklama,
      COALESCE(NULLIF(olusturan.display_name, ''), olusturan.username, '—')
        AS olusturan_kullanici,
      fiyat.created_at AS olusturulma_tarihi,
      gecersiz.id IS NOT NULL AS gecersiz,
      gecersiz.gerekce AS gecersiz_kilma_gerekcesi,
      COALESCE(NULLIF(gecersiz_kilan.display_name, ''), gecersiz_kilan.username)
        AS gecersiz_kilan_kullanici,
      gecersiz.created_at AS gecersiz_kilma_tarihi
    FROM public.maliyet_alis_fiyatlari fiyat
    JOIN public.cari tedarikci ON tedarikci.id = fiyat.tedarikci_id
    LEFT JOIN public.maliyet_cam_hammaddeleri cam
      ON cam.id = fiyat.cam_hammaddesi_id
    LEFT JOIN public.maliyet_citalari cita
      ON cita.id = fiyat.cita_id
    LEFT JOIN public.maliyet_sarf_malzemeleri sarf
      ON sarf.id = fiyat.sarf_malzeme_id
    LEFT JOIN public.app_users olusturan
      ON olusturan.auth_user_id = fiyat.olusturan_kullanici_id
    LEFT JOIN public.maliyet_alis_fiyati_gecersiz_kilmalari gecersiz
      ON gecersiz.alis_fiyati_id = fiyat.id
    LEFT JOIN public.app_users gecersiz_kilan
      ON gecersiz_kilan.auth_user_id = gecersiz.gecersiz_kilan_kullanici_id
  )
  SELECT fiyatlar.*
  FROM fiyatlar
  WHERE NULLIF(btrim(COALESCE(p_arama, '')), '') IS NULL
    OR fiyatlar.malzeme_adi ILIKE '%' || btrim(p_arama) || '%'
    OR fiyatlar.tedarikci_adi ILIKE '%' || btrim(p_arama) || '%'
    OR fiyatlar.para_birimi ILIKE '%' || btrim(p_arama) || '%'
  ORDER BY
    fiyatlar.fiyat_tarihi DESC,
    fiyatlar.olusturulma_tarihi DESC,
    fiyatlar.fiyat_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
END;
$$;

-- Geçersiz kılınmış kayıt güncel seçimden çıkarılır. Aynı tedarikçi ve malzeme
-- için bir önceki geçerli kayıt otomatik olarak yeniden güncel fiyat olur.
CREATE OR REPLACE FUNCTION public.maliyet_guncel_alis_fiyatlari(
  p_tarih date DEFAULT NULL
)
RETURNS TABLE (
  fiyat_id uuid,
  malzeme_turu text,
  malzeme_id uuid,
  malzeme_adi text,
  alis_birimi text,
  tedarikci_id uuid,
  tedarikci_adi text,
  birim_fiyat numeric,
  para_birimi text,
  vade_gunu integer,
  fiyat_tarihi date,
  yillik_finansman_orani numeric,
  kur numeric,
  kur_tarihi date,
  baz_birim_maliyet_try numeric,
  finansman_birim_etkisi_try numeric,
  faiz_dahil_birim_maliyet_try numeric,
  ayar_eksik boolean,
  kur_eksik boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tarih date := COALESCE(
    p_tarih,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_oran numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT ayar.yillik_finansman_orani
  INTO v_oran
  FROM public.maliyet_hesaplama_ayar_surmleri ayar
  WHERE ayar.gecerli_baslangic <= v_tarih
  ORDER BY ayar.gecerli_baslangic DESC, ayar.created_at DESC, ayar.id DESC
  LIMIT 1;

  RETURN QUERY
  WITH fiyat_adaylari AS (
    SELECT
      fiyat.*,
      COALESCE(
        fiyat.cam_hammaddesi_id,
        fiyat.cita_id,
        fiyat.sarf_malzeme_id
      ) AS cozum_malzeme_id,
      row_number() OVER (
        PARTITION BY
          fiyat.malzeme_turu,
          COALESCE(
            fiyat.cam_hammaddesi_id,
            fiyat.cita_id,
            fiyat.sarf_malzeme_id
          ),
          fiyat.tedarikci_id
        ORDER BY
          fiyat.gecerli_baslangic DESC,
          fiyat.created_at DESC,
          fiyat.id DESC
      ) AS fiyat_sirasi
    FROM public.maliyet_alis_fiyatlari fiyat
    WHERE fiyat.gecerli_baslangic <= v_tarih
      AND NOT EXISTS (
        SELECT 1
        FROM public.maliyet_alis_fiyati_gecersiz_kilmalari gecersiz
        WHERE gecersiz.alis_fiyati_id = fiyat.id
      )
  ),
  son_fiyatlar AS (
    SELECT *
    FROM fiyat_adaylari
    WHERE fiyat_sirasi = 1
  )
  SELECT
    fiyat.id,
    fiyat.malzeme_turu,
    fiyat.cozum_malzeme_id,
    CASE fiyat.malzeme_turu
      WHEN 'cam' THEN
        cam.kalinlik_mm::text || ' mm '
        || public.maliyet_cam_turu_etiketi(cam.cam_turu, cam.ozel_tur_adi)
      WHEN 'cita' THEN
        cita.genislik_mm::text || ' mm '
        || public.maliyet_cita_turu_etiketi(
          cita.malzeme_turu,
          cita.ozel_malzeme_adi
        ) || ' Çıta'
      ELSE sarf.ad
    END,
    CASE fiyat.malzeme_turu
      WHEN 'cam' THEN 'm2'
      WHEN 'cita' THEN 'metre'
      ELSE sarf.alis_birimi
    END,
    fiyat.tedarikci_id,
    tedarikci.ad,
    fiyat.birim_fiyat,
    fiyat.para_birimi::text,
    fiyat.vade_gunu,
    fiyat.gecerli_baslangic,
    v_oran,
    CASE
      WHEN fiyat.para_birimi::text = 'TRY' THEN 1::numeric
      ELSE doviz.try_karsiligi
    END,
    CASE
      WHEN fiyat.para_birimi::text = 'TRY' THEN v_tarih
      ELSE doviz.kur_tarihi
    END,
    CASE
      WHEN fiyat.para_birimi::text = 'TRY' THEN round(fiyat.birim_fiyat, 6)
      WHEN doviz.try_karsiligi IS NOT NULL
        THEN round(fiyat.birim_fiyat * doviz.try_karsiligi, 6)
    END,
    CASE
      WHEN v_oran IS NULL THEN NULL
      WHEN fiyat.para_birimi::text = 'TRY' THEN
        round(
          fiyat.birim_fiyat * (v_oran / 100) * (fiyat.vade_gunu::numeric / 365),
          6
        )
      WHEN doviz.try_karsiligi IS NOT NULL THEN
        round(
          fiyat.birim_fiyat
          * doviz.try_karsiligi
          * (v_oran / 100)
          * (fiyat.vade_gunu::numeric / 365),
          6
        )
    END,
    CASE
      WHEN v_oran IS NULL THEN NULL
      WHEN fiyat.para_birimi::text = 'TRY' THEN
        round(
          fiyat.birim_fiyat
          * (
            1
            + (v_oran / 100) * (fiyat.vade_gunu::numeric / 365)
          ),
          6
        )
      WHEN doviz.try_karsiligi IS NOT NULL THEN
        round(
          fiyat.birim_fiyat
          * doviz.try_karsiligi
          * (
            1
            + (v_oran / 100) * (fiyat.vade_gunu::numeric / 365)
          ),
          6
        )
    END,
    v_oran IS NULL,
    fiyat.para_birimi::text <> 'TRY' AND doviz.try_karsiligi IS NULL
  FROM son_fiyatlar fiyat
  JOIN public.cari tedarikci
    ON tedarikci.id = fiyat.tedarikci_id
  LEFT JOIN public.maliyet_cam_hammaddeleri cam
    ON cam.id = fiyat.cam_hammaddesi_id
  LEFT JOIN public.maliyet_citalari cita
    ON cita.id = fiyat.cita_id
  LEFT JOIN public.maliyet_sarf_malzemeleri sarf
    ON sarf.id = fiyat.sarf_malzeme_id
  LEFT JOIN LATERAL (
    SELECT kur_satiri.try_karsiligi, kur_satiri.kur_tarihi
    FROM public.doviz_kurlari kur_satiri
    WHERE kur_satiri.aktif
      AND kur_satiri.para_birimi::text = fiyat.para_birimi::text
      AND kur_satiri.kur_tipi::text = 'doviz_satis'
      AND kur_satiri.kur_tarihi <= v_tarih
    ORDER BY
      kur_satiri.kur_tarihi DESC,
      kur_satiri.revision_no DESC,
      kur_satiri.created_at DESC
    LIMIT 1
  ) doviz ON fiyat.para_birimi::text <> 'TRY'
  ORDER BY
    2,
    4,
    tedarikci.ad;
END;
$$;

REVOKE ALL ON FUNCTION public.maliyet_alis_fiyati_gecersiz_kil(
  uuid, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maliyet_alis_fiyati_tarihcesi(
  text, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.maliyet_alis_fiyati_gecersiz_kil(
  uuid, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maliyet_alis_fiyati_tarihcesi(
  text, integer
) TO authenticated;

COMMENT ON TABLE public.maliyet_alis_fiyati_gecersiz_kilmalari IS
  'Hatalı alış fiyatlarını fiziksel olarak silmeden, gerekçe ve kullanıcıyla append-only olarak geçersiz kılar.';
