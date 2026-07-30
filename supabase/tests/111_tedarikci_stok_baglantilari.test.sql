BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(58);

SELECT has_table(
  'public',
  'tedarikci_stok_baglantilari',
  'tedarikci-stok baglanti tablosu vardir'
);

SELECT is(
  (
    SELECT array_agg(column_name::text ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tedarikci_stok_baglantilari'
  ),
  ARRAY[
    'id',
    'tedarikci_id',
    'stok_id',
    'marka',
    'tedarikci_urun_kodu',
    'varsayilan_vade_gunu',
    'aciklama',
    'aktif',
    'revision_no',
    'olusturan_kullanici_id',
    'son_guncelleyen_kullanici_id',
    'created_at',
    'updated_at'
  ]::text[],
  'baglanti metadata, revision ve audit alanlari tamdir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tedarikci_stok_baglantilari'::regclass
      AND conname =
        'tedarikci_stok_baglantilari_tedarikci_stok_key'
      AND contype = 'u'
  ),
  'her tedarikci-stok cifti tek kanonik baglantidir'
);

SELECT ok(
  (
    SELECT relrowsecurity AND relforcerowsecurity
    FROM pg_class
    WHERE oid = 'public.tedarikci_stok_baglantilari'::regclass
  ),
  'baglanti tablosunda RLS ve FORCE RLS aciktir'
);

SELECT ok(
  has_table_privilege(
    'authenticated',
    'public.tedarikci_stok_baglantilari',
    'SELECT'
  )
  AND NOT has_table_privilege(
    'authenticated',
    'public.tedarikci_stok_baglantilari',
    'INSERT'
  )
  AND NOT has_table_privilege(
    'authenticated',
    'public.tedarikci_stok_baglantilari',
    'UPDATE'
  )
  AND NOT has_table_privilege(
    'authenticated',
    'public.tedarikci_stok_baglantilari',
    'DELETE'
  )
  AND NOT has_table_privilege(
    'anon',
    'public.tedarikci_stok_baglantilari',
    'SELECT'
  ),
  'authenticated yalniz RLSli okur; dogrudan yazma ve anon erisimi kapalidir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.tedarikci_stok_baglantilari'::regclass
      AND polname = 'tedarikci_stok_baglantilari_costing_read'
      AND position(
        'has_permission(''costing''::text, ''read''::text)'
        IN pg_get_expr(polqual, polrelid)
      ) > 0
  ),
  'RLS okuma politikasi costing.read iznine baglidir'
);

SELECT has_function(
  'public',
  'tedarikci_stok_baglantilarini_getir',
  ARRAY['uuid'],
  'listeleme RPCsi sabit imzayla vardir'
);

SELECT has_function(
  'public',
  'tedarikci_stok_baglantisi_kaydet',
  ARRAY['jsonb', 'text'],
  'kaydetme RPCsi sabit imzayla vardir'
);

SELECT has_function(
  'public',
  'tedarikci_stok_baglantisi_pasiflestir',
  ARRAY['uuid', 'bigint', 'text', 'text'],
  'pasiflestirme RPCsi sabit imzayla vardir'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.tedarikci_stok_baglantilarini_getir(uuid)'::regprocedure,
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.tedarikci_stok_baglantisi_kaydet(jsonb,text)'::regprocedure,
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.tedarikci_stok_baglantisi_pasiflestir(uuid,bigint,text,text)'::regprocedure,
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.tedarikci_stok_baglantilarini_getir(uuid)'::regprocedure,
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.tedarikci_stok_baglantisi_kaydet(jsonb,text)'::regprocedure,
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.tedarikci_stok_baglantisi_pasiflestir(uuid,bigint,text,text)'::regprocedure,
    'EXECUTE'
  ),
  'dis RPC siniri authenticated icin acik, anon icin kapalidir'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.tedarikci_stok_kapsami_uygun(text[],text,text)'::regprocedure,
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.tedarikci_stok_baglantilarini_fiyatlardan_tamamla()'::regprocedure,
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.stok_alis_fiyati_tedarikci_baglantisini_tamamla()'::regprocedure,
    'EXECUTE'
  ),
  'kapsam, backfill ve fiyat-trigger yardimcilari disariya kapatilmistir'
);

