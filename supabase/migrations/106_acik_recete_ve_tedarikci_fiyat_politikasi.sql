-- 106 - Acik urun recetesi, stok bazli fire ve genel tedarikci fiyat politikasi
--
-- Bu migration 086-104 maliyet tablolarini kaldirmaz. Eski RPC'ler geriye uyumlu
-- olarak calismaya devam eder; yeni hesap motoru adindan/katman metninden malzeme
-- tahmin etmek yerine tarihsel ve acik recete satirlarini kullanir.

SET search_path = public, extensions, pg_catalog;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Mevcut append-only fiyat kaydini coklu tedarikci/varyant/vade teklifine genislet.
-- ---------------------------------------------------------------------------

ALTER TABLE public.stok_alis_fiyatlari
  ADD COLUMN IF NOT EXISTS fiyat_varyanti text NOT NULL DEFAULT 'genel',
  ADD COLUMN IF NOT EXISTS marka text,
  ADD COLUMN IF NOT EXISTS fiyat_liste_kodu text,
  ADD COLUMN IF NOT EXISTS teklif_gecerlilik_donemi daterange
    NOT NULL DEFAULT daterange('-infinity'::date, NULL, '[)'),
  ADD COLUMN IF NOT EXISTS vade_turu text GENERATED ALWAYS AS (
    CASE vade_gunu
      WHEN 0 THEN 'pesin'
      WHEN 60 THEN '60_gun'
      WHEN 75 THEN '75_gun'
      ELSE 'gun'
    END
  ) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stok_alis_fiyatlari'::regclass
      AND conname = 'stok_alis_fiyatlari_varyant_check'
  ) THEN
    ALTER TABLE public.stok_alis_fiyatlari
      ADD CONSTRAINT stok_alis_fiyatlari_varyant_check
      CHECK (
        fiyat_varyanti ~ '^[a-z0-9][a-z0-9_-]*$'
        AND length(fiyat_varyanti) <= 40
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stok_alis_fiyatlari'::regclass
      AND conname = 'stok_alis_fiyatlari_teklif_donemi_check'
  ) THEN
    ALTER TABLE public.stok_alis_fiyatlari
      ADD CONSTRAINT stok_alis_fiyatlari_teklif_donemi_check
      CHECK (
        NOT isempty(teklif_gecerlilik_donemi)
        AND NOT upper_inc(teklif_gecerlilik_donemi)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS stok_alis_fiyatlari_teklif_arama_idx
  ON public.stok_alis_fiyatlari (
    stok_id,
    tedarikci_id,
    fiyat_varyanti,
    vade_gunu,
    fiyat_tarihi DESC
  )
  WHERE durum IN ('dogrulanmis', 'duzeltme');

CREATE INDEX IF NOT EXISTS stok_alis_fiyatlari_teklif_donemi_idx
  ON public.stok_alis_fiyatlari USING gist (teklif_gecerlilik_donemi);

-- 091'deki guard profil bulunmasini zorunlu tutuyordu. V3'te fiyatlanabilir
-- malzemenin kimligi stok kartidir; eski profil varsa uyumluluk icin kullanilir,
-- yoksa kategori dogrudan cam/cita/sarf turune cevrilir.
CREATE OR REPLACE FUNCTION public.stok_alis_fiyati_baglantilarini_dogrula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profil_turu text;
  v_stok_kategorisi text;
  v_stok_birimi text;
  v_tedarik_kapsamlari text[];
  v_baglanti_tedarikcisi uuid;
  v_baglanti_durumu text;
BEGIN
  SELECT stok.kategori, stok.birim
  INTO v_stok_kategorisi, v_stok_birimi
  FROM public.stok
  WHERE stok.id = NEW.stok_id
    AND stok.aktif;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'AKTIF_STOK_GEREKLI';
  END IF;

  SELECT profil.profil_turu
  INTO v_profil_turu
  FROM public.stok_maliyet_profilleri profil
  WHERE profil.stok_id = NEW.stok_id
    AND profil.gecerlilik_donemi @>
      (NEW.fiyat_tarihi AT TIME ZONE 'Europe/Istanbul')::date
  LIMIT 1;

  v_profil_turu := COALESCE(
    v_profil_turu,
    CASE v_stok_kategorisi
      WHEN 'cam' THEN 'cam'
      WHEN 'cita' THEN 'cita'
      WHEN 'yan_malzeme' THEN 'sarf'
    END
  );

  IF v_profil_turu IS NULL AND NEW.kaynak_turu <> 'legacy_unverified' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'FIYATLANABILIR_STOK_KATEGORISI_GEREKLI';
  END IF;

  IF NEW.kaynak_turu = 'legacy_unverified' THEN
    RETURN NEW;
  END IF;

  IF lower(btrim(NEW.stok_ana_birimi)) <> lower(btrim(v_stok_birimi)) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'FIYAT_STOK_ANA_BIRIMI_UYUSMUYOR';
  END IF;

  SELECT cari.tedarik_kapsamlari
  INTO v_tedarik_kapsamlari
  FROM public.cari
  WHERE cari.id = NEW.tedarikci_id
    AND cari.tipi = 'tedarikci'
    AND cari.aktif;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'AKTIF_TEDARIKCI_GEREKLI';
  END IF;

  IF (v_profil_turu = 'cam'
      AND NOT ('cam' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[]))))
     OR (v_profil_turu = 'cita'
      AND NOT ('cita' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[]))))
     OR (v_profil_turu = 'sarf'
      AND NOT ('yan_malzeme' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])))) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TEDARIKCI_KAPSAMI_UYUSMUYOR';
  END IF;

  IF NEW.kaynak_turu = 'cam_baglantisi' THEN
    SELECT baglanti.tedarikci_id, baglanti.durum
    INTO v_baglanti_tedarikcisi, v_baglanti_durumu
    FROM public.cam_tedarik_baglantilari baglanti
    WHERE baglanti.id = NEW.cam_baglantisi_id;

    IF v_baglanti_tedarikcisi IS DISTINCT FROM NEW.tedarikci_id
       OR v_baglanti_durumu <> 'taslak' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'CAM_BAGLANTISI_FIYAT_KAYNAGI_GECERSIZ';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Acik ve tarihsel urun receteleri
-- ---------------------------------------------------------------------------

CREATE TABLE public.stok_urun_maliyet_recete_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  urun_stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  gecerlilik_donemi daterange NOT NULL,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  recete_kaynagi text NOT NULL
    CHECK (recete_kaynagi IN ('manuel', 'standart_036')),
  aciklama text,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    NOT isempty(gecerlilik_donemi)
    AND lower_inc(gecerlilik_donemi)
    AND NOT upper_inc(gecerlilik_donemi)
  )
);

ALTER TABLE public.stok_urun_maliyet_recete_surmleri
  ADD CONSTRAINT urun_maliyet_recete_donem_cakismasi
  EXCLUDE USING gist (
    urun_stok_id WITH =,
    gecerlilik_donemi WITH &&
  );

CREATE INDEX urun_maliyet_recete_stok_tarih_idx
  ON public.stok_urun_maliyet_recete_surmleri (
    urun_stok_id,
    lower(gecerlilik_donemi) DESC
  );

CREATE TABLE public.stok_urun_maliyet_recete_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recete_surumu_id uuid NOT NULL
    REFERENCES public.stok_urun_maliyet_recete_surmleri(id) ON DELETE RESTRICT,
  sira_no integer NOT NULL CHECK (sira_no > 0),
  bilesen_stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  rol text NOT NULL CHECK (rol IN ('cam', 'cita', 'sarf')),
  tuketim_tipi text NOT NULL CHECK (tuketim_tipi IN ('alan', 'cevre', 'adet')),
  katsayi numeric(20,10) NOT NULL CHECK (katsayi > 0),
  bosluk_sirasi integer CHECK (bosluk_sirasi IS NULL OR bosluk_sirasi > 0),
  alternatif_grubu text CHECK (
    alternatif_grubu IS NULL
    OR (
      alternatif_grubu ~ '^[a-z0-9][a-z0-9_-]*$'
      AND length(alternatif_grubu) <= 60
    )
  ),
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recete_surumu_id, sira_no),
  CHECK (
    (rol = 'cam' AND tuketim_tipi = 'alan' AND bosluk_sirasi IS NULL)
    OR
    (rol = 'cita' AND tuketim_tipi = 'cevre' AND bosluk_sirasi IS NOT NULL)
    OR
    (rol = 'sarf')
  )
);

CREATE UNIQUE INDEX urun_maliyet_recete_alternatif_gap_idx
  ON public.stok_urun_maliyet_recete_kalemleri (
    recete_surumu_id,
    alternatif_grubu,
    COALESCE(bosluk_sirasi, 0)
  )
  WHERE alternatif_grubu IS NOT NULL;

CREATE INDEX urun_maliyet_recete_kalem_bilesen_idx
  ON public.stok_urun_maliyet_recete_kalemleri (bilesen_stok_id, recete_surumu_id);

-- Fire fiyat profiline veya tedarikciye degil, stok kartina aittir.
CREATE TABLE public.stok_fire_orani_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  fire_orani numeric(9,4) NOT NULL CHECK (fire_orani >= 0 AND fire_orani < 100),
  gecerlilik_donemi daterange NOT NULL,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  aciklama text,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    NOT isempty(gecerlilik_donemi)
    AND (lower_inf(gecerlilik_donemi) OR lower_inc(gecerlilik_donemi))
    AND NOT upper_inc(gecerlilik_donemi)
  )
);

ALTER TABLE public.stok_fire_orani_surmleri
  ADD CONSTRAINT stok_fire_orani_donem_cakismasi
  EXCLUDE USING gist (
    stok_id WITH =,
    gecerlilik_donemi WITH &&
  );

CREATE INDEX stok_fire_orani_stok_tarih_idx
  ON public.stok_fire_orani_surmleri (
    stok_id,
    lower(gecerlilik_donemi) DESC
  );

-- ---------------------------------------------------------------------------
-- Toplu politika + stok override. Her satir gercek fiyat_id'yi snapshot olarak
-- saklar; daha sonra yeni teklif girilmesi gecmis maliyeti degistirmez.
-- ---------------------------------------------------------------------------

CREATE TABLE public.stok_maliyet_fiyat_politika_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kapsam text NOT NULL
    CHECK (kapsam IN ('cam', 'cita', 'yan_malzeme', 'stok_listesi')),
  tedarikci_id uuid NOT NULL REFERENCES public.cari(id) ON DELETE RESTRICT,
  fiyat_varyanti text NOT NULL
    CHECK (fiyat_varyanti ~ '^[a-z0-9][a-z0-9_-]*$'),
  genel_fallback boolean NOT NULL DEFAULT false,
  vade_gunu integer NOT NULL CHECK (vade_gunu BETWEEN 0 AND 3650),
  gecerlilik_donemi tstzrange NOT NULL,
  gerekce text NOT NULL CHECK (length(btrim(gerekce)) >= 5),
  idempotency_id uuid REFERENCES public.islem_idempotency(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    NOT isempty(gecerlilik_donemi)
    AND lower_inc(gecerlilik_donemi)
    AND NOT upper_inc(gecerlilik_donemi)
  )
);

CREATE TABLE public.stok_maliyet_fiyat_secim_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  fiyat_id uuid NOT NULL REFERENCES public.stok_alis_fiyatlari(id) ON DELETE RESTRICT,
  secim_seviyesi text NOT NULL
    CHECK (secim_seviyesi IN ('toplu', 'stok_override')),
  politika_surumu_id uuid
    REFERENCES public.stok_maliyet_fiyat_politika_surmleri(id) ON DELETE RESTRICT,
  gecerlilik_donemi tstzrange NOT NULL,
  gerekce text NOT NULL CHECK (length(btrim(gerekce)) >= 5),
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    NOT isempty(gecerlilik_donemi)
    AND lower_inc(gecerlilik_donemi)
    AND NOT upper_inc(gecerlilik_donemi)
  ),
  CHECK (
    (secim_seviyesi = 'toplu' AND politika_surumu_id IS NOT NULL)
    OR
    (secim_seviyesi = 'stok_override' AND politika_surumu_id IS NULL)
  )
);

