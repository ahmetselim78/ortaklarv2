BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(45);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('stok_urun_maliyet_recete_surmleri'),
        ('stok_urun_maliyet_recete_kalemleri'),
        ('stok_fire_orani_surmleri'),
        ('stok_maliyet_fiyat_politika_surmleri'),
        ('stok_maliyet_fiyat_secim_surmleri')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE to_regclass('public.' || name) IS NOT NULL
  ),
  5,
  'v3 acik recete, fire ve fiyat secim tablolari kurulur'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('fiyat_varyanti'),
        ('marka'),
        ('fiyat_liste_kodu'),
        ('teklif_gecerlilik_donemi'),
        ('vade_turu')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'stok_alis_fiyatlari'
        AND c.column_name = expected.name
    )
  ),
  5,
  'mevcut append-only fiyat tablosu varyant, marka, donem ve vade turu tasir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stok_urun_maliyet_recete_surmleri'::regclass
      AND contype = 'x'
      AND pg_get_constraintdef(oid) LIKE '%urun_stok_id WITH =%'
      AND pg_get_constraintdef(oid) LIKE '%gecerlilik_donemi WITH &&%'
  ),
  'ayni urunun recete donemleri cakisma korumalidir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stok_maliyet_fiyat_secim_surmleri'::regclass
      AND contype = 'x'
      AND pg_get_constraintdef(oid) LIKE '%secim_seviyesi WITH =%'
  ),
  'toplu ve override secimleri kendi seviyelerinde tarihsel cakisma korumalidir'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('stok_tedarikci_fiyat_tekliflerini_kaydet_v3'),
        ('stok_maliyet_toplu_politika_uygula_v3'),
        ('stok_maliyet_stok_override_uygula_v3'),
        ('stok_maliyet_fiyat_secimini_coz_v3'),
        ('urun_maliyet_recetesi_kaydet_v3'),
        ('standart_urun_recetelerini_kur_v3'),
        ('stok_fire_orani_kaydet_v3'),
        ('urun_maliyeti_detayli_hesapla_v3'),
        ('urun_maliyetlerini_hesapla_v3'),
        ('stok_maliyet_kaynak_paneli_getir_v3'),
        ('stok_maliyet_katalogu_getir_v3')
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
  11,
  'v3 dis RPC sinirlari SECURITY DEFINER olarak bulunur'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '96000000-0000-4000-8000-000000000001',
  'stok-maliyet-v3-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);
UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '96000000-0000-4000-8000-000000000001';
INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '96000000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;
INSERT INTO auth.sessions(id, user_id, created_at, updated_at)
VALUES (
  '96000000-0000-4000-8000-000000000002',
  '96000000-0000-4000-8000-000000000001',
  now(),
  now()
);
INSERT INTO public.user_devices (
  id, auth_user_id, client_device_id, auto_display_name,
  device_type, os_family, browser_family
)
VALUES (
  '96000000-0000-4000-8000-000000000003',
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000004',
  'Stok maliyet v3 pgTAP',
  'desktop',
  'Windows',
  'Chrome'
);
INSERT INTO public.user_device_sessions (
  auth_user_id, device_id, auth_session_id, signed_in_at
)
VALUES (
  '96000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000003',
  '96000000-0000-4000-8000-000000000002',
  now()
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"96000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"96000000-0000-4000-8000-000000000002"}',
  true
);

INSERT INTO public.cari (
  id, kod, ad, tipi, aktif, tedarik_kapsamlari, tedarikci_calisma_modeli
)
VALUES
  (
    '96000000-0000-4000-8000-000000000010',
    'V3-TED-A', 'V3 Portal Tedarikcisi', 'tedarikci', true,
    ARRAY['cam', 'cita', 'yan_malzeme'], 'sisecam_portal'
  ),
  (
    '96000000-0000-4000-8000-000000000011',
    'V3-TED-B', 'V3 Bursa Tedarikcisi', 'tedarikci', true,
    ARRAY['cam', 'cita', 'yan_malzeme'], 'manuel_fiyat'
  );

