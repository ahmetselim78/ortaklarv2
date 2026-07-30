-- 072 — Ürün maliyet reçetelerinin mantıksal kayıt + değişmez sürüm + kalem modeli.

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.urun_maliyet_receteleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stok_id uuid NOT NULL UNIQUE REFERENCES public.stok(id) ON DELETE RESTRICT,
  kod text NOT NULL UNIQUE CHECK (kod ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  ad text NOT NULL CHECK (nullif(btrim(ad), '') IS NOT NULL),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX urun_maliyet_receteleri_stok_aktif_idx
  ON public.urun_maliyet_receteleri(stok_id)
  WHERE aktif;

CREATE TABLE public.urun_maliyet_recete_surmleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  urun_maliyet_recetesi_id uuid NOT NULL
    REFERENCES public.urun_maliyet_receteleri(id) ON DELETE RESTRICT,
  surum_no integer NOT NULL CHECK (surum_no > 0),
  durum public.ticari_surum_durumu NOT NULL DEFAULT 'taslak',
  gecerli_baslangic date NOT NULL,
  gecerli_bitis date,
  onceki_surum_id uuid
    REFERENCES public.urun_maliyet_recete_surmleri(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlayan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  yayinlanma_tarihi timestamptz,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (urun_maliyet_recetesi_id, surum_no),
  CHECK (gecerli_bitis IS NULL OR gecerli_bitis >= gecerli_baslangic),
  CHECK (onceki_surum_id IS NULL OR onceki_surum_id <> id),
  CHECK (
    (durum = 'taslak' AND yayinlayan_kullanici_id IS NULL AND yayinlanma_tarihi IS NULL)
    OR
    (durum IN ('yayinda', 'arsiv')
      AND yayinlayan_kullanici_id IS NOT NULL
      AND yayinlanma_tarihi IS NOT NULL)
  ),
  CONSTRAINT maliyet_recete_yayin_gecerlilik_cakismasi
    EXCLUDE USING gist (
      urun_maliyet_recetesi_id WITH =,
      daterange(
        gecerli_baslangic,
        COALESCE(gecerli_bitis, 'infinity'::date),
        '[]'
      ) WITH &&
    )
    WHERE (durum = 'yayinda')
);

CREATE INDEX urun_maliyet_recete_surumu_gecerlilik_idx
  ON public.urun_maliyet_recete_surmleri(
    urun_maliyet_recetesi_id,
    durum,
    gecerli_baslangic,
    gecerli_bitis
  );

CREATE TABLE public.urun_maliyet_recete_kalemleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  urun_maliyet_recete_surumu_id uuid NOT NULL
    REFERENCES public.urun_maliyet_recete_surmleri(id) ON DELETE RESTRICT,
  bilesen_turu text NOT NULL
    CHECK (bilesen_turu IN (
      'stok',
      'sipariste_secilen_cita',
      'islem',
      'genel_gider'
    )),
  ham_stok_id uuid REFERENCES public.stok(id) ON DELETE RESTRICT,
  referans_kodu text,
  hesaplama_birimi public.hesaplama_birimi NOT NULL,
  miktar_katsayisi numeric(18,6) NOT NULL DEFAULT 1
    CHECK (miktar_katsayisi > 0),
  cevre_katsayisi numeric(18,6) NOT NULL DEFAULT 1
    CHECK (cevre_katsayisi > 0),
  fire_orani_override numeric(9,4)
    CHECK (
      fire_orani_override IS NULL
      OR (fire_orani_override >= 0 AND fire_orani_override < 100)
    ),
  sira_no integer NOT NULL DEFAULT 1 CHECK (sira_no > 0),
  aciklama text,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (urun_maliyet_recete_surumu_id, sira_no),
  CHECK (
    (bilesen_turu = 'stok'
      AND ham_stok_id IS NOT NULL
      AND referans_kodu IS NULL)
    OR
    (bilesen_turu = 'sipariste_secilen_cita'
      AND ham_stok_id IS NULL
      AND referans_kodu IS NULL)
    OR
    (bilesen_turu IN ('islem', 'genel_gider')
      AND ham_stok_id IS NULL
      AND nullif(btrim(referans_kodu), '') IS NOT NULL)
  ),
  CHECK (hesaplama_birimi = 'cevre_m' OR cevre_katsayisi = 1)
);

