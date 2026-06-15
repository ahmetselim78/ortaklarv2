-- ============================================================
-- 025_ekran tabloları
--1. Personel
-- ============================================================
CREATE TABLE hr_personel (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_soyad  text    NOT NULL,
  foto_url  text    NOT NULL DEFAULT '',
  rol       text    NOT NULL DEFAULT 'Direkt',   -- 'Direkt' | 'Endirekt'
  is_aktif  boolean NOT NULL DEFAULT true,
  olusturma timestamptz DEFAULT now()
);

-- ============================================================
-- 2. Saat Şablonları (Vardiya tanımı — üst başlık)
-- ============================================================
CREATE TABLE uretim_saat_sablonlari (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sablon_adi   text NOT NULL,
  saat_araligi text NOT NULL DEFAULT '',   -- genel: "08:00 - 18:00"
  sira_no      int  NOT NULL DEFAULT 0,
  olusturma    timestamptz DEFAULT now()
);

-- ============================================================
-- 3. Saatlik Hedefler (Şablona bağlı, saat dilimi bazında)
-- ============================================================
CREATE TABLE uretim_saatlik_hedefler (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sablon_id    uuid NOT NULL REFERENCES uretim_saat_sablonlari(id) ON DELETE CASCADE,
  saat_araligi text NOT NULL,   -- "08:00 - 09:00"
  hedef_adet   int  NOT NULL DEFAULT 0,
  sira_no      int  NOT NULL DEFAULT 0
);

-- ============================================================
-- 4. Günlük Üretim Takip
-- ============================================================
CREATE TABLE gunluk_uretim_takip (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarih            date NOT NULL DEFAULT CURRENT_DATE,
  saat_araligi     text NOT NULL,
  hedef_adet       int  NOT NULL DEFAULT 0,
  gerceklesen_adet int  NOT NULL DEFAULT 0,
  fire_adet        int  NOT NULL DEFAULT 0,
  aksiyon_notu     text,
  npt_orani        int  NOT NULL DEFAULT 0,
  sira_no          int  NOT NULL DEFAULT 0,
  olusturma        timestamptz DEFAULT now(),
  UNIQUE (tarih, saat_araligi)
);

-- ============================================================
-- RLS — projeye uygun şekilde daraltabilirsiniz
-- ============================================================
ALTER TABLE hr_personel              ENABLE ROW LEVEL SECURITY;
ALTER TABLE uretim_saat_sablonlari   ENABLE ROW LEVEL SECURITY;
ALTER TABLE uretim_saatlik_hedefler  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gunluk_uretim_takip      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "herkese_acik" ON hr_personel             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "herkese_acik" ON uretim_saat_sablonlari  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "herkese_acik" ON uretim_saatlik_hedefler FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "herkese_acik" ON gunluk_uretim_takip     FOR ALL USING (true) WITH CHECK (true);

-- Realtime için tabloları yayın listesine ekleyin:
-- Supabase Dashboard → Database → Replication → gunluk_uretim_takip ✓