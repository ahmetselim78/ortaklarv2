# Google Drive şifreli yedekleme

## Hedef production ortamı

- Google Cloud projesi: `glassflow-production`
- Cloud Run/Artifact Registry bölgesi: `europe-west10`
- Cloud Scheduler bölgesi: `europe-west1` (`europe-west10` Scheduler tarafından desteklenmiyor)
- Supabase proje ref'i: `epvukkpotzicwphaiemu`

Başka bir proje veya bölgeye ait yerel Terraform state'i bu dizinde yeniden
kullanılmamalıdır. Ortam değişikliğinde `.terraform`, `terraform.tfstate`,
`terraform.tfvars` ve eski OAuth tokenları temizlenip kurulum sıfırdan
başlatılmalıdır.

Bu dizin OrtaklarV2'nin tek yedekleme ve geri-yükleme akışıdır. Supabase
veritabanı yedeği Cloud Run Job içinde hazırlanır, `age` public key ile
şifrelenir ve yalnız uygulamanın oluşturduğu dosyalara erişebilen Google Drive
`drive.file` kapsamıyla yüklenir. Private age anahtarı Google Cloud'a verilmez.

## Davranış

- Her gece saat 02:00'de (`Europe/Istanbul`) tam mantıksal yedek oluşturur.
- `public` şema ve verisini, migration geçmişini, Auth/Storage verisini,
  Auth/Storage kullanıcı değişikliklerini, migration dosyalarını ve tablo
  özetini paketler.
- Drive'da `Yedekler/Günlük Yedekler` altında doğrulanmış son 7 dosyayı tutar.
- Her ayın ilk başarılı yedeğini `Yedekler/Aylık Yedekler` içine kopyalar ve
  son 12 ayı tutar.
- Boyut, Drive MD5 ve manifest SHA-256 değerleri doğrulanmadan retention
  temizliği yapmaz.
- Aynı anda ikinci otomatik veya manuel çalışma başlatmaz.
- Yönetim panelindeki manuel işlem ve hesap değişikliği AAL2/TOTP ile
  `admin.manage` izni ister ve audit kaydı oluşturur.

Supabase Storage içindeki binary objeler veritabanı yedeğine dahil değildir;
yalnız Storage metadata'sı yedeklenir. Bu projede uygulama tarafından kullanılan
bir Storage bucket'ı bulunmuyor. İleride eklenirse obje aktarımı ayrıca
uygulanmalıdır.

## Sıfırdan kurulum

Gereken yerel araçlar: Node.js, Terraform, Google Cloud CLI, Supabase CLI ve
`age`.

1. Google Cloud projesinde OAuth consent screen'i hazırlayın ve Google Drive API
   kapsamı olarak yalnız `drive.file` seçin. İlk bağlantı için **Desktop app**
   OAuth istemcisinin indirilen JSON'unu, Git tarafından yok sayılan
   `ops/drive-backup/google-oauth-client.local.json` konumuna koyun.

2. Yerel OAuth tokenını alın ve Drive klasörlerini doğrulayın:

   ```powershell
   npm run backup:drive:auth
   npm run backup:drive:check
   ```

   İkinci komut bağlantıyı doğrular; klasörleri yoksa oluşturur ve mevcut
   doğrulanmış günlük/aylık yedek sayılarını gösterir.

3. Offline private anahtarı güvenli bir bilgisayarda üretin:

   ```text
   age-keygen -o ops/drive-backup/age-identity.local.txt
   age-keygen -y ops/drive-backup/age-identity.local.txt > ops/drive-backup/age-recipient.local.txt
   ```

   `AGE-SECRET-KEY-...` private anahtarını parola kasasında ikinci bir kopyayla
   saklayın. Google Cloud'a yalnız `age1...` public recipient verilir.

4. `infra/gcp-drive/terraform.tfvars.example` dosyasını
   `infra/gcp-drive/terraform.tfvars` olarak kopyalayıp gerçek proje, Supabase
   pooler ve public age recipient değerleriyle doldurun. API'leri, Secret
   Manager kaplarını, servis hesaplarını ve Artifact Registry'yi oluşturun:

   ```text
   terraform -chdir=infra/gcp-drive init
   terraform -chdir=infra/gcp-drive apply \
     -target=google_project_service.required \
     -target=google_secret_manager_secret.drive_backup \
     -target=google_artifact_registry_repository.drive_backup \
     -target=google_service_account.builder \
     -target=google_project_iam_member.builder_roles
   ```