SELECT ok(
  position(
    'stok_maliyet_yazma_yetkisini_dogrula(''update'', true)'
    IN pg_get_functiondef(
      'public.tedarikci_stok_baglantisi_kaydet(jsonb,text)'::regprocedure
    )
  ) > 0
  AND position(
    'ticari_idempotency_baslat'
    IN pg_get_functiondef(
      'public.tedarikci_stok_baglantisi_kaydet(jsonb,text)'::regprocedure
    )
  ) > 0
  AND position(
    'stok_maliyet_yazma_yetkisini_dogrula(''manage'', true)'
    IN pg_get_functiondef(
      'public.tedarikci_stok_baglantisi_pasiflestir(uuid,bigint,text,text)'::regprocedure
    )
  ) > 0,
  'yazma RPCleri permission, AAL2 ve idempotency sinirindadir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.stok_alis_fiyatlari'::regclass
      AND tgname = 'stok_alis_fiyati_tedarikci_baglantisi'
      AND NOT tgisinternal
  ),
  'her yeni fiyat snapshoti baglantiyi tamamlayan triggera baglidir'
);

-- -------------------------------------------------------------------------
-- Yetkili ve AAL2 test oturumu
-- -------------------------------------------------------------------------

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '98110000-0000-4000-8000-000000000001',
  'supplier-link-v111-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '98110000-0000-4000-8000-000000000001';

INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '98110000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

INSERT INTO auth.sessions(id, user_id, created_at, updated_at)
VALUES (
  '98110000-0000-4000-8000-000000000002',
  '98110000-0000-4000-8000-000000000001',
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
  '98110000-0000-4000-8000-000000000003',
  '98110000-0000-4000-8000-000000000001',
  '98110000-0000-4000-8000-000000000004',
  'Supplier link v111 pgTAP',
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
  '98110000-0000-4000-8000-000000000001',
  '98110000-0000-4000-8000-000000000003',
  '98110000-0000-4000-8000-000000000002',
  now()
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98110000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"98110000-0000-4000-8000-000000000002"}',
  true
);

SELECT public.stok_baslangic_katalogunu_kur('pgtap-v111-catalog');

INSERT INTO public.cari (
  id, kod, ad, tipi, aktif, tedarik_kapsamlari, tedarikci_calisma_modeli
)
VALUES
  (
    '98110000-0000-4000-8000-000000000010',
    'V111-CAM-TED',
    'V111 Cam Tedarikcisi',
    'tedarikci',
    true,
    ARRAY['cam'],
    'manuel_fiyat'
  ),
  (
    '98110000-0000-4000-8000-000000000011',
    'V111-CITA-TED',
    'V111 Cita Tedarikcisi',
    'tedarikci',
    true,
    ARRAY['cita'],
    'manuel_fiyat'
  ),
  (
    '98110000-0000-4000-8000-000000000012',
    'V111-SARF-TED',
    'V111 Sarf Tedarikcisi',
    'tedarikci',
    true,
    ARRAY['yan_malzeme'],
    'manuel_fiyat'
  ),
  (
    '98110000-0000-4000-8000-000000000013',
    'V111-TEMPER-TED',
    'V111 Temper Tedarikcisi',
    'tedarikci',
    true,
    ARRAY['temper_hizmeti'],
    'manuel_fiyat'
  ),
  (
    '98110000-0000-4000-8000-000000000014',
    'V111-PASIF-TED',
    'V111 Pasif Tedarikci',
    'tedarikci',
    false,
    ARRAY['cam'],
    'manuel_fiyat'
  ),
  (
    '98110000-0000-4000-8000-000000000015',
    'V111-MUSTERI',
    'V111 Musteri',
    'musteri',
    true,
    ARRAY[]::text[],
    NULL
  );

INSERT INTO public.stok (
  id, kod, ad, kategori, birim, aktif, ticari_kapsam
)
VALUES (
  '98110000-0000-4000-8000-000000000020',
  'V111-PASIF-STOK',
  'V111 Pasif Cam Stogu',
  'cam',
  'm2',
  false,
  'maliyet_bileseni'
);

CREATE TEMP TABLE v111_ilk_kayit AS
SELECT public.tedarikci_stok_baglantisi_kaydet(
  jsonb_build_object(
    'tedarikci_id', '98110000-0000-4000-8000-000000000010',
    'stok_id', (SELECT id FROM public.stok WHERE kod = '01002'),
    'marka', '  V111 Cam Marka  ',
    'tedarikci_urun_kodu', '  TED-4MM  ',
    'varsayilan_vade_gunu', 60,
    'aciklama', '  Ilk cam baglantisi  ',
    'gerekce', 'V111 ilk cam baglantisi olusturuldu',
    'kaynak_ekran', 'cari_v111_test'
  ),
  'pgtap-v111-ilk-kayit'
) AS yanit;

