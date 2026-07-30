BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
UPDATE public.device_session_settings SET enforcement_mode = 'observe';
SELECT plan(9);

SELECT has_function(
  'public',
  'tedarikci_aktiflestir',
  ARRAY['uuid', 'text', 'text'],
  'tedarikci yeniden aktiflestirme RPCsi vardir'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '94000000-0000-0000-0000-000000000120',
  'supplier-reactivation@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '94000000-0000-0000-0000-000000000120';

INSERT INTO public.user_roles (auth_user_id, role_id)
VALUES (
  '94000000-0000-0000-0000-000000000120',
  '10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.cari (
  id, kod, ad, tipi, aktif, tedarik_kapsamlari
)
VALUES (
  '94000000-0000-0000-0000-000000000121',
  'C-901200',
  'Yeniden Aktif Tedarikci',
  'tedarikci',
  false,
  ARRAY['cam']::text[]
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000000120","role":"authenticated","aal":"aal1"}',
  true
);

SELECT throws_ok(
  $$SELECT public.tedarikci_aktiflestir(
      '94000000-0000-0000-0000-000000000121',
      'AAL2 olmadan yeniden aktiflestirme',
      'pgtap-reactivate-aal1'
    )$$,
  '42501',
  'AAL2_GEREKLI',
  'AAL1 oturum tedarikciyi yeniden aktiflestiremez'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-0000-0000-000000000120","role":"authenticated","aal":"aal2"}',
  true
);

SELECT throws_ok(
  $$SELECT public.tedarikci_aktiflestir(
      '94000000-0000-0000-0000-000000000121',
      'kisa',
      'pgtap-reactivate-short-reason'
    )$$,
  '22023',
  'TEDARIKCI_AKTIFLESTIRME_GEREKCESI_ZORUNLU',
  'yeniden aktiflestirme gerekcesi en az bes karakterdir'
);

CREATE TEMP TABLE pgtap_tedarikci_aktiflestirme_sonucu AS
SELECT public.tedarikci_aktiflestir(
  '94000000-0000-0000-0000-000000000121',
  'Admin panelinden yeniden aktiflestirildi.',
  'pgtap-reactivate-success'
) AS sonuc;

SELECT is(
  (SELECT sonuc ->> 'aktif' FROM pgtap_tedarikci_aktiflestirme_sonucu),
  'true',
  'RPC aktif durumunu true dondurur'
);

SELECT is(
  (SELECT sonuc ->> 'gecmis_kayitlar_yeniden_acildi' FROM pgtap_tedarikci_aktiflestirme_sonucu),
  'false',
  'eski fiyat ve baglantilar otomatik yeniden acilmaz'
);

SELECT ok(
  (SELECT aktif FROM public.cari WHERE id = '94000000-0000-0000-0000-000000000121'),
  'tedarikci karti yeniden aktif olur'
);

SELECT is(
  public.tedarikci_aktiflestir(
    '94000000-0000-0000-0000-000000000121',
    'Admin panelinden yeniden aktiflestirildi.',
    'pgtap-reactivate-success'
  ) ->> 'aktif',
  'true',
  'ayni idempotency anahtari onceki basarili sonucu dondurur'
);

SELECT throws_ok(
  $$SELECT public.tedarikci_aktiflestir(
      '94000000-0000-0000-0000-000000000121',
      'Zaten aktif tedarikci yeniden deneniyor.',
      'pgtap-reactivate-already-active'
    )$$,
  '23514',
  'TEDARIKCI_ZATEN_AKTIF',
  'zaten aktif tedarikci yeni bir istekle tekrar aktiflestirilemez'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.audit_events
    WHERE table_name = 'cari'
      AND action = 'UPDATE'
      AND record_id = '94000000-0000-0000-0000-000000000121'
  ),
  'yeniden aktiflestirme audit kaydi uretir'
);

SELECT * FROM finish();
ROLLBACK;
