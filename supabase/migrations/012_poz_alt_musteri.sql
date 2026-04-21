-- =========================================================
-- 009 — Poz ve Alt Müşteri Alanları
-- siparisler tablosuna alt_musteri eklenir
-- siparis_detaylari tablosuna poz eklenir
-- =========================================================

-- Her cam parçasının bina/proje konumunu tanımlayan poz numarası
alter table siparis_detaylari
  add column if not exists poz text;

-- Sipariş üzerindeki nihai/alt müşteri adı (dağıtıcının müşterisi vb.)
alter table siparisler
  add column if not exists alt_musteri text;
