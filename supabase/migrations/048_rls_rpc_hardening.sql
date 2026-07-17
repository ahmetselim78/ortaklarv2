-- 048 — İşlem bazlı RLS ve RPC güvenliği
-- Geniş politikalara geri dönüş yoktur. Yetki kaynağı 047 RBAC tablolarıdır.

DO $$
DECLARE
  v_table text;
  v_policy record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cari','stok','siparisler','siparis_detaylari','uretim_emirleri','uretim_emri_detaylari',
    'yikama_loglari','sayaclar','tamir_kayitlari','ayarlar','takvim_notlari','araclar',
    'sevkiyat_planlari','hr_personel','uretim_saat_sablonlari','uretim_saatlik_hedefler',
    'gunluk_uretim_takip','telegram_ayarlari','telegram_rapor_saatleri','telegram_rapor_log',
    'uretim_istasyonlari','gunluk_uretim_raporlari','gunluk_uretim_istasyon_kayitlari',
    'gunluk_uretim_arac_yuklemeleri','hr_personel_istasyon_yetkileri'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_table);
      FOR v_policy IN
        SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
      END LOOP;
    END IF;
  END LOOP;
END
$$;

-- Standart modül tablolarında her işlem ayrı politikadır.
DO $$
DECLARE
  item text[];
  v_table text;
  v_module text;
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ARRAY['cari','cari'],
    ARRAY['stok','inventory'],
    ARRAY['siparisler','orders'],
    ARRAY['siparis_detaylari','orders'],
    ARRAY['uretim_emirleri','production'],
    ARRAY['uretim_emri_detaylari','production'],
    ARRAY['yikama_loglari','production'],
    ARRAY['tamir_kayitlari','repair'],
    ARRAY['ayarlar','settings'],
    ARRAY['takvim_notlari','settings'],
    ARRAY['araclar','shipping'],
    ARRAY['sevkiyat_planlari','shipping'],
    ARRAY['uretim_saat_sablonlari','hourly_tracking'],
    ARRAY['uretim_saatlik_hedefler','hourly_tracking'],
    ARRAY['gunluk_uretim_takip','hourly_tracking'],
    ARRAY['uretim_istasyonlari','production_entry'],
    ARRAY['telegram_ayarlari','telegram'],
    ARRAY['telegram_rapor_saatleri','telegram'],
    ARRAY['telegram_rapor_log','telegram']
  ] LOOP
    v_table := item[1];
    v_module := item[2];
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_table);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_permission(%L, %L))', v_table || '_read', v_table, v_module, 'read');
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_permission(%L, %L))', v_table || '_create', v_table, v_module, 'create');
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_permission(%L, %L)) WITH CHECK (public.has_permission(%L, %L))', v_table || '_update', v_table, v_module, 'update', v_module, 'update');
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_permission(%L, %L))', v_table || '_delete', v_table, v_module, 'delete');
    END IF;
  END LOOP;
END
$$;

-- Personel parolası hiçbir authenticated kullanıcıya okunabilir/yazılabilir değildir.
REVOKE SELECT ON public.hr_personel FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.hr_personel FROM authenticated;
GRANT SELECT (
  id, ad_soyad, foto_url, rol, is_aktif, olusturma,
  kullanici_adi, uretim_yetkileri_sinirli
) ON public.hr_personel TO authenticated;
GRANT INSERT (ad_soyad, foto_url, rol, is_aktif, kullanici_adi, uretim_yetkileri_sinirli)
  ON public.hr_personel TO authenticated;
GRANT UPDATE (ad_soyad, foto_url, rol, is_aktif, kullanici_adi, uretim_yetkileri_sinirli)
  ON public.hr_personel TO authenticated;
GRANT DELETE ON public.hr_personel TO authenticated;

CREATE POLICY hr_personel_read ON public.hr_personel FOR SELECT TO authenticated
USING (
  id = public.current_personel_id()
  OR public.has_permission('users', 'read')
  OR public.has_permission('production_entry', 'read')
);
CREATE POLICY hr_personel_create ON public.hr_personel FOR INSERT TO authenticated
WITH CHECK (public.is_admin_aal2());
CREATE POLICY hr_personel_update ON public.hr_personel FOR UPDATE TO authenticated
USING (public.is_admin_aal2()) WITH CHECK (public.is_admin_aal2());
CREATE POLICY hr_personel_delete ON public.hr_personel FOR DELETE TO authenticated
USING (public.is_admin_aal2());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_personel_istasyon_yetkileri TO authenticated;
CREATE POLICY personel_istasyon_read ON public.hr_personel_istasyon_yetkileri FOR SELECT TO authenticated
USING (personel_id = public.current_personel_id() OR public.has_permission('users', 'read'));
CREATE POLICY personel_istasyon_create ON public.hr_personel_istasyon_yetkileri FOR INSERT TO authenticated
WITH CHECK (public.is_admin_aal2());
CREATE POLICY personel_istasyon_update ON public.hr_personel_istasyon_yetkileri FOR UPDATE TO authenticated
USING (public.is_admin_aal2()) WITH CHECK (public.is_admin_aal2());
CREATE POLICY personel_istasyon_delete ON public.hr_personel_istasyon_yetkileri FOR DELETE TO authenticated
USING (public.is_admin_aal2());

