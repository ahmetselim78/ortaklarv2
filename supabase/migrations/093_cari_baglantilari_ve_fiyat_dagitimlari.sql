-- 093 - Cari bağlantıları, fiyat hakkı kuyruğu ve sipariş/tahsilat dağıtımları.
--
-- Bağlantı ön ödemesi genel cari bakiyede alacak hareketidir; buna ek olarak
-- hangi fiyat sürümünün ne kadarlık siparişi karşıladığı bu migration'daki
-- append-only dağıtım tablolarından yeniden üretilebilir.

SET search_path = public, extensions, pg_catalog;

ALTER TABLE public.cari_hareketleri
  ADD COLUMN IF NOT EXISTS cari_baglantisi_id uuid;

ALTER TABLE public.cari_hareketleri
  DROP CONSTRAINT IF EXISTS cari_hareketleri_hareket_turu_check;

ALTER TABLE public.cari_hareketleri
  ADD CONSTRAINT cari_hareketleri_hareket_turu_check CHECK (hareket_turu IN (
    'siparis_borcu',
    'siparis_farki_borc',
    'siparis_farki_alacak',
    'siparis_iptal_borc',
    'siparis_iptal_alacak',
    'tahsilat',
    'on_odeme',
    'acilis_borcu',
    'acilis_alacagi',
    'manuel_duzeltme_borc',
    'manuel_duzeltme_alacak',
    'ters_kayit',
    'baglanti_on_odeme',
    'baglanti_fiyat_farki_borc',
    'baglanti_fiyat_farki_alacak'
  ));

ALTER TABLE public.cari_hareketleri
  DROP CONSTRAINT IF EXISTS cari_hareketleri_tahsilat_bilgisi_check;

ALTER TABLE public.cari_hareketleri
  ADD CONSTRAINT cari_hareketleri_tahsilat_bilgisi_check CHECK (
    (
      hareket_turu IN ('tahsilat', 'on_odeme', 'baglanti_on_odeme')
      AND tahsilat_yontemi IS NOT NULL
    )
    OR hareket_turu NOT IN ('tahsilat', 'on_odeme', 'baglanti_on_odeme')
  );

CREATE TABLE public.cari_baglantilari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baglanti_no text NOT NULL UNIQUE,
  cari_id uuid NOT NULL REFERENCES public.cari(id) ON DELETE RESTRICT,
  para_birimi public.para_birimi_kodu NOT NULL,
  baglanti_turu text NOT NULL DEFAULT 'normal'
    CHECK (baglanti_turu IN ('normal', 'devir')),
  on_odeme_tutari numeric(18,2) NOT NULL CHECK (on_odeme_tutari >= 0),
  fiyat_listesi_surumu_id uuid NOT NULL
    REFERENCES public.fiyat_listesi_surmleri(id) ON DELETE RESTRICT,
  musteri_ticari_profil_surumu_id uuid
    REFERENCES public.musteri_ticari_profil_surmleri(id) ON DELETE RESTRICT,
  durum text NOT NULL DEFAULT 'taslak'
    CHECK (durum IN ('taslak', 'onaylandi', 'iptal')),
  sira_no integer CHECK (sira_no IS NULL OR sira_no > 0),
  odeme_tarihi date NOT NULL,
  odeme_yontemi text NOT NULL CHECK (length(trim(odeme_yontemi)) >= 2),
  aciklama text,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  onaylayan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  onaylanma_tarihi timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cari_baglantilari_onay_check CHECK (
    (durum = 'taslak'
      AND sira_no IS NULL
      AND onaylayan_kullanici_id IS NULL
      AND onaylanma_tarihi IS NULL)
    OR
    (durum = 'onaylandi'
      AND sira_no IS NOT NULL
      AND onaylayan_kullanici_id IS NOT NULL
      AND onaylanma_tarihi IS NOT NULL)
    OR durum = 'iptal'
  ),
  CONSTRAINT cari_baglantilari_on_odeme_check CHECK (
    (baglanti_turu = 'normal' AND on_odeme_tutari > 0)
    OR (baglanti_turu = 'devir' AND on_odeme_tutari >= 0)
  )
);

ALTER TABLE public.cari_hareketleri
  ADD CONSTRAINT cari_hareketleri_baglanti_fk
  FOREIGN KEY (cari_baglantisi_id)
  REFERENCES public.cari_baglantilari(id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX cari_baglantilari_sira_unique
  ON public.cari_baglantilari(cari_id, para_birimi, sira_no)
  WHERE durum = 'onaylandi';

CREATE UNIQUE INDEX cari_baglantilari_normal_fiyat_surumu_unique
  ON public.cari_baglantilari(fiyat_listesi_surumu_id)
  WHERE baglanti_turu = 'normal';

CREATE INDEX cari_baglantilari_cari_doviz_idx
  ON public.cari_baglantilari(cari_id, para_birimi, durum, sira_no);

CREATE TABLE public.siparis_baglanti_dagitimlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cari_baglantisi_id uuid NOT NULL
    REFERENCES public.cari_baglantilari(id) ON DELETE RESTRICT,
  siparis_id uuid NOT NULL REFERENCES public.siparisler(id) ON DELETE RESTRICT,
  siparis_fiyat_revizyonu_id uuid
    REFERENCES public.siparis_fiyat_revizyonlari(id) ON DELETE RESTRICT,
  siparis_detay_fiyat_snapshot_id uuid
    REFERENCES public.siparis_detay_fiyat_snapshotlari(id) ON DELETE RESTRICT,
  kaynak_dagitim_id uuid
    REFERENCES public.siparis_baglanti_dagitimlari(id) ON DELETE RESTRICT,
  cari_hareketi_id uuid NOT NULL
    REFERENCES public.cari_hareketleri(id) ON DELETE RESTRICT,
  yon text NOT NULL CHECK (yon IN ('tuketim', 'iade')),
  sira_no integer NOT NULL CHECK (sira_no > 0),
  adet_orani numeric(18,8) NOT NULL DEFAULT 1
    CHECK (adet_orani > 0 AND adet_orani <= 1),
  faturalanabilir_m2 numeric(18,6) NOT NULL DEFAULT 0
    CHECK (faturalanabilir_m2 >= 0),
  toplam_tutar numeric(18,2) NOT NULL CHECK (toplam_tutar > 0),
  karsilanan_tutar numeric(18,2) NOT NULL DEFAULT 0
    CHECK (karsilanan_tutar >= 0 AND karsilanan_tutar <= toplam_tutar),
  acik_tutar numeric(18,2) GENERATED ALWAYS AS
    (toplam_tutar - karsilanan_tutar) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cari_hareketi_id, sira_no),
  CHECK (
    (yon = 'tuketim' AND kaynak_dagitim_id IS NULL)
    OR (yon = 'iade' AND kaynak_dagitim_id IS NOT NULL)
  )
);

CREATE INDEX siparis_baglanti_dagitimlari_baglanti_idx
  ON public.siparis_baglanti_dagitimlari(cari_baglantisi_id, created_at, id);
CREATE INDEX siparis_baglanti_dagitimlari_siparis_idx
  ON public.siparis_baglanti_dagitimlari(siparis_id, created_at, id);

CREATE TABLE public.cari_tahsilat_dagitimlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahsilat_hareketi_id uuid NOT NULL
    REFERENCES public.cari_hareketleri(id) ON DELETE RESTRICT,
  siparis_baglanti_dagitimi_id uuid NOT NULL
    REFERENCES public.siparis_baglanti_dagitimlari(id) ON DELETE RESTRICT,
  kaynak_cari_baglantisi_id uuid
    REFERENCES public.cari_baglantilari(id) ON DELETE RESTRICT,
  tutar numeric(18,2) NOT NULL CHECK (tutar > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tahsilat_hareketi_id, siparis_baglanti_dagitimi_id)
);

CREATE INDEX cari_tahsilat_dagitimlari_acik_idx
  ON public.cari_tahsilat_dagitimlari(siparis_baglanti_dagitimi_id);
CREATE INDEX cari_tahsilat_dagitimlari_kaynak_baglanti_idx
  ON public.cari_tahsilat_dagitimlari(kaynak_cari_baglantisi_id)
  WHERE kaynak_cari_baglantisi_id IS NOT NULL;

CREATE TABLE public.cari_baglanti_fiyat_duzeltmeleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cari_baglantisi_id uuid NOT NULL
    REFERENCES public.cari_baglantilari(id) ON DELETE RESTRICT,
  siparis_baglanti_dagitimi_id uuid NOT NULL
    REFERENCES public.siparis_baglanti_dagitimlari(id) ON DELETE RESTRICT,
  onceki_birim_fiyat numeric(18,6) NOT NULL,
  yeni_birim_fiyat numeric(18,6) NOT NULL,
  acik_m2 numeric(18,6) NOT NULL CHECK (acik_m2 > 0),
  fark_tutari numeric(18,2) NOT NULL,
  cari_hareketi_id uuid
    REFERENCES public.cari_hareketleri(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cari_baglantisi_id, siparis_baglanti_dagitimi_id)
);

