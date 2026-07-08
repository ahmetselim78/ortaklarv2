-- 041 — Telegram mesaj şablonu okunabilirlik iyileştirmesi

CREATE OR REPLACE FUNCTION public.telegram_saatlik_rapor_metni(
  p_tarih date,
  p_sablon jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_satir record;
  v_toplam_hedef integer := 0;
  v_toplam_gerceklesen integer := 0;
  v_toplam_fire integer := 0;
  v_performans numeric := 0;
  v_oran integer;
  v_sonuc text := '';
  v_baslik boolean := COALESCE((p_sablon->>'baslik')::boolean, true);
  v_detay_goster boolean := COALESCE((p_sablon->>'saatlik_detay')::boolean, true);
  v_ozet_goster boolean := COALESCE((p_sablon->>'saatlik_ozet')::boolean, true);
  v_satir_sayisi integer := 0;
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
    v_sonuc := v_sonuc || '📊 Saatlik Takip' || E'\n' || '──────────────────';
  END IF;

  IF v_detay_goster THEN
    SELECT COUNT(*)::integer INTO v_satir_sayisi
    FROM public.gunluk_uretim_takip
    WHERE tarih = p_tarih;

    IF v_satir_sayisi = 0 THEN
      v_sonuc := v_sonuc || E'\n\n' || 'Henüz veri girilmemiş.';
    ELSE
      FOR v_satir IN
        SELECT saat_araligi, hedef_adet, gerceklesen_adet, fire_adet
        FROM public.gunluk_uretim_takip
        WHERE tarih = p_tarih
        ORDER BY sira_no
      LOOP
        v_oran := CASE
          WHEN v_satir.hedef_adet > 0
            THEN ROUND((v_satir.gerceklesen_adet::numeric / v_satir.hedef_adet::numeric) * 100)::integer
          ELSE 0
        END;

        v_sonuc := v_sonuc || E'\n\n' ||
          '🕐 ' || replace(v_satir.saat_araligi, ' - ', ' – ') || E'\n' ||
          'Gerçekleşen: ' || v_satir.gerceklesen_adet || ' / ' || v_satir.hedef_adet ||
          ' (%' || v_oran || ')' || E'\n' ||
          '🔥 Fire: ' || v_satir.fire_adet;
      END LOOP;
    END IF;
  END IF;

  IF v_ozet_goster THEN
    v_sonuc := v_sonuc || E'\n\n' ||
      '📌 Gün Özeti' || E'\n' ||
      '✅ Gerçekleşen: ' || v_toplam_gerceklesen || ' adet' || E'\n' ||
      '🎯 Hedef: ' || v_toplam_hedef || ' adet' || E'\n' ||
      '🔥 Fire: ' || v_toplam_fire || ' adet' || E'\n' ||
      'Performans: %' || v_performans;
  END IF;

  RETURN NULLIF(trim(v_sonuc), '');
END
$$;

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
  v_kayit_no integer := 0;
  v_toplam_kayit integer := 0;
  v_baslik boolean := COALESCE((p_sablon->>'baslik')::boolean, true);
  v_istasyon_goster boolean := COALESCE((p_sablon->>'istasyonlar')::boolean, true);
  v_arac_goster boolean := COALESCE((p_sablon->>'araclar')::boolean, true);
  v_personel_goster boolean := COALESCE((p_sablon->>'personel')::boolean, true);
  v_operator_goster boolean := COALESCE((p_sablon->>'operator')::boolean, true);
  v_notlar_goster boolean := COALESCE((p_sablon->>'notlar')::boolean, true);
BEGIN
  SELECT COUNT(*)::integer INTO v_toplam_kayit
  FROM public.gunluk_uretim_raporlari
  WHERE tarih = p_tarih;

  IF v_toplam_kayit = 0 THEN
    IF v_baslik THEN
      RETURN '🏭 Üretim Girişi' || E'\n' || '──────────────────' || E'\n\n' || 'Henüz giriş yapılmamış.';
    END IF;
    RETURN 'Henüz giriş yapılmamış.';
  END IF;

  IF v_baslik THEN
    v_sonuc := '🏭 Üretim Girişi' || E'\n' || '──────────────────';
  END IF;

  FOR v_rapor IN
    SELECT
      r.id,
      r.toplam_personel,
      r.notlar,
      p.ad_soyad AS operator_adi
    FROM public.gunluk_uretim_raporlari r
    LEFT JOIN public.hr_personel p ON p.id = r.operator_id
    WHERE r.tarih = p_tarih
    ORDER BY r.created_at ASC
  LOOP
    v_kayit_no := v_kayit_no + 1;
    v_blok := '';

    IF v_operator_goster OR v_personel_goster THEN
      v_blok := E'\n\n';
      IF v_toplam_kayit > 1 THEN
        v_blok := v_blok || 'Kayıt ' || v_kayit_no || E'\n';
      END IF;
      IF v_operator_goster THEN
        v_blok := v_blok || '👤 ' || COALESCE(v_rapor.operator_adi, 'Bilinmiyor');
      END IF;
      IF v_operator_goster AND v_personel_goster THEN
        v_blok := v_blok || ' · ';
      END IF;
      IF v_personel_goster THEN
        v_blok := v_blok || '👥 ' || v_rapor.toplam_personel || ' personel';
      END IF;
    END IF;

    IF v_istasyon_goster THEN
      SELECT string_agg(
        format('• %s — %s adet%s', i.ad, k.adet,
          CASE WHEN k.fire_adet > 0 THEN ' (fire: ' || k.fire_adet || ')' ELSE '' END),
        E'\n'
        ORDER BY i.sira_no
      )
      INTO v_istasyon
      FROM public.gunluk_uretim_istasyon_kayitlari k
      JOIN public.uretim_istasyonlari i ON i.id = k.istasyon_id
      WHERE k.rapor_id = v_rapor.id;

      IF v_istasyon IS NOT NULL AND length(trim(v_istasyon)) > 0 THEN
        v_blok := v_blok || E'\n\n' || 'İstasyonlar' || E'\n' || v_istasyon;
      END IF;
    END IF;

    IF v_arac_goster THEN
      SELECT string_agg(
        format('• %s (%s) — %s adet',
          COALESCE(a.plaka, y.dis_arac_plakasi, '—'),
          COALESCE(a.ad, y.dis_arac_adi, 'Harici'),
          y.adet),
        E'\n'
        ORDER BY y.created_at
      )
      INTO v_arac
      FROM public.gunluk_uretim_arac_yuklemeleri y
      LEFT JOIN public.araclar a ON a.id = y.arac_id
      WHERE y.rapor_id = v_rapor.id;

      IF v_arac IS NOT NULL AND length(trim(v_arac)) > 0 THEN
        v_blok := v_blok || E'\n\n' || 'Araç Yüklemeleri' || E'\n' || v_arac;
      END IF;
    END IF;

    IF v_notlar_goster AND v_rapor.notlar IS NOT NULL AND length(trim(v_rapor.notlar)) > 0 THEN
      v_blok := v_blok || E'\n\n' || '📝 Not: ' || v_rapor.notlar;
    END IF;

    v_sonuc := v_sonuc || v_blok;

    IF v_kayit_no < v_toplam_kayit THEN
      v_sonuc := v_sonuc || E'\n\n' || '············';
    END IF;
  END LOOP;

  RETURN NULLIF(trim(v_sonuc), '');
END
$$;

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
  v_sonuc := '📋 Günlük Üretim Raporu' || E'\n' ||
    '━━━━━━━━━━━━━━━━━━' || E'\n' ||
    '📅 ' || to_char(p_tarih, 'DD.MM.YYYY') || ' · ' || p_saat;

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

REVOKE ALL ON FUNCTION public.telegram_saatlik_rapor_metni(date, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_uretim_giris_rapor_metni(date, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_rapor_mesaji(date, text, text, jsonb) FROM PUBLIC, anon, authenticated;
