-- 076 - PostgreSQL kanonik fiyatlandırma motoru
-- Bütün parasal sonuçlar NUMERIC ile hesaplanır. İstemci önizlemesi otorite değildir.

CREATE OR REPLACE FUNCTION public.ticari_guvenli_numeric(p_deger text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_deger IS NULL OR btrim(p_deger) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_deger::numeric;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_guvenli_integer(p_deger text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_deger IS NULL OR btrim(p_deger) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_deger::integer;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_guvenli_uuid(p_deger text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_deger IS NULL OR btrim(p_deger) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_deger::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_kur_katsayisi(
  p_kurlar jsonb,
  p_kaynak public.para_birimi_kodu,
  p_hedef public.para_birimi_kodu
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kaynak_try numeric;
  v_hedef_try numeric;
BEGIN
  v_kaynak_try := CASE
    WHEN p_kaynak = 'TRY' THEN 1
    ELSE public.ticari_guvenli_numeric(p_kurlar -> p_kaynak::text ->> 'try_karsiligi')
  END;
  v_hedef_try := CASE
    WHEN p_hedef = 'TRY' THEN 1
    ELSE public.ticari_guvenli_numeric(p_kurlar -> p_hedef::text ->> 'try_karsiligi')
  END;

  IF v_kaynak_try IS NULL OR v_kaynak_try <= 0
     OR v_hedef_try IS NULL OR v_hedef_try <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN v_kaynak_try / v_hedef_try;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_recete_surumu_coz(
  p_stok_id uuid,
  p_tarih date,
  p_sabit_baglam jsonb DEFAULT NULL
)
RETURNS TABLE (
  recete_id uuid,
  recete_surumu_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH baglam AS (
    SELECT
      public.ticari_guvenli_uuid(kalem.value ->> 'recete_id') AS recete_id,
      public.ticari_guvenli_uuid(kalem.value ->> 'recete_surumu_id') AS recete_surumu_id
    FROM jsonb_array_elements(
      COALESCE(p_sabit_baglam -> 'recete_surumu_ids', '[]'::jsonb)
    ) kalem(value)
    WHERE public.ticari_guvenli_uuid(kalem.value ->> 'stok_id') = p_stok_id
    LIMIT 1
  )
  SELECT recete.id, surum.id
  FROM public.urun_maliyet_receteleri recete
  JOIN public.urun_maliyet_recete_surmleri surum
    ON surum.urun_maliyet_recetesi_id = recete.id
  LEFT JOIN baglam ON true
  WHERE recete.stok_id = p_stok_id
    AND (baglam.recete_surumu_id IS NOT NULL OR recete.aktif)
    AND (
      (
        baglam.recete_surumu_id IS NOT NULL
        AND surum.id = baglam.recete_surumu_id
        AND recete.id = baglam.recete_id
      )
      OR
      (
        baglam.recete_surumu_id IS NULL
        AND surum.gecerli_baslangic <= p_tarih
        AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= p_tarih)
        AND (
          (p_sabit_baglam IS NULL AND surum.durum = 'yayinda')
          OR
          (p_sabit_baglam IS NOT NULL AND surum.durum IN ('yayinda', 'arsiv'))
        )
      )
    )
  ORDER BY
    CASE WHEN baglam.recete_surumu_id IS NOT NULL THEN 0 ELSE 1 END,
    surum.gecerli_baslangic DESC,
    surum.surum_no DESC,
    surum.id DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.ticari_kdv_surumu_coz(
  p_kdv_grubu_id uuid,
  p_tarih date,
  p_sabit_baglam jsonb DEFAULT NULL
)
RETURNS SETOF public.kdv_grup_surmleri
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH baglam AS (
    SELECT public.ticari_guvenli_uuid(
      kalem.value ->> 'kdv_grup_surumu_id'
    ) AS kdv_grup_surumu_id
    FROM jsonb_array_elements(
      COALESCE(p_sabit_baglam -> 'kdv_grup_surumu_ids', '[]'::jsonb)
    ) kalem(value)
    WHERE public.ticari_guvenli_uuid(kalem.value ->> 'kdv_grubu_id') = p_kdv_grubu_id
    LIMIT 1
  )
  SELECT surum.*
  FROM public.kdv_grup_surmleri surum
  LEFT JOIN baglam ON true
  WHERE surum.kdv_grubu_id = p_kdv_grubu_id
    AND (
      (
        baglam.kdv_grup_surumu_id IS NOT NULL
        AND surum.id = baglam.kdv_grup_surumu_id
      )
      OR
      (
        baglam.kdv_grup_surumu_id IS NULL
        AND surum.gecerli_baslangic <= p_tarih
        AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= p_tarih)
        AND (
          (p_sabit_baglam IS NULL AND surum.durum = 'yayinda')
          OR
          (p_sabit_baglam IS NOT NULL AND surum.durum IN ('yayinda', 'arsiv'))
        )
      )
    )
  ORDER BY
    CASE WHEN baglam.kdv_grup_surumu_id IS NOT NULL THEN 0 ELSE 1 END,
    surum.gecerli_baslangic DESC,
    surum.surum_no DESC,
    surum.id DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.ticari_fiyat_sonucunu_maskele(p_sonuc jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT
    (p_sonuc
      - 'tahmini_maliyet'
      - 'tahmini_kar'
      - 'marj_yuzdesi'
      - 'minimum_marj_yuzdesi'
      - 'dusuk_marj')
    || jsonb_build_object(
      'satirlar',
      COALESCE((
        SELECT jsonb_agg(
          value
            - 'tahmini_maliyet'
            - 'tahmini_kar'
            - 'marj_yuzdesi'
        )
        FROM jsonb_array_elements(COALESCE(p_sonuc -> 'satirlar', '[]'::jsonb))
      ), '[]'::jsonb),
      'bilesenler',
      COALESCE((
        SELECT jsonb_agg(value - 'tahmini_maliyet')
        FROM jsonb_array_elements(COALESCE(p_sonuc -> 'bilesenler', '[]'::jsonb))
      ), '[]'::jsonb)
    )
$$;

CREATE OR REPLACE FUNCTION public.fiyat_hesapla_internal(
  p_belge jsonb,
  p_sabit_baglam jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_hesaplama_surumu constant text := 'ortaklar-pricing-v1';
  v_cari_id uuid := public.ticari_guvenli_uuid(p_belge ->> 'cari_id');
  v_tarih date;
  v_kur_tipi public.doviz_kur_tipi;
  v_para_birimi public.para_birimi_kodu;
  v_istenen_para_birimi public.para_birimi_kodu;
  v_baglam_tarih date;
  v_baglam_kur_tipi public.doviz_kur_tipi;
  v_baglam_para_birimi public.para_birimi_kodu;
  v_profil_surumu_id uuid;
  v_ana_fiyat_surumu_id uuid;
  v_musteri_fiyat_surumu_id uuid;
  v_maliyet_surumu_id uuid;
  v_vade_surumu_id uuid;
  v_varsayilan_vade_gunu integer;
  v_minimum_marj numeric;
  v_profil_snapshot jsonb;
  v_kurlar jsonb := '{}'::jsonb;
  v_baglam jsonb;
  v_baglam_hash text;
  v_girdi_hash text;
  v_sonuc_hash text;
  v_sonuc jsonb;
  v_belge_iskonto numeric := 0;
  v_manuel_fark numeric := 0;
  v_manuel_yuvarlama numeric := 0;
  v_vade_gunu integer;
  v_vade_yuzdesi numeric := 0;
  v_hesaplama_yuvarlama_farki numeric := 0;
  v_kdv_haric numeric := 0;
  v_kdv numeric := 0;
  v_genel numeric := 0;
  v_maliyet numeric := 0;
  v_kar numeric := 0;
  v_marj numeric;
  v_dusuk_marj boolean := false;
  v_gecerli boolean := true;
  v_satir_sayisi integer := 0;
  v_kayit record;
BEGIN
  IF p_belge IS NULL OR jsonb_typeof(p_belge) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FIYAT_GIRDISI_GECERSIZ';
  END IF;

  BEGIN
    v_tarih := COALESCE(
      NULLIF(p_belge ->> 'tarih', '')::date,
      (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
    );
  EXCEPTION WHEN invalid_datetime_format THEN
    RAISE EXCEPTION USING ERRCODE = '22007', MESSAGE = 'BELGE_TARIHI_GECERSIZ';
  END;

  BEGIN
    v_kur_tipi := COALESCE(
      NULLIF(p_belge ->> 'kur_tipi', '')::public.doviz_kur_tipi,
      'doviz_satis'::public.doviz_kur_tipi
    );
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'KUR_TIPI_GECERSIZ';
  END;

  DROP TABLE IF EXISTS pg_temp.ticari_hatalar;
  DROP TABLE IF EXISTS pg_temp.ticari_girdi_satirlari;
  DROP TABLE IF EXISTS pg_temp.ticari_satir_hesaplari;
  DROP TABLE IF EXISTS pg_temp.ticari_bilesenler;

  CREATE TEMP TABLE ticari_hatalar (
    kod text NOT NULL,
    satir_no integer,
    detay jsonb NOT NULL DEFAULT '{}'::jsonb
  ) ON COMMIT DROP;
  CREATE TEMP TABLE ticari_girdi_satirlari (
    satir_no integer PRIMARY KEY,
    detay_id uuid,
    stok_id uuid,
    genislik_mm numeric,
    yukseklik_mm numeric,
    adet integer,
    cita_stok_id uuid,
    kenar_islemi text,
    kenar_islemi_ucretsiz boolean,
    menfez_turu text,
    menfez_cap_mm numeric,
    menfez_ucretsiz boolean,
    kucuk_cam boolean,
    kucuk_cam_ucretsiz boolean,
    satir_iskonto_yuzdesi numeric,
    satir_iskonto_tutari numeric,
    notlar text,
    poz text,
    diger_kalemler jsonb
  ) ON COMMIT DROP;
  CREATE TEMP TABLE ticari_satir_hesaplari (
    satir_no integer PRIMARY KEY,
    detay_id uuid,
    stok_id uuid,
    stok_grubu text,
    recete_id uuid,
    recete_surumu_id uuid,
    kdv_grubu_id uuid,
    kdv_grup_surumu_id uuid,
    kdv_orani numeric,
    genislik_mm numeric,
    yukseklik_mm numeric,
    yuvarlanmis_genislik_mm numeric,
    yuvarlanmis_yukseklik_mm numeric,
    adet integer,
    tek_parca_m2 numeric,
    faturalanabilir_m2 numeric,
    cevre_m numeric,
    birim_fiyat numeric,
    urun_tutari numeric,
    tahmini_maliyet numeric DEFAULT 0,
    fiyat_kaynagi_id uuid,
    fiyat_kaynagi_para_birimi public.para_birimi_kodu
  ) ON COMMIT DROP;
  CREATE TEMP TABLE ticari_bilesenler (
    gecici_id bigint GENERATED ALWAYS AS IDENTITY,
    satir_no integer,
    bilesen_turu text NOT NULL,
    kaynak_turu text,
    kaynak_id uuid,
    hesaplama_birimi public.hesaplama_birimi NOT NULL,
    miktar numeric NOT NULL,
    birim_fiyat numeric,
    liste_tutari numeric NOT NULL,
    iskonto_tutari numeric NOT NULL DEFAULT 0,
    override_tutari numeric,
    fark_tutari numeric NOT NULL DEFAULT 0,
    net_tutar numeric NOT NULL,
    tahmini_maliyet numeric NOT NULL DEFAULT 0,
    para_birimi public.para_birimi_kodu NOT NULL,
    kdv_grubu_id uuid,
    kdv_grup_surumu_id uuid,
    kdv_orani numeric,
    ucretsiz boolean NOT NULL DEFAULT false,
    sira_no integer NOT NULL DEFAULT 1,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
  ) ON COMMIT DROP;

  IF v_cari_id IS NULL THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES ('CARI_GECERSIZ', jsonb_build_object('alan', 'cari_id'));
  END IF;

  IF p_sabit_baglam IS NULL THEN
    SELECT
      profil_surumu.id,
      profil_surumu.varsayilan_para_birimi,
      profil_surumu.varsayilan_vade_gunu,
      profil_surumu.minimum_marj_yuzdesi_override,
      to_jsonb(profil_surumu)
    INTO
      v_profil_surumu_id,
      v_para_birimi,
      v_varsayilan_vade_gunu,
      v_minimum_marj,
      v_profil_snapshot
    FROM public.musteri_ticari_profilleri profil
    JOIN public.musteri_ticari_profil_surmleri profil_surumu
      ON profil_surumu.musteri_ticari_profili_id = profil.id
    WHERE profil.cari_id = v_cari_id
      AND profil.aktif
      AND profil_surumu.durum = 'yayinda'
      AND profil_surumu.gecerli_baslangic <= v_tarih
      AND (profil_surumu.gecerli_bitis IS NULL OR profil_surumu.gecerli_bitis >= v_tarih)
    LIMIT 1;

    IF v_profil_surumu_id IS NULL THEN
      INSERT INTO pg_temp.ticari_hatalar(kod, detay)
      VALUES ('EKSIK_MUSTERI_TICARI_PROFILI', jsonb_build_object('cari_id', v_cari_id, 'tarih', v_tarih));
    ELSE
      SELECT surum.id
      INTO v_ana_fiyat_surumu_id
      FROM public.musteri_ticari_profil_surmleri profil_surumu
      JOIN public.fiyat_listesi_surmleri surum
        ON surum.fiyat_listesi_id = profil_surumu.ana_fiyat_listesi_id
      WHERE profil_surumu.id = v_profil_surumu_id
        AND surum.durum = 'yayinda'
        AND surum.gecerli_baslangic <= v_tarih
        AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= v_tarih)
      LIMIT 1;

      SELECT surum.id
      INTO v_musteri_fiyat_surumu_id
      FROM public.musteri_ticari_profil_surmleri profil_surumu
      JOIN public.fiyat_listesi_surmleri surum
        ON surum.fiyat_listesi_id = profil_surumu.musteri_fiyat_listesi_id
      WHERE profil_surumu.id = v_profil_surumu_id
        AND profil_surumu.musteri_fiyat_listesi_id IS NOT NULL
        AND surum.durum = 'yayinda'
        AND surum.gecerli_baslangic <= v_tarih
        AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= v_tarih)
      LIMIT 1;

      SELECT COALESCE(
        profil_surumu.vade_profili_surumu_id,
        (
          SELECT vps.id
          FROM public.vade_profili_surmleri vps
          WHERE vps.vade_profili_id = profil_surumu.vade_profili_id
            AND vps.durum = 'yayinda'
            AND vps.gecerli_baslangic <= v_tarih
            AND (vps.gecerli_bitis IS NULL OR vps.gecerli_bitis >= v_tarih)
          LIMIT 1
        )
      )
      INTO v_vade_surumu_id
      FROM public.musteri_ticari_profil_surmleri profil_surumu
      WHERE profil_surumu.id = v_profil_surumu_id;
    END IF;

    SELECT mts.id
    INTO v_maliyet_surumu_id
    FROM public.maliyet_tarifeleri mt
    JOIN public.maliyet_tarife_surmleri mts ON mts.maliyet_tarifesi_id = mt.id
    WHERE mt.aktif
      AND mt.varsayilan
      AND mts.durum = 'yayinda'
      AND mts.gecerli_baslangic <= v_tarih
      AND (mts.gecerli_bitis IS NULL OR mts.gecerli_bitis >= v_tarih)
    LIMIT 1;
  ELSE
    v_profil_surumu_id := public.ticari_guvenli_uuid(p_sabit_baglam ->> 'musteri_ticari_profil_surumu_id');
    v_ana_fiyat_surumu_id := public.ticari_guvenli_uuid(p_sabit_baglam ->> 'ana_fiyat_listesi_surumu_id');
    v_musteri_fiyat_surumu_id := public.ticari_guvenli_uuid(p_sabit_baglam ->> 'musteri_fiyat_listesi_surumu_id');
    v_maliyet_surumu_id := public.ticari_guvenli_uuid(p_sabit_baglam ->> 'maliyet_tarife_surumu_id');
    v_vade_surumu_id := public.ticari_guvenli_uuid(p_sabit_baglam ->> 'vade_profili_surumu_id');
    v_kurlar := COALESCE(p_sabit_baglam -> 'kurlar', '{}'::jsonb);

    BEGIN
      v_baglam_tarih :=
        NULLIF(p_sabit_baglam ->> 'fiyatlandirma_tarihi', '')::date;
      v_baglam_kur_tipi :=
        NULLIF(p_sabit_baglam ->> 'kur_tipi', '')::public.doviz_kur_tipi;
      v_baglam_para_birimi :=
        NULLIF(p_sabit_baglam ->> 'para_birimi', '')::public.para_birimi_kodu;
    EXCEPTION
      WHEN invalid_datetime_format OR invalid_text_representation THEN
        INSERT INTO pg_temp.ticari_hatalar(kod, detay)
        VALUES (
          'SABIT_FIYAT_BAGLAMI_GECERSIZ',
          jsonb_build_object('alanlar', ARRAY['fiyatlandirma_tarihi', 'kur_tipi', 'para_birimi'])
        );
    END;

    IF v_baglam_tarih IS NULL
       OR v_baglam_kur_tipi IS NULL
       OR v_baglam_para_birimi IS NULL THEN
      INSERT INTO pg_temp.ticari_hatalar(kod, detay)
      VALUES (
        'SABIT_FIYAT_BAGLAMI_GECERSIZ',
        jsonb_build_object('neden', 'kimlik_alanlari_eksik')
      );
    ELSE
      IF NULLIF(p_belge ->> 'tarih', '') IS NOT NULL
         AND v_tarih IS DISTINCT FROM v_baglam_tarih THEN
        INSERT INTO pg_temp.ticari_hatalar(kod, detay)
        VALUES (
          'SABIT_FIYAT_BAGLAMI_CAKISMASI',
          jsonb_build_object(
            'alan', 'tarih',
            'beklenen', v_baglam_tarih,
            'gelen', v_tarih
          )
        );
      END IF;
      IF NULLIF(p_belge ->> 'kur_tipi', '') IS NOT NULL
         AND v_kur_tipi IS DISTINCT FROM v_baglam_kur_tipi THEN
        INSERT INTO pg_temp.ticari_hatalar(kod, detay)
        VALUES (
          'SABIT_FIYAT_BAGLAMI_CAKISMASI',
          jsonb_build_object(
            'alan', 'kur_tipi',
            'beklenen', v_baglam_kur_tipi,
            'gelen', v_kur_tipi
          )
        );
      END IF;
      v_tarih := v_baglam_tarih;
      v_kur_tipi := v_baglam_kur_tipi;
    END IF;

    SELECT
      profil_surumu.varsayilan_para_birimi,
      profil_surumu.varsayilan_vade_gunu,
      profil_surumu.minimum_marj_yuzdesi_override,
      to_jsonb(profil_surumu)
    INTO
      v_para_birimi,
      v_varsayilan_vade_gunu,
      v_minimum_marj,
      v_profil_snapshot
    FROM public.musteri_ticari_profil_surmleri profil_surumu
    WHERE profil_surumu.id = v_profil_surumu_id;
  END IF;

  BEGIN
    v_istenen_para_birimi :=
      NULLIF(p_belge ->> 'para_birimi', '')::public.para_birimi_kodu;
  EXCEPTION WHEN invalid_text_representation THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES ('PARA_BIRIMI_GECERSIZ', jsonb_build_object('deger', p_belge ->> 'para_birimi'));
  END;

  IF p_sabit_baglam IS NULL THEN
    v_para_birimi := COALESCE(v_istenen_para_birimi, v_para_birimi);
  ELSIF v_baglam_para_birimi IS NOT NULL THEN
    IF v_istenen_para_birimi IS NOT NULL
       AND v_istenen_para_birimi IS DISTINCT FROM v_baglam_para_birimi THEN
      INSERT INTO pg_temp.ticari_hatalar(kod, detay)
      VALUES (
        'SABIT_FIYAT_BAGLAMI_CAKISMASI',
        jsonb_build_object(
          'alan', 'para_birimi',
          'beklenen', v_baglam_para_birimi,
          'gelen', v_istenen_para_birimi
        )
      );
    END IF;
    v_para_birimi := v_baglam_para_birimi;
  END IF;

  IF v_ana_fiyat_surumu_id IS NULL THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES ('YAYINDA_FIYAT_LISTESI_YOK', jsonb_build_object('tarih', v_tarih));
  END IF;
  IF v_maliyet_surumu_id IS NULL THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES ('YAYINDA_MALIYET_TARIFESI_YOK', jsonb_build_object('tarih', v_tarih));
  END IF;
  IF v_para_birimi IS NULL THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES ('PARA_BIRIMI_GECERSIZ', '{}'::jsonb);
    v_para_birimi := 'TRY';
  END IF;

  IF p_sabit_baglam IS NULL THEN
    v_kurlar := jsonb_build_object(
      'TRY', jsonb_build_object(
        'doviz_kuru_id', NULL,
        'para_birimi', 'TRY',
        'kur_tarihi', v_tarih,
        'tcmb_kaynak_tarihi', v_tarih,
        'kur_tipi', v_kur_tipi,
        'try_karsiligi', 1,
        'kaynak', 'otomatik'
      )
    );

    FOR v_kayit IN
      SELECT DISTINCT ON (dk.para_birimi)
        dk.id,
        dk.para_birimi,
        dk.kur_tarihi,
        dk.tcmb_kaynak_tarihi,
        dk.kur_tipi,
        dk.try_karsiligi,
        dk.kaynak,
        dk.manuel_gerekce,
        dk.revision_no
      FROM public.doviz_kurlari dk
      WHERE dk.kur_tarihi = v_tarih
        AND dk.para_birimi IN ('USD', 'EUR')
        AND dk.kur_tipi = v_kur_tipi
        AND dk.aktif
      ORDER BY dk.para_birimi, dk.revision_no DESC
    LOOP
      v_kurlar := v_kurlar || jsonb_build_object(
        v_kayit.para_birimi::text,
        jsonb_build_object(
          'doviz_kuru_id', v_kayit.id,
          'para_birimi', v_kayit.para_birimi,
          'kur_tarihi', v_kayit.kur_tarihi,
          'tcmb_kaynak_tarihi', v_kayit.tcmb_kaynak_tarihi,
          'kur_tipi', v_kayit.kur_tipi,
          'try_karsiligi', v_kayit.try_karsiligi,
          'kaynak', v_kayit.kaynak,
          'manuel_gerekce', v_kayit.manuel_gerekce,
          'revision_no', v_kayit.revision_no
        )
      );
    END LOOP;
  END IF;

  INSERT INTO pg_temp.ticari_girdi_satirlari (
    satir_no,
    detay_id,
    stok_id,
    genislik_mm,
    yukseklik_mm,
    adet,
    cita_stok_id,
    kenar_islemi,
    kenar_islemi_ucretsiz,
    menfez_turu,
    menfez_cap_mm,
    menfez_ucretsiz,
    kucuk_cam,
    kucuk_cam_ucretsiz,
    satir_iskonto_yuzdesi,
    satir_iskonto_tutari,
    notlar,
    poz,
    diger_kalemler
  )
  SELECT
    ordinality::integer,
    public.ticari_guvenli_uuid(satir ->> 'detay_id'),
    public.ticari_guvenli_uuid(satir ->> 'stok_id'),
    public.ticari_guvenli_numeric(satir ->> 'genislik_mm'),
    public.ticari_guvenli_numeric(satir ->> 'yukseklik_mm'),
    public.ticari_guvenli_integer(satir ->> 'adet'),
    public.ticari_guvenli_uuid(satir ->> 'cita_stok_id'),
    NULLIF(btrim(satir ->> 'kenar_islemi'), ''),
    COALESCE((satir ->> 'kenar_islemi_ucretsiz')::boolean, false),
    COALESCE(NULLIF(btrim(satir ->> 'menfez_turu'), ''), 'standart'),
    public.ticari_guvenli_numeric(satir ->> 'menfez_cap_mm'),
    COALESCE((satir ->> 'menfez_ucretsiz')::boolean, false),
    COALESCE((satir ->> 'kucuk_cam')::boolean, false),
    COALESCE((satir ->> 'kucuk_cam_ucretsiz')::boolean, false),
    public.ticari_guvenli_numeric(satir ->> 'satir_iskonto_yuzdesi'),
    public.ticari_guvenli_numeric(satir ->> 'satir_iskonto_tutari'),
    NULLIF(satir ->> 'notlar', ''),
    NULLIF(satir ->> 'poz', ''),
    CASE
      WHEN jsonb_typeof(satir -> 'diger_kalemler') = 'array' THEN satir -> 'diger_kalemler'
      ELSE '[]'::jsonb
    END
  FROM jsonb_array_elements(COALESCE(p_belge -> 'satirlar', '[]'::jsonb))
    WITH ORDINALITY AS item(satir, ordinality);

  GET DIAGNOSTICS v_satir_sayisi = ROW_COUNT;
  IF v_satir_sayisi = 0 THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES ('SIPARIS_SATIRI_GEREKLI', '{}'::jsonb);
  END IF;

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT
    'SATIR_GIRDISI_GECERSIZ',
    satir_no,
    jsonb_build_object(
      'stok_id', stok_id,
      'genislik_mm', genislik_mm,
      'yukseklik_mm', yukseklik_mm,
      'adet', adet
    )
  FROM pg_temp.ticari_girdi_satirlari
  WHERE stok_id IS NULL
     OR genislik_mm IS NULL OR genislik_mm <= 0
     OR yukseklik_mm IS NULL OR yukseklik_mm <= 0
     OR adet IS NULL OR adet <= 0;

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT
    'ISKONTO_MODU_CAKISMASI',
    satir_no,
    jsonb_build_object(
      'satir_iskonto_yuzdesi', satir_iskonto_yuzdesi,
      'satir_iskonto_tutari', satir_iskonto_tutari
    )
  FROM pg_temp.ticari_girdi_satirlari
  WHERE satir_iskonto_yuzdesi IS NOT NULL
    AND satir_iskonto_tutari IS NOT NULL;

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT
    CASE
      WHEN stok_row.id IS NULL THEN 'STOK_BULUNAMADI'
      WHEN NOT stok_row.aktif THEN 'STOK_PASIF'
      ELSE 'STOK_SATISA_KAPALI'
    END,
    g.satir_no,
    jsonb_build_object(
      'stok_id', g.stok_id,
      'ticari_kapsam', stok_row.ticari_kapsam
    )
  FROM pg_temp.ticari_girdi_satirlari g
  LEFT JOIN public.stok stok_row ON stok_row.id = g.stok_id
  WHERE g.stok_id IS NOT NULL
    AND (
      stok_row.id IS NULL
      OR NOT stok_row.aktif
      OR stok_row.ticari_kapsam NOT IN ('satilabilir', 'her_ikisi')
    );

  INSERT INTO pg_temp.ticari_satir_hesaplari (
    satir_no,
    detay_id,
    stok_id,
    stok_grubu,
    recete_id,
    recete_surumu_id,
    kdv_grubu_id,
    kdv_grup_surumu_id,
    kdv_orani,
    genislik_mm,
    yukseklik_mm,
    yuvarlanmis_genislik_mm,
    yuvarlanmis_yukseklik_mm,
    adet,
    tek_parca_m2,
    faturalanabilir_m2,
    cevre_m,
    birim_fiyat,
    urun_tutari,
    fiyat_kaynagi_id,
    fiyat_kaynagi_para_birimi
  )
  SELECT
    g.satir_no,
    g.detay_id,
    g.stok_id,
    stok_row.grup,
    recete.id,
    recete_surumu.id,
    COALESCE(musteri_fiyat.kdv_grubu_id, ana_fiyat.kdv_grubu_id),
    kdv_surumu.id,
    kdv_surumu.kdv_orani,
    g.genislik_mm,
    g.yukseklik_mm,
    CASE
      WHEN COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm) IS NULL
        THEN g.genislik_mm
      ELSE ceil(g.genislik_mm / COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm))
        * COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm)
    END,
    CASE
      WHEN COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm) IS NULL
        THEN g.yukseklik_mm
      ELSE ceil(g.yukseklik_mm / COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm))
        * COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm)
    END,
    g.adet,
    GREATEST(
      (
        (CASE
          WHEN COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm) IS NULL
            THEN g.genislik_mm
          ELSE ceil(g.genislik_mm / COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm))
            * COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm)
        END)
        *
        (CASE
          WHEN COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm) IS NULL
            THEN g.yukseklik_mm
          ELSE ceil(g.yukseklik_mm / COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm))
            * COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm)
        END)
      ) / 1000000::numeric,
      COALESCE(musteri_fiyat.minimum_m2, ana_fiyat.minimum_m2, 0)
    )::numeric(18,6),
    (
      GREATEST(
        (
          (CASE
            WHEN COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm) IS NULL
              THEN g.genislik_mm
            ELSE ceil(g.genislik_mm / COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm))
              * COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm)
          END)
          *
          (CASE
            WHEN COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm) IS NULL
              THEN g.yukseklik_mm
            ELSE ceil(g.yukseklik_mm / COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm))
              * COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm)
          END)
        ) / 1000000::numeric,
        COALESCE(musteri_fiyat.minimum_m2, ana_fiyat.minimum_m2, 0)
      ) * g.adet
    )::numeric(18,6),
    (
      2 * (
        (CASE
          WHEN COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm) IS NULL
            THEN g.genislik_mm
          ELSE ceil(g.genislik_mm / COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm))
            * COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm)
        END)
        +
        (CASE
          WHEN COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm) IS NULL
            THEN g.yukseklik_mm
          ELSE ceil(g.yukseklik_mm / COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm))
            * COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm)
        END)
      ) / 1000::numeric * g.adet
    )::numeric(18,6),
    (
      COALESCE(
        musteri_fiyat.birim_fiyat,
        ana_fiyat.birim_fiyat
          * (1 + COALESCE(musteri_fiyat.yuzde_fark, 0) / 100)
      )
      * public.ticari_kur_katsayisi(
          v_kurlar,
          COALESCE(musteri_fiyat.para_birimi, ana_fiyat.para_birimi),
          v_para_birimi
        )
    )::numeric(18,6),
    round(
      (
        GREATEST(
          (
            (CASE
              WHEN COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm) IS NULL
                THEN g.genislik_mm
              ELSE ceil(g.genislik_mm / COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm))
                * COALESCE(musteri_fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm)
            END)
            *
            (CASE
              WHEN COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm) IS NULL
                THEN g.yukseklik_mm
              ELSE ceil(g.yukseklik_mm / COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm))
                * COALESCE(musteri_fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm)
            END)
          ) / 1000000::numeric,
          COALESCE(musteri_fiyat.minimum_m2, ana_fiyat.minimum_m2, 0)
        ) * g.adet
      )
      *
      (
        COALESCE(
          musteri_fiyat.birim_fiyat,
          ana_fiyat.birim_fiyat
            * (1 + COALESCE(musteri_fiyat.yuzde_fark, 0) / 100)
        )
        * public.ticari_kur_katsayisi(
            v_kurlar,
            COALESCE(musteri_fiyat.para_birimi, ana_fiyat.para_birimi),
            v_para_birimi
          )
      ),
      2
    ),
    COALESCE(musteri_fiyat.id, ana_fiyat.id),
    COALESCE(musteri_fiyat.para_birimi, ana_fiyat.para_birimi)
  FROM pg_temp.ticari_girdi_satirlari g
  JOIN public.stok stok_row
    ON stok_row.id = g.stok_id
   AND stok_row.aktif
   AND stok_row.ticari_kapsam IN ('satilabilir', 'her_ikisi')
  LEFT JOIN LATERAL (
    SELECT fiyat.*
    FROM public.fiyat_listesi_urun_kalemleri fiyat
    WHERE fiyat.fiyat_listesi_surumu_id = v_ana_fiyat_surumu_id
      AND fiyat.aktif
      AND (
        (fiyat.kapsam_tipi = 'stok' AND fiyat.stok_id = g.stok_id)
        OR
        (fiyat.kapsam_tipi = 'stok_grubu' AND fiyat.stok_grubu = stok_row.grup)
        OR fiyat.kapsam_tipi = 'genel'
      )
    ORDER BY CASE fiyat.kapsam_tipi WHEN 'stok' THEN 1 WHEN 'stok_grubu' THEN 2 ELSE 3 END
    LIMIT 1
  ) ana_fiyat ON true
  LEFT JOIN LATERAL (
    SELECT fiyat.*
    FROM public.fiyat_listesi_urun_kalemleri fiyat
    WHERE fiyat.fiyat_listesi_surumu_id = v_musteri_fiyat_surumu_id
      AND fiyat.aktif
      AND (
        (fiyat.kapsam_tipi = 'stok' AND fiyat.stok_id = g.stok_id)
        OR
        (fiyat.kapsam_tipi = 'stok_grubu' AND fiyat.stok_grubu = stok_row.grup)
        OR fiyat.kapsam_tipi = 'genel'
      )
    ORDER BY CASE fiyat.kapsam_tipi WHEN 'stok' THEN 1 WHEN 'stok_grubu' THEN 2 ELSE 3 END
    LIMIT 1
  ) musteri_fiyat ON true
  LEFT JOIN LATERAL public.ticari_recete_surumu_coz(
    g.stok_id,
    v_tarih,
    p_sabit_baglam
  ) recete_baglami ON true
  LEFT JOIN public.urun_maliyet_receteleri recete
    ON recete.id = recete_baglami.recete_id
  LEFT JOIN public.urun_maliyet_recete_surmleri recete_surumu
    ON recete_surumu.id = recete_baglami.recete_surumu_id
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.ticari_kdv_surumu_coz(
      COALESCE(musteri_fiyat.kdv_grubu_id, ana_fiyat.kdv_grubu_id),
      v_tarih,
      p_sabit_baglam
    )
  ) kdv_surumu ON true
  WHERE g.stok_id IS NOT NULL
    AND g.genislik_mm > 0
    AND g.yukseklik_mm > 0
    AND g.adet > 0;

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT
    'SATIR_HESAPLANAMADI',
    g.satir_no,
    jsonb_build_object('stok_id', g.stok_id)
  FROM pg_temp.ticari_girdi_satirlari g
  LEFT JOIN pg_temp.ticari_satir_hesaplari sh USING (satir_no)
  WHERE sh.satir_no IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_temp.ticari_hatalar hata
      WHERE hata.satir_no = g.satir_no
    );

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT
    CASE
      WHEN sh.fiyat_kaynagi_id IS NULL THEN 'EKSIK_SATIS_FIYATI'
      WHEN sh.birim_fiyat IS NULL
       AND sh.fiyat_kaynagi_para_birimi IS NOT NULL THEN 'KUR_EKSIK'
      WHEN sh.birim_fiyat IS NULL THEN 'EKSIK_SATIS_FIYATI'
      WHEN sh.recete_surumu_id IS NULL THEN 'EKSIK_RECETE'
      WHEN sh.kdv_grup_surumu_id IS NULL THEN 'EKSIK_KDV_GRUBU'
      ELSE 'KUR_EKSIK'
    END,
    sh.satir_no,
    jsonb_build_object('stok_id', sh.stok_id, 'para_birimi', sh.fiyat_kaynagi_para_birimi)
  FROM pg_temp.ticari_satir_hesaplari sh
  WHERE sh.fiyat_kaynagi_id IS NULL
     OR sh.birim_fiyat IS NULL
     OR sh.recete_surumu_id IS NULL
     OR sh.kdv_grup_surumu_id IS NULL;

  -- Reçete maliyetleri tek set-based toplama ile hesaplanır.
  WITH recete_maliyet_satirlari AS (
    SELECT
      sh.satir_no,
      rk.hesaplama_birimi,
      rk.miktar_katsayisi,
      rk.cevre_katsayisi,
      rk.fire_orani_override,
      sh.faturalanabilir_m2,
      sh.cevre_m,
      sh.adet,
      maliyet.birim_maliyet,
      maliyet.para_birimi,
      maliyet.fire_orani,
      row_number() OVER (
        PARTITION BY rk.id
        ORDER BY sh.satir_no
      ) AS siparis_kalem_sirasi
    FROM pg_temp.ticari_satir_hesaplari sh
    JOIN pg_temp.ticari_girdi_satirlari g USING (satir_no)
    JOIN public.urun_maliyet_recete_kalemleri rk
      ON rk.urun_maliyet_recete_surumu_id = sh.recete_surumu_id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(ms.birim_maliyet, mi.birim_maliyet, mg.birim_maliyet) AS birim_maliyet,
        COALESCE(ms.para_birimi, mi.para_birimi, mg.para_birimi) AS para_birimi,
        COALESCE(ms.fire_orani, mi.fire_orani, 0) AS fire_orani
      FROM (SELECT 1) dummy
      LEFT JOIN public.maliyet_stok_kalemleri ms
        ON rk.bilesen_turu IN ('stok', 'sipariste_secilen_cita')
       AND ms.maliyet_tarife_surumu_id = v_maliyet_surumu_id
       AND ms.stok_id = CASE
         WHEN rk.bilesen_turu = 'stok' THEN rk.ham_stok_id
         ELSE g.cita_stok_id
       END
       AND ms.hesaplama_birimi = rk.hesaplama_birimi
       AND ms.aktif
      LEFT JOIN public.maliyet_islem_kalemleri mi
        ON rk.bilesen_turu = 'islem'
       AND mi.maliyet_tarife_surumu_id = v_maliyet_surumu_id
       AND mi.islem_kodu = rk.referans_kodu
       AND mi.aktif
      LEFT JOIN public.maliyet_genel_gider_kalemleri mg
        ON rk.bilesen_turu = 'genel_gider'
       AND mg.maliyet_tarife_surumu_id = v_maliyet_surumu_id
       AND mg.kalem_kodu = rk.referans_kodu
       AND mg.aktif
    ) maliyet ON true
    WHERE maliyet.birim_maliyet IS NOT NULL
      AND public.ticari_kur_katsayisi(v_kurlar, maliyet.para_birimi, v_para_birimi) IS NOT NULL
  ),
  recete_maliyeti AS (
    SELECT
      satir_no,
      sum(
        round(
          (
            CASE hesaplama_birimi
              WHEN 'm2' THEN faturalanabilir_m2
              WHEN 'cevre_m' THEN cevre_m * cevre_katsayisi
              WHEN 'adet' THEN adet
              WHEN 'sabit' THEN 1
              WHEN 'siparis' THEN
                CASE WHEN siparis_kalem_sirasi = 1 THEN 1 ELSE 0 END
              WHEN 'metre' THEN cevre_m
              ELSE adet
            END
            * miktar_katsayisi
            * (1 + COALESCE(fire_orani_override, fire_orani, 0) / 100)
          )
          * birim_maliyet
          * public.ticari_kur_katsayisi(v_kurlar, para_birimi, v_para_birimi),
          2
        )
      )::numeric(18,2) AS toplam_maliyet
    FROM recete_maliyet_satirlari
    GROUP BY satir_no
  )
  UPDATE pg_temp.ticari_satir_hesaplari sh
  SET tahmini_maliyet = COALESCE(rm.toplam_maliyet, 0)
  FROM recete_maliyeti rm
  WHERE rm.satir_no = sh.satir_no;

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT
    CASE
      WHEN maliyet.birim_maliyet IS NULL THEN 'EKSIK_MALIYET'
      ELSE 'KUR_EKSIK'
    END,
    sh.satir_no,
    jsonb_build_object(
      'recete_kalemi_id', rk.id,
      'bilesen_turu', rk.bilesen_turu,
      'referans_kodu', rk.referans_kodu,
      'ham_stok_id', rk.ham_stok_id
    )
  FROM pg_temp.ticari_satir_hesaplari sh
  JOIN pg_temp.ticari_girdi_satirlari g USING (satir_no)
  JOIN public.urun_maliyet_recete_kalemleri rk
    ON rk.urun_maliyet_recete_surumu_id = sh.recete_surumu_id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(ms.birim_maliyet, mi.birim_maliyet, mg.birim_maliyet) AS birim_maliyet,
      COALESCE(ms.para_birimi, mi.para_birimi, mg.para_birimi) AS para_birimi
    FROM (SELECT 1) dummy
    LEFT JOIN public.maliyet_stok_kalemleri ms
      ON rk.bilesen_turu IN ('stok', 'sipariste_secilen_cita')
     AND ms.maliyet_tarife_surumu_id = v_maliyet_surumu_id
     AND ms.stok_id = CASE
       WHEN rk.bilesen_turu = 'stok' THEN rk.ham_stok_id
       ELSE g.cita_stok_id
     END
     AND ms.hesaplama_birimi = rk.hesaplama_birimi
     AND ms.aktif
    LEFT JOIN public.maliyet_islem_kalemleri mi
      ON rk.bilesen_turu = 'islem'
     AND mi.maliyet_tarife_surumu_id = v_maliyet_surumu_id
     AND mi.islem_kodu = rk.referans_kodu
     AND mi.aktif
    LEFT JOIN public.maliyet_genel_gider_kalemleri mg
      ON rk.bilesen_turu = 'genel_gider'
     AND mg.maliyet_tarife_surumu_id = v_maliyet_surumu_id
     AND mg.kalem_kodu = rk.referans_kodu
     AND mg.aktif
  ) maliyet ON true
  WHERE maliyet.birim_maliyet IS NULL
     OR public.ticari_kur_katsayisi(v_kurlar, maliyet.para_birimi, v_para_birimi) IS NULL;

  INSERT INTO pg_temp.ticari_bilesenler (
    satir_no, bilesen_turu, kaynak_turu, kaynak_id, hesaplama_birimi,
    miktar, birim_fiyat, liste_tutari, net_tutar, tahmini_maliyet,
    para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani, sira_no, metadata
  )
  SELECT
    sh.satir_no,
    'urun',
    'fiyat_listesi_urun_kalemi',
    sh.fiyat_kaynagi_id,
    'm2',
    sh.faturalanabilir_m2,
    sh.birim_fiyat,
    sh.urun_tutari,
    sh.urun_tutari,
    sh.tahmini_maliyet,
    v_para_birimi,
    sh.kdv_grubu_id,
    sh.kdv_grup_surumu_id,
    sh.kdv_orani,
    10,
    jsonb_build_object('stok_id', sh.stok_id)
  FROM pg_temp.ticari_satir_hesaplari sh
  WHERE sh.birim_fiyat IS NOT NULL
    AND sh.kdv_grup_surumu_id IS NOT NULL;

  -- Kenar işlemi satış bileşenleri.
  INSERT INTO pg_temp.ticari_bilesenler (
    satir_no, bilesen_turu, kaynak_turu, kaynak_id, hesaplama_birimi,
    miktar, birim_fiyat, liste_tutari, net_tutar, tahmini_maliyet,
    para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani,
    ucretsiz, sira_no, metadata
  )
  SELECT
    sh.satir_no,
    'kenar_islemi',
    'fiyat_listesi_kenar_islem_kalemi',
    fiyat.id,
    'cevre_m',
    sh.cevre_m,
    fiyat.birim_fiyat * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi),
    round(sh.cevre_m * fiyat.birim_fiyat
      * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi), 2),
    round(sh.cevre_m * fiyat.birim_fiyat
      * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi), 2),
    COALESCE(round(
      sh.cevre_m * maliyet.birim_maliyet
      * (1 + maliyet.fire_orani / 100)
      * public.ticari_kur_katsayisi(v_kurlar, maliyet.para_birimi, v_para_birimi), 2
    ), 0),
    v_para_birimi,
    fiyat.kdv_grubu_id,
    kdv.id,
    kdv.kdv_orani,
    g.kenar_islemi_ucretsiz,
    20,
    jsonb_build_object('islem_turu', g.kenar_islemi)
  FROM pg_temp.ticari_satir_hesaplari sh
  JOIN pg_temp.ticari_girdi_satirlari g USING (satir_no)
  LEFT JOIN LATERAL (
    SELECT kalem.*
    FROM public.fiyat_listesi_kenar_islem_kalemleri kalem
    WHERE kalem.fiyat_listesi_surumu_id IN (
      v_musteri_fiyat_surumu_id, v_ana_fiyat_surumu_id
    )
      AND kalem.islem_turu = g.kenar_islemi
      AND kalem.aktif
    ORDER BY CASE WHEN kalem.fiyat_listesi_surumu_id = v_musteri_fiyat_surumu_id THEN 1 ELSE 2 END
    LIMIT 1
  ) fiyat ON true
  LEFT JOIN LATERAL (
    SELECT mk.*
    FROM public.maliyet_islem_kalemleri mk
    WHERE mk.maliyet_tarife_surumu_id = v_maliyet_surumu_id
      AND mk.aktif
      AND (mk.islem_kodu = g.kenar_islemi OR mk.islem_turu = g.kenar_islemi)
    ORDER BY CASE WHEN mk.islem_kodu = g.kenar_islemi THEN 1 ELSE 2 END
    LIMIT 1
  ) maliyet ON true
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.ticari_kdv_surumu_coz(
      fiyat.kdv_grubu_id,
      v_tarih,
      p_sabit_baglam
    )
  ) kdv ON true
  WHERE g.kenar_islemi IS NOT NULL
    AND fiyat.id IS NOT NULL
    AND kdv.id IS NOT NULL
    AND public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi) IS NOT NULL;

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT
    CASE
      WHEN fiyat.id IS NULL THEN 'EKSIK_KENAR_ISLEM_FIYATI'
      WHEN kdv.id IS NULL THEN 'EKSIK_KDV_GRUBU'
      WHEN maliyet.id IS NULL THEN 'EKSIK_MALIYET'
      ELSE 'KUR_EKSIK'
    END,
    sh.satir_no,
    jsonb_build_object('kenar_islemi', g.kenar_islemi)
  FROM pg_temp.ticari_satir_hesaplari sh
  JOIN pg_temp.ticari_girdi_satirlari g USING (satir_no)
  LEFT JOIN LATERAL (
    SELECT kalem.*
    FROM public.fiyat_listesi_kenar_islem_kalemleri kalem
    WHERE kalem.fiyat_listesi_surumu_id IN (v_musteri_fiyat_surumu_id, v_ana_fiyat_surumu_id)
      AND kalem.islem_turu = g.kenar_islemi AND kalem.aktif
    ORDER BY CASE WHEN kalem.fiyat_listesi_surumu_id = v_musteri_fiyat_surumu_id THEN 1 ELSE 2 END
    LIMIT 1
  ) fiyat ON true
  LEFT JOIN LATERAL (
    SELECT mk.*
    FROM public.maliyet_islem_kalemleri mk
    WHERE mk.maliyet_tarife_surumu_id = v_maliyet_surumu_id
      AND mk.aktif
      AND (mk.islem_kodu = g.kenar_islemi OR mk.islem_turu = g.kenar_islemi)
    LIMIT 1
  ) maliyet ON true
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.ticari_kdv_surumu_coz(
      fiyat.kdv_grubu_id,
      v_tarih,
      p_sabit_baglam
    )
  ) kdv ON true
  WHERE g.kenar_islemi IS NOT NULL
    AND (
      fiyat.id IS NULL OR kdv.id IS NULL OR maliyet.id IS NULL
      OR public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi) IS NULL
      OR public.ticari_kur_katsayisi(v_kurlar, maliyet.para_birimi, v_para_birimi) IS NULL
    );

  -- Menfez.
  INSERT INTO pg_temp.ticari_bilesenler (
    satir_no, bilesen_turu, kaynak_turu, kaynak_id, hesaplama_birimi,
    miktar, birim_fiyat, liste_tutari, net_tutar, tahmini_maliyet,
    para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani,
    ucretsiz, sira_no, metadata
  )
  SELECT
    sh.satir_no,
    'menfez',
    'fiyat_listesi_menfez_kalemi',
    fiyat.id,
    'adet',
    sh.adet,
    fiyat.birim_fiyat * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi),
    round(sh.adet * fiyat.birim_fiyat
      * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi), 2),
    round(sh.adet * fiyat.birim_fiyat
      * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi), 2),
    COALESCE(round(
      sh.adet * maliyet.birim_maliyet
      * (1 + maliyet.fire_orani / 100)
      * public.ticari_kur_katsayisi(v_kurlar, maliyet.para_birimi, v_para_birimi), 2
    ), 0),
    v_para_birimi,
    fiyat.kdv_grubu_id,
    kdv.id,
    kdv.kdv_orani,
    g.menfez_ucretsiz,
    30,
    jsonb_build_object('menfez_turu', g.menfez_turu, 'cap_mm', g.menfez_cap_mm)
  FROM pg_temp.ticari_satir_hesaplari sh
  JOIN pg_temp.ticari_girdi_satirlari g USING (satir_no)
  LEFT JOIN LATERAL (
    SELECT kalem.*
    FROM public.fiyat_listesi_menfez_kalemleri kalem
    WHERE kalem.fiyat_listesi_surumu_id IN (v_musteri_fiyat_surumu_id, v_ana_fiyat_surumu_id)
      AND kalem.menfez_turu = g.menfez_turu
      AND g.menfez_cap_mm BETWEEN kalem.cap_alt_mm AND kalem.cap_ust_mm
      AND kalem.aktif
    ORDER BY CASE WHEN kalem.fiyat_listesi_surumu_id = v_musteri_fiyat_surumu_id THEN 1 ELSE 2 END
    LIMIT 1
  ) fiyat ON true
  LEFT JOIN LATERAL (
    SELECT mk.*
    FROM public.maliyet_islem_kalemleri mk
    WHERE mk.maliyet_tarife_surumu_id = v_maliyet_surumu_id
      AND mk.aktif
      AND (mk.islem_kodu = 'menfez' OR mk.islem_turu = 'menfez')
    LIMIT 1
  ) maliyet ON true
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.ticari_kdv_surumu_coz(
      fiyat.kdv_grubu_id,
      v_tarih,
      p_sabit_baglam
    )
  ) kdv ON true
  WHERE g.menfez_cap_mm IS NOT NULL
    AND fiyat.id IS NOT NULL
    AND maliyet.id IS NOT NULL
    AND kdv.id IS NOT NULL
    AND public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi) IS NOT NULL
    AND public.ticari_kur_katsayisi(v_kurlar, maliyet.para_birimi, v_para_birimi) IS NOT NULL;

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT 'EKSIK_MENFEZ_FIYATI_VEYA_MALIYETI', sh.satir_no,
    jsonb_build_object('menfez_turu', g.menfez_turu, 'cap_mm', g.menfez_cap_mm)
  FROM pg_temp.ticari_satir_hesaplari sh
  JOIN pg_temp.ticari_girdi_satirlari g USING (satir_no)
  WHERE g.menfez_cap_mm IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_temp.ticari_bilesenler b
      WHERE b.satir_no = sh.satir_no AND b.bilesen_turu = 'menfez'
    );

  -- Küçük cam ek bedeli.
  INSERT INTO pg_temp.ticari_bilesenler (
    satir_no, bilesen_turu, kaynak_turu, kaynak_id, hesaplama_birimi,
    miktar, birim_fiyat, liste_tutari, net_tutar, tahmini_maliyet,
    para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani,
    ucretsiz, sira_no, metadata
  )
  SELECT
    sh.satir_no,
    'kucuk_cam',
    'fiyat_listesi_kucuk_cam_kurali',
    fiyat.id,
    CASE WHEN fiyat.sabit_ek_tutar IS NOT NULL THEN 'adet'::public.hesaplama_birimi
         ELSE 'yuzde'::public.hesaplama_birimi END,
    CASE WHEN fiyat.sabit_ek_tutar IS NOT NULL THEN sh.adet ELSE fiyat.yuzde_ek_bedel END,
    CASE
      WHEN fiyat.sabit_ek_tutar IS NOT NULL THEN
        fiyat.sabit_ek_tutar * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi)
      ELSE fiyat.yuzde_ek_bedel
    END,
    round(
      CASE
        WHEN fiyat.sabit_ek_tutar IS NOT NULL THEN
          sh.adet * fiyat.sabit_ek_tutar
            * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi)
        ELSE sh.urun_tutari * fiyat.yuzde_ek_bedel / 100
      END,
      2
    ),
    round(
      CASE
        WHEN fiyat.sabit_ek_tutar IS NOT NULL THEN
          sh.adet * fiyat.sabit_ek_tutar
            * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi)
        ELSE sh.urun_tutari * fiyat.yuzde_ek_bedel / 100
      END,
      2
    ),
    0,
    v_para_birimi,
    fiyat.kdv_grubu_id,
    kdv.id,
    kdv.kdv_orani,
    g.kucuk_cam_ucretsiz,
    40,
    jsonb_build_object('alan_ust_siniri_m2', fiyat.alan_ust_siniri_m2)
  FROM pg_temp.ticari_satir_hesaplari sh
  JOIN pg_temp.ticari_girdi_satirlari g USING (satir_no)
  LEFT JOIN LATERAL (
    SELECT kural.*
    FROM public.fiyat_listesi_kucuk_cam_kurallari kural
    WHERE kural.fiyat_listesi_surumu_id IN (v_musteri_fiyat_surumu_id, v_ana_fiyat_surumu_id)
      AND sh.tek_parca_m2 <= kural.alan_ust_siniri_m2
      AND kural.aktif
    ORDER BY
      CASE WHEN kural.fiyat_listesi_surumu_id = v_musteri_fiyat_surumu_id THEN 1 ELSE 2 END,
      kural.alan_ust_siniri_m2
    LIMIT 1
  ) fiyat ON true
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.ticari_kdv_surumu_coz(
      fiyat.kdv_grubu_id,
      v_tarih,
      p_sabit_baglam
    )
  ) kdv ON true
  WHERE g.kucuk_cam
    AND fiyat.id IS NOT NULL
    AND kdv.id IS NOT NULL
    AND (
      fiyat.sabit_ek_tutar IS NULL
      OR public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi) IS NOT NULL
    );

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT 'EKSIK_KUCUK_CAM_KURALI', sh.satir_no, jsonb_build_object('stok_id', sh.stok_id)
  FROM pg_temp.ticari_satir_hesaplari sh
  JOIN pg_temp.ticari_girdi_satirlari g USING (satir_no)
  WHERE g.kucuk_cam
    AND NOT EXISTS (
      SELECT 1 FROM pg_temp.ticari_bilesenler b
      WHERE b.satir_no = sh.satir_no AND b.bilesen_turu = 'kucuk_cam'
    );

  -- Serbest kodlu diğer satış kalemleri.
  INSERT INTO pg_temp.ticari_bilesenler (
    satir_no, bilesen_turu, kaynak_turu, kaynak_id, hesaplama_birimi,
    miktar, birim_fiyat, liste_tutari, net_tutar, tahmini_maliyet,
    para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani,
    ucretsiz, sira_no, metadata
  )
  SELECT
    sh.satir_no,
    'diger',
    'fiyat_listesi_diger_kalemi',
    fiyat.id,
    fiyat.hesaplama_birimi,
    COALESCE(public.ticari_guvenli_numeric(extra.value ->> 'miktar'), 1),
    fiyat.birim_fiyat * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi),
    round(
      COALESCE(public.ticari_guvenli_numeric(extra.value ->> 'miktar'), 1)
      * fiyat.birim_fiyat
      * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi),
      2
    ),
    round(
      COALESCE(public.ticari_guvenli_numeric(extra.value ->> 'miktar'), 1)
      * fiyat.birim_fiyat
      * public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi),
      2
    ),
    0,
    v_para_birimi,
    fiyat.kdv_grubu_id,
    kdv.id,
    kdv.kdv_orani,
    COALESCE((extra.value ->> 'ucretsiz')::boolean, false),
    50,
    jsonb_build_object('kalem_kodu', fiyat.kalem_kodu, 'kalem_adi', fiyat.kalem_adi)
  FROM pg_temp.ticari_satir_hesaplari sh
  JOIN pg_temp.ticari_girdi_satirlari g USING (satir_no)
  CROSS JOIN LATERAL jsonb_array_elements(g.diger_kalemler) extra(value)
  LEFT JOIN LATERAL (
    SELECT kalem.*
    FROM public.fiyat_listesi_diger_kalemleri kalem
    WHERE kalem.fiyat_listesi_surumu_id IN (v_musteri_fiyat_surumu_id, v_ana_fiyat_surumu_id)
      AND kalem.kalem_kodu = extra.value ->> 'kalem_kodu'
      AND kalem.aktif
    ORDER BY CASE WHEN kalem.fiyat_listesi_surumu_id = v_musteri_fiyat_surumu_id THEN 1 ELSE 2 END
    LIMIT 1
  ) fiyat ON true
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.ticari_kdv_surumu_coz(
      fiyat.kdv_grubu_id,
      v_tarih,
      p_sabit_baglam
    )
  ) kdv ON true
  WHERE fiyat.id IS NOT NULL
    AND kdv.id IS NOT NULL
    AND public.ticari_kur_katsayisi(v_kurlar, fiyat.para_birimi, v_para_birimi) IS NOT NULL;

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT 'EKSIK_DIGER_SATIS_KALEMI', g.satir_no,
    jsonb_build_object('kalem_kodu', extra.value ->> 'kalem_kodu')
  FROM pg_temp.ticari_girdi_satirlari g
  CROSS JOIN LATERAL jsonb_array_elements(g.diger_kalemler) extra(value)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_temp.ticari_bilesenler b
    WHERE b.satir_no = g.satir_no
      AND b.bilesen_turu = 'diger'
      AND b.metadata ->> 'kalem_kodu' = extra.value ->> 'kalem_kodu'
  );

  -- Ücretsiz ekstralar fiyatı görünür tutar ve ayrı negatif bileşen oluşturur.
  INSERT INTO pg_temp.ticari_bilesenler (
    satir_no, bilesen_turu, kaynak_turu, kaynak_id, hesaplama_birimi,
    miktar, birim_fiyat, liste_tutari, net_tutar, tahmini_maliyet,
    para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani,
    ucretsiz, sira_no, metadata
  )
  SELECT
    satir_no,
    'ucretsiz_ekstra_indirimi',
    kaynak_turu,
    kaynak_id,
    hesaplama_birimi,
    miktar,
    birim_fiyat,
    -liste_tutari,
    -net_tutar,
    0,
    para_birimi,
    kdv_grubu_id,
    kdv_grup_surumu_id,
    kdv_orani,
    true,
    sira_no + 1,
    metadata || jsonb_build_object('indirilen_bilesen_turu', bilesen_turu)
  FROM pg_temp.ticari_bilesenler
  WHERE ucretsiz
    AND bilesen_turu IN ('kenar_islemi', 'menfez', 'kucuk_cam', 'diger');

  -- Satır iskontosu KDV gruplarına oransal ve kuruşu kuruşuna dağıtılır.
  WITH grup_baz AS (
    SELECT
      b.satir_no,
      b.kdv_grubu_id,
      b.kdv_grup_surumu_id,
      b.kdv_orani,
      sum(b.net_tutar)::numeric(18,2) AS grup_tutari
    FROM pg_temp.ticari_bilesenler b
    WHERE b.satir_no IS NOT NULL
    GROUP BY b.satir_no, b.kdv_grubu_id, b.kdv_grup_surumu_id, b.kdv_orani
    HAVING sum(b.net_tutar) > 0
  ),
  talep AS (
    SELECT
      g.satir_no,
      sum(g.grup_tutari) AS satir_tutari,
      round(
        CASE
          WHEN i.satir_iskonto_yuzdesi IS NOT NULL
            THEN sum(g.grup_tutari) * i.satir_iskonto_yuzdesi / 100
          ELSE COALESCE(i.satir_iskonto_tutari, 0)
        END,
        2
      ) AS iskonto
    FROM grup_baz g
    JOIN pg_temp.ticari_girdi_satirlari i USING (satir_no)
    GROUP BY g.satir_no, i.satir_iskonto_yuzdesi, i.satir_iskonto_tutari
  ),
  ham AS (
    SELECT
      g.*,
      t.iskonto,
      t.satir_tutari,
      CASE WHEN t.satir_tutari = 0 THEN 0
        ELSE t.iskonto * g.grup_tutari / t.satir_tutari END AS ham_pay
    FROM grup_baz g
    JOIN talep t USING (satir_no)
    WHERE t.iskonto > 0 AND t.iskonto <= t.satir_tutari
  ),
  taban_paylar AS (
    SELECT
      ham.*,
      trunc(ham_pay, 2) AS taban_pay,
      row_number() OVER (
        PARTITION BY satir_no
        ORDER BY abs(ham_pay - trunc(ham_pay, 2)) DESC, kdv_grup_surumu_id
      ) AS rn
    FROM ham
  ),
  dagitim AS (
    SELECT
      taban_paylar.*,
      round(
        (
          iskonto
          - sum(taban_pay) OVER (PARTITION BY satir_no)
        ) * 100
      )::integer AS kalan_kurus
    FROM taban_paylar
  )
  INSERT INTO pg_temp.ticari_bilesenler (
    satir_no, bilesen_turu, kaynak_turu, hesaplama_birimi,
    miktar, liste_tutari, iskonto_tutari, net_tutar, tahmini_maliyet,
    para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani, sira_no, metadata
  )
  SELECT
    satir_no,
    'satir_iskontosu',
    'manuel_mudahale',
    'sabit',
    1,
    -(taban_pay + CASE
      WHEN rn <= abs(kalan_kurus) THEN sign(kalan_kurus) * 0.01
      ELSE 0
    END),
    taban_pay + CASE
      WHEN rn <= abs(kalan_kurus) THEN sign(kalan_kurus) * 0.01
      ELSE 0
    END,
    -(taban_pay + CASE
      WHEN rn <= abs(kalan_kurus) THEN sign(kalan_kurus) * 0.01
      ELSE 0
    END),
    0,
    v_para_birimi,
    kdv_grubu_id,
    kdv_grup_surumu_id,
    kdv_orani,
    80,
    jsonb_build_object('dagitim', 'oransal_en_buyuk_kalan')
  FROM dagitim;

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  WITH iskonto_oncesi AS (
    SELECT satir_no, sum(net_tutar) AS tutar
    FROM pg_temp.ticari_bilesenler
    WHERE satir_no IS NOT NULL
      AND bilesen_turu <> 'satir_iskontosu'
    GROUP BY satir_no
  )
  SELECT 'SATIR_ISKONTOSU_GECERSIZ', i.satir_no,
    jsonb_build_object(
      'satir_tutari', t.tutar,
      'satir_iskonto_yuzdesi', i.satir_iskonto_yuzdesi,
      'satir_iskonto_tutari', i.satir_iskonto_tutari
    )
  FROM pg_temp.ticari_girdi_satirlari i
  JOIN iskonto_oncesi t USING (satir_no)
  WHERE i.satir_iskonto_yuzdesi < 0
     OR i.satir_iskonto_yuzdesi > 100
     OR i.satir_iskonto_tutari < 0
     OR COALESCE(
       i.satir_iskonto_tutari,
       t.tutar * i.satir_iskonto_yuzdesi / 100,
       0
     ) > t.tutar;

  -- Nakliye, satır iskontolarından sonra fakat belge iskontosundan önce eklenir.
  WITH profil AS (
    SELECT *
    FROM public.musteri_ticari_profil_surmleri
    WHERE id = v_profil_surumu_id
  ),
  toplam_m2 AS (
    SELECT COALESCE(sum(faturalanabilir_m2), 0) AS m2
    FROM pg_temp.ticari_satir_hesaplari
  ),
  satis_kurali AS (
    SELECT k.*
    FROM public.fiyat_listesi_nakliye_kurallari k, profil p
    WHERE k.fiyat_listesi_surumu_id IN (v_musteri_fiyat_surumu_id, v_ana_fiyat_surumu_id)
      AND k.hesaplama_tipi = COALESCE(
        p.nakliye_hesaplama_tipi,
        'siparis_sabiti'::public.nakliye_hesaplama_tipi
      )
      AND k.aktif
    ORDER BY CASE WHEN k.fiyat_listesi_surumu_id = v_musteri_fiyat_surumu_id THEN 1 ELSE 2 END
    LIMIT 1
  ),
  maliyet_kurali AS (
    SELECT k.*
    FROM public.maliyet_nakliye_kurallari k, profil p
    WHERE k.maliyet_tarife_surumu_id = v_maliyet_surumu_id
      AND k.hesaplama_tipi = COALESCE(
        p.nakliye_hesaplama_tipi,
        'siparis_sabiti'::public.nakliye_hesaplama_tipi
      )
      AND k.aktif
    LIMIT 1
  ),
  hesap AS (
    SELECT
      p.nakliye_hesaplama_tipi,
      sk.id AS satis_kaynak_id,
      sk.kdv_grubu_id,
      CASE
        WHEN p.nakliye_hesaplama_tipi = 'm2' THEN
          COALESCE(
            p.m2_nakliye_satis_tutari * tm.m2,
            GREATEST(sk.minimum_tutar, sk.birim_fiyat * tm.m2)
              * public.ticari_kur_katsayisi(v_kurlar, sk.para_birimi, v_para_birimi)
          )
        ELSE
          COALESCE(
            p.sabit_nakliye_satis_tutari,
            GREATEST(sk.minimum_tutar, sk.birim_fiyat)
              * public.ticari_kur_katsayisi(v_kurlar, sk.para_birimi, v_para_birimi)
          )
      END AS hesaplanan_satis,
      CASE
        WHEN p.nakliye_hesaplama_tipi = 'm2' THEN
          COALESCE(
            p.m2_nakliye_maliyet_tutari * tm.m2,
            GREATEST(mk.minimum_tutar, mk.birim_maliyet * tm.m2)
              * public.ticari_kur_katsayisi(v_kurlar, mk.para_birimi, v_para_birimi)
          )
        ELSE
          COALESCE(
            p.sabit_nakliye_maliyet_tutari,
            GREATEST(mk.minimum_tutar, mk.birim_maliyet)
              * public.ticari_kur_katsayisi(v_kurlar, mk.para_birimi, v_para_birimi)
          )
      END AS hesaplanan_maliyet,
      CASE WHEN p.nakliye_hesaplama_tipi = 'm2' THEN tm.m2 ELSE 1 END AS miktar
    FROM profil p
    CROSS JOIN toplam_m2 tm
    LEFT JOIN satis_kurali sk ON true
    LEFT JOIN maliyet_kurali mk ON true
  )
  INSERT INTO pg_temp.ticari_bilesenler (
    satir_no, bilesen_turu, kaynak_turu, kaynak_id, hesaplama_birimi,
    miktar, birim_fiyat, liste_tutari, override_tutari, fark_tutari,
    net_tutar, tahmini_maliyet, para_birimi,
    kdv_grubu_id, kdv_grup_surumu_id, kdv_orani, sira_no, metadata
  )
  SELECT
    NULL,
    'nakliye',
    'fiyat_listesi_nakliye_kurali',
    h.satis_kaynak_id,
    CASE
      WHEN h.nakliye_hesaplama_tipi = 'm2'
        THEN 'm2'::public.hesaplama_birimi
      ELSE 'siparis'::public.hesaplama_birimi
    END,
    h.miktar,
    CASE WHEN h.miktar = 0 THEN 0 ELSE h.hesaplanan_satis / h.miktar END,
    round(COALESCE(h.hesaplanan_satis, 0), 2),
    public.ticari_guvenli_numeric(p_belge ->> 'nakliye_satis_override'),
    round(
      COALESCE(public.ticari_guvenli_numeric(p_belge ->> 'nakliye_satis_override'), h.hesaplanan_satis, 0)
      - COALESCE(h.hesaplanan_satis, 0),
      2
    ),
    round(COALESCE(
      public.ticari_guvenli_numeric(p_belge ->> 'nakliye_satis_override'),
      h.hesaplanan_satis,
      0
    ), 2),
    round(COALESCE(
      public.ticari_guvenli_numeric(p_belge ->> 'nakliye_maliyet_override'),
      h.hesaplanan_maliyet,
      0
    ), 2),
    v_para_birimi,
    COALESCE(h.kdv_grubu_id, profil_row.varsayilan_kdv_grubu_id),
    kdv.id,
    kdv.kdv_orani,
    100,
    jsonb_build_object(
      'hesaplanan_satis', h.hesaplanan_satis,
      'hesaplanan_maliyet', h.hesaplanan_maliyet,
      'satis_override', public.ticari_guvenli_numeric(p_belge ->> 'nakliye_satis_override'),
      'maliyet_override', public.ticari_guvenli_numeric(p_belge ->> 'nakliye_maliyet_override')
    )
  FROM hesap h
  JOIN public.musteri_ticari_profil_surmleri profil_row
    ON profil_row.id = v_profil_surumu_id
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.ticari_kdv_surumu_coz(
      COALESCE(h.kdv_grubu_id, profil_row.varsayilan_kdv_grubu_id),
      v_tarih,
      p_sabit_baglam
    )
  ) kdv ON true
  WHERE COALESCE(h.hesaplanan_satis, 0) <> 0
     OR public.ticari_guvenli_numeric(p_belge ->> 'nakliye_satis_override') IS NOT NULL;

  INSERT INTO pg_temp.ticari_hatalar(kod, satir_no, detay)
  SELECT DISTINCT
    'EKSIK_KDV_GRUBU',
    b.satir_no,
    jsonb_build_object(
      'bilesen_turu', b.bilesen_turu,
      'kaynak_turu', b.kaynak_turu,
      'kaynak_id', b.kaynak_id
    )
  FROM pg_temp.ticari_bilesenler b
  WHERE b.kdv_grubu_id IS NULL
     OR b.kdv_grup_surumu_id IS NULL
     OR b.kdv_orani IS NULL;

  -- Belge iskontosu.
  IF public.ticari_guvenli_numeric(p_belge ->> 'belge_iskonto_yuzdesi') IS NOT NULL
     AND public.ticari_guvenli_numeric(p_belge ->> 'belge_iskonto_tutari') IS NOT NULL THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES ('BELGE_ISKONTO_MODU_CAKISMASI', '{}'::jsonb);
  END IF;

  SELECT round(
    CASE
      WHEN public.ticari_guvenli_numeric(p_belge ->> 'belge_iskonto_yuzdesi') IS NOT NULL
        THEN sum(net_tutar)
          * public.ticari_guvenli_numeric(p_belge ->> 'belge_iskonto_yuzdesi') / 100
      ELSE COALESCE(public.ticari_guvenli_numeric(p_belge ->> 'belge_iskonto_tutari'), 0)
    END,
    2
  )
  INTO v_belge_iskonto
  FROM pg_temp.ticari_bilesenler;

  IF v_belge_iskonto < 0
     OR v_belge_iskonto > COALESCE((SELECT sum(net_tutar) FROM pg_temp.ticari_bilesenler), 0) THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES ('BELGE_ISKONTOSU_GECERSIZ', jsonb_build_object('tutar', v_belge_iskonto));
  ELSIF v_belge_iskonto > 0 THEN
    WITH grup_baz AS (
      SELECT kdv_grubu_id, kdv_grup_surumu_id, kdv_orani,
        sum(net_tutar) AS grup_tutari
      FROM pg_temp.ticari_bilesenler
      GROUP BY kdv_grubu_id, kdv_grup_surumu_id, kdv_orani
      HAVING sum(net_tutar) > 0
    ),
    ham AS (
      SELECT *,
        v_belge_iskonto * grup_tutari / sum(grup_tutari) OVER () AS ham_pay
      FROM grup_baz
    ),
    taban_paylar AS (
      SELECT *,
        trunc(ham_pay, 2) AS taban_pay,
        row_number() OVER (
          ORDER BY abs(ham_pay - trunc(ham_pay, 2)) DESC, kdv_grup_surumu_id
        ) AS rn
      FROM ham
    ),
    dagitim AS (
      SELECT
        taban_paylar.*,
        round(
          (v_belge_iskonto - sum(taban_pay) OVER ()) * 100
        )::integer AS kalan_kurus
      FROM taban_paylar
    )
    INSERT INTO pg_temp.ticari_bilesenler (
      bilesen_turu, kaynak_turu, hesaplama_birimi, miktar,
      liste_tutari, iskonto_tutari, net_tutar, tahmini_maliyet,
      para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani, sira_no, metadata
    )
    SELECT
      'belge_iskontosu', 'manuel_mudahale', 'sabit', 1,
      -(taban_pay + CASE
        WHEN rn <= abs(kalan_kurus) THEN sign(kalan_kurus) * 0.01
        ELSE 0
      END),
      taban_pay + CASE
        WHEN rn <= abs(kalan_kurus) THEN sign(kalan_kurus) * 0.01
        ELSE 0
      END,
      -(taban_pay + CASE
        WHEN rn <= abs(kalan_kurus) THEN sign(kalan_kurus) * 0.01
        ELSE 0
      END),
      0, v_para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani, 110,
      jsonb_build_object('dagitim', 'oransal_en_buyuk_kalan')
    FROM dagitim;
  END IF;

  v_manuel_fark := COALESCE(public.ticari_guvenli_numeric(p_belge ->> 'manuel_fiyat_farki'), 0);
  v_manuel_yuvarlama := COALESCE(public.ticari_guvenli_numeric(p_belge ->> 'manuel_yuvarlama_farki'), 0);

  -- Belge düzeyi imzalı farkları ve vade farkını mevcut pozitif KDV matrahlarına dağıt.
  v_vade_gunu := COALESCE(
    public.ticari_guvenli_integer(p_belge ->> 'vade_gunu'),
    v_varsayilan_vade_gunu,
    0
  );
  IF (
      NULLIF(p_belge ->> 'vade_gunu', '') IS NOT NULL
      AND public.ticari_guvenli_integer(p_belge ->> 'vade_gunu') IS NULL
    )
    OR v_vade_gunu < 0 THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES (
      'VADE_GUNU_GECERSIZ',
      jsonb_build_object('vade_gunu', p_belge ->> 'vade_gunu')
    );
  END IF;

  IF v_vade_surumu_id IS NOT NULL THEN
    SELECT kademe.vade_farki_yuzdesi
    INTO v_vade_yuzdesi
    FROM public.vade_profili_kademeleri kademe
    WHERE kademe.vade_profili_surumu_id = v_vade_surumu_id
      AND v_vade_gunu BETWEEN kademe.gun_alt_siniri AND kademe.gun_ust_siniri
    ORDER BY kademe.sira_no
    LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO pg_temp.ticari_hatalar(kod, detay)
      VALUES (
        'VADE_KADEMESI_EKSIK',
        jsonb_build_object(
          'vade_profili_surumu_id', v_vade_surumu_id,
          'vade_gunu', v_vade_gunu
        )
      );
    END IF;
  END IF;
  v_vade_yuzdesi := COALESCE(v_vade_yuzdesi, 0);

  FOR v_kayit IN
    SELECT *
    FROM (
      VALUES
        ('manuel_fiyat_farki'::text, v_manuel_fark, 120),
        ('manuel_yuvarlama_farki'::text, v_manuel_yuvarlama, 130),
        (
          'vade_farki'::text,
          round(
            COALESCE((SELECT sum(net_tutar) FROM pg_temp.ticari_bilesenler), 0)
              * v_vade_yuzdesi / 100,
            2
          ),
          140
        )
    ) AS farklar(bilesen_turu, fark_tutari, sira_no)
  LOOP
    IF COALESCE(v_kayit.fark_tutari, 0) <> 0 THEN
      WITH grup_baz AS (
        SELECT kdv_grubu_id, kdv_grup_surumu_id, kdv_orani,
          sum(net_tutar) AS grup_tutari
        FROM pg_temp.ticari_bilesenler
        GROUP BY kdv_grubu_id, kdv_grup_surumu_id, kdv_orani
        HAVING sum(net_tutar) > 0
      ),
      ham AS (
        SELECT *,
          v_kayit.fark_tutari * grup_tutari / sum(grup_tutari) OVER () AS ham_pay
        FROM grup_baz
      ),
      taban_paylar AS (
        SELECT *,
          trunc(ham_pay, 2) AS taban_pay,
          row_number() OVER (
            ORDER BY abs(ham_pay - trunc(ham_pay, 2)) DESC, kdv_grup_surumu_id
          ) AS rn
        FROM ham
      ),
      dagitim AS (
        SELECT
          taban_paylar.*,
          round(
            (v_kayit.fark_tutari - sum(taban_pay) OVER ()) * 100
          )::integer AS kalan_kurus
        FROM taban_paylar
      )
      INSERT INTO pg_temp.ticari_bilesenler (
        bilesen_turu, kaynak_turu, hesaplama_birimi, miktar,
        liste_tutari, fark_tutari, net_tutar, tahmini_maliyet,
        para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani, sira_no, metadata
      )
      SELECT
        v_kayit.bilesen_turu, 'manuel_mudahale', 'sabit', 1,
        taban_pay + CASE
          WHEN rn <= abs(kalan_kurus) THEN sign(kalan_kurus) * 0.01
          ELSE 0
        END,
        taban_pay + CASE
          WHEN rn <= abs(kalan_kurus) THEN sign(kalan_kurus) * 0.01
          ELSE 0
        END,
        taban_pay + CASE
          WHEN rn <= abs(kalan_kurus) THEN sign(kalan_kurus) * 0.01
          ELSE 0
        END,
        0, v_para_birimi, kdv_grubu_id, kdv_grup_surumu_id, kdv_orani,
        v_kayit.sira_no, jsonb_build_object('dagitim', 'oransal_en_buyuk_kalan')
      FROM dagitim;
    END IF;
  END LOOP;

  IF COALESCE((SELECT sum(net_tutar) FROM pg_temp.ticari_bilesenler), 0) < 0 THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES ('BELGE_NET_TUTARI_NEGATIF_OLAMAZ', '{}'::jsonb);
  END IF;

  SELECT
    COALESCE(sum(net_tutar), 0),
    COALESCE(sum(tahmini_maliyet), 0)
  INTO v_kdv_haric, v_maliyet
  FROM pg_temp.ticari_bilesenler;

  SELECT
    COALESCE(sum(round(grup_matrah * kdv_orani / 100, 2)), 0),
    round(COALESCE(sum(grup_matrah * kdv_orani / 100), 0), 2)
      - COALESCE(sum(round(grup_matrah * kdv_orani / 100, 2)), 0)
  INTO v_kdv, v_hesaplama_yuvarlama_farki
  FROM (
    SELECT kdv_grup_surumu_id, kdv_orani, round(sum(net_tutar), 2) AS grup_matrah
    FROM pg_temp.ticari_bilesenler
    WHERE kdv_grup_surumu_id IS NOT NULL
    GROUP BY kdv_grup_surumu_id, kdv_orani
  ) gruplar;

  v_kdv_haric := round(v_kdv_haric, 2);
  v_maliyet := round(v_maliyet, 2);
  v_kdv := round(v_kdv, 2);
  v_genel := round(v_kdv_haric + v_kdv, 2);
  v_kar := round(v_kdv_haric - v_maliyet, 2);
  v_marj := CASE WHEN v_kdv_haric = 0 THEN NULL
    ELSE round(v_kar / v_kdv_haric * 100, 4) END;
  v_dusuk_marj := v_minimum_marj IS NOT NULL
    AND (v_marj IS NULL OR v_marj < v_minimum_marj);

  IF v_dusuk_marj
     AND length(trim(COALESCE(p_belge ->> 'dusuk_marj_gerekcesi', ''))) < 3 THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES (
      'DUSUK_MARJ_GEREKCESI_GEREKLI',
      jsonb_build_object('marj_yuzdesi', v_marj, 'minimum_marj_yuzdesi', v_minimum_marj)
    );
  END IF;

  IF (
      EXISTS (
        SELECT 1
        FROM pg_temp.ticari_bilesenler
        WHERE bilesen_turu IN (
          'satir_iskontosu',
          'ucretsiz_ekstra_indirimi',
          'belge_iskontosu',
          'manuel_fiyat_farki',
          'manuel_yuvarlama_farki'
        )
      )
      OR public.ticari_guvenli_numeric(p_belge ->> 'nakliye_satis_override') IS NOT NULL
      OR public.ticari_guvenli_numeric(p_belge ->> 'nakliye_maliyet_override') IS NOT NULL
    )
    AND length(trim(COALESCE(p_belge ->> 'ticari_mudahale_gerekcesi', ''))) < 3 THEN
    INSERT INTO pg_temp.ticari_hatalar(kod, detay)
    VALUES (
      'TICARI_MUDAHALE_GEREKCESI_GEREKLI',
      jsonb_build_object(
        'gerekce_alani', 'ticari_mudahale_gerekcesi',
        'minimum_karakter', 3
      )
    );
  END IF;

  v_baglam := jsonb_build_object(
    'musteri_ticari_profil_surumu_id', v_profil_surumu_id,
    'ana_fiyat_listesi_surumu_id', v_ana_fiyat_surumu_id,
    'musteri_fiyat_listesi_surumu_id', v_musteri_fiyat_surumu_id,
    'maliyet_tarife_surumu_id', v_maliyet_surumu_id,
    'vade_profili_surumu_id', v_vade_surumu_id,
    'recete_surumu_ids', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'stok_id', stok_id,
          'recete_id', recete_id,
          'recete_surumu_id', recete_surumu_id
        )
        ORDER BY stok_id
      )
      FROM (
        SELECT DISTINCT stok_id, recete_id, recete_surumu_id
        FROM pg_temp.ticari_satir_hesaplari
      ) receteler
    ), '[]'::jsonb),
    'kdv_grup_surumu_ids', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'kdv_grubu_id', kdv_grubu_id,
          'kdv_grup_surumu_id', kdv_grup_surumu_id,
          'kdv_orani', kdv_orani
        )
        ORDER BY kdv_grubu_id
      )
      FROM (
        SELECT DISTINCT kdv_grubu_id, kdv_grup_surumu_id, kdv_orani
        FROM pg_temp.ticari_bilesenler
        WHERE kdv_grup_surumu_id IS NOT NULL
      ) kdvler
    ), '[]'::jsonb),
    'kurlar', v_kurlar,
    'kur_tipi', v_kur_tipi,
    'fiyatlandirma_tarihi', v_tarih,
    'para_birimi', v_para_birimi,
    'hesaplama_surumu', c_hesaplama_surumu
  );

  v_girdi_hash := public.ticari_json_hash(p_belge);
  v_baglam_hash := public.ticari_json_hash(v_baglam);
  v_gecerli := NOT EXISTS (SELECT 1 FROM pg_temp.ticari_hatalar);

  v_sonuc := jsonb_build_object(
    'gecerli', v_gecerli,
    'hatalar', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('kod', kod, 'satir_no', satir_no, 'detay', detay)
        ORDER BY satir_no NULLS FIRST, kod
      )
      FROM pg_temp.ticari_hatalar
    ), '[]'::jsonb),
    'girdi_hash', v_girdi_hash,
    'fiyat_baglami', v_baglam,
    'fiyat_baglam_hash', v_baglam_hash,
    'hesaplama_surumu', c_hesaplama_surumu,
    'para_birimi', v_para_birimi,
    'fiyatlandirma_tarihi', v_tarih,
    'profil_snapshot', COALESCE(v_profil_snapshot, '{}'::jsonb),
    'satirlar', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'satir_no', sh.satir_no,
          'detay_id', sh.detay_id,
          'stok_id', sh.stok_id,
          'recete_id', sh.recete_id,
          'recete_surumu_id', sh.recete_surumu_id,
          'kdv_grubu_id', sh.kdv_grubu_id,
          'kdv_grup_surumu_id', sh.kdv_grup_surumu_id,
          'genislik_mm', sh.genislik_mm,
          'yukseklik_mm', sh.yukseklik_mm,
          'yuvarlanmis_genislik_mm', sh.yuvarlanmis_genislik_mm,
          'yuvarlanmis_yukseklik_mm', sh.yuvarlanmis_yukseklik_mm,
          'adet', sh.adet,
          'tek_parca_m2', sh.tek_parca_m2,
          'faturalanabilir_m2', sh.faturalanabilir_m2,
          'birim_fiyat', sh.birim_fiyat,
          'brut_tutar', COALESCE((
            SELECT sum(b.liste_tutari)
            FROM pg_temp.ticari_bilesenler b
            WHERE b.satir_no = sh.satir_no AND b.liste_tutari > 0
          ), 0),
          'satir_iskonto_tutari', COALESCE((
            SELECT sum(b.iskonto_tutari)
            FROM pg_temp.ticari_bilesenler b
            WHERE b.satir_no = sh.satir_no AND b.bilesen_turu = 'satir_iskontosu'
          ), 0),
          'net_tutar', COALESCE((
            SELECT sum(b.net_tutar)
            FROM pg_temp.ticari_bilesenler b
            WHERE b.satir_no = sh.satir_no
          ), 0),
          'tahmini_maliyet', COALESCE((
            SELECT sum(b.tahmini_maliyet)
            FROM pg_temp.ticari_bilesenler b
            WHERE b.satir_no = sh.satir_no
          ), 0),
          'tahmini_kar', COALESCE((
            SELECT sum(b.net_tutar - b.tahmini_maliyet)
            FROM pg_temp.ticari_bilesenler b
            WHERE b.satir_no = sh.satir_no
          ), 0),
          'marj_yuzdesi', CASE
            WHEN COALESCE((
              SELECT sum(b.net_tutar)
              FROM pg_temp.ticari_bilesenler b
              WHERE b.satir_no = sh.satir_no
            ), 0) = 0 THEN NULL
            ELSE round(
              (
                SELECT sum(b.net_tutar - b.tahmini_maliyet)
                FROM pg_temp.ticari_bilesenler b
                WHERE b.satir_no = sh.satir_no
              )
              /
              (
                SELECT sum(b.net_tutar)
                FROM pg_temp.ticari_bilesenler b
                WHERE b.satir_no = sh.satir_no
              ) * 100,
              4
            )
          END
        )
        ORDER BY sh.satir_no
      )
      FROM pg_temp.ticari_satir_hesaplari sh
    ), '[]'::jsonb),
    'bilesenler', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'satir_no', satir_no,
          'bilesen_turu', bilesen_turu,
          'kaynak_turu', kaynak_turu,
          'kaynak_id', kaynak_id,
          'hesaplama_birimi', hesaplama_birimi,
          'miktar', miktar,
          'birim_fiyat', birim_fiyat,
          'liste_tutari', liste_tutari,
          'iskonto_tutari', iskonto_tutari,
          'override_tutari', override_tutari,
          'fark_tutari', fark_tutari,
          'net_tutar', net_tutar,
          'tahmini_maliyet', tahmini_maliyet,
          'para_birimi', para_birimi,
          'kdv_grubu_id', kdv_grubu_id,
          'kdv_grup_surumu_id', kdv_grup_surumu_id,
          'ucretsiz', ucretsiz,
          'sira_no', sira_no,
          'metadata', metadata
        )
        ORDER BY satir_no NULLS LAST, sira_no, gecici_id
      )
      FROM pg_temp.ticari_bilesenler
    ), '[]'::jsonb),
    'kdv_ozetleri', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'kdv_grubu_id', kdv_grubu_id,
          'kdv_grup_surumu_id', kdv_grup_surumu_id,
          'matrah', matrah,
          'kdv_orani', kdv_orani,
          'kdv_tutari', round(matrah * kdv_orani / 100, 2),
          'dagitim_farki', 0
        )
        ORDER BY kdv_grubu_id
      )
      FROM (
        SELECT
          kdv_grubu_id,
          kdv_grup_surumu_id,
          kdv_orani,
          round(sum(net_tutar), 2) AS matrah
        FROM pg_temp.ticari_bilesenler
        WHERE kdv_grup_surumu_id IS NOT NULL
        GROUP BY kdv_grubu_id, kdv_grup_surumu_id, kdv_orani
      ) kdv_toplam
    ), '[]'::jsonb),
    'kur_snapshotlari', COALESCE((
      SELECT jsonb_agg(value ORDER BY key)
      FROM jsonb_each(v_kurlar)
    ), '[]'::jsonb),
    'satir_iskonto_tutari', COALESCE((
      SELECT sum(iskonto_tutari)
      FROM pg_temp.ticari_bilesenler
      WHERE bilesen_turu = 'satir_iskontosu'
    ), 0),
    'belge_iskonto_tutari', v_belge_iskonto,
    'manuel_fiyat_farki', v_manuel_fark,
    'manuel_yuvarlama_farki', v_manuel_yuvarlama,
    'hesaplama_yuvarlama_farki', round(v_hesaplama_yuvarlama_farki, 2),
    'nakliye_override_farki', COALESCE((
      SELECT sum(fark_tutari)
      FROM pg_temp.ticari_bilesenler
      WHERE bilesen_turu = 'nakliye'
    ), 0),
    'vade_farki', COALESCE((
      SELECT sum(net_tutar)
      FROM pg_temp.ticari_bilesenler
      WHERE bilesen_turu = 'vade_farki'
    ), 0),
    'kdv_haric_tutar', v_kdv_haric,
    'kdv_tutari', v_kdv,
    'genel_toplam', v_genel,
    'tahmini_maliyet', v_maliyet,
    'tahmini_kar', v_kar,
    'marj_yuzdesi', v_marj,
    'minimum_marj_yuzdesi', v_minimum_marj,
    'dusuk_marj', v_dusuk_marj,
    'dusuk_marj_gerekcesi', NULLIF(p_belge ->> 'dusuk_marj_gerekcesi', '')
  );

  v_sonuc_hash := public.ticari_json_hash(v_sonuc);
  RETURN v_sonuc || jsonb_build_object('sonuc_hash', v_sonuc_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.fiyat_onizle(p_belge jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sonuc jsonb;
  v_onizleme_id uuid;
  v_belge_turu text := COALESCE(NULLIF(p_belge ->> 'belge_turu', ''), 'siparis');
  v_mod public.ticari_modul_modu;
  v_yanit_sonuc jsonb;
  v_sabit_baglam jsonb;
  v_belge_id uuid;
  v_beklenen_revision_no integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OTURUM_GEREKLI';
  END IF;
  IF NOT (
    public.has_permission('orders', 'create')
    OR public.has_permission('orders', 'update')
    OR public.has_permission('pricing', 'read')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FIYAT_ONIZLEME_YETKISI_GEREKLI';
  END IF;
  IF v_belge_turu NOT IN ('siparis', 'teklif', 'golge') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BELGE_TURU_GECERSIZ';
  END IF;

  SELECT mod INTO v_mod
  FROM public.ticari_modul_durumu
  WHERE singleton;

  IF v_mod = 'bakim' AND (p_belge ->> 'belge_id') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FEATURE_MODE_ISLEME_KAPALI';
  END IF;

  v_belge_id := public.ticari_guvenli_uuid(p_belge ->> 'belge_id');
  v_beklenen_revision_no := public.ticari_guvenli_integer(p_belge ->> 'beklenen_revision_no');
  IF v_belge_turu = 'siparis' AND v_belge_id IS NOT NULL THEN
    SELECT onizleme.fiyat_baglami
    INTO v_sabit_baglam
    FROM public.siparisler siparis
    JOIN public.siparis_fiyat_revizyonlari revizyon
      ON revizyon.id = siparis.aktif_fiyat_revizyon_id
    JOIN public.fiyat_onizlemeleri onizleme
      ON onizleme.id = revizyon.onizleme_id
    WHERE siparis.id = v_belge_id
      AND siparis.fiyatlandirildi
      AND (
        v_beklenen_revision_no IS NULL
        OR siparis.revision_no = v_beklenen_revision_no
      );

    IF v_sabit_baglam IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
    END IF;
  ELSIF v_belge_turu = 'teklif' AND v_belge_id IS NOT NULL THEN
    SELECT revizyon.fiyat_baglami
    INTO v_sabit_baglam
    FROM public.teklifler teklif
    JOIN public.teklif_revizyonlari revizyon
      ON revizyon.id = teklif.aktif_revizyon_id
    WHERE teklif.id = v_belge_id
      AND (
        v_beklenen_revision_no IS NULL
        OR teklif.revision_no = v_beklenen_revision_no
      );

    IF v_sabit_baglam IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
    END IF;
    IF COALESCE(
      p_belge -> 'fiyat_baglamini_yenile',
      'false'::jsonb
    ) = 'true'::jsonb THEN
      v_sabit_baglam := NULL;
    END IF;
  END IF;

  v_sonuc := public.fiyat_hesapla_internal(p_belge, v_sabit_baglam);

  INSERT INTO public.fiyat_onizlemeleri (
    kullanici_id,
    belge_turu,
    belge_id,
    girdi_json,
    girdi_hash,
    fiyat_baglami,
    fiyat_baglam_hash,
    sonuc_json,
    sonuc_hash,
    kullanilan_surumluler,
    hesaplama_surumu
  )
  VALUES (
    auth.uid(),
    v_belge_turu,
    public.ticari_guvenli_uuid(p_belge ->> 'belge_id'),
    p_belge,
    v_sonuc ->> 'girdi_hash',
    v_sonuc -> 'fiyat_baglami',
    v_sonuc ->> 'fiyat_baglam_hash',
    v_sonuc,
    v_sonuc ->> 'sonuc_hash',
    v_sonuc -> 'fiyat_baglami',
    v_sonuc ->> 'hesaplama_surumu'
  )
  RETURNING id INTO v_onizleme_id;

  v_yanit_sonuc := CASE
    WHEN public.has_permission('pricing', 'read') THEN v_sonuc
    ELSE public.ticari_fiyat_sonucunu_maskele(v_sonuc)
  END;

  RETURN jsonb_build_object(
    'onizleme_id', v_onizleme_id,
    'sona_erme_tarihi', now() + interval '30 minutes',
    'girdi_hash', v_sonuc ->> 'girdi_hash',
    'fiyat_baglam_hash', v_sonuc ->> 'fiyat_baglam_hash',
    'sonuc_hash', v_sonuc ->> 'sonuc_hash',
    'sonuc', v_yanit_sonuc
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ticari_guvenli_numeric(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_guvenli_integer(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_guvenli_uuid(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_kur_katsayisi(jsonb, public.para_birimi_kodu, public.para_birimi_kodu)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_recete_surumu_coz(uuid, date, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_kdv_surumu_coz(uuid, date, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_fiyat_sonucunu_maskele(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fiyat_hesapla_internal(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiyat_onizle(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ticari_guvenli_numeric(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ticari_guvenli_integer(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ticari_guvenli_uuid(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ticari_kur_katsayisi(jsonb, public.para_birimi_kodu, public.para_birimi_kodu)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ticari_fiyat_sonucunu_maskele(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fiyat_onizle(jsonb) TO authenticated;
