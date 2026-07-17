-- 046 — Supabase Auth kimlik köprüsü
-- Parola hiçbir uygulama tablosuna yazılmaz. giris_sifresi yalnızca doğrulanmış
-- geçiş tamamlanana kadar legacy veri olarak kalır ve bu migration ile API'den gizlenir.

CREATE TABLE public.app_users (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  personel_id uuid UNIQUE REFERENCES public.hr_personel(id) ON DELETE SET NULL,
  username text,
  display_name text NOT NULL DEFAULT '',
  account_type text NOT NULL DEFAULT 'personal'
    CHECK (account_type IN ('personal', 'device', 'canary')),
  is_active boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT false,
  auth_migrated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_users_username_unique
  ON public.app_users (lower(username))
  WHERE username IS NOT NULL;

CREATE INDEX app_users_personel_idx ON public.app_users(personel_id);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_users TO service_role;
GRANT SELECT ON public.hr_personel TO service_role;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT au.auth_user_id
  FROM public.app_users au
  WHERE au.auth_user_id = auth.uid()
    AND au.is_active
$$;

CREATE OR REPLACE FUNCTION public.current_personel_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT au.personel_id
  FROM public.app_users au
  WHERE au.auth_user_id = auth.uid()
    AND au.is_active
$$;

REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_personel_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_personel_id() TO authenticated;

CREATE POLICY app_users_self_read
  ON public.app_users FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Yeni Auth hesapları pasif profil ile başlar. Hesabı ve rolü yalnızca güvenli
-- admin Edge işlemi/service_role etkinleştirir.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.app_users (
    auth_user_id,
    username,
    display_name,
    account_type,
    is_active,
    must_change_password
  ) VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''), split_part(COALESCE(NEW.email, ''), '@', 1)),
    CASE WHEN NEW.raw_user_meta_data ->> 'account_type' = 'device' THEN 'device' ELSE 'personal' END,
    false,
    COALESCE((NEW.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  )
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

-- Parola kolonunu Data API'den hemen gizle. Güvenli alanlar açıkça grant edilir.
REVOKE SELECT ON public.hr_personel FROM anon, authenticated;
REVOKE INSERT, UPDATE (giris_sifresi) ON public.hr_personel FROM anon, authenticated;
GRANT SELECT (
  id, ad_soyad, foto_url, rol, is_aktif, olusturma,
  kullanici_adi, uretim_yetkileri_sinirli
) ON public.hr_personel TO authenticated;

COMMENT ON TABLE public.app_users IS 'Supabase Auth UUID ile OrtaklarV2 personel/cihaz kimliği arasındaki köprü. Parola içermez.';
COMMENT ON COLUMN public.app_users.must_change_password IS 'Geçici parola alan kullanıcı işleme devam etmeden parolasını değiştirmelidir.';