SELECT ok(
  (SELECT yanit ->> 'islem' = 'olusturuldu' FROM v111_ilk_kayit)
  AND (
    SELECT (yanit #>> '{baglanti,revision_no}')::bigint = 1
      AND (yanit #>> '{baglanti,aktif}')::boolean
    FROM v111_ilk_kayit
  ),
  'AAL2 kullanici cam baglantisini revision 1 ile olusturur'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000010'
      AND stok.kod = '01002'
      AND baglanti.marka = 'V111 Cam Marka'
      AND baglanti.tedarikci_urun_kodu = 'TED-4MM'
      AND baglanti.varsayilan_vade_gunu = 60
      AND baglanti.aciklama = 'Ilk cam baglantisi'
      AND baglanti.olusturan_kullanici_id =
        '98110000-0000-4000-8000-000000000001'
      AND baglanti.son_guncelleyen_kullanici_id =
        '98110000-0000-4000-8000-000000000001'
  ),
  'metadata kirpilir ve olusturan/guncelleyen audit kimligi saklanir'
);

SELECT is(
  public.tedarikci_stok_baglantisi_kaydet(
    jsonb_build_object(
      'tedarikci_id', '98110000-0000-4000-8000-000000000010',
      'stok_id', (SELECT id FROM public.stok WHERE kod = '01002'),
      'marka', '  V111 Cam Marka  ',
      'tedarikci_urun_kodu', '  TED-4MM  ',
      'varsayilan_vade_gunu', 60,
      'aciklama', '  Ilk cam baglantisi  ',
      'gerekce', 'V111 ilk cam baglantisi olusturuldu',
      'kaynak_ekran', 'cari_v111_test'
    ),
    'pgtap-v111-ilk-kayit'
  ),
  (SELECT yanit FROM v111_ilk_kayit),
  'ayni idempotency anahtari ilk sonucu aynen dondurur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tedarikci_stok_baglantilari
    WHERE tedarikci_id = '98110000-0000-4000-8000-000000000010'
      AND stok_id = (SELECT id FROM public.stok WHERE kod = '01002')
  ),
  1,
  'idempotent tekrar ikinci baglanti olusturmaz'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000010',
        'stok_id', (SELECT id FROM public.stok WHERE kod = '01002'),
        'marka', 'Farkli Marka'
      ),
      'pgtap-v111-ilk-kayit'
    )
  $$,
  'P0001',
  'IDEMPOTENCY_PAYLOAD_CONFLICT',
  'ayni idempotency anahtari farkli payloadla kullanilamaz'
);

CREATE TEMP TABLE v111_cam_liste AS
SELECT public.tedarikci_stok_baglantilarini_getir(
  '98110000-0000-4000-8000-000000000010'
) AS yanit;

SELECT ok(
  (SELECT jsonb_typeof(yanit -> 'baglantilar') = 'array' FROM v111_cam_liste)
  AND (SELECT jsonb_typeof(yanit -> 'adaylar') = 'array' FROM v111_cam_liste)
  AND (
    SELECT (yanit #>> '{ozet,aktif_baglanti_sayisi}')::integer = 1
    FROM v111_cam_liste
  ),
  'liste RPCsi baglantilar, adaylar ve ozet sozlesmesini dondurur'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM v111_cam_liste liste
    CROSS JOIN LATERAL jsonb_array_elements(liste.yanit -> 'adaylar') aday
    WHERE aday ->> 'kategori' <> 'cam'
  ),
  'cam tedarikcisinin adaylari yalniz maliyet bileseni camlardir'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM v111_cam_liste liste
    CROSS JOIN LATERAL jsonb_array_elements(liste.yanit -> 'adaylar') aday
    WHERE aday ->> 'stok_kodu' IN (
      '01002',
      '10000',
      'CITA-AL-009',
      'SARF-BUTIL',
      'HIZMET-TEMPER-DIS'
    )
  ),
  'bagli, satilabilir ve kapsam disi fiziksel stoklar adaylara sizmaz'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000010',
        'stok_ids', jsonb_build_array(
          (SELECT id FROM public.stok WHERE kod = '01006'),
          (SELECT id FROM public.stok WHERE kod = 'CITA-AL-011')
        ),
        'marka', 'V111 Atomik Kontrol'
      ),
      'pgtap-v111-toplu-karisik-ret'
    )
  $$,
  '23514',
  'TEDARIKCI_STOK_KAPSAMI_UYUSMUYOR',
  'toplu listede tek kapsam disi stok butun istegi reddeder'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000010'
      AND stok.kod IN ('01006', 'CITA-AL-011')
  ),
  0,
  'reddedilen toplu istek kismi baglanti birakmaz'
);

CREATE TEMP TABLE v111_toplu_kayit AS
SELECT public.tedarikci_stok_baglantisi_kaydet(
  jsonb_build_object(
    'tedarikci_id', '98110000-0000-4000-8000-000000000010',
    'stok_ids', jsonb_build_array(
      (SELECT id FROM public.stok WHERE kod = '01004'),
      (SELECT id FROM public.stok WHERE kod = '01005')
    ),
    'marka', 'V111 Toplu Cam',
    'varsayilan_vade_gunu', 60,
    'aciklama', 'V111 ortak toplu baglanti notu'
  ),
  'pgtap-v111-toplu-kayit'
) AS yanit;

