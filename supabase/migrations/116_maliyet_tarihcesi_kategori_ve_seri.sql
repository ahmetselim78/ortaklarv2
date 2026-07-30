-- Maliyet tarihcesinde kategori fallback'i, fiyat serisi ve sayfalama metadatasi.
--
-- Eski stok_alis_fiyati_tarihcesi RPC'si tedarikci detay ekranlari icin geriye
-- uyumlu kalir. Yeni panel, stok karti kategorisini ve V3 fiyat varyantini
-- kayipsiz donduren bu okuma sozlesmesini kullanir.

SET search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.stok_alis_fiyati_tarihcesi_v3(
  p_stok_id uuid DEFAULT NULL,
  p_tedarikci_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  fiyat_id uuid,
  atama_id uuid,
  stok_id uuid,
  stok_kodu text,
  stok_adi text,
  stok_kategorisi text,
  profil_turu text,
  tedarikci_id uuid,
  tedarikci_adi text,
  birim_fiyat numeric,
  para_birimi text,
  fiyat_birimi text,
  paket_miktari numeric,
  stok_ana_birimi text,
  donusum_katsayisi numeric,
  vade_gunu integer,
  fiyat_tarihi timestamptz,
  kaynak_turu text,
  kaynak_referansi text,
  durum text,
  onceki_fiyat_id uuid,
  duzeltme_nedeni text,
  aktif_donem_baslangici timestamptz,
  aktif_donem_bitisi timestamptz,
  olusturan_kullanici text,
  olusturulma_tarihi timestamptz,
  fiyat_varyanti text,
  marka text,
  fiyat_liste_kodu text,
  toplam_kayit bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('costing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COSTING_READ_YETKISI_GEREKLI';
  END IF;

  RETURN QUERY
  SELECT
    fiyat.id,
    atama.id,
    fiyat.stok_id,
    stok.kod,
    stok.ad,
    stok.kategori::text,
    profil.profil_turu,
    fiyat.tedarikci_id,
    tedarikci.ad,
    fiyat.birim_fiyat,
    fiyat.para_birimi::text,
    fiyat.fiyat_birimi,
    fiyat.paket_miktari,
    fiyat.stok_ana_birimi,
    fiyat.donusum_katsayisi,
    fiyat.vade_gunu,
    fiyat.fiyat_tarihi,
    fiyat.kaynak_turu,
    fiyat.kaynak_referansi,
    fiyat.durum,
    fiyat.onceki_fiyat_id,
    fiyat.duzeltme_nedeni,
    lower(atama.gecerlilik_donemi),
    CASE
      WHEN upper_inf(atama.gecerlilik_donemi) THEN NULL
      ELSE upper(atama.gecerlilik_donemi)
    END,
    COALESCE(NULLIF(kullanici.display_name, ''), kullanici.username, 'Sistem'),
    fiyat.created_at,
    fiyat.fiyat_varyanti,
    fiyat.marka,
    fiyat.fiyat_liste_kodu,
    count(*) OVER ()
  FROM public.stok_alis_fiyatlari fiyat
  JOIN public.stok stok ON stok.id = fiyat.stok_id
  LEFT JOIN public.cari tedarikci ON tedarikci.id = fiyat.tedarikci_id
  LEFT JOIN public.app_users kullanici
    ON kullanici.auth_user_id = fiyat.olusturan_kullanici_id
  LEFT JOIN LATERAL (
    SELECT p.profil_turu
    FROM public.stok_maliyet_profilleri p
    WHERE p.stok_id = fiyat.stok_id
      AND p.gecerlilik_donemi @>
        (fiyat.fiyat_tarihi AT TIME ZONE 'Europe/Istanbul')::date
    ORDER BY lower(p.gecerlilik_donemi) DESC, p.revision_no DESC, p.id DESC
    LIMIT 1
  ) profil ON true
  LEFT JOIN LATERAL (
    SELECT a.id, a.gecerlilik_donemi
    FROM public.stok_maliyet_kaynagi_atamalari a
    WHERE a.fiyat_id = fiyat.id
    ORDER BY lower(a.gecerlilik_donemi) DESC, a.created_at DESC, a.id DESC
    LIMIT 1
  ) atama ON true
  WHERE (p_stok_id IS NULL OR fiyat.stok_id = p_stok_id)
    AND (p_tedarikci_id IS NULL OR fiyat.tedarikci_id = p_tedarikci_id)
  ORDER BY fiyat.fiyat_tarihi DESC, fiyat.created_at DESC, fiyat.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
END;
$$;

REVOKE ALL ON FUNCTION public.stok_alis_fiyati_tarihcesi_v3(uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stok_alis_fiyati_tarihcesi_v3(uuid, uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.stok_alis_fiyati_tarihcesi_v3(uuid, uuid, integer)
  IS 'Stok kategorisi, fiyat varyanti ve toplam kayit metadatasi ile append-only alis fiyati tarihcesini dondurur.';
