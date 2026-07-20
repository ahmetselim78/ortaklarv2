-- 057 — Üretim İstasyonları RBAC modülünü dört istasyon ekranının ortak çatısı yap.
-- Poz Giriş, Kumanda Paneli, Gösterge Ekranı ve Tamir İstasyonu aynı rol yetkisiyle
-- açılır. Üretim Girişi istasyon kapsamı kişi bazlı kalmaya devam eder.

UPDATE public.permissions
SET description_tr = CASE action
  WHEN 'read' THEN 'Üretim İstasyonları bölümünü ve dört istasyon ekranının verilerini görüntüleme'
  WHEN 'update' THEN 'Poz Giriş, Kumanda Paneli, Gösterge Ekranı ve Tamir İstasyonu işlemlerini kullanma'
  WHEN 'manage' THEN 'Üretim İstasyonları tam yönetim'
  ELSE description_tr
END
WHERE module = 'production_stations';

-- Tamire gönderme ve Tamir İstasyonu işlemleri de aynı çatı yetkisiyle çalışır.
-- Okuma politikası 056 migration'ındaki station_screen_read ile zaten tanımlıdır.
DROP POLICY IF EXISTS station_screen_tamir_create ON public.tamir_kayitlari;
CREATE POLICY station_screen_tamir_create
  ON public.tamir_kayitlari
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('production_stations', 'update'));

DROP POLICY IF EXISTS station_screen_tamir_update ON public.tamir_kayitlari;
CREATE POLICY station_screen_tamir_update
  ON public.tamir_kayitlari
  FOR UPDATE TO authenticated
  USING (public.has_permission('production_stations', 'update'))
  WITH CHECK (public.has_permission('production_stations', 'update'));

DROP POLICY IF EXISTS station_screen_tamir_delete ON public.tamir_kayitlari;
CREATE POLICY station_screen_tamir_delete
  ON public.tamir_kayitlari
  FOR DELETE TO authenticated
  USING (public.has_permission('production_stations', 'update'));
