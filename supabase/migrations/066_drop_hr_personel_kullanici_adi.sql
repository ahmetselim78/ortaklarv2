-- 066 — Legacy hr_personel.kullanici_adi kolonunu kaldır
-- Giriş kimliği artık app_users.username / Supabase Auth üzerindedir.

REVOKE SELECT ON public.hr_personel FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.hr_personel FROM authenticated;

ALTER TABLE public.hr_personel DROP COLUMN IF EXISTS kullanici_adi;

GRANT SELECT (
  id, ad_soyad, foto_url, rol, is_aktif, olusturma,
  uretim_yetkileri_sinirli
) ON public.hr_personel TO authenticated;
GRANT INSERT (ad_soyad, foto_url, rol, is_aktif, uretim_yetkileri_sinirli)
  ON public.hr_personel TO authenticated;
GRANT UPDATE (ad_soyad, foto_url, rol, is_aktif, uretim_yetkileri_sinirli)
  ON public.hr_personel TO authenticated;
GRANT DELETE ON public.hr_personel TO authenticated;
