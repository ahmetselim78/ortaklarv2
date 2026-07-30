-- 078 - Siparişten bağımsız, sürümlü teklif belgeleri

CREATE TABLE public.teklifler (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teklif_no text NOT NULL UNIQUE,
  cari_id uuid NOT NULL REFERENCES public.cari(id) ON DELETE RESTRICT,
  durum text NOT NULL DEFAULT 'taslak'
    CHECK (durum IN ('taslak', 'gonderildi', 'kabul_edildi', 'reddedildi')),
  aktif_revizyon_id uuid,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.teklif_revizyonlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teklif_id uuid NOT NULL REFERENCES public.teklifler(id) ON DELETE RESTRICT,
  revizyon_no integer NOT NULL CHECK (revizyon_no > 0),
  durum text NOT NULL DEFAULT 'taslak'
    CHECK (durum IN ('taslak', 'gonderildi', 'kabul_edildi', 'reddedildi')),
  onceki_revizyon_id uuid REFERENCES public.teklif_revizyonlari(id) ON DELETE RESTRICT,
  onizleme_id uuid NOT NULL REFERENCES public.fiyat_onizlemeleri(id) ON DELETE RESTRICT,
  para_birimi public.para_birimi_kodu NOT NULL,
  teklif_tarihi date NOT NULL,
  gecerlilik_tarihi date NOT NULL,
  girdi_hash text NOT NULL CHECK (girdi_hash ~ '^[0-9a-f]{64}$'),
  fiyat_baglam_hash text NOT NULL CHECK (fiyat_baglam_hash ~ '^[0-9a-f]{64}$'),
  sonuc_hash text NOT NULL CHECK (sonuc_hash ~ '^[0-9a-f]{64}$'),
  hesaplama_surumu text NOT NULL,
  fiyat_baglami jsonb NOT NULL,
  profil_snapshot jsonb NOT NULL,
  belge_snapshot jsonb NOT NULL,
  kdv_haric_tutar numeric(18,2) NOT NULL,
  kdv_tutari numeric(18,2) NOT NULL,
  genel_toplam numeric(18,2) NOT NULL,
  tahmini_maliyet numeric(18,2) NOT NULL,
  tahmini_kar numeric(18,2) NOT NULL,
  marj_yuzdesi numeric(9,4),
  dusuk_marj boolean NOT NULL DEFAULT false,
  dusuk_marj_gerekcesi text,
  gonderilme_tarihi timestamptz,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teklif_id, revizyon_no),
  CHECK (gecerlilik_tarihi >= teklif_tarihi),
  CHECK (NOT dusuk_marj OR length(trim(COALESCE(dusuk_marj_gerekcesi, ''))) >= 3)
);

ALTER TABLE public.teklifler
  ADD CONSTRAINT teklifler_aktif_revizyon_fk
  FOREIGN KEY (aktif_revizyon_id)
  REFERENCES public.teklif_revizyonlari(id)
  ON DELETE RESTRICT;

CREATE TABLE public.teklif_detaylari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teklif_revizyonu_id uuid NOT NULL
    REFERENCES public.teklif_revizyonlari(id) ON DELETE RESTRICT,
  satir_no integer NOT NULL CHECK (satir_no > 0),
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  recete_id uuid NOT NULL REFERENCES public.urun_maliyet_receteleri(id) ON DELETE RESTRICT,
  recete_surumu_id uuid NOT NULL
    REFERENCES public.urun_maliyet_recete_surmleri(id) ON DELETE RESTRICT,
  kdv_grubu_id uuid NOT NULL REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT,
  kdv_grup_surumu_id uuid NOT NULL
    REFERENCES public.kdv_grup_surmleri(id) ON DELETE RESTRICT,
  genislik_mm numeric(18,6) NOT NULL,
  yukseklik_mm numeric(18,6) NOT NULL,
  yuvarlanmis_genislik_mm numeric(18,6) NOT NULL,
  yuvarlanmis_yukseklik_mm numeric(18,6) NOT NULL,
  adet integer NOT NULL CHECK (adet > 0),
  tek_parca_m2 numeric(18,6) NOT NULL,
  faturalanabilir_m2 numeric(18,6) NOT NULL,
  birim_fiyat numeric(18,6) NOT NULL,
  brut_tutar numeric(18,2) NOT NULL,
  satir_iskonto_tutari numeric(18,2) NOT NULL DEFAULT 0,
  net_tutar numeric(18,2) NOT NULL,
  tahmini_maliyet numeric(18,2) NOT NULL,
  tahmini_kar numeric(18,2) NOT NULL,
  marj_yuzdesi numeric(9,4),
  satir_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teklif_revizyonu_id, satir_no)
);

