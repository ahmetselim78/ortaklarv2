BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(63);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('maliyet_hizmet_stok_sablonu'),
        ('maliyet_hizmet_stoklari'),
        ('temper_maliyet_modu_surmleri'),
        ('temper_ic_uretim_maliyet_kalemleri'),
        ('stok_urun_maliyet_recete_islemleri'),
        ('temper_dis_hizmet_fiyat_secim_surmleri')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE to_regclass('public.' || name) IS NOT NULL
  ),
  6,
  'temper hizmeti, modlari, ic maliyetleri ve recete islemleri ayri tablolardadir'
);

SELECT ok(
  (SELECT count(*) = 128 FROM public.stok_baslangic_katalogu_sablonu)
  AND (
    SELECT count(*) = 1
      AND bool_and(kod = 'HIZMET-TEMPER-DIS')
      AND bool_and(birim = 'm2')
    FROM public.maliyet_hizmet_stok_sablonu
  ),
  '108 ayri hizmet sablonu eklerken 105 fiziksel katalog sayisini degistirmez'
);

SELECT is(
  (SELECT count(*)::integer FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'),
  0,
  'migration envantersiz hizmet kartini is verisi olarak seed etmez'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('maliyet_hizmet_stoklari'),
        ('temper_maliyet_modu_surmleri'),
        ('temper_ic_uretim_maliyet_kalemleri'),
        ('stok_urun_maliyet_recete_islemleri'),
        ('temper_dis_hizmet_fiyat_secim_surmleri')
    )
    SELECT count(*)::integer
    FROM expected
    JOIN pg_class table_row
      ON table_row.oid = to_regclass('public.' || expected.name)
    WHERE table_row.relrowsecurity
      AND table_row.relforcerowsecurity
  ),
  5,
  'tum temper is tablolari RLS ve FORCE RLS ile korunur'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('maliyet_hizmet_stoklari'),
        ('temper_maliyet_modu_surmleri'),
        ('temper_ic_uretim_maliyet_kalemleri'),
        ('stok_urun_maliyet_recete_islemleri'),
        ('temper_dis_hizmet_fiyat_secim_surmleri')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE has_table_privilege(
      'authenticated',
      'public.' || expected.name,
      'INSERT'
    )
       OR has_table_privilege(
         'authenticated',
         'public.' || expected.name,
         'UPDATE'
       )
       OR has_table_privilege(
         'authenticated',
         'public.' || expected.name,
         'DELETE'
       )
  ),
  0,
  'authenticated rolu temper tablolarina dogrudan yazamaz'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'public.maliyet_hizmet_stok_sablonu',
    'SELECT'
  ),
  'hizmet metadata sablonu istemciye dogrudan acik degildir'
);

SELECT is(
  (
    WITH expected(name) AS (
      VALUES
        ('stok_baslangic_katalogu_durumu'),
        ('stok_baslangic_katalogunu_kur'),
        ('temper_maliyet_modu_kaydet_v4'),
        ('temper_dis_hizmet_fiyat_sec_v4'),
        ('temper_maliyetini_coz_v4'),
        ('temper_maliyet_paneli_getir_v4'),
        ('maliyet_recete_onerisi_v3'),
        ('standart_urun_recetelerini_kur_v3'),
        ('urun_maliyet_recetesi_kaydet_v4'),
        ('urun_maliyeti_detayli_hesapla_v3'),
        ('stok_tedarikci_fiyat_tekliflerini_kaydet_v3')
    )
    SELECT count(*)::integer
    FROM expected
    WHERE EXISTS (
      SELECT 1
      FROM pg_proc procedure_row
      JOIN pg_namespace namespace_row
        ON namespace_row.oid = procedure_row.pronamespace
      WHERE namespace_row.nspname = 'public'
        AND procedure_row.proname = expected.name
        AND procedure_row.prosecdef
    )
  ),
  11,
  'dis temper ve uyumlu v3 RPC sinirlari SECURITY DEFINER olarak bulunur'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.temper_dis_hizmet_fiyat_secimini_ac_internal_v4(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid)'::regprocedure,
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.maliyet_ozel_recete_onerisi_v4(uuid)'::regprocedure,
    'EXECUTE'
  ),
  'internal temper yardimcilari istemci tarafindan cagrilamaz'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.temper_maliyetini_coz_v4(uuid,date,numeric)'::regprocedure,
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.temper_maliyet_modu_kaydet_v4(jsonb,text)'::regprocedure,
    'EXECUTE'
  ),
  'anon rolu temper okuma veya yazma RPCsini calistiramaz'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.temper_maliyet_modu_surmleri'::regclass
      AND contype = 'x'
      AND pg_get_constraintdef(oid) LIKE '%gecerlilik_donemi WITH &&%'
  ),
  'global temper mod surumleri tarihsel olarak birbiriyle cakisma korumalidir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_constraint
    WHERE conrelid =
      'public.temper_dis_hizmet_fiyat_secim_surmleri'::regclass
      AND contype = 'x'
  ),
  2,
  'genel ve urun ozel dis hizmet secimleri ayri cakisma korumalarina sahiptir'
);

