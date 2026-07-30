BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(46);

SELECT has_function(
  'public',
  'tedarikci_legacy_fatura_odemesi_uzlastir',
  ARRAY['uuid', 'integer', 'jsonb', 'text'],
  'legacy tedarikci fatura/odeme uzlastirma RPCsi vardir'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.tedarikci_legacy_fatura_odemesi_uzlastir(uuid,integer,jsonb,text)'::regprocedure,
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.tedarikci_legacy_fatura_odemesi_uzlastir(uuid,integer,jsonb,text)'::regprocedure,
    'EXECUTE'
  ),
  'RPC yalniz authenticated sinirindan cagrilabilir'
);

SELECT ok(
  position(
    'has_permission(''finance'', ''manage'')'
    IN pg_get_functiondef(
      'public.tedarikci_legacy_fatura_odemesi_uzlastir(uuid,integer,jsonb,text)'::regprocedure
    )
  ) > 0
  AND position(
    'current_aal2()'
    IN pg_get_functiondef(
      'public.tedarikci_legacy_fatura_odemesi_uzlastir(uuid,integer,jsonb,text)'::regprocedure
    )
  ) > 0
  AND position(
    'ticari_idempotency_baslat'
    IN pg_get_functiondef(
      'public.tedarikci_legacy_fatura_odemesi_uzlastir(uuid,integer,jsonb,text)'::regprocedure
    )
  ) > 0
  AND position(
    'FOR UPDATE'
    IN pg_get_functiondef(
      'public.tedarikci_legacy_fatura_odemesi_uzlastir(uuid,integer,jsonb,text)'::regprocedure
    )
  ) > 0,
  'RPC finance.manage, AAL2, idempotency ve satir kilidi uygular'
);

CREATE TEMP TABLE pgtap_109_onay(onay jsonb NOT NULL);
INSERT INTO pgtap_109_onay(onay)
VALUES (jsonb_build_object(
  'tedarikci_id', '97900000-0000-4000-8000-000000000020',
  'portal_siparis_no', '55555',
  'fatura_no', 'FAT-55555',
  'fatura_tutari', 540000,
  'para_birimi', 'TRY',
  'fatura_tarihi', '2026-07-27',
  'odeme_tarihi', '2026-07-27',
  'gerekce', 'Kullanici 55555 numarali legacy kaydin net sifir uzlastirmasini onayladi.'
));

