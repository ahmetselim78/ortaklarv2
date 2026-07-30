-- Cari bağlantısı fiyat ekranı ve Excel şablonu için cam kataloğunu
-- kategori bilgisiyle döndürür. Taslak kaydında aktif/satılabilir cam
-- kümesinin eksiksiz ve tekrarsız gönderilmesini sunucu tarafında da doğrular.

CREATE OR REPLACE FUNCTION public.cari_baglanti_taslak_kaydet(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cari_id uuid := public.ticari_guvenli_uuid(p_payload ->> 'cari_id');
  v_para public.para_birimi_kodu;
  v_tutar numeric := public.ticari_guvenli_numeric(p_payload ->> 'on_odeme_tutari');
  v_liste_id uuid;
  v_ana_liste_id uuid;
  v_surum_id uuid := gen_random_uuid();
  v_surum_no integer;
  v_baglanti_id uuid := gen_random_uuid();
  v_baglanti_no text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_permission('pricing', 'create')
    AND public.has_permission('pricing', 'update')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_UPDATE_YETKISI_GEREKLI';
  END IF;

  BEGIN
    v_para := (p_payload ->> 'para_birimi')::public.para_birimi_kodu;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PARA_BIRIMI_GECERSIZ';
  END;

  IF v_cari_id IS NULL OR v_tutar IS NULL OR v_tutar <= 0
     OR v_tutar::text IN ('NaN', 'Infinity', '-Infinity')
     OR NULLIF(p_payload ->> 'odeme_tarihi', '') IS NULL
     OR length(trim(COALESCE(p_payload ->> 'odeme_yontemi', ''))) < 2
     OR p_payload -> 'fiyatlar' IS NULL
     OR jsonb_typeof(p_payload -> 'fiyatlar') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BAGLANTI_GIRDISI_GECERSIZ';
  END IF;
  IF jsonb_array_length(p_payload -> 'fiyatlar') = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BAGLANTI_GIRDISI_GECERSIZ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cari
    WHERE id = v_cari_id AND tipi = 'musteri' AND aktif
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AKTIF_MUSTERI_BULUNAMADI';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload -> 'fiyatlar') fiyat(value)
    WHERE public.ticari_guvenli_uuid(fiyat.value ->> 'stok_id') IS NULL
       OR public.ticari_guvenli_numeric(fiyat.value ->> 'birim_fiyat') IS NULL
       OR public.ticari_guvenli_numeric(fiyat.value ->> 'birim_fiyat') < 0
       OR public.ticari_guvenli_numeric(fiyat.value ->> 'birim_fiyat')::text
            IN ('NaN', 'Infinity', '-Infinity')
       OR public.ticari_guvenli_numeric(fiyat.value ->> 'birim_fiyat') >= 1000000000000
       OR public.ticari_guvenli_numeric(fiyat.value ->> 'birim_fiyat')
            <> round(public.ticari_guvenli_numeric(fiyat.value ->> 'birim_fiyat'), 6)
       OR public.ticari_guvenli_uuid(fiyat.value ->> 'kdv_grubu_id') IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CAM_FIYAT_SATIRI_GECERSIZ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload -> 'fiyatlar') fiyat(value)
    GROUP BY public.ticari_guvenli_uuid(fiyat.value ->> 'stok_id')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CAM_FIYAT_LISTESINDE_TEKRAR_VAR';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      (
        SELECT stok.id
        FROM public.stok stok
        WHERE stok.kategori = 'cam'
          AND stok.aktif
          AND stok.ticari_kapsam IN ('satilabilir', 'her_ikisi')
        EXCEPT
        SELECT public.ticari_guvenli_uuid(fiyat.value ->> 'stok_id')
        FROM jsonb_array_elements(p_payload -> 'fiyatlar') fiyat(value)
      )
      UNION ALL
      (
        SELECT public.ticari_guvenli_uuid(fiyat.value ->> 'stok_id')
        FROM jsonb_array_elements(p_payload -> 'fiyatlar') fiyat(value)
        EXCEPT
        SELECT stok.id
        FROM public.stok stok
        WHERE stok.kategori = 'cam'
          AND stok.aktif
          AND stok.ticari_kapsam IN ('satilabilir', 'her_ikisi')
      )
    ) katalog_farki
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CAM_FIYAT_LISTESI_EKSIK_VEYA_GECERSIZ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload -> 'fiyatlar') fiyat(value)
    LEFT JOIN public.kdv_gruplari kdv
      ON kdv.id = public.ticari_guvenli_uuid(fiyat.value ->> 'kdv_grubu_id')
     AND kdv.aktif
    WHERE kdv.id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CAM_FIYAT_KDV_GRUBU_GECERSIZ';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cari_baglanti:' || v_cari_id::text || ':' || v_para::text, 0));

  SELECT liste.id
  INTO v_liste_id
  FROM public.fiyat_listeleri liste
  WHERE liste.cari_id = v_cari_id
    AND liste.tur = 'musteri'
    AND liste.aktif
  LIMIT 1;

  SELECT surum.ana_fiyat_listesi_id
  INTO v_ana_liste_id
  FROM public.musteri_ticari_profilleri profil
  JOIN public.musteri_ticari_profil_surmleri surum
    ON surum.musteri_ticari_profili_id = profil.id
  WHERE profil.cari_id = v_cari_id
    AND profil.aktif
    AND surum.durum = 'yayinda'
  ORDER BY surum.surum_no DESC
  LIMIT 1;

  IF v_ana_liste_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EKSIK_MUSTERI_TICARI_PROFILI';
  END IF;

  IF v_liste_id IS NULL THEN
    v_liste_id := gen_random_uuid();
    INSERT INTO public.fiyat_listeleri (
      id, kod, ad, tur, miras_ana_fiyat_listesi_id, cari_id,
      aktif, olusturan_kullanici_id
    )
    SELECT
      v_liste_id,
      'BAG-' || regexp_replace(upper(cari.kod), '[^A-Z0-9._-]', '-', 'g')
        || '-' || left(replace(v_cari_id::text, '-', ''), 8),
      cari.ad || ' bağlantı fiyatları',
      'musteri',
      v_ana_liste_id,
      v_cari_id,
      true,
      auth.uid()
    FROM public.cari
    WHERE id = v_cari_id;
  END IF;

  SELECT COALESCE(max(surum_no), 0) + 1
  INTO v_surum_no
  FROM public.fiyat_listesi_surmleri
  WHERE fiyat_listesi_id = v_liste_id;

  INSERT INTO public.fiyat_listesi_surmleri (
    id, fiyat_listesi_id, surum_no, durum, gecerli_baslangic,
    revision_no, aciklama, olusturan_kullanici_id
  )
  VALUES (
    v_surum_id, v_liste_id, v_surum_no, 'taslak',
    (p_payload ->> 'odeme_tarihi')::date, 1,
    NULLIF(p_payload ->> 'aciklama', ''), auth.uid()
  );

  INSERT INTO public.fiyat_listesi_urun_kalemleri (
    fiyat_listesi_surumu_id, kapsam_tipi, stok_id, birim_fiyat,
    para_birimi, kdv_grubu_id, minimum_m2, en_adimi_mm, boy_adimi_mm,
    aktif, olusturan_kullanici_id
  )
  SELECT
    v_surum_id,
    'stok',
    public.ticari_guvenli_uuid(fiyat.value ->> 'stok_id'),
    public.ticari_guvenli_numeric(fiyat.value ->> 'birim_fiyat'),
    v_para,
    public.ticari_guvenli_uuid(fiyat.value ->> 'kdv_grubu_id'),
    public.ticari_guvenli_numeric(fiyat.value ->> 'minimum_m2'),
    public.ticari_guvenli_numeric(fiyat.value ->> 'en_adimi_mm'),
    public.ticari_guvenli_numeric(fiyat.value ->> 'boy_adimi_mm'),
    true,
    auth.uid()
  FROM jsonb_array_elements(p_payload -> 'fiyatlar') fiyat(value);

  v_baglanti_no := 'BAG-'
    || extract(year FROM (p_payload ->> 'odeme_tarihi')::date)::integer::text
    || '-' || lpad(public.sonraki_sayac(
      'cari_baglanti_' || extract(year FROM (p_payload ->> 'odeme_tarihi')::date)::integer::text,
      1
    )::text, 5, '0');

  INSERT INTO public.cari_baglantilari (
    id, baglanti_no, cari_id, para_birimi, on_odeme_tutari,
    fiyat_listesi_surumu_id, durum, odeme_tarihi, odeme_yontemi,
    aciklama, olusturan_kullanici_id
  )
  VALUES (
    v_baglanti_id, v_baglanti_no, v_cari_id, v_para, round(v_tutar, 2),
    v_surum_id, 'taslak', (p_payload ->> 'odeme_tarihi')::date,
    p_payload ->> 'odeme_yontemi', NULLIF(p_payload ->> 'aciklama', ''),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'basarili', true,
    'baglanti_id', v_baglanti_id,
    'baglanti_no', v_baglanti_no,
    'fiyat_listesi_surumu_id', v_surum_id,
    'revision_no', 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_hazirlik_getir(
  p_cari_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_surum_id uuid;
  v_ana_surum_id uuid;
  v_para public.para_birimi_kodu;
  v_varsayilan_kdv_grubu_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT baglanti.fiyat_listesi_surumu_id, baglanti.para_birimi
  INTO v_surum_id, v_para
  FROM public.cari_baglantilari baglanti
  WHERE baglanti.cari_id = p_cari_id
    AND baglanti.durum IN ('taslak', 'onaylandi')
  ORDER BY
    CASE WHEN baglanti.durum = 'onaylandi' THEN 0 ELSE 1 END,
    baglanti.sira_no DESC NULLS LAST,
    baglanti.created_at DESC
  LIMIT 1;

  SELECT
    COALESCE(v_para, profil_surumu.varsayilan_para_birimi),
    profil_surumu.varsayilan_kdv_grubu_id,
    (
      SELECT fiyat_surumu.id
      FROM public.fiyat_listesi_surmleri fiyat_surumu
      WHERE fiyat_surumu.fiyat_listesi_id = profil_surumu.ana_fiyat_listesi_id
        AND fiyat_surumu.durum = 'yayinda'
      ORDER BY fiyat_surumu.surum_no DESC
      LIMIT 1
    ),
    COALESCE(
      v_surum_id,
      (
        SELECT fiyat_surumu.id
        FROM public.fiyat_listesi_surmleri fiyat_surumu
        WHERE fiyat_surumu.fiyat_listesi_id = profil_surumu.musteri_fiyat_listesi_id
          AND fiyat_surumu.durum = 'yayinda'
        ORDER BY fiyat_surumu.surum_no DESC
        LIMIT 1
      )
    )
  INTO v_para, v_varsayilan_kdv_grubu_id, v_ana_surum_id, v_surum_id
  FROM public.musteri_ticari_profilleri profil
  JOIN public.musteri_ticari_profil_surmleri profil_surumu
    ON profil_surumu.musteri_ticari_profili_id = profil.id
  WHERE profil.cari_id = p_cari_id
    AND profil.aktif
    AND profil_surumu.durum = 'yayinda'
  ORDER BY profil_surumu.surum_no DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'fiyat_listesi_surumu_id', v_surum_id,
    'para_birimi', COALESCE(v_para, 'TRY'::public.para_birimi_kodu),
    'fiyatlar', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stok_id', stok.id,
        'stok_kodu', stok.kod,
        'stok_adi', stok.ad,
        'stok_grubu', COALESCE(NULLIF(btrim(stok.grup), ''), 'DİĞER CAMLAR'),
        'birim_fiyat', COALESCE(
          fiyat.birim_fiyat,
          ana_fiyat.birim_fiyat * (1 + COALESCE(fiyat.yuzde_fark, 0) / 100),
          ana_fiyat.birim_fiyat
        ),
        'kdv_grubu_id', COALESCE(
          fiyat.kdv_grubu_id,
          ana_fiyat.kdv_grubu_id,
          v_varsayilan_kdv_grubu_id
        ),
        'minimum_m2', COALESCE(fiyat.minimum_m2, ana_fiyat.minimum_m2),
        'en_adimi_mm', COALESCE(fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm),
        'boy_adimi_mm', COALESCE(fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm)
      ) ORDER BY
        COALESCE(NULLIF(btrim(stok.grup), ''), 'DİĞER CAMLAR'),
        stok.kod,
        stok.ad)
      FROM public.stok stok
      LEFT JOIN LATERAL (
        SELECT kalem.*
        FROM public.fiyat_listesi_urun_kalemleri kalem
        WHERE kalem.fiyat_listesi_surumu_id = v_surum_id
          AND kalem.aktif
          AND (
            (kalem.kapsam_tipi = 'stok' AND kalem.stok_id = stok.id)
            OR (kalem.kapsam_tipi = 'stok_grubu' AND kalem.stok_grubu = stok.grup)
            OR kalem.kapsam_tipi = 'genel'
          )
        ORDER BY CASE kalem.kapsam_tipi
          WHEN 'stok' THEN 1 WHEN 'stok_grubu' THEN 2 ELSE 3 END
        LIMIT 1
      ) fiyat ON true
      LEFT JOIN public.fiyat_listesi_urun_kalemleri ana_fiyat
        ON ana_fiyat.fiyat_listesi_surumu_id = v_ana_surum_id
       AND ana_fiyat.stok_id = stok.id
       AND ana_fiyat.aktif
      WHERE stok.kategori = 'cam'
        AND stok.aktif
        AND stok.ticari_kapsam IN ('satilabilir', 'her_ikisi')
    ), '[]'::jsonb),
    'kdv_gruplari', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'kod', kod, 'ad', ad) ORDER BY kod)
      FROM public.kdv_gruplari
      WHERE aktif
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cari_baglanti_taslak_kaydet(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cari_baglanti_hazirlik_getir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cari_baglanti_taslak_kaydet(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cari_baglanti_hazirlik_getir(uuid) TO authenticated;