SELECT set_config('request.jwt.claims', '{}', true);
SELECT throws_ok(
  $$SELECT public.temper_maliyetini_coz_v4(NULL, '2099-01-01', 1)$$,
  '42501',
  'COSTING_READ_YETKISI_GEREKLI',
  'oturumsuz kullanici temper maliyetini okuyamaz'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '96800000-0000-4000-8000-000000000001',
  'temper-v4-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '96800000-0000-4000-8000-000000000001';

INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '96800000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

INSERT INTO auth.sessions(id, user_id, created_at, updated_at)
VALUES (
  '96800000-0000-4000-8000-000000000002',
  '96800000-0000-4000-8000-000000000001',
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
  '96800000-0000-4000-8000-000000000003',
  '96800000-0000-4000-8000-000000000001',
  '96800000-0000-4000-8000-000000000004',
  'Temper v4 pgTAP',
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
  '96800000-0000-4000-8000-000000000001',
  '96800000-0000-4000-8000-000000000003',
  '96800000-0000-4000-8000-000000000002',
  now()
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"96800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"96800000-0000-4000-8000-000000000002"}',
  true
);

SELECT ok(
  public.stok_baslangic_katalogu_durumu()
    @> jsonb_build_object(
      'toplam', 128,
      'hizmet_toplam', 1,
      'hizmet_mevcut', 0,
      'hizmet_eksik', 1
    ),
  'mevcut katalog durumu fiziksel ve ayri hizmet eksigini birlikte bildirir'
);

CREATE TEMP TABLE temper_catalog_install AS
SELECT public.stok_baslangic_katalogunu_kur(
  'temper-v4-catalog-install'
) AS result;

SELECT ok(
  (SELECT result ->> 'katalog_surumu' = '105' FROM temper_catalog_install)
  AND (
    SELECT (result ->> 'toplam')::integer = 128
      AND (result ->> 'hizmet_eklenen')::integer = 1
      AND (result ->> 'hizmet_eksik')::integer = 0
    FROM temper_catalog_install
  ),
  'mevcut katalog butonu fiziksel katalogu ve tek hizmet kartini birlikte kurar'
);

SELECT ok(
  (
    SELECT stok.kategori = 'yan_malzeme'
      AND stok.birim = 'm2'
      AND stok.mevcut_miktar = 0
      AND stok.ticari_kapsam = 'maliyet_bileseni'
      AND NOT hizmet.envanter_takipli
      AND hizmet.hizmet_turu = 'temper_dis_hizmet'
    FROM public.stok stok
    JOIN public.maliyet_hizmet_stoklari hizmet
      ON hizmet.stok_id = stok.id
    WHERE stok.kod = 'HIZMET-TEMPER-DIS'
  ),
  'temper dis hizmet karti m2 fiyatlanir ve fiziksel envanter tutmaz'
);

SELECT public.stok_baslangic_katalogunu_kur(
  'temper-v4-catalog-install'
);

SELECT ok(
  (SELECT count(*) = 1 FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS')
  AND (
    SELECT count(*) = 1
    FROM public.maliyet_hizmet_stoklari
    WHERE hizmet_turu = 'temper_dis_hizmet'
  ),
  'katalog butonunun ayni idempotency anahtari hizmet kartini cogaltmaz'
);

SELECT throws_ok(
  $$
    INSERT INTO public.stok_hareketleri (
      stok_id,
      hareket_turu,
      miktar,
      birim,
      aciklama,
      kaynak_turu,
      idempotency_key
    )
    SELECT
      id,
      'devir_girisi',
      1,
      'm2',
      'Temper hizmeti sahte miktar girisi',
      'sistem_devir',
      'temper-v4-fake-stock-move'
    FROM public.stok
    WHERE kod = 'HIZMET-TEMPER-DIS'
  $$,
  '23514',
  'MALIYET_HIZMET_STOGUNDA_ENVANTER_HAREKETI_YASAK',
  'envantersiz temper hizmet kartina stok hareketi yazilamaz'
);

INSERT INTO public.cari (
  id,
  kod,
  ad,
  tipi,
  aktif,
  tedarik_kapsamlari,
  tedarikci_calisma_modeli
)
VALUES
  (
    '96800000-0000-4000-8000-000000000010',
    'TEMPER-CAM-TED',
    'Temper Cam Tedarikcisi',
    'tedarikci',
    true,
    ARRAY['cam'],
    'manuel_fiyat'
  ),
  (
    '96800000-0000-4000-8000-000000000011',
    'TEMPER-YAN-TED',
    'Temper Yan Malzeme Tedarikcisi',
    'tedarikci',
    true,
    ARRAY['yan_malzeme'],
    'manuel_fiyat'
  ),
  (
    '96800000-0000-4000-8000-000000000012',
    'TEMPER-TUM-TED',
    'Temper Tum Malzeme Tedarikcisi',
    'tedarikci',
    true,
    ARRAY['cam', 'cita', 'yan_malzeme'],
    'manuel_fiyat'
  ),
  (
    '96800000-0000-4000-8000-000000000013',
    'TEMPER-HIZMET-TED',
    'Yalniz Temper Hizmeti Tedarikcisi',
    'tedarikci',
    true,
    ARRAY['temper_hizmeti'],
    'manuel_fiyat'
  );

CREATE TEMP TABLE temper_cam_offer AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '96800000-0000-4000-8000-000000000010',
    'fiyat_tarihi', '2098-01-01T00:00:00+03:00',
    'gecerlilik_baslangici', '2098-01-01',
    'gecerlilik_bitisi', '2103-01-01',
    'kalemler', jsonb_build_array(jsonb_build_object(
      'stok_id', (
        SELECT id FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'
      ),
      'birim_fiyat', 50,
      'fiyat_birimi', 'm2',
      'varyant', 'standart',
      'vade_gunu', 60,
      'marka', 'Cam Temper Markasi'
    ))
  ),
  'temper-v4-cam-offer'
) AS result;

SELECT ok(
  ((SELECT result FROM temper_cam_offer) ->> 'adet')::integer = 1
  AND EXISTS (
    SELECT 1
    FROM public.stok_alis_fiyatlari fiyat
    JOIN public.stok stok ON stok.id = fiyat.stok_id
    WHERE stok.kod = 'HIZMET-TEMPER-DIS'
      AND fiyat.tedarikci_id = '96800000-0000-4000-8000-000000000010'
      AND fiyat.marka = 'Cam Temper Markasi'
      AND fiyat.vade_gunu = 60
      AND fiyat.para_birimi = 'TRY'
      AND fiyat.fiyat_birimi = 'm2'
  ),
  'cam kapsamli tedarikci temper hizmetini marka, 60 gun ve TRY/m2 fiyatlar'
);

CREATE TEMP TABLE temper_side_offer AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '96800000-0000-4000-8000-000000000011',
    'fiyat_tarihi', '2098-01-01T00:00:00+03:00',
    'gecerlilik_baslangici', '2098-01-01',
    'gecerlilik_bitisi', '2103-01-01',
    'kalemler', jsonb_build_array(jsonb_build_object(
      'stok_id', (
        SELECT id FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'
      ),
      'birim_fiyat', 55,
      'fiyat_birimi', 'm2',
      'varyant', 'ozel',
      'vade_gunu', 0,
      'marka', 'Yan Temper Markasi'
    ))
  ),
  'temper-v4-side-offer'
) AS result;

SELECT ok(
  ((SELECT result FROM temper_side_offer) ->> 'adet')::integer = 1
  AND EXISTS (
    SELECT 1
    FROM public.stok_alis_fiyatlari fiyat
    JOIN public.stok stok ON stok.id = fiyat.stok_id
    WHERE stok.kod = 'HIZMET-TEMPER-DIS'
      AND fiyat.tedarikci_id = '96800000-0000-4000-8000-000000000011'
      AND fiyat.marka = 'Yan Temper Markasi'
      AND fiyat.vade_gunu = 0
  ),
  'yan malzeme kapsamli tedarikci de temper hizmetini pesin fiyatlayabilir'
);

CREATE TEMP TABLE temper_only_service_offer AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '96800000-0000-4000-8000-000000000013',
    'kalemler', jsonb_build_array(jsonb_build_object(
      'stok_id', (
        SELECT id FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'
      ),
      'birim_fiyat', 45,
      'fiyat_birimi', 'm2',
      'varyant', 'gunluk',
      'vade_gunu', 30,
      'marka', 'Fason Temper'
    ))
  ),
  'temper-v4-only-service-offer'
) AS result;

