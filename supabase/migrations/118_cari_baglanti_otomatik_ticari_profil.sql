-- Cari bağlantısı, temiz kurulumda ayrıca ana liste/profil hazırlığı istemeden
-- çalışır. Taslak aşamasında yalnız yapısal ana liste oluşturulur; fiyat listesi
-- ve ticari profil ancak AAL2 ile yapılan bağlantı onayında yayımlanır.

CREATE OR REPLACE FUNCTION public.cari_baglanti_profili_listeye_bagla(
  p_cari_id uuid,
  p_fiyat_listesi_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profil_id uuid;
  v_ana_liste_id uuid;
  v_ana_surum_id uuid;
  v_kaynak_surum_id uuid;
  v_varsayilan_kdv_id uuid;
  v_para_birimi public.para_birimi_kodu;
  v_mevcut public.musteri_ticari_profil_surmleri%ROWTYPE;
  v_kaynak public.musteri_ticari_profil_surmleri%ROWTYPE;
  v_yeni_id uuid := gen_random_uuid();
  v_yeni_no integer;
BEGIN
  SELECT liste.miras_ana_fiyat_listesi_id
  INTO v_ana_liste_id
  FROM public.fiyat_listeleri liste
  WHERE liste.id = p_fiyat_listesi_id
    AND liste.tur = 'musteri'
    AND liste.cari_id = p_cari_id
    AND liste.aktif
  FOR UPDATE;

  IF v_ana_liste_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BAGLANTI_FIYAT_LISTESI_GECERSIZ';
  END IF;

  -- Pasife alınmış bir profil de bağlantı onayıyla tekrar kullanılabilir.
  SELECT profil.id
  INTO v_profil_id
  FROM public.musteri_ticari_profilleri profil
  JOIN public.musteri_ticari_profil_surmleri surum
    ON surum.musteri_ticari_profili_id = profil.id
  WHERE profil.cari_id = p_cari_id
    AND surum.durum = 'yayinda'
  ORDER BY surum.surum_no DESC
  LIMIT 1
  FOR UPDATE OF profil;

  IF v_profil_id IS NOT NULL THEN
    SELECT *
    INTO v_mevcut
    FROM public.musteri_ticari_profil_surmleri
    WHERE musteri_ticari_profili_id = v_profil_id
      AND durum = 'yayinda'
    ORDER BY surum_no DESC
    LIMIT 1
    FOR UPDATE;

    UPDATE public.musteri_ticari_profilleri
    SET aktif = true
    WHERE id = v_profil_id
      AND NOT aktif;

    IF v_mevcut.ana_fiyat_listesi_id IS DISTINCT FROM v_ana_liste_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BAGLANTI_ANA_FIYAT_LISTESI_CAKISMASI';
    END IF;

    IF v_mevcut.musteri_fiyat_listesi_id = p_fiyat_listesi_id THEN
      RETURN v_mevcut.id;
    END IF;

    UPDATE public.musteri_ticari_profil_surmleri
    SET durum = 'arsiv', updated_at = now()
    WHERE id = v_mevcut.id;

    SELECT COALESCE(max(surum_no), 0) + 1
    INTO v_yeni_no
    FROM public.musteri_ticari_profil_surmleri
    WHERE musteri_ticari_profili_id = v_profil_id;

    INSERT INTO public.musteri_ticari_profil_surmleri (
      id, musteri_ticari_profili_id, surum_no, durum, gecerli_baslangic,
      gecerli_bitis, ana_fiyat_listesi_id, musteri_fiyat_listesi_id,
      varsayilan_para_birimi, varsayilan_kdv_grubu_id, varsayilan_vade_gunu,
      vade_profili_id, vade_profili_surumu_id, nakliye_hesaplama_tipi,
      sabit_nakliye_satis_tutari, sabit_nakliye_maliyet_tutari,
      m2_nakliye_satis_tutari, m2_nakliye_maliyet_tutari,
      minimum_marj_yuzdesi_override, varsayilan_belge_notu,
      teklif_gecerlilik_gunu, onceki_surum_id, olusturan_kullanici_id,
      yayinlayan_kullanici_id, yayinlanma_tarihi, revision_no
    )
    VALUES (
      v_yeni_id, v_profil_id, v_yeni_no, 'yayinda',
      (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
      NULL, v_ana_liste_id, p_fiyat_listesi_id,
      v_mevcut.varsayilan_para_birimi, v_mevcut.varsayilan_kdv_grubu_id,
      v_mevcut.varsayilan_vade_gunu, v_mevcut.vade_profili_id,
      v_mevcut.vade_profili_surumu_id, v_mevcut.nakliye_hesaplama_tipi,
      v_mevcut.sabit_nakliye_satis_tutari, v_mevcut.sabit_nakliye_maliyet_tutari,
      v_mevcut.m2_nakliye_satis_tutari, v_mevcut.m2_nakliye_maliyet_tutari,
      v_mevcut.minimum_marj_yuzdesi_override, v_mevcut.varsayilan_belge_notu,
      v_mevcut.teklif_gecerlilik_gunu, v_mevcut.id, auth.uid(), auth.uid(),
      now(), 1
    );
    RETURN v_yeni_id;
  END IF;

  -- İlk bağlantıda ana listenin yayımlanmış sürümü yoksa, bağlantıda girilen
  -- eksiksiz cam fiyatlarını yalnızca yapısal başlangıç tabanı olarak kopyala.
  SELECT surum.id
  INTO v_ana_surum_id
  FROM public.fiyat_listesi_surmleri surum
  WHERE surum.fiyat_listesi_id = v_ana_liste_id
    AND surum.durum = 'yayinda'
  ORDER BY surum.surum_no DESC
  LIMIT 1;

  SELECT surum.id
  INTO v_kaynak_surum_id
  FROM public.fiyat_listesi_surmleri surum
  WHERE surum.fiyat_listesi_id = p_fiyat_listesi_id
    AND surum.durum IN ('taslak', 'arsiv', 'yayinda')
  ORDER BY
    CASE surum.durum WHEN 'taslak' THEN 0 WHEN 'yayinda' THEN 1 ELSE 2 END,
    surum.surum_no DESC
  LIMIT 1;

  IF v_kaynak_surum_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BAGLANTI_FIYAT_SURUMU_BULUNAMADI';
  END IF;

  IF v_ana_surum_id IS NULL THEN
    v_ana_surum_id := gen_random_uuid();
    SELECT COALESCE(max(surum_no), 0) + 1
    INTO v_yeni_no
    FROM public.fiyat_listesi_surmleri
    WHERE fiyat_listesi_id = v_ana_liste_id;

    INSERT INTO public.fiyat_listesi_surmleri (
      id, fiyat_listesi_id, surum_no, durum, gecerli_baslangic,
      gecerli_bitis, olusturan_kullanici_id, yayinlayan_kullanici_id,
      yayinlanma_tarihi, revision_no, aciklama
    )
    VALUES (
      v_ana_surum_id, v_ana_liste_id, v_yeni_no, 'taslak',
      (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
      NULL, auth.uid(), NULL, NULL, 1,
      'İlk cari bağlantısı sırasında otomatik oluşturulan başlangıç sürümü'
    );

    INSERT INTO public.fiyat_listesi_urun_kalemleri (
      fiyat_listesi_surumu_id, kapsam_tipi, stok_id, stok_grubu,
      birim_fiyat, yuzde_fark, para_birimi, kdv_grubu_id,
      minimum_m2, en_adimi_mm, boy_adimi_mm, aktif,
      olusturan_kullanici_id
    )
    SELECT
      v_ana_surum_id, kalem.kapsam_tipi, kalem.stok_id, kalem.stok_grubu,
      kalem.birim_fiyat, kalem.yuzde_fark, kalem.para_birimi,
      kalem.kdv_grubu_id, kalem.minimum_m2, kalem.en_adimi_mm,
      kalem.boy_adimi_mm, kalem.aktif, auth.uid()
    FROM public.fiyat_listesi_urun_kalemleri kalem
    WHERE kalem.fiyat_listesi_surumu_id = v_kaynak_surum_id;

    PERFORM set_config('app.ticari_yayin_rpc', 'on', true);
    UPDATE public.fiyat_listesi_surmleri
    SET durum = 'yayinda',
        yayinlayan_kullanici_id = auth.uid(),
        yayinlanma_tarihi = now(),
        revision_no = revision_no + 1,
        updated_at = now()
    WHERE id = v_ana_surum_id;
  END IF;

  SELECT baglanti.para_birimi
  INTO v_para_birimi
  FROM public.cari_baglantilari baglanti
  JOIN public.fiyat_listesi_surmleri surum
    ON surum.id = baglanti.fiyat_listesi_surumu_id
  WHERE baglanti.cari_id = p_cari_id
    AND surum.fiyat_listesi_id = p_fiyat_listesi_id
    AND baglanti.durum = 'taslak'
  ORDER BY baglanti.created_at DESC
  LIMIT 1;

  SELECT kalem.kdv_grubu_id
  INTO v_varsayilan_kdv_id
  FROM public.fiyat_listesi_urun_kalemleri kalem
  WHERE kalem.fiyat_listesi_surumu_id = v_kaynak_surum_id
    AND kalem.aktif
  GROUP BY kalem.kdv_grubu_id
  ORDER BY count(*) DESC, kalem.kdv_grubu_id
  LIMIT 1;

  INSERT INTO public.musteri_ticari_profilleri (
    cari_id, aktif, olusturan_kullanici_id
  )
  VALUES (p_cari_id, true, auth.uid())
  ON CONFLICT (cari_id) DO UPDATE
  SET aktif = true
  RETURNING id INTO v_profil_id;

  SELECT *
  INTO v_kaynak
  FROM public.musteri_ticari_profil_surmleri
  WHERE musteri_ticari_profili_id = v_profil_id
  ORDER BY surum_no DESC
  LIMIT 1;

  v_varsayilan_kdv_id := COALESCE(
    v_kaynak.varsayilan_kdv_grubu_id,
    v_varsayilan_kdv_id
  );
  IF v_varsayilan_kdv_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'AKTIF_KDV_GRUBU_BULUNAMADI';
  END IF;

  SELECT COALESCE(max(surum_no), 0) + 1
  INTO v_yeni_no
  FROM public.musteri_ticari_profil_surmleri
  WHERE musteri_ticari_profili_id = v_profil_id;

  INSERT INTO public.musteri_ticari_profil_surmleri (
    id, musteri_ticari_profili_id, surum_no, durum, gecerli_baslangic,
    gecerli_bitis, ana_fiyat_listesi_id, musteri_fiyat_listesi_id,
    varsayilan_para_birimi, varsayilan_kdv_grubu_id, varsayilan_vade_gunu,
    vade_profili_id, vade_profili_surumu_id, nakliye_hesaplama_tipi,
    sabit_nakliye_satis_tutari, sabit_nakliye_maliyet_tutari,
    m2_nakliye_satis_tutari, m2_nakliye_maliyet_tutari,
    minimum_marj_yuzdesi_override, varsayilan_belge_notu,
    teklif_gecerlilik_gunu, onceki_surum_id, olusturan_kullanici_id,
    yayinlayan_kullanici_id, yayinlanma_tarihi, revision_no
  )
  VALUES (
    v_yeni_id, v_profil_id, v_yeni_no, 'yayinda',
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
    NULL, v_ana_liste_id, p_fiyat_listesi_id,
    COALESCE(v_kaynak.varsayilan_para_birimi, v_para_birimi, 'TRY'),
    v_varsayilan_kdv_id,
    COALESCE(v_kaynak.varsayilan_vade_gunu, 0),
    v_kaynak.vade_profili_id, v_kaynak.vade_profili_surumu_id,
    v_kaynak.nakliye_hesaplama_tipi,
    v_kaynak.sabit_nakliye_satis_tutari,
    v_kaynak.sabit_nakliye_maliyet_tutari,
    v_kaynak.m2_nakliye_satis_tutari,
    v_kaynak.m2_nakliye_maliyet_tutari,
    v_kaynak.minimum_marj_yuzdesi_override,
    v_kaynak.varsayilan_belge_notu,
    COALESCE(v_kaynak.teklif_gecerlilik_gunu, 15),
    v_kaynak.id, auth.uid(), auth.uid(), now(), 1
  );

  RETURN v_yeni_id;
END;
$$;

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
  v_baglanti_sayaci integer;
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

  PERFORM pg_advisory_xact_lock(
    hashtextextended('cari_baglanti:' || v_cari_id::text || ':' || v_para::text, 0)
  );

  SELECT liste.id, liste.miras_ana_fiyat_listesi_id
  INTO v_liste_id, v_ana_liste_id
  FROM public.fiyat_listeleri liste
  WHERE liste.cari_id = v_cari_id
    AND liste.tur = 'musteri'
    AND liste.aktif
  LIMIT 1;

  IF v_ana_liste_id IS NULL THEN
    SELECT surum.ana_fiyat_listesi_id
    INTO v_ana_liste_id
    FROM public.musteri_ticari_profilleri profil
    JOIN public.musteri_ticari_profil_surmleri surum
      ON surum.musteri_ticari_profili_id = profil.id
    WHERE profil.cari_id = v_cari_id
    ORDER BY
      CASE surum.durum WHEN 'yayinda' THEN 0 WHEN 'taslak' THEN 1 ELSE 2 END,
      surum.surum_no DESC
    LIMIT 1;
  END IF;

  IF v_ana_liste_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('cari_baglanti:bootstrap_ana_liste', 0));
    INSERT INTO public.fiyat_listeleri (
      kod, ad, tur, miras_ana_fiyat_listesi_id, cari_id,
      aktif, olusturan_kullanici_id
    )
    VALUES (
      'BAGLANTI-ANA',
      'Cari bağlantıları başlangıç ana fiyat listesi',
      'ana', NULL, NULL, true, auth.uid()
    )
    ON CONFLICT (kod) DO UPDATE
    SET aktif = true,
        updated_at = now()
    RETURNING id INTO v_ana_liste_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.fiyat_listeleri
      WHERE id = v_ana_liste_id
        AND tur = 'ana'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BAGLANTI_ANA_FIYAT_LISTESI_GECERSIZ';
    END IF;
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

  INSERT INTO public.sayaclar (anahtar, deger)
  VALUES (
    'cari_baglanti_'
      || extract(year FROM (p_payload ->> 'odeme_tarihi')::date)::integer::text,
    1
  )
  ON CONFLICT (anahtar) DO UPDATE
  SET deger = public.sayaclar.deger + 1
  RETURNING deger INTO v_baglanti_sayaci;

  v_baglanti_no := 'BAG-'
    || extract(year FROM (p_payload ->> 'odeme_tarihi')::date)::integer::text
    || '-' || lpad(v_baglanti_sayaci::text, 5, '0');

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
    'revision_no', 1,
    'ticari_profil_otomatik_hazirlanacak', NOT EXISTS (
      SELECT 1
      FROM public.musteri_ticari_profilleri profil
      JOIN public.musteri_ticari_profil_surmleri surum
        ON surum.musteri_ticari_profili_id = profil.id
      WHERE profil.cari_id = v_cari_id
        AND profil.aktif
        AND surum.durum = 'yayinda'
    )
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
  v_profil_durumu text := 'baglanti_ile_olusturulacak';
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

  IF FOUND THEN
    v_profil_durumu := 'yayinda';
  ELSIF EXISTS (
    SELECT 1
    FROM public.musteri_ticari_profilleri profil
    JOIN public.musteri_ticari_profil_surmleri profil_surumu
      ON profil_surumu.musteri_ticari_profili_id = profil.id
    WHERE profil.cari_id = p_cari_id
      AND profil_surumu.durum = 'taslak'
  ) THEN
    v_profil_durumu := 'taslak';
  END IF;

  IF v_varsayilan_kdv_grubu_id IS NULL THEN
    SELECT id
    INTO v_varsayilan_kdv_grubu_id
    FROM public.kdv_gruplari
    WHERE aktif
    ORDER BY
      CASE WHEN upper(kod) = 'KDV20' THEN 0 ELSE 1 END,
      kod
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'fiyat_listesi_surumu_id', v_surum_id,
    'para_birimi', COALESCE(v_para, 'TRY'::public.para_birimi_kodu),
    'ticari_profil_durumu', v_profil_durumu,
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

REVOKE ALL ON FUNCTION public.cari_baglanti_profili_listeye_bagla(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cari_baglanti_taslak_kaydet(jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cari_baglanti_hazirlik_getir(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cari_baglanti_taslak_kaydet(jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cari_baglanti_hazirlik_getir(uuid)
  TO authenticated;
