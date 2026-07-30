BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(40);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('cam_fiyat_gruplari'),
        ('stok_maliyet_profilleri'),
        ('stok_maliyet_yapi_surmleri'),
        ('stok_alis_fiyatlari'),
        ('stok_maliyet_kaynagi_atamalari'),
        ('cam_tedarik_baglantilari'),
        ('cam_tedarik_baglanti_kalemleri'),
        ('cam_tedarik_baglanti_kalem_stoklari')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE to_regclass('public.' || name) IS NOT NULL
  ),
  8,
  'stok merkezli maliyet modelinin temel tabloları kurulur'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stok_maliyet_profilleri'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%stok_id%REFERENCES stok(id)%'
  ),
  'maliyet profili bağımsız malzeme yerine stok_id kullanır'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'stok_alis_fiyatlari',
        'stok_maliyet_profilleri',
        'cam_tedarik_baglantilari',
        'cam_tedarik_baglanti_kalemleri'
      )
      AND data_type IN ('real', 'double precision')
  ),
  0,
  'parasal ve katsayı alanlarında kayan noktalı tip kullanılmaz'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.stok_maliyet_kaynagi_atamalari'::regclass
      AND contype = 'x'
      AND pg_get_constraintdef(oid) LIKE '%stok_id WITH =%'
      AND pg_get_constraintdef(oid) LIKE '%gecerlilik_donemi WITH &&%'
  ),
  'aynı stokta çakışan dönemler GiST exclusion ile engellenir'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.stok_alis_fiyatlari'::regclass
      AND tgname = 'stok_alis_fiyatlari_immutable'
      AND NOT tgisinternal
  ),
  'stok alış fiyatı append-only trigger ile korunur'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.stok_maliyet_kaynagi_atamalari'::regclass
      AND tgname = 'stok_maliyet_kaynagi_guard'
      AND NOT tgisinternal
  ),
  'kapatılmış maliyet dönemleri silinemez veya yeniden yazılamaz'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('stok_maliyet_profilleri'),
        ('stok_alis_fiyatlari'),
        ('stok_maliyet_kaynagi_atamalari'),
        ('cam_tedarik_baglantilari')
    )
    SELECT count(*)::integer
    FROM expected
    JOIN pg_class c ON c.oid = to_regclass('public.' || expected.name)
    WHERE c.relrowsecurity AND c.relforcerowsecurity
  ),
  4,
  'kritik maliyet tablolarında RLS ve FORCE RLS etkindir'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('stok_maliyet_profilleri'),
        ('stok_alis_fiyatlari'),
        ('stok_maliyet_kaynagi_atamalari'),
        ('cam_tedarik_baglantilari')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE has_table_privilege('authenticated', 'public.' || name, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || name, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || name, 'DELETE')
  ),
  0,
  'authenticated rolü maliyet tablolarına doğrudan yazamaz'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('stok_alis_fiyati_kaydet'),
        ('stok_alis_fiyati_aktiflestir'),
        ('stok_maliyet_kaynagi_kapat'),
        ('cam_baglantisi_olustur'),
        ('cam_baglantisi_aktiflestir'),
        ('cam_baglantisi_kapat'),
        ('stok_maliyet_kaynagi_coz'),
        ('urun_maliyeti_detayli_hesapla'),
        ('legacy_fiyat_dogrula'),
        ('tedarikci_pasiflestir')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = expected.name
    )
  ),
  10,
  'atomik yazma ve tarihsel çözümleme RPC sınırları bulunur'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('stok_alis_fiyati_kaydet'),
        ('stok_alis_fiyati_aktiflestir'),
        ('stok_maliyet_kaynagi_kapat'),
        ('cam_baglantisi_olustur'),
        ('cam_baglantisi_aktiflestir'),
        ('cam_baglantisi_kapat'),
        ('stok_maliyet_kaynagi_coz'),
        ('urun_maliyeti_detayli_hesapla'),
        ('legacy_fiyat_dogrula'),
        ('tedarikci_pasiflestir')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = expected.name
        AND p.prosecdef
    )
  ),
  10,
  'dış maliyet RPC fonksiyonları SECURITY DEFINER kullanır'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.maliyet_alis_fiyati_kaydet(jsonb,text)'::regprocedure,
    'EXECUTE'
  ),
  'eski bağımsız alış fiyatı RPCsi yeni yazıma kapalıdır'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.stok_alis_fiyatlari'::regclass
      AND tgname = 'audit_stok_alis_fiyatlari'
      AND NOT tgisinternal
  )
  AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.cam_tedarik_baglantilari'::regclass
      AND tgname = 'audit_cam_tedarik_baglantilari'
      AND NOT tgisinternal
  ),
  'fiyat ve cam bağlantısı işlemleri ayrıntılı audit triggerı taşır'
);

