BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(14);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger trigger_row
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    WHERE trigger_row.tgrelid = 'public.cari_hareketleri'::regclass
      AND trigger_row.tgname = 'cari_hareketleri_immutable'
      AND NOT trigger_row.tgisinternal
      AND function_row.proname = 'cari_hareketi_degistirilemez'
      AND (trigger_row.tgtype & 2) = 2
      AND (trigger_row.tgtype & 8) = 8
      AND (trigger_row.tgtype & 16) = 16
  ),
  'cari hareketlerinde BEFORE UPDATE/DELETE append-only triggeri etkindir'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '97000000-0000-4000-8000-000000000001',
  'ticari-finans-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true
WHERE auth_user_id = '97000000-0000-4000-8000-000000000001';

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);
SELECT set_config('app.ticari_siparis_rpc', 'on', true);

INSERT INTO public.cari (id, kod, ad, tipi, aktif)
VALUES (
  '97000000-0000-4000-8000-000000000010',
  'PGTAP-TICARI-CARI',
  'pgTAP Ticari Cari',
  'musteri',
  true
);

INSERT INTO public.siparisler (id, siparis_no, cari_id, tarih, durum)
VALUES (
  '97000000-0000-4000-8000-000000000020',
  'PGTAP-TICARI-SIPARIS',
  '97000000-0000-4000-8000-000000000010',
  DATE '2099-01-01',
  'beklemede'
);

INSERT INTO public.cari_hareketleri (
  id,
  cari_id,
  para_birimi,
  yon,
  hareket_turu,
  tutar,
  islem_tarihi,
  aciklama,
  siparis_id,
  kaynak_sinifi,
  kaynak_turu,
  kaynak_id,
  islemi_yapan
)
VALUES (
  '97000000-0000-4000-8000-000000000030',
  '97000000-0000-4000-8000-000000000010',
  'TRY',
  'borc',
  'siparis_borcu',
  125.50,
  TIMESTAMPTZ '2099-01-01 10:00:00+03',
  'pgTAP sistem sipariş borcu',
  '97000000-0000-4000-8000-000000000020',
  'sistem',
  'siparis',
  '97000000-0000-4000-8000-000000000020',
  '97000000-0000-4000-8000-000000000001'
);

SELECT throws_ok(
  $$UPDATE public.cari_hareketleri
      SET aciklama = 'değiştirilemez'
    WHERE id = '97000000-0000-4000-8000-000000000030'$$,
  'P0001',
  'CARI_HAREKETI_DEGISTIRILEMEZ',
  'cari hareketi UPDATE ile değiştirilemez'
);

SELECT throws_ok(
  $$DELETE FROM public.cari_hareketleri
    WHERE id = '97000000-0000-4000-8000-000000000030'$$,
  'P0001',
  'CARI_HAREKETI_DEGISTIRILEMEZ',
  'cari hareketi DELETE ile silinemez'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger trigger_row
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    WHERE trigger_row.tgrelid = 'public.cari_hareketleri'::regclass
      AND trigger_row.tgname = 'cari_hareketleri_ters_kaynak_guard'
      AND NOT trigger_row.tgisinternal
      AND function_row.proname = 'cari_ters_kayit_kaynagini_koru'
      AND (trigger_row.tgtype & 2) = 2
      AND (trigger_row.tgtype & 4) = 4
  ),
  'ters kayıt kaynağı INSERT öncesinde trigger ile doğrulanır'
);

