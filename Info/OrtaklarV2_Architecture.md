# OrtaklarV2 — AI Proje Bağlamı ve Mimari Rehberi

> **Son doğrulama:** 23 Temmuz 2026
>
> **Doğrulanan sürüm:** `security-rollout` / `f1421b0` + mevcut çalışma ağacı
>
> **Veritabanı migration aralığı:** `001`–`060`
>
> **Amaç:** Bu dosya, yeni özellik geliştirirken AI ile paylaşılacak ana proje bağlamıdır. Kod ve migration dosyaları her zaman nihai doğruluk kaynağıdır.

## Bu Dosya AI ile Nasıl Kullanılmalı?

Yeni bir özellik isterken bu dosyayı konuşmaya ekleyin ve isteğinizi aşağıdaki şablonla yazın. AI'den önce ilgili dosyaları incelemesini, ardından mevcut mimariye uyumlu değişiklik yapmasını isteyin. Bu dosyadaki bilgi ile kod çelişirse AI kodu ve en yeni migration'ı esas almalı, çelişkiyi belirtmeli ve bu dokümanı da güncellemelidir.

```text
OrtaklarV2 projesinde aşağıdaki özelliği geliştir:

Özellik:
[İstenen davranışı açıkça yaz]

Kullanıcı akışı:
1. [Kullanıcı nereden başlar?]
2. [Hangi işlemleri yapar?]
3. [Başarılı sonuç ne olmalı?]

Kurallar ve istisnalar:
- [Yetki, durum, doğrulama veya hata koşulları]
- [Mevcut veriye geriye dönük uyumluluk gereksinimi]

Kabul kriterleri:
- [Ekranda/veritabanında gözlenebilir sonuç]
- [Hata durumunda beklenen davranış]
- İlgili testler eklensin veya güncellensin.
- `npm test`, `npm run build` ve ilgili kontroller çalıştırılsın.

Bu mimari dosyasını bağlam olarak kullan. Uygulamadan önce ilgili mevcut sayfa,
hook, lib/service, type ve migration dosyalarını incele. Mevcut durum geçişlerini,
Türkçe arayüzü, Europe/Istanbul tarih kurallarını ve eski kayıt uyumluluğunu koru.
Gerekli değilse yeni bir mimari katman veya bağımlılık ekleme. Veritabanı değişikliği
varsa mevcut migration'ı değiştirme; sıradaki numarayla yeni migration oluştur.
```

### AI İçin Değişmez Çalışma Kuralları

1. `src/types/` yalnızca tip dosyası değildir; özellikle `types/ayarlar.ts` etiket varsayılanları, eski JSONB kayıt birleştirme, doğrulama ve DPL üretim mantığı da içerir.
2. Sipariş, batch ve tamir durumları serbestçe yazılmamalıdır. Mevcut `GECERLI_GECISLER` kuralları ve `services/durumService.ts` yeniden hesaplamaları korunmalıdır.
3. Mevcut migration dosyaları üretim geçmişidir. Şema değişiklikleri yeni ve artan numaralı migration ile yapılmalıdır; şu an sıradaki numara `061`dir.
4. `siparis_detaylari` satırı bir sipariş kalemidir; `adet` o kalemdeki fiziksel cam sayısıdır. Satır `adet` kadar çoğaltılmaz. Kısmi yıkama/tarama ilerlemesi `uretim_emri_detay_id` bağlı `yikama_loglari` sayısından hesaplanır.
5. `cam_kodu` sipariş kalemi kimliğidir (`GLS-XXXX`). Üretimde operatörün gördüğü/okuttuğu kısa kod çoğunlukla `uretim_emri_detaylari.sira_no` değeridir. Bu iki kimlik birbirine karıştırılmamalıdır.
6. Etiketin otomatik fiziksel baskısı Poz Giriş bilgisayarında yapılmaz. Poz Giriş `yeni_cam` broadcast'i gönderir; Kumanda Paneli kendi bilgisayarındaki `yazici-kopru` üzerinden basar ve `etiket_durumu` yayınlar.
7. Tarih ve saat işlemleri `Europe/Istanbul` kabulüyle, mümkün olduğunca `src/lib/tarih.ts` yardımcıları kullanılarak yapılmalıdır.
8. Arayüz metinleri Türkçedir. Mevcut tam ekran fabrika istasyonları sidebar layout'una taşınmamalıdır.
9. Supabase sorgularında varsayılan satır sınırı dikkate alınmalıdır. Büyük/eksiksiz veri gereken yerlerde `tumSatirlariGetir` veya server-side pagination kullanılmalıdır.
10. Eski `ayarlar.deger` JSONB kayıtları eksik alan içerebilir. Yeni ayar alanları derin varsayılan birleştirme ile geriye uyumlu olmalıdır.
11. `.env.local`, token, parola ve secret değerleri AI'ye veya repoya kopyalanmamalıdır. `dist/`, `node_modules/`, `yazici-kopru.exe` ve arşiv/export klasörleri kaynak kod olarak düzenlenmemelidir.
12. Yeni davranış mümkünse `src/**/*.test.ts` altında Vitest ile test edilmeli; teslimden önce en az `npm test` ve `npm run build` çalıştırılmalıdır.

## Project Overview

OrtaklarV2; sipariş, cam/çıta stoğu, üretim batch'leri, yıkama hattı istasyonları, etiket baskısı, tamir/fire, sevkiyat, vardiya hedefleri, operatör üretim girişi ve Telegram raporlamasını yöneten Türkçe bir cam üretim uygulamasıdır. Ana web uygulaması React + TypeScript + Vite + Tailwind CSS ile, veri/realtime/cron katmanı Supabase ile çalışır.

## Repository Structure

```text
src/
  pages/                 Route seviyesindeki ekranlar
  components/            Alan bazlı UI ve iş akışı bileşenleri
    admin/               Admin veri yönetimi
    ayarlar/             ERP ayar panelleri ve etiket yerleşim editörü
    cari|siparis|stok/    Ana kayıt modülleri
    uretim|tamir|sevkiyat Üretim operasyonları
    layout|ui/            Uygulama kabuğu ve ortak UI
  hooks/                 Supabase CRUD ve ekran state orkestrasyonu
  services/              Durum yeniden hesaplama ve dışa aktarma servisleri
  lib/                   Saf/ortak iş kuralları, parser'lar ve entegrasyon yardımcıları
  types/                 Domain tipleri; etiket tarafında ayrıca çalışan iş mantığı

supabase/
  migrations/            Uygulama sırasına göre PostgreSQL şeması (`001`–`060`)
  functions/             Deno Edge Functions (OCR, Telegram, yazıcı testi)

cloudflare-worker/       Personel ve etiket-zemin görsellerini R2'ye yükleyen Worker
yazici-kopru/            Kumanda PC'sinde çalışan yerel HTTP → USB/TCP DPL köprüsü
scripts/                 Bakım, fixture, karşılaştırma ve veri aktarım yardımcıları
public/                  Statik dosyalar, pdf.js worker, fontlar ve CMap'ler
Info/                    Bu mimari rehberi ve teknik analiz çıktıları
Dockerfile               Vite build + nginx production image
cloudbuild.yaml          Google Cloud Build → Artifact Registry → Cloud Run akışı
nginx.conf               SPA fallback ve statik asset cache kuralları
```