SELECT ok(
  ((SELECT result FROM temper_only_service_offer) ->> 'adet')::integer = 1
  AND EXISTS (
    SELECT 1
    FROM public.stok_alis_fiyatlari fiyat
    WHERE fiyat.tedarikci_id =
      '96800000-0000-4000-8000-000000000013'
      AND fiyat.marka = 'Fason Temper'
      AND fiyat.vade_gunu = 30
  ),
  'yalniz temper_hizmeti kapsamli fason tedarikci de hizmet fiyati girebilir'
);

SELECT throws_ok(
  $$
    SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
      jsonb_build_object(
        'tedarikci_id', '96800000-0000-4000-8000-000000000013',
        'kalemler', jsonb_build_array(jsonb_build_object(
          'stok_id', (SELECT id FROM public.stok WHERE kod = '01002'),
          'birim_fiyat', 100,
          'fiyat_birimi', 'm2'
        ))
      ),
      'temper-v4-only-service-physical-glass'
    )
  $$,
  '23514',
  'TEDARIKCI_KAPSAMI_UYUSMUYOR',
  'yalniz temper_hizmeti kapsamli fasoncu fiziksel cami fiyatlayamaz'
);

SELECT throws_ok(
  $$
    SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
      jsonb_build_object(
        'tedarikci_id', '96800000-0000-4000-8000-000000000010',
        'fiyat_tarihi', '2098-01-01T00:00:00+03:00',
        'kalemler', jsonb_build_array(jsonb_build_object(
          'stok_id', (
            SELECT id FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'
          ),
          'birim_fiyat', 50,
          'para_birimi', 'EUR',
          'fiyat_birimi', 'm2'
        ))
      ),
      'temper-v4-invalid-currency'
    )
  $$,
  '23514',
  'V3_FIYAT_BIRIMI_DESTEKLENMIYOR',
  'temper dis hizmeti TRY/m2 disinda fiyatlanamaz'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"96800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"96800000-0000-4000-8000-000000000002"}',
  true
);

SELECT throws_ok(
  $$
    SELECT public.temper_maliyet_modu_kaydet_v4(
      jsonb_build_object(
        'mod', 'dis_hizmet',
        'baslangic', '2099-01-01',
        'gerekce', 'AAL1 ile mod denemesi'
      ),
      'temper-v4-aal1-mode'
    )
  $$,
  '42501',
  'AAL2_GEREKLI',
  'temper mod degisikligi AAL2 gerektirir'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"96800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"96800000-0000-4000-8000-000000000002"}',
  true
);

CREATE TEMP TABLE temper_today_mode AS
SELECT public.temper_maliyet_modu_kaydet_v4(
  jsonb_build_object(
    'mod', 'dis_hizmet',
    'gerekce', 'Bugun baslayan fason temper modu'
  ),
  'temper-v4-today-mode'
) AS result;

CREATE TEMP TABLE temper_today_selection AS
SELECT public.temper_dis_hizmet_fiyat_sec_v4(
  jsonb_build_object(
    'fiyat_id', (
      SELECT fiyat.id
      FROM public.stok_alis_fiyatlari fiyat
      WHERE fiyat.tedarikci_id =
        '96800000-0000-4000-8000-000000000013'
      ORDER BY fiyat.created_at DESC, fiyat.id DESC
      LIMIT 1
    ),
    'gerekce', 'Bugun baslayan genel fason temper fiyati'
  ),
  'temper-v4-today-selection'
) AS result;

