-- 064 — Cihaz oturumu zorlaması ve private üretim istasyonu Realtime yetkisi.
-- Üretimde yalnız 063 en az yedi gün gözlem modunda çalıştıktan ve Auth sözleşme
-- testleri geçtikten sonra uygulanmalıdır.

UPDATE public.device_session_settings SET
  enforcement_mode = 'enforce',
  enforcement_started_at = COALESCE(enforcement_started_at, now()),
  revocation_enabled = true,
  updated_at = now()
WHERE singleton;

-- uretim-istasyonlar kanalı istemcide de config.private=true ile açılır.
-- Realtime yetkileri kanal katılımında ve yeni JWT gönderildiğinde değerlendirilir.
DROP POLICY IF EXISTS production_stations_private_broadcast_read ON realtime.messages;
CREATE POLICY production_stations_private_broadcast_read
  ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (SELECT realtime.topic()) = 'uretim-istasyonlar'
    AND public.current_session_is_active()
    AND public.has_permission('production_stations', 'update')
  );

DROP POLICY IF EXISTS production_stations_private_broadcast_write ON realtime.messages;
CREATE POLICY production_stations_private_broadcast_write
  ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT realtime.topic()) = 'uretim-istasyonlar'
    AND public.current_session_is_active()
    AND public.has_permission('production_stations', 'update')
  );

COMMENT ON FUNCTION public.current_session_is_active() IS
  'Yalnız uygulama session tablosundaki indeksli aktif kaydı kontrol eder; normal RLS yolunda auth.sessions sorgulamaz.';
