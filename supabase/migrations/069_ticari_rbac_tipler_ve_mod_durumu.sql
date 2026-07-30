-- 069 — Ticari modül ortak tipleri, RBAC izinleri ve feature-mode temeli.
-- Uygulanmış 001-068 migration'ları değiştirilmez; yeni ticari şema bu dosyadan başlar.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TYPE public.ticari_surum_durumu AS ENUM ('taslak', 'yayinda', 'arsiv');
CREATE TYPE public.para_birimi_kodu AS ENUM ('TRY', 'USD', 'EUR');
CREATE TYPE public.ticari_modul_modu AS ENUM ('hazirlik', 'golge', 'aktif', 'bakim');
CREATE TYPE public.stok_ticari_kapsami AS ENUM (
  'satilabilir',
  'maliyet_bileseni',
  'her_ikisi',
  'kapsam_disi'
);
CREATE TYPE public.hesaplama_birimi AS ENUM (
  'm2',
  'cevre_m',
  'adet',
  'siparis',
  'metre',
  'kg',
  'saat',
  'sabit',
  'yuzde'
);
CREATE TYPE public.ticari_kapsam_tipi AS ENUM ('stok', 'stok_grubu', 'genel');
CREATE TYPE public.nakliye_hesaplama_tipi AS ENUM ('siparis_sabiti', 'm2');
CREATE TYPE public.doviz_kur_tipi AS ENUM (
  'doviz_alis',
  'doviz_satis',
  'efektif_alis',
  'efektif_satis'
);
CREATE TYPE public.doviz_kur_kaynagi AS ENUM ('otomatik', 'manuel');

ALTER TABLE public.cari
  ADD COLUMN aktif boolean NOT NULL DEFAULT true;

ALTER TABLE public.stok
  ADD COLUMN ticari_kapsam public.stok_ticari_kapsami
    NOT NULL DEFAULT 'kapsam_disi',
  ADD COLUMN ticari_kapsam_dogrulandi_at timestamptz,
  ADD COLUMN ticari_kapsam_dogrulayan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT stok_ticari_kapsam_dogrulama_check CHECK (
    (ticari_kapsam_dogrulandi_at IS NULL
      AND ticari_kapsam_dogrulayan_kullanici_id IS NULL)
    OR
    (ticari_kapsam_dogrulandi_at IS NOT NULL
      AND ticari_kapsam_dogrulayan_kullanici_id IS NOT NULL)
  );

CREATE INDEX cari_aktif_idx ON public.cari(aktif) WHERE aktif;
CREATE INDEX stok_ticari_kapsam_idx
  ON public.stok(ticari_kapsam, aktif)
  WHERE aktif;

INSERT INTO public.permissions(module, action, description_tr)
SELECT module, action, description_tr
FROM (
  VALUES
    ('pricing', 'read',   'Fiyat, maliyet, reçete ve ticari profil verilerini görüntüleme'),
    ('pricing', 'create', 'Fiyat, maliyet, reçete ve ticari profil taslağı oluşturma'),
    ('pricing', 'update', 'Fiyat, maliyet, reçete ve ticari profil taslağı düzenleme'),
    ('pricing', 'delete', 'Ticari taslakları silme'),
    ('pricing', 'manage', 'Ticari sürüm yayınlama ve kritik fiyatlandırma işlemleri'),
    ('finance', 'read',   'Cari hareketleri ve para birimi bazlı bakiyeleri görüntüleme'),
    ('finance', 'create', 'Tahsilat ve ön ödeme kaydetme'),
    ('finance', 'update', 'Finansal taslak ve açıklamaları düzenleme'),
    ('finance', 'delete', 'Finansal taslakları silme'),
    ('finance', 'manage', 'Açılış bakiyesi, tersleme ve kritik finans işlemleri')
) AS permission_seed(module, action, description_tr)
ON CONFLICT (module, action)
DO UPDATE SET description_tr = EXCLUDED.description_tr;