`dist/` derleme çıktısıdır. `opti programı için export/` çalışma zamanı kaynağı değil, harici programla ilgili örnek/arşiv verisidir.

## Database Schema

Migration `046`–`060` serisi Supabase Auth kimlik eşlemesini, merkezi RBAC'yi,
dar RLS/RPC kurallarını, append-only audit'i ve merkezi hata takibini ekler.
İstemci yönlendirmeleri yalnız kullanıcı deneyimi katmanıdır; nihai yetki sınırı
veritabanı politikaları, güvenli RPC'ler ve Edge Function kimlik kontrolleridir.
Şema değerlendirilirken `supabase/migrations/001`–`060` birlikte okunmalıdır.

### Tables and Key Columns

1. **cari** - Customers and Suppliers
   - id (UUID), kod (TEXT unique), ad, tipi ('musteri'|'tedarikci')
   - telefon, email, adres, notlar, created_at

2. **stok** - Product Catalog (glass combinations, spacer/çıta, ancillary materials)
   - id (UUID), kod (TEXT unique), ad, kategori ('cam'|'cita'|'yan_malzeme')
   - grup (e.g. ISICAM, DÜZCAM, ÜÇLÜ CAM), katman_yapisi (composition string e.g. `4+16+4`, CHECK format)
   - kalinlik_mm (single-pane thickness, NULL for IG units), birim, birim_fiyat
   - tedarikci_id (FK cari, ON DELETE SET NULL), marka, mevcut_miktar, aktif (BOOLEAN), created_at
   - Dropped columns: `tip`, `renk` (022)

3. **siparisler** - Orders
   - id (UUID), siparis_no (TEXT unique), cari_id (FK, RESTRICT)
   - tarih, teslim_tarihi, durum ('beklemede'|'batchte'|'yikamada'|'tamamlandi'|'eksik_var'|'iptal')
   - notlar, alt_musteri (end customer), teslimat_tipi (default 'teslim_alacak'), tamamlandi_tarihi
   - kaynak ('pdf'|'manuel'), harici_siparis_no (supplier/PDF order number), created_at
   - Indexes: durum, harici_siparis_no

4. **siparis_detaylari** - Order Line Items
   - id (UUID), siparis_id (FK CASCADE), stok_id (FK stok, RESTRICT), cam_kodu (TEXT unique, format: GLS-XXXX)
   - genislik_mm, yukseklik_mm, adet, kenar_islemi (edge processing), poz (building position), menfez_cap_mm, kucuk_cam (BOOLEAN)
   - cita_stok_id (FK stok, SET NULL), uretim_durumu ('bekliyor'|'kesildi'|'yikandi'|'etiketlendi'|'tamamlandi')
   - notlar, created_at; CHECKs: adet > 0, genislik/yukseklik > 0
   - **Cardinality rule:** one row per order/form line; `adet` is the number of physical glasses on that line. `cam_kodu` identifies the line, not each physical copy.
   - Dropped columns: `ara_bosluk_mm`, `dis_kalinlik_mm`, `katman_sayisi`, `orta_kalinlik_mm`, `ara_bosluk_2_mm`, `katman_yapisi` (composition now lives on `stok.katman_yapisi`, migrations 021, 036–039)

5. **uretim_emirleri** - Production Batches
   - id (UUID), batch_no (TEXT unique, format: BATCH-YYYY-NNNN)
   - durum ('hazirlaniyor'|'export_edildi'|'yikamada'|'tamamlandi'|'eksik_var'|'iptal')
   - notlar, olusturulma_tarihi, export_tarihi

6. **uretim_emri_detaylari** - Batch Line Items
   - id (UUID), uretim_emri_id (FK CASCADE), siparis_detay_id (FK siparis_detaylari, RESTRICT)
   - sira_no (in-batch short GLS label, INTEGER)
   - Unique constraints: (uretim_emri_id, siparis_detay_id), (uretim_emri_id, sira_no)

7. **yikama_loglari** - Wash Station Logs
   - id (UUID), cam_kodu (TEXT), siparis_detay_id (FK, SET NULL), uretim_emri_detay_id (FK, SET NULL)
   - giris_zamani, operatör
   - One log is written per accepted physical scan. Partial progress must be counted primarily by `uretim_emri_detay_id`, so the same order line can be tracked independently in different batches.

8. **sayaclar** - Atomic ID Generation
   - anahtar (TEXT primary key), deger (INTEGER)
   - Used for: cam_kodu, cari_kod, stok_kod, siparis_no_YYYY, batch_no_YYYY

9. **tamir_kayitlari** - Repair/Scrap Records
   - id (UUID), cam_kodu, siparis_detay_id (FK, SET NULL), uretim_emri_id (FK, SET NULL), batch_no, sira_no, adet
   - kaynak_istasyon ('poz_giris'|'kumanda'|'manuel'), sorun_tipi ('kirik'|'cizik'|'olcum_hatasi'|'diger'), aciklama
   - durum ('bekliyor'|'tamamlandi'|'hurda')
   - Denormalized display fields: musteri, nihai_musteri, siparis_no, genislik_mm, yukseklik_mm, stok_ad
   - created_at, tamamlanma_tarihi, tamamlanma_notu

10. **ayarlar** - System Settings (JSON key-value store)
    - id (UUID), anahtar (TEXT unique), deger (JSONB), guncelleme
    - Keys: `etiket_ayarlari`, `opti_export`, `admin_ayarlar_gorunum`, `telegram_edge_config` (edge fn URL/auth for cron, migrations 042–043)

11. **takvim_notlari** - Calendar Notes (one per day)
    - id (UUID), tarih (DATE unique), not_metni, created_at, guncelleme

12. **araclar** - Vehicles for Shipping
    - id (UUID), plaka (TEXT unique), ad, kapasite_m2 (NUMERIC), aktif (BOOLEAN), notlar, created_at

13. **sevkiyat_planlari** - Shipping Plans (Drag & Drop)
    - id (UUID), siparis_id (FK CASCADE), arac_id (FK CASCADE), tarih (DATE), notlar, created_at, guncelleme
    - Unique constraint: (siparis_id, tarih)

