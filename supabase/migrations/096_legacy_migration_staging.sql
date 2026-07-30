-- 096 - Eski maliyet kayıtlarını stok kartlarıyla güvenli eşleştirme staging'i

SET search_path = public, extensions, pg_catalog;

CREATE TABLE IF NOT EXISTS public.maliyet_legacy_eslestirmeleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kaynak_tablo text NOT NULL CHECK (
    kaynak_tablo IN (
      'maliyet_cam_hammaddeleri',
      'maliyet_citalari',
      'maliyet_sarf_malzemeleri',
      'maliyet_alis_fiyatlari'
    )
  ),
  kaynak_kayit_id uuid NOT NULL,
  hedef_stok_id uuid REFERENCES public.stok(id) ON DELETE RESTRICT,
  eslestirme_yontemi text NOT NULL,
  eslestirme_puani numeric(5,2) NOT NULL CHECK (
    eslestirme_puani >= 0 AND eslestirme_puani <= 100
  ),
  sonuc text NOT NULL CHECK (
    sonuc IN (
      'kesin_eslesme',
      'yuksek_guvenli_eslesme',
      'birden_fazla_aday',
      'birim_uyusmazligi',
      'kategori_uyusmazligi',
      'tedarikci_eksik',
      'stok_bulunamadi'
    )
  ),
  otomatik boolean NOT NULL DEFAULT true,
  onay_durumu text NOT NULL DEFAULT 'bekliyor'
    CHECK (onay_durumu IN ('bekliyor', 'onaylandi', 'reddedildi')),
  adaylar jsonb NOT NULL DEFAULT '[]'::jsonb,
  kaynak_veri jsonb NOT NULL,
  onaylayan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  onay_tarihi timestamptz,
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kaynak_tablo, kaynak_kayit_id),
  CHECK (
    (onay_durumu = 'bekliyor'
      AND onaylayan_kullanici_id IS NULL
      AND onay_tarihi IS NULL)
    OR
    (onay_durumu = 'onaylandi'
      AND otomatik
      AND onaylayan_kullanici_id IS NULL
      AND onay_tarihi IS NULL)
    OR
    (onay_durumu IN ('onaylandi', 'reddedildi')
      AND NOT otomatik
      AND onaylayan_kullanici_id IS NOT NULL
      AND onay_tarihi IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS maliyet_legacy_eslestirme_sonuc_idx
  ON public.maliyet_legacy_eslestirmeleri(sonuc, onay_durumu, created_at DESC);
CREATE INDEX IF NOT EXISTS maliyet_legacy_eslestirme_stok_idx
  ON public.maliyet_legacy_eslestirmeleri(hedef_stok_id)
  WHERE hedef_stok_id IS NOT NULL;

INSERT INTO public.stok_maliyet_yapi_surmleri (
  stok_id,
  katman_yapisi,
  gecerlilik_donemi,
  revision_no,
  aciklama
)
SELECT
  stok.id,
  stok.katman_yapisi,
  daterange(DATE '2000-01-01', NULL, '[)'),
  1,
  '096 legacy stok katman yapısı başlangıç sürümü'
FROM public.stok
WHERE stok.katman_yapisi IS NOT NULL
  AND stok.katman_yapisi ~ '^[0-9]+([.][0-9]+)?([+][0-9]+([.][0-9]+)?)+$'
  AND NOT EXISTS (
    SELECT 1 FROM public.stok_maliyet_yapi_surmleri surum
    WHERE surum.stok_id = stok.id
  );

WITH kaynak AS (
  SELECT
    cam.id,
    to_jsonb(cam) AS kaynak_veri,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('stok_id', aday.id, 'kod', aday.kod, 'ad', aday.ad)
          ORDER BY aday.kod
        )
        FROM public.stok aday
        WHERE aday.aktif
          AND aday.kategori = 'cam'
          AND aday.katman_yapisi IS NULL
          AND aday.kalinlik_mm = cam.kalinlik_mm
          AND (
            lower(COALESCE(aday.grup, '') || ' ' || aday.ad) LIKE '%' || cam.cam_turu || '%'
            OR cam.cam_turu = 'duz'
          )
      ),
      '[]'::jsonb
    ) AS adaylar
  FROM public.maliyet_cam_hammaddeleri cam
),
deger AS (
  SELECT
    *,
    jsonb_array_length(adaylar) AS aday_sayisi,
    CASE WHEN jsonb_array_length(adaylar) = 1
      THEN (adaylar -> 0 ->> 'stok_id')::uuid END AS stok_id
  FROM kaynak
)
INSERT INTO public.maliyet_legacy_eslestirmeleri (
  kaynak_tablo, kaynak_kayit_id, hedef_stok_id, eslestirme_yontemi,
  eslestirme_puani, sonuc, otomatik, onay_durumu, adaylar, kaynak_veri
)
SELECT
  'maliyet_cam_hammaddeleri',
  id,
  stok_id,
  'kategori+kalinlik+cam_fiyat_grubu',
  CASE WHEN aday_sayisi = 1 THEN 100 WHEN aday_sayisi > 1 THEN 55 ELSE 0 END,
  CASE
    WHEN aday_sayisi = 1 THEN 'kesin_eslesme'
    WHEN aday_sayisi > 1 THEN 'birden_fazla_aday'
    ELSE 'stok_bulunamadi'
  END,
  true,
  CASE WHEN aday_sayisi = 1 THEN 'onaylandi' ELSE 'bekliyor' END,
  adaylar,
  kaynak_veri
