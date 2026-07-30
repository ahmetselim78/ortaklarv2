-- 077 - Sipariş fiyat snapshot'ları ve atomik sipariş/cari RPC'leri

CREATE TABLE public.siparis_fiyat_revizyonlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siparis_id uuid NOT NULL REFERENCES public.siparisler(id) ON DELETE RESTRICT,
  revizyon_no integer NOT NULL CHECK (revizyon_no > 0),
  revizyon_turu text NOT NULL CHECK (revizyon_turu IN ('ilk', 'teknik', 'ticari')),
  onceki_revizyon_id uuid REFERENCES public.siparis_fiyat_revizyonlari(id) ON DELETE RESTRICT,
  onizleme_id uuid NOT NULL REFERENCES public.fiyat_onizlemeleri(id) ON DELETE RESTRICT,
  musteri_ticari_profil_surumu_id uuid NOT NULL
    REFERENCES public.musteri_ticari_profil_surmleri(id) ON DELETE RESTRICT,
  ana_fiyat_listesi_surumu_id uuid NOT NULL
    REFERENCES public.fiyat_listesi_surmleri(id) ON DELETE RESTRICT,
  musteri_fiyat_listesi_surumu_id uuid
    REFERENCES public.fiyat_listesi_surmleri(id) ON DELETE RESTRICT,
  maliyet_tarife_surumu_id uuid NOT NULL
    REFERENCES public.maliyet_tarife_surmleri(id) ON DELETE RESTRICT,
  vade_profili_surumu_id uuid
    REFERENCES public.vade_profili_surmleri(id) ON DELETE RESTRICT,
  para_birimi public.para_birimi_kodu NOT NULL,
  fiyatlandirma_tarihi date NOT NULL,
  girdi_hash text NOT NULL CHECK (girdi_hash ~ '^[0-9a-f]{64}$'),
  fiyat_baglam_hash text NOT NULL CHECK (fiyat_baglam_hash ~ '^[0-9a-f]{64}$'),
  sonuc_hash text NOT NULL CHECK (sonuc_hash ~ '^[0-9a-f]{64}$'),
  hesaplama_surumu text NOT NULL,
  profil_snapshot jsonb NOT NULL,
  ticari_girdi_snapshot jsonb NOT NULL,
  kdv_haric_tutar numeric(18,2) NOT NULL,
  satir_iskonto_tutari numeric(18,2) NOT NULL DEFAULT 0,
  belge_iskonto_tutari numeric(18,2) NOT NULL DEFAULT 0,
  manuel_fiyat_farki numeric(18,2) NOT NULL DEFAULT 0,
  manuel_yuvarlama_farki numeric(18,2) NOT NULL DEFAULT 0,
  hesaplama_yuvarlama_farki numeric(18,2) NOT NULL DEFAULT 0,
  nakliye_override_farki numeric(18,2) NOT NULL DEFAULT 0,
  vade_farki numeric(18,2) NOT NULL DEFAULT 0,
  kdv_tutari numeric(18,2) NOT NULL,
  genel_toplam numeric(18,2) NOT NULL,
  tahmini_maliyet numeric(18,2) NOT NULL,
  tahmini_kar numeric(18,2) NOT NULL,
  marj_yuzdesi numeric(9,4),
  minimum_marj_yuzdesi numeric(9,4),
  dusuk_marj boolean NOT NULL DEFAULT false,
  dusuk_marj_gerekcesi text,
  olusturan_kullanici_id uuid NOT NULL
    REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (siparis_id, revizyon_no),
  CONSTRAINT siparis_fiyat_revizyonlari_dusuk_marj_check CHECK (
    NOT dusuk_marj OR length(trim(COALESCE(dusuk_marj_gerekcesi, ''))) >= 3
  )
);

ALTER TABLE public.siparis_detaylari
  ADD COLUMN IF NOT EXISTS aktif boolean NOT NULL DEFAULT true;

CREATE TABLE public.siparis_detay_fiyat_snapshotlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siparis_fiyat_revizyonu_id uuid NOT NULL
    REFERENCES public.siparis_fiyat_revizyonlari(id) ON DELETE RESTRICT,
  siparis_detay_id uuid REFERENCES public.siparis_detaylari(id) ON DELETE SET NULL,
  girdi_satir_no integer NOT NULL CHECK (girdi_satir_no > 0),
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  recete_id uuid NOT NULL REFERENCES public.urun_maliyet_receteleri(id) ON DELETE RESTRICT,
  recete_surumu_id uuid NOT NULL REFERENCES public.urun_maliyet_recete_surmleri(id) ON DELETE RESTRICT,
  kdv_grubu_id uuid NOT NULL REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT,
  kdv_grup_surumu_id uuid NOT NULL REFERENCES public.kdv_grup_surmleri(id) ON DELETE RESTRICT,
  genislik_mm numeric(18,6) NOT NULL CHECK (genislik_mm > 0),
  yukseklik_mm numeric(18,6) NOT NULL CHECK (yukseklik_mm > 0),
  yuvarlanmis_genislik_mm numeric(18,6) NOT NULL CHECK (yuvarlanmis_genislik_mm > 0),
  yuvarlanmis_yukseklik_mm numeric(18,6) NOT NULL CHECK (yuvarlanmis_yukseklik_mm > 0),
  adet integer NOT NULL CHECK (adet > 0),
  tek_parca_m2 numeric(18,6) NOT NULL CHECK (tek_parca_m2 > 0),
  faturalanabilir_m2 numeric(18,6) NOT NULL CHECK (faturalanabilir_m2 > 0),
  birim_fiyat numeric(18,6) NOT NULL,
  brut_tutar numeric(18,2) NOT NULL,
  satir_iskonto_tutari numeric(18,2) NOT NULL DEFAULT 0,
  net_tutar numeric(18,2) NOT NULL CHECK (net_tutar >= 0),
  tahmini_maliyet numeric(18,2) NOT NULL CHECK (tahmini_maliyet >= 0),
  tahmini_kar numeric(18,2) NOT NULL,
  marj_yuzdesi numeric(9,4),
  satir_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (siparis_fiyat_revizyonu_id, girdi_satir_no),
  UNIQUE (siparis_fiyat_revizyonu_id, siparis_detay_id)
);

CREATE TABLE public.siparis_fiyat_bilesenleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siparis_fiyat_revizyonu_id uuid NOT NULL
    REFERENCES public.siparis_fiyat_revizyonlari(id) ON DELETE RESTRICT,
  siparis_detay_fiyat_snapshot_id uuid
    REFERENCES public.siparis_detay_fiyat_snapshotlari(id) ON DELETE RESTRICT,
  bilesen_turu text NOT NULL CHECK (bilesen_turu IN (
    'urun', 'kenar_islemi', 'menfez', 'kucuk_cam', 'nakliye', 'diger',
    'ucretsiz_ekstra_indirimi', 'satir_iskontosu', 'belge_iskontosu',
    'manuel_fiyat_farki', 'manuel_yuvarlama_farki', 'vade_farki'
  )),
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
  kdv_grup_surumu_id uuid NOT NULL REFERENCES public.kdv_grup_surmleri(id) ON DELETE RESTRICT,
  ucretsiz boolean NOT NULL DEFAULT false,
  sira_no integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.siparis_fiyat_kur_snapshotlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siparis_fiyat_revizyonu_id uuid NOT NULL
    REFERENCES public.siparis_fiyat_revizyonlari(id) ON DELETE RESTRICT,
  doviz_kuru_id uuid REFERENCES public.doviz_kurlari(id) ON DELETE RESTRICT,
  istenen_belge_tarihi date NOT NULL,
  fiilen_kullanilan_tcmb_tarihi date NOT NULL,
  kur_tipi public.doviz_kur_tipi NOT NULL,
  kur_degeri numeric(18,6) NOT NULL CHECK (kur_degeri > 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  kaynak public.doviz_kur_kaynagi NOT NULL,
  manuel_gerekce text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (siparis_fiyat_revizyonu_id, para_birimi, kur_tipi)
);

CREATE TABLE public.siparis_kdv_ozetleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siparis_fiyat_revizyonu_id uuid NOT NULL
    REFERENCES public.siparis_fiyat_revizyonlari(id) ON DELETE RESTRICT,
  kdv_grubu_id uuid NOT NULL REFERENCES public.kdv_gruplari(id) ON DELETE RESTRICT,
  kdv_grup_surumu_id uuid NOT NULL REFERENCES public.kdv_grup_surmleri(id) ON DELETE RESTRICT,
  matrah numeric(18,2) NOT NULL,
  kdv_orani numeric(7,4) NOT NULL CHECK (kdv_orani >= 0),
  kdv_tutari numeric(18,2) NOT NULL,
  dagitim_farki numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (siparis_fiyat_revizyonu_id, kdv_grup_surumu_id)
);

CREATE TABLE public.ticari_mudahale_kayitlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mudahale_turu text NOT NULL CHECK (mudahale_turu IN (
    'satir_yuzde_iskonto', 'satir_tutar_iskonto', 'belge_yuzde_iskonto',
    'belge_tutar_iskonto', 'manuel_fiyat_farki', 'manuel_yuvarlama_farki',
    'ucretsiz_ekstra', 'nakliye_satis_override', 'nakliye_maliyet_override',
    'dusuk_marj', 'manuel_kur', 'acilis_bakiyesi', 'cari_tersleme',
    'siparis_iptali', 'readiness_onayi', 'feature_mode'
  )),
  siparis_fiyat_revizyonu_id uuid
    REFERENCES public.siparis_fiyat_revizyonlari(id) ON DELETE RESTRICT,
  teklif_revizyonu_id uuid,
  alan_veya_bilesen text NOT NULL,
  onceki_deger jsonb,
  yeni_deger jsonb NOT NULL,
  gerekce text NOT NULL CHECK (length(trim(gerekce)) >= 3),
  kullanici_id uuid NOT NULL REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticari_mudahale_belge_check CHECK (
    siparis_fiyat_revizyonu_id IS NOT NULL OR teklif_revizyonu_id IS NOT NULL
    OR mudahale_turu IN (
      'manuel_kur', 'acilis_bakiyesi', 'cari_tersleme', 'readiness_onayi', 'feature_mode'
    )
  )
);

ALTER TABLE public.siparisler
  ADD COLUMN IF NOT EXISTS aktif_fiyat_revizyon_id uuid;

ALTER TABLE public.siparisler
  ADD CONSTRAINT siparisler_aktif_fiyat_revizyon_fk
  FOREIGN KEY (aktif_fiyat_revizyon_id)
  REFERENCES public.siparis_fiyat_revizyonlari(id)
  ON DELETE RESTRICT;

CREATE INDEX siparis_fiyat_revizyonlari_siparis_idx
  ON public.siparis_fiyat_revizyonlari(siparis_id, revizyon_no DESC);
CREATE INDEX siparis_detaylari_siparis_aktif_idx
  ON public.siparis_detaylari(siparis_id, aktif, created_at, id);
CREATE INDEX siparis_detay_snapshot_rev_stok_idx
  ON public.siparis_detay_fiyat_snapshotlari(siparis_fiyat_revizyonu_id, stok_id);
CREATE INDEX siparis_detay_snapshot_recete_idx
  ON public.siparis_detay_fiyat_snapshotlari(recete_surumu_id, stok_id);
