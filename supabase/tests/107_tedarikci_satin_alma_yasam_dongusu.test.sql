BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(31);

SELECT has_table(
  'public',
  'tedarikci_siparis_kalemleri',
  'tedarikçi sipariş kalemleri mevcut sipariş başlığına eklenir'
);
SELECT has_table(
  'public',
  'tedarikci_mal_kabulleri',
  'kısmi ve çoklu mal kabul başlıkları tutulur'
);
SELECT has_table(
  'public',
  'tedarikci_mal_kabul_kalemleri',
  'mal kabul satırları stok hareketine bağlanır'
);
SELECT has_column(
  'public',
  'tedarikci_siparisleri',
  'fatura_cari_hareket_id',
  'mevcut sipariş başlığı fatura cari hareketini izler'
);
SELECT has_column(
  'public',
  'tedarikci_siparisleri',
  'odeme_cari_hareket_id',
  'mevcut sipariş başlığı ödeme cari hareketini izler'
);
SELECT has_function(
  'public',
  'tedarikci_mal_kabulu_kaydet',
  ARRAY['uuid', 'jsonb', 'text'],
  'atomik mal kabul RPCsi vardır'
);

SELECT ok(
  (
    SELECT bool_and(pg_get_constraintdef(oid) LIKE '%' || hareket_turu || '%')
    FROM pg_constraint
    CROSS JOIN unnest(ARRAY[
      'baglanti_on_odeme',
      'baglanti_fiyat_farki_borc',
      'baglanti_fiyat_farki_alacak',
      'tedarikci_faturasi',
      'tedarikci_odemesi'
    ]) AS beklenen(hareket_turu)
    WHERE conrelid = 'public.cari_hareketleri'::regclass
      AND conname = 'cari_hareketleri_hareket_turu_check'
  ),
  'tedarikci hareketleri eklenirken mevcut cari baglanti hareket turleri korunur'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tedarikci_siparis_kalemleri'::regclass
      AND contype = 'f'
      AND confrelid = 'public.stok'::regclass
  ),
  'sipariş kalemi kanonik public.stok kartına bağlıdır'
);

SELECT is(
  (
    WITH tablolar(ad) AS (
      VALUES
        ('tedarikci_siparis_kalemleri'),
        ('tedarikci_mal_kabulleri'),
        ('tedarikci_mal_kabul_kalemleri')
    )
    SELECT count(*)::integer
    FROM tablolar
    JOIN pg_class tablo ON tablo.oid = to_regclass('public.' || tablolar.ad)
    WHERE tablo.relrowsecurity AND tablo.relforcerowsecurity
  ),
  3,
  'yeni satın alma tablolarında RLS ve FORCE RLS etkindir'
);

SELECT is(
  (
    WITH tablolar(ad) AS (
      VALUES
        ('tedarikci_siparis_kalemleri'),
        ('tedarikci_mal_kabulleri'),
        ('tedarikci_mal_kabul_kalemleri')
    )
    SELECT count(*)::integer
    FROM tablolar
    WHERE has_table_privilege('authenticated', 'public.' || ad, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || ad, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || ad, 'DELETE')
  ),
  0,
  'authenticated rolü yaşam döngüsü tablolarına doğrudan yazamaz'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_trigger
    WHERE tgrelid IN (
      'public.tedarikci_siparis_kalemleri'::regclass,
      'public.tedarikci_mal_kabulleri'::regclass,
      'public.tedarikci_mal_kabul_kalemleri'::regclass
    )
      AND tgname LIKE '%immutable'
      AND NOT tgisinternal
  ),
  3,
  'sipariş fiyat snapshotı ve mal kabul kayıtları değişmezdir'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cari_hareketleri'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%tedarikci_faturasi%'
      AND pg_get_constraintdef(oid) LIKE '%tedarikci_odemesi%'
  ),
  'tedarikçi fatura ve ödeme cari hareket türleri tanımlıdır'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '97100000-0000-4000-8000-000000000001',
  'tedarikci-yasam-dongusu-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '97100000-0000-4000-8000-000000000001';

INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '97100000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

INSERT INTO auth.sessions(id, user_id, created_at, updated_at)
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
  'Tedarikçi yaşam döngüsü pgTAP',
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
  '97100000-0000-4000-8000-000000000001',
  '97100000-0000-4000-8000-000000000003',
  '97100000-0000-4000-8000-000000000002',
  now()
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"97100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"97100000-0000-4000-8000-000000000002"}',
  true
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
VALUES (
  '97100000-0000-4000-8000-000000000010',
  'PGTAP-107-TED',
  'pgTAP 107 Bursa Tedarikçisi',
  'tedarikci',
  true,
  ARRAY['cam'],
  'manuel_fiyat'
);

INSERT INTO public.cari (id, kod, ad, tipi, aktif)
VALUES (
  '97100000-0000-4000-8000-000000000011',
  'PGTAP-107-MUS',
  'pgTAP 107 Müşteri',
  'musteri',
  true
);

INSERT INTO public.stok (
  id,
  kod,
  ad,
  kategori,
  kalinlik_mm,
  birim,
  aktif,
  ticari_kapsam
)
VALUES (
  '97100000-0000-4000-8000-000000000020',
  'PGTAP-107-CAM',
  'pgTAP 107 Test Camı',
  'cam',
  4,
  'm2',
  true,
  'maliyet_bileseni'
);

CREATE TEMP TABLE pgtap_107_siparis AS
WITH sonuc AS (
  SELECT public.tedarikci_siparisi_olustur(
    jsonb_build_object(
      'tedarikci_id', '97100000-0000-4000-8000-000000000010',
      'siparis_no', 'PGTAP-107-SIP-1',
      'siparis_tarihi', '2099-01-01',
      'vade_gunu', 60,
      'para_birimi', 'TRY',
      'aciklama', 'pgTAP 107 kalemli sipariş',
      'kalemler', jsonb_build_array(
        jsonb_build_object(
          'satir_no', 1,
          'stok_id', '97100000-0000-4000-8000-000000000020',
          'miktar', 10,
          'birim', 'm2',
          'net_birim_fiyat', 25,
          'fiyat_varyanti', 'Bursa peşin',
          'vade_gunu', 0
        )
      )
    ),
    'pgtap-107-siparis-idem'
  ) AS yanit
)
SELECT
  yanit,
  (yanit ->> 'siparis_id')::uuid AS siparis_id
FROM sonuc;

CREATE TEMP TABLE pgtap_107_kimlikler AS
SELECT
  siparis.siparis_id,
  kalem.id AS siparis_kalemi_id
FROM pgtap_107_siparis siparis
JOIN public.tedarikci_siparis_kalemleri kalem
  ON kalem.tedarikci_siparisi_id = siparis.siparis_id;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tedarikci_siparis_kalemleri
    WHERE tedarikci_siparisi_id = (SELECT siparis_id FROM pgtap_107_kimlikler)
  ),
  1,
  'manuel/Bursa tedarikçisi mevcut sipariş RPCsiyle stok kalemli sipariş açabilir'
);

SELECT is(
  (
    SELECT siparis_tutari
    FROM public.tedarikci_siparisleri
    WHERE id = (SELECT siparis_id FROM pgtap_107_kimlikler)
  ),
  250.00::numeric,
  'başlık tutarı verilmezse kalem net fiyatlarından hesaplanır'
);

