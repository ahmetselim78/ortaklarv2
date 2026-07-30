-- 082 — Kod/ad bürokrasisi olmayan, tedarikçi bazlı sade maliyet veri modeli.
--
-- Bu modelde geçerlilik bitiş tarihi yoktur. Bir kayıt, aynı kapsam için daha
-- yeni başlangıç tarihli kayıt gelene kadar geçerlidir. Tarihçeli tablolar
-- append-only tutulur.

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.maliyet_cam_hammaddeleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kalinlik_mm numeric(8,2) NOT NULL CHECK (kalinlik_mm > 0),
  cam_turu text NOT NULL CHECK (
    cam_turu IN (
      'duz',
      'konfor',
      'sinerji',
      'buzlu',
      'fume',
      'bronz',
      'reflekte',
      'satina',
      'lamine',
      'diger'
    )
  ),
  ozel_tur_adi text,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maliyet_cam_hammaddesi_ozel_tur_check CHECK (
    (cam_turu = 'diger' AND nullif(btrim(ozel_tur_adi), '') IS NOT NULL)
    OR
    (cam_turu <> 'diger' AND ozel_tur_adi IS NULL)
  )
);

CREATE UNIQUE INDEX maliyet_cam_hammaddesi_benzersiz_idx
  ON public.maliyet_cam_hammaddeleri (
    kalinlik_mm,
    cam_turu,
    COALESCE(lower(btrim(ozel_tur_adi)), '')
  );

CREATE TABLE public.maliyet_citalari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  genislik_mm numeric(8,2) NOT NULL CHECK (genislik_mm > 0),
  malzeme_turu text NOT NULL DEFAULT 'aluminyum' CHECK (
    malzeme_turu IN ('aluminyum', 'sicak_kenar', 'paslanmaz', 'diger')
  ),
  ozel_malzeme_adi text,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maliyet_cita_ozel_malzeme_check CHECK (
    (malzeme_turu = 'diger' AND nullif(btrim(ozel_malzeme_adi), '') IS NOT NULL)
    OR
    (malzeme_turu <> 'diger' AND ozel_malzeme_adi IS NULL)
  )
);

CREATE UNIQUE INDEX maliyet_cita_benzersiz_idx
  ON public.maliyet_citalari (
    genislik_mm,
    malzeme_turu,
    COALESCE(lower(btrim(ozel_malzeme_adi)), '')
  );

CREATE TABLE public.maliyet_sarf_malzemeleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad text NOT NULL CHECK (nullif(btrim(ad), '') IS NOT NULL),
  alis_birimi text NOT NULL CHECK (
    alis_birimi IN ('kg', 'litre', 'adet', 'metre')
  ),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX maliyet_sarf_malzemesi_ad_idx
  ON public.maliyet_sarf_malzemeleri (lower(btrim(ad)));

CREATE TABLE public.maliyet_sarf_katsayi_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sarf_malzeme_id uuid NOT NULL
    REFERENCES public.maliyet_sarf_malzemeleri(id) ON DELETE RESTRICT,
  hesaplama_tipi text NOT NULL CHECK (
    hesaplama_tipi IN ('cevre_m', 'm2', 'adet', 'sabit')
  ),
  tuketim_katsayisi numeric(18,8) NOT NULL CHECK (tuketim_katsayisi >= 0),
  bosluk_basi boolean NOT NULL DEFAULT true,
  fire_orani numeric(9,4) NOT NULL DEFAULT 0
    CHECK (fire_orani >= 0 AND fire_orani < 100),
  gecerli_baslangic date NOT NULL DEFAULT (
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  ),
  aciklama text,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX maliyet_sarf_katsayi_cozumleme_idx
  ON public.maliyet_sarf_katsayi_surmleri (
    sarf_malzeme_id,
    gecerli_baslangic DESC,
    created_at DESC
  );

CREATE TABLE public.maliyet_hesaplama_ayar_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yillik_finansman_orani numeric(9,4) NOT NULL
    CHECK (yillik_finansman_orani >= 0 AND yillik_finansman_orani <= 1000),
  cam_fire_orani numeric(9,4) NOT NULL DEFAULT 0
    CHECK (cam_fire_orani >= 0 AND cam_fire_orani < 100),
  cita_fire_orani numeric(9,4) NOT NULL DEFAULT 0
    CHECK (cita_fire_orani >= 0 AND cita_fire_orani < 100),
  referans_en_mm numeric(10,2) NOT NULL DEFAULT 1000
    CHECK (referans_en_mm > 0),
  referans_boy_mm numeric(10,2) NOT NULL DEFAULT 1000
    CHECK (referans_boy_mm > 0),
  gecerli_baslangic date NOT NULL DEFAULT (
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  ),
  aciklama text,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX maliyet_hesaplama_ayari_cozumleme_idx
  ON public.maliyet_hesaplama_ayar_surmleri (
    gecerli_baslangic DESC,
    created_at DESC
  );