FROM deger
ON CONFLICT (kaynak_tablo, kaynak_kayit_id) DO NOTHING;

WITH kaynak AS (
  SELECT
    cita.id,
    to_jsonb(cita) AS kaynak_veri,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('stok_id', aday.id, 'kod', aday.kod, 'ad', aday.ad)
          ORDER BY aday.kod
        )
        FROM public.stok aday
        WHERE aday.aktif
          AND aday.kategori = 'cita'
          AND aday.kalinlik_mm = cita.genislik_mm
          AND (
            lower(COALESCE(aday.grup, '') || ' ' || aday.ad) LIKE
              '%' || replace(cita.malzeme_turu, '_', ' ') || '%'
            OR cita.malzeme_turu = 'diger'
          )
      ),
      '[]'::jsonb
    ) AS adaylar
  FROM public.maliyet_citalari cita
),
deger AS (
  SELECT
    *,
    jsonb_array_length(adaylar) AS aday_sayisi,
    CASE WHEN jsonb_array_length(adaylar) = 1
      THEN (adaylar -> 0 ->> 'stok_id')::uuid END AS stok_id
  FROM kaynak
)
INSERT INTO public.maliyet_legacy_eslestirmeleri (
  kaynak_tablo, kaynak_kayit_id, hedef_stok_id, eslestirme_yontemi,
  eslestirme_puani, sonuc, otomatik, onay_durumu, adaylar, kaynak_veri
)
SELECT
  'maliyet_citalari',
  id,
  stok_id,
  'kategori+olcu+malzeme_turu',
  CASE WHEN aday_sayisi = 1 THEN 100 WHEN aday_sayisi > 1 THEN 55 ELSE 0 END,
  CASE
    WHEN aday_sayisi = 1 THEN 'kesin_eslesme'
    WHEN aday_sayisi > 1 THEN 'birden_fazla_aday'
    ELSE 'stok_bulunamadi'
  END,
  true,
  CASE WHEN aday_sayisi = 1 THEN 'onaylandi' ELSE 'bekliyor' END,
  adaylar,
  kaynak_veri
FROM deger
ON CONFLICT (kaynak_tablo, kaynak_kayit_id) DO NOTHING;