CREATE TABLE public.teklif_fiyat_bilesenleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teklif_revizyonu_id uuid NOT NULL
    REFERENCES public.teklif_revizyonlari(id) ON DELETE RESTRICT,
  teklif_detay_id uuid REFERENCES public.teklif_detaylari(id) ON DELETE RESTRICT,
  bilesen_turu text NOT NULL,
  kaynak_turu text,
  kaynak_id uuid,
  hesaplama_birimi public.hesaplama_birimi NOT NULL,
  miktar numeric(18,6) NOT NULL,
  birim_fiyat numeric(18,6),
  liste_tutari numeric(18,2) NOT NULL DEFAULT 0,
  iskonto_tutari numeric(18,2) NOT NULL DEFAULT 0,
  override_tutari numeric(18,2),
  fark_tutari numeric(18,2) NOT NULL DEFAULT 0,
  net_tutar numeric(18,2) NOT NULL,
  tahmini_maliyet numeric(18,2) NOT NULL DEFAULT 0,
  para_birimi public.para_birimi_kodu NOT NULL,
  kdv_grubu_id uuid NOT NULL REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT,
  kdv_grup_surumu_id uuid NOT NULL
    REFERENCES public.kdv_grup_surmleri(id) ON DELETE RESTRICT,
  ucretsiz boolean NOT NULL DEFAULT false,
  sira_no integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.teklif_kdv_ozetleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teklif_revizyonu_id uuid NOT NULL
    REFERENCES public.teklif_revizyonlari(id) ON DELETE RESTRICT,
  kdv_grubu_id uuid NOT NULL REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT,
  kdv_grup_surumu_id uuid NOT NULL
    REFERENCES public.kdv_grup_surmleri(id) ON DELETE RESTRICT,
  matrah numeric(18,2) NOT NULL,
  kdv_orani numeric(7,4) NOT NULL,
  kdv_tutari numeric(18,2) NOT NULL,
  dagitim_farki numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teklif_revizyonu_id, kdv_grup_surumu_id)
);

ALTER TABLE public.ticari_mudahale_kayitlari
  ADD CONSTRAINT ticari_mudahale_teklif_revizyonu_fk
  FOREIGN KEY (teklif_revizyonu_id)
  REFERENCES public.teklif_revizyonlari(id)
  ON DELETE RESTRICT;

CREATE INDEX teklifler_cari_tarih_idx ON public.teklifler(cari_id, created_at DESC);
CREATE INDEX teklifler_revision_idx ON public.teklifler(id, revision_no);
CREATE INDEX teklif_revizyonlari_teklif_idx
  ON public.teklif_revizyonlari(teklif_id, revizyon_no DESC);
CREATE INDEX teklif_detaylari_revizyon_idx
  ON public.teklif_detaylari(teklif_revizyonu_id, satir_no);
CREATE INDEX teklif_fiyat_bilesenleri_revizyon_idx
  ON public.teklif_fiyat_bilesenleri(teklif_revizyonu_id, sira_no);