SELECT set_config('request.jwt.claims', '{}', true);
SELECT throws_ok(
  format(
    'SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(%L::uuid,1,%L::jsonb,%L)',
    '97900000-0000-4000-8000-000000000010',
    (SELECT onay::text FROM pgtap_109_onay),
    'pgtap-109-oturumsuz'
  ),
  '42501',
  'COSTING_UPDATE_YETKISI_GEREKLI',
  'oturumsuz kullanici uzlastirma yapamaz'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '97900000-0000-4000-8000-000000000001',
  'legacy-tedarikci-uzlastirma-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '97900000-0000-4000-8000-000000000001';

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
  'Legacy tedarikci uzlastirma pgTAP',
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

SELECT throws_ok(
  format(
    'SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(%L::uuid,1,%L::jsonb,%L)',
    '97900000-0000-4000-8000-000000000010',
    (SELECT onay::text FROM pgtap_109_onay),
    'pgtap-109-yetkisiz'
  ),
  '42501',
  'COSTING_UPDATE_YETKISI_GEREKLI',
  'costing update yetkisi olmayan kullanici uzlastirma yapamaz'
);

INSERT INTO public.roles (id, slug, name_tr, is_system)
VALUES (
  '97900000-0000-4000-8000-000000000090',
  'pgtap_109_costing_update',
  'pgTAP 109 Yalniz Costing Update',
  false
);

INSERT INTO public.role_permissions(role_id, permission_id)
SELECT
  '97900000-0000-4000-8000-000000000090',
  id
FROM public.permissions
WHERE module = 'costing'
  AND action = 'update';

INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '97900000-0000-4000-8000-000000000001',
  '97900000-0000-4000-8000-000000000090'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

SELECT throws_ok(
  format(
    'SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(%L::uuid,1,%L::jsonb,%L)',
    '97900000-0000-4000-8000-000000000010',
    (SELECT onay::text FROM pgtap_109_onay),
    'pgtap-109-finance-yetkisiz'
  ),
  '42501',
  'FINANCE_MANAGE_YETKISI_GEREKLI',
  'costing update var ama finance manage yoksa uzlastirma yapilamaz'
);

INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '97900000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

INSERT INTO public.cari (
  id,
  kod,
  ad,
  tipi,
  aktif,
  tedarik_kapsamlari,
  tedarikci_calisma_modeli
)
VALUES (
  '97900000-0000-4000-8000-000000000020',
  'PGTAP-109-TED',
  'pgTAP 109 Legacy Tedarikci',
  'tedarikci',
  true,
  ARRAY['cam'],
  'manuel_fiyat'
);

INSERT INTO public.tedarikci_siparisleri (
  id,
  tedarikci_id,
  portal_siparis_no,
  siparis_tarihi,
  vade_gunu,
  para_birimi,
  siparis_tutari,
  fatura_no,
  fatura_tarihi,
  fatura_tutari,
  odeme_tarihi,
  aciklama,
  olusturan_kullanici_id,
  revision_no
)
VALUES (
  '97900000-0000-4000-8000-000000000010',
  '97900000-0000-4000-8000-000000000020',
  '55555',
  DATE '2026-07-01',
  0,
  'TRY',
  540000,
  'FAT-55555',
  DATE '2026-07-27',
  540000,
  DATE '2026-07-27',
  '109 legacy uzlastirma testi',
  '97900000-0000-4000-8000-000000000001',
  1
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"97900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"97900000-0000-4000-8000-000000000002"}',
  true
);

SELECT throws_ok(
  format(
    'SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(%L::uuid,1,%L::jsonb,%L)',
    '97900000-0000-4000-8000-000000000010',
    (SELECT onay::text FROM pgtap_109_onay),
    'pgtap-109-aal1'
  ),
  '42501',
  'AAL2_GEREKLI',
  'AAL1 oturumu kritik uzlastirmayi yapamaz'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"97900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"97900000-0000-4000-8000-000000000002"}',
  true
);

SELECT throws_ok(
  format(
    'SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(%L::uuid,1,%L::jsonb,%L)',
    '97900000-0000-4000-8000-000000000010',
    (SELECT (onay - 'tedarikci_id')::text FROM pgtap_109_onay),
    'pgtap-109-tedarikci-eksik'
  ),
  '22023',
  'LEGACY_UZLASTIRMA_ONAY_BILGILERI_GECERSIZ',
  'onay snapshotinda tedarikci kimligi zorunludur'
);

SELECT throws_ok(
  format(
    'SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(%L::uuid,1,%L::jsonb,%L)',
    '97900000-0000-4000-8000-000000000010',
    (
      SELECT jsonb_set(
        onay,
        '{tedarikci_id}',
        '"97900000-0000-4000-8000-000000000021"'::jsonb
      )::text
      FROM pgtap_109_onay
    ),
    'pgtap-109-yanlis-tedarikci'
  ),
  '40001',
  'LEGACY_UZLASTIRMA_ONAY_SNAPSHOT_CAKISMASI',
  'onaylanan tedarikci siparis tedarikcisiyle birebir eslesmelidir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000010'
      AND kaynak_turu IN ('tedarikci_faturasi', 'tedarikci_odemesi')
  ),
  0,
  'yanlis tedarikci onayi hicbir cari hareket olusturmaz'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000010'
      AND kaynak_turu IN ('tedarikci_faturasi', 'tedarikci_odemesi')
  ),
  0,
  'migration legacy siparise sessizce cari hareket eklemez'
);

SELECT throws_ok(
  format(
    'SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(%L::uuid,1,%L::jsonb,%L)',
    '97900000-0000-4000-8000-000000000010',
    (
      SELECT jsonb_set(onay, '{fatura_tutari}', '540001'::jsonb)::text
      FROM pgtap_109_onay
    ),
    'pgtap-109-yanlis-snapshot'
  ),
  '40001',
  'LEGACY_UZLASTIRMA_ONAY_SNAPSHOT_CAKISMASI',
  'kullanicinin onayladigi tutar siparis snapshotiyla uyusmalidir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000010'
      AND kaynak_turu IN ('tedarikci_faturasi', 'tedarikci_odemesi')
  ),
  0,
  'snapshot cakismasi hicbir cari hareket olusturmaz'
);

CREATE TEMP TABLE pgtap_109_sonuc AS
SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(
  '97900000-0000-4000-8000-000000000010',
  1,
  (SELECT onay FROM pgtap_109_onay),
  'pgtap-109-uzlastir-55555'
) AS yanit;

