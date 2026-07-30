-- 086 - Stok merkezli maliyet profilleri ve tarihsel stok yapısı

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.cam_fiyat_gruplari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kod text NOT NULL UNIQUE CHECK (kod ~ '^[a-z0-9][a-z0-9_-]*$'),
  ad text NOT NULL CHECK (nullif(btrim(ad), '') IS NOT NULL),
  sira_no integer NOT NULL DEFAULT 1 CHECK (sira_no > 0),
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cam_fiyat_gruplari (kod, ad, sira_no)
VALUES
  ('duz', 'Normal / Düz Cam', 10),
  ('konfor', 'Konfor', 20),
  ('sinerji', 'Sinerji', 30),
  ('buzlu', 'Buzlu Cam', 40),
  ('fume', 'Füme Cam', 50),
  ('bronz', 'Bronz Cam', 60),
  ('reflekte', 'Reflekte Cam', 70),
  ('satina', 'Satina Cam', 80),
  ('lamine', 'Lamine Cam', 90),
  ('diger', 'Diğer', 100)
ON CONFLICT (kod) DO UPDATE SET ad = EXCLUDED.ad, sira_no = EXCLUDED.sira_no;

CREATE TABLE public.stok_maliyet_profilleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  profil_turu text NOT NULL CHECK (profil_turu IN ('cam', 'cita', 'sarf')),
  cam_fiyat_grubu_id uuid REFERENCES public.cam_fiyat_gruplari(id) ON DELETE RESTRICT,
  cita_malzeme_turu text CHECK (
    cita_malzeme_turu IS NULL
    OR cita_malzeme_turu IN ('aluminyum', 'sicak_kenar', 'paslanmaz', 'diger')
  ),
  olcu_mm numeric(10,3) CHECK (olcu_mm IS NULL OR olcu_mm > 0),
  hesaplama_tipi text CHECK (
    hesaplama_tipi IS NULL
    OR hesaplama_tipi IN ('cevre_m', 'm2', 'adet', 'sabit')
  ),
  tuketim_katsayisi numeric(20,10) CHECK (
    tuketim_katsayisi IS NULL OR tuketim_katsayisi >= 0
  ),
  bosluk_basi boolean NOT NULL DEFAULT false,
  fire_orani numeric(9,4) NOT NULL DEFAULT 0 CHECK (fire_orani >= 0 AND fire_orani < 100),
  fiyat_birimi text NOT NULL CHECK (nullif(btrim(fiyat_birimi), '') IS NOT NULL),
  stok_ana_birimi text NOT NULL CHECK (nullif(btrim(stok_ana_birimi), '') IS NOT NULL),
  donusum_katsayisi numeric(20,10) NOT NULL DEFAULT 1 CHECK (donusum_katsayisi > 0),
  gecerlilik_donemi daterange NOT NULL,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  aciklama text,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT isempty(gecerlilik_donemi)),
  CHECK (lower_inc(gecerlilik_donemi) AND NOT upper_inc(gecerlilik_donemi)),
  CHECK (
    (profil_turu = 'cam'
      AND cam_fiyat_grubu_id IS NOT NULL
      AND olcu_mm IS NOT NULL
      AND cita_malzeme_turu IS NULL
      AND hesaplama_tipi IS NULL
      AND tuketim_katsayisi IS NULL)
    OR
    (profil_turu = 'cita'
      AND cam_fiyat_grubu_id IS NULL
      AND olcu_mm IS NOT NULL
      AND cita_malzeme_turu IS NOT NULL
      AND hesaplama_tipi IS NULL
      AND tuketim_katsayisi IS NULL)
    OR
    (profil_turu = 'sarf'
      AND cam_fiyat_grubu_id IS NULL
      AND cita_malzeme_turu IS NULL
      AND hesaplama_tipi IS NOT NULL
      AND tuketim_katsayisi IS NOT NULL)
  )
);

CREATE TABLE public.stok_maliyet_yapi_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  katman_yapisi text NOT NULL CHECK (
    katman_yapisi ~ '^[0-9]+([.][0-9]+)?([+][0-9]+([.][0-9]+)?)+$'
  ),
  gecerlilik_donemi daterange NOT NULL,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  aciklama text,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT isempty(gecerlilik_donemi)),
  CHECK (lower_inc(gecerlilik_donemi) AND NOT upper_inc(gecerlilik_donemi))
);

CREATE INDEX stok_maliyet_profilleri_stok_idx
  ON public.stok_maliyet_profilleri(stok_id, lower(gecerlilik_donemi) DESC);
CREATE INDEX stok_maliyet_yapi_surmleri_stok_idx
  ON public.stok_maliyet_yapi_surmleri(stok_id, lower(gecerlilik_donemi) DESC);

COMMENT ON TABLE public.stok_maliyet_profilleri IS
  'Cam, çıta ve sarf maliyet davranışını bağımsız malzeme kimliği oluşturmadan stok_id üzerinden sürümler.';
COMMENT ON COLUMN public.stok_maliyet_profilleri.gecerlilik_donemi IS
  '[başlangıç, bitiş) tarih aralığı; aktif parametre değişikliği eski dönemi kapatıp yeni sürüm açar.';
COMMENT ON TABLE public.stok_maliyet_yapi_surmleri IS
  'Ürün katman yapısının tarihsel ve yeniden üretilebilir sürümleri.';

