BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(36);

SELECT is(
  enum_range(NULL::public.ticari_modul_modu)::text,
  '{hazirlik,golge,aktif,bakim}',
  'feature mode enum yalnız hazırlık, gölge, aktif ve bakım durumlarını içerir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ticari_modul_durumu'::regclass
      AND contype = 'p'
      AND pg_get_constraintdef(oid) LIKE '%singleton%'
  ),
  'ticari mod durumu singleton primary key ile tekilleştirilir'
);

SELECT ok(
  (
    SELECT pg_get_expr(default_row.adbin, default_row.adrelid) LIKE '%hazirlik%'
    FROM pg_attrdef default_row
    JOIN pg_attribute attribute_row
      ON attribute_row.attrelid = default_row.adrelid
     AND attribute_row.attnum = default_row.adnum
    WHERE default_row.adrelid = 'public.ticari_modul_durumu'::regclass
      AND attribute_row.attname = 'mod'
  ),
  'feature mode varsayılanı hazırlıktır'
);

SELECT ok(
  position(
    'current_aal2()'
    IN pg_get_functiondef(
      'public.ticari_modul_modu_degistir(public.ticari_modul_modu,integer,text,text)'::regprocedure
    )
  ) > 0
  AND position(
    'FEATURE_MODE_GERI_DONUS_YASAK'
    IN pg_get_functiondef(
      'public.ticari_modul_modu_degistir(public.ticari_modul_modu,integer,text,text)'::regprocedure
    )
  ) > 0
  AND position(
    'ticari_modul_readiness()'
    IN pg_get_functiondef(
      'public.ticari_modul_modu_degistir(public.ticari_modul_modu,integer,text,text)'::regprocedure
    )
  ) > 0,
  'feature mode değişimi AAL2, geri dönüş kilidi ve readiness kontrolünü birlikte uygular'
);

SELECT is(
  (
    WITH expected_tables(table_name) AS (
      VALUES
        ('fiyat_listesi_surmleri'),
        ('maliyet_tarife_surmleri'),
        ('urun_maliyet_recete_surmleri'),
        ('kdv_grup_surmleri'),
        ('vade_profili_surmleri'),
        ('musteri_ticari_profil_surmleri')
    )
    SELECT count(*)::integer
    FROM expected_tables expected
    WHERE EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
      WHERE trigger_row.tgrelid = to_regclass('public.' || expected.table_name)
        AND NOT trigger_row.tgisinternal
        AND function_row.proname = 'ticari_surumu_degisiklige_karsi_koru'
        AND (trigger_row.tgtype & 2) = 2
        AND (trigger_row.tgtype & 8) = 8
        AND (trigger_row.tgtype & 16) = 16
    )
  ),
  6,
  'tüm yayınlanabilir sürüm tablolarında BEFORE UPDATE/DELETE immutability triggeri vardır'
);

SELECT is(
  (
    WITH expected_tables(table_name) AS (
      VALUES
        ('fiyat_listesi_urun_kalemleri'),
        ('fiyat_listesi_kenar_islem_kalemleri'),
        ('fiyat_listesi_menfez_kalemleri'),
        ('fiyat_listesi_kucuk_cam_kurallari'),
        ('fiyat_listesi_nakliye_kurallari'),
        ('fiyat_listesi_diger_kalemleri')
    )
    SELECT count(*)::integer
    FROM expected_tables expected
    WHERE EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
      WHERE trigger_row.tgrelid = to_regclass('public.' || expected.table_name)
        AND NOT trigger_row.tgisinternal
        AND function_row.proname = 'ticari_taslak_kalemini_koru'
    )
  ),
  6,
  'satış fiyat kalemleri yalnız taslak sürümde değiştirilebilir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger trigger_row
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    WHERE trigger_row.tgrelid = 'public.urun_maliyet_recete_kalemleri'::regclass
      AND NOT trigger_row.tgisinternal
      AND function_row.proname = 'ticari_taslak_kalemini_koru'
      AND (trigger_row.tgtype & 4) = 4
      AND (trigger_row.tgtype & 8) = 8
      AND (trigger_row.tgtype & 16) = 16
  ),
  'reçete kalemleri yayınlanmış sürüm üzerinde eklenemez, değiştirilemez veya silinemez'
);

SELECT ok(
  position(
    'YAYINLANMIS_SURUM_DEGISTIRILEMEZ'
    IN pg_get_functiondef('public.ticari_surumu_degisiklige_karsi_koru()'::regprocedure)
  ) > 0
  AND position(
    'ARSIV_SURUMU_DEGISTIRILEMEZ'
    IN pg_get_functiondef('public.ticari_surumu_degisiklige_karsi_koru()'::regprocedure)
  ) > 0,
  'ortak sürüm guardı yayın ve arşiv içeriklerini değişmez tutar'
);