SELECT ok(
  (SELECT yanit ->> 'islem' = 'toplu_olusturuldu' FROM v111_toplu_kayit)
  AND (SELECT (yanit ->> 'adet')::integer = 2 FROM v111_toplu_kayit)
  AND (
    SELECT jsonb_array_length(yanit -> 'baglantilar') = 2
      AND jsonb_array_length(yanit -> 'baglanti_ids') = 2
    FROM v111_toplu_kayit
  )
  AND (
    SELECT count(*) = 2
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000010'
      AND stok.kod IN ('01004', '01005')
      AND baglanti.marka = 'V111 Toplu Cam'
      AND baglanti.varsayilan_vade_gunu = 60
      AND baglanti.aciklama = 'V111 ortak toplu baglanti notu'
      AND baglanti.revision_no = 1
  ),
  'toplu RPC iki yeni adayi ortak metadata ile atomik olusturur'
);

SELECT ok(
  public.tedarikci_stok_baglantisi_kaydet(
    jsonb_build_object(
      'tedarikci_id', '98110000-0000-4000-8000-000000000010',
      'stok_ids', jsonb_build_array(
        (SELECT id FROM public.stok WHERE kod = '01004'),
        (SELECT id FROM public.stok WHERE kod = '01005')
      ),
      'marka', 'V111 Toplu Cam',
      'varsayilan_vade_gunu', 60,
      'aciklama', 'V111 ortak toplu baglanti notu'
    ),
    'pgtap-v111-toplu-kayit'
  ) = (SELECT yanit FROM v111_toplu_kayit)
  AND (
    SELECT count(*) = 2 AND bool_and(revision_no = 1)
    FROM public.tedarikci_stok_baglantilari
    WHERE tedarikci_id = '98110000-0000-4000-8000-000000000010'
      AND stok_id IN (
        SELECT id FROM public.stok WHERE kod IN ('01004', '01005')
      )
  ),
  'toplu idempotency replayi yeni satir veya revision uretmez'
);

CREATE TEMP TABLE v111_guncelle AS
SELECT public.tedarikci_stok_baglantisi_kaydet(
  jsonb_build_object(
    'tedarikci_id', '98110000-0000-4000-8000-000000000010',
    'stok_id', (SELECT id FROM public.stok WHERE kod = '01002'),
    'beklenen_revision_no', 1,
    'marka', 'V111 Yeni Marka',
    'tedarikci_urun_kodu', 'TED-4MM-YENI',
    'varsayilan_vade_gunu', 75,
    'aciklama', 'Guncellenen cam baglantisi'
  ),
  'pgtap-v111-guncelle'
) AS yanit;

SELECT ok(
  (SELECT yanit ->> 'islem' = 'guncellendi' FROM v111_guncelle)
  AND (
    SELECT (yanit #>> '{baglanti,revision_no}')::bigint = 2
      AND yanit #>> '{baglanti,marka}' = 'V111 Yeni Marka'
      AND (yanit #>> '{baglanti,varsayilan_vade_gunu}')::integer = 75
    FROM v111_guncelle
  ),
  'beklenen revision ile metadata guncellenir ve revision artar'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000010',
        'stok_id', (SELECT id FROM public.stok WHERE kod = '01002'),
        'beklenen_revision_no', 1,
        'marka', 'Bayat Ekran Markasi'
      ),
      'pgtap-v111-bayat-guncelle'
    )
  $$,
  '40001',
  'TEDARIKCI_STOK_BAGLANTISI_REVISION_CAKISMASI',
  'bayat ekran revision cakismasiyla reddedilir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000010'
      AND stok.kod = '01002'
      AND baglanti.revision_no = 2
      AND baglanti.marka = 'V111 Yeni Marka'
  ),
  'revision cakismasi mevcut snapshotu degistirmez'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98110000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"98110000-0000-4000-8000-000000000002"}',
  true
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000010',
        'stok_id', (SELECT id FROM public.stok WHERE kod = '01004')
      ),
      'pgtap-v111-aal1-kaydet'
    )
  $$,
  '42501',
  'AAL2_GEREKLI',
  'baglanti kaydetme AAL1 oturumunu reddeder'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98110000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"98110000-0000-4000-8000-000000000002"}',
  true
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000015',
        'stok_id', (SELECT id FROM public.stok WHERE kod = '01004')
      ),
      'pgtap-v111-musteri-ret'
    )
  $$,
  'P0002',
  'AKTIF_TEDARIKCI_BULUNAMADI',
  'musteri karti tedarikci-stok baglantisinda reddedilir'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000014',
        'stok_id', (SELECT id FROM public.stok WHERE kod = '01004')
      ),
      'pgtap-v111-pasif-tedarikci-ret'
    )
  $$,
  'P0002',
  'AKTIF_TEDARIKCI_BULUNAMADI',
  'pasif tedarikci baglanti kaydedemez'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000011',
        'stok_id', (SELECT id FROM public.stok WHERE kod = '01004')
      ),
      'pgtap-v111-cita-cam-ret'
    )
  $$,
  '23514',
  'TEDARIKCI_STOK_KAPSAMI_UYUSMUYOR',
  'cita tedarikcisi fiziksel cam stokuna baglanamaz'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000010',
        'stok_id', (SELECT id FROM public.stok WHERE kod = '10000')
      ),
      'pgtap-v111-satilabilir-ret'
    )
  $$,
  '23514',
  'TEDARIKCI_STOK_TICARI_KAPSAMI_GECERSIZ',
  'satilabilir mamul stok tedarik girdisi olarak baglanamaz'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000010',
        'stok_id', '98110000-0000-4000-8000-000000000020'
      ),
      'pgtap-v111-pasif-stok-ret'
    )
  $$,
  'P0002',
  'AKTIF_MALIYET_STOGU_BULUNAMADI',
  'pasif stok baglanti kaydinda reddedilir'
);