SELECT ok(
  (SELECT (yanit ->> 'basarili')::boolean FROM pgtap_109_sonuc)
  AND (SELECT yanit ->> 'durum' = 'uzlastirildi' FROM pgtap_109_sonuc)
  AND NOT (SELECT (yanit ->> 'idempotent')::boolean FROM pgtap_109_sonuc),
  'ilk onay iki hareketi uzlastirildi durumuyla olusturur'
);

SELECT ok(
  (SELECT (yanit ->> 'fatura_tutari')::numeric = 540000 FROM pgtap_109_sonuc)
  AND (
    SELECT yanit ->> 'tedarikci_id' =
      '97900000-0000-4000-8000-000000000020'
    FROM pgtap_109_sonuc
  )
  AND (SELECT yanit ->> 'para_birimi' = 'TRY' FROM pgtap_109_sonuc)
  AND (SELECT yanit ->> 'fatura_tarihi' = '2026-07-27' FROM pgtap_109_sonuc)
  AND (SELECT yanit ->> 'odeme_tarihi' = '2026-07-27' FROM pgtap_109_sonuc)
  AND (
    SELECT (yanit ->> 'uzlastirilan_cift_net_etki')::numeric = 0
    FROM pgtap_109_sonuc
  )
  AND (
    SELECT (yanit ->> 'bu_islem_net_etki')::numeric = 0
    FROM pgtap_109_sonuc
  ),
  'yanit tedarikciyi, onaylanan snapshoti ve iki net etkiyi dondurur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000010'
      AND kaynak_turu IN ('tedarikci_faturasi', 'tedarikci_odemesi')
  ),
  2,
  'uzlastirma tam olarak iki cari hareket olusturur'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.cari_hareketleri
    WHERE id = (
      SELECT (yanit ->> 'fatura_cari_hareket_id')::uuid
      FROM pgtap_109_sonuc
    )
      AND cari_id = '97900000-0000-4000-8000-000000000020'
      AND para_birimi = 'TRY'
      AND yon = 'alacak'
      AND hareket_turu = 'tedarikci_faturasi'
      AND tutar = 540000
      AND (islem_tarihi AT TIME ZONE 'Europe/Istanbul')::date = DATE '2026-07-27'
      AND kaynak_sinifi = 'sistem'
      AND kaynak_id = '97900000-0000-4000-8000-000000000010'
  ),
  'fatura tedarikci alacagi olarak tarihsel tarihle yazilir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.cari_hareketleri
    WHERE id = (
      SELECT (yanit ->> 'odeme_cari_hareket_id')::uuid
      FROM pgtap_109_sonuc
    )
      AND cari_id = '97900000-0000-4000-8000-000000000020'
      AND para_birimi = 'TRY'
      AND yon = 'borc'
      AND hareket_turu = 'tedarikci_odemesi'
      AND tutar = 540000
      AND (islem_tarihi AT TIME ZONE 'Europe/Istanbul')::date = DATE '2026-07-27'
      AND kaynak_sinifi = 'sistem'
      AND kaynak_id = '97900000-0000-4000-8000-000000000010'
  ),
  'odeme tedarikci borcu olarak tarihsel tarihle yazilir'
);

SELECT is(
  (
    SELECT
      COALESCE(sum(tutar) FILTER (WHERE yon = 'borc'), 0)
      - COALESCE(sum(tutar) FILTER (WHERE yon = 'alacak'), 0)
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000010'
      AND kaynak_turu IN ('tedarikci_faturasi', 'tedarikci_odemesi')
  ),
  0::numeric,
  'fatura ve odemenin cari net etkisi sifirdir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_siparisleri siparis
    WHERE siparis.id = '97900000-0000-4000-8000-000000000010'
      AND siparis.fatura_cari_hareket_id = (
        SELECT (yanit ->> 'fatura_cari_hareket_id')::uuid
        FROM pgtap_109_sonuc
      )
      AND siparis.odeme_cari_hareket_id = (
        SELECT (yanit ->> 'odeme_cari_hareket_id')::uuid
        FROM pgtap_109_sonuc
      )
  ),
  'siparis iki cari hareket FKsiyle baglanir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_siparisleri
    WHERE id = '97900000-0000-4000-8000-000000000010'
      AND revision_no = 2
      AND fatura_onaylandi_at IS NOT NULL
      AND odeme_onaylandi_at IS NOT NULL
      AND son_guncelleyen_kullanici_id =
        '97900000-0000-4000-8000-000000000001'
  ),
  'baslik revision, onay zamanlari ve onaylayan kullaniciyla guncellenir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.islem_idempotency
    WHERE kullanici_id = '97900000-0000-4000-8000-000000000001'
      AND islem_tipi = 'tedarikci_legacy_fatura_odemesi_uzlastir'
      AND idempotency_key = 'pgtap-109-uzlastir-55555'
      AND durum = 'basarili'
      AND sonuc_json = (SELECT yanit FROM pgtap_109_sonuc)
  ),
  'uzlastirma sonucu merkezi idempotency kaydinda tamamlanir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.audit_events
    WHERE table_name = 'cari_hareketleri'
      AND record_id IN (
        SELECT yanit ->> 'fatura_cari_hareket_id' FROM pgtap_109_sonuc
        UNION ALL
        SELECT yanit ->> 'odeme_cari_hareket_id' FROM pgtap_109_sonuc
      )
      AND action = 'INSERT'
  ),
  2,
  'iki finansal hareket ayni transactionda audit edilir'
);