SELECT is(
  (
    WITH function_names(name) AS (
      VALUES
        ('fiyat_listesi_surumu_yayinla'),
        ('maliyet_tarife_surumu_yayinla'),
        ('maliyet_recete_surumu_yayinla'),
        ('kdv_grup_surumu_yayinla'),
        ('vade_profili_surumu_yayinla'),
        ('musteri_ticari_profil_surumu_yayinla')
    )
    SELECT count(*)::integer
    FROM function_names expected
    JOIN pg_proc function_row ON function_row.proname = expected.name
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
  ),
  6,
  'authenticated rolü yalnız dış yayınlama RPC wrapperlarını çağırabilir'
);

SELECT is(
  (
    WITH function_names(name) AS (
      VALUES
        ('fiyat_listesi_surumu_yayinla'),
        ('maliyet_tarife_surumu_yayinla'),
        ('maliyet_recete_surumu_yayinla'),
        ('kdv_grup_surumu_yayinla'),
        ('vade_profili_surumu_yayinla'),
        ('musteri_ticari_profil_surumu_yayinla')
    )
    SELECT count(*)::integer
    FROM function_names expected
    JOIN pg_proc function_row ON function_row.proname = expected.name
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND has_function_privilege('anon', function_row.oid, 'EXECUTE')
  ),
  0,
  'anon yayınlama RPClerini çağıramaz'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.ticari_surum_yayinla_internal(text,text,text,uuid,integer,text,text,text)',
    'EXECUTE'
  ),
  'authenticated ortak internal yayınlama fonksiyonunu doğrudan çağıramaz'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.ticari_cam_kodu_sayac_tahsis(integer)',
    'EXECUTE'
  ),
  '10.000 satırlık dar cam sayaç allocatorı authenticated rolden revoke edilmiştir'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.ticari_cam_kodu_sayac_tahsis(integer)',
    'EXECUTE'
  ),
  '10.000 satırlık dar cam sayaç allocatorı anon rolden revoke edilmiştir'
);

SELECT ok(
  position(
    'p_adet > 10000'
    IN pg_get_functiondef('public.ticari_cam_kodu_sayac_tahsis(integer)'::regprocedure)
  ) > 0
  AND position(
    'VALUES (''cam_kodu'', p_adet)'
    IN pg_get_functiondef('public.ticari_cam_kodu_sayac_tahsis(integer)'::regprocedure)
  ) > 0,
  'dar allocator yalnız cam_kodu için 1..10.000 aralığını tahsis eder'
);

SELECT is(
  (
    WITH critical_functions(name) AS (
      VALUES
        ('cari_bakiye_ozetlerini_yeniden_olustur'),
        ('siparis_fiyatli_iptal'),
        ('cari_acilis_bakiyesi_kaydet'),
        ('cari_hareket_tersle'),
        ('manuel_doviz_kuru_kaydet'),
        ('ticari_readiness_kontrolu_onayla'),
        ('ticari_modul_modu_degistir')
    )
    SELECT count(*)::integer
    FROM critical_functions expected
    JOIN pg_proc function_row ON function_row.proname = expected.name
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND function_row.prosecdef
  ),
  7,
  'kritik finans ve yönetim RPClerinin tamamı SECURITY DEFINERdır'
);

SELECT is(
  (
    WITH critical_functions(name) AS (
      VALUES
        ('cari_bakiye_ozetlerini_yeniden_olustur'),
        ('siparis_fiyatli_iptal'),
        ('cari_acilis_bakiyesi_kaydet'),
        ('cari_hareket_tersle'),
        ('manuel_doviz_kuru_kaydet'),
        ('ticari_readiness_kontrolu_onayla'),
        ('ticari_modul_modu_degistir')
    )
    SELECT count(*)::integer
    FROM critical_functions expected
    JOIN pg_proc function_row ON function_row.proname = expected.name
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND position('current_aal2()' IN pg_get_functiondef(function_row.oid)) > 0
  ),
  7,
  'kritik finans ve yönetim RPClerinin tamamı sunucu tarafında AAL2 doğrular'
);

SELECT is(
  (
    WITH critical_functions(name) AS (
      VALUES
        ('cari_bakiye_ozetlerini_yeniden_olustur'),
        ('siparis_fiyatli_iptal'),
        ('cari_acilis_bakiyesi_kaydet'),
        ('cari_hareket_tersle'),
        ('manuel_doviz_kuru_kaydet'),
        ('ticari_readiness_kontrolu_onayla'),
        ('ticari_modul_modu_degistir')
    )
    SELECT count(*)::integer
    FROM critical_functions expected
    JOIN pg_proc function_row ON function_row.proname = expected.name
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
  ),
  7,
  'authenticated kritik dış RPC wrapperlarını çalıştırabilir'
);