CREATE TEMP TABLE v111_temper_baglanti AS
SELECT public.tedarikci_stok_baglantisi_kaydet(
  jsonb_build_object(
    'tedarikci_id', '98110000-0000-4000-8000-000000000013',
    'stok_id', (
      SELECT id FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'
    ),
    'marka', 'V111 Fason Temper'
  ),
  'pgtap-v111-temper-hizmet'
) AS yanit;

SELECT ok(
  (SELECT yanit ->> 'islem' = 'olusturuldu' FROM v111_temper_baglanti)
  AND (
    SELECT yanit #>> '{baglanti,hizmet_turu}' = 'temper_dis_hizmet'
    FROM v111_temper_baglanti
  ),
  'yalniz temper_hizmeti kapsamli fasoncu temper hizmetine baglanir'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000013',
        'stok_id', (SELECT id FROM public.stok WHERE kod = 'SARF-BUTIL')
      ),
      'pgtap-v111-temper-fiziksel-sarf-ret'
    )
  $$,
  '23514',
  'TEDARIKCI_STOK_KAPSAMI_UYUSMUYOR',
  'temper_hizmeti kapsami fiziksel yan malzeme yetkisi vermez'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000010',
        'stok_id', (
          SELECT id FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'
        )
      ),
      'pgtap-v111-cam-temper-hizmet'
    )
  $$,
  '23514',
  'TEDARIKCI_STOK_KAPSAMI_UYUSMUYOR',
  'cam kapsami yeni temper hizmet baglantisi yetkisi vermez'
);

CREATE TEMP TABLE v111_legacy_alias_temper_fiyati AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '98110000-0000-4000-8000-000000000010',
    'fiyat_tarihi', '2290-01-01T00:00:00+03:00',
    'gecerlilik_baslangici', '2290-01-01',
    'kalemler', jsonb_build_array(jsonb_build_object(
      'stok_id', (
        SELECT id FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'
      ),
      'birim_fiyat', 45,
      'fiyat_birimi', 'm2',
      'stok_ana_birimi', 'm2',
      'varyant', 'standart',
      'vade_gunu', 0,
      'marka', 'V111 Legacy Cam Temper'
    ))
  ),
  'pgtap-v111-legacy-alias-temper-fiyati'
) AS yanit;

SELECT ok(
  (
    SELECT (yanit ->> 'adet')::integer = 1
    FROM v111_legacy_alias_temper_fiyati
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000010'
      AND stok.kod = 'HIZMET-TEMPER-DIS'
  ),
  'legacy cam-temper fiyati korunur fakat yeni baglanti aliasi olusturmaz'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_kaydet(
      jsonb_build_object(
        'tedarikci_id', '98110000-0000-4000-8000-000000000011',
        'stok_id', (
          SELECT id FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'
        )
      ),
      'pgtap-v111-cita-temper-ret'
    )
  $$,
  '23514',
  'TEDARIKCI_STOK_KAPSAMI_UYUSMUYOR',
  'yalniz cita kapsami temper hizmetine baglanamaz'
);

-- -------------------------------------------------------------------------
-- Mevcut tekil/toplu/PDF fiyat RPCsi baglantiyi otomatik tamamlar.
-- -------------------------------------------------------------------------