CREATE TABLE public.maliyet_alis_fiyatlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  malzeme_turu text NOT NULL CHECK (malzeme_turu IN ('cam', 'cita', 'sarf')),
  cam_hammaddesi_id uuid
    REFERENCES public.maliyet_cam_hammaddeleri(id) ON DELETE RESTRICT,
  cita_id uuid
    REFERENCES public.maliyet_citalari(id) ON DELETE RESTRICT,
  sarf_malzeme_id uuid
    REFERENCES public.maliyet_sarf_malzemeleri(id) ON DELETE RESTRICT,
  tedarikci_id uuid NOT NULL REFERENCES public.cari(id) ON DELETE RESTRICT,
  birim_fiyat numeric(18,6) NOT NULL CHECK (birim_fiyat > 0),
  para_birimi public.para_birimi_kodu NOT NULL DEFAULT 'TRY',
  vade_gunu integer NOT NULL DEFAULT 0 CHECK (vade_gunu BETWEEN 0 AND 3650),
  gecerli_baslangic date NOT NULL DEFAULT (
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  ),
  aciklama text,
  idempotency_id uuid UNIQUE
    REFERENCES public.islem_idempotency(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maliyet_alis_fiyati_malzeme_check CHECK (
    num_nonnulls(cam_hammaddesi_id, cita_id, sarf_malzeme_id) = 1
    AND (
      (malzeme_turu = 'cam'
        AND cam_hammaddesi_id IS NOT NULL
        AND cita_id IS NULL
        AND sarf_malzeme_id IS NULL)
      OR
      (malzeme_turu = 'cita'
        AND cam_hammaddesi_id IS NULL
        AND cita_id IS NOT NULL
        AND sarf_malzeme_id IS NULL)
      OR
      (malzeme_turu = 'sarf'
        AND cam_hammaddesi_id IS NULL
        AND cita_id IS NULL
        AND sarf_malzeme_id IS NOT NULL)
    )
  )
);

CREATE INDEX maliyet_alis_fiyati_cam_cozumleme_idx
  ON public.maliyet_alis_fiyatlari (
    cam_hammaddesi_id,
    tedarikci_id,
    gecerli_baslangic DESC,
    created_at DESC
  )
  WHERE malzeme_turu = 'cam';

CREATE INDEX maliyet_alis_fiyati_cita_cozumleme_idx
  ON public.maliyet_alis_fiyatlari (
    cita_id,
    tedarikci_id,
    gecerli_baslangic DESC,
    created_at DESC
  )
  WHERE malzeme_turu = 'cita';

CREATE INDEX maliyet_alis_fiyati_sarf_cozumleme_idx
  ON public.maliyet_alis_fiyatlari (
    sarf_malzeme_id,
    tedarikci_id,
    gecerli_baslangic DESC,
    created_at DESC
  )
  WHERE malzeme_turu = 'sarf';

CREATE OR REPLACE FUNCTION public.maliyet_tarihceli_kaydi_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'MALIYET_TARIHCELI_KAYIT_DEGISTIRILEMEZ',
    DETAIL = 'Yeni değer için yeni başlangıç tarihli kayıt oluşturun.';
END;
$$;

CREATE OR REPLACE FUNCTION public.maliyet_tedarikciyi_dogrula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.cari
    WHERE id = NEW.tedarikci_id
      AND tipi = 'tedarikci'
      AND aktif
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AKTIF_TEDARIKCI_GEREKLI';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER maliyet_sarf_katsayi_append_only
  BEFORE UPDATE OR DELETE ON public.maliyet_sarf_katsayi_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_tarihceli_kaydi_koru();

CREATE TRIGGER maliyet_hesaplama_ayari_append_only
  BEFORE UPDATE OR DELETE ON public.maliyet_hesaplama_ayar_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_tarihceli_kaydi_koru();

CREATE TRIGGER maliyet_alis_fiyati_append_only
  BEFORE UPDATE OR DELETE ON public.maliyet_alis_fiyatlari
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_tarihceli_kaydi_koru();

CREATE TRIGGER maliyet_alis_fiyati_tedarikci_guard
  BEFORE INSERT OR UPDATE ON public.maliyet_alis_fiyatlari
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_tedarikciyi_dogrula();

-- İlk kullanım ekranı doğrudan kullanıma hazır açılsın; kullanıcı kod veya ad
-- üretmeden yalnız fiyat girsin.
INSERT INTO public.maliyet_cam_hammaddeleri (kalinlik_mm, cam_turu)
VALUES
  (4, 'duz'),
  (4, 'konfor'),
  (4, 'sinerji')
ON CONFLICT DO NOTHING;

INSERT INTO public.maliyet_citalari (genislik_mm, malzeme_turu)
VALUES (16, 'aluminyum')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'maliyet_cam_hammaddeleri',
    'maliyet_citalari',
    'maliyet_sarf_malzemeleri',
    'maliyet_sarf_katsayi_surmleri',
    'maliyet_hesaplama_ayar_surmleri',
    'maliyet_alis_fiyatlari'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format(
      'REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',
      v_table
    );
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_table);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (public.has_permission(%L, %L))',
      v_table || '_read',
      v_table,
      'pricing',
      'read'
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.write_audit_event()',
      'audit_' || v_table,
      v_table
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.maliyet_tarihceli_kaydi_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maliyet_tedarikciyi_dogrula()
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.maliyet_alis_fiyatlari IS
  'Tedarikçi ve malzeme bazlı append-only alış fiyatı tarihçesi. Geçerlilik bitişi tutulmaz; en yeni başlangıç geçerlidir.';
COMMENT ON COLUMN public.maliyet_hesaplama_ayar_surmleri.yillik_finansman_orani IS
  'Basit faiz yöntemi: alış fiyatı × yıllık oran × vade günü / 365.';
COMMENT ON COLUMN public.maliyet_sarf_katsayi_surmleri.tuketim_katsayisi IS
  'Alış birimi cinsinden, seçilen hesaplama tipi başına tüketim miktarıdır.';
