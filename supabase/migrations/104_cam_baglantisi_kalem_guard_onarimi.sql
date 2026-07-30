-- 104 - Daha önce uygulanmış 090 sürümlerindeki polymorphic trigger NEW/OLD alan erişimini onar

SET search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.cam_baglantisi_kalemini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_baglanti_id uuid;
  v_durum text;
BEGIN
  -- Trigger iki farklı tabloyu korur. Bir tabloda bulunmayan record alanına CASE
  -- içinde dahi erişmek PostgreSQL'de hata verdiğinden dallar açıkça ayrılır.
  IF TG_TABLE_NAME = 'cam_tedarik_baglanti_kalemleri' THEN
    IF TG_OP = 'DELETE' THEN
      v_baglanti_id := OLD.baglanti_id;
    ELSE
      v_baglanti_id := NEW.baglanti_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'cam_tedarik_baglanti_kalem_stoklari' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT kalem.baglanti_id INTO v_baglanti_id
      FROM public.cam_tedarik_baglanti_kalemleri kalem
      WHERE kalem.id = OLD.baglanti_kalemi_id;
    ELSE
      SELECT kalem.baglanti_id INTO v_baglanti_id
      FROM public.cam_tedarik_baglanti_kalemleri kalem
      WHERE kalem.id = NEW.baglanti_kalemi_id;
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CAM_BAGLANTISI_TRIGGER_TABLOSU_GECERSIZ';
  END IF;

  SELECT baglanti.durum INTO v_durum
  FROM public.cam_tedarik_baglantilari baglanti
  WHERE baglanti.id = v_baglanti_id;

  IF v_durum IS DISTINCT FROM 'taslak' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CAM_BAGLANTISI_KALEMLERI_DEGISTIRILEMEZ';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cam_baglantisi_kalemini_koru()
  FROM PUBLIC, anon, authenticated;