SELECT is(
  (
    SELECT count(DISTINCT sonuc)::integer
    FROM public.maliyet_legacy_eslestirmeleri
    WHERE sonuc IN (
      'kesin_eslesme', 'yuksek_guvenli_eslesme', 'birden_fazla_aday',
      'birim_uyusmazligi', 'kategori_uyusmazligi', 'tedarikci_eksik',
      'stok_bulunamadi'
    )
  ) >= 1,
  true,
  'legacy staging eşleştirme sınıflarını raporlar'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.stok_maliyet_kaynagi_atamalari atama
    JOIN public.stok_alis_fiyatlari fiyat ON fiyat.id = atama.fiyat_id
    WHERE fiyat.kaynak_turu = 'legacy_unverified'
  ),
  'doğrulanmamış legacy fiyat hiçbir aktif maliyet döneminde kullanılamaz'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stok_alis_fiyatlari'
      AND column_name = 'para_birimi'
      AND udt_name = 'para_birimi_kodu'
  ),
  'her alış fiyatında açık para birimi saklanır'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stok_maliyet_kaynagi_atamalari'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%lower_inc(gecerlilik_donemi)%'
      AND pg_get_constraintdef(oid) LIKE '%NOT upper_inc(gecerlilik_donemi)%'
  ),
  'maliyet dönemleri [başlangıç, bitiş) biçimindedir'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '98000000-0000-4000-8000-000000000001',
  'stok-maliyet-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);
UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '98000000-0000-4000-8000-000000000001';
INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '98000000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;
INSERT INTO auth.sessions(id, user_id, created_at, updated_at)
VALUES (
  '98000000-0000-4000-8000-000000000002',
  '98000000-0000-4000-8000-000000000001',
  now(),
  now()
);
INSERT INTO public.user_devices (
  id, auth_user_id, client_device_id, auto_display_name,
  device_type, os_family, browser_family
)
VALUES (
  '98000000-0000-4000-8000-000000000003',
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000004',
  'Stok maliyet pgTAP',
  'desktop',
  'Windows',
  'Chrome'
);
INSERT INTO public.user_device_sessions (
  auth_user_id, device_id, auth_session_id, signed_in_at
)
VALUES (
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000003',
  '98000000-0000-4000-8000-000000000002',
  now()
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"98000000-0000-4000-8000-000000000002"}',
  true
);

INSERT INTO public.cari (
  id, kod, ad, tipi, aktif, tedarik_kapsamlari, tedarikci_calisma_modeli
)
VALUES
  (
    '98000000-0000-4000-8000-000000000010',
    'PGTAP-TED-A', 'A Cam Tedarikçisi', 'tedarikci', true,
    ARRAY['cam', 'cita', 'yan_malzeme'], 'sisecam_portal'
  ),
  (
    '98000000-0000-4000-8000-000000000011',
    'PGTAP-TED-B', 'B Cam Tedarikçisi', 'tedarikci', true,
    ARRAY['cam', 'cita', 'yan_malzeme'], 'manuel_fiyat'
  );

