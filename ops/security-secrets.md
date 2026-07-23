# Sır dağıtımı ve rotasyon runbook'u

Sır değerleri repoya, Terraform state'ine veya frontend `VITE_*` değişkenlerine yazılmaz.

## Supabase Edge Secrets

Güvenli kanaldan aşağıdaki Edge Secrets değerlerini tanımlayın:

- `ALLOWED_ORIGINS`: Virgülle ayrılmış kesin üretim origin allowlist'i.
- `MISTRAL_API_KEY`
- `R2_INTERNAL_UPLOAD_URL`
- `R2_INTERNAL_UPLOAD_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_CRON_SECRET`
- `OPS_ALERT_SECRET`
- `APP_ORIGIN`

`TELEGRAM_CRON_SECRET` ve `OPS_ALERT_SECRET` birbirinden farklı, rastgele en az 32 bayt değerler olmalıdır. Supabase'in yönettiği `SUPABASE_URL`, `SUPABASE_ANON_KEY` ve `SUPABASE_SERVICE_ROLE_KEY` yalnız Edge çalışma ortamında kullanılır.

### Yerel OCR geliştirme ortamı

OCR anahtarı frontend'deki `VITE_*` değişkenlerinden okunmaz. Yerel Edge Runtime için git tarafından yok sayılan `supabase/functions/.env.local` dosyasını oluşturun:

```dotenv
MISTRAL_API_KEY=<mistral-anahtari>
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://192.168.1.14:5173
```

Ardından fonksiyonları bu dosyayla başlatın:

```sh
supabase functions serve --env-file supabase/functions/.env.local
```

Uzak Supabase projesinde aynı değerler Edge Secrets olarak tanımlanmalı ve fonksiyon yeniden dağıtılmalıdır. Anahtarı `.env.local` içindeki `VITE_MISTRAL_API_KEY` adıyla tarayıcı bundle'ına vermeyin; daha önce bu adla kullanılan anahtarı Mistral tarafında döndürün.

## Telegram pg_cron kimliği

`052` migration'ından sonra iki değer Supabase Vault'a yönetici SQL oturumuyla eklenir. Gerçek değerleri terminal geçmişine yazmayan güvenli parametre/secret enjeksiyon yöntemi kullanın:

```sql
select vault.create_secret(:'telegram_edge_url', 'telegram_edge_url', 'check-and-send-report Edge URL');
select vault.create_secret(:'telegram_cron_secret', 'telegram_cron_secret', 'pg_cron servis kimliği');
```

Vault'taki `telegram_cron_secret`, Edge Secret değerinin aynısıdır. Normal `authenticated`/`anon` rollere `vault.decrypted_secrets` veya `vault.secrets` erişimi verilmez.

## Geçiş ve rotasyon

1. Yeni Edge sırrını ekleyin ve kontrollü çağrıyla doğrulayın.
2. Cron/Vault veya R2 Worker tarafını yeni değerle güncelleyin.
3. Eski frontend ve veritabanı değerlerini kaldırın.
4. Mistral, R2, Telegram ve eski service-role benzeri anahtarları sağlayıcı tarafında iptal edin.
5. `npm run test:security` ve üretim bundle taramasını yeniden çalıştırın.

Aşama 1'de backup/restore alarmı yalnız GCP Monitoring e-postasına gider. `report-error` dağıtılıp `OPS_ALERT_SECRET` iki tarafta eşleştirildikten sonra güvenli Telegram ikinci kanal olarak açılır; Monitoring kapatılmaz.
