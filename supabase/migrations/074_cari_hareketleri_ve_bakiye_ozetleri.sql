-- 074 - Döviz bazlı append-only cari hareketleri ve yeniden üretilebilir bakiye özeti

ALTER TABLE public.cari
  ADD COLUMN IF NOT EXISTS aktif boolean NOT NULL DEFAULT true;

CREATE TABLE public.cari_hareketleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cari_id uuid NOT NULL REFERENCES public.cari(id) ON DELETE RESTRICT,
  para_birimi text NOT NULL CHECK (para_birimi IN ('TRY', 'USD', 'EUR')),
  yon text NOT NULL CHECK (yon IN ('borc', 'alacak')),
  hareket_turu text NOT NULL CHECK (hareket_turu IN (
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
    'ters_kayit'
  )),
  tutar numeric(18,2) NOT NULL CHECK (tutar > 0),
  islem_tarihi timestamptz NOT NULL DEFAULT now(),
  tahsilat_yontemi text,
  aciklama text,
  siparis_id uuid REFERENCES public.siparisler(id) ON DELETE RESTRICT,
  kaynak_sinifi text NOT NULL CHECK (kaynak_sinifi IN ('sistem', 'manuel')),
  kaynak_turu text NOT NULL,
  kaynak_id uuid,
  terslenen_hareket_id uuid UNIQUE REFERENCES public.cari_hareketleri(id) ON DELETE RESTRICT,
  idempotency_id uuid,
  islemi_yapan uuid NOT NULL REFERENCES public.app_users(auth_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cari_hareketleri_tahsilat_bilgisi_check CHECK (
    (hareket_turu IN ('tahsilat', 'on_odeme') AND tahsilat_yontemi IS NOT NULL)
    OR
    (hareket_turu NOT IN ('tahsilat', 'on_odeme'))
  ),
  CONSTRAINT cari_hareketleri_ters_kayit_check CHECK (
    (hareket_turu = 'ters_kayit' AND terslenen_hareket_id IS NOT NULL)
    OR
    (hareket_turu <> 'ters_kayit' AND terslenen_hareket_id IS NULL)
  ),
  CONSTRAINT cari_hareketleri_siparis_kaynagi_check CHECK (
    kaynak_sinifi <> 'sistem'
    OR kaynak_turu <> 'siparis'
    OR siparis_id IS NOT NULL
  )
);

COMMENT ON TABLE public.cari_hareketleri IS
  'Cari bakiyenin tek doğruluk kaynağı. Satırlar append-only tutulur; düzeltme yalnız ters kayıt ile yapılır.';
COMMENT ON COLUMN public.cari_hareketleri.siparis_id IS
  'Tahsilatta bilgi amaçlı olabilir. Manuel tahsilatlar sipariş iptalinin sistem net etkisine dahil edilmez.';

CREATE UNIQUE INDEX cari_hareketleri_sistem_kaynak_unique
  ON public.cari_hareketleri(kaynak_turu, kaynak_id, para_birimi)
  WHERE kaynak_sinifi = 'sistem' AND kaynak_id IS NOT NULL;

CREATE UNIQUE INDEX cari_hareketleri_siparis_iptal_unique
  ON public.cari_hareketleri(siparis_id, para_birimi)
  WHERE kaynak_sinifi = 'sistem'
    AND kaynak_turu = 'siparis'
    AND hareket_turu IN ('siparis_iptal_borc', 'siparis_iptal_alacak');

CREATE INDEX cari_hareketleri_cari_doviz_tarih_idx
  ON public.cari_hareketleri(cari_id, para_birimi, islem_tarihi DESC, id);
CREATE INDEX cari_hareketleri_siparis_sistem_idx
  ON public.cari_hareketleri(siparis_id, para_birimi, created_at)
  WHERE kaynak_sinifi = 'sistem';
CREATE INDEX cari_hareketleri_terslenen_idx
  ON public.cari_hareketleri(terslenen_hareket_id)
  WHERE terslenen_hareket_id IS NOT NULL;

CREATE TABLE public.cari_bakiye_ozetleri (
  cari_id uuid NOT NULL REFERENCES public.cari(id) ON DELETE CASCADE,
  para_birimi text NOT NULL CHECK (para_birimi IN ('TRY', 'USD', 'EUR')),
  borc_toplami numeric(18,2) NOT NULL DEFAULT 0 CHECK (borc_toplami >= 0),
  alacak_toplami numeric(18,2) NOT NULL DEFAULT 0 CHECK (alacak_toplami >= 0),
  net_bakiye numeric(18,2) GENERATED ALWAYS AS (borc_toplami - alacak_toplami) STORED,
  son_hareket_id uuid REFERENCES public.cari_hareketleri(id) ON DELETE RESTRICT,
  son_hareket_tarihi timestamptz,
  guncellendi_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cari_id, para_birimi)
);

