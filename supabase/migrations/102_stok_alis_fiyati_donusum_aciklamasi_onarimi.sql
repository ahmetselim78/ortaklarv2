-- 102 - Daha once uygulanmis 087 surumlerinde eksik kalabilen birim donusum aciklamasini tamamla

SET search_path = public, extensions, pg_catalog;

ALTER TABLE public.stok_alis_fiyatlari
  ADD COLUMN IF NOT EXISTS donusum_aciklamasi text;

-- Eski fiyat satirlari append-only oldugu icin geriye donuk doldurulmaz. NOT VALID,
-- mevcut tarihceyi korurken bundan sonra yazilan farkli birimli fiyatlari denetler.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stok_alis_fiyatlari'::regclass
      AND conname = 'stok_alis_fiyatlari_donusum_aciklamasi_check'
  ) THEN
    ALTER TABLE public.stok_alis_fiyatlari
      ADD CONSTRAINT stok_alis_fiyatlari_donusum_aciklamasi_check
      CHECK (
        kaynak_turu = 'legacy_unverified'
        OR lower(btrim(fiyat_birimi)) = lower(btrim(stok_ana_birimi))
        OR (
          donusum_katsayisi <> 1
          AND length(btrim(COALESCE(donusum_aciklamasi, ''))) >= 5
        )
      ) NOT VALID;
  END IF;
END;
$$;

COMMENT ON COLUMN public.stok_alis_fiyatlari.donusum_aciklamasi IS
  'Fiyat birimi stok ana biriminden farkliysa donusumun insan tarafindan okunabilir aciklamasi.';
