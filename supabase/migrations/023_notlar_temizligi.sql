-- =========================================================
-- 023 — Notlar alanından yapılandırılmış veriyi çıkar
-- =========================================================
-- Anti-pattern: serbest "notlar" metni içine sistemin sonradan
-- regex ile okuduğu yapılandırılmış bilgi gömme alışkanlığını
-- tasfiye eder.
--
-- 1) siparisler.notlar  →  "Nihai Müşteri: XYZ" prefix'i alt_musteri'ye
--                           taşınır, notlar'dan temizlenir.
-- 2) siparis_detaylari.notlar  →  "Menfez Ø8" ve "%20<" prefix'leri
--                                  silinir (menfez_cap_mm + kucuk_cam
--                                  kolonları zaten doludur — 019'da
--                                  backfill edilmişti).
-- =========================================================

begin;

-- 1a) alt_musteri boş ise notlar'daki "Nihai Müşteri: ..." değerini taşı.
--     Nihai müşteri adı '/' karakterine kadar veya satır sonuna kadar uzanır
--     (uygulamadaki extractNihaiMusteri ile aynı kalıp).
update siparisler
   set alt_musteri = trim(
         (regexp_match(notlar, 'Nihai\s+M[üÜ][şŞ]teri:\s*([^/\n\r]+)'))[1]
       )
 where (alt_musteri is null or alt_musteri = '')
   and notlar ~* 'Nihai\s+M[üÜ][şŞ]teri:\s*\S';

-- 1b) "Nihai Müşteri: ... [/]" prefix'ini notlar'dan temizle, kalanı koru.
--     Önündeki/arkasındaki '/' ayraçlarını da yutuyoruz ki "Foo / Nihai...: X / Bar" → "Foo / Bar"
update siparisler
   set notlar = nullif(
         trim(both ' /' from
           regexp_replace(
             notlar,
             '\s*/?\s*Nihai\s+M[üÜ][şŞ]teri:\s*[^/\n\r]+\s*/?\s*',
             ' / ',
             'gi')
         ),
         '')
 where notlar ~* 'Nihai\s+M[üÜ][şŞ]teri:';

-- 2) siparis_detaylari.notlar — Menfez ve %20< izlerini temizle
update siparis_detaylari
   set notlar = nullif(
         trim(both ' ,' from
           regexp_replace(
             regexp_replace(notlar, 'Menfez\s*Ø\s*\d+\s*,?\s*', '', 'gi'),
             '%20<\s*,?\s*', '', 'gi'
           )
         ),
         '')
 where notlar ~* 'Menfez\s*Ø|%20<';

commit;

-- =========================================================
-- Doğrulama:
--   select count(*) from siparisler where notlar ~* 'Nihai\s+M[üÜ]';   -- 0 olmalı
--   select count(*) from siparis_detaylari where notlar ~* 'Menfez|%20<'; -- 0
-- =========================================================
