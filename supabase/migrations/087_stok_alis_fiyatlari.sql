-- 087 - Stok bazlı değişmez alış fiyatı tarihçesi

SET search_path = public, extensions, pg_catalog;

CREATE TABLE public.stok_alis_fiyatlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stok_id uuid NOT NULL REFERENCES public.stok(id) ON DELETE RESTRICT,
  tedarikci_id uuid REFERENCES public.cari(id) ON DELETE RESTRICT,
  birim_fiyat numeric(20,8) NOT NULL CHECK (birim_fiyat > 0),
  para_birimi public.para_birimi_kodu NOT NULL,
  fiyat_birimi text NOT NULL CHECK (nullif(btrim(fiyat_birimi), '') IS NOT NULL),
  paket_miktari numeric(20,8) CHECK (paket_miktari IS NULL OR paket_miktari > 0),
  stok_ana_birimi text NOT NULL CHECK (nullif(btrim(stok_ana_birimi), '') IS NOT NULL),
  donusum_katsayisi numeric(20,10) NOT NULL DEFAULT 1 CHECK (donusum_katsayisi > 0),
  donusum_aciklamasi text,
  vade_gunu integer NOT NULL DEFAULT 0 CHECK (vade_gunu BETWEEN 0 AND 3650),
  fiyat_tarihi timestamptz NOT NULL,
  kaynak_turu text NOT NULL CHECK (
    kaynak_turu IN ('dogrudan', 'cam_baglantisi', 'legacy_unverified', 'legacy_verified')
  ),
  kaynak_referansi text,
  durum text NOT NULL CHECK (
    durum IN ('taslak', 'dogrulanmis', 'dogrulama_bekliyor', 'duzeltme')
  ),
  onceki_fiyat_id uuid REFERENCES public.stok_alis_fiyatlari(id) ON DELETE RESTRICT,
  duzeltme_nedeni text,
  idempotency_id uuid REFERENCES public.islem_idempotency(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid
    REFERENCES public.app_users(auth_user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    kaynak_turu <> 'legacy_unverified'
    OR (durum = 'dogrulama_bekliyor' AND tedarikci_id IS NULL)
  ),
  CHECK (
    durum <> 'duzeltme'
    OR (onceki_fiyat_id IS NOT NULL AND length(btrim(COALESCE(duzeltme_nedeni, ''))) >= 5)
  ),
  CHECK (
    kaynak_turu = 'legacy_unverified'
    OR lower(btrim(fiyat_birimi)) = lower(btrim(stok_ana_birimi))
    OR (
      donusum_katsayisi <> 1
      AND length(btrim(COALESCE(donusum_aciklamasi, ''))) >= 5
    )
  )
);

CREATE INDEX stok_alis_fiyatlari_stok_tarih_idx
  ON public.stok_alis_fiyatlari(stok_id, fiyat_tarihi DESC, created_at DESC);
CREATE INDEX stok_alis_fiyatlari_tedarikci_idx
  ON public.stok_alis_fiyatlari(tedarikci_id, fiyat_tarihi DESC)
  WHERE tedarikci_id IS NOT NULL;
CREATE UNIQUE INDEX stok_alis_fiyatlari_idempotency_idx
  ON public.stok_alis_fiyatlari(idempotency_id)
  WHERE idempotency_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.stok_alis_fiyati_degisikligini_engelle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'STOK_ALIS_FIYATI_DEGISTIRILEMEZ',
    DETAIL = 'Yanlış fiyatı yeni bir düzeltme kaydı oluşturarak düzeltin.';
END;
$$;

CREATE TRIGGER stok_alis_fiyatlari_immutable
  BEFORE UPDATE OR DELETE ON public.stok_alis_fiyatlari
  FOR EACH ROW EXECUTE FUNCTION public.stok_alis_fiyati_degisikligini_engelle();

COMMENT ON TABLE public.stok_alis_fiyatlari IS
  'Stok ve tedarikçi bazlı append-only alış fiyatı tarihçesi; aktiflik kaynak atamasıyla belirlenir.';
