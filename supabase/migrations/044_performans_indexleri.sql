-- ============================================================
-- 044 - Performans indeksleri (Problem 3: buyuk listelerde yavaslik)
--
-- Bu migration YALNIZCA eksik indeks ekler; hicbir sema/veri degisikligi
-- yapmaz, geri alinabilir (DROP INDEX ile). CONCURRENTLY kullanilmiyor
-- cunku Supabase migration'lari tek bir transaction icinde calisir ve
-- CREATE INDEX CONCURRENTLY transaction icinde desteklenmez; bu tablolar
-- icin kilit suresi kucuk veri boyutunda ihmal edilebilir seviyededir.
-- ============================================================

-- tamir_kayitlari: bekleyen tamir sayisi sorgulari (durumService.ts,
-- SiparisDetayModal.tsx) siparis_detay_id / uretim_emri_id ile filtreliyor,
-- ikisi de indekssizdi (sadece durum ve cam_kodu indeksliydi).
CREATE INDEX IF NOT EXISTS idx_tamir_kayitlari_siparis_detay_id
  ON tamir_kayitlari(siparis_detay_id);

CREATE INDEX IF NOT EXISTS idx_tamir_kayitlari_uretim_emri_id
  ON tamir_kayitlari(uretim_emri_id);

-- yikama_loglari: PozGiriş/Kumanda ekranlarinda kismi adet takibi icin
-- siparis_detay_id ile sorgulaniyor (uretim_emri_detay_id zaten indeksliydi,
-- bkz. migration 033).
CREATE INDEX IF NOT EXISTS idx_yikama_loglari_siparis_detay_id
  ON yikama_loglari(siparis_detay_id);

-- siparisler: liste ekrani created_at'e gore siraliyor (useSiparis.getir).
-- Aşama 3'te server-side pagination'a gecince bu index sort+limit
-- performansi icin kritik hale gelir.
CREATE INDEX IF NOT EXISTS idx_siparisler_created_at
  ON siparisler(created_at DESC);

-- uretim_emirleri: batch listesi olusturulma_tarihi'ne gore siraliyor
-- (useUretim.getir).
CREATE INDEX IF NOT EXISTS idx_uretim_emirleri_olusturulma_tarihi
  ON uretim_emirleri(olusturulma_tarihi DESC);

-- sevkiyat_planlari: FK kolonlari Postgres'te otomatik indekslenmez.
-- Tarih araligi filtresi (Aşama 3 - SevkiyatPlanlama) ve siparis/arac
-- bazli lookup'lar icin gerekli.
CREATE INDEX IF NOT EXISTS idx_sevkiyat_planlari_tarih
  ON sevkiyat_planlari(tarih);

CREATE INDEX IF NOT EXISTS idx_sevkiyat_planlari_siparis_id
  ON sevkiyat_planlari(siparis_id);

CREATE INDEX IF NOT EXISTS idx_sevkiyat_planlari_arac_id
  ON sevkiyat_planlari(arac_id);