SELECT ok(
  (
    SELECT bool_and(
      metadata ->> 'rpc_adi' = 'tedarikci_legacy_fatura_odemesi_uzlastir'
      AND metadata ->> 'idempotency_key' = 'pgtap-109-uzlastir-55555'
      AND metadata ->> 'kaynak' = 'legacy_tedarikci_cari_uzlastirma'
      AND metadata ->> 'aal' = 'aal2'
      AND metadata ->> 'gerekce' =
        'Kullanici 55555 numarali legacy kaydin net sifir uzlastirmasini onayladi.'
    )
    FROM public.audit_events
    WHERE table_name = 'cari_hareketleri'
      AND record_id IN (
        SELECT yanit ->> 'fatura_cari_hareket_id' FROM pgtap_109_sonuc
        UNION ALL
        SELECT yanit ->> 'odeme_cari_hareket_id' FROM pgtap_109_sonuc
      )
      AND action = 'INSERT'
  ),
  'audit AAL2, gerekce, kaynak ve idempotency baglamini tasir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.audit_events
    WHERE table_name = 'tedarikci_siparisleri'
      AND record_id = '97900000-0000-4000-8000-000000000010'
      AND action = 'UPDATE'
      AND metadata ->> 'rpc_adi' =
        'tedarikci_legacy_fatura_odemesi_uzlastir'
  ),
  'siparis FK ve revision guncellemesi de audit edilir'
);

SELECT is(
  public.tedarikci_legacy_fatura_odemesi_uzlastir(
    '97900000-0000-4000-8000-000000000010',
    1,
    (SELECT onay FROM pgtap_109_onay),
    'pgtap-109-uzlastir-55555'
  ),
  (SELECT yanit FROM pgtap_109_sonuc),
  'ayni idempotency anahtari onceki sonucu aynen dondurur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000010'
      AND kaynak_turu IN ('tedarikci_faturasi', 'tedarikci_odemesi')
  ),
  2,
  'idempotent tekrar ikinci hareket cifti olusturmaz'
);

SELECT throws_ok(
  format(
    'SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(%L::uuid,1,%L::jsonb,%L)',
    '97900000-0000-4000-8000-000000000010',
    (
      SELECT jsonb_set(onay, '{gerekce}', '"Farkli ve yeterince uzun bir gerekce"'::jsonb)::text
      FROM pgtap_109_onay
    ),
    'pgtap-109-uzlastir-55555'
  ),
  'P0001',
  'IDEMPOTENCY_PAYLOAD_CONFLICT',
  'ayni idempotency anahtari farkli onay payloadiyla kullanilamaz'
);

CREATE TEMP TABLE pgtap_109_mevcut_sonuc AS
SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(
  '97900000-0000-4000-8000-000000000010',
  1,
  (SELECT onay FROM pgtap_109_onay),
  'pgtap-109-zaten-uzlasmis'
) AS yanit;

SELECT ok(
  (SELECT (yanit ->> 'idempotent')::boolean FROM pgtap_109_mevcut_sonuc)
  AND (
    SELECT yanit ->> 'durum' = 'zaten_uzlastirilmis'
    FROM pgtap_109_mevcut_sonuc
  )
  AND (
    SELECT (yanit ->> 'uzlastirilan_cift_net_etki')::numeric = 0
    FROM pgtap_109_mevcut_sonuc
  )
  AND (
    SELECT (yanit ->> 'bu_islem_net_etki')::numeric = 0
    FROM pgtap_109_mevcut_sonuc
  ),
  'tamamen bagli kayit idempotent ve gercek net etkilerle okunur'
);

SELECT is(
  (
    SELECT revision_no
    FROM public.tedarikci_siparisleri
    WHERE id = '97900000-0000-4000-8000-000000000010'
  ),
  2,
  'zaten uzlasmis kayit yeni anahtarla revision artirmaz'
);