SELECT ok(
  public.temper_maliyetini_coz_v4(
    NULL,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
    1
  ) @> jsonb_build_object(
    'gecerli', true,
    'mod', 'dis_hizmet',
    'birim_maliyet_try', 45.00000000
  )
  AND (
    SELECT
      lower(secim.gecerlilik_donemi)
        = (
          (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
            ::timestamp AT TIME ZONE 'Europe/Istanbul'
        )
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
    WHERE secim.id = (
      (SELECT result FROM temper_today_selection)
        #>> '{secilenler,0,secim_id}'
    )::uuid
  ),
  'bugun girilen fiyat ve varsayilan secim Istanbul gun basindan bugun cozulur'
);

CREATE TEMP TABLE temper_external_mode AS
SELECT public.temper_maliyet_modu_kaydet_v4(
  jsonb_build_object(
    'mod', 'dis_hizmet',
    'baslangic', '2099-01-01',
    'gerekce', 'Temper dis hizmet donemi'
  ),
  'temper-v4-external-mode'
) AS result;

SELECT ok(
  (SELECT result ->> 'mod' = 'dis_hizmet' FROM temper_external_mode)
  AND (
    SELECT result ->> 'dis_hizmet_stok_id' IS NOT NULL
      AND jsonb_array_length(result -> 'ic_uretim_kalemleri') = 0
    FROM temper_external_mode
  )
  AND (
    SELECT upper(secim.gecerlilik_donemi)
      = '2099-01-01T00:00:00+03:00'::timestamptz
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
    WHERE secim.id = (
      (SELECT result FROM temper_today_selection)
        #>> '{secilenler,0,secim_id}'
    )::uuid
  ),
  'yeni dis hizmet modu eski modun acik fiyat secimini ayni tarih sinirinda kapatir'
);

SELECT is(
  (
    public.temper_maliyet_modu_kaydet_v4(
      jsonb_build_object(
        'mod', 'dis_hizmet',
        'baslangic', '2099-01-01',
        'gerekce', 'Temper dis hizmet donemi'
      ),
      'temper-v4-external-mode'
    ) ->> 'mod_surumu_id'
  ),
  (SELECT result ->> 'mod_surumu_id' FROM temper_external_mode),
  'ayni idempotency anahtari dis hizmet mod surumunu cogaltmaz'
);

SELECT throws_ok(
  $$
    INSERT INTO public.temper_maliyet_modu_surmleri (
      mod,
      dis_hizmet_stok_id,
      gecerlilik_donemi,
      revision_no,
      gerekce,
      olusturan_kullanici_id
    )
    SELECT
      'dis_hizmet',
      id,
      daterange('2099-06-01', '2099-07-01', '[)'),
      99,
      'Cakisan temper donemi',
      '96800000-0000-4000-8000-000000000001'
    FROM public.stok
    WHERE kod = 'HIZMET-TEMPER-DIS'
  $$,
  '23P01',
  NULL,
  'global dis hizmet ve ic uretim modlari ayni tarihte cakistirilamaz'
);

SELECT is(
  (
    SELECT array_agg(value ->> 'stok_kodu' ORDER BY (value ->> 'sira_no')::int)
    FROM jsonb_array_elements(
      public.maliyet_recete_onerisi_v3(
        (SELECT id FROM public.stok WHERE kod = '07122')
      ) -> 'kalemler'
    )
  ),
  ARRAY[
    '01016',
    'CITA-AL-012',
    '01002',
    'SARF-BUTIL',
    'SARF-NEM-ALICI',
    'SARF-PU'
  ]::text[],
  '07122 acik recetesi lamine, 12 mm cita, duz cam, butil, nem ve PU kullanir'
);

SELECT is(
  jsonb_array_length(
    public.maliyet_recete_onerisi_v3(
      (SELECT id FROM public.stok WHERE kod = '07122')
    ) -> 'islemler'
  ),
  0,
  '07122 temper islemi tasimaz'
);

SELECT ok(
  (
    WITH expected(stok_kodu, kalem_kodlari) AS (
      VALUES
        (
          '11004',
          ARRAY[
            '01002', 'CITA-AL-016', '01002',
            'SARF-BUTIL', 'SARF-NEM-ALICI', 'SARF-PU'
          ]::text[]
        ),
        (
          '11005',
          ARRAY[
            '01002', 'CITA-AL-014', '01002',
            'SARF-BUTIL', 'SARF-NEM-ALICI', 'SARF-PU'
          ]::text[]
        ),
        (
          '11006',
          ARRAY[
            '01002', 'CITA-AL-014', '01003',
            'SARF-BUTIL', 'SARF-NEM-ALICI', 'SARF-PU'
          ]::text[]
        ),
        (
          '11007',
          ARRAY[
            '01020', 'CITA-AL-016', '01002',
            'SARF-BUTIL', 'SARF-NEM-ALICI', 'SARF-PU'
          ]::text[]
        ),
        (
          '11008',
          ARRAY[
            '01022', 'CITA-AL-016', '01002',
            'SARF-BUTIL', 'SARF-NEM-ALICI', 'SARF-PU'
          ]::text[]
        )
    )
    SELECT bool_and(actual.kalem_kodlari = expected.kalem_kodlari)
    FROM expected
    JOIN public.stok urun ON urun.kod = expected.stok_kodu
    CROSS JOIN LATERAL (
      SELECT array_agg(
        value ->> 'stok_kodu'
        ORDER BY (value ->> 'sira_no')::int
      ) AS kalem_kodlari
      FROM jsonb_array_elements(
        public.maliyet_recete_onerisi_v3(urun.id) -> 'kalemler'
      )
    ) actual
  ),
  '11004-11008 her biri acik iki cam, dogru cita ve standart sarflari kullanir'
);

SELECT ok(
  (
    SELECT bool_and(
      jsonb_array_length(oneri -> 'islemler') = 1
      AND oneri #> '{islemler,0,hedef_cam_sira_nolari}' = '[2]'::jsonb
      AND oneri #>> '{islemler,0,islem_turu}' = 'temper'
    )
    FROM (
      SELECT public.maliyet_recete_onerisi_v3(stok.id) AS oneri
      FROM public.stok
      WHERE kod IN ('11004', '11005', '11006', '11007', '11008')
    ) suggestions
  ),
  '11004-11008 urunlerinde yalniz ikinci cam paneli temperlenir'
);

CREATE TEMP TABLE temper_recipe_install AS
SELECT public.standart_urun_recetelerini_kur_v3(
  '2099-01-01',
  ARRAY(
    SELECT id
    FROM public.stok
    WHERE kod IN ('07122', '11004', '11005', '11006', '11007', '11008')
    ORDER BY kod
  ),
  true
) AS result;

SELECT is(
  jsonb_array_length((SELECT result -> 'kurulanlar' FROM temper_recipe_install)),
  6,
  '07122 ve 11004-11008 standart acik receteleri kullanici eylemiyle kurulur'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok_urun_maliyet_recete_islemleri islem
    JOIN public.stok_urun_maliyet_recete_surmleri recete
      ON recete.id = islem.recete_surumu_id
    JOIN public.stok urun ON urun.id = recete.urun_stok_id
    WHERE urun.kod IN ('11004', '11005', '11006', '11007', '11008')
      AND recete.gecerlilik_donemi @> '2099-02-01'::date
      AND islem.islem_turu = 'temper'
      AND islem.hedef_cam_sira_nolari = ARRAY[2]
  ),
  5,
  'kurulan bes temperli urun recetesinde ikinci panel islemi acikca saklanir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok_urun_maliyet_recete_kalemleri kalem
    JOIN public.stok stok ON stok.id = kalem.bilesen_stok_id
    WHERE stok.kod = 'HIZMET-TEMPER-DIS'
  ),
  0,
  'temper hizmeti receteye ham stok kalemi olarak eklenmez'
);

SELECT throws_ok(
  $$
    INSERT INTO public.stok_urun_maliyet_recete_islemleri (
      recete_surumu_id,
      sira_no,
      islem_turu,
      hedef_cam_sira_nolari
    )
    SELECT recete.id, 99, 'temper', ARRAY[3]
    FROM public.stok_urun_maliyet_recete_surmleri recete
    JOIN public.stok urun ON urun.id = recete.urun_stok_id
    WHERE urun.kod = '11004'
      AND recete.gecerlilik_donemi @> '2099-02-01'::date
  $$,
  '23514',
  'TEMPER_HEDEF_CAM_SIRASI_GECERSIZ',
  'recetede bulunmayan cam paneli temper hedefi olamaz'
);

SELECT throws_ok(
  $$
    SELECT public.temper_dis_hizmet_fiyat_sec_v4(
      jsonb_build_object(
        'fiyat_id', (
          SELECT fiyat.id
          FROM public.stok_alis_fiyatlari fiyat
          JOIN public.stok stok ON stok.id = fiyat.stok_id
          WHERE stok.kod = 'HIZMET-TEMPER-DIS'
            AND fiyat.tedarikci_id =
              '96800000-0000-4000-8000-000000000010'
          ORDER BY fiyat.created_at DESC, fiyat.id DESC
          LIMIT 1
        ),
        'urun_stok_id', (
          SELECT id FROM public.stok WHERE kod = '07122'
        ),
        'baslangic', '2099-01-01T00:00:00+03:00',
        'bitis', '2099-04-01T00:00:00+03:00',
        'gerekce', '07122 yanlis temper override denemesi'
      ),
      'temper-v4-07122-invalid-override'
    )
  $$,
  '23514',
  'TEMPER_URUN_RECETESI_SECIM_DONEMINI_KAPSAMIYOR',
  'katmanli fakat temper islemi olmayan 07122 urun override alamaz'
);

CREATE TEMP TABLE temper_general_count_before_invalid_lists AS
SELECT count(*)::integer AS count_value
FROM public.temper_dis_hizmet_fiyat_secim_surmleri
WHERE mod_surumu_id = (
  (SELECT result FROM temper_external_mode) ->> 'mod_surumu_id'
)::uuid
  AND urun_stok_id IS NULL;

