-- 103 - Hareket tabanlı stok takibi, otomatik/değişmez stok kodu ve operasyon özeti

SET search_path = public, extensions, pg_catalog;

ALTER TABLE public.stok
  ADD COLUMN IF NOT EXISTS minimum_miktar numeric(20,6) NOT NULL DEFAULT 0
    CHECK (minimum_miktar >= 0),
  ADD COLUMN IF NOT EXISTS stok_yeri text;

CREATE TABLE public.stok_hareketleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  hareket_turu text NOT NULL CHECK (
    hareket_turu IN (
      'devir_girisi',
      'alis_girisi',
      'iade_girisi',
      'sayim_fazlasi',
      'uretim_cikisi',
      'satis_cikisi',
      'iade_cikisi',
      'fire',
      'sayim_eksigi'
    )
  ),
  miktar numeric(20,6) NOT NULL CHECK (miktar > 0),
  net_miktar numeric(20,6) GENERATED ALWAYS AS (
    miktar * CASE
      WHEN hareket_turu IN ('devir_girisi', 'alis_girisi', 'iade_girisi', 'sayim_fazlasi')
        THEN 1
      ELSE -1
    END
  ) STORED,
  birim text NOT NULL CHECK (nullif(btrim(birim), '') IS NOT NULL),
  tedarikci_id uuid REFERENCES public.cari(id) ON DELETE RESTRICT,
  alis_fiyati_id uuid REFERENCES public.stok_alis_fiyatlari(id) ON DELETE RESTRICT,
  tedarikci_siparisi_id uuid REFERENCES public.tedarikci_siparisleri(id) ON DELETE RESTRICT,
  islem_tarihi timestamptz NOT NULL DEFAULT now(),
  belge_no text,
  aciklama text NOT NULL CHECK (length(btrim(aciklama)) >= 3),
  kaynak_turu text NOT NULL DEFAULT 'manuel'
    CHECK (kaynak_turu IN ('manuel', 'tedarikci_siparisi', 'sayim', 'sistem_devir')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key),
  CHECK (
    hareket_turu NOT IN ('alis_girisi', 'iade_cikisi')
    OR tedarikci_id IS NOT NULL
  )
);

CREATE INDEX stok_hareketleri_stok_tarih_idx
  ON public.stok_hareketleri(stok_id, islem_tarihi DESC, created_at DESC);
CREATE INDEX stok_hareketleri_tedarikci_tarih_idx
  ON public.stok_hareketleri(tedarikci_id, islem_tarihi DESC)
  WHERE tedarikci_id IS NOT NULL;
CREATE INDEX stok_hareketleri_bugun_idx
  ON public.stok_hareketleri(islem_tarihi DESC);

-- Eski kart miktarları kaybolmaz; ilk hareket olarak devir kaydı açılır.
INSERT INTO public.stok_hareketleri (
  stok_id, hareket_turu, miktar, birim, islem_tarihi, aciklama,
  kaynak_turu, idempotency_key
)
SELECT
  stok_row.id,
  CASE WHEN stok_row.mevcut_miktar > 0 THEN 'devir_girisi' ELSE 'sayim_eksigi' END,
  abs(stok_row.mevcut_miktar),
  stok_row.birim,
  COALESCE(stok_row.created_at, now()),
  'Hareket tabanlı stok sistemine açılış devri',
  'sistem_devir',
  'stok-devir-' || stok_row.id::text
FROM public.stok stok_row
WHERE COALESCE(stok_row.mevcut_miktar, 0) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.stok_hareketleri hareket
    WHERE hareket.idempotency_key = 'stok-devir-' || stok_row.id::text
  );

CREATE OR REPLACE FUNCTION public.stok_hareketini_degisiklige_karsi_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'STOK_HAREKETI_DEGISTIRILEMEZ',
    DETAIL = 'Yanlış hareketi ters yönde yeni bir düzeltme hareketiyle dengeleyin.';
END;
$$;

CREATE TRIGGER stok_hareketleri_immutable
  BEFORE UPDATE OR DELETE ON public.stok_hareketleri
  FOR EACH ROW EXECUTE FUNCTION public.stok_hareketini_degisiklige_karsi_koru();

