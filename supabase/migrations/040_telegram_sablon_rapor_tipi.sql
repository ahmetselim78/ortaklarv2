-- 040 — Telegram rapor tipi ve mesaj bölüm ayarları
-- Her rapor saati için hangi verinin gönderileceği (saatlik / üretim girişi / ikisi)
-- ve mesajda hangi bölümlerin yer alacağı ayarlanabilir.

-- ── Rapor saatlerine tip ekle ────────────────────────────────────────────────
ALTER TABLE public.telegram_rapor_saatleri
  ADD COLUMN IF NOT EXISTS rapor_tipi text NOT NULL DEFAULT 'saatlik';

ALTER TABLE public.telegram_rapor_saatleri
  DROP CONSTRAINT IF EXISTS telegram_rapor_saatleri_rapor_tipi_check;

ALTER TABLE public.telegram_rapor_saatleri
  ADD CONSTRAINT telegram_rapor_saatleri_rapor_tipi_check
  CHECK (rapor_tipi IN ('saatlik', 'uretim_giris', 'her_ikisi'));

-- ── Mesaj bölüm ayarları (telegram_ayarlari singleton) ─────────────────────
ALTER TABLE public.telegram_ayarlari
  ADD COLUMN IF NOT EXISTS sablon_baslik boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sablon_saatlik_detay boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sablon_saatlik_ozet boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sablon_istasyonlar boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sablon_araclar boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sablon_personel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sablon_operator boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sablon_notlar boolean NOT NULL DEFAULT true;