SELECT is(
  (
    WITH critical_functions(name) AS (
      VALUES
        ('cari_bakiye_ozetlerini_yeniden_olustur'),
        ('siparis_fiyatli_iptal'),
        ('cari_acilis_bakiyesi_kaydet'),
        ('cari_hareket_tersle'),
        ('manuel_doviz_kuru_kaydet'),
        ('ticari_readiness_kontrolu_onayla'),
        ('ticari_modul_modu_degistir')
    )
    SELECT count(*)::integer
    FROM critical_functions expected
    JOIN pg_proc function_row ON function_row.proname = expected.name
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND has_function_privilege('anon', function_row.oid, 'EXECUTE')
  ),
  0,
  'anon kritik finans ve yönetim RPClerini çalıştıramaz'
);

SELECT is(
  (
    WITH critical_functions(name) AS (
      VALUES
        ('cari_bakiye_ozetlerini_yeniden_olustur'),
        ('siparis_fiyatli_iptal'),
        ('cari_acilis_bakiyesi_kaydet'),
        ('cari_hareket_tersle'),
        ('manuel_doviz_kuru_kaydet'),
        ('ticari_readiness_kontrolu_onayla'),
        ('ticari_modul_modu_degistir')
    )
    SELECT count(*)::integer
    FROM critical_functions expected
    JOIN pg_proc function_row ON function_row.proname = expected.name
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND COALESCE(array_to_string(function_row.proconfig, ','), '')
        LIKE '%search_path=pg_catalog, public%'
  ),
  7,
  'kritik SECURITY DEFINER RPCleri güvenli search_path kullanır'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '97100000-0000-4000-8000-000000000001',
  'ticari-aal1-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true
WHERE auth_user_id = '97100000-0000-4000-8000-000000000001';

INSERT INTO public.user_roles (auth_user_id, role_id)
SELECT
  '97100000-0000-4000-8000-000000000001',
  role_row.id
FROM public.roles role_row
WHERE role_row.slug = 'administrator'
ON CONFLICT DO NOTHING;

INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
VALUES (
  '97100000-0000-4000-8000-000000000002',
  '97100000-0000-4000-8000-000000000001',
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
  '97100000-0000-4000-8000-000000000003',
  '97100000-0000-4000-8000-000000000001',
  '97100000-0000-4000-8000-000000000004',
  'Ticari pgTAP',
  'desktop',
  'unknown',
  'unknown'
);

INSERT INTO public.user_device_sessions (
  auth_user_id,
  device_id,
  auth_session_id,
  signed_in_at
)
VALUES (
  '97100000-0000-4000-8000-000000000001',
  '97100000-0000-4000-8000-000000000003',
  '97100000-0000-4000-8000-000000000002',
  now()
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"97100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"97100000-0000-4000-8000-000000000002"}',
  true
);

SELECT throws_ok(
  $$SELECT public.ticari_modul_modu_degistir(
      'bakim'::public.ticari_modul_modu,
      1,
      'pgTAP AAL1 reddi',
      'pgtap-feature-aal1'
    )$$,
  '42501',
  'AAL2_GEREKLI',
  'feature mode değişimi AAL1 oturumunu çalışma zamanında reddeder'
);

SELECT throws_ok(
  $$SELECT public.fiyat_listesi_surumu_yayinla(
      '97100000-0000-4000-8000-000000000010',
      1,
      'pgtap-yayin-aal1'
    )$$,
  '42501',
  'AAL2_GEREKLI',
  'fiyat sürümü yayınlama AAL1 oturumunu çalışma zamanında reddeder'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM (
      SELECT
        constraint_row.oid,
        array_agg(attribute_row.attname::text ORDER BY key_row.ordinality) AS columns
      FROM pg_constraint constraint_row
      CROSS JOIN LATERAL unnest(constraint_row.conkey)
        WITH ORDINALITY AS key_row(attnum, ordinality)
      JOIN pg_attribute attribute_row
        ON attribute_row.attrelid = constraint_row.conrelid
       AND attribute_row.attnum = key_row.attnum
      WHERE constraint_row.conrelid = 'public.islem_idempotency'::regclass
        AND constraint_row.contype = 'u'
      GROUP BY constraint_row.oid
    ) unique_constraints
    WHERE unique_constraints.columns
      = ARRAY['kullanici_id', 'islem_tipi', 'idempotency_key']::text[]
  ),
  'idempotency kullanıcı, işlem tipi ve anahtar birleşiminde unique tutulur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fiyat_onizlemeleri'
      AND column_name IN ('girdi_hash', 'fiyat_baglam_hash', 'sonuc_hash')
      AND is_nullable = 'NO'
  ),
  3,
  'önizlemenin girdi, fiyat bağlamı ve sonuç hashleri zorunludur'
);

