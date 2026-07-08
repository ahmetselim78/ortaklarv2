-- 042 — Telegram otomatik rapor: tek gönderim yolu (edge function)
-- Cron artık SQL içinde mesaj üretmez; check-and-send-report edge function'ını çağırır.
-- Böylece Test Gönder ile otomatik rapor aynı MarkdownV2 formatını kullanır.
--
-- KURULUM (bir kez):
-- 1. Edge function deploy: supabase functions deploy check-and-send-report
-- 2. Aşağıdaki ayarı kendi proje bilgilerinizle kaydedin:
--
-- INSERT INTO public.ayarlar (anahtar, deger)
-- VALUES (
--   'telegram_edge_config',
--   jsonb_build_object(
--     'url', 'https://[PROJECT_REF].supabase.co/functions/v1/check-and-send-report',
--     'authorization', 'Bearer [SERVICE_ROLE_KEY]'
--   )
-- )
-- ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger;
--
-- [PROJECT_REF]     = Dashboard → Settings → General → Reference ID
-- [SERVICE_ROLE_KEY] = Dashboard → Settings → API → service_role

CREATE OR REPLACE FUNCTION public.telegram_otomatik_rapor_gonder()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_simdi_tr timestamp := timezone('Europe/Istanbul', now());
  v_saat text := to_char(v_simdi_tr, 'HH24:MI');
  v_ayar public.telegram_ayarlari%ROWTYPE;
  v_config jsonb;
  v_url text;
  v_auth text;
  v_request_id bigint;
BEGIN
  SELECT *
  INTO v_ayar
  FROM public.telegram_ayarlari
  ORDER BY olusturma ASC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'mesaj', 'telegram_ayarlari kaydi bulunamadi');
  END IF;

  IF NOT COALESCE(v_ayar.aktif, false) THEN
    RETURN jsonb_build_object('ok', false, 'mesaj', 'Telegram raporu pasif');
  END IF;

  IF length(trim(COALESCE(v_ayar.bot_token, ''))) = 0
     OR length(trim(COALESCE(v_ayar.chat_id, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'mesaj', 'bot_token veya chat_id tanimli degil');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.telegram_rapor_saatleri
    WHERE aktif = true
      AND public.telegram_saat_normalize(saat) = v_saat
  ) THEN
    RETURN jsonb_build_object('ok', false, 'mesaj', v_saat || ' saati icin rapor zamani degil');
  END IF;

  SELECT deger
  INTO v_config
  FROM public.ayarlar
  WHERE anahtar = 'telegram_edge_config'
  LIMIT 1;

  v_url := nullif(trim(COALESCE(v_config->>'url', '')), '');
  v_auth := nullif(trim(COALESCE(v_config->>'authorization', '')), '');

  IF v_url IS NULL OR v_auth IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'mesaj', 'telegram_edge_config ayari eksik. Migration 042 basligindaki INSERT ornegini uygulayin.'
    );
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', v_auth,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  )
  INTO v_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'mesaj', 'Edge function kuyruga alindi',
    'saat', v_saat,
    'request_id', v_request_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'mesaj', SQLERRM);
END
$$;

REVOKE ALL ON FUNCTION public.telegram_otomatik_rapor_gonder() FROM PUBLIC, anon, authenticated;