CREATE INDEX siparis_fiyat_bilesenleri_rev_idx
  ON public.siparis_fiyat_bilesenleri(siparis_fiyat_revizyonu_id, sira_no);
CREATE INDEX siparis_kdv_ozetleri_rev_idx
  ON public.siparis_kdv_ozetleri(siparis_fiyat_revizyonu_id);
CREATE INDEX ticari_mudahale_siparis_idx
  ON public.ticari_mudahale_kayitlari(siparis_fiyat_revizyonu_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.ticari_kayit_degistirilemez()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'YAYINLANMIS_VEYA_SNAPSHOT_KAYDI_DEGISTIRILEMEZ';
END;
$$;

CREATE TRIGGER siparis_fiyat_revizyonlari_immutable
  BEFORE UPDATE OR DELETE ON public.siparis_fiyat_revizyonlari
  FOR EACH ROW EXECUTE FUNCTION public.ticari_kayit_degistirilemez();
CREATE TRIGGER siparis_detay_fiyat_snapshotlari_immutable
  BEFORE UPDATE OR DELETE ON public.siparis_detay_fiyat_snapshotlari
  FOR EACH ROW EXECUTE FUNCTION public.ticari_kayit_degistirilemez();
CREATE TRIGGER siparis_fiyat_bilesenleri_immutable
  BEFORE UPDATE OR DELETE ON public.siparis_fiyat_bilesenleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_kayit_degistirilemez();
CREATE TRIGGER siparis_fiyat_kur_snapshotlari_immutable
  BEFORE UPDATE OR DELETE ON public.siparis_fiyat_kur_snapshotlari
  FOR EACH ROW EXECUTE FUNCTION public.ticari_kayit_degistirilemez();
CREATE TRIGGER siparis_kdv_ozetleri_immutable
  BEFORE UPDATE OR DELETE ON public.siparis_kdv_ozetleri
  FOR EACH ROW EXECUTE FUNCTION public.ticari_kayit_degistirilemez();
CREATE TRIGGER ticari_mudahale_kayitlari_immutable
  BEFORE UPDATE OR DELETE ON public.ticari_mudahale_kayitlari
  FOR EACH ROW EXECUTE FUNCTION public.ticari_kayit_degistirilemez();

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'siparis_fiyat_revizyonlari',
    'siparis_detay_fiyat_snapshotlari',
    'siparis_fiyat_bilesenleri',
    'siparis_fiyat_kur_snapshotlari',
    'siparis_kdv_ozetleri',
    'ticari_mudahale_kayitlari'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_table);
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO service_role', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_permission(''pricing'', ''read''))',
      v_table || '_pricing_read',
      v_table
    );
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.ticari_kayit_degistirilemez() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.siparis_fiyat_snapshotlarini_yaz(
  p_siparis_id uuid,
  p_onizleme_id uuid,
  p_sonuc jsonb,
  p_detay_esleme jsonb,
  p_revizyon_turu text,
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
  v_baglam jsonb := p_sonuc -> 'fiyat_baglami';
BEGIN
  SELECT COALESCE(max(revizyon_no), 0) + 1
  INTO v_revizyon_no
  FROM public.siparis_fiyat_revizyonlari
  WHERE siparis_id = p_siparis_id;

  INSERT INTO public.siparis_fiyat_revizyonlari (
    siparis_id,
    revizyon_no,
    revizyon_turu,
    onceki_revizyon_id,
    onizleme_id,
    musteri_ticari_profil_surumu_id,
    ana_fiyat_listesi_surumu_id,
    musteri_fiyat_listesi_surumu_id,
    maliyet_tarife_surumu_id,
    vade_profili_surumu_id,
    para_birimi,
    fiyatlandirma_tarihi,
    girdi_hash,
    fiyat_baglam_hash,
    sonuc_hash,
    hesaplama_surumu,
    profil_snapshot,
    ticari_girdi_snapshot,
    kdv_haric_tutar,
    satir_iskonto_tutari,
    belge_iskonto_tutari,
    manuel_fiyat_farki,
    manuel_yuvarlama_farki,
    hesaplama_yuvarlama_farki,
    nakliye_override_farki,
    vade_farki,
    kdv_tutari,
    genel_toplam,
    tahmini_maliyet,
    tahmini_kar,
    marj_yuzdesi,
    minimum_marj_yuzdesi,
    dusuk_marj,
    dusuk_marj_gerekcesi,
    olusturan_kullanici_id
  )
  VALUES (
    p_siparis_id,
    v_revizyon_no,
    p_revizyon_turu,
    p_onceki_revizyon_id,
    p_onizleme_id,
    public.ticari_guvenli_uuid(v_baglam ->> 'musteri_ticari_profil_surumu_id'),
    public.ticari_guvenli_uuid(v_baglam ->> 'ana_fiyat_listesi_surumu_id'),
    public.ticari_guvenli_uuid(v_baglam ->> 'musteri_fiyat_listesi_surumu_id'),
    public.ticari_guvenli_uuid(v_baglam ->> 'maliyet_tarife_surumu_id'),
    public.ticari_guvenli_uuid(v_baglam ->> 'vade_profili_surumu_id'),
    (p_sonuc ->> 'para_birimi')::public.para_birimi_kodu,
    (p_sonuc ->> 'fiyatlandirma_tarihi')::date,
    p_sonuc ->> 'girdi_hash',
    p_sonuc ->> 'fiyat_baglam_hash',
    p_sonuc ->> 'sonuc_hash',
    p_sonuc ->> 'hesaplama_surumu',
    p_sonuc -> 'profil_snapshot',
    (SELECT girdi_json FROM public.fiyat_onizlemeleri WHERE id = p_onizleme_id),
    public.ticari_guvenli_numeric(p_sonuc ->> 'kdv_haric_tutar'),
    COALESCE(public.ticari_guvenli_numeric(p_sonuc ->> 'satir_iskonto_tutari'), 0),
    COALESCE(public.ticari_guvenli_numeric(p_sonuc ->> 'belge_iskonto_tutari'), 0),
    COALESCE(public.ticari_guvenli_numeric(p_sonuc ->> 'manuel_fiyat_farki'), 0),
    COALESCE(public.ticari_guvenli_numeric(p_sonuc ->> 'manuel_yuvarlama_farki'), 0),
    COALESCE(public.ticari_guvenli_numeric(p_sonuc ->> 'hesaplama_yuvarlama_farki'), 0),
    COALESCE(public.ticari_guvenli_numeric(p_sonuc ->> 'nakliye_override_farki'), 0),
    COALESCE(public.ticari_guvenli_numeric(p_sonuc ->> 'vade_farki'), 0),
    public.ticari_guvenli_numeric(p_sonuc ->> 'kdv_tutari'),
    public.ticari_guvenli_numeric(p_sonuc ->> 'genel_toplam'),
    public.ticari_guvenli_numeric(p_sonuc ->> 'tahmini_maliyet'),
    public.ticari_guvenli_numeric(p_sonuc ->> 'tahmini_kar'),
    public.ticari_guvenli_numeric(p_sonuc ->> 'marj_yuzdesi'),
    public.ticari_guvenli_numeric(p_sonuc ->> 'minimum_marj_yuzdesi'),
    COALESCE((p_sonuc ->> 'dusuk_marj')::boolean, false),
    NULLIF(p_sonuc ->> 'dusuk_marj_gerekcesi', ''),
    auth.uid()
  )
  RETURNING id INTO v_revizyon_id;

  INSERT INTO public.siparis_detay_fiyat_snapshotlari (
    siparis_fiyat_revizyonu_id,
    siparis_detay_id,
    girdi_satir_no,
    stok_id,
    recete_id,
    recete_surumu_id,
    kdv_grubu_id,
    kdv_grup_surumu_id,
    genislik_mm,
    yukseklik_mm,
    yuvarlanmis_genislik_mm,
    yuvarlanmis_yukseklik_mm,
    adet,
    tek_parca_m2,
    faturalanabilir_m2,
    birim_fiyat,
    brut_tutar,
    satir_iskonto_tutari,
    net_tutar,
    tahmini_maliyet,
    tahmini_kar,
    marj_yuzdesi,
    satir_snapshot
  )
  SELECT
    v_revizyon_id,
    public.ticari_guvenli_uuid(esleme.value ->> 'detay_id'),
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
    COALESCE(public.ticari_guvenli_numeric(satir.value ->> 'satir_iskonto_tutari'), 0),
    public.ticari_guvenli_numeric(satir.value ->> 'net_tutar'),
    public.ticari_guvenli_numeric(satir.value ->> 'tahmini_maliyet'),
    public.ticari_guvenli_numeric(satir.value ->> 'tahmini_kar'),
    public.ticari_guvenli_numeric(satir.value ->> 'marj_yuzdesi'),
    satir.value
  FROM jsonb_array_elements(COALESCE(p_sonuc -> 'satirlar', '[]'::jsonb)) satir(value)
  JOIN LATERAL (
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_detay_esleme, '[]'::jsonb))
    WHERE public.ticari_guvenli_integer(value ->> 'satir_no')
      = public.ticari_guvenli_integer(satir.value ->> 'satir_no')
    LIMIT 1
  ) esleme ON true;

  INSERT INTO public.siparis_fiyat_bilesenleri (
    siparis_fiyat_revizyonu_id,
    siparis_detay_fiyat_snapshot_id,
    bilesen_turu,
    kaynak_turu,
    kaynak_id,
    hesaplama_birimi,
    miktar,
    birim_fiyat,
    liste_tutari,
    iskonto_tutari,
    override_tutari,
    fark_tutari,
    net_tutar,
    tahmini_maliyet,
    para_birimi,
    kdv_grubu_id,
    kdv_grup_surumu_id,
    ucretsiz,
    sira_no,
    metadata
  )
  SELECT
    v_revizyon_id,
    snapshot.id,
    bilesen.value ->> 'bilesen_turu',
    NULLIF(bilesen.value ->> 'kaynak_turu', ''),
    public.ticari_guvenli_uuid(bilesen.value ->> 'kaynak_id'),
    (bilesen.value ->> 'hesaplama_birimi')::public.hesaplama_birimi,
    public.ticari_guvenli_numeric(bilesen.value ->> 'miktar'),
    public.ticari_guvenli_numeric(bilesen.value ->> 'birim_fiyat'),
    COALESCE(public.ticari_guvenli_numeric(bilesen.value ->> 'liste_tutari'), 0),
    COALESCE(public.ticari_guvenli_numeric(bilesen.value ->> 'iskonto_tutari'), 0),
    public.ticari_guvenli_numeric(bilesen.value ->> 'override_tutari'),
    COALESCE(public.ticari_guvenli_numeric(bilesen.value ->> 'fark_tutari'), 0),
    public.ticari_guvenli_numeric(bilesen.value ->> 'net_tutar'),
    COALESCE(public.ticari_guvenli_numeric(bilesen.value ->> 'tahmini_maliyet'), 0),
    (bilesen.value ->> 'para_birimi')::public.para_birimi_kodu,
    public.ticari_guvenli_uuid(bilesen.value ->> 'kdv_grubu_id'),
    public.ticari_guvenli_uuid(bilesen.value ->> 'kdv_grup_surumu_id'),
    COALESCE((bilesen.value ->> 'ucretsiz')::boolean, false),
    COALESCE(public.ticari_guvenli_integer(bilesen.value ->> 'sira_no'), 1),
    COALESCE(bilesen.value -> 'metadata', '{}'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_sonuc -> 'bilesenler', '[]'::jsonb)) bilesen(value)
  LEFT JOIN public.siparis_detay_fiyat_snapshotlari snapshot
    ON snapshot.siparis_fiyat_revizyonu_id = v_revizyon_id
   AND snapshot.girdi_satir_no = public.ticari_guvenli_integer(bilesen.value ->> 'satir_no');

  INSERT INTO public.siparis_fiyat_kur_snapshotlari (
    siparis_fiyat_revizyonu_id,
    doviz_kuru_id,
    istenen_belge_tarihi,
    fiilen_kullanilan_tcmb_tarihi,
    kur_tipi,
    kur_degeri,
    para_birimi,
    kaynak,
    manuel_gerekce
  )
  SELECT
    v_revizyon_id,
    public.ticari_guvenli_uuid(kur.value ->> 'doviz_kuru_id'),
    COALESCE(NULLIF(kur.value ->> 'kur_tarihi', '')::date, (p_sonuc ->> 'fiyatlandirma_tarihi')::date),
    COALESCE(NULLIF(kur.value ->> 'tcmb_kaynak_tarihi', '')::date, (p_sonuc ->> 'fiyatlandirma_tarihi')::date),
    COALESCE(NULLIF(kur.value ->> 'kur_tipi', '')::public.doviz_kur_tipi, 'doviz_satis'),
    public.ticari_guvenli_numeric(kur.value ->> 'try_karsiligi'),
    (kur.value ->> 'para_birimi')::public.para_birimi_kodu,
    COALESCE(NULLIF(kur.value ->> 'kaynak', '')::public.doviz_kur_kaynagi, 'otomatik'),
    NULLIF(kur.value ->> 'manuel_gerekce', '')
  FROM jsonb_array_elements(COALESCE(p_sonuc -> 'kur_snapshotlari', '[]'::jsonb)) kur(value);

  INSERT INTO public.siparis_kdv_ozetleri (
    siparis_fiyat_revizyonu_id,
    kdv_grubu_id,
    kdv_grup_surumu_id,
    matrah,
    kdv_orani,
    kdv_tutari,
    dagitim_farki
  )
  SELECT
    v_revizyon_id,
    public.ticari_guvenli_uuid(kdv.value ->> 'kdv_grubu_id'),
    public.ticari_guvenli_uuid(kdv.value ->> 'kdv_grup_surumu_id'),
    public.ticari_guvenli_numeric(kdv.value ->> 'matrah'),
    public.ticari_guvenli_numeric(kdv.value ->> 'kdv_orani'),
    public.ticari_guvenli_numeric(kdv.value ->> 'kdv_tutari'),
    COALESCE(public.ticari_guvenli_numeric(kdv.value ->> 'dagitim_farki'), 0)
  FROM jsonb_array_elements(COALESCE(p_sonuc -> 'kdv_ozetleri', '[]'::jsonb)) kdv(value);

  RETURN v_revizyon_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.siparis_ticari_mudahale_kayitlarini_yaz(
  p_siparis_fiyat_revizyonu_id uuid,
  p_onceki_revizyon_id uuid,
  p_belge jsonb,
  p_sonuc jsonb,
  p_teklif_revizyonu_id uuid DEFAULT NULL,
  p_onceki_girdi_override jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_onceki_girdi jsonb := '{}'::jsonb;
  v_gerekce text := NULLIF(trim(p_belge ->> 'ticari_mudahale_gerekcesi'), '');
  v_dusuk_marj_gerekcesi text := NULLIF(trim(p_belge ->> 'dusuk_marj_gerekcesi'), '');
  v_onceki_yuzde numeric;
  v_onceki_tutar numeric;
  v_yeni_yuzde numeric;
  v_yeni_tutar numeric;
  v_onceki_var boolean := false;
  v_satir_mudahalesi_degisti boolean := false;
BEGIN
  IF (p_siparis_fiyat_revizyonu_id IS NULL) =
     (p_teklif_revizyonu_id IS NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'MUDAHALE_KAYDI_BELGE_TURU_GECERSIZ';
  END IF;

  IF p_onceki_revizyon_id IS NOT NULL THEN
    SELECT ticari_girdi_snapshot
    INTO v_onceki_girdi
    FROM public.siparis_fiyat_revizyonlari
    WHERE id = p_onceki_revizyon_id;
  ELSIF p_onceki_girdi_override IS NOT NULL THEN
    v_onceki_girdi := p_onceki_girdi_override;
  END IF;
  v_onceki_girdi := COALESCE(v_onceki_girdi, '{}'::jsonb);
  v_onceki_var := p_onceki_revizyon_id IS NOT NULL
    OR p_onceki_girdi_override IS NOT NULL;

  v_onceki_yuzde := public.ticari_guvenli_numeric(v_onceki_girdi ->> 'belge_iskonto_yuzdesi');
  v_onceki_tutar := public.ticari_guvenli_numeric(v_onceki_girdi ->> 'belge_iskonto_tutari');
  v_yeni_yuzde := public.ticari_guvenli_numeric(p_belge ->> 'belge_iskonto_yuzdesi');
  v_yeni_tutar := public.ticari_guvenli_numeric(p_belge ->> 'belge_iskonto_tutari');

  WITH yeni AS (
    SELECT
      COALESCE(NULLIF(satir.value ->> 'detay_id', ''), '#' || satir.ordinality::text) AS anahtar,
      public.ticari_guvenli_numeric(satir.value ->> 'satir_iskonto_yuzdesi') AS iskonto_yuzdesi,
      public.ticari_guvenli_numeric(satir.value ->> 'satir_iskonto_tutari') AS iskonto_tutari,
      COALESCE((satir.value ->> 'kenar_islemi_ucretsiz')::boolean, false) AS kenar_ucretsiz,
      COALESCE((satir.value ->> 'menfez_ucretsiz')::boolean, false) AS menfez_ucretsiz,
      COALESCE((satir.value ->> 'kucuk_cam_ucretsiz')::boolean, false) AS kucuk_cam_ucretsiz,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'kalem_kodu', ekstra.value ->> 'kalem_kodu',
            'ucretsiz', COALESCE((ekstra.value ->> 'ucretsiz')::boolean, false)
          )
          ORDER BY ekstra.ordinality
        )
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(satir.value -> 'diger_kalemler') = 'array'
              THEN satir.value -> 'diger_kalemler'
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS ekstra(value, ordinality)
        WHERE COALESCE((ekstra.value ->> 'ucretsiz')::boolean, false)
      ), '[]'::jsonb) AS diger_ucretsiz
    FROM jsonb_array_elements(COALESCE(p_belge -> 'satirlar', '[]'::jsonb))
      WITH ORDINALITY AS satir(value, ordinality)
  ),
  onceki AS (
    SELECT
      COALESCE(NULLIF(satir.value ->> 'detay_id', ''), '#' || satir.ordinality::text) AS anahtar,
      public.ticari_guvenli_numeric(satir.value ->> 'satir_iskonto_yuzdesi') AS iskonto_yuzdesi,
      public.ticari_guvenli_numeric(satir.value ->> 'satir_iskonto_tutari') AS iskonto_tutari,
      COALESCE((satir.value ->> 'kenar_islemi_ucretsiz')::boolean, false) AS kenar_ucretsiz,
      COALESCE((satir.value ->> 'menfez_ucretsiz')::boolean, false) AS menfez_ucretsiz,
      COALESCE((satir.value ->> 'kucuk_cam_ucretsiz')::boolean, false) AS kucuk_cam_ucretsiz,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'kalem_kodu', ekstra.value ->> 'kalem_kodu',
            'ucretsiz', COALESCE((ekstra.value ->> 'ucretsiz')::boolean, false)
          )
          ORDER BY ekstra.ordinality
        )
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(satir.value -> 'diger_kalemler') = 'array'
              THEN satir.value -> 'diger_kalemler'
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS ekstra(value, ordinality)
        WHERE COALESCE((ekstra.value ->> 'ucretsiz')::boolean, false)
      ), '[]'::jsonb) AS diger_ucretsiz
    FROM jsonb_array_elements(COALESCE(v_onceki_girdi -> 'satirlar', '[]'::jsonb))
      WITH ORDINALITY AS satir(value, ordinality)
  )
  SELECT EXISTS (
    SELECT 1
    FROM yeni
    FULL JOIN onceki USING (anahtar)
    WHERE COALESCE(yeni.iskonto_yuzdesi, 0)
            IS DISTINCT FROM COALESCE(onceki.iskonto_yuzdesi, 0)
       OR COALESCE(yeni.iskonto_tutari, 0)
            IS DISTINCT FROM COALESCE(onceki.iskonto_tutari, 0)
       OR COALESCE(yeni.kenar_ucretsiz, false)
            IS DISTINCT FROM COALESCE(onceki.kenar_ucretsiz, false)
       OR COALESCE(yeni.menfez_ucretsiz, false)
            IS DISTINCT FROM COALESCE(onceki.menfez_ucretsiz, false)
       OR COALESCE(yeni.kucuk_cam_ucretsiz, false)
            IS DISTINCT FROM COALESCE(onceki.kucuk_cam_ucretsiz, false)
       OR COALESCE(yeni.diger_ucretsiz, '[]'::jsonb)
            IS DISTINCT FROM COALESCE(onceki.diger_ucretsiz, '[]'::jsonb)
  )
  INTO v_satir_mudahalesi_degisti;

  IF (
      v_satir_mudahalesi_degisti
      OR COALESCE(v_yeni_yuzde, 0) IS DISTINCT FROM COALESCE(v_onceki_yuzde, 0)
      OR COALESCE(v_yeni_tutar, 0) IS DISTINCT FROM COALESCE(v_onceki_tutar, 0)
      OR COALESCE(public.ticari_guvenli_numeric(p_belge ->> 'manuel_fiyat_farki'), 0)
           IS DISTINCT FROM COALESCE(
             public.ticari_guvenli_numeric(v_onceki_girdi ->> 'manuel_fiyat_farki'), 0
           )
      OR COALESCE(public.ticari_guvenli_numeric(p_belge ->> 'manuel_yuvarlama_farki'), 0)
           IS DISTINCT FROM COALESCE(
             public.ticari_guvenli_numeric(v_onceki_girdi ->> 'manuel_yuvarlama_farki'), 0
           )
      OR public.ticari_guvenli_numeric(p_belge ->> 'nakliye_satis_override')
           IS DISTINCT FROM public.ticari_guvenli_numeric(
             v_onceki_girdi ->> 'nakliye_satis_override'
           )
      OR public.ticari_guvenli_numeric(p_belge ->> 'nakliye_maliyet_override')
           IS DISTINCT FROM public.ticari_guvenli_numeric(
             v_onceki_girdi ->> 'nakliye_maliyet_override'
           )
    )
    AND length(COALESCE(v_gerekce, '')) < 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TICARI_MUDAHALE_GEREKCESI_GEREKLI';
  END IF;

  WITH yeni AS (
    SELECT
      COALESCE(NULLIF(satir.value ->> 'detay_id', ''), '#' || satir.ordinality::text) AS anahtar,
      satir.ordinality::integer AS satir_no,
      satir.value
    FROM jsonb_array_elements(COALESCE(p_belge -> 'satirlar', '[]'::jsonb))
      WITH ORDINALITY AS satir(value, ordinality)
  ),
  onceki AS (
    SELECT
      COALESCE(NULLIF(satir.value ->> 'detay_id', ''), '#' || satir.ordinality::text) AS anahtar,
      satir.ordinality::integer AS satir_no,
      satir.value
    FROM jsonb_array_elements(COALESCE(v_onceki_girdi -> 'satirlar', '[]'::jsonb))
      WITH ORDINALITY AS satir(value, ordinality)
  ),
  eslesen AS (
    SELECT
      COALESCE(yeni.anahtar, onceki.anahtar) AS anahtar,
      COALESCE(yeni.satir_no, onceki.satir_no) AS satir_no,
      yeni.value AS yeni_deger,
      onceki.value AS onceki_deger
    FROM yeni
    FULL JOIN onceki USING (anahtar)
  ),
  yeni_satirlar AS (
    SELECT
      COALESCE(NULLIF(satir.value ->> 'detay_id', ''), '#' || satir.ordinality::text) AS satir_anahtari,
      satir.ordinality::integer AS satir_no,
      satir.value
    FROM jsonb_array_elements(COALESCE(p_belge -> 'satirlar', '[]'::jsonb))
      WITH ORDINALITY AS satir(value, ordinality)
  ),
  onceki_satirlar AS (
    SELECT
      COALESCE(NULLIF(satir.value ->> 'detay_id', ''), '#' || satir.ordinality::text) AS satir_anahtari,
      satir.ordinality::integer AS satir_no,
      satir.value
    FROM jsonb_array_elements(COALESCE(v_onceki_girdi -> 'satirlar', '[]'::jsonb))
      WITH ORDINALITY AS satir(value, ordinality)
  ),
  yeni_ekstra AS (
    SELECT
      satir_anahtari,
      satir_no,
      ekstra.ekstra_anahtari,
      ekstra.ucretsiz
    FROM yeni_satirlar
    CROSS JOIN LATERAL (
      VALUES
        (
          'kenar_islemi',
          COALESCE((value ->> 'kenar_islemi_ucretsiz')::boolean, false)
        ),
        (
          'menfez',
          COALESCE((value ->> 'menfez_ucretsiz')::boolean, false)
        ),
        (
          'kucuk_cam',
          COALESCE((value ->> 'kucuk_cam_ucretsiz')::boolean, false)
        )
    ) AS ekstra(ekstra_anahtari, ucretsiz)
    UNION ALL
    SELECT
      satir.satir_anahtari,
      satir.satir_no,
      'diger:' || COALESCE(NULLIF(ekstra.value ->> 'kalem_kodu', ''), '#')
        || ':' || ekstra.ordinality::text,
      COALESCE((ekstra.value ->> 'ucretsiz')::boolean, false)
    FROM yeni_satirlar satir
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(satir.value -> 'diger_kalemler') = 'array'
          THEN satir.value -> 'diger_kalemler'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS ekstra(value, ordinality)
  ),
  onceki_ekstra AS (
    SELECT
      satir_anahtari,
      satir_no,
      ekstra.ekstra_anahtari,
      ekstra.ucretsiz
    FROM onceki_satirlar
    CROSS JOIN LATERAL (
      VALUES
        (
          'kenar_islemi',
          COALESCE((value ->> 'kenar_islemi_ucretsiz')::boolean, false)
        ),
        (
          'menfez',
          COALESCE((value ->> 'menfez_ucretsiz')::boolean, false)
        ),
        (
          'kucuk_cam',
          COALESCE((value ->> 'kucuk_cam_ucretsiz')::boolean, false)
        )
    ) AS ekstra(ekstra_anahtari, ucretsiz)
    UNION ALL
    SELECT
      satir.satir_anahtari,
      satir.satir_no,
      'diger:' || COALESCE(NULLIF(ekstra.value ->> 'kalem_kodu', ''), '#')
        || ':' || ekstra.ordinality::text,
      COALESCE((ekstra.value ->> 'ucretsiz')::boolean, false)
    FROM onceki_satirlar satir
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(satir.value -> 'diger_kalemler') = 'array'
          THEN satir.value -> 'diger_kalemler'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS ekstra(value, ordinality)
  ),
  eslesen_ekstra AS (
    SELECT
      COALESCE(yeni.satir_anahtari, onceki.satir_anahtari) AS satir_anahtari,
      COALESCE(yeni.satir_no, onceki.satir_no) AS satir_no,
      COALESCE(yeni.ekstra_anahtari, onceki.ekstra_anahtari) AS ekstra_anahtari,
      yeni.ucretsiz AS yeni_ucretsiz,
      onceki.ucretsiz AS onceki_ucretsiz,
      onceki.satir_anahtari IS NOT NULL AS onceki_var
    FROM yeni_ekstra yeni
    FULL JOIN onceki_ekstra onceki
      ON onceki.satir_anahtari = yeni.satir_anahtari
     AND onceki.ekstra_anahtari = yeni.ekstra_anahtari
  )
  INSERT INTO public.ticari_mudahale_kayitlari (
    mudahale_turu,
    siparis_fiyat_revizyonu_id,
    teklif_revizyonu_id,
    alan_veya_bilesen,
    onceki_deger,
    yeni_deger,
    gerekce,
    kullanici_id
  )
  SELECT
    CASE
      WHEN COALESCE(
        public.ticari_guvenli_numeric(eslesen.yeni_deger ->> 'satir_iskonto_yuzdesi'),
        public.ticari_guvenli_numeric(eslesen.onceki_deger ->> 'satir_iskonto_yuzdesi')
      ) IS NOT NULL
        THEN 'satir_yuzde_iskonto'
      ELSE 'satir_tutar_iskonto'
    END,
    p_siparis_fiyat_revizyonu_id,
    p_teklif_revizyonu_id,
    'satir:' || eslesen.satir_no::text,
    CASE
      WHEN eslesen.onceki_deger IS NULL THEN NULL
      ELSE jsonb_build_object(
        'yuzde', public.ticari_guvenli_numeric(eslesen.onceki_deger ->> 'satir_iskonto_yuzdesi'),
        'tutar', public.ticari_guvenli_numeric(eslesen.onceki_deger ->> 'satir_iskonto_tutari')
      )
    END,
    jsonb_build_object(
      'yuzde', public.ticari_guvenli_numeric(eslesen.yeni_deger ->> 'satir_iskonto_yuzdesi'),
      'istenen_tutar', public.ticari_guvenli_numeric(eslesen.yeni_deger ->> 'satir_iskonto_tutari'),
      'uygulanan_tutar', COALESCE((
        SELECT public.ticari_guvenli_numeric(sonuc_satir.value ->> 'satir_iskonto_tutari')
        FROM jsonb_array_elements(COALESCE(p_sonuc -> 'satirlar', '[]'::jsonb))
          sonuc_satir(value)
        WHERE public.ticari_guvenli_integer(sonuc_satir.value ->> 'satir_no')
          = eslesen.satir_no
        LIMIT 1
      ), 0)
    ),
    v_gerekce,
    auth.uid()
  FROM eslesen
  WHERE COALESCE(
      public.ticari_guvenli_numeric(eslesen.yeni_deger ->> 'satir_iskonto_yuzdesi'),
      0
    ) IS DISTINCT FROM COALESCE(
      public.ticari_guvenli_numeric(eslesen.onceki_deger ->> 'satir_iskonto_yuzdesi'),
      0
    )
    OR COALESCE(
      public.ticari_guvenli_numeric(eslesen.yeni_deger ->> 'satir_iskonto_tutari'),
      0
    ) IS DISTINCT FROM COALESCE(
      public.ticari_guvenli_numeric(eslesen.onceki_deger ->> 'satir_iskonto_tutari'),
      0
    )
  UNION ALL
  SELECT
    'ucretsiz_ekstra',
    p_siparis_fiyat_revizyonu_id,
    p_teklif_revizyonu_id,
    'satir:' || eslesen.satir_no::text || ':' || eslesen.ekstra_anahtari,
    CASE
      WHEN eslesen.onceki_var
        THEN jsonb_build_object('ucretsiz', COALESCE(eslesen.onceki_ucretsiz, false))
      ELSE NULL
    END,
    jsonb_build_object('ucretsiz', COALESCE(eslesen.yeni_ucretsiz, false)),
    v_gerekce,
    auth.uid()
  FROM eslesen_ekstra eslesen
  WHERE COALESCE(eslesen.yeni_ucretsiz, false)
    IS DISTINCT FROM COALESCE(eslesen.onceki_ucretsiz, false);

  IF COALESCE(v_yeni_yuzde, 0) IS DISTINCT FROM COALESCE(v_onceki_yuzde, 0)
     OR COALESCE(v_yeni_tutar, 0) IS DISTINCT FROM COALESCE(v_onceki_tutar, 0) THEN
    INSERT INTO public.ticari_mudahale_kayitlari (
      mudahale_turu,
      siparis_fiyat_revizyonu_id,
      teklif_revizyonu_id,
      alan_veya_bilesen,
      onceki_deger,
      yeni_deger,
      gerekce,
      kullanici_id
    )
    VALUES (
      CASE WHEN v_yeni_yuzde IS NOT NULL THEN 'belge_yuzde_iskonto'
        ELSE 'belge_tutar_iskonto' END,
      p_siparis_fiyat_revizyonu_id,
      p_teklif_revizyonu_id,
      'belge_iskontosu',
      CASE
        WHEN NOT v_onceki_var THEN NULL
        ELSE jsonb_build_object('yuzde', v_onceki_yuzde, 'tutar', v_onceki_tutar)
      END,
      jsonb_build_object(
        'yuzde', v_yeni_yuzde,
        'istenen_tutar', v_yeni_tutar,
        'uygulanan_tutar', public.ticari_guvenli_numeric(p_sonuc ->> 'belge_iskonto_tutari')
      ),
      v_gerekce,
      auth.uid()
    );
  END IF;

  INSERT INTO public.ticari_mudahale_kayitlari (
    mudahale_turu,
    siparis_fiyat_revizyonu_id,
    teklif_revizyonu_id,
    alan_veya_bilesen,
    onceki_deger,
    yeni_deger,
    gerekce,
    kullanici_id
  )
  SELECT
    deger.mudahale_turu,
    p_siparis_fiyat_revizyonu_id,
    p_teklif_revizyonu_id,
    deger.alan,
    CASE
      WHEN NOT v_onceki_var THEN NULL
      ELSE jsonb_build_object('deger', deger.onceki_deger)
    END,
    jsonb_build_object(
      'istenen_deger', deger.yeni_deger,
      'uygulanan_deger', deger.uygulanan_deger
    ),
    v_gerekce,
    auth.uid()
  FROM (
    VALUES
      (
        'manuel_fiyat_farki',
        'manuel_fiyat_farki',
        public.ticari_guvenli_numeric(v_onceki_girdi ->> 'manuel_fiyat_farki'),
        public.ticari_guvenli_numeric(p_belge ->> 'manuel_fiyat_farki'),
        public.ticari_guvenli_numeric(p_sonuc ->> 'manuel_fiyat_farki')
      ),
      (
        'manuel_yuvarlama_farki',
        'manuel_yuvarlama_farki',
        public.ticari_guvenli_numeric(v_onceki_girdi ->> 'manuel_yuvarlama_farki'),
        public.ticari_guvenli_numeric(p_belge ->> 'manuel_yuvarlama_farki'),
        public.ticari_guvenli_numeric(p_sonuc ->> 'manuel_yuvarlama_farki')
      ),
      (
        'nakliye_satis_override',
        'nakliye_satis_override',
        public.ticari_guvenli_numeric(v_onceki_girdi ->> 'nakliye_satis_override'),
        public.ticari_guvenli_numeric(p_belge ->> 'nakliye_satis_override'),
        public.ticari_guvenli_numeric(p_sonuc ->> 'nakliye_override_farki')
      ),
      (
        'nakliye_maliyet_override',
        'nakliye_maliyet_override',
        public.ticari_guvenli_numeric(v_onceki_girdi ->> 'nakliye_maliyet_override'),
        public.ticari_guvenli_numeric(p_belge ->> 'nakliye_maliyet_override'),
        public.ticari_guvenli_numeric(p_belge ->> 'nakliye_maliyet_override')
      )
  ) AS deger(
    mudahale_turu,
    alan,
    onceki_deger,
    yeni_deger,
    uygulanan_deger
  )
  WHERE (
      (
        deger.mudahale_turu IN ('manuel_fiyat_farki', 'manuel_yuvarlama_farki')
        AND COALESCE(deger.yeni_deger, 0) IS DISTINCT FROM COALESCE(deger.onceki_deger, 0)
      )
      OR (
        deger.mudahale_turu NOT IN ('manuel_fiyat_farki', 'manuel_yuvarlama_farki')
        AND deger.yeni_deger IS DISTINCT FROM deger.onceki_deger
      )
    )
    AND (
      deger.yeni_deger IS NOT NULL
      OR deger.onceki_deger IS NOT NULL
    );

  IF COALESCE((p_sonuc ->> 'dusuk_marj')::boolean, false) THEN
    INSERT INTO public.ticari_mudahale_kayitlari (
      mudahale_turu,
      siparis_fiyat_revizyonu_id,
      teklif_revizyonu_id,
      alan_veya_bilesen,
      onceki_deger,
      yeni_deger,
      gerekce,
      kullanici_id
    )
    VALUES (
      'dusuk_marj',
      p_siparis_fiyat_revizyonu_id,
      p_teklif_revizyonu_id,
      'marj_yuzdesi',
      NULL,
      jsonb_build_object(
        'marj_yuzdesi', public.ticari_guvenli_numeric(p_sonuc ->> 'marj_yuzdesi'),
        'minimum_marj_yuzdesi', public.ticari_guvenli_numeric(p_sonuc ->> 'minimum_marj_yuzdesi')
      ),
      v_dusuk_marj_gerekcesi,
      auth.uid()
    );
  END IF;
