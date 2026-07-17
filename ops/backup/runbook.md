# OrtaklarV2 yedekleme runbook'u

## İlk kabul

1. Terraform planını iki kişiyle inceleyin; günlük ve aylık bucket adları birbirinden farklı olmalıdır.
2. Test bucket'larında erken silme, overwrite ve retention sonu davranışını doğrulayın.
3. Backup Job'u elle çalıştırın; ardından verifier Job'u çalıştırın.
4. İzole Supabase projesinde restore Job'u çalıştırın. Auth canary girişi, UUID ve RLS negatif testi başarılı olmalıdır.
5. Cloud Monitoring'de kontrollü bir Job hatası üretip bildirim kanalını doğrulayın.
6. Yedi ardışık günlük başarılı backup/verify kaydını bekleyin.

Cloud Build sırasında `auth-storage-diff` adımı linked üretim projesine karşı çalışmalı ve imaja `supabase/auth_storage_diff.sql` gömmelidir. Dosya eksikse nightly Job bilinçli olarak başarısız olur. Auth canary `npm run auth:canary` ile oluşturulur; açık parola yalnız ayrı Secret Manager secret sürümünde, UUID ayrı secret'ta tutulur.

Restore hedefi her çalışmada temiz/boş hazırlanmış, dış entegrasyonları kapalı bir Supabase test projesi olmalıdır. `RESTORE_SUPABASE_PROJECT_REF` production ref'inden farklı değilse veya restore URL ile eşleşmiyorsa Job veri yazmadan durur. Hedefin temiz hazırlanması Supabase proje/branch yaşam döngüsü otomasyonuna aittir; production DB bağlantısı restore servis hesabına hiçbir zaman verilmez.

## Bucket Lock — geri alınamaz işlem

Terraform yalnızca retention policy oluşturur. Aşağıdaki komutlar ancak ikinci kişi kontrolü ve değişiklik kaydı onayından sonra çalıştırılır:

```sh
gcloud storage buckets update gs://GUNLUK_BUCKET --lock-retention-period
gcloud storage buckets update gs://AYLIK_BUCKET --lock-retention-period
```

Kilitlemeden önce `gcloud storage buckets describe` çıktısında günlük sürenin 30 gün, aylık sürenin 365 gün olduğunu tekrar doğrulayın. Yanlış kilitlenen bucket'ın süresi azaltılamaz; yeni bucket oluşturulmalıdır.

## Alarm geçişi

Aşama 1'de Cloud Monitoring e-posta kanalı zorunludur. Güvenli Telegram Edge servisi devreye girdikten sonra Telegram ek kanal olur; Monitoring kapatılmaz.