WITH kaynak AS (
  SELECT
    sarf.id,
    to_jsonb(sarf) AS kaynak_veri,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'stok_id', aday.id, 'kod', aday.kod, 'ad', aday.ad, 'birim', aday.birim
          )
          ORDER BY aday.kod
        )
        FROM public.stok aday
        WHERE aday.aktif
          AND aday.kategori = 'yan_malzeme'
          AND regexp_replace(lower(btrim(aday.ad)), '[^a-z0-9çğıöşü]+', '', 'g')
            = regexp_replace(lower(btrim(sarf.ad)), '[^a-z0-9çğıöşü]+', '', 'g')
      ),
      '[]'::jsonb
    ) AS adaylar
  FROM public.maliyet_sarf_malzemeleri sarf
),
deger AS (
  SELECT
    *,
    jsonb_array_length(adaylar) AS aday_sayisi,
    CASE WHEN jsonb_array_length(adaylar) = 1
      THEN (adaylar -> 0 ->> 'stok_id')::uuid END AS stok_id,
    CASE WHEN jsonb_array_length(adaylar) = 1
      THEN adaylar -> 0 ->> 'birim' END AS stok_birimi
  FROM kaynak
)
INSERT INTO public.maliyet_legacy_eslestirmeleri (
  kaynak_tablo, kaynak_kayit_id, hedef_stok_id, eslestirme_yontemi,
  eslestirme_puani, sonuc, otomatik, onay_durumu, adaylar, kaynak_veri
)
SELECT
  'maliyet_sarf_malzemeleri',
  id,
  CASE WHEN stok_birimi = kaynak_veri ->> 'alis_birimi' THEN stok_id END,
  'kategori+normalize_ad+birim',
  CASE
    WHEN aday_sayisi = 1 AND stok_birimi = kaynak_veri ->> 'alis_birimi' THEN 100
    WHEN aday_sayisi = 1 THEN 70
    WHEN aday_sayisi > 1 THEN 55
    ELSE 0
  END,
  CASE
    WHEN aday_sayisi = 1 AND stok_birimi <> kaynak_veri ->> 'alis_birimi'
      THEN 'birim_uyusmazligi'
    WHEN aday_sayisi = 1 THEN 'kesin_eslesme'
    WHEN aday_sayisi > 1 THEN 'birden_fazla_aday'
    ELSE 'stok_bulunamadi'
  END,
  true,
  CASE
    WHEN aday_sayisi = 1 AND stok_birimi = kaynak_veri ->> 'alis_birimi'
      THEN 'onaylandi'
    ELSE 'bekliyor'
  END,
  adaylar,
  kaynak_veri
FROM deger
ON CONFLICT (kaynak_tablo, kaynak_kayit_id) DO NOTHING;

INSERT INTO public.maliyet_legacy_eslestirmeleri (
  kaynak_tablo, kaynak_kayit_id, hedef_stok_id, eslestirme_yontemi,
  eslestirme_puani, sonuc, otomatik, onay_durumu, adaylar, kaynak_veri
)
SELECT
  'maliyet_alis_fiyatlari',
  fiyat.id,
  malzeme.hedef_stok_id,
  'kaynak_malzeme_eslestirmesi',
  CASE
    WHEN fiyat.tedarikci_id IS NULL THEN 0
    ELSE malzeme.eslestirme_puani
  END,
  CASE
    WHEN fiyat.tedarikci_id IS NULL THEN 'tedarikci_eksik'
    ELSE malzeme.sonuc
  END,
  true,
  CASE
    WHEN fiyat.tedarikci_id IS NOT NULL
      AND malzeme.onay_durumu = 'onaylandi'
      THEN 'onaylandi'
    ELSE 'bekliyor'
  END,
  malzeme.adaylar,
  to_jsonb(fiyat)
FROM public.maliyet_alis_fiyatlari fiyat
JOIN public.maliyet_legacy_eslestirmeleri malzeme
  ON malzeme.kaynak_kayit_id = CASE fiyat.malzeme_turu
    WHEN 'cam' THEN fiyat.cam_hammaddesi_id
    WHEN 'cita' THEN fiyat.cita_id
    ELSE fiyat.sarf_malzeme_id
  END
 AND malzeme.kaynak_tablo = CASE fiyat.malzeme_turu
    WHEN 'cam' THEN 'maliyet_cam_hammaddeleri'
    WHEN 'cita' THEN 'maliyet_citalari'
    ELSE 'maliyet_sarf_malzemeleri'
  END
ON CONFLICT (kaynak_tablo, kaynak_kayit_id) DO NOTHING;

UPDATE public.cari cari
SET tedarik_kapsamlari = (
  SELECT ARRAY(
    SELECT DISTINCT kapsam
    FROM unnest(
      cari.tedarik_kapsamlari
      || ARRAY(
        SELECT CASE fiyat.malzeme_turu
          WHEN 'cam' THEN 'cam'
          WHEN 'cita' THEN 'cita'
          ELSE 'yan_malzeme'
        END
        FROM public.maliyet_alis_fiyatlari fiyat
        WHERE fiyat.tedarikci_id = cari.id
      )
    ) kapsam
    ORDER BY kapsam
  )
)
WHERE cari.tipi = 'tedarikci'
  AND EXISTS (
    SELECT 1 FROM public.maliyet_alis_fiyatlari fiyat
WHERE fiyat.tedarikci_id = cari.id
  );