CREATE TEMP TABLE v111_fiyat_1 AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '98110000-0000-4000-8000-000000000010',
    'fiyat_tarihi', '2291-01-01T00:00:00+03:00',
    'gecerlilik_baslangici', '2291-01-01',
    'kalemler', jsonb_build_array(jsonb_build_object(
      'stok_id', (SELECT id FROM public.stok WHERE kod = '01003'),
      'birim_fiyat', 125.50,
      'fiyat_birimi', 'm2',
      'stok_ana_birimi', 'm2',
      'varyant', 'standart',
      'vade_gunu', 0,
      'marka', 'V111 Ilk Fiyat Markasi'
    ))
  ),
  'pgtap-v111-fiyat-1'
) AS yanit;

SELECT is(
  ((SELECT yanit FROM v111_fiyat_1) ->> 'adet')::integer,
  1,
  'mevcut fiyat RPCsi fiyat snapshotini kaydeder'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000010'
      AND stok.kod = '01003'
      AND baglanti.aktif
      AND baglanti.marka = 'V111 Ilk Fiyat Markasi'
      AND baglanti.varsayilan_vade_gunu = 0
      AND baglanti.revision_no = 1
  ),
  'ilk fiyat ayni transactionda supplier+stock baglantisini kurar'
);

CREATE TEMP TABLE v111_fiyat_2 AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '98110000-0000-4000-8000-000000000010',
    'fiyat_tarihi', '2291-02-01T00:00:00+03:00',
    'gecerlilik_baslangici', '2291-02-01',
    'kalemler', jsonb_build_array(jsonb_build_object(
      'stok_id', (SELECT id FROM public.stok WHERE kod = '01003'),
      'birim_fiyat', 140.75,
      'fiyat_birimi', 'm2',
      'stok_ana_birimi', 'm2',
      'varyant', 'standart',
      'vade_gunu', 60,
      'marka', 'V111 Guncel Fiyat Markasi'
    ))
  ),
  'pgtap-v111-fiyat-2'
) AS yanit;

SELECT ok(
  ((SELECT yanit FROM v111_fiyat_2) ->> 'adet')::integer = 1
  AND EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000010'
      AND stok.kod = '01003'
      AND baglanti.marka = 'V111 Guncel Fiyat Markasi'
      AND baglanti.varsayilan_vade_gunu = 60
      AND baglanti.revision_no = 2
  ),
  'sonraki fiyat baglanti marka/vade varsayilanini revisionla gunceller'
);

CREATE TEMP TABLE v111_fiyatli_liste AS
SELECT public.tedarikci_stok_baglantilarini_getir(
  '98110000-0000-4000-8000-000000000010'
) AS yanit;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM v111_fiyatli_liste liste
    CROSS JOIN LATERAL jsonb_array_elements(
      liste.yanit -> 'baglantilar'
    ) baglanti
    WHERE baglanti ->> 'stok_kodu' = '01003'
      AND (baglanti #>> '{son_fiyat,birim_fiyat}')::numeric = 140.75
      AND baglanti #>> '{son_fiyat,para_birimi}' = 'TRY'
      AND baglanti #>> '{son_fiyat,fiyat_birimi}' = 'm2'
      AND baglanti #>> '{son_fiyat,fiyat_varyanti}' = 'standart'
      AND baglanti #>> '{son_fiyat,marka}' =
        'V111 Guncel Fiyat Markasi'
      AND (baglanti #>> '{son_fiyat,vade_gunu}')::integer = 60
      AND baglanti #>> '{son_fiyat,fiyat_tarihi}' IS NOT NULL
      AND baglanti #>> '{son_fiyat,gecerlilik_baslangici}' =
        '2291-02-01'
      AND baglanti #>> '{son_fiyat,gecerlilik_bitisi}' IS NULL
      AND baglanti #>> '{son_fiyat,durum}' = 'dogrulanmis'
  ),
  'liste son fiyat snapshotini sabit JSON alanlariyla dondurur'
);

-- -------------------------------------------------------------------------
-- Pasiflestirme, audit ve iyimser kilit
-- -------------------------------------------------------------------------

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98110000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"98110000-0000-4000-8000-000000000002"}',
  true
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_stok_baglantisi_pasiflestir(
      (
        SELECT baglanti.id
        FROM public.tedarikci_stok_baglantilari baglanti
        JOIN public.stok stok ON stok.id = baglanti.stok_id
        WHERE baglanti.tedarikci_id =
          '98110000-0000-4000-8000-000000000010'
          AND stok.kod = '01002'
      ),
      2,
      'AAL1 pasiflestirme guvenlik testi',
      'pgtap-v111-aal1-pasif'
    )
  $$,
  '42501',
  'AAL2_GEREKLI',
  'pasiflestirme AAL1 oturumunu reddeder'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98110000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"98110000-0000-4000-8000-000000000002"}',
  true
);