-- Operatör, yalnızca kendi üretim girişini oluşturur/değiştirir. Manage izni
-- ofis/yönetici için sahiplik istisnasıdır.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gunluk_uretim_raporlari TO authenticated;
CREATE POLICY gunluk_rapor_read ON public.gunluk_uretim_raporlari FOR SELECT TO authenticated
USING (public.has_permission('production_entry', 'read'));
CREATE POLICY gunluk_rapor_create ON public.gunluk_uretim_raporlari FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission('production_entry', 'manage')
  OR (public.has_permission('production_entry', 'create') AND operator_id = public.current_personel_id())
);
CREATE POLICY gunluk_rapor_update ON public.gunluk_uretim_raporlari FOR UPDATE TO authenticated
USING (
  public.has_permission('production_entry', 'manage')
  OR (public.has_permission('production_entry', 'update') AND operator_id = public.current_personel_id())
)
WITH CHECK (
  public.has_permission('production_entry', 'manage')
  OR (public.has_permission('production_entry', 'update') AND operator_id = public.current_personel_id())
);
CREATE POLICY gunluk_rapor_delete ON public.gunluk_uretim_raporlari FOR DELETE TO authenticated
USING (public.has_permission('production_entry', 'manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gunluk_uretim_istasyon_kayitlari TO authenticated;
CREATE POLICY gunluk_istasyon_read ON public.gunluk_uretim_istasyon_kayitlari FOR SELECT TO authenticated
USING (public.has_permission('production_entry', 'read'));
CREATE POLICY gunluk_istasyon_create ON public.gunluk_uretim_istasyon_kayitlari FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.gunluk_uretim_raporlari r
  WHERE r.id = rapor_id AND (
    public.has_permission('production_entry', 'manage')
    OR (public.has_permission('production_entry', 'create') AND r.operator_id = public.current_personel_id())
  )
));
CREATE POLICY gunluk_istasyon_update ON public.gunluk_uretim_istasyon_kayitlari FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.gunluk_uretim_raporlari r
  WHERE r.id = rapor_id AND (
    public.has_permission('production_entry', 'manage')
    OR (public.has_permission('production_entry', 'update') AND r.operator_id = public.current_personel_id())
  )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.gunluk_uretim_raporlari r
  WHERE r.id = rapor_id AND (
    public.has_permission('production_entry', 'manage')
    OR (public.has_permission('production_entry', 'update') AND r.operator_id = public.current_personel_id())
  )
));
CREATE POLICY gunluk_istasyon_delete ON public.gunluk_uretim_istasyon_kayitlari FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.gunluk_uretim_raporlari r
  WHERE r.id = rapor_id AND (
    public.has_permission('production_entry', 'manage')
    OR (public.has_permission('production_entry', 'update') AND r.operator_id = public.current_personel_id())
  )
));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gunluk_uretim_arac_yuklemeleri TO authenticated;
CREATE POLICY gunluk_arac_read ON public.gunluk_uretim_arac_yuklemeleri FOR SELECT TO authenticated
USING (public.has_permission('production_entry', 'read'));
CREATE POLICY gunluk_arac_create ON public.gunluk_uretim_arac_yuklemeleri FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.gunluk_uretim_raporlari r
  WHERE r.id = rapor_id AND (
    public.has_permission('production_entry', 'manage')
    OR (public.has_permission('production_entry', 'create') AND r.operator_id = public.current_personel_id())
  )
));
CREATE POLICY gunluk_arac_update ON public.gunluk_uretim_arac_yuklemeleri FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.gunluk_uretim_raporlari r
  WHERE r.id = rapor_id AND (
    public.has_permission('production_entry', 'manage')
    OR (public.has_permission('production_entry', 'update') AND r.operator_id = public.current_personel_id())
  )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.gunluk_uretim_raporlari r
  WHERE r.id = rapor_id AND (
    public.has_permission('production_entry', 'manage')
    OR (public.has_permission('production_entry', 'update') AND r.operator_id = public.current_personel_id())
  )
));
CREATE POLICY gunluk_arac_delete ON public.gunluk_uretim_arac_yuklemeleri FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.gunluk_uretim_raporlari r
  WHERE r.id = rapor_id AND (
    public.has_permission('production_entry', 'manage')
    OR (public.has_permission('production_entry', 'update') AND r.operator_id = public.current_personel_id())
  )
));

-- Sayaç tablosu doğrudan yazılmaz; yalnızca kısıtlı RPC kullanılır.
REVOKE ALL ON public.sayaclar FROM anon, authenticated;