INSERT INTO public.stok (
  id, kod, ad, kategori, kalinlik_mm, birim, aktif, ticari_kapsam
)
VALUES
  (
    '96000000-0000-4000-8000-000000000020',
    'V3-CAM-DUZ', 'V3 4 mm Duz', 'cam', 4, 'm2', true, 'maliyet_bileseni'
  ),
  (
    '96000000-0000-4000-8000-000000000021',
    'V3-CAM-KONFOR', 'V3 4 mm Konfor', 'cam', 4, 'm2', true, 'maliyet_bileseni'
  ),
  (
    '96000000-0000-4000-8000-000000000022',
    'V3-CAM-BUZLU', 'V3 4 mm Buzlu', 'cam', 4, 'm2', true, 'maliyet_bileseni'
  ),
  (
    '96000000-0000-4000-8000-000000000023',
    'V3-CITA-016', 'V3 16 mm Cita', 'cita', 16, 'm', true, 'maliyet_bileseni'
  ),
  (
    '96000000-0000-4000-8000-000000000024',
    'V3-BUTIL', 'V3 Butil', 'yan_malzeme', NULL, 'kg', true, 'maliyet_bileseni'
  ),
  (
    '96000000-0000-4000-8000-000000000025',
    'V3-NEM', 'V3 Nem Alici', 'yan_malzeme', NULL, 'kg', true, 'maliyet_bileseni'
  ),
  (
    '96000000-0000-4000-8000-000000000026',
    'SARF-PU', 'V3 Poliuretan', 'yan_malzeme', NULL, 'litre', true, 'maliyet_bileseni'
  ),
  (
    '96000000-0000-4000-8000-000000000027',
    'SARF-THIOKOL', 'V3 Thiokol', 'yan_malzeme', NULL, 'litre', false, 'maliyet_bileseni'
  ),
  (
    '96000000-0000-4000-8000-000000000028',
    'V3-CITA-SEED', 'V3 Seed Cita', 'cita', 99, 'm', true, 'maliyet_bileseni'
  );

INSERT INTO public.stok (
  id, kod, ad, kategori, birim, katman_yapisi, aktif, ticari_kapsam
)
VALUES
  (
    '96000000-0000-4000-8000-000000000030',
    'V3-URUN-KB', 'V3 4+16+4 Konfor Buzlu',
    'cam', 'm2', '4+16+4', true, 'satilabilir'
  ),
  (
    '96000000-0000-4000-8000-000000000031',
    'V3-URUN-UCLU', 'V3 4+16+4+16+4 Uclu',
    'cam', 'm2', '4+16+4+16+4', true, 'satilabilir'
  ),
  (
    '96000000-0000-4000-8000-000000000032',
    'V3-URUN-BELIRSIZ', 'V3 Karma Urun',
    'cam', 'm2', '4+16+4', true, 'satilabilir'
  );

INSERT INTO public.stok_fire_orani_surmleri (
  id, stok_id, fire_orani, gecerlilik_donemi, revision_no, aciklama,
  olusturan_kullanici_id
)
VALUES
  (
    '96000000-0000-4000-8000-000000000040',
    '96000000-0000-4000-8000-000000000020', 6,
    daterange('2095-01-01', NULL, '[)'), 1, 'v3 duz fire',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '96000000-0000-4000-8000-000000000041',
    '96000000-0000-4000-8000-000000000021', 10,
    daterange('2095-01-01', NULL, '[)'), 1, 'v3 konfor fire',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '96000000-0000-4000-8000-000000000042',
    '96000000-0000-4000-8000-000000000022', 10,
    daterange('2095-01-01', NULL, '[)'), 1, 'v3 buzlu fire',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '96000000-0000-4000-8000-000000000043',
    '96000000-0000-4000-8000-000000000023', 5,
    daterange('2095-01-01', NULL, '[)'), 1, 'v3 cita fire',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '96000000-0000-4000-8000-000000000044',
    '96000000-0000-4000-8000-000000000024', 0,
    daterange('2095-01-01', NULL, '[)'), 1, 'v3 butil fire',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '96000000-0000-4000-8000-000000000045',
    '96000000-0000-4000-8000-000000000025', 0,
    daterange('2095-01-01', NULL, '[)'), 1, 'v3 nem fire',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '96000000-0000-4000-8000-000000000046',
    '96000000-0000-4000-8000-000000000026', 0,
    daterange('2095-01-01', NULL, '[)'), 1, 'v3 pu fire',
    '96000000-0000-4000-8000-000000000001'
  );