CREATE OR REPLACE FUNCTION public.ticari_teklif_sayaci(p_yil integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_anahtar text;
  v_deger integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEKLIF_OLUSTURMA_YETKISI_GEREKLI';
  END IF;
  IF p_yil NOT BETWEEN 2000 AND 2200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEKLIF_YILI_GECERSIZ';
  END IF;

  v_anahtar := 'teklif_no_' || p_yil::text;
  INSERT INTO public.sayaclar (anahtar, deger)
  VALUES (v_anahtar, 1)
  ON CONFLICT (anahtar) DO UPDATE
    SET deger = public.sayaclar.deger + 1
  RETURNING deger INTO v_deger;

  RETURN v_deger;
END;
$$;

CREATE OR REPLACE FUNCTION public.teklif_snapshotlarini_yaz(
  p_teklif_id uuid,
  p_onizleme_id uuid,
  p_sonuc jsonb,
  p_belge jsonb,
  p_onceki_revizyon_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_revizyon_id uuid;
  v_revizyon_no integer;
  v_gecerlilik_gunu integer;
BEGIN
  SELECT COALESCE(max(revizyon_no), 0) + 1
  INTO v_revizyon_no
  FROM public.teklif_revizyonlari
  WHERE teklif_id = p_teklif_id;

  SELECT COALESCE(
    public.ticari_guvenli_integer(p_belge ->> 'gecerlilik_gunu'),
    profil.teklif_gecerlilik_gunu,
    15
  )
  INTO v_gecerlilik_gunu
  FROM public.musteri_ticari_profil_surmleri profil
  WHERE profil.id = public.ticari_guvenli_uuid(
    p_sonuc -> 'fiyat_baglami' ->> 'musteri_ticari_profil_surumu_id'
  );

  INSERT INTO public.teklif_revizyonlari (
    teklif_id, revizyon_no, onceki_revizyon_id, onizleme_id,
    para_birimi, teklif_tarihi, gecerlilik_tarihi,
    girdi_hash, fiyat_baglam_hash, sonuc_hash, hesaplama_surumu,
    fiyat_baglami, profil_snapshot, belge_snapshot,
    kdv_haric_tutar, kdv_tutari, genel_toplam,
    tahmini_maliyet, tahmini_kar, marj_yuzdesi,
    dusuk_marj, dusuk_marj_gerekcesi, olusturan_kullanici_id
  )
  VALUES (
    p_teklif_id,
    v_revizyon_no,
    p_onceki_revizyon_id,
    p_onizleme_id,
    (p_sonuc ->> 'para_birimi')::public.para_birimi_kodu,
    (p_sonuc ->> 'fiyatlandirma_tarihi')::date,
    (p_sonuc ->> 'fiyatlandirma_tarihi')::date + v_gecerlilik_gunu,
    p_sonuc ->> 'girdi_hash',
    p_sonuc ->> 'fiyat_baglam_hash',
    p_sonuc ->> 'sonuc_hash',
    p_sonuc ->> 'hesaplama_surumu',
    p_sonuc -> 'fiyat_baglami',
    p_sonuc -> 'profil_snapshot',
    p_belge,
    public.ticari_guvenli_numeric(p_sonuc ->> 'kdv_haric_tutar'),
    public.ticari_guvenli_numeric(p_sonuc ->> 'kdv_tutari'),
    public.ticari_guvenli_numeric(p_sonuc ->> 'genel_toplam'),
    public.ticari_guvenli_numeric(p_sonuc ->> 'tahmini_maliyet'),
    public.ticari_guvenli_numeric(p_sonuc ->> 'tahmini_kar'),
    public.ticari_guvenli_numeric(p_sonuc ->> 'marj_yuzdesi'),
    COALESCE((p_sonuc ->> 'dusuk_marj')::boolean, false),
    NULLIF(p_sonuc ->> 'dusuk_marj_gerekcesi', ''),
    auth.uid()
  )
  RETURNING id INTO v_revizyon_id;

  INSERT INTO public.teklif_detaylari (
    teklif_revizyonu_id, satir_no, stok_id, recete_id, recete_surumu_id,
    kdv_grubu_id, kdv_grup_surumu_id, genislik_mm, yukseklik_mm,
    yuvarlanmis_genislik_mm, yuvarlanmis_yukseklik_mm, adet,
    tek_parca_m2, faturalanabilir_m2, birim_fiyat, brut_tutar,
    satir_iskonto_tutari, net_tutar, tahmini_maliyet, tahmini_kar,
    marj_yuzdesi, satir_snapshot
  )
  SELECT
    v_revizyon_id,
    public.ticari_guvenli_integer(satir.value ->> 'satir_no'),
    public.ticari_guvenli_uuid(satir.value ->> 'stok_id'),
    public.ticari_guvenli_uuid(satir.value ->> 'recete_id'),
    public.ticari_guvenli_uuid(satir.value ->> 'recete_surumu_id'),
    public.ticari_guvenli_uuid(satir.value ->> 'kdv_grubu_id'),
    public.ticari_guvenli_uuid(satir.value ->> 'kdv_grup_surumu_id'),
    public.ticari_guvenli_numeric(satir.value ->> 'genislik_mm'),
    public.ticari_guvenli_numeric(satir.value ->> 'yukseklik_mm'),
    public.ticari_guvenli_numeric(satir.value ->> 'yuvarlanmis_genislik_mm'),
    public.ticari_guvenli_numeric(satir.value ->> 'yuvarlanmis_yukseklik_mm'),
    public.ticari_guvenli_integer(satir.value ->> 'adet'),
    public.ticari_guvenli_numeric(satir.value ->> 'tek_parca_m2'),
    public.ticari_guvenli_numeric(satir.value ->> 'faturalanabilir_m2'),
    public.ticari_guvenli_numeric(satir.value ->> 'birim_fiyat'),
    public.ticari_guvenli_numeric(satir.value ->> 'brut_tutar'),
    public.ticari_guvenli_numeric(satir.value ->> 'satir_iskonto_tutari'),
    public.ticari_guvenli_numeric(satir.value ->> 'net_tutar'),
    public.ticari_guvenli_numeric(satir.value ->> 'tahmini_maliyet'),
    public.ticari_guvenli_numeric(satir.value ->> 'tahmini_kar'),
    public.ticari_guvenli_numeric(satir.value ->> 'marj_yuzdesi'),
    satir.value
  FROM jsonb_array_elements(COALESCE(p_sonuc -> 'satirlar', '[]'::jsonb)) satir(value);

  INSERT INTO public.teklif_fiyat_bilesenleri (
    teklif_revizyonu_id, teklif_detay_id, bilesen_turu, kaynak_turu,
    kaynak_id, hesaplama_birimi, miktar, birim_fiyat, liste_tutari,
    iskonto_tutari, override_tutari, fark_tutari, net_tutar,
    tahmini_maliyet, para_birimi, kdv_grubu_id, kdv_grup_surumu_id,
    ucretsiz, sira_no, metadata
  )
  SELECT
    v_revizyon_id,
    detay.id,
    b.value ->> 'bilesen_turu',
    NULLIF(b.value ->> 'kaynak_turu', ''),
    public.ticari_guvenli_uuid(b.value ->> 'kaynak_id'),
    (b.value ->> 'hesaplama_birimi')::public.hesaplama_birimi,
    public.ticari_guvenli_numeric(b.value ->> 'miktar'),
    public.ticari_guvenli_numeric(b.value ->> 'birim_fiyat'),
    public.ticari_guvenli_numeric(b.value ->> 'liste_tutari'),
    public.ticari_guvenli_numeric(b.value ->> 'iskonto_tutari'),
    public.ticari_guvenli_numeric(b.value ->> 'override_tutari'),
    public.ticari_guvenli_numeric(b.value ->> 'fark_tutari'),
    public.ticari_guvenli_numeric(b.value ->> 'net_tutar'),
    public.ticari_guvenli_numeric(b.value ->> 'tahmini_maliyet'),
    (b.value ->> 'para_birimi')::public.para_birimi_kodu,
    public.ticari_guvenli_uuid(b.value ->> 'kdv_grubu_id'),
    public.ticari_guvenli_uuid(b.value ->> 'kdv_grup_surumu_id'),
    COALESCE((b.value ->> 'ucretsiz')::boolean, false),
    public.ticari_guvenli_integer(b.value ->> 'sira_no'),
    COALESCE(b.value -> 'metadata', '{}'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_sonuc -> 'bilesenler', '[]'::jsonb)) b(value)
  LEFT JOIN public.teklif_detaylari detay
    ON detay.teklif_revizyonu_id = v_revizyon_id
   AND detay.satir_no = public.ticari_guvenli_integer(b.value ->> 'satir_no');

  INSERT INTO public.teklif_kdv_ozetleri (
    teklif_revizyonu_id, kdv_grubu_id, kdv_grup_surumu_id,
    matrah, kdv_orani, kdv_tutari, dagitim_farki
  )
  SELECT
    v_revizyon_id,
    public.ticari_guvenli_uuid(k.value ->> 'kdv_grubu_id'),
    public.ticari_guvenli_uuid(k.value ->> 'kdv_grup_surumu_id'),
    public.ticari_guvenli_numeric(k.value ->> 'matrah'),
    public.ticari_guvenli_numeric(k.value ->> 'kdv_orani'),
    public.ticari_guvenli_numeric(k.value ->> 'kdv_tutari'),
    COALESCE(public.ticari_guvenli_numeric(k.value ->> 'dagitim_farki'), 0)
  FROM jsonb_array_elements(COALESCE(p_sonuc -> 'kdv_ozetleri', '[]'::jsonb)) k(value);

  RETURN v_revizyon_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.teklif_revizyonu_olustur(
  p_teklif_id uuid,
  p_beklenen_revision_no integer,
  p_belge jsonb,
  p_onizleme_id uuid,
  p_onizleme_hash text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teklif public.teklifler%ROWTYPE;
  v_onceki_revizyon public.teklif_revizyonlari%ROWTYPE;
  v_yeni boolean := p_teklif_id IS NULL;
  v_teklif_id uuid := COALESCE(p_teklif_id, gen_random_uuid());
  v_teklif_no text;
  v_sabit_baglam jsonb;
  v_dogrulama jsonb;
  v_sonuc jsonb;
  v_payload jsonb;
  v_onceki jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_revizyon_id uuid;
  v_yanit jsonb;
  v_mod public.ticari_modul_modu;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_permission('pricing', CASE WHEN v_yeni THEN 'create' ELSE 'update' END)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEKLIF_YETKISI_GEREKLI';
  END IF;
  SELECT mod INTO v_mod FROM public.ticari_modul_durumu WHERE singleton;
  IF v_mod IS DISTINCT FROM 'aktif' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FEATURE_MODE_ISLEME_KAPALI';
  END IF;

  v_payload := jsonb_build_object(
    'teklif_id', p_teklif_id,
    'beklenen_revision_no', p_beklenen_revision_no,
    'belge', p_belge,
    'onizleme_id', p_onizleme_id,
    'onizleme_hash', p_onizleme_hash
  );
  v_onceki := public.ticari_idempotency_onceki_sonuc(
    'teklif_revizyonu_olusturma', p_idempotency_key, v_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;

  IF NOT v_yeni THEN
    SELECT * INTO v_teklif
    FROM public.teklifler
    WHERE id = p_teklif_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEKLIF_BULUNAMADI';
    END IF;
    IF v_teklif.revision_no IS DISTINCT FROM p_beklenen_revision_no THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
    END IF;
    IF v_teklif.cari_id IS DISTINCT FROM public.ticari_guvenli_uuid(p_belge ->> 'cari_id') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEKLIF_MUSTERISI_DEGISTIRILEMEZ';
    END IF;
    SELECT * INTO v_onceki_revizyon
    FROM public.teklif_revizyonlari
    WHERE id = v_teklif.aktif_revizyon_id;
    -- Teklif revizyonu varsayılan olarak önceki ticari bağlamı korur.
    -- Kullanıcı açıkça güncel fiyatları istediğinde önizleme ve kayıt aynı
    -- payload bayrağıyla güncel bağlamı yeniden çözümler.
    IF NOT COALESCE((p_belge ->> 'fiyat_baglamini_yenile')::boolean, false) THEN
      v_sabit_baglam := v_onceki_revizyon.fiyat_baglami;
    END IF;
    v_teklif_no := v_teklif.teklif_no;
  END IF;

  v_dogrulama := public.fiyat_onizlemesini_dogrula(
    p_onizleme_id, p_onizleme_hash, p_belge, v_sabit_baglam
  );
  IF NOT COALESCE((v_dogrulama ->> 'gecerli')::boolean, false) THEN
    RETURN v_dogrulama;
  END IF;
  v_sonuc := v_dogrulama -> 'sonuc';

  v_idempotency := public.ticari_idempotency_baslat(
    'teklif_revizyonu_olusturma', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  IF v_yeni THEN
    v_teklif_no := 'TEK-' || extract(year FROM (p_belge ->> 'tarih')::date)::integer::text
      || '-' || lpad(
        public.ticari_teklif_sayaci(
          extract(year FROM (p_belge ->> 'tarih')::date)::integer
        )::text,
        4,
        '0'
      );
    INSERT INTO public.teklifler (
      id, teklif_no, cari_id, durum, revision_no, olusturan_kullanici_id
    )
    VALUES (
      v_teklif_id, v_teklif_no,
      public.ticari_guvenli_uuid(p_belge ->> 'cari_id'),
      'taslak', 1, auth.uid()
    );
  END IF;

  v_revizyon_id := public.teklif_snapshotlarini_yaz(
    v_teklif_id, p_onizleme_id, v_sonuc, p_belge, v_onceki_revizyon.id
  );

  PERFORM public.siparis_ticari_mudahale_kayitlarini_yaz(
    NULL,
    NULL,
    p_belge,
    v_sonuc,
    v_revizyon_id,
    v_onceki_revizyon.belge_snapshot
  );

  UPDATE public.teklifler
  SET aktif_revizyon_id = v_revizyon_id,
      durum = 'taslak',
      revision_no = CASE WHEN v_yeni THEN revision_no ELSE revision_no + 1 END,
      updated_at = now()
  WHERE id = v_teklif_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'teklif_id', v_teklif_id,
    'teklif_no', v_teklif_no,
    'revision_no', CASE WHEN v_yeni THEN 1 ELSE v_teklif.revision_no + 1 END,
    'teklif_revizyonu_id', v_revizyon_id,
    'teklif_revizyon_no', COALESCE(v_onceki_revizyon.revizyon_no, 0) + 1,
    'genel_toplam', v_sonuc -> 'genel_toplam',
    'para_birimi', v_sonuc -> 'para_birimi'
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.teklif_durum_degistir(
  p_teklif_id uuid,
  p_beklenen_revision_no integer,
  p_yeni_durum text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teklif public.teklifler%ROWTYPE;
  v_payload jsonb;
  v_onceki jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('pricing', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TEKLIF_GUNCELLEME_YETKISI_GEREKLI';
  END IF;
  IF p_yeni_durum NOT IN ('gonderildi', 'kabul_edildi', 'reddedildi') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TEKLIF_DURUMU_GECERSIZ';
  END IF;

  v_payload := jsonb_build_object(
    'teklif_id', p_teklif_id,
    'beklenen_revision_no', p_beklenen_revision_no,
    'yeni_durum', p_yeni_durum
  );
  v_onceki := public.ticari_idempotency_onceki_sonuc(
    'teklif_durum_degisikligi', p_idempotency_key, v_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;

  SELECT * INTO v_teklif
  FROM public.teklifler
  WHERE id = p_teklif_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEKLIF_BULUNAMADI';
  END IF;
  IF v_teklif.revision_no IS DISTINCT FROM p_beklenen_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
  END IF;
  IF (p_yeni_durum = 'gonderildi' AND v_teklif.durum <> 'taslak')
     OR (p_yeni_durum IN ('kabul_edildi', 'reddedildi') AND v_teklif.durum <> 'gonderildi') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEKLIF_DURUM_GECISI_GECERSIZ';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'teklif_durum_degisikligi', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  UPDATE public.teklif_revizyonlari
  SET durum = p_yeni_durum,
      gonderilme_tarihi = CASE
        WHEN p_yeni_durum = 'gonderildi' THEN now()
        ELSE gonderilme_tarihi
      END
  WHERE id = v_teklif.aktif_revizyon_id;

  UPDATE public.teklifler
  SET durum = p_yeni_durum,
      revision_no = revision_no + 1,
      updated_at = now()
  WHERE id = p_teklif_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'teklif_id', p_teklif_id,
    'durum', p_yeni_durum,
    'revision_no', v_teklif.revision_no + 1
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.teklif_revizyonunu_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEKLIF_REVIZYONU_DEGISTIRILEMEZ';
  END IF;
  IF OLD.durum <> 'taslak' THEN
    IF NEW.durum IS DISTINCT FROM OLD.durum
       AND OLD.durum = 'gonderildi'
       AND NEW.durum IN ('kabul_edildi', 'reddedildi')
       AND (to_jsonb(NEW) - ARRAY['durum']) = (to_jsonb(OLD) - ARRAY['durum']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'GONDERILMIS_TEKLIF_REVIZYONU_DEGISTIRILEMEZ';
  END IF;
  IF NEW.durum = 'gonderildi'
     AND (to_jsonb(NEW) - ARRAY['durum', 'gonderilme_tarihi'])
       = (to_jsonb(OLD) - ARRAY['durum', 'gonderilme_tarihi']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEKLIF_REVIZYONU_DEGISTIRILEMEZ';
END;
$$;

CREATE TRIGGER teklif_revizyonlari_immutable
  BEFORE UPDATE OR DELETE ON public.teklif_revizyonlari
  FOR EACH ROW EXECUTE FUNCTION public.teklif_revizyonunu_koru();
CREATE TRIGGER teklif_detaylari_immutable
  BEFORE UPDATE OR DELETE ON public.teklif_detaylari
  FOR EACH ROW EXECUTE FUNCTION public.ticari_kayit_degistirilemez();
CREATE TRIGGER teklif_fiyat_bilesenleri_immutable
  BEFORE UPDATE OR DELETE ON public.teklif_fiyat_bilesenleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_kayit_degistirilemez();
CREATE TRIGGER teklif_kdv_ozetleri_immutable
  BEFORE UPDATE OR DELETE ON public.teklif_kdv_ozetleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_kayit_degistirilemez();

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'teklifler', 'teklif_revizyonlari', 'teklif_detaylari',
    'teklif_fiyat_bilesenleri', 'teklif_kdv_ozetleri'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO service_role', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_permission(''pricing'', ''read''))',
      v_table || '_pricing_read', v_table
    );
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.teklif_snapshotlarini_yaz(uuid, uuid, jsonb, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticari_teklif_sayaci(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teklif_revizyonu_olustur(uuid, integer, jsonb, uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teklif_durum_degistir(uuid, integer, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teklif_revizyonunu_koru()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teklif_revizyonu_olustur(uuid, integer, jsonb, uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.teklif_durum_degistir(uuid, integer, text, text)
  TO authenticated;
