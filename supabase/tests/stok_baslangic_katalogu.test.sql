BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(34);

SELECT has_table(
  'public',
  'stok_baslangic_katalogu_sablonu',
  'baslangic katalogu sablonu vardir'
);
SELECT has_function(
  'public',
  'stok_baslangic_katalogu_durumu',
  ARRAY[]::text[],
  'katalog durumu RPCsi vardir'
);
SELECT has_function(
  'public',
  'stok_baslangic_katalogunu_kur',
  ARRAY['text'],
  'idempotent katalog kurulum RPCsi vardir'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'public.stok_baslangic_katalogu_sablonu',
    'SELECT'
  ),
  'authenticated rolu ic sablonu dogrudan okuyamaz'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.stok_baslangic_katalogu_durumu()'::regprocedure,
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.stok_baslangic_katalogunu_kur(text)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated rolu katalog RPC sinirini kullanabilir'
);

SELECT is(
  (SELECT count(*)::integer FROM public.stok_baslangic_katalogu_sablonu),
  128,
  'standart katalog 128 karttan olusur'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kategori = 'cam'
  ),
  115,
  '036 katalogundaki 115 cam kartinin tamami sablondadir'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kategori = 'cita'
  ),
  9,
  'dokuz standart aluminyum cita sablondadir'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kategori = 'yan_malzeme'
  ),
  4,
  'dort standart yan malzeme sablondadir'
);

SELECT ok(
  (
    SELECT ticari_kapsam = 'maliyet_bileseni'
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kod = '01002'
  )
  AND (
    SELECT ticari_kapsam = 'satilabilir'
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kod = '10000'
  ),
  'ham cam maliyet bileseni, uretilen Isicam satilabilir urun kapsamindadir'
);

SELECT is(
  (
    SELECT array_agg(kalinlik_mm::integer ORDER BY kalinlik_mm)
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kategori = 'cita'
  ),
  ARRAY[9, 11, 12, 14, 15, 16, 18, 20, 22],
  'aluminyum cita olculeri eksiksizdir'
);
SELECT ok(
  (
    SELECT kalinlik_mm = 4
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kod = '01008'
  )
  AND (
    SELECT kalinlik_mm IS NULL AND ad = 'Renkli Cam'
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kod = '01009'
  ),
  'Buzlu Cam 4 mm, Renkli Cam genel kart olarak tanimlidir'
);
SELECT ok(
  (
    SELECT birim = 'kg' AND aktif
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kod = 'SARF-BUTIL'
  )
  AND (
    SELECT birim = 'litre' AND aktif
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kod = 'SARF-PU'
  )
  AND (
    SELECT birim = 'kg' AND aktif
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kod = 'SARF-NEM-ALICI'
  )
  AND (
    SELECT birim = 'kg' AND NOT aktif
    FROM public.stok_baslangic_katalogu_sablonu
    WHERE kod = 'SARF-THIOKOL'
  ),
  'yan malzeme birimleri ve varsayilan aktiflikleri dogrudur'
);

SELECT set_config('request.jwt.claims', '{}', true);
SELECT throws_ok(
  $$SELECT public.stok_baslangic_katalogu_durumu()$$,
  '42501',
  'INVENTORY_READ_YETKISI_GEREKLI',
  'oturumsuz katalog durumu okunamaz'
);
SELECT throws_ok(
  $$SELECT public.stok_baslangic_katalogunu_kur('pgtap-katalog-anon')$$,
  '42501',
  'INVENTORY_CREATE_YETKISI_GEREKLI',
  'oturumsuz katalog kurulamaz'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '97000000-0000-4000-8000-000000000001',
  'stok-baslangic-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);
UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '97000000-0000-4000-8000-000000000001';

INSERT INTO auth.sessions(id, user_id, created_at, updated_at)
VALUES (
  '97000000-0000-4000-8000-000000000002',
  '97000000-0000-4000-8000-000000000001',
  now(),
  now()
);
INSERT INTO public.user_devices (
  id, auth_user_id, client_device_id, auto_display_name,
  device_type, os_family, browser_family
)
VALUES (
  '97000000-0000-4000-8000-000000000003',
  '97000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000004',
  'Stok baslangic katalogu pgTAP',
  'desktop',
  'Windows',
  'Chrome'
);
INSERT INTO public.user_device_sessions (
  auth_user_id, device_id, auth_session_id, signed_in_at
)
VALUES (
  '97000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000003',
  '97000000-0000-4000-8000-000000000002',
  now()
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"97000000-0000-4000-8000-000000000002"}',
  true
);

