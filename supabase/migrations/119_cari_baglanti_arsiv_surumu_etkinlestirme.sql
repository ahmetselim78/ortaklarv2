-- Onaylanan fakat sırada bekleyen bağlantı fiyat sürümleri arşiv durumunda
-- değişmez kalır. Sırası geldiğinde yalnız dahili bağlantı motoru bu sürümü,
-- içeriğine dokunmadan yeniden yayına alabilir.

CREATE OR REPLACE FUNCTION public.ticari_surumu_degisiklige_karsi_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_icerik jsonb;
  v_new_icerik jsonb;
  v_baglanti_reaktivasyonu boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.durum::text <> 'taslak' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'YAYINLANMIS_SURUM_DEGISTIRILEMEZ';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.durum::text = 'arsiv' THEN
    v_baglanti_reaktivasyonu :=
      TG_TABLE_SCHEMA = 'public'
      AND TG_TABLE_NAME = 'fiyat_listesi_surmleri'
      AND COALESCE(current_setting('app.cari_baglanti_rpc', true), '') = 'on'
      AND NEW.durum::text = 'yayinda';

    IF v_baglanti_reaktivasyonu THEN
      v_old_icerik := to_jsonb(OLD) - ARRAY[
        'durum', 'gecerli_baslangic', 'gecerli_bitis',
        'revision_no', 'updated_at'
      ];
      v_new_icerik := to_jsonb(NEW) - ARRAY[
        'durum', 'gecerli_baslangic', 'gecerli_bitis',
        'revision_no', 'updated_at'
      ];
      IF v_new_icerik IS DISTINCT FROM v_old_icerik
         OR NEW.revision_no NOT IN (OLD.revision_no, OLD.revision_no + 1) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'ARSIV_SURUMU_DEGISTIRILEMEZ';
      END IF;
    ELSE
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'ARSIV_SURUMU_DEGISTIRILEMEZ';
    END IF;
  END IF;

  IF OLD.durum::text = 'yayinda' THEN
    v_old_icerik := to_jsonb(OLD) - ARRAY['durum', 'revision_no', 'updated_at'];
    v_new_icerik := to_jsonb(NEW) - ARRAY['durum', 'revision_no', 'updated_at'];

    IF NEW.durum::text <> 'arsiv'
       OR v_new_icerik IS DISTINCT FROM v_old_icerik
       OR NEW.revision_no NOT IN (OLD.revision_no, OLD.revision_no + 1) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'YAYINLANMIS_SURUM_DEGISTIRILEMEZ';
    END IF;
  END IF;

  IF OLD.durum IS DISTINCT FROM NEW.durum
     AND NEW.durum::text IN ('yayinda', 'arsiv')
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF NOT (
      public.has_permission('pricing', 'manage')
      AND public.current_aal2()
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'PT403',
        MESSAGE = 'AAL2_GEREKLI';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_fiyat_surumu_etkinlestir(
  p_baglanti_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_baglanti public.cari_baglantilari%ROWTYPE;
  v_liste_id uuid;
  v_durum text;
BEGIN
  SELECT * INTO v_baglanti
  FROM public.cari_baglantilari
  WHERE id = p_baglanti_id
  FOR UPDATE;

  IF v_baglanti.id IS NULL OR v_baglanti.durum <> 'onaylandi' THEN
    RETURN;
  END IF;

  SELECT fiyat_listesi_id, durum::text
  INTO v_liste_id, v_durum
  FROM public.fiyat_listesi_surmleri
  WHERE id = v_baglanti.fiyat_listesi_surumu_id
  FOR UPDATE;

  IF v_durum = 'yayinda' THEN
    RETURN;
  END IF;

  PERFORM set_config('app.cari_baglanti_rpc', 'on', true);
  PERFORM set_config('app.ticari_yayin_rpc', 'on', true);

  UPDATE public.fiyat_listesi_surmleri
  SET durum = 'arsiv',
      revision_no = revision_no + 1,
      updated_at = now()
  WHERE fiyat_listesi_id = v_liste_id
    AND durum = 'yayinda';

  IF v_durum = 'arsiv' THEN
    -- Yayınlayan kişi ve yayın zamanı onay anından kalır; yalnız etkinlik
    -- aralığı ve durum bağlantının sıra değişimine göre güncellenir.
    UPDATE public.fiyat_listesi_surmleri
    SET durum = 'yayinda',
        gecerli_baslangic =
          (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
        gecerli_bitis = NULL,
        revision_no = revision_no + 1,
        updated_at = now()
    WHERE id = v_baglanti.fiyat_listesi_surumu_id
      AND durum = 'arsiv';
  ELSE
    UPDATE public.fiyat_listesi_surmleri
    SET durum = 'yayinda',
        gecerli_baslangic =
          (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
        gecerli_bitis = NULL,
        yayinlayan_kullanici_id = auth.uid(),
        yayinlanma_tarihi = now(),
        revision_no = revision_no + 1,
        updated_at = now()
    WHERE id = v_baglanti.fiyat_listesi_surumu_id
      AND durum = 'taslak';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cari_baglanti_fiyat_surumu_etkinlestir(uuid)
  FROM PUBLIC, anon, authenticated;