14. **hr_personel** - Human Resources / Operator Management
    - id (UUID), ad_soyad, foto_url, rol ('Direkt'|'Endirekt')
    - is_aktif (BOOLEAN), kullanici_adi, giris_sifresi (plain-text operator login), `uretim_yetkileri_sinirli` (BOOLEAN), olusturma

15. **uretim_saat_sablonlari** - Hourly Shift Templates
    - id (UUID), sablon_adi, saat_araligi (e.g. "08:00 - 18:00"), sira_no, olusturma

16. **uretim_saatlik_hedefler** - Per-hour Targets Within a Shift Template
    - id (UUID), sablon_id (FK CASCADE), saat_araligi (e.g. "08:00 - 09:00"), hedef_adet, sira_no

17. **gunluk_uretim_takip** - Daily/Hourly Production Tracking Board
    - id (UUID), tarih (DATE), saat_araligi (TEXT)
    - hedef_adet, gerceklesen_adet, fire_adet (INTEGER), aksiyon_notu, npt_orani (Non-Productive Time %)
    - sira_no, olusturma
    - Unique constraint: (tarih, saat_araligi)

18. **uretim_istasyonlari** - Production Station Definitions
    - id (UUID), ad, sira_no, aktif (BOOLEAN), fire_var (BOOLEAN — tracks scrap), created_at
    - Seeded: Kesim, Çıta Büküm, Çıta Kesim, Isıcam Hattı, Robot, Tamir

19. **gunluk_uretim_raporlari** - Daily Operator Production Entry Reports
    - id (UUID), tarih (DATE), operator_id (FK hr_personel, SET NULL), toplam_personel (INTEGER), notlar
    - created_at, updated_at; Unique constraint: (tarih, operator_id)

20. **gunluk_uretim_istasyon_kayitlari** - Per-station Counts Within an Operator Report
    - id (UUID), rapor_id (FK CASCADE), istasyon_id (FK uretim_istasyonlari, CASCADE), adet, fire_adet
    - Unique constraint: (rapor_id, istasyon_id)

21. **gunluk_uretim_arac_yuklemeleri** - Vehicle Loading Counts Within an Operator Report
    - id (UUID), rapor_id (FK CASCADE), arac_id (FK araclar, SET NULL), dis_arac_plakasi, dis_arac_adi, adet, created_at

22. **telegram_ayarlari** - Telegram Bot Configuration (singleton)
    - id (UUID), bot_token (TEXT), chat_id (TEXT), aktif (BOOLEAN), olusturma
    - Template toggles: sablon_baslik, sablon_saatlik_detay, sablon_saatlik_ozet, sablon_istasyonlar, sablon_araclar, sablon_personel, sablon_operator, sablon_notlar

23. **telegram_rapor_saatleri** - Scheduled Report Times
    - id (UUID), saat (TEXT, format: HH:MM), aktif (BOOLEAN)
    - rapor_tipi ('saatlik'|'uretim_giris'|'her_ikisi'), olusturma

24. **telegram_rapor_log** - Duplicate Send Prevention Log
    - id (UUID), tarih (DATE), saat (TEXT)
    - gonderildi_at (TIMESTAMPTZ)
    - Unique constraint: (tarih, saat)

25. **hr_personel_istasyon_yetkileri** - Per-operator Production Entry Permissions
    - personel_id (FK `hr_personel`, CASCADE), istasyon_id (FK `uretim_istasyonlari`, CASCADE), created_at
    - Composite primary key: (personel_id, istasyon_id)
    - When `hr_personel.uretim_yetkileri_sinirli=false`, the operator sees all active stations. When true, only rows in this relation are allowed.
    - A database trigger also rejects unauthorized inserts/updates in `gunluk_uretim_istasyon_kayitlari`; this is not only a UI filter.

26. **app_users** - Supabase Auth UUID ile uygulama personeli/cihazı arasındaki parola içermeyen kimlik köprüsü

27. **roles / permissions / role_permissions / user_roles** - Merkezi ve veritabanı tarafından uygulanan RBAC kataloğu ve kullanıcı rol atamaları

28. **audit_events** - Ana işlemle aynı transaction içinde yazılan append-only denetim olayları

29. **system_errors** - Temizlenmiş merkezi hata kaydı; kaynak, önem, durum, tekrar sayısı, inceleme ve çözüm metadatası

> Note: `siparis_taslaklari` (order drafts) and `cam_aile_katalogu` (glass family catalog) are **not** database tables — drafts live in `localStorage`, and the glass-family catalog is derived logic over `stok` (see `lib/cam.ts`).

The `production_stations` RBAC module controls the sidebar's **Üretim İstasyonları** area and all four station screens under one role permission: Poz Giriş, Kumanda Paneli, Gösterge Ekranı and Tamir İstasyonu. It does not select production-entry station definitions. Those remain per-personnel through `hr_personel.uretim_yetkileri_sinirli` and `hr_personel_istasyon_yetkileri` in Personel Yönetimi.

### Postgres Functions

| Function | Purpose |
|---|---|
| `sonraki_sayac(p_anahtar, p_adet=1)` | Atomic counter increment (UPSERT on `sayaclar`) — GLS codes, order/batch numbers |
| `saatlik_sayac_arttir(p_id, p_delta=1)` | Atomically increments `gunluk_uretim_takip.gerceklesen_adet` (SECURITY DEFINER) |
| `saatlik_fire_arttir(p_id, p_delta=1)` | Atomically increments `gunluk_uretim_takip.fire_adet` (SECURITY DEFINER) |
| `telegram_saat_normalize(p_saat)` | Normalizes time strings to `HH:MM` |
| `telegram_saatlik_rapor_metni` / `telegram_uretim_giris_rapor_metni` / `telegram_rapor_mesaji` | SQL-side Telegram message builders |
| `telegram_otomatik_rapor_gonder()` | Current auto-send path (043): checks schedule/settings, POSTs to `check-and-send-report` edge function via `pg_net` |
| `uretim_istasyon_yetkisi_kontrol()` | Trigger function that enforces per-personnel station permissions on production report rows |
| `my_access_context()` | Aktif oturumun kullanıcı, rol, izin ve parola-değiştirme bağlamını döndürür |
| `report_system_error(...)` | Hassas veriyi temizleyerek hata kaydını dedup/rate-limit kurallarıyla oluşturur veya günceller |
| `acknowledge_system_errors_for_ai_export(uuid[])` | AAL2 + `errors/manage` ile AI'a aktarılan açık hataları incelemeye alır; en fazla 5000 kimlik |
| `resolve_system_errors_from_report(uuid[])` | AAL2 + `errors/manage` ile doğrulanmış çözüm raporundaki hataları topluca kapatır; en fazla 500 kimlik |

**Extensions:** `pg_net`, `pg_cron`. **pg_cron job:** `telegram-rapor-gonder` runs every minute (`* * * * *`), calling `telegram_otomatik_rapor_gonder()`.

