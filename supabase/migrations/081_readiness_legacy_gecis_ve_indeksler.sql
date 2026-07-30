-- 081 - Readiness kapısı, feature-mode durum makinesi ve legacy geçiş yardımcıları

INSERT INTO public.ticari_kurulum_durumlari (
  kontrol_kodu, kontrol_turu, aciklama, kritik
)
VALUES
  ('stok_siniflandirmasi', 'manuel', 'Aktif stokların ticari kapsam sınıflandırması doğrulandı', true),
  ('dormant_cariler', 'manuel', 'Aktif olmayan/dormant cariler gözden geçirildi', true),
  ('acilis_bakiyeleri', 'manuel', 'Açılış bakiyeleri veya sıfır bakiye durumu onaylandı', true),
  ('yetki_atamalari', 'manuel', 'Pricing ve finance rol atamaları doğrulandı', true),
  ('kullanici_egitimi', 'manuel', 'Kullanıcı eğitimi tamamlandı', true),
  ('test_guvenlik_build', 'manuel', 'Test, security ve build sonuçları onaylandı', true),
  ('staging_performansi', 'manuel', '1.000/5.000 satır staging performansı onaylandı', true),
  ('kdv_dagitim_politikasi', 'manuel', 'KDV dağıtım politikası mali müşavir/işletme tarafından onaylandı', true),
  ('golge_kabul_raporu', 'manuel', 'Gölge çalışma kabul raporu onaylandı', true)
