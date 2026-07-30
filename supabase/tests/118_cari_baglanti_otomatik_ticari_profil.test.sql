BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(14);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '98100000-0000-4000-8000-000000000001',
  'cari-baglanti-v118-pgtap@example.test',
  '{}'::jsonb,
  now(),
  now()
);

UPDATE public.app_users
SET is_active = true,
    must_change_password = false
WHERE auth_user_id = '98100000-0000-4000-8000-000000000001';

INSERT INTO public.user_roles(auth_user_id, role_id)
VALUES (
  '98100000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (auth_user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"98100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);

INSERT INTO public.cari (id, kod, ad, tipi, aktif)
VALUES (
  '98100000-0000-4000-8000-000000000010',
  'PGTAP-BAGLANTI-V118',
  'pgTAP Profilsiz Bağlantı Müşterisi',
  'musteri',
  true
);

INSERT INTO public.kdv_gruplari (id, kod, ad, aktif, olusturan_kullanici_id)
VALUES (
  '98100000-0000-4000-8000-000000000020',
  'PGTAP-KDV-V118',
  'pgTAP KDV %20',
  true,
  '98100000-0000-4000-8000-000000000001'
)
ON CONFLICT (kod) DO NOTHING;

INSERT INTO public.stok (
  id, kod, ad, kategori, birim, aktif, ticari_kapsam
)
SELECT
  '98100000-0000-4000-8000-000000000030',
  'PGTAP-CAM-V118',
  'pgTAP Cam V118',
  'cam',
  'm2',
  true,
  'satilabilir'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stok
  WHERE kategori = 'cam'
    AND aktif
    AND ticari_kapsam IN ('satilabilir', 'her_ikisi')
);

CREATE TEMP TABLE v118_hazirlik AS
SELECT public.cari_baglanti_hazirlik_getir(
  '98100000-0000-4000-8000-000000000010'
) AS veri;

SELECT is(
  (SELECT veri ->> 'ticari_profil_durumu' FROM v118_hazirlik),
  'baglanti_ile_olusturulacak',
  'profilsiz müşteri bağlantı içinde otomatik hazırlanacak olarak bildirilir'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements((SELECT veri -> 'fiyatlar' FROM v118_hazirlik)) fiyat
    WHERE fiyat ->> 'kdv_grubu_id' IS NULL
  ),
  'aktif bir KDV grubu varsa hazırlıktaki bütün camlara varsayılan atanır'
);

CREATE TEMP TABLE v118_taslak AS
SELECT public.cari_baglanti_taslak_kaydet(
  jsonb_build_object(
    'cari_id', '98100000-0000-4000-8000-000000000010',
    'para_birimi', 'TRY',
    'on_odeme_tutari', '25000',
    'odeme_tarihi', (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
    'odeme_yontemi', 'havale',
    'aciklama', 'pgTAP profilsiz bağlantı',
    'fiyatlar', (
      SELECT jsonb_agg(jsonb_build_object(
        'stok_id', stok.id,
        'birim_fiyat', 125.50,
        'kdv_grubu_id', (
          SELECT id
          FROM public.kdv_gruplari
          WHERE aktif
          ORDER BY CASE WHEN kod = 'PGTAP-KDV-V118' THEN 0 ELSE 1 END, kod
          LIMIT 1
        )
      ))
      FROM public.stok stok
      WHERE stok.kategori = 'cam'
        AND stok.aktif
        AND stok.ticari_kapsam IN ('satilabilir', 'her_ikisi')
    )
  )
) AS veri;

SELECT is(
  (SELECT veri ->> 'basarili' FROM v118_taslak),
  'true',
  'yayımlanmış profili olmayan müşteri için bağlantı taslağı kaydedilir'
);

SELECT is(
  (SELECT veri ->> 'ticari_profil_otomatik_hazirlanacak' FROM v118_taslak),
  'true',
  'taslak sonucu profil hazırlığının yetkili onayda yapılacağını bildirir'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.musteri_ticari_profilleri profil
    JOIN public.musteri_ticari_profil_surmleri surum
      ON surum.musteri_ticari_profili_id = profil.id
    WHERE profil.cari_id = '98100000-0000-4000-8000-000000000010'
      AND surum.durum = 'yayinda'
  ),
  0,
  'taslak kaydı ticari profili erken yayımlamaz'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.fiyat_listeleri
    WHERE kod = 'BAGLANTI-ANA'
      AND tur = 'ana'
      AND aktif
  ),
  'temiz kurulum için yapısal bağlantı ana listesi hazırlanır'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.fiyat_listesi_surmleri surum
    JOIN public.fiyat_listeleri liste ON liste.id = surum.fiyat_listesi_id
    WHERE liste.kod = 'BAGLANTI-ANA'
      AND surum.durum = 'yayinda'
  ),
  0,
  'ana liste sürümü taslak kaydında yayımlanmaz'
);

CREATE TEMP TABLE v118_onay AS
SELECT public.cari_baglanti_onayla(
  (SELECT (veri ->> 'baglanti_id')::uuid FROM v118_taslak),
  1,
  'v118-profilsiz-baglanti-onayi'
) AS veri;

SELECT is(
  (SELECT veri ->> 'basarili' FROM v118_onay),
  'true',
  'yetkili onay profilsiz bağlantıyı atomik olarak tamamlar'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.musteri_ticari_profilleri profil
    JOIN public.musteri_ticari_profil_surmleri surum
      ON surum.musteri_ticari_profili_id = profil.id
    WHERE profil.cari_id = '98100000-0000-4000-8000-000000000010'
      AND profil.aktif
      AND surum.durum = 'yayinda'
  ),
  'otomatik profil aktif ve yayımdadır'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.fiyat_listesi_surmleri surum
    JOIN public.fiyat_listeleri liste ON liste.id = surum.fiyat_listesi_id
    WHERE liste.kod = 'BAGLANTI-ANA'
      AND surum.durum = 'yayinda'
  ),
  'ana liste sürümü yalnız yetkili onay adımında yayımlanır'
);

SELECT is(
  (
    SELECT durum::text
    FROM public.fiyat_listesi_surmleri
    WHERE id = (
      SELECT (veri ->> 'fiyat_listesi_surumu_id')::uuid
      FROM v118_taslak
    )
  ),
  'yayinda',
  'onaylanan ilk bağlantının arşivlenen fiyat sürümü etkin olarak yayına alınır'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.fiyat_listesi_urun_kalemleri kalem
    JOIN public.fiyat_listesi_surmleri surum
      ON surum.id = kalem.fiyat_listesi_surumu_id
    JOIN public.fiyat_listeleri liste
      ON liste.id = surum.fiyat_listesi_id
    WHERE liste.kod = 'BAGLANTI-ANA'
      AND surum.durum = 'yayinda'
  ),
  (
    SELECT jsonb_array_length(veri -> 'fiyatlar')
    FROM v118_hazirlik
  ),
  'otomatik ana liste eksiksiz cam fiyat kümesini taşır'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.cari_baglanti_profili_listeye_bagla(uuid,uuid)',
    'EXECUTE'
  ),
  'profil hazırlama yardımcısı dışarıdan doğrudan çağrılamaz'
);

SELECT ok(
  position(
    'EKSIK_MUSTERI_TICARI_PROFILI'
    IN pg_get_functiondef('public.cari_baglanti_taslak_kaydet(jsonb)'::regprocedure)
  ) = 0,
  'taslak kaydı artık yayımlanmış profil ön koşuluna bağlı değildir'
);

SELECT * FROM finish();
ROLLBACK;
