-- ACIL UYUMLULUK HOTFIX'I
--
-- Uzak veritabani 046-052 migration'larini almisken eski (045) frontend'i
-- tekrar calistirmak icindir. 046-052'nin olusturdugu tablo veya kayitlari silmez.
-- Supabase SQL Editor'da TEK SEFER calistirin.
--
-- ONEMLI:
-- 1. Bu script eski uygulamanin genis anon erisim modelini gecici olarak geri acar.
-- 2. 052 tarafindan silinen Telegram bot_token/chat_id degerleri kurtarilamaz.
--    Kolonlar yeniden olusturulur fakat degerler bos kalir.
-- 3. `supabase migration repair` bu SQL'in yerine gecmez; sadece history tablosunu degistirir.
-- 4. Calistirmadan once yedek/restore kanitini ve hedef project ref'ini iki kisi
--    dogrulamalidir. Asagidaki SET LOCAL satiri ancak bu kontrolden sonra acilmalidir.

BEGIN;

-- SET LOCAL ortaklar.allow_legacy_emergency_access = '046_ONCESI_UYUMLULUGU_AC';

DO $guard$
BEGIN
  IF current_setting('ortaklar.allow_legacy_emergency_access', true)
       IS DISTINCT FROM '046_ONCESI_UYUMLULUGU_AC' THEN
    RAISE EXCEPTION
      'Guvenlik durdurmasi: yedek, hedef proje ve iki kisi onayi dogrulanmadan legacy erisim acilamaz';
  END IF;
END
$guard$;

-- Eski frontend'in sorguladigi Telegram kolonlarini geri getir.
ALTER TABLE public.telegram_ayarlari
  ADD COLUMN IF NOT EXISTS bot_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS chat_id text NOT NULL DEFAULT '';

-- 048'in kaldirdigi eski Data API erisimini geri ac.
-- Yeni Auth/RBAC tablolari bu listeye dahil degildir ve korunur.
DO $$
DECLARE
  v_table text;
  v_policy record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cari','stok','siparisler','siparis_detaylari','uretim_emirleri',
    'uretim_emri_detaylari','yikama_loglari','sayaclar','tamir_kayitlari',
    'ayarlar','takvim_notlari','araclar','sevkiyat_planlari','hr_personel',
    'uretim_saat_sablonlari','uretim_saatlik_hedefler','gunluk_uretim_takip',
    'telegram_ayarlari','telegram_rapor_saatleri','telegram_rapor_log',
    'uretim_istasyonlari','gunluk_uretim_raporlari',
    'gunluk_uretim_istasyon_kayitlari','gunluk_uretim_arac_yuklemeleri',
    'hr_personel_istasyon_yetkileri'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

      FOR v_policy IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = v_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY legacy_emergency_access ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
        v_table
      );
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated',
        v_table
      );
    END IF;
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 006'daki eski atomik sayac davranisi.
CREATE OR REPLACE FUNCTION public.sonraki_sayac(
  p_anahtar text,
  p_adet integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  yeni_deger integer;
BEGIN
  INSERT INTO public.sayaclar (anahtar, deger)
  VALUES (p_anahtar, p_adet)
  ON CONFLICT (anahtar)
  DO UPDATE SET deger = public.sayaclar.deger + p_adet
  RETURNING deger INTO yeni_deger;

  RETURN yeni_deger;
END
$$;

-- 030'daki eski saatlik sayac RPC'leri.
CREATE OR REPLACE FUNCTION public.saatlik_sayac_arttir(
  p_id uuid,
  p_delta integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yeni_deger integer;
BEGIN
  UPDATE public.gunluk_uretim_takip
  SET gerceklesen_adet = GREATEST(0, gerceklesen_adet + p_delta)
  WHERE id = p_id
  RETURNING gerceklesen_adet INTO yeni_deger;

  IF yeni_deger IS NULL THEN
    RAISE EXCEPTION 'gunluk_uretim_takip satiri bulunamadi: %', p_id;
  END IF;

  RETURN yeni_deger;
END
$$;

CREATE OR REPLACE FUNCTION public.saatlik_fire_arttir(
  p_id uuid,
  p_delta integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yeni_deger integer;
BEGIN
  UPDATE public.gunluk_uretim_takip
  SET fire_adet = GREATEST(0, fire_adet + p_delta)
  WHERE id = p_id
  RETURNING fire_adet INTO yeni_deger;

  IF yeni_deger IS NULL THEN
    RAISE EXCEPTION 'gunluk_uretim_takip satiri bulunamadi: %', p_id;
  END IF;

  RETURN yeni_deger;
END
$$;

GRANT EXECUTE ON FUNCTION public.sonraki_sayac(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saatlik_sayac_arttir(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saatlik_fire_arttir(uuid, integer) TO anon, authenticated;

-- 045'teki personel-istasyon kontrolunu geri yukle.
CREATE OR REPLACE FUNCTION public.uretim_istasyon_yetkisi_kontrol()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_id uuid;
  v_sinirli boolean;
BEGIN
  SELECT r.operator_id
  INTO v_operator_id
  FROM public.gunluk_uretim_raporlari r
  WHERE r.id = NEW.rapor_id;

  IF v_operator_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.uretim_yetkileri_sinirli
  INTO v_sinirli
  FROM public.hr_personel p
  WHERE p.id = v_operator_id;

  IF COALESCE(v_sinirli, false)
     AND NOT EXISTS (
       SELECT 1
       FROM public.hr_personel_istasyon_yetkileri y
       WHERE y.personel_id = v_operator_id
         AND y.istasyon_id = NEW.istasyon_id
     ) THEN
    RAISE EXCEPTION 'Bu personelin secilen uretim istasyonu icin giris yetkisi yok.';
  END IF;

  RETURN NEW;
END
$$;

-- 043'teki Telegram cron fonksiyonunu sema olarak geri getir.
-- Token/chat ID ve telegram_edge_config degerleri kullanici tarafindan yeniden girilmelidir.
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
  v_apikey text;
  v_request_id bigint;
BEGIN
  SELECT * INTO v_ayar
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

  SELECT deger INTO v_config
  FROM public.ayarlar
  WHERE anahtar = 'telegram_edge_config'
  LIMIT 1;

  v_url := nullif(trim(COALESCE(v_config->>'url', '')), '');
  v_auth := nullif(trim(COALESCE(v_config->>'authorization', '')), '');
  v_apikey := nullif(trim(COALESCE(v_config->>'apikey', v_auth)), '');

  IF v_url IS NULL OR v_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'mesaj', 'telegram_edge_config eksik');
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', v_auth,
      'apikey', v_apikey,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

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

REVOKE ALL ON FUNCTION public.telegram_otomatik_rapor_gonder()
  FROM PUBLIC, anon, authenticated;

COMMIT;

-- Basarili calisma sonrasi yalnizca bir durum satiri dondurur.
SELECT
  'compatibility_hotfix_applied' AS status,
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hr_personel'
      AND policyname = 'legacy_emergency_access'
  ) AS legacy_access_ready,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'telegram_ayarlari'
      AND column_name = 'bot_token'
  ) AS telegram_columns_restored;
