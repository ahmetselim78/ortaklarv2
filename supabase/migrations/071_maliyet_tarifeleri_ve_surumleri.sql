-- 071 — Sürümlü maliyet tarifeleri ve tür bazlı maliyet kalemleri.

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.maliyet_tarifeleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kod text NOT NULL UNIQUE CHECK (kod ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  ad text NOT NULL CHECK (nullif(btrim(ad), '') IS NOT NULL),
  varsayilan boolean NOT NULL DEFAULT false,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT varsayilan OR aktif)
);

CREATE UNIQUE INDEX maliyet_tarifeleri_tek_aktif_varsayilan_idx
  ON public.maliyet_tarifeleri(varsayilan)
  WHERE varsayilan AND aktif;

CREATE TABLE public.maliyet_tarife_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maliyet_tarifesi_id uuid NOT NULL
    REFERENCES public.maliyet_tarifeleri(id) ON DELETE RESTRICT,
  surum_no integer NOT NULL CHECK (surum_no > 0),
  durum public.ticari_surum_durumu NOT NULL DEFAULT 'taslak',
  gecerli_baslangic date NOT NULL,
  gecerli_bitis date,
  onceki_surum_id uuid
    REFERENCES public.maliyet_tarife_surmleri(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlayan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlanma_tarihi timestamptz,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (maliyet_tarifesi_id, surum_no),
  CHECK (gecerli_bitis IS NULL OR gecerli_bitis >= gecerli_baslangic),
  CHECK (onceki_surum_id IS NULL OR onceki_surum_id <> id),
  CHECK (
    (durum = 'taslak' AND yayinlayan_kullanici_id IS NULL AND yayinlanma_tarihi IS NULL)
    OR
    (durum IN ('yayinda', 'arsiv')
      AND yayinlayan_kullanici_id IS NOT NULL
      AND yayinlanma_tarihi IS NOT NULL)
  ),
  CONSTRAINT maliyet_tarife_yayin_gecerlilik_cakismasi
    EXCLUDE USING gist (
      maliyet_tarifesi_id WITH =,
      daterange(
        gecerli_baslangic,
        COALESCE(gecerli_bitis, 'infinity'::date),
        '[]'
      ) WITH &&
    )
    WHERE (durum = 'yayinda')
);

CREATE INDEX maliyet_tarife_surumu_gecerlilik_idx
  ON public.maliyet_tarife_surmleri(
    maliyet_tarifesi_id,
    durum,
    gecerli_baslangic,
    gecerli_bitis
  );

CREATE TABLE public.maliyet_stok_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maliyet_tarife_surumu_id uuid NOT NULL
    REFERENCES public.maliyet_tarife_surmleri(id) ON DELETE RESTRICT,
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  hesaplama_birimi public.hesaplama_birimi NOT NULL,
  birim_maliyet numeric(18,6) NOT NULL CHECK (birim_maliyet >= 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  fire_orani numeric(9,4) NOT NULL DEFAULT 0
    CHECK (fire_orani >= 0 AND fire_orani < 100),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (maliyet_tarife_surumu_id, stok_id, hesaplama_birimi)
);