Migration `044` adds performance indexes for repair lookups, wash-log progress, order/batch sorting and shipment queries. New list or relation-heavy features should first check whether their filter/join columns need an index.

## Pages (src/pages/)

15 page files, plus one route rendered directly from a component (`SaatlikTakipPanosu`).

1. **Dashboard.tsx** (`/`)
   - KPI cards (orders/batches/cari/stok) with links to other modules
   - Monthly delivery calendar (Teslim Takvimi) with drag-and-drop order pills to reschedule `teslim_tarihi`
   - Per-day/today notes (`takvim_notlari`), "Yıkamada" batch panel (30s polling), shipping plan entry (`SevkiyatPlanlama` modal)
   - Status labels: beklemede, batchte, yikamada, tamamlandi, eksik_var, iptal

2. **CariPage.tsx** (`/cari`)
   - Customer/supplier CRUD via `useCari`; müşteri/tedarikçi counts

3. **StokPage.tsx** (`/stok`)
   - Stock catalog: 3 category tabs (Cam, Çıta, Yan Malzemeler)
   - Active/passive toggle, delete with reference migration, orphaned-reference migration banners (`stokMigrasyon`)

4. **SiparisPage.tsx** (`/siparisler`)
   - Order management; paginated list (20/page), status/customer/alt-müşteri filters
   - New order form, PDF import, drafts panel (`useSiparisTaslaklari`), order detail/edit modal
   - Virtual "Tamirde" filter for orders with pending repairs; realtime subscription on `tamir_kayitlari`

5. **UretimPage.tsx** (`/uretim`)
   - Production batch management; new batch modal, batch detail modal with status transitions
   - CSV/IMP export for PerfectCut, batch cancel (reverts orders to beklemede) and delete

6. **UretimIstasyonlariPage.tsx** (`/istasyonlar`)
   - Station launcher hub ("ISICAM PROV2 LINK"): 4 cards → Poz Giriş, Kumanda, Gösterge, Tamir
   - Keyboard shortcuts `1`–`4` navigate to stations

7. **SaatlikTakipPage.tsx** (`/saatlik-takip`)
   - Embedded hourly production tracking board (`SaatlikTakipPanosu`, sidebar mode); link to full TV board

8. **AyarlarPage.tsx** (`/ayarlar`)
   - Settings hub with category grid, visibility-filtered from admin: Etiket, Araçlar, Personel, Hedef & Vardiya, Aksiyon Notu Presets, Telegram, Üretim İstasyonları

9. **AdminPage.tsx** (`/admin`)
   - Protected admin console; sensitive user, role, audit and error operations require current DB permission and AAL2 where applicable
   - Overview, user management, role management, audit records, error records, production-entry history, data management and settings sections
   - Error workflow supports sanitized AI export/acknowledgement and validated resolution-report import

10. **PozGirisPage.tsx** (`/istasyonlar/poz-giris`, full-screen, no sidebar)
    - Planning/office station — batch selection (export_edildi/yikamada/eksik_var) and GLS/poz barcode scanning
    - 3-column layout: customers, scan status, per-customer glass list; writes `yikama_loglari`, increments the hourly counter and publishes label data
    - Realtime broadcast channel `uretim-istasyonlar`; important events include `batch_secildi`, `yeni_cam`, `etiket_durumu`, `cam_tamire_gonderildi` and station-specific approval events
    - Keyboard shortcut: `X` sends last scanned glass to repair

11. **KumandaPaneliPage.tsx** (`/istasyonlar/kumanda`, full-screen)
    - Spacer (çıta) station control panel; listens for scan broadcasts from Poz Giriş
    - 3-column layout: customers, active cards, customer glass list with çıta mm; çıta onay status banner from Gösterge
    - Owns production label printing: receives `yeni_cam`, sends DPL through the local bridge, displays bridge health, supports retry and broadcasts `etiket_durumu`

12. **GostergeEkraniPage.tsx** (`/istasyonlar/gosterge`, full-screen)
    - Macun robot display — large çıta (spacer) thickness readout with change-approval flow
    - Broadcasts `cita_onay_durumu` to Kumanda; keyboard shortcut `Enter` confirms change

13. **TamirIstasyonuPage.tsx** (`/istasyonlar/tamir`, full-screen)
    - Repair/scrap station; tabs: Tümü / Bekliyor / Tamamlandı / Hurda
    - Status: bekliyor → tamamlandi/hurda (terminal); realtime updates on `tamir_kayitlari`
    - Cascade updates to order/production status when marking glass as scrap or completing repairs

14. **OperatorGirisPage.tsx** (`/istasyonlar/uretim-giris`, full-screen, opens in new tab from sidebar)
    - Operator daily production report form ("Üretim Takip Çizelgesi")
    - Re-authenticates the linked Supabase Auth account; per-station adet/fire, vehicle loading, personnel count, notes
    - Filters available stations through the person's `uretim_yetkileri_sinirli` setting and `hr_personel_istasyon_yetkileri`; the database trigger enforces the same rule
    - Saves to `gunluk_uretim_raporlari` + child tables; "Son 10 Günlük Rapor" history; resumes today's report on login

15. **NotFoundPage.tsx** (`*`, standalone)
    - 404 error page

**Rendered directly from a component (not `src/pages/`):**
- **SaatlikTakipPanosu** (`src/components/uretim/SaatlikTakipPanosu.tsx`) at `/istasyonlar/uretim-panosu` — full-screen TV board version of the hourly tracking board (`tamEkran={true}`)

## Components

### Layout (src/components/layout/)
- **AppLayout.tsx** - Root shell: fixed sidebar + scrollable `<main>` with React Router `<Outlet />`
- **Sidebar.tsx** - Grouped navigation: Ana Sayfa, Saatlik Takip / Kayıtlar (Cari, Stok) / Operasyon (Siparişler, Üretim Emirleri, Üretim İstasyonları) / Girişler (Üretim Girişi, opens new tab) / footer (Admin Paneli, Ayarlar)

### Siparis (src/components/siparis/)
- **CamStokPicker.tsx** - Portal-based searchable glass stock picker, grouped by cam family, keyboard navigation
- **CitaStokSelect.tsx** - `<select>` for active spacer (çıta) stock, sorted by thickness
- **PDFImportModal.tsx** - 4-step wizard: PDF upload → cari/stok/çıta matching → preview → delivery type (PIMAPEN/Ercom Smart PDFs)
- **SevkiyatPlanModal.tsx** - Set delivery type for an order: pickup vs shipment (vehicle + date + notes)
- **SiparisDetayModal.tsx** - Order detail/edit: header, wash progress, glass line table, bulk glass-type replace, nested edit modal
- **SiparisEditModal.tsx** - Multi-step edit modal for existing orders (customer, glass list when beklemede, shipping)
- **SiparisForm.tsx** - 3-step "New Order" wizard (React Hook Form + Zod); auto-saves draft on close
- **SiparisListesi.tsx** - Order table: status badges, PDF/manual source, delivery type, repair badge, actions
- **TaslaklarPanel.tsx** - Modal listing localStorage order drafts with resume/delete