INSERT INTO public.tedarikci_siparisleri (
  id,
  tedarikci_id,
  portal_siparis_no,
  siparis_tarihi,
  vade_gunu,
  para_birimi,
  siparis_tutari,
  olusturan_kullanici_id
)
VALUES (
  '97100000-0000-4000-8000-000000000030',
  '97100000-0000-4000-8000-000000000010',
  'PGTAP-107-LEGACY',
  DATE '2098-12-01',
  30,
  'TRY',
  100,
  '97100000-0000-4000-8000-000000000001'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tedarikci_siparisleri
    WHERE id = '97100000-0000-4000-8000-000000000030'
      AND fatura_cari_hareket_id IS NULL
      AND odeme_cari_hareket_id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.tedarikci_siparis_kalemleri
    WHERE tedarikci_siparisi_id = '97100000-0000-4000-8000-000000000030'
  ),
  'eski başlık-only sipariş satırları nullable eklerle geçerli kalır'
);

CREATE TEMP TABLE pgtap_107_kabul_1 AS
WITH sonuc AS (
  SELECT public.tedarikci_mal_kabulu_kaydet(
    (SELECT siparis_id FROM pgtap_107_kimlikler),
    jsonb_build_object(
      'kabul_tarihi', '2099-01-02',
      'belge_no', 'IRS-107-1',
      'aciklama', 'İlk kısmi mal kabul',
      'kalemler', jsonb_build_array(
        jsonb_build_object(
          'siparis_kalemi_id', (SELECT siparis_kalemi_id FROM pgtap_107_kimlikler),
          'miktar', 4
        )
      )
    ),
    'pgtap-107-kabul-1'
  ) AS yanit
)
SELECT
  yanit,
  (yanit ->> 'mal_kabul_id')::uuid AS mal_kabul_id
FROM sonuc;

SELECT is(
  (
    SELECT sum(miktar)
    FROM public.tedarikci_mal_kabul_kalemleri
    WHERE mal_kabul_id = (SELECT mal_kabul_id FROM pgtap_107_kabul_1)
  ),
  4::numeric,
  'ilk mal kabul sipariş miktarının bir bölümünü alabilir'
);

SELECT is(
  (
    SELECT sum(net_miktar)
    FROM public.stok_hareketleri
    WHERE tedarikci_siparisi_id = (SELECT siparis_id FROM pgtap_107_kimlikler)
  ),
  4::numeric,
  'ilk mal kabul aynı transactionda pozitif stok hareketi oluşturur'
);

SELECT is(
  (
    public.tedarikci_mal_kabulu_kaydet(
      (SELECT siparis_id FROM pgtap_107_kimlikler),
      jsonb_build_object(
        'kabul_tarihi', '2099-01-02',
        'belge_no', 'IRS-107-1',
        'aciklama', 'İlk kısmi mal kabul',
        'kalemler', jsonb_build_array(
          jsonb_build_object(
            'siparis_kalemi_id', (SELECT siparis_kalemi_id FROM pgtap_107_kimlikler),
            'miktar', 4
          )
        )
      ),
      'pgtap-107-kabul-1'
    ) ->> 'mal_kabul_id'
  ),
  (SELECT mal_kabul_id::text FROM pgtap_107_kabul_1),
  'aynı mal kabul idempotency anahtarı önceki sonucu döndürür'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok_hareketleri
    WHERE tedarikci_siparisi_id = (SELECT siparis_id FROM pgtap_107_kimlikler)
  ),
  1,
  'idempotent tekrar ikinci stok hareketi oluşturmaz'
);

CREATE TEMP TABLE pgtap_107_kabul_2 AS
WITH sonuc AS (
  SELECT public.tedarikci_mal_kabulu_kaydet(
    (SELECT siparis_id FROM pgtap_107_kimlikler),
    jsonb_build_object(
      'kabul_tarihi', '2099-01-03',
      'belge_no', 'IRS-107-2',
      'aciklama', 'İkinci kısmi mal kabul',
      'kalemler', jsonb_build_array(
        jsonb_build_object(
          'siparis_kalemi_id', (SELECT siparis_kalemi_id FROM pgtap_107_kimlikler),
          'miktar', 6
        )
      )
    ),
    'pgtap-107-kabul-2'
  ) AS yanit
)
SELECT
  yanit,
  (yanit ->> 'mal_kabul_id')::uuid AS mal_kabul_id
