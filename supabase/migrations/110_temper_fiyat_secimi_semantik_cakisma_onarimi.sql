-- 110 - Temper fiyat seciminde ayni baslangic semantik cakisma onarimi
--
-- Ayni idempotency anahtari ve ayni payload, dis RPC sinirinda onceki sonucu
-- dondurmeye devam eder. Farkli bir idempotency anahtariyla ayni baslangica
-- gelen her istek ise fiyat ayni olsa bile yeni bir ticari niyettir ve mevcut
-- tarihsel snapshot sessizce tekrar kullanilmaz.

BEGIN;

SET search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(
  p_urun_stok_id uuid,
  p_hizmet_stok_id uuid,
  p_fiyat_id uuid,
  p_baslangic timestamptz,
  p_bitis timestamptz,
  p_gerekce text,
  p_idempotency_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mod public.temper_maliyet_modu_surmleri%ROWTYPE;
  v_fiyat public.stok_alis_fiyatlari%ROWTYPE;
  v_mevcut public.temper_dis_hizmet_fiyat_secim_surmleri%ROWTYPE;
  v_sonraki_baslangic timestamptz;
  v_mod_bitis timestamptz;
  v_teklif_bitis timestamptz;
  v_bitis timestamptz := p_bitis;
  v_secim_id uuid;
BEGIN
  IF p_baslangic IS NULL
     OR length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEMPER_DIS_HIZMET_FIYAT_SECIMI_GECERSIZ';
  END IF;

  SELECT *
  INTO v_mod
  FROM public.temper_maliyet_modu_surmleri mod_surumu
  WHERE mod_surumu.mod = 'dis_hizmet'
    AND mod_surumu.dis_hizmet_stok_id = p_hizmet_stok_id
    AND mod_surumu.gecerlilik_donemi @>
      (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_DIS_HIZMET_MODU_AKTIF_DEGIL';
  END IF;

  SELECT *
  INTO v_fiyat
  FROM public.stok_alis_fiyatlari fiyat
  WHERE fiyat.id = p_fiyat_id
    AND fiyat.stok_id = p_hizmet_stok_id
    AND fiyat.durum IN ('dogrulanmis', 'duzeltme')
    AND fiyat.kaynak_turu <> 'legacy_unverified'
    AND fiyat.para_birimi = 'TRY'
    AND lower(replace(fiyat.fiyat_birimi, '²', '2')) = 'm2'
    AND lower(replace(fiyat.stok_ana_birimi, '²', '2')) = 'm2'
    AND (fiyat.fiyat_tarihi AT TIME ZONE 'Europe/Istanbul')::date
      <= (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date
    AND fiyat.teklif_gecerlilik_donemi @>
      (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEMPER_DIS_HIZMET_TRY_M2_FIYATI_GEREKLI';
  END IF;

  IF NOT upper_inf(v_mod.gecerlilik_donemi) THEN
    v_mod_bitis :=
      upper(v_mod.gecerlilik_donemi)::timestamp
      AT TIME ZONE 'Europe/Istanbul';
    v_bitis := CASE
      WHEN v_bitis IS NULL THEN v_mod_bitis
      ELSE LEAST(v_bitis, v_mod_bitis)
    END;
  END IF;

  IF NOT upper_inf(v_fiyat.teklif_gecerlilik_donemi) THEN
    v_teklif_bitis :=
      upper(v_fiyat.teklif_gecerlilik_donemi)::timestamp
      AT TIME ZONE 'Europe/Istanbul';
    v_bitis := CASE
      WHEN v_bitis IS NULL THEN v_teklif_bitis
      ELSE LEAST(v_bitis, v_teklif_bitis)
    END;
  END IF;

  IF v_bitis IS NOT NULL AND v_bitis <= p_baslangic THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TEMPER_DIS_HIZMET_FIYAT_SECIM_DONEMI_GECERSIZ';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'temper_dis_hizmet_secim_v4:'
    || p_hizmet_stok_id::text
    || ':'
    || COALESCE(p_urun_stok_id::text, 'genel'),
    0
  ));

  SELECT *
  INTO v_mevcut
  FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
  WHERE secim.mod_surumu_id = v_mod.id
    AND secim.hizmet_stok_id = p_hizmet_stok_id
    AND secim.urun_stok_id IS NOT DISTINCT FROM p_urun_stok_id
    AND secim.gecerlilik_donemi @> p_baslangic
  FOR UPDATE;

  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) = p_baslangic THEN
      RAISE EXCEPTION USING
        ERRCODE = '23P01',
        MESSAGE = 'AYNI_BASLANGICTA_TEMPER_FIYAT_SECIMI_VAR',
        DETAIL = format(
          'Mevcut secim_id=%s, fiyat_id=%s. Yalniz ayni idempotency anahtarinin replayi onceki sonucu dondurebilir.',
          v_mevcut.id,
          v_mevcut.fiyat_id
        );
    END IF;

    PERFORM set_config('app.maliyet_v3_surum_kapatma', 'true', true);
    UPDATE public.temper_dis_hizmet_fiyat_secim_surmleri
    SET gecerlilik_donemi =
      tstzrange(lower(gecerlilik_donemi), p_baslangic, '[)')
    WHERE id = v_mevcut.id;
  END IF;

  SELECT min(lower(gecerlilik_donemi))
  INTO v_sonraki_baslangic
  FROM public.temper_dis_hizmet_fiyat_secim_surmleri
  WHERE mod_surumu_id = v_mod.id
    AND hizmet_stok_id = p_hizmet_stok_id
    AND urun_stok_id IS NOT DISTINCT FROM p_urun_stok_id
    AND lower(gecerlilik_donemi) > p_baslangic;

  v_bitis := CASE
    WHEN v_bitis IS NULL THEN v_sonraki_baslangic
    WHEN v_sonraki_baslangic IS NULL THEN v_bitis
    ELSE LEAST(v_bitis, v_sonraki_baslangic)
  END;

  INSERT INTO public.temper_dis_hizmet_fiyat_secim_surmleri (
    mod_surumu_id,
    urun_stok_id,
    hizmet_stok_id,
    fiyat_id,
    gecerlilik_donemi,
    gerekce,
    idempotency_id,
    olusturan_kullanici_id
  )
  VALUES (
    v_mod.id,
    p_urun_stok_id,
    p_hizmet_stok_id,
    p_fiyat_id,
    tstzrange(p_baslangic, v_bitis, '[)'),
    btrim(p_gerekce),
    p_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_secim_id;

  RETURN v_secim_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(
    uuid, uuid, uuid, timestamptz, timestamptz, text, uuid
  )
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION
  public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(
    uuid, uuid, uuid, timestamptz, timestamptz, text, uuid
  ) IS
  'Ayni baslangicta mevcut temper fiyat secimini yalniz dis RPCdeki ayni idempotency replayiyle dondurur; yeni anahtarla gelen her semantik tekrar 23P01 cakismasidir.';

COMMIT;
