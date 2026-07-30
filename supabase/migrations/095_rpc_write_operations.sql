-- 095 - Stok merkezli maliyet yazma işlemleri

SET search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.stok_maliyet_audit_baglamini_ayarla(
  p_rpc_adi text,
  p_idempotency_key text,
  p_gerekce text,
  p_kaynak text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM set_config(
    'app.audit_context',
    jsonb_build_object(
      'rpc_adi', p_rpc_adi,
      'idempotency_key', p_idempotency_key,
      'gerekce', p_gerekce,
      'kaynak', COALESCE(NULLIF(btrim(p_kaynak), ''), 'api'),
      'oturum_id', public.current_auth_session_id(),
      'aal', COALESCE(auth.jwt() ->> 'aal', 'aal1')
    )::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_yazma_yetkisini_dogrula(
  p_action text,
  p_aal2 boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', p_action) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format('COSTING_%s_YETKISI_GEREKLI', upper(p_action));
  END IF;
  IF p_aal2 AND NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_fiyatini_aktiflestir_internal(
  p_fiyat_id uuid,
  p_baslangic timestamptz,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS public.stok_maliyet_kaynagi_atamalari
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fiyat public.stok_alis_fiyatlari%ROWTYPE;
  v_mevcut public.stok_maliyet_kaynagi_atamalari%ROWTYPE;
  v_sonraki_baslangic timestamptz;
  v_atama public.stok_maliyet_kaynagi_atamalari%ROWTYPE;
  v_kaynak_turu text;
  v_kaynak_id uuid;
  v_profil_turu text;
BEGIN
  IF p_baslangic IS NULL OR length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AKTIFLESTIRME_BILGILERI_GECERSIZ';
  END IF;

  SELECT * INTO v_fiyat
  FROM public.stok_alis_fiyatlari
  WHERE id = p_fiyat_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOK_ALIS_FIYATI_BULUNAMADI';
  END IF;
  IF v_fiyat.durum NOT IN ('dogrulanmis', 'duzeltme')
     OR v_fiyat.kaynak_turu = 'legacy_unverified' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DOGRULANMIS_FIYAT_GEREKLI';
  END IF;
  SELECT profil_turu INTO v_profil_turu
  FROM public.stok_maliyet_profilleri
  WHERE stok_id = v_fiyat.stok_id
    AND gecerlilik_donemi @> (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date
  LIMIT 1;
  IF v_profil_turu = 'cam' AND v_fiyat.kaynak_turu <> 'cam_baglantisi' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'CAM_MALIYET_KAYNAGI_BAGLANTI_OLMALI',
      DETAIL = 'Cam alış fiyatları aktif bir cam tedarik bağlantısı üzerinden yönetilmelidir.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('stok_maliyet:' || v_fiyat.stok_id::text, 0));

  SELECT * INTO v_mevcut
  FROM public.stok_maliyet_kaynagi_atamalari
  WHERE stok_id = v_fiyat.stok_id
    AND gecerlilik_donemi @> p_baslangic
  FOR UPDATE;

  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) = p_baslangic THEN
      IF v_mevcut.fiyat_id = p_fiyat_id THEN
        RETURN v_mevcut;
      END IF;
      RAISE EXCEPTION USING
        ERRCODE = '23P01',
        MESSAGE = 'AYNI_BASLANGICTA_FARKLI_FIYAT_VAR',
        DETAIL = 'Yeni dönem başlangıcı mevcut dönem başlangıcından sonra olmalıdır.';
    END IF;
    UPDATE public.stok_maliyet_kaynagi_atamalari
    SET
      gecerlilik_donemi = tstzrange(lower(gecerlilik_donemi), p_baslangic, '[)'),
      kapatan_kullanici_id = auth.uid(),
      kapatma_nedeni = btrim(p_gerekce),
      closed_at = now()
    WHERE id = v_mevcut.id;
  END IF;

  SELECT min(lower(gecerlilik_donemi))
  INTO v_sonraki_baslangic
  FROM public.stok_maliyet_kaynagi_atamalari
  WHERE stok_id = v_fiyat.stok_id
    AND lower(gecerlilik_donemi) > p_baslangic;

  v_kaynak_turu := CASE
    WHEN v_fiyat.kaynak_turu = 'cam_baglantisi' THEN 'cam_baglantisi'
    ELSE 'dogrudan_fiyat'
  END;
  v_kaynak_id := CASE
    WHEN v_kaynak_turu = 'cam_baglantisi' THEN v_fiyat.cam_baglantisi_id
    ELSE v_fiyat.id
  END;

  INSERT INTO public.stok_maliyet_kaynagi_atamalari (
    stok_id,
    fiyat_id,
    kaynak_turu,
    kaynak_id,
    gecerlilik_donemi,
    aktiflestiren_kullanici_id,
    aktiflestirme_nedeni,
    idempotency_key
  )
  VALUES (
    v_fiyat.stok_id,
    v_fiyat.id,
    v_kaynak_turu,
    v_kaynak_id,
    tstzrange(p_baslangic, v_sonraki_baslangic, '[)'),
    auth.uid(),
    btrim(p_gerekce),
    p_idempotency_key
  )
  RETURNING * INTO v_atama;

  RETURN v_atama;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_profili_kaydet(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stok_id uuid := (p_payload ->> 'stok_id')::uuid;
  v_baslangic date := COALESCE((p_payload ->> 'gecerlilik_baslangici')::date, current_date);
  v_mevcut public.stok_maliyet_profilleri%ROWTYPE;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_id uuid;
  v_revision integer;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);
  v_idempotency := public.ticari_idempotency_baslat(
    'stok_maliyet_profili_kaydet', p_idempotency_key, p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_maliyet_profili_kaydet', p_idempotency_key,
    p_payload ->> 'aciklama', p_payload ->> 'kaynak'
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('stok_profili:' || v_stok_id::text, 0));

  SELECT * INTO v_mevcut
  FROM public.stok_maliyet_profilleri
  WHERE stok_id = v_stok_id AND gecerlilik_donemi @> v_baslangic
  FOR UPDATE;
  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) >= v_baslangic THEN
      RAISE EXCEPTION USING ERRCODE = '23P01', MESSAGE = 'PROFIL_BASLANGICI_MEVCUT_DONEMDEN_SONRA_OLMALI';
    END IF;
    UPDATE public.stok_maliyet_profilleri
    SET gecerlilik_donemi = daterange(lower(gecerlilik_donemi), v_baslangic, '[)')
    WHERE id = v_mevcut.id;
  END IF;

  SELECT COALESCE(max(revision_no), 0) + 1 INTO v_revision
  FROM public.stok_maliyet_profilleri WHERE stok_id = v_stok_id;

  INSERT INTO public.stok_maliyet_profilleri (
    stok_id, profil_turu, cam_fiyat_grubu_id, cita_malzeme_turu, olcu_mm,
    hesaplama_tipi, tuketim_katsayisi, bosluk_basi, fire_orani,
    fiyat_birimi, stok_ana_birimi, donusum_katsayisi,
    gecerlilik_donemi, revision_no, aciklama, olusturan_kullanici_id
  )
  VALUES (
    v_stok_id,
    p_payload ->> 'profil_turu',
    NULLIF(p_payload ->> 'cam_fiyat_grubu_id', '')::uuid,
    NULLIF(p_payload ->> 'cita_malzeme_turu', ''),
    NULLIF(p_payload ->> 'olcu_mm', '')::numeric,
    NULLIF(p_payload ->> 'hesaplama_tipi', ''),
    NULLIF(p_payload ->> 'tuketim_katsayisi', '')::numeric,
    COALESCE((p_payload ->> 'bosluk_basi')::boolean, false),
    COALESCE((p_payload ->> 'fire_orani')::numeric, 0),
    p_payload ->> 'fiyat_birimi',
    p_payload ->> 'stok_ana_birimi',
    COALESCE((p_payload ->> 'donusum_katsayisi')::numeric, 1),
    daterange(v_baslangic, NULL, '[)'),
    v_revision,
    NULLIF(btrim(p_payload ->> 'aciklama'), ''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  v_yanit := jsonb_build_object(
    'basarili', true, 'profil_id', v_id, 'stok_id', v_stok_id,
    'revision_no', v_revision, 'gecerlilik_baslangici', v_baslangic
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_alis_fiyati_kaydet(
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
  v_fiyat_id uuid;
  v_stok_birimi text;
  v_durum text;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('create', false);
  v_idempotency := public.ticari_idempotency_baslat(
    'stok_alis_fiyati_kaydet', p_idempotency_key, p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_alis_fiyati_kaydet', p_idempotency_key,
    p_payload ->> 'duzeltme_nedeni', p_payload ->> 'kaynak_ekran'
  );

  SELECT birim INTO v_stok_birimi
  FROM public.stok
  WHERE id = (p_payload ->> 'stok_id')::uuid AND aktif;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AKTIF_STOK_BULUNAMADI';
  END IF;

  v_durum := CASE
    WHEN NULLIF(p_payload ->> 'onceki_fiyat_id', '') IS NOT NULL THEN 'duzeltme'
    ELSE 'dogrulanmis'
  END;
  INSERT INTO public.stok_alis_fiyatlari (
    stok_id, tedarikci_id, birim_fiyat, para_birimi, fiyat_birimi,
    paket_miktari, stok_ana_birimi, donusum_katsayisi, donusum_aciklamasi, vade_gunu,
    fiyat_tarihi, kaynak_turu, kaynak_referansi, durum,
    onceki_fiyat_id, duzeltme_nedeni, idempotency_id, olusturan_kullanici_id
  )
  VALUES (
    (p_payload ->> 'stok_id')::uuid,
    (p_payload ->> 'tedarikci_id')::uuid,
    (p_payload ->> 'birim_fiyat')::numeric,
    (p_payload ->> 'para_birimi')::public.para_birimi_kodu,
    p_payload ->> 'fiyat_birimi',
    NULLIF(p_payload ->> 'paket_miktari', '')::numeric,
    COALESCE(NULLIF(p_payload ->> 'stok_ana_birimi', ''), v_stok_birimi),
    COALESCE((p_payload ->> 'donusum_katsayisi')::numeric, 1),
    NULLIF(btrim(p_payload ->> 'donusum_aciklamasi'), ''),
    COALESCE((p_payload ->> 'vade_gunu')::integer, 0),
    COALESCE((p_payload ->> 'fiyat_tarihi')::timestamptz, now()),
    'dogrudan',
    NULLIF(p_payload ->> 'kaynak_referansi', ''),
    v_durum,
    NULLIF(p_payload ->> 'onceki_fiyat_id', '')::uuid,
    NULLIF(btrim(p_payload ->> 'duzeltme_nedeni'), ''),
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_fiyat_id;

  v_yanit := jsonb_build_object(
    'basarili', true, 'fiyat_id', v_fiyat_id,
    'stok_id', p_payload ->> 'stok_id', 'durum', v_durum
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_alis_fiyati_aktiflestir(
  p_fiyat_id uuid,
  p_gecerlilik_baslangici timestamptz,
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
  v_atama public.stok_maliyet_kaynagi_atamalari%ROWTYPE;
  v_payload jsonb;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);
  IF length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AKTIFLESTIRME_GEREKCESI_ZORUNLU';
  END IF;
  v_payload := jsonb_build_object(
    'fiyat_id', p_fiyat_id, 'gecerlilik_baslangici', p_gecerlilik_baslangici,
    'gerekce', btrim(p_gerekce)
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'stok_alis_fiyati_aktiflestir', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_alis_fiyati_aktiflestir', p_idempotency_key, p_gerekce, 'api'
  );
  v_atama := public.stok_maliyet_fiyatini_aktiflestir_internal(
    p_fiyat_id, COALESCE(p_gecerlilik_baslangici, now()),
    p_gerekce, p_idempotency_key
  );
  v_yanit := jsonb_build_object(
    'basarili', true, 'atama_id', v_atama.id, 'fiyat_id', v_atama.fiyat_id,
    'stok_id', v_atama.stok_id,
    'gecerlilik_baslangici', lower(v_atama.gecerlilik_donemi),
    'gecerlilik_bitisi', CASE WHEN upper_inf(v_atama.gecerlilik_donemi)
      THEN NULL ELSE upper(v_atama.gecerlilik_donemi) END
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_alis_fiyati_kaydet_ve_aktiflestir(
  p_payload jsonb,
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
  v_stok_birimi text;
  v_fiyat_id uuid;
  v_atama public.stok_maliyet_kaynagi_atamalari%ROWTYPE;
  v_payload jsonb;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);
  IF length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AKTIFLESTIRME_GEREKCESI_ZORUNLU';
  END IF;
  v_payload := p_payload || jsonb_build_object('gerekce', btrim(p_gerekce));
  v_idempotency := public.ticari_idempotency_baslat(
    'stok_alis_fiyati_kaydet_ve_aktiflestir', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_alis_fiyati_kaydet_ve_aktiflestir', p_idempotency_key,
    p_gerekce, p_payload ->> 'kaynak_ekran'
  );
  SELECT birim INTO v_stok_birimi
  FROM public.stok
  WHERE id = (p_payload ->> 'stok_id')::uuid AND aktif;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AKTIF_STOK_BULUNAMADI';
  END IF;

  INSERT INTO public.stok_alis_fiyatlari (
    stok_id, tedarikci_id, birim_fiyat, para_birimi, fiyat_birimi,
    paket_miktari, stok_ana_birimi, donusum_katsayisi, donusum_aciklamasi, vade_gunu,
    fiyat_tarihi, kaynak_turu, kaynak_referansi, durum,
    onceki_fiyat_id, duzeltme_nedeni, idempotency_id, olusturan_kullanici_id
  )
  VALUES (
    (p_payload ->> 'stok_id')::uuid,
    (p_payload ->> 'tedarikci_id')::uuid,
    (p_payload ->> 'birim_fiyat')::numeric,
    (p_payload ->> 'para_birimi')::public.para_birimi_kodu,
    p_payload ->> 'fiyat_birimi',
    NULLIF(p_payload ->> 'paket_miktari', '')::numeric,
    COALESCE(NULLIF(p_payload ->> 'stok_ana_birimi', ''), v_stok_birimi),
    COALESCE((p_payload ->> 'donusum_katsayisi')::numeric, 1),
    NULLIF(btrim(p_payload ->> 'donusum_aciklamasi'), ''),
    COALESCE((p_payload ->> 'vade_gunu')::integer, 0),
    COALESCE((p_payload ->> 'fiyat_tarihi')::timestamptz, now()),
    'dogrudan',
    NULLIF(p_payload ->> 'kaynak_referansi', ''),
    CASE WHEN NULLIF(p_payload ->> 'onceki_fiyat_id', '') IS NULL
      THEN 'dogrulanmis' ELSE 'duzeltme' END,
    NULLIF(p_payload ->> 'onceki_fiyat_id', '')::uuid,
    NULLIF(btrim(p_payload ->> 'duzeltme_nedeni'), ''),
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_fiyat_id;

  v_atama := public.stok_maliyet_fiyatini_aktiflestir_internal(
    v_fiyat_id,
    COALESCE((p_payload ->> 'gecerlilik_baslangici')::timestamptz, now()),
    p_gerekce,
    p_idempotency_key
  );
  v_yanit := jsonb_build_object(
    'basarili', true, 'fiyat_id', v_fiyat_id, 'atama_id', v_atama.id,
    'stok_id', v_atama.stok_id,
    'gecerlilik_baslangici', lower(v_atama.gecerlilik_donemi)
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_kaynagi_kapat(
  p_atama_id uuid,
  p_kapanis_zamani timestamptz,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_atama public.stok_maliyet_kaynagi_atamalari%ROWTYPE;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_payload jsonb;
  v_kapanis timestamptz := COALESCE(p_kapanis_zamani, now());
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);
  IF length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'KAPATMA_GEREKCESI_ZORUNLU';
  END IF;
  v_payload := jsonb_build_object(
    'atama_id', p_atama_id, 'kapanis_zamani', v_kapanis, 'gerekce', btrim(p_gerekce)
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'stok_maliyet_kaynagi_kapat', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  SELECT * INTO v_atama
  FROM public.stok_maliyet_kaynagi_atamalari
  WHERE id = p_atama_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MALIYET_KAYNAK_ATAMASI_BULUNAMADI';
  END IF;
  IF NOT upper_inf(v_atama.gecerlilik_donemi) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MALIYET_KAYNAK_DONEMI_ZATEN_KAPALI';
  END IF;
  IF v_kapanis <= lower(v_atama.gecerlilik_donemi) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'KAPANIS_BASLANGICTAN_SONRA_OLMALI';
  END IF;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_maliyet_kaynagi_kapat', p_idempotency_key, p_gerekce, 'api'
  );
  UPDATE public.stok_maliyet_kaynagi_atamalari
  SET
    gecerlilik_donemi = tstzrange(lower(gecerlilik_donemi), v_kapanis, '[)'),
    kapatan_kullanici_id = auth.uid(),
    kapatma_nedeni = btrim(p_gerekce),
    closed_at = now()
  WHERE id = p_atama_id;
  v_yanit := jsonb_build_object(
    'basarili', true, 'atama_id', p_atama_id, 'kapanis_zamani', v_kapanis
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.cam_baglantisi_olustur(
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
  v_baglanti_id uuid;
  v_kalem jsonb;
  v_stok_id jsonb;
  v_kalem_id uuid;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('create', false);
  v_idempotency := public.ticari_idempotency_baslat(
    'cam_baglantisi_olustur', p_idempotency_key, p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'cam_baglantisi_olustur', p_idempotency_key,
    p_payload ->> 'aciklama', p_payload ->> 'kaynak_ekran'
  );

  INSERT INTO public.cam_tedarik_baglantilari (
    tedarikci_id, baglanti_no, toplam_tutar, para_birimi,
    baslangic_tarihi, aciklama, olusturan_kullanici_id, idempotency_id
  )
  VALUES (
    (p_payload ->> 'tedarikci_id')::uuid,
    p_payload ->> 'baglanti_no',
    (p_payload ->> 'toplam_tutar')::numeric,
    (p_payload ->> 'para_birimi')::public.para_birimi_kodu,
    (p_payload ->> 'baslangic_tarihi')::date,
    NULLIF(btrim(p_payload ->> 'aciklama'), ''),
    auth.uid(),
    v_idempotency_id
  )
  RETURNING id INTO v_baglanti_id;

  FOR v_kalem IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload -> 'kalemler', '[]'::jsonb))
  LOOP
    INSERT INTO public.cam_tedarik_baglanti_kalemleri (
      baglanti_id, cam_fiyat_grubu_id, birim_fiyat, para_birimi,
      fiyat_birimi, paket_miktari, stok_ana_birimi, donusum_katsayisi,
      vade_gunu, aciklama, olusturan_kullanici_id
    )
    VALUES (
      v_baglanti_id,
      (v_kalem ->> 'cam_fiyat_grubu_id')::uuid,
      (v_kalem ->> 'birim_fiyat')::numeric,
      COALESCE(v_kalem ->> 'para_birimi', p_payload ->> 'para_birimi')::public.para_birimi_kodu,
      v_kalem ->> 'fiyat_birimi',
      NULLIF(v_kalem ->> 'paket_miktari', '')::numeric,
      v_kalem ->> 'stok_ana_birimi',
      COALESCE((v_kalem ->> 'donusum_katsayisi')::numeric, 1),
      COALESCE((v_kalem ->> 'vade_gunu')::integer, 0),
      NULLIF(btrim(v_kalem ->> 'aciklama'), ''),
      auth.uid()
    )
    RETURNING id INTO v_kalem_id;
    FOR v_stok_id IN SELECT value FROM jsonb_array_elements(COALESCE(v_kalem -> 'stok_ids', '[]'::jsonb))
    LOOP
      INSERT INTO public.cam_tedarik_baglanti_kalem_stoklari (
        baglanti_kalemi_id, stok_id
      )
      VALUES (v_kalem_id, (v_stok_id #>> '{}')::uuid);
    END LOOP;
  END LOOP;

  v_yanit := jsonb_build_object(
    'basarili', true, 'baglanti_id', v_baglanti_id, 'durum', 'taslak'
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.cam_baglantisi_kalem_kaydet(
  p_baglanti_id uuid,
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
  v_kalem_id uuid;
  v_stok_id jsonb;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);
  IF NOT EXISTS (
    SELECT 1 FROM public.cam_tedarik_baglantilari
    WHERE id = p_baglanti_id AND durum = 'taslak'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TASLAK_CAM_BAGLANTISI_GEREKLI';
  END IF;
  v_idempotency := public.ticari_idempotency_baslat(
    'cam_baglantisi_kalem_kaydet', p_idempotency_key,
    p_payload || jsonb_build_object('baglanti_id', p_baglanti_id)
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'cam_baglantisi_kalem_kaydet', p_idempotency_key,
    p_payload ->> 'aciklama', p_payload ->> 'kaynak_ekran'
  );
  INSERT INTO public.cam_tedarik_baglanti_kalemleri (
    baglanti_id, cam_fiyat_grubu_id, birim_fiyat, para_birimi,
    fiyat_birimi, paket_miktari, stok_ana_birimi, donusum_katsayisi,
    vade_gunu, aciklama, olusturan_kullanici_id
  )
  VALUES (
    p_baglanti_id, (p_payload ->> 'cam_fiyat_grubu_id')::uuid,
    (p_payload ->> 'birim_fiyat')::numeric,
    (p_payload ->> 'para_birimi')::public.para_birimi_kodu,
    p_payload ->> 'fiyat_birimi',
    NULLIF(p_payload ->> 'paket_miktari', '')::numeric,
    p_payload ->> 'stok_ana_birimi',
    COALESCE((p_payload ->> 'donusum_katsayisi')::numeric, 1),
    COALESCE((p_payload ->> 'vade_gunu')::integer, 0),
    NULLIF(btrim(p_payload ->> 'aciklama'), ''),
    auth.uid()
  )
  RETURNING id INTO v_kalem_id;
  FOR v_stok_id IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload -> 'stok_ids', '[]'::jsonb))
  LOOP
    INSERT INTO public.cam_tedarik_baglanti_kalem_stoklari (baglanti_kalemi_id, stok_id)
    VALUES (v_kalem_id, (v_stok_id #>> '{}')::uuid);
  END LOOP;
  v_yanit := jsonb_build_object(
    'basarili', true, 'baglanti_id', p_baglanti_id, 'kalem_id', v_kalem_id
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.cam_baglantisi_aktiflestir(
  p_baglanti_id uuid,
  p_revision_no integer,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_baglanti public.cam_tedarik_baglantilari%ROWTYPE;
  v_eslesme record;
  v_fiyat_id uuid;
  v_atama public.stok_maliyet_kaynagi_atamalari%ROWTYPE;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_payload jsonb;
  v_baslangic timestamptz;
  v_fiyat_sayisi integer := 0;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);
  IF length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AKTIFLESTIRME_GEREKCESI_ZORUNLU';
  END IF;
  v_payload := jsonb_build_object(
    'baglanti_id', p_baglanti_id, 'revision_no', p_revision_no, 'gerekce', btrim(p_gerekce)
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'cam_baglantisi_aktiflestir', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  SELECT * INTO v_baglanti
  FROM public.cam_tedarik_baglantilari
  WHERE id = p_baglanti_id
  FOR UPDATE;
  IF NOT FOUND OR v_baglanti.durum <> 'taslak' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TASLAK_CAM_BAGLANTISI_GEREKLI';
  END IF;
  IF v_baglanti.revision_no <> p_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CAM_BAGLANTISI_REVIZYON_CAKISMASI';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.cam_tedarik_baglanti_kalemleri kalem
    JOIN public.cam_tedarik_baglanti_kalem_stoklari eslesme
      ON eslesme.baglanti_kalemi_id = kalem.id
    WHERE kalem.baglanti_id = p_baglanti_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CAM_BAGLANTISI_KALEM_VE_STOK_GEREKLI';
  END IF;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'cam_baglantisi_aktiflestir', p_idempotency_key, p_gerekce, 'api'
  );
  v_baslangic := v_baglanti.baslangic_tarihi::timestamp AT TIME ZONE 'Europe/Istanbul';

  FOR v_eslesme IN
    SELECT
      kalem.*, eslesme.stok_id
    FROM public.cam_tedarik_baglanti_kalemleri kalem
    JOIN public.cam_tedarik_baglanti_kalem_stoklari eslesme
      ON eslesme.baglanti_kalemi_id = kalem.id
    WHERE kalem.baglanti_id = p_baglanti_id
    ORDER BY eslesme.stok_id
  LOOP
    INSERT INTO public.stok_alis_fiyatlari (
      stok_id, tedarikci_id, birim_fiyat, para_birimi, fiyat_birimi,
      paket_miktari, stok_ana_birimi, donusum_katsayisi, donusum_aciklamasi, vade_gunu,
      fiyat_tarihi, kaynak_turu, kaynak_referansi, durum,
      olusturan_kullanici_id, cam_baglantisi_id, cam_baglantisi_kalem_id
    )
    VALUES (
      v_eslesme.stok_id, v_baglanti.tedarikci_id, v_eslesme.birim_fiyat,
      v_eslesme.para_birimi, v_eslesme.fiyat_birimi, v_eslesme.paket_miktari,
      v_eslesme.stok_ana_birimi, v_eslesme.donusum_katsayisi,
      CASE WHEN lower(v_eslesme.fiyat_birimi) = lower(v_eslesme.stok_ana_birimi)
        THEN NULL ELSE 'Cam bağlantısı kaleminde tanımlı birim dönüşümü' END,
      v_eslesme.vade_gunu, v_baslangic, 'cam_baglantisi',
      v_baglanti.baglanti_no, 'dogrulanmis', auth.uid(),
      v_baglanti.id, v_eslesme.id
    )
    RETURNING id INTO v_fiyat_id;
    v_atama := public.stok_maliyet_fiyatini_aktiflestir_internal(
      v_fiyat_id, v_baslangic, p_gerekce,
      p_idempotency_key || ':' || v_eslesme.stok_id::text
    );
    v_fiyat_sayisi := v_fiyat_sayisi + 1;
  END LOOP;

  UPDATE public.cam_tedarik_baglantilari
  SET durum = 'aktif', aktiflestiren_kullanici_id = auth.uid()
  WHERE id = p_baglanti_id;
  v_yanit := jsonb_build_object(
    'basarili', true, 'baglanti_id', p_baglanti_id,
    'durum', 'aktif', 'aktif_fiyat_sayisi', v_fiyat_sayisi
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.cam_baglantisi_kapat(
  p_baglanti_id uuid,
  p_kapanis_zamani timestamptz,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_baglanti public.cam_tedarik_baglantilari%ROWTYPE;
  v_atama record;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_payload jsonb;
  v_kapanis timestamptz := COALESCE(p_kapanis_zamani, now());
  v_sayi integer := 0;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);
  IF length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BAGLANTI_KAPATMA_GEREKCESI_ZORUNLU';
  END IF;
  v_payload := jsonb_build_object(
    'baglanti_id', p_baglanti_id, 'kapanis_zamani', v_kapanis, 'gerekce', btrim(p_gerekce)
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'cam_baglantisi_kapat', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  SELECT * INTO v_baglanti
  FROM public.cam_tedarik_baglantilari
  WHERE id = p_baglanti_id
  FOR UPDATE;
  IF NOT FOUND OR v_baglanti.durum <> 'aktif' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AKTIF_CAM_BAGLANTISI_GEREKLI';
  END IF;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'cam_baglantisi_kapat', p_idempotency_key, p_gerekce, 'api'
  );
  FOR v_atama IN
    SELECT id, lower(gecerlilik_donemi) AS baslangic
    FROM public.stok_maliyet_kaynagi_atamalari
    WHERE kaynak_turu = 'cam_baglantisi'
      AND kaynak_id = p_baglanti_id
      AND upper_inf(gecerlilik_donemi)
    FOR UPDATE
  LOOP
    IF v_kapanis <= v_atama.baslangic THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'KAPANIS_BASLANGICTAN_SONRA_OLMALI';
    END IF;
    UPDATE public.stok_maliyet_kaynagi_atamalari
    SET
      gecerlilik_donemi = tstzrange(v_atama.baslangic, v_kapanis, '[)'),
      kapatan_kullanici_id = auth.uid(),
      kapatma_nedeni = btrim(p_gerekce),
      closed_at = now()
    WHERE id = v_atama.id;
    v_sayi := v_sayi + 1;
  END LOOP;
  UPDATE public.cam_tedarik_baglantilari
  SET
    durum = 'kapali',
    kapanis_tarihi = (v_kapanis AT TIME ZONE 'Europe/Istanbul')::date,
    kapatan_kullanici_id = auth.uid(),
    kapatma_nedeni = btrim(p_gerekce)
  WHERE id = p_baglanti_id;
  v_yanit := jsonb_build_object(
    'basarili', true, 'baglanti_id', p_baglanti_id,
    'durum', 'kapali', 'kapatilan_fiyat_sayisi', v_sayi
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.legacy_fiyat_dogrula(
  p_legacy_fiyat_id uuid,
  p_payload jsonb,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_legacy public.stok_alis_fiyatlari%ROWTYPE;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_fiyat_id uuid;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);
  IF length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LEGACY_DOGRULAMA_GEREKCESI_ZORUNLU';
  END IF;
  v_idempotency := public.ticari_idempotency_baslat(
    'legacy_fiyat_dogrula', p_idempotency_key,
    p_payload || jsonb_build_object(
      'legacy_fiyat_id', p_legacy_fiyat_id, 'gerekce', btrim(p_gerekce)
    )
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;
  SELECT * INTO v_legacy
  FROM public.stok_alis_fiyatlari
  WHERE id = p_legacy_fiyat_id AND kaynak_turu = 'legacy_unverified'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DOGRULANMAMIS_LEGACY_FIYAT_BULUNAMADI';
  END IF;
  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'legacy_fiyat_dogrula', p_idempotency_key, p_gerekce,
    COALESCE(p_payload ->> 'kaynak_ekran', 'legacy_dogrulama')
  );
  INSERT INTO public.stok_alis_fiyatlari (
    stok_id, tedarikci_id, birim_fiyat, para_birimi, fiyat_birimi,
    paket_miktari, stok_ana_birimi, donusum_katsayisi, donusum_aciklamasi, vade_gunu,
    fiyat_tarihi, kaynak_turu, kaynak_referansi, durum,
    onceki_fiyat_id, duzeltme_nedeni, idempotency_id, olusturan_kullanici_id
  )
  VALUES (
    v_legacy.stok_id,
    (p_payload ->> 'tedarikci_id')::uuid,
    COALESCE((p_payload ->> 'birim_fiyat')::numeric, v_legacy.birim_fiyat),
    (p_payload ->> 'para_birimi')::public.para_birimi_kodu,
    p_payload ->> 'fiyat_birimi',
    NULLIF(p_payload ->> 'paket_miktari', '')::numeric,
    p_payload ->> 'stok_ana_birimi',
    (p_payload ->> 'donusum_katsayisi')::numeric,
    NULLIF(btrim(p_payload ->> 'donusum_aciklamasi'), ''),
    COALESCE((p_payload ->> 'vade_gunu')::integer, 0),
    COALESCE((p_payload ->> 'fiyat_tarihi')::timestamptz, now()),
    'legacy_verified',
    v_legacy.id::text,
    'duzeltme',
    v_legacy.id,
    btrim(p_gerekce),
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_fiyat_id;
  v_yanit := jsonb_build_object(
    'basarili', true, 'legacy_fiyat_id', v_legacy.id,
    'fiyat_id', v_fiyat_id, 'stok_id', v_legacy.stok_id,
    'durum', 'dogrulanmis'
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

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
  IF NOT EXISTS (
    SELECT 1 FROM public.cari
    WHERE id = p_tedarikci_id AND tipi = 'tedarikci' AND aktif
    FOR UPDATE
  ) THEN
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
  UPDATE public.cari SET aktif = false WHERE id = p_tedarikci_id;
  v_yanit := jsonb_build_object(
    'basarili', true, 'tedarikci_id', p_tedarikci_id,
    'aktif', false, 'engeller', v_engeller
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

REVOKE ALL ON FUNCTION public.stok_maliyet_audit_baglamini_ayarla(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_maliyet_yazma_yetkisini_dogrula(text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_maliyet_fiyatini_aktiflestir_internal(uuid, timestamptz, text, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.stok_maliyet_profili_kaydet(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_alis_fiyati_kaydet(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_alis_fiyati_aktiflestir(uuid, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_alis_fiyati_kaydet_ve_aktiflestir(jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_maliyet_kaynagi_kapat(uuid, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cam_baglantisi_olustur(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cam_baglantisi_kalem_kaydet(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cam_baglantisi_aktiflestir(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cam_baglantisi_kapat(uuid, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.legacy_fiyat_dogrula(uuid, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tedarikci_pasiflestir(uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.stok_maliyet_profili_kaydet(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_alis_fiyati_kaydet(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_alis_fiyati_aktiflestir(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_alis_fiyati_kaydet_ve_aktiflestir(jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_maliyet_kaynagi_kapat(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cam_baglantisi_olustur(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cam_baglantisi_kalem_kaydet(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cam_baglantisi_aktiflestir(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cam_baglantisi_kapat(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_fiyat_dogrula(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tedarikci_pasiflestir(uuid, text, text) TO authenticated;