CREATE TEMP TABLE v111_pasif AS
SELECT public.tedarikci_stok_baglantisi_pasiflestir(
  (
    SELECT baglanti.id
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000010'
      AND stok.kod = '01002'
  ),
  2,
  'V111 cam baglantisi kullanici karariyla pasiflestirildi',
  'pgtap-v111-pasif'
) AS yanit;

SELECT ok(
  (SELECT yanit ->> 'islem' = 'pasiflestirildi' FROM v111_pasif)
  AND (SELECT NOT (yanit ->> 'aktif')::boolean FROM v111_pasif)
  AND (SELECT (yanit ->> 'revision_no')::bigint = 3 FROM v111_pasif),
  'pasiflestirme silmeden revision 3 snapshoti olusturur'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.audit_events audit
    WHERE audit.table_name = 'tedarikci_stok_baglantilari'
      AND audit.record_id = (SELECT yanit ->> 'baglanti_id' FROM v111_pasif)
      AND audit.action = 'UPDATE'
      AND audit.metadata ->> 'rpc_adi' =
        'tedarikci_stok_baglantisi_pasiflestir'
      AND audit.metadata ->> 'idempotency_key' = 'pgtap-v111-pasif'
      AND audit.metadata ->> 'aal' = 'aal2'
      AND audit.metadata ->> 'gerekce' =
        'V111 cam baglantisi kullanici karariyla pasiflestirildi'
  ),
  'pasiflestirme gerekce, AAL2 ve idempotency baglamiyla audit edilir'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98110000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"98110000-0000-4000-8000-000000000002"}',
  true
);

CREATE TEMP TABLE v111_pasifken_fiyat AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '98110000-0000-4000-8000-000000000010',
    'fiyat_tarihi', '2291-03-01T00:00:00+03:00',
    'gecerlilik_baslangici', '2291-03-01',
    'kalemler', jsonb_build_array(jsonb_build_object(
      'stok_id', (SELECT id FROM public.stok WHERE kod = '01002'),
      'birim_fiyat', 199.90,
      'fiyat_birimi', 'm2',
      'stok_ana_birimi', 'm2',
      'varyant', 'standart',
      'vade_gunu', 0,
      'marka', 'AAL1 Reaktivasyon Denemesi'
    ))
  ),
  'pgtap-v111-pasifken-fiyat'
) AS yanit;

SELECT is(
  ((SELECT yanit FROM v111_pasifken_fiyat) ->> 'adet')::integer,
  1,
  'AAL1 create yetkisi pasif baglantiya yeni fiyat snapshoti ekleyebilir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000010'
      AND stok.kod = '01002'
      AND NOT baglanti.aktif
      AND baglanti.revision_no = 3
      AND baglanti.marka = 'V111 Yeni Marka'
      AND baglanti.varsayilan_vade_gunu = 75
  ),
  'fiyat INSERT pasif baglantiyi reaktive etmez ve metadatasini degistirmez'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98110000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"98110000-0000-4000-8000-000000000002"}',
  true
);

SELECT ok(
  public.tedarikci_stok_baglantisi_pasiflestir(
    ((SELECT yanit FROM v111_pasif) ->> 'baglanti_id')::uuid,
    2,
    'V111 cam baglantisi kullanici karariyla pasiflestirildi',
    'pgtap-v111-pasif'
  ) = (SELECT yanit FROM v111_pasif)
  AND (
    SELECT revision_no = 3
    FROM public.tedarikci_stok_baglantilari
    WHERE id = ((SELECT yanit FROM v111_pasif) ->> 'baglanti_id')::uuid
  ),
  'pasiflestirme replayi sonucu dondurur ve revision artirmaz'
);

CREATE TEMP TABLE v111_yeniden_aktif AS
SELECT public.tedarikci_stok_baglantisi_kaydet(
  jsonb_build_object(
    'tedarikci_id', '98110000-0000-4000-8000-000000000010',
    'stok_id', (SELECT id FROM public.stok WHERE kod = '01002'),
    'beklenen_revision_no', 3
  ),
  'pgtap-v111-yeniden-aktif'
) AS yanit;