-- Yalnız sunucu tarafındaki Telegram Edge işi için gerekli servis yüzeyi.
-- service_role anahtarı frontend'e verilmez ve Edge girişinde ayrı cron/JWT
-- doğrulaması tamamlanmadan bu sorgular çalıştırılmaz.
GRANT SELECT ON public.telegram_ayarlari, public.telegram_rapor_saatleri,
  public.gunluk_uretim_takip, public.gunluk_uretim_raporlari,
  public.gunluk_uretim_istasyon_kayitlari, public.gunluk_uretim_arac_yuklemeleri,
  public.uretim_istasyonlari, public.hr_personel, public.araclar
TO service_role;
GRANT SELECT, INSERT, DELETE ON public.telegram_rapor_log TO service_role;

CREATE OR REPLACE FUNCTION public.sonraki_sayac(p_anahtar text, p_adet integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_module text;
  v_deger integer;
BEGIN
  IF p_adet < 1 OR p_adet > 1000 OR length(p_anahtar) > 80 THEN
    RAISE EXCEPTION 'Geçersiz sayaç parametresi';
  END IF;

  v_module := CASE
    WHEN p_anahtar = 'cari_kod' THEN 'cari'
    WHEN p_anahtar = 'stok_kod' THEN 'inventory'
    WHEN p_anahtar = 'cam_kodu' OR p_anahtar LIKE 'siparis_no_%' THEN 'orders'
    WHEN p_anahtar LIKE 'batch_no_%' THEN 'production'
    ELSE NULL
  END;
  IF v_module IS NULL OR NOT public.has_permission(v_module, 'create') THEN
    RAISE EXCEPTION 'Sayaç için yetki yok';
  END IF;

  INSERT INTO public.sayaclar (anahtar, deger) VALUES (p_anahtar, p_adet)
  ON CONFLICT (anahtar) DO UPDATE SET deger = public.sayaclar.deger + EXCLUDED.deger
  RETURNING deger INTO v_deger;
  RETURN v_deger;
END;
$$;

CREATE OR REPLACE FUNCTION public.saatlik_sayac_arttir(p_id uuid, p_delta integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_deger integer;
BEGIN
  IF NOT public.has_permission('hourly_tracking', 'update') OR abs(p_delta) > 1000 THEN
    RAISE EXCEPTION 'Saatlik sayaç için yetki veya parametre geçersiz';
  END IF;
  UPDATE public.gunluk_uretim_takip
  SET gerceklesen_adet = GREATEST(0, gerceklesen_adet + p_delta)
  WHERE id = p_id RETURNING gerceklesen_adet INTO v_deger;
  IF v_deger IS NULL THEN RAISE EXCEPTION 'Kayıt bulunamadı'; END IF;
  RETURN v_deger;
END;
$$;

CREATE OR REPLACE FUNCTION public.saatlik_fire_arttir(p_id uuid, p_delta integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_deger integer;
BEGIN
  IF NOT public.has_permission('hourly_tracking', 'update') OR abs(p_delta) > 1000 THEN
    RAISE EXCEPTION 'Saatlik fire için yetki veya parametre geçersiz';
  END IF;
  UPDATE public.gunluk_uretim_takip
  SET fire_adet = GREATEST(0, fire_adet + p_delta)
  WHERE id = p_id RETURNING fire_adet INTO v_deger;
  IF v_deger IS NULL THEN RAISE EXCEPTION 'Kayıt bulunamadı'; END IF;
  RETURN v_deger;
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_personel_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_aal2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_aal2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sonraki_sayac(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saatlik_sayac_arttir(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saatlik_fire_arttir(uuid, integer) TO authenticated;

-- Trigger da aktörü doğrular; başka personel adına kayıt RLS dışında da reddedilir.
CREATE OR REPLACE FUNCTION public.uretim_istasyon_yetkisi_kontrol()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_operator_id uuid;
  v_sinirli boolean;
BEGIN
  SELECT r.operator_id INTO v_operator_id
  FROM public.gunluk_uretim_raporlari r WHERE r.id = NEW.rapor_id;

  IF v_operator_id IS NULL THEN RAISE EXCEPTION 'Üretim raporu veya operatör bulunamadı'; END IF;
  IF NOT public.has_permission('production_entry', 'manage')
     AND v_operator_id <> public.current_personel_id() THEN
    RAISE EXCEPTION 'Başka kullanıcı adına üretim kaydı oluşturulamaz';
  END IF;

  SELECT p.uretim_yetkileri_sinirli INTO v_sinirli
  FROM public.hr_personel p WHERE p.id = v_operator_id;
  IF COALESCE(v_sinirli, false) AND NOT EXISTS (
    SELECT 1 FROM public.hr_personel_istasyon_yetkileri y
    WHERE y.personel_id = v_operator_id AND y.istasyon_id = NEW.istasyon_id
  ) THEN
    RAISE EXCEPTION 'Seçilen üretim istasyonu için yetki yok';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.uretim_istasyon_yetkisi_kontrol() FROM PUBLIC, anon, authenticated;
