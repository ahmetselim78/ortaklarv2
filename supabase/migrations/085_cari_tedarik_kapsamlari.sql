-- 085 - Tedarikçilerin sağladığı malzeme gruplarını sonradan düzeltilebilir şekilde saklama

ALTER TABLE public.cari
  ADD COLUMN tedarik_kapsamlari text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.cari
  ADD CONSTRAINT cari_tedarik_kapsamlari_deger_check CHECK (
    tedarik_kapsamlari <@ ARRAY['cam', 'cita', 'yan_malzeme']::text[]
  ),
  ADD CONSTRAINT cari_tedarik_kapsamlari_tip_check CHECK (
    tipi = 'tedarikci' OR cardinality(tedarik_kapsamlari) = 0
  );

CREATE INDEX cari_tedarik_kapsamlari_idx
  ON public.cari USING gin (tedarik_kapsamlari)
  WHERE tipi = 'tedarikci' AND aktif;

COMMENT ON COLUMN public.cari.tedarik_kapsamlari IS
  'Tedarikçinin sağladığı cam, çıta ve yan malzeme/sarf grupları. Cari düzenlenerek değiştirilebilir.';