SELECT is(
  (
    WITH hash_columns(column_name) AS (
      VALUES ('girdi_hash'), ('fiyat_baglam_hash'), ('sonuc_hash')
    )
    SELECT count(*)::integer
    FROM hash_columns expected
    WHERE EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = 'public.fiyat_onizlemeleri'::regclass
        AND constraint_row.contype = 'c'
        AND pg_get_constraintdef(constraint_row.oid) LIKE '%' || expected.column_name || '%'
        AND pg_get_constraintdef(constraint_row.oid) LIKE '%64%'
    )
  ),
  3,
  'önizleme hashleri 64 haneli SHA-256 CHECK constraintleriyle korunur'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.islem_idempotency', 'INSERT'),
  'authenticated idempotency tablosuna doğrudan insert yapamaz'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.islem_idempotency', 'UPDATE'),
  'authenticated idempotency sonucunu doğrudan başarılıya çeviremez'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.fiyat_onizlemeleri', 'INSERT'),
  'authenticated fiyat önizleme snapshotını doğrudan yazamaz'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.fiyat_onizlemeleri', 'UPDATE'),
  'authenticated fiyat önizleme snapshotını doğrudan değiştiremez'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.fiyat_onizlemesini_dogrula(uuid,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'önizleme doğrulama helperı istemciden doğrudan çağrılamaz'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.fiyat_onizle(jsonb)', 'EXECUTE'),
  'authenticated yalnız dış fiyat önizleme RPCsini çağırabilir'
);

SELECT ok(
  position(
    'fiyat_hesapla_internal(p_payload, p_sabit_baglam)'
    IN pg_get_functiondef('public.fiyat_onizlemesini_dogrula(uuid,text,jsonb,jsonb)'::regprocedure)
  ) > 0
  AND position(
    'fiyat_baglam_hash'
    IN pg_get_functiondef('public.fiyat_onizlemesini_dogrula(uuid,text,jsonb,jsonb)'::regprocedure)
  ) > 0
  AND position(
    'sonuc_hash'
    IN pg_get_functiondef('public.fiyat_onizlemesini_dogrula(uuid,text,jsonb,jsonb)'::regprocedure)
  ) > 0
  AND position(
    'FIYAT_ONIZLEME_CAKISMASI'
    IN pg_get_functiondef('public.fiyat_onizlemesini_dogrula(uuid,text,jsonb,jsonb)'::regprocedure)
  ) > 0,
  'kayıt öncesi önizleme güncel bağlam ve sonuç hashini yeniden hesaplar'
);

SELECT ok(
  position(
    'IDEMPOTENCY_PAYLOAD_CONFLICT'
    IN pg_get_functiondef('public.ticari_idempotency_baslat(text,text,jsonb)'::regprocedure)
  ) > 0
  AND position(
    'FOR UPDATE'
    IN pg_get_functiondef('public.ticari_idempotency_baslat(text,text,jsonb)'::regprocedure)
  ) > 0,
  'idempotency helperı aynı anahtarın farklı payloadını ve eşzamanlı tekrarı korur'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.islem_idempotency'::regclass
      AND conname = 'islem_idempotency_sonuc_check'
      AND pg_get_constraintdef(oid) LIKE '%basarili%'
      AND pg_get_constraintdef(oid) LIKE '%sonuc_json%'
      AND pg_get_constraintdef(oid) LIKE '%tamamlanma_tarihi%'
  ),
  'idempotency başarı durumu sonuç ve tamamlanma zamanı olmadan kesinleşemez'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.ticari_eksik_kayit_raporu(text,date)',
    'EXECUTE'
  ),
  'authenticated ayrıntılı eksik kayıt raporunu çağırabilir'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.ticari_eksik_kayit_raporu(text,date)',
    'EXECUTE'
  ),
  'anon ayrıntılı eksik kayıt raporunu çağıramaz'
);

SELECT ok(
  (
    SELECT function_row.prosecdef
      AND COALESCE(array_to_string(function_row.proconfig, ','), '')
        LIKE '%search_path=pg_catalog, public%'
      AND position(
        'has_permission(''pricing'', ''read'')'
        IN pg_get_functiondef(function_row.oid)
      ) > 0
    FROM pg_proc function_row
    WHERE function_row.oid =
      'public.ticari_eksik_kayit_raporu(text,date)'::regprocedure
  ),
  'eksik kayıt raporu SECURITY DEFINER, güvenli search_path ve pricing:read kontrolü kullanır'
);

SELECT * FROM finish();
ROLLBACK;