INSERT INTO public.stok (
  id, kod, ad, kategori, kalinlik_mm, birim, aktif, ticari_kapsam
)
VALUES
  (
    '98000000-0000-4000-8000-000000000020',
    'PGTAP-CAM-99', '99 mm Test Düz Cam', 'cam', 99, 'm2', true, 'maliyet_bileseni'
  ),
  (
    '98000000-0000-4000-8000-000000000021',
    'PGTAP-CITA-77', '77 mm Test Çıta', 'cita', 77, 'm', true, 'maliyet_bileseni'
  ),
  (
    '98000000-0000-4000-8000-000000000022',
    'PGTAP-SARF', 'Test Sarf', 'yan_malzeme', NULL, 'kg', true, 'maliyet_bileseni'
  );
INSERT INTO public.stok (
  id, kod, ad, kategori, birim, katman_yapisi, aktif, ticari_kapsam
)
VALUES (
  '98000000-0000-4000-8000-000000000023',
  'PGTAP-URUN', '99+77+99 Test Ürün', 'cam', 'm2', '99+77+99', true, 'satilabilir'
);

INSERT INTO public.stok_maliyet_profilleri (
  id, stok_id, profil_turu, cam_fiyat_grubu_id, cita_malzeme_turu,
  olcu_mm, hesaplama_tipi, tuketim_katsayisi, bosluk_basi,
  fire_orani, fiyat_birimi, stok_ana_birimi, donusum_katsayisi,
  gecerlilik_donemi, revision_no, aciklama, olusturan_kullanici_id
)
VALUES
  (
    '98000000-0000-4000-8000-000000000030',
    '98000000-0000-4000-8000-000000000020', 'cam',
    (SELECT id FROM public.cam_fiyat_gruplari WHERE kod = 'duz'),
    NULL, 99, NULL, NULL, false, 10, 'm2', 'm2', 1,
    daterange(DATE '2098-01-01', NULL, '[)'), 1, 'test cam profili',
    '98000000-0000-4000-8000-000000000001'
  ),
  (
    '98000000-0000-4000-8000-000000000031',
    '98000000-0000-4000-8000-000000000021', 'cita',
    NULL, 'aluminyum', 77, NULL, NULL, false, 0, 'm', 'm', 1,
    daterange(DATE '2098-01-01', NULL, '[)'), 1, 'test çıta profili',
    '98000000-0000-4000-8000-000000000001'
  ),
  (
    '98000000-0000-4000-8000-000000000032',
    '98000000-0000-4000-8000-000000000022', 'sarf',
    NULL, NULL, NULL, 'sabit', 1, false, 0, 'kg', 'kg', 1,
    daterange(DATE '2098-01-01', NULL, '[)'), 1, 'test sarf profili',
    '98000000-0000-4000-8000-000000000001'
  );

INSERT INTO public.maliyet_hesaplama_ayar_surmleri (
  yillik_finansman_orani, cam_fire_orani, cita_fire_orani,
  referans_en_mm, referans_boy_mm, gecerli_baslangic, aciklama
)
VALUES (10, 0, 0, 1000, 1000, DATE '2098-01-01', 'stok maliyet pgTAP ayarı');

INSERT INTO public.stok_alis_fiyatlari (
  id, stok_id, tedarikci_id, birim_fiyat, para_birimi, fiyat_birimi,
  stok_ana_birimi, donusum_katsayisi, vade_gunu, fiyat_tarihi,
  kaynak_turu, durum, olusturan_kullanici_id
)
VALUES
  (
    '98000000-0000-4000-8000-000000000040',
    '98000000-0000-4000-8000-000000000020',
    '98000000-0000-4000-8000-000000000010',
    100, 'TRY', 'm2', 'm2', 1, 365, TIMESTAMPTZ '2098-01-01 00:00:00+03',
    'dogrudan', 'dogrulanmis', '98000000-0000-4000-8000-000000000001'
  ),
  (
    '98000000-0000-4000-8000-000000000041',
    '98000000-0000-4000-8000-000000000020',
    '98000000-0000-4000-8000-000000000011',
    200, 'TRY', 'm2', 'm2', 1, 0, TIMESTAMPTZ '2099-01-01 00:00:00+03',
    'dogrudan', 'dogrulanmis', '98000000-0000-4000-8000-000000000001'
  ),
  (
    '98000000-0000-4000-8000-000000000042',
    '98000000-0000-4000-8000-000000000021',
    '98000000-0000-4000-8000-000000000010',
    10, 'TRY', 'm', 'm', 1, 0, TIMESTAMPTZ '2098-01-01 00:00:00+03',
    'dogrudan', 'dogrulanmis', '98000000-0000-4000-8000-000000000001'
  ),
  (
    '98000000-0000-4000-8000-000000000043',
    '98000000-0000-4000-8000-000000000022',
    '98000000-0000-4000-8000-000000000010',
    5, 'TRY', 'kg', 'kg', 1, 0, TIMESTAMPTZ '2098-01-01 00:00:00+03',
    'dogrudan', 'dogrulanmis', '98000000-0000-4000-8000-000000000001'
  );

