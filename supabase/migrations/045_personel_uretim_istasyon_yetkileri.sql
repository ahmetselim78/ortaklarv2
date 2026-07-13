-- 045 — Personel bazlı üretim girişi istasyon yetkileri
-- Eski personeller varsayılan olarak tüm aktif istasyonları görmeye devam eder.

ALTER TABLE public.hr_personel
  ADD COLUMN IF NOT EXISTS uretim_yetkileri_sinirli boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.hr_personel_istasyon_yetkileri (
  personel_id uuid NOT NULL REFERENCES public.hr_personel(id) ON DELETE CASCADE,
  istasyon_id uuid NOT NULL REFERENCES public.uretim_istasyonlari(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (personel_id, istasyon_id)
);

CREATE INDEX IF NOT EXISTS idx_personel_istasyon_yetkileri_personel
  ON public.hr_personel_istasyon_yetkileri (personel_id);

CREATE INDEX IF NOT EXISTS idx_personel_istasyon_yetkileri_istasyon
  ON public.hr_personel_istasyon_yetkileri (istasyon_id);

ALTER TABLE public.hr_personel_istasyon_yetkileri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "herkese_acik" ON public.hr_personel_istasyon_yetkileri;
CREATE POLICY "herkese_acik"
  ON public.hr_personel_istasyon_yetkileri
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Arayüz filtresine ek olarak veritabanında da yetkisiz istasyon kaydını engelle.
CREATE OR REPLACE FUNCTION public.uretim_istasyon_yetkisi_kontrol()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_id uuid;
  v_sinirli boolean;
BEGIN
  SELECT r.operator_id
  INTO v_operator_id
  FROM public.gunluk_uretim_raporlari r
  WHERE r.id = NEW.rapor_id;

  IF v_operator_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.uretim_yetkileri_sinirli
  INTO v_sinirli
  FROM public.hr_personel p
  WHERE p.id = v_operator_id;

  IF COALESCE(v_sinirli, false)
     AND NOT EXISTS (
       SELECT 1
       FROM public.hr_personel_istasyon_yetkileri y
       WHERE y.personel_id = v_operator_id
         AND y.istasyon_id = NEW.istasyon_id
     ) THEN
    RAISE EXCEPTION 'Bu personelin seçilen üretim istasyonu için giriş yetkisi yok.';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_uretim_istasyon_yetkisi_kontrol
  ON public.gunluk_uretim_istasyon_kayitlari;
CREATE TRIGGER trg_uretim_istasyon_yetkisi_kontrol
  BEFORE INSERT OR UPDATE OF rapor_id, istasyon_id
  ON public.gunluk_uretim_istasyon_kayitlari
  FOR EACH ROW
  EXECUTE FUNCTION public.uretim_istasyon_yetkisi_kontrol();
