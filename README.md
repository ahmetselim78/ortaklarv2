# OrtaklarV2

OrtaklarV2; sipariş, stok, üretim batch'leri, yıkama hattı, etiket baskısı,
tamir/fire, sevkiyat, vardiya hedefleri ve operatör üretim girişini yöneten
Türkçe cam üretim uygulamasıdır.

Web arayüzü React, TypeScript, Vite ve Tailwind CSS; veri, kimlik, gerçek
zamanlı iletişim ve zamanlanmış işler Supabase üzerinde çalışır.

## Gereksinimler

- Node.js 22 veya uyumlu güncel LTS sürümü
- npm
- Veritabanı geliştirmesi için Supabase CLI ve Docker
- Üretim etiketi için Kumanda bilgisayarında `yazici-kopru`

## Yerel kurulum

```sh
npm ci
```

Git tarafından yok sayılan `.env.local` dosyasını oluşturun:

```dotenv
VITE_SUPABASE_URL=https://PROJE_REF.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Gerçek anahtarları dokümana, loglara veya Git'e eklemeyin. OCR ve diğer sunucu
sırları `VITE_*` değişkeni olarak tarayıcıya verilmez; ayrıntılar için
`ops/security-secrets.md` dosyasını izleyin.

Uygulamayı başlatın:

```sh
npm run dev
```

## Doğrulama

```sh
npm test
npm run lint
npm run test:security
npm run build
```

Supabase/Docker çalışan geliştirme ortamında ayrıca:

```sh
supabase db reset --local
supabase test db
```

## Yararlı komutlar

```sh
npm run auth:bootstrap
npm run auth:canary
npm run auth:migrate
node scripts/imp-karsilastir-rapor.mjs <referans.IMP> [cikti.IMP]
```

IMP karşılaştırma scripti kişisel veya harici referans dosyasını repoya
almadan çalışır. Anonimleştirilmiş otomatik test fixture'ları
`src/lib/fixtures/` altında tutulur.

## Proje yapısı

- `src/`: sayfalar, bileşenler, hook'lar ve ortak iş kuralları
- `supabase/migrations/`: sıralı PostgreSQL migration'ları (`001`–`060`)
- `supabase/functions/`: Edge Function'lar
- `supabase/tests/`: pgTAP veritabanı testleri
- `ops/` ve `infra/`: yedekleme, geri yükleme ve GCP operasyonları
- `yazici-kopru/`: yerel Windows/Node HTTP → USB/TCP yazıcı köprüsü
- `Info/OrtaklarV2_Architecture.md`: ayrıntılı ve güncel mimari bağlam

## Güvenlik ve migration kuralları

- Uygulama yetkileri Supabase Auth, veritabanı rolleri, RLS ve RPC kontrolleriyle uygulanır.
- Yönetici işlemleri AAL2/TOTP gerektirebilir.
- Uygulanmış migration dosyaları değiştirilmez; şema değişikliği sıradaki numarayla eklenir.
- Veri temizleme ve acil uyumluluk SQL'leri yalnız açık onay koruması kaldırıldıktan sonra izole/hedefi doğrulanmış ortamda çalıştırılır.
- Üretim güvenlik yayını için `SECURITY_ROLLOUT.md` izlenir.

Dağıtım, Cloud Build üzerinden container imajı oluşturup Cloud Run'a gönderir.
Operasyonel dağıtım ayrıntıları `cloudbuild.yaml`, `cloudbuild.ops.yaml`,
`infra/gcp/` ve `ops/backup/` altında bulunur. Yeni Google Drive yedekleme
akışı ise eski yönteme dokunmadan `cloudbuild.drive-backup.yaml`,
`infra/gcp-drive/` ve `ops/drive-backup/` altında hazırlanmıştır.
