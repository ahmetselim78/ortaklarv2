-- 035 - Telegram otomatik rapor cron duzeltmesi
-- Rapor saatleri panele kaydedildikten sonra veritabaninin her dakika
-- kontrol edip Telegram'a rapor gondermesini saglar.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.telegram_saat_normalize(p_saat text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_saat IS NULL THEN NULL
    WHEN trim(p_saat) ~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$'
      THEN lpad(split_part(trim(p_saat), ':', 1), 2, '0') || ':' || split_part(trim(p_saat), ':', 2)
    ELSE NULL
  END
$$;

UPDATE public.telegram_rapor_saatleri
SET saat = public.telegram_saat_normalize(saat)
WHERE public.telegram_saat_normalize(saat) IS NOT NULL
  AND saat IS DISTINCT FROM public.telegram_saat_normalize(saat);

CREATE OR REPLACE FUNCTION public.telegram_rapor_mesaji(p_tarih date, p_saat text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_toplam_hedef integer := 0;
  v_toplam_gerceklesen integer := 0;
  v_toplam_fire integer := 0;
  v_performans numeric := 0;
  v_detay text;
BEGIN
  SELECT
    COALESCE(SUM(hedef_adet), 0)::integer,
    COALESCE(SUM(gerceklesen_adet), 0)::integer,
    COALESCE(SUM(fire_adet), 0)::integer
  INTO v_toplam_hedef, v_toplam_gerceklesen, v_toplam_fire
  FROM public.gunluk_uretim_takip
  WHERE tarih = p_tarih;

  IF v_toplam_hedef > 0 THEN
    v_performans := ROUND((v_toplam_gerceklesen::numeric / v_toplam_hedef::numeric) * 100, 1);
  END IF;

  SELECT string_agg(
    format(
      '%s | Hedef: %s -> Gerceklesen: %s (%s%%) | Fire: %s',
      saat_araligi,
      hedef_adet,
      gerceklesen_adet,
      CASE WHEN hedef_adet > 0 THEN ROUND((gerceklesen_adet::numeric / hedef_adet::numeric) * 100)::text ELSE '0' END,
      fire_adet
    ),
    E'\n'
    ORDER BY sira_no
  )
  INTO v_detay
  FROM public.gunluk_uretim_takip
  WHERE tarih = p_tarih;

  IF v_detay IS NULL OR length(trim(v_detay)) = 0 THEN
    v_detay := 'Henuz veri girilmemis.';
  END IF;

  RETURN concat(
    'Gunluk Uretim Raporu', E'\n',
    to_char(p_tarih, 'DD.MM.YYYY'), ' - ', p_saat, ' Raporu', E'\n\n',
    'Saat Dilimi Detayi:', E'\n',
    v_detay, E'\n\n',
    'Toplam Gerceklesen: ', v_toplam_gerceklesen, ' adet', E'\n',
    'Toplam Hedef: ', v_toplam_hedef, ' adet', E'\n',
    'Toplam Fire: ', v_toplam_fire, ' adet', E'\n',
    'Performans: %', v_performans
  );
END
$$;

CREATE OR REPLACE FUNCTION public.telegram_otomatik_rapor_gonder()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_simdi_tr timestamp := timezone('Europe/Istanbul', now());
  v_tarih date := v_simdi_tr::date;
  v_saat text := to_char(v_simdi_tr, 'HH24:MI');
  v_ayar public.telegram_ayarlari%ROWTYPE;
  v_mesaj text;
  v_request_id bigint;
  v_inserted integer := 0;
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

  IF length(trim(COALESCE(v_ayar.bot_token, ''))) = 0 OR length(trim(COALESCE(v_ayar.chat_id, ''))) = 0 THEN
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

  INSERT INTO public.telegram_rapor_log (tarih, saat)
  VALUES (v_tarih, v_saat)
  ON CONFLICT (tarih, saat) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'mesaj', v_tarih::text || ' ' || v_saat || ' raporu zaten gonderildi');
  END IF;

  v_mesaj := public.telegram_rapor_mesaji(v_tarih, v_saat);

  SELECT net.http_post(
    url := 'https://api.telegram.org/bot' || trim(v_ayar.bot_token) || '/sendMessage',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'chat_id', trim(v_ayar.chat_id),
      'text', v_mesaj
    ),
    timeout_milliseconds := 10000
  )
  INTO v_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'mesaj', 'Telegram raporu kuyruga alindi',
    'tarih', v_tarih,
    'saat', v_saat,
    'request_id', v_request_id
  );
EXCEPTION WHEN OTHERS THEN
  IF v_inserted > 0 THEN
    DELETE FROM public.telegram_rapor_log
    WHERE tarih = v_tarih
      AND saat = v_saat;
  END IF;

  RETURN jsonb_build_object('ok', false, 'mesaj', SQLERRM);
END
$$;

REVOKE ALL ON FUNCTION public.telegram_rapor_mesaji(date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_otomatik_rapor_gonder() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('telegram-rapor-gonder');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'telegram-rapor-gonder',
  '* * * * *',
  $$SELECT public.telegram_otomatik_rapor_gonder();$$
);
