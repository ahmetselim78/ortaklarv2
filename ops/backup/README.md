# Yedekleme ve geri yükleme işleri

Bu dizin tek bir sürümlenmiş imajdan çalışan backup, verifier, restore ve audit archive Cloud Run Job'larını içerir. Cloud Build yalnızca imajı ve imaja gömülen Auth/Storage şema farkını üretir, ardından mevcut Job tanımlarını yeni revision'a taşır; zamanlama Cloud Scheduler'a aittir.

## Güvenlik sınırları

- `backup-writer`: üretim DB secret'ını okuyabilir; günlük/aylık bucket'larda yalnızca object create yapar.
- `backup-verifier`: iki bucket için read/list; create/update/delete yoktur.
- `restore-tester`: iki bucket için read/list ve yalnızca izole Supabase restore secret'ları.
- `scheduler-invoker`: sadece `run.jobs.run`.
- Bucket'lar CMEK kullanır. Günlük retention 30, aylık retention 365 gündür.
- Object adları değişmez ve upload `ifGenerationMatch=0` ile yapılır.
- Bucket Lock Terraform tarafından otomatik açılmaz. Yedi günlük başarılı test ve ikinci kişi kontrolünden sonra `runbook.md` komutu açık onayla çalıştırılır.

## Auth kapsamı

Uygulama dump'ına ek olarak `auth.dump`, `storage.dump`, `auth_storage_diff.sql`, `migration_history.sql` ve migration dosyaları paketlenir. `supabase db diff` nested Docker kullandığı için Cloud Run içinde çağrılmaz: Cloud Build'in `auth-storage-diff` adımı linked projeye karşı dosyayı üretir ve operasyon imajına gömer. Dosya yoksa nightly backup güvenli biçimde başarısız olur; eksik paket yayımlanmaz.

Restore Job, ayrı Secret Manager'daki canary parolasıyla gerçek Auth girişi yapar ve canary UUID'sini doğrular. Canary hesabına uygulama rolü atanmaz; iş tablosu sorgusunun RLS tarafından reddedilmesi zorunludur.

Gerekli ortam değişkenleri Terraform Job tanımlarında listelenir. Parolalar veya bağlantı dizeleri repo içine yazılmaz.