-- Yönetici yeni izinlerin tamamını alır.
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles role_row
CROSS JOIN public.permissions permission_row
WHERE role_row.slug = 'administrator'
  AND permission_row.module IN ('pricing', 'finance')
ON CONFLICT DO NOTHING;

-- Ofis/Planlama: ticari taslak yönetimi ile cari görüntüleme/tahsilat.
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM public.roles role_row
JOIN public.permissions permission_row
  ON (
    permission_row.module = 'pricing'
    AND permission_row.action IN ('read', 'create', 'update')
  )
  OR (
    permission_row.module = 'finance'
    AND permission_row.action IN ('read', 'create')
  )
WHERE role_row.slug = 'office_planning'
ON CONFLICT DO NOTHING;

CREATE TABLE public.ticari_modul_durumu (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mod public.ticari_modul_modu NOT NULL DEFAULT 'hazirlik',
  ilk_aktiflesme_tarihi timestamptz,
  son_readiness_hash text,
  son_readiness_sonucu jsonb,
  gerekce text,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  guncelleyen_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mod <> 'aktif' OR ilk_aktiflesme_tarihi IS NOT NULL)
);

INSERT INTO public.ticari_modul_durumu(singleton, mod)
VALUES (true, 'hazirlik');

CREATE TABLE public.ticari_kurulum_durumlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kontrol_kodu text NOT NULL UNIQUE
    CHECK (kontrol_kodu ~ '^[a-z][a-z0-9_]*$'),
  kontrol_turu text NOT NULL CHECK (kontrol_turu IN ('dinamik', 'manuel')),
  aciklama text NOT NULL,
  kritik boolean NOT NULL DEFAULT true,
  durum text NOT NULL DEFAULT 'bekliyor'
    CHECK (durum IN ('bekliyor', 'basarili', 'basarisiz', 'uygulanamaz')),
  sonuc_detayi jsonb NOT NULL DEFAULT '{}'::jsonb,
  kontrol_edilme_tarihi timestamptz,
  onaylayan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  onay_gerekcesi text,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    kontrol_turu = 'dinamik'
    OR durum <> 'basarili'
    OR (onaylayan_kullanici_id IS NOT NULL AND nullif(btrim(onay_gerekcesi), '') IS NOT NULL)
  )
);

CREATE INDEX ticari_kurulum_durumlari_kritik_durum_idx
  ON public.ticari_kurulum_durumlari(kritik, durum);

-- Ticari sürümlerde yayınlanan içerik değişmez. Yayında -> arşiv geçişi yalnız
-- içerik aynı kalırsa yapılabilir; arşivlenmiş kayıt tekrar değiştirilemez.
CREATE OR REPLACE FUNCTION public.ticari_surumu_degisiklige_karsi_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_icerik jsonb;
  v_new_icerik jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.durum::text <> 'taslak' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'YAYINLANMIS_SURUM_DEGISTIRILEMEZ';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.durum::text = 'arsiv' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ARSIV_SURUMU_DEGISTIRILEMEZ';
  END IF;

  IF OLD.durum::text = 'yayinda' THEN
    v_old_icerik := to_jsonb(OLD) - ARRAY['durum', 'revision_no', 'updated_at'];
    v_new_icerik := to_jsonb(NEW) - ARRAY['durum', 'revision_no', 'updated_at'];

    IF NEW.durum::text <> 'arsiv'
       OR v_new_icerik IS DISTINCT FROM v_old_icerik
       OR NEW.revision_no NOT IN (OLD.revision_no, OLD.revision_no + 1) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'YAYINLANMIS_SURUM_DEGISTIRILEMEZ';
    END IF;
  END IF;

  IF OLD.durum IS DISTINCT FROM NEW.durum
     AND NEW.durum::text IN ('yayinda', 'arsiv')
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

