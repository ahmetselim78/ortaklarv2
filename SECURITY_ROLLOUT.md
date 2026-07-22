# OrtaklarV2 güvenlik paketi yayın runbook'u

Bu değişiklikler tek final güvenlik kapısına bağlıdır; production'a tek seferde uygulanmaz. Mevcut migration dosyaları değiştirilmemiş, yeni seri `046` ile başlatılmıştır. Her aşamanın DB, frontend ve Edge dağıtımı kendi değişiklik kaydıyla yapılır.

## Aşama sırası

| Aşama | Uygulama | Doğrulama | Geri dönüş sınırı |
|---|---|---|---|
| 1 | `infra/gcp`, `ops/backup`, `cloudbuild.ops.yaml` | 7 günlük backup/verify, manuel ve Scheduler restore, Auth canary, RPO/RTO, Monitoring alarmı | Scheduler durdurulur/önceki imaj revision'ı; Bucket Lock geri alınmaz |
| 2 | `046_auth_identity_bridge.sql`, `051_auth_session_helpers.sql`, Auth ekranları ve geçiş scriptleri | Hesap bazlı gerçek giriş/reset, cihaz iptali, admin TOTP/AAL2 | Taşınmamış hesapta kontrollü geçiş; taşınmış hesap legacy parolaya döndürülmez |
| 3 | `047_rbac_core.sql`, kullanıcı/rol admin panelleri | Rol matrisi, mevcut oturumda en geç 30 saniye içinde yetki değişimi | UI enforcement geri alınabilir; rol verileri korunur |
| 4 | `048_rls_rpc_hardening.sql` | pgTAP negatif paket ve iş akışı smoke testleri | Yalnız etkilenen modül bakım modu; geniş politika geri yüklenmez |
| 5 | `052_admin_user_and_secret_security.sql`, güvenli Edge Function'lar, R2 Worker | Bundle sır taraması, JWT/izin/CORS/cron testleri, anahtar rotasyonu | Önceki güvenli Edge revision; sırlar frontend'e dönmez |
| 6 | `049_append_only_audit.sql`, audit paneli/arşiv Job'u | Audit failure rollback, filtre, şifreleme geri okuma/hash testi | Etkilenen modül bakım modu; auditsiz işlem yok |
| 7 | `050_central_error_tracking.sql`, istemci/Edge/Job hata aktarımı | Altı kaynak, dedup, rate-limit, hassas veri temizleme | İstemci aktarımı kapatılabilir; Monitoring korunur |
| 8 | `053_legacy_security_cleanup.sql`, `054_account_lockout_guards.sql` | Tam Auth eşleme/rol kapısı, parola kolonu ve geniş grant taraması; kendi/son yönetici kilitlenme testleri | İleri düzeltme veya izole restore; plaintext kolon geri açılmaz |
| 9 | `055_role_management_operations.sql`, `056_production_stations_rbac.sql`, `057_production_stations_single_umbrella.sql` | Atomik rol matrisi, üretim istasyonu modül izinleri ve dört istasyon ekranı smoke testi | İleri düzeltme; rol/izin geçmişi korunur |
| 10 | `058_error_resolution_report.sql`, `059_ai_error_export_workflow.sql`, `060_fix_ai_error_export_function.sql` | AI hata dışa aktarma/inceleme/çözüm raporu doğrulaması, AAL2 ve toplu işlem sınırları | İstemci iş akışı kapatılabilir; hata kayıtları silinmez |

`049`–`052` dosya numaraları migration bağımlılığına göre sıralıdır; operasyonel aşama sırası yukarıdaki yayın paketleriyle korunur. `053`, aktif her personelde doğrulanmış Auth eşlemesi ve rol yoksa bilinçli olarak hata verir. `054`, final pakette hemen ardından uygulanır; kendi hesabını/son aktif yöneticiyi pasifleştirme veya düşürme ile yönetici temel iznini kaldırmayı veritabanında engeller.

## Geçici uyumluluk kuralları

- `hr_personel.giris_sifresi`, 046 sonrasında Data API rollerine kapalıdır; yalnız tek kullanımlık sunucu geçiş işi okuyabilir.
- Hesap `auth_migrated_at` aldıktan sonra legacy fallback yoktur ve Auth ile eski kolon arasında senkronizasyon yapılmaz.
- RLS, modül bazında yeni dar politika uygulanarak açılır. `USING(true)`, `anon_all` veya `authenticated_all` rollback seçeneği değildir.
- `ops/emergency-restore-pre-046-compatibility.sql` yalnız belgelenmiş acil durumda, doğrulanmış yedek ve iki kişi onayıyla kullanılabilecek fail-closed bir uyumluluk aracıdır; normal rollback yöntemi değildir.
- Gerektiğinde yalnız giriş, üretim girişi, Telegram veya ilgili entegrasyon bakım moduna alınır; uygulamanın tamamı uzun süre kapatılmaz.
- `053` uygulanmadan önce Aşama 1 yedeği ve izole restore yeniden başarılı olmalıdır.

