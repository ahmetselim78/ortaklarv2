-- 090 - Kontrollü cam fiyat grubu kalemleri ve stok eşleştirmeleri

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.cam_tedarik_baglanti_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baglanti_id uuid NOT NULL
    REFERENCES public.cam_tedarik_baglantilari(id) ON DELETE RESTRICT,
  cam_fiyat_grubu_id uuid NOT NULL
    REFERENCES public.cam_fiyat_gruplari(id) ON DELETE RESTRICT,
  birim_fiyat numeric(20,8) NOT NULL CHECK (birim_fiyat > 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  fiyat_birimi text NOT NULL CHECK (nullif(btrim(fiyat_birimi), '') IS NOT NULL),
  paket_miktari numeric(20,8) CHECK (paket_miktari IS NULL OR paket_miktari > 0),
  stok_ana_birimi text NOT NULL CHECK (nullif(btrim(stok_ana_birimi), '') IS NOT NULL),
  donusum_katsayisi numeric(20,10) NOT NULL DEFAULT 1 CHECK (donusum_katsayisi > 0),
  vade_gunu integer NOT NULL DEFAULT 0 CHECK (vade_gunu BETWEEN 0 AND 3650),
  aciklama text,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (baglanti_id, cam_fiyat_grubu_id)
);

CREATE TABLE public.cam_tedarik_baglanti_kalem_stoklari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baglanti_kalemi_id uuid NOT NULL
    REFERENCES public.cam_tedarik_baglanti_kalemleri(id) ON DELETE RESTRICT,
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (baglanti_kalemi_id, stok_id)
);

ALTER TABLE public.stok_alis_fiyatlari
  ADD COLUMN cam_baglantisi_id uuid
    REFERENCES public.cam_tedarik_baglantilari(id) ON DELETE RESTRICT,
  ADD COLUMN cam_baglantisi_kalem_id uuid
    REFERENCES public.cam_tedarik_baglanti_kalemleri(id) ON DELETE RESTRICT,
  ADD CONSTRAINT stok_alis_fiyati_cam_kaynagi_check CHECK (
    (kaynak_turu = 'cam_baglantisi'
      AND cam_baglantisi_id IS NOT NULL
      AND cam_baglantisi_kalem_id IS NOT NULL)
    OR
    (kaynak_turu <> 'cam_baglantisi'
      AND cam_baglantisi_id IS NULL
      AND cam_baglantisi_kalem_id IS NULL)
  );

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
  IF TG_TABLE_NAME = 'cam_tedarik_baglanti_kalemleri' THEN
    IF TG_OP = 'DELETE' THEN
      v_baglanti_id := OLD.baglanti_id;
    ELSE
      v_baglanti_id := NEW.baglanti_id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      SELECT kalem.baglanti_id INTO v_baglanti_id
      FROM public.cam_tedarik_baglanti_kalemleri kalem
      WHERE kalem.id = OLD.baglanti_kalemi_id;
    ELSE
      SELECT kalem.baglanti_id INTO v_baglanti_id
      FROM public.cam_tedarik_baglanti_kalemleri kalem
      WHERE kalem.id = NEW.baglanti_kalemi_id;
    END IF;
  END IF;
  SELECT durum INTO v_durum
  FROM public.cam_tedarik_baglantilari
  WHERE id = v_baglanti_id;
  IF v_durum IS DISTINCT FROM 'taslak' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CAM_BAGLANTISI_KALEMLERI_DEGISTIRILEMEZ';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cam_tedarik_baglanti_kalemleri_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.cam_tedarik_baglanti_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.cam_baglantisi_kalemini_koru();
CREATE TRIGGER cam_tedarik_baglanti_kalem_stoklari_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.cam_tedarik_baglanti_kalem_stoklari
  FOR EACH ROW EXECUTE FUNCTION public.cam_baglantisi_kalemini_koru();

COMMENT ON TABLE public.cam_tedarik_baglanti_kalem_stoklari IS
  'Bir kontrollü cam fiyat grubunu bir veya daha fazla kanonik stok kartına bağlar.';