CREATE INDEX urun_maliyet_recete_kalemleri_surumu_idx
  ON public.urun_maliyet_recete_kalemleri(
    urun_maliyet_recete_surumu_id,
    sira_no
  );
CREATE INDEX urun_maliyet_recete_kalemleri_ham_stok_idx
  ON public.urun_maliyet_recete_kalemleri(ham_stok_id)
  WHERE ham_stok_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.urun_maliyet_recetesi_stogunu_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.stok_id IS DISTINCT FROM NEW.stok_id
     AND EXISTS (
       SELECT 1
       FROM public.urun_maliyet_recete_surmleri version_row
       WHERE version_row.urun_maliyet_recetesi_id = OLD.id
         AND version_row.durum IN ('yayinda', 'arsiv')
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'YAYINLANMIS_RECETENIN_URUNU_DEGISTIRILEMEZ';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.urun_maliyet_recete_surumu_baglantisini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_onceki_recete_id uuid;
  v_onceki_surum_no integer;
BEGIN
  IF NEW.onceki_surum_id IS NOT NULL THEN
    SELECT urun_maliyet_recetesi_id, surum_no
      INTO v_onceki_recete_id, v_onceki_surum_no
    FROM public.urun_maliyet_recete_surmleri
    WHERE id = NEW.onceki_surum_id;

    IF v_onceki_recete_id IS DISTINCT FROM NEW.urun_maliyet_recetesi_id
       OR v_onceki_surum_no >= NEW.surum_no THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'ONCEKI_RECETE_SURUMU_GECERSIZ';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.urun_maliyet_recetesi_stogunu_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.urun_maliyet_recete_surumu_baglantisini_koru()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER urun_maliyet_recetesi_stok_guard
  BEFORE UPDATE ON public.urun_maliyet_receteleri
  FOR EACH ROW EXECUTE FUNCTION public.urun_maliyet_recetesi_stogunu_koru();
CREATE TRIGGER urun_maliyet_recetesi_updated_at
  BEFORE UPDATE ON public.urun_maliyet_receteleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at();

CREATE TRIGGER urun_maliyet_recete_surumu_baglanti_guard
  BEFORE INSERT OR UPDATE ON public.urun_maliyet_recete_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.urun_maliyet_recete_surumu_baglantisini_koru();
CREATE TRIGGER urun_maliyet_recete_surumu_immutable
  BEFORE UPDATE OR DELETE ON public.urun_maliyet_recete_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_surumu_degisiklige_karsi_koru();
CREATE TRIGGER urun_maliyet_recete_surumu_revision
  BEFORE UPDATE ON public.urun_maliyet_recete_surmleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at_ve_revision();

CREATE TRIGGER urun_maliyet_recete_kalemleri_draft_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.urun_maliyet_recete_kalemleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_taslak_kalemini_koru(
    'urun_maliyet_recete_surmleri',
    'urun_maliyet_recete_surumu_id'
  );

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'urun_maliyet_receteleri',
    'urun_maliyet_recete_surmleri',
    'urun_maliyet_recete_kalemleri'
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

COMMENT ON COLUMN public.urun_maliyet_recete_kalemleri.cevre_katsayisi IS
  'Üçlü cam gibi ürünlerde çıta/çevre tüketimini açıkça çoğaltır; yalnız cevre_m kalemlerinde 1 dışında olabilir.';
COMMENT ON TABLE public.urun_maliyet_recete_surmleri IS
  'Sipariş snapshotı mantıksal reçete kimliğiyle birlikte bu sürüm kimliğini de saklar.';
