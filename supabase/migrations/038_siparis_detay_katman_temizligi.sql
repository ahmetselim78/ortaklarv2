-- =========================================================
-- 038 — siparis_detaylari.katman_yapisi artık kullanılmıyor
-- =========================================================
-- Katman/kompozisyon bilgisi stok kartından okunur (stok.katman_yapisi + stok.ad).
-- Mevcut sipariş satırlarındaki kopyalanmış katman değerlerini temizle.

update siparis_detaylari
   set katman_yapisi = null
 where katman_yapisi is not null;

comment on column siparis_detaylari.katman_yapisi is
  'DEPRECATED — katman bilgisi stok kartından okunur; yeni kayıtlarda NULL bırakılır.';