SELECT throws_ok(
  $$
    SELECT public.temper_dis_hizmet_fiyat_sec_v4(
      jsonb_build_object(
        'fiyat_id', (
          SELECT fiyat.id
          FROM public.stok_alis_fiyatlari fiyat
          JOIN public.stok stok ON stok.id = fiyat.stok_id
          WHERE stok.kod = 'HIZMET-TEMPER-DIS'
            AND fiyat.tedarikci_id =
              '96800000-0000-4000-8000-000000000010'
          ORDER BY fiyat.created_at DESC, fiyat.id DESC
          LIMIT 1
        ),
        'urun_stok_ids', jsonb_build_array(NULL),
        'baslangic', '2099-01-01T00:00:00+03:00',
        'bitis', '2099-04-01T00:00:00+03:00',
        'gerekce', 'Null urun listesi denemesi'
      ),
      'temper-v4-null-product-list'
    )
  $$,
  '22023',
  'TEMPER_URUN_LISTESI_GECERSIZ',
  'null elemanli urun listesi genel secime donusturulmez'
);

SELECT throws_ok(
  $$
    SELECT public.temper_dis_hizmet_fiyat_sec_v4(
      jsonb_build_object(
        'fiyat_id', (
          SELECT fiyat.id
          FROM public.stok_alis_fiyatlari fiyat
          JOIN public.stok stok ON stok.id = fiyat.stok_id
          WHERE stok.kod = 'HIZMET-TEMPER-DIS'
            AND fiyat.tedarikci_id =
              '96800000-0000-4000-8000-000000000010'
          ORDER BY fiyat.created_at DESC, fiyat.id DESC
          LIMIT 1
        ),
        'urun_stok_ids', jsonb_build_array(
          (SELECT id FROM public.stok WHERE kod = '11004'),
          NULL
        ),
        'baslangic', '2099-01-01T00:00:00+03:00',
        'bitis', '2099-04-01T00:00:00+03:00',
        'gerekce', 'Karisik null urun listesi denemesi'
      ),
      'temper-v4-mixed-null-product-list'
    )
  $$,
  '22023',
  'TEMPER_URUN_LISTESI_GECERSIZ',
  'gecerli urun yanindaki null eleman da atomik olarak reddedilir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri
    WHERE mod_surumu_id = (
      (SELECT result FROM temper_external_mode) ->> 'mod_surumu_id'
    )::uuid
      AND urun_stok_id IS NULL
  ),
  (
    SELECT count_value
    FROM temper_general_count_before_invalid_lists
  ),
  'gecersiz urun listeleri gizli genel fallback secimi olusturmaz'
);

CREATE TEMP TABLE temper_all_product_overrides AS
SELECT public.temper_dis_hizmet_fiyat_sec_v4(
  jsonb_build_object(
    'fiyat_id', (
      SELECT fiyat.id
      FROM public.stok_alis_fiyatlari fiyat
      JOIN public.stok stok ON stok.id = fiyat.stok_id
      WHERE stok.kod = 'HIZMET-TEMPER-DIS'
        AND fiyat.tedarikci_id = '96800000-0000-4000-8000-000000000010'
      ORDER BY fiyat.created_at DESC, fiyat.id DESC
      LIMIT 1
    ),
    'urun_stok_ids', (
      SELECT jsonb_agg(id ORDER BY kod)
      FROM public.stok
      WHERE kod IN ('11004', '11005', '11006', '11007', '11008')
    ),
    'baslangic', '2099-01-01T00:00:00+03:00',
    'bitis', '2099-04-01T00:00:00+03:00',
    'gerekce', 'Bes temper urununde tekil fiyatlar'
  ),
  'temper-v4-all-product-overrides'
) AS result;

SELECT is(
  (
    (SELECT result FROM temper_all_product_overrides)
      ->> 'secilen_adet'
  )::integer,
  5,
  'dis hizmet fiyati urun listesine toplu override olarak secilebilir'
);

SELECT ok(
  (
    public.temper_maliyet_paneli_getir_v4('2099-02-01')
      ->> 'hazir'
  )::boolean
  AND jsonb_array_length(
    public.temper_maliyet_paneli_getir_v4('2099-02-01')
      -> 'urun_cozumleri'
  ) = 5
  AND (
    SELECT bool_and((value ->> 'gecerli')::boolean)
    FROM jsonb_array_elements(
      public.temper_maliyet_paneli_getir_v4('2099-02-01')
        -> 'urun_cozumleri'
    )
  )
  AND jsonb_array_length(
    public.temper_maliyet_paneli_getir_v4('2099-02-01')
      -> 'eksikler'
  ) = 0
  AND NOT (
    public.temper_maliyet_paneli_getir_v4('2099-02-01')
      #>> '{aktif_cozum,gecerli}'
  )::boolean,
  'yalniz urun override varken genel cozum eksik olsa da urun readiness matrisi hazirdir'
);

CREATE TEMP TABLE temper_general_selection AS
SELECT public.temper_dis_hizmet_fiyat_sec_v4(
  jsonb_build_object(
    'fiyat_id', (
      SELECT fiyat.id
      FROM public.stok_alis_fiyatlari fiyat
      JOIN public.stok stok ON stok.id = fiyat.stok_id
      WHERE stok.kod = 'HIZMET-TEMPER-DIS'
        AND fiyat.tedarikci_id = '96800000-0000-4000-8000-000000000010'
      ORDER BY fiyat.created_at DESC, fiyat.id DESC
      LIMIT 1
    ),
    'baslangic', '2099-04-01T00:00:00+03:00',
    'gerekce', 'Genel temper dis hizmet fiyati'
  ),
  'temper-v4-general-selection'
) AS result;

SELECT is(
  (SELECT result ->> 'kapsam' FROM temper_general_selection),
  'genel',
  'genel temper dis hizmet fiyat fallbacki secilebilir'
);

CREATE TEMP TABLE temper_11004_override AS
SELECT public.temper_dis_hizmet_fiyat_sec_v4(
  jsonb_build_object(
    'fiyat_id', (
      SELECT fiyat.id
      FROM public.stok_alis_fiyatlari fiyat
      JOIN public.stok stok ON stok.id = fiyat.stok_id
      WHERE stok.kod = 'HIZMET-TEMPER-DIS'
        AND fiyat.tedarikci_id = '96800000-0000-4000-8000-000000000011'
      ORDER BY fiyat.created_at DESC, fiyat.id DESC
      LIMIT 1
    ),
    'urun_stok_id', (
      SELECT id FROM public.stok WHERE kod = '11004'
    ),
    'baslangic', '2099-04-01T00:00:00+03:00',
    'gerekce', '11004 urun ozel temper fiyati'
  ),
  'temper-v4-11004-override'
) AS result;

