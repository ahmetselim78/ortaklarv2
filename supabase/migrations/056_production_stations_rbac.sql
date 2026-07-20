-- 056 — Poz Giriş ve Kumanda Paneli için bağımsız RBAC modülü
-- Üretim Girişi istasyon kapsamı kişi bazlı kalır; bu migration yalnızca
-- Sidebar'daki Üretim İstasyonları bölümü ve içindeki operasyon ekranlarını ayırır.

-- Yanlış yorumla yerel ortama uygulanmış olabilecek rol-istasyon kapsamını temizle.
DROP POLICY IF EXISTS role_management_production_stations_read ON public.uretim_istasyonlari;
DROP TABLE IF EXISTS public.role_production_station_permissions CASCADE;
ALTER TABLE public.roles DROP COLUMN IF EXISTS production_stations_limited;
DROP FUNCTION IF EXISTS public.my_authorized_production_stations();
DROP FUNCTION IF EXISTS public.personnel_has_production_station_access(uuid, uuid);

-- Üretim Girişi istasyon denetimini yeniden yalnızca Personel Yönetimi'ndeki
-- kişi bazlı ayara bağla.
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
  SELECT report.operator_id INTO v_operator_id
  FROM public.gunluk_uretim_raporlari report
  WHERE report.id = NEW.rapor_id;

  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'Üretim raporu veya operatör bulunamadı';
  END IF;

  IF NOT public.has_permission('production_entry', 'manage')
     AND v_operator_id <> public.current_personel_id() THEN
    RAISE EXCEPTION 'Başka kullanıcı adına üretim kaydı oluşturulamaz';
  END IF;

  SELECT personnel.uretim_yetkileri_sinirli INTO v_sinirli
  FROM public.hr_personel personnel
  WHERE personnel.id = v_operator_id;

  IF COALESCE(v_sinirli, false) AND NOT EXISTS (
    SELECT 1
    FROM public.hr_personel_istasyon_yetkileri personnel_station
    WHERE personnel_station.personel_id = v_operator_id
      AND personnel_station.istasyon_id = NEW.istasyon_id
  ) THEN
    RAISE EXCEPTION 'Seçilen üretim istasyonu için yetki yok';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.uretim_istasyon_yetkisi_kontrol() FROM PUBLIC, anon, authenticated;

