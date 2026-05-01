-- =========================================================
-- 024 — Tedarikçi/harici sipariş numarası kolonu
-- =========================================================
-- PDF importla gelen tedarikçinin kendi sipariş numarası (örn. S605120)
-- şu ana kadar siparisler.notlar içine "Sipariş No: ..." prefix'i ile
-- gömülüyordu; bunu serbest metinden ayırıp kendi kolonuna alıyoruz.
-- =========================================================

begin;

alter table siparisler
  add column if not exists harici_siparis_no text;

create index if not exists idx_siparisler_harici_siparis_no
  on siparisler (harici_siparis_no);

-- Backfill: notlar içinden "Sipariş No: XYZ" değerini çek
update siparisler
   set harici_siparis_no = trim(
         (regexp_match(notlar, 'Sipari[şs]\s+No:\s*([^\s/]+)'))[1]
       )
 where (harici_siparis_no is null or harici_siparis_no = '')
   and notlar ~* 'Sipari[şs]\s+No:\s*\S';

-- Notlar'dan "PDF Import — Sipariş No: ... / Tedarikçi: ..." prefix'ini sil.
-- Hem yeni format ("PDF Import — Sipariş No: X / Tedarikçi: Y") hem de
-- olası eski varyantları (sadece "Sipariş No: X / Tedarikçi: Y") kapsar.
update siparisler
   set notlar = nullif(
         trim(both ' /—-' from
           regexp_replace(
             notlar,
             '(PDF\s*Import\s*[—–-]\s*)?Sipari[şs]\s+No:\s*\S+\s*/?\s*(Tedarik[çc]i:\s*[^/\n\r]+)?\s*/?\s*',
             '',
             'gi')
         ),
         '')
 where notlar ~* 'Sipari[şs]\s+No:';

commit;

-- =========================================================
-- Doğrulama:
--   select count(*) from siparisler where notlar ~* 'Sipari[şs]\s+No:';   -- 0
--   select count(*) from siparisler where harici_siparis_no is not null;  -- backfill sayısı
-- =========================================================
