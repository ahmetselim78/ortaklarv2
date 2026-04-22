-- 018 — Mevcut tamamlandi siparişlere tamamlandi_tarihi backfill
-- created_at'ı yaklaşık tamamlanma tarihi olarak kullanır
update siparisler
  set tamamlandi_tarihi = created_at
  where durum = 'tamamlandi'
    and tamamlandi_tarihi is null;