-- Rol kaydetme RPC'sini yalnız modül izinlerini yöneten 055 sürümüne döndür.
CREATE OR REPLACE FUNCTION public.admin_set_role_permissions(p_changes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_change jsonb;
  v_role_id uuid;
  v_permission_ids uuid[];
  v_role_slug text;
BEGIN
  IF NOT public.is_admin_aal2() THEN
    RAISE EXCEPTION 'AAL2 yönetici yetkisi gerekli';
  END IF;

  IF jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) > 100 THEN
    RAISE EXCEPTION 'Geçersiz rol yetkisi değişiklikleri';
  END IF;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    BEGIN
      v_role_id := (v_change ->> 'role_id')::uuid;
      SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
      INTO v_permission_ids
      FROM jsonb_array_elements_text(COALESCE(v_change -> 'permission_ids', '[]'::jsonb));
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Geçersiz rol veya yetki kimliği';
    END;

    SELECT slug INTO v_role_slug
    FROM public.roles
    WHERE id = v_role_id
    FOR UPDATE;

    IF v_role_slug IS NULL THEN
      RAISE EXCEPTION 'Rol bulunamadı';
    END IF;

    IF cardinality(v_permission_ids) <> (
      SELECT count(DISTINCT permission_id)::integer
      FROM unnest(v_permission_ids) AS requested(permission_id)
    ) THEN
      RAISE EXCEPTION 'Aynı yetki birden fazla kez gönderilemez';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_permission_ids) AS requested(permission_id)
      LEFT JOIN public.permissions permission ON permission.id = requested.permission_id
      WHERE permission.id IS NULL
    ) THEN
      RAISE EXCEPTION 'Bilinmeyen yetki seçildi';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.permissions selected_permission
      WHERE selected_permission.id = ANY(v_permission_ids)
        AND selected_permission.action <> 'read'
        AND NOT EXISTS (
          SELECT 1
          FROM public.permissions read_permission
          WHERE read_permission.id = ANY(v_permission_ids)
            AND read_permission.module = selected_permission.module
            AND read_permission.action = 'read'
        )
    ) THEN
      RAISE EXCEPTION 'Görüntüleme yetkisi olmadan üst aşama yetkisi eklenemez';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.permissions manage_permission
      WHERE manage_permission.id = ANY(v_permission_ids)
        AND manage_permission.action = 'manage'
        AND EXISTS (
          SELECT 1
          FROM public.permissions module_permission
          WHERE module_permission.module = manage_permission.module
            AND NOT (module_permission.id = ANY(v_permission_ids))
        )
    ) THEN
      RAISE EXCEPTION 'Tam yönetim yetkisi modülün tüm aşamalarını içermelidir';
    END IF;

    IF v_role_slug = 'administrator' AND NOT EXISTS (
      SELECT 1
      FROM public.permissions permission
      WHERE permission.id = ANY(v_permission_ids)
        AND permission.module = 'admin'
        AND permission.action = 'manage'
    ) THEN
      RAISE EXCEPTION 'Yönetici rolünün admin/manage izni kaldırılamaz';
    END IF;

    DELETE FROM public.role_permissions role_permission
    WHERE role_permission.role_id = v_role_id
      AND NOT (role_permission.permission_id = ANY(v_permission_ids));

    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, requested.permission_id
    FROM unnest(v_permission_ids) AS requested(permission_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_role_permissions(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role_permissions(jsonb) TO authenticated;

-- Birleşik anahtarlı audit kayıtlarını 049'daki genel davranışa döndür.
CREATE OR REPLACE FUNCTION public.audit_record_id(p_row jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    p_row ->> 'id',
    p_row ->> 'auth_user_id',
    NULLIF(concat_ws(':', p_row ->> 'role_id', p_row ->> 'permission_id'), ''),
    p_row ->> 'anahtar',
    md5(p_row::text)
  )
$$;

-- Bu ekranlarda kayıt oluşturma/silme yoktur. Görüntüleme ekran verisini okur;
-- Düzenleme ise Poz Giriş taraması ve Kumanda operasyonlarını çalıştırır.
INSERT INTO public.permissions (module, action, description_tr)
VALUES
  ('production_stations', 'read', 'Üretim İstasyonları bölümünü ve operasyon verilerini görüntüleme'),
  ('production_stations', 'update', 'Poz Giriş ve Kumanda Paneli işlemlerini kullanma'),
  ('production_stations', 'manage', 'Üretim İstasyonları tam yönetim')
ON CONFLICT (module, action) DO UPDATE SET description_tr = EXCLUDED.description_tr;

-- Mevcut erişimi kırmamak için eski production izinlerinden birebir başlangıç
-- kapsamı türetilir. Sonrasında iki modül Rol Yönetimi'nden bağımsız değiştirilebilir.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT role_permission.role_id, station_permission.id
FROM public.role_permissions role_permission
JOIN public.permissions old_permission
  ON old_permission.id = role_permission.permission_id
 AND old_permission.module = 'production'
JOIN public.permissions station_permission
  ON station_permission.module = 'production_stations'
 AND (
   (station_permission.action = 'read' AND old_permission.action IN ('read', 'manage'))
   OR (station_permission.action = 'update' AND old_permission.action IN ('update', 'manage'))
   OR (station_permission.action = 'manage' AND old_permission.action = 'manage')
 )
ON CONFLICT DO NOTHING;

-- Poz Giriş ve Kumanda'nın ekranda gösterdiği bağlı kayıtlar.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'ayarlar', 'cari', 'stok', 'siparisler', 'siparis_detaylari',
    'uretim_emirleri', 'uretim_emri_detaylari', 'yikama_loglari',
    'tamir_kayitlari', 'gunluk_uretim_takip'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS station_screen_read ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY station_screen_read ON public.%I FOR SELECT TO authenticated USING (public.has_permission(%L, %L))',
      v_table, 'production_stations', 'read'
    );
  END LOOP;
END
$$;

-- Poz Giriş yalnız üretim/sipariş durumlarını ve yıkanan satırı günceller.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['siparisler', 'siparis_detaylari', 'uretim_emirleri'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS station_screen_update ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY station_screen_update ON public.%I FOR UPDATE TO authenticated USING (public.has_permission(%L, %L)) WITH CHECK (public.has_permission(%L, %L))',
      v_table, 'production_stations', 'update', 'production_stations', 'update'
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS station_screen_create ON public.yikama_loglari;
CREATE POLICY station_screen_create
  ON public.yikama_loglari
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('production_stations', 'update'));

-- Poz Giriş taramasındaki saatlik sayacı ayrı hourly_tracking izni istemeden,
-- yalnız bu operasyon yetkisiyle güvenli parametre sınırları içinde artırabilir.
CREATE OR REPLACE FUNCTION public.saatlik_sayac_arttir(p_id uuid, p_delta integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deger integer;
BEGIN
  IF (
    NOT public.has_permission('hourly_tracking', 'update')
    AND NOT public.has_permission('production_stations', 'update')
  ) OR abs(p_delta) > 1000 THEN
    RAISE EXCEPTION 'Saatlik sayaç için yetki veya parametre geçersiz';
  END IF;

  UPDATE public.gunluk_uretim_takip
  SET gerceklesen_adet = GREATEST(0, gerceklesen_adet + p_delta)
  WHERE id = p_id
  RETURNING gerceklesen_adet INTO v_deger;

  IF v_deger IS NULL THEN
    RAISE EXCEPTION 'Kayıt bulunamadı';
  END IF;
  RETURN v_deger;
END;
$$;

REVOKE ALL ON FUNCTION public.saatlik_sayac_arttir(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saatlik_sayac_arttir(uuid, integer) TO authenticated;