CREATE OR REPLACE FUNCTION public.stok_kodu_ve_miktarini_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.kod IS DISTINCT FROM NEW.kod THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'STOK_KODU_DEGISTIRILEMEZ';
  END IF;
  IF OLD.mevcut_miktar IS DISTINCT FROM NEW.mevcut_miktar THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'STOK_MIKTARI_DOGRUDAN_DEGISTIRILEMEZ',
      DETAIL = 'Stok miktarı yalnız stok hareketlerinden hesaplanır.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stok_kodu_ve_miktari_guard
  BEFORE UPDATE ON public.stok
  FOR EACH ROW EXECUTE FUNCTION public.stok_kodu_ve_miktarini_koru();

CREATE OR REPLACE FUNCTION public.stok_hareketli_karti_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.stok_hareketleri hareket WHERE hareket.stok_id = OLD.id
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HAREKETLI_STOK_SILINEMEZ';
  END IF;

  IF OLD.ad IS DISTINCT FROM NEW.ad
     OR OLD.kategori IS DISTINCT FROM NEW.kategori
     OR OLD.grup IS DISTINCT FROM NEW.grup
     OR OLD.katman_yapisi IS DISTINCT FROM NEW.katman_yapisi
     OR OLD.kalinlik_mm IS DISTINCT FROM NEW.kalinlik_mm
     OR OLD.birim IS DISTINCT FROM NEW.birim
     OR OLD.marka IS DISTINCT FROM NEW.marka THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HAREKETLI_STOK_TANIMI_DEGISTIRILEMEZ';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stok_hareketli_karti_koru_trigger
  BEFORE UPDATE OR DELETE ON public.stok
  FOR EACH ROW EXECUTE FUNCTION public.stok_hareketli_karti_koru();