CREATE TEMP TABLE v3_seed_setup AS
SELECT public.standart_urun_recetelerini_kur_v3(
  '2095-01-01',
  ARRAY[]::uuid[],
  true
) AS sonuc;

SELECT ok(
  (
    SELECT lower_inf(gecerlilik_donemi)
    FROM public.stok_fire_orani_surmleri
    WHERE stok_id = '96000000-0000-4000-8000-000000000028'
  ),
  'katalog kurulumunun eksik fire kaydi eksi sonsuz taban surumunden baslar'
);

CREATE TEMP TABLE v3_same_day_fire AS
SELECT public.stok_fire_orani_kaydet_v3(
  jsonb_build_object(
    'stok_id', '96000000-0000-4000-8000-000000000028',
    'fire_orani', 7,
    'baslangic', '2095-01-01',
    'aciklama', 'Kurulum gunu elle fire ayari'
  ),
  'v3-seed-fire-same-day'
) AS sonuc;

SELECT is(
  ((SELECT sonuc FROM v3_same_day_fire) ->> 'fire_orani')::numeric,
  7::numeric,
  'eksi sonsuz taban fire surumu kurulum gunu ilk gercek kullanici ayarini engellemez'
);

CREATE TEMP TABLE v3_offer_a AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '96000000-0000-4000-8000-000000000010',
    'fiyat_tarihi', '2094-01-01T00:00:00+03:00',
    'gecerlilik_baslangici', '2094-01-01',
    'gecerlilik_bitisi', '2100-01-01',
    'fiyat_liste_kodu', 'V3-A-LISTE',
    'kalemler', jsonb_build_array(
      jsonb_build_object('stok_id', '96000000-0000-4000-8000-000000000020', 'birim_fiyat', 100, 'fiyat_birimi', 'm2', 'varyant', 'ME', 'vade_gunu', 60),
      jsonb_build_object('stok_id', '96000000-0000-4000-8000-000000000021', 'birim_fiyat', 150, 'fiyat_birimi', 'm2', 'varyant', 'ME', 'vade_gunu', 60),
      jsonb_build_object('stok_id', '96000000-0000-4000-8000-000000000022', 'birim_fiyat', 120, 'fiyat_birimi', 'm2', 'varyant', 'ME', 'vade_gunu', 60),
      jsonb_build_object('stok_id', '96000000-0000-4000-8000-000000000023', 'birim_fiyat', 10, 'fiyat_birimi', 'm', 'varyant', 'ME', 'vade_gunu', 60),
      jsonb_build_object('stok_id', '96000000-0000-4000-8000-000000000024', 'birim_fiyat', 20, 'fiyat_birimi', 'kg', 'varyant', 'ME', 'vade_gunu', 60),
      jsonb_build_object('stok_id', '96000000-0000-4000-8000-000000000025', 'birim_fiyat', 5, 'fiyat_birimi', 'kg', 'varyant', 'ME', 'vade_gunu', 60),
      jsonb_build_object('stok_id', '96000000-0000-4000-8000-000000000026', 'birim_fiyat', 8, 'fiyat_birimi', 'litre', 'varyant', 'GENEL', 'vade_gunu', 60),
      jsonb_build_object('stok_id', '96000000-0000-4000-8000-000000000020', 'birim_fiyat', 115, 'fiyat_birimi', 'm2', 'varyant', 'ME', 'vade_gunu', 75)
    )
  ),
  'v3-offer-a-0001'
) AS sonuc;

CREATE TEMP TABLE v3_offer_b AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '96000000-0000-4000-8000-000000000011',
    'fiyat_tarihi', '2094-01-01T00:00:00+03:00',
    'gecerlilik_baslangici', '2094-01-01',
    'gecerlilik_bitisi', '2100-01-01',
    'kalemler', jsonb_build_array(
      jsonb_build_object('stok_id', '96000000-0000-4000-8000-000000000021', 'birim_fiyat', 130, 'fiyat_birimi', 'm2', 'varyant', 'GENEL', 'vade_gunu', 0)
    )
  ),
  'v3-offer-b-0001'
) AS sonuc;

SELECT is(
  ((SELECT sonuc FROM v3_offer_a) ->> 'adet')::integer,
  8,
  'cok satirli tedarikci fiyat teklifi atomik kaydedilir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.stok_alis_fiyatlari
    WHERE tedarikci_id = '96000000-0000-4000-8000-000000000010'
      AND stok_id = '96000000-0000-4000-8000-000000000020'
      AND kaynak_turu = 'dogrudan'
      AND fiyat_varyanti = 'me'
  ),
  'portal modelindeki tedarikci de genel v3 akisinda stok bazli cam teklifi verebilir'
);