CREATE TABLE public.maliyet_islem_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maliyet_tarife_surumu_id uuid NOT NULL
    REFERENCES public.maliyet_tarife_surmleri(id) ON DELETE RESTRICT,
  islem_kodu text NOT NULL CHECK (islem_kodu ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  islem_turu text NOT NULL CHECK (nullif(btrim(islem_turu), '') IS NOT NULL),
  hesaplama_birimi public.hesaplama_birimi NOT NULL,
  birim_maliyet numeric(18,6) NOT NULL CHECK (birim_maliyet >= 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  fire_orani numeric(9,4) NOT NULL DEFAULT 0
    CHECK (fire_orani >= 0 AND fire_orani < 100),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (maliyet_tarife_surumu_id, islem_kodu)
);

CREATE TABLE public.maliyet_nakliye_kurallari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maliyet_tarife_surumu_id uuid NOT NULL
    REFERENCES public.maliyet_tarife_surmleri(id) ON DELETE RESTRICT,
  hesaplama_tipi public.nakliye_hesaplama_tipi NOT NULL,
  birim_maliyet numeric(18,6) NOT NULL CHECK (birim_maliyet >= 0),
  minimum_tutar numeric(18,6) CHECK (minimum_tutar IS NULL OR minimum_tutar >= 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (maliyet_tarife_surumu_id, hesaplama_tipi)
);

CREATE TABLE public.maliyet_genel_gider_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maliyet_tarife_surumu_id uuid NOT NULL
    REFERENCES public.maliyet_tarife_surmleri(id) ON DELETE RESTRICT,
  kalem_kodu text NOT NULL CHECK (kalem_kodu ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  kalem_adi text NOT NULL CHECK (nullif(btrim(kalem_adi), '') IS NOT NULL),
  hesaplama_birimi public.hesaplama_birimi NOT NULL,
  birim_maliyet numeric(18,6) NOT NULL CHECK (birim_maliyet >= 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (maliyet_tarife_surumu_id, kalem_kodu)
);

CREATE INDEX maliyet_stok_cozumleme_idx
  ON public.maliyet_stok_kalemleri(
    maliyet_tarife_surumu_id,
    stok_id,
    hesaplama_birimi
  )
  WHERE aktif;
CREATE INDEX maliyet_islem_cozumleme_idx
  ON public.maliyet_islem_kalemleri(
    maliyet_tarife_surumu_id,
    islem_kodu
  )
  WHERE aktif;

CREATE OR REPLACE FUNCTION public.maliyet_tarifesi_varsayilani_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kritik_degisiklik boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_kritik_degisiklik := NEW.varsayilan;
  ELSE
    v_kritik_degisiklik :=
      (OLD.varsayilan, OLD.aktif) IS DISTINCT FROM (NEW.varsayilan, NEW.aktif);
  END IF;

  IF v_kritik_degisiklik
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

CREATE OR REPLACE FUNCTION public.maliyet_tarife_surumu_baglantisini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_onceki_tarife_id uuid;
  v_onceki_surum_no integer;
BEGIN
  IF NEW.onceki_surum_id IS NOT NULL THEN
    SELECT maliyet_tarifesi_id, surum_no
      INTO v_onceki_tarife_id, v_onceki_surum_no
    FROM public.maliyet_tarife_surmleri
    WHERE id = NEW.onceki_surum_id;

    IF v_onceki_tarife_id IS DISTINCT FROM NEW.maliyet_tarifesi_id
       OR v_onceki_surum_no >= NEW.surum_no THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'ONCEKI_MALIYET_SURUMU_GECERSIZ';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.maliyet_tarifesi_varsayilani_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maliyet_tarife_surumu_baglantisini_koru()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER maliyet_tarifesi_default_guard
  BEFORE INSERT OR UPDATE ON public.maliyet_tarifeleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_tarifesi_varsayilani_koru();
CREATE TRIGGER maliyet_tarifesi_updated_at
  BEFORE UPDATE ON public.maliyet_tarifeleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at();

CREATE TRIGGER maliyet_tarife_surumu_baglanti_guard
  BEFORE INSERT OR UPDATE ON public.maliyet_tarife_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.maliyet_tarife_surumu_baglantisini_koru();
CREATE TRIGGER maliyet_tarife_surumu_immutable
  BEFORE UPDATE OR DELETE ON public.maliyet_tarife_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_surumu_degisiklige_karsi_koru();
CREATE TRIGGER maliyet_tarife_surumu_revision
  BEFORE UPDATE ON public.maliyet_tarife_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at_ve_revision();

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'maliyet_stok_kalemleri',
    'maliyet_islem_kalemleri',
    'maliyet_nakliye_kurallari',
    'maliyet_genel_gider_kalemleri'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.ticari_taslak_kalemini_koru(%L, %L)',
      v_table || '_draft_guard',
      v_table,
      'maliyet_tarife_surmleri',
      'maliyet_tarife_surumu_id'
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'maliyet_tarifeleri',
    'maliyet_tarife_surmleri',
    'maliyet_stok_kalemleri',
    'maliyet_islem_kalemleri',
    'maliyet_nakliye_kurallari',
    'maliyet_genel_gider_kalemleri'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      v_table
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (public.has_permission(%L, %L))',
      v_table || '_read', v_table, 'pricing', 'read'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (public.has_permission(%L, %L))',
      v_table || '_create', v_table, 'pricing', 'create'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (public.has_permission(%L, %L))
       WITH CHECK (public.has_permission(%L, %L))',
      v_table || '_update',
      v_table,
      'pricing',
      'update',
      'pricing',
      'update'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (public.has_permission(%L, %L))',
      v_table || '_delete', v_table, 'pricing', 'delete'
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.write_audit_event()',
      'audit_' || v_table, v_table
    );
  END LOOP;
END;
$$;

COMMENT ON COLUMN public.maliyet_tarifeleri.varsayilan IS
  'Kanonik motorun müşteri profilinden bağımsız tek maliyet tarifesi çözümleme işaretidir.';
COMMENT ON COLUMN public.maliyet_stok_kalemleri.fire_orani IS
  'Yalnız bu maliyet bileşeninin tüketim miktarına uygulanır; satış fiyatını doğrudan değiştirmez.';