CREATE OR REPLACE FUNCTION public.stok_karti_olustur(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stok public.stok%ROWTYPE;
  v_kod text;
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_CREATE_YETKISI_GEREKLI';
  END IF;

  v_kod := 'S-' || lpad(public.sonraki_sayac('stok_kod', 1)::text, 4, '0');
  v_payload := p_payload || jsonb_build_object('kod', v_kod);
  PERFORM public.stok_karti_payload_dogrula(v_payload, NULL);

  INSERT INTO public.stok (
    kod, ad, kategori, grup, katman_yapisi, kalinlik_mm, birim, marka,
    minimum_miktar, stok_yeri, aktif
  ) VALUES (
    v_kod,
    btrim(v_payload ->> 'ad'),
    v_payload ->> 'kategori',
    NULLIF(btrim(COALESCE(v_payload ->> 'grup', '')), ''),
    NULLIF(btrim(COALESCE(v_payload ->> 'katman_yapisi', '')), ''),
    NULLIF(v_payload ->> 'kalinlik_mm', '')::numeric,
    btrim(v_payload ->> 'birim'),
    NULLIF(btrim(COALESCE(v_payload ->> 'marka', '')), ''),
    COALESCE(NULLIF(v_payload ->> 'minimum_miktar', '')::numeric, 0),
    NULLIF(btrim(COALESCE(v_payload ->> 'stok_yeri', '')), ''),
    true
  ) RETURNING * INTO v_stok;

  RETURN to_jsonb(v_stok) || jsonb_build_object(
    'mevcut_miktar', 0,
    'kritik_stok', false,
    'kullaniliyor', false,
    'kullanimlar', '[]'::jsonb
  );
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
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_UPDATE_YETKISI_GEREKLI';
  END IF;

  SELECT * INTO v_stok FROM public.stok WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOK_KARTI_BULUNAMADI';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stok_kullanim_ozeti_internal(p_id))
     OR EXISTS (SELECT 1 FROM public.stok_hareketleri WHERE stok_id = p_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'KULLANILAN_STOK_DUZENLENEMEZ';
  END IF;

  v_payload := p_payload || jsonb_build_object('kod', v_stok.kod);
  PERFORM public.stok_karti_payload_dogrula(v_payload, p_id);

  UPDATE public.stok SET
    ad = btrim(v_payload ->> 'ad'),
    kategori = v_payload ->> 'kategori',
    grup = NULLIF(btrim(COALESCE(v_payload ->> 'grup', '')), ''),
    katman_yapisi = NULLIF(btrim(COALESCE(v_payload ->> 'katman_yapisi', '')), ''),
    kalinlik_mm = NULLIF(v_payload ->> 'kalinlik_mm', '')::numeric,
    birim = btrim(v_payload ->> 'birim'),
    marka = NULLIF(btrim(COALESCE(v_payload ->> 'marka', '')), ''),
    minimum_miktar = COALESCE(NULLIF(v_payload ->> 'minimum_miktar', '')::numeric, 0),
    stok_yeri = NULLIF(btrim(COALESCE(v_payload ->> 'stok_yeri', '')), '')
  WHERE id = p_id
  RETURNING * INTO v_stok;

  RETURN to_jsonb(v_stok);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_operasyon_ayarlari_guncelle(
  p_id uuid,
  p_minimum_miktar numeric,
  p_stok_yeri text
)
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
  IF p_minimum_miktar IS NULL OR p_minimum_miktar < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MINIMUM_STOK_GECERSIZ';
  END IF;
  UPDATE public.stok
  SET minimum_miktar = p_minimum_miktar,
      stok_yeri = NULLIF(btrim(COALESCE(p_stok_yeri, '')), '')
  WHERE id = p_id
  RETURNING * INTO v_stok;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOK_KARTI_BULUNAMADI';
  END IF;
  RETURN to_jsonb(v_stok);
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_hareketi_kaydet(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stok public.stok%ROWTYPE;
  v_hareket public.stok_hareketleri%ROWTYPE;
  v_tur text := p_payload ->> 'hareket_turu';
  v_miktar numeric := NULLIF(p_payload ->> 'miktar', '')::numeric;
  v_tedarikci_id uuid := NULLIF(p_payload ->> 'tedarikci_id', '')::uuid;
  v_alis_fiyati_id uuid := NULLIF(p_payload ->> 'alis_fiyati_id', '')::uuid;
  v_tedarikci_siparisi_id uuid := NULLIF(p_payload ->> 'tedarikci_siparisi_id', '')::uuid;
  v_islem_tarihi timestamptz := COALESCE(
    NULLIF(p_payload ->> 'islem_tarihi', '')::timestamptz,
    now()
  );
  v_mevcut numeric;
  v_net numeric;
  v_tedarikci_tipi text;
  v_tedarikci_aktif boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_UPDATE_YETKISI_GEREKLI';
  END IF;
  IF length(COALESCE(p_idempotency_key, '')) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IDEMPOTENCY_KEY_GECERSIZ';
  END IF;

  SELECT * INTO v_hareket
  FROM public.stok_hareketleri
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN to_jsonb(v_hareket);
  END IF;

  IF v_tur NOT IN (
    'devir_girisi', 'alis_girisi', 'iade_girisi', 'sayim_fazlasi',
    'uretim_cikisi', 'satis_cikisi', 'iade_cikisi', 'fire', 'sayim_eksigi'
  ) OR v_miktar IS NULL OR v_miktar <= 0
     OR length(btrim(COALESCE(p_payload ->> 'aciklama', ''))) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STOK_HAREKETI_BILGILERI_GECERSIZ';
  END IF;

  SELECT * INTO v_stok
  FROM public.stok
  WHERE id = NULLIF(p_payload ->> 'stok_id', '')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STOK_KARTI_BULUNAMADI';
  END IF;
  IF NOT v_stok.aktif THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PASIF_STOGA_HAREKET_GIRILEMEZ';
  END IF;

  IF v_tur IN ('alis_girisi', 'iade_cikisi') AND v_tedarikci_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEDARIKCI_ZORUNLU';
  END IF;
  IF v_tedarikci_id IS NOT NULL THEN
    SELECT tipi, aktif INTO v_tedarikci_tipi, v_tedarikci_aktif
    FROM public.cari WHERE id = v_tedarikci_id;
    IF v_tedarikci_tipi IS DISTINCT FROM 'tedarikci' OR NOT COALESCE(v_tedarikci_aktif, false) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AKTIF_TEDARIKCI_GEREKLI';
    END IF;
  END IF;

  IF v_alis_fiyati_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stok_alis_fiyatlari fiyat
    WHERE fiyat.id = v_alis_fiyati_id
      AND fiyat.stok_id = v_stok.id
      AND fiyat.tedarikci_id IS NOT DISTINCT FROM v_tedarikci_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ALIS_FIYATI_STOK_TEDARIKCI_UYUSMUYOR';
  END IF;

  IF v_tedarikci_siparisi_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tedarikci_siparisleri siparis
    WHERE siparis.id = v_tedarikci_siparisi_id
      AND siparis.tedarikci_id IS NOT DISTINCT FROM v_tedarikci_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEDARIKCI_SIPARISI_UYUSMUYOR';
  END IF;

  SELECT COALESCE(sum(hareket.net_miktar), 0)
  INTO v_mevcut
  FROM public.stok_hareketleri hareket
  WHERE hareket.stok_id = v_stok.id;

  v_net := v_miktar * CASE
    WHEN v_tur IN ('devir_girisi', 'alis_girisi', 'iade_girisi', 'sayim_fazlasi') THEN 1
    ELSE -1
  END;
  IF v_mevcut + v_net < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'YETERSIZ_STOK',
      DETAIL = format('Mevcut: %s %s, istenen çıkış: %s %s', v_mevcut, v_stok.birim, v_miktar, v_stok.birim);
  END IF;

  INSERT INTO public.stok_hareketleri (
    stok_id, hareket_turu, miktar, birim, tedarikci_id, alis_fiyati_id,
    tedarikci_siparisi_id, islem_tarihi, belge_no, aciklama, kaynak_turu,
    idempotency_key, olusturan_kullanici_id
  ) VALUES (
    v_stok.id, v_tur, v_miktar, v_stok.birim, v_tedarikci_id, v_alis_fiyati_id,
    v_tedarikci_siparisi_id, v_islem_tarihi,
    NULLIF(btrim(COALESCE(p_payload ->> 'belge_no', '')), ''),
    btrim(p_payload ->> 'aciklama'),
    CASE
      WHEN v_tedarikci_siparisi_id IS NOT NULL THEN 'tedarikci_siparisi'
      WHEN v_tur IN ('sayim_fazlasi', 'sayim_eksigi') THEN 'sayim'
      ELSE 'manuel'
    END,
    p_idempotency_key, auth.uid()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_hareket;

  IF NOT FOUND THEN
    SELECT * INTO v_hareket
    FROM public.stok_hareketleri
    WHERE idempotency_key = p_idempotency_key;
  END IF;

  RETURN to_jsonb(v_hareket) || jsonb_build_object(
    'stok_kodu', v_stok.kod,
    'stok_adi', v_stok.ad,
    'bakiye_sonrasi', v_mevcut + v_hareket.net_miktar
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_hareketlerini_getir(
  p_stok_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 200
)
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
  IF p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STOK_HAREKET_LIMITI_GECERSIZ';
  END IF;

  RETURN QUERY
  WITH sirali AS (
    SELECT
      hareket.*,
      sum(hareket.net_miktar) OVER (
        PARTITION BY hareket.stok_id
        ORDER BY hareket.islem_tarihi, hareket.created_at, hareket.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS bakiye_sonrasi
    FROM public.stok_hareketleri hareket
    WHERE p_stok_id IS NULL OR hareket.stok_id = p_stok_id
  )
  SELECT to_jsonb(sirali)
    || jsonb_build_object(
      'stok_kodu', stok_row.kod,
      'stok_adi', stok_row.ad,
      'tedarikci_adi', tedarikci.ad
    )
  FROM sirali
  JOIN public.stok stok_row ON stok_row.id = sirali.stok_id
  LEFT JOIN public.cari tedarikci ON tedarikci.id = sirali.tedarikci_id
  ORDER BY sirali.islem_tarihi DESC, sirali.created_at DESC, sirali.id DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_tedarikcileri_getir()
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
  SELECT jsonb_build_object(
    'id', cari_row.id,
    'kod', cari_row.kod,
    'ad', cari_row.ad,
    'tedarik_kapsamlari', COALESCE(cari_row.tedarik_kapsamlari, '{}'::text[])
  )
  FROM public.cari cari_row
  WHERE cari_row.tipi = 'tedarikci' AND cari_row.aktif
  ORDER BY cari_row.ad;
END;
$$;

CREATE OR REPLACE FUNCTION public.stok_panel_ozeti_getir()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sonuc jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('inventory', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INVENTORY_READ_YETKISI_GEREKLI';
  END IF;
  WITH bakiyeler AS (
    SELECT stok_row.id, stok_row.aktif, stok_row.minimum_miktar,
           COALESCE(sum(hareket.net_miktar), 0) AS bakiye
    FROM public.stok stok_row
    LEFT JOIN public.stok_hareketleri hareket ON hareket.stok_id = stok_row.id
    GROUP BY stok_row.id
  )
  SELECT jsonb_build_object(
    'aktif_kart_sayisi', count(*) FILTER (WHERE aktif),
    'kritik_stok_sayisi', count(*) FILTER (
      WHERE aktif AND minimum_miktar > 0 AND bakiye <= minimum_miktar
    ),
    'stoksuz_kart_sayisi', count(*) FILTER (WHERE aktif AND bakiye = 0),
    'bugunku_hareket_sayisi', (
      SELECT count(*) FROM public.stok_hareketleri
      WHERE islem_tarihi >= date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'
    )
  ) INTO v_sonuc
  FROM bakiyeler;
  RETURN v_sonuc;
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
      'mevcut_miktar', COALESCE(hareket.bakiye, 0),
      'kritik_stok', stok_row.minimum_miktar > 0
        AND COALESCE(hareket.bakiye, 0) <= stok_row.minimum_miktar,
      'tedarikci_ad', cari.ad,
      'kullaniliyor', COALESCE(kullanim.toplam, 0) > 0 OR COALESCE(hareket.adet, 0) > 0,
      'kullanimlar', COALESCE(kullanim.detay, '[]'::jsonb)
        || CASE WHEN COALESCE(hareket.adet, 0) > 0
          THEN jsonb_build_array(jsonb_build_object('alan', 'stok_hareketi', 'adet', hareket.adet))
          ELSE '[]'::jsonb END
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
  LEFT JOIN LATERAL (
    SELECT sum(h.net_miktar) AS bakiye, count(*)::bigint AS adet
    FROM public.stok_hareketleri h WHERE h.stok_id = stok_row.id
  ) hareket ON true
  ORDER BY stok_row.kategori, stok_row.grup NULLS LAST, stok_row.kod;
END;
$$;

ALTER TABLE public.stok_hareketleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stok_hareketleri FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.stok_hareketleri FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stok_hareketleri TO service_role;

CREATE POLICY stok_hareketleri_inventory_read
  ON public.stok_hareketleri
  FOR SELECT TO authenticated
  USING (public.has_permission('inventory', 'read'));

CREATE TRIGGER audit_stok_hareketleri
  AFTER INSERT OR UPDATE OR DELETE ON public.stok_hareketleri
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

REVOKE ALL ON FUNCTION public.stok_hareketini_degisiklige_karsi_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_kodu_ve_miktarini_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_hareketli_karti_koru()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stok_operasyon_ayarlari_guncelle(uuid, numeric, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_hareketi_kaydet(jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_hareketlerini_getir(uuid, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_tedarikcileri_getir()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stok_panel_ozeti_getir()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.stok_operasyon_ayarlari_guncelle(uuid, numeric, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_hareketi_kaydet(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_hareketlerini_getir(uuid, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_tedarikcileri_getir()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stok_panel_ozeti_getir()
  TO authenticated;

COMMENT ON TABLE public.stok_hareketleri IS
  'Stok miktarının tek kaynağı olan append-only giriş, çıkış, iade, fire ve sayım hareketleri.';
COMMENT ON COLUMN public.stok.mevcut_miktar IS
  'Legacy kolon; güncel miktar stok_hareketleri.net_miktar toplamından hesaplanır ve doğrudan değiştirilemez.';
COMMENT ON COLUMN public.stok.minimum_miktar IS
  'Bakiye bu seviyeye indiğinde stok kartı kritik olarak işaretlenir.';

