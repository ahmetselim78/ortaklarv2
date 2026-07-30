-- 099 - Eski bağımsız maliyet yazımlarını kapat, stok katman tarihçesini koru

SET search_path = public, extensions, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.maliyet_malzeme_kaydet(jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maliyet_sarf_katsayisi_kaydet(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maliyet_alis_fiyati_kaydet(jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maliyet_alis_fiyati_gecersiz_kil(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.maliyet_cam_hammaddeleri IS
  'LEGACY READ-ONLY: yeni cam maliyet bileşenleri stok_maliyet_profilleri.stok_id üzerinden oluşturulur.';
COMMENT ON TABLE public.maliyet_citalari IS
  'LEGACY READ-ONLY: yeni çıta maliyet bileşenleri stok_maliyet_profilleri.stok_id üzerinden oluşturulur.';
COMMENT ON TABLE public.maliyet_sarf_malzemeleri IS
  'LEGACY READ-ONLY: yeni sarf maliyet bileşenleri stok_maliyet_profilleri.stok_id üzerinden oluşturulur.';
COMMENT ON TABLE public.maliyet_alis_fiyatlari IS
  'LEGACY READ-ONLY: yeni alış fiyatları stok_alis_fiyatlari ve stok_maliyet_kaynagi_atamalari üzerinden oluşturulur.';

CREATE OR REPLACE FUNCTION public.stok_maliyet_profili_olan_karti_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (OLD.kategori IS DISTINCT FROM NEW.kategori OR OLD.birim IS DISTINCT FROM NEW.birim)
     AND EXISTS (
       SELECT 1
       FROM public.stok_maliyet_profilleri profil
       WHERE profil.stok_id = OLD.id
         AND (
           upper_inf(profil.gecerlilik_donemi)
           OR upper(profil.gecerlilik_donemi) > current_date
         )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'AKTIF_MALIYET_PROFILI_OLAN_STOKUN_KATEGORI_VE_BIRIMI_DEGISTIRILEMEZ',
      DETAIL = 'Önce maliyet profil dönemini kontrollü biçimde kapatın.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stok_maliyet_profili_kart_guard ON public.stok;
CREATE TRIGGER stok_maliyet_profili_kart_guard
  BEFORE UPDATE OF kategori, birim ON public.stok
  FOR EACH ROW EXECUTE FUNCTION public.stok_maliyet_profili_olan_karti_koru();

CREATE OR REPLACE FUNCTION public.stok_katman_yapisini_surumle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_bugun date := (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
  v_mevcut public.stok_maliyet_yapi_surmleri%ROWTYPE;
  v_revision integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.katman_yapisi IS NOT NULL
       AND NEW.katman_yapisi ~ '^[0-9]+([.][0-9]+)?([+][0-9]+([.][0-9]+)?)+$' THEN
      INSERT INTO public.stok_maliyet_yapi_surmleri (
        stok_id, katman_yapisi, gecerlilik_donemi,
        revision_no, aciklama, olusturan_kullanici_id
      )
      VALUES (
        NEW.id, NEW.katman_yapisi, daterange(v_bugun, NULL, '[)'),
        1, 'Stok kartı oluşturulurken sürümlendi.', auth.uid()
      );
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.katman_yapisi IS NOT DISTINCT FROM NEW.katman_yapisi THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('stok_yapi:' || NEW.id::text, 0));
  SELECT * INTO v_mevcut
  FROM public.stok_maliyet_yapi_surmleri
  WHERE stok_id = NEW.id AND gecerlilik_donemi @> v_bugun
  FOR UPDATE;
  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) = v_bugun THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'STOK_KATMAN_YAPISI_AYNI_GUNDE_IKINCI_KEZ_DEGISTIRILEMEZ',
        DETAIL = 'Günlük tarihsel sürüm tekilliği nedeniyle değişikliği sonraki dönemde yapın.';
    END IF;
    UPDATE public.stok_maliyet_yapi_surmleri
    SET gecerlilik_donemi = daterange(lower(gecerlilik_donemi), v_bugun, '[)')
    WHERE id = v_mevcut.id;
  END IF;
  IF NEW.katman_yapisi IS NOT NULL THEN
    SELECT COALESCE(max(revision_no), 0) + 1
    INTO v_revision
    FROM public.stok_maliyet_yapi_surmleri
    WHERE stok_id = NEW.id;
    INSERT INTO public.stok_maliyet_yapi_surmleri (
      stok_id, katman_yapisi, gecerlilik_donemi,
      revision_no, aciklama, olusturan_kullanici_id
    )
    VALUES (
      NEW.id, NEW.katman_yapisi, daterange(v_bugun, NULL, '[)'),
      v_revision, 'Stok kartı katman yapısı değişikliği.', auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stok_katman_yapisi_surumu ON public.stok;
CREATE TRIGGER stok_katman_yapisi_surumu
  AFTER INSERT OR UPDATE OF katman_yapisi ON public.stok
  FOR EACH ROW EXECUTE FUNCTION public.stok_katman_yapisini_surumle();
