BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(17);

SELECT ok(
  to_regprocedure(
    'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'
  ) IS NOT NULL,
  'urun maliyeti tarihcesi RPC kurulur'
);

SELECT ok(
  (
    SELECT prosedur.prosecdef
      AND prosedur.provolatile = 's'
      AND prosedur.proretset
    FROM pg_proc prosedur
    WHERE prosedur.oid =
      'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure
  ),
  'RPC SECURITY DEFINER, STABLE ve set-returning siniridir'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure,
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure,
    'EXECUTE'
  ),
  'RPC authenticated role acik, anon role kapali tutulur'
);

SELECT ok(
  position(
    'stok_urun_maliyet_recete_surmleri'
    IN pg_get_functiondef(
      'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure
    )
  ) > 0
  AND position(
    'stok_fire_orani_surmleri'
    IN pg_get_functiondef(
      'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure
    )
  ) > 0
  AND position(
    'stok_maliyet_fiyat_secim_surmleri'
    IN pg_get_functiondef(
      'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure
    )
  ) > 0,
  'recete, ilgili bilesen fireleri ve kesin kaynak secimleri olay kaynagidir'
);

SELECT ok(
  position(
    'temper_maliyet_modu_surmleri'
    IN pg_get_functiondef(
      'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure
    )
  ) > 0
  AND position(
    'temper_dis_hizmet_fiyat_secim_surmleri'
    IN pg_get_functiondef(
      'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure
    )
  ) > 0
  AND position(
    'secim.urun_stok_id IS NULL OR secim.urun_stok_id = p_stok_id'
    IN pg_get_functiondef(
      'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure
    )
  ) > 0,
  'temper olaylari genel veya secili urun kapsamina daraltilir'
);

SELECT ok(
  position(
    'urun_maliyeti_detayli_hesapla_v3'
    IN pg_get_functiondef(
      'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure
    )
  ) > 0
  AND position(
    '1000'
    IN pg_get_functiondef(
      'public.urun_maliyeti_tarihcesi_v1(uuid,date,date,integer)'::regprocedure
    )
  ) > 0,
  'olay gunleri mevcut motorla sabit 1000x1000 mm yeniden hesaplanir'
);

SELECT ok(
  position(
    'V3_PARA_BIRIMI_DESTEKLENMIYOR'
    IN pg_get_functiondef(
      'public.urun_maliyeti_detayli_hesapla_temel_v3(uuid,date,numeric,numeric)'::regprocedure
    )
  ) > 0,
  'mevcut V3 motoru yabanci parayi hesaplamak yerine acik hata ile reddeder'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.urun_maliyeti_tarihcesi_v1(
      '97900000-0000-4000-8000-000000000020',
      '2300-01-01',
      '2300-01-10',
      20
    )
  $$,
  '42501',
  'COSTING_READ_YETKISI_GEREKLI',
  'oturumsuz cagri costing.read sinirinda reddedilir'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '97900000-0000-4000-8000-000000000001',
  'maliyet-tarihcesi-v117-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '97900000-0000-4000-8000-000000000001';

INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '97900000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

INSERT INTO auth.sessions(id, user_id, created_at, updated_at)
VALUES (
  '97900000-0000-4000-8000-000000000002',
  '97900000-0000-4000-8000-000000000001',
  now(),
  now()
);

INSERT INTO public.user_devices (
  id,
  auth_user_id,
  client_device_id,
  auto_display_name,
  device_type,
  os_family,
  browser_family
)
VALUES (
  '97900000-0000-4000-8000-000000000003',
  '97900000-0000-4000-8000-000000000001',
  '97900000-0000-4000-8000-000000000004',
  'Maliyet tarihcesi v117 pgTAP',
  'desktop',
  'Windows',
  'Chrome'
);

INSERT INTO public.user_device_sessions (
  auth_user_id,
  device_id,
  auth_session_id,
  signed_in_at
)
VALUES (
  '97900000-0000-4000-8000-000000000001',
  '97900000-0000-4000-8000-000000000003',
  '97900000-0000-4000-8000-000000000002',
  now()
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"97900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"97900000-0000-4000-8000-000000000002"}',
  true
);

INSERT INTO public.stok (
  id,
  kod,
  ad,
  kategori,
  birim,
  katman_yapisi,
  aktif,
  ticari_kapsam
)
VALUES (
  '97900000-0000-4000-8000-000000000020',
  'V117-TARIHCE-URUN',
  'V117 Tarihce Test Urunu',
  'cam',
  'm2',
  '4+16+4',
  true,
  'satilabilir'
);

CREATE TEMP TABLE v117_tarihce AS
SELECT *
FROM public.urun_maliyeti_tarihcesi_v1(
  '97900000-0000-4000-8000-000000000020',
  '2300-01-01',
  '2300-01-10',
  20
);

SELECT is(
  (SELECT count(*)::integer FROM v117_tarihce),
  2,
  'kaynak olayi olmasa da sorgu baslangic ve bitis durumlari doner'
);

SELECT is(
  (SELECT min(olay_tarihi) FROM v117_tarihce),
  '2300-01-01'::date,
  'sorgu baslangic tarihi zaman cizelgesine eklenir'
);

SELECT is(
  (SELECT max(olay_tarihi) FROM v117_tarihce),
  '2300-01-10'::date,
  'sorgu bitis tarihi zaman cizelgesine eklenir'
);

SELECT ok(
  (
    SELECT bool_and(
      NOT gecerli
      AND detay #>> '{hatalar,0,kod}' = 'AKTIF_RECETE_EKSIK'
    )
    FROM v117_tarihce
  ),
  'hesap sonucu uydurulmaz; eksik recete motorun gercek hatasiyla doner'
);

SELECT ok(
  (
    SELECT bool_and(finansman_etkisi = 0 AND kur_etkisi = 0)
    FROM v117_tarihce
  ),
  'TRY-only V3 sozlesmesinde kur ve finansman etkileri sifir izlenir'
);

SELECT is(
  (SELECT max(toplam_kayit)::integer FROM v117_tarihce),
  2,
  'UI icin limit oncesi toplam kayit metadatasi doner'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.urun_maliyeti_tarihcesi_v1(
      '97900000-0000-4000-8000-000000000020',
      '2300-01-01',
      '2300-01-10',
      1
    )
  ),
  1,
  'istenen limit sonuc satirlarini sinirlar'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.urun_maliyeti_tarihcesi_v1(
      '97900000-0000-4000-8000-000000000020',
      '2300-01-01',
      '2300-01-10',
      0
    )
  ),
  1,
  'sifir veya negatif limit guvenli alt sinir olan bire cekilir'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.urun_maliyeti_tarihcesi_v1(
      '97900000-0000-4000-8000-000000000020',
      '2300-02-01',
      '2300-01-01',
      20
    )
  $$,
  '22007',
  'MALIYET_TARIH_ARALIGI_GECERSIZ',
  'ters tarih araligi acik hata koduyla reddedilir'
);

SELECT * FROM finish();
ROLLBACK;