ON CONFLICT (kontrol_kodu) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ticari_modul_readiness()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_bugun date := (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
  v_kontrol jsonb;
  v_kontroller jsonb;
  v_hash_girdisi jsonb;
  v_kritik_eksik integer;
  v_hash text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_permission('pricing', 'read')
    OR public.has_permission('admin', 'manage')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'READINESS_YETKISI_GEREKLI';
  END IF;

  DROP TABLE IF EXISTS pg_temp.ticari_readiness_runtime;
  CREATE TEMP TABLE ticari_readiness_runtime (
    kontrol_kodu text PRIMARY KEY,
    aciklama text NOT NULL,
    basarili boolean NOT NULL,
    kritik boolean NOT NULL,
    detay jsonb NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT
    'satis_fiyati_kapsami',
    'Satılabilir aktif ürünlerin yayınlanmış ana satış fiyatı',
    count(*) = 0,
    true,
    jsonb_build_object(
      'eksik_sayisi', count(*),
      'ornekler', COALESCE(jsonb_agg(jsonb_build_object('stok_id', stok_row.id, 'kod', stok_row.kod))
        FILTER (WHERE stok_row.id IS NOT NULL), '[]'::jsonb)
    )
  FROM public.stok stok_row
  WHERE stok_row.aktif
    AND stok_row.ticari_kapsam IN ('satilabilir', 'her_ikisi')
    AND NOT EXISTS (
      SELECT 1
      FROM public.fiyat_listeleri liste
      JOIN public.fiyat_listesi_surmleri surum ON surum.fiyat_listesi_id = liste.id
      JOIN public.fiyat_listesi_urun_kalemleri kalem
        ON kalem.fiyat_listesi_surumu_id = surum.id
      WHERE liste.aktif AND liste.tur = 'ana'
        AND surum.durum = 'yayinda'
        AND surum.gecerli_baslangic <= v_bugun
        AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= v_bugun)
        AND kalem.aktif
        AND kalem.kapsam_tipi = 'stok'
        AND kalem.stok_id = stok_row.id
        AND kalem.birim_fiyat IS NOT NULL
    );

  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT
    'recete_kapsami',
    'Satılabilir aktif ürünlerin yayınlanmış reçetesi',
    count(*) = 0,
    true,
    jsonb_build_object('eksik_sayisi', count(*))
  FROM public.stok stok_row
  WHERE stok_row.aktif
    AND stok_row.ticari_kapsam IN ('satilabilir', 'her_ikisi')
    AND NOT EXISTS (
      SELECT 1
      FROM public.urun_maliyet_receteleri recete
      JOIN public.urun_maliyet_recete_surmleri surum
        ON surum.urun_maliyet_recetesi_id = recete.id
      WHERE recete.stok_id = stok_row.id
        AND recete.aktif
        AND surum.durum = 'yayinda'
        AND surum.gecerli_baslangic <= v_bugun
        AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= v_bugun)
    );

  INSERT INTO pg_temp.ticari_readiness_runtime
  WITH varsayilan_maliyet AS (
    SELECT surum.id
    FROM public.maliyet_tarifeleri tarife
    JOIN public.maliyet_tarife_surmleri surum
      ON surum.maliyet_tarifesi_id = tarife.id
    WHERE tarife.aktif AND tarife.varsayilan
      AND surum.durum = 'yayinda'
      AND surum.gecerli_baslangic <= v_bugun
      AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= v_bugun)
    LIMIT 1
  ),
  eksik AS (
    SELECT kalem.id
    FROM public.urun_maliyet_recete_surmleri surum
    JOIN public.urun_maliyet_recete_kalemleri kalem
      ON kalem.urun_maliyet_recete_surumu_id = surum.id
    CROSS JOIN varsayilan_maliyet vm
    WHERE surum.durum = 'yayinda'
      AND surum.gecerli_baslangic <= v_bugun
      AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= v_bugun)
      AND (
        (
          kalem.bilesen_turu = 'stok'
          AND NOT EXISTS (
            SELECT 1 FROM public.maliyet_stok_kalemleri maliyet
            WHERE maliyet.maliyet_tarife_surumu_id = vm.id
              AND maliyet.stok_id = kalem.ham_stok_id
              AND maliyet.hesaplama_birimi = kalem.hesaplama_birimi
              AND maliyet.aktif
          )
        )
        OR (
          kalem.bilesen_turu = 'islem'
          AND NOT EXISTS (
            SELECT 1 FROM public.maliyet_islem_kalemleri maliyet
            WHERE maliyet.maliyet_tarife_surumu_id = vm.id
              AND maliyet.islem_kodu = kalem.referans_kodu
              AND maliyet.aktif
          )
        )
        OR (
          kalem.bilesen_turu = 'genel_gider'
          AND NOT EXISTS (
            SELECT 1 FROM public.maliyet_genel_gider_kalemleri maliyet
            WHERE maliyet.maliyet_tarife_surumu_id = vm.id
              AND maliyet.kalem_kodu = kalem.referans_kodu
              AND maliyet.aktif
          )
        )
      )
  )
  SELECT
    'recete_bileseni_maliyetleri',
    'Yayınlanmış reçete bileşenlerinin maliyet kapsamı',
    count(*) = 0,
    true,
    jsonb_build_object('eksik_sayisi', count(*))
  FROM eksik;

  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT 'yayinda_fiyat_listesi', 'Bugün için yayınlanmış ana fiyat listesi',
    count(*) > 0, true, jsonb_build_object('sayisi', count(*))
  FROM public.fiyat_listeleri liste
  JOIN public.fiyat_listesi_surmleri surum ON surum.fiyat_listesi_id = liste.id
  WHERE liste.aktif AND liste.tur = 'ana' AND surum.durum = 'yayinda'
    AND surum.gecerli_baslangic <= v_bugun
    AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= v_bugun);

  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT 'yayinda_maliyet_tarifesi', 'Bugün için tek varsayılan yayınlanmış maliyet tarifesi',
    count(*) = 1, true, jsonb_build_object('sayisi', count(*))
  FROM public.maliyet_tarifeleri tarife
  JOIN public.maliyet_tarife_surmleri surum ON surum.maliyet_tarifesi_id = tarife.id
  WHERE tarife.aktif AND tarife.varsayilan AND surum.durum = 'yayinda'
    AND surum.gecerli_baslangic <= v_bugun
    AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= v_bugun);

  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT 'yayinda_kdv_grubu', 'Bugün için yayınlanmış KDV grup sürümleri',
    count(*) > 0, true, jsonb_build_object('sayisi', count(*))
  FROM public.kdv_grup_surmleri
  WHERE durum = 'yayinda' AND gecerli_baslangic <= v_bugun
    AND (gecerli_bitis IS NULL OR gecerli_bitis >= v_bugun);

  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT 'yayinda_vade_profili', 'Bugün için yayınlanmış vade profilleri',
    count(*) > 0, true, jsonb_build_object('sayisi', count(*))
  FROM public.vade_profili_surmleri
  WHERE durum = 'yayinda' AND gecerli_baslangic <= v_bugun
    AND (gecerli_bitis IS NULL OR gecerli_bitis >= v_bugun);

  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT
    'musteri_ticari_profilleri',
    'Aktif müşteri carilerinin geçerli ticari profili',
    count(*) = 0,
    true,
    jsonb_build_object('eksik_sayisi', count(*))
  FROM public.cari cari_row
  WHERE cari_row.aktif AND cari_row.tipi = 'musteri'
    AND NOT EXISTS (
      SELECT 1
      FROM public.musteri_ticari_profilleri profil
      JOIN public.musteri_ticari_profil_surmleri surum
        ON surum.musteri_ticari_profili_id = profil.id
      WHERE profil.cari_id = cari_row.id AND profil.aktif
        AND surum.durum = 'yayinda'
        AND surum.gecerli_baslangic <= v_bugun
        AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= v_bugun)
    );

  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT
    'doviz_kur_cache',
    'TRY sabiti ve bugünkü USD/EUR dört kur tipi cache kapsamı',
    count(*) = 8,
    true,
    jsonb_build_object('try', 1, 'usd_eur_kayit_sayisi', count(*))
  FROM public.doviz_kurlari
  WHERE kur_tarihi = v_bugun
    AND para_birimi IN ('USD', 'EUR')
    AND kur_tipi IN ('doviz_alis', 'doviz_satis', 'efektif_alis', 'efektif_satis')
    AND aktif;

  INSERT INTO pg_temp.ticari_readiness_runtime
  WITH hareket AS (
    SELECT cari_id, para_birimi,
      COALESCE(sum(tutar) FILTER (WHERE yon = 'borc'), 0) AS borc,
      COALESCE(sum(tutar) FILTER (WHERE yon = 'alacak'), 0) AS alacak
    FROM public.cari_hareketleri
    GROUP BY cari_id, para_birimi
  ),
  uyumsuz AS (
    SELECT COALESCE(h.cari_id, o.cari_id) AS cari_id
    FROM hareket h
    FULL JOIN public.cari_bakiye_ozetleri o USING (cari_id, para_birimi)
    WHERE COALESCE(h.borc, 0) <> COALESCE(o.borc_toplami, 0)
       OR COALESCE(h.alacak, 0) <> COALESCE(o.alacak_toplami, 0)
  )
  SELECT
    'cari_bakiye_tutarliligi',
    'Cari bakiye özetlerinin append-only hareketlerle tutarlılığı',
    count(*) = 0,
    true,
    jsonb_build_object('uyumsuz_sayisi', count(*))
  FROM uyumsuz;

  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT
    'rbac_katalogu',
    'Pricing/finance izin kataloğu ve yönetici atamaları',
    count(*) = 10
      AND EXISTS (
        SELECT 1 FROM public.roles rol
        JOIN public.role_permissions rp ON rp.role_id = rol.id
        JOIN public.permissions izin ON izin.id = rp.permission_id
        WHERE rol.slug = 'administrator'
          AND izin.module IN ('pricing', 'finance')
          AND izin.action = 'manage'
      ),
    true,
    jsonb_build_object('izin_sayisi', count(*))
  FROM public.permissions
  WHERE module IN ('pricing', 'finance');

  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT
    'rls_guvenligi',
    'Kritik ticari tablolarda RLS ve FORCE RLS',
    bool_and(c.relrowsecurity AND c.relforcerowsecurity),
    true,
    jsonb_build_object(
      'tablo_sayisi', count(*),
      'korunmayan_sayisi', count(*) FILTER (
        WHERE NOT (c.relrowsecurity AND c.relforcerowsecurity)
      )
    )
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'fiyat_listesi_surmleri', 'maliyet_tarife_surmleri',
      'urun_maliyet_recete_surmleri', 'musteri_ticari_profil_surmleri',
      'doviz_kurlari', 'cari_hareketleri', 'islem_idempotency',
      'siparis_fiyat_revizyonlari', 'teklif_revizyonlari'
    );

  INSERT INTO pg_temp.ticari_readiness_runtime
  SELECT
    'golge_kritik_hatalari',
    'Son gölge çalışmalarda kritik hata bulunmaması',
    count(*) = 0,
    true,
    jsonb_build_object('kritik_hata_sayisi', count(*))
  FROM public.golge_fiyatlandirma_calismalari
  WHERE created_at >= now() - interval '30 days'
    AND durum = 'hata';

  INSERT INTO public.ticari_kurulum_durumlari (
    kontrol_kodu, kontrol_turu, aciklama, kritik, durum,
    sonuc_detayi, kontrol_edilme_tarihi
  )
  SELECT
    kontrol_kodu, 'dinamik', aciklama, kritik,
    CASE WHEN basarili THEN 'basarili' ELSE 'basarisiz' END,
    detay, now()
  FROM pg_temp.ticari_readiness_runtime
  ON CONFLICT (kontrol_kodu) DO UPDATE
  SET aciklama = EXCLUDED.aciklama,
      kritik = EXCLUDED.kritik,
      durum = EXCLUDED.durum,
      sonuc_detayi = EXCLUDED.sonuc_detayi,
      kontrol_edilme_tarihi = EXCLUDED.kontrol_edilme_tarihi;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'kontrol_kodu', kontrol_kodu,
      'kontrol_turu', kontrol_turu,
      'aciklama', aciklama,
      'kritik', kritik,
      'durum', durum,
      'sonuc_detayi', sonuc_detayi,
      'kontrol_edilme_tarihi', kontrol_edilme_tarihi,
      'revision_no', revision_no,
      'onaylayan_kullanici_id', onaylayan_kullanici_id,
      'onay_gerekcesi', onay_gerekcesi
    )
    ORDER BY kritik DESC, kontrol_turu, kontrol_kodu
  ), '[]'::jsonb)
  INTO v_kontroller
  FROM public.ticari_kurulum_durumlari;

  SELECT count(*)
  INTO v_kritik_eksik
  FROM public.ticari_kurulum_durumlari
  WHERE kritik AND durum <> 'basarili';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'kontrol_kodu', kontrol_kodu,
      'kontrol_turu', kontrol_turu,
      'kritik', kritik,
      'durum', durum,
      'sonuc_detayi', sonuc_detayi
    )
    ORDER BY kontrol_kodu
  ), '[]'::jsonb)
  INTO v_hash_girdisi
  FROM public.ticari_kurulum_durumlari;

  v_hash := public.ticari_json_hash(v_hash_girdisi);
  v_kontrol := jsonb_build_object(
    'hazir', v_kritik_eksik = 0,
    'mod', (
      SELECT mod
      FROM public.ticari_modul_durumu
      WHERE singleton
    ),
    'kritik_eksik_sayisi', v_kritik_eksik,
    'readiness_hash', v_hash,
    'kontroller', v_kontroller,
    'kontrol_tarihi', now()
  );

  RETURN v_kontrol;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_readiness_kontrolu_onayla(
  p_kontrol_kodu text,
  p_beklenen_revision_no integer,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kontrol public.ticari_kurulum_durumlari%ROWTYPE;
  v_payload jsonb;
  v_onceki jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('admin', 'manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ADMIN_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;
  IF length(trim(COALESCE(p_gerekce, ''))) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'READINESS_GEREKCESI_GEREKLI';
  END IF;

  v_payload := jsonb_build_object(
    'kontrol_kodu', p_kontrol_kodu,
    'beklenen_revision_no', p_beklenen_revision_no,
    'gerekce', p_gerekce
  );
  v_onceki := public.ticari_idempotency_onceki_sonuc(
    'readiness_manuel_onay', p_idempotency_key, v_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;

  SELECT * INTO v_kontrol
  FROM public.ticari_kurulum_durumlari
  WHERE kontrol_kodu = p_kontrol_kodu
  FOR UPDATE;
  IF NOT FOUND OR v_kontrol.kontrol_turu <> 'manuel' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MANUEL_READINESS_KONTROLU_BULUNAMADI';
  END IF;
  IF v_kontrol.revision_no IS DISTINCT FROM p_beklenen_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'readiness_manuel_onay', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  UPDATE public.ticari_kurulum_durumlari
  SET durum = 'basarili',
      onaylayan_kullanici_id = auth.uid(),
      onay_gerekcesi = p_gerekce,
      kontrol_edilme_tarihi = now()
  WHERE id = v_kontrol.id;

  INSERT INTO public.ticari_mudahale_kayitlari (
    mudahale_turu, alan_veya_bilesen, onceki_deger, yeni_deger, gerekce, kullanici_id
  )
  VALUES (
    'readiness_onayi',
    p_kontrol_kodu,
    jsonb_build_object('durum', v_kontrol.durum),
    jsonb_build_object('durum', 'basarili', 'revision_no', v_kontrol.revision_no + 1),
    p_gerekce,
    auth.uid()
  );

  v_yanit := jsonb_build_object(
    'basarili', true,
    'kontrol_kodu', p_kontrol_kodu,
    'revision_no', v_kontrol.revision_no + 1
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_modul_modu_degistir(
  p_yeni_mod public.ticari_modul_modu,
  p_beklenen_revision_no integer,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mevcut public.ticari_modul_durumu%ROWTYPE;
  v_readiness jsonb;
  v_payload jsonb;
  v_onceki jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('admin', 'manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ADMIN_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;
  IF length(trim(COALESCE(p_gerekce, ''))) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FEATURE_MODE_GEREKCESI_GEREKLI';
  END IF;

  v_payload := jsonb_build_object(
    'yeni_mod', p_yeni_mod,
    'beklenen_revision_no', p_beklenen_revision_no,
    'gerekce', p_gerekce
  );
  v_onceki := public.ticari_idempotency_onceki_sonuc(
    'ticari_modul_modu', p_idempotency_key, v_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;

  SELECT * INTO v_mevcut
  FROM public.ticari_modul_durumu
  WHERE singleton
  FOR UPDATE;
  IF v_mevcut.revision_no IS DISTINCT FROM p_beklenen_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
  END IF;
  IF v_mevcut.mod = p_yeni_mod THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FEATURE_MODE_ZATEN_AYNI';
  END IF;
  IF v_mevcut.ilk_aktiflesme_tarihi IS NOT NULL
     AND p_yeni_mod IN ('hazirlik', 'golge') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FEATURE_MODE_GERI_DONUS_YASAK';
  END IF;
  IF NOT (
    (v_mevcut.mod = 'hazirlik' AND p_yeni_mod = 'golge')
    OR (v_mevcut.mod = 'golge' AND p_yeni_mod IN ('hazirlik', 'aktif'))
    OR (v_mevcut.mod = 'aktif' AND p_yeni_mod = 'bakim')
    OR (v_mevcut.mod = 'bakim' AND p_yeni_mod = 'aktif')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FEATURE_MODE_GECISI_GECERSIZ';
  END IF;

  IF p_yeni_mod = 'aktif' THEN
    v_readiness := public.ticari_modul_readiness();
    IF NOT COALESCE((v_readiness ->> 'hazir')::boolean, false) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'READINESS_KRITIK_EKSIK',
        DETAIL = left(v_readiness::text, 7500);
    END IF;
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'ticari_modul_modu', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  UPDATE public.ticari_modul_durumu
  SET mod = p_yeni_mod,
      ilk_aktiflesme_tarihi = CASE
        WHEN p_yeni_mod = 'aktif' THEN COALESCE(ilk_aktiflesme_tarihi, now())
        ELSE ilk_aktiflesme_tarihi
      END,
      son_readiness_hash = CASE
        WHEN p_yeni_mod = 'aktif' THEN v_readiness ->> 'readiness_hash'
        ELSE son_readiness_hash
      END,
      son_readiness_sonucu = CASE
        WHEN p_yeni_mod = 'aktif' THEN v_readiness
        ELSE son_readiness_sonucu
      END,
      gerekce = p_gerekce,
      guncelleyen_kullanici_id = auth.uid()
  WHERE singleton;

  INSERT INTO public.ticari_mudahale_kayitlari (
    mudahale_turu, alan_veya_bilesen, onceki_deger, yeni_deger, gerekce, kullanici_id
  )
  VALUES (
    'feature_mode',
    'ticari_modul_durumu',
    jsonb_build_object('mod', v_mevcut.mod, 'revision_no', v_mevcut.revision_no),
    jsonb_build_object('mod', p_yeni_mod, 'revision_no', v_mevcut.revision_no + 1),
    p_gerekce,
    auth.uid()
  );

  v_yanit := jsonb_build_object(
    'basarili', true,
    'onceki_mod', v_mevcut.mod,
    'mod', p_yeni_mod,
    'revision_no', v_mevcut.revision_no + 1,
    'readiness_hash', v_readiness ->> 'readiness_hash'
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_modul_modu_getir()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sonuc jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_user_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OTURUM_GEREKLI';
  END IF;
  SELECT jsonb_build_object(
    'mod', mod,
    'ticari_modul_aktif', mod = 'aktif',
    'ilk_aktiflesme_tarihi', ilk_aktiflesme_tarihi,
    'revision_no', revision_no,
    'updated_at', updated_at
  )
  INTO v_sonuc
  FROM public.ticari_modul_durumu
  WHERE singleton;
  RETURN v_sonuc;
END;
$$;

CREATE OR REPLACE VIEW public.ticari_modul_uyumluluk
WITH (security_invoker = true)
AS
SELECT
  mod,
  mod = 'aktif' AS ticari_modul_aktif,
  revision_no,
  updated_at
FROM public.ticari_modul_durumu
WHERE singleton;

-- Legacy birim fiyatlar yalnız açık bir taslağa kopyalanır; motor bu kolonu okumaz.
CREATE OR REPLACE FUNCTION public.legacy_stok_fiyatlarini_taslaga_aktar(
  p_kdv_grubu_id uuid,
  p_gecerli_baslangic date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payload jsonb;
  v_onceki jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_liste_id uuid;
  v_surum_id uuid;
  v_aktarilan integer;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kdv_gruplari WHERE id = p_kdv_grubu_id AND aktif) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'KDV_GRUBU_GECERSIZ';
  END IF;

  v_payload := jsonb_build_object(
    'kdv_grubu_id', p_kdv_grubu_id,
    'gecerli_baslangic', p_gecerli_baslangic
  );
  v_onceki := public.ticari_idempotency_onceki_sonuc(
    'legacy_fiyat_aktarimi', p_idempotency_key, v_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;
  v_idempotency := public.ticari_idempotency_baslat(
    'legacy_fiyat_aktarimi', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  INSERT INTO public.fiyat_listeleri (
    kod, ad, tur, aktif, olusturan_kullanici_id
  )
  VALUES (
    'LEGACY-' || to_char(now(), 'YYYYMMDDHH24MISS'),
    'Legacy stok.birim_fiyat aktarımı',
    'ana',
    true,
    auth.uid()
  )
  RETURNING id INTO v_liste_id;

  INSERT INTO public.fiyat_listesi_surmleri (
    fiyat_listesi_id, surum_no, durum, gecerli_baslangic,
    olusturan_kullanici_id, aciklama
  )
  VALUES (
    v_liste_id, 1, 'taslak', p_gecerli_baslangic, auth.uid(),
    'stok.birim_fiyat alanından oluşturulan, yayınlanmamış geçiş taslağı'
  )
  RETURNING id INTO v_surum_id;

  INSERT INTO public.fiyat_listesi_urun_kalemleri (
    fiyat_listesi_surumu_id, kapsam_tipi, stok_id, birim_fiyat,
    para_birimi, kdv_grubu_id, aktif, olusturan_kullanici_id
  )
  SELECT
    v_surum_id, 'stok', stok_row.id, stok_row.birim_fiyat,
    'TRY', p_kdv_grubu_id, true, auth.uid()
  FROM public.stok stok_row
  WHERE stok_row.aktif
    AND stok_row.birim_fiyat IS NOT NULL
    AND stok_row.birim_fiyat >= 0;
  GET DIAGNOSTICS v_aktarilan = ROW_COUNT;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'fiyat_listesi_id', v_liste_id,
    'fiyat_listesi_surumu_id', v_surum_id,
    'aktarilan_stok_sayisi', v_aktarilan,
    'durum', 'taslak'
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_eksik_kayit_raporu(
  p_rapor_turu text,
  p_tarih date DEFAULT ((clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date)
)
RETURNS TABLE (
  kaynak_turu text,
  kaynak_id uuid,
  kod text,
  ad text,
  detay jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_maliyet_surum_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_READ_YETKISI_GEREKLI';
  END IF;
  IF p_tarih IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RAPOR_TARIHI_GEREKLI';
  END IF;

  IF p_rapor_turu = 'satis_fiyati' THEN
    RETURN QUERY
    SELECT
      'stok'::text,
      stok_row.id,
      stok_row.kod::text,
      stok_row.ad::text,
      jsonb_build_object(
        'neden', 'yayinda_ana_liste_stok_fiyati_yok',
        'ticari_kapsam', stok_row.ticari_kapsam,
        'rapor_tarihi', p_tarih
      )
    FROM public.stok stok_row
    WHERE stok_row.aktif
      AND stok_row.ticari_kapsam IN ('satilabilir', 'her_ikisi')
      AND NOT EXISTS (
        SELECT 1
        FROM public.fiyat_listeleri liste
        JOIN public.fiyat_listesi_surmleri surum
          ON surum.fiyat_listesi_id = liste.id
        JOIN public.fiyat_listesi_urun_kalemleri kalem
          ON kalem.fiyat_listesi_surumu_id = surum.id
        WHERE liste.aktif
          AND liste.tur = 'ana'
          AND surum.durum = 'yayinda'
          AND surum.gecerli_baslangic <= p_tarih
          AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= p_tarih)
          AND kalem.aktif
          AND kalem.kapsam_tipi = 'stok'
          AND kalem.stok_id = stok_row.id
          AND kalem.birim_fiyat IS NOT NULL
      )
    ORDER BY stok_row.kod, stok_row.id;
    RETURN;
  END IF;

  IF p_rapor_turu = 'recete' THEN
    RETURN QUERY
    SELECT
      'stok'::text,
      stok_row.id,
      stok_row.kod::text,
      stok_row.ad::text,
      jsonb_build_object(
        'neden', 'yayinda_recete_surumu_yok',
        'ticari_kapsam', stok_row.ticari_kapsam,
        'rapor_tarihi', p_tarih
      )
    FROM public.stok stok_row
    WHERE stok_row.aktif
      AND stok_row.ticari_kapsam IN ('satilabilir', 'her_ikisi')
      AND NOT EXISTS (
        SELECT 1
        FROM public.urun_maliyet_receteleri recete
        JOIN public.urun_maliyet_recete_surmleri surum
          ON surum.urun_maliyet_recetesi_id = recete.id
        WHERE recete.stok_id = stok_row.id
          AND recete.aktif
          AND surum.durum = 'yayinda'
          AND surum.gecerli_baslangic <= p_tarih
          AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= p_tarih)
      )
    ORDER BY stok_row.kod, stok_row.id;
    RETURN;
  END IF;

  IF p_rapor_turu = 'profil' THEN
    RETURN QUERY
    SELECT
      'cari'::text,
      cari_row.id,
      cari_row.kod::text,
      cari_row.ad::text,
      jsonb_build_object(
        'neden', 'gecerli_yayinda_ticari_profil_yok',
        'rapor_tarihi', p_tarih
      )
    FROM public.cari cari_row
    WHERE cari_row.aktif
      AND cari_row.tipi = 'musteri'
      AND NOT EXISTS (
        SELECT 1
        FROM public.musteri_ticari_profilleri profil
        JOIN public.musteri_ticari_profil_surmleri surum
          ON surum.musteri_ticari_profili_id = profil.id
        WHERE profil.cari_id = cari_row.id
          AND profil.aktif
          AND surum.durum = 'yayinda'
          AND surum.gecerli_baslangic <= p_tarih
          AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= p_tarih)
      )
    ORDER BY cari_row.kod, cari_row.id;
    RETURN;
  END IF;

  IF p_rapor_turu = 'maliyet' THEN
    SELECT surum.id
    INTO v_maliyet_surum_id
    FROM public.maliyet_tarifeleri tarife
    JOIN public.maliyet_tarife_surmleri surum
      ON surum.maliyet_tarifesi_id = tarife.id
    WHERE tarife.aktif
      AND tarife.varsayilan
      AND surum.durum = 'yayinda'
      AND surum.gecerli_baslangic <= p_tarih
      AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= p_tarih)
    ORDER BY surum.gecerli_baslangic DESC, surum.surum_no DESC
    LIMIT 1;

    RETURN QUERY
    SELECT
      'stok_maliyeti'::text,
      stok_row.id,
      stok_row.kod::text,
      stok_row.ad::text,
      jsonb_build_object(
        'neden', CASE
          WHEN v_maliyet_surum_id IS NULL THEN 'varsayilan_yayinda_maliyet_tarifesi_yok'
          ELSE 'aktif_maliyet_bileseni_fiyati_yok'
        END,
        'maliyet_tarife_surumu_id', v_maliyet_surum_id,
        'rapor_tarihi', p_tarih
      )
    FROM public.stok stok_row
    WHERE stok_row.aktif
      AND stok_row.ticari_kapsam IN ('maliyet_bileseni', 'her_ikisi')
      AND (
        v_maliyet_surum_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.maliyet_stok_kalemleri maliyet
          WHERE maliyet.maliyet_tarife_surumu_id = v_maliyet_surum_id
            AND maliyet.stok_id = stok_row.id
            AND maliyet.aktif
        )
      )

    UNION ALL

    SELECT
      ('recete_' || kalem.bilesen_turu)::text,
      kalem.id,
      COALESCE(kalem.referans_kodu, ham_stok.kod, urun.kod)::text,
      (
        recete.ad || ' / ' ||
        COALESCE(ham_stok.ad, kalem.referans_kodu, kalem.bilesen_turu::text)
      )::text,
      jsonb_build_object(
        'neden', 'recete_bileseni_maliyeti_yok',
        'recete_id', recete.id,
        'recete_surumu_id', surum.id,
        'urun_stok_id', recete.stok_id,
        'bilesen_turu', kalem.bilesen_turu,
        'hesaplama_birimi', kalem.hesaplama_birimi,
        'maliyet_tarife_surumu_id', v_maliyet_surum_id,
        'rapor_tarihi', p_tarih
      )
    FROM public.urun_maliyet_receteleri recete
    JOIN public.stok urun ON urun.id = recete.stok_id
    JOIN public.urun_maliyet_recete_surmleri surum
      ON surum.urun_maliyet_recetesi_id = recete.id
    JOIN public.urun_maliyet_recete_kalemleri kalem
      ON kalem.urun_maliyet_recete_surumu_id = surum.id
    LEFT JOIN public.stok ham_stok ON ham_stok.id = kalem.ham_stok_id
    WHERE recete.aktif
      AND surum.durum = 'yayinda'
      AND surum.gecerli_baslangic <= p_tarih
      AND (surum.gecerli_bitis IS NULL OR surum.gecerli_bitis >= p_tarih)
      AND (
        v_maliyet_surum_id IS NULL
        OR (
          kalem.bilesen_turu = 'stok'
          AND NOT EXISTS (
            SELECT 1
            FROM public.maliyet_stok_kalemleri maliyet
            WHERE maliyet.maliyet_tarife_surumu_id = v_maliyet_surum_id
              AND maliyet.stok_id = kalem.ham_stok_id
              AND maliyet.hesaplama_birimi = kalem.hesaplama_birimi
              AND maliyet.aktif
          )
        )
        OR (
          kalem.bilesen_turu = 'islem'
          AND NOT EXISTS (
            SELECT 1
            FROM public.maliyet_islem_kalemleri maliyet
            WHERE maliyet.maliyet_tarife_surumu_id = v_maliyet_surum_id
              AND maliyet.islem_kodu = kalem.referans_kodu
              AND maliyet.aktif
          )
        )
        OR (
          kalem.bilesen_turu = 'genel_gider'
          AND NOT EXISTS (
            SELECT 1
            FROM public.maliyet_genel_gider_kalemleri maliyet
            WHERE maliyet.maliyet_tarife_surumu_id = v_maliyet_surum_id
              AND maliyet.kalem_kodu = kalem.referans_kodu
              AND maliyet.aktif
          )
        )
      )
    ORDER BY 3, 2;
    RETURN;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '22023',
    MESSAGE = 'EKSIK_KAYIT_RAPOR_TURU_GECERSIZ',
    DETAIL = COALESCE(p_rapor_turu, '<null>');
END;
$$;

CREATE INDEX IF NOT EXISTS fiyat_listesi_surumu_stok_idx
  ON public.fiyat_listesi_urun_kalemleri(fiyat_listesi_surumu_id, stok_id)
  WHERE aktif;
CREATE INDEX IF NOT EXISTS maliyet_surumu_stok_idx
  ON public.maliyet_stok_kalemleri(maliyet_tarife_surumu_id, stok_id)
  WHERE aktif;
CREATE INDEX IF NOT EXISTS recete_surumu_urun_idx
  ON public.urun_maliyet_recete_surmleri(urun_maliyet_recetesi_id, durum, gecerli_baslangic);
CREATE INDEX IF NOT EXISTS kdv_grubu_gecerlilik_idx
  ON public.kdv_grup_surmleri(kdv_grubu_id, durum, gecerli_baslangic, gecerli_bitis);
CREATE INDEX IF NOT EXISTS musteri_profili_gecerlilik_idx
  ON public.musteri_ticari_profil_surmleri(
    musteri_ticari_profili_id, durum, gecerli_baslangic, gecerli_bitis
  );
CREATE INDEX IF NOT EXISTS kur_tarih_para_idx
  ON public.doviz_kurlari(kur_tarihi, para_birimi, kur_tipi)
  WHERE aktif;
CREATE INDEX IF NOT EXISTS siparis_fiyat_revizyon_no_idx
  ON public.siparis_fiyat_revizyonlari(siparis_id, revizyon_no DESC);
CREATE INDEX IF NOT EXISTS teklif_revizyon_no_idx
  ON public.teklif_revizyonlari(teklif_id, revizyon_no DESC);

REVOKE ALL ON FUNCTION public.ticari_modul_readiness() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_readiness_kontrolu_onayla(text, integer, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_modul_modu_degistir(
  public.ticari_modul_modu, integer, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_modul_modu_getir() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.legacy_stok_fiyatlarini_taslaga_aktar(uuid, date, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticari_eksik_kayit_raporu(text, date)
  FROM PUBLIC, anon;
REVOKE ALL ON public.ticari_modul_uyumluluk FROM PUBLIC, anon;
GRANT SELECT ON public.ticari_modul_uyumluluk TO authenticated;
GRANT EXECUTE ON FUNCTION public.ticari_modul_readiness() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ticari_readiness_kontrolu_onayla(text, integer, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.ticari_modul_modu_degistir(
  public.ticari_modul_modu, integer, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ticari_modul_modu_getir() TO authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_stok_fiyatlarini_taslaga_aktar(uuid, date, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.ticari_eksik_kayit_raporu(text, date)
  TO authenticated;

COMMENT ON COLUMN public.stok.birim_fiyat IS
  'Legacy alan. 069+ kanonik fiyat motoru tarafından okunmaz veya yazılmaz; yalnız kontrollü taslak aktarım RPC''si kaynak olarak okuyabilir.';
