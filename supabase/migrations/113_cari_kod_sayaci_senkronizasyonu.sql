-- Cari kodu sayaci veri aktarimi, geri yukleme veya elle eklenen kayitlardan
-- sonra geride kalabilir. Her tahsiste mevcut en buyuk C-NNNN kodunu da
-- dikkate alarak benzersiz kod uretimini kendiliginden onar.

CREATE OR REPLACE FUNCTION public.sonraki_sayac(
  p_anahtar text,
  p_adet integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_module text;
  v_deger integer;
  v_mevcut_cari_degeri integer;
BEGIN
  IF p_adet < 1 OR p_adet > 1000 OR length(p_anahtar) > 80 THEN
    RAISE EXCEPTION 'Gecersiz sayac parametresi';
  END IF;

  v_module := CASE
    WHEN p_anahtar = 'cari_kod' THEN 'cari'
    WHEN p_anahtar = 'stok_kod' THEN 'inventory'
    WHEN p_anahtar = 'cam_kodu' OR p_anahtar LIKE 'siparis_no_%' THEN 'orders'
    WHEN p_anahtar LIKE 'batch_no_%' THEN 'production'
    ELSE NULL
  END;

  IF v_module IS NULL OR NOT public.has_permission(v_module, 'create') THEN
    RAISE EXCEPTION 'Sayac icin yetki yok';
  END IF;

  IF p_anahtar = 'cari_kod' THEN
    SELECT COALESCE(
      MAX(substring(cari.kod FROM '^C-([0-9]+)$')::integer),
      0
    )
    INTO v_mevcut_cari_degeri
    FROM public.cari
    WHERE cari.kod ~ '^C-[0-9]+$';

    INSERT INTO public.sayaclar (anahtar, deger)
    VALUES (p_anahtar, v_mevcut_cari_degeri + p_adet)
    ON CONFLICT (anahtar) DO UPDATE
      SET deger = GREATEST(
        public.sayaclar.deger + p_adet,
        EXCLUDED.deger
      )
    RETURNING deger INTO v_deger;
  ELSE
    INSERT INTO public.sayaclar (anahtar, deger)
    VALUES (p_anahtar, p_adet)
    ON CONFLICT (anahtar) DO UPDATE
      SET deger = public.sayaclar.deger + EXCLUDED.deger
    RETURNING deger INTO v_deger;
  END IF;

  RETURN v_deger;
END;
$$;

-- Gecis aninda da sayaci duzelt; ilk yeni cari kaydinin hata vermesini onle.
INSERT INTO public.sayaclar (anahtar, deger)
SELECT
  'cari_kod',
  COALESCE(MAX(substring(cari.kod FROM '^C-([0-9]+)$')::integer), 0)
FROM public.cari
WHERE cari.kod ~ '^C-[0-9]+$'
ON CONFLICT (anahtar) DO UPDATE
  SET deger = GREATEST(public.sayaclar.deger, EXCLUDED.deger);

REVOKE ALL ON FUNCTION public.sonraki_sayac(text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sonraki_sayac(text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.sonraki_sayac(text, integer) IS
  'Yetkili moduller icin atomik sayac tahsis eder; cari_kod sayacini mevcut C-NNNN kodlariyla kendiliginden senkronize eder.';