INSERT INTO public.stok_maliyet_kaynagi_atamalari (
  id, stok_id, fiyat_id, kaynak_turu, kaynak_id, gecerlilik_donemi,
  aktiflestiren_kullanici_id, aktiflestirme_nedeni, idempotency_key,
  kapatan_kullanici_id, kapatma_nedeni, closed_at
)
VALUES
  (
    '98000000-0000-4000-8000-000000000050',
    '98000000-0000-4000-8000-000000000020',
    '98000000-0000-4000-8000-000000000040',
    'dogrudan_fiyat', '98000000-0000-4000-8000-000000000040',
    tstzrange(TIMESTAMPTZ '2098-01-01 00:00:00+03', TIMESTAMPTZ '2099-01-01 00:00:00+03', '[)'),
    '98000000-0000-4000-8000-000000000001', 'A fiyat dönemi testi',
    'pgtap-atama-a',
    '98000000-0000-4000-8000-000000000001', 'B fiyatına geçiş testi', now()
  ),
  (
    '98000000-0000-4000-8000-000000000051',
    '98000000-0000-4000-8000-000000000020',
    '98000000-0000-4000-8000-000000000041',
    'dogrudan_fiyat', '98000000-0000-4000-8000-000000000041',
    tstzrange(TIMESTAMPTZ '2099-01-01 00:00:00+03', NULL, '[)'),
    '98000000-0000-4000-8000-000000000001', 'B fiyat dönemi testi',
    'pgtap-atama-b', NULL, NULL, NULL
  ),
  (
    '98000000-0000-4000-8000-000000000052',
    '98000000-0000-4000-8000-000000000021',
    '98000000-0000-4000-8000-000000000042',
    'dogrudan_fiyat', '98000000-0000-4000-8000-000000000042',
    tstzrange(TIMESTAMPTZ '2098-01-01 00:00:00+03', NULL, '[)'),
    '98000000-0000-4000-8000-000000000001', 'Çıta fiyat dönemi testi',
    'pgtap-atama-cita', NULL, NULL, NULL
  ),
  (
    '98000000-0000-4000-8000-000000000053',
    '98000000-0000-4000-8000-000000000022',
    '98000000-0000-4000-8000-000000000043',
    'dogrudan_fiyat', '98000000-0000-4000-8000-000000000043',
    tstzrange(TIMESTAMPTZ '2098-01-01 00:00:00+03', NULL, '[)'),
    '98000000-0000-4000-8000-000000000001', 'Sarf fiyat dönemi testi',
    'pgtap-atama-sarf', NULL, NULL, NULL
  );

SELECT is(
  (
    SELECT tedarikci_id
    FROM public.stok_maliyet_kaynagi_coz(
      '98000000-0000-4000-8000-000000000020',
      TIMESTAMPTZ '2098-06-01 12:00:00+03'
    )
  ),
  '98000000-0000-4000-8000-000000000010'::uuid,
  'geçmiş 2098 maliyeti A tedarikçisini kullanır'
);

SELECT is(
  (
    SELECT tedarikci_id
    FROM public.stok_maliyet_kaynagi_coz(
      '98000000-0000-4000-8000-000000000020',
      TIMESTAMPTZ '2099-06-01 12:00:00+03'
    )
  ),
  '98000000-0000-4000-8000-000000000011'::uuid,
  'yeni 2099 maliyeti B tedarikçisini kullanır'
);