CREATE OR REPLACE FUNCTION public.cari_baglanti_kalan_tutari(
  p_baglanti_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT GREATEST(
    baglanti.on_odeme_tutari
      - COALESCE((
          SELECT sum(
            CASE WHEN dagitim.yon = 'tuketim'
              THEN dagitim.karsilanan_tutar
              ELSE -dagitim.karsilanan_tutar
            END
          )
          FROM public.siparis_baglanti_dagitimlari dagitim
          WHERE dagitim.cari_baglantisi_id = baglanti.id
        ), 0)
      - COALESCE((
          SELECT sum(dagitim.tutar)
          FROM public.cari_tahsilat_dagitimlari dagitim
          WHERE dagitim.kaynak_cari_baglantisi_id = baglanti.id
        ), 0),
    0
  )::numeric(18,2)
  FROM public.cari_baglantilari baglanti
  WHERE baglanti.id = p_baglanti_id
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_operasyon_durumu(
  p_baglanti_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_baglanti public.cari_baglantilari%ROWTYPE;
  v_kalan numeric;
  v_onceki_kalan numeric;
BEGIN
  SELECT * INTO v_baglanti
  FROM public.cari_baglantilari
  WHERE id = p_baglanti_id;

  IF v_baglanti.id IS NULL THEN RETURN 'bulunamadi'; END IF;
  IF v_baglanti.durum <> 'onaylandi' THEN RETURN v_baglanti.durum; END IF;

  v_kalan := public.cari_baglanti_kalan_tutari(v_baglanti.id);
  SELECT COALESCE(sum(public.cari_baglanti_kalan_tutari(onceki.id)), 0)
  INTO v_onceki_kalan
  FROM public.cari_baglantilari onceki
  WHERE onceki.cari_id = v_baglanti.cari_id
    AND onceki.para_birimi = v_baglanti.para_birimi
    AND onceki.durum = 'onaylandi'
    AND onceki.sira_no < v_baglanti.sira_no;

  IF v_onceki_kalan > 0 THEN RETURN 'sirada'; END IF;
  IF v_kalan > 0 THEN RETURN 'aktif_kredi'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.cari_baglantilari sonraki
    WHERE sonraki.cari_id = v_baglanti.cari_id
      AND sonraki.para_birimi = v_baglanti.para_birimi
      AND sonraki.durum = 'onaylandi'
      AND sonraki.sira_no > v_baglanti.sira_no
  ) THEN
    RETURN 'acik_donem';
  END IF;
  RETURN 'tukendi';
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_fiyat_surumu_etkinlestir(
  p_baglanti_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_baglanti public.cari_baglantilari%ROWTYPE;
  v_liste_id uuid;
  v_durum text;
BEGIN
  SELECT * INTO v_baglanti
  FROM public.cari_baglantilari
  WHERE id = p_baglanti_id
  FOR UPDATE;

  IF v_baglanti.id IS NULL OR v_baglanti.durum <> 'onaylandi' THEN RETURN; END IF;

  SELECT fiyat_listesi_id, durum::text
  INTO v_liste_id, v_durum
  FROM public.fiyat_listesi_surmleri
  WHERE id = v_baglanti.fiyat_listesi_surumu_id
  FOR UPDATE;

  IF v_durum = 'yayinda' THEN RETURN; END IF;

  UPDATE public.fiyat_listesi_surmleri
  SET durum = 'arsiv',
      revision_no = revision_no + 1,
      updated_at = now()
  WHERE fiyat_listesi_id = v_liste_id
    AND durum = 'yayinda';

  UPDATE public.fiyat_listesi_surmleri
  SET durum = 'yayinda',
      gecerli_baslangic = (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
      gecerli_bitis = NULL,
      yayinlayan_kullanici_id = auth.uid(),
      yayinlanma_tarihi = now(),
      revision_no = revision_no + 1,
      updated_at = now()
  WHERE id = v_baglanti.fiyat_listesi_surumu_id
    AND durum IN ('taslak', 'arsiv');
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_etkin_fiyatini_senkronize_et(
  p_cari_id uuid,
  p_para_birimi public.para_birimi_kodu
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_baglanti_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('cari_baglanti:' || p_cari_id::text || ':' || p_para_birimi::text, 0)
  );

  SELECT baglanti.id
  INTO v_baglanti_id
  FROM public.cari_baglantilari baglanti
  WHERE baglanti.cari_id = p_cari_id
    AND baglanti.para_birimi = p_para_birimi
    AND baglanti.durum = 'onaylandi'
    AND public.cari_baglanti_kalan_tutari(baglanti.id) > 0
  ORDER BY baglanti.sira_no
  LIMIT 1;

  IF v_baglanti_id IS NULL THEN
    SELECT baglanti.id
    INTO v_baglanti_id
    FROM public.cari_baglantilari baglanti
    WHERE baglanti.cari_id = p_cari_id
      AND baglanti.para_birimi = p_para_birimi
      AND baglanti.durum = 'onaylandi'
    ORDER BY baglanti.sira_no DESC
    LIMIT 1;
  END IF;

  IF v_baglanti_id IS NOT NULL THEN
    PERFORM public.cari_baglanti_fiyat_surumu_etkinlestir(v_baglanti_id);
  END IF;
  RETURN v_baglanti_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_profili_listeye_bagla(
  p_cari_id uuid,
  p_fiyat_listesi_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profil_id uuid;
  v_mevcut public.musteri_ticari_profil_surmleri%ROWTYPE;
  v_yeni_id uuid := gen_random_uuid();
  v_yeni_no integer;
BEGIN
  SELECT profil.id
  INTO v_profil_id
  FROM public.musteri_ticari_profilleri profil
  JOIN public.musteri_ticari_profil_surmleri surum
    ON surum.musteri_ticari_profili_id = profil.id
  WHERE profil.cari_id = p_cari_id
    AND profil.aktif
    AND surum.durum = 'yayinda'
  ORDER BY surum.surum_no DESC
  LIMIT 1
  FOR UPDATE OF profil, surum;

  IF v_profil_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EKSIK_MUSTERI_TICARI_PROFILI';
  END IF;

  SELECT *
  INTO v_mevcut
  FROM public.musteri_ticari_profil_surmleri
  WHERE musteri_ticari_profili_id = v_profil_id
    AND durum = 'yayinda'
  ORDER BY surum_no DESC
  LIMIT 1
  FOR UPDATE;

  IF v_mevcut.musteri_fiyat_listesi_id = p_fiyat_listesi_id THEN
    RETURN v_mevcut.id;
  END IF;

  UPDATE public.musteri_ticari_profil_surmleri
  SET durum = 'arsiv', updated_at = now()
  WHERE id = v_mevcut.id;

  SELECT COALESCE(max(surum_no), 0) + 1
  INTO v_yeni_no
  FROM public.musteri_ticari_profil_surmleri
  WHERE musteri_ticari_profili_id = v_profil_id;

  INSERT INTO public.musteri_ticari_profil_surmleri (
    id, musteri_ticari_profili_id, surum_no, durum, gecerli_baslangic,
    gecerli_bitis, ana_fiyat_listesi_id, musteri_fiyat_listesi_id,
    varsayilan_para_birimi, varsayilan_kdv_grubu_id, varsayilan_vade_gunu,
    vade_profili_id, vade_profili_surumu_id, nakliye_hesaplama_tipi,
    sabit_nakliye_satis_tutari, sabit_nakliye_maliyet_tutari,
    m2_nakliye_satis_tutari, m2_nakliye_maliyet_tutari,
    minimum_marj_yuzdesi_override, varsayilan_belge_notu,
    teklif_gecerlilik_gunu, onceki_surum_id, olusturan_kullanici_id,
    yayinlayan_kullanici_id, yayinlanma_tarihi, revision_no
  )
  VALUES (
    v_yeni_id, v_profil_id, v_yeni_no, 'yayinda',
    (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
    NULL, v_mevcut.ana_fiyat_listesi_id, p_fiyat_listesi_id,
    v_mevcut.varsayilan_para_birimi, v_mevcut.varsayilan_kdv_grubu_id,
    v_mevcut.varsayilan_vade_gunu, v_mevcut.vade_profili_id,
    v_mevcut.vade_profili_surumu_id, v_mevcut.nakliye_hesaplama_tipi,
    v_mevcut.sabit_nakliye_satis_tutari, v_mevcut.sabit_nakliye_maliyet_tutari,
    v_mevcut.m2_nakliye_satis_tutari, v_mevcut.m2_nakliye_maliyet_tutari,
    v_mevcut.minimum_marj_yuzdesi_override, v_mevcut.varsayilan_belge_notu,
    v_mevcut.teklif_gecerlilik_gunu, v_mevcut.id, auth.uid(), auth.uid(),
    now(), 1
  );
  RETURN v_yeni_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_taslak_kaydet(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cari_id uuid := public.ticari_guvenli_uuid(p_payload ->> 'cari_id');
  v_para public.para_birimi_kodu;
  v_tutar numeric := public.ticari_guvenli_numeric(p_payload ->> 'on_odeme_tutari');
  v_liste_id uuid;
  v_ana_liste_id uuid;
  v_surum_id uuid := gen_random_uuid();
  v_surum_no integer;
  v_baglanti_id uuid := gen_random_uuid();
  v_baglanti_no text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_permission('pricing', 'create')
    AND public.has_permission('pricing', 'update')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_UPDATE_YETKISI_GEREKLI';
  END IF;

  BEGIN
    v_para := (p_payload ->> 'para_birimi')::public.para_birimi_kodu;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PARA_BIRIMI_GECERSIZ';
  END;

  IF v_cari_id IS NULL OR v_tutar IS NULL OR v_tutar <= 0
     OR NULLIF(p_payload ->> 'odeme_tarihi', '') IS NULL
     OR length(trim(COALESCE(p_payload ->> 'odeme_yontemi', ''))) < 2
     OR jsonb_array_length(COALESCE(p_payload -> 'fiyatlar', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BAGLANTI_GIRDISI_GECERSIZ';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cari
    WHERE id = v_cari_id AND tipi = 'musteri' AND aktif
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AKTIF_MUSTERI_BULUNAMADI';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cari_baglanti:' || v_cari_id::text || ':' || v_para::text, 0));

  SELECT liste.id
  INTO v_liste_id
  FROM public.fiyat_listeleri liste
  WHERE liste.cari_id = v_cari_id
    AND liste.tur = 'musteri'
    AND liste.aktif
  LIMIT 1;

  SELECT surum.ana_fiyat_listesi_id
  INTO v_ana_liste_id
  FROM public.musteri_ticari_profilleri profil
  JOIN public.musteri_ticari_profil_surmleri surum
    ON surum.musteri_ticari_profili_id = profil.id
  WHERE profil.cari_id = v_cari_id
    AND profil.aktif
    AND surum.durum = 'yayinda'
  ORDER BY surum.surum_no DESC
  LIMIT 1;

  IF v_ana_liste_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EKSIK_MUSTERI_TICARI_PROFILI';
  END IF;

  IF v_liste_id IS NULL THEN
    v_liste_id := gen_random_uuid();
    INSERT INTO public.fiyat_listeleri (
      id, kod, ad, tur, miras_ana_fiyat_listesi_id, cari_id,
      aktif, olusturan_kullanici_id
    )
    SELECT
      v_liste_id,
      'BAG-' || regexp_replace(upper(cari.kod), '[^A-Z0-9._-]', '-', 'g')
        || '-' || left(replace(v_cari_id::text, '-', ''), 8),
      cari.ad || ' bağlantı fiyatları',
      'musteri',
      v_ana_liste_id,
      v_cari_id,
      true,
      auth.uid()
    FROM public.cari
    WHERE id = v_cari_id;
  END IF;

  SELECT COALESCE(max(surum_no), 0) + 1
  INTO v_surum_no
  FROM public.fiyat_listesi_surmleri
  WHERE fiyat_listesi_id = v_liste_id;

  INSERT INTO public.fiyat_listesi_surmleri (
    id, fiyat_listesi_id, surum_no, durum, gecerli_baslangic,
    revision_no, aciklama, olusturan_kullanici_id
  )
  VALUES (
    v_surum_id, v_liste_id, v_surum_no, 'taslak',
    (p_payload ->> 'odeme_tarihi')::date, 1,
    NULLIF(p_payload ->> 'aciklama', ''), auth.uid()
  );

  INSERT INTO public.fiyat_listesi_urun_kalemleri (
    fiyat_listesi_surumu_id, kapsam_tipi, stok_id, birim_fiyat,
    para_birimi, kdv_grubu_id, minimum_m2, en_adimi_mm, boy_adimi_mm,
    aktif, olusturan_kullanici_id
  )
  SELECT
    v_surum_id,
    'stok',
    public.ticari_guvenli_uuid(fiyat.value ->> 'stok_id'),
    public.ticari_guvenli_numeric(fiyat.value ->> 'birim_fiyat'),
    v_para,
    public.ticari_guvenli_uuid(fiyat.value ->> 'kdv_grubu_id'),
    public.ticari_guvenli_numeric(fiyat.value ->> 'minimum_m2'),
    public.ticari_guvenli_numeric(fiyat.value ->> 'en_adimi_mm'),
    public.ticari_guvenli_numeric(fiyat.value ->> 'boy_adimi_mm'),
    true,
    auth.uid()
  FROM jsonb_array_elements(p_payload -> 'fiyatlar') fiyat(value);

  v_baglanti_no := 'BAG-'
    || extract(year FROM (p_payload ->> 'odeme_tarihi')::date)::integer::text
    || '-' || lpad(public.sonraki_sayac(
      'cari_baglanti_' || extract(year FROM (p_payload ->> 'odeme_tarihi')::date)::integer::text,
      1
    )::text, 5, '0');

  INSERT INTO public.cari_baglantilari (
    id, baglanti_no, cari_id, para_birimi, on_odeme_tutari,
    fiyat_listesi_surumu_id, durum, odeme_tarihi, odeme_yontemi,
    aciklama, olusturan_kullanici_id
  )
  VALUES (
    v_baglanti_id, v_baglanti_no, v_cari_id, v_para, round(v_tutar, 2),
    v_surum_id, 'taslak', (p_payload ->> 'odeme_tarihi')::date,
    p_payload ->> 'odeme_yontemi', NULLIF(p_payload ->> 'aciklama', ''),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'basarili', true,
    'baglanti_id', v_baglanti_id,
    'baglanti_no', v_baglanti_no,
    'fiyat_listesi_surumu_id', v_surum_id,
    'revision_no', 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_acik_tahsilati_fifo_dagit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kalan numeric := NEW.tutar;
  v_acik record;
  v_tutar numeric;
BEGIN
  IF NEW.yon <> 'alacak'
     OR NEW.hareket_turu NOT IN ('tahsilat', 'on_odeme', 'baglanti_on_odeme') THEN
    RETURN NEW;
  END IF;

  FOR v_acik IN
    SELECT
      dagitim.id,
      dagitim.acik_tutar
        - COALESCE(sum(kapama.tutar), 0) AS kalan_acik
    FROM public.siparis_baglanti_dagitimlari dagitim
    JOIN public.siparisler siparis ON siparis.id = dagitim.siparis_id
    LEFT JOIN public.cari_tahsilat_dagitimlari kapama
      ON kapama.siparis_baglanti_dagitimi_id = dagitim.id
    WHERE siparis.cari_id = NEW.cari_id
      AND siparis.para_birimi = NEW.para_birimi
      AND dagitim.yon = 'tuketim'
      AND dagitim.acik_tutar > 0
    GROUP BY dagitim.id, dagitim.acik_tutar, dagitim.created_at
    HAVING dagitim.acik_tutar - COALESCE(sum(kapama.tutar), 0) > 0
    ORDER BY dagitim.created_at, dagitim.id
  LOOP
    EXIT WHEN v_kalan <= 0;
    v_tutar := LEAST(v_kalan, v_acik.kalan_acik);
    INSERT INTO public.cari_tahsilat_dagitimlari (
      tahsilat_hareketi_id,
      siparis_baglanti_dagitimi_id,
      kaynak_cari_baglantisi_id,
      tutar
    )
    VALUES (NEW.id, v_acik.id, NEW.cari_baglantisi_id, v_tutar);
    v_kalan := v_kalan - v_tutar;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cari_hareketleri_fifo_tahsilat
  AFTER INSERT ON public.cari_hareketleri
  FOR EACH ROW EXECUTE FUNCTION public.cari_acik_tahsilati_fifo_dagit();

CREATE OR REPLACE FUNCTION public.siparis_baglanti_hareketini_dagit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_satir record;
  v_baglanti record;
  v_satir_tutari numeric;
  v_satir_kalan numeric;
  v_toplam_net numeric;
  v_karsilanan numeric;
  v_parca_tutari numeric;
  v_hareket_kalan numeric := NEW.tutar;
  v_sira integer := 0;
BEGIN
  IF NEW.kaynak_sinifi <> 'sistem'
     OR NEW.hareket_turu NOT IN (
       'siparis_borcu',
       'siparis_farki_borc',
       'siparis_farki_alacak',
       'siparis_iptal_alacak',
       'siparis_iptal_borc'
     ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('cari_baglanti:' || NEW.cari_id::text || ':' || NEW.para_birimi::text, 0)
  );

  IF NEW.yon = 'alacak' THEN
    v_hareket_kalan := NEW.tutar;
    FOR v_satir IN
      SELECT
        tuketim.*,
        tuketim.toplam_tutar - COALESCE(sum(iade.toplam_tutar), 0) AS kalan_toplam,
        tuketim.karsilanan_tutar - COALESCE(sum(iade.karsilanan_tutar), 0)
          AS kalan_karsilanan
      FROM public.siparis_baglanti_dagitimlari tuketim
      LEFT JOIN public.siparis_baglanti_dagitimlari iade
        ON iade.kaynak_dagitim_id = tuketim.id
       AND iade.yon = 'iade'
      WHERE tuketim.siparis_id = NEW.siparis_id
        AND tuketim.yon = 'tuketim'
      GROUP BY tuketim.id
      HAVING tuketim.toplam_tutar - COALESCE(sum(iade.toplam_tutar), 0) > 0
      ORDER BY tuketim.created_at DESC, tuketim.sira_no DESC
    LOOP
      EXIT WHEN v_hareket_kalan <= 0;
      v_parca_tutari := LEAST(v_hareket_kalan, v_satir.kalan_toplam);
      v_karsilanan := LEAST(v_parca_tutari, v_satir.kalan_karsilanan);
      v_sira := v_sira + 1;

      INSERT INTO public.siparis_baglanti_dagitimlari (
        cari_baglantisi_id, siparis_id, siparis_fiyat_revizyonu_id,
        siparis_detay_fiyat_snapshot_id, kaynak_dagitim_id,
        cari_hareketi_id, yon, sira_no, adet_orani,
        faturalanabilir_m2, toplam_tutar, karsilanan_tutar
      )
      VALUES (
        v_satir.cari_baglantisi_id, NEW.siparis_id,
        v_satir.siparis_fiyat_revizyonu_id,
        v_satir.siparis_detay_fiyat_snapshot_id, v_satir.id,
        NEW.id, 'iade', v_sira,
        LEAST(v_parca_tutari / v_satir.toplam_tutar, 1),
        round(
          v_satir.faturalanabilir_m2
          * v_parca_tutari / v_satir.toplam_tutar,
          6
        ),
        v_parca_tutari, v_karsilanan
      );
      v_hareket_kalan := v_hareket_kalan - v_parca_tutari;
    END LOOP;

    PERFORM public.cari_baglanti_etkin_fiyatini_senkronize_et(
      NEW.cari_id,
      NEW.para_birimi::public.para_birimi_kodu
    );
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cari_baglantilari
    WHERE cari_id = NEW.cari_id
      AND para_birimi::text = NEW.para_birimi
      AND durum = 'onaylandi'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(snapshot.net_tutar), 0)
  INTO v_toplam_net
  FROM public.siparisler siparis
  JOIN public.siparis_detay_fiyat_snapshotlari snapshot
    ON snapshot.siparis_fiyat_revizyonu_id = CASE
      WHEN NEW.hareket_turu = 'siparis_farki_borc' THEN NEW.kaynak_id
      ELSE siparis.aktif_fiyat_revizyon_id
    END
  WHERE siparis.id = NEW.siparis_id;

  FOR v_satir IN
    SELECT
      snapshot.id AS snapshot_id,
      snapshot.faturalanabilir_m2,
      snapshot.net_tutar,
      snapshot.created_at,
      row_number() OVER (ORDER BY snapshot.girdi_satir_no) AS satir_no,
      count(*) OVER () AS satir_sayisi
    FROM public.siparisler siparis
    JOIN public.siparis_detay_fiyat_snapshotlari snapshot
      ON snapshot.siparis_fiyat_revizyonu_id = CASE
        WHEN NEW.hareket_turu = 'siparis_farki_borc' THEN NEW.kaynak_id
        ELSE siparis.aktif_fiyat_revizyon_id
      END
    WHERE siparis.id = NEW.siparis_id
    ORDER BY snapshot.girdi_satir_no
  LOOP
    v_satir_tutari := CASE
      WHEN v_satir.satir_no = v_satir.satir_sayisi
        THEN v_hareket_kalan
      WHEN v_toplam_net > 0
        THEN round(NEW.tutar * v_satir.net_tutar / v_toplam_net, 2)
      ELSE round(NEW.tutar / v_satir.satir_sayisi, 2)
    END;
    v_hareket_kalan := v_hareket_kalan - v_satir_tutari;
    v_satir_kalan := v_satir_tutari;

    WHILE v_satir_kalan > 0 LOOP
      SELECT
        baglanti.id,
        public.cari_baglanti_kalan_tutari(baglanti.id) AS kalan
      INTO v_baglanti
      FROM public.cari_baglantilari baglanti
      WHERE baglanti.cari_id = NEW.cari_id
        AND baglanti.para_birimi::text = NEW.para_birimi
        AND baglanti.durum = 'onaylandi'
        AND public.cari_baglanti_kalan_tutari(baglanti.id) > 0
      ORDER BY baglanti.sira_no
      LIMIT 1;

      IF v_baglanti.id IS NULL THEN
        SELECT baglanti.id, 0::numeric AS kalan
        INTO v_baglanti
        FROM public.cari_baglantilari baglanti
        WHERE baglanti.cari_id = NEW.cari_id
          AND baglanti.para_birimi::text = NEW.para_birimi
          AND baglanti.durum = 'onaylandi'
        ORDER BY baglanti.sira_no DESC
        LIMIT 1;
      END IF;

      EXIT WHEN v_baglanti.id IS NULL;
      v_parca_tutari := CASE
        WHEN v_baglanti.kalan > 0
          THEN LEAST(v_satir_kalan, v_baglanti.kalan)
        ELSE v_satir_kalan
      END;
      v_karsilanan := CASE
        WHEN v_baglanti.kalan > 0 THEN v_parca_tutari
        ELSE 0
      END;
      v_sira := v_sira + 1;

      INSERT INTO public.siparis_baglanti_dagitimlari (
        cari_baglantisi_id, siparis_id, siparis_fiyat_revizyonu_id,
        siparis_detay_fiyat_snapshot_id, cari_hareketi_id, yon, sira_no,
        adet_orani, faturalanabilir_m2, toplam_tutar, karsilanan_tutar
      )
      SELECT
        v_baglanti.id, NEW.siparis_id,
        CASE
          WHEN NEW.hareket_turu = 'siparis_farki_borc' THEN NEW.kaynak_id
          ELSE siparis.aktif_fiyat_revizyon_id
        END,
        v_satir.snapshot_id, NEW.id, 'tuketim', v_sira,
        CASE WHEN v_satir_tutari = 0 THEN 1
          ELSE LEAST(v_parca_tutari / v_satir_tutari, 1) END,
        CASE WHEN v_satir_tutari = 0 THEN v_satir.faturalanabilir_m2
          ELSE round(v_satir.faturalanabilir_m2 * v_parca_tutari / v_satir_tutari, 6) END,
        v_parca_tutari,
        v_karsilanan
      FROM public.siparisler siparis
      WHERE siparis.id = NEW.siparis_id;

      v_satir_kalan := v_satir_kalan - v_parca_tutari;
      IF v_parca_tutari = 0 THEN EXIT; END IF;
    END LOOP;
  END LOOP;

  PERFORM public.cari_baglanti_etkin_fiyatini_senkronize_et(
    NEW.cari_id,
    NEW.para_birimi::public.para_birimi_kodu
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER cari_hareketleri_siparis_baglanti_dagit
  AFTER INSERT ON public.cari_hareketleri
  FOR EACH ROW EXECUTE FUNCTION public.siparis_baglanti_hareketini_dagit();

CREATE OR REPLACE FUNCTION public.cari_baglanti_acik_donem_fark_satirlari(
  p_baglanti_id uuid
)
RETURNS TABLE (
  siparis_baglanti_dagitimi_id uuid,
  stok_id uuid,
  onceki_birim_fiyat numeric,
  yeni_birim_fiyat numeric,
  acik_m2 numeric,
  kdv_orani numeric,
  fark_tutari numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    dagitim.id,
    snapshot.stok_id,
    COALESCE(son_duzeltme.yeni_birim_fiyat, snapshot.birim_fiyat),
    yeni_fiyat.birim_fiyat,
    round(
      dagitim.faturalanabilir_m2
      * GREATEST(
          dagitim.acik_tutar
            - COALESCE(kapama.tutar, 0)
            - COALESCE(iade.acik_tutar, 0),
          0
        )
      / dagitim.toplam_tutar,
      6
    ) AS acik_m2,
    kdv.kdv_orani,
    round(
      (
        yeni_fiyat.birim_fiyat
          - COALESCE(son_duzeltme.yeni_birim_fiyat, snapshot.birim_fiyat)
      )
      * dagitim.faturalanabilir_m2
      * GREATEST(
          dagitim.acik_tutar
            - COALESCE(kapama.tutar, 0)
            - COALESCE(iade.acik_tutar, 0),
          0
        )
      / dagitim.toplam_tutar
      * (1 + kdv.kdv_orani / 100),
      2
    ) AS fark_tutari
  FROM public.cari_baglantilari yeni_baglanti
  JOIN public.siparisler siparis
    ON siparis.cari_id = yeni_baglanti.cari_id
   AND siparis.para_birimi = yeni_baglanti.para_birimi::text
  JOIN public.siparis_baglanti_dagitimlari dagitim
    ON dagitim.siparis_id = siparis.id
   AND dagitim.yon = 'tuketim'
  JOIN public.siparis_detay_fiyat_snapshotlari snapshot
    ON snapshot.id = dagitim.siparis_detay_fiyat_snapshot_id
  JOIN public.fiyat_listesi_urun_kalemleri yeni_fiyat
    ON yeni_fiyat.fiyat_listesi_surumu_id = yeni_baglanti.fiyat_listesi_surumu_id
   AND yeni_fiyat.kapsam_tipi = 'stok'
   AND yeni_fiyat.stok_id = snapshot.stok_id
   AND yeni_fiyat.birim_fiyat IS NOT NULL
   AND yeni_fiyat.aktif
  JOIN public.kdv_grup_surmleri kdv
    ON kdv.id = snapshot.kdv_grup_surumu_id
  LEFT JOIN LATERAL (
    SELECT sum(tahsilat.tutar) AS tutar
    FROM public.cari_tahsilat_dagitimlari tahsilat
    WHERE tahsilat.siparis_baglanti_dagitimi_id = dagitim.id
  ) kapama ON true
  LEFT JOIN LATERAL (
    SELECT sum(ters.acik_tutar) AS acik_tutar
    FROM public.siparis_baglanti_dagitimlari ters
    WHERE ters.kaynak_dagitim_id = dagitim.id
      AND ters.yon = 'iade'
  ) iade ON true
  LEFT JOIN LATERAL (
    SELECT duzeltme.yeni_birim_fiyat
    FROM public.cari_baglanti_fiyat_duzeltmeleri duzeltme
    JOIN public.cari_baglantilari duzeltme_baglantisi
      ON duzeltme_baglantisi.id = duzeltme.cari_baglantisi_id
    WHERE duzeltme.siparis_baglanti_dagitimi_id = dagitim.id
      AND duzeltme_baglantisi.cari_id = yeni_baglanti.cari_id
      AND duzeltme_baglantisi.para_birimi = yeni_baglanti.para_birimi
    ORDER BY duzeltme_baglantisi.sira_no DESC NULLS LAST, duzeltme.created_at DESC
    LIMIT 1
  ) son_duzeltme ON true
  WHERE yeni_baglanti.id = p_baglanti_id
    AND dagitim.acik_tutar
      - COALESCE(kapama.tutar, 0)
      - COALESCE(iade.acik_tutar, 0) > 0
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_acik_donem_farki_getir(
  p_baglanti_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sonuc jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT jsonb_build_object(
    'etkilenen_satir_sayisi', count(*),
    'etkilenen_m2', COALESCE(sum(fark.acik_m2), 0),
    'fiyat_farki', COALESCE(sum(fark.fark_tutari), 0),
    'urun_gruplari', COALESCE(jsonb_agg(jsonb_build_object(
      'stok_id', fark.stok_id,
      'stok_kodu', stok.kod,
      'stok_adi', stok.ad,
      'acik_m2', fark.acik_m2,
      'onceki_birim_fiyat', fark.onceki_birim_fiyat,
      'yeni_birim_fiyat', fark.yeni_birim_fiyat,
      'fark_tutari', fark.fark_tutari
    ) ORDER BY stok.ad) FILTER (WHERE fark.stok_id IS NOT NULL), '[]'::jsonb)
  )
  INTO v_sonuc
  FROM public.cari_baglanti_acik_donem_fark_satirlari(p_baglanti_id) fark
  LEFT JOIN public.stok stok ON stok.id = fark.stok_id;

  RETURN v_sonuc;
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_acik_donemi_yeniden_fiyatla(
  p_baglanti_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_baglanti public.cari_baglantilari%ROWTYPE;
  v_fark numeric;
  v_hareket_id uuid;
BEGIN
  SELECT *
  INTO v_baglanti
  FROM public.cari_baglantilari
  WHERE id = p_baglanti_id
  FOR UPDATE;

  IF v_baglanti.id IS NULL OR v_baglanti.durum <> 'onaylandi' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ONAYLI_BAGLANTI_GEREKLI';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.siparis_baglanti_dagitimlari dagitim
    JOIN public.siparisler siparis ON siparis.id = dagitim.siparis_id
    JOIN public.siparis_detay_fiyat_snapshotlari snapshot
      ON snapshot.id = dagitim.siparis_detay_fiyat_snapshot_id
    LEFT JOIN LATERAL (
      SELECT sum(tahsilat.tutar) AS tutar
      FROM public.cari_tahsilat_dagitimlari tahsilat
      WHERE tahsilat.siparis_baglanti_dagitimi_id = dagitim.id
    ) kapama ON true
    WHERE siparis.cari_id = v_baglanti.cari_id
      AND siparis.para_birimi = v_baglanti.para_birimi::text
      AND dagitim.yon = 'tuketim'
      AND dagitim.acik_tutar - COALESCE(kapama.tutar, 0) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.fiyat_listesi_urun_kalemleri yeni_fiyat
        WHERE yeni_fiyat.fiyat_listesi_surumu_id = v_baglanti.fiyat_listesi_surumu_id
          AND yeni_fiyat.kapsam_tipi = 'stok'
          AND yeni_fiyat.stok_id = snapshot.stok_id
          AND yeni_fiyat.birim_fiyat IS NOT NULL
          AND yeni_fiyat.aktif
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BAGLANTI_ACIK_DONEM_FIYATI_EKSIK';
  END IF;

  SELECT round(COALESCE(sum(fark.fark_tutari), 0), 2)
  INTO v_fark
  FROM public.cari_baglanti_acik_donem_fark_satirlari(p_baglanti_id) fark;

  IF v_fark = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.cari_hareketleri (
    cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
    aciklama, kaynak_sinifi, kaynak_turu, kaynak_id,
    islemi_yapan, cari_baglantisi_id
  )
  VALUES (
    v_baglanti.cari_id,
    v_baglanti.para_birimi,
    CASE WHEN v_fark > 0 THEN 'borc' ELSE 'alacak' END,
    CASE
      WHEN v_fark > 0 THEN 'baglanti_fiyat_farki_borc'
      ELSE 'baglanti_fiyat_farki_alacak'
    END,
    abs(v_fark),
    now(),
    v_baglanti.baglanti_no || ' açık dönem fiyat farkı',
    'sistem',
    'cari_baglantisi',
    v_baglanti.id,
    auth.uid(),
    v_baglanti.id
  )
  RETURNING id INTO v_hareket_id;

  INSERT INTO public.cari_baglanti_fiyat_duzeltmeleri (
    cari_baglantisi_id, siparis_baglanti_dagitimi_id,
    onceki_birim_fiyat, yeni_birim_fiyat, acik_m2,
    fark_tutari, cari_hareketi_id
  )
  SELECT
    p_baglanti_id, fark.siparis_baglanti_dagitimi_id,
    fark.onceki_birim_fiyat, fark.yeni_birim_fiyat, fark.acik_m2,
    fark.fark_tutari, v_hareket_id
  FROM public.cari_baglanti_acik_donem_fark_satirlari(p_baglanti_id) fark
  WHERE fark.fark_tutari <> 0;

  RETURN v_hareket_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_onayla(
  p_baglanti_id uuid,
  p_beklenen_revision_no integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_baglanti public.cari_baglantilari%ROWTYPE;
  v_liste_id uuid;
  v_profil_surumu_id uuid;
  v_sira integer;
  v_hareket_id uuid;
  v_fiyat_farki_hareket_id uuid;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_onceki jsonb;
  v_payload jsonb;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_permission('pricing', 'manage')
     OR NOT public.has_permission('finance', 'create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'BAGLANTI_ONAY_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;

  v_payload := jsonb_build_object(
    'baglanti_id', p_baglanti_id,
    'beklenen_revision_no', p_beklenen_revision_no
  );
  v_onceki := public.ticari_idempotency_onceki_sonuc(
    'cari_baglanti_onayi', p_idempotency_key, v_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;

  SELECT * INTO v_baglanti
  FROM public.cari_baglantilari
  WHERE id = p_baglanti_id
  FOR UPDATE;

  -- FOR UPDATE beklerken aynı anahtar tamamlanmış olabilir.
  v_onceki := public.ticari_idempotency_onceki_sonuc(
    'cari_baglanti_onayi', p_idempotency_key, v_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;

  IF v_baglanti.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BAGLANTI_BULUNAMADI';
  END IF;
  IF v_baglanti.durum <> 'taslak'
     OR v_baglanti.revision_no <> p_beklenen_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'cari_baglanti:' || v_baglanti.cari_id::text || ':' || v_baglanti.para_birimi::text,
      0
    )
  );

  v_idempotency := public.ticari_idempotency_baslat(
    'cari_baglanti_onayi', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  SELECT fiyat_listesi_id INTO v_liste_id
  FROM public.fiyat_listesi_surmleri
  WHERE id = v_baglanti.fiyat_listesi_surumu_id;

  v_profil_surumu_id := public.cari_baglanti_profili_listeye_bagla(
    v_baglanti.cari_id,
    v_liste_id
  );

  SELECT COALESCE(max(sira_no), 0) + 1
  INTO v_sira
  FROM public.cari_baglantilari
  WHERE cari_id = v_baglanti.cari_id
    AND para_birimi = v_baglanti.para_birimi
    AND durum = 'onaylandi';

  PERFORM set_config('app.cari_baglanti_rpc', 'on', true);

  UPDATE public.cari_baglantilari
  SET durum = 'onaylandi',
      sira_no = v_sira,
      musteri_ticari_profil_surumu_id = v_profil_surumu_id,
      onaylayan_kullanici_id = auth.uid(),
      onaylanma_tarihi = now(),
      revision_no = revision_no + 1,
      updated_at = now()
  WHERE id = v_baglanti.id;

  -- Onay anında fiyat sürümü artık değişmezdir. Kuyrukta bekliyorsa arşiv,
  -- sıra kendisine geldiğinde etkinleştirme fonksiyonu tarafından yayında olur.
  UPDATE public.fiyat_listesi_surmleri
  SET durum = 'arsiv',
      yayinlayan_kullanici_id = auth.uid(),
      yayinlanma_tarihi = now(),
      revision_no = revision_no + 1,
      updated_at = now()
  WHERE id = v_baglanti.fiyat_listesi_surumu_id
    AND durum = 'taslak';

  v_fiyat_farki_hareket_id :=
    public.cari_baglanti_acik_donemi_yeniden_fiyatla(v_baglanti.id);

  INSERT INTO public.cari_hareketleri (
    cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
    tahsilat_yontemi, aciklama, kaynak_sinifi, kaynak_turu,
    kaynak_id, idempotency_id, islemi_yapan, cari_baglantisi_id
  )
  VALUES (
    v_baglanti.cari_id, v_baglanti.para_birimi, 'alacak',
    'baglanti_on_odeme', v_baglanti.on_odeme_tutari,
    (v_baglanti.odeme_tarihi::timestamp AT TIME ZONE 'Europe/Istanbul'),
    v_baglanti.odeme_yontemi,
    v_baglanti.baglanti_no || ' bağlantı ön ödemesi',
    'manuel', 'cari_baglantisi', v_baglanti.id,
    v_idempotency_id, auth.uid(), v_baglanti.id
  )
  RETURNING id INTO v_hareket_id;

  PERFORM public.cari_baglanti_etkin_fiyatini_senkronize_et(
    v_baglanti.cari_id,
    v_baglanti.para_birimi
  );

  v_yanit := jsonb_build_object(
    'basarili', true,
    'baglanti_id', v_baglanti.id,
    'baglanti_no', v_baglanti.baglanti_no,
    'hareket_id', v_hareket_id,
    'fiyat_farki_hareket_id', v_fiyat_farki_hareket_id,
    'sira_no', v_sira,
    'operasyon_durumu', public.cari_baglanti_operasyon_durumu(v_baglanti.id)
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_hazirlik_getir(
  p_cari_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_surum_id uuid;
  v_ana_surum_id uuid;
  v_para public.para_birimi_kodu;
  v_varsayilan_kdv_grubu_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRICING_READ_YETKISI_GEREKLI';
  END IF;

  SELECT baglanti.fiyat_listesi_surumu_id, baglanti.para_birimi
  INTO v_surum_id, v_para
  FROM public.cari_baglantilari baglanti
  WHERE baglanti.cari_id = p_cari_id
    AND baglanti.durum IN ('taslak', 'onaylandi')
  ORDER BY
    CASE WHEN baglanti.durum = 'onaylandi' THEN 0 ELSE 1 END,
    baglanti.sira_no DESC NULLS LAST,
    baglanti.created_at DESC
  LIMIT 1;

  SELECT
    COALESCE(v_para, profil_surumu.varsayilan_para_birimi),
    profil_surumu.varsayilan_kdv_grubu_id,
    (
      SELECT fiyat_surumu.id
      FROM public.fiyat_listesi_surmleri fiyat_surumu
      WHERE fiyat_surumu.fiyat_listesi_id = profil_surumu.ana_fiyat_listesi_id
        AND fiyat_surumu.durum = 'yayinda'
      ORDER BY fiyat_surumu.surum_no DESC
      LIMIT 1
    ),
    COALESCE(
      v_surum_id,
      (
        SELECT fiyat_surumu.id
        FROM public.fiyat_listesi_surmleri fiyat_surumu
        WHERE fiyat_surumu.fiyat_listesi_id = profil_surumu.musteri_fiyat_listesi_id
          AND fiyat_surumu.durum = 'yayinda'
        ORDER BY fiyat_surumu.surum_no DESC
        LIMIT 1
      )
    )
  INTO v_para, v_varsayilan_kdv_grubu_id, v_ana_surum_id, v_surum_id
  FROM public.musteri_ticari_profilleri profil
  JOIN public.musteri_ticari_profil_surmleri profil_surumu
    ON profil_surumu.musteri_ticari_profili_id = profil.id
  WHERE profil.cari_id = p_cari_id
    AND profil.aktif
    AND profil_surumu.durum = 'yayinda'
  ORDER BY profil_surumu.surum_no DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'fiyat_listesi_surumu_id', v_surum_id,
    'para_birimi', COALESCE(v_para, 'TRY'::public.para_birimi_kodu),
    'fiyatlar', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stok_id', stok.id,
        'stok_kodu', stok.kod,
        'stok_adi', stok.ad,
        'birim_fiyat', COALESCE(
          fiyat.birim_fiyat,
          ana_fiyat.birim_fiyat * (1 + COALESCE(fiyat.yuzde_fark, 0) / 100),
          ana_fiyat.birim_fiyat
        ),
        'kdv_grubu_id', COALESCE(
          fiyat.kdv_grubu_id,
          ana_fiyat.kdv_grubu_id,
          v_varsayilan_kdv_grubu_id
        ),
        'minimum_m2', COALESCE(fiyat.minimum_m2, ana_fiyat.minimum_m2),
        'en_adimi_mm', COALESCE(fiyat.en_adimi_mm, ana_fiyat.en_adimi_mm),
        'boy_adimi_mm', COALESCE(fiyat.boy_adimi_mm, ana_fiyat.boy_adimi_mm)
      ) ORDER BY stok.ad)
      FROM public.stok stok
      LEFT JOIN LATERAL (
        SELECT kalem.*
        FROM public.fiyat_listesi_urun_kalemleri kalem
        WHERE kalem.fiyat_listesi_surumu_id = v_surum_id
          AND kalem.aktif
          AND (
            (kalem.kapsam_tipi = 'stok' AND kalem.stok_id = stok.id)
            OR (kalem.kapsam_tipi = 'stok_grubu' AND kalem.stok_grubu = stok.grup)
            OR kalem.kapsam_tipi = 'genel'
          )
        ORDER BY CASE kalem.kapsam_tipi
          WHEN 'stok' THEN 1 WHEN 'stok_grubu' THEN 2 ELSE 3 END
        LIMIT 1
      ) fiyat ON true
      LEFT JOIN public.fiyat_listesi_urun_kalemleri ana_fiyat
        ON ana_fiyat.fiyat_listesi_surumu_id = v_ana_surum_id
       AND ana_fiyat.stok_id = stok.id
       AND ana_fiyat.aktif
      WHERE stok.kategori = 'cam'
        AND stok.aktif
        AND stok.ticari_kapsam IN ('satilabilir', 'her_ikisi')
    ), '[]'::jsonb),
    'kdv_gruplari', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'kod', kod, 'ad', ad) ORDER BY kod)
      FROM public.kdv_gruplari
      WHERE aktif
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_detay_ozeti_getir(
  p_cari_id uuid,
  p_sayfa integer DEFAULT 1,
  p_sayfa_boyutu integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sayfa integer := GREATEST(COALESCE(p_sayfa, 1), 1);
  v_boyut integer := LEAST(GREATEST(COALESCE(p_sayfa_boyutu, 25), 1), 100);
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_permission('cari', 'read')
    OR public.has_permission('finance', 'read')
    OR public.has_permission('orders', 'read')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CARI_DETAY_OKUMA_YETKISI_GEREKLI';
  END IF;

  RETURN jsonb_build_object(
    'bakiyeler', CASE
      WHEN public.has_permission('finance', 'read') THEN COALESCE((
      SELECT jsonb_agg(to_jsonb(ozet) ORDER BY ozet.para_birimi)
      FROM public.cari_bakiye_ozetleri ozet
      WHERE ozet.cari_id = p_cari_id
      ), '[]'::jsonb)
      ELSE '[]'::jsonb
    END,
    'baglantilar', CASE
      WHEN public.has_permission('pricing', 'read')
        OR public.has_permission('finance', 'read')
        OR public.has_permission('cari', 'read') THEN COALESCE((
      SELECT jsonb_agg(
        to_jsonb(baglanti)
        || jsonb_build_object(
          'kalan_tutar', public.cari_baglanti_kalan_tutari(baglanti.id),
          'operasyon_durumu', public.cari_baglanti_operasyon_durumu(baglanti.id),
          'fiyatlar', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'stok_id', fiyat.stok_id,
              'stok_kodu', stok.kod,
              'stok_adi', stok.ad,
              'birim_fiyat', fiyat.birim_fiyat,
              'kdv_grubu_id', fiyat.kdv_grubu_id,
              'minimum_m2', fiyat.minimum_m2,
              'en_adimi_mm', fiyat.en_adimi_mm,
              'boy_adimi_mm', fiyat.boy_adimi_mm
            ) ORDER BY stok.ad)
            FROM public.fiyat_listesi_urun_kalemleri fiyat
            LEFT JOIN public.stok stok ON stok.id = fiyat.stok_id
            WHERE fiyat.fiyat_listesi_surumu_id = baglanti.fiyat_listesi_surumu_id
              AND fiyat.aktif
              AND fiyat.kapsam_tipi = 'stok'
          ), '[]'::jsonb)
        )
        ORDER BY baglanti.created_at DESC
      )
      FROM public.cari_baglantilari baglanti
      WHERE baglanti.cari_id = p_cari_id
      ), '[]'::jsonb)
      ELSE '[]'::jsonb
    END,
    'siparis_toplami', (
      SELECT count(*) FROM public.siparisler WHERE cari_id = p_cari_id
    ),
    'siparisler', COALESCE((
      SELECT jsonb_agg(satir ORDER BY satir.created_at DESC)
      FROM (
        SELECT
          siparis.id, siparis.siparis_no, siparis.tarih, siparis.created_at,
          siparis.durum, siparis.para_birimi, siparis.kaynak,
          siparis.alt_musteri, siparis.harici_siparis_no,
          revizyon.genel_toplam,
          COALESCE(sum(detay.adet), 0) AS adet,
          COALESCE(sum(detay.genislik_mm * detay.yukseklik_mm * detay.adet) / 1000000, 0) AS m2
        FROM public.siparisler siparis
        LEFT JOIN public.siparis_fiyat_revizyonlari revizyon
          ON revizyon.id = siparis.aktif_fiyat_revizyon_id
        LEFT JOIN public.siparis_detaylari detay
          ON detay.siparis_id = siparis.id AND detay.aktif
        WHERE siparis.cari_id = p_cari_id
        GROUP BY siparis.id, revizyon.genel_toplam
        ORDER BY siparis.created_at DESC
        OFFSET (v_sayfa - 1) * v_boyut
        LIMIT v_boyut
      ) satir
    ), '[]'::jsonb),
    'hareketler', CASE
      WHEN public.has_permission('finance', 'read') THEN COALESCE((
      SELECT jsonb_agg(to_jsonb(hareket) ORDER BY hareket.islem_tarihi DESC, hareket.id DESC)
      FROM (
        SELECT *
        FROM public.cari_hareketleri
        WHERE cari_id = p_cari_id
        ORDER BY islem_tarihi DESC, id DESC
        LIMIT 100
      ) hareket
      ), '[]'::jsonb)
      ELSE '[]'::jsonb
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_baglanti_fiyatlarini_uygula(
  p_belge jsonb,
  p_sonuc jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cari_id uuid := public.ticari_guvenli_uuid(p_belge ->> 'cari_id');
  v_para public.para_birimi_kodu;
  v_genel numeric := public.ticari_guvenli_numeric(p_sonuc ->> 'genel_toplam');
  v_kalan numeric;
  v_kullanim numeric;
  v_baglanti record;
  v_son_baglanti_id uuid;
  v_fark_net numeric;
  v_fark_kdv numeric;
  v_yeni_net numeric;
  v_yeni_kdv numeric;
  v_yeni_genel numeric;
  v_baglam jsonb;
  v_sonuc jsonb := p_sonuc - 'sonuc_hash';
BEGIN
  IF COALESCE(NULLIF(p_belge ->> 'belge_turu', ''), 'siparis') <> 'siparis'
     OR v_cari_id IS NULL
     OR v_genel IS NULL
     OR v_genel <= 0
     OR NOT COALESCE((p_sonuc ->> 'gecerli')::boolean, false) THEN
    RETURN p_sonuc;
  END IF;

  BEGIN
    v_para := (p_sonuc ->> 'para_birimi')::public.para_birimi_kodu;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN p_sonuc;
  END;

  DROP TABLE IF EXISTS pg_temp.ticari_baglanti_onizleme_oranlari;
  CREATE TEMP TABLE ticari_baglanti_onizleme_oranlari (
    baglanti_id uuid PRIMARY KEY,
    fiyat_listesi_surumu_id uuid NOT NULL,
    sira_no integer NOT NULL,
    oran numeric NOT NULL
  ) ON COMMIT DROP;

  v_kalan := v_genel;
  FOR v_baglanti IN
    SELECT
      baglanti.id,
      baglanti.fiyat_listesi_surumu_id,
      baglanti.sira_no,
      public.cari_baglanti_kalan_tutari(baglanti.id) AS kalan_kredi
    FROM public.cari_baglantilari baglanti
    WHERE baglanti.cari_id = v_cari_id
      AND baglanti.para_birimi = v_para
      AND baglanti.durum = 'onaylandi'
      AND public.cari_baglanti_kalan_tutari(baglanti.id) > 0
    ORDER BY baglanti.sira_no
  LOOP
    EXIT WHEN v_kalan <= 0;
    v_kullanim := LEAST(v_kalan, v_baglanti.kalan_kredi);
    INSERT INTO pg_temp.ticari_baglanti_onizleme_oranlari (
      baglanti_id, fiyat_listesi_surumu_id, sira_no, oran
    )
    VALUES (
      v_baglanti.id,
      v_baglanti.fiyat_listesi_surumu_id,
      v_baglanti.sira_no,
      v_kullanim / v_genel
    );
    v_kalan := v_kalan - v_kullanim;
  END LOOP;

  IF v_kalan > 0 THEN
    SELECT baglanti.id, baglanti.fiyat_listesi_surumu_id, baglanti.sira_no
    INTO v_baglanti
    FROM public.cari_baglantilari baglanti
    WHERE baglanti.cari_id = v_cari_id
      AND baglanti.para_birimi = v_para
      AND baglanti.durum = 'onaylandi'
    ORDER BY baglanti.sira_no DESC
    LIMIT 1;

    IF v_baglanti.id IS NOT NULL THEN
      INSERT INTO pg_temp.ticari_baglanti_onizleme_oranlari (
        baglanti_id, fiyat_listesi_surumu_id, sira_no, oran
      )
      VALUES (
        v_baglanti.id,
        v_baglanti.fiyat_listesi_surumu_id,
        v_baglanti.sira_no,
        v_kalan / v_genel
      )
      ON CONFLICT (baglanti_id) DO UPDATE
      SET oran = ticari_baglanti_onizleme_oranlari.oran + EXCLUDED.oran;
    END IF;
  END IF;

  IF (SELECT count(*) FROM pg_temp.ticari_baglanti_onizleme_oranlari) <= 1 THEN
    RETURN p_sonuc;
  END IF;

  DROP TABLE IF EXISTS pg_temp.ticari_baglanti_onizleme_farklari;
  CREATE TEMP TABLE ticari_baglanti_onizleme_farklari (
    satir_no integer PRIMARY KEY,
    yeni_birim_fiyat numeric NOT NULL,
    fark_net numeric NOT NULL,
    kdv_grup_surumu_id uuid NOT NULL,
    kdv_orani numeric NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.ticari_baglanti_onizleme_farklari (
    satir_no, yeni_birim_fiyat, fark_net, kdv_grup_surumu_id, kdv_orani
  )
  SELECT
    public.ticari_guvenli_integer(satir.value ->> 'satir_no'),
    round(sum(
      oran.oran * COALESCE(
        fiyat.birim_fiyat,
        public.ticari_guvenli_numeric(satir.value ->> 'birim_fiyat')
      )
    ), 6),
    round(
      (
        sum(
          oran.oran * COALESCE(
            fiyat.birim_fiyat,
            public.ticari_guvenli_numeric(satir.value ->> 'birim_fiyat')
          )
        )
        - public.ticari_guvenli_numeric(satir.value ->> 'birim_fiyat')
      )
      * public.ticari_guvenli_numeric(satir.value ->> 'faturalanabilir_m2'),
      2
    ),
    public.ticari_guvenli_uuid(satir.value ->> 'kdv_grup_surumu_id'),
    kdv.kdv_orani
  FROM jsonb_array_elements(COALESCE(p_sonuc -> 'satirlar', '[]'::jsonb)) satir(value)
  CROSS JOIN pg_temp.ticari_baglanti_onizleme_oranlari oran
  LEFT JOIN public.fiyat_listesi_urun_kalemleri fiyat
    ON fiyat.fiyat_listesi_surumu_id = oran.fiyat_listesi_surumu_id
   AND fiyat.kapsam_tipi = 'stok'
   AND fiyat.stok_id = public.ticari_guvenli_uuid(satir.value ->> 'stok_id')
   AND fiyat.birim_fiyat IS NOT NULL
   AND fiyat.aktif
  JOIN public.kdv_grup_surmleri kdv
    ON kdv.id = public.ticari_guvenli_uuid(satir.value ->> 'kdv_grup_surumu_id')
  GROUP BY
    satir.value,
    kdv.kdv_orani;

  SELECT
    round(COALESCE(sum(fark_net), 0), 2),
    round(COALESCE(sum(round(fark_net * kdv_orani / 100, 2)), 0), 2)
  INTO v_fark_net, v_fark_kdv
  FROM pg_temp.ticari_baglanti_onizleme_farklari;

  IF v_fark_net = 0 AND v_fark_kdv = 0 THEN
    RETURN p_sonuc;
  END IF;

  v_sonuc := jsonb_set(
    v_sonuc,
    '{satirlar}',
    COALESCE((
      SELECT jsonb_agg(
        CASE WHEN fark.satir_no IS NULL THEN satir.value
        ELSE satir.value || jsonb_build_object(
          'birim_fiyat', fark.yeni_birim_fiyat,
          'brut_tutar',
            public.ticari_guvenli_numeric(satir.value ->> 'brut_tutar') + fark.fark_net,
          'net_tutar',
            public.ticari_guvenli_numeric(satir.value ->> 'net_tutar') + fark.fark_net,
          'tahmini_kar',
            public.ticari_guvenli_numeric(satir.value ->> 'tahmini_kar') + fark.fark_net
        ) END
        ORDER BY satir.ordinality
      )
      FROM jsonb_array_elements(COALESCE(v_sonuc -> 'satirlar', '[]'::jsonb))
        WITH ORDINALITY satir(value, ordinality)
      LEFT JOIN pg_temp.ticari_baglanti_onizleme_farklari fark
        ON fark.satir_no = public.ticari_guvenli_integer(satir.value ->> 'satir_no')
    ), '[]'::jsonb)
  );

  v_sonuc := jsonb_set(
    v_sonuc,
    '{bilesenler}',
    COALESCE((
      SELECT jsonb_agg(
        CASE
          WHEN bilesen.value ->> 'bilesen_turu' = 'urun'
            AND fark.satir_no IS NOT NULL
          THEN bilesen.value || jsonb_build_object(
            'birim_fiyat', fark.yeni_birim_fiyat,
            'liste_tutari',
              public.ticari_guvenli_numeric(bilesen.value ->> 'liste_tutari') + fark.fark_net,
            'net_tutar',
              public.ticari_guvenli_numeric(bilesen.value ->> 'net_tutar') + fark.fark_net
          )
          ELSE bilesen.value
        END
        ORDER BY bilesen.ordinality
      )
      FROM jsonb_array_elements(COALESCE(v_sonuc -> 'bilesenler', '[]'::jsonb))
        WITH ORDINALITY bilesen(value, ordinality)
      LEFT JOIN pg_temp.ticari_baglanti_onizleme_farklari fark
        ON fark.satir_no = public.ticari_guvenli_integer(bilesen.value ->> 'satir_no')
    ), '[]'::jsonb)
  );

  v_sonuc := jsonb_set(
    v_sonuc,
    '{kdv_ozetleri}',
    COALESCE((
      SELECT jsonb_agg(
        kdv.value || jsonb_build_object(
          'matrah',
            public.ticari_guvenli_numeric(kdv.value ->> 'matrah')
              + COALESCE(fark.fark_net, 0),
          'kdv_tutari', round(
            (
              public.ticari_guvenli_numeric(kdv.value ->> 'matrah')
                + COALESCE(fark.fark_net, 0)
            )
            * public.ticari_guvenli_numeric(kdv.value ->> 'kdv_orani') / 100,
            2
          )
        )
        ORDER BY kdv.ordinality
      )
      FROM jsonb_array_elements(COALESCE(v_sonuc -> 'kdv_ozetleri', '[]'::jsonb))
        WITH ORDINALITY kdv(value, ordinality)
      LEFT JOIN (
        SELECT kdv_grup_surumu_id, sum(fark_net) AS fark_net
        FROM pg_temp.ticari_baglanti_onizleme_farklari
        GROUP BY kdv_grup_surumu_id
      ) fark
        ON fark.kdv_grup_surumu_id =
          public.ticari_guvenli_uuid(kdv.value ->> 'kdv_grup_surumu_id')
    ), '[]'::jsonb)
  );

  v_yeni_net := round(public.ticari_guvenli_numeric(v_sonuc ->> 'kdv_haric_tutar') + v_fark_net, 2);
  v_yeni_kdv := round(public.ticari_guvenli_numeric(v_sonuc ->> 'kdv_tutari') + v_fark_kdv, 2);
  v_yeni_genel := round(v_yeni_net + v_yeni_kdv, 2);
  v_sonuc := v_sonuc || jsonb_build_object(
    'kdv_haric_tutar', v_yeni_net,
    'kdv_tutari', v_yeni_kdv,
    'genel_toplam', v_yeni_genel,
    'tahmini_kar',
      public.ticari_guvenli_numeric(v_sonuc ->> 'tahmini_kar') + v_fark_net,
    'hesaplama_surumu', COALESCE(v_sonuc ->> 'hesaplama_surumu', '1') || '+baglanti-v1'
  );

  SELECT baglanti_id
  INTO v_son_baglanti_id
  FROM pg_temp.ticari_baglanti_onizleme_oranlari
  ORDER BY sira_no DESC
  LIMIT 1;

  v_baglam := COALESCE(v_sonuc -> 'fiyat_baglami', '{}'::jsonb)
    || jsonb_build_object(
      'baglanti_fiyat_listesi_surumu_idleri',
      (
        SELECT jsonb_agg(jsonb_build_object(
          'baglanti_id', baglanti_id,
          'fiyat_listesi_surumu_id', fiyat_listesi_surumu_id,
          'oran', oran
        ) ORDER BY sira_no)
        FROM pg_temp.ticari_baglanti_onizleme_oranlari
      ),
      'son_baglanti_id', v_son_baglanti_id
    );
  v_sonuc := jsonb_set(v_sonuc, '{fiyat_baglami}', v_baglam);
  v_sonuc := jsonb_set(
    v_sonuc,
    '{fiyat_baglam_hash}',
    to_jsonb(public.ticari_json_hash(v_baglam))
  );

  RETURN v_sonuc || jsonb_build_object('sonuc_hash', public.ticari_json_hash(v_sonuc));
END;
$$;

CREATE OR REPLACE FUNCTION public.ticari_fiyat_sonucunu_zenginlestir(
  p_belge jsonb,
  p_sonuc jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sonuc jsonb := p_sonuc - 'sonuc_hash';
  v_cari_id uuid := public.ticari_guvenli_uuid(p_belge ->> 'cari_id');
  v_para public.para_birimi_kodu := (p_sonuc ->> 'para_birimi')::public.para_birimi_kodu;
  v_genel numeric := public.ticari_guvenli_numeric(p_sonuc ->> 'genel_toplam');
  v_net_bakiye numeric;
  v_ilk_baglanti_kredisi numeric;
  v_kullanilabilir_baglanti_sayisi integer;
  v_baglanti_etiketi text;
BEGIN
  SELECT net_bakiye INTO v_net_bakiye
  FROM public.cari_bakiye_ozetleri
  WHERE cari_id = v_cari_id AND para_birimi = v_para;

  SELECT
    min(public.cari_baglanti_kalan_tutari(baglanti.id))
      FILTER (WHERE baglanti.sira_no = (
        SELECT min(ilk.sira_no)
        FROM public.cari_baglantilari ilk
        WHERE ilk.cari_id = v_cari_id
          AND ilk.para_birimi = v_para
          AND ilk.durum = 'onaylandi'
          AND public.cari_baglanti_kalan_tutari(ilk.id) > 0
      )),
    count(*) FILTER (WHERE public.cari_baglanti_kalan_tutari(baglanti.id) > 0),
    string_agg(
      baglanti.baglanti_no,
      ' → ' ORDER BY baglanti.sira_no
    ) FILTER (
      WHERE public.cari_baglanti_kalan_tutari(baglanti.id) > 0
        OR baglanti.sira_no = (
          SELECT max(son.sira_no)
          FROM public.cari_baglantilari son
          WHERE son.cari_id = v_cari_id
            AND son.para_birimi = v_para
            AND son.durum = 'onaylandi'
        )
    )
  INTO v_ilk_baglanti_kredisi, v_kullanilabilir_baglanti_sayisi, v_baglanti_etiketi
  FROM public.cari_baglantilari baglanti
  WHERE baglanti.cari_id = v_cari_id
    AND baglanti.para_birimi = v_para
    AND baglanti.durum = 'onaylandi';

  IF jsonb_array_length(COALESCE(
    p_sonuc -> 'fiyat_baglami' -> 'baglanti_fiyat_listesi_surumu_idleri',
    '[]'::jsonb
  )) > 0 THEN
    SELECT count(*), string_agg(baglanti.baglanti_no, ' → ' ORDER BY baglanti.sira_no)
    INTO v_kullanilabilir_baglanti_sayisi, v_baglanti_etiketi
    FROM jsonb_array_elements(
      p_sonuc -> 'fiyat_baglami' -> 'baglanti_fiyat_listesi_surumu_idleri'
    ) oran(value)
    JOIN public.cari_baglantilari baglanti
      ON baglanti.id = public.ticari_guvenli_uuid(oran.value ->> 'baglanti_id')
    WHERE public.ticari_guvenli_numeric(oran.value ->> 'oran') > 0;
  END IF;

  v_sonuc := v_sonuc || jsonb_build_object(
    'urun_gruplari', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stok_id', grup.stok_id,
        'stok_kodu', stok.kod,
        'stok_adi', stok.ad,
        'adet', grup.adet,
        'gercek_m2', grup.gercek_m2,
        'faturalanabilir_m2', grup.faturalanabilir_m2,
        'birim_fiyat', grup.birim_fiyat,
        'grup_toplami', grup.grup_toplami,
        'baglanti_no', v_baglanti_etiketi,
        'fiyat_durumu', CASE
          WHEN grup.birim_fiyat IS NULL THEN 'eksik'
          WHEN COALESCE(v_kullanilabilir_baglanti_sayisi, 0) > 1
            AND (
              jsonb_array_length(COALESCE(
                p_sonuc -> 'fiyat_baglami' -> 'baglanti_fiyat_listesi_surumu_idleri',
                '[]'::jsonb
              )) > 1
              OR COALESCE(v_genel, 0) > COALESCE(v_ilk_baglanti_kredisi, 0)
            )
            THEN 'birden_fazla_baglanti'
          ELSE 'bulundu'
        END
      ) ORDER BY stok.ad)
      FROM (
        SELECT
          public.ticari_guvenli_uuid(satir.value ->> 'stok_id') AS stok_id,
          sum(public.ticari_guvenli_numeric(satir.value ->> 'adet')) AS adet,
          sum(
            public.ticari_guvenli_numeric(satir.value ->> 'genislik_mm')
            * public.ticari_guvenli_numeric(satir.value ->> 'yukseklik_mm')
            * public.ticari_guvenli_numeric(satir.value ->> 'adet')
            / 1000000
          )::numeric(18,6) AS gercek_m2,
          sum(public.ticari_guvenli_numeric(satir.value ->> 'faturalanabilir_m2'))::numeric(18,6)
            AS faturalanabilir_m2,
          min(public.ticari_guvenli_numeric(satir.value ->> 'birim_fiyat'))::numeric(18,6)
            AS birim_fiyat,
          sum(public.ticari_guvenli_numeric(satir.value ->> 'net_tutar'))::numeric(18,2)
            AS grup_toplami
        FROM jsonb_array_elements(COALESCE(p_sonuc -> 'satirlar', '[]'::jsonb)) satir(value)
        GROUP BY public.ticari_guvenli_uuid(satir.value ->> 'stok_id')
      ) grup
      JOIN public.stok stok ON stok.id = grup.stok_id
    ), '[]'::jsonb),
    'baglanti_dagilimlari', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'baglanti_id', baglanti.id,
        'baglanti_no', baglanti.baglanti_no,
        'operasyon_durumu', public.cari_baglanti_operasyon_durumu(baglanti.id),
        'kalan_tutar', public.cari_baglanti_kalan_tutari(baglanti.id),
        'para_birimi', baglanti.para_birimi,
        'tahmini_oran', COALESCE((
          SELECT public.ticari_guvenli_numeric(oran.value ->> 'oran')
          FROM jsonb_array_elements(
            COALESCE(
              p_sonuc -> 'fiyat_baglami' -> 'baglanti_fiyat_listesi_surumu_idleri',
              '[]'::jsonb
            )
          ) oran(value)
          WHERE public.ticari_guvenli_uuid(oran.value ->> 'baglanti_id') = baglanti.id
          LIMIT 1
        ), 0),
        'tahmini_kullanilan_tutar', round(COALESCE(v_genel, 0) * COALESCE((
          SELECT public.ticari_guvenli_numeric(oran.value ->> 'oran')
          FROM jsonb_array_elements(
            COALESCE(
              p_sonuc -> 'fiyat_baglami' -> 'baglanti_fiyat_listesi_surumu_idleri',
              '[]'::jsonb
            )
          ) oran(value)
          WHERE public.ticari_guvenli_uuid(oran.value ->> 'baglanti_id') = baglanti.id
          LIMIT 1
        ), 0), 2)
      ) ORDER BY baglanti.sira_no)
      FROM public.cari_baglantilari baglanti
      WHERE baglanti.cari_id = v_cari_id
        AND baglanti.para_birimi = v_para
        AND baglanti.durum = 'onaylandi'
        AND (
          public.cari_baglanti_kalan_tutari(baglanti.id) > 0
          OR baglanti.sira_no = (
            SELECT max(son.sira_no)
            FROM public.cari_baglantilari son
            WHERE son.cari_id = v_cari_id
              AND son.para_birimi = v_para
              AND son.durum = 'onaylandi'
          )
        )
    ), '[]'::jsonb),
    'cari_etkisi', jsonb_build_object(
      'onceki_net_bakiye', COALESCE(v_net_bakiye, 0),
      'siparis_borcu', COALESCE(v_genel, 0),
      'sonraki_net_bakiye', COALESCE(v_net_bakiye, 0) + COALESCE(v_genel, 0),
      'para_birimi', v_para
    )
  );
  RETURN v_sonuc || jsonb_build_object('sonuc_hash', public.ticari_json_hash(v_sonuc));
END;
$$;

-- Önizleme kayda çevrilirken bağlantı kredisi de fiyat bağlamının parçasıdır.
-- Kilit doğrulama öncesinde alınır ve çağıran sipariş transaction'ı bitene kadar
-- tutulur; böylece eşzamanlı iki sipariş aynı kredi dilimini kullanamaz.
CREATE OR REPLACE FUNCTION public.fiyat_onizlemesini_dogrula(
  p_onizleme_id uuid,
  p_onizleme_hash text,
  p_payload jsonb,
  p_sabit_baglam jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_onizleme public.fiyat_onizlemeleri%ROWTYPE;
  v_guncel jsonb;
  v_degisen text[];
  v_cari_id uuid := public.ticari_guvenli_uuid(p_payload ->> 'cari_id');
  v_para public.para_birimi_kodu;
  v_belge_turu text := COALESCE(NULLIF(p_payload ->> 'belge_turu', ''), 'siparis');
BEGIN
  IF v_belge_turu = 'siparis' AND v_cari_id IS NOT NULL THEN
    BEGIN
      IF NULLIF(p_payload ->> 'para_birimi', '') IS NOT NULL THEN
        v_para := (p_payload ->> 'para_birimi')::public.para_birimi_kodu;
      ELSE
        SELECT profil_surumu.varsayilan_para_birimi
        INTO v_para
        FROM public.musteri_ticari_profilleri profil
        JOIN public.musteri_ticari_profil_surmleri profil_surumu
          ON profil_surumu.musteri_ticari_profili_id = profil.id
        WHERE profil.cari_id = v_cari_id
          AND profil.aktif
          AND profil_surumu.durum = 'yayinda'
        ORDER BY profil_surumu.surum_no DESC
        LIMIT 1;
        v_para := COALESCE(v_para, 'TRY'::public.para_birimi_kodu);
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      v_para := 'TRY';
    END;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('cari_baglanti:' || v_cari_id::text || ':' || v_para::text, 0)
    );
    PERFORM public.cari_baglanti_etkin_fiyatini_senkronize_et(v_cari_id, v_para);
  END IF;

  SELECT *
  INTO v_onizleme
  FROM public.fiyat_onizlemeleri
  WHERE id = p_onizleme_id
    AND kullanici_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('gecerli', false, 'hata_kodu', 'FIYAT_ONIZLEME_BULUNAMADI');
  END IF;
  IF v_onizleme.gecersiz_kilindi_at IS NOT NULL OR v_onizleme.sona_erme_tarihi <= now() THEN
    RETURN jsonb_build_object('gecerli', false, 'hata_kodu', 'FIYAT_ONIZLEME_SURESI_DOLDU');
  END IF;
  IF p_onizleme_hash IS DISTINCT FROM v_onizleme.sonuc_hash THEN
    RETURN jsonb_build_object('gecerli', false, 'hata_kodu', 'FIYAT_ONIZLEME_HASH_GECERSIZ');
  END IF;
  IF public.ticari_json_hash(p_payload) <> v_onizleme.girdi_hash THEN
    RETURN jsonb_build_object('gecerli', false, 'hata_kodu', 'FIYAT_ONIZLEME_GIRDI_CAKISMASI');
  END IF;
  IF NOT COALESCE((v_onizleme.sonuc_json ->> 'gecerli')::boolean, false) THEN
    RETURN jsonb_build_object(
      'gecerli', false,
      'hata_kodu', 'FIYAT_ONIZLEME_GECERSIZ',
      'hatalar', v_onizleme.sonuc_json -> 'hatalar'
    );
  END IF;

  v_guncel := public.fiyat_hesapla_internal(p_payload, p_sabit_baglam);
  v_guncel := public.ticari_baglanti_fiyatlarini_uygula(p_payload, v_guncel);
  v_guncel := public.ticari_fiyat_sonucunu_zenginlestir(p_payload, v_guncel);

  IF v_guncel ->> 'fiyat_baglam_hash' IS DISTINCT FROM v_onizleme.fiyat_baglam_hash
     OR v_guncel ->> 'sonuc_hash' IS DISTINCT FROM v_onizleme.sonuc_hash THEN
    SELECT array_agg(key ORDER BY key)
    INTO v_degisen
    FROM (
      SELECT key FROM jsonb_object_keys(v_onizleme.fiyat_baglami) AS eski(key)
      UNION
      SELECT key FROM jsonb_object_keys(v_guncel -> 'fiyat_baglami') AS yeni(key)
    ) anahtarlar
    WHERE v_onizleme.fiyat_baglami -> key
      IS DISTINCT FROM (v_guncel -> 'fiyat_baglami') -> key;

    RETURN jsonb_build_object(
      'gecerli', false,
      'hata_kodu', 'FIYAT_ONIZLEME_CAKISMASI',
      'degisen_kaynaklar', COALESCE(to_jsonb(v_degisen), '[]'::jsonb),
      'yeni_sonuc', CASE
        WHEN public.has_permission('pricing', 'read') THEN v_guncel
        ELSE public.ticari_fiyat_sonucunu_maskele(v_guncel)
          || jsonb_build_object(
            'urun_gruplari', v_guncel -> 'urun_gruplari',
            'baglanti_dagilimlari', v_guncel -> 'baglanti_dagilimlari'
          )
      END
    );
  END IF;

  RETURN jsonb_build_object('gecerli', true, 'sonuc', v_onizleme.sonuc_json);
END;
$$;

-- Yeni sipariş önizlemesinden hemen önce bağlantı kuyruğunun etkin fiyat
-- sürümünü senkronize eder ve sonucu UI için ürün gruplarıyla zenginleştirir.
CREATE OR REPLACE FUNCTION public.fiyat_onizle(p_belge jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sonuc jsonb;
  v_onizleme_id uuid;
  v_belge_turu text := COALESCE(NULLIF(p_belge ->> 'belge_turu', ''), 'siparis');
  v_mod public.ticari_modul_modu;
  v_yanit_sonuc jsonb;
  v_sabit_baglam jsonb;
  v_belge_id uuid;
  v_beklenen_revision_no integer;
  v_cari_id uuid;
  v_para public.para_birimi_kodu;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OTURUM_GEREKLI';
  END IF;
  IF NOT (
    public.has_permission('orders', 'create')
    OR public.has_permission('orders', 'update')
    OR public.has_permission('pricing', 'read')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FIYAT_ONIZLEME_YETKISI_GEREKLI';
  END IF;
  IF v_belge_turu NOT IN ('siparis', 'teklif', 'golge') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BELGE_TURU_GECERSIZ';
  END IF;

  SELECT mod INTO v_mod FROM public.ticari_modul_durumu WHERE singleton;
  IF v_mod = 'bakim' AND (p_belge ->> 'belge_id') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FEATURE_MODE_ISLEME_KAPALI';
  END IF;

  v_belge_id := public.ticari_guvenli_uuid(p_belge ->> 'belge_id');
  v_beklenen_revision_no := public.ticari_guvenli_integer(p_belge ->> 'beklenen_revision_no');
  v_cari_id := public.ticari_guvenli_uuid(p_belge ->> 'cari_id');
  BEGIN
    IF NULLIF(p_belge ->> 'para_birimi', '') IS NOT NULL THEN
      v_para := (p_belge ->> 'para_birimi')::public.para_birimi_kodu;
    ELSE
      SELECT profil_surumu.varsayilan_para_birimi
      INTO v_para
      FROM public.musteri_ticari_profilleri profil
      JOIN public.musteri_ticari_profil_surmleri profil_surumu
        ON profil_surumu.musteri_ticari_profili_id = profil.id
      WHERE profil.cari_id = v_cari_id
        AND profil.aktif
        AND profil_surumu.durum = 'yayinda'
      ORDER BY profil_surumu.surum_no DESC
      LIMIT 1;
      v_para := COALESCE(v_para, 'TRY'::public.para_birimi_kodu);
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    v_para := 'TRY';
  END;

  IF v_belge_turu = 'siparis' AND v_belge_id IS NULL AND v_cari_id IS NOT NULL THEN
    PERFORM public.cari_baglanti_etkin_fiyatini_senkronize_et(v_cari_id, v_para);
  END IF;

  IF v_belge_turu = 'siparis' AND v_belge_id IS NOT NULL THEN
    SELECT onizleme.fiyat_baglami
    INTO v_sabit_baglam
    FROM public.siparisler siparis
    JOIN public.siparis_fiyat_revizyonlari revizyon
      ON revizyon.id = siparis.aktif_fiyat_revizyon_id
    JOIN public.fiyat_onizlemeleri onizleme ON onizleme.id = revizyon.onizleme_id
    WHERE siparis.id = v_belge_id
      AND siparis.fiyatlandirildi
      AND (v_beklenen_revision_no IS NULL OR siparis.revision_no = v_beklenen_revision_no);
    IF v_sabit_baglam IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
    END IF;
  ELSIF v_belge_turu = 'teklif' AND v_belge_id IS NOT NULL THEN
    SELECT revizyon.fiyat_baglami
    INTO v_sabit_baglam
    FROM public.teklifler teklif
    JOIN public.teklif_revizyonlari revizyon ON revizyon.id = teklif.aktif_revizyon_id
    WHERE teklif.id = v_belge_id
      AND (v_beklenen_revision_no IS NULL OR teklif.revision_no = v_beklenen_revision_no);
    IF v_sabit_baglam IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
    END IF;
    IF COALESCE(p_belge -> 'fiyat_baglamini_yenile', 'false'::jsonb) = 'true'::jsonb THEN
      v_sabit_baglam := NULL;
    END IF;
  END IF;

  v_sonuc := public.fiyat_hesapla_internal(p_belge, v_sabit_baglam);
  v_sonuc := public.ticari_baglanti_fiyatlarini_uygula(p_belge, v_sonuc);
  v_sonuc := public.ticari_fiyat_sonucunu_zenginlestir(p_belge, v_sonuc);

  INSERT INTO public.fiyat_onizlemeleri (
    kullanici_id, belge_turu, belge_id, girdi_json, girdi_hash,
    fiyat_baglami, fiyat_baglam_hash, sonuc_json, sonuc_hash,
    kullanilan_surumluler, hesaplama_surumu
  )
  VALUES (
    auth.uid(), v_belge_turu, public.ticari_guvenli_uuid(p_belge ->> 'belge_id'),
    p_belge, v_sonuc ->> 'girdi_hash', v_sonuc -> 'fiyat_baglami',
    v_sonuc ->> 'fiyat_baglam_hash', v_sonuc, v_sonuc ->> 'sonuc_hash',
    v_sonuc -> 'fiyat_baglami', v_sonuc ->> 'hesaplama_surumu'
  )
  RETURNING id INTO v_onizleme_id;

  v_yanit_sonuc := CASE
    WHEN public.has_permission('pricing', 'read') THEN v_sonuc
    ELSE public.ticari_fiyat_sonucunu_maskele(v_sonuc)
      || jsonb_build_object(
        'urun_gruplari', v_sonuc -> 'urun_gruplari',
        'baglanti_dagilimlari', v_sonuc -> 'baglanti_dagilimlari'
      )
      || CASE
        WHEN public.has_permission('finance', 'read')
          THEN jsonb_build_object('cari_etkisi', v_sonuc -> 'cari_etkisi')
        ELSE '{}'::jsonb
      END
  END;

  RETURN jsonb_build_object(
    'onizleme_id', v_onizleme_id,
    'sona_erme_tarihi', now() + interval '30 minutes',
    'girdi_hash', v_sonuc ->> 'girdi_hash',
    'fiyat_baglam_hash', v_sonuc ->> 'fiyat_baglam_hash',
    'sonuc_hash', v_sonuc ->> 'sonuc_hash',
    'sonuc', v_yanit_sonuc
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_append_only_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BAGLANTI_DAGITIMI_DEGISTIRILEMEZ';
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_baglanti_onayli_kaydi_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CARI_BAGLANTISI_SILINEMEZ';
  END IF;
  IF OLD.durum <> 'taslak'
     AND COALESCE(current_setting('app.cari_baglanti_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ONAYLI_CARI_BAGLANTISI_DEGISTIRILEMEZ';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cari_baglantilari_approved_immutable
  BEFORE UPDATE OR DELETE ON public.cari_baglantilari
  FOR EACH ROW EXECUTE FUNCTION public.cari_baglanti_onayli_kaydi_koru();
CREATE TRIGGER siparis_baglanti_dagitimlari_immutable
  BEFORE UPDATE OR DELETE ON public.siparis_baglanti_dagitimlari
  FOR EACH ROW EXECUTE FUNCTION public.cari_baglanti_append_only_koru();
CREATE TRIGGER cari_tahsilat_dagitimlari_immutable
  BEFORE UPDATE OR DELETE ON public.cari_tahsilat_dagitimlari
  FOR EACH ROW EXECUTE FUNCTION public.cari_baglanti_append_only_koru();
CREATE TRIGGER cari_baglanti_fiyat_duzeltmeleri_immutable
  BEFORE UPDATE OR DELETE ON public.cari_baglanti_fiyat_duzeltmeleri
  FOR EACH ROW EXECUTE FUNCTION public.cari_baglanti_append_only_koru();

CREATE TRIGGER audit_cari_baglantilari
  AFTER INSERT OR UPDATE OR DELETE ON public.cari_baglantilari
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();
CREATE TRIGGER audit_cari_baglanti_fiyat_duzeltmeleri
  AFTER INSERT OR UPDATE OR DELETE ON public.cari_baglanti_fiyat_duzeltmeleri
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_event();

-- Mevcut yayımlanmış profil ve kredi, yeni bir cari hareketi üretmeden devir
-- bağlantısına bağlanır. Ana fiyat kullanan profillerde aynı değişmez ana sürüm
-- birden fazla devir bağlantısının kaynağı olabilir; normal bağlantı sürümleri
-- yukarıdaki kısmi unique indeksle yine tekilleştirilir.
INSERT INTO public.cari_baglantilari (
  id, baglanti_no, cari_id, para_birimi, baglanti_turu,
  on_odeme_tutari, fiyat_listesi_surumu_id,
  musteri_ticari_profil_surumu_id, durum, sira_no,
  odeme_tarihi, odeme_yontemi, aciklama,
  olusturan_kullanici_id, onaylayan_kullanici_id,
  onaylanma_tarihi, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'DEVIR-' || regexp_replace(upper(cari.kod), '[^A-Z0-9._-]', '-', 'g')
    || '-' || left(replace(cari.id::text, '-', ''), 8),
  cari.id,
  profil_surumu.varsayilan_para_birimi,
  'devir',
  GREATEST(-COALESCE(bakiye.net_bakiye, 0), 0),
  fiyat_surumu.id,
  profil_surumu.id,
  'onaylandi',
  1,
  (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,
  'devir',
  'Mevcut yayımlanmış profil ve müşteri kredisinin hareket üretmeden devri',
  profil_surumu.yayinlayan_kullanici_id,
  profil_surumu.yayinlayan_kullanici_id,
  COALESCE(profil_surumu.yayinlanma_tarihi, now()),
  COALESCE(profil_surumu.yayinlanma_tarihi, now()),
  now()
FROM public.cari
JOIN public.musteri_ticari_profilleri profil
  ON profil.cari_id = cari.id
 AND profil.aktif
JOIN public.musteri_ticari_profil_surmleri profil_surumu
  ON profil_surumu.musteri_ticari_profili_id = profil.id
 AND profil_surumu.durum = 'yayinda'
JOIN LATERAL (
  SELECT surum.id
  FROM public.fiyat_listesi_surmleri surum
  WHERE surum.fiyat_listesi_id = COALESCE(
      profil_surumu.musteri_fiyat_listesi_id,
      profil_surumu.ana_fiyat_listesi_id
    )
    AND surum.durum = 'yayinda'
  ORDER BY surum.surum_no DESC
  LIMIT 1
) fiyat_surumu ON true
LEFT JOIN public.cari_bakiye_ozetleri bakiye
  ON bakiye.cari_id = cari.id
 AND bakiye.para_birimi = profil_surumu.varsayilan_para_birimi::text
WHERE cari.tipi = 'musteri'
  AND cari.aktif
  AND profil_surumu.yayinlayan_kullanici_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.cari_baglantilari mevcut
    WHERE mevcut.cari_id = cari.id
      AND mevcut.para_birimi = profil_surumu.varsayilan_para_birimi
  );

ALTER TABLE public.cari_baglantilari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cari_baglantilari FORCE ROW LEVEL SECURITY;
ALTER TABLE public.siparis_baglanti_dagitimlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siparis_baglanti_dagitimlari FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cari_tahsilat_dagitimlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cari_tahsilat_dagitimlari FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cari_baglanti_fiyat_duzeltmeleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cari_baglanti_fiyat_duzeltmeleri FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.cari_baglantilari FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.siparis_baglanti_dagitimlari FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cari_tahsilat_dagitimlari FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cari_baglanti_fiyat_duzeltmeleri FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.cari_baglantilari TO authenticated;
GRANT SELECT ON public.siparis_baglanti_dagitimlari TO authenticated;
GRANT SELECT ON public.cari_tahsilat_dagitimlari TO authenticated;
GRANT SELECT ON public.cari_baglanti_fiyat_duzeltmeleri TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cari_baglantilari TO service_role;
GRANT SELECT, INSERT ON public.siparis_baglanti_dagitimlari TO service_role;
GRANT SELECT, INSERT ON public.cari_tahsilat_dagitimlari TO service_role;
GRANT SELECT, INSERT ON public.cari_baglanti_fiyat_duzeltmeleri TO service_role;

CREATE POLICY cari_baglantilari_read
  ON public.cari_baglantilari FOR SELECT TO authenticated
  USING (
    public.has_permission('pricing', 'read')
    OR public.has_permission('finance', 'read')
    OR public.has_permission('cari', 'read')
  );
CREATE POLICY siparis_baglanti_dagitimlari_read
  ON public.siparis_baglanti_dagitimlari FOR SELECT TO authenticated
  USING (public.has_permission('orders', 'read') OR public.has_permission('finance', 'read'));
CREATE POLICY cari_tahsilat_dagitimlari_read
  ON public.cari_tahsilat_dagitimlari FOR SELECT TO authenticated
  USING (public.has_permission('finance', 'read'));
CREATE POLICY cari_baglanti_fiyat_duzeltmeleri_read
  ON public.cari_baglanti_fiyat_duzeltmeleri FOR SELECT TO authenticated
  USING (public.has_permission('pricing', 'read') OR public.has_permission('finance', 'read'));

REVOKE ALL ON FUNCTION public.cari_baglanti_taslak_kaydet(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cari_baglanti_onayla(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cari_baglanti_hazirlik_getir(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cari_baglanti_acik_donem_fark_satirlari(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cari_baglanti_acik_donem_farki_getir(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cari_baglanti_acik_donemi_yeniden_fiyatla(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cari_detay_ozeti_getir(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cari_baglanti_taslak_kaydet(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cari_baglanti_onayla(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cari_baglanti_hazirlik_getir(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cari_baglanti_acik_donem_farki_getir(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cari_detay_ozeti_getir(uuid, integer, integer) TO authenticated;

COMMENT ON TABLE public.cari_baglantilari IS
  'Ön ödeme ve müşteri özel fiyat sürümünü birlikte tutan onaylı bağlantı kuyruğu.';
COMMENT ON TABLE public.siparis_baglanti_dagitimlari IS
  'Sipariş fiyat revizyonlarının bağlantı kredisi ve açık dönem arasındaki append-only dağılımı.';
COMMENT ON TABLE public.cari_tahsilat_dagitimlari IS
  'Genel cari tahsilatlarının kullanıcıya sipariş mahsup ekranı göstermeden FIFO açık satış kapaması.';