SELECT is(
  (SELECT result ->> 'kapsam' FROM temper_11004_override),
  'urun',
  '11004 aktif temper recetesiyle urun ozel fiyat alabilir'
);

SELECT ok(
  public.temper_maliyetini_coz_v4(
    (SELECT id FROM public.stok WHERE kod = '11004'),
    '2099-07-01',
    2
  ) @> jsonb_build_object(
    'gecerli', true,
    'mod', 'dis_hizmet',
    'birim_maliyet_try', 55.00000000,
    'toplam_maliyet', 110.000000,
    'dis_hizmet_fiyati', jsonb_build_object(
      'secim_kapsami', 'urun',
      'vade_gunu', 0,
      'marka', 'Yan Temper Markasi'
    )
  ),
  'urun override dis hizmet maliyetinde marka, vade ve TRY/m2 tutariyla izlenir'
);

SELECT ok(
  public.temper_maliyetini_coz_v4(
    (SELECT id FROM public.stok WHERE kod = '11005'),
    '2099-07-01',
    2
  ) @> jsonb_build_object(
    'gecerli', true,
    'mod', 'dis_hizmet',
    'birim_maliyet_try', 50.00000000,
    'toplam_maliyet', 100.000000,
    'dis_hizmet_fiyati', jsonb_build_object(
      'secim_kapsami', 'genel',
      'vade_gunu', 60,
      'marka', 'Cam Temper Markasi'
    )
  ),
  'urun override yoksa genel dis hizmet fiyati fallback olarak cozulur'
);

SELECT ok(
  (
    public.temper_maliyet_paneli_getir_v4('2099-07-01')
      ->> 'hazir'
  )::boolean
  AND jsonb_array_length(
    public.temper_maliyet_paneli_getir_v4('2099-07-01')
      -> 'urun_cozumleri'
  ) = 5
  AND jsonb_array_length(
    public.temper_maliyet_paneli_getir_v4('2099-07-01')
      -> 'urun_fiyat_secimleri'
  ) = 2,
  'temper paneli bes urunun readiness matrisini ve genel/urun secimlerini izler'
);

CREATE TEMP TABLE temper_11004_recipe_revision AS
WITH current_recipe AS (
  SELECT recete.id, recete.urun_stok_id
  FROM public.stok_urun_maliyet_recete_surmleri recete
  JOIN public.stok urun ON urun.id = recete.urun_stok_id
  WHERE urun.kod = '11004'
    AND recete.gecerlilik_donemi @> '2099-07-01'::date
)
SELECT public.urun_maliyet_recetesi_kaydet_v4(
  jsonb_build_object(
    'urun_stok_id', current_recipe.urun_stok_id,
    'baslangic', '2099-08-01',
    'aciklama', '11004 ikinci temper recete surumu',
    'kalemler', (
      SELECT jsonb_agg(jsonb_build_object(
        'sira_no', kalem.sira_no,
        'bilesen_stok_id', kalem.bilesen_stok_id,
        'rol', kalem.rol,
        'tuketim_tipi', kalem.tuketim_tipi,
        'katsayi', kalem.katsayi,
        'bosluk_sirasi', kalem.bosluk_sirasi,
        'alternatif_grubu', kalem.alternatif_grubu,
        'aciklama', kalem.aciklama
      ) ORDER BY kalem.sira_no)
      FROM public.stok_urun_maliyet_recete_kalemleri kalem
      WHERE kalem.recete_surumu_id = current_recipe.id
    ),
    'islemler', (
      SELECT jsonb_agg(jsonb_build_object(
        'sira_no', islem.sira_no,
        'islem_turu', islem.islem_turu,
        'tuketim_tipi', islem.tuketim_tipi,
        'hedef_cam_sira_nolari', islem.hedef_cam_sira_nolari,
        'alan_katsayisi', islem.alan_katsayisi,
        'aciklama', islem.aciklama
      ) ORDER BY islem.sira_no)
      FROM public.stok_urun_maliyet_recete_islemleri islem
      WHERE islem.recete_surumu_id = current_recipe.id
    )
  ),
  'temper-v4-11004-recipe-revision'
) AS result
FROM current_recipe;

SELECT ok(
  (
    (SELECT result FROM temper_11004_recipe_revision)
      ->> 'revision_no'
  )::integer = 2
  AND (
    SELECT count(*) = 2
    FROM public.stok_urun_maliyet_recete_surmleri recete
    JOIN public.stok urun ON urun.id = recete.urun_stok_id
    WHERE urun.kod = '11004'
  )
  AND (
    SELECT count(*) = 2
    FROM public.stok_urun_maliyet_recete_islemleri islem
    JOIN public.stok_urun_maliyet_recete_surmleri recete
      ON recete.id = islem.recete_surumu_id
    JOIN public.stok urun ON urun.id = recete.urun_stok_id
    WHERE urun.kod = '11004'
      AND islem.islem_turu = 'temper'
  ),
  'urun override acikken 11004 icin yeni temper recete surumu acilabilir'
);

UPDATE public.stok
SET aktif = false
WHERE kod = 'HIZMET-TEMPER-DIS';

CREATE TEMP TABLE temper_internal_mode AS
SELECT public.temper_maliyet_modu_kaydet_v4(
  jsonb_build_object(
    'mod', 'ic_uretim',
    'baslangic', '2100-01-01',
    'gerekce', 'Kendi temper hattina gecis',
    'ic_uretim_kalemleri', jsonb_build_array(
      jsonb_build_object(
        'sira_no', 1,
        'bilesen_turu', 'amortisman',
        'aciklama', 'Temper firini amortismani',
        'tuketim_birimi', 'm2',
        'm2_basina_tuketim', 1,
        'birim_maliyet_try', 10
      ),
      jsonb_build_object(
        'sira_no', 2,
        'bilesen_turu', 'enerji',
        'aciklama', 'Elektrik tuketimi',
        'tuketim_birimi', 'kWh',
        'm2_basina_tuketim', 2,
        'birim_maliyet_try', 5
      ),
      jsonb_build_object(
        'sira_no', 3,
        'bilesen_turu', 'iscilik',
        'aciklama', 'Operator isciligi',
        'tuketim_birimi', 'saat',
        'm2_basina_tuketim', 0.5,
        'birim_maliyet_try', 20
      )
    )
  ),
  'temper-v4-internal-mode'
) AS result;

SELECT ok(
  (SELECT result ->> 'mod' = 'ic_uretim' FROM temper_internal_mode)
  AND (
    SELECT jsonb_array_length(result -> 'ic_uretim_kalemleri') = 3
    FROM temper_internal_mode
  ),
  'hizmet karti sonradan pasif olsa da ic uretime gecis eski modu kapatir'
);

