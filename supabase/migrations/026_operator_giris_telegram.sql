-- ============================================================
-- 026 — Operatör Girişi + Telegram Rapor Altyapısı
-- ============================================================

-- ── 1. hr_personel'e giriş bilgileri ekle ───────────────────
ALTER TABLE hr_personel
  ADD COLUMN IF NOT EXISTS kullanici_adi TEXT,
  ADD COLUMN IF NOT EXISTS giris_sifresi TEXT;

-- ── 2. Telegram Ayarları (singleton tablo) ──────────────────
CREATE TABLE telegram_ayarlari (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token  text NOT NULL DEFAULT '',
  chat_id    text NOT NULL DEFAULT '',
  aktif      boolean NOT NULL DEFAULT false,
  olusturma  timestamptz DEFAULT now()
);

-- Varsayılan boş kayıt (singleton)
INSERT INTO telegram_ayarlari (bot_token, chat_id, aktif)
VALUES ('', '', false);

-- ── 3. Rapor Saatleri ───────────────────────────────────────
-- Her gün hangi saatte rapor gönderileceği tanımları
CREATE TABLE telegram_rapor_saatleri (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saat      text NOT NULL,     -- Örn: "08:00", "12:00", "17:00"
  aktif     boolean NOT NULL DEFAULT true,
  olusturma timestamptz DEFAULT now()
);

-- ── 4. Rapor Gönderim Logu ──────────────────────────────────
-- Aynı gün/saat için çift gönderimi önler
CREATE TABLE telegram_rapor_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarih        date NOT NULL,
  saat         text NOT NULL,
  gonderildi_at timestamptz DEFAULT now(),
  UNIQUE (tarih, saat)
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE telegram_ayarlari      ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_rapor_saatleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_rapor_log     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "herkese_acik" ON telegram_ayarlari       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "herkese_acik" ON telegram_rapor_saatleri FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "herkese_acik" ON telegram_rapor_log      FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- pg_cron + pg_net KURULUM TALİMATLARI
-- ============================================================
-- Aşağıdaki adımları Supabase Dashboard'dan manuel yapın:
--
-- ADIM 1: Extensions etkinleştirin
--   Dashboard → Database → Extensions → pg_net  → Enable
--   Dashboard → Database → Extensions → pg_cron → Enable
--
-- ADIM 2: Aşağıdaki SQL'i Dashboard → SQL Editor'da çalıştırın
--   (026_operator_giris_telegram.sql migration dosyasına dahil edilmez çünkü
--    SERVICE_ROLE_KEY gizli bilgi içeriyor)
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SELECT cron.schedule(                                                   │
-- │    'telegram-rapor-gonder',                                              │
-- │    '* * * * *',                                                          │
-- │    $$                                                                    │
-- │    SELECT net.http_post(                                                 │
-- │      url     := 'https://[PROJECT_REF].supabase.co/functions/v1/check-and-send-report', │
-- │      headers := '{"Authorization": "Bearer [SERVICE_ROLE_KEY]",         │
-- │                   "Content-Type": "application/json"}'::jsonb,           │
-- │      body    := '{}'::jsonb                                              │
-- │    ) AS request_id;                                                      │
-- │    $$                                                                    │
-- │  );                                                                      │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- [PROJECT_REF]    = Supabase Dashboard → Settings → General → Reference ID
-- [SERVICE_ROLE_KEY] = Supabase Dashboard → Settings → API → service_role key
--
-- ADIM 3: Edge Function Secret'ı ekleyin
--   Dashboard → Edge Functions → check-and-send-report → Secrets
--   TELEGRAM_BOT_TOKEN = <BotFather'dan aldığınız token>
-- ============================================================