ALTER TABLE public.stok_maliyet_fiyat_secim_surmleri
  ADD CONSTRAINT stok_maliyet_fiyat_secim_donem_cakismasi
  EXCLUDE USING gist (
    stok_id WITH =,
    secim_seviyesi WITH =,
    gecerlilik_donemi WITH &&
  );

CREATE INDEX stok_maliyet_fiyat_secim_stok_idx
  ON public.stok_maliyet_fiyat_secim_surmleri (
    stok_id,
    secim_seviyesi,
    lower(gecerlilik_donemi) DESC
  );

CREATE INDEX stok_maliyet_fiyat_secim_fiyat_idx
  ON public.stok_maliyet_fiyat_secim_surmleri (fiyat_id);

-- ---------------------------------------------------------------------------
-- Veri butunlugu ve append-only korumalari
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.urun_maliyet_recete_stogunu_dogrula_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kategori text;
BEGIN
  SELECT stok.kategori
  INTO v_kategori
  FROM public.stok
  WHERE stok.id = NEW.urun_stok_id
    AND stok.aktif;

  IF NOT FOUND OR v_kategori <> 'cam' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RECETE_ICIN_AKTIF_CAM_URUNU_GEREKLI';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER urun_maliyet_recete_stok_guard_v3
  BEFORE INSERT OR UPDATE ON public.stok_urun_maliyet_recete_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.urun_maliyet_recete_stogunu_dogrula_v3();

CREATE OR REPLACE FUNCTION public.urun_maliyet_recete_kalemini_dogrula_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kategori text;
  v_kod text;
  v_urun_stok_id uuid;