SELECT throws_ok(
  $$SELECT public.stok_baslangic_katalogu_durumu()$$,
  '42501',
  'INVENTORY_READ_YETKISI_GEREKLI',
  'inventory read izni olmayan kullanici durumu okuyamaz'
);
SELECT throws_ok(
  $$SELECT public.stok_baslangic_katalogunu_kur('pgtap-katalog-yetkisiz')$$,
  '42501',
  'INVENTORY_CREATE_YETKISI_GEREKLI',
  'inventory create izni olmayan kullanici katalog kuramaz'
);

INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '97000000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

SELECT lives_ok(
  $$SELECT public.stok_baslangic_katalogu_durumu()$$,
  'inventory read izni olan kullanici katalog durumunu okuyabilir'
);

-- Teste ozel iki sablon satiri transaction sonunda geri alinir. Biri eksik kart
-- kurulumunu, digeri ayni kodda kullanici kartini koruma davranisini sabitler.
INSERT INTO public.stok_baslangic_katalogu_sablonu (
  kod, ad, kategori, grup, kalinlik_mm, birim, aktif
)
VALUES
  (
    'PGTAP-KATALOG-EKLENECEK',
    'PgTAP Eklenecek Sarf',
    'yan_malzeme',
    'PGTAP',
    null,
    'kg',
    true
  ),
  (
    'PGTAP-KATALOG-CAKISMA',
    'PgTAP Sablon Adi',
    'yan_malzeme',
    'PGTAP',
    null,
    'kg',
    true
  );

INSERT INTO public.stok (
  kod, ad, kategori, grup, kalinlik_mm, birim, aktif
)
VALUES (
  'PGTAP-KATALOG-CAKISMA',
  'Kullanicinin Korunacak Adi',
  'yan_malzeme',
  'KULLANICI',
  null,
  'kg',
  true
);

INSERT INTO public.stok (
  id, kod, ad, kategori, grup, birim, aktif
)
VALUES (
  '97000000-0000-4000-8000-000000000010',
  'PGTAP-IS-VERISI',
  'Korunacak Is Verisi',
  'yan_malzeme',
  'TEST',
  'kg',
  true
);
INSERT INTO public.stok_hareketleri (
  stok_id, hareket_turu, miktar, birim, aciklama, kaynak_turu, idempotency_key
)
VALUES (
  '97000000-0000-4000-8000-000000000010',
  'devir_girisi',
  3,
  'kg',
  'Korunacak is verisi',
  'sistem_devir',
  'pgtap-katalog-is-verisi'
);

CREATE TEMP TABLE pgtap_katalog_ilk_sonuc AS
SELECT public.stok_baslangic_katalogunu_kur(
  'pgtap-katalog-kurulum-1'
) AS sonuc;