SELECT is(
  (
    SELECT fiyat_id
    FROM public.stok_maliyet_kaynagi_coz(
      '98000000-0000-4000-8000-000000000020',
      TIMESTAMPTZ '2099-01-01 00:00:00+03'
    )
  ),
  '98000000-0000-4000-8000-000000000041'::uuid,
  'yarı açık dönem sınırında yeni B fiyatı seçilir'
);

SELECT is(
  (
    public.urun_maliyeti_detayli_hesapla(
      '98000000-0000-4000-8000-000000000023',
      DATE '2098-06-01', 1000, 1000
    ) ->> 'gecerli'
  )::boolean,
  true,
  'tarihsel ürün maliyeti stok bileşenleriyle eksiksiz hesaplanır'
);

SELECT ok(
  public.urun_maliyeti_detayli_hesapla(
    '98000000-0000-4000-8000-000000000023',
    DATE '2098-06-01', 1000, 1000
  ) -> 'bilesenler' @> '[{"tedarikci_id":"98000000-0000-4000-8000-000000000010"}]'::jsonb,
  'geçmiş maliyet kırılımı A tedarikçi izini taşır'
);

SELECT is(
  (
    public.urun_maliyeti_detayli_hesapla(
      '98000000-0000-4000-8000-000000000023',
      DATE '2098-06-01', 1000, 1000
    ) ->> 'toplam_maliyet'
  )::numeric,
  287.00::numeric,
  'kur, vade, fire, çıta ve sarf katsayıları beklenen SQL sonucunu üretir'
);

SELECT is(
  (
    public.urun_maliyeti_detayli_hesapla(
      '98000000-0000-4000-8000-000000000023',
      DATE '2099-06-01', 1000, 1000
    ) ->> 'toplam_maliyet'
  )::numeric,
  485.00::numeric,
  'B fiyatı yeni ürün maliyetine anında yansır'
);

SELECT throws_ok(
  $$INSERT INTO public.stok_maliyet_kaynagi_atamalari (
      stok_id, fiyat_id, kaynak_turu, kaynak_id, gecerlilik_donemi,
      aktiflestiren_kullanici_id, aktiflestirme_nedeni, idempotency_key
    ) VALUES (
      '98000000-0000-4000-8000-000000000020',
      '98000000-0000-4000-8000-000000000041',
      'dogrudan_fiyat', '98000000-0000-4000-8000-000000000041',
      tstzrange('2098-06-01 00:00:00+03', NULL, '[)'),
      '98000000-0000-4000-8000-000000000001',
      'çakışan dönem testi', 'pgtap-overlap'
    )$$,
  '23P01',
  NULL,
  'aynı stok için ikinci çakışan aktif dönem oluşturulamaz'
);

SELECT throws_ok(
  $$UPDATE public.stok_alis_fiyatlari
       SET birim_fiyat = 999
     WHERE id = '98000000-0000-4000-8000-000000000040'$$,
  '55000',
  'STOK_ALIS_FIYATI_DEGISTIRILEMEZ',
  'aktif fiyat doğrudan düzenlenemez'
);