5. Aşağıdaki Secret Manager kaplarına ilk sürümleri ekleyin:

   - `ortaklar-drive-client-id`
   - `ortaklar-drive-client-secret`
   - `ortaklar-drive-refresh-token`
   - `ortaklar-drive-web-client-id`
   - `ortaklar-drive-web-client-secret`
   - `ortaklar-drive-trigger-secret` — en az 32 rastgele bayt
   - `ortaklar-supabase-access-token`

   İlk üç değer `oauth-token.local.json` içindedir. Yönetim panelinden Google
   hesabı değiştirme için ayrıca bir **Web application** OAuth istemcisi
   oluşturun. Yetkili redirect URI, Terraform `trigger_url` çıktısının sonuna
   `/oauth/callback` eklenmiş halidir.

6. Sürümlü Auth/Storage farkını doğrulayıp imajı yayınlayın. Yedek Job'u
   ayrıca public işlevlere bağlı Auth/Storage tetikleyicilerini her çalışma
   anında production veritabanından arşive ekler. Cloud Build hiçbir runtime
   sırrına erişmez:

   ```text
   gcloud builds submit --config cloudbuild.drive-backup.yaml \
     --substitutions _TAG=ilk-kurulum,_GIT_COMMIT=GIT_SHA .
   ```

   Üretilen immutable imaj etiketini `backup_image` değişkenine yazıp tam
   Terraform apply çalıştırın:

   ```text
   terraform -chdir=infra/gcp-drive apply
   ```

7. Supabase migration ve Edge Function'ı yayınlayın:

   ```text
   supabase db push
   supabase functions deploy drive-backup-admin --no-verify-jwt
   supabase secrets set DRIVE_BACKUP_TRIGGER_URL=https://... DRIVE_BACKUP_TRIGGER_SECRET=...
   ```

   URL, Terraform `trigger_url` çıktısıdır. Trigger secret, Google Secret
   Manager'a yazılan değerle birebir aynı olmalıdır.

## Kabul testi

1. `npm run backup:drive:check` ile bağlantıyı doğrulayın.
2. Yönetim > Google Drive Yedekleri > **Şimdi yedek al** ile işi başlatın.
3. Panelde durumun `Başarılı` olduğunu ve Drive'daki dosyanın `.tar.gz.age`
   uzantılı olduğunu doğrulayın.
4. Dosyayı ayrı ve güvenli bir bilgisayara indirin. Arşivi yazmadan yalnız
   doğrulamak için:

   ```text
   python ops/drive-backup/restore.py backup-....tar.gz.age \
     --identity ops/drive-backup/age-identity.local.txt
   ```

5. Bileşenleri incelemek için boş ve yeni bir dizin verin:

   ```text
   python ops/drive-backup/restore.py backup-....tar.gz.age \
     --identity ops/drive-backup/age-identity.local.txt \
     --extract-to C:\guvenli\ortaklar-restore
   ```

6. Production olmayan, boş ve izole bir Supabase projesine gerçek restore
   testi uygulayın. Araç kaynak proje ref'ini hedef olarak kabul etmez ve üçlü
   açık onay olmadan veritabanına yazmaz:

   ```text
   $env:RESTORE_DB_URL="postgresql://postgres.HEDEF_REF:...@...:5432/postgres"
   python ops/drive-backup/restore.py backup-....tar.gz.age \
     --identity ops/drive-backup/age-identity.local.txt \
     --target-project-ref HEDEF_REF \
     --confirm-restore
   ```

7. Temel tablo sayılarını, Auth girişini, RLS negatif testini ve Storage
   metadata'sını doğrulayın. Ölçülen RTO en fazla 4 saat olmalıdır.

## Hesap değiştirme

Yönetim panelindeki **Google hesabını değiştir** işlemi yeni OAuth istemci
çiftini ve refresh tokenı Secret Manager'a birlikte yeni sürümler olarak yazar.
Token tarayıcıya veya veritabanına dönmez. Hesap değişikliğinden sonra manuel
bir yedek ve yukarıdaki doğrulama/restore kabul testi tekrar edilmelidir.