COMMENT ON TABLE public.cari_bakiye_ozetleri IS
  'Performans önbelleğidir; cari_hareketleri tablosundan tamamen yeniden üretilebilir.';

CREATE OR REPLACE FUNCTION public.cari_bakiye_ozetini_guncelle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.cari_bakiye_ozetleri (
    cari_id,
    para_birimi,
    borc_toplami,
    alacak_toplami,
    son_hareket_id,
    son_hareket_tarihi
  )
  VALUES (
    NEW.cari_id,
    NEW.para_birimi,
    CASE WHEN NEW.yon = 'borc' THEN NEW.tutar ELSE 0 END,
    CASE WHEN NEW.yon = 'alacak' THEN NEW.tutar ELSE 0 END,
    NEW.id,
    NEW.islem_tarihi
  )
  ON CONFLICT (cari_id, para_birimi) DO UPDATE
  SET borc_toplami = public.cari_bakiye_ozetleri.borc_toplami
        + CASE WHEN NEW.yon = 'borc' THEN NEW.tutar ELSE 0 END,
      alacak_toplami = public.cari_bakiye_ozetleri.alacak_toplami
        + CASE WHEN NEW.yon = 'alacak' THEN NEW.tutar ELSE 0 END,
      son_hareket_id = NEW.id,
      son_hareket_tarihi = NEW.islem_tarihi,
      guncellendi_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER cari_hareketleri_bakiye_ozeti
  AFTER INSERT ON public.cari_hareketleri
  FOR EACH ROW EXECUTE FUNCTION public.cari_bakiye_ozetini_guncelle();

CREATE OR REPLACE FUNCTION public.cari_hareketi_degistirilemez()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'CARI_HAREKETI_DEGISTIRILEMEZ',
    DETAIL = 'Cari hareketleri append-only tutulur; UPDATE veya DELETE yapılamaz.';
END;
$$;

CREATE TRIGGER cari_hareketleri_immutable
  BEFORE UPDATE OR DELETE ON public.cari_hareketleri
  FOR EACH ROW EXECUTE FUNCTION public.cari_hareketi_degistirilemez();

CREATE OR REPLACE FUNCTION public.cari_ters_kayit_kaynagini_koru()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kaynak_sinifi text;
  v_hareket_turu text;
BEGIN
  IF NEW.hareket_turu <> 'ters_kayit' THEN
    RETURN NEW;
  END IF;

  SELECT kaynak_sinifi, hareket_turu
  INTO v_kaynak_sinifi, v_hareket_turu
  FROM public.cari_hareketleri
  WHERE id = NEW.terslenen_hareket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'TERSLENECEK_CARI_HAREKET_BULUNAMADI';
  END IF;
  IF v_kaynak_sinifi = 'sistem' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'SISTEM_HAREKETI_MANUEL_TERSLENEMEZ';
  END IF;
  IF v_hareket_turu = 'ters_kayit' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TERS_KAYIT_YENIDEN_TERSLENEMEZ';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cari_hareketleri_ters_kaynak_guard
  BEFORE INSERT ON public.cari_hareketleri
  FOR EACH ROW EXECUTE FUNCTION public.cari_ters_kayit_kaynagini_koru();