CREATE TEMP TABLE v3_no_fallback AS
SELECT public.stok_maliyet_toplu_politika_uygula_v3(
  jsonb_build_object(
    'kapsam', 'yan_malzeme',
    'tedarikci_id', '96000000-0000-4000-8000-000000000010',
    'varyant', 'ME',
    'genel_fallback', false,
    'vade_gunu', 60,
    'stok_ids', jsonb_build_array('96000000-0000-4000-8000-000000000026'),
    'baslangic', '2094-06-01T00:00:00+03:00',
    'gerekce', 'Genel fallback kapali testi'
  ),
  'v3-policy-no-fallback'
) AS sonuc;

SELECT is(
  ((SELECT sonuc FROM v3_no_fallback) ->> 'eksik_adet')::integer,
  1,
  'ME politikasinda genel fallback kapaliysa GENEL fiyat sessizce secilmez'
);

CREATE TEMP TABLE v3_with_fallback AS
SELECT public.stok_maliyet_toplu_politika_uygula_v3(
  jsonb_build_object(
    'kapsam', 'yan_malzeme',
    'tedarikci_id', '96000000-0000-4000-8000-000000000010',
    'varyant', 'ME',
    'genel_fallback', true,
    'vade_gunu', 60,
    'stok_ids', jsonb_build_array('96000000-0000-4000-8000-000000000026'),
    'baslangic', '2094-07-01T00:00:00+03:00',
    'gerekce', 'Genel fallback acik testi'
  ),
  'v3-policy-with-fallback'
) AS sonuc;

SELECT is(
  (SELECT sonuc FROM v3_with_fallback) #>> '{secilenler,0,secilen_varyant}',
  'genel',
  'acikca istenen genel fallback secilen varyanti izlenebilir olarak dondurur'
);

CREATE TEMP TABLE v3_main_policy AS
SELECT public.stok_maliyet_toplu_politika_uygula_v3(
  jsonb_build_object(
    'kapsam', 'cam',
    'tedarikci_id', '96000000-0000-4000-8000-000000000010',
    'varyant', 'ME',
    'genel_fallback', true,
    'vade_gunu', 60,
    'stok_ids', jsonb_build_array(
      '96000000-0000-4000-8000-000000000026',
      '96000000-0000-4000-8000-000000000025',
      '96000000-0000-4000-8000-000000000024',
      '96000000-0000-4000-8000-000000000023',
      '96000000-0000-4000-8000-000000000022',
      '96000000-0000-4000-8000-000000000021',
      '96000000-0000-4000-8000-000000000020'
    ),
    'baslangic', '2095-01-01T00:00:00+03:00',
    'gerekce', 'Ana 60 gun politikasi'
  ),
  'v3-policy-main-0060'
) AS sonuc;

SELECT is(
  ((SELECT sonuc FROM v3_main_policy) ->> 'secilen_adet')::integer,
  7,
  'toplu politika verilen stok listesindeki yedi fiyat snapshotini secer'
);

SELECT is(
  (
    SELECT tedarikci_id
    FROM public.stok_maliyet_fiyat_secimini_coz_v3(
      '96000000-0000-4000-8000-000000000021',
      '2095-02-01T00:00:00+03:00'
    )
  ),
  '96000000-0000-4000-8000-000000000010'::uuid,
  'toplu secim A tedarikcisini cozer'
);

SELECT is(
  (
    SELECT vade_gunu
    FROM public.stok_maliyet_fiyat_secimini_coz_v3(
      '96000000-0000-4000-8000-000000000021',
      '2095-02-01T00:00:00+03:00'
    )
  ),
  60,
  'toplu politikada herhangi bir desteklenen vade gunu kesin secilir'
);