BEGIN
  SELECT stok.kategori, stok.kod
  INTO v_kategori, v_kod
  FROM public.stok
  WHERE stok.id = NEW.bilesen_stok_id
    AND stok.aktif;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'AKTIF_RECETE_BILESENI_GEREKLI';
  END IF;

  IF (NEW.rol = 'cam' AND v_kategori <> 'cam')
     OR (NEW.rol = 'cita' AND v_kategori <> 'cita')
     OR (NEW.rol = 'sarf' AND v_kategori <> 'yan_malzeme') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RECETE_BILESEN_ROLU_KATEGORIYLE_UYUSMUYOR';
  END IF;

  SELECT recete.urun_stok_id
  INTO v_urun_stok_id
  FROM public.stok_urun_maliyet_recete_surmleri recete
  WHERE recete.id = NEW.recete_surumu_id;

  IF v_urun_stok_id = NEW.bilesen_stok_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'URUN_KENDI_RECETE_BILESENI_OLAMAZ';
  END IF;

  -- Kod guard'i alternatif_grubu bos birakilsa bile PU ve Thiokol'un ayni
  -- boslukta birlikte aktif edilmesini engeller.
  IF v_kod IN ('SARF-PU', 'SARF-THIOKOL')
     AND EXISTS (
       SELECT 1
       FROM public.stok_urun_maliyet_recete_kalemleri kalem
       JOIN public.stok diger ON diger.id = kalem.bilesen_stok_id
       WHERE kalem.recete_surumu_id = NEW.recete_surumu_id
         AND kalem.id <> COALESCE(NEW.id, gen_random_uuid())
         AND COALESCE(kalem.bosluk_sirasi, 0) = COALESCE(NEW.bosluk_sirasi, 0)
         AND diger.kod IN ('SARF-PU', 'SARF-THIOKOL')
         AND diger.kod <> v_kod
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RECETE_IKINCIL_DOLGU_CAKISMASI',
      DETAIL = 'Poliuretan ve Thiokol ayni urun/bosluk recetesinde birlikte kullanilamaz.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER urun_maliyet_recete_kalem_guard_v3
  BEFORE INSERT OR UPDATE ON public.stok_urun_maliyet_recete_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.urun_maliyet_recete_kalemini_dogrula_v3();

CREATE OR REPLACE FUNCTION public.maliyet_v3_surumu_degisimini_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MALIYET_V3_SURUMU_SILINEMEZ';
  END IF;

  IF current_setting('app.maliyet_v3_surum_kapatma', true) IS DISTINCT FROM 'true'
     OR (to_jsonb(OLD) - 'gecerlilik_donemi')
        IS DISTINCT FROM (to_jsonb(NEW) - 'gecerlilik_donemi')
     OR lower(OLD.gecerlilik_donemi) IS DISTINCT FROM lower(NEW.gecerlilik_donemi)
     OR upper_inf(NEW.gecerlilik_donemi)
     OR (
       NOT upper_inf(OLD.gecerlilik_donemi)
       AND upper(NEW.gecerlilik_donemi) >= upper(OLD.gecerlilik_donemi)
     )
     OR upper(NEW.gecerlilik_donemi) <= lower(NEW.gecerlilik_donemi) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MALIYET_V3_SURUMU_DEGISTIRILEMEZ';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER urun_maliyet_recete_surumu_guard_v3
  BEFORE UPDATE OR DELETE ON public.stok_urun_maliyet_recete_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_v3_surumu_degisimini_koru();

CREATE TRIGGER stok_fire_orani_surumu_guard_v3
  BEFORE UPDATE OR DELETE ON public.stok_fire_orani_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_v3_surumu_degisimini_koru();

CREATE TRIGGER stok_maliyet_fiyat_secim_surumu_guard_v3
  BEFORE UPDATE OR DELETE ON public.stok_maliyet_fiyat_secim_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_v3_surumu_degisimini_koru();

CREATE OR REPLACE FUNCTION public.urun_maliyet_recete_kalemini_koru_v3()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'RECETE_KALEMI_DEGISTIRILEMEZ',
    DETAIL = 'Degisiklik icin yeni bir recete surumu olusturun.';
END;
$$;

CREATE TRIGGER urun_maliyet_recete_kalemi_immutable_v3
  BEFORE UPDATE OR DELETE ON public.stok_urun_maliyet_recete_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.urun_maliyet_recete_kalemini_koru_v3();

CREATE OR REPLACE FUNCTION public.stok_maliyet_fiyat_secimini_dogrula_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fiyat public.stok_alis_fiyatlari%ROWTYPE;
  v_secim_baslangic date;
  v_secim_bitis date;
BEGIN
  SELECT *
  INTO v_fiyat
  FROM public.stok_alis_fiyatlari
  WHERE id = NEW.fiyat_id;

  IF NOT FOUND
     OR v_fiyat.stok_id <> NEW.stok_id
     OR v_fiyat.durum NOT IN ('dogrulanmis', 'duzeltme')
     OR v_fiyat.kaynak_turu = 'legacy_unverified' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'SECILEBILIR_DOGRULANMIS_FIYAT_GEREKLI';
  END IF;

  v_secim_baslangic :=
    (lower(NEW.gecerlilik_donemi) AT TIME ZONE 'Europe/Istanbul')::date;
  v_secim_bitis := CASE
    WHEN upper_inf(NEW.gecerlilik_donemi) THEN NULL
    ELSE (upper(NEW.gecerlilik_donemi) AT TIME ZONE 'Europe/Istanbul')::date
  END;

  IF NOT (v_fiyat.teklif_gecerlilik_donemi @> v_secim_baslangic)
     OR (
       v_secim_bitis IS NOT NULL
       AND NOT upper_inf(v_fiyat.teklif_gecerlilik_donemi)
       AND v_secim_bitis > upper(v_fiyat.teklif_gecerlilik_donemi)
     )
     OR (
       v_secim_bitis IS NULL
       AND NOT upper_inf(v_fiyat.teklif_gecerlilik_donemi)
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'FIYAT_TEKLIF_DONEMI_SECIMI_KAPSAMIYOR';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER stok_maliyet_fiyat_secim_dogrulama_guard_v3
  BEFORE INSERT OR UPDATE ON public.stok_maliyet_fiyat_secim_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.stok_maliyet_fiyat_secimini_dogrula_v3();

-- ---------------------------------------------------------------------------
-- Baslangic fireleri. Bu veri stok koduna baglidir ve sonraki surumler RPC ile
-- elle degistirilebilir. Eski profil fireleri yalniz ilk degeri tamamlamak icin
-- kullanilir; V3 hesap motoru profil.fire_orani okumaz.
-- ---------------------------------------------------------------------------

INSERT INTO public.stok_fire_orani_surmleri (
  stok_id,
  fire_orani,
  gecerlilik_donemi,
  revision_no,
  aciklama
)
SELECT
  stok.id,
  CASE
    WHEN stok.kod = '01002' THEN 6
    WHEN stok.kod = '01020' THEN 12
    WHEN stok.kod = '01022' THEN 10
    WHEN stok.kod IN ('01008', '01009') THEN 10
    WHEN stok.kategori = 'cita' THEN 5
    ELSE COALESCE(profil.fire_orani, 0)
  END,
  daterange(NULL, NULL, '[)'),
  1,
  '106 baslangic stok fire orani'
FROM public.stok stok
LEFT JOIN LATERAL (
  SELECT p.fire_orani
  FROM public.stok_maliyet_profilleri p
  WHERE p.stok_id = stok.id
    AND p.gecerlilik_donemi @>
      (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  ORDER BY p.revision_no DESC, p.created_at DESC, p.id DESC
  LIMIT 1
) profil ON true
WHERE stok.aktif
  AND (
    stok.kategori IN ('cita', 'yan_malzeme')
    OR (
      stok.kategori = 'cam'
      AND (
        stok.katman_yapisi IS NULL
        OR stok.kod = '01016'
      )
    )
  )
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.stok_urun_maliyet_recete_surmleri IS
  'Mamul stok icin tahmine dayanmayan, tarihsel ve acik maliyet recetesi basligi.';
COMMENT ON TABLE public.stok_urun_maliyet_recete_kalemleri IS
  'Sirali cam/cita/sarf stok bilesenleri ve alan/cevre/adet tuketim formulu.';
COMMENT ON TABLE public.stok_fire_orani_surmleri IS
  'Tedarikciden ve eski profilden bagimsiz, stok bazinda elle surumlenebilir fire.';
COMMENT ON TABLE public.stok_maliyet_fiyat_secim_surmleri IS
  'Toplu politika veya tekil override tarafindan secilen kesin fiyat_id snapshoti.';

-- ---------------------------------------------------------------------------
-- Yazma RPC'leri
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_tedarikci_id uuid;
  v_tedarik_kapsamlari text[];
  v_fiyat_tarihi timestamptz;
  v_baslangic date;
  v_bitis date;
  v_kalem jsonb;
  v_stok record;
  v_fiyat_id uuid;
  v_fiyat_ids jsonb := '[]'::jsonb;
  v_para_birimi text;
  v_fiyat_birimi text;
  v_varyant text;
  v_vade integer;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('create', false);

  IF jsonb_typeof(p_payload -> 'kalemler') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload -> 'kalemler') = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FIYAT_TEKLIFI_KALEMLERI_ZORUNLU';
  END IF;

  v_tedarikci_id := NULLIF(p_payload ->> 'tedarikci_id', '')::uuid;
  SELECT cari.tedarik_kapsamlari
  INTO v_tedarik_kapsamlari
  FROM public.cari
  WHERE cari.id = v_tedarikci_id
    AND cari.tipi = 'tedarikci'
    AND cari.aktif;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'AKTIF_TEDARIKCI_BULUNAMADI';
  END IF;

  v_fiyat_tarihi := COALESCE(
    NULLIF(p_payload ->> 'fiyat_tarihi', '')::timestamptz,
    clock_timestamp()
  );
  v_baslangic := COALESCE(
    NULLIF(p_payload ->> 'gecerlilik_baslangici', '')::date,
    (v_fiyat_tarihi AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_bitis := NULLIF(p_payload ->> 'gecerlilik_bitisi', '')::date;

  IF v_bitis IS NOT NULL AND v_bitis <= v_baslangic THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FIYAT_TEKLIFI_DONEMI_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'stok_tedarikci_fiyat_tekliflerini_kaydet_v3',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_tedarikci_fiyat_tekliflerini_kaydet_v3',
    p_idempotency_key,
    COALESCE(p_payload ->> 'aciklama', 'Tedarikci fiyat teklifi kaydi'),
    COALESCE(p_payload ->> 'kaynak_ekran', 'maliyet_v3')
  );

  FOR v_kalem IN
    SELECT value
    FROM jsonb_array_elements(p_payload -> 'kalemler')
  LOOP
    SELECT stok.id, stok.kategori, stok.birim
    INTO v_stok
    FROM public.stok
    WHERE stok.id = NULLIF(v_kalem ->> 'stok_id', '')::uuid
      AND stok.aktif;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'FIYAT_TEKLIFI_AKTIF_STOK_GEREKLI';
    END IF;

    IF (v_stok.kategori = 'cam'
        AND NOT ('cam' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[]))))
       OR (v_stok.kategori = 'cita'
        AND NOT ('cita' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[]))))
       OR (v_stok.kategori = 'yan_malzeme'
        AND NOT ('yan_malzeme' = ANY(COALESCE(v_tedarik_kapsamlari, ARRAY[]::text[])))) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TEDARIKCI_KAPSAMI_UYUSMUYOR';
    END IF;

    v_para_birimi := upper(COALESCE(NULLIF(v_kalem ->> 'para_birimi', ''), 'TRY'));
    v_fiyat_birimi := COALESCE(NULLIF(v_kalem ->> 'fiyat_birimi', ''), v_stok.birim);
    v_varyant := lower(COALESCE(NULLIF(v_kalem ->> 'varyant', ''), 'genel'));
    v_vade := COALESCE(NULLIF(v_kalem ->> 'vade_gunu', '')::integer, 0);

    -- Ilk fazda cam teklifleri TL/m2'dir. Cita ve sarf stok ana biriminde
    -- fiyatlanabilir; para birimi tum yeni akista simdilik TRY tutulur.
    IF v_para_birimi <> 'TRY'
       OR (
         v_stok.kategori = 'cam'
         AND lower(replace(v_fiyat_birimi, '²', '2')) <> 'm2'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'V3_FIYAT_BIRIMI_DESTEKLENMIYOR',
        DETAIL = 'Ilk fazda cam teklifleri TRY/m2 olmalidir.';
    END IF;

    INSERT INTO public.stok_alis_fiyatlari (
      stok_id,
      tedarikci_id,
      birim_fiyat,
      para_birimi,
      fiyat_birimi,
      paket_miktari,
      stok_ana_birimi,
      donusum_katsayisi,
      donusum_aciklamasi,
      vade_gunu,
      fiyat_tarihi,
      kaynak_turu,
      kaynak_referansi,
      durum,
      olusturan_kullanici_id,
      fiyat_varyanti,
      marka,
      fiyat_liste_kodu,
      teklif_gecerlilik_donemi
    )
    VALUES (
      v_stok.id,
      v_tedarikci_id,
      (v_kalem ->> 'birim_fiyat')::numeric,
      v_para_birimi::public.para_birimi_kodu,
      v_fiyat_birimi,
      NULLIF(v_kalem ->> 'paket_miktari', '')::numeric,
      COALESCE(NULLIF(v_kalem ->> 'stok_ana_birimi', ''), v_stok.birim),
      COALESCE(NULLIF(v_kalem ->> 'donusum_katsayisi', '')::numeric, 1),
      NULLIF(btrim(v_kalem ->> 'donusum_aciklamasi'), ''),
      v_vade,
      COALESCE(
        NULLIF(v_kalem ->> 'fiyat_tarihi', '')::timestamptz,
        v_fiyat_tarihi
      ),
      'dogrudan',
      COALESCE(
        NULLIF(v_kalem ->> 'kaynak_referansi', ''),
        NULLIF(p_payload ->> 'kaynak_referansi', '')
      ),
      'dogrulanmis',
      auth.uid(),
      v_varyant,
      NULLIF(v_kalem ->> 'marka', ''),
      COALESCE(
        NULLIF(v_kalem ->> 'fiyat_liste_kodu', ''),
        NULLIF(p_payload ->> 'fiyat_liste_kodu', '')
      ),
      daterange(
        COALESCE(
          NULLIF(v_kalem ->> 'gecerlilik_baslangici', '')::date,
          v_baslangic
        ),
        COALESCE(
          NULLIF(v_kalem ->> 'gecerlilik_bitisi', '')::date,
          v_bitis
        ),
        '[)'
      )
    )
    RETURNING id INTO v_fiyat_id;

    v_fiyat_ids := v_fiyat_ids || jsonb_build_array(v_fiyat_id);
  END LOOP;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'tedarikci_id', v_tedarikci_id,
    'adet', jsonb_array_length(v_fiyat_ids),
    'fiyat_ids', v_fiyat_ids
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_fire_orani_kaydet_v3(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_stok_id uuid := NULLIF(p_payload ->> 'stok_id', '')::uuid;
  v_baslangic date := COALESCE(
    NULLIF(p_payload ->> 'baslangic', '')::date,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_istenen_bitis date := NULLIF(p_payload ->> 'bitis', '')::date;
  v_sonraki_baslangic date;
  v_bitis date;
  v_mevcut public.stok_fire_orani_surmleri%ROWTYPE;
  v_id uuid;
  v_revision integer;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);

  IF NOT EXISTS (
    SELECT 1 FROM public.stok WHERE id = v_stok_id AND aktif
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AKTIF_STOK_BULUNAMADI';
  END IF;
  IF (p_payload ->> 'fire_orani')::numeric < 0
     OR (p_payload ->> 'fire_orani')::numeric >= 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FIRE_ORANI_GECERSIZ';
  END IF;
  IF v_istenen_bitis IS NOT NULL AND v_istenen_bitis <= v_baslangic THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FIRE_DONEMI_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'stok_fire_orani_kaydet_v3', p_idempotency_key, p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_fire_orani_kaydet_v3',
    p_idempotency_key,
    COALESCE(p_payload ->> 'aciklama', 'Stok fire orani degisikligi'),
    COALESCE(p_payload ->> 'kaynak_ekran', 'maliyet_v3')
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('stok_fire_v3:' || v_stok_id::text, 0)
  );

  SELECT *
  INTO v_mevcut
  FROM public.stok_fire_orani_surmleri
  WHERE stok_id = v_stok_id
    AND gecerlilik_donemi @> v_baslangic
  FOR UPDATE;

  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) = v_baslangic THEN
      RAISE EXCEPTION USING
        ERRCODE = '23P01',
        MESSAGE = 'AYNI_BASLANGICTA_FIRE_SURUMU_VAR';
    END IF;
    PERFORM set_config('app.maliyet_v3_surum_kapatma', 'true', true);
    UPDATE public.stok_fire_orani_surmleri
    SET gecerlilik_donemi =
      daterange(lower(gecerlilik_donemi), v_baslangic, '[)')
    WHERE id = v_mevcut.id;
  END IF;

  SELECT min(lower(gecerlilik_donemi))
  INTO v_sonraki_baslangic
  FROM public.stok_fire_orani_surmleri
  WHERE stok_id = v_stok_id
    AND lower(gecerlilik_donemi) > v_baslangic;

  v_bitis := CASE
    WHEN v_istenen_bitis IS NULL THEN v_sonraki_baslangic
    WHEN v_sonraki_baslangic IS NULL THEN v_istenen_bitis
    ELSE LEAST(v_istenen_bitis, v_sonraki_baslangic)
  END;
  v_revision := COALESCE((
    SELECT max(revision_no) + 1
    FROM public.stok_fire_orani_surmleri
    WHERE stok_id = v_stok_id
  ), 1);

  INSERT INTO public.stok_fire_orani_surmleri (
    stok_id,
    fire_orani,
    gecerlilik_donemi,
    revision_no,
    aciklama,
    olusturan_kullanici_id
  )
  VALUES (
    v_stok_id,
    (p_payload ->> 'fire_orani')::numeric,
    daterange(v_baslangic, v_bitis, '[)'),
    v_revision,
    NULLIF(p_payload ->> 'aciklama', ''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'fire_surumu_id', v_id,
    'stok_id', v_stok_id,
    'fire_orani', (p_payload ->> 'fire_orani')::numeric,
    'gecerlilik_baslangici', v_baslangic,
    'gecerlilik_bitisi', v_bitis,
    'revision_no', v_revision
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.urun_maliyet_recetesi_kaydet_v3(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_urun_stok_id uuid := NULLIF(p_payload ->> 'urun_stok_id', '')::uuid;
  v_baslangic date := COALESCE(
    NULLIF(p_payload ->> 'baslangic', '')::date,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_istenen_bitis date := NULLIF(p_payload ->> 'bitis', '')::date;
  v_sonraki_baslangic date;
  v_bitis date;
  v_mevcut public.stok_urun_maliyet_recete_surmleri%ROWTYPE;
  v_recete_id uuid;
  v_revision integer;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('update', false);

  IF jsonb_typeof(p_payload -> 'kalemler') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload -> 'kalemler') = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RECETE_KALEMLERI_ZORUNLU';
  END IF;
  IF v_istenen_bitis IS NOT NULL AND v_istenen_bitis <= v_baslangic THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RECETE_DONEMI_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'urun_maliyet_recetesi_kaydet_v3', p_idempotency_key, p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'urun_maliyet_recetesi_kaydet_v3',
    p_idempotency_key,
    COALESCE(p_payload ->> 'aciklama', 'Urun maliyet recetesi degisikligi'),
    COALESCE(p_payload ->> 'kaynak_ekran', 'maliyet_v3')
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('urun_recete_v3:' || v_urun_stok_id::text, 0)
  );

  SELECT *
  INTO v_mevcut
  FROM public.stok_urun_maliyet_recete_surmleri
  WHERE urun_stok_id = v_urun_stok_id
    AND gecerlilik_donemi @> v_baslangic
  FOR UPDATE;

  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) = v_baslangic THEN
      RAISE EXCEPTION USING
        ERRCODE = '23P01',
        MESSAGE = 'AYNI_BASLANGICTA_RECETE_SURUMU_VAR';
    END IF;
    PERFORM set_config('app.maliyet_v3_surum_kapatma', 'true', true);
    UPDATE public.stok_urun_maliyet_recete_surmleri
    SET gecerlilik_donemi =
      daterange(lower(gecerlilik_donemi), v_baslangic, '[)')
    WHERE id = v_mevcut.id;
  END IF;

  SELECT min(lower(gecerlilik_donemi))
  INTO v_sonraki_baslangic
  FROM public.stok_urun_maliyet_recete_surmleri
  WHERE urun_stok_id = v_urun_stok_id
    AND lower(gecerlilik_donemi) > v_baslangic;

  v_bitis := CASE
    WHEN v_istenen_bitis IS NULL THEN v_sonraki_baslangic
    WHEN v_sonraki_baslangic IS NULL THEN v_istenen_bitis
    ELSE LEAST(v_istenen_bitis, v_sonraki_baslangic)
  END;
  v_revision := COALESCE((
    SELECT max(revision_no) + 1
    FROM public.stok_urun_maliyet_recete_surmleri
    WHERE urun_stok_id = v_urun_stok_id
  ), 1);

  INSERT INTO public.stok_urun_maliyet_recete_surmleri (
    urun_stok_id,
    gecerlilik_donemi,
    revision_no,
    recete_kaynagi,
    aciklama,
    olusturan_kullanici_id
  )
  VALUES (
    v_urun_stok_id,
    daterange(v_baslangic, v_bitis, '[)'),
    v_revision,
    'manuel',
    NULLIF(p_payload ->> 'aciklama', ''),
    auth.uid()
  )
  RETURNING id INTO v_recete_id;

  INSERT INTO public.stok_urun_maliyet_recete_kalemleri (
    recete_surumu_id,
    sira_no,
    bilesen_stok_id,
    rol,
    tuketim_tipi,
    katsayi,
    bosluk_sirasi,
    alternatif_grubu,
    aciklama
  )
  SELECT
    v_recete_id,
    kalem.sira_no,
    kalem.bilesen_stok_id,
    kalem.rol,
    kalem.tuketim_tipi,
    kalem.katsayi,
    kalem.bosluk_sirasi,
    kalem.alternatif_grubu,
    kalem.aciklama
  FROM jsonb_to_recordset(p_payload -> 'kalemler') AS kalem(
    sira_no integer,
    bilesen_stok_id uuid,
    rol text,
    tuketim_tipi text,
    katsayi numeric,
    bosluk_sirasi integer,
    alternatif_grubu text,
    aciklama text
  );

  v_yanit := jsonb_build_object(
    'basarili', true,
    'recete_surumu_id', v_recete_id,
    'urun_stok_id', v_urun_stok_id,
    'kalem_sayisi', jsonb_array_length(p_payload -> 'kalemler'),
    'gecerlilik_baslangici', v_baslangic,
    'gecerlilik_bitisi', v_bitis,
    'revision_no', v_revision
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

-- ---------------------------------------------------------------------------
-- 036 katalogu icin deterministik recete onerisi ve guvenli kurulum
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.maliyet_recete_onerisi_v3(
  p_urun_stok_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_urun public.stok%ROWTYPE;
  v_katmanlar text[];
  v_cam_kodlari text[];
  v_aile text;
  v_nedenler jsonb := '[]'::jsonb;
  v_kalemler jsonb := '[]'::jsonb;
  v_pozisyon integer;
  v_cam_sirasi integer := 0;
  v_bosluk_sirasi integer := 0;
  v_sira integer := 0;
  v_bilesen_kodu text;
  v_bilesen_id uuid;
  v_bosluk numeric;
  v_sarf record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT *
  INTO v_urun
  FROM public.stok
  WHERE id = p_urun_stok_id
    AND aktif
    AND kategori = 'cam';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'AKTIF_CAM_URUNU_BULUNAMADI';
  END IF;

  IF v_urun.katman_yapisi IS NULL THEN
    RETURN jsonb_build_object(
      'durum', 'belirsiz',
      'urun_stok_id', v_urun.id,
      'stok_kodu', v_urun.kod,
      'nedenler', jsonb_build_array(jsonb_build_object(
        'kod', 'KATMAN_YAPISI_EKSIK',
        'mesaj', 'Standart recete icin katman yapisi gereklidir.'
      )),
      'kalemler', '[]'::jsonb
    );
  END IF;

  v_katmanlar := string_to_array(v_urun.katman_yapisi, '+');
  IF cardinality(v_katmanlar) < 3 OR cardinality(v_katmanlar) % 2 = 0 THEN
    RETURN jsonb_build_object(
      'durum', 'belirsiz',
      'urun_stok_id', v_urun.id,
      'stok_kodu', v_urun.kod,
      'nedenler', jsonb_build_array(jsonb_build_object(
        'kod', 'KATMAN_YAPISI_ACIK_RECETEYE_CEVRILEMIYOR',
        'mesaj', v_urun.katman_yapisi
      )),
      'kalemler', '[]'::jsonb
    );
  END IF;

  -- Yalniz 036'da anlami kesin olan stok kodu aileleri desteklenir. Urun adinda
  -- kelime arayip ikinci cami "duz" varsayan eski davranis burada yoktur.
  IF v_urun.kod BETWEEN '10000' AND '10008' THEN
    v_aile := 'klasik_4';
    v_cam_kodlari := ARRAY['01002', '01002'];
  ELSIF v_urun.kod BETWEEN '10100' AND '10107' THEN
    v_aile := 'klasik_buzlu';
    v_cam_kodlari := ARRAY['01002', '01008'];
  ELSIF v_urun.kod BETWEEN '10200' AND '10203'
        OR v_urun.kod BETWEEN '10206' AND '10208' THEN
    v_aile := 'fume';
    v_cam_kodlari := ARRAY['01013', '01002'];
  ELSIF v_urun.kod = '10204' THEN
    v_aile := 'cift_fume';
    v_cam_kodlari := ARRAY['01013', '01013'];
  ELSIF v_urun.kod = '10205' THEN
    v_aile := 'fume_konfor';
    v_cam_kodlari := ARRAY['01013', '01022'];
  ELSIF v_urun.kod BETWEEN '10300' AND '10308' THEN
    v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
      'kod', 'REFLEKTE_TURU_BELIRSIZ',
      'mesaj', 'Bronz Reflekte veya Fume Reflekte elle secilmelidir.'
    ));
  ELSIF v_urun.kod BETWEEN '10400' AND '10408' THEN
    v_aile := 'sinerji';
    v_cam_kodlari := ARRAY['01020', '01002'];
  ELSIF v_urun.kod BETWEEN '10500' AND '10508' THEN
    v_aile := 'sinerji_buzlu';
    v_cam_kodlari := ARRAY['01020', '01008'];
  ELSIF v_urun.kod BETWEEN '10600' AND '10608' THEN
    v_aile := 'konfor';
    v_cam_kodlari := ARRAY['01022', '01002'];
  ELSIF v_urun.kod BETWEEN '10700' AND '10708' THEN
    v_aile := 'konfor_buzlu';
    v_cam_kodlari := ARRAY['01022', '01008'];
  ELSIF v_urun.kod BETWEEN '10800' AND '10804' THEN
    v_aile := 'uclu_klasik';
    v_cam_kodlari := ARRAY['01002', '01002', '01002'];
  ELSIF v_urun.kod BETWEEN '10900' AND '10902' THEN
    v_aile := 'uclu_sinerji';
    v_cam_kodlari := ARRAY['01020', '01002', '01002'];
  ELSIF v_urun.kod BETWEEN '11000' AND '11003' THEN
    v_aile := 'konfor_6';
    v_cam_kodlari := ARRAY['01023', '01004'];
  ELSIF v_urun.kod = '11009' THEN
    v_aile := 'klasik_6';
    v_cam_kodlari := ARRAY['01004', '01004'];
  ELSIF v_urun.kod = '11010' THEN
    v_aile := 'fume_satina';
    v_cam_kodlari := ARRAY['01013', '01012'];
  ELSIF v_urun.kod = '11011' THEN
    v_aile := 'sinerji_renkli';
    v_cam_kodlari := ARRAY['01020', '01009'];
  ELSIF v_urun.kod BETWEEN '20000' AND '20004' THEN
    v_aile := 'uclu_konfor';
    v_cam_kodlari := ARRAY['01022', '01002', '01002'];
  ELSIF v_urun.kod IN ('07122', '11004', '11005', '11006', '11007', '11008')
        OR v_urun.kod = '01016' THEN
    v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
      'kod', 'OZEL_CAM_RECETESI_ELLE_GEREKLI',
      'mesaj', 'Lamine veya temperli katmanlar stok koduyla acikca secilmelidir.'
    ));
  ELSE
    v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
      'kod', 'STANDART_036_AILESI_TANIMSIZ',
      'mesaj', 'Urun adi tahmin icin kullanilmadi; recete elle tanimlanmalidir.'
    ));
  END IF;

  IF jsonb_array_length(v_nedenler) > 0 THEN
    RETURN jsonb_build_object(
      'durum', 'belirsiz',
      'urun_stok_id', v_urun.id,
      'stok_kodu', v_urun.kod,
      'urun_adi', v_urun.ad,
      'katman_yapisi', v_urun.katman_yapisi,
      'nedenler', v_nedenler,
      'kalemler', '[]'::jsonb
    );
  END IF;

  IF cardinality(v_cam_kodlari) <> (cardinality(v_katmanlar) + 1) / 2 THEN
    RETURN jsonb_build_object(
      'durum', 'belirsiz',
      'urun_stok_id', v_urun.id,
      'stok_kodu', v_urun.kod,
      'nedenler', jsonb_build_array(jsonb_build_object(
        'kod', 'CAM_SAYISI_AILEYLE_UYUSMUYOR',
        'mesaj', v_urun.katman_yapisi
      )),
      'kalemler', '[]'::jsonb
    );
  END IF;

  FOR v_pozisyon IN 1..cardinality(v_katmanlar) LOOP
    IF v_pozisyon % 2 = 1 THEN
      v_cam_sirasi := v_cam_sirasi + 1;
      v_bilesen_kodu := v_cam_kodlari[v_cam_sirasi];
      SELECT id INTO v_bilesen_id
      FROM public.stok
      WHERE kod = v_bilesen_kodu AND aktif;

      IF v_bilesen_id IS NULL THEN
        v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
          'kod', 'RECETE_BILESEN_STOGU_EKSIK',
          'stok_kodu', v_bilesen_kodu,
          'rol', 'cam'
        ));
      ELSE
        v_sira := v_sira + 1;
        v_kalemler := v_kalemler || jsonb_build_array(jsonb_build_object(
          'sira_no', v_sira,
          'bilesen_stok_id', v_bilesen_id,
          'stok_kodu', v_bilesen_kodu,
          'rol', 'cam',
          'tuketim_tipi', 'alan',
          'katsayi', 1,
          'bosluk_sirasi', NULL,
          'alternatif_grubu', NULL
        ));
      END IF;
    ELSE
      v_bosluk_sirasi := v_bosluk_sirasi + 1;
      BEGIN
        v_bosluk := v_katmanlar[v_pozisyon]::numeric;
      EXCEPTION WHEN invalid_text_representation THEN
        v_bosluk := NULL;
      END;

      IF v_bosluk IS NULL OR v_bosluk <> trunc(v_bosluk) THEN
        v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
          'kod', 'CITA_OLCUSU_BELIRSIZ',
          'deger', v_katmanlar[v_pozisyon],
          'bosluk_sirasi', v_bosluk_sirasi
        ));
      ELSE
        v_bilesen_kodu := 'CITA-AL-' || lpad(v_bosluk::integer::text, 3, '0');
        v_bilesen_id := NULL;
        SELECT id INTO v_bilesen_id
        FROM public.stok
        WHERE kod = v_bilesen_kodu AND aktif;

        IF v_bilesen_id IS NULL THEN
          v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
            'kod', 'RECETE_BILESEN_STOGU_EKSIK',
            'stok_kodu', v_bilesen_kodu,
            'rol', 'cita',
            'bosluk_sirasi', v_bosluk_sirasi
          ));
        ELSE
          v_sira := v_sira + 1;
          v_kalemler := v_kalemler || jsonb_build_array(jsonb_build_object(
            'sira_no', v_sira,
            'bilesen_stok_id', v_bilesen_id,
            'stok_kodu', v_bilesen_kodu,
            'rol', 'cita',
            'tuketim_tipi', 'cevre',
            'katsayi', 1,
            'bosluk_sirasi', v_bosluk_sirasi,
            'alternatif_grubu', NULL
          ));
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Her bosluk icin cevreyle orantili sarflar. Thiokol katalogda alternatif ve
  -- pasiftir; standart recetede yalniz PU kullanilir.
  FOR v_bosluk_sirasi IN 1..((cardinality(v_katmanlar) - 1) / 2) LOOP
    FOR v_sarf IN
      SELECT *
      FROM (
        VALUES
          ('SARF-BUTIL'::text, 0.007::numeric, NULL::text),
          ('SARF-NEM-ALICI'::text, 0.0375::numeric, NULL::text),
          ('SARF-PU'::text, 0.0725::numeric, 'ikincil_dolgu'::text)
      ) AS sarf(stok_kodu, katsayi, alternatif_grubu)
    LOOP
      v_bilesen_id := NULL;
      SELECT id INTO v_bilesen_id
      FROM public.stok
      WHERE kod = v_sarf.stok_kodu AND aktif;

      IF v_bilesen_id IS NULL THEN
        v_nedenler := v_nedenler || jsonb_build_array(jsonb_build_object(
          'kod', 'RECETE_BILESEN_STOGU_EKSIK',
          'stok_kodu', v_sarf.stok_kodu,
          'rol', 'sarf',
          'bosluk_sirasi', v_bosluk_sirasi
        ));
      ELSE
        v_sira := v_sira + 1;
        v_kalemler := v_kalemler || jsonb_build_array(jsonb_build_object(
          'sira_no', v_sira,
          'bilesen_stok_id', v_bilesen_id,
          'stok_kodu', v_sarf.stok_kodu,
          'rol', 'sarf',
          'tuketim_tipi', 'cevre',
          'katsayi', v_sarf.katsayi,
          'bosluk_sirasi', v_bosluk_sirasi,
          'alternatif_grubu', v_sarf.alternatif_grubu
        ));
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'durum', CASE
      WHEN jsonb_array_length(v_nedenler) = 0 THEN 'hazir'
      ELSE 'eksik'
    END,
    'urun_stok_id', v_urun.id,
    'stok_kodu', v_urun.kod,
    'urun_adi', v_urun.ad,
    'aile', v_aile,
    'katman_yapisi', v_urun.katman_yapisi,
    'nedenler', v_nedenler,
    'kalemler', v_kalemler
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.standart_urun_recetelerini_kur_v3(
  p_baslangic date DEFAULT NULL,
  p_urun_stok_ids uuid[] DEFAULT NULL,
  p_uygula boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_baslangic date := COALESCE(
    p_baslangic,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_urun record;
  v_oneri jsonb;
  v_recete_id uuid;
  v_sonraki_baslangic date;
  v_revision integer;
  v_kurulanlar jsonb := '[]'::jsonb;
  v_mevcutlar jsonb := '[]'::jsonb;
  v_belirsizler jsonb := '[]'::jsonb;
  v_eksikler jsonb := '[]'::jsonb;
  v_oneriler jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;
  IF p_uygula THEN
    PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);
  END IF;

  -- Katalog migration'dan sonra butonla olustugu icin migration-time seed'e
  -- girmeyen yeni malzemelerin ilk fire surumlerini burada idempotent tamamla.
  IF p_uygula THEN
    INSERT INTO public.stok_fire_orani_surmleri (
      stok_id,
      fire_orani,
      gecerlilik_donemi,
      revision_no,
      aciklama,
      olusturan_kullanici_id
    )
    SELECT
      stok.id,
      CASE
        WHEN stok.kod = '01002' THEN 6
        WHEN stok.kod = '01020' THEN 12
        WHEN stok.kod = '01022' THEN 10
        WHEN stok.kod IN ('01008', '01009') THEN 10
        WHEN stok.kategori = 'cita' THEN 5
        ELSE 0
      END,
      daterange(NULL, NULL, '[)'),
      1,
      'Katalog kurulumu baslangic fire orani',
      auth.uid()
    FROM public.stok stok
    WHERE stok.aktif
      AND (
        stok.kategori IN ('cita', 'yan_malzeme')
        OR (
          stok.kategori = 'cam'
          AND (stok.katman_yapisi IS NULL OR stok.kod = '01016')
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.stok_fire_orani_surmleri fire
        WHERE fire.stok_id = stok.id
      );
  END IF;

  FOR v_urun IN
    SELECT stok.id, stok.kod, stok.ad
    FROM public.stok stok
    WHERE stok.aktif
      AND stok.kategori = 'cam'
      AND stok.katman_yapisi IS NOT NULL
      AND (p_urun_stok_ids IS NULL OR stok.id = ANY(p_urun_stok_ids))
    ORDER BY stok.kod, stok.id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.stok_urun_maliyet_recete_surmleri recete
      WHERE recete.urun_stok_id = v_urun.id
        AND recete.gecerlilik_donemi @> v_baslangic
    ) THEN
      v_mevcutlar := v_mevcutlar || jsonb_build_array(jsonb_build_object(
        'stok_id', v_urun.id,
        'stok_kodu', v_urun.kod
      ));
      CONTINUE;
    END IF;

    v_oneri := public.maliyet_recete_onerisi_v3(v_urun.id);
    IF v_oneri ->> 'durum' = 'belirsiz' THEN
      v_belirsizler := v_belirsizler || jsonb_build_array(v_oneri);
      CONTINUE;
    ELSIF v_oneri ->> 'durum' = 'eksik' THEN
      v_eksikler := v_eksikler || jsonb_build_array(v_oneri);
      CONTINUE;
    END IF;

    IF NOT p_uygula THEN
      v_oneriler := v_oneriler || jsonb_build_array(v_oneri);
      CONTINUE;
    END IF;

    SELECT min(lower(gecerlilik_donemi))
    INTO v_sonraki_baslangic
    FROM public.stok_urun_maliyet_recete_surmleri
    WHERE urun_stok_id = v_urun.id
      AND lower(gecerlilik_donemi) > v_baslangic;

    v_revision := COALESCE((
      SELECT max(revision_no) + 1
      FROM public.stok_urun_maliyet_recete_surmleri
      WHERE urun_stok_id = v_urun.id
    ), 1);

    INSERT INTO public.stok_urun_maliyet_recete_surmleri (
      urun_stok_id,
      gecerlilik_donemi,
      revision_no,
      recete_kaynagi,
      aciklama,
      olusturan_kullanici_id
    )
    VALUES (
      v_urun.id,
      daterange(v_baslangic, v_sonraki_baslangic, '[)'),
      v_revision,
      'standart_036',
      '036 katalogundan deterministik acik recete',
      auth.uid()
    )
    RETURNING id INTO v_recete_id;

    INSERT INTO public.stok_urun_maliyet_recete_kalemleri (
      recete_surumu_id,
      sira_no,
      bilesen_stok_id,
      rol,
      tuketim_tipi,
      katsayi,
      bosluk_sirasi,
      alternatif_grubu
    )
    SELECT
      v_recete_id,
      kalem.sira_no,
      kalem.bilesen_stok_id,
      kalem.rol,
      kalem.tuketim_tipi,
      kalem.katsayi,
      kalem.bosluk_sirasi,
      kalem.alternatif_grubu
    FROM jsonb_to_recordset(v_oneri -> 'kalemler') AS kalem(
      sira_no integer,
      bilesen_stok_id uuid,
      stok_kodu text,
      rol text,
      tuketim_tipi text,
      katsayi numeric,
      bosluk_sirasi integer,
      alternatif_grubu text
    );

    v_kurulanlar := v_kurulanlar || jsonb_build_array(jsonb_build_object(
      'stok_id', v_urun.id,
      'stok_kodu', v_urun.kod,
      'recete_surumu_id', v_recete_id,
      'kalem_sayisi', jsonb_array_length(v_oneri -> 'kalemler')
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'basarili', true,
    'uygulandi', p_uygula,
    'baslangic', v_baslangic,
    'kurulanlar', v_kurulanlar,
    'mevcutlar', v_mevcutlar,
    'oneriler', v_oneriler,
    'belirsizler', v_belirsizler,
    'eksikler', v_eksikler
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Fiyat secim politikasi RPC'leri
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stok_maliyet_fiyat_secimini_ac_internal_v3(
  p_stok_id uuid,
  p_fiyat_id uuid,
  p_secim_seviyesi text,
  p_politika_surumu_id uuid,
  p_baslangic timestamptz,
  p_bitis timestamptz,
  p_gerekce text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fiyat public.stok_alis_fiyatlari%ROWTYPE;
  v_mevcut public.stok_maliyet_fiyat_secim_surmleri%ROWTYPE;
  v_sonraki_baslangic timestamptz;
  v_teklif_bitis timestamptz;
  v_bitis timestamptz := p_bitis;
  v_secim_id uuid;
BEGIN
  IF p_baslangic IS NULL
     OR p_secim_seviyesi NOT IN ('toplu', 'stok_override')
     OR length(btrim(COALESCE(p_gerekce, ''))) < 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MALIYET_FIYAT_SECIM_BILGILERI_GECERSIZ';
  END IF;

  SELECT *
  INTO v_fiyat
  FROM public.stok_alis_fiyatlari
  WHERE id = p_fiyat_id
    AND stok_id = p_stok_id
    AND durum IN ('dogrulanmis', 'duzeltme')
    AND kaynak_turu <> 'legacy_unverified';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'SECILEBILIR_DOGRULANMIS_FIYAT_GEREKLI';
  END IF;

  IF NOT (
    v_fiyat.teklif_gecerlilik_donemi @>
      (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'FIYAT_TEKLIFI_BASLANGIC_TARIHINDE_GECERLI_DEGIL';
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
      MESSAGE = 'MALIYET_FIYAT_SECIM_DONEMI_GECERSIZ';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'maliyet_fiyat_secim_v3:' || p_stok_id::text || ':' || p_secim_seviyesi,
    0
  ));

  SELECT *
  INTO v_mevcut
  FROM public.stok_maliyet_fiyat_secim_surmleri
  WHERE stok_id = p_stok_id
    AND secim_seviyesi = p_secim_seviyesi
    AND gecerlilik_donemi @> p_baslangic
  FOR UPDATE;

  IF FOUND THEN
    IF lower(v_mevcut.gecerlilik_donemi) = p_baslangic THEN
      IF v_mevcut.fiyat_id = p_fiyat_id
         AND v_mevcut.politika_surumu_id IS NOT DISTINCT FROM p_politika_surumu_id THEN
        RETURN v_mevcut.id;
      END IF;
      RAISE EXCEPTION USING
        ERRCODE = '23P01',
        MESSAGE = 'AYNI_BASLANGICTA_FARKLI_MALIYET_FIYAT_SECIMI_VAR';
    END IF;

    PERFORM set_config('app.maliyet_v3_surum_kapatma', 'true', true);
    UPDATE public.stok_maliyet_fiyat_secim_surmleri
    SET gecerlilik_donemi =
      tstzrange(lower(gecerlilik_donemi), p_baslangic, '[)')
    WHERE id = v_mevcut.id;
  END IF;

  SELECT min(lower(gecerlilik_donemi))
  INTO v_sonraki_baslangic
  FROM public.stok_maliyet_fiyat_secim_surmleri
  WHERE stok_id = p_stok_id
    AND secim_seviyesi = p_secim_seviyesi
    AND lower(gecerlilik_donemi) > p_baslangic;

  v_bitis := CASE
    WHEN v_bitis IS NULL THEN v_sonraki_baslangic
    WHEN v_sonraki_baslangic IS NULL THEN v_bitis
    ELSE LEAST(v_bitis, v_sonraki_baslangic)
  END;

  INSERT INTO public.stok_maliyet_fiyat_secim_surmleri (
    stok_id,
    fiyat_id,
    secim_seviyesi,
    politika_surumu_id,
    gecerlilik_donemi,
    gerekce,
    olusturan_kullanici_id
  )
  VALUES (
    p_stok_id,
    p_fiyat_id,
    p_secim_seviyesi,
    p_politika_surumu_id,
    tstzrange(p_baslangic, v_bitis, '[)'),
    btrim(p_gerekce),
    auth.uid()
  )
  RETURNING id INTO v_secim_id;

  RETURN v_secim_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_toplu_politika_uygula_v3(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_kapsam text := lower(COALESCE(NULLIF(p_payload ->> 'kapsam', ''), 'cam'));
  v_tedarikci_id uuid := NULLIF(p_payload ->> 'tedarikci_id', '')::uuid;
  v_varyant text := lower(COALESCE(NULLIF(p_payload ->> 'varyant', ''), 'genel'));
  v_genel_fallback boolean := COALESCE(
    NULLIF(p_payload ->> 'genel_fallback', '')::boolean,
    false
  );
  v_vade_gunu integer := COALESCE(
    NULLIF(p_payload ->> 'vade_gunu', '')::integer,
    0
  );
  v_baslangic timestamptz := COALESCE(
    NULLIF(p_payload ->> 'baslangic', '')::timestamptz,
    clock_timestamp()
  );
  v_bitis timestamptz := NULLIF(p_payload ->> 'bitis', '')::timestamptz;
  v_gerekce text := btrim(COALESCE(p_payload ->> 'gerekce', ''));
  v_stok_ids uuid[];
  v_politika_id uuid;
  v_stok record;
  v_fiyat record;
  v_secim_id uuid;
  v_secilenler jsonb := '[]'::jsonb;
  v_eksikler jsonb := '[]'::jsonb;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);

  IF v_kapsam NOT IN ('cam', 'cita', 'yan_malzeme')
     OR v_vade_gunu < 0
     OR v_vade_gunu > 3650
     OR length(v_gerekce) < 5
     OR (v_bitis IS NOT NULL AND v_bitis <= v_baslangic) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TOPLU_FIYAT_POLITIKASI_GECERSIZ';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cari
    WHERE id = v_tedarikci_id
      AND tipi = 'tedarikci'
      AND aktif
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'AKTIF_TEDARIKCI_BULUNAMADI';
  END IF;

  IF jsonb_typeof(p_payload -> 'stok_ids') = 'array' THEN
    SELECT array_agg(value::uuid ORDER BY value::uuid)
    INTO v_stok_ids
    FROM jsonb_array_elements_text(p_payload -> 'stok_ids');
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'stok_maliyet_toplu_politika_uygula_v3',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_maliyet_toplu_politika_uygula_v3',
    p_idempotency_key,
    v_gerekce,
    COALESCE(p_payload ->> 'kaynak_ekran', 'maliyet_v3')
  );

  INSERT INTO public.stok_maliyet_fiyat_politika_surmleri (
    kapsam,
    tedarikci_id,
    fiyat_varyanti,
    genel_fallback,
    vade_gunu,
    gecerlilik_donemi,
    gerekce,
    idempotency_id,
    olusturan_kullanici_id
  )
  VALUES (
    CASE WHEN v_stok_ids IS NULL THEN v_kapsam ELSE 'stok_listesi' END,
    v_tedarikci_id,
    v_varyant,
    v_genel_fallback,
    v_vade_gunu,
    tstzrange(v_baslangic, v_bitis, '[)'),
    v_gerekce,
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_politika_id;

  FOR v_stok IN
    SELECT stok.id, stok.kod, stok.ad, stok.kategori
    FROM public.stok stok
    WHERE stok.aktif
      AND (
        (v_stok_ids IS NOT NULL AND stok.id = ANY(v_stok_ids))
        OR
        (v_stok_ids IS NULL AND stok.kategori = v_kapsam)
      )
      AND (
        v_stok_ids IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.stok_fire_orani_surmleri fire
          WHERE fire.stok_id = stok.id
            AND fire.gecerlilik_donemi @>
              (v_baslangic AT TIME ZONE 'Europe/Istanbul')::date
        )
      )
    ORDER BY stok.kod, stok.id
  LOOP
    SELECT
      fiyat.id,
      fiyat.fiyat_varyanti,
      fiyat.birim_fiyat,
      fiyat.vade_gunu
    INTO v_fiyat
    FROM public.stok_alis_fiyatlari fiyat
    WHERE fiyat.stok_id = v_stok.id
      AND fiyat.tedarikci_id = v_tedarikci_id
      AND fiyat.durum IN ('dogrulanmis', 'duzeltme')
      AND fiyat.kaynak_turu <> 'legacy_unverified'
      AND fiyat.vade_gunu = v_vade_gunu
      AND (
        fiyat.fiyat_varyanti = v_varyant
        OR (
          v_genel_fallback
          AND v_varyant <> 'genel'
          AND fiyat.fiyat_varyanti = 'genel'
        )
      )
      AND fiyat.teklif_gecerlilik_donemi @>
        (v_baslangic AT TIME ZONE 'Europe/Istanbul')::date
      AND fiyat.fiyat_tarihi <= v_baslangic
    ORDER BY
      CASE WHEN fiyat.fiyat_varyanti = v_varyant THEN 0 ELSE 1 END,
      fiyat.fiyat_tarihi DESC,
      fiyat.created_at DESC,
      fiyat.id DESC
    LIMIT 1;

    IF v_fiyat.id IS NULL THEN
      v_eksikler := v_eksikler || jsonb_build_array(jsonb_build_object(
        'stok_id', v_stok.id,
        'stok_kodu', v_stok.kod,
        'stok_adi', v_stok.ad,
        'kod', 'POLITIKAYA_UYGUN_FIYAT_EKSIK',
        'tedarikci_id', v_tedarikci_id,
        'istenen_varyant', v_varyant,
        'genel_fallback', v_genel_fallback,
        'vade_gunu', v_vade_gunu
      ));
      CONTINUE;
    END IF;

    v_secim_id := public.stok_maliyet_fiyat_secimini_ac_internal_v3(
      v_stok.id,
      v_fiyat.id,
      'toplu',
      v_politika_id,
      v_baslangic,
      v_bitis,
      v_gerekce
    );
    v_secilenler := v_secilenler || jsonb_build_array(jsonb_build_object(
      'stok_id', v_stok.id,
      'stok_kodu', v_stok.kod,
      'fiyat_id', v_fiyat.id,
      'secim_id', v_secim_id,
      'istenen_varyant', v_varyant,
      'secilen_varyant', v_fiyat.fiyat_varyanti,
      'vade_gunu', v_fiyat.vade_gunu,
      'birim_fiyat', v_fiyat.birim_fiyat
    ));
  END LOOP;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'politika_surumu_id', v_politika_id,
    'kapsam', v_kapsam,
    'tedarikci_id', v_tedarikci_id,
    'istenen_varyant', v_varyant,
    'genel_fallback', v_genel_fallback,
    'vade_gunu', v_vade_gunu,
    'secilen_adet', jsonb_array_length(v_secilenler),
    'eksik_adet', jsonb_array_length(v_eksikler),
    'secilenler', v_secilenler,
    'eksikler', v_eksikler
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_stok_override_uygula_v3(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_stok_id uuid := NULLIF(p_payload ->> 'stok_id', '')::uuid;
  v_fiyat_id uuid := NULLIF(p_payload ->> 'fiyat_id', '')::uuid;
  v_baslangic timestamptz := COALESCE(
    NULLIF(p_payload ->> 'baslangic', '')::timestamptz,
    clock_timestamp()
  );
  v_bitis timestamptz := NULLIF(p_payload ->> 'bitis', '')::timestamptz;
  v_gerekce text := btrim(COALESCE(p_payload ->> 'gerekce', ''));
  v_secim_id uuid;
  v_yanit jsonb;
BEGIN
  PERFORM public.stok_maliyet_yazma_yetkisini_dogrula('manage', true);

  IF length(v_gerekce) < 5
     OR (v_bitis IS NOT NULL AND v_bitis <= v_baslangic) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'STOK_FIYAT_OVERRIDE_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'stok_maliyet_stok_override_uygula_v3',
    p_idempotency_key,
    p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := (v_idempotency ->> 'idempotency_id')::uuid;

  PERFORM public.stok_maliyet_audit_baglamini_ayarla(
    'stok_maliyet_stok_override_uygula_v3',
    p_idempotency_key,
    v_gerekce,
    COALESCE(p_payload ->> 'kaynak_ekran', 'maliyet_v3')
  );

  v_secim_id := public.stok_maliyet_fiyat_secimini_ac_internal_v3(
    v_stok_id,
    v_fiyat_id,
    'stok_override',
    NULL,
    v_baslangic,
    v_bitis,
    v_gerekce
  );

  v_yanit := jsonb_build_object(
    'basarili', true,
    'stok_id', v_stok_id,
    'fiyat_id', v_fiyat_id,
    'secim_id', v_secim_id,
    'secim_seviyesi', 'stok_override',
    'gecerlilik_baslangici', v_baslangic,
    'gecerlilik_bitisi', v_bitis
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_fiyat_secimini_coz_v3(
  p_stok_id uuid,
  p_an timestamptz DEFAULT NULL
)
RETURNS TABLE (
  secim_id uuid,
  secim_seviyesi text,
  politika_surumu_id uuid,
  stok_id uuid,
  fiyat_id uuid,
  tedarikci_id uuid,
  tedarikci_adi text,
  fiyat_varyanti text,
  marka text,
  vade_gunu integer,
  vade_turu text,
  birim_fiyat numeric,
  para_birimi text,
  fiyat_birimi text,
  stok_ana_birimi text,
  stok_birim_fiyati numeric,
  fiyat_tarihi timestamptz,
  secim_baslangici timestamptz,
  secim_bitisi timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_an timestamptz := COALESCE(p_an, clock_timestamp());
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  RETURN QUERY
  SELECT
    secim.id,
    secim.secim_seviyesi,
    secim.politika_surumu_id,
    secim.stok_id,
    fiyat.id,
    fiyat.tedarikci_id,
    tedarikci.ad,
    fiyat.fiyat_varyanti,
    fiyat.marka,
    fiyat.vade_gunu,
    fiyat.vade_turu,
    fiyat.birim_fiyat,
    fiyat.para_birimi::text,
    fiyat.fiyat_birimi,
    fiyat.stok_ana_birimi,
    round(
      fiyat.birim_fiyat
      / (COALESCE(fiyat.paket_miktari, 1) * fiyat.donusum_katsayisi),
      10
    ),
    fiyat.fiyat_tarihi,
    lower(secim.gecerlilik_donemi),
    CASE WHEN upper_inf(secim.gecerlilik_donemi)
      THEN NULL ELSE upper(secim.gecerlilik_donemi) END
  FROM public.stok_maliyet_fiyat_secim_surmleri secim
  JOIN public.stok_alis_fiyatlari fiyat ON fiyat.id = secim.fiyat_id
  JOIN public.cari tedarikci ON tedarikci.id = fiyat.tedarikci_id
  WHERE secim.stok_id = p_stok_id
    AND secim.gecerlilik_donemi @> v_an
    AND fiyat.teklif_gecerlilik_donemi @>
      (v_an AT TIME ZONE 'Europe/Istanbul')::date
  ORDER BY
    CASE secim.secim_seviyesi WHEN 'stok_override' THEN 0 ELSE 1 END,
    lower(secim.gecerlilik_donemi) DESC,
    secim.created_at DESC,
    secim.id DESC
  LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- Acik receteli maliyet motoru ve okuma panelleri
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.urun_maliyeti_detayli_hesapla_v3(
  p_stok_id uuid,
  p_tarih date DEFAULT NULL,
  p_en_mm numeric DEFAULT NULL,
  p_boy_mm numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_hesaplama_surumu constant text := 'acik-recete-v3';
  v_tarih date := COALESCE(
    p_tarih,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_an timestamptz :=
    v_tarih::timestamp AT TIME ZONE 'Europe/Istanbul';
  v_stok public.stok%ROWTYPE;
  v_recete public.stok_urun_maliyet_recete_surmleri%ROWTYPE;
  v_ref_en numeric;
  v_ref_boy numeric;
  v_en numeric;
  v_boy numeric;
  v_alan numeric;
  v_cevre numeric;
  v_kalem record;
  v_fire record;
  v_kaynak jsonb;
  v_firesiz_miktar numeric;
  v_miktar numeric;
  v_birim_maliyet numeric;
  v_baz_maliyet numeric;
  v_toplam numeric;
  v_fire_etkisi numeric;
  v_cam_toplam numeric := 0;
  v_cita_toplam numeric := 0;
  v_sarf_toplam numeric := 0;
  v_fire_toplam numeric := 0;
  v_bilesenler jsonb := '[]'::jsonb;
  v_hatalar jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT *
  INTO v_stok
  FROM public.stok
  WHERE id = p_stok_id
    AND aktif
    AND kategori = 'cam';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'AKTIF_URUN_STOGU_BULUNAMADI';
  END IF;

  SELECT *
  INTO v_recete
  FROM public.stok_urun_maliyet_recete_surmleri
  WHERE urun_stok_id = p_stok_id
    AND gecerlilik_donemi @> v_tarih
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'gecerli', false,
      'stok_id', p_stok_id,
      'stok_kodu', v_stok.kod,
      'urun_adi', v_stok.ad,
      'hesaplama_tarihi', v_tarih,
      'hesaplama_surumu', c_hesaplama_surumu,
      'bilesenler', '[]'::jsonb,
      'hatalar', jsonb_build_array(jsonb_build_object(
        'kod', 'AKTIF_RECETE_EKSIK',
        'mesaj', 'Urun icin sorgu tarihinde acik maliyet recetesi yok.'
      ))
    );
  END IF;

  SELECT ayar.referans_en_mm, ayar.referans_boy_mm
  INTO v_ref_en, v_ref_boy
  FROM public.maliyet_hesaplama_ayar_surmleri ayar
  WHERE ayar.gecerli_baslangic <= v_tarih
  ORDER BY
    ayar.gecerli_baslangic DESC,
    ayar.created_at DESC,
    ayar.id DESC
  LIMIT 1;

  v_en := COALESCE(p_en_mm, v_ref_en);
  v_boy := COALESCE(p_boy_mm, v_ref_boy);
  IF v_en IS NULL OR v_boy IS NULL OR v_en <= 0 OR v_boy <= 0 THEN
    RETURN jsonb_build_object(
      'gecerli', false,
      'stok_id', p_stok_id,
      'stok_kodu', v_stok.kod,
      'urun_adi', v_stok.ad,
      'recete_surumu_id', v_recete.id,
      'hesaplama_tarihi', v_tarih,
      'hesaplama_surumu', c_hesaplama_surumu,
      'bilesenler', '[]'::jsonb,
      'hatalar', jsonb_build_array(jsonb_build_object(
        'kod', 'HESAP_OLCUSU_EKSIK',
        'mesaj', 'En ve boy pozitif milimetre olarak verilmelidir.'
      ))
    );
  END IF;

  v_alan := (v_en / 1000) * (v_boy / 1000);
  v_cevre := 2 * ((v_en / 1000) + (v_boy / 1000));

  IF EXISTS (
    SELECT 1
    FROM public.stok_urun_maliyet_recete_kalemleri pu
    JOIN public.stok pu_stok ON pu_stok.id = pu.bilesen_stok_id
    JOIN public.stok_urun_maliyet_recete_kalemleri thiokol
      ON thiokol.recete_surumu_id = pu.recete_surumu_id
     AND COALESCE(thiokol.bosluk_sirasi, 0) = COALESCE(pu.bosluk_sirasi, 0)
    JOIN public.stok thiokol_stok ON thiokol_stok.id = thiokol.bilesen_stok_id
    WHERE pu.recete_surumu_id = v_recete.id
      AND pu_stok.kod = 'SARF-PU'
      AND thiokol_stok.kod = 'SARF-THIOKOL'
  ) THEN
    RETURN jsonb_build_object(
      'gecerli', false,
      'stok_id', p_stok_id,
      'stok_kodu', v_stok.kod,
      'recete_surumu_id', v_recete.id,
      'hesaplama_tarihi', v_tarih,
      'hesaplama_surumu', c_hesaplama_surumu,
      'bilesenler', '[]'::jsonb,
      'hatalar', jsonb_build_array(jsonb_build_object(
        'kod', 'RECETE_IKINCIL_DOLGU_CAKISMASI',
        'mesaj', 'PU ve Thiokol ayni boslukta birlikte kullanilamaz.'
      ))
    );
  END IF;

  FOR v_kalem IN
    SELECT
      kalem.*,
      bilesen.kod AS stok_kodu,
      bilesen.ad AS stok_adi,
      bilesen.birim AS stok_birimi
    FROM public.stok_urun_maliyet_recete_kalemleri kalem
    JOIN public.stok bilesen
      ON bilesen.id = kalem.bilesen_stok_id
     AND bilesen.aktif
    WHERE kalem.recete_surumu_id = v_recete.id
    ORDER BY kalem.sira_no, kalem.id
  LOOP
    SELECT fire.id, fire.fire_orani
    INTO v_fire
    FROM public.stok_fire_orani_surmleri fire
    WHERE fire.stok_id = v_kalem.bilesen_stok_id
      AND fire.gecerlilik_donemi @> v_tarih
    LIMIT 1;

    IF v_fire.id IS NULL THEN
      v_hatalar := v_hatalar || jsonb_build_array(jsonb_build_object(
        'kod', 'STOK_FIRE_ORANI_EKSIK',
        'stok_id', v_kalem.bilesen_stok_id,
        'stok_kodu', v_kalem.stok_kodu,
        'sira_no', v_kalem.sira_no
      ));
      CONTINUE;
    END IF;

    v_kaynak := NULL;
    SELECT to_jsonb(kaynak)
    INTO v_kaynak
    FROM public.stok_maliyet_fiyat_secimini_coz_v3(
      v_kalem.bilesen_stok_id,
      v_an
    ) kaynak;

    IF v_kaynak IS NULL OR v_kaynak ->> 'fiyat_id' IS NULL THEN
      v_hatalar := v_hatalar || jsonb_build_array(jsonb_build_object(
        'kod', 'AKTIF_FIYAT_SECIMI_EKSIK',
        'stok_id', v_kalem.bilesen_stok_id,
        'stok_kodu', v_kalem.stok_kodu,
        'sira_no', v_kalem.sira_no
      ));
      CONTINUE;
    END IF;

    IF v_kaynak ->> 'para_birimi' <> 'TRY' THEN
      v_hatalar := v_hatalar || jsonb_build_array(jsonb_build_object(
        'kod', 'V3_PARA_BIRIMI_DESTEKLENMIYOR',
        'stok_id', v_kalem.bilesen_stok_id,
        'fiyat_id', v_kaynak -> 'fiyat_id'
      ));
      CONTINUE;
    END IF;

    v_firesiz_miktar := CASE v_kalem.tuketim_tipi
      WHEN 'alan' THEN v_alan * v_kalem.katsayi
      WHEN 'cevre' THEN v_cevre * v_kalem.katsayi
      WHEN 'adet' THEN v_kalem.katsayi
    END;
    v_miktar := v_firesiz_miktar * (1 + v_fire.fire_orani / 100);
    v_birim_maliyet := (v_kaynak ->> 'stok_birim_fiyati')::numeric;
    v_baz_maliyet := v_firesiz_miktar * v_birim_maliyet;
    v_toplam := v_miktar * v_birim_maliyet;
    v_fire_etkisi := v_toplam - v_baz_maliyet;

    IF v_kalem.rol = 'cam' THEN
      v_cam_toplam := v_cam_toplam + v_toplam;
    ELSIF v_kalem.rol = 'cita' THEN
      v_cita_toplam := v_cita_toplam + v_toplam;
    ELSE
      v_sarf_toplam := v_sarf_toplam + v_toplam;
    END IF;
    v_fire_toplam := v_fire_toplam + v_fire_etkisi;

    v_bilesenler := v_bilesenler || jsonb_build_array(jsonb_build_object(
      'sira_no', v_kalem.sira_no,
      'rol', v_kalem.rol,
      'stok_id', v_kalem.bilesen_stok_id,
      'stok_kodu', v_kalem.stok_kodu,
      'stok_adi', v_kalem.stok_adi,
      'tuketim_tipi', v_kalem.tuketim_tipi,
      'katsayi', v_kalem.katsayi,
      'bosluk_sirasi', v_kalem.bosluk_sirasi,
      'firesiz_miktar', round(v_firesiz_miktar, 8),
      'fire_orani', v_fire.fire_orani,
      'miktar', round(v_miktar, 8),
      'birim', v_kalem.stok_birimi,
      'birim_maliyet_try', round(v_birim_maliyet, 8),
      'baz_maliyet', round(v_baz_maliyet, 6),
      'fire_etkisi', round(v_fire_etkisi, 6),
      'toplam_maliyet', round(v_toplam, 6),
      'fire_surumu_id', v_fire.id,
      'fiyat_secim_id', v_kaynak -> 'secim_id',
      'secim_seviyesi', v_kaynak -> 'secim_seviyesi',
      'politika_surumu_id', v_kaynak -> 'politika_surumu_id',
      'fiyat_id', v_kaynak -> 'fiyat_id',
      'tedarikci_id', v_kaynak -> 'tedarikci_id',
      'tedarikci', v_kaynak -> 'tedarikci_adi',
      'fiyat_varyanti', v_kaynak -> 'fiyat_varyanti',
      'vade_gunu', v_kaynak -> 'vade_gunu',
      'marka', v_kaynak -> 'marka'
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'gecerli', jsonb_array_length(v_hatalar) = 0,
    'stok_id', v_stok.id,
    'stok_kodu', v_stok.kod,
    'urun_adi', v_stok.ad,
    'urun_grubu', v_stok.grup,
    'katman_yapisi', v_stok.katman_yapisi,
    'hesaplama_tarihi', v_tarih,
    'hesaplama_surumu', c_hesaplama_surumu,
    'recete_surumu_id', v_recete.id,
    'recete_revision_no', v_recete.revision_no,
    'referans_en_mm', v_en,
    'referans_boy_mm', v_boy,
    'referans_alan_m2', round(v_alan, 6),
    'referans_cevre_m', round(v_cevre, 6),
    'para_birimi', 'TRY',
    'cam_maliyeti', round(v_cam_toplam, 2),
    'cita_maliyeti', round(v_cita_toplam, 2),
    'sarf_maliyeti', round(v_sarf_toplam, 2),
    'fire_etkisi', round(v_fire_toplam, 2),
    'baz_maliyet', round(
      v_cam_toplam + v_cita_toplam + v_sarf_toplam - v_fire_toplam,
      2
    ),
    'toplam_maliyet', round(v_cam_toplam + v_cita_toplam + v_sarf_toplam, 2),
    'm2_maliyet', CASE WHEN v_alan = 0 THEN 0 ELSE round(
      (v_cam_toplam + v_cita_toplam + v_sarf_toplam) / v_alan,
      2
    ) END,
    'bilesenler', v_bilesenler,
    'hatalar', v_hatalar,
    'eksikler', v_hatalar
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.urun_maliyetlerini_hesapla_v3(
  p_tarih date DEFAULT NULL,
  p_en_mm numeric DEFAULT NULL,
  p_boy_mm numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tarih date := COALESCE(
    p_tarih,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_ref_en numeric;
  v_ref_boy numeric;
  v_en numeric;
  v_boy numeric;
  v_alan numeric;
  v_cevre numeric;
  v_urun record;
  v_sonuc jsonb;
  v_urunler jsonb := '[]'::jsonb;
  v_gecerli integer := 0;
  v_toplam integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT ayar.referans_en_mm, ayar.referans_boy_mm
  INTO v_ref_en, v_ref_boy
  FROM public.maliyet_hesaplama_ayar_surmleri ayar
  WHERE ayar.gecerli_baslangic <= v_tarih
  ORDER BY
    ayar.gecerli_baslangic DESC,
    ayar.created_at DESC,
    ayar.id DESC
  LIMIT 1;

  v_en := COALESCE(p_en_mm, v_ref_en);
  v_boy := COALESCE(p_boy_mm, v_ref_boy);
  IF v_en IS NOT NULL AND v_boy IS NOT NULL AND v_en > 0 AND v_boy > 0 THEN
    v_alan := (v_en / 1000) * (v_boy / 1000);
    v_cevre := 2 * ((v_en / 1000) + (v_boy / 1000));
  END IF;

  FOR v_urun IN
    SELECT stok.id
    FROM public.stok_urun_maliyet_recete_surmleri recete
    JOIN public.stok stok
      ON stok.id = recete.urun_stok_id
     AND stok.aktif
    WHERE recete.gecerlilik_donemi @> v_tarih
    ORDER BY stok.kod, stok.id
  LOOP
    v_sonuc := public.urun_maliyeti_detayli_hesapla_v3(
      v_urun.id,
      v_tarih,
      v_en,
      v_boy
    );
    v_urunler := v_urunler || jsonb_build_array(v_sonuc);
    v_toplam := v_toplam + 1;
    IF COALESCE((v_sonuc ->> 'gecerli')::boolean, false) THEN
      v_gecerli := v_gecerli + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'gecerli', v_toplam > 0 AND v_gecerli = v_toplam,
    'hesaplama_surumu', 'acik-recete-v3',
    'hesaplama_tarihi', v_tarih,
    'para_birimi', 'TRY',
    'referans_en_mm', v_en,
    'referans_boy_mm', v_boy,
    'referans_alan_m2', CASE
      WHEN v_alan IS NULL THEN NULL ELSE round(v_alan, 6)
    END,
    'referans_cevre_m', CASE
      WHEN v_cevre IS NULL THEN NULL ELSE round(v_cevre, 6)
    END,
    'urun_sayisi', v_toplam,
    'gecerli_urun_sayisi', v_gecerli,
    'eksik_urun_sayisi', v_toplam - v_gecerli,
    'urunler', v_urunler
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_kaynak_paneli_getir_v3(
  p_tarih date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tarih date := COALESCE(
    p_tarih,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_an timestamptz :=
    v_tarih::timestamp AT TIME ZONE 'Europe/Istanbul';
  v_stok record;
  v_aktif jsonb;
  v_alternatifler jsonb;
  v_stoklar jsonb := '[]'::jsonb;
  v_eksikler jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  FOR v_stok IN
    SELECT stok.id, stok.kod, stok.ad, stok.kategori, stok.birim
    FROM public.stok stok
    WHERE stok.aktif
      AND (
        EXISTS (
          SELECT 1
          FROM public.stok_fire_orani_surmleri fire
          WHERE fire.stok_id = stok.id
            AND fire.gecerlilik_donemi @> v_tarih
        )
        OR EXISTS (
          SELECT 1
          FROM public.stok_alis_fiyatlari fiyat
          WHERE fiyat.stok_id = stok.id
            AND fiyat.durum IN ('dogrulanmis', 'duzeltme')
        )
      )
    ORDER BY stok.kod, stok.id
  LOOP
    v_aktif := NULL;
    SELECT to_jsonb(kaynak)
    INTO v_aktif
    FROM public.stok_maliyet_fiyat_secimini_coz_v3(v_stok.id, v_an) kaynak;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fiyat_id', fiyat.id,
      'tedarikci_id', fiyat.tedarikci_id,
      'tedarikci', tedarikci.ad,
      'varyant', fiyat.fiyat_varyanti,
      'marka', fiyat.marka,
      'vade_gunu', fiyat.vade_gunu,
      'vade_turu', fiyat.vade_turu,
      'birim_fiyat', fiyat.birim_fiyat,
      'para_birimi', fiyat.para_birimi,
      'fiyat_birimi', fiyat.fiyat_birimi,
      'fiyat_tarihi', fiyat.fiyat_tarihi,
      'gecerlilik_baslangici', lower(fiyat.teklif_gecerlilik_donemi),
      'gecerlilik_bitisi', CASE
        WHEN upper_inf(fiyat.teklif_gecerlilik_donemi) THEN NULL
        ELSE upper(fiyat.teklif_gecerlilik_donemi)
      END,
      'aktif', fiyat.id = NULLIF(v_aktif ->> 'fiyat_id', '')::uuid
    ) ORDER BY
      tedarikci.ad,
      fiyat.vade_gunu,
      fiyat.fiyat_varyanti,
      fiyat.fiyat_tarihi DESC,
      fiyat.id), '[]'::jsonb)
    INTO v_alternatifler
    FROM public.stok_alis_fiyatlari fiyat
    JOIN public.cari tedarikci ON tedarikci.id = fiyat.tedarikci_id
    WHERE fiyat.stok_id = v_stok.id
      AND fiyat.durum IN ('dogrulanmis', 'duzeltme')
      AND fiyat.kaynak_turu <> 'legacy_unverified'
      AND fiyat.teklif_gecerlilik_donemi @> v_tarih;

    v_stoklar := v_stoklar || jsonb_build_array(jsonb_build_object(
      'stok_id', v_stok.id,
      'stok_kodu', v_stok.kod,
      'stok_adi', v_stok.ad,
      'kategori', v_stok.kategori,
      'birim', v_stok.birim,
      'aktif_fiyat', v_aktif,
      'toplu_politika', (
        SELECT jsonb_build_object(
          'politika_surumu_id', politika.id,
          'kapsam', politika.kapsam,
          'tedarikci_id', politika.tedarikci_id,
          'istenen_varyant', politika.fiyat_varyanti,
          'genel_fallback', politika.genel_fallback,
          'vade_gunu', politika.vade_gunu,
          'gecerlilik_baslangici', lower(politika.gecerlilik_donemi),
          'gecerlilik_bitisi', CASE
            WHEN upper_inf(politika.gecerlilik_donemi) THEN NULL
            ELSE upper(politika.gecerlilik_donemi)
          END,
          'gerekce', politika.gerekce
        )
        FROM public.stok_maliyet_fiyat_politika_surmleri politika
        WHERE politika.id =
          NULLIF(v_aktif ->> 'politika_surumu_id', '')::uuid
      ),
      'alternatifler', v_alternatifler
    ));

    IF v_aktif IS NULL THEN
      v_eksikler := v_eksikler || jsonb_build_array(jsonb_build_object(
        'stok_id', v_stok.id,
        'stok_kodu', v_stok.kod,
        'stok_adi', v_stok.ad,
        'kod', 'AKTIF_FIYAT_SECIMI_EKSIK'
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'tarih', v_tarih,
    'stoklar', v_stoklar,
    'eksikler', v_eksikler,
    'stok_sayisi', jsonb_array_length(v_stoklar),
    'eksik_sayisi', jsonb_array_length(v_eksikler)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_katalogu_getir_v3(
  p_tarih date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tarih date := COALESCE(
    p_tarih,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_legacy jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  -- Eski yonetim ekraninin profiller/fiyatlar/ayarlar/tedarikciler/hesap
  -- alanlarini koru; v3 alanlarini ayni dokumana ekle.
  v_legacy := public.stok_maliyet_katalogu_getir(v_tarih);

  RETURN v_legacy || jsonb_build_object(
    'tarih', v_tarih,
    'fireler', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fire_surumu_id', fire.id,
        'stok_id', stok.id,
        'stok_kodu', stok.kod,
        'stok_adi', stok.ad,
        'kategori', stok.kategori,
        'fire_orani', fire.fire_orani,
        'revision_no', fire.revision_no,
        'gecerlilik_baslangici', lower(fire.gecerlilik_donemi),
        'gecerlilik_bitisi', CASE
          WHEN upper_inf(fire.gecerlilik_donemi) THEN NULL
          ELSE upper(fire.gecerlilik_donemi)
        END
      ) ORDER BY stok.kod, stok.id)
      FROM public.stok_fire_orani_surmleri fire
      JOIN public.stok stok ON stok.id = fire.stok_id AND stok.aktif
      WHERE fire.gecerlilik_donemi @> v_tarih
    ), '[]'::jsonb),
    'receteler', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'urun_stok_id', stok.id,
        'stok_kodu', stok.kod,
        'urun_adi', stok.ad,
        'katman_yapisi', stok.katman_yapisi,
        'durum', CASE WHEN recete.id IS NULL THEN 'eksik' ELSE 'hazir' END,
        'recete_surumu_id', recete.id,
        'revision_no', recete.revision_no,
        'recete_kaynagi', recete.recete_kaynagi,
        'kalem_sayisi', COALESCE((
          SELECT count(*)
          FROM public.stok_urun_maliyet_recete_kalemleri kalem
          WHERE kalem.recete_surumu_id = recete.id
        ), 0)
      ) ORDER BY stok.kod, stok.id)
      FROM public.stok stok
      LEFT JOIN public.stok_urun_maliyet_recete_surmleri recete
        ON recete.urun_stok_id = stok.id
       AND recete.gecerlilik_donemi @> v_tarih
      WHERE stok.aktif
        AND stok.kategori = 'cam'
        AND stok.katman_yapisi IS NOT NULL
    ), '[]'::jsonb),
    'fiyat_paneli', public.stok_maliyet_kaynak_paneli_getir_v3(v_tarih),
    'hesap', public.urun_maliyetlerini_hesapla_v3(v_tarih, NULL, NULL)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS, audit ve RPC yetkileri
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.maliyet_v3_append_only_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'MALIYET_V3_KAYDI_DEGISTIRILEMEZ';
END;
$$;

CREATE TRIGGER stok_maliyet_fiyat_politika_immutable_v3
  BEFORE UPDATE OR DELETE ON public.stok_maliyet_fiyat_politika_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_v3_append_only_koru();

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'stok_urun_maliyet_recete_surmleri',
    'stok_urun_maliyet_recete_kalemleri',
    'stok_fire_orani_surmleri',
    'stok_maliyet_fiyat_politika_surmleri',
    'stok_maliyet_fiyat_secim_surmleri'
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
      v_table || '_costing_read_v3',
      v_table,
      'costing',
      'read'
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.write_audit_event()',
      'audit_' || v_table || '_v3',
      v_table
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.stok_maliyet_fiyat_secimini_ac_internal_v3(
  uuid, uuid, text, uuid, timestamptz, timestamptz, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_fire_orani_kaydet_v3(
  jsonb, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.urun_maliyet_recetesi_kaydet_v3(
  jsonb, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maliyet_recete_onerisi_v3(
  uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.standart_urun_recetelerini_kur_v3(
  date, uuid[], boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_maliyet_toplu_politika_uygula_v3(
  jsonb, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_maliyet_stok_override_uygula_v3(
  jsonb, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_maliyet_fiyat_secimini_coz_v3(
  uuid, timestamptz
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.urun_maliyeti_detayli_hesapla_v3(
  uuid, date, numeric, numeric
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.urun_maliyetlerini_hesapla_v3(
  date, numeric, numeric
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_maliyet_kaynak_paneli_getir_v3(
  date
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_maliyet_katalogu_getir_v3(
  date
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_fire_orani_kaydet_v3(
  jsonb, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.urun_maliyet_recetesi_kaydet_v3(
  jsonb, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maliyet_recete_onerisi_v3(
  uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.standart_urun_recetelerini_kur_v3(
  date, uuid[], boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_maliyet_toplu_politika_uygula_v3(
  jsonb, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_maliyet_stok_override_uygula_v3(
  jsonb, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_maliyet_fiyat_secimini_coz_v3(
  uuid, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.urun_maliyeti_detayli_hesapla_v3(
  uuid, date, numeric, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.urun_maliyetlerini_hesapla_v3(
  date, numeric, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_maliyet_kaynak_paneli_getir_v3(
  date
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_maliyet_katalogu_getir_v3(
  date
) TO authenticated;

COMMENT ON FUNCTION public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(jsonb, text)
  IS 'Genel tedarikci modeliyle cok satirli, append-only stok fiyat teklifi kaydeder.';
COMMENT ON FUNCTION public.stok_maliyet_toplu_politika_uygula_v3(jsonb, text)
  IS 'Tedarikci+varyant+vade politikasini stoklara kesin fiyat_id snapshotlariyla uygular.';
COMMENT ON FUNCTION public.stok_maliyet_stok_override_uygula_v3(jsonb, text)
  IS 'Tek bir stokta toplu politikanin uzerine cikan tarihsel fiyat istisnasi olusturur.';
COMMENT ON FUNCTION public.urun_maliyeti_detayli_hesapla_v3(uuid, date, numeric, numeric)
  IS 'Acik recete, gercek alan/cevre, stok firesi ve secilmis teklif snapshotiyla maliyet hesaplar.';
COMMENT ON FUNCTION public.urun_maliyetlerini_hesapla_v3(date, numeric, numeric)
  IS 'Sorgu tarihinde aktif acik receteli mamulleri V3 motoruyla topluca hesaplar.';