WITH ayar AS (
  SELECT cam_fire_orani, cita_fire_orani
  FROM public.maliyet_hesaplama_ayar_surmleri
  WHERE gecerli_baslangic <= current_date
  ORDER BY gecerli_baslangic DESC, created_at DESC
  LIMIT 1
)
INSERT INTO public.stok_maliyet_profilleri (
  stok_id, profil_turu, cam_fiyat_grubu_id, olcu_mm,
  fire_orani, fiyat_birimi, stok_ana_birimi, donusum_katsayisi,
  gecerlilik_donemi, revision_no, aciklama
)
SELECT
  eslesme.hedef_stok_id,
  'cam',
  grup.id,
  cam.kalinlik_mm,
  COALESCE(ayar.cam_fire_orani, 0),
  'm2',
  stok.birim,
  1,
  daterange(
    COALESCE(
      (
        SELECT min(fiyat.gecerli_baslangic)
        FROM public.maliyet_alis_fiyatlari fiyat
        WHERE fiyat.cam_hammaddesi_id = cam.id
      ),
      DATE '2000-01-01'
    ),
    NULL,
    '[)'
  ),
  1,
  '096 kesin legacy cam eşleşmesi'
FROM public.maliyet_legacy_eslestirmeleri eslesme
JOIN public.maliyet_cam_hammaddeleri cam
  ON cam.id = eslesme.kaynak_kayit_id
JOIN public.cam_fiyat_gruplari grup ON grup.kod = cam.cam_turu
JOIN public.stok stok ON stok.id = eslesme.hedef_stok_id
LEFT JOIN ayar ON true
WHERE eslesme.kaynak_tablo = 'maliyet_cam_hammaddeleri'
  AND eslesme.onay_durumu = 'onaylandi'
  AND NOT EXISTS (
    SELECT 1 FROM public.stok_maliyet_profilleri profil
    WHERE profil.stok_id = eslesme.hedef_stok_id
  );

WITH ayar AS (
  SELECT cita_fire_orani
  FROM public.maliyet_hesaplama_ayar_surmleri
  WHERE gecerli_baslangic <= current_date
  ORDER BY gecerli_baslangic DESC, created_at DESC
  LIMIT 1
)
INSERT INTO public.stok_maliyet_profilleri (
  stok_id, profil_turu, cita_malzeme_turu, olcu_mm,
  fire_orani, fiyat_birimi, stok_ana_birimi, donusum_katsayisi,
  gecerlilik_donemi, revision_no, aciklama
)
SELECT
  eslesme.hedef_stok_id,
  'cita',
  cita.malzeme_turu,
  cita.genislik_mm,
  COALESCE(ayar.cita_fire_orani, 0),
  'metre',
  stok.birim,
  1,
  daterange(
    COALESCE(
      (
        SELECT min(fiyat.gecerli_baslangic)
        FROM public.maliyet_alis_fiyatlari fiyat
        WHERE fiyat.cita_id = cita.id
      ),
      DATE '2000-01-01'
    ),
    NULL,
    '[)'
  ),
  1,
  '096 kesin legacy çıta eşleşmesi'
FROM public.maliyet_legacy_eslestirmeleri eslesme
JOIN public.maliyet_citalari cita ON cita.id = eslesme.kaynak_kayit_id
JOIN public.stok stok ON stok.id = eslesme.hedef_stok_id
LEFT JOIN ayar ON true
WHERE eslesme.kaynak_tablo = 'maliyet_citalari'
  AND eslesme.onay_durumu = 'onaylandi'
  AND NOT EXISTS (
    SELECT 1 FROM public.stok_maliyet_profilleri profil
    WHERE profil.stok_id = eslesme.hedef_stok_id
  );

INSERT INTO public.stok_maliyet_profilleri (
  stok_id, profil_turu, hesaplama_tipi, tuketim_katsayisi, bosluk_basi,
  fire_orani, fiyat_birimi, stok_ana_birimi, donusum_katsayisi,
  gecerlilik_donemi, revision_no, aciklama
)
SELECT
  eslesme.hedef_stok_id,
  'sarf',
  COALESCE(katsayi.hesaplama_tipi, 'sabit'),
  COALESCE(katsayi.tuketim_katsayisi, 0),
  COALESCE(katsayi.bosluk_basi, false),
  COALESCE(katsayi.fire_orani, 0),
  sarf.alis_birimi,
  stok.birim,
  1,
  daterange(
    LEAST(
      COALESCE(katsayi.gecerli_baslangic, DATE '2000-01-01'),
      COALESCE(
        (
          SELECT min(fiyat.gecerli_baslangic)
          FROM public.maliyet_alis_fiyatlari fiyat
          WHERE fiyat.sarf_malzeme_id = sarf.id
        ),
        DATE '2000-01-01'
      )
    ),
    NULL,
    '[)'
  ),
  1,
  '096 kesin legacy sarf eşleşmesi'