CREATE TEMP TABLE v3_recipe_double AS
SELECT public.urun_maliyet_recetesi_kaydet_v3(
  jsonb_build_object(
    'urun_stok_id', '96000000-0000-4000-8000-000000000030',
    'baslangic', '2095-01-01',
    'aciklama', 'Konfor Buzlu acik recetesi',
    'kalemler', jsonb_build_array(
      jsonb_build_object('sira_no', 1, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000021', 'rol', 'cam', 'tuketim_tipi', 'alan', 'katsayi', 1),
      jsonb_build_object('sira_no', 2, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000023', 'rol', 'cita', 'tuketim_tipi', 'cevre', 'katsayi', 1, 'bosluk_sirasi', 1),
      jsonb_build_object('sira_no', 3, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000022', 'rol', 'cam', 'tuketim_tipi', 'alan', 'katsayi', 1),
      jsonb_build_object('sira_no', 4, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000024', 'rol', 'sarf', 'tuketim_tipi', 'cevre', 'katsayi', 0.007, 'bosluk_sirasi', 1),
      jsonb_build_object('sira_no', 5, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000025', 'rol', 'sarf', 'tuketim_tipi', 'cevre', 'katsayi', 0.0375, 'bosluk_sirasi', 1),
      jsonb_build_object('sira_no', 6, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000026', 'rol', 'sarf', 'tuketim_tipi', 'cevre', 'katsayi', 0.0725, 'bosluk_sirasi', 1, 'alternatif_grubu', 'ikincil_dolgu')
    )
  ),
  'v3-recipe-double'
) AS sonuc;

SELECT is(
  ((SELECT sonuc FROM v3_recipe_double) ->> 'kalem_sayisi')::integer,
  6,
  'Konfor+Buzlu urunu sirali acik receteyle kaydedilir'
);

CREATE TEMP TABLE v3_cost_before AS
SELECT public.urun_maliyeti_detayli_hesapla_v3(
  '96000000-0000-4000-8000-000000000030',
  '2095-02-01',
  1000,
  1000
) AS sonuc;

SELECT is(
  ((SELECT sonuc FROM v3_cost_before) ->> 'gecerli')::boolean,
  true,
  'eksiksiz acik recete gecerli maliyet uretir'
);

SELECT ok(
  (SELECT sonuc FROM v3_cost_before) -> 'bilesenler'
    @> '[{"stok_kodu":"V3-CAM-KONFOR"},{"stok_kodu":"V3-CAM-BUZLU"}]'::jsonb,
  'Konfor+Buzlu recetesinde iki farkli gercek cam stogu korunur'
);

SELECT is(
  ((SELECT sonuc FROM v3_cost_before) ->> 'toplam_maliyet')::numeric,
  342.63::numeric,
  'cam, yuzde 5 cita firesi ve cevre sarflari beklenen toplami verir'
);

SELECT is(
  (
    SELECT (value ->> 'miktar')::numeric
    FROM jsonb_array_elements((SELECT sonuc FROM v3_cost_before) -> 'bilesenler')
    WHERE value ->> 'stok_kodu' = 'V3-CITA-016'
  ),
  4.20000000::numeric,
  '1x1 urunde cita 4 metre gercek cevre ve yuzde 5 fireyle 4.2 metredir'
);

SELECT is(
  (
    SELECT (value ->> 'miktar')::numeric
    FROM jsonb_array_elements((SELECT sonuc FROM v3_cost_before) -> 'bilesenler')
    WHERE value ->> 'stok_kodu' = 'V3-BUTIL'
  ),
  0.02800000::numeric,
  'butil tuketimi 0.007 kg/metre ile cevreye orantilidir'
);

SELECT is(
  (
    SELECT (value ->> 'miktar')::numeric
    FROM jsonb_array_elements((SELECT sonuc FROM v3_cost_before) -> 'bilesenler')
    WHERE value ->> 'stok_kodu' = 'V3-NEM'
  ),
  0.15000000::numeric,
  'nem alici tuketimi 0.0375 kg/metre ile cevreye orantilidir'
);

SELECT is(
  (
    SELECT (value ->> 'miktar')::numeric
    FROM jsonb_array_elements((SELECT sonuc FROM v3_cost_before) -> 'bilesenler')
    WHERE value ->> 'stok_kodu' = 'SARF-PU'
  ),
  0.29000000::numeric,
  'PU tuketimi 0.0725 litre/metre ile cevreye orantilidir'
);

CREATE TEMP TABLE v3_override AS
SELECT public.stok_maliyet_stok_override_uygula_v3(
  jsonb_build_object(
    'stok_id', '96000000-0000-4000-8000-000000000021',
    'fiyat_id', (
      SELECT id
      FROM public.stok_alis_fiyatlari
      WHERE stok_id = '96000000-0000-4000-8000-000000000021'
        AND tedarikci_id = '96000000-0000-4000-8000-000000000011'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ),
    'baslangic', '2095-06-01T00:00:00+03:00',
    'gerekce', 'Bursa tedarikcisi tekil istisnasi'
  ),
  'v3-override-konfor'
) AS sonuc;

SELECT is(
  (SELECT sonuc FROM v3_override) ->> 'secim_seviyesi',
  'stok_override',
  'stok bazli override toplu politikadan ayri kaydedilir'
);

SELECT is(
  (
    SELECT tedarikci_id
    FROM public.stok_maliyet_fiyat_secimini_coz_v3(
      '96000000-0000-4000-8000-000000000021',
      '2095-07-01T00:00:00+03:00'
    )
  ),
  '96000000-0000-4000-8000-000000000011'::uuid,
  'tekil override tarihinde Bursa tedarikcisi secilir'
);

SELECT is(
  (
    SELECT tedarikci_id
    FROM public.stok_maliyet_fiyat_secimini_coz_v3(
      '96000000-0000-4000-8000-000000000021',
      '2095-02-01T00:00:00+03:00'
    )
  ),
  '96000000-0000-4000-8000-000000000010'::uuid,
  'override gecmisteki toplu tedarikci snapshotini degistirmez'
);

SELECT is(
  (
    public.urun_maliyeti_detayli_hesapla_v3(
      '96000000-0000-4000-8000-000000000030',
      '2095-07-01',
      1000,
      1000
    ) ->> 'toplam_maliyet'
  )::numeric,
  320.63::numeric,
  'tekil tedarikci override urun maliyetine hesapli ve izlenebilir yansir'
);

CREATE TEMP TABLE v3_recipe_triple AS
SELECT public.urun_maliyet_recetesi_kaydet_v3(
  jsonb_build_object(
    'urun_stok_id', '96000000-0000-4000-8000-000000000031',
    'baslangic', '2095-01-01',
    'aciklama', 'Uclu cam acik recetesi',
    'kalemler', jsonb_build_array(
      jsonb_build_object('sira_no', 1, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000020', 'rol', 'cam', 'tuketim_tipi', 'alan', 'katsayi', 1),
      jsonb_build_object('sira_no', 2, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000023', 'rol', 'cita', 'tuketim_tipi', 'cevre', 'katsayi', 1, 'bosluk_sirasi', 1),
      jsonb_build_object('sira_no', 3, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000020', 'rol', 'cam', 'tuketim_tipi', 'alan', 'katsayi', 1),
      jsonb_build_object('sira_no', 4, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000023', 'rol', 'cita', 'tuketim_tipi', 'cevre', 'katsayi', 1, 'bosluk_sirasi', 2),
      jsonb_build_object('sira_no', 5, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000020', 'rol', 'cam', 'tuketim_tipi', 'alan', 'katsayi', 1),
      jsonb_build_object('sira_no', 6, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000024', 'rol', 'sarf', 'tuketim_tipi', 'cevre', 'katsayi', 0.007, 'bosluk_sirasi', 1),
      jsonb_build_object('sira_no', 7, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000025', 'rol', 'sarf', 'tuketim_tipi', 'cevre', 'katsayi', 0.0375, 'bosluk_sirasi', 1),
      jsonb_build_object('sira_no', 8, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000026', 'rol', 'sarf', 'tuketim_tipi', 'cevre', 'katsayi', 0.0725, 'bosluk_sirasi', 1, 'alternatif_grubu', 'ikincil_dolgu'),
      jsonb_build_object('sira_no', 9, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000024', 'rol', 'sarf', 'tuketim_tipi', 'cevre', 'katsayi', 0.007, 'bosluk_sirasi', 2),
      jsonb_build_object('sira_no', 10, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000025', 'rol', 'sarf', 'tuketim_tipi', 'cevre', 'katsayi', 0.0375, 'bosluk_sirasi', 2),
      jsonb_build_object('sira_no', 11, 'bilesen_stok_id', '96000000-0000-4000-8000-000000000026', 'rol', 'sarf', 'tuketim_tipi', 'cevre', 'katsayi', 0.0725, 'bosluk_sirasi', 2, 'alternatif_grubu', 'ikincil_dolgu')
    )
  ),
  'v3-recipe-triple'
) AS sonuc;

SELECT is(
  (
    public.urun_maliyeti_detayli_hesapla_v3(
      '96000000-0000-4000-8000-000000000031',
      '2095-02-01',
      1000,
      1000
    ) ->> 'gecerli'
  )::boolean,
  true,
  'uclu cam acik recetesi eksiksiz hesaplanir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM jsonb_array_elements(
      public.urun_maliyeti_detayli_hesapla_v3(
        '96000000-0000-4000-8000-000000000031',
        '2095-02-01',
        1000,
        1000
      ) -> 'bilesenler'
    )
    WHERE value ->> 'rol' = 'cam'
  ),
  3,
  'uclu urunde uc cam katmani acikca bulunur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM jsonb_array_elements(
      public.urun_maliyeti_detayli_hesapla_v3(
        '96000000-0000-4000-8000-000000000031',
        '2095-02-01',
        1000,
        1000
      ) -> 'bilesenler'
    )
    WHERE value ->> 'rol' = 'cita'
  ),
  2,
  'uclu urunde iki cita boslugu gercek cevreyle hesaplanir'
);

SELECT ok(
  (
    public.urun_maliyetlerini_hesapla_v3(
      '2095-02-01',
      1000,
      1000
    ) @> jsonb_build_object(
      'gecerli', true,
      'referans_en_mm', 1000,
      'referans_boy_mm', 1000,
      'referans_alan_m2', 1.000000,
      'referans_cevre_m', 4.000000,
      'urun_sayisi', 2,
      'gecerli_urun_sayisi', 2,
      'eksik_urun_sayisi', 0
    )
  ),
  'toplu v3 wrapper aktif receteleri ve referans olculerini sonuc sekmesi icin dondurur'
);

UPDATE public.stok SET aktif = true
WHERE id = '96000000-0000-4000-8000-000000000027';

SELECT throws_ok(
  $$INSERT INTO public.stok_urun_maliyet_recete_kalemleri (
      recete_surumu_id, sira_no, bilesen_stok_id, rol, tuketim_tipi,
      katsayi, bosluk_sirasi
    ) VALUES (
      (SELECT id FROM public.stok_urun_maliyet_recete_surmleri
       WHERE urun_stok_id = '96000000-0000-4000-8000-000000000030'),
      7, '96000000-0000-4000-8000-000000000027',
      'sarf', 'cevre', 0.0725, 1
    )$$,
  '23514',
  'RECETE_IKINCIL_DOLGU_CAKISMASI',
  'PU ve Thiokol ayni urun boslugunda birlikte kullanilamaz'
);

SELECT throws_ok(
  $$INSERT INTO public.stok_urun_maliyet_recete_surmleri (
      urun_stok_id, gecerlilik_donemi, revision_no, recete_kaynagi,
      aciklama, olusturan_kullanici_id
    ) VALUES (
      '96000000-0000-4000-8000-000000000030',
      daterange('2095-06-01', NULL, '[)'), 2, 'manuel',
      'cakisan recete testi',
      '96000000-0000-4000-8000-000000000001'
    )$$,
  '23P01',
  NULL,
  'ayni urunun recete surumleri tarihsel olarak cakistirilamaz'
);

SELECT is(
  public.maliyet_recete_onerisi_v3(
    '96000000-0000-4000-8000-000000000032'
  ) ->> 'durum',
  'belirsiz',
  'tanimsiz karma urun adi tahmin edilmez ve acikca belirsiz raporlanir'
);

SELECT is(
  (
    public.urun_maliyeti_detayli_hesapla_v3(
      '96000000-0000-4000-8000-000000000032',
      '2095-02-01',
      1000,
      1000
    ) #>> '{hatalar,0,kod}'
  ),
  'AKTIF_RECETE_EKSIK',
  'recetesi olmayan urun sessiz tahmin yerine acik hata verir'
);

CREATE TEMP TABLE v3_policy_75 AS
SELECT public.stok_maliyet_toplu_politika_uygula_v3(
  jsonb_build_object(
    'kapsam', 'cam',
    'tedarikci_id', '96000000-0000-4000-8000-000000000010',
    'varyant', 'ME',
    'vade_gunu', 75,
    'stok_ids', jsonb_build_array('96000000-0000-4000-8000-000000000020'),
    'baslangic', '2096-01-01T00:00:00+03:00',
    'gerekce', 'Duz cam 75 gun politikasi'
  ),
  'v3-policy-duz-0075'
) AS sonuc;

SELECT is(
  ((SELECT sonuc FROM v3_policy_75) ->> 'secilen_adet')::integer,
  1,
  'toplu vade politikasi daha sonraki tarihte 75 gune degistirilebilir'
);

SELECT is(
  (
    SELECT vade_gunu
    FROM public.stok_maliyet_fiyat_secimini_coz_v3(
      '96000000-0000-4000-8000-000000000020',
      '2096-02-01T00:00:00+03:00'
    )
  ),
  75,
  'yeni donemde 75 gun fiyat snapshoti cozulur'
);

SELECT is(
  (
    SELECT vade_gunu
    FROM public.stok_maliyet_fiyat_secimini_coz_v3(
      '96000000-0000-4000-8000-000000000020',
      '2095-02-01T00:00:00+03:00'
    )
  ),
  60,
  'vade degisikligi gecmisteki 60 gun snapshotini degistirmez'
);

CREATE TEMP TABLE v3_fire_change AS
SELECT public.stok_fire_orani_kaydet_v3(
  jsonb_build_object(
    'stok_id', '96000000-0000-4000-8000-000000000021',
    'fire_orani', 8,
    'baslangic', '2096-01-01',
    'aciklama', 'Konfor firesi elle guncellendi'
  ),
  'v3-fire-konfor-0008'
) AS sonuc;

SELECT is(
  ((SELECT sonuc FROM v3_fire_change) ->> 'fire_orani')::numeric,
  8::numeric,
  'cam firesi stok bazinda elle degistirilebilir'
);

SELECT is(
  (
    SELECT fire_orani
    FROM public.stok_fire_orani_surmleri
    WHERE stok_id = '96000000-0000-4000-8000-000000000021'
      AND gecerlilik_donemi @> DATE '2095-06-01'
  ),
  10.0000::numeric,
  'stok fire degisikligi gecmis fire snapshotini korur'
);

SELECT is(
  (
    SELECT fire_orani
    FROM public.stok_fire_orani_surmleri
    WHERE stok_id = '96000000-0000-4000-8000-000000000021'
      AND gecerlilik_donemi @> DATE '2096-06-01'
  ),
  8.0000::numeric,
  'stok fire degisikligi yeni donemde uygulanir'
);

SELECT ok(
  public.stok_maliyet_kaynak_paneli_getir_v3('2095-07-01')
    -> 'stoklar'
    @> '[{"stok_id":"96000000-0000-4000-8000-000000000021","aktif_fiyat":{"secim_seviyesi":"stok_override","tedarikci_id":"96000000-0000-4000-8000-000000000011"}}]'::jsonb,
  'kaynak paneli toplu secim uzerindeki tekil tedarikci override izini gosterir'
);

SELECT ok(
  public.stok_maliyet_katalogu_getir_v3('2095-07-01')
    ?& ARRAY['profiller', 'fiyatlar', 'ayarlar', 'tedarikciler', 'hesap', 'fireler', 'receteler', 'fiyat_paneli'],
  'v3 katalogu eski yonetim alanlarini koruyup yeni alanlari ekler'
);

SELECT is(
  public.stok_maliyet_katalogu_getir_v3('2095-07-01')
    #>> '{hesap,hesaplama_surumu}',
  'acik-recete-v3',
  'v3 katalogunun hesap alani eski tahmin motoru yerine toplu acik recete motorunu kullanir'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'public.stok_urun_maliyet_recete_surmleri',
    'INSERT'
  )
  AND NOT has_table_privilege(
    'authenticated',
    'public.stok_maliyet_fiyat_secim_surmleri',
    'UPDATE'
  ),
  'authenticated rol kritik v3 tablolara dogrudan yazamaz'
);

SELECT ok(
  to_regprocedure('public.urun_maliyeti_detayli_hesapla(uuid,date,numeric,numeric)')
    IS NOT NULL
  AND to_regprocedure('public.stok_maliyet_kaynagi_coz(uuid,timestamptz)')
    IS NOT NULL,
  'eski maliyet RPCleri geriye uyumluluk icin korunur'
);

SELECT * FROM finish();
ROLLBACK;