-- Kaynak_turu+kaynak_id ayni oldugu halde farkli dovizde bulunan sistem
-- hareketi sessizce yok sayilmaz.
INSERT INTO public.tedarikci_siparisleri (
  id, tedarikci_id, portal_siparis_no, siparis_tarihi, vade_gunu,
  para_birimi, siparis_tutari, fatura_no, fatura_tarihi, fatura_tutari,
  odeme_tarihi, aciklama, olusturan_kullanici_id, revision_no
)
VALUES (
  '97900000-0000-4000-8000-000000000011',
  '97900000-0000-4000-8000-000000000020',
  '55556',
  DATE '2026-07-01',
  0,
  'TRY',
  100,
  'FAT-55556',
  DATE '2026-07-27',
  100,
  DATE '2026-07-27',
  '109 farkli doviz cakisma testi',
  '97900000-0000-4000-8000-000000000001',
  1
);

INSERT INTO public.cari_hareketleri (
  cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
  aciklama, kaynak_sinifi, kaynak_turu, kaynak_id, islemi_yapan
)
VALUES (
  '97900000-0000-4000-8000-000000000020',
  'USD',
  'alacak',
  'tedarikci_faturasi',
  100,
  TIMESTAMPTZ '2026-07-27 00:00:00+03',
  'Ayni kaynakta bilerek cakisan farkli doviz hareketi',
  'sistem',
  'tedarikci_faturasi',
  '97900000-0000-4000-8000-000000000011',
  '97900000-0000-4000-8000-000000000001'
);

SELECT throws_ok(
  format(
    'SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(%L::uuid,1,%L::jsonb,%L)',
    '97900000-0000-4000-8000-000000000011',
    jsonb_build_object(
      'tedarikci_id', '97900000-0000-4000-8000-000000000020',
      'portal_siparis_no', '55556',
      'fatura_no', 'FAT-55556',
      'fatura_tutari', 100,
      'para_birimi', 'TRY',
      'fatura_tarihi', '2026-07-27',
      'odeme_tarihi', '2026-07-27',
      'gerekce', 'Farkli doviz hareketi guvenlik testi icin kullanici onayi.'
    )::text,
    'pgtap-109-farkli-doviz-cakisma'
  ),
  '23514',
  'LEGACY_UZLASTIRMA_FATURA_HAREKETI_CAKISIYOR',
  'ayni kaynaktaki farkli doviz sistem hareketi guvenli hata verir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000011'
      AND kaynak_turu = 'tedarikci_odemesi'
  ),
  0,
  'farkli doviz cakismasinda eksik odeme hareketi olusturulmaz'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_siparisleri
    WHERE id = '97900000-0000-4000-8000-000000000011'
      AND fatura_cari_hareket_id IS NULL
      AND odeme_cari_hareket_id IS NULL
      AND revision_no = 1
  ),
  'farkli doviz cakismasinda siparis basligi degismez'
);

-- Kaynak_turu+kaynak_id ve para birimi ayni olsa bile manuel kaynak sinifi
-- kanonik sistem hareketi olarak benimsenmez.
INSERT INTO public.tedarikci_siparisleri (
  id, tedarikci_id, portal_siparis_no, siparis_tarihi, vade_gunu,
  para_birimi, siparis_tutari, fatura_no, fatura_tarihi, fatura_tutari,
  odeme_tarihi, aciklama, olusturan_kullanici_id, revision_no
)
VALUES (
  '97900000-0000-4000-8000-000000000015',
  '97900000-0000-4000-8000-000000000020',
  '55560',
  DATE '2026-07-01',
  0,
  'TRY',
  150,
  'FAT-55560',
  DATE '2026-07-27',
  150,
  DATE '2026-07-27',
  '109 manuel kaynak sinifi cakisma testi',
  '97900000-0000-4000-8000-000000000001',
  1
);

INSERT INTO public.cari_hareketleri (
  cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
  aciklama, kaynak_sinifi, kaynak_turu, kaynak_id, islemi_yapan
)
VALUES (
  '97900000-0000-4000-8000-000000000020',
  'TRY',
  'alacak',
  'tedarikci_faturasi',
  150,
  TIMESTAMPTZ '2026-07-27 00:00:00+03',
  'Ayni kaynakta bilerek cakisan manuel hareket',
  'manuel',
  'tedarikci_faturasi',
  '97900000-0000-4000-8000-000000000015',
  '97900000-0000-4000-8000-000000000001'
);