REVOKE ALL ON FUNCTION public.cari_ters_kayit_kaynagini_koru()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cari_bakiye_tutarlilik_kontrolu()
RETURNS TABLE (
  cari_id uuid,
  para_birimi text,
  hareket_borc_toplami numeric,
  ozet_borc_toplami numeric,
  hareket_alacak_toplami numeric,
  ozet_alacak_toplami numeric,
  hareket_net_bakiye numeric,
  ozet_net_bakiye numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_permission('finance', 'read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FINANCE_READ_YETKISI_GEREKLI';
  END IF;

  RETURN QUERY
  WITH hareket AS (
    SELECT
      ch.cari_id,
      ch.para_birimi,
      COALESCE(sum(ch.tutar) FILTER (WHERE ch.yon = 'borc'), 0)::numeric(18,2) AS borc,
      COALESCE(sum(ch.tutar) FILTER (WHERE ch.yon = 'alacak'), 0)::numeric(18,2) AS alacak
    FROM public.cari_hareketleri ch
    GROUP BY ch.cari_id, ch.para_birimi
  ),
  anahtarlar AS (
    SELECT h.cari_id, h.para_birimi FROM hareket h
    UNION
    SELECT cbo.cari_id, cbo.para_birimi FROM public.cari_bakiye_ozetleri cbo
  )
  SELECT
    a.cari_id,
    a.para_birimi,
    COALESCE(h.borc, 0),
    COALESCE(o.borc_toplami, 0),
    COALESCE(h.alacak, 0),
    COALESCE(o.alacak_toplami, 0),
    COALESCE(h.borc - h.alacak, 0),
    COALESCE(o.net_bakiye, 0)
  FROM anahtarlar a
  LEFT JOIN hareket h USING (cari_id, para_birimi)
  LEFT JOIN public.cari_bakiye_ozetleri o USING (cari_id, para_birimi)
  WHERE COALESCE(h.borc, 0) <> COALESCE(o.borc_toplami, 0)
     OR COALESCE(h.alacak, 0) <> COALESCE(o.alacak_toplami, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.cari_bakiye_ozetlerini_yeniden_olustur()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_satir_sayisi integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('finance', 'manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FINANCE_MANAGE_YETKISI_GEREKLI';
  END IF;
  IF NOT public.current_aal2() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AAL2_GEREKLI';
  END IF;

  LOCK TABLE public.cari_bakiye_ozetleri IN EXCLUSIVE MODE;
  DELETE FROM public.cari_bakiye_ozetleri;

  INSERT INTO public.cari_bakiye_ozetleri (
    cari_id,
    para_birimi,
    borc_toplami,
    alacak_toplami,
    son_hareket_id,
    son_hareket_tarihi
  )
  SELECT
    toplam.cari_id,
    toplam.para_birimi,
    toplam.borc_toplami,
    toplam.alacak_toplami,
    son.id,
    son.islem_tarihi
  FROM (
    SELECT
      cari_id,
      para_birimi,
      COALESCE(sum(tutar) FILTER (WHERE yon = 'borc'), 0)::numeric(18,2) AS borc_toplami,
      COALESCE(sum(tutar) FILTER (WHERE yon = 'alacak'), 0)::numeric(18,2) AS alacak_toplami
    FROM public.cari_hareketleri
    GROUP BY cari_id, para_birimi
  ) toplam
  JOIN LATERAL (
    SELECT id, islem_tarihi
    FROM public.cari_hareketleri
    WHERE cari_id = toplam.cari_id
      AND para_birimi = toplam.para_birimi
    ORDER BY islem_tarihi DESC, created_at DESC, id DESC
    LIMIT 1
  ) son ON true;

  GET DIAGNOSTICS v_satir_sayisi = ROW_COUNT;

  INSERT INTO public.audit_events (
    actor_user_id,
    actor_personel_id,
    table_name,
    record_id,
    action,
    new_data,
    metadata
  )
  VALUES (
    auth.uid(),
    public.current_personel_id(),
    'cari_bakiye_ozetleri',
    'rebuild',
    'SUCCESS',
    jsonb_build_object('satir_sayisi', v_satir_sayisi),
    jsonb_build_object('aal2', true)
  );

  RETURN jsonb_build_object('durum', 'basarili', 'satir_sayisi', v_satir_sayisi);
END;
$$;

ALTER TABLE public.cari_hareketleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cari_hareketleri FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cari_bakiye_ozetleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cari_bakiye_ozetleri FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.cari_hareketleri FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cari_bakiye_ozetleri FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cari_hareketleri, public.cari_bakiye_ozetleri TO authenticated;
GRANT SELECT, INSERT ON public.cari_hareketleri TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cari_bakiye_ozetleri TO service_role;

CREATE POLICY cari_hareketleri_finance_read
  ON public.cari_hareketleri FOR SELECT TO authenticated
  USING (public.has_permission('finance', 'read'));

CREATE POLICY cari_bakiye_ozetleri_finance_read
  ON public.cari_bakiye_ozetleri FOR SELECT TO authenticated
  USING (public.has_permission('finance', 'read'));

REVOKE ALL ON FUNCTION public.cari_bakiye_ozetini_guncelle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cari_hareketi_degistirilemez() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cari_bakiye_tutarlilik_kontrolu() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cari_bakiye_ozetlerini_yeniden_olustur() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cari_bakiye_tutarlilik_kontrolu() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cari_bakiye_ozetlerini_yeniden_olustur() TO authenticated;