-- Kalem tablolarında yalnız taslak parent'a insert/update/delete yapılabilir.
-- Trigger argümanları migration sahibi tarafından sabit tanımlandığı için
-- dinamik identifier'lar format(%I) ile güvenli biçimde işlenir.
CREATE OR REPLACE FUNCTION public.ticari_taslak_kalemini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_parent_table text := TG_ARGV[0];
  v_parent_column text := TG_ARGV[1];
  v_old_parent_id uuid;
  v_new_parent_id uuid;
  v_durum text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_parent_id := NULLIF(to_jsonb(OLD) ->> v_parent_column, '')::uuid;
    EXECUTE format(
      'SELECT durum::text FROM public.%I WHERE id = $1 FOR UPDATE',
      v_parent_table
    ) INTO v_durum USING v_old_parent_id;

    IF v_durum IS DISTINCT FROM 'taslak' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'YAYINLANMIS_SURUM_KALEMI_DEGISTIRILEMEZ';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_parent_id := NULLIF(to_jsonb(NEW) ->> v_parent_column, '')::uuid;

    IF TG_OP = 'UPDATE' AND v_new_parent_id IS DISTINCT FROM v_old_parent_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'KALEM_BASKA_SURUME_TASINAMAZ';
    END IF;

    IF TG_OP = 'INSERT' THEN
      EXECUTE format(
        'SELECT durum::text FROM public.%I WHERE id = $1 FOR UPDATE',
        v_parent_table
      ) INTO v_durum USING v_new_parent_id;
    END IF;

    IF v_durum IS DISTINCT FROM 'taslak' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'YALNIZ_TASLAK_SURUME_KALEM_YAZILABILIR';
    END IF;
  END IF;

  EXECUTE format(
    'UPDATE public.%I
        SET revision_no = revision_no + 1
      WHERE id = $1',
    v_parent_table
  )
  USING COALESCE(v_new_parent_id, v_old_parent_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_updated_at_ve_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.revision_no = OLD.revision_no THEN
    NEW.revision_no := OLD.revision_no + 1;
  END IF;
  IF NEW.revision_no <> OLD.revision_no + 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'REVISION_NO_ARDISIK_OLMALI';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ticari_surumu_degisiklige_karsi_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_taslak_kalemini_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_updated_at_ve_revision()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_updated_at()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ticari_modul_durumu_revision
  BEFORE UPDATE ON public.ticari_modul_durumu
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at_ve_revision();

CREATE TRIGGER ticari_kurulum_durumlari_revision
  BEFORE UPDATE ON public.ticari_kurulum_durumlari
  FOR EACH ROW EXECUTE FUNCTION public.ticari_updated_at_ve_revision();

ALTER TABLE public.ticari_modul_durumu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticari_modul_durumu FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ticari_kurulum_durumlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticari_kurulum_durumlari FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.ticari_modul_durumu FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ticari_kurulum_durumlari FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ticari_modul_durumu TO authenticated;
GRANT SELECT ON public.ticari_kurulum_durumlari TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.ticari_modul_durumu, public.ticari_kurulum_durumlari
  TO service_role;

CREATE POLICY ticari_modul_durumu_read
  ON public.ticari_modul_durumu FOR SELECT TO authenticated
  USING (
    public.has_permission('pricing', 'read')
    OR public.has_permission('admin', 'manage')
  );

CREATE POLICY ticari_kurulum_durumlari_read
  ON public.ticari_kurulum_durumlari FOR SELECT TO authenticated
  USING (
    public.has_permission('pricing', 'read')
    OR public.has_permission('admin', 'manage')
  );

CREATE TRIGGER audit_ticari_modul_durumu
  AFTER INSERT OR UPDATE OR DELETE ON public.ticari_modul_durumu
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

CREATE TRIGGER audit_ticari_kurulum_durumlari
  AFTER INSERT OR UPDATE OR DELETE ON public.ticari_kurulum_durumlari
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

COMMENT ON TABLE public.ticari_modul_durumu IS
  'Ticari modülün hazirlik/golge/aktif/bakim durum makinesinin tek satırlı kaynağı.';
COMMENT ON COLUMN public.stok.ticari_kapsam IS
  'Canlıya geçmeden kullanıcı tarafından doğrulanması gereken ticari stok sınıfı.';