### Uretim (src/components/uretim/)
- **SaatlikTakipPanosu.tsx** - Full-screen hourly production dashboard: theme toggle, archive date picker, target vs actual table, workforce summary, action-note modal
- **UretimDetayModal.tsx** - Batch detail: summary cards, glass lines grouped by order, Opti IMP / çıta-bending CSV export
- **UretimListesi.tsx** - Batch table with status-colored rows and linked order chips
- **YeniBatchModal.tsx** - Create batch by searching/multi-selecting eligible pending orders

### Cari (src/components/cari/)
- **CariForm.tsx** - Add/edit customer/supplier modal (Zod validation)
- **CariListesi.tsx** - Searchable, filterable, paginated cari table

### Stok (src/components/stok/)
- **StokForm.tsx** - Add/edit stock card modal, category-specific fields
- **StokListesi.tsx** - Category-scoped stock table with search/filter/pagination and migration actions

### UI (src/components/ui/)
- **ConfirmDialog.tsx** - Reusable confirmation modal with loading state and confirm color variants
- **EmptyState.tsx** - Centered empty-state block (icon + title + description + action slot)
- **ErrorBoundary.tsx** - Class-based React error boundary with Turkish error screen
- **KatmanCombobox.tsx** - Searchable combobox for glass layer composition strings
- **PageHeader.tsx** - Reusable page header (title, description, icon, actions)
- **Pagination.tsx** - Table pagination footer
- **Skeleton.tsx** - `Skeleton`, `TableSkeleton`, `CardSkeleton` loading placeholders
- **StatusBadge.tsx** - Status pill badge (siparis | uretim), centralized Turkish labels/colors
- **YikamaAdetBadge.tsx** - Shared partial/complete wash-count display for order and batch details

### Admin (src/components/admin/)
- **AdminOverview.tsx** - Yönetim alanlarına ve operasyonel durumlara bağlantı veren özet ekran
- **KullaniciYonetimiPanel.tsx** - Auth hesabı, personel bağlantısı, rol ve hesap yaşam döngüsü yönetimi
- **RolYonetimiPanel.tsx** - Rol kataloğu ve atomik izin matrisi yönetimi
- **AuditKayitlariPanel.tsx** - Append-only denetim kayıtlarını filtreleme ve inceleme
- **HataKayitlariPanel.tsx** - Merkezi hata kayıtları, AI dışa aktarma ve çözüm raporu içe aktarma akışı
- **VeriYonetimiPanel.tsx** - Permanent batch/order deletion UI with search, status filtering, server-side order pagination and confirmation warnings

### Ayarlar (src/components/ayarlar/)
- **AksiyonNotuPresetsPanel.tsx** - Preset action notes for hourly board (text + 1–9 shortcut), localStorage
- **AraclarPanel.tsx** - Vehicle CRUD (plate, name, m² capacity, notes, active)
- **EtiketAyarlariPanel.tsx** - Label printer settings: bridge server, USB/TCP target, panel/custom DPL mode, print condition, calibration and test-print flow
- **EtiketYerlesimEditor.tsx** - Physical label canvas/editor: per-field coordinates, rotation/font/scale, DPI and heat, global offsets, boundary warnings, and optional R2-backed reference background image
- **HedefVardiyaPanel.tsx** - Shift template manager: hourly target slots, weekday assignment, apply-to-today
- **IstasyonYonetimiPanel.tsx** - Production station CRUD (name, order, active, scrap-tracking flag)
- **OptiExportAyarlariPanel.tsx** - Opti/PerfectCut export settings: IMP counter, spacer deduction mm, per-stock FAM mapping
- **PersonelYonetimiPanel.tsx** - HR personnel CRUD (name, photo via R2 upload, role, login credentials, active) plus per-personnel production station permissions
- **TelegramAyarlariPanel.tsx** - Telegram integration: connection, scheduled times/types, message template toggles, test send

### Tamir (src/components/tamir/)
- **TamireGonderModal.tsx** - Send defective glass to repair (problem type, quantity, notes); keyboard shortcuts 1–4/Enter/Delete

### Sevkiyat (src/components/sevkiyat/)
- **SevkiyatPlanlama.tsx** - Full-screen shipment planning board: calendar, unassigned order pool, drag-and-drop vehicle assignment

## Types (src/types/)

```typescript
// cari.ts
type CariTipi = 'musteri' | 'tedarikci'
interface Cari { id, kod, ad, tipi, telefon, email, adres, notlar, created_at }

// siparis.ts
type SiparisDurum = 'beklemede'|'batchte'|'yikamada'|'tamamlandi'|'eksik_var'|'iptal'
type UretimDurumu = 'bekliyor'|'kesildi'|'yikandi'|'etiketlendi'|'tamamlandi'
interface Siparis { id, siparis_no, cari_id, tarih, teslim_tarihi, durum, notlar, alt_musteri, harici_siparis_no, created_at, cari?, siparis_detaylari?, sevkiyat_planlari?, teslimat_tipi?, tamamlandi_tarihi?, kaynak? }
interface SiparisDetay { id, siparis_id, stok_id, cam_kodu, genislik_mm, yukseklik_mm, adet, cita_stok_id, kenar_islemi, notlar, poz, menfez_cap_mm?, kucuk_cam?, uretim_durumu, created_at, stok?, cita_stok? }

// stok.ts
type StokKategori = 'cam'|'cita'|'yan_malzeme'
interface Stok { id, kod, ad, kategori, grup, katman_yapisi, kalinlik_mm, birim, birim_fiyat, tedarikci_id, marka, mevcut_miktar, aktif, created_at, tedarikci_ad? }

// uretim.ts
type UretimEmriDurum = 'hazirlaniyor'|'export_edildi'|'yikamada'|'tamamlandi'|'eksik_var'|'iptal'
interface UretimEmri { id, batch_no, durum, notlar, olusturulma_tarihi, export_tarihi, cam_sayisi?, siparis_listesi? }
interface UretimEmriDetay { id, uretim_emri_id, siparis_detay_id, sira_no, siparis_detaylari? }

// tamir.ts
type TamirDurum = 'bekliyor'|'tamamlandi'|'hurda'
type TamirSorun = 'kirik'|'cizik'|'olcum_hatasi'|'diger'
type TamirKaynak = 'poz_giris'|'kumanda'|'manuel'
interface TamirKayit { id, cam_kodu, siparis_detay_id, uretim_emri_id, batch_no, sira_no, kaynak_istasyon, sorun_tipi, aciklama, durum, adet, musteri, nihai_musteri, siparis_no, genislik_mm, yukseklik_mm, stok_ad, created_at, tamamlanma_tarihi, tamamlanma_notu }

// ayarlar.ts
interface EtiketAyarlari { yazici, boyut, icerik, yerlesim, yazdirma_kosulu, dpl_modu, dpl_sablonu }
interface EtiketYerlesimi { surum: 2, dpi, nokta_genislik, nokta_yukseklik, isi, x_ofset_mm, y_ofset_mm, zemin_fotografi_url, zemin_fotografi_key, zemin_opakligi, alanlar }
interface OptiExportAyarlari { sayac, cita_dusme, fam_haritasi: OptiFamEsleme[] }
function dplUret(ayarlar, veri): string  // Datamax M-4206 DPL label generator

// taslak.ts
interface SiparisTaslak { id, created_at, updated_at, veri: SiparisTaslakVerisi }  // localStorage order drafts

// saatlikUretim.ts
type PersonelRol = 'Direkt' | 'Endirekt'
interface HrPersonel { id, ad_soyad, foto_url, rol, is_aktif, kullanici_adi?, giris_sifresi?, uretim_yetkileri_sinirli?, hr_personel_istasyon_yetkileri? }
interface GunlukUretimSatiri { id, tarih, saat_araligi, hedef_adet, gerceklesen_adet, fire_adet, aksiyon_notu, npt_orani, sira_no }
interface HesaplanmisSatir extends GunlukUretimSatiri { kumulatifHedef, kumulatifGerceklesen, kumulatifFire, durumRengi, zamanDurumu }
type TelegramRaporTipi = 'saatlik' | 'uretim_giris' | 'her_ikisi'
```