SELECT throws_ok(
  $$INSERT INTO public.cari_hareketleri (
      id, cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
      aciklama, siparis_id, kaynak_sinifi, kaynak_turu, kaynak_id,
      terslenen_hareket_id, islemi_yapan
    )
    VALUES (
      '97000000-0000-4000-8000-000000000031',
      '97000000-0000-4000-8000-000000000010',
      'TRY', 'alacak', 'ters_kayit', 125.50, now(),
      'yasak sistem terslemesi',
      '97000000-0000-4000-8000-000000000020',
      'manuel', 'cari_tersleme',
      '97000000-0000-4000-8000-000000000030',
      '97000000-0000-4000-8000-000000000030',
      '97000000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  'SISTEM_HAREKETI_MANUEL_TERSLENEMEZ',
  'sistem sipariş hareketi doğrudan ters kayıtla manuel terslenemez'
);

SELECT ok(
  position(
    'SISTEM_HAREKETI_MANUEL_TERSLENEMEZ'
    IN pg_get_functiondef('public.cari_hareket_tersle(uuid,text,text)'::regprocedure)
  ) > 0
  AND position(
    'kaynak_sinifi = ''sistem'''
    IN pg_get_functiondef('public.cari_hareket_tersle(uuid,text,text)'::regprocedure)
  ) > 0,
  'genel cari tersleme RPCsi sistem kaynağını ayrıca reddeder'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.cari_hareketleri', 'UPDATE'),
  'authenticated cari hareketlerini doğrudan güncelleyemez'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.cari_hareketleri', 'DELETE'),
  'authenticated cari hareketlerini doğrudan silemez'
);

SELECT is(
  (
    SELECT array_agg(attribute_row.attname::text ORDER BY key_row.ordinality)
    FROM pg_constraint constraint_row
    CROSS JOIN LATERAL unnest(constraint_row.conkey)
      WITH ORDINALITY AS key_row(attnum, ordinality)
    JOIN pg_attribute attribute_row
      ON attribute_row.attrelid = constraint_row.conrelid
     AND attribute_row.attnum = key_row.attnum
    WHERE constraint_row.conrelid = 'public.cari_bakiye_ozetleri'::regclass
      AND constraint_row.contype = 'p'
  ),
  ARRAY['cari_id', 'para_birimi']::text[],
  'cari bakiye özeti cari ve para birimi birleşik anahtarını kullanır'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'cari_hareketleri'
      AND indexname = 'cari_hareketleri_siparis_iptal_unique'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%siparis_iptal_borc%'
      AND indexdef LIKE '%siparis_iptal_alacak%'
  ),
  'sipariş iptal hareketi sipariş ve döviz bazında tekilleştirilir'
);

SELECT ok(
  position(
    'sum(tutar) FILTER (WHERE yon = ''borc'')'
    IN pg_get_functiondef('public.siparis_fiyatli_iptal(uuid,integer,text,text)'::regprocedure)
  ) > 0
  AND position(
    'sum(tutar) FILTER (WHERE yon = ''alacak'')'
    IN pg_get_functiondef('public.siparis_fiyatli_iptal(uuid,integer,text,text)'::regprocedure)
  ) > 0
  AND position(
    'v_net_etki := round(v_borc_toplami - v_alacak_toplami, 2)'
    IN pg_get_functiondef('public.siparis_fiyatli_iptal(uuid,integer,text,text)'::regprocedure)
  ) > 0,
  'sipariş iptali tüm borç ve alacaklardan net cari etkiyi hesaplar'
);

SELECT ok(
  position(
    'kaynak_sinifi = ''sistem'''
    IN pg_get_functiondef('public.siparis_fiyatli_iptal(uuid,integer,text,text)'::regprocedure)
  ) > 0
  AND position(
    'kaynak_turu = ''siparis'''
    IN pg_get_functiondef('public.siparis_fiyatli_iptal(uuid,integer,text,text)'::regprocedure)
  ) > 0,
  'iptal neti yalnız sipariş RPCsinin sistem hareketlerini kapsar'
);

SELECT ok(
  position(
    'kaynak_sinifi = ''manuel'''
    IN pg_get_functiondef('public.siparis_fiyatli_iptal(uuid,integer,text,text)'::regprocedure)
  ) > 0
  AND position(
    'haric_tutulan_tahsilat_on_odeme_toplami'
    IN pg_get_functiondef('public.siparis_fiyatli_iptal(uuid,integer,text,text)'::regprocedure)
  ) > 0,
  'sipariş bağlantılı manuel tahsilat ve ön ödeme iptal netinden hariç tutulur'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.cari_bakiye_ozetleri
    WHERE cari_id = '97000000-0000-4000-8000-000000000010'
      AND para_birimi = 'TRY'
      AND borc_toplami = 125.50
      AND alacak_toplami = 0
      AND net_bakiye = 125.50
  ),
  'append-only hareket inserti bakiye özetini aynı transactionda günceller'
);

SELECT * FROM finish();
ROLLBACK;
