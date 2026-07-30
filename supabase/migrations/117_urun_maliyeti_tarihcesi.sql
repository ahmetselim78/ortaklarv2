-- 117 - Tarihsel girdilerden yeniden hesaplanan urun maliyeti zaman cizelgesi
--
-- Bu RPC bir hesap sonucu snapshot tablosu olusturmaz. Append-only recete,
-- fire, kesin fiyat secimi ve temper surumlerinin degisim gunlerini bulur;
-- her gun icin mevcut V3 motorunu sabit 1000x1000 mm olcude yeniden calistirir.
-- Boylece satirlar birbiriyle karsilastirilabilir 1 m2 maliyetleri temsil eder.

SET search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.urun_maliyeti_tarihcesi_v1(
  p_stok_id uuid,
  p_baslangic date DEFAULT NULL,
  p_bitis date DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  olay_tarihi date,
  olay_turleri text[],
  stok_id uuid,
  stok_kodu text,
  urun_adi text,
  urun_grubu text,
  gecerli boolean,
  hesaplama_surumu text,
  recete_surumu_id uuid,
  toplam_maliyet numeric,
  m2_maliyet numeric,
  cam_maliyeti numeric,
  cita_maliyeti numeric,
  sarf_maliyeti numeric,
  islem_maliyeti numeric,
  fire_etkisi numeric,
  finansman_etkisi numeric,
  kur_etkisi numeric,
  onceki_toplam_maliyet numeric,
  maliyet_farki numeric,
  maliyet_farki_yuzde numeric,
  toplam_kayit bigint,
  detay jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_bitis date := COALESCE(
    p_bitis,
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
  );
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  IF p_stok_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22004',
      MESSAGE = 'URUN_STOK_ID_GEREKLI';
  END IF;

  IF p_baslangic IS NOT NULL AND p_baslangic > v_bitis THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'MALIYET_TARIH_ARALIGI_GECERSIZ';
  END IF;

  -- Mevcut hesap motoru da yalniz aktif cam urunlerini kabul eder. Kontrolu
  -- burada yapmak, olay bulunmayan bir stokta sessiz bos listeyi engeller.
  IF NOT EXISTS (
    SELECT 1
    FROM public.stok urun
    WHERE urun.id = p_stok_id
      AND urun.aktif
      AND urun.kategori = 'cam'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'AKTIF_URUN_STOGU_BULUNAMADI';
  END IF;

  RETURN QUERY
  WITH
  sorgu_araligi AS (
    SELECT daterange(p_baslangic, v_bitis + 1, '[)') AS donem
  ),
  urun_receteleri AS (
    SELECT
      recete.id,
      recete.gecerlilik_donemi
    FROM public.stok_urun_maliyet_recete_surmleri recete
    CROSS JOIN sorgu_araligi sorgu
    WHERE recete.urun_stok_id = p_stok_id
      AND recete.gecerlilik_donemi && sorgu.donem
  ),
  recete_bilesenleri AS (
    SELECT DISTINCT
      recete.id AS recete_surumu_id,
      recete.gecerlilik_donemi AS recete_donemi,
      kalem.bilesen_stok_id
    FROM urun_receteleri recete
    JOIN public.stok_urun_maliyet_recete_kalemleri kalem
      ON kalem.recete_surumu_id = recete.id
  ),
  temper_receteleri AS (
    SELECT
      recete.id AS recete_surumu_id,
      recete.gecerlilik_donemi AS recete_donemi
    FROM urun_receteleri recete
    WHERE EXISTS (
      SELECT 1
      FROM public.stok_urun_maliyet_recete_islemleri islem
      WHERE islem.recete_surumu_id = recete.id
        AND islem.islem_turu = 'temper'
    )
  ),
  olaylar_ham AS (
    -- Reçete degisimi urunun bilesenlerini ve acik islemlerini birlikte degistirir.
    SELECT
      lower(recete.gecerlilik_donemi) AS olay_tarihi,
      'recete_baslangici'::text AS olay_turu
    FROM urun_receteleri recete
    WHERE NOT lower_inf(recete.gecerlilik_donemi)

    UNION ALL

    SELECT
      upper(recete.gecerlilik_donemi),
      'recete_bitisi'::text
    FROM urun_receteleri recete
    WHERE NOT upper_inf(recete.gecerlilik_donemi)

    UNION ALL

    -- Yalniz secili urunun herhangi bir recete surumunde kullanilan bilesenler.
    SELECT
      lower(fire.gecerlilik_donemi),
      'bilesen_fire_baslangici'::text
    FROM recete_bilesenleri bilesen
    JOIN public.stok_fire_orani_surmleri fire
      ON fire.stok_id = bilesen.bilesen_stok_id
    WHERE NOT lower_inf(fire.gecerlilik_donemi)
      AND bilesen.recete_donemi @> lower(fire.gecerlilik_donemi)

    UNION ALL

    SELECT
      upper(fire.gecerlilik_donemi),
      'bilesen_fire_bitisi'::text
    FROM recete_bilesenleri bilesen
    JOIN public.stok_fire_orani_surmleri fire
      ON fire.stok_id = bilesen.bilesen_stok_id
    WHERE NOT upper_inf(fire.gecerlilik_donemi)
      AND bilesen.recete_donemi @> upper(fire.gecerlilik_donemi)

    UNION ALL

    -- V3 motorunun kullandigi kaynak atamasi kesin fiyat_id tasiyan secimdir.
    -- Mevcut V3 motoru TRY disi fiyatlari V3_PARA_BIRIMI_DESTEKLENMIYOR ile
    -- reddeder ve vade/finansman uygulamaz. Bu nedenle doviz_kurlari veya
    -- maliyet_hesaplama_ayar_surmleri degisimleri bu zaman cizelgesinde maliyet
    -- olayi degildir. Cikti alanlari motor ileride bu izleri dondururse kayipsiz
    -- tasiyacak, mevcut motor icin sifir donecektir.
    SELECT
      (
        lower(secim.gecerlilik_donemi)
          AT TIME ZONE 'Europe/Istanbul'
      )::date,
      'bilesen_kaynak_baslangici'::text
    FROM recete_bilesenleri bilesen
    JOIN public.stok_maliyet_fiyat_secim_surmleri secim
      ON secim.stok_id = bilesen.bilesen_stok_id
    WHERE NOT lower_inf(secim.gecerlilik_donemi)
      AND bilesen.recete_donemi @> (
        lower(secim.gecerlilik_donemi)
          AT TIME ZONE 'Europe/Istanbul'
      )::date

    UNION ALL

    SELECT
      (
        upper(secim.gecerlilik_donemi)
          AT TIME ZONE 'Europe/Istanbul'
      )::date,
      'bilesen_kaynak_bitisi'::text
    FROM recete_bilesenleri bilesen
    JOIN public.stok_maliyet_fiyat_secim_surmleri secim
      ON secim.stok_id = bilesen.bilesen_stok_id
    WHERE NOT upper_inf(secim.gecerlilik_donemi)
      AND bilesen.recete_donemi @> (
        upper(secim.gecerlilik_donemi)
          AT TIME ZONE 'Europe/Istanbul'
      )::date

    UNION ALL

    -- Temper modu globaldir; yalniz temper islemi bulunan recete donemlerinde
    -- urun maliyetini etkileyebilir.
    SELECT
      lower(mod_surumu.gecerlilik_donemi),
      'temper_modu_baslangici'::text
    FROM temper_receteleri recete
    JOIN public.temper_maliyet_modu_surmleri mod_surumu
      ON NOT lower_inf(mod_surumu.gecerlilik_donemi)
     AND recete.recete_donemi @> lower(mod_surumu.gecerlilik_donemi)

    UNION ALL

    SELECT
      upper(mod_surumu.gecerlilik_donemi),
      'temper_modu_bitisi'::text
    FROM temper_receteleri recete
    JOIN public.temper_maliyet_modu_surmleri mod_surumu
      ON NOT upper_inf(mod_surumu.gecerlilik_donemi)
     AND recete.recete_donemi @> upper(mod_surumu.gecerlilik_donemi)

    UNION ALL

    -- Genel temper secimi ile yalniz bu urune ait override ayni zaman
    -- cizelgesine dahildir; diger urunlerin override'lari dahil edilmez.
    SELECT
      (
        lower(secim.gecerlilik_donemi)
          AT TIME ZONE 'Europe/Istanbul'
      )::date,
      'temper_fiyat_baslangici'::text
    FROM temper_receteleri recete
    JOIN public.temper_dis_hizmet_fiyat_secim_surmleri secim
      ON (secim.urun_stok_id IS NULL OR secim.urun_stok_id = p_stok_id)
     AND NOT lower_inf(secim.gecerlilik_donemi)
     AND recete.recete_donemi @> (
       lower(secim.gecerlilik_donemi)
         AT TIME ZONE 'Europe/Istanbul'
     )::date

    UNION ALL

    SELECT
      (
        upper(secim.gecerlilik_donemi)
          AT TIME ZONE 'Europe/Istanbul'
      )::date,
      'temper_fiyat_bitisi'::text
    FROM temper_receteleri recete
    JOIN public.temper_dis_hizmet_fiyat_secim_surmleri secim
      ON (secim.urun_stok_id IS NULL OR secim.urun_stok_id = p_stok_id)
     AND NOT upper_inf(secim.gecerlilik_donemi)
     AND recete.recete_donemi @> (
       upper(secim.gecerlilik_donemi)
         AT TIME ZONE 'Europe/Istanbul'
     )::date

    UNION ALL

    -- Aralik icinde kaynak olayi olmasa bile baslangic ve bitis durumlari
    -- gorulebilsin. Varsayilan bitis bugundur.
    SELECT p_baslangic, 'sorgu_baslangici'::text
    WHERE p_baslangic IS NOT NULL

    UNION ALL

    SELECT v_bitis, 'sorgu_bitisi'::text
  ),
  olaylar AS (
    SELECT
      olay.olay_tarihi,
      array_agg(DISTINCT olay.olay_turu ORDER BY olay.olay_turu) AS olay_turleri
    FROM olaylar_ham olay
    WHERE olay.olay_tarihi IS NOT NULL
      AND (p_baslangic IS NULL OR olay.olay_tarihi >= p_baslangic)
      AND olay.olay_tarihi <= v_bitis
    GROUP BY olay.olay_tarihi
  ),
  sinirli_olaylar AS (
    SELECT
      olay.olay_tarihi,
      olay.olay_turleri,
      count(*) OVER () AS toplam_kayit
    FROM olaylar olay
    ORDER BY olay.olay_tarihi DESC
    -- En eski gorunen satirin da gercek onceki maliyeti bulunabilsin diye
    -- ekranda gosterilecek limitin bir onceki olayini da hesapla.
    LIMIT v_limit + 1
  ),
  hesaplanan_ham AS (
    SELECT
      olay.olay_tarihi,
      olay.olay_turleri,
      olay.toplam_kayit,
      public.urun_maliyeti_detayli_hesapla_v3(
        p_stok_id,
        olay.olay_tarihi,
        1000,
        1000
      ) AS detay
    FROM sinirli_olaylar olay
  ),
  hesaplanan AS (
    SELECT
      ham.*,
      COALESCE((ham.detay ->> 'gecerli')::boolean, false) AS gecerli,
      NULLIF(ham.detay ->> 'toplam_maliyet', '')::numeric AS toplam_maliyet
    FROM hesaplanan_ham ham
  ),
  sirali AS (
    SELECT
      hesap.*,
      lag(hesap.toplam_maliyet) OVER (
        ORDER BY hesap.olay_tarihi
      ) AS onceki_toplam_maliyet
    FROM hesaplanan hesap
  ),
  gosterilecek AS (
    SELECT
      sirali.*,
      row_number() OVER (
        ORDER BY sirali.olay_tarihi DESC
      ) AS gosterim_sirasi
    FROM sirali
  )
  SELECT
    sonuc.olay_tarihi,
    sonuc.olay_turleri,
    urun.id,
    urun.kod,
    urun.ad,
    urun.grup::text,
    sonuc.gecerli,
    sonuc.detay ->> 'hesaplama_surumu',
    NULLIF(sonuc.detay ->> 'recete_surumu_id', '')::uuid,
    sonuc.toplam_maliyet,
    NULLIF(sonuc.detay ->> 'm2_maliyet', '')::numeric,
    NULLIF(sonuc.detay ->> 'cam_maliyeti', '')::numeric,
    NULLIF(sonuc.detay ->> 'cita_maliyeti', '')::numeric,
    NULLIF(sonuc.detay ->> 'sarf_maliyeti', '')::numeric,
    COALESCE(NULLIF(sonuc.detay ->> 'islem_maliyeti', '')::numeric, 0),
    NULLIF(sonuc.detay ->> 'fire_etkisi', '')::numeric,
    COALESCE(
      NULLIF(
        COALESCE(
          sonuc.detay ->> 'finansman_etkisi',
          sonuc.detay ->> 'vade_etkisi'
        ),
        ''
      )::numeric,
      0
    ),
    COALESCE(NULLIF(sonuc.detay ->> 'kur_etkisi', '')::numeric, 0),
    sonuc.onceki_toplam_maliyet,
    CASE
      WHEN sonuc.toplam_maliyet IS NULL
        OR sonuc.onceki_toplam_maliyet IS NULL THEN NULL
      ELSE round(sonuc.toplam_maliyet - sonuc.onceki_toplam_maliyet, 2)
    END,
    CASE
      WHEN sonuc.toplam_maliyet IS NULL
        OR sonuc.onceki_toplam_maliyet IS NULL
        OR sonuc.onceki_toplam_maliyet = 0 THEN NULL
      ELSE round(
        (
          sonuc.toplam_maliyet - sonuc.onceki_toplam_maliyet
        ) * 100 / sonuc.onceki_toplam_maliyet,
        4
      )
    END,
    sonuc.toplam_kayit,
    sonuc.detay
  FROM gosterilecek sonuc
  JOIN public.stok urun ON urun.id = p_stok_id
  WHERE sonuc.gosterim_sirasi <= v_limit
  ORDER BY sonuc.olay_tarihi DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.urun_maliyeti_tarihcesi_v1(
  uuid, date, date, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.urun_maliyeti_tarihcesi_v1(
  uuid, date, date, integer
) TO authenticated;

COMMENT ON FUNCTION public.urun_maliyeti_tarihcesi_v1(
  uuid, date, date, integer
) IS
  'Secili urunun recete, bilesen fire/kaynak ve temper olay gunlerinde mevcut V3 motoruyla 1000x1000 mm yeniden hesaplanan maliyet zaman cizelgesi; sonuc snapshoti degildir.';