## Services (src/services/)

**exportService.ts**
- `exportOptiIMP(detaylar, hedefFam, sayac, famHaritasi?, citaDusme?)` - Builds PerfectCut-6 `.IMP` file content via `lib/optiExport.ts` and downloads it to the browser
- `exportTarihiGuncelle(uretimEmriId)` - Sets batch `export_tarihi` and `durum='export_edildi'` (only from `hazirlaniyor`/`eksik_var`)
- `exportCitaBukumCSV(detaylar, batchNo, citaStoklar?)` - Builds semicolon-delimited, BOM-prefixed CSV for the çıta (spacer) bending machine and downloads it

## Edge Functions (supabase/functions/)

**mistral-ocr/index.ts**
- Deno Edge Function proxying PDF/image OCR requests to the Mistral OCR API (API key kept server-side)
- Accepts `document_base64` (PDF) or `image_base64` (PNG); returns page markdown; CORS enabled

**check-and-send-report/index.ts**
- Scheduled/manual Telegram production report sender
- Checks Turkish time against `telegram_ayarlari` + `telegram_rapor_saatleri` (or `force: true`), dedupes via `telegram_rapor_log`
- Pulls `gunluk_uretim_takip` (hourly) and/or `gunluk_uretim_raporlari` (operator entry) data and sends a Telegram message with configurable template sections
- Uses shared message-building logic in `supabase/functions/_shared/telegramMessage.ts`; client preview/test and scheduled output should stay semantically aligned

**yazici-test/index.ts**
- Sends a raw DPL command string to a Datamax label printer over TCP (`ip`, `port`, `dpl` in request body); returns success/error JSON; CORS enabled
- This edge function is a test/alternative path. Normal factory printing uses the local `yazici-kopru` on the Kumanda PC so it can reach a Windows USB printer or LAN printer.

## Hooks (src/hooks/)

**useCari()**
- State: cariler[], yukleniyor, hata
- Methods: getir(), ekle(), guncelle(), sil(), yenile()

**useSiparis()**
- State: siparisler[] (cari/detay-count/sevkiyat joins), yukleniyor, hata
- Methods: ekle(form) (creates one detail row per form line via `tekilSiparisDetayRows`, preserving physical quantity in `adet`), guncelle(id, form), durumGuncelle(id, durum), sil(id), yenile()
- Valid status transitions defined in `GECERLI_GECISLER`
- Standalone export: `getSiparisDetaylari(siparisId)`

**useStok()**
- State: stoklar[], yukleniyor, hata
- Methods: getir(), ekle(), guncelle(), sil(), yenile()
- Maps tedarikci FK to tedarikci_ad display

**useUretim()**
- State: emirler[] (enriched with cam_sayisi, siparis_listesi), yukleniyor, hata
- Methods: yeniBatch(siparisIds, notlar?), durumGuncelle(id, durum), sil(id), iptalEt(id), yenile()
- Exported helpers: getBatchDetaylari(uretimEmriId), batcheCamEkle(uretimEmriId, siparisDetayId), batchtenCamCikar(uretimEmriDetayId)
- Valid status transitions defined in `GECERLI_GECISLER`; handles cascade updates between batch/order/detay statuses

**useSevkiyat.ts**
- `useAraclar()` - State: araclar[] (active vehicles), yukleniyor
- `sevkiyatKaydet(siparisId, aracId, tarih, notlar?)` - Upserts `sevkiyat_planlari`, updates order `teslimat_tipi`/`teslim_tarihi`

**useAyarlar()**
- State: etiketAyarlari (merged with defaults), yukleniyor, kaydediyor, hata
- Methods: getir()/yenile(), etiketAyarlariGuncelle(yeni)

**useOptiExportAyarlari()**
- State: ayarlar (sayac, cita_dusme, fam_haritasi), yukleniyor, kaydediyor, hata
- Methods: getir()/yenile(), kaydet(yeni), sayacArttir()

**useSaatlikUretim()**
- State: satirlar, personeller, seciliTarih, yukleniyor, hata; computed hesaplanmisSatirlar (cumulative target/actual/scrap, color, time status), isGucuOzeti (workforce summary)
- Methods: veriGetir(tarih)/yenile(), handleGlsRead(barkod?), handleFireDetected(saatAraligi?), fetchPastDateData(tarih), buguneDon(), aksiyonNotuGuncelle(id, not), nptGuncelle(id, npt)
- Realtime Supabase subscription on `gunluk_uretim_takip` for today

**useSiparisTaslaklari()**
- State: taslaklar[] (localStorage-backed order drafts)
- Methods: upsert(veri, id?), sil(id), getir(id); standalone helper `taslakBosMu(v)`
- Cross-tab sync via `storage` event

**useEscape(onClose, enabled?)**
- Side-effect only hook: calls `onClose()` on Escape keydown (with IME composition guard)

## Utilities (src/lib/)

**idGenerator.ts** - Atomic ID generation
- generateCamKodulari(adet) → GLS-XXXX format
- generateSiparisNo() → SIP-YYYY-NNNN
- generateCariKod() → C-XXXX
- generateStokKod() → S-XXXX
- generateBatchNo() → BATCH-YYYY-NNNN
- Uses PostgreSQL `sonraki_sayac()` function with UPSERT for atomic increments