SELECT throws_ok(
  format(
    'SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(%L::uuid,1,%L::jsonb,%L)',
    '97900000-0000-4000-8000-000000000015',
    jsonb_build_object(
      'tedarikci_id', '97900000-0000-4000-8000-000000000020',
      'portal_siparis_no', '55560',
      'fatura_no', 'FAT-55560',
      'fatura_tutari', 150,
      'para_birimi', 'TRY',
      'fatura_tarihi', '2026-07-27',
      'odeme_tarihi', '2026-07-27',
      'gerekce', 'Manuel kaynak sinifi guvenlik testi icin kullanici onayi.'
    )::text,
    'pgtap-109-manuel-kaynak-cakisma'
  ),
  '23514',
  'LEGACY_UZLASTIRMA_FATURA_HAREKETI_CAKISIYOR',
  'ayni kaynaktaki manuel hareket bagimsiz olarak guvenli hata verir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000015'
      AND kaynak_turu = 'tedarikci_odemesi'
  ),
  0,
  'manuel kaynak cakismasinda eksik odeme hareketi olusturulmaz'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_siparisleri
    WHERE id = '97900000-0000-4000-8000-000000000015'
      AND fatura_cari_hareket_id IS NULL
      AND odeme_cari_hareket_id IS NULL
      AND revision_no = 1
  ),
  'manuel kaynak cakismasinda siparis basligi degismez'
);

-- Dogru mevcut fatura hareketi benimsenir; yalniz eksik odeme eklenir.
INSERT INTO public.tedarikci_siparisleri (
  id, tedarikci_id, portal_siparis_no, siparis_tarihi, vade_gunu,
  para_birimi, siparis_tutari, fatura_no, fatura_tarihi, fatura_tutari,
  odeme_tarihi, aciklama, olusturan_kullanici_id, revision_no
)
VALUES (
  '97900000-0000-4000-8000-000000000012',
  '97900000-0000-4000-8000-000000000020',
  '55557',
  DATE '2026-07-01',
  0,
  'TRY',
  250,
  'FAT-55557',
  DATE '2026-07-27',
  250,
  DATE '2026-07-28',
  '109 eksik hareket tamamlama testi',
  '97900000-0000-4000-8000-000000000001',
  1
);

INSERT INTO public.cari_hareketleri (
  cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
  aciklama, kaynak_sinifi, kaynak_turu, kaynak_id, islemi_yapan
)
VALUES (
  '97900000-0000-4000-8000-000000000020',
  'TRY',
  'alacak',
  'tedarikci_faturasi',
  250,
  TIMESTAMPTZ '2026-07-27 00:00:00+03',
  'Dogru mevcut legacy fatura hareketi',
  'sistem',
  'tedarikci_faturasi',
  '97900000-0000-4000-8000-000000000012',
  '97900000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE pgtap_109_eksik_sonuc AS
SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(
  '97900000-0000-4000-8000-000000000012',
  1,
  jsonb_build_object(
    'tedarikci_id', '97900000-0000-4000-8000-000000000020',
    'portal_siparis_no', '55557',
    'fatura_no', 'FAT-55557',
    'fatura_tutari', 250,
    'para_birimi', 'TRY',
    'fatura_tarihi', '2026-07-27',
    'odeme_tarihi', '2026-07-28',
    'gerekce', 'Mevcut dogru fatura hareketiyle eksik odeme kullanici onayiyla tamamlandi.'
  ),
  'pgtap-109-eksik-tamamla'
) AS yanit;

SELECT ok(
  (SELECT yanit ->> 'durum' = 'eksik_hareket_tamamlandi' FROM pgtap_109_eksik_sonuc)
  AND NOT (
    SELECT (yanit ->> 'fatura_hareketi_eklendi')::boolean
    FROM pgtap_109_eksik_sonuc
  )
  AND (
    SELECT (yanit ->> 'odeme_hareketi_eklendi')::boolean
    FROM pgtap_109_eksik_sonuc
  )
  AND (
    SELECT (yanit ->> 'uzlastirilan_cift_net_etki')::numeric = 0
    FROM pgtap_109_eksik_sonuc
  )
  AND (
    SELECT (yanit ->> 'bu_islem_net_etki')::numeric = 250
    FROM pgtap_109_eksik_sonuc
  ),
  'dogru fatura korunur, yalniz odeme eklenir ve islem etkisi +250 olur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000012'
      AND kaynak_turu IN ('tedarikci_faturasi', 'tedarikci_odemesi')
  ),
  2,
  'eksik tamamlama sonunda yine tam olarak iki hareket vardir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_siparisleri
    WHERE id = '97900000-0000-4000-8000-000000000012'
      AND fatura_cari_hareket_id IS NOT NULL
      AND odeme_cari_hareket_id IS NOT NULL
      AND revision_no = 2
  ),
  'eksik tamamlama mevcut ve yeni hareketi siparise baglar'
);