FROM sonuc;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.tedarikci_mal_kabulleri
    WHERE tedarikci_siparisi_id = (SELECT siparis_id FROM pgtap_107_kimlikler)
  ),
  2,
  'aynı sipariş için birden fazla kısmi kabul tutulur'
);

SELECT is(
  (
    SELECT sum(miktar)
    FROM public.tedarikci_mal_kabul_kalemleri
    WHERE siparis_kalemi_id = (SELECT siparis_kalemi_id FROM pgtap_107_kimlikler)
  ),
  10::numeric,
  'kısmi kabullerin toplamı sipariş miktarına ulaşır'
);

SELECT is(
  (
    SELECT sum(net_miktar)
    FROM public.stok_hareketleri
    WHERE tedarikci_siparisi_id = (SELECT siparis_id FROM pgtap_107_kimlikler)
  ),
  10::numeric,
  'çoklu kabul stokta sipariş toplamını üretir'
);

SELECT throws_ok(
  format(
    'SELECT public.tedarikci_mal_kabulu_kaydet(%L::uuid,%L::jsonb,%L)',
    (SELECT siparis_id FROM pgtap_107_kimlikler),
    jsonb_build_object(
      'kabul_tarihi', '2099-01-04',
      'aciklama', 'Siparişi aşan mal kabul',
      'kalemler', jsonb_build_array(
        jsonb_build_object(
          'siparis_kalemi_id', (SELECT siparis_kalemi_id FROM pgtap_107_kimlikler),
          'miktar', 1
        )
      )
    )::text,
    'pgtap-107-kabul-fazla'
  ),
  '23514',
  'MAL_KABUL_MIKTARI_SIPARISI_ASIYOR',
  'toplam mal kabul sipariş miktarını aşamaz'
);

SELECT throws_ok(
  format(
    'UPDATE public.stok_hareketleri SET aciklama = %L WHERE tedarikci_siparisi_id = %L::uuid',
    'Değiştirilemez',
    (SELECT siparis_id FROM pgtap_107_kimlikler)
  ),
  '55000',
  'STOK_HAREKETI_DEGISTIRILEMEZ',
  'mal kabul mevcut append-only stok hareketini değiştirmez ve hareket değiştirilemez'
);

CREATE TEMP TABLE pgtap_107_fatura AS
WITH sonuc AS (
  SELECT public.tedarikci_siparisine_fatura_isle(
    (SELECT siparis_id FROM pgtap_107_kimlikler),
    1,
    jsonb_build_object(
      'fatura_no', 'FAT-107-1',
      'fatura_tarihi', '2099-01-04',
      'fatura_tutari', 250
    ),
    'pgtap-107-fatura'
  ) AS yanit
)
SELECT
  yanit,
  (yanit ->> 'cari_hareket_id')::uuid AS cari_hareket_id
FROM sonuc;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.cari_hareketleri
    WHERE id = (SELECT cari_hareket_id FROM pgtap_107_fatura)
      AND cari_id = '97100000-0000-4000-8000-000000000010'
      AND yon = 'alacak'
      AND hareket_turu = 'tedarikci_faturasi'
      AND tutar = 250
  )
  AND (
    SELECT count(*)
    FROM public.cari_hareketleri
    WHERE kaynak_turu = 'tedarikci_faturasi'
      AND kaynak_id = (SELECT siparis_id FROM pgtap_107_kimlikler)
  ) = 1,
  'fatura tedarikçi cari alacağını tam bir kez oluşturur'
);

SELECT is(
  (
    SELECT net_bakiye
    FROM public.cari_bakiye_ozetleri
    WHERE cari_id = '97100000-0000-4000-8000-000000000010'
      AND para_birimi = 'TRY'
  ),
  (-250.00)::numeric,
  'tedarikçi faturası borç-alacak sözleşmesinde negatif açık ödeme bakiyesi üretir'
);