-- ── Saatlik rapor metni ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.telegram_saatlik_rapor_metni(
  p_tarih date,
  p_sablon jsonb DEFAULT '{}'::jsonb
)
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
  v_sonuc text := '';
  v_baslik boolean := COALESCE((p_sablon->>'baslik')::boolean, true);
  v_detay_goster boolean := COALESCE((p_sablon->>'saatlik_detay')::boolean, true);
  v_ozet_goster boolean := COALESCE((p_sablon->>'saatlik_ozet')::boolean, true);
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

  IF v_baslik THEN
    v_sonuc := v_sonuc || '📊 Saatlik Üretim Takibi' || E'\n';
  END IF;

  IF v_detay_goster THEN
    SELECT string_agg(
      format(
        '  %s | Hedef: %s -> Gerceklesen: %s (%s%%) | Fire: %s',
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
      v_detay := '  Henuz veri girilmemis.';
    END IF;

    v_sonuc := v_sonuc || E'\n' || 'Saat Dilimi Detayi:' || E'\n' || v_detay;
  END IF;

  IF v_ozet_goster THEN
    v_sonuc := v_sonuc || E'\n\n' ||
      'Toplam Gerceklesen: ' || v_toplam_gerceklesen || ' adet' || E'\n' ||
      'Toplam Hedef: ' || v_toplam_hedef || ' adet' || E'\n' ||
      'Toplam Fire: ' || v_toplam_fire || ' adet' || E'\n' ||
      'Performans: %' || v_performans;
  END IF;

  RETURN NULLIF(trim(v_sonuc), '');
END
$$;

-- ── Üretim girişi rapor metni ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.telegram_uretim_giris_rapor_metni(
  p_tarih date,
  p_sablon jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_rapor record;
  v_istasyon text;
  v_arac text;
  v_blok text;
  v_sonuc text := '';
  v_baslik boolean := COALESCE((p_sablon->>'baslik')::boolean, true);
  v_istasyon_goster boolean := COALESCE((p_sablon->>'istasyonlar')::boolean, true);
  v_arac_goster boolean := COALESCE((p_sablon->>'araclar')::boolean, true);
  v_personel_goster boolean := COALESCE((p_sablon->>'personel')::boolean, true);
  v_operator_goster boolean := COALESCE((p_sablon->>'operator')::boolean, true);
  v_notlar_goster boolean := COALESCE((p_sablon->>'notlar')::boolean, true);
  v_kayit_sayisi integer := 0;
BEGIN
  SELECT COUNT(*)::integer
  INTO v_kayit_sayisi
  FROM public.gunluk_uretim_raporlari
  WHERE tarih = p_tarih;

  IF v_kayit_sayisi = 0 THEN
    IF v_baslik THEN
      RETURN '🏭 Operatör Giris Raporu' || E'\n' || 'Henuz giris yapilmamis.';
    END IF;
    RETURN 'Henuz giris yapilmamis.';
  END IF;

  IF v_baslik THEN
    v_sonuc := '🏭 Operatör Giris Raporu' || E'\n';
  END IF;

  FOR v_rapor IN
    SELECT
      r.id,
      r.toplam_personel,
      r.notlar,
      r.created_at,
      p.ad_soyad AS operator_adi
    FROM public.gunluk_uretim_raporlari r
    LEFT JOIN public.hr_personel p ON p.id = r.operator_id
    WHERE r.tarih = p_tarih
    ORDER BY r.created_at ASC
  LOOP
    v_blok := '';

    IF v_operator_goster OR v_personel_goster THEN
      v_blok := v_blok || E'\n' || '--- Giris Kaydi ---' || E'\n';
      IF v_operator_goster THEN
        v_blok := v_blok || 'Operatör: ' || COALESCE(v_rapor.operator_adi, 'Bilinmiyor') || E'\n';
      END IF;
      IF v_personel_goster THEN
        v_blok := v_blok || 'Personel: ' || v_rapor.toplam_personel || E'\n';
      END IF;
    END IF;

    IF v_istasyon_goster THEN
      SELECT string_agg(
        format('  %s: %s adet, Fire: %s', i.ad, k.adet, k.fire_adet),
        E'\n'
        ORDER BY i.sira_no
      )
      INTO v_istasyon
      FROM public.gunluk_uretim_istasyon_kayitlari k
      JOIN public.uretim_istasyonlari i ON i.id = k.istasyon_id
      WHERE k.rapor_id = v_rapor.id;

      IF v_istasyon IS NOT NULL AND length(trim(v_istasyon)) > 0 THEN
        v_blok := v_blok || E'\n' || 'Istasyonlar:' || E'\n' || v_istasyon || E'\n';
      END IF;
    END IF;

    IF v_arac_goster THEN
      SELECT string_agg(
        format(
          '  %s (%s): %s adet',
          COALESCE(a.plaka, y.dis_arac_plakasi, '—'),
          COALESCE(a.ad, y.dis_arac_adi, 'Harici'),
          y.adet
        ),
        E'\n'
        ORDER BY y.created_at
      )
      INTO v_arac
      FROM public.gunluk_uretim_arac_yuklemeleri y
      LEFT JOIN public.araclar a ON a.id = y.arac_id
      WHERE y.rapor_id = v_rapor.id;

      IF v_arac IS NOT NULL AND length(trim(v_arac)) > 0 THEN
        v_blok := v_blok || E'\n' || 'Arac Yuklemeleri:' || E'\n' || v_arac || E'\n';
      END IF;
    END IF;

    IF v_notlar_goster AND v_rapor.notlar IS NOT NULL AND length(trim(v_rapor.notlar)) > 0 THEN
      v_blok := v_blok || E'\n' || 'Notlar: ' || v_rapor.notlar || E'\n';
    END IF;

    v_sonuc := v_sonuc || v_blok;
  END LOOP;

  RETURN NULLIF(trim(v_sonuc), '');
END
$$;

-- ── Birleşik rapor metni ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.telegram_rapor_mesaji(
  p_tarih date,
  p_saat text,
  p_rapor_tipi text DEFAULT 'saatlik',
  p_sablon jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_saatlik text;
  v_giris text;
  v_sonuc text;
BEGIN
  v_sonuc := 'Gunluk Uretim Raporu' || E'\n' ||
    to_char(p_tarih, 'DD.MM.YYYY') || ' - ' || p_saat || ' Raporu';

  IF p_rapor_tipi IN ('saatlik', 'her_ikisi') THEN
    v_saatlik := public.telegram_saatlik_rapor_metni(p_tarih, p_sablon);
    IF v_saatlik IS NOT NULL THEN
      v_sonuc := v_sonuc || E'\n\n' || v_saatlik;
    END IF;
  END IF;

  IF p_rapor_tipi IN ('uretim_giris', 'her_ikisi') THEN
    v_giris := public.telegram_uretim_giris_rapor_metni(p_tarih, p_sablon);
    IF v_giris IS NOT NULL THEN
      v_sonuc := v_sonuc || E'\n\n' || v_giris;
    END IF;
  END IF;

  RETURN v_sonuc;
END
$$;

-- ── Otomatik gönderim fonksiyonunu güncelle ─────────────────────────────────
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
  v_rapor_saati public.telegram_rapor_saatleri%ROWTYPE;
  v_mesaj text;
  v_sablon jsonb;
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

  SELECT *
  INTO v_rapor_saati
  FROM public.telegram_rapor_saatleri
  WHERE aktif = true
    AND public.telegram_saat_normalize(saat) = v_saat
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'mesaj', v_saat || ' saati icin rapor zamani degil');
  END IF;

  INSERT INTO public.telegram_rapor_log (tarih, saat)
  VALUES (v_tarih, v_saat)
  ON CONFLICT (tarih, saat) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'mesaj', v_tarih::text || ' ' || v_saat || ' raporu zaten gonderildi');
  END IF;

  v_sablon := jsonb_build_object(
    'baslik', COALESCE(v_ayar.sablon_baslik, true),
    'saatlik_detay', COALESCE(v_ayar.sablon_saatlik_detay, true),
    'saatlik_ozet', COALESCE(v_ayar.sablon_saatlik_ozet, true),
    'istasyonlar', COALESCE(v_ayar.sablon_istasyonlar, true),
    'araclar', COALESCE(v_ayar.sablon_araclar, true),
    'personel', COALESCE(v_ayar.sablon_personel, true),
    'operator', COALESCE(v_ayar.sablon_operator, true),
    'notlar', COALESCE(v_ayar.sablon_notlar, true)
  );

  v_mesaj := public.telegram_rapor_mesaji(
    v_tarih,
    v_saat,
    COALESCE(v_rapor_saati.rapor_tipi, 'saatlik'),
    v_sablon
  );

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
    'rapor_tipi', COALESCE(v_rapor_saati.rapor_tipi, 'saatlik'),
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

REVOKE ALL ON FUNCTION public.telegram_saatlik_rapor_metni(date, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_uretim_giris_rapor_metni(date, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_rapor_mesaji(date, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_otomatik_rapor_gonder() FROM PUBLIC, anon, authenticated;