SELECT is(
  (SELECT sonuc ->> 'basarili' FROM pgtap_katalog_ilk_sonuc),
  'true',
  'katalog kurulumu basarili sonuc doner'
);
SELECT ok(
  (SELECT (sonuc ->> 'eklenen')::integer >= 1 FROM pgtap_katalog_ilk_sonuc),
  'eksik test karti kurulumda eklenir'
);
SELECT is(
  (
    SELECT ticari_kapsam::text
    FROM public.stok
    WHERE kod = 'PGTAP-KATALOG-EKLENECEK'
  ),
  'maliyet_bileseni',
  'kurulum yeni maliyet girdisini fiyat ekraninda gorunecek kapsamda acar'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.stok_baslangic_katalogu_sablonu sablon
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.stok stok_row
      WHERE lower(btrim(stok_row.kod)) = lower(btrim(sablon.kod))
    )
  ),
  'kurulum sonunda sablondaki tum kodlar stokta bulunur'
);
SELECT is(
  (
    SELECT ad
    FROM public.stok
    WHERE kod = 'PGTAP-KATALOG-CAKISMA'
  ),
  'Kullanicinin Korunacak Adi',
  'mevcut kullanici karti sablonla overwrite edilmez'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.stok_hareketleri
    WHERE stok_id = '97000000-0000-4000-8000-000000000010'
      AND miktar = 3
  ),
  'katalog kurulumu mevcut stok hareketini ve is verisini korur'
);
SELECT ok(
  (SELECT sonuc ?& ARRAY[
    'toplam',
    'eklenen',
    'mevcut',
    'eksik',
    'cakisan',
    'kategori_dagilimi',
    'eklenen_kategori_dagilimi'
  ] FROM pgtap_katalog_ilk_sonuc),
  'kurulum sonucu sayilari ve kategori dagilimlarini dondurur'
);
SELECT ok(
  (
    SELECT (sonuc -> 'eklenen_kategori_dagilimi') ?& ARRAY[
      'cam', 'cita', 'yan_malzeme'
    ]
    FROM pgtap_katalog_ilk_sonuc
  ),
  'eklenen kategori dagilimi tum kategorileri icerir'
);

SELECT is(
  public.stok_baslangic_katalogunu_kur('pgtap-katalog-kurulum-1'),
  (SELECT sonuc FROM pgtap_katalog_ilk_sonuc),
  'ayni idempotency anahtari ayni sonucu dondurur'
);

CREATE TEMP TABLE pgtap_katalog_ikinci_sonuc AS
SELECT public.stok_baslangic_katalogunu_kur(
  'pgtap-katalog-kurulum-2'
) AS sonuc;

SELECT is(
  (SELECT (sonuc ->> 'eklenen')::integer FROM pgtap_katalog_ikinci_sonuc),
  0,
  'yeni anahtarla tekrar kurulum yeni kart eklemez'
);
SELECT is(
  (SELECT (sonuc ->> 'eksik')::integer FROM pgtap_katalog_ikinci_sonuc),
  0,
  'tekrar kurulumdan sonra eksik kod kalmaz'
);
SELECT is(
  (SELECT (sonuc ->> 'mevcut')::integer FROM pgtap_katalog_ikinci_sonuc),
  (SELECT count(*)::integer FROM public.stok_baslangic_katalogu_sablonu),
  'tekrar kurulum tum sablon kodlarini mevcut sayar'
);

CREATE TEMP TABLE pgtap_katalog_durum AS
SELECT public.stok_baslangic_katalogu_durumu() AS sonuc;

SELECT is(
  (SELECT sonuc ->> 'kurulu' FROM pgtap_katalog_durum),
  'true',
  'tum kodlar mevcutken katalog kurulu gorunur'
);
SELECT ok(
  (SELECT (sonuc ->> 'cakisan')::integer >= 1 FROM pgtap_katalog_durum),
  'korunan farkli kullanici karti cakisma olarak raporlanir'
);
SELECT is(
  (
    SELECT (sonuc -> 'kategoriler' -> 'cita' ->> 'toplam')::integer
    FROM pgtap_katalog_durum
  ),
  9,
  'durum sonucu kategori dagilimini dogru verir'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stok
    WHERE kod = 'PGTAP-KATALOG-EKLENECEK'
  ),
  1,
  'idempotent tekrar eksik karti tek kopya tutar'
);

SELECT * FROM finish();
ROLLBACK;