SELECT ok(
  (
    public.tedarikci_siparisine_fatura_isle(
      (SELECT siparis_id FROM pgtap_107_kimlikler),
      1,
      jsonb_build_object(
        'fatura_no', 'FAT-107-1',
        'fatura_tarihi', '2099-01-04',
        'fatura_tutari', 250
      ),
      'pgtap-107-fatura'
    ) ->> 'cari_hareket_id'
  ) = (SELECT cari_hareket_id::text FROM pgtap_107_fatura)
  AND (
    SELECT count(*)
    FROM public.cari_hareketleri
    WHERE kaynak_turu = 'tedarikci_faturasi'
      AND kaynak_id = (SELECT siparis_id FROM pgtap_107_kimlikler)
  ) = 1,
  'fatura idempotent tekrarı ikinci cari hareketi oluşturmaz'
);

CREATE TEMP TABLE pgtap_107_odeme AS
WITH sonuc AS (
  SELECT public.tedarikci_siparisini_odendi_isaretle(
    (SELECT siparis_id FROM pgtap_107_kimlikler),
    2,
    DATE '2099-02-01',
    'pgtap-107-odeme'
  ) AS yanit
)
SELECT
  yanit,
  (yanit ->> 'odeme_cari_hareket_id')::uuid AS cari_hareket_id
FROM sonuc;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.cari_hareketleri
    WHERE id = (SELECT cari_hareket_id FROM pgtap_107_odeme)
      AND cari_id = '97100000-0000-4000-8000-000000000010'
      AND yon = 'borc'
      AND hareket_turu = 'tedarikci_odemesi'
      AND tutar = 250
  ),
  'tedarikçiye ödeme tedarikçi alacağını azaltan borç hareketidir'
);

SELECT is(
  (
    SELECT net_bakiye
    FROM public.cari_bakiye_ozetleri
    WHERE cari_id = '97100000-0000-4000-8000-000000000010'
      AND para_birimi = 'TRY'
  ),
  0.00::numeric,
  'tam ödeme tedarikçi fatura bakiyesini sıfırlar'
);

SELECT ok(
  (
    public.tedarikci_siparisini_odendi_isaretle(
      (SELECT siparis_id FROM pgtap_107_kimlikler),
      2,
      DATE '2099-02-01',
      'pgtap-107-odeme'
    ) ->> 'odeme_cari_hareket_id'
  ) = (SELECT cari_hareket_id::text FROM pgtap_107_odeme)
  AND (
    SELECT count(*)
    FROM public.cari_hareketleri
    WHERE kaynak_turu = 'tedarikci_odemesi'
      AND kaynak_id = (SELECT siparis_id FROM pgtap_107_kimlikler)
  ) = 1,
  'ödeme idempotent tekrarı ikinci cari hareketi oluşturmaz'
);

CREATE TEMP TABLE pgtap_107_musteri_tahsilati AS
SELECT public.tahsilat_kaydet(
  jsonb_build_object(
    'cari_id', '97100000-0000-4000-8000-000000000011',
    'para_birimi', 'TRY',
    'tutar', 50,
    'hareket_turu', 'tahsilat',
    'tahsilat_yontemi', 'havale',
    'islem_tarihi', '2099-02-01',
    'aciklama', 'Müşteri tahsilatı davranış testi'
  ),
  'pgtap-107-musteri-tahsilat'
) AS yanit;

SELECT is(
  (
    SELECT yon
    FROM public.cari_hareketleri
    WHERE id = (
      SELECT (yanit ->> 'hareket_id')::uuid
      FROM pgtap_107_musteri_tahsilati
    )
  ),
  'alacak',
  'mevcut müşteri tahsilatı davranışı alacak yönünde değişmeden kalır'
);

SELECT * FROM finish();
ROLLBACK;
