-- ============================================================
-- 027 — Günlük Üretim Raporu Altyapısı
-- ============================================================

-- ── 1. Üretim İstasyonu Tanımları ──────────────────────────────────────────
CREATE TABLE uretim_istasyonlari (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad         text NOT NULL,
  sira_no    integer NOT NULL DEFAULT 0,
  aktif      boolean NOT NULL DEFAULT true,
  fire_var   boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Varsayılan istasyonlar (screenshot'taki 6 istasyon)
INSERT INTO uretim_istasyonlari (ad, sira_no, aktif, fire_var) VALUES
  ('Kesim',       1, true, true),
  ('Çıta Büküm',  2, true, true),
  ('Çıta Kesim',  3, true, true),
  ('Isıcam Hattı',4, true, true),
  ('Robot',       5, true, true),
  ('Tamir',       6, true, false);

-- ── 2. Günlük Üretim Raporları (günde bir rapor) ──────────────────────────
CREATE TABLE gunluk_uretim_raporlari (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarih            date NOT NULL UNIQUE,
  operator_id      uuid REFERENCES hr_personel(id) ON DELETE SET NULL,
  toplam_personel  integer NOT NULL DEFAULT 0,
  notlar           text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ── 3. İstasyon Bazlı Üretim Kayıtları ────────────────────────────────────
CREATE TABLE gunluk_uretim_istasyon_kayitlari (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rapor_id     uuid NOT NULL REFERENCES gunluk_uretim_raporlari(id) ON DELETE CASCADE,
  istasyon_id  uuid NOT NULL REFERENCES uretim_istasyonlari(id) ON DELETE CASCADE,
  adet         integer NOT NULL DEFAULT 0,
  fire_adet    integer NOT NULL DEFAULT 0,
  UNIQUE (rapor_id, istasyon_id)
);

-- ── 4. Araç Yükleme Kayıtları ─────────────────────────────────────────────
CREATE TABLE gunluk_uretim_arac_yuklemeleri (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rapor_id         uuid NOT NULL REFERENCES gunluk_uretim_raporlari(id) ON DELETE CASCADE,
  arac_id          uuid REFERENCES araclar(id) ON DELETE SET NULL,
  dis_arac_plakasi text,
  dis_arac_adi     text,
  adet             integer NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE uretim_istasyonlari              ENABLE ROW LEVEL SECURITY;
ALTER TABLE gunluk_uretim_raporlari          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gunluk_uretim_istasyon_kayitlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE gunluk_uretim_arac_yuklemeleri   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "herkese_acik" ON uretim_istasyonlari              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "herkese_acik" ON gunluk_uretim_raporlari          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "herkese_acik" ON gunluk_uretim_istasyon_kayitlari FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "herkese_acik" ON gunluk_uretim_arac_yuklemeleri   FOR ALL USING (true) WITH CHECK (true);
