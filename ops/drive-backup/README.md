# Google Drive şifreli yedekleme

Bu dizin, eski `ops/backup` GCS yönteminden bağımsızdır. Eski yöntem ilk başarılı Drive yedeği ve geri yükleme testi tamamlanana kadar silinmez.

## Davranış

- Her gün saat 02:00'de (`Europe/Istanbul`) tam Supabase yedeği oluşturur.
- Arşivi Google Drive'a çıkmadan önce `age` public key ile şifreler. Cloud Run'da private key bulunmaz.
- `Yedekler/Günlük Yedekler` içinde doğrulanmış son 7 dosyayı tutar.
- Her ayın ilk başarılı yedeğini `Yedekler/Aylık Yedekler` içine kopyalar ve son 12 ayı tutar.
- Boyut, MD5 ve yerel SHA-256 değeri doğrulanmadan saklama temizliği yapmaz.
- Aynı anda ikinci bir otomatik/manüel çalışma başlatmaz.
- Yönetim panelindeki manuel düğme AAL2/TOTP ve `admin.manage` yetkisi ister; işlem audit tablosuna yazılır.

Drive API için yalnız `drive.file` kapsamı kullanılır. Uygulama yalnız kendisinin oluşturduğu dosya ve klasörleri yönetebilir.

## Bir defalık kurulum

1. Supabase migration'ını ve Edge Function'ı yayınlayın:

   ```text
   supabase db push
   supabase functions deploy drive-backup-admin --no-verify-jwt
   ```

2. İlk yerel yetkilendirme için Google Cloud projesinde OAuth consent screen ve **Desktop app** OAuth istemcisi oluşturun. Desktop istemcilerin loopback yönlendirmesi otomatik desteklenir. Sonra yerelde:

   ```powershell
   $env:GOOGLE_DRIVE_CLIENT_ID='...'
   $env:GOOGLE_DRIVE_CLIENT_SECRET='...'
   node scripts/google-drive-backup-auth.mjs
   ```

   Yönetim panelindeki **Google hesabını değiştir** düğmesi için ayrıca **Web application** OAuth istemcisi oluşturun. Cloud Run `trigger_url` çıktısının sonuna `/oauth/callback` ekleyip yetkili yönlendirme URI'si olarak kaydedin. Web istemcisinin client ID/secret değerlerini `ortaklar-drive-web-client-id` ve `ortaklar-drive-web-client-secret` secret'larına yazın. Düğmeden yeni hesap seçildiğinde servis, web istemci çiftini ve o istemciye ait refresh token'ı yedekleme secret'larına yeni sürüm olarak aktarır.

3. Offline private anahtarı güvenli bir bilgisayarda üretin. `age-keygen` çıktısındaki `AGE-SECRET-KEY-...` satırını çevrimdışı/parola kasasında saklayın; gizli olmayan `age1...` public recipient değerini Terraform `age_recipient` değişkenine koyun.

4. `infra/gcp-drive/terraform.tfvars.example` dosyasını gerçek `.tfvars` dosyasına kopyalayın. Önce API, secret, builder hesabı ve Artifact Registry kaynaklarını oluşturun:

   ```text
   terraform -chdir=infra/gcp-drive init
   terraform -chdir=infra/gcp-drive apply \
     -target=google_project_service.required \
     -target=google_secret_manager_secret.drive_backup \
     -target=google_artifact_registry_repository.drive_backup \
     -target=google_service_account.builder \
     -target=google_project_iam_member.builder_roles \
     -target=google_secret_manager_secret_iam_member.builder_supabase_token
   ```

   Secret version değerlerini `gcloud secrets versions add ... --data-file=-` ile ekleyin. Ardından imajı üretin ve `backup_image` değerini bu etikete ayarlayıp Terraform'u tam uygulayın:

   ```text
   gcloud builds submit --config cloudbuild.drive-backup.yaml \
     --substitutions _TAG=ilk-kurulum .
   terraform -chdir=infra/gcp-drive apply
   ```

   Secret adları:

   - `ortaklar-drive-client-id`
   - `ortaklar-drive-client-secret`
   - `ortaklar-drive-refresh-token`
   - `ortaklar-drive-web-client-id`
   - `ortaklar-drive-web-client-secret`
   - `ortaklar-drive-trigger-secret` (en az 32 bayt rastgele değer)
   - `ortaklar-supabase-access-token` (kısa ömürlü yedekleme bağlantısı üretmek için)

   `ortaklar-drive-prod-db-url` eski tasarımdan kalan boş Secret Manager kabıdır;
   yeni iş tarafından kullanılmaz ve kalıcı veritabanı parolası tutulmaz.

5. Terraform `trigger_url` çıktısını ve aynı trigger secret değerini Supabase Edge secrets olarak girin:

   ```text
   supabase secrets set DRIVE_BACKUP_TRIGGER_URL=https://... DRIVE_BACKUP_TRIGGER_SECRET=...
   ```

## İlk kabul testi

1. Yönetim > Google Drive Yedekleri > **Şimdi yedek al** ile çalıştırın.
2. Panelde durumun `Başarılı` olduğunu, Drive'daki dosya boyutunu ve `.age` uzantısını kontrol edin.
3. Dosyayı ayrı bir bilgisayara indirin ve yalnız çevrimdışı private key ile açın:

   ```text
   age --decrypt -i private-key.txt -o backup.tar.gz backup-....tar.gz.age
   tar -xzf backup.tar.gz
   sha256sum -c <(jq -r '.files[] | "\(.sha256)  \(.name)"' manifest.json)
   ```

4. Arşivi production olmayan izole bir Supabase/PostgreSQL ortamına geri yükleyip temel tablo sayımlarını, Auth girişini ve Storage metadata'sını doğrulayın.
5. Bu test başarılı olmadan `ops/backup`, `infra/gcp` ve `cloudbuild.ops.yaml` kaldırılmaz.

## Otomatik çalışma ve hesap değiştirme

- Cloud Scheduler her gece saat 02:00'de (`Europe/Istanbul`) yedek Job'unu çalıştırır; kullanıcının bilgisayarının açık olması gerekmez.
- Yönetim > Google Drive Yedekleri paneli otomasyonun aktif veya kurulum bekliyor olduğunu gösterir.
- **Google hesabını değiştir** işlemi AAL2/TOTP ve `admin.manage` izni ister. Yeni hesap Google'ın kendi izin ekranında seçilir; refresh token tarayıcıya veya veritabanına dönmez.

Not: Repo şu anda Supabase Storage'da uygulama dosyası kullanımını göstermiyor. İleride bucket objeleri kullanılmaya başlanırsa binary objeler için ayrıca Storage API indirme/yükleme adımı eklenmelidir; mevcut yedek Storage veritabanı metadata'sını kapsar.