SELECT is(
  (
    SELECT
      COALESCE(sum(tutar) FILTER (WHERE yon = 'borc'), 0)
      - COALESCE(sum(tutar) FILTER (WHERE yon = 'alacak'), 0)
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000012'
      AND kaynak_turu IN ('tedarikci_faturasi', 'tedarikci_odemesi')
  ),
  0::numeric,
  'eksik tamamlama da net sifir cari etki uretir'
);

-- Dogru mevcut odeme hareketi benimsenir; yalniz eksik fatura eklenir.
INSERT INTO public.tedarikci_siparisleri (
  id, tedarikci_id, portal_siparis_no, siparis_tarihi, vade_gunu,
  para_birimi, siparis_tutari, fatura_no, fatura_tarihi, fatura_tutari,
  odeme_tarihi, aciklama, olusturan_kullanici_id, revision_no
)
VALUES (
  '97900000-0000-4000-8000-000000000013',
  '97900000-0000-4000-8000-000000000020',
  '55558',
  DATE '2026-07-01',
  0,
  'TRY',
  300,
  'FAT-55558',
  DATE '2026-07-27',
  300,
  DATE '2026-07-29',
  '109 yalniz odeme mevcut testi',
  '97900000-0000-4000-8000-000000000001',
  1
);

INSERT INTO public.cari_hareketleri (
  cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
  aciklama, kaynak_sinifi, kaynak_turu, kaynak_id, islemi_yapan
)
VALUES (
  '97900000-0000-4000-8000-000000000020',
  'TRY',
  'borc',
  'tedarikci_odemesi',
  300,
  TIMESTAMPTZ '2026-07-29 00:00:00+03',
  'Dogru mevcut legacy odeme hareketi',
  'sistem',
  'tedarikci_odemesi',
  '97900000-0000-4000-8000-000000000013',
  '97900000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE pgtap_109_odeme_mevcut_sonuc AS
SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(
  '97900000-0000-4000-8000-000000000013',
  1,
  jsonb_build_object(
    'tedarikci_id', '97900000-0000-4000-8000-000000000020',
    'portal_siparis_no', '55558',
    'fatura_no', 'FAT-55558',
    'fatura_tutari', 300,
    'para_birimi', 'TRY',
    'fatura_tarihi', '2026-07-27',
    'odeme_tarihi', '2026-07-29',
    'gerekce', 'Mevcut dogru odeme hareketiyle eksik fatura kullanici onayiyla tamamlandi.'
  ),
  'pgtap-109-odeme-mevcut'
) AS yanit;

SELECT ok(
  (
    SELECT yanit ->> 'durum' = 'eksik_hareket_tamamlandi'
    FROM pgtap_109_odeme_mevcut_sonuc
  )
  AND (
    SELECT (yanit ->> 'fatura_hareketi_eklendi')::boolean
    FROM pgtap_109_odeme_mevcut_sonuc
  )
  AND NOT (
    SELECT (yanit ->> 'odeme_hareketi_eklendi')::boolean
    FROM pgtap_109_odeme_mevcut_sonuc
  )
  AND (
    SELECT (yanit ->> 'uzlastirilan_cift_net_etki')::numeric = 0
    FROM pgtap_109_odeme_mevcut_sonuc
  )
  AND (
    SELECT (yanit ->> 'bu_islem_net_etki')::numeric = -300
    FROM pgtap_109_odeme_mevcut_sonuc
  ),
  'dogru odeme korunur, yalniz fatura eklenir ve islem etkisi -300 olur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000013'
      AND kaynak_turu IN ('tedarikci_faturasi', 'tedarikci_odemesi')
  ),
  2,
  'odeme mevcut tamamlama sonunda tam olarak iki hareket vardir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_siparisleri
    WHERE id = '97900000-0000-4000-8000-000000000013'
      AND fatura_cari_hareket_id IS NOT NULL
      AND odeme_cari_hareket_id IS NOT NULL
      AND revision_no = 2
  ),
  'odeme mevcut tamamlama iki hareketi siparise baglar'
);

