-- Ticari mod singleton satiri veri temizleme islemlerinde silinirse siparis akisi
-- mod bilgisini dogrulayamaz. Mevcut ortami onar ve getter'i kendini onarir yap.

INSERT INTO public.ticari_modul_durumu(singleton, mod)
VALUES (true, 'hazirlik')
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ticari_modul_modu_getir()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sonuc jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_user_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OTURUM_GEREKLI';
  END IF;

  -- Singleton satiri beklenmedik bir veri temizliginde kaybolduysa ticari
  -- islemleri acmak yerine guvenli legacy modu olan hazirlikta yeniden olustur.
  INSERT INTO public.ticari_modul_durumu(singleton, mod)
  VALUES (true, 'hazirlik')
  ON CONFLICT (singleton) DO NOTHING;

  SELECT jsonb_build_object(
    'mod', mod,
    'ticari_modul_aktif', mod = 'aktif',
    'ilk_aktiflesme_tarihi', ilk_aktiflesme_tarihi,
    'revision_no', revision_no,
    'updated_at', updated_at
  )
  INTO v_sonuc
  FROM public.ticari_modul_durumu
  WHERE singleton;

  RETURN v_sonuc;
END;
$$;

REVOKE ALL ON FUNCTION public.ticari_modul_modu_getir() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ticari_modul_modu_getir() TO authenticated;

COMMENT ON FUNCTION public.ticari_modul_modu_getir() IS
  'Ticari mod singleton kaydini guvenli hazirlik varsayilaniyla garanti ederek dondurur.';