**supabase.ts / supabaseUrl.ts** - Vite env değişkenlerinden Supabase istemcisi; yerel ağ geliştirmesinde localhost hedefini güvenli biçimde tarayıcı hostuna uyarlama

**authError.ts / edgeFunctionError.ts** - Auth ve Edge Function hata yanıtlarını kullanıcıya anlaşılır, ayrıntı kaybetmeyen mesajlara dönüştürür

**errorReporter.ts** - Global istemci hata aktarımı, geliştirme gürültüsü filtresi ve hassas veri temizleme sınırı

**errorResolutionReport.ts** - AI çözüm raporunun türünü, kimliklerini ve tekrarlarını doğrulayan saf parser

**utils.ts**
- cn() - Tailwind class merging (clsx + tailwind-merge)
- formatDate(dateStr) - Format to Turkish locale
- camTipiAd(stokAd) - Strips thickness prefix from stock name

**cam.ts** - Glass composition / stock matching
- Çıta (spacer): citaStokAdi, citaKodOnerisi, aktifCitaStoklari, citaEslestir, citaStokSira, eksikCitaBoyutlari, citaBukumMalzemeEtiketi
- Katman (layer)/OCR: isValidKatmanYapisi, normalizeKatmanYapisi, extractKatmanYapisiFromText, getStokKatmanYapisi, getAraBoslukMm
- Glass family: detectCamAilesi, normalizeCamAilesiAd, camAilesiEsit, cozumleOcrCam, varsayilanCamAileleri
- Matching/display: stokKartEslestir, adKatmanUyumlu, getCamKompozisyon, getStokGosterimAciklamasi, getEtiketCamTipi

**siparisDetay.ts**
- fizikselCamAdedi(adet), fizikselGlsKodu(siraNo, fallback?), siparisDetayGosterimKodu(siraNo, stokKod?)
- tekilSiparisDetayRows(siparisId, camlar, uretimDurumu?) - Creates one database row per form/order line; generates one GLS row code and keeps the line quantity in `adet`

**optiExport.ts** - PerfectCut-6 IMP export
- optiFamKodu / optiFamKoduOtomatik / optiPaneFamKodu - FAM code resolution
- optiParcalariUret / optiTumParcalar - Piece list generation
- optiExportTurleri(detaylar, famHaritasi?) - Exportable glass types
- optiImpOlustur(parcalar) - Builds `[PIECES]` IMP content
- optiDosyaAdi(sayac) → OP_NNNNN.IMP

**fiyat.ts**
- camMetrekareHesapla(satir), camSatirTutariHesapla(satir, birimFiyat)

**tarih.ts** - Europe/Istanbul timezone helpers
- bugunTarih(), bugunGoster(), trSaatStr(), formatTarihTr(dateStr), tarihEkleTr(gunSayisi, fromDate?)

**audio.ts**
- beep(type: 'success'|'error'|'complete'), beepAlert() - Web Audio alerts

**pdfParser.ts** - PIMAPEN/Ercom PDF order import
- pdfToText(file, onProgress?) - Mistral OCR (edge fn → direct API) → page-by-page fallback → pdf.js text
- parsePDF(file, onProgress?) - Format detection, header/line parsing, quantity/m² validation
- cariEslestir(pdfCariKodu, pdfCariUnvan, cariler, minSkor?), stokEslestir(aciklama, stoklar)

**r2Upload.ts**
- r2Upload(dosya, onProgress?, kategori?) - Uploads personnel or label-background images to Cloudflare R2 via Worker (max 5MB; categories: `personel`, `etiket-zemin`)

**etiketBasim.ts**
- etiketKopruSaglikKontrolu(ayarlar) - Checks the configured local bridge, used by the Kumanda status indicator
- etiketDplKopruyeGonder(ayarlar, dpl) - Sends ready DPL to the bridge with USB-printer-name or TCP-IP target selection and timeout/error normalization
- etiketOtomatikYazdir(ayarlar, veri) - Honors `yazdirma_kosulu`, produces DPL through `dplUret` and returns `gonderiliyor|yaziciya_gonderildi|basarisiz|devre_disi` workflow results

**etiketAlanlari.ts / etiketOrnek.ts / dplEtiket.ts**
- Field metadata, stable sample label data, DPL primitives and coordinate/unit conversion shared by the visual editor, tests and production output
- `types/ayarlar.ts` deep-merges legacy JSONB settings, validates field bounds, auto-fits long `poz` text and generates final DPL; preview and print calculations must use the same helpers

**yikamaLoglari.ts**
- yikamaLogSayilariGetir(uretimEmriIds) - Fetches complete paginated wash logs keyed by `uretim_emri_detay_id`
- tarananAdetHesapla / camTarananSayisi / batchYikamaOzetiHesapla - Shared partial quantity and batch progress calculations

**supabasePagination.ts**
- tumSatirlariGetir(queryFactory, options?) - Reads all rows in safe pages instead of silently accepting Supabase's default result limit

**stokMigrasyon.ts**
- eskiStokReferanslariniMigrate() / pasifCitaReferanslariniMigrate() - Migrates stale/passive stock references to active combination cards
- detayStokReferansiGuncelle(detayId, alan, yeniStokId) - Manual single-row reference fix

**saatlikSayac.ts**
- glsSayacArttir() - Fire-and-forget increment of the active hourly slot via `saatlik_sayac_arttir` RPC

**saatlikVardiyaAuto.ts**
- bugununVardiyaSablonlariniUygula(tarih) - Auto-creates today's hourly slots from shift templates if empty

**telegramEdgeConfig.ts**
- telegramEdgeConfigSenkronize() / telegramEdgeConfigVarMi() - Syncs edge function URL/auth into `ayarlar` for the pg_cron job

**aksiyonPresets.ts**
- presetsOku() / presetleriYaz(presets) / yeniPresetId() - localStorage-backed action note presets (1–9 shortcuts)

## Integrations and Runtime Boundaries

### Production Label Flow

```text
Poz Giriş scan
  → Supabase database updates + yikama_loglari
  → `uretim-istasyonlar` / `yeni_cam` broadcast
  → Kumanda Paneli receives label data
  → `dplUret` creates DPL from current `etiket_ayarlari`
  → local `http://<kopru_adresi>:<kopru_port>/yazdir`
  → `yazici-kopru` sends binary DPL to Windows USB printer or TCP `<ip>:<port>`
  → Kumanda broadcasts `etiket_durumu`