END;
$$;

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
BEGIN
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
      END
    );
  END IF;

  RETURN jsonb_build_object('gecerli', true, 'sonuc', v_onizleme.sonuc_json);
END;
$$;

REVOKE ALL ON FUNCTION public.siparis_fiyat_snapshotlarini_yaz(uuid, uuid, jsonb, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.siparis_ticari_mudahale_kayitlarini_yaz(
  uuid, uuid, jsonb, jsonb, uuid, jsonb
)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiyat_onizlemesini_dogrula(uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

-- Legacy sonraki_sayac RPC'sinin 1.000 adet sınırı korunur. Ticari sipariş
-- transaction'ı için yalnız cam_kodu anahtarına ve 10.000 satırlık dar bir
-- üst sınıra izin veren, istemciden çağrılamayan ayrı allocator kullanılır.
CREATE OR REPLACE FUNCTION public.ticari_cam_kodu_sayac_tahsis(p_adet integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deger integer;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (
       public.has_permission('orders', 'create')
       OR public.has_permission('orders', 'update')
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ORDERS_YETKISI_GEREKLI';
  END IF;
  IF p_adet < 1 OR p_adet > 10000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CAM_KODU_SAYAC_ADEDI_GECERSIZ';
  END IF;

  INSERT INTO public.sayaclar(anahtar, deger)
  VALUES ('cam_kodu', p_adet)
  ON CONFLICT (anahtar) DO UPDATE
    SET deger = public.sayaclar.deger + EXCLUDED.deger
  RETURNING deger INTO v_deger;

  RETURN v_deger;
END;
$$;

REVOKE ALL ON FUNCTION public.ticari_cam_kodu_sayac_tahsis(integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.siparis_fiyatli_olustur(
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
  v_mod public.ticari_modul_modu;
  v_idempotency_payload jsonb;
  v_onceki_sonuc jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_dogrulama jsonb;
  v_sonuc jsonb;
  v_siparis_id uuid;
  v_siparis_no text;
  v_revizyon_id uuid;
  v_detay_esleme jsonb;
  v_satir_sayisi integer;
  v_cam_son_sayac integer;
  v_genel_toplam numeric(18,2);
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('orders', 'create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ORDERS_CREATE_YETKISI_GEREKLI';
  END IF;

  SELECT mod INTO v_mod FROM public.ticari_modul_durumu WHERE singleton;
  IF v_mod IS DISTINCT FROM 'aktif' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FEATURE_MODE_ISLEME_KAPALI';
  END IF;

  v_idempotency_payload := jsonb_build_object(
    'belge', p_belge,
    'onizleme_id', p_onizleme_id,
    'onizleme_hash', p_onizleme_hash
  );

  v_onceki_sonuc := public.ticari_idempotency_onceki_sonuc(
    'siparis_olusturma', p_idempotency_key, v_idempotency_payload
  );
  IF v_onceki_sonuc IS NOT NULL THEN
    RETURN v_onceki_sonuc;
  END IF;

  v_dogrulama := public.fiyat_onizlemesini_dogrula(
    p_onizleme_id, p_onizleme_hash, p_belge, NULL
  );
  IF NOT COALESCE((v_dogrulama ->> 'gecerli')::boolean, false) THEN
    RETURN v_dogrulama;
  END IF;
  v_sonuc := v_dogrulama -> 'sonuc';

  v_idempotency := public.ticari_idempotency_baslat(
    'siparis_olusturma', p_idempotency_key, v_idempotency_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  v_satir_sayisi := jsonb_array_length(COALESCE(p_belge -> 'satirlar', '[]'::jsonb));
  IF v_satir_sayisi <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SIPARIS_SATIRI_GEREKLI';
  END IF;

  DROP TABLE IF EXISTS pg_temp.siparis_rpc_detaylari;
  CREATE TEMP TABLE siparis_rpc_detaylari (
    satir_no integer PRIMARY KEY,
    detay_id uuid NOT NULL,
    stok_id uuid NOT NULL,
    cam_kodu text NOT NULL,
    genislik_mm numeric NOT NULL,
    yukseklik_mm numeric NOT NULL,
    adet integer NOT NULL,
    cita_stok_id uuid,
    kenar_islemi text,
    notlar text,
    poz text,
    menfez_cap_mm numeric,
    kucuk_cam boolean NOT NULL
  ) ON COMMIT DROP;
  v_cam_son_sayac := public.ticari_cam_kodu_sayac_tahsis(v_satir_sayisi);
  PERFORM set_config('app.ticari_siparis_rpc', 'on', true);

  INSERT INTO pg_temp.siparis_rpc_detaylari (
    satir_no, detay_id, stok_id, cam_kodu, genislik_mm, yukseklik_mm, adet,
    cita_stok_id, kenar_islemi, notlar, poz, menfez_cap_mm, kucuk_cam
  )
  SELECT
    ordinality::integer,
    gen_random_uuid(),
    public.ticari_guvenli_uuid(satir ->> 'stok_id'),
    'GLS-' || (v_cam_son_sayac - v_satir_sayisi + ordinality)::text,
    public.ticari_guvenli_numeric(satir ->> 'genislik_mm'),
    public.ticari_guvenli_numeric(satir ->> 'yukseklik_mm'),
    public.ticari_guvenli_integer(satir ->> 'adet'),
    public.ticari_guvenli_uuid(satir ->> 'cita_stok_id'),
    NULLIF(satir ->> 'kenar_islemi', ''),
    NULLIF(satir ->> 'notlar', ''),
    NULLIF(satir ->> 'poz', ''),
    public.ticari_guvenli_numeric(satir ->> 'menfez_cap_mm'),
    COALESCE((satir ->> 'kucuk_cam')::boolean, false)
  FROM jsonb_array_elements(p_belge -> 'satirlar')
    WITH ORDINALITY AS girdi(satir, ordinality);

  v_siparis_id := gen_random_uuid();
  v_siparis_no := 'SIP-' || extract(year FROM (p_belge ->> 'tarih')::date)::integer::text
    || '-' || lpad(
      public.sonraki_sayac(
        'siparis_no_' || extract(year FROM (p_belge ->> 'tarih')::date)::integer::text,
        1
      )::text,
      4,
      '0'
    );

  INSERT INTO public.siparisler (
    id,
    siparis_no,
    cari_id,
    tarih,
    teslim_tarihi,
    durum,
    notlar,
    alt_musteri,
    harici_siparis_no,
    teslimat_tipi,
    kaynak,
    revision_no,
    fiyatlandirildi,
    para_birimi,
    fiyatlandirma_tarihi
  )
  VALUES (
    v_siparis_id,
    v_siparis_no,
    public.ticari_guvenli_uuid(p_belge ->> 'cari_id'),
    (p_belge ->> 'tarih')::date,
    NULLIF(p_belge ->> 'teslim_tarihi', '')::date,
    'beklemede',
    NULLIF(p_belge ->> 'notlar', ''),
    NULLIF(p_belge ->> 'alt_musteri', ''),
    NULLIF(p_belge ->> 'harici_siparis_no', ''),
    COALESCE(NULLIF(p_belge ->> 'teslimat_tipi', ''), 'teslim_alacak'),
    COALESCE(NULLIF(p_belge ->> 'kaynak', ''), 'manuel'),
    1,
    true,
    (v_sonuc ->> 'para_birimi')::text,
    (v_sonuc ->> 'fiyatlandirma_tarihi')::date
  );

  INSERT INTO public.siparis_detaylari (
    id,
    siparis_id,
    stok_id,
    cam_kodu,
    genislik_mm,
    yukseklik_mm,
    adet,
    cita_stok_id,
    kenar_islemi,
    notlar,
    poz,
    menfez_cap_mm,
    kucuk_cam,
    uretim_durumu,
    aktif
  )
  SELECT
    detay_id,
    v_siparis_id,
    stok_id,
    cam_kodu,
    genislik_mm,
    yukseklik_mm,
    adet,
    cita_stok_id,
    kenar_islemi,
    notlar,
    poz,
    menfez_cap_mm,
    kucuk_cam,
    'bekliyor',
    true
  FROM pg_temp.siparis_rpc_detaylari
  ORDER BY satir_no;

  SELECT jsonb_agg(
    jsonb_build_object('satir_no', satir_no, 'detay_id', detay_id)
    ORDER BY satir_no
  )
  INTO v_detay_esleme
  FROM pg_temp.siparis_rpc_detaylari;

  v_revizyon_id := public.siparis_fiyat_snapshotlarini_yaz(
    v_siparis_id,
    p_onizleme_id,
    v_sonuc,
    v_detay_esleme,
    'ilk',
    NULL
  );

  UPDATE public.siparisler
  SET aktif_fiyat_revizyon_id = v_revizyon_id
  WHERE id = v_siparis_id;

  v_genel_toplam := public.ticari_guvenli_numeric(v_sonuc ->> 'genel_toplam');
  IF v_genel_toplam > 0 THEN
    INSERT INTO public.cari_hareketleri (
      cari_id,
      para_birimi,
      yon,
      hareket_turu,
      tutar,
      islem_tarihi,
      aciklama,
      siparis_id,
      kaynak_sinifi,
      kaynak_turu,
      kaynak_id,
      idempotency_id,
      islemi_yapan
    )
    VALUES (
      public.ticari_guvenli_uuid(p_belge ->> 'cari_id'),
      (v_sonuc ->> 'para_birimi')::text,
      'borc',
      'siparis_borcu',
      v_genel_toplam,
      now(),
      v_siparis_no || ' ilk fiyat revizyonu',
      v_siparis_id,
      'sistem',
      'siparis',
      v_revizyon_id,
      v_idempotency_id,
      auth.uid()
    );
  END IF;

  PERFORM public.siparis_ticari_mudahale_kayitlarini_yaz(
    v_revizyon_id,
    NULL,
    p_belge,
    v_sonuc
  );

  v_yanit := jsonb_build_object(
    'basarili', true,
    'siparis_id', v_siparis_id,
    'siparis_no', v_siparis_no,
    'revision_no', 1,
    'fiyat_revizyonu_id', v_revizyon_id,
    'genel_toplam', v_genel_toplam,
    'para_birimi', v_sonuc ->> 'para_birimi'
  );

  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

REVOKE ALL ON FUNCTION public.siparis_fiyatli_olustur(jsonb, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.siparis_fiyatli_olustur(jsonb, uuid, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.siparis_fiyatli_guncelle(
  p_siparis_id uuid,
  p_beklenen_revision_no integer,
  p_revizyon_turu text,
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
  v_siparis public.siparisler%ROWTYPE;
  v_onceki_revizyon public.siparis_fiyat_revizyonlari%ROWTYPE;
  v_sabit_baglam jsonb;
  v_idempotency_payload jsonb;
  v_onceki_sonuc jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_dogrulama jsonb;
  v_sonuc jsonb;
  v_yeni_revizyon_id uuid;
  v_detay_esleme jsonb;
  v_yeni_toplam numeric(18,2);
  v_fark numeric(18,2);
  v_yeni_detay_sayisi integer;
  v_cam_son_sayac integer;
  v_yanit jsonb;
  v_mod public.ticari_modul_modu;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('orders', 'update') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ORDERS_UPDATE_YETKISI_GEREKLI';
  END IF;
  IF p_revizyon_turu NOT IN ('teknik', 'ticari') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SIPARIS_REVIZYON_TURU_GECERSIZ';
  END IF;

  SELECT mod INTO v_mod FROM public.ticari_modul_durumu WHERE singleton;
  IF v_mod IS DISTINCT FROM 'aktif' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FEATURE_MODE_ISLEME_KAPALI';
  END IF;

  v_idempotency_payload := jsonb_build_object(
    'siparis_id', p_siparis_id,
    'beklenen_revision_no', p_beklenen_revision_no,
    'revizyon_turu', p_revizyon_turu,
    'belge', p_belge,
    'onizleme_id', p_onizleme_id,
    'onizleme_hash', p_onizleme_hash
  );
  v_onceki_sonuc := public.ticari_idempotency_onceki_sonuc(
    'siparis_guncelleme', p_idempotency_key, v_idempotency_payload
  );
  IF v_onceki_sonuc IS NOT NULL THEN
    RETURN v_onceki_sonuc;
  END IF;

  SELECT *
  INTO v_siparis
  FROM public.siparisler
  WHERE id = p_siparis_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_siparis.fiyatlandirildi THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FIYATLI_SIPARIS_BULUNAMADI';
  END IF;
  IF v_siparis.revision_no IS DISTINCT FROM p_beklenen_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
  END IF;
  IF v_siparis.durum = 'iptal' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SIPARIS_ZATEN_IPTAL';
  END IF;
  IF public.ticari_guvenli_uuid(p_belge ->> 'belge_id') IS DISTINCT FROM p_siparis_id
     OR public.ticari_guvenli_uuid(p_belge ->> 'cari_id') IS DISTINCT FROM v_siparis.cari_id
     OR NULLIF(p_belge ->> 'tarih', '')::date IS DISTINCT FROM v_siparis.tarih
     OR NULLIF(p_belge ->> 'para_birimi', '') IS DISTINCT FROM v_siparis.para_birimi THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SIPARIS_KIMLIK_ALANLARI_DEGISTIRILEMEZ';
  END IF;

  SELECT *
  INTO v_onceki_revizyon
  FROM public.siparis_fiyat_revizyonlari
  WHERE id = v_siparis.aktif_fiyat_revizyon_id;

  SELECT fiyat_baglami
  INTO v_sabit_baglam
  FROM public.fiyat_onizlemeleri
  WHERE id = v_onceki_revizyon.onizleme_id;

  v_dogrulama := public.fiyat_onizlemesini_dogrula(
    p_onizleme_id, p_onizleme_hash, p_belge, v_sabit_baglam
  );
  IF NOT COALESCE((v_dogrulama ->> 'gecerli')::boolean, false) THEN
    RETURN v_dogrulama;
  END IF;
  v_sonuc := v_dogrulama -> 'sonuc';

  v_idempotency := public.ticari_idempotency_baslat(
    'siparis_guncelleme', p_idempotency_key, v_idempotency_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');
  PERFORM set_config('app.ticari_siparis_rpc', 'on', true);

  DROP TABLE IF EXISTS pg_temp.siparis_rpc_detaylari;
  CREATE TEMP TABLE siparis_rpc_detaylari (
    satir_no integer PRIMARY KEY,
    detay_id uuid NOT NULL,
    stok_id uuid NOT NULL,
    cam_kodu text NOT NULL,
    genislik_mm numeric NOT NULL,
    yukseklik_mm numeric NOT NULL,
    adet integer NOT NULL,
    cita_stok_id uuid,
    kenar_islemi text,
    notlar text,
    poz text,
    menfez_cap_mm numeric,
    kucuk_cam boolean NOT NULL
  ) ON COMMIT DROP;
  IF p_revizyon_turu = 'teknik' THEN
    IF EXISTS (
      SELECT 1
      FROM public.uretim_emri_detaylari ued
      JOIN public.siparis_detaylari sd ON sd.id = ued.siparis_detay_id
      WHERE sd.siparis_id = p_siparis_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'URETIME_ALINMIS_SIPARIS_TEKNIK_DEGISTIRILEMEZ';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_belge -> 'satirlar', '[]'::jsonb)) satir(value)
      WHERE public.ticari_guvenli_uuid(satir.value ->> 'detay_id') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.siparis_detaylari sd
          WHERE sd.id = public.ticari_guvenli_uuid(satir.value ->> 'detay_id')
            AND sd.siparis_id = p_siparis_id
            AND sd.aktif
        )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SIPARIS_DETAYI_CAKISMASI';
    END IF;

    SELECT count(*)
    INTO v_yeni_detay_sayisi
    FROM jsonb_array_elements(COALESCE(p_belge -> 'satirlar', '[]'::jsonb)) satir(value)
    WHERE public.ticari_guvenli_uuid(satir.value ->> 'detay_id') IS NULL;

    v_cam_son_sayac := CASE
      WHEN v_yeni_detay_sayisi > 0
        THEN public.ticari_cam_kodu_sayac_tahsis(v_yeni_detay_sayisi)
      ELSE 0
    END;

    INSERT INTO pg_temp.siparis_rpc_detaylari (
      satir_no, detay_id, stok_id, cam_kodu, genislik_mm, yukseklik_mm, adet,
      cita_stok_id, kenar_islemi, notlar, poz, menfez_cap_mm, kucuk_cam
    )
    WITH girdi AS (
      SELECT satir, ordinality::integer AS satir_no
      FROM jsonb_array_elements(COALESCE(p_belge -> 'satirlar', '[]'::jsonb))
        WITH ORDINALITY AS x(satir, ordinality)
    ),
    numarali AS (
      SELECT *,
        count(*) FILTER (
          WHERE public.ticari_guvenli_uuid(satir ->> 'detay_id') IS NULL
        ) OVER (ORDER BY satir_no) AS yeni_sira
      FROM girdi
    )
    SELECT
      g.satir_no,
      COALESCE(public.ticari_guvenli_uuid(g.satir ->> 'detay_id'), gen_random_uuid()),
      public.ticari_guvenli_uuid(g.satir ->> 'stok_id'),
      COALESCE(
        mevcut.cam_kodu,
        'GLS-' || (v_cam_son_sayac - v_yeni_detay_sayisi + g.yeni_sira)::text
      ),
      public.ticari_guvenli_numeric(g.satir ->> 'genislik_mm'),
      public.ticari_guvenli_numeric(g.satir ->> 'yukseklik_mm'),
      public.ticari_guvenli_integer(g.satir ->> 'adet'),
      public.ticari_guvenli_uuid(g.satir ->> 'cita_stok_id'),
      NULLIF(g.satir ->> 'kenar_islemi', ''),
      NULLIF(g.satir ->> 'notlar', ''),
      NULLIF(g.satir ->> 'poz', ''),
      public.ticari_guvenli_numeric(g.satir ->> 'menfez_cap_mm'),
      COALESCE((g.satir ->> 'kucuk_cam')::boolean, false)
    FROM numarali g
    LEFT JOIN public.siparis_detaylari mevcut
      ON mevcut.id = public.ticari_guvenli_uuid(g.satir ->> 'detay_id');

    UPDATE public.siparis_detaylari mevcut
    SET stok_id = yeni.stok_id,
        genislik_mm = yeni.genislik_mm,
        yukseklik_mm = yeni.yukseklik_mm,
        adet = yeni.adet,
        cita_stok_id = yeni.cita_stok_id,
        kenar_islemi = yeni.kenar_islemi,
        notlar = yeni.notlar,
        poz = yeni.poz,
        menfez_cap_mm = yeni.menfez_cap_mm,
        kucuk_cam = yeni.kucuk_cam,
        aktif = true
    FROM pg_temp.siparis_rpc_detaylari yeni
    WHERE mevcut.id = yeni.detay_id
      AND mevcut.siparis_id = p_siparis_id;

    INSERT INTO public.siparis_detaylari (
      id, siparis_id, stok_id, cam_kodu, genislik_mm, yukseklik_mm, adet,
      cita_stok_id, kenar_islemi, notlar, poz, menfez_cap_mm, kucuk_cam,
      uretim_durumu, aktif
    )
    SELECT
      yeni.detay_id, p_siparis_id, yeni.stok_id, yeni.cam_kodu,
      yeni.genislik_mm, yeni.yukseklik_mm, yeni.adet, yeni.cita_stok_id,
      yeni.kenar_islemi, yeni.notlar, yeni.poz, yeni.menfez_cap_mm,
      yeni.kucuk_cam, 'bekliyor', true
    FROM pg_temp.siparis_rpc_detaylari yeni
    WHERE NOT EXISTS (
      SELECT 1 FROM public.siparis_detaylari mevcut WHERE mevcut.id = yeni.detay_id
    );

    UPDATE public.siparis_detaylari mevcut
    SET aktif = false
    WHERE mevcut.siparis_id = p_siparis_id
      AND mevcut.aktif
      AND NOT EXISTS (
        SELECT 1
        FROM pg_temp.siparis_rpc_detaylari yeni
        WHERE yeni.detay_id = mevcut.id
      );
  ELSE
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_belge -> 'satirlar', '[]'::jsonb)) satir(value)
      JOIN public.siparis_detaylari mevcut
        ON mevcut.id = public.ticari_guvenli_uuid(satir.value ->> 'detay_id')
       AND mevcut.siparis_id = p_siparis_id
       AND mevcut.aktif
      WHERE mevcut.stok_id IS DISTINCT FROM public.ticari_guvenli_uuid(satir.value ->> 'stok_id')
         OR mevcut.genislik_mm IS DISTINCT FROM public.ticari_guvenli_numeric(satir.value ->> 'genislik_mm')
         OR mevcut.yukseklik_mm IS DISTINCT FROM public.ticari_guvenli_numeric(satir.value ->> 'yukseklik_mm')
         OR mevcut.adet IS DISTINCT FROM public.ticari_guvenli_integer(satir.value ->> 'adet')
         OR mevcut.cita_stok_id IS DISTINCT FROM public.ticari_guvenli_uuid(satir.value ->> 'cita_stok_id')
         OR mevcut.kenar_islemi IS DISTINCT FROM NULLIF(satir.value ->> 'kenar_islemi', '')
         OR mevcut.menfez_cap_mm IS DISTINCT FROM public.ticari_guvenli_numeric(satir.value ->> 'menfez_cap_mm')
         OR mevcut.kucuk_cam IS DISTINCT FROM COALESCE((satir.value ->> 'kucuk_cam')::boolean, false)
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'TICARI_REVIZYON_TEKNIK_SATIRLARI_DEGISTIREMEZ';
    END IF;

    INSERT INTO pg_temp.siparis_rpc_detaylari (
      satir_no, detay_id, stok_id, cam_kodu, genislik_mm, yukseklik_mm, adet,
      cita_stok_id, kenar_islemi, notlar, poz, menfez_cap_mm, kucuk_cam
    )
    SELECT
      ordinality::integer,
      mevcut.id,
      mevcut.stok_id,
      mevcut.cam_kodu,
      mevcut.genislik_mm,
      mevcut.yukseklik_mm,
      mevcut.adet,
      mevcut.cita_stok_id,
      mevcut.kenar_islemi,
      mevcut.notlar,
      mevcut.poz,
      mevcut.menfez_cap_mm,
      mevcut.kucuk_cam
    FROM jsonb_array_elements(COALESCE(p_belge -> 'satirlar', '[]'::jsonb))
      WITH ORDINALITY AS girdi(satir, ordinality)
    JOIN public.siparis_detaylari mevcut
      ON mevcut.id = public.ticari_guvenli_uuid(girdi.satir ->> 'detay_id')
     AND mevcut.siparis_id = p_siparis_id
     AND mevcut.aktif;

    IF (SELECT count(*) FROM pg_temp.siparis_rpc_detaylari)
       <> jsonb_array_length(COALESCE(p_belge -> 'satirlar', '[]'::jsonb))
       OR (SELECT count(*) FROM pg_temp.siparis_rpc_detaylari)
       <> (SELECT count(*) FROM public.siparis_detaylari WHERE siparis_id = p_siparis_id AND aktif) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'TICARI_REVIZYON_TEKNIK_SATIRLARI_DEGISTIREMEZ';
    END IF;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object('satir_no', satir_no, 'detay_id', detay_id)
    ORDER BY satir_no
  )
  INTO v_detay_esleme
  FROM pg_temp.siparis_rpc_detaylari;

  v_yeni_revizyon_id := public.siparis_fiyat_snapshotlarini_yaz(
    p_siparis_id,
    p_onizleme_id,
    v_sonuc,
    v_detay_esleme,
    p_revizyon_turu,
    v_onceki_revizyon.id
  );

  PERFORM public.siparis_ticari_mudahale_kayitlarini_yaz(
    v_yeni_revizyon_id,
    v_onceki_revizyon.id,
    p_belge,
    v_sonuc
  );

  v_yeni_toplam := public.ticari_guvenli_numeric(v_sonuc ->> 'genel_toplam');
  v_fark := round(v_yeni_toplam - v_onceki_revizyon.genel_toplam, 2);

  IF v_fark <> 0 THEN
    INSERT INTO public.cari_hareketleri (
      cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
      aciklama, siparis_id, kaynak_sinifi, kaynak_turu, kaynak_id,
      idempotency_id, islemi_yapan
    )
    VALUES (
      v_siparis.cari_id,
      v_siparis.para_birimi,
      CASE WHEN v_fark > 0 THEN 'borc' ELSE 'alacak' END,
      CASE WHEN v_fark > 0 THEN 'siparis_farki_borc' ELSE 'siparis_farki_alacak' END,
      abs(v_fark),
      now(),
      v_siparis.siparis_no || ' R' || lpad((v_onceki_revizyon.revizyon_no + 1)::text, 2, '0')
        || ' fiyat farkı',
      p_siparis_id,
      'sistem',
      'siparis',
      v_yeni_revizyon_id,
      v_idempotency_id,
      auth.uid()
    );
  END IF;

  UPDATE public.siparisler
  SET teslim_tarihi = COALESCE(NULLIF(p_belge ->> 'teslim_tarihi', '')::date, teslim_tarihi),
      notlar = COALESCE(p_belge ->> 'notlar', notlar),
      alt_musteri = COALESCE(p_belge ->> 'alt_musteri', alt_musteri),
      aktif_fiyat_revizyon_id = v_yeni_revizyon_id,
      revision_no = revision_no + 1
  WHERE id = p_siparis_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'siparis_id', p_siparis_id,
    'siparis_no', v_siparis.siparis_no,
    'revision_no', v_siparis.revision_no + 1,
    'fiyat_revizyonu_id', v_yeni_revizyon_id,
    'fiyat_revizyon_no', v_onceki_revizyon.revizyon_no + 1,
    'onceki_toplam', v_onceki_revizyon.genel_toplam,
    'yeni_toplam', v_yeni_toplam,
    'cari_farki', v_fark,
    'para_birimi', v_siparis.para_birimi
  );

  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

REVOKE ALL ON FUNCTION public.siparis_fiyatli_guncelle(
  uuid, integer, text, jsonb, uuid, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.siparis_fiyatli_guncelle(
  uuid, integer, text, jsonb, uuid, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.siparis_fiyatli_iptal(
  p_siparis_id uuid,
  p_beklenen_revision_no integer,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_siparis public.siparisler%ROWTYPE;
  v_mod public.ticari_modul_modu;
  v_payload jsonb;
  v_onceki_sonuc jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_borc_toplami numeric(18,2);
  v_alacak_toplami numeric(18,2);
  v_net_etki numeric(18,2);
  v_haric_tahsilat numeric(18,2);
  v_iptal_hareket_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('orders', 'manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ORDERS_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;
  IF length(trim(COALESCE(p_gerekce, ''))) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IPTAL_GEREKCESI_GEREKLI';
  END IF;

  SELECT mod INTO v_mod FROM public.ticari_modul_durumu WHERE singleton;
  IF v_mod NOT IN ('aktif', 'bakim') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FEATURE_MODE_ISLEME_KAPALI';
  END IF;

  v_payload := jsonb_build_object(
    'siparis_id', p_siparis_id,
    'beklenen_revision_no', p_beklenen_revision_no,
    'gerekce', p_gerekce
  );
  v_onceki_sonuc := public.ticari_idempotency_onceki_sonuc(
    'siparis_iptali', p_idempotency_key, v_payload
  );
  IF v_onceki_sonuc IS NOT NULL THEN
    RETURN v_onceki_sonuc;
  END IF;

  SELECT *
  INTO v_siparis
  FROM public.siparisler
  WHERE id = p_siparis_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_siparis.fiyatlandirildi THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FIYATLI_SIPARIS_BULUNAMADI';
  END IF;
  IF v_siparis.revision_no IS DISTINCT FROM p_beklenen_revision_no THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVISION_CONFLICT';
  END IF;
  IF v_siparis.durum = 'iptal' OR v_siparis.iptal_tarihi IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SIPARIS_ZATEN_IPTAL';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'siparis_iptali', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');
  PERFORM set_config('app.ticari_siparis_rpc', 'on', true);

  SELECT
    COALESCE(sum(tutar) FILTER (WHERE yon = 'borc'), 0),
    COALESCE(sum(tutar) FILTER (WHERE yon = 'alacak'), 0)
  INTO v_borc_toplami, v_alacak_toplami
  FROM public.cari_hareketleri
  WHERE siparis_id = p_siparis_id
    AND para_birimi = v_siparis.para_birimi
    AND kaynak_sinifi = 'sistem'
    AND kaynak_turu = 'siparis';

  v_net_etki := round(v_borc_toplami - v_alacak_toplami, 2);

  IF EXISTS (
    SELECT 1
    FROM public.cari_hareketleri
    WHERE siparis_id = p_siparis_id
      AND para_birimi = v_siparis.para_birimi
      AND kaynak_sinifi = 'sistem'
      AND kaynak_turu = 'siparis'
      AND hareket_turu IN ('siparis_iptal_borc', 'siparis_iptal_alacak')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SIPARIS_ZATEN_IPTAL';
  END IF;

  IF v_net_etki <> 0 THEN
    INSERT INTO public.cari_hareketleri (
      cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
      aciklama, siparis_id, kaynak_sinifi, kaynak_turu, kaynak_id,
      idempotency_id, islemi_yapan
    )
    VALUES (
      v_siparis.cari_id,
      v_siparis.para_birimi,
      CASE WHEN v_net_etki > 0 THEN 'alacak' ELSE 'borc' END,
      CASE WHEN v_net_etki > 0 THEN 'siparis_iptal_alacak' ELSE 'siparis_iptal_borc' END,
      abs(v_net_etki),
      now(),
      v_siparis.siparis_no || ' iptal net cari etkisi',
      p_siparis_id,
      'sistem',
      'siparis',
      p_siparis_id,
      v_idempotency_id,
      auth.uid()
    )
    RETURNING id INTO v_iptal_hareket_id;
  END IF;

  SELECT COALESCE(sum(tutar), 0)
  INTO v_haric_tahsilat
  FROM public.cari_hareketleri
  WHERE siparis_id = p_siparis_id
    AND para_birimi = v_siparis.para_birimi
    AND kaynak_sinifi = 'manuel'
    AND hareket_turu IN ('tahsilat', 'on_odeme');

  UPDATE public.siparisler
  SET durum = 'iptal',
      iptal_tarihi = now(),
      iptal_gerekcesi = p_gerekce,
      iptal_eden = auth.uid(),
      revision_no = revision_no + 1
  WHERE id = p_siparis_id;

  INSERT INTO public.ticari_mudahale_kayitlari (
    mudahale_turu,
    siparis_fiyat_revizyonu_id,
    alan_veya_bilesen,
    onceki_deger,
    yeni_deger,
    gerekce,
    kullanici_id
  )
  VALUES (
    'siparis_iptali',
    v_siparis.aktif_fiyat_revizyon_id,
    'net_cari_etki',
    jsonb_build_object(
      'sistem_borc_toplami', v_borc_toplami,
      'sistem_alacak_toplami', v_alacak_toplami,
      'net_etki', v_net_etki
    ),
    jsonb_build_object(
      'iptal_hareketi_id', v_iptal_hareket_id,
      'haric_tutulan_tahsilat_on_odeme_toplami', v_haric_tahsilat
    ),
    p_gerekce,
    auth.uid()
  );

  v_yanit := jsonb_build_object(
    'basarili', true,
    'siparis_id', p_siparis_id,
    'siparis_no', v_siparis.siparis_no,
    'revision_no', v_siparis.revision_no + 1,
    'sistem_borc_toplami', v_borc_toplami,
    'sistem_alacak_toplami', v_alacak_toplami,
    'net_cari_etki', v_net_etki,
    'iptal_hareketi_id', v_iptal_hareket_id,
    'haric_tutulan_tahsilat_on_odeme_toplami', v_haric_tahsilat,
    'para_birimi', v_siparis.para_birimi
  );

  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.tahsilat_kaydet(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cari_id uuid := public.ticari_guvenli_uuid(p_payload ->> 'cari_id');
  v_para_birimi text := NULLIF(p_payload ->> 'para_birimi', '');
  v_tutar numeric := public.ticari_guvenli_numeric(p_payload ->> 'tutar');
  v_siparis_id uuid := public.ticari_guvenli_uuid(p_payload ->> 'siparis_id');
  v_hareket_turu text := COALESCE(NULLIF(p_payload ->> 'hareket_turu', ''), 'tahsilat');
  v_idempotency_payload jsonb;
  v_onceki_sonuc jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_hareket_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('finance', 'create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FINANCE_CREATE_YETKISI_GEREKLI';
  END IF;
  IF v_cari_id IS NULL OR v_para_birimi NOT IN ('TRY', 'USD', 'EUR')
     OR v_tutar IS NULL OR v_tutar <= 0
     OR length(trim(COALESCE(p_payload ->> 'tahsilat_yontemi', ''))) < 2
     OR NULLIF(trim(COALESCE(p_payload ->> 'islem_tarihi', '')), '') IS NULL
     OR length(trim(COALESCE(p_payload ->> 'aciklama', ''))) < 3
     OR v_hareket_turu NOT IN ('tahsilat', 'on_odeme') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TAHSILAT_GIRDISI_GECERSIZ';
  END IF;

  IF v_siparis_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.siparisler
    WHERE id = v_siparis_id
      AND cari_id = v_cari_id
      AND fiyatlandirildi
      AND para_birimi = v_para_birimi
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TAHSILAT_PARA_BIRIMI_SIPARISLE_ESLESMIYOR';
  END IF;

  v_idempotency_payload := jsonb_build_object('payload', p_payload);
  v_onceki_sonuc := public.ticari_idempotency_onceki_sonuc(
    'tahsilat_kaydetme', p_idempotency_key, v_idempotency_payload
  );
  IF v_onceki_sonuc IS NOT NULL THEN
    RETURN v_onceki_sonuc;
  END IF;
  v_idempotency := public.ticari_idempotency_baslat(
    'tahsilat_kaydetme', p_idempotency_key, v_idempotency_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  INSERT INTO public.cari_hareketleri (
    cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
    tahsilat_yontemi, aciklama, siparis_id, kaynak_sinifi, kaynak_turu,
    kaynak_id, idempotency_id, islemi_yapan
  )
  VALUES (
    v_cari_id,
    v_para_birimi,
    'alacak',
    v_hareket_turu,
    round(v_tutar, 2),
    CASE
      WHEN NULLIF(p_payload ->> 'islem_tarihi', '') IS NULL THEN now()
      WHEN (p_payload ->> 'islem_tarihi') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        ((p_payload ->> 'islem_tarihi')::date::timestamp
          AT TIME ZONE 'Europe/Istanbul')
      ELSE (p_payload ->> 'islem_tarihi')::timestamptz
    END,
    p_payload ->> 'tahsilat_yontemi',
    NULLIF(p_payload ->> 'aciklama', ''),
    v_siparis_id,
    'manuel',
    v_hareket_turu,
    gen_random_uuid(),
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_hareket_id;

  v_yanit := jsonb_build_object(
    'basarili', true,
    'hareket_id', v_hareket_id,
    'cari_id', v_cari_id,
    'para_birimi', v_para_birimi,
    'tutar', round(v_tutar, 2),
    'hareket_turu', v_hareket_turu
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_acilis_bakiyesi_kaydet(
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cari_id uuid := public.ticari_guvenli_uuid(p_payload ->> 'cari_id');
  v_para_birimi text := NULLIF(p_payload ->> 'para_birimi', '');
  v_yon text := NULLIF(p_payload ->> 'yon', '');
  v_tutar numeric := public.ticari_guvenli_numeric(p_payload ->> 'tutar');
  v_idempotency jsonb;
  v_onceki jsonb;
  v_idempotency_id uuid;
  v_hareket_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('finance', 'manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FINANCE_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;
  IF v_cari_id IS NULL OR v_para_birimi NOT IN ('TRY', 'USD', 'EUR')
     OR v_yon NOT IN ('borc', 'alacak') OR v_tutar IS NULL OR v_tutar <= 0
     OR length(trim(COALESCE(p_payload ->> 'gerekce', ''))) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ACILIS_BAKIYESI_GIRDISI_GECERSIZ';
  END IF;

  v_onceki := public.ticari_idempotency_onceki_sonuc(
    'cari_acilis_bakiyesi', p_idempotency_key, p_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;
  v_idempotency := public.ticari_idempotency_baslat(
    'cari_acilis_bakiyesi', p_idempotency_key, p_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  INSERT INTO public.cari_hareketleri (
    cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
    aciklama, kaynak_sinifi, kaynak_turu, kaynak_id, idempotency_id, islemi_yapan
  )
  VALUES (
    v_cari_id, v_para_birimi, v_yon,
    CASE WHEN v_yon = 'borc' THEN 'acilis_borcu' ELSE 'acilis_alacagi' END,
    round(v_tutar, 2),
    CASE
      WHEN NULLIF(p_payload ->> 'islem_tarihi', '') IS NULL THEN now()
      WHEN (p_payload ->> 'islem_tarihi') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        ((p_payload ->> 'islem_tarihi')::date::timestamp
          AT TIME ZONE 'Europe/Istanbul')
      ELSE (p_payload ->> 'islem_tarihi')::timestamptz
    END,
    p_payload ->> 'gerekce',
    'manuel', 'acilis_bakiyesi', gen_random_uuid(), v_idempotency_id, auth.uid()
  )
  RETURNING id INTO v_hareket_id;

  INSERT INTO public.ticari_mudahale_kayitlari (
    mudahale_turu, alan_veya_bilesen, yeni_deger, gerekce, kullanici_id
  )
  VALUES (
    'acilis_bakiyesi',
    'cari_bakiyesi',
    jsonb_build_object(
      'hareket_id', v_hareket_id,
      'cari_id', v_cari_id,
      'para_birimi', v_para_birimi,
      'yon', v_yon,
      'tutar', round(v_tutar, 2)
    ),
    p_payload ->> 'gerekce',
    auth.uid()
  );

  v_yanit := jsonb_build_object(
    'basarili', true, 'hareket_id', v_hareket_id,
    'cari_id', v_cari_id, 'para_birimi', v_para_birimi,
    'yon', v_yon, 'tutar', round(v_tutar, 2)
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_hareket_tersle(
  p_hareket_id uuid,
  p_gerekce text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_hareket public.cari_hareketleri%ROWTYPE;
  v_payload jsonb;
  v_onceki jsonb;
  v_idempotency jsonb;
  v_idempotency_id uuid;
  v_ters_hareket_id uuid;
  v_yanit jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('finance', 'manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FINANCE_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;
  IF length(trim(COALESCE(p_gerekce, ''))) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TERSLEME_GEREKCESI_GEREKLI';
  END IF;

  v_payload := jsonb_build_object('hareket_id', p_hareket_id, 'gerekce', p_gerekce);
  v_onceki := public.ticari_idempotency_onceki_sonuc(
    'cari_hareket_tersleme', p_idempotency_key, v_payload
  );
  IF v_onceki IS NOT NULL THEN RETURN v_onceki; END IF;

  SELECT *
  INTO v_hareket
  FROM public.cari_hareketleri
  WHERE id = p_hareket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CARI_HAREKETI_BULUNAMADI';
  END IF;
  IF v_hareket.kaynak_sinifi = 'sistem'
     OR v_hareket.hareket_turu IN (
       'siparis_borcu', 'siparis_farki_borc', 'siparis_farki_alacak',
       'siparis_iptal_borc', 'siparis_iptal_alacak'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SISTEM_HAREKETI_MANUEL_TERSLENEMEZ';
  END IF;
  IF v_hareket.hareket_turu NOT IN (
    'tahsilat', 'on_odeme', 'acilis_borcu', 'acilis_alacagi',
    'manuel_duzeltme_borc', 'manuel_duzeltme_alacak'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CARI_HAREKETI_TERSLENEMEZ';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cari_hareketleri WHERE terslenen_hareket_id = p_hareket_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CARI_HAREKETI_ZATEN_TERSLENMIS';
  END IF;

  v_idempotency := public.ticari_idempotency_baslat(
    'cari_hareket_tersleme', p_idempotency_key, v_payload
  );
  IF v_idempotency ->> 'aksiyon' = 'onceki_sonuc' THEN
    RETURN v_idempotency -> 'sonuc';
  END IF;
  v_idempotency_id := public.ticari_guvenli_uuid(v_idempotency ->> 'idempotency_id');

  INSERT INTO public.cari_hareketleri (
    cari_id, para_birimi, yon, hareket_turu, tutar, islem_tarihi,
    aciklama, siparis_id, kaynak_sinifi, kaynak_turu, kaynak_id,
    terslenen_hareket_id, idempotency_id, islemi_yapan
  )
  VALUES (
    v_hareket.cari_id,
    v_hareket.para_birimi,
    CASE WHEN v_hareket.yon = 'borc' THEN 'alacak' ELSE 'borc' END,
    'ters_kayit',
    v_hareket.tutar,
    now(),
    p_gerekce,
    v_hareket.siparis_id,
    'manuel',
    'cari_tersleme',
    p_hareket_id,
    p_hareket_id,
    v_idempotency_id,
    auth.uid()
  )
  RETURNING id INTO v_ters_hareket_id;

  INSERT INTO public.ticari_mudahale_kayitlari (
    mudahale_turu, alan_veya_bilesen, onceki_deger, yeni_deger, gerekce, kullanici_id
  )
  VALUES (
    'cari_tersleme',
    'cari_hareketi',
    to_jsonb(v_hareket),
    jsonb_build_object('ters_hareket_id', v_ters_hareket_id),
    p_gerekce,
    auth.uid()
  );

  v_yanit := jsonb_build_object(
    'basarili', true,
    'terslenen_hareket_id', p_hareket_id,
    'ters_hareket_id', v_ters_hareket_id,
    'cari_id', v_hareket.cari_id,
    'para_birimi', v_hareket.para_birimi,
    'tutar', v_hareket.tutar
  );
  RETURN public.ticari_idempotency_basarili(v_idempotency_id, v_yanit);
END;
$$;

REVOKE ALL ON FUNCTION public.siparis_fiyatli_iptal(uuid, integer, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tahsilat_kaydet(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cari_acilis_bakiyesi_kaydet(jsonb, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cari_hareket_tersle(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.siparis_fiyatli_iptal(uuid, integer, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tahsilat_kaydet(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cari_acilis_bakiyesi_kaydet(jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cari_hareket_tersle(uuid, text, text)
  TO authenticated;
