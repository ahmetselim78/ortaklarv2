-- Sipariş detaylarına çıta stok referansı ekle
ALTER TABLE siparis_detaylari
  ADD COLUMN IF NOT EXISTS cita_stok_id UUID REFERENCES stok(id) ON DELETE SET NULL;