SELECT ok(
  (SELECT yanit ->> 'islem' = 'yeniden_etkinlestirildi' FROM v111_yeniden_aktif)
  AND (
    SELECT (yanit #>> '{baglanti,revision_no}')::bigint = 4
      AND (yanit #>> '{baglanti,aktif}')::boolean
    FROM v111_yeniden_aktif
  ),
  'pasif baglanti beklenen revisionla yeniden etkinlestirilir'
);

SELECT throws_ok(
  $$
    UPDATE public.cari
    SET tedarik_kapsamlari = ARRAY['cita']
    WHERE id = '98110000-0000-4000-8000-000000000010'
  $$,
  '23514',
  'TEDARIKCI_AKTIF_STOK_BAGLANTISI_KAPSAMLA_UYUSMUYOR',
  'aktif baglanti varken tedarikci kapsami uyumsuz hale getirilemez'
);

SELECT throws_ok(
  $$
    UPDATE public.stok
    SET ticari_kapsam = 'satilabilir'
    WHERE kod = '01002'
  $$,
  '23514',
  'STOK_AKTIF_TEDARIKCI_BAGLANTILARI_VAR',
  'aktif baglanti varken stok maliyet kapsami kaldirilamaz'
);

CREATE TEMP TABLE v111_cita_baglanti AS
SELECT public.tedarikci_stok_baglantisi_kaydet(
  jsonb_build_object(
    'tedarikci_id', '98110000-0000-4000-8000-000000000011',
    'stok_id', (SELECT id FROM public.stok WHERE kod = 'CITA-AL-009')
  ),
  'pgtap-v111-cita-baglanti'
) AS yanit;

SELECT ok(
  (SELECT yanit ->> 'islem' = 'olusturuldu' FROM v111_cita_baglanti)
  AND (
    SELECT yanit #>> '{baglanti,kategori}' = 'cita'
    FROM v111_cita_baglanti
  ),
  'cita tedarikcisi yalniz cita baglantisini kurabilir'
);

SELECT throws_ok(
  $$
    SELECT public.tedarikci_pasiflestir(
      '98110000-0000-4000-8000-000000000011',
      'Aktif stok baglantisi varken pasiflestirme testi',
      'pgtap-v111-cita-tedarikci-pasif'
    )
  $$,
  '23514',
  'TEDARIKCI_AKTIF_STOK_BAGLANTILARI_VAR',
  'aktif stok baglantisi tedarikci kartinin pasif birakilmasini engeller'
);

-- -------------------------------------------------------------------------
-- Idempotent mevcut fiyat backfilli
-- -------------------------------------------------------------------------

ALTER TABLE public.stok_alis_fiyatlari
  DISABLE TRIGGER stok_alis_fiyati_tedarikci_baglantisi;

INSERT INTO public.stok_alis_fiyatlari (
  stok_id,
  tedarikci_id,
  birim_fiyat,
  para_birimi,
  fiyat_birimi,
  stok_ana_birimi,
  donusum_katsayisi,
  vade_gunu,
  fiyat_tarihi,
  kaynak_turu,
  durum,
  olusturan_kullanici_id,
  fiyat_varyanti,
  marka,
  teklif_gecerlilik_donemi
)
VALUES (
  (SELECT id FROM public.stok WHERE kod = 'SARF-PU'),
  '98110000-0000-4000-8000-000000000012',
  88.25,
  'TRY',
  'litre',
  'litre',
  1,
  75,
  '2292-01-01T00:00:00+03:00',
  'dogrudan',
  'dogrulanmis',
  '98110000-0000-4000-8000-000000000001',
  'standart',
  'V111 Backfill PU',
  daterange('2292-01-01', NULL, '[)')
);

ALTER TABLE public.stok_alis_fiyatlari
  ENABLE TRIGGER stok_alis_fiyati_tedarikci_baglantisi;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000012'
      AND stok.kod = 'SARF-PU'
  ),
  0,
  'triggeri bilerek atlanan legacy fiyat once baglantisizdir'
);

SELECT is(
  public.tedarikci_stok_baglantilarini_fiyatlardan_tamamla(),
  1,
  'backfill eksik supplier+stock baglantisini bir kez ekler'
);

SELECT ok(
  public.tedarikci_stok_baglantilarini_fiyatlardan_tamamla() = 0
  AND EXISTS (
    SELECT 1
    FROM public.tedarikci_stok_baglantilari baglanti
    JOIN public.stok stok ON stok.id = baglanti.stok_id
    WHERE baglanti.tedarikci_id =
      '98110000-0000-4000-8000-000000000012'
      AND stok.kod = 'SARF-PU'
      AND baglanti.marka = 'V111 Backfill PU'
      AND baglanti.varsayilan_vade_gunu = 75
      AND baglanti.revision_no = 1
  ),
  'ikinci backfill no-op olur ve son fiyat marka/vadesini korur'
);

SELECT throws_ok(
  $$
    DELETE FROM public.tedarikci_stok_baglantilari
    WHERE id = ((SELECT yanit FROM v111_ilk_kayit) #>> '{baglanti,id}')::uuid
  $$,
  '55000',
  'TEDARIKCI_STOK_BAGLANTISI_SILINEMEZ',
  'baglanti kaydi fiziksel olarak silinemez'
);

SELECT * FROM finish();
ROLLBACK;
