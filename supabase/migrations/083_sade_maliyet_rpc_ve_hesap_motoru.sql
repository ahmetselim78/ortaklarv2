-- 083 — Sade maliyet giriş RPC'leri ve otomatik cam maliyet motoru.

SET search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.maliyet_cam_turu_etiketi(
  p_cam_turu text,
  p_ozel_tur_adi text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_cam_turu
    WHEN 'duz' THEN 'Düz'
    WHEN 'konfor' THEN 'Konfor'
    WHEN 'sinerji' THEN 'Sinerji'
    WHEN 'buzlu' THEN 'Buzlu'
    WHEN 'fume' THEN 'Füme'
    WHEN 'bronz' THEN 'Bronz'
    WHEN 'reflekte' THEN 'Reflekte'
    WHEN 'satina' THEN 'Satina'
    WHEN 'lamine' THEN 'Lamine'
    ELSE COALESCE(NULLIF(btrim(p_ozel_tur_adi), ''), 'Diğer')
  END
$$;

CREATE OR REPLACE FUNCTION public.maliyet_cita_turu_etiketi(
  p_malzeme_turu text,
  p_ozel_malzeme_adi text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_malzeme_turu
    WHEN 'aluminyum' THEN 'Alüminyum'
    WHEN 'sicak_kenar' THEN 'Sıcak Kenar'
    WHEN 'paslanmaz' THEN 'Paslanmaz'
    ELSE COALESCE(NULLIF(btrim(p_ozel_malzeme_adi), ''), 'Diğer')
  END
$$;

CREATE OR REPLACE FUNCTION public.maliyet_malzeme_kaydet(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tur text := lower(COALESCE(p_payload ->> 'malzeme_turu', ''));
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_id uuid;
  v_kalinlik numeric;
  v_genislik numeric;
  v_alt_tur text;
  v_ozel_ad text;
  v_ad text;
  v_birim text;
  v_hesaplama_tipi text;
  v_katsayi numeric;
  v_fire numeric;
  v_bosluk_basi boolean;
  v_baslangic date;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_CREATE_YETKISI_GEREKLI';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MALIYET_PAYLOAD_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'maliyet_malzeme_kaydet',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  IF v_tur = 'cam' THEN
    v_kalinlik := NULLIF(p_payload ->> 'kalinlik_mm', '')::numeric;
    v_alt_tur := lower(COALESCE(p_payload ->> 'cam_turu', ''));
    v_ozel_ad := NULLIF(btrim(p_payload ->> 'ozel_tur_adi'), '');
    IF v_kalinlik IS NULL OR v_kalinlik <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CAM_KALINLIGI_GECERSIZ';
    END IF;
    IF v_alt_tur NOT IN (
      'duz', 'konfor', 'sinerji', 'buzlu', 'fume',
      'bronz', 'reflekte', 'satina', 'lamine', 'diger'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CAM_TURU_GECERSIZ';
    END IF;
    IF v_alt_tur = 'diger' AND v_ozel_ad IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OZEL_CAM_TURU_ADI_GEREKLI';
    END IF;
    IF v_alt_tur <> 'diger' THEN
      v_ozel_ad := NULL;
    END IF;

    INSERT INTO public.maliyet_cam_hammaddeleri (
      kalinlik_mm,
      cam_turu,
      ozel_tur_adi,
      olusturan_kullanici_id
    )
    VALUES (v_kalinlik, v_alt_tur, v_ozel_ad, auth.uid())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      SELECT id INTO v_id
      FROM public.maliyet_cam_hammaddeleri
      WHERE kalinlik_mm = v_kalinlik
        AND cam_turu = v_alt_tur
        AND COALESCE(lower(btrim(ozel_tur_adi)), '')
          = COALESCE(lower(btrim(v_ozel_ad)), '')
      LIMIT 1;
    END IF;

  ELSIF v_tur = 'cita' THEN
    v_genislik := NULLIF(p_payload ->> 'genislik_mm', '')::numeric;
    v_alt_tur := lower(COALESCE(p_payload ->> 'cita_malzeme_turu', 'aluminyum'));
    v_ozel_ad := NULLIF(btrim(p_payload ->> 'ozel_malzeme_adi'), '');
    IF v_genislik IS NULL OR v_genislik <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CITA_GENISLIGI_GECERSIZ';
    END IF;
    IF v_alt_tur NOT IN ('aluminyum', 'sicak_kenar', 'paslanmaz', 'diger') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CITA_MALZEME_TURU_GECERSIZ';
    END IF;
    IF v_alt_tur = 'diger' AND v_ozel_ad IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OZEL_CITA_MALZEME_ADI_GEREKLI';
    END IF;
    IF v_alt_tur <> 'diger' THEN
      v_ozel_ad := NULL;
    END IF;

    INSERT INTO public.maliyet_citalari (
      genislik_mm,
      malzeme_turu,
      ozel_malzeme_adi,
      olusturan_kullanici_id
    )
    VALUES (v_genislik, v_alt_tur, v_ozel_ad, auth.uid())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      SELECT id INTO v_id
      FROM public.maliyet_citalari
      WHERE genislik_mm = v_genislik
        AND malzeme_turu = v_alt_tur
        AND COALESCE(lower(btrim(ozel_malzeme_adi)), '')
          = COALESCE(lower(btrim(v_ozel_ad)), '')
      LIMIT 1;
    END IF;

  ELSIF v_tur = 'sarf' THEN
    v_ad := NULLIF(btrim(p_payload ->> 'ad'), '');
    v_birim := lower(COALESCE(p_payload ->> 'alis_birimi', ''));
    v_hesaplama_tipi := lower(COALESCE(p_payload ->> 'hesaplama_tipi', ''));
    v_katsayi := NULLIF(p_payload ->> 'tuketim_katsayisi', '')::numeric;
    v_fire := COALESCE(NULLIF(p_payload ->> 'fire_orani', '')::numeric, 0);
    v_bosluk_basi := COALESCE((p_payload ->> 'bosluk_basi')::boolean, true);
    v_baslangic := COALESCE(
      NULLIF(p_payload ->> 'gecerli_baslangic', '')::date,
      (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
    );

    IF v_ad IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SARF_ADI_GEREKLI';
    END IF;
    IF v_birim NOT IN ('kg', 'litre', 'adet', 'metre') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SARF_ALIS_BIRIMI_GECERSIZ';
    END IF;
    IF v_hesaplama_tipi NOT IN ('cevre_m', 'm2', 'adet', 'sabit') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SARF_HESAPLAMA_TIPI_GECERSIZ';
    END IF;
    IF v_katsayi IS NULL OR v_katsayi < 0 OR v_fire < 0 OR v_fire >= 100 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SARF_KATSAYISI_GECERSIZ';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.maliyet_sarf_malzemeleri
      WHERE lower(btrim(ad)) = lower(v_ad)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'SARF_MALZEMESI_ZATEN_TANIMLI';
    END IF;

    INSERT INTO public.maliyet_sarf_malzemeleri (
      ad,
      alis_birimi,
      olusturan_kullanici_id
    )
    VALUES (v_ad, v_birim, auth.uid())
    RETURNING id INTO v_id;

    INSERT INTO public.maliyet_sarf_katsayi_surmleri (
      sarf_malzeme_id,
      hesaplama_tipi,
      tuketim_katsayisi,
      bosluk_basi,
      fire_orani,
      gecerli_baslangic,
      aciklama,
      olusturan_kullanici_id
    )
    VALUES (
      v_id,
      v_hesaplama_tipi,
      v_katsayi,
      v_bosluk_basi,
      v_fire,
      v_baslangic,
      NULLIF(btrim(p_payload ->> 'aciklama'), ''),
      auth.uid()
    );
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MALIYET_MALZEME_TURU_GECERSIZ';
  END IF;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'malzeme_turu', v_tur,
    'malzeme_id', v_id
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.maliyet_sarf_katsayisi_kaydet(
  p_sarf_malzeme_id uuid,
  p_payload jsonb,
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
  v_hesaplama_tipi text := lower(COALESCE(p_payload ->> 'hesaplama_tipi', ''));
  v_katsayi numeric := NULLIF(p_payload ->> 'tuketim_katsayisi', '')::numeric;
  v_fire numeric := COALESCE(NULLIF(p_payload ->> 'fire_orani', '')::numeric, 0);
  v_bosluk_basi boolean := COALESCE((p_payload ->> 'bosluk_basi')::boolean, true);
  v_baslangic date := COALESCE(
    NULLIF(p_payload ->> 'gecerli_baslangic', '')::date,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_surum_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_UPDATE_YETKISI_GEREKLI';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.maliyet_sarf_malzemeleri
    WHERE id = p_sarf_malzeme_id AND aktif
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SARF_MALZEMESI_BULUNAMADI';
  END IF;
  IF v_hesaplama_tipi NOT IN ('cevre_m', 'm2', 'adet', 'sabit')
     OR v_katsayi IS NULL OR v_katsayi < 0
     OR v_fire < 0 OR v_fire >= 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SARF_KATSAYISI_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'maliyet_sarf_katsayisi_kaydet',
    p_idempotency_key,
    jsonb_build_object('sarf_malzeme_id', p_sarf_malzeme_id, 'payload', p_payload)
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  INSERT INTO public.maliyet_sarf_katsayi_surmleri (
    sarf_malzeme_id,
    hesaplama_tipi,
    tuketim_katsayisi,
    bosluk_basi,
    fire_orani,
    gecerli_baslangic,
    aciklama,
    olusturan_kullanici_id
  )
  VALUES (
    p_sarf_malzeme_id,
    v_hesaplama_tipi,
    v_katsayi,
    v_bosluk_basi,
    v_fire,
    v_baslangic,
    NULLIF(btrim(p_payload ->> 'aciklama'), ''),
    auth.uid()
  )
  RETURNING id INTO v_surum_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'sarf_malzeme_id', p_sarf_malzeme_id,
    'katsayi_surumu_id', v_surum_id
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.maliyet_hesaplama_ayari_kaydet(
  p_payload jsonb,
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
  v_oran numeric := NULLIF(p_payload ->> 'yillik_finansman_orani', '')::numeric;
  v_cam_fire numeric := COALESCE(NULLIF(p_payload ->> 'cam_fire_orani', '')::numeric, 0);
  v_cita_fire numeric := COALESCE(NULLIF(p_payload ->> 'cita_fire_orani', '')::numeric, 0);
  v_en numeric := COALESCE(NULLIF(p_payload ->> 'referans_en_mm', '')::numeric, 1000);
  v_boy numeric := COALESCE(NULLIF(p_payload ->> 'referans_boy_mm', '')::numeric, 1000);
  v_baslangic date := COALESCE(
    NULLIF(p_payload ->> 'gecerli_baslangic', '')::date,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_ayar_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_UPDATE_YETKISI_GEREKLI';
  END IF;
  IF v_oran IS NULL OR v_oran < 0 OR v_oran > 1000
     OR v_cam_fire < 0 OR v_cam_fire >= 100
     OR v_cita_fire < 0 OR v_cita_fire >= 100
     OR v_en <= 0 OR v_boy <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MALIYET_HESAPLAMA_AYARI_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'maliyet_hesaplama_ayari_kaydet',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  INSERT INTO public.maliyet_hesaplama_ayar_surmleri (
    yillik_finansman_orani,
    cam_fire_orani,
    cita_fire_orani,
    referans_en_mm,
    referans_boy_mm,
    gecerli_baslangic,
    aciklama,
    olusturan_kullanici_id
  )
  VALUES (
    v_oran,
    v_cam_fire,
    v_cita_fire,
    v_en,
    v_boy,
    v_baslangic,
    NULLIF(btrim(p_payload ->> 'aciklama'), ''),
    auth.uid()
  )
  RETURNING id INTO v_ayar_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'ayar_surumu_id', v_ayar_id,
    'yillik_finansman_orani', v_oran
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.maliyet_alis_fiyati_kaydet(
  p_payload jsonb,
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
  v_tur text := lower(COALESCE(p_payload ->> 'malzeme_turu', ''));
  v_malzeme_id uuid := NULLIF(p_payload ->> 'malzeme_id', '')::uuid;
  v_tedarikci_id uuid := NULLIF(p_payload ->> 'tedarikci_id', '')::uuid;
  v_fiyat numeric := NULLIF(p_payload ->> 'birim_fiyat', '')::numeric;
  v_para_birimi text := upper(COALESCE(p_payload ->> 'para_birimi', 'TRY'));
  v_vade integer := COALESCE(NULLIF(p_payload ->> 'vade_gunu', '')::integer, 0);
  v_baslangic date := COALESCE(
    NULLIF(p_payload ->> 'gecerli_baslangic', '')::date,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_fiyat_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_UPDATE_YETKISI_GEREKLI';
  END IF;
  IF v_tur NOT IN ('cam', 'cita', 'sarf')
     OR v_malzeme_id IS NULL
     OR v_tedarikci_id IS NULL
     OR v_fiyat IS NULL
     OR v_fiyat <= 0
     OR v_para_birimi NOT IN ('TRY', 'USD', 'EUR')
     OR v_vade NOT BETWEEN 0 AND 3650 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MALIYET_ALIS_FIYATI_GECERSIZ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cari
    WHERE id = v_tedarikci_id AND tipi = 'tedarikci' AND aktif
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AKTIF_TEDARIKCI_GEREKLI';
  END IF;
  IF (v_tur = 'cam' AND NOT EXISTS (
        SELECT 1 FROM public.maliyet_cam_hammaddeleri
        WHERE id = v_malzeme_id AND aktif
      ))
     OR (v_tur = 'cita' AND NOT EXISTS (
        SELECT 1 FROM public.maliyet_citalari
        WHERE id = v_malzeme_id AND aktif
      ))
     OR (v_tur = 'sarf' AND NOT EXISTS (
        SELECT 1 FROM public.maliyet_sarf_malzemeleri
        WHERE id = v_malzeme_id AND aktif
      )) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MALIYET_MALZEMESI_BULUNAMADI';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'maliyet_alis_fiyati_kaydet',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  INSERT INTO public.maliyet_alis_fiyatlari (
    malzeme_turu,
    cam_hammaddesi_id,
    cita_id,
    sarf_malzeme_id,
    tedarikci_id,
    birim_fiyat,
    para_birimi,
    vade_gunu,
    gecerli_baslangic,
    aciklama,
    idempotency_id,
    olusturan_kullanici_id
  )
  VALUES (
    v_tur,
    CASE WHEN v_tur = 'cam' THEN v_malzeme_id END,
    CASE WHEN v_tur = 'cita' THEN v_malzeme_id END,
    CASE WHEN v_tur = 'sarf' THEN v_malzeme_id END,
    v_tedarikci_id,
    v_fiyat,
    v_para_birimi::public.para_birimi_kodu,
    v_vade,
    v_baslangic,
    NULLIF(btrim(p_payload ->> 'aciklama'), ''),
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_fiyat_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'alis_fiyati_id', v_fiyat_id,
    'malzeme_turu', v_tur,
    'malzeme_id', v_malzeme_id
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

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

CREATE OR REPLACE FUNCTION public.maliyet_urun_maliyetlerini_hesapla(
  p_tarih date DEFAULT NULL,
  p_en_mm numeric DEFAULT NULL,
  p_boy_mm numeric DEFAULT NULL
)
RETURNS jsonb
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
  v_ayar public.maliyet_hesaplama_ayar_surmleri%ROWTYPE;
  v_en numeric;
  v_boy numeric;
  v_alan numeric;
  v_cevre numeric;
  v_urunler jsonb;
  v_toplam integer;
  v_gecerli integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT ayar.*
  INTO v_ayar
  FROM public.maliyet_hesaplama_ayar_surmleri ayar
  WHERE ayar.gecerli_baslangic <= v_tarih
  ORDER BY ayar.gecerli_baslangic DESC, ayar.created_at DESC, ayar.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'gecerli', false,
      'hata_kodu', 'MALIYET_HESAPLAMA_AYARI_EKSIK',
      'hatalar', jsonb_build_array(
        jsonb_build_object(
          'kod', 'MALIYET_HESAPLAMA_AYARI_EKSIK',
          'mesaj', 'Yıllık finansman oranı ve referans ölçülerini tanımlayın.'
        )
      ),
      'urunler', '[]'::jsonb
    );
  END IF;

  v_en := COALESCE(p_en_mm, v_ayar.referans_en_mm);
  v_boy := COALESCE(p_boy_mm, v_ayar.referans_boy_mm);
  IF v_en <= 0 OR v_boy <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REFERANS_OLCUSU_GECERSIZ';
  END IF;
  v_alan := round((v_en / 1000) * (v_boy / 1000), 6);
  v_cevre := round(2 * ((v_en / 1000) + (v_boy / 1000)), 6);

  WITH guncel_fiyatlar AS (
    SELECT *
    FROM public.maliyet_guncel_alis_fiyatlari(v_tarih)
  ),
  fiyat_siralari AS (
    SELECT
      fiyat.*,
      row_number() OVER (
        PARTITION BY fiyat.malzeme_turu, fiyat.malzeme_id
        ORDER BY
          fiyat.faiz_dahil_birim_maliyet_try ASC NULLS LAST,
          fiyat.tedarikci_adi,
          fiyat.fiyat_id
      ) AS secim_sirasi
    FROM guncel_fiyatlar fiyat
  ),
  secilen_fiyatlar AS (
    SELECT *
    FROM fiyat_siralari
    WHERE secim_sirasi = 1
  ),
  urunler AS (
    SELECT
      stok.id,
      stok.kod,
      stok.ad,
      stok.grup,
      stok.katman_yapisi,
      regexp_split_to_array(stok.katman_yapisi, '\+') AS katmanlar,
      upper(stok.ad || ' ' || COALESCE(stok.grup, '')) AS arama_metni
    FROM public.stok
    WHERE stok.aktif
      AND stok.kategori = 'cam'
      AND stok.katman_yapisi IS NOT NULL
  ),
  urun_ozellikleri AS (
    SELECT
      urun.*,
      cardinality(urun.katmanlar) >= 3
        AND cardinality(urun.katmanlar) % 2 = 1
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(urun.katmanlar) AS katman(deger)
          WHERE katman.deger !~ '^[0-9]+([.][0-9]+)?$'
        ) AS katman_gecerli,
      GREATEST((cardinality(urun.katmanlar) - 1) / 2, 0) AS bosluk_sayisi,
      array_remove(
        ARRAY[
          CASE
            WHEN urun.arama_metni LIKE '%KONFOR%' THEN 'konfor'
            WHEN urun.arama_metni LIKE '%SINERJI%'
              OR urun.arama_metni LIKE '%ISICAM-S%' THEN 'sinerji'
          END,
          CASE
            WHEN urun.arama_metni LIKE '%BUZLU%' THEN 'buzlu'
            WHEN urun.arama_metni LIKE '%FUME%'
              OR urun.arama_metni LIKE '%FÜME%' THEN 'fume'
            WHEN urun.arama_metni LIKE '%BRONZ%' THEN 'bronz'
            WHEN urun.arama_metni LIKE '%REFLEKTE%' THEN 'reflekte'
            WHEN urun.arama_metni LIKE '%SATINA%' THEN 'satina'
            WHEN urun.arama_metni LIKE '%LAMINE%'
              OR urun.arama_metni LIKE '%LAMİNE%' THEN 'lamine'
          END
        ]::text[],
        NULL
      ) AS ozel_cam_turleri
    FROM urunler urun
  ),
  katmanlar AS (
    SELECT
      urun.id AS urun_id,
      urun.ozel_cam_turleri,
      katman.sira::integer AS katman_sirasi,
      katman.deger::numeric AS kalinlik_veya_genislik
    FROM urun_ozellikleri urun
    CROSS JOIN LATERAL unnest(urun.katmanlar)
      WITH ORDINALITY AS katman(deger, sira)
    WHERE urun.katman_gecerli
  ),
  cam_katmanlari AS (
    SELECT
      katman.*,
      ((katman.katman_sirasi + 1) / 2)::integer AS cam_sirasi,
      COALESCE(
        katman.ozel_cam_turleri[
          ((katman.katman_sirasi + 1) / 2)::integer
        ],
        'duz'
      ) AS gereken_cam_turu
    FROM katmanlar katman
    WHERE katman.katman_sirasi % 2 = 1
  ),
  cam_bilesenleri AS (
    SELECT
      katman.urun_id,
      'cam'::text AS bilesen_turu,
      COALESCE(
        hammadde.kalinlik_mm::text || ' mm '
          || public.maliyet_cam_turu_etiketi(
            hammadde.cam_turu,
            hammadde.ozel_tur_adi
          ),
        katman.kalinlik_veya_genislik::text || ' mm '
          || public.maliyet_cam_turu_etiketi(katman.gereken_cam_turu)
      ) AS bilesen_adi,
      round(v_alan * (1 + v_ayar.cam_fire_orani / 100), 8) AS miktar,
      'm2'::text AS birim,
      fiyat.tedarikci_adi,
      fiyat.baz_birim_maliyet_try,
      fiyat.finansman_birim_etkisi_try,
      fiyat.faiz_dahil_birim_maliyet_try,
      round(
        fiyat.baz_birim_maliyet_try
          * v_alan * (1 + v_ayar.cam_fire_orani / 100),
        6
      ) AS baz_maliyet,
      round(
        fiyat.finansman_birim_etkisi_try
          * v_alan * (1 + v_ayar.cam_fire_orani / 100),
        6
      ) AS finansman_etkisi,
      round(
        fiyat.faiz_dahil_birim_maliyet_try
          * v_alan * (1 + v_ayar.cam_fire_orani / 100),
        6
      ) AS toplam_maliyet,
      CASE
        WHEN hammadde.id IS NULL THEN 'CAM_TANIMI_EKSIK'
        WHEN fiyat.fiyat_id IS NULL THEN 'CAM_ALIS_FIYATI_EKSIK'
        WHEN fiyat.ayar_eksik THEN 'FINANSMAN_AYARI_EKSIK'
        WHEN fiyat.kur_eksik THEN 'KUR_EKSIK'
      END AS eksik_kodu
    FROM cam_katmanlari katman
    LEFT JOIN LATERAL (
      SELECT cam.*
      FROM public.maliyet_cam_hammaddeleri cam
      WHERE cam.aktif
        AND cam.kalinlik_mm = katman.kalinlik_veya_genislik
        AND cam.cam_turu = katman.gereken_cam_turu
      ORDER BY cam.created_at, cam.id
      LIMIT 1
    ) hammadde ON true
    LEFT JOIN secilen_fiyatlar fiyat
      ON fiyat.malzeme_turu = 'cam'
      AND fiyat.malzeme_id = hammadde.id
  ),
  cita_katmanlari AS (
    SELECT *
    FROM katmanlar
    WHERE katman_sirasi % 2 = 0
  ),
  cita_bilesenleri AS (
    SELECT
      katman.urun_id,
      'cita'::text AS bilesen_turu,
      COALESCE(
        cita.genislik_mm::text || ' mm '
          || public.maliyet_cita_turu_etiketi(
            cita.malzeme_turu,
            cita.ozel_malzeme_adi
          ) || ' Çıta',
        katman.kalinlik_veya_genislik::text || ' mm Çıta'
      ) AS bilesen_adi,
      round(v_cevre * (1 + v_ayar.cita_fire_orani / 100), 8) AS miktar,
      'metre'::text AS birim,
      fiyat.tedarikci_adi,
      fiyat.baz_birim_maliyet_try,
      fiyat.finansman_birim_etkisi_try,
      fiyat.faiz_dahil_birim_maliyet_try,
      round(
        fiyat.baz_birim_maliyet_try
          * v_cevre * (1 + v_ayar.cita_fire_orani / 100),
        6
      ) AS baz_maliyet,
      round(
        fiyat.finansman_birim_etkisi_try
          * v_cevre * (1 + v_ayar.cita_fire_orani / 100),
        6
      ) AS finansman_etkisi,
      round(
        fiyat.faiz_dahil_birim_maliyet_try
          * v_cevre * (1 + v_ayar.cita_fire_orani / 100),
        6
      ) AS toplam_maliyet,
      CASE
        WHEN cita.id IS NULL THEN 'CITA_TANIMI_EKSIK'
        WHEN fiyat.fiyat_id IS NULL THEN 'CITA_ALIS_FIYATI_EKSIK'
        WHEN fiyat.ayar_eksik THEN 'FINANSMAN_AYARI_EKSIK'
        WHEN fiyat.kur_eksik THEN 'KUR_EKSIK'
      END AS eksik_kodu
    FROM cita_katmanlari katman
    LEFT JOIN LATERAL (
      SELECT cita_satiri.*
      FROM public.maliyet_citalari cita_satiri
      WHERE cita_satiri.aktif
        AND cita_satiri.genislik_mm = katman.kalinlik_veya_genislik
      ORDER BY
        CASE cita_satiri.malzeme_turu
          WHEN 'aluminyum' THEN 0
          ELSE 1
        END,
        cita_satiri.created_at,
        cita_satiri.id
      LIMIT 1
    ) cita ON true
    LEFT JOIN secilen_fiyatlar fiyat
      ON fiyat.malzeme_turu = 'cita'
      AND fiyat.malzeme_id = cita.id
  ),
  guncel_sarf_katsayilari AS (
    SELECT DISTINCT ON (sarf.id)
      sarf.id AS sarf_malzeme_id,
      sarf.ad,
      sarf.alis_birimi,
      katsayi.hesaplama_tipi,
      katsayi.tuketim_katsayisi,
      katsayi.bosluk_basi,
      katsayi.fire_orani
    FROM public.maliyet_sarf_malzemeleri sarf
    LEFT JOIN public.maliyet_sarf_katsayi_surmleri katsayi
      ON katsayi.sarf_malzeme_id = sarf.id
      AND katsayi.gecerli_baslangic <= v_tarih
    WHERE sarf.aktif
    ORDER BY
      sarf.id,
      katsayi.gecerli_baslangic DESC NULLS LAST,
      katsayi.created_at DESC NULLS LAST,
      katsayi.id DESC NULLS LAST
  ),
  sarf_bilesenleri AS (
    SELECT
      urun.id AS urun_id,
      'sarf'::text AS bilesen_turu,
      sarf.ad AS bilesen_adi,
      round(
        CASE sarf.hesaplama_tipi
          WHEN 'cevre_m' THEN sarf.tuketim_katsayisi * v_cevre
          WHEN 'm2' THEN sarf.tuketim_katsayisi * v_alan
          WHEN 'adet' THEN sarf.tuketim_katsayisi
          WHEN 'sabit' THEN sarf.tuketim_katsayisi
        END
        * CASE
            WHEN sarf.bosluk_basi THEN GREATEST(urun.bosluk_sayisi, 1)
            ELSE 1
          END
        * (1 + sarf.fire_orani / 100),
        8
      ) AS miktar,
      sarf.alis_birimi AS birim,
      fiyat.tedarikci_adi,
      fiyat.baz_birim_maliyet_try,
      fiyat.finansman_birim_etkisi_try,
      fiyat.faiz_dahil_birim_maliyet_try,
      round(
        fiyat.baz_birim_maliyet_try
        * CASE sarf.hesaplama_tipi
            WHEN 'cevre_m' THEN sarf.tuketim_katsayisi * v_cevre
            WHEN 'm2' THEN sarf.tuketim_katsayisi * v_alan
            WHEN 'adet' THEN sarf.tuketim_katsayisi
            WHEN 'sabit' THEN sarf.tuketim_katsayisi
          END
        * CASE
            WHEN sarf.bosluk_basi THEN GREATEST(urun.bosluk_sayisi, 1)
            ELSE 1
          END
        * (1 + sarf.fire_orani / 100),
        6
      ) AS baz_maliyet,
      round(
        fiyat.finansman_birim_etkisi_try
        * CASE sarf.hesaplama_tipi
            WHEN 'cevre_m' THEN sarf.tuketim_katsayisi * v_cevre
            WHEN 'm2' THEN sarf.tuketim_katsayisi * v_alan
            WHEN 'adet' THEN sarf.tuketim_katsayisi
            WHEN 'sabit' THEN sarf.tuketim_katsayisi
          END
        * CASE
            WHEN sarf.bosluk_basi THEN GREATEST(urun.bosluk_sayisi, 1)
            ELSE 1
          END
        * (1 + sarf.fire_orani / 100),
        6
      ) AS finansman_etkisi,
      round(
        fiyat.faiz_dahil_birim_maliyet_try
        * CASE sarf.hesaplama_tipi
            WHEN 'cevre_m' THEN sarf.tuketim_katsayisi * v_cevre
            WHEN 'm2' THEN sarf.tuketim_katsayisi * v_alan
            WHEN 'adet' THEN sarf.tuketim_katsayisi
            WHEN 'sabit' THEN sarf.tuketim_katsayisi
          END
        * CASE
            WHEN sarf.bosluk_basi THEN GREATEST(urun.bosluk_sayisi, 1)
            ELSE 1
          END
        * (1 + sarf.fire_orani / 100),
        6
      ) AS toplam_maliyet,
      CASE
        WHEN sarf.hesaplama_tipi IS NULL THEN 'SARF_KATSAYISI_EKSIK'
        WHEN fiyat.fiyat_id IS NULL THEN 'SARF_ALIS_FIYATI_EKSIK'
        WHEN fiyat.ayar_eksik THEN 'FINANSMAN_AYARI_EKSIK'
        WHEN fiyat.kur_eksik THEN 'KUR_EKSIK'
      END AS eksik_kodu
    FROM urun_ozellikleri urun
    CROSS JOIN guncel_sarf_katsayilari sarf
    LEFT JOIN secilen_fiyatlar fiyat
      ON fiyat.malzeme_turu = 'sarf'
      AND fiyat.malzeme_id = sarf.sarf_malzeme_id
  ),
  tum_bilesenler AS (
    SELECT * FROM cam_bilesenleri
    UNION ALL
    SELECT * FROM cita_bilesenleri
    UNION ALL
    SELECT * FROM sarf_bilesenleri
  ),
  urun_sonuclari AS (
    SELECT
      urun.id,
      urun.kod,
      urun.ad,
      urun.grup,
      urun.katman_yapisi,
      urun.katman_gecerli,
      urun.katman_gecerli
        AND NOT EXISTS (
          SELECT 1
          FROM tum_bilesenler bilesen
          WHERE bilesen.urun_id = urun.id
            AND bilesen.eksik_kodu IS NOT NULL
        ) AS gecerli,
      COALESCE((
        SELECT round(sum(bilesen.baz_maliyet), 2)
        FROM tum_bilesenler bilesen
        WHERE bilesen.urun_id = urun.id
      ), 0) AS baz_maliyet,
      COALESCE((
        SELECT round(sum(bilesen.finansman_etkisi), 2)
        FROM tum_bilesenler bilesen
        WHERE bilesen.urun_id = urun.id
      ), 0) AS finansman_etkisi,
      COALESCE((
        SELECT round(sum(bilesen.toplam_maliyet), 2)
        FROM tum_bilesenler bilesen
        WHERE bilesen.urun_id = urun.id
      ), 0) AS toplam_maliyet,
      COALESCE((
        SELECT round(sum(bilesen.toplam_maliyet), 2)
        FROM tum_bilesenler bilesen
        WHERE bilesen.urun_id = urun.id
          AND bilesen.bilesen_turu = 'cam'
      ), 0) AS cam_maliyeti,
      COALESCE((
        SELECT round(sum(bilesen.toplam_maliyet), 2)
        FROM tum_bilesenler bilesen
        WHERE bilesen.urun_id = urun.id
          AND bilesen.bilesen_turu = 'cita'
      ), 0) AS cita_maliyeti,
      COALESCE((
        SELECT round(sum(bilesen.toplam_maliyet), 2)
        FROM tum_bilesenler bilesen
        WHERE bilesen.urun_id = urun.id
          AND bilesen.bilesen_turu = 'sarf'
      ), 0) AS sarf_maliyeti,
      (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'tur', bilesen.bilesen_turu,
              'ad', bilesen.bilesen_adi,
              'miktar', bilesen.miktar,
              'birim', bilesen.birim,
              'tedarikci', bilesen.tedarikci_adi,
              'baz_birim_maliyet', bilesen.baz_birim_maliyet_try,
              'finansman_birim_etkisi', bilesen.finansman_birim_etkisi_try,
              'faiz_dahil_birim_maliyet', bilesen.faiz_dahil_birim_maliyet_try,
              'baz_maliyet', bilesen.baz_maliyet,
              'finansman_etkisi', bilesen.finansman_etkisi,
              'toplam_maliyet', bilesen.toplam_maliyet,
              'eksik_kodu', bilesen.eksik_kodu
            )
            ORDER BY
              CASE bilesen.bilesen_turu
                WHEN 'cam' THEN 1
                WHEN 'cita' THEN 2
                ELSE 3
              END,
              bilesen.bilesen_adi
          ),
          '[]'::jsonb
        )
        FROM tum_bilesenler bilesen
        WHERE bilesen.urun_id = urun.id
      ) AS bilesenler,
      (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'kod', eksik.kod,
              'bilesen', eksik.bilesen
            )
            ORDER BY eksik.kod, eksik.bilesen
          ),
          '[]'::jsonb
        )
        FROM (
          SELECT DISTINCT
            bilesen.eksik_kodu AS kod,
            bilesen.bilesen_adi AS bilesen
          FROM tum_bilesenler bilesen
          WHERE bilesen.urun_id = urun.id
            AND bilesen.eksik_kodu IS NOT NULL
          UNION
          SELECT
            'KATMAN_YAPISI_DESTEKLENMIYOR',
            urun.katman_yapisi
          WHERE NOT urun.katman_gecerli
        ) eksik
      ) AS eksikler
    FROM urun_ozellikleri urun
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'stok_id', sonuc.id,
        'stok_kodu', sonuc.kod,
        'urun_adi', sonuc.ad,
        'urun_grubu', sonuc.grup,
        'katman_yapisi', sonuc.katman_yapisi,
        'gecerli', sonuc.gecerli,
        'baz_maliyet', sonuc.baz_maliyet,
        'finansman_etkisi', sonuc.finansman_etkisi,
        'toplam_maliyet', sonuc.toplam_maliyet,
        'm2_maliyet', CASE
          WHEN v_alan > 0 THEN round(sonuc.toplam_maliyet / v_alan, 2)
          ELSE 0
        END,
        'cam_maliyeti', sonuc.cam_maliyeti,
        'cita_maliyeti', sonuc.cita_maliyeti,
        'sarf_maliyeti', sonuc.sarf_maliyeti,
        'bilesenler', sonuc.bilesenler,
        'eksikler', sonuc.eksikler
      )
      ORDER BY sonuc.ad, sonuc.id
    ),
    '[]'::jsonb
  )
  INTO v_urunler
  FROM urun_sonuclari sonuc;

  v_toplam := jsonb_array_length(v_urunler);
  SELECT count(*)
  INTO v_gecerli
  FROM jsonb_array_elements(v_urunler) urun
  WHERE COALESCE((urun ->> 'gecerli')::boolean, false);

  RETURN jsonb_build_object(
    'gecerli', true,
    'hesaplama_surumu', 'sade-maliyet-v1',
    'hesaplama_tarihi', v_tarih,
    'para_birimi', 'TRY',
    'referans_en_mm', v_en,
    'referans_boy_mm', v_boy,
    'referans_alan_m2', v_alan,
    'referans_cevre_m', v_cevre,
    'yillik_finansman_orani', v_ayar.yillik_finansman_orani,
    'cam_fire_orani', v_ayar.cam_fire_orani,
    'cita_fire_orani', v_ayar.cita_fire_orani,
    'finansman_formulu', 'fiyat × yıllık oran × vade günü / 365',
    'urun_sayisi', v_toplam,
    'gecerli_urun_sayisi', v_gecerli,
    'eksik_urun_sayisi', v_toplam - v_gecerli,
    'urunler', v_urunler
  );
END;
$$;

DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'maliyet_cam_turu_etiketi(text, text)',
    'maliyet_cita_turu_etiketi(text, text)',
    'maliyet_malzeme_kaydet(jsonb, text)',
    'maliyet_sarf_katsayisi_kaydet(uuid, jsonb, text)',
    'maliyet_hesaplama_ayari_kaydet(jsonb, text)',
    'maliyet_alis_fiyati_kaydet(jsonb, text)',
    'maliyet_guncel_alis_fiyatlari(date)',
    'maliyet_urun_maliyetlerini_hesapla(date, numeric, numeric)'
  ] LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon',
      v_signature
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.maliyet_malzeme_kaydet(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.maliyet_sarf_katsayisi_kaydet(uuid, jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.maliyet_hesaplama_ayari_kaydet(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.maliyet_alis_fiyati_kaydet(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.maliyet_guncel_alis_fiyatlari(date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.maliyet_urun_maliyetlerini_hesapla(
  date,
  numeric,
  numeric
) TO authenticated;

COMMENT ON FUNCTION public.maliyet_urun_maliyetlerini_hesapla(
  date,
  numeric,
  numeric
) IS
  'Ürün katman yapısını cam/çıta/sarf bileşenlerine ayırır, en düşük faiz dahil güncel tedarikçi maliyetini seçer ve referans ölçü için PostgreSQL NUMERIC sonucu üretir.';
