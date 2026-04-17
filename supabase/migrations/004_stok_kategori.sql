-- =============================================================
-- Stok tablosu: Kategori, Tedarikçi, Marka, Miktar altyapısı
-- =============================================================

-- Kategori: cam, cita, yan_malzeme
ALTER TABLE stok ADD COLUMN IF NOT EXISTS kategori TEXT DEFAULT 'cam'
  CHECK (kategori IN ('cam', 'cita', 'yan_malzeme'));

-- Tedarikçi ilişkisi (cari tablosundan)
ALTER TABLE stok ADD COLUMN IF NOT EXISTS tedarikci_id UUID REFERENCES cari(id) ON DELETE SET NULL;

-- Marka (butil, poliüretan vb. için)
ALTER TABLE stok ADD COLUMN IF NOT EXISTS marka TEXT;

-- Mevcut miktar (gelecekteki stok takibi altyapısı)
ALTER TABLE stok ADD COLUMN IF NOT EXISTS mevcut_miktar NUMERIC;

-- Mevcut kayıtları cam olarak işaretle
UPDATE stok SET kategori = 'cam' WHERE kategori IS NULL;