INSERT INTO public.cam_tedarik_baglantilari (
  id, tedarikci_id, baglanti_no, toplam_tutar, para_birimi,
  baslangic_tarihi, durum, olusturan_kullanici_id
)
VALUES (
  '98000000-0000-4000-8000-000000000060',
  '98000000-0000-4000-8000-000000000010',
  'PGTAP-CAM-BAGLANTI', 5000000, 'TRY', DATE '2098-01-01',
  'taslak', '98000000-0000-4000-8000-000000000001'
);
INSERT INTO public.cam_tedarik_baglanti_kalemleri (
  id, baglanti_id, cam_fiyat_grubu_id, birim_fiyat, para_birimi,
  fiyat_birimi, stok_ana_birimi, donusum_katsayisi,
  olusturan_kullanici_id
)
VALUES (
  '98000000-0000-4000-8000-000000000061',
  '98000000-0000-4000-8000-000000000060',
  (SELECT id FROM public.cam_fiyat_gruplari WHERE kod = 'duz'),
  100, 'TRY', 'm2', 'm2', 1,
  '98000000-0000-4000-8000-000000000001'
), (
  '98000000-0000-4000-8000-000000000062',
  '98000000-0000-4000-8000-000000000060',
  (SELECT id FROM public.cam_fiyat_gruplari WHERE kod = 'konfor'),
  120, 'TRY', 'm2', 'm2', 1,
  '98000000-0000-4000-8000-000000000001'
), (
  '98000000-0000-4000-8000-000000000063',
  '98000000-0000-4000-8000-000000000060',
  (SELECT id FROM public.cam_fiyat_gruplari WHERE kod = 'sinerji'),
  140, 'TRY', 'm2', 'm2', 1,
  '98000000-0000-4000-8000-000000000001'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cam_tedarik_baglanti_kalemleri
    WHERE baglanti_id = '98000000-0000-4000-8000-000000000060'
  ),
  3,
  '5.000.000 TRY cam bağlantısında Normal, Konfor ve Sinerji fiyatları saklanır'
);
INSERT INTO public.cam_tedarik_baglanti_kalem_stoklari (
  baglanti_kalemi_id, stok_id
)
VALUES (
  '98000000-0000-4000-8000-000000000061',
  '98000000-0000-4000-8000-000000000020'
);
UPDATE public.cam_tedarik_baglantilari
SET durum = 'aktif',
    aktiflestiren_kullanici_id = '98000000-0000-4000-8000-000000000001'
WHERE id = '98000000-0000-4000-8000-000000000060';

SELECT throws_ok(
  $$UPDATE public.cam_tedarik_baglanti_kalemleri
       SET birim_fiyat = 101
     WHERE id = '98000000-0000-4000-8000-000000000061'$$,
  '55000',
  'CAM_BAGLANTISI_KALEMLERI_DEGISTIRILEMEZ',
  'aktif cam bağlantısının fiyat ve kalemleri değiştirilemez'
);

SELECT throws_ok(
  $$UPDATE public.cari SET aktif = false
     WHERE id = '98000000-0000-4000-8000-000000000010'$$,
  '55000',
  'TEDARIKCI_PASIFLESTIRME_RPC_GEREKLI',
  'tedarikçi doğrudan güncellemeyle pasifleştirilemez'
);

SELECT throws_ok(
  $$SELECT public.tedarikci_pasiflestir(
      '98000000-0000-4000-8000-000000000010',
      'aktif kaynaklar varken pasifleştirme testi',
      'pgtap-tedarikci-pasif'
    )$$,
  '23514',
  'TEDARIKCI_AKTIF_MALIYET_KAYNAKLARI_NEDENIYLE_PASIFLESTIRILEMEZ',
  'aktif maliyet kaynağı bulunan tedarikçi pasifleştirilemez'
);

CREATE TEMP TABLE pgtap_idempotency AS
SELECT (public.ticari_idempotency_baslat(
  'stok_maliyet_pgtap',
  'pgtap-idempotency-key',
  '{"deger":1}'::jsonb
) ->> 'idempotency_id')::uuid AS id;
SELECT public.ticari_idempotency_basarili(
  (SELECT id FROM pgtap_idempotency),
  '{"basarili":true,"kayit_id":"98000000-0000-4000-8000-000000000040"}'::jsonb
);

SELECT is(
  public.ticari_idempotency_baslat(
    'stok_maliyet_pgtap',
    'pgtap-idempotency-key',
    '{"deger":1}'::jsonb
  ) ->> 'aksiyon',
  'onceki_sonuc',
  'aynı idempotency anahtarı ve payload önceki başarılı sonucu döndürür'
);