-- Iki dogru hareket mevcut fakat siparis FKlari null ise yeni hareket
-- olusturulmadan yalniz baslik baglantilari tamamlanir.
INSERT INTO public.tedarikci_siparisleri (
  id, tedarikci_id, portal_siparis_no, siparis_tarihi, vade_gunu,
  para_birimi, siparis_tutari, fatura_no, fatura_tarihi, fatura_tutari,
  odeme_tarihi, aciklama, olusturan_kullanici_id, revision_no
)
VALUES (
  '97900000-0000-4000-8000-000000000014',
  '97900000-0000-4000-8000-000000000020',
  '55559',
  DATE '2026-07-01',
  0,
  'TRY',
  400,
  'FAT-55559',
  DATE '2026-07-27',
  400,
  DATE '2026-07-30',
  '109 iki hareket mevcut FK null testi',
  '97900000-0000-4000-8000-000000000001',
  1
);

INSERT INTO public.cari_hareketleri (
  cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
  aciklama, kaynak_sinifi, kaynak_turu, kaynak_id, islemi_yapan
)
VALUES
  (
    '97900000-0000-4000-8000-000000000020',
    'TRY',
    'alacak',
    'tedarikci_faturasi',
    400,
    TIMESTAMPTZ '2026-07-27 00:00:00+03',
    'Dogru mevcut legacy fatura hareketi - iki mevcut',
    'sistem',
    'tedarikci_faturasi',
    '97900000-0000-4000-8000-000000000014',
    '97900000-0000-4000-8000-000000000001'
  ),
  (
    '97900000-0000-4000-8000-000000000020',
    'TRY',
    'borc',
    'tedarikci_odemesi',
    400,
    TIMESTAMPTZ '2026-07-30 00:00:00+03',
    'Dogru mevcut legacy odeme hareketi - iki mevcut',
    'sistem',
    'tedarikci_odemesi',
    '97900000-0000-4000-8000-000000000014',
    '97900000-0000-4000-8000-000000000001'
  );

CREATE TEMP TABLE pgtap_109_iki_mevcut_sonuc AS
SELECT public.tedarikci_legacy_fatura_odemesi_uzlastir(
  '97900000-0000-4000-8000-000000000014',
  1,
  jsonb_build_object(
    'tedarikci_id', '97900000-0000-4000-8000-000000000020',
    'portal_siparis_no', '55559',
    'fatura_no', 'FAT-55559',
    'fatura_tutari', 400,
    'para_birimi', 'TRY',
    'fatura_tarihi', '2026-07-27',
    'odeme_tarihi', '2026-07-30',
    'gerekce', 'Iki dogru mevcut hareket siparis FKlarina kullanici onayiyla baglandi.'
  ),
  'pgtap-109-iki-mevcut'
) AS yanit;

SELECT ok(
  (
    SELECT yanit ->> 'durum' = 'mevcut_hareketler_baglandi'
    FROM pgtap_109_iki_mevcut_sonuc
  )
  AND NOT (
    SELECT (yanit ->> 'fatura_hareketi_eklendi')::boolean
    FROM pgtap_109_iki_mevcut_sonuc
  )
  AND NOT (
    SELECT (yanit ->> 'odeme_hareketi_eklendi')::boolean
    FROM pgtap_109_iki_mevcut_sonuc
  )
  AND (
    SELECT (yanit ->> 'uzlastirilan_cift_net_etki')::numeric = 0
    FROM pgtap_109_iki_mevcut_sonuc
  )
  AND (
    SELECT (yanit ->> 'bu_islem_net_etki')::numeric = 0
    FROM pgtap_109_iki_mevcut_sonuc
  ),
  'iki mevcut hareket yeni kayit olmadan baglanir ve bu islem etkisi sifirdir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.cari_hareketleri
    WHERE kaynak_id = '97900000-0000-4000-8000-000000000014'
      AND kaynak_turu IN ('tedarikci_faturasi', 'tedarikci_odemesi')
  ),
  2,
  'iki mevcut hareket senaryosu hareket sayisini artirmaz'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_siparisleri siparis
    JOIN public.cari_hareketleri fatura
      ON fatura.id = siparis.fatura_cari_hareket_id
     AND fatura.kaynak_turu = 'tedarikci_faturasi'
     AND fatura.kaynak_id = siparis.id
    JOIN public.cari_hareketleri odeme
      ON odeme.id = siparis.odeme_cari_hareket_id
     AND odeme.kaynak_turu = 'tedarikci_odemesi'
     AND odeme.kaynak_id = siparis.id
    WHERE siparis.id = '97900000-0000-4000-8000-000000000014'
      AND siparis.revision_no = 2
  ),
  'null FKlar dogru mevcut hareketlere baglanip revision artirilir'
);

SELECT * FROM finish();
ROLLBACK;
