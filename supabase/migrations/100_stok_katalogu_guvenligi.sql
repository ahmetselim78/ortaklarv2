-- 100 — Stok kataloğu: tek sorguda kullanım özeti, izin kontrollü yazma RPC'leri
-- ve dış referans alan kartlarda kimlik/teknik alan kilidi.

CREATE UNIQUE INDEX IF NOT EXISTS stok_kod_buyuk_kucuk_harf_benzersiz_idx
  ON public.stok (lower(btrim(kod)));

CREATE INDEX IF NOT EXISTS siparis_detaylari_stok_kullanim_idx
  ON public.siparis_detaylari(stok_id) WHERE stok_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS siparis_detaylari_cita_stok_kullanim_idx
  ON public.siparis_detaylari(cita_stok_id) WHERE cita_stok_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.stok_kullanim_ozeti_internal(p_stok_id uuid DEFAULT NULL)
RETURNS TABLE(stok_id uuid, alan text, adet bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH kullanimlar AS (
    SELECT detay.stok_id, 'siparis'::text AS alan, count(*)::bigint AS adet
    FROM public.siparis_detaylari detay
    WHERE detay.stok_id IS NOT NULL
      AND (p_stok_id IS NULL OR detay.stok_id = p_stok_id)
    GROUP BY detay.stok_id

    UNION ALL
    SELECT detay.cita_stok_id, 'cita_referansi', count(*)::bigint
    FROM public.siparis_detaylari detay
    WHERE detay.cita_stok_id IS NOT NULL
      AND (p_stok_id IS NULL OR detay.cita_stok_id = p_stok_id)
    GROUP BY detay.cita_stok_id

    UNION ALL
    SELECT snapshot.stok_id, 'siparis_fiyat_snapshoti', count(*)::bigint
    FROM public.siparis_detay_fiyat_snapshotlari snapshot
    WHERE p_stok_id IS NULL OR snapshot.stok_id = p_stok_id
    GROUP BY snapshot.stok_id

    UNION ALL
    SELECT detay.stok_id, 'teklif', count(*)::bigint
    FROM public.teklif_detaylari detay
    WHERE p_stok_id IS NULL OR detay.stok_id = p_stok_id
    GROUP BY detay.stok_id

    UNION ALL
    SELECT kalem.stok_id, 'satis_fiyati', count(*)::bigint
    FROM public.fiyat_listesi_urun_kalemleri kalem
    WHERE kalem.stok_id IS NOT NULL
      AND (p_stok_id IS NULL OR kalem.stok_id = p_stok_id)
    GROUP BY kalem.stok_id

    UNION ALL
    SELECT recete.stok_id, 'recete', count(*)::bigint
    FROM public.urun_maliyet_receteleri recete
    WHERE p_stok_id IS NULL OR recete.stok_id = p_stok_id
    GROUP BY recete.stok_id

    UNION ALL
    SELECT kalem.ham_stok_id, 'recete_bileseni', count(*)::bigint
    FROM public.urun_maliyet_recete_kalemleri kalem
    WHERE kalem.ham_stok_id IS NOT NULL
      AND (p_stok_id IS NULL OR kalem.ham_stok_id = p_stok_id)
    GROUP BY kalem.ham_stok_id

    UNION ALL
    SELECT kalem.stok_id, 'maliyet_tarifesi', count(*)::bigint
    FROM public.maliyet_stok_kalemleri kalem
    WHERE p_stok_id IS NULL OR kalem.stok_id = p_stok_id
    GROUP BY kalem.stok_id

    UNION ALL
    SELECT profil.stok_id, 'maliyet_profili', count(*)::bigint
    FROM public.stok_maliyet_profilleri profil
    WHERE p_stok_id IS NULL OR profil.stok_id = p_stok_id
    GROUP BY profil.stok_id

    UNION ALL
    SELECT atama.stok_id, 'maliyet_kaynagi', count(*)::bigint
    FROM public.stok_maliyet_kaynagi_atamalari atama
    WHERE p_stok_id IS NULL OR atama.stok_id = p_stok_id
    GROUP BY atama.stok_id

    UNION ALL
    SELECT esleme.stok_id, 'tedarik_baglantisi', count(*)::bigint
    FROM public.cam_tedarik_baglanti_kalem_stoklari esleme
    WHERE p_stok_id IS NULL OR esleme.stok_id = p_stok_id
    GROUP BY esleme.stok_id

    UNION ALL
    SELECT fiyat.stok_id, 'alis_fiyati', count(*)::bigint
    FROM public.stok_alis_fiyatlari fiyat
    WHERE p_stok_id IS NULL OR fiyat.stok_id = p_stok_id
    GROUP BY fiyat.stok_id

    UNION ALL
    SELECT esleme.hedef_stok_id, 'legacy_eslestirme', count(*)::bigint
    FROM public.maliyet_legacy_eslestirmeleri esleme
    WHERE esleme.hedef_stok_id IS NOT NULL
      AND (p_stok_id IS NULL OR esleme.hedef_stok_id = p_stok_id)
    GROUP BY esleme.hedef_stok_id
  )
  SELECT kullanimlar.stok_id, kullanimlar.alan, sum(kullanimlar.adet)::bigint
  FROM kullanimlar
  GROUP BY kullanimlar.stok_id, kullanimlar.alan
  HAVING sum(kullanimlar.adet) > 0
$$;

CREATE OR REPLACE FUNCTION public.stok_kullanim_ozeti(p_stok_id uuid)
RETURNS TABLE(alan text, adet bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_READ_YETKISI_GEREKLI';
  END IF;

  RETURN QUERY
  SELECT ozet.alan, ozet.adet
  FROM public.stok_kullanim_ozeti_internal(p_stok_id) ozet
  ORDER BY ozet.alan;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_katalogu_getir()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_READ_YETKISI_GEREKLI';
  END IF;

  RETURN QUERY
  SELECT to_jsonb(stok_row)
    || jsonb_build_object(
      'tedarikci_ad', cari.ad,
      'kullaniliyor', COALESCE(kullanim.toplam, 0) > 0,
      'kullanimlar', COALESCE(kullanim.detay, '[]'::jsonb)
    )
  FROM public.stok stok_row
  LEFT JOIN public.cari cari ON cari.id = stok_row.tedarikci_id
  LEFT JOIN LATERAL (
    SELECT
      sum(ozet.adet)::bigint AS toplam,
      jsonb_agg(
        jsonb_build_object('alan', ozet.alan, 'adet', ozet.adet)
        ORDER BY ozet.alan
      ) AS detay
    FROM public.stok_kullanim_ozeti_internal(stok_row.id) ozet
  ) kullanim ON true
  ORDER BY stok_row.kategori, stok_row.grup NULLS LAST, stok_row.kod;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_karti_payload_dogrula(
  p_payload jsonb,
  p_stok_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kod text := btrim(COALESCE(p_payload ->> 'kod', ''));
  v_ad text := btrim(COALESCE(p_payload ->> 'ad', ''));
  v_kategori text := p_payload ->> 'kategori';
  v_grup text := NULLIF(btrim(COALESCE(p_payload ->> 'grup', '')), '');
  v_katman text := NULLIF(btrim(COALESCE(p_payload ->> 'katman_yapisi', '')), '');
  v_birim text := btrim(COALESCE(p_payload ->> 'birim', ''));
  v_kalinlik numeric := NULLIF(p_payload ->> 'kalinlik_mm', '')::numeric;
BEGIN
  IF v_kod = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STOK_KODU_ZORUNLU';
  END IF;
  IF v_ad = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STOK_ADI_ZORUNLU';
  END IF;
  IF v_kategori NOT IN ('cam', 'cita', 'yan_malzeme') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STOK_KATEGORISI_GECERSIZ';
  END IF;
  IF v_birim = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STOK_BIRIMI_ZORUNLU';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.stok mevcut
    WHERE lower(btrim(mevcut.kod)) = lower(v_kod)
      AND (p_stok_id IS NULL OR mevcut.id <> p_stok_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'STOK_KODU_ZATEN_KULLANILIYOR';
  END IF;

  IF v_kategori = 'cam' THEN
    IF v_grup IS NULL OR v_birim <> 'm2' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CAM_GRUBU_VE_M2_BIRIMI_ZORUNLU';
    END IF;
    IF v_katman IS NULL AND (v_kalinlik IS NULL OR v_kalinlik <= 0) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEK_CAM_KALINLIGI_ZORUNLU';
    END IF;
    IF v_katman IS NOT NULL AND v_katman !~ '^[0-9]+([+][0-9]+){1,4}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CAM_KATMAN_YAPISI_GECERSIZ';
    END IF;
    IF v_katman IS NOT NULL AND v_kalinlik IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CAM_TURU_ALANLARI_BIRLIKTE_KULLANILAMAZ';
    END IF;
  ELSIF v_kategori = 'cita' THEN
    IF v_kalinlik IS NULL OR v_kalinlik <= 0 OR v_birim <> 'm' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CITA_BOYUTU_VE_METRE_BIRIMI_ZORUNLU';
    END IF;
    IF v_katman IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CITA_KATMAN_YAPISI_OLAMAZ';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_karti_olustur(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stok public.stok%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_CREATE_YETKISI_GEREKLI';
  END IF;
  PERFORM public.stok_karti_payload_dogrula(p_payload, NULL);

  INSERT INTO public.stok (
    kod, ad, kategori, grup, katman_yapisi, kalinlik_mm, birim, marka, aktif
  ) VALUES (
    btrim(p_payload ->> 'kod'),
    btrim(p_payload ->> 'ad'),
    p_payload ->> 'kategori',
    NULLIF(btrim(COALESCE(p_payload ->> 'grup', '')), ''),
    NULLIF(btrim(COALESCE(p_payload ->> 'katman_yapisi', '')), ''),
    NULLIF(p_payload ->> 'kalinlik_mm', '')::numeric,
    btrim(p_payload ->> 'birim'),
    NULLIF(btrim(COALESCE(p_payload ->> 'marka', '')), ''),
    true
  ) RETURNING * INTO v_stok;

  RETURN to_jsonb(v_stok);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_karti_guncelle(p_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stok public.stok%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_UPDATE_YETKISI_GEREKLI';
  END IF;

  SELECT * INTO v_stok FROM public.stok WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOK_KARTI_BULUNAMADI';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stok_kullanim_ozeti_internal(p_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'KULLANILAN_STOK_DUZENLENEMEZ';
  END IF;
  PERFORM public.stok_karti_payload_dogrula(p_payload, p_id);

  UPDATE public.stok SET
    kod = btrim(p_payload ->> 'kod'),
    ad = btrim(p_payload ->> 'ad'),
    kategori = p_payload ->> 'kategori',
    grup = NULLIF(btrim(COALESCE(p_payload ->> 'grup', '')), ''),
    katman_yapisi = NULLIF(btrim(COALESCE(p_payload ->> 'katman_yapisi', '')), ''),
    kalinlik_mm = NULLIF(p_payload ->> 'kalinlik_mm', '')::numeric,
    birim = btrim(p_payload ->> 'birim'),
    marka = NULLIF(btrim(COALESCE(p_payload ->> 'marka', '')), '')
  WHERE id = p_id
  RETURNING * INTO v_stok;

  RETURN to_jsonb(v_stok);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_aktiflik_ayarla(p_id uuid, p_aktif boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stok public.stok%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_UPDATE_YETKISI_GEREKLI';
  END IF;
  UPDATE public.stok SET aktif = p_aktif WHERE id = p_id RETURNING * INTO v_stok;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOK_KARTI_BULUNAMADI';
  END IF;
  RETURN to_jsonb(v_stok);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_karti_sil(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'delete') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_DELETE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;
  PERFORM 1 FROM public.stok WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOK_KARTI_BULUNAMADI';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stok_kullanim_ozeti_internal(p_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'KULLANILAN_STOK_SILINEMEZ';
  END IF;
  DELETE FROM public.stok WHERE id = p_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_satis_kapsami_ayarla(p_id uuid, p_etkin boolean)
RETURNS public.stok_ticari_kapsami
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mevcut public.stok_ticari_kapsami;
  v_maliyet boolean;
  v_yeni public.stok_ticari_kapsami;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_permission('pricing', 'update') OR public.has_permission('admin', 'manage')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_UPDATE_YETKISI_GEREKLI';
  END IF;
  SELECT ticari_kapsam INTO v_mevcut FROM public.stok WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOK_KARTI_BULUNAMADI'; END IF;
  v_maliyet := v_mevcut IN ('maliyet_bileseni', 'her_ikisi');
  v_yeni := CASE
    WHEN p_etkin AND v_maliyet THEN 'her_ikisi'::public.stok_ticari_kapsami
    WHEN p_etkin THEN 'satilabilir'::public.stok_ticari_kapsami
    WHEN v_maliyet THEN 'maliyet_bileseni'::public.stok_ticari_kapsami
    ELSE 'kapsam_disi'::public.stok_ticari_kapsami
  END;
  UPDATE public.stok SET
    ticari_kapsam = v_yeni,
    ticari_kapsam_dogrulandi_at = now(),
    ticari_kapsam_dogrulayan_kullanici_id = auth.uid()
  WHERE id = p_id;
  RETURN v_yeni;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_maliyet_kapsami_ayarla(p_id uuid, p_etkin boolean)
RETURNS public.stok_ticari_kapsami
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mevcut public.stok_ticari_kapsami;
  v_satis boolean;
  v_yeni public.stok_ticari_kapsami;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_permission('costing', 'update') OR public.has_permission('costing', 'manage')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COSTING_UPDATE_YETKISI_GEREKLI';
  END IF;
  SELECT ticari_kapsam INTO v_mevcut FROM public.stok WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOK_KARTI_BULUNAMADI'; END IF;
  v_satis := v_mevcut IN ('satilabilir', 'her_ikisi');
  v_yeni := CASE
    WHEN p_etkin AND v_satis THEN 'her_ikisi'::public.stok_ticari_kapsami
    WHEN p_etkin THEN 'maliyet_bileseni'::public.stok_ticari_kapsami
    WHEN v_satis THEN 'satilabilir'::public.stok_ticari_kapsami
    ELSE 'kapsam_disi'::public.stok_ticari_kapsami
  END;
  UPDATE public.stok SET ticari_kapsam = v_yeni WHERE id = p_id;
  RETURN v_yeni;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_kullanilan_karti_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kullaniliyor boolean;
BEGIN
  v_kullaniliyor := EXISTS (
    SELECT 1 FROM public.stok_kullanim_ozeti_internal(OLD.id)
  );
  IF NOT v_kullaniliyor THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'KULLANILAN_STOK_SILINEMEZ';
  END IF;

  IF OLD.kod IS DISTINCT FROM NEW.kod
     OR OLD.ad IS DISTINCT FROM NEW.ad
     OR OLD.kategori IS DISTINCT FROM NEW.kategori
     OR OLD.grup IS DISTINCT FROM NEW.grup
     OR OLD.katman_yapisi IS DISTINCT FROM NEW.katman_yapisi
     OR OLD.kalinlik_mm IS DISTINCT FROM NEW.kalinlik_mm
     OR OLD.birim IS DISTINCT FROM NEW.birim
     OR OLD.marka IS DISTINCT FROM NEW.marka THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'KULLANILAN_STOK_KIMLIGI_DEGISTIRILEMEZ';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stok_kullanilan_karti_koru_trigger ON public.stok;
CREATE TRIGGER stok_kullanilan_karti_koru_trigger
  BEFORE UPDATE OR DELETE ON public.stok
  FOR EACH ROW EXECUTE FUNCTION public.stok_kullanilan_karti_koru();

CREATE OR REPLACE FUNCTION public.stok_maliyet_profili_kapsamini_isaretle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.stok
  SET ticari_kapsam = CASE
    WHEN ticari_kapsam IN ('satilabilir', 'her_ikisi')
      THEN 'her_ikisi'::public.stok_ticari_kapsami
    ELSE 'maliyet_bileseni'::public.stok_ticari_kapsami
  END
  WHERE id = NEW.stok_id
    AND ticari_kapsam NOT IN ('maliyet_bileseni', 'her_ikisi');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stok_maliyet_profili_kapsam_trigger ON public.stok_maliyet_profilleri;
CREATE TRIGGER stok_maliyet_profili_kapsam_trigger
  AFTER INSERT OR UPDATE OF stok_id ON public.stok_maliyet_profilleri
  FOR EACH ROW EXECUTE FUNCTION public.stok_maliyet_profili_kapsamini_isaretle();

DROP POLICY IF EXISTS "authenticated_all" ON public.stok;
DROP POLICY IF EXISTS stok_inventory_read ON public.stok;
CREATE POLICY stok_inventory_read ON public.stok
  FOR SELECT TO authenticated
  USING (public.has_permission('inventory', 'read'));

REVOKE INSERT, UPDATE, DELETE ON public.stok FROM authenticated;
GRANT SELECT ON public.stok TO authenticated;

REVOKE ALL ON FUNCTION public.stok_kullanim_ozeti_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_karti_payload_dogrula(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_kullanilan_karti_koru() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_maliyet_profili_kapsamini_isaretle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_kullanim_ozeti(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_katalogu_getir() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_karti_olustur(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_karti_guncelle(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_aktiflik_ayarla(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_karti_sil(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_satis_kapsami_ayarla(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_maliyet_kapsami_ayarla(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.stok_kullanim_ozeti(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_katalogu_getir() TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_karti_olustur(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_karti_guncelle(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_aktiflik_ayarla(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_karti_sil(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_satis_kapsami_ayarla(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_maliyet_kapsami_ayarla(uuid, boolean) TO authenticated;