SELECT throws_ok(
  $$SELECT public.ticari_idempotency_baslat(
      'stok_maliyet_pgtap',
      'pgtap-idempotency-key',
      '{"deger":2}'::jsonb
    )$$,
  'P0001',
  'IDEMPOTENCY_PAYLOAD_CONFLICT',
  'aynı idempotency anahtarı farklı payload ile kullanılamaz'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"98000000-0000-4000-8000-000000000002"}',
  true
);
SELECT throws_ok(
  $$SELECT public.stok_alis_fiyati_aktiflestir(
      '98000000-0000-4000-8000-000000000041',
      TIMESTAMPTZ '2100-01-01 00:00:00+03',
      'AAL2 zorunluluğu testi',
      'pgtap-aal2-key'
    )$$,
  '42501',
  'AAL2_GEREKLI',
  'kritik fiyat aktifleştirme AAL2 olmadan çalışmaz'
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"98000000-0000-4000-8000-000000000002"}',
  true
);
SELECT throws_ok(
  $$SELECT public.stok_alis_fiyati_aktiflestir(
      '98000000-0000-4000-8000-000000000040',
      TIMESTAMPTZ '2100-01-01 00:00:00+03',
      'cam doğrudan fiyat engeli testi',
      'pgtap-cam-direct'
    )$$,
  '23514',
  'CAM_MALIYET_KAYNAGI_BAGLANTI_OLMALI',
  'cam fiyatı bağlantı dışında doğrudan aktifleştirilemez'
);

INSERT INTO public.stok_alis_fiyatlari (
  id, stok_id, birim_fiyat, para_birimi, fiyat_birimi,
  stok_ana_birimi, donusum_katsayisi, vade_gunu, fiyat_tarihi,
  kaynak_turu, kaynak_referansi, durum
)
VALUES (
  '98000000-0000-4000-8000-000000000070',
  '98000000-0000-4000-8000-000000000020',
  50, 'TRY', 'm2', 'm2', 1, 0, TIMESTAMPTZ '2098-01-01 00:00:00+03',
  'legacy_unverified', 'test legacy fiyat', 'dogrulama_bekliyor'
);
SELECT throws_ok(
  $$SELECT public.stok_alis_fiyati_aktiflestir(
      '98000000-0000-4000-8000-000000000070',
      TIMESTAMPTZ '2101-01-01 00:00:00+03',
      'legacy fiyat aktivasyon testi',
      'pgtap-legacy-active'
    )$$,
  '23514',
  'DOGRULANMIS_FIYAT_GEREKLI',
  'doğrulanmamış legacy fiyat maliyet hesabına alınamaz'
);

SELECT ok(
  (
    SELECT conbin IS NOT NULL
    FROM pg_constraint
    WHERE conrelid = 'public.stok_alis_fiyatlari'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%birim_fiyat >%'
    LIMIT 1
  ),
  'sıfır ve negatif alış fiyatı CHECK kuralıyla engellenir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stok_alis_fiyatlari'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%paket_miktari >%'
  ),
  'negatif veya sıfır paket miktarı engellenir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stok_alis_fiyatlari'
      AND column_name = 'donusum_aciklamasi'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stok_alis_fiyatlari'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%donusum_aciklamasi%'
  ),
  'farklı fiyat birimi açık katsayı ve dönüşüm açıklaması olmadan kullanılamaz'
);

SELECT is(
  (
    SELECT fiyat_id
    FROM public.stok_maliyet_kaynagi_coz(
      '98000000-0000-4000-8000-000000000020',
      TIMESTAMPTZ '2098-12-31 23:59:59+03'
    )
  ),
  '98000000-0000-4000-8000-000000000040'::uuid,
  'gelecek tarihli B fiyatı bugünkü A maliyetine yansımaz'
);

SELECT is(
  (
    SELECT fiyat_id
    FROM public.stok_maliyet_kaynagi_coz(
      '98000000-0000-4000-8000-000000000020',
      TIMESTAMPTZ '2098-12-31 21:00:00+00'
    )
  ),
  '98000000-0000-4000-8000-000000000041'::uuid,
  'Europe/Istanbul tarih sınırı saat dilimi kayması olmadan çözülür'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok_maliyet_kaynagi_coz(
      '98000000-0000-4000-8000-000000000020',
      TIMESTAMPTZ '2099-06-01 12:00:00+03'
    )
  ),
  1,
  'çözümleyici en ucuz tedarikçiyi aramaz, kullanıcı tarafından aktif edilen tek kaynağı döndürür'
);

SELECT * FROM finish();
ROLLBACK;