```

The bridge success response means the data was handed to the printer/Windows spool path; it is not physical paper-sensor confirmation. Duplicate print requests are guarded in Kumanda with a scan-specific request key. Retrying is an explicit user action.

### Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Web app | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Web app | Browser Supabase key |
| `VITE_MISTRAL_API_KEY` | Development fallback | Direct OCR fallback; production should prefer the Edge Function secret path |
| `VITE_R2_UPLOAD_URL` | Web app | Cloudflare upload Worker endpoint |
| `VITE_R2_PUBLIC_BASE_URL` | Web app | Public R2 asset base URL |
| `VITE_R2_UPLOAD_SECRET` | Web app/Worker | Current upload header; because `VITE_*` is browser-visible, do not treat this as a strong server secret |

Never include actual values in prompts, commits, logs or this document. Vite variables are embedded at build time. Docker/Cloud Build passes them as build arguments, then nginx serves the static SPA from Cloud Run.

### External/Local Services

- **Supabase:** PostgreSQL, Realtime broadcast/postgres changes, Edge Functions, `pg_net`, `pg_cron`.
- **Mistral OCR:** primary PDF/image OCR is proxied by `mistral-ocr`; browser direct API is only a fallback path.
- **Telegram Bot API:** invoked by the scheduled Edge Function and manual test/report paths.
- **Cloudflare R2 + Worker:** public personnel and physical-label reference images.
- **yazici-kopru:** Node/EXE process on the Kumanda Windows PC, normally port `9876`; exposes health and `/yazdir` HTTP endpoints with CORS.
- **PerfectCut / Opti:** browser generates `.IMP`; spacer machine export is semicolon-delimited BOM CSV.

## Verification Commands

```bash
npm test          # Vitest: src/**/*.test.ts
npm run build     # TypeScript project build + Vite production build
npm run lint      # ESLint; report pre-existing failures separately
npm run dev       # Local Vite server (0.0.0.0)
```

High-risk areas with existing regression tests include label DPL/printing, order-detail cardinality, wash-log quantity calculations, IMP/FAM export, Supabase pagination, Telegram messages and Excel report export. Update the nearest test instead of validating only through the UI.

## Routing Structure

```
/                           Dashboard
/cari                       Cari Management
/stok                       Stock Management
/siparisler                 Order Management
/uretim                     Production Orders
/istasyonlar                Production Stations Hub
/saatlik-takip              Hourly Production Tracking (embedded)
/ayarlar                    Settings (Etiket, Araçlar, Personel, Hedef, Presets, Telegram, İstasyon)
/admin                      Admin Panel (settings + report history + permanent data management)
/istasyonlar/poz-giris      Barcode Entry Station (full screen)
/istasyonlar/kumanda        Çıta Control Panel (full screen)
/istasyonlar/gosterge       Display Screen / Macun Robot (full screen)
/istasyonlar/tamir          Repair/Scrap Station (full screen)
/istasyonlar/uretim-giris   Operator Daily Report Entry (full screen, opens in new tab)
/istasyonlar/uretim-panosu  Hourly Tracking TV Board (full screen)
*                           404 Not Found
```

## Key Features & Patterns

1. **Status Transitions**: Strict state machine with GECERLI_GECISLER validation (siparis, uretim_emri, tamir)
2. **Atomic ID Generation**: PostgreSQL function with UPSERT prevents race conditions
3. **Realtime Broadcasting**: Supabase broadcast channel (`uretim-istasyonlar`) synchronizes Poz Giriş / Kumanda / Gösterge stations; `postgres_changes` realtime for Tamir, Saatlik Takip, and repair-aware Sipariş list
4. **Cascade Operations**: Batch/order deletion and repair completion properly reset dependent statuses
5. **IMP/CSV Export**: PerfectCut-compatible IMP export and çıta-bending machine CSV export
6. **PDF Import**: Order data extraction from PIMAPEN/Ercom PDF documents via OCR (Mistral API, with pdf.js fallback)
7. **Customer Metadata**: "Alt Müşteri" (end customer) stored directly on `siparisler.alt_musteri`
8. **Turkish UI**: All text in Turkish, locale-specific formatting (Europe/Istanbul)
9. **Operator Login**: Login credentials (kullanici_adi, giris_sifresi) for factory floor terminals and daily report entry
10. **Telegram Reporting**: Automated daily production reports (hourly + operator entry) sent to Telegram via pg_cron → edge function, with duplicate-send prevention
11. **Repair Management**: Scrap/damage tracking with cascade updates to production/order status
12. **Shipping Planning**: Drag-and-drop vehicle assignment with calendar view
13. **System Settings**: JSONB-based key-value store for ERP-level configurations (labels, Opti export, admin visibility, Telegram edge config)
14. **Order Drafts**: In-progress "new order" forms auto-saved to localStorage and resumable (`useSiparisTaslaklari`)
15. **Label Printing**: Visual/precision DPL layout, calibration and custom-template modes; production print ownership is on Kumanda through the local Windows/Node bridge
16. **Hourly Production Board**: Shift templates → daily hourly targets vs actuals vs scrap, with NPT tracking and a dedicated TV display mode
17. **Line Quantity Model**: One `siparis_detaylari` row can represent multiple physical glasses through `adet`; per-copy wash progress is derived from logs keyed to the batch-detail row
18. **Operator Station Permissions**: Optional person-specific station whitelist is applied in both Operator UI and a PostgreSQL trigger
19. **Admin Data Management**: Destructive batch/order cleanup is isolated in the password-gated admin tab and must preserve dependent status recalculation

## Status Mappings

### Sipariş Durum
- beklemede → Bekleniyor
- batchte → Batch'te
- yikamada → Yıkamada
- tamamlandi → Tamamlandı
- eksik_var → Eksik Var
- iptal → İptal

### Siparis Detay Uretim Durumu
- bekliyor → Waiting
- kesildi → Cut
- yikandi → Washed
- etiketlendi → Labeled
- tamamlandi → Completed

### Uretim Emri Durum
- hazirlaniyor → Preparing
- export_edildi → Exported (to PerfectCut)
- yikamada → In Washing
- tamamlandi → Completed
- eksik_var → Incomplete/Missing
- iptal → Cancelled

### Tamir Durum
- bekliyor → Waiting
- tamamlandi → Completed
- hurda → Scrap

## Dependencies
- React 19.2.4, React Router 7.14.1
- Supabase JS 2.103.3
- TypeScript 6.0.2, Vite 8.0.4
- Tailwind CSS 4.2.2, Lucide React 1.8.0
- React Hook Form 7.72.1, Zod 4.3.6, @hookform/resolvers 5.2.2
- @tanstack/react-table 8.21.3 ve PapaParse 5.5.3 paketleri kurulu ancak mevcut kaynakta doğrudan kullanılmıyor
- PDF.js (pdfjs-dist) 5.6.205, ExcelJS 4.4.0
- Vitest 4.1.10, ESLint 9.39.4