FROM public.maliyet_legacy_eslestirmeleri eslesme
JOIN public.maliyet_sarf_malzemeleri sarf
  ON sarf.id = eslesme.kaynak_kayit_id
JOIN public.stok stok ON stok.id = eslesme.hedef_stok_id
LEFT JOIN LATERAL (
  SELECT surum.*
  FROM public.maliyet_sarf_katsayi_surmleri surum
  WHERE surum.sarf_malzeme_id = sarf.id
    AND surum.gecerli_baslangic <= current_date
  ORDER BY surum.gecerli_baslangic DESC, surum.created_at DESC
  LIMIT 1
) katsayi ON true
WHERE eslesme.kaynak_tablo = 'maliyet_sarf_malzemeleri'
  AND eslesme.onay_durumu = 'onaylandi'
  AND NOT EXISTS (
    SELECT 1 FROM public.stok_maliyet_profilleri profil
    WHERE profil.stok_id = eslesme.hedef_stok_id
  );

INSERT INTO public.stok_alis_fiyatlari (
  stok_id, birim_fiyat, para_birimi, fiyat_birimi, stok_ana_birimi,
  donusum_katsayisi, vade_gunu, fiyat_tarihi, kaynak_turu,
  kaynak_referansi, durum
)
SELECT
  stok.id,
  stok.birim_fiyat,
  'TRY'::public.para_birimi_kodu,
  stok.birim,
  stok.birim,
  1,
  0,
  COALESCE(stok.created_at, now()),
  'legacy_unverified',
  'stok.birim_fiyat:' || stok.id::text,
  'dogrulama_bekliyor'
FROM public.stok stok
WHERE stok.birim_fiyat > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.stok_alis_fiyatlari fiyat
    WHERE fiyat.stok_id = stok.id
      AND fiyat.kaynak_turu = 'legacy_unverified'
      AND fiyat.kaynak_referansi = 'stok.birim_fiyat:' || stok.id::text
  );

INSERT INTO public.stok_alis_fiyatlari (
  stok_id, tedarikci_id, birim_fiyat, para_birimi, fiyat_birimi,
  stok_ana_birimi, donusum_katsayisi, vade_gunu, fiyat_tarihi,
  kaynak_turu, kaynak_referansi, durum
)
SELECT
  eslesme.hedef_stok_id,
  eski.tedarikci_id,
  eski.birim_fiyat,
  eski.para_birimi,
  CASE eski.malzeme_turu
    WHEN 'cam' THEN 'm2'
    WHEN 'cita' THEN 'metre'
    ELSE sarf.alis_birimi
  END,
  stok.birim,
  1,
  eski.vade_gunu,
  eski.gecerli_baslangic::timestamp AT TIME ZONE 'Europe/Istanbul',
  'legacy_verified',
  'maliyet_alis_fiyatlari:' || eski.id::text,
  'dogrulanmis'
FROM public.maliyet_alis_fiyatlari eski
JOIN public.maliyet_legacy_eslestirmeleri eslesme
  ON eslesme.kaynak_tablo = 'maliyet_alis_fiyatlari'
 AND eslesme.kaynak_kayit_id = eski.id
 AND eslesme.onay_durumu = 'onaylandi'
JOIN public.stok stok ON stok.id = eslesme.hedef_stok_id
LEFT JOIN public.maliyet_sarf_malzemeleri sarf
  ON sarf.id = eski.sarf_malzeme_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.stok_alis_fiyatlari yeni
  WHERE yeni.kaynak_referansi = 'maliyet_alis_fiyatlari:' || eski.id::text
);

COMMENT ON TABLE public.maliyet_legacy_eslestirmeleri IS
  'Kesin olmayan eski cam/çıta/sarf eşleşmelerini otomatik bağlamadan kullanıcı incelemesine sunar.';