SELECT ok(
  (SELECT count(*) = 3 FROM public.temper_maliyet_modu_surmleri)
  AND NOT EXISTS (
    SELECT 1
    FROM public.temper_maliyet_modu_surmleri first_mode
    JOIN public.temper_maliyet_modu_surmleri second_mode
      ON first_mode.id < second_mode.id
     AND first_mode.gecerlilik_donemi && second_mode.gecerlilik_donemi
  )
  AND EXISTS (
    SELECT 1
    FROM public.temper_maliyet_modu_surmleri
    WHERE mod = 'dis_hizmet'
      AND gecerlilik_donemi = daterange(
        '2099-01-01',
        '2100-01-01',
        '[)'
      )
  )
  AND (
    SELECT bool_and(
      upper(secim.gecerlilik_donemi)
        = '2100-01-01T00:00:00+03:00'::timestamptz
    )
    FROM public.temper_dis_hizmet_fiyat_secim_surmleri secim
    JOIN public.temper_maliyet_modu_surmleri mod_surumu
      ON mod_surumu.id = secim.mod_surumu_id
    WHERE mod_surumu.mod = 'dis_hizmet'
      AND lower(mod_surumu.gecerlilik_donemi) = '2099-01-01'::date
      AND lower(secim.gecerlilik_donemi)
        = '2099-04-01T00:00:00+03:00'::timestamptz
  ),
  'dis hizmetten ic uretime gecis modu ve acik genel/urun secimlerini ayni sinirda kapatir'
);

SELECT ok(
  public.temper_maliyetini_coz_v4(
    (SELECT id FROM public.stok WHERE kod = '11004'),
    '2100-06-01',
    2
  ) @> jsonb_build_object(
    'gecerli', true,
    'mod', 'ic_uretim',
    'birim_maliyet_try', 30.00000000,
    'toplam_maliyet', 60.000000
  ),
  'ic uretim temper maliyeti amortisman, enerji ve isciligi m2 bazinda toplar'
);

SELECT is(
  jsonb_array_length(
    public.temper_maliyetini_coz_v4(
      (SELECT id FROM public.stok WHERE kod = '11004'),
      '2100-06-01',
      2
    ) -> 'ic_uretim_kalemleri'
  ),
  3,
  'ic uretim cozumunde uc maliyet kalemi ayri izlenir'
);

SELECT is(
  (
    public.temper_maliyetini_coz_v4(
      (SELECT id FROM public.stok WHERE kod = '11004'),
      '2099-07-01',
      2
    ) ->> 'toplam_maliyet'
  )::numeric,
  110.000000::numeric,
  'ic uretime gecis gecmis dis hizmet maliyet snapshotini degistirmez'
);

CREATE TEMP TABLE temper_component_offer AS
SELECT public.stok_tedarikci_fiyat_tekliflerini_kaydet_v3(
  jsonb_build_object(
    'tedarikci_id', '96800000-0000-4000-8000-000000000012',
    'fiyat_tarihi', '2098-01-01T00:00:00+03:00',
    'gecerlilik_baslangici', '2098-01-01',
    'gecerlilik_bitisi', '2102-01-01',
    'kalemler', jsonb_build_array(
      jsonb_build_object(
        'stok_id', (SELECT id FROM public.stok WHERE kod = '01002'),
        'birim_fiyat', 100,
        'fiyat_birimi', 'm2',
        'varyant', 'genel',
        'vade_gunu', 0
      ),
      jsonb_build_object(
        'stok_id', (
          SELECT id FROM public.stok WHERE kod = 'CITA-AL-016'
        ),
        'birim_fiyat', 10,
        'fiyat_birimi', 'm',
        'varyant', 'genel',
        'vade_gunu', 0
      ),
      jsonb_build_object(
        'stok_id', (
          SELECT id FROM public.stok WHERE kod = 'SARF-BUTIL'
        ),
        'birim_fiyat', 20,
        'fiyat_birimi', 'kg',
        'varyant', 'genel',
        'vade_gunu', 0
      ),
      jsonb_build_object(
        'stok_id', (
          SELECT id FROM public.stok WHERE kod = 'SARF-NEM-ALICI'
        ),
        'birim_fiyat', 5,
        'fiyat_birimi', 'kg',
        'varyant', 'genel',
        'vade_gunu', 0
      ),
      jsonb_build_object(
        'stok_id', (SELECT id FROM public.stok WHERE kod = 'SARF-PU'),
        'birim_fiyat', 8,
        'fiyat_birimi', 'litre',
        'varyant', 'genel',
        'vade_gunu', 0
      )
    )
  ),
  'temper-v4-component-offer'
) AS result;

SELECT is(
  ((SELECT result FROM temper_component_offer) ->> 'adet')::integer,
  5,
  '11004 ham cam, cita ve sarf fiyatlari acikca kaydedilir'
);

CREATE TEMP TABLE temper_component_policy AS
SELECT public.stok_maliyet_toplu_politika_uygula_v3(
  jsonb_build_object(
    'kapsam', 'cam',
    'tedarikci_id', '96800000-0000-4000-8000-000000000012',
    'varyant', 'genel',
    'vade_gunu', 0,
    'stok_ids', (
      SELECT jsonb_agg(id ORDER BY kod)
      FROM public.stok
      WHERE kod IN (
        '01002',
        'CITA-AL-016',
        'SARF-BUTIL',
        'SARF-NEM-ALICI',
        'SARF-PU'
      )
    ),
    'baslangic', '2099-01-01T00:00:00+03:00',
    'bitis', '2102-01-01T00:00:00+03:00',
    'gerekce', '11004 acik recete fiyat secimleri'
  ),
  'temper-v4-component-policy'
) AS result;

SELECT is(
  ((SELECT result FROM temper_component_policy) ->> 'secilen_adet')::integer,
  5,
  '11004 recete bilesenlerinin fiyat snapshotlari secilir'
);

SELECT ok(
  (
    public.urun_maliyeti_detayli_hesapla_v3(
      (SELECT id FROM public.stok WHERE kod = '11004'),
      '2100-06-01',
      1000,
      1000
    ) ->> 'gecerli'
  )::boolean
  AND (
    public.urun_maliyeti_detayli_hesapla_temel_v3(
      (SELECT id FROM public.stok WHERE kod = '11004'),
      '2100-06-01',
      1000,
      1000
    ) ->> 'gecerli'
  )::boolean,
  '11004 ham malzeme tabani ve temper islemli toplam eksiksiz hesaplanir'
);

SELECT is(
  (
    public.urun_maliyeti_detayli_hesapla_v3(
      (SELECT id FROM public.stok WHERE kod = '11004'),
      '2100-06-01',
      1000,
      1000
    ) ->> 'islem_maliyeti'
  )::numeric,
  30.00::numeric,
  'bir metrekare 11004 urununde yalniz tek panel icin temper maliyeti eklenir'
);

