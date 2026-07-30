-- 109 - Kullanici onayli legacy tedarikci fatura/odeme cari uzlastirmasi
--
-- Migration hicbir ticari veri satirini kendiliginden degistirmez. Gecmisten
-- gelen, fatura ve odeme bilgileri tamamlanmis tedarikci siparisleri ancak
-- kullanicinin ekranda gordugu snapshoti birebir onaylamasi ve AAL2 ile RPC'yi
-- cagirmasi sonucunda cari hesaba islenir.

BEGIN;

SET search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.tedarikci_legacy_fatura_odemesi_uzlastir(
  p_siparis_id uuid,
  p_revision_no integer,
  p_onay jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_siparis public.tedarikci_siparisleri%ROWTYPE;
  v_fatura_hareket public.cari_hareketleri%ROWTYPE;
  v_odeme_hareket public.cari_hareketleri%ROWTYPE;
  v_fatura_var boolean := false;
  v_odeme_var boolean := false;
  v_fatura_eklendi boolean := false;
  v_odeme_eklendi boolean := false;
  v_baslik_guncellendi boolean := false;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_idempotency_payload jsonb;
  v_gerekce text := btrim(COALESCE(p_onay ->> 'gerekce', ''));
  v_beklenen_siparis_no text := btrim(COALESCE(
    NULLIF(p_onay ->> 'portal_siparis_no', ''),
    NULLIF(p_onay ->> 'siparis_no', ''),
    ''
  ));
  v_beklenen_fatura_no text := btrim(COALESCE(p_onay ->> 'fatura_no', ''));
  v_beklenen_para_birimi text := upper(btrim(COALESCE(
    p_onay ->> 'para_birimi',
    ''
  )));
  v_beklenen_tedarikci_id uuid :=
    public.ticari_guvenli_uuid(p_onay ->> 'tedarikci_id');
  v_beklenen_tutar numeric :=
    public.ticari_guvenli_numeric(p_onay ->> 'fatura_tutari');
  v_beklenen_fatura_tarihi date;
  v_beklenen_odeme_tarihi date;
  v_fatura_toplam integer := 0;
  v_fatura_kanonik integer := 0;
  v_odeme_toplam integer := 0;
  v_odeme_kanonik integer := 0;
  v_uzlastirilan_cift_net_etki numeric := 0;
  v_bu_islem_net_etki numeric := 0;
  v_durum text;
  v_yanit jsonb;
BEGIN
  -- Mevcut tedarikci siparisi yazma yetkisinin yaninda bu tarihsel finansal
  -- duzeltme icin finance.manage ve AAL2 birlikte zorunludur.
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);

  IF auth.uid() IS NULL OR NOT public.has_permission('finance', 'manage') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'FINANCE_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AAL2_GEREKLI';
  END IF;

  IF p_siparis_id IS NULL
     OR p_revision_no IS NULL
     OR p_revision_no <= 0
     OR jsonb_typeof(p_onay) IS DISTINCT FROM 'object'
     OR length(v_gerekce) < 10
     OR nullif(v_beklenen_siparis_no, '') IS NULL
     OR nullif(v_beklenen_fatura_no, '') IS NULL
     OR v_beklenen_para_birimi NOT IN ('TRY', 'USD', 'EUR')
     OR v_beklenen_tedarikci_id IS NULL
     OR v_beklenen_tutar IS NULL
     OR v_beklenen_tutar <= 0
     OR COALESCE(p_onay ->> 'fatura_tarihi', '') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR COALESCE(p_onay ->> 'odeme_tarihi', '') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'LEGACY_UZLASTIRMA_ONAY_BILGILERI_GECERSIZ';
  END IF;

  BEGIN
    v_beklenen_fatura_tarihi := (p_onay ->> 'fatura_tarihi')::date;
    v_beklenen_odeme_tarihi := (p_onay ->> 'odeme_tarihi')::date;
  EXCEPTION
    WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'LEGACY_UZLASTIRMA_ONAY_BILGILERI_GECERSIZ';
  END;

  IF v_beklenen_odeme_tarihi < v_beklenen_fatura_tarihi THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'LEGACY_UZLASTIRMA_ONAY_BILGILERI_GECERSIZ';
  END IF;

  v_idempotency_payload := jsonb_build_object(
    'siparis_id', p_siparis_id,
    'revision_no', p_revision_no,
    'onay', p_onay
  );
  v_idempotency := public.ticari_idempotency_baslat(
    'tedarikci_legacy_fatura_odemesi_uzlastir',
    p_idempotency_key,
    v_idempotency_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  SELECT *
  INTO v_siparis
  FROM public.tedarikci_siparisleri
  WHERE id = p_siparis_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'TEDARIKCI_SIPARISI_BULUNAMADI';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cari
    WHERE id = v_siparis.tedarikci_id
      AND tipi = 'tedarikci'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LEGACY_UZLASTIRMA_TEDARIKCISI_GECERSIZ';
  END IF;

  IF nullif(btrim(COALESCE(v_siparis.fatura_no, '')), '') IS NULL
     OR v_siparis.fatura_tarihi IS NULL
     OR v_siparis.fatura_tutari IS NULL
     OR v_siparis.fatura_tutari <= 0
     OR v_siparis.odeme_tarihi IS NULL
     OR v_siparis.odeme_tarihi < v_siparis.fatura_tarihi THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'LEGACY_UZLASTIRMA_ICIN_TAM_ODENMIS_FATURA_GEREKLI';
  END IF;

  -- Kullanici farkli bir siparisi veya ekranda gordugunden farkli bir tutari
  -- yanlislikla onaylayamasin. Revision kontrolune ek olarak alanlar da birebir
  -- eslesir.
  IF btrim(v_siparis.portal_siparis_no) IS DISTINCT FROM v_beklenen_siparis_no
     OR v_siparis.tedarikci_id IS DISTINCT FROM v_beklenen_tedarikci_id
     OR btrim(v_siparis.fatura_no) IS DISTINCT FROM v_beklenen_fatura_no
     OR v_siparis.para_birimi::text IS DISTINCT FROM v_beklenen_para_birimi
     OR round(v_siparis.fatura_tutari, 2)
        IS DISTINCT FROM round(v_beklenen_tutar, 2)
     OR v_siparis.fatura_tarihi IS DISTINCT FROM v_beklenen_fatura_tarihi
     OR v_siparis.odeme_tarihi IS DISTINCT FROM v_beklenen_odeme_tarihi THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'LEGACY_UZLASTIRMA_ONAY_SNAPSHOT_CAKISMASI';
  END IF;

  -- Kaynak kimligi bu iki hareket icin globaldir. Ayni kaynak_turu+kaynak_id
  -- altinda farkli doviz veya manuel kaynak sinifi varsa onu sessizce yok
  -- saymak yerine durup kullaniciya cakismayi bildiririz.
  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE kaynak_sinifi = 'sistem'
        AND para_birimi = v_siparis.para_birimi::text
    )::integer
  INTO v_fatura_toplam, v_fatura_kanonik
  FROM public.cari_hareketleri
  WHERE kaynak_turu = 'tedarikci_faturasi'
    AND kaynak_id = p_siparis_id;

  IF v_fatura_toplam <> v_fatura_kanonik OR v_fatura_kanonik > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LEGACY_UZLASTIRMA_FATURA_HAREKETI_CAKISIYOR';
  END IF;

  IF v_fatura_kanonik = 1 THEN
    SELECT *
    INTO STRICT v_fatura_hareket
    FROM public.cari_hareketleri
    WHERE kaynak_sinifi = 'sistem'
      AND kaynak_turu = 'tedarikci_faturasi'
      AND kaynak_id = p_siparis_id
      AND para_birimi = v_siparis.para_birimi::text;
    v_fatura_var := true;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE kaynak_sinifi = 'sistem'
        AND para_birimi = v_siparis.para_birimi::text
    )::integer
  INTO v_odeme_toplam, v_odeme_kanonik
  FROM public.cari_hareketleri
  WHERE kaynak_turu = 'tedarikci_odemesi'
    AND kaynak_id = p_siparis_id;

  IF v_odeme_toplam <> v_odeme_kanonik OR v_odeme_kanonik > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LEGACY_UZLASTIRMA_ODEME_HAREKETI_CAKISIYOR';
  END IF;

  IF v_odeme_kanonik = 1 THEN
    SELECT *
    INTO STRICT v_odeme_hareket
    FROM public.cari_hareketleri
    WHERE kaynak_sinifi = 'sistem'
      AND kaynak_turu = 'tedarikci_odemesi'
      AND kaynak_id = p_siparis_id
      AND para_birimi = v_siparis.para_birimi::text;
    v_odeme_var := true;
  END IF;

  IF v_siparis.fatura_cari_hareket_id IS NOT NULL
     AND (
       NOT v_fatura_var
       OR v_siparis.fatura_cari_hareket_id <> v_fatura_hareket.id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LEGACY_UZLASTIRMA_FATURA_HAREKETI_CAKISIYOR';
  END IF;

  IF v_siparis.odeme_cari_hareket_id IS NOT NULL
     AND (
       NOT v_odeme_var
       OR v_siparis.odeme_cari_hareket_id <> v_odeme_hareket.id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LEGACY_UZLASTIRMA_ODEME_HAREKETI_CAKISIYOR';
  END IF;

  IF v_fatura_var AND (
    v_fatura_hareket.cari_id IS DISTINCT FROM v_siparis.tedarikci_id
    OR v_fatura_hareket.yon IS DISTINCT FROM 'alacak'
    OR v_fatura_hareket.hareket_turu IS DISTINCT FROM 'tedarikci_faturasi'
    OR round(v_fatura_hareket.tutar, 2)
       IS DISTINCT FROM round(v_siparis.fatura_tutari, 2)
    OR (v_fatura_hareket.islem_tarihi AT TIME ZONE 'Europe/Istanbul')::date
       IS DISTINCT FROM v_siparis.fatura_tarihi
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LEGACY_UZLASTIRMA_FATURA_HAREKETI_CAKISIYOR';
  END IF;

  IF v_odeme_var AND (
    v_odeme_hareket.cari_id IS DISTINCT FROM v_siparis.tedarikci_id
    OR v_odeme_hareket.yon IS DISTINCT FROM 'borc'
    OR v_odeme_hareket.hareket_turu IS DISTINCT FROM 'tedarikci_odemesi'
    OR round(v_odeme_hareket.tutar, 2)
       IS DISTINCT FROM round(v_siparis.fatura_tutari, 2)
    OR (v_odeme_hareket.islem_tarihi AT TIME ZONE 'Europe/Istanbul')::date
       IS DISTINCT FROM v_siparis.odeme_tarihi
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LEGACY_UZLASTIRMA_ODEME_HAREKETI_CAKISIYOR';
  END IF;

  -- Ayni islem daha once tamamen baglanmissa yeni bir idempotency anahtariyla
  -- dahi ikinci hareket veya revision uretilmez.
  IF v_fatura_var
     AND v_odeme_var
     AND v_siparis.fatura_cari_hareket_id = v_fatura_hareket.id
     AND v_siparis.odeme_cari_hareket_id = v_odeme_hareket.id THEN
    v_uzlastirilan_cift_net_etki :=
      round(v_odeme_hareket.tutar, 2) - round(v_fatura_hareket.tutar, 2);
    v_yanit := jsonb_build_object(
      'basarili', true,
      'idempotent', true,
      'durum', 'zaten_uzlastirilmis',
      'siparis_id', v_siparis.id,
      'tedarikci_id', v_siparis.tedarikci_id,
      'portal_siparis_no', v_siparis.portal_siparis_no,
      'fatura_no', v_siparis.fatura_no,
      'fatura_tutari', v_siparis.fatura_tutari,
      'para_birimi', v_siparis.para_birimi,
      'fatura_tarihi', v_siparis.fatura_tarihi,
      'odeme_tarihi', v_siparis.odeme_tarihi,
      'fatura_cari_hareket_id', v_fatura_hareket.id,
      'odeme_cari_hareket_id', v_odeme_hareket.id,
      'revision_no', v_siparis.revision_no,
      'uzlastirilan_cift_net_etki', v_uzlastirilan_cift_net_etki,
      'bu_islem_net_etki', 0
    );
    RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
  END IF;

  IF v_siparis.revision_no <> p_revision_no THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'TEDARIKCI_SIPARISI_REVIZYON_CAKISMASI';
  END IF;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'tedarikci_legacy_fatura_odemesi_uzlastir',
    p_idempotency_key,
    v_gerekce,
    'legacy_tedarikci_cari_uzlastirma'
  );

  IF NOT v_fatura_var THEN
    INSERT INTO public.cari_hareketleri (
      cari_id,
      para_birimi,
      yon,
      hareket_turu,
      tutar,
      islem_tarihi,
      aciklama,
      kaynak_sinifi,
      kaynak_turu,
      kaynak_id,
      idempotency_id,
      islemi_yapan
    )
    VALUES (
      v_siparis.tedarikci_id,
      v_siparis.para_birimi::text,
      'alacak',
      'tedarikci_faturasi',
      round(v_siparis.fatura_tutari, 2),
      v_siparis.fatura_tarihi::timestamp AT TIME ZONE 'Europe/Istanbul',
      v_siparis.fatura_no || ' legacy tedarikci faturasi kullanici onayli uzlastirma',
      'sistem',
      'tedarikci_faturasi',
      v_siparis.id,
      v_idempotency_id,
      auth.uid()
    )
    RETURNING * INTO v_fatura_hareket;
    v_fatura_var := true;
    v_fatura_eklendi := true;
  END IF;

  IF NOT v_odeme_var THEN
    INSERT INTO public.cari_hareketleri (
      cari_id,
      para_birimi,
      yon,
      hareket_turu,
      tutar,
      islem_tarihi,
      aciklama,
      kaynak_sinifi,
      kaynak_turu,
      kaynak_id,
      idempotency_id,
      islemi_yapan
    )
    VALUES (
      v_siparis.tedarikci_id,
      v_siparis.para_birimi::text,
      'borc',
      'tedarikci_odemesi',
      round(v_siparis.fatura_tutari, 2),
      v_siparis.odeme_tarihi::timestamp AT TIME ZONE 'Europe/Istanbul',
      v_siparis.fatura_no || ' legacy tedarikci odemesi kullanici onayli uzlastirma',
      'sistem',
      'tedarikci_odemesi',
      v_siparis.id,
      v_idempotency_id,
      auth.uid()
    )
    RETURNING * INTO v_odeme_hareket;
    v_odeme_var := true;
    v_odeme_eklendi := true;
  END IF;

  UPDATE public.tedarikci_siparisleri
  SET fatura_cari_hareket_id = v_fatura_hareket.id,
      odeme_cari_hareket_id = v_odeme_hareket.id,
      fatura_onaylandi_at = COALESCE(fatura_onaylandi_at, now()),
      odeme_onaylandi_at = COALESCE(odeme_onaylandi_at, now()),
      son_guncelleyen_kullanici_id = auth.uid(),
      revision_no = revision_no + 1,
      updated_at = now()
  WHERE id = v_siparis.id;
  v_baslik_guncellendi := true;

  v_durum := CASE
    WHEN v_fatura_eklendi AND v_odeme_eklendi THEN 'uzlastirildi'
    WHEN v_fatura_eklendi OR v_odeme_eklendi THEN 'eksik_hareket_tamamlandi'
    ELSE 'mevcut_hareketler_baglandi'
  END;

  v_uzlastirilan_cift_net_etki :=
    round(v_odeme_hareket.tutar, 2) - round(v_fatura_hareket.tutar, 2);
  v_bu_islem_net_etki :=
    CASE
      WHEN v_odeme_eklendi THEN round(v_odeme_hareket.tutar, 2)
      ELSE 0
    END
    - CASE
        WHEN v_fatura_eklendi THEN round(v_fatura_hareket.tutar, 2)
        ELSE 0
      END;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'idempotent', false,
    'durum', v_durum,
    'siparis_id', v_siparis.id,
    'tedarikci_id', v_siparis.tedarikci_id,
    'portal_siparis_no', v_siparis.portal_siparis_no,
    'fatura_no', v_siparis.fatura_no,
    'fatura_tutari', v_siparis.fatura_tutari,
    'para_birimi', v_siparis.para_birimi,
    'fatura_tarihi', v_siparis.fatura_tarihi,
    'odeme_tarihi', v_siparis.odeme_tarihi,
    'fatura_cari_hareket_id', v_fatura_hareket.id,
    'odeme_cari_hareket_id', v_odeme_hareket.id,
    'fatura_hareketi_eklendi', v_fatura_eklendi,
    'odeme_hareketi_eklendi', v_odeme_eklendi,
    'baslik_guncellendi', v_baslik_guncellendi,
    'revision_no', v_siparis.revision_no + 1,
    'uzlastirilan_cift_net_etki', v_uzlastirilan_cift_net_etki,
    'bu_islem_net_etki', v_bu_islem_net_etki
  );

  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

REVOKE ALL ON FUNCTION public.tedarikci_legacy_fatura_odemesi_uzlastir(
  uuid, integer, jsonb, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tedarikci_legacy_fatura_odemesi_uzlastir(
  uuid, integer, jsonb, text
) TO authenticated;

COMMENT ON FUNCTION public.tedarikci_legacy_fatura_odemesi_uzlastir(
  uuid, integer, jsonb, text
) IS
  'Kullanici onayli legacy tedarikci fatura+odeme snapshotini AAL2 ile atomik ve idempotent olarak cari hesaba uzlastirir; migration kendiliginden veri tasimaz.';

COMMIT;
