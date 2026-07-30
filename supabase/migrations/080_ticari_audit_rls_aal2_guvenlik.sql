-- 080 - Kritik ticari RPC güvenliği, AAL2 yayınlama ve audit sertleştirmesi

CREATE OR REPLACE FUNCTION public.ticari_yayin_gecisi_yalniz_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.durum IS DISTINCT FROM NEW.durum
     AND NEW.durum::text IN ('yayinda', 'arsiv')
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND COALESCE(current_setting('app.ticari_yayin_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'YAYIN_GECISI_YALNIZ_RPC_ILE_YAPILABILIR';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'fiyat_listesi_surmleri',
    'maliyet_tarife_surmleri',
    'urun_maliyet_recete_surmleri',
    'kdv_grup_surmleri',
    'vade_profili_surmleri',
    'musteri_ticari_profil_surmleri'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.ticari_yayin_gecisi_yalniz_rpc()',
      v_table || '_rpc_publish_guard',
      v_table
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.ticari_surum_yayinla_internal(
  p_islem_tipi text,
  p_tablo text,
  p_parent_kolonu text,
  p_surum_id uuid,
  p_beklenen_revision_no integer,
  p_idempotency_key text,
  p_zorunlu_kalem_tablosu text DEFAULT NULL,
  p_zorunlu_kalem_fk text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payload jsonb;
  v_onceki jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_satir jsonb;
  v_parent_id uuid;
  v_revision_no integer;
  v_durum text;
  v_gecerli_baslangic date;
  v_gecerli_bitis date;
  v_kalem_sayisi bigint;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;

  v_payload := jsonb_build_object(
    'surum_id', p_surum_id,
    'beklenen_revision_no', p_beklenen_revision_no
  );
  v_onceki := public.ticari_idempotency_onceki_sonuc(
    p_islem_tipi, p_idempotency_key, v_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;

  -- Aynı mantıksal kayda ait iki farklı taslağın eş zamanlı yayınlanmasını
  -- sürüm satırı yerine parent kimliği üzerinden serileştir.
  EXECUTE format(
    'SELECT %I FROM public.%I WHERE id = $1',
    p_parent_kolonu,
    p_tablo
  )
  INTO v_parent_id
  USING p_surum_id;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'YAYINLANACAK_SURUM_BULUNAMADI';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tablo || ':' || v_parent_id::text, 0)
  );

  EXECUTE format(
    'SELECT to_jsonb(s) FROM public.%I s WHERE s.id = $1 FOR UPDATE',
    p_tablo
  )
  INTO v_satir
  USING p_surum_id;

  IF v_satir IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'YAYINLANACAK_SURUM_BULUNAMADI';
  END IF;

  IF public.ticari_guvenli_uuid(v_satir ->> p_parent_kolonu)
       IS DISTINCT FROM v_parent_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'SURUM_PARENT_CAKISMASI';
  END IF;
  v_revision_no := public.ticari_guvenli_integer(v_satir ->> 'revision_no');
  v_durum := v_satir ->> 'durum';
  v_gecerli_baslangic := (v_satir ->> 'gecerli_baslangic')::date;
  v_gecerli_bitis := NULLIF(v_satir ->> 'gecerli_bitis', '')::date;

  IF v_revision_no IS DISTINCT FROM p_beklenen_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
  END IF;
  IF v_durum <> 'taslak' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'YALNIZ_TASLAK_YAYINLANABILIR';
  END IF;
  IF v_gecerli_baslangic >
       (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'GELECEK_TARIHLI_SURUM_YAYINLANAMAZ';
  END IF;

  IF p_zorunlu_kalem_tablosu IS NOT NULL THEN
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I = $1',
      p_zorunlu_kalem_tablosu,
      p_zorunlu_kalem_fk
    )
    INTO v_kalem_sayisi
    USING p_surum_id;

    IF v_kalem_sayisi = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'YAYIN_ICIN_ZORUNLU_KALEM_EKSIK';
    END IF;
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    p_islem_tipi, p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  PERFORM set_config('app.ticari_yayin_rpc', 'on', true);

  EXECUTE format(
    'UPDATE public.%I
     SET durum = ''arsiv'', revision_no = revision_no + 1
     WHERE %I = $1
       AND id <> $2
       AND durum = ''yayinda''
       AND daterange(
         gecerli_baslangic,
         COALESCE(gecerli_bitis, ''infinity''::date),
         ''[]''
       ) && daterange($3, COALESCE($4, ''infinity''::date), ''[]'')',
    p_tablo,
    p_parent_kolonu
  )
  USING v_parent_id, p_surum_id, v_gecerli_baslangic, v_gecerli_bitis;

  EXECUTE format(
    'UPDATE public.%I
     SET durum = ''yayinda'',
         yayinlayan_kullanici_id = $2,
         yayinlanma_tarihi = now(),
         revision_no = revision_no + 1
     WHERE id = $1',
    p_tablo
  )
  USING p_surum_id, auth.uid();

  v_yanit := jsonb_build_object(
    'basarili', true,
    'surum_id', p_surum_id,
    'durum', 'yayinda',
    'revision_no', v_revision_no + 1
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.fiyat_listesi_surumu_yayinla(
  p_surum_id uuid,
  p_beklenen_revision_no integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_yayinla_internal(
    'fiyat_listesi_yayinlama',
    'fiyat_listesi_surmleri',
    'fiyat_listesi_id',
    p_surum_id,
    p_beklenen_revision_no,
    p_idempotency_key,
    'fiyat_listesi_urun_kalemleri',
    'fiyat_listesi_surumu_id'
  )
$$;

CREATE OR REPLACE FUNCTION public.maliyet_tarife_surumu_yayinla(
  p_surum_id uuid,
  p_beklenen_revision_no integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_yayinla_internal(
    'maliyet_tarifesi_yayinlama',
    'maliyet_tarife_surmleri',
    'maliyet_tarifesi_id',
    p_surum_id,
    p_beklenen_revision_no,
    p_idempotency_key,
    'maliyet_stok_kalemleri',
    'maliyet_tarife_surumu_id'
  )
$$;

CREATE OR REPLACE FUNCTION public.maliyet_recete_surumu_yayinla(
  p_surum_id uuid,
  p_beklenen_revision_no integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_yayinla_internal(
    'maliyet_recetesi_yayinlama',
    'urun_maliyet_recete_surmleri',
    'urun_maliyet_recetesi_id',
    p_surum_id,
    p_beklenen_revision_no,
    p_idempotency_key,
    'urun_maliyet_recete_kalemleri',
    'urun_maliyet_recete_surumu_id'
  )
$$;

CREATE OR REPLACE FUNCTION public.kdv_grup_surumu_yayinla(
  p_surum_id uuid,
  p_beklenen_revision_no integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_yayinla_internal(
    'kdv_grubu_yayinlama',
    'kdv_grup_surmleri',
    'kdv_grubu_id',
    p_surum_id,
    p_beklenen_revision_no,
    p_idempotency_key
  )
$$;

CREATE OR REPLACE FUNCTION public.vade_profili_surumu_yayinla(
  p_surum_id uuid,
  p_beklenen_revision_no integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_yayinla_internal(
    'vade_profili_yayinlama',
    'vade_profili_surmleri',
    'vade_profili_id',
    p_surum_id,
    p_beklenen_revision_no,
    p_idempotency_key,
    'vade_profili_kademeleri',
    'vade_profili_surumu_id'
  )
$$;

CREATE OR REPLACE FUNCTION public.musteri_ticari_profil_surumu_yayinla(
  p_surum_id uuid,
  p_beklenen_revision_no integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_yayinla_internal(
    'musteri_ticari_profili_yayinlama',
    'musteri_ticari_profil_surmleri',
    'musteri_ticari_profili_id',
    p_surum_id,
    p_beklenen_revision_no,
    p_idempotency_key
  )
$$;

CREATE OR REPLACE FUNCTION public.fiyat_listesi_surumu_kopyala(
  p_kaynak_surum_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kaynak public.fiyat_listesi_surmleri%ROWTYPE;
  v_parent_id uuid;
  v_yeni_id uuid;
  v_yeni_no integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_permission('pricing', 'create')
    AND public.has_permission('pricing', 'update')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_UPDATE_YETKISI_GEREKLI';
  END IF;

  SELECT * INTO v_kaynak
  FROM public.fiyat_listesi_surmleri
  WHERE id = p_kaynak_surum_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'KAYNAK_FIYAT_SURUMU_BULUNAMADI';
  END IF;
  v_parent_id := v_kaynak.fiyat_listesi_id;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('fiyat_listesi_surmleri:' || v_parent_id::text, 0)
  );
  SELECT * INTO v_kaynak
  FROM public.fiyat_listesi_surmleri
  WHERE id = p_kaynak_surum_id
  FOR UPDATE;
  IF NOT FOUND OR v_kaynak.fiyat_listesi_id IS DISTINCT FROM v_parent_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'SURUM_PARENT_CAKISMASI';
  END IF;
  IF v_kaynak.durum = 'taslak' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'KAYNAK_TASLAK_KOPYALANAMAZ';
  END IF;
  SELECT COALESCE(max(surum_no), 0) + 1
  INTO v_yeni_no
  FROM public.fiyat_listesi_surmleri
  WHERE fiyat_listesi_id = v_kaynak.fiyat_listesi_id;

  INSERT INTO public.fiyat_listesi_surmleri (
    fiyat_listesi_id, surum_no, durum, gecerli_baslangic, gecerli_bitis,
    onceki_surum_id, olusturan_kullanici_id, revision_no, aciklama
  )
  VALUES (
    v_kaynak.fiyat_listesi_id, v_yeni_no, 'taslak',
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date, NULL,
    v_kaynak.id, auth.uid(), 1,
    'R' || lpad(v_kaynak.surum_no::text, 2, '0') || ' sürümünden kopya'
  )
  RETURNING id INTO v_yeni_id;

  INSERT INTO public.fiyat_listesi_urun_kalemleri (
    fiyat_listesi_surumu_id, kapsam_tipi, stok_id, stok_grubu,
    birim_fiyat, yuzde_fark, para_birimi, kdv_grubu_id,
    minimum_m2, en_adimi_mm, boy_adimi_mm, aktif, olusturan_kullanici_id
  )
  SELECT
    v_yeni_id, kapsam_tipi, stok_id, stok_grubu, birim_fiyat, yuzde_fark,
    para_birimi, kdv_grubu_id, minimum_m2, en_adimi_mm, boy_adimi_mm,
    aktif, auth.uid()
  FROM public.fiyat_listesi_urun_kalemleri
  WHERE fiyat_listesi_surumu_id = p_kaynak_surum_id;

  INSERT INTO public.fiyat_listesi_kenar_islem_kalemleri (
    fiyat_listesi_surumu_id, islem_turu, birim_fiyat, para_birimi,
    kdv_grubu_id, aktif, olusturan_kullanici_id
  )
  SELECT v_yeni_id, islem_turu, birim_fiyat, para_birimi,
    kdv_grubu_id, aktif, auth.uid()
  FROM public.fiyat_listesi_kenar_islem_kalemleri
  WHERE fiyat_listesi_surumu_id = p_kaynak_surum_id;

  INSERT INTO public.fiyat_listesi_menfez_kalemleri (
    fiyat_listesi_surumu_id, menfez_turu, cap_alt_mm, cap_ust_mm,
    birim_fiyat, para_birimi, kdv_grubu_id, aktif, olusturan_kullanici_id
  )
  SELECT v_yeni_id, menfez_turu, cap_alt_mm, cap_ust_mm, birim_fiyat,
    para_birimi, kdv_grubu_id, aktif, auth.uid()
  FROM public.fiyat_listesi_menfez_kalemleri
  WHERE fiyat_listesi_surumu_id = p_kaynak_surum_id;

  INSERT INTO public.fiyat_listesi_kucuk_cam_kurallari (
    fiyat_listesi_surumu_id, alan_ust_siniri_m2, sabit_ek_tutar,
    yuzde_ek_bedel, para_birimi, kdv_grubu_id, aktif, olusturan_kullanici_id
  )
  SELECT v_yeni_id, alan_ust_siniri_m2, sabit_ek_tutar, yuzde_ek_bedel,
    para_birimi, kdv_grubu_id, aktif, auth.uid()
  FROM public.fiyat_listesi_kucuk_cam_kurallari
  WHERE fiyat_listesi_surumu_id = p_kaynak_surum_id;

  INSERT INTO public.fiyat_listesi_nakliye_kurallari (
    fiyat_listesi_surumu_id, hesaplama_tipi, birim_fiyat, minimum_tutar,
    para_birimi, kdv_grubu_id, aktif, olusturan_kullanici_id
  )
  SELECT v_yeni_id, hesaplama_tipi, birim_fiyat, minimum_tutar,
    para_birimi, kdv_grubu_id, aktif, auth.uid()
  FROM public.fiyat_listesi_nakliye_kurallari
  WHERE fiyat_listesi_surumu_id = p_kaynak_surum_id;

  INSERT INTO public.fiyat_listesi_diger_kalemleri (
    fiyat_listesi_surumu_id, kalem_kodu, kalem_adi, hesaplama_birimi,
    birim_fiyat, para_birimi, kdv_grubu_id, aktif, olusturan_kullanici_id
  )
  SELECT v_yeni_id, kalem_kodu, kalem_adi, hesaplama_birimi,
    birim_fiyat, para_birimi, kdv_grubu_id, aktif, auth.uid()
  FROM public.fiyat_listesi_diger_kalemleri
  WHERE fiyat_listesi_surumu_id = p_kaynak_surum_id;

  RETURN jsonb_build_object(
    'basarili', true,
    'surum_id', v_yeni_id,
    'surum_no', v_yeni_no,
    'durum', 'taslak'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_surum_kopyala_internal(
  p_tablo text,
  p_parent_kolonu text,
  p_kaynak_surum_id uuid,
  p_kalem_tablolari text[] DEFAULT ARRAY[]::text[],
  p_kalem_fk text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_parent_id uuid;
  v_kilitli_parent_id uuid;
  v_kaynak_durum text;
  v_yeni_id uuid := gen_random_uuid();
  v_yeni_no integer;
  v_kolonlar text;
  v_degerler text;
  v_kalem_tablo text;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_permission('pricing', 'create')
    AND public.has_permission('pricing', 'update')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_UPDATE_YETKISI_GEREKLI';
  END IF;

  IF (p_tablo, p_parent_kolonu) NOT IN (
    ('maliyet_tarife_surmleri', 'maliyet_tarifesi_id'),
    ('urun_maliyet_recete_surmleri', 'urun_maliyet_recetesi_id'),
    ('kdv_grup_surmleri', 'kdv_grubu_id'),
    ('vade_profili_surmleri', 'vade_profili_id'),
    ('musteri_ticari_profil_surmleri', 'musteri_ticari_profili_id')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'KOPYALANACAK_SURUM_TURU_GECERSIZ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_kalem_tablolari, ARRAY[]::text[])) AS kalem(tablo)
    WHERE kalem.tablo NOT IN (
      'maliyet_stok_kalemleri',
      'maliyet_islem_kalemleri',
      'maliyet_nakliye_kurallari',
      'maliyet_genel_gider_kalemleri',
      'urun_maliyet_recete_kalemleri',
      'vade_profili_kademeleri'
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'KOPYALANACAK_KALEM_TURU_GECERSIZ';
  END IF;

  -- Önce parent kimliğini bul, sonra parent seviyesinde advisory lock al.
  -- Böylece aynı parent altındaki iki farklı taslak için kilit sırası
  -- deterministik kalır ve yayın/kopyalama yarışları deadlock üretmez.
  EXECUTE format(
    'SELECT %I FROM public.%I WHERE id = $1',
    p_parent_kolonu,
    p_tablo
  )
  INTO v_parent_id
  USING p_kaynak_surum_id;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'KAYNAK_SURUM_BULUNAMADI';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tablo || ':' || v_parent_id::text, 0)
  );

  EXECUTE format(
    'SELECT %I, durum::text FROM public.%I WHERE id = $1 FOR UPDATE',
    p_parent_kolonu,
    p_tablo
  )
  INTO v_kilitli_parent_id, v_kaynak_durum
  USING p_kaynak_surum_id;

  IF v_kilitli_parent_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'KAYNAK_SURUM_BULUNAMADI';
  END IF;
  IF v_kilitli_parent_id IS DISTINCT FROM v_parent_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'SURUM_PARENT_CAKISMASI';
  END IF;
  IF v_kaynak_durum = 'taslak' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'KAYNAK_TASLAK_KOPYALANAMAZ';
  END IF;

  EXECUTE format(
    'SELECT COALESCE(max(surum_no), 0) + 1
       FROM public.%I
      WHERE %I = $1',
    p_tablo,
    p_parent_kolonu
  )
  INTO v_yeni_no
  USING v_parent_id;

  SELECT
    string_agg(format('%I', attr.attname), ', ' ORDER BY attr.attnum),
    string_agg(
      CASE attr.attname
        WHEN 'id' THEN '$2'
        WHEN 'surum_no' THEN '$3'
        WHEN 'durum' THEN '''taslak''::public.ticari_surum_durumu'
        WHEN 'gecerli_baslangic' THEN
          '(clock_timestamp() AT TIME ZONE ''Europe/Istanbul'')::date'
        WHEN 'gecerli_bitis' THEN 'NULL'
        WHEN 'onceki_surum_id' THEN '$1'
        WHEN 'olusturan_kullanici_id' THEN 'auth.uid()'
        WHEN 'yayinlayan_kullanici_id' THEN 'NULL'
        WHEN 'yayinlanma_tarihi' THEN 'NULL'
        WHEN 'revision_no' THEN '1'
        WHEN 'created_at' THEN 'now()'
        WHEN 'updated_at' THEN 'now()'
        ELSE format('kaynak.%I', attr.attname)
      END,
      ', ' ORDER BY attr.attnum
    )
  INTO v_kolonlar, v_degerler
  FROM pg_catalog.pg_attribute attr
  WHERE attr.attrelid = format('public.%I', p_tablo)::regclass
    AND attr.attnum > 0
    AND NOT attr.attisdropped
    AND attr.attgenerated = '';

  EXECUTE format(
    'INSERT INTO public.%I (%s)
     SELECT %s
       FROM public.%I kaynak
      WHERE kaynak.id = $1',
    p_tablo,
    v_kolonlar,
    v_degerler,
    p_tablo
  )
  USING p_kaynak_surum_id, v_yeni_id, v_yeni_no;

  FOREACH v_kalem_tablo IN ARRAY COALESCE(p_kalem_tablolari, ARRAY[]::text[])
  LOOP
    IF p_kalem_fk IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'KOPYALANACAK_KALEM_FK_EKSIK';
    END IF;

    SELECT
      string_agg(format('%I', attr.attname), ', ' ORDER BY attr.attnum),
      string_agg(
        CASE attr.attname
          WHEN 'id' THEN 'gen_random_uuid()'
          WHEN p_kalem_fk THEN '$2'
          WHEN 'olusturan_kullanici_id' THEN 'auth.uid()'
          WHEN 'created_at' THEN 'now()'
          ELSE format('kaynak.%I', attr.attname)
        END,
        ', ' ORDER BY attr.attnum
      )
    INTO v_kolonlar, v_degerler
    FROM pg_catalog.pg_attribute attr
    WHERE attr.attrelid = format('public.%I', v_kalem_tablo)::regclass
      AND attr.attnum > 0
      AND NOT attr.attisdropped
      AND attr.attgenerated = '';

    EXECUTE format(
      'INSERT INTO public.%I (%s)
       SELECT %s
         FROM public.%I kaynak
        WHERE kaynak.%I = $1',
      v_kalem_tablo,
      v_kolonlar,
      v_degerler,
      v_kalem_tablo,
      p_kalem_fk
    )
    USING p_kaynak_surum_id, v_yeni_id;
  END LOOP;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'surum_id', v_yeni_id,
    'surum_no', v_yeni_no,
    'durum', 'taslak',
    'onceki_surum_id', p_kaynak_surum_id
  );
  RETURN v_yanit;
END;
$$;

CREATE OR REPLACE FUNCTION public.maliyet_tarife_surumu_kopyala(p_kaynak_surum_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_kopyala_internal(
    'maliyet_tarife_surmleri',
    'maliyet_tarifesi_id',
    p_kaynak_surum_id,
    ARRAY[
      'maliyet_stok_kalemleri',
      'maliyet_islem_kalemleri',
      'maliyet_nakliye_kurallari',
      'maliyet_genel_gider_kalemleri'
    ],
    'maliyet_tarife_surumu_id'
  )
$$;

CREATE OR REPLACE FUNCTION public.maliyet_recete_surumu_kopyala(p_kaynak_surum_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_kopyala_internal(
    'urun_maliyet_recete_surmleri',
    'urun_maliyet_recetesi_id',
    p_kaynak_surum_id,
    ARRAY['urun_maliyet_recete_kalemleri'],
    'urun_maliyet_recete_surumu_id'
  )
$$;

CREATE OR REPLACE FUNCTION public.kdv_grup_surumu_kopyala(p_kaynak_surum_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_kopyala_internal(
    'kdv_grup_surmleri',
    'kdv_grubu_id',
    p_kaynak_surum_id
  )
$$;

CREATE OR REPLACE FUNCTION public.vade_profili_surumu_kopyala(p_kaynak_surum_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_kopyala_internal(
    'vade_profili_surmleri',
    'vade_profili_id',
    p_kaynak_surum_id,
    ARRAY['vade_profili_kademeleri'],
    'vade_profili_surumu_id'
  )
$$;

CREATE OR REPLACE FUNCTION public.musteri_ticari_profil_surumu_kopyala(
  p_kaynak_surum_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.ticari_surum_kopyala_internal(
    'musteri_ticari_profil_surmleri',
    'musteri_ticari_profili_id',
    p_kaynak_surum_id
  )
$$;

CREATE OR REPLACE FUNCTION public.manuel_doviz_kuru_kaydet(
  p_kur_tarihi date,
  p_para_birimi public.para_birimi_kodu,
  p_kur_tipi public.doviz_kur_tipi,
  p_try_karsiligi numeric,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payload jsonb;
  v_onceki jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_revision_no integer;
  v_kur_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;
  IF p_kur_tarihi IS NULL
     OR p_para_birimi IS NULL
     OR p_kur_tipi IS NULL
     OR p_try_karsiligi IS NULL
     OR p_para_birimi NOT IN ('USD', 'EUR')
     OR p_try_karsiligi <= 0
     OR length(trim(COALESCE(p_gerekce, ''))) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MANUEL_KUR_GIRDISI_GECERSIZ';
  END IF;

  v_payload := jsonb_build_object(
    'kur_tarihi', p_kur_tarihi,
    'para_birimi', p_para_birimi,
    'kur_tipi', p_kur_tipi,
    'try_karsiligi', p_try_karsiligi,
    'gerekce', p_gerekce
  );
  v_onceki := public.ticari_idempotency_onceki_sonuc(
    'manuel_doviz_kuru', p_idempotency_key, v_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'kur:' || p_kur_tarihi::text || ':' || p_para_birimi::text || ':' || p_kur_tipi::text,
    0
  ));

  v_idempotency := public.ticari_idempotency_baslat(
    'manuel_doviz_kuru', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  UPDATE public.doviz_kurlari
  SET aktif = false
  WHERE kur_tarihi = p_kur_tarihi
    AND para_birimi = p_para_birimi
    AND kur_tipi = p_kur_tipi
    AND aktif;

  SELECT COALESCE(max(revision_no), 0) + 1
  INTO v_revision_no
  FROM public.doviz_kurlari
  WHERE kur_tarihi = p_kur_tarihi
    AND para_birimi = p_para_birimi
    AND kur_tipi = p_kur_tipi;

  INSERT INTO public.doviz_kurlari (
    kur_tarihi, para_birimi, kur_tipi, try_karsiligi,
    tcmb_kaynak_tarihi, kaynak, manuel_gerekce, revision_no,
    aktif, olusturan_kullanici_id
  )
  VALUES (
    p_kur_tarihi, p_para_birimi, p_kur_tipi, round(p_try_karsiligi, 6),
    p_kur_tarihi, 'manuel', p_gerekce, v_revision_no, true, auth.uid()
  )
  RETURNING id INTO v_kur_id;

  INSERT INTO public.ticari_mudahale_kayitlari (
    mudahale_turu, alan_veya_bilesen, yeni_deger, gerekce, kullanici_id
  )
  VALUES (
    'manuel_kur',
    p_para_birimi::text || ':' || p_kur_tipi::text,
    jsonb_build_object(
      'doviz_kuru_id', v_kur_id,
      'kur_tarihi', p_kur_tarihi,
      'try_karsiligi', round(p_try_karsiligi, 6),
      'revision_no', v_revision_no
    ),
    p_gerekce,
    auth.uid()
  );

  v_yanit := jsonb_build_object(
    'basarili', true,
    'doviz_kuru_id', v_kur_id,
    'revision_no', v_revision_no
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

-- Aktif/bakım modunda doğrudan legacy sipariş yazımına geri dönüş yoktur.
CREATE OR REPLACE FUNCTION public.ticari_siparis_dogrudan_yazimini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mod public.ticari_modul_modu;
BEGIN
  IF COALESCE(current_setting('app.ticari_siparis_rpc', true), '') = 'on'
     OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT mod INTO v_mod FROM public.ticari_modul_durumu WHERE singleton;

  IF TG_OP = 'INSERT' AND v_mod IN ('aktif', 'bakim') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FIYATLI_SIPARIS_RPC_ZORUNLU';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.fiyatlandirildi THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FIYATLI_SIPARIS_SILINEMEZ';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.fiyatlandirildi THEN
    IF OLD.durum = 'iptal' AND NEW.durum IS DISTINCT FROM OLD.durum THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'IPTAL_EDILMIS_SIPARIS_YENIDEN_ACILAMAZ';
    END IF;
    IF NEW.durum = 'iptal' AND OLD.durum <> 'iptal' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FIYATLI_SIPARIS_IPTAL_RPC_ZORUNLU';
    END IF;
    IF (to_jsonb(NEW) - ARRAY[
      'durum', 'tamamlandi_tarihi'
    ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
      'durum', 'tamamlandi_tarihi'
    ]) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FIYATLI_SIPARIS_GUNCELLEME_RPC_ZORUNLU';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_siparis_detay_dogrudan_yazimini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_siparis_id uuid;
  v_new_siparis_id uuid;
  v_old_fiyatlandirildi boolean := false;
  v_new_fiyatlandirildi boolean := false;
  v_fiyatlandirildi boolean := false;
  v_mod public.ticari_modul_modu;
BEGIN
  IF COALESCE(current_setting('app.ticari_siparis_rpc', true), '') = 'on'
     OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_siparis_id := OLD.siparis_id;
    SELECT fiyatlandirildi INTO v_old_fiyatlandirildi
    FROM public.siparisler WHERE id = v_old_siparis_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_siparis_id := NEW.siparis_id;
    SELECT fiyatlandirildi INTO v_new_fiyatlandirildi
    FROM public.siparisler WHERE id = v_new_siparis_id;
  END IF;

  IF TG_OP = 'UPDATE'
     AND v_new_siparis_id IS DISTINCT FROM v_old_siparis_id
     AND (
       COALESCE(v_old_fiyatlandirildi, false)
       OR COALESCE(v_new_fiyatlandirildi, false)
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'FIYATLI_SIPARIS_DETAYI_TASINAMAZ';
  END IF;

  v_fiyatlandirildi := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN v_old_fiyatlandirildi ELSE v_new_fiyatlandirildi END,
    false
  );
  SELECT mod INTO v_mod FROM public.ticari_modul_durumu WHERE singleton;

  IF COALESCE(v_fiyatlandirildi, false) THEN
    IF TG_OP <> 'UPDATE'
       OR (to_jsonb(NEW) - 'uretim_durumu')
          IS DISTINCT FROM (to_jsonb(OLD) - 'uretim_durumu') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FIYATLI_SIPARIS_GUNCELLEME_RPC_ZORUNLU';
    END IF;
  ELSIF TG_OP = 'INSERT' AND v_mod IN ('aktif', 'bakim') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEGACY_SIPARIS_FALLBACK_KAPALI';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER siparisler_ticari_direct_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.siparisler
  FOR EACH ROW EXECUTE FUNCTION public.ticari_siparis_dogrudan_yazimini_koru();
CREATE TRIGGER siparis_detaylari_ticari_direct_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.siparis_detaylari
  FOR EACH ROW EXECUTE FUNCTION public.ticari_siparis_detay_dogrudan_yazimini_koru();

CREATE TRIGGER audit_cari_hareketleri
  AFTER INSERT ON public.cari_hareketleri
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();
CREATE TRIGGER audit_siparis_fiyat_revizyonlari
  AFTER INSERT ON public.siparis_fiyat_revizyonlari
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();
CREATE TRIGGER audit_teklif_revizyonlari
  AFTER INSERT OR UPDATE ON public.teklif_revizyonlari
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();
CREATE TRIGGER audit_ticari_mudahale_kayitlari
  AFTER INSERT ON public.ticari_mudahale_kayitlari
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();
CREATE TRIGGER audit_golge_fiyatlandirma_calismalari
  AFTER INSERT ON public.golge_fiyatlandirma_calismalari
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

CREATE OR REPLACE FUNCTION public.ticari_taslak_ana_kaydi_olustur(
  p_kayit_turu text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_parent_id uuid := gen_random_uuid();
  v_surum_id uuid := gen_random_uuid();
  v_baslangic date := COALESCE(
    NULLIF(p_payload ->> 'gecerli_baslangic', '')::date,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_bitis date := NULLIF(p_payload ->> 'gecerli_bitis', '')::date;
  v_kod text := nullif(btrim(p_payload ->> 'kod'), '');
  v_ad text := nullif(btrim(p_payload ->> 'ad'), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'create') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PRICING_CREATE_YETKISI_GEREKLI';
  END IF;
  IF p_kayit_turu NOT IN ('fiyat', 'maliyet', 'recete', 'kdv', 'vade', 'profil') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TASLAK_ANA_KAYIT_TURU_GECERSIZ';
  END IF;
  IF v_bitis IS NOT NULL AND v_bitis < v_baslangic THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'GECERLILIK_ARALIGI_GECERSIZ';
  END IF;
  IF p_kayit_turu <> 'profil' AND (v_kod IS NULL OR v_ad IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'KOD_VE_AD_GEREKLI';
  END IF;

  IF p_kayit_turu = 'fiyat' THEN
    INSERT INTO public.fiyat_listeleri (
      id, kod, ad, tur, miras_ana_fiyat_listesi_id, cari_id,
      olusturan_kullanici_id
    )
    VALUES (
      v_parent_id, v_kod, v_ad, COALESCE(NULLIF(p_payload ->> 'tur', ''), 'ana'),
      public.ticari_guvenli_uuid(p_payload ->> 'miras_ana_fiyat_listesi_id'),
      public.ticari_guvenli_uuid(p_payload ->> 'cari_id'), auth.uid()
    );
    INSERT INTO public.fiyat_listesi_surmleri (
      id, fiyat_listesi_id, surum_no, durum, gecerli_baslangic,
      gecerli_bitis, olusturan_kullanici_id, aciklama
    )
    VALUES (
      v_surum_id, v_parent_id, 1, 'taslak', v_baslangic,
      v_bitis, auth.uid(), nullif(btrim(p_payload ->> 'aciklama'), '')
    );
  ELSIF p_kayit_turu = 'maliyet' THEN
    INSERT INTO public.maliyet_tarifeleri (
      id, kod, ad, varsayilan, olusturan_kullanici_id
    )
    VALUES (
      v_parent_id, v_kod, v_ad,
      COALESCE((p_payload ->> 'varsayilan')::boolean, false), auth.uid()
    );
    INSERT INTO public.maliyet_tarife_surmleri (
      id, maliyet_tarifesi_id, surum_no, durum, gecerli_baslangic,
      gecerli_bitis, olusturan_kullanici_id, aciklama
    )
    VALUES (
      v_surum_id, v_parent_id, 1, 'taslak', v_baslangic,
      v_bitis, auth.uid(), nullif(btrim(p_payload ->> 'aciklama'), '')
    );
  ELSIF p_kayit_turu = 'recete' THEN
    INSERT INTO public.urun_maliyet_receteleri (
      id, stok_id, kod, ad, olusturan_kullanici_id
    )
    VALUES (
      v_parent_id, public.ticari_guvenli_uuid(p_payload ->> 'stok_id'),
      v_kod, v_ad, auth.uid()
    );
    INSERT INTO public.urun_maliyet_recete_surmleri (
      id, urun_maliyet_recetesi_id, surum_no, durum,
      gecerli_baslangic, gecerli_bitis, olusturan_kullanici_id,
      aciklama
    )
    VALUES (
      v_surum_id, v_parent_id, 1, 'taslak',
      v_baslangic, v_bitis, auth.uid(),
      nullif(btrim(p_payload ->> 'aciklama'), '')
    );
  ELSIF p_kayit_turu = 'kdv' THEN
    INSERT INTO public.kdv_gruplari (
      id, kod, ad, olusturan_kullanici_id
    )
    VALUES (v_parent_id, v_kod, v_ad, auth.uid());
    INSERT INTO public.kdv_grup_surmleri (
      id, kdv_grubu_id, surum_no, durum, kdv_orani,
      gecerli_baslangic, gecerli_bitis, olusturan_kullanici_id,
      aciklama
    )
    VALUES (
      v_surum_id, v_parent_id, 1, 'taslak',
      public.ticari_guvenli_numeric(p_payload ->> 'kdv_orani'),
      v_baslangic, v_bitis, auth.uid(),
      nullif(btrim(p_payload ->> 'aciklama'), '')
    );
  ELSIF p_kayit_turu = 'vade' THEN
    INSERT INTO public.vade_profilleri (
      id, kod, ad, olusturan_kullanici_id
    )
    VALUES (v_parent_id, v_kod, v_ad, auth.uid());
    INSERT INTO public.vade_profili_surmleri (
      id, vade_profili_id, surum_no, durum, gecerli_baslangic,
      gecerli_bitis, olusturan_kullanici_id, aciklama
    )
    VALUES (
      v_surum_id, v_parent_id, 1, 'taslak', v_baslangic,
      v_bitis, auth.uid(), nullif(btrim(p_payload ->> 'aciklama'), '')
    );
  ELSE
    INSERT INTO public.musteri_ticari_profilleri (
      id, cari_id, olusturan_kullanici_id
    )
    VALUES (
      v_parent_id,
      public.ticari_guvenli_uuid(p_payload ->> 'cari_id'),
      auth.uid()
    );
    INSERT INTO public.musteri_ticari_profil_surmleri (
      id, musteri_ticari_profili_id, surum_no, durum,
      gecerli_baslangic, gecerli_bitis, ana_fiyat_listesi_id,
      musteri_fiyat_listesi_id, varsayilan_para_birimi,
      varsayilan_kdv_grubu_id, varsayilan_vade_gunu,
      vade_profili_id, vade_profili_surumu_id,
      nakliye_hesaplama_tipi, sabit_nakliye_satis_tutari,
      sabit_nakliye_maliyet_tutari, m2_nakliye_satis_tutari,
      m2_nakliye_maliyet_tutari, minimum_marj_yuzdesi_override,
      varsayilan_belge_notu, teklif_gecerlilik_gunu,
      olusturan_kullanici_id
    )
    VALUES (
      v_surum_id, v_parent_id, 1, 'taslak', v_baslangic, v_bitis,
      public.ticari_guvenli_uuid(p_payload ->> 'ana_fiyat_listesi_id'),
      public.ticari_guvenli_uuid(p_payload ->> 'musteri_fiyat_listesi_id'),
      COALESCE(NULLIF(p_payload ->> 'varsayilan_para_birimi', ''), 'TRY')
        ::public.para_birimi_kodu,
      public.ticari_guvenli_uuid(p_payload ->> 'varsayilan_kdv_grubu_id'),
      COALESCE(public.ticari_guvenli_integer(p_payload ->> 'varsayilan_vade_gunu'), 0),
      public.ticari_guvenli_uuid(p_payload ->> 'vade_profili_id'),
      public.ticari_guvenli_uuid(p_payload ->> 'vade_profili_surumu_id'),
      NULLIF(p_payload ->> 'nakliye_hesaplama_tipi', '')
        ::public.nakliye_hesaplama_tipi,
      public.ticari_guvenli_numeric(p_payload ->> 'sabit_nakliye_satis_tutari'),
      public.ticari_guvenli_numeric(p_payload ->> 'sabit_nakliye_maliyet_tutari'),
      public.ticari_guvenli_numeric(p_payload ->> 'm2_nakliye_satis_tutari'),
      public.ticari_guvenli_numeric(p_payload ->> 'm2_nakliye_maliyet_tutari'),
      public.ticari_guvenli_numeric(p_payload ->> 'minimum_marj_yuzdesi_override'),
      nullif(btrim(p_payload ->> 'varsayilan_belge_notu'), ''),
      COALESCE(public.ticari_guvenli_integer(p_payload ->> 'teklif_gecerlilik_gunu'), 15),
      auth.uid()
    );
  END IF;

  RETURN jsonb_build_object(
    'basarili', true,
    'kayit_turu', p_kayit_turu,
    'parent_id', v_parent_id,
    'surum_id', v_surum_id,
    'surum_no', 1,
    'revision_no', 1
  );
END;
$$;

-- Excel/toplu düzenleme ekranı bir taslağın tüm kalemlerini tek transaction
-- içinde değiştirir. Yayınlanmış sürümler bu RPC üzerinden de yazılamaz.
CREATE OR REPLACE FUNCTION public.ticari_taslak_kalemlerini_toplu_degistir(
  p_surum_turu text,
  p_surum_id uuid,
  p_beklenen_revision_no integer,
  p_kalemler jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_durum text;
  v_revision_no integer;
  v_kalem_sayisi integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'update') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PRICING_UPDATE_YETKISI_GEREKLI';
  END IF;
  IF p_surum_turu NOT IN ('fiyat', 'maliyet', 'recete', 'vade') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TASLAK_KALEM_TURU_GECERSIZ';
  END IF;
  IF jsonb_typeof(COALESCE(p_kalemler, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TASLAK_KALEM_PAYLOAD_GECERSIZ';
  END IF;

  IF p_surum_turu = 'fiyat' THEN
    SELECT durum::text, revision_no
    INTO v_durum, v_revision_no
    FROM public.fiyat_listesi_surmleri
    WHERE id = p_surum_id
    FOR UPDATE;
  ELSIF p_surum_turu = 'maliyet' THEN
    SELECT durum::text, revision_no
    INTO v_durum, v_revision_no
    FROM public.maliyet_tarife_surmleri
    WHERE id = p_surum_id
    FOR UPDATE;
  ELSIF p_surum_turu = 'recete' THEN
    SELECT durum::text, revision_no
    INTO v_durum, v_revision_no
    FROM public.urun_maliyet_recete_surmleri
    WHERE id = p_surum_id
    FOR UPDATE;
  ELSE
    SELECT durum::text, revision_no
    INTO v_durum, v_revision_no
    FROM public.vade_profili_surmleri
    WHERE id = p_surum_id
    FOR UPDATE;
  END IF;

  IF v_revision_no IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TASLAK_SURUM_BULUNAMADI';
  END IF;
  IF v_revision_no IS DISTINCT FROM p_beklenen_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
  END IF;
  IF v_durum <> 'taslak' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'YALNIZ_TASLAK_SURUME_KALEM_YAZILABILIR';
  END IF;

  IF p_surum_turu = 'fiyat' THEN
    DELETE FROM public.fiyat_listesi_urun_kalemleri
    WHERE fiyat_listesi_surumu_id = p_surum_id;
    DELETE FROM public.fiyat_listesi_kenar_islem_kalemleri
    WHERE fiyat_listesi_surumu_id = p_surum_id;
    DELETE FROM public.fiyat_listesi_menfez_kalemleri
    WHERE fiyat_listesi_surumu_id = p_surum_id;
    DELETE FROM public.fiyat_listesi_kucuk_cam_kurallari
    WHERE fiyat_listesi_surumu_id = p_surum_id;
    DELETE FROM public.fiyat_listesi_nakliye_kurallari
    WHERE fiyat_listesi_surumu_id = p_surum_id;
    DELETE FROM public.fiyat_listesi_diger_kalemleri
    WHERE fiyat_listesi_surumu_id = p_surum_id;

    INSERT INTO public.fiyat_listesi_urun_kalemleri (
      fiyat_listesi_surumu_id, kapsam_tipi, stok_id, stok_grubu,
      birim_fiyat, yuzde_fark, para_birimi, kdv_grubu_id,
      minimum_m2, en_adimi_mm, boy_adimi_mm, aktif,
      olusturan_kullanici_id
    )
    SELECT
      p_surum_id, x.kapsam_tipi::public.ticari_kapsam_tipi,
      x.stok_id, nullif(btrim(x.stok_grubu), ''),
      x.birim_fiyat, x.yuzde_fark,
      x.para_birimi::public.para_birimi_kodu, x.kdv_grubu_id,
      x.minimum_m2, x.en_adimi_mm, x.boy_adimi_mm,
      COALESCE(x.aktif, true), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'urun', '[]'::jsonb)) AS x(
      kapsam_tipi text, stok_id uuid, stok_grubu text,
      birim_fiyat numeric, yuzde_fark numeric, para_birimi text,
      kdv_grubu_id uuid, minimum_m2 numeric, en_adimi_mm numeric,
      boy_adimi_mm numeric, aktif boolean
    );

    INSERT INTO public.fiyat_listesi_kenar_islem_kalemleri (
      fiyat_listesi_surumu_id, islem_turu, birim_fiyat, para_birimi,
      kdv_grubu_id, aktif, olusturan_kullanici_id
    )
    SELECT p_surum_id, btrim(x.islem_turu), x.birim_fiyat,
      x.para_birimi::public.para_birimi_kodu, x.kdv_grubu_id,
      COALESCE(x.aktif, true), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'kenar', '[]'::jsonb)) AS x(
      islem_turu text, birim_fiyat numeric, para_birimi text,
      kdv_grubu_id uuid, aktif boolean
    );

    INSERT INTO public.fiyat_listesi_menfez_kalemleri (
      fiyat_listesi_surumu_id, menfez_turu, cap_alt_mm, cap_ust_mm,
      birim_fiyat, para_birimi, kdv_grubu_id, aktif,
      olusturan_kullanici_id
    )
    SELECT p_surum_id, COALESCE(nullif(btrim(x.menfez_turu), ''), 'standart'),
      x.cap_alt_mm, x.cap_ust_mm, x.birim_fiyat,
      x.para_birimi::public.para_birimi_kodu, x.kdv_grubu_id,
      COALESCE(x.aktif, true), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'menfez', '[]'::jsonb)) AS x(
      menfez_turu text, cap_alt_mm numeric, cap_ust_mm numeric,
      birim_fiyat numeric, para_birimi text, kdv_grubu_id uuid,
      aktif boolean
    );

    INSERT INTO public.fiyat_listesi_kucuk_cam_kurallari (
      fiyat_listesi_surumu_id, alan_ust_siniri_m2, sabit_ek_tutar,
      yuzde_ek_bedel, para_birimi, kdv_grubu_id, aktif,
      olusturan_kullanici_id
    )
    SELECT p_surum_id, x.alan_ust_siniri_m2, x.sabit_ek_tutar,
      x.yuzde_ek_bedel, x.para_birimi::public.para_birimi_kodu,
      x.kdv_grubu_id, COALESCE(x.aktif, true), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'kucuk_cam', '[]'::jsonb)) AS x(
      alan_ust_siniri_m2 numeric, sabit_ek_tutar numeric,
      yuzde_ek_bedel numeric, para_birimi text, kdv_grubu_id uuid,
      aktif boolean
    );

    INSERT INTO public.fiyat_listesi_nakliye_kurallari (
      fiyat_listesi_surumu_id, hesaplama_tipi, birim_fiyat,
      minimum_tutar, para_birimi, kdv_grubu_id, aktif,
      olusturan_kullanici_id
    )
    SELECT p_surum_id,
      x.hesaplama_tipi::public.nakliye_hesaplama_tipi,
      x.birim_fiyat, x.minimum_tutar,
      x.para_birimi::public.para_birimi_kodu, x.kdv_grubu_id,
      COALESCE(x.aktif, true), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'nakliye', '[]'::jsonb)) AS x(
      hesaplama_tipi text, birim_fiyat numeric, minimum_tutar numeric,
      para_birimi text, kdv_grubu_id uuid, aktif boolean
    );

    INSERT INTO public.fiyat_listesi_diger_kalemleri (
      fiyat_listesi_surumu_id, kalem_kodu, kalem_adi,
      hesaplama_birimi, birim_fiyat, para_birimi, kdv_grubu_id,
      aktif, olusturan_kullanici_id
    )
    SELECT p_surum_id, btrim(x.kalem_kodu), btrim(x.kalem_adi),
      x.hesaplama_birimi::public.hesaplama_birimi, x.birim_fiyat,
      x.para_birimi::public.para_birimi_kodu, x.kdv_grubu_id,
      COALESCE(x.aktif, true), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'diger', '[]'::jsonb)) AS x(
      kalem_kodu text, kalem_adi text, hesaplama_birimi text,
      birim_fiyat numeric, para_birimi text, kdv_grubu_id uuid,
      aktif boolean
    );

    UPDATE public.fiyat_listesi_surmleri
    SET revision_no = revision_no + 1, updated_at = now()
    WHERE id = p_surum_id;
  ELSIF p_surum_turu = 'maliyet' THEN
    DELETE FROM public.maliyet_stok_kalemleri
    WHERE maliyet_tarife_surumu_id = p_surum_id;
    DELETE FROM public.maliyet_islem_kalemleri
    WHERE maliyet_tarife_surumu_id = p_surum_id;
    DELETE FROM public.maliyet_nakliye_kurallari
    WHERE maliyet_tarife_surumu_id = p_surum_id;
    DELETE FROM public.maliyet_genel_gider_kalemleri
    WHERE maliyet_tarife_surumu_id = p_surum_id;

    INSERT INTO public.maliyet_stok_kalemleri (
      maliyet_tarife_surumu_id, stok_id, hesaplama_birimi,
      birim_maliyet, para_birimi, fire_orani, aktif,
      olusturan_kullanici_id
    )
    SELECT p_surum_id, x.stok_id,
      x.hesaplama_birimi::public.hesaplama_birimi,
      x.birim_maliyet, x.para_birimi::public.para_birimi_kodu,
      COALESCE(x.fire_orani, 0), COALESCE(x.aktif, true), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'stok', '[]'::jsonb)) AS x(
      stok_id uuid, hesaplama_birimi text, birim_maliyet numeric,
      para_birimi text, fire_orani numeric, aktif boolean
    );

    INSERT INTO public.maliyet_islem_kalemleri (
      maliyet_tarife_surumu_id, islem_kodu, islem_turu,
      hesaplama_birimi, birim_maliyet, para_birimi, fire_orani,
      aktif, olusturan_kullanici_id
    )
    SELECT p_surum_id, btrim(x.islem_kodu), btrim(x.islem_turu),
      x.hesaplama_birimi::public.hesaplama_birimi,
      x.birim_maliyet, x.para_birimi::public.para_birimi_kodu,
      COALESCE(x.fire_orani, 0), COALESCE(x.aktif, true), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'islem', '[]'::jsonb)) AS x(
      islem_kodu text, islem_turu text, hesaplama_birimi text,
      birim_maliyet numeric, para_birimi text, fire_orani numeric,
      aktif boolean
    );

    INSERT INTO public.maliyet_nakliye_kurallari (
      maliyet_tarife_surumu_id, hesaplama_tipi, birim_maliyet,
      minimum_tutar, para_birimi, aktif, olusturan_kullanici_id
    )
    SELECT p_surum_id,
      x.hesaplama_tipi::public.nakliye_hesaplama_tipi,
      x.birim_maliyet, x.minimum_tutar,
      x.para_birimi::public.para_birimi_kodu,
      COALESCE(x.aktif, true), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'nakliye', '[]'::jsonb)) AS x(
      hesaplama_tipi text, birim_maliyet numeric, minimum_tutar numeric,
      para_birimi text, aktif boolean
    );

    INSERT INTO public.maliyet_genel_gider_kalemleri (
      maliyet_tarife_surumu_id, kalem_kodu, kalem_adi,
      hesaplama_birimi, birim_maliyet, para_birimi, aktif,
      olusturan_kullanici_id
    )
    SELECT p_surum_id, btrim(x.kalem_kodu), btrim(x.kalem_adi),
      x.hesaplama_birimi::public.hesaplama_birimi,
      x.birim_maliyet, x.para_birimi::public.para_birimi_kodu,
      COALESCE(x.aktif, true), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'genel_gider', '[]'::jsonb)) AS x(
      kalem_kodu text, kalem_adi text, hesaplama_birimi text,
      birim_maliyet numeric, para_birimi text, aktif boolean
    );

    UPDATE public.maliyet_tarife_surmleri
    SET revision_no = revision_no + 1, updated_at = now()
    WHERE id = p_surum_id;
  ELSIF p_surum_turu = 'recete' THEN
    DELETE FROM public.urun_maliyet_recete_kalemleri
    WHERE urun_maliyet_recete_surumu_id = p_surum_id;

    INSERT INTO public.urun_maliyet_recete_kalemleri (
      urun_maliyet_recete_surumu_id, bilesen_turu, ham_stok_id,
      referans_kodu, hesaplama_birimi, miktar_katsayisi,
      cevre_katsayisi, fire_orani_override, sira_no, aciklama,
      olusturan_kullanici_id
    )
    SELECT p_surum_id, btrim(x.bilesen_turu), x.ham_stok_id,
      nullif(btrim(x.referans_kodu), ''),
      x.hesaplama_birimi::public.hesaplama_birimi,
      COALESCE(x.miktar_katsayisi, 1),
      COALESCE(x.cevre_katsayisi, 1), x.fire_orani_override,
      x.sira_no, nullif(btrim(x.aciklama), ''), auth.uid()
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'kalemler', '[]'::jsonb)) AS x(
      bilesen_turu text, ham_stok_id uuid, referans_kodu text,
      hesaplama_birimi text, miktar_katsayisi numeric,
      cevre_katsayisi numeric, fire_orani_override numeric,
      sira_no integer, aciklama text
    );

    UPDATE public.urun_maliyet_recete_surmleri
    SET revision_no = revision_no + 1, updated_at = now()
    WHERE id = p_surum_id;
  ELSE
    DELETE FROM public.vade_profili_kademeleri
    WHERE vade_profili_surumu_id = p_surum_id;

    INSERT INTO public.vade_profili_kademeleri (
      vade_profili_surumu_id, gun_alt_siniri, gun_ust_siniri,
      vade_farki_yuzdesi, sira_no
    )
    SELECT p_surum_id, x.gun_alt_siniri, x.gun_ust_siniri,
      x.vade_farki_yuzdesi, x.sira_no
    FROM jsonb_to_recordset(COALESCE(p_kalemler -> 'kademeler', '[]'::jsonb)) AS x(
      gun_alt_siniri integer, gun_ust_siniri integer,
      vade_farki_yuzdesi numeric, sira_no integer
    );

    UPDATE public.vade_profili_surmleri
    SET revision_no = revision_no + 1, updated_at = now()
    WHERE id = p_surum_id;
  END IF;

  SELECT COALESCE(sum(
    CASE
      WHEN jsonb_typeof(value) = 'array' THEN jsonb_array_length(value)
      ELSE 0
    END
  ), 0)::integer
  INTO v_kalem_sayisi
  FROM jsonb_each(p_kalemler);

  RETURN jsonb_build_object(
    'basarili', true,
    'surum_id', p_surum_id,
    'revision_no', v_revision_no + 1,
    'kalem_sayisi', v_kalem_sayisi
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ticari_yayin_gecisi_yalniz_rpc()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_surum_yayinla_internal(
  text, text, text, uuid, integer, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiyat_listesi_surumu_kopyala(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_surum_kopyala_internal(
  text, text, uuid, text[], text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manuel_doviz_kuru_kaydet(
  date, public.para_birimi_kodu, public.doviz_kur_tipi, numeric, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_siparis_dogrudan_yazimini_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_siparis_detay_dogrudan_yazimini_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_taslak_ana_kaydi_olustur(text, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_taslak_kalemlerini_toplu_degistir(
  text, uuid, integer, jsonb
) FROM PUBLIC, anon;

DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'fiyat_listesi_surumu_yayinla(uuid, integer, text)',
    'maliyet_tarife_surumu_yayinla(uuid, integer, text)',
    'maliyet_recete_surumu_yayinla(uuid, integer, text)',
    'kdv_grup_surumu_yayinla(uuid, integer, text)',
    'vade_profili_surumu_yayinla(uuid, integer, text)',
    'musteri_ticari_profil_surumu_yayinla(uuid, integer, text)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || v_signature || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || v_signature || ' TO authenticated';
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION public.fiyat_listesi_surumu_kopyala(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.maliyet_tarife_surumu_kopyala(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.maliyet_recete_surumu_kopyala(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.kdv_grup_surumu_kopyala(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.vade_profili_surumu_kopyala(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.musteri_ticari_profil_surumu_kopyala(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.manuel_doviz_kuru_kaydet(
  date, public.para_birimi_kodu, public.doviz_kur_tipi, numeric, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ticari_taslak_kalemlerini_toplu_degistir(
  text, uuid, integer, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ticari_taslak_ana_kaydi_olustur(text, jsonb)
  TO authenticated;