SELECT is(
  (
    (
      public.urun_maliyeti_detayli_hesapla_v3(
        (SELECT id FROM public.stok WHERE kod = '11004'),
        '2100-06-01',
        1000,
        1000
      ) ->> 'toplam_maliyet'
    )::numeric
    -
    (
      public.urun_maliyeti_detayli_hesapla_temel_v3(
        (SELECT id FROM public.stok WHERE kod = '11004'),
        '2100-06-01',
        1000,
        1000
      ) ->> 'toplam_maliyet'
    )::numeric
  ),
  30.00::numeric,
  'temper zarfi ham cam maliyetini tekrarlamadan yalniz islem tutarini ekler'
);

SELECT ok(
  (
    SELECT count(*) = 2
    FROM jsonb_array_elements(
      public.urun_maliyeti_detayli_hesapla_v3(
        (SELECT id FROM public.stok WHERE kod = '11004'),
        '2100-06-01',
        1000,
        1000
      ) -> 'bilesenler'
    )
    WHERE value ->> 'rol' = 'cam'
  )
  AND (
    SELECT count(*) = 1
    FROM jsonb_array_elements(
      public.urun_maliyeti_detayli_hesapla_v3(
        (SELECT id FROM public.stok WHERE kod = '11004'),
        '2100-06-01',
        1000,
        1000
      ) -> 'islemler'
    )
    WHERE value ->> 'islem_turu' = 'temper'
      AND value -> 'hedef_cam_sira_nolari' = '[2]'::jsonb
  ),
  'detayli maliyette iki ham cam kalemi ve ayri tek temper islemi izlenir'
);

SELECT ok(
  (
    public.temper_maliyet_paneli_getir_v4('2100-06-01')
      ->> 'hazir'
  )::boolean
  AND (
    SELECT bool_and(
      (value ->> 'gecerli')::boolean
      AND value ->> 'mod' = 'ic_uretim'
      AND (value ->> 'birim_maliyet_try')::numeric = 30
    )
    FROM jsonb_array_elements(
      public.temper_maliyet_paneli_getir_v4('2100-06-01')
        -> 'urun_cozumleri'
    )
  ),
  'panel ic uretim doneminde tum aktif temper recetelerini hazir gosterir'
);

SELECT throws_ok(
  $$
    SELECT public.temper_maliyet_modu_kaydet_v4(
      jsonb_build_object(
        'mod', 'dis_hizmet',
        'dis_hizmet_stok_id', (
          SELECT id FROM public.stok WHERE kod = 'HIZMET-TEMPER-DIS'
        ),
        'baslangic', '2101-01-01',
        'gerekce', 'Pasif hizmet kartiyla yeniden gecis'
      ),
      'temper-v4-inactive-service-reentry'
    )
  $$,
  '23514',
  'TEMPER_DIS_HIZMET_MALIYET_STOGU_GECERSIZ',
  'yeni dis hizmet modunda hizmet kartinin aktif olmasi zorunludur'
);

UPDATE public.stok
SET aktif = true
WHERE kod = 'HIZMET-TEMPER-DIS';

CREATE TEMP TABLE temper_resumed_external_mode AS
SELECT public.temper_maliyet_modu_kaydet_v4(
  jsonb_build_object(
    'mod', 'dis_hizmet',
    'baslangic', '2101-01-01',
    'gerekce', 'Fason temper hizmetine yeniden gecis'
  ),
  'temper-v4-resumed-external-mode'
) AS result;

CREATE TEMP TABLE temper_resumed_general_selection AS
SELECT public.temper_dis_hizmet_fiyat_sec_v4(
  jsonb_build_object(
    'fiyat_id', (
      SELECT fiyat.id
      FROM public.stok_alis_fiyatlari fiyat
      JOIN public.stok stok ON stok.id = fiyat.stok_id
      WHERE stok.kod = 'HIZMET-TEMPER-DIS'
        AND fiyat.tedarikci_id = '96800000-0000-4000-8000-000000000010'
      ORDER BY fiyat.created_at DESC, fiyat.id DESC
      LIMIT 1
    ),
    'baslangic', '2101-01-01T00:00:00+03:00',
    'bitis', '2102-01-01T00:00:00+03:00',
    'gerekce', 'Yeniden dis hizmet genel fiyati'
  ),
  'temper-v4-resumed-general-selection'
) AS result;

SELECT ok(
  (
    (SELECT result FROM temper_resumed_general_selection)
      ->> 'mod_surumu_id'
  ) = (
    (SELECT result FROM temper_resumed_external_mode)
      ->> 'mod_surumu_id'
  )
  AND public.temper_maliyetini_coz_v4(
    (SELECT id FROM public.stok WHERE kod = '11005'),
    '2101-06-01',
    1
  ) @> jsonb_build_object(
    'gecerli', true,
    'mod', 'dis_hizmet',
    'birim_maliyet_try', 50.00000000,
    'toplam_maliyet', 50.000000
  ),
  'ic uretimden dis hizmete donuste yeni mod secimi eski snapshotlara takilmaz'
);

SELECT public.temper_dis_hizmet_fiyat_sec_v4(
  jsonb_build_object(
    'fiyat_id', (
      SELECT fiyat.id
      FROM public.stok_alis_fiyatlari fiyat
      JOIN public.stok stok ON stok.id = fiyat.stok_id
      WHERE stok.kod = 'HIZMET-TEMPER-DIS'
        AND fiyat.tedarikci_id = '96800000-0000-4000-8000-000000000010'
      ORDER BY fiyat.created_at DESC, fiyat.id DESC
      LIMIT 1
    ),
    'baslangic', '2102-06-01T00:00:00+03:00',
    'bitis', '2102-12-01T00:00:00+03:00',
    'gerekce', 'Gelecek donem planli fiyat'
  ),
  'temper-v4-future-general-selection'
);

SELECT throws_ok(
  $$
    SELECT public.temper_maliyet_modu_kaydet_v4(
      jsonb_build_object(
        'mod', 'dis_hizmet',
        'baslangic', '2102-01-01',
        'gerekce', 'Planli secimden once mod gecisi'
      ),
      'temper-v4-transition-before-future-selection'
    )
  $$,
  '55000',
  'TEMPER_MOD_GECISINDEN_SONRA_PLANLI_FIYAT_SECIMI_VAR',
  'gelecek secimi eski moda bagli birakacak mod gecisi acikca reddedilir'
);

SELECT throws_ok(
  $$
    UPDATE public.temper_maliyet_modu_surmleri
    SET gerekce = 'Gecmisi sessiz degistirme'
    WHERE mod = 'ic_uretim'
  $$,
  '55000',
  'MALIYET_V3_SURUMU_DEGISTIRILEMEZ',
  'temper mod gecmisi append-only korunur'
);

SELECT * FROM finish();
ROLLBACK;