## Her aşamada zorunlu komutlar

```sh
npm test -- --run
npm run build
npm run test:security
supabase test db
```

Yerel Docker/Supabase yoksa `supabase test db` sonucu kabul edilemez olarak işaretlenir ve erişilebilir CI/izole Supabase ortamında çalıştırılmadan aşama kapanmaz. pgTAP dosyaları `supabase/tests/rls_negative.test.sql`, `supabase/tests/audit_rollback.test.sql`, `supabase/tests/account_lockout_guards.test.sql`, üretim istasyonu testleri ve `supabase/tests/error_resolution_workflow.test.sql` altındadır.

## Yerel kabul kaydı — 17 Temmuz 2026

- `supabase db reset --local` ile `001`–`054` migration serisi boş veritabanına sıfırdan başarıyla uygulandı.
- Üç pgTAP dosyasında 25/25 test başarılı: dar RLS/RPC, audit rollback ve yönetici kilitlenme korumaları.
- Vitest 160/160, production build, statik güvenlik taraması ve değiştirilen `admin-users` Edge Function Deno kontrolü başarılı.
- Build yalnız mevcut büyük bundle uyarısını üretir; kabulü engelleyen TypeScript/Vite hatası yoktur.
- Reset sonrasında yerel test yöneticisi bootstrap edildi; ilk girişte parola değişimi ve yeni TOTP kaydı kullanıcı tarafından tamamlanmalıdır.
- Bu kayıt yalnız yerel kabulü kapatır. GCP dağıtımı, gerçek backup/verify/restore, Auth canary, RPO/RTO, alarm, yedi günlük gözlem ve Bucket Lock onayı hâlâ dış production kapılarıdır.

## Çalışma ağacı doğrulaması — 23 Temmuz 2026

- Migration aralığı `001`–`060` olarak güncellendi; `058`–`060` hata inceleme ve çözüm raporu iş akışıdır.
- Vitest: 20 dosya ve 183/183 test başarılı.
- ESLint, TypeScript uygulama/Node tip kontrolleri ve statik güvenlik kontrolü başarılı.
- `058`–`060` için pgTAP kapsamı `error_resolution_workflow.test.sql` ile eklendi.
- Bu kayıt veritabanı reset/pgTAP sonucunu iddia etmez. `supabase db reset --local` ve `supabase test db` izole Supabase/Docker ortamında ayrıca başarılı olmadan Aşama 10 kapanmaz.

## Auth geçişi

1. 046/047/049/051'in ilgili yayınları uygulandıktan sonra ilk yöneticiyi `npm run auth:bootstrap` ile oluşturun.
2. Yönetici ilk girişte geçici parolayı değiştirir ve TOTP kaydını doğrular.
3. `scripts/auth-migration-map.example.json` örneğinden güvenli, repoya alınmayan eşleme dosyası hazırlayın.
4. `npm run auth:migrate` çalıştırın. Script parolayı loglamaz; Auth'a aktarılabilen parolayı gerçek girişle doğrular, diğer hesaplara reset gönderir.
5. Reset bekleyen kullanıcıların giriş/parola değişimini tamamlayıp `auth_migrated_at` almasını bekleyin.
6. Legacy kullanım sıfır ve tüm aktif personeller tek role bağlı olmadan 053'ü uygulamayın.

## Nihai yayın kapısı

- Son tam yedek ve bütünlük doğrulaması 24 saat içinde; son aylık gerçek restore/Auth canary başarılı; ölçülen RTO en fazla 4 saat.
- Günlük 30 gün ve aylık 365 gün retention doğrulanmış; Bucket Lock yalnız iki kişi kontrolü ve açık onayla uygulanmış.
- Aktif kullanıcıların tamamı Auth + tek DB rolünde; yönetici AAL2 kullanıyor; cihazlar ayrı ve iptal edilebilir.
- `security_release_gate` görünümündeki üç değer `true`.
- Anon/geniş RLS ve açık RPC yok; Edge JWT/servis kimliği ve üretim origin allowlist'i doğrulanmış.
- Audit rollback ve arşiv bütünlük testi; hata dedup/rate-limit/temizleme testleri başarılı.
- Eski parola kolonu, sabit admin yolu, frontend sırları ve geçici uyumluluk kodu yok.
- Türkçe UI, Europe/Istanbul, `durumService.ts`, durum geçişleri, etiket, istasyon, Telegram, Opti export ve operatör üretim girişi smoke testleri başarılı.

Müşteri paneli bu paketin parçası değildir. Yeni müşteri rolü ancak bu kapı kapandıktan sonra sabit izin kataloğu ve mevcut DB tabanlı RBAC üzerinden ayrı çalışma olarak eklenir.
