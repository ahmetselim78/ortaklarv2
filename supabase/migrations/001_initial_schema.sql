-- =============================================================
-- Cam Üretim Yönetim Sistemi — İlk Veritabanı Şeması
-- =============================================================

-- 1. CARİ: Müşteriler ve Tedarikçiler
CREATE TABLE IF NOT EXISTS cari (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kod        TEXT UNIQUE NOT NULL,
  ad         TEXT NOT NULL,
  tipi       TEXT NOT NULL CHECK (tipi IN ('musteri', 'tedarikci')),
  telefon    TEXT,
  email      TEXT,
  adres      TEXT,
  notlar     TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. STOK: Cam çeşitleri / Ürün kataloğu
CREATE TABLE IF NOT EXISTS stok (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kod          TEXT UNIQUE NOT NULL,
  ad           TEXT NOT NULL,
  kalinlik_mm  NUMERIC,
  renk         TEXT,
  tip          TEXT,
  birim        TEXT DEFAULT 'm2',
  birim_fiyat  NUMERIC,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 3. SİPARİŞLER: Sipariş başlıkları
CREATE TABLE IF NOT EXISTS siparisler (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siparis_no    TEXT UNIQUE NOT NULL,
  cari_id       UUID REFERENCES cari(id) ON DELETE RESTRICT,
  tarih         DATE NOT NULL DEFAULT now(),
  teslim_tarihi DATE,
  durum         TEXT DEFAULT 'beklemede'
                  CHECK (durum IN ('beklemede','onaylandi','uretimdee','tamamlandi','iptal')),
  notlar        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 4. SİPARİŞ_DETAYLARI: Her bir cam parçası (benzersiz GLS-XXXX kodu burada)
CREATE TABLE IF NOT EXISTS siparis_detaylari (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siparis_id     UUID REFERENCES siparisler(id) ON DELETE CASCADE,
  stok_id        UUID REFERENCES stok(id) ON DELETE RESTRICT,
  cam_kodu       TEXT UNIQUE NOT NULL,   -- GLS-XXXX: uygulama tarafından üretilir
  genislik_mm    NUMERIC NOT NULL,
  yukseklik_mm   NUMERIC NOT NULL,
  adet           INTEGER NOT NULL DEFAULT 1,
  kenar_islemi   TEXT,
  notlar         TEXT,
  uretim_durumu  TEXT DEFAULT 'bekliyor'
                   CHECK (uretim_durumu IN ('bekliyor','kesildi','yikandi','etiketlendi','tamamlandi')),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 5. ÜRETİM_EMİRLERİ: Üretim partileri (batch)
CREATE TABLE IF NOT EXISTS uretim_emirleri (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no            TEXT UNIQUE NOT NULL,
  durum               TEXT DEFAULT 'hazirlaniyor'
                        CHECK (durum IN ('hazirlaniyor','onaylandi','export_edildi','tamamlandi')),
  notlar              TEXT,
  olusturulma_tarihi  TIMESTAMPTZ DEFAULT now(),
  export_tarihi       TIMESTAMPTZ
);

-- 6. ÜRETİM_EMRİ_DETAYLARI: Hangi cam hangi partide
CREATE TABLE IF NOT EXISTS uretim_emri_detaylari (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uretim_emri_id   UUID REFERENCES uretim_emirleri(id) ON DELETE CASCADE,
  siparis_detay_id UUID REFERENCES siparis_detaylari(id) ON DELETE RESTRICT,
  sira_no          INTEGER
);

-- 7. YIKAMA_LOGLARI: Yıkama istasyonu giriş kayıtları
CREATE TABLE IF NOT EXISTS yikama_loglari (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cam_kodu         TEXT NOT NULL,
  siparis_detay_id UUID REFERENCES siparis_detaylari(id) ON DELETE SET NULL,
  giris_zamani     TIMESTAMPTZ DEFAULT now(),
  operatör         TEXT
);

-- =============================================================
-- ROW LEVEL SECURITY (tüm tablolar için temel RLS)
-- =============================================================
ALTER TABLE cari                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE siparisler           ENABLE ROW LEVEL SECURITY;
ALTER TABLE siparis_detaylari    ENABLE ROW LEVEL SECURITY;
ALTER TABLE uretim_emirleri      ENABLE ROW LEVEL SECURITY;
ALTER TABLE uretim_emri_detaylari ENABLE ROW LEVEL SECURITY;
ALTER TABLE yikama_loglari       ENABLE ROW LEVEL SECURITY;

-- Geliştirme aşamasında: kimliği doğrulanmış kullanıcılar her şeyi okuyup yazabilir
-- (Üretim ortamında rollere göre daraltılacak)
CREATE POLICY "authenticated_all" ON cari                  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON stok                  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON siparisler            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON siparis_detaylari     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON uretim_emirleri       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON uretim_emri_detaylari FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON yikama_loglari        FOR ALL TO authenticated USING (true) WITH CHECK (true);
