-- 094 - Deterministik stok maliyet kaynağı çözümleme ve ayrıntılı ürün hesabı

SET search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.stok_maliyet_kaynagi_coz(
  p_stok_id uuid,
  p_an timestamptz DEFAULT NULL
)
RETURNS TABLE (
  atama_id uuid,
  stok_id uuid,
  profil_id uuid,
  fiyat_id uuid,
  kaynak_turu text,
  kaynak_id uuid,
  baglanti_id uuid,
  tedarikci_id uuid,
  tedarikci_adi text,
  gecerlilik_baslangici timestamptz,
  gecerlilik_bitisi timestamptz,
  birim_fiyat numeric,
  para_birimi text,
  fiyat_birimi text,
  paket_miktari numeric,
  stok_ana_birimi text,
  donusum_katsayisi numeric,
  stok_birim_fiyati numeric,
  vade_gunu integer,
  fiyat_tarihi timestamptz,
  kur_id uuid,
  kur numeric,
  kur_tarihi date,
  tcmb_kaynak_tarihi date,
  kur_kaynagi text,
  vade_parametre_id uuid,
  yillik_finansman_orani numeric,
  baz_birim_maliyet_try numeric,
  finansman_birim_etkisi_try numeric,
  faiz_dahil_birim_maliyet_try numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_an timestamptz := COALESCE(p_an, clock_timestamp());
  v_tarih date := (v_an AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  RETURN QUERY
  SELECT
    atama.id,
    atama.stok_id,
    profil.id,
    fiyat.id,
    atama.kaynak_turu,
    atama.kaynak_id,
    fiyat.cam_baglantisi_id,
    fiyat.tedarikci_id,
    tedarikci.ad,
    lower(atama.gecerlilik_donemi),
    CASE WHEN upper_inf(atama.gecerlilik_donemi)
      THEN NULL ELSE upper(atama.gecerlilik_donemi) END,
    fiyat.birim_fiyat,
    fiyat.para_birimi::text,
    fiyat.fiyat_birimi,
    fiyat.paket_miktari,
    fiyat.stok_ana_birimi,
    fiyat.donusum_katsayisi,
    round(
      fiyat.birim_fiyat
      / (COALESCE(fiyat.paket_miktari, 1) * fiyat.donusum_katsayisi),
      10
    ),
    fiyat.vade_gunu,
    fiyat.fiyat_tarihi,
    CASE WHEN fiyat.para_birimi = 'TRY' THEN NULL ELSE doviz.id END,
    CASE WHEN fiyat.para_birimi = 'TRY' THEN 1::numeric ELSE doviz.try_karsiligi END,
    CASE WHEN fiyat.para_birimi = 'TRY' THEN v_tarih ELSE doviz.kur_tarihi END,
    CASE WHEN fiyat.para_birimi = 'TRY' THEN v_tarih ELSE doviz.tcmb_kaynak_tarihi END,
    CASE WHEN fiyat.para_birimi = 'TRY' THEN 'TRY' ELSE doviz.kaynak::text END,
    ayar.id,
    ayar.yillik_finansman_orani,
    CASE
      WHEN fiyat.para_birimi = 'TRY' THEN round(
        fiyat.birim_fiyat
        / (COALESCE(fiyat.paket_miktari, 1) * fiyat.donusum_katsayisi),
        10
      )
      WHEN doviz.try_karsiligi IS NOT NULL THEN round(
        fiyat.birim_fiyat
        / (COALESCE(fiyat.paket_miktari, 1) * fiyat.donusum_katsayisi)
        * doviz.try_karsiligi,
        10
      )
    END,
    CASE
      WHEN ayar.id IS NULL THEN NULL
      WHEN fiyat.para_birimi = 'TRY' THEN round(
        (
          fiyat.birim_fiyat
          / (COALESCE(fiyat.paket_miktari, 1) * fiyat.donusum_katsayisi)
        )
        * (ayar.yillik_finansman_orani / 100)
        * (fiyat.vade_gunu::numeric / 365),
        10
      )
      WHEN doviz.try_karsiligi IS NOT NULL THEN round(
        (
          fiyat.birim_fiyat
          / (COALESCE(fiyat.paket_miktari, 1) * fiyat.donusum_katsayisi)
          * doviz.try_karsiligi
        )
        * (ayar.yillik_finansman_orani / 100)
        * (fiyat.vade_gunu::numeric / 365),
        10
      )
    END,
    CASE
      WHEN ayar.id IS NULL THEN NULL
      WHEN fiyat.para_birimi = 'TRY' THEN round(
        (
          fiyat.birim_fiyat
          / (COALESCE(fiyat.paket_miktari, 1) * fiyat.donusum_katsayisi)
        )
        * (
          1
          + (ayar.yillik_finansman_orani / 100)
          * (fiyat.vade_gunu::numeric / 365)
        ),
        10
      )
      WHEN doviz.try_karsiligi IS NOT NULL THEN round(
        (
          fiyat.birim_fiyat
          / (COALESCE(fiyat.paket_miktari, 1) * fiyat.donusum_katsayisi)
          * doviz.try_karsiligi
        )
        * (
          1
          + (ayar.yillik_finansman_orani / 100)
          * (fiyat.vade_gunu::numeric / 365)
        ),
        10
      )
    END
  FROM public.stok_maliyet_kaynagi_atamalari atama
  JOIN public.stok_alis_fiyatlari fiyat ON fiyat.id = atama.fiyat_id
  JOIN public.cari tedarikci ON tedarikci.id = fiyat.tedarikci_id
  LEFT JOIN public.stok_maliyet_profilleri profil
    ON profil.stok_id = atama.stok_id
   AND profil.gecerlilik_donemi @> v_tarih
  LEFT JOIN LATERAL (
    SELECT kur.*
    FROM public.doviz_kurlari kur
    WHERE kur.aktif
      AND kur.para_birimi = fiyat.para_birimi
      AND kur.kur_tipi::text = 'doviz_satis'
      AND kur.kur_tarihi <= v_tarih
    ORDER BY
      kur.kur_tarihi DESC,
      kur.revision_no DESC,
      kur.created_at DESC,
      kur.id DESC
    LIMIT 1
  ) doviz ON fiyat.para_birimi <> 'TRY'
  LEFT JOIN LATERAL (
    SELECT ayar_satiri.*
    FROM public.maliyet_hesaplama_ayar_surmleri ayar_satiri
    WHERE ayar_satiri.gecerli_baslangic <= v_tarih
    ORDER BY
      ayar_satiri.gecerli_baslangic DESC,
      ayar_satiri.created_at DESC,
      ayar_satiri.id DESC
    LIMIT 1
  ) ayar ON true
  WHERE atama.stok_id = p_stok_id
    AND atama.gecerlilik_donemi @> v_an
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.stok_maliyet_kaynagi_coz(uuid, timestamptz) IS
  'Aktif kullanıcı seçimini çözer; döviz_satis kurunu ve basit faiz (baz TRY × yıllık oran × gün / 365) etkisini yüksek hassasiyetle döndürür.';

CREATE OR REPLACE FUNCTION public.stok_maliyet_ozetleri(
  p_an timestamptz DEFAULT NULL
)
RETURNS TABLE (
  stok_id uuid,
  stok_kodu text,
  stok_adi text,
  kategori text,
  profil_turu text,
  fiyat_id uuid,
  kaynak_turu text,
  kaynak_id uuid,
  baglanti_id uuid,
  tedarikci_id uuid,
  tedarikci_adi text,
  birim_fiyat numeric,
  para_birimi text,
  fiyat_birimi text,
  hesaplanan_maliyet_try numeric,
  gecerlilik_baslangici timestamptz,
  gecerlilik_bitisi timestamptz,
  fiyat_tarihi timestamptz,
  dogrulama_durumu text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_an timestamptz := COALESCE(p_an, clock_timestamp());
  v_tarih date := (v_an AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;
  RETURN QUERY
  SELECT
    stok.id,
    stok.kod,
    stok.ad,
    stok.kategori,
    profil.profil_turu,
    kaynak.fiyat_id,
    kaynak.kaynak_turu,
    kaynak.kaynak_id,
    kaynak.baglanti_id,
    kaynak.tedarikci_id,
    kaynak.tedarikci_adi,
    kaynak.birim_fiyat,
    kaynak.para_birimi,
    kaynak.fiyat_birimi,
    kaynak.faiz_dahil_birim_maliyet_try,
    kaynak.gecerlilik_baslangici,
    kaynak.gecerlilik_bitisi,
    kaynak.fiyat_tarihi,
    CASE
      WHEN kaynak.fiyat_id IS NULL THEN 'fiyat_eksik'
      WHEN kaynak.faiz_dahil_birim_maliyet_try IS NULL THEN 'kur_veya_vade_eksik'
      ELSE 'dogrulanmis'
    END
  FROM public.stok stok
  JOIN public.stok_maliyet_profilleri profil
    ON profil.stok_id = stok.id
   AND profil.gecerlilik_donemi @> v_tarih
  LEFT JOIN LATERAL public.stok_maliyet_kaynagi_coz(stok.id, v_an) kaynak ON true
  WHERE stok.aktif
  ORDER BY stok.kategori, stok.kod;
END;
$$;

-- PostgreSQL cannot change a function's OUT/RETURNS TABLE row type in place.
-- The prior local definition has a different result shape, so recreate it.
DROP FUNCTION IF EXISTS public.stok_alis_fiyati_tarihcesi(uuid, uuid, integer);

CREATE FUNCTION public.stok_alis_fiyati_tarihcesi(
  p_stok_id uuid DEFAULT NULL,
  p_tedarikci_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  fiyat_id uuid,
  atama_id uuid,
  stok_id uuid,
  stok_kodu text,
  stok_adi text,
  profil_turu text,
  tedarikci_id uuid,
  tedarikci_adi text,
  birim_fiyat numeric,
  para_birimi text,
  fiyat_birimi text,
  paket_miktari numeric,
  stok_ana_birimi text,
  donusum_katsayisi numeric,
  vade_gunu integer,
  fiyat_tarihi timestamptz,
  kaynak_turu text,
  kaynak_referansi text,
  durum text,
  onceki_fiyat_id uuid,
  duzeltme_nedeni text,
  aktif_donem_baslangici timestamptz,
  aktif_donem_bitisi timestamptz,
  olusturan_kullanici text,
  olusturulma_tarihi timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;
  RETURN QUERY
  SELECT
    fiyat.id,
    atama.id,
    fiyat.stok_id,
    stok.kod,
    stok.ad,
    profil.profil_turu,
    fiyat.tedarikci_id,
    tedarikci.ad,
    fiyat.birim_fiyat,
    fiyat.para_birimi::text,
    fiyat.fiyat_birimi,
    fiyat.paket_miktari,
    fiyat.stok_ana_birimi,
    fiyat.donusum_katsayisi,
    fiyat.vade_gunu,
    fiyat.fiyat_tarihi,
    fiyat.kaynak_turu,
    fiyat.kaynak_referansi,
    fiyat.durum,
    fiyat.onceki_fiyat_id,
    fiyat.duzeltme_nedeni,
    lower(atama.gecerlilik_donemi),
    CASE WHEN upper_inf(atama.gecerlilik_donemi)
      THEN NULL ELSE upper(atama.gecerlilik_donemi) END,
    COALESCE(NULLIF(kullanici.display_name, ''), kullanici.username, 'Sistem'),
    fiyat.created_at
  FROM public.stok_alis_fiyatlari fiyat
  JOIN public.stok stok ON stok.id = fiyat.stok_id
  LEFT JOIN public.cari tedarikci ON tedarikci.id = fiyat.tedarikci_id
  LEFT JOIN public.app_users kullanici
    ON kullanici.auth_user_id = fiyat.olusturan_kullanici_id
  LEFT JOIN LATERAL (
    SELECT p.*
    FROM public.stok_maliyet_profilleri p
    WHERE p.stok_id = fiyat.stok_id
      AND p.gecerlilik_donemi @>
        (fiyat.fiyat_tarihi AT TIME ZONE 'Europe/Istanbul')::date
    LIMIT 1
  ) profil ON true
  LEFT JOIN public.stok_maliyet_kaynagi_atamalari atama
    ON atama.fiyat_id = fiyat.id
  WHERE (p_stok_id IS NULL OR fiyat.stok_id = p_stok_id)
    AND (p_tedarikci_id IS NULL OR fiyat.tedarikci_id = p_tedarikci_id)
  ORDER BY fiyat.fiyat_tarihi DESC, fiyat.created_at DESC, fiyat.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
END;
$$;

CREATE OR REPLACE FUNCTION public.urun_maliyeti_detayli_hesapla(
  p_stok_id uuid,
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
  c_hesaplama_surumu constant text := 'stok-maliyet-v2';
  v_tarih date := COALESCE(
    p_tarih,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_an timestamptz := (v_tarih::timestamp AT TIME ZONE 'Europe/Istanbul');
  v_stok public.stok%ROWTYPE;
  v_yapi public.stok_maliyet_yapi_surmleri%ROWTYPE;
  v_ayar public.maliyet_hesaplama_ayar_surmleri%ROWTYPE;
  v_en numeric;
  v_boy numeric;
  v_alan numeric;
  v_cevre numeric;
  v_katmanlar text[];
  v_bosluk_sayisi integer;
  v_sira integer;
  v_deger numeric;
  v_grup_kodu text;
  v_profil record;
  v_kaynak jsonb;
  v_miktar numeric;
  v_firesiz_miktar numeric;
  v_baz numeric;
  v_vade numeric;
  v_toplam numeric;
  v_fire numeric;
  v_kur_etkisi numeric;
  v_cam_toplam numeric := 0;
  v_cita_toplam numeric := 0;
  v_sarf_toplam numeric := 0;
  v_fire_toplam numeric := 0;
  v_vade_toplam numeric := 0;
  v_kur_toplam numeric := 0;
  v_bilesenler jsonb := '[]'::jsonb;
  v_uyarilar jsonb := '[]'::jsonb;
  v_parametre_surumu_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT * INTO v_stok
  FROM public.stok
  WHERE id = p_stok_id AND aktif;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AKTIF_URUN_STOGU_BULUNAMADI';
  END IF;

  SELECT * INTO v_yapi
  FROM public.stok_maliyet_yapi_surmleri
  WHERE stok_id = p_stok_id AND gecerlilik_donemi @> v_tarih
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'gecerli', false,
      'stok_id', p_stok_id,
      'hesaplama_tarihi', v_tarih,
      'hesaplama_surumu', c_hesaplama_surumu,
      'uyarilar', jsonb_build_array(jsonb_build_object(
        'kod', 'STOK_YAPI_SURUMU_EKSIK',
        'mesaj', 'Sorgulanan tarihte geçerli stok katman yapısı bulunamadı.'
      )),
      'bilesenler', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_ayar
  FROM public.maliyet_hesaplama_ayar_surmleri
  WHERE gecerli_baslangic <= v_tarih
  ORDER BY gecerli_baslangic DESC, created_at DESC, id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'gecerli', false,
      'stok_id', p_stok_id,
      'stok_yapi_surumu', v_yapi.id,
      'hesaplama_tarihi', v_tarih,
      'hesaplama_surumu', c_hesaplama_surumu,
      'uyarilar', jsonb_build_array(jsonb_build_object(
        'kod', 'MALIYET_HESAPLAMA_AYARI_EKSIK',
        'mesaj', 'Sorgulanan tarihte geçerli finansman ve referans ölçü ayarı yok.'
      )),
      'bilesenler', '[]'::jsonb
    );
  END IF;

  v_en := COALESCE(p_en_mm, v_ayar.referans_en_mm);
  v_boy := COALESCE(p_boy_mm, v_ayar.referans_boy_mm);
  IF v_en <= 0 OR v_boy <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REFERANS_OLCUSU_GECERSIZ';
  END IF;
  v_alan := (v_en / 1000) * (v_boy / 1000);
  v_cevre := 2 * ((v_en / 1000) + (v_boy / 1000));
  v_katmanlar := string_to_array(v_yapi.katman_yapisi, '+');
  IF cardinality(v_katmanlar) < 3 OR cardinality(v_katmanlar) % 2 = 0 THEN
    RETURN jsonb_build_object(
      'gecerli', false,
      'stok_id', p_stok_id,
      'stok_yapi_surumu', v_yapi.id,
      'hesaplama_tarihi', v_tarih,
      'hesaplama_surumu', c_hesaplama_surumu,
      'uyarilar', jsonb_build_array(jsonb_build_object(
        'kod', 'KATMAN_YAPISI_DESTEKLENMIYOR',
        'mesaj', v_yapi.katman_yapisi
      )),
      'bilesenler', '[]'::jsonb
    );
  END IF;
  v_bosluk_sayisi := (cardinality(v_katmanlar) - 1) / 2;

  FOR v_sira IN 1..cardinality(v_katmanlar) LOOP
    BEGIN
      v_deger := v_katmanlar[v_sira]::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      v_uyarilar := v_uyarilar || jsonb_build_array(jsonb_build_object(
        'kod', 'KATMAN_DEGERI_GECERSIZ',
        'bilesen', v_katmanlar[v_sira]
      ));
      CONTINUE;
    END;

    IF v_sira % 2 = 1 THEN
      v_grup_kodu := CASE
        WHEN v_sira > 1 THEN 'duz'
        WHEN upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%KONFOR%' THEN 'konfor'
        WHEN upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%SINERJI%'
          OR upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%SİNERJİ%' THEN 'sinerji'
        WHEN upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%BUZLU%' THEN 'buzlu'
        WHEN upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%FÜME%'
          OR upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%FUME%' THEN 'fume'
        WHEN upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%BRONZ%' THEN 'bronz'
        WHEN upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%REFLEKTE%' THEN 'reflekte'
        WHEN upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%SATINA%' THEN 'satina'
        WHEN upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%LAMİNE%'
          OR upper(v_stok.ad || ' ' || COALESCE(v_stok.grup, '')) LIKE '%LAMINE%' THEN 'lamine'
        ELSE 'duz'
      END;
      SELECT profil.*, grup.ad AS grup_adi
      INTO v_profil
      FROM public.stok_maliyet_profilleri profil
      JOIN public.cam_fiyat_gruplari grup ON grup.id = profil.cam_fiyat_grubu_id
      WHERE profil.profil_turu = 'cam'
        AND profil.olcu_mm = v_deger
        AND grup.kod = v_grup_kodu
        AND profil.gecerlilik_donemi @> v_tarih
      LIMIT 1;
      v_firesiz_miktar := v_alan;
    ELSE
      SELECT profil.*, 'Çıta'::text AS grup_adi
      INTO v_profil
      FROM public.stok_maliyet_profilleri profil
      WHERE profil.profil_turu = 'cita'
        AND profil.olcu_mm = v_deger
        AND profil.gecerlilik_donemi @> v_tarih
      ORDER BY CASE profil.cita_malzeme_turu WHEN 'aluminyum' THEN 0 ELSE 1 END
      LIMIT 1;
      v_firesiz_miktar := v_cevre;
    END IF;

    IF v_profil.id IS NULL THEN
      v_uyarilar := v_uyarilar || jsonb_build_array(jsonb_build_object(
        'kod', CASE WHEN v_sira % 2 = 1 THEN 'CAM_PROFILI_EKSIK' ELSE 'CITA_PROFILI_EKSIK' END,
        'bilesen', v_deger,
        'sira', v_sira
      ));
      CONTINUE;
    END IF;
    v_parametre_surumu_ids := array_append(v_parametre_surumu_ids, v_profil.id);
    SELECT to_jsonb(kaynak) INTO v_kaynak
    FROM public.stok_maliyet_kaynagi_coz(v_profil.stok_id, v_an) kaynak;
    IF v_kaynak IS NULL OR v_kaynak ->> 'fiyat_id' IS NULL THEN
      v_uyarilar := v_uyarilar || jsonb_build_array(jsonb_build_object(
        'kod', 'AKTIF_MALIYET_KAYNAGI_EKSIK',
        'stok_id', v_profil.stok_id
      ));
      CONTINUE;
    END IF;
    IF v_kaynak ->> 'faiz_dahil_birim_maliyet_try' IS NULL THEN
      v_uyarilar := v_uyarilar || jsonb_build_array(jsonb_build_object(
        'kod', 'KUR_VEYA_VADE_PARAMETRESI_EKSIK',
        'stok_id', v_profil.stok_id,
        'fiyat_id', v_kaynak ->> 'fiyat_id'
      ));
      CONTINUE;
    END IF;

    v_miktar := v_firesiz_miktar * (1 + v_profil.fire_orani / 100);
    v_baz := v_miktar * (v_kaynak ->> 'baz_birim_maliyet_try')::numeric;
    v_vade := v_miktar * (v_kaynak ->> 'finansman_birim_etkisi_try')::numeric;
    v_toplam := v_miktar * (v_kaynak ->> 'faiz_dahil_birim_maliyet_try')::numeric;
    v_fire := (v_miktar - v_firesiz_miktar)
      * (v_kaynak ->> 'faiz_dahil_birim_maliyet_try')::numeric;
    v_kur_etkisi := CASE
      WHEN (v_kaynak ->> 'para_birimi') = 'TRY' THEN 0
      ELSE v_miktar * (
        (v_kaynak ->> 'baz_birim_maliyet_try')::numeric
        - (v_kaynak ->> 'stok_birim_fiyati')::numeric
      )
    END;

    IF v_sira % 2 = 1 THEN v_cam_toplam := v_cam_toplam + v_toplam;
    ELSE v_cita_toplam := v_cita_toplam + v_toplam; END IF;
    v_fire_toplam := v_fire_toplam + v_fire;
    v_vade_toplam := v_vade_toplam + v_vade;
    v_kur_toplam := v_kur_toplam + v_kur_etkisi;
    v_bilesenler := v_bilesenler || jsonb_build_array(jsonb_build_object(
      'tur', CASE WHEN v_sira % 2 = 1 THEN 'cam' ELSE 'cita' END,
      'stok_id', v_profil.stok_id,
      'stok_kodu', (SELECT kod FROM public.stok WHERE id = v_profil.stok_id),
      'ad', (SELECT ad FROM public.stok WHERE id = v_profil.stok_id),
      'miktar', round(v_miktar, 8),
      'birim', v_profil.stok_ana_birimi,
      'fire_orani', v_profil.fire_orani,
      'fire_etkisi', round(v_fire, 6),
      'baz_maliyet', round(v_baz, 6),
      'vade_etkisi', round(v_vade, 6),
      'kur_etkisi', round(v_kur_etkisi, 6),
      'toplam_maliyet', round(v_toplam, 6),
      'fiyat_id', v_kaynak -> 'fiyat_id',
      'fiyat_kaynagi_id', v_kaynak -> 'kaynak_id',
      'kaynak_turu', v_kaynak -> 'kaynak_turu',
      'baglanti_id', v_kaynak -> 'baglanti_id',
      'tedarikci_id', v_kaynak -> 'tedarikci_id',
      'tedarikci', v_kaynak -> 'tedarikci_adi',
      'kur_id', v_kaynak -> 'kur_id',
      'vade_parametre_id', v_kaynak -> 'vade_parametre_id',
      'parametre_surumu', v_profil.id,
      'gecerlilik_baslangici', v_kaynak -> 'gecerlilik_baslangici',
      'gecerlilik_bitisi', v_kaynak -> 'gecerlilik_bitisi'
    ));
  END LOOP;

  FOR v_profil IN
    SELECT profil.*, stok.kod AS stok_kodu, stok.ad AS stok_adi
    FROM public.stok_maliyet_profilleri profil
    JOIN public.stok stok ON stok.id = profil.stok_id AND stok.aktif
    WHERE profil.profil_turu = 'sarf'
      AND profil.gecerlilik_donemi @> v_tarih
    ORDER BY stok.ad, stok.id
  LOOP
    v_parametre_surumu_ids := array_append(v_parametre_surumu_ids, v_profil.id);
    SELECT to_jsonb(kaynak) INTO v_kaynak
    FROM public.stok_maliyet_kaynagi_coz(v_profil.stok_id, v_an) kaynak;
    IF v_kaynak IS NULL OR v_kaynak ->> 'fiyat_id' IS NULL THEN
      v_uyarilar := v_uyarilar || jsonb_build_array(jsonb_build_object(
        'kod', 'SARF_AKTIF_MALIYET_KAYNAGI_EKSIK',
        'stok_id', v_profil.stok_id,
        'bilesen', v_profil.stok_adi
      ));
      CONTINUE;
    END IF;
    IF v_kaynak ->> 'faiz_dahil_birim_maliyet_try' IS NULL THEN
      v_uyarilar := v_uyarilar || jsonb_build_array(jsonb_build_object(
        'kod', 'KUR_VEYA_VADE_PARAMETRESI_EKSIK',
        'stok_id', v_profil.stok_id,
        'fiyat_id', v_kaynak ->> 'fiyat_id'
      ));
      CONTINUE;
    END IF;

    v_firesiz_miktar := CASE v_profil.hesaplama_tipi
      WHEN 'cevre_m' THEN v_profil.tuketim_katsayisi * v_cevre
      WHEN 'm2' THEN v_profil.tuketim_katsayisi * v_alan
      WHEN 'adet' THEN v_profil.tuketim_katsayisi
      WHEN 'sabit' THEN v_profil.tuketim_katsayisi
    END * CASE WHEN v_profil.bosluk_basi THEN GREATEST(v_bosluk_sayisi, 1) ELSE 1 END;
    v_miktar := v_firesiz_miktar * (1 + v_profil.fire_orani / 100);
    v_baz := v_miktar * (v_kaynak ->> 'baz_birim_maliyet_try')::numeric;
    v_vade := v_miktar * (v_kaynak ->> 'finansman_birim_etkisi_try')::numeric;
    v_toplam := v_miktar * (v_kaynak ->> 'faiz_dahil_birim_maliyet_try')::numeric;
    v_fire := (v_miktar - v_firesiz_miktar)
      * (v_kaynak ->> 'faiz_dahil_birim_maliyet_try')::numeric;
    v_kur_etkisi := CASE
      WHEN (v_kaynak ->> 'para_birimi') = 'TRY' THEN 0
      ELSE v_miktar * (
        (v_kaynak ->> 'baz_birim_maliyet_try')::numeric
        - (v_kaynak ->> 'stok_birim_fiyati')::numeric
      )
    END;
    v_sarf_toplam := v_sarf_toplam + v_toplam;
    v_fire_toplam := v_fire_toplam + v_fire;
    v_vade_toplam := v_vade_toplam + v_vade;
    v_kur_toplam := v_kur_toplam + v_kur_etkisi;
    v_bilesenler := v_bilesenler || jsonb_build_array(jsonb_build_object(
      'tur', 'sarf',
      'stok_id', v_profil.stok_id,
      'stok_kodu', v_profil.stok_kodu,
      'ad', v_profil.stok_adi,
      'miktar', round(v_miktar, 8),
      'birim', v_profil.stok_ana_birimi,
      'fire_orani', v_profil.fire_orani,
      'fire_etkisi', round(v_fire, 6),
      'baz_maliyet', round(v_baz, 6),
      'vade_etkisi', round(v_vade, 6),
      'kur_etkisi', round(v_kur_etkisi, 6),
      'toplam_maliyet', round(v_toplam, 6),
      'fiyat_id', v_kaynak -> 'fiyat_id',
      'fiyat_kaynagi_id', v_kaynak -> 'kaynak_id',
      'kaynak_turu', v_kaynak -> 'kaynak_turu',
      'baglanti_id', v_kaynak -> 'baglanti_id',
      'tedarikci_id', v_kaynak -> 'tedarikci_id',
      'tedarikci', v_kaynak -> 'tedarikci_adi',
      'kur_id', v_kaynak -> 'kur_id',
      'vade_parametre_id', v_kaynak -> 'vade_parametre_id',
      'parametre_surumu', v_profil.id,
      'gecerlilik_baslangici', v_kaynak -> 'gecerlilik_baslangici',
      'gecerlilik_bitisi', v_kaynak -> 'gecerlilik_bitisi'
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'gecerli', jsonb_array_length(v_uyarilar) = 0,
    'stok_id', v_stok.id,
    'stok_kodu', v_stok.kod,
    'urun_adi', v_stok.ad,
    'urun_grubu', v_stok.grup,
    'katman_yapisi', v_yapi.katman_yapisi,
    'hesaplama_tarihi', v_tarih,
    'hesaplama_surumu', c_hesaplama_surumu,
    'stok_yapi_surumu', v_yapi.id,
    'referans_en_mm', v_en,
    'referans_boy_mm', v_boy,
    'referans_alan_m2', round(v_alan, 6),
    'referans_cevre_m', round(v_cevre, 6),
    'para_birimi', 'TRY',
    'cam_maliyeti', round(v_cam_toplam, 2),
    'cita_maliyeti', round(v_cita_toplam, 2),
    'sarf_maliyeti', round(v_sarf_toplam, 2),
    'fire_etkisi', round(v_fire_toplam, 2),
    'vade_etkisi', round(v_vade_toplam, 2),
    'kur_etkisi', round(v_kur_toplam, 2),
    'toplam_maliyet', round(v_cam_toplam + v_cita_toplam + v_sarf_toplam, 2),
    'baz_maliyet', round(
      v_cam_toplam + v_cita_toplam + v_sarf_toplam - v_vade_toplam,
      2
    ),
    'finansman_etkisi', round(v_vade_toplam, 2),
    'm2_maliyet', CASE WHEN v_alan = 0 THEN 0 ELSE
      round((v_cam_toplam + v_cita_toplam + v_sarf_toplam) / v_alan, 2) END,
    'vade_parametre_id', v_ayar.id,
    'tuketim_parametre_surumu', to_jsonb(v_parametre_surumu_ids),
    'fire_parametre_surumu', to_jsonb(v_parametre_surumu_ids),
    'bilesenler', v_bilesenler,
    'uyarilar', v_uyarilar,
    'eksikler', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'kod', value ->> 'kod',
        'bilesen', COALESCE(value ->> 'bilesen', value ->> 'stok_id', '')
      )), '[]'::jsonb)
      FROM jsonb_array_elements(v_uyarilar)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.urun_maliyeti_hesapla(
  p_stok_id uuid,
  p_tarih date DEFAULT NULL,
  p_en_mm numeric DEFAULT NULL,
  p_boy_mm numeric DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (public.urun_maliyeti_detayli_hesapla(
    p_stok_id, p_tarih, p_en_mm, p_boy_mm
  ) ->> 'toplam_maliyet')::numeric
$$;

CREATE OR REPLACE FUNCTION public.urun_maliyetlerini_hesapla(
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
  v_urun record;
  v_sonuc jsonb;
  v_urunler jsonb := '[]'::jsonb;
  v_gecerli integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;
  FOR v_urun IN
    SELECT stok.id
    FROM public.stok stok
    WHERE stok.aktif
      AND stok.kategori = 'cam'
      AND EXISTS (
        SELECT 1
        FROM public.stok_maliyet_yapi_surmleri yapi
        WHERE yapi.stok_id = stok.id AND yapi.gecerlilik_donemi @> v_tarih
      )
    ORDER BY stok.ad, stok.id
  LOOP
    v_sonuc := public.urun_maliyeti_detayli_hesapla(
      v_urun.id, v_tarih, p_en_mm, p_boy_mm
    );
    v_urunler := v_urunler || jsonb_build_array(v_sonuc);
    IF COALESCE((v_sonuc ->> 'gecerli')::boolean, false) THEN
      v_gecerli := v_gecerli + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'gecerli', true,
    'hesaplama_surumu', 'stok-maliyet-v2',
    'hesaplama_tarihi', v_tarih,
    'para_birimi', 'TRY',
    'urun_sayisi', jsonb_array_length(v_urunler),
    'gecerli_urun_sayisi', v_gecerli,
    'eksik_urun_sayisi', jsonb_array_length(v_urunler) - v_gecerli,
    'urunler', v_urunler
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_katalogu_getir(
  p_tarih date DEFAULT NULL
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
  v_an timestamptz := (v_tarih::timestamp AT TIME ZONE 'Europe/Istanbul');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;
  RETURN jsonb_build_object(
    'profiller', COALESCE((
      SELECT jsonb_agg(to_jsonb(profil_satiri) ORDER BY profil_satiri.kategori, profil_satiri.stok_kodu)
      FROM (
        SELECT
          profil.id,
          profil.stok_id,
          profil.profil_turu,
          stok.kod AS stok_kodu,
          stok.ad AS stok_adi,
          stok.kategori,
          stok.grup,
          stok.birim,
          profil.cam_fiyat_grubu_id,
          cam.kod AS cam_fiyat_grubu_kodu,
          cam.ad AS cam_fiyat_grubu_adi,
          profil.cita_malzeme_turu,
          profil.olcu_mm,
          profil.hesaplama_tipi,
          profil.tuketim_katsayisi,
          profil.bosluk_basi,
          profil.fire_orani,
          profil.fiyat_birimi,
          profil.stok_ana_birimi,
          profil.donusum_katsayisi,
          lower(profil.gecerlilik_donemi) AS gecerlilik_baslangici,
          CASE WHEN upper_inf(profil.gecerlilik_donemi)
            THEN NULL ELSE upper(profil.gecerlilik_donemi) END AS gecerlilik_bitisi,
          profil.revision_no
        FROM public.stok_maliyet_profilleri profil
        JOIN public.stok stok ON stok.id = profil.stok_id AND stok.aktif
        LEFT JOIN public.cam_fiyat_gruplari cam ON cam.id = profil.cam_fiyat_grubu_id
        WHERE profil.gecerlilik_donemi @> v_tarih
      ) profil_satiri
    ), '[]'::jsonb),
    'fiyatlar', COALESCE((
      SELECT jsonb_agg(to_jsonb(ozet) ORDER BY ozet.kategori, ozet.stok_kodu)
      FROM public.stok_maliyet_ozetleri(v_an) ozet
    ), '[]'::jsonb),
    'ayarlar', COALESCE((
      SELECT jsonb_agg(to_jsonb(ayar) ORDER BY ayar.gecerli_baslangic DESC, ayar.created_at DESC)
      FROM public.maliyet_hesaplama_ayar_surmleri ayar
      WHERE ayar.gecerli_baslangic <= v_tarih
    ), '[]'::jsonb),
    'tedarikciler', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cari.id,
        'kod', cari.kod,
        'ad', cari.ad,
        'tedarik_kapsamlari', cari.tedarik_kapsamlari
      ) ORDER BY cari.ad)
      FROM public.cari cari
      WHERE cari.tipi = 'tedarikci' AND cari.aktif
    ), '[]'::jsonb),
    'cam_fiyat_gruplari', COALESCE((
      SELECT jsonb_agg(to_jsonb(grup) ORDER BY grup.sira_no)
      FROM public.cam_fiyat_gruplari grup
      WHERE grup.aktif
    ), '[]'::jsonb),
    'aday_stoklar', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', stok.id,
        'kod', stok.kod,
        'ad', stok.ad,
        'kategori', stok.kategori,
        'grup', stok.grup,
        'kalinlik_mm', stok.kalinlik_mm,
        'birim', stok.birim
      ) ORDER BY stok.kategori, stok.kod)
      FROM public.stok stok
      WHERE stok.aktif
        AND stok.ticari_kapsam IN ('maliyet_bileseni', 'her_ikisi')
        AND NOT EXISTS (
          SELECT 1
          FROM public.stok_maliyet_profilleri profil
          WHERE profil.stok_id = stok.id
            AND profil.gecerlilik_donemi @> v_tarih
        )
    ), '[]'::jsonb),
    'hesap', public.urun_maliyetlerini_hesapla(v_tarih, NULL, NULL)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tedarikci_maliyet_detayi_getir(
  p_tedarikci_id uuid
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
    'baglantilar', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(baglanti) || jsonb_build_object(
          'kalemler', COALESCE((
            SELECT jsonb_agg(
              to_jsonb(kalem) || jsonb_build_object(
                'cam_fiyat_grubu_adi', grup.ad,
                'stok_ids', COALESCE((
                  SELECT jsonb_agg(esleme.stok_id)
                  FROM public.cam_tedarik_baglanti_kalem_stoklari esleme
                  WHERE esleme.baglanti_kalemi_id = kalem.id
                ), '[]'::jsonb)
              )
              ORDER BY grup.sira_no
            )
            FROM public.cam_tedarik_baglanti_kalemleri kalem
            JOIN public.cam_fiyat_gruplari grup ON grup.id = kalem.cam_fiyat_grubu_id
            WHERE kalem.baglanti_id = baglanti.id
          ), '[]'::jsonb)
        )
        ORDER BY baglanti.created_at DESC
      )
      FROM public.cam_tedarik_baglantilari baglanti
      WHERE baglanti.tedarikci_id = p_tedarikci_id
    ), '[]'::jsonb),
    'fiyatlar', COALESCE((
      SELECT jsonb_agg(to_jsonb(fiyat) ORDER BY fiyat.fiyat_tarihi DESC)
      FROM public.stok_alis_fiyati_tarihcesi(NULL, p_tedarikci_id, 1000) fiyat
    ), '[]'::jsonb),
    'engeller', jsonb_build_object(
      'aktif_cam_baglantisi_sayisi', (
        SELECT count(*) FROM public.cam_tedarik_baglantilari
        WHERE tedarikci_id = p_tedarikci_id AND durum = 'aktif'
      ),
      'aktif_stok_fiyati_sayisi', (
        SELECT count(*)
        FROM public.stok_maliyet_kaynagi_atamalari atama
        JOIN public.stok_alis_fiyatlari fiyat ON fiyat.id = atama.fiyat_id
        WHERE fiyat.tedarikci_id = p_tedarikci_id
          AND atama.gecerlilik_donemi @> clock_timestamp()
      ),
      'gelecek_fiyat_donemi_sayisi', (
        SELECT count(*)
        FROM public.stok_maliyet_kaynagi_atamalari atama
        JOIN public.stok_alis_fiyatlari fiyat ON fiyat.id = atama.fiyat_id
        WHERE fiyat.tedarikci_id = p_tedarikci_id
          AND lower(atama.gecerlilik_donemi) > clock_timestamp()
      ),
      'bagli_stok_sayisi', (
        SELECT count(DISTINCT fiyat.stok_id)
        FROM public.stok_alis_fiyatlari fiyat
        WHERE fiyat.tedarikci_id = p_tedarikci_id
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stok_maliyet_kaynagi_coz(uuid, timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_maliyet_ozetleri(timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_alis_fiyati_tarihcesi(uuid, uuid, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.urun_maliyeti_detayli_hesapla(uuid, date, numeric, numeric)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.urun_maliyeti_hesapla(uuid, date, numeric, numeric)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.urun_maliyetlerini_hesapla(date, numeric, numeric)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_maliyet_katalogu_getir(date)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tedarikci_maliyet_detayi_getir(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.stok_maliyet_kaynagi_coz(uuid, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_maliyet_ozetleri(timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_alis_fiyati_tarihcesi(uuid, uuid, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.urun_maliyeti_detayli_hesapla(uuid, date, numeric, numeric)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.urun_maliyeti_hesapla(uuid, date, numeric, numeric)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.urun_maliyetlerini_hesapla(date, numeric, numeric)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_maliyet_katalogu_getir(date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tedarikci_maliyet_detayi_getir(uuid)
  TO authenticated;
