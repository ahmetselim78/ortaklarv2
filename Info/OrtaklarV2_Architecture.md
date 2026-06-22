# OrtaklarV2 - Glass Manufacturing Management System

## Project Overview
Turkish glass manufacturing management system with production line synchronization. Built with React, TypeScript, Vite, Supabase, and Tailwind CSS.

## Database Schema

### Tables and Key Columns

1. **cari** - Customers and Suppliers
   - id (UUID), kod (TEXT unique), ad, tipi ('musteri'|'tedarikci')
   - telefon, email, adres, notlar, created_at

2. **stok** - Product Catalog
   - id (UUID), kod (TEXT unique), ad, kategori ('cam'|'cita'|'yan_malzeme')
   - kalinlik_mm, renk, tip, birim, birim_fiyat
   - tedarikci_id (FK cari), marka, mevcut_miktar, created_at

3. **siparisler** - Orders
   - id (UUID), siparis_no (TEXT unique), cari_id (FK)
   - tarih, teslim_tarihi, durum ('beklemede'|'batchte'|'yikamada'|'tamamlandi'|'eksik_var'|'iptal')
   - notlar, created_at

4. **siparis_detaylari** - Order Line Items (individual glass pieces)
   - id (UUID), siparis_id (FK), stok_id (FK cam), cam_kodu (TEXT unique, format: GLS-XXXX)
   - genislik_mm, yukseklik_mm, adet, ara_bosluk_mm (spacing), kenar_islemi (edge processing)
   - cita_stok_id (FK for frame reference), uretim_durumu ('bekliyor'|'kesildi'|'yikandi'|'etiketlendi'|'tamamlandi')
   - notlar, created_at

5. **uretim_emirleri** - Production Batches
   - id (UUID), batch_no (TEXT unique, format: BATCH-YYYY-NNNN)
   - durum ('hazirlaniyor'|'onaylandi'|'export_edildi'|'yikamada'|'tamamlandi'|'eksik_var')
   - notlar, olusturulma_tarihi, export_tarihi

6. **uretim_emri_detaylari** - Batch Line Items
   - id (UUID), uretim_emri_id (FK), siparis_detay_id (FK)
   - sira_no (sequence number)
   - Unique constraint: (uretim_emri_id, siparis_detay_id)

7. **yikama_loglari** - Wash Station Logs
   - id (UUID), cam_kodu (TEXT), siparis_detay_id (FK)
   - giris_zamani, operatör

8. **sayaclar** - Atomic ID Generation
   - anahtar (TEXT primary key), deger (INTEGER)
   - Used for: cam_kodu, cari_kod, stok_kod, siparis_no_YYYY, batch_no_YYYY

9. **hr_personel** - Human Resources / Operator Management
   - id (UUID), ad_soyad (TEXT), foto_url (TEXT), rol ('Direkt'|'Endirekt')
   - is_aktif (BOOLEAN), kullanici_adi (TEXT), giris_sifresi (TEXT)
   - created_at (TIMESTAMPTZ)

10. **telegram_ayarlari** - Telegram Bot Configuration (singleton)
    - id (UUID), bot_token (TEXT), chat_id (TEXT), aktif (BOOLEAN)
    - olusturma (TIMESTAMPTZ)

11. **telegram_rapor_saatleri** - Scheduled Report Times
    - id (UUID), saat (TEXT, format: HH:MM), aktif (BOOLEAN)
    - olusturma (TIMESTAMPTZ)

12. **telegram_rapor_log** - Duplicate Send Prevention Log
    - id (UUID), tarih (DATE), saat (TEXT)
    - gonderildi_at (TIMESTAMPTZ)
    - Unique constraint: (tarih, saat)

13. **tamir_kayitlari** - Repair/Scrap Records
    - id (UUID), siparis_detay_id (FK), adet (INTEGER)
    - durum ('beklemede'|'tamir_alindi'|'tamamlandi'|'hurda')
    - tamamlanma_tarihi, tamamlanma_notu
    - created_at (TIMESTAMPTZ)

14. **araclar** - Vehicles for Shipping
    - id (UUID), plaka (TEXT unique), ad (TEXT), kapasite_m2 (NUMERIC)
    - aktif (BOOLEAN), created_at (TIMESTAMPTZ)

15. **sevkiyat_planlari** - Shipping Plans (Drag & Drop)
    - id (UUID), siparis_id (FK), arac_id (FK), tarih (DATE)
    - notlar (TEXT)
    - Unique constraint: (siparis_id, tarih)

16. **takvim_notlari** - Calendar Notes
    - id (UUID), tarih (DATE), notlar (TEXT), created_at (TIMESTAMPTZ)

17. **ayarlar** - System Settings (singleton key-value store)
    - anahtar (TEXT primary key), deger (JSONB)

18. **gunluk_uretim_takip** - Daily Production Tracking
    - id (UUID), tarih (DATE), saat_araligi (TEXT)
    - hedef_adet (INTEGER), gerceklesen_adet (INTEGER), fire_adet (INTEGER)
    - sira_no (INTEGER), created_at (TIMESTAMPTZ)

## Pages (src/pages/)

1. **Dashboard.tsx**
   - Shows KPIs: total orders, active orders, active batches, completed batches, customers, stock
   - Last 5 orders list
   - Status labels: beklemede, batchte, yikamada, tamamlandi, eksik_var, iptal

2. **UretimIstasyonlariPage.tsx**
   - Production station menu (3 stations with keyboard shortcuts 1-3)
   - Stations: Poz Giriş (Planning), Kumanda Paneli (Çıta/Frame), Gösterge Ekranı (Display)
   - Full-screen layouts without sidebar

3. **PozGirisPage.tsx** (Full-screen, no sidebar)
   - Position entry station for barcode scanning
   - Batch selection from export_edildi/yikamada/eksik_var batches
   - Tracks individual glass piece processing
   - Realtime Supabase channel for broadcast updates
   - Status colors: basarili (green), tekrar (yellow), yanlis_batch (red), tamamlandi (emerald)
   - Groups by customer and "nihai müşteri" (end customer from notes)

4. **KumandaPaneliPage.tsx** (Full-screen, no sidebar)
   - Control panel for frame station
   - 3-column layout: customers left, active cards middle, customer glass list right
   - Displays batch details: cam_kodu, musteri, boyut, çita (spacing)
   - Receives realtime broadcasts from PozGirisPage

5. **GostergeEkraniPage.tsx**
   - Display screen for macun robot
   - Shows only dimension information

6. **UretimPage.tsx**
   - Production orders management
   - Create new batches from selected orders
   - Status transitions with validation
   - Batch deletion with cascade handling
   - CSV export for PerfectCut

7. **SiparisPage.tsx**
   - Order management
   - Status filters: hepsi, beklemede, batchte, yikamada, tamamlandi, eksik_var, iptal
   - Pagination (20 per page)
   - New order form, PDF import modal
   - Order detail modal with edge processing info

8. **StokPage.tsx**
   - Stock/catalog management
   - 3 category tabs: Cam, Çıta, Yan Malzemeler
   - Edit/delete functionality

9. **CariPage.tsx**
   - Customer and supplier management
   - Shows counts: customers vs suppliers

10. **AyarlarPage.tsx**
    - Settings hub with tabs: Etiket, Araçlar, Katman, Personel, Hedef, Presets, Telegram
    - Aggregates all settings panels
    - Keyboard shortcuts and persistent state

11. **TamirIstasyonuPage.tsx** (Full-screen)
    - Repair station for scrap/damage management
    - Status tracking: beklemede → tamir_alindi → tamamlandi/hurda
    - Realtime updates via Supabase
    - Cascade updates when marking glass as scrap

12. **SevkiyatPlanlama.tsx** (Full-screen)
    - Shipping plan drag-and-drop interface
    - 3-panel: unassigned orders (left), vehicles (center), schedules (right)
    - Calendar view with date navigation
    - Order assignment to vehicles

13. **NotFoundPage.tsx**
    - 404 error page

## Components

### Layout (src/components/layout/)
- **AppLayout.tsx** - Main sidebar layout wrapper with Outlet
- **Sidebar.tsx** - Navigation menu (Dashboard, Cari, Stok, Siparişler, Üretim Emirleri, Üretim İstasyonları)

### Cari (src/components/cari/)
- **CariForm.tsx** - Create/edit customer/supplier
- **CariListesi.tsx** - Customer/supplier list table

### Siparis (src/components/siparis/)
- **SiparisForm.tsx** - Create/edit order with dynamic glass rows
- **SiparisListesi.tsx** - Order list table
- **SiparisDetayModal.tsx** - Order details with glass pieces
- **PDFImportModal.tsx** - PDF file import with parsing

### Stok (src/components/stok/)
- **StokForm.tsx** - Create/edit stock items
- **StokListesi.tsx** - Stock list table

### Uretim (src/components/uretim/)
- **UretimListesi.tsx** - Batch list table
- **UretimDetayModal.tsx** - Batch details with glass pieces
- **YeniBatchModal.tsx** - Create new batch from orders

### UI (src/components/ui/)
- **ConfirmDialog.tsx** - Reusable confirmation modal
- **Pagination.tsx** - Page navigation component

### Yikama (src/components/yikama/)
- Empty directory (placeholder for future wash station components)

### Ayarlar (src/components/ayarlar/)
- **AyarlarPage.tsx** - Settings hub (wrapper for all panels)
- **PersonelYonetimiPanel.tsx** - HR management, operator login credentials
- **TelegramAyarlariPanel.tsx** - Telegram bot token, chat ID, report times
- **EtiketAyarlariPanel.tsx** - Label template customization
- **AraclarPanel.tsx** - Vehicle management
- **KatmanYapilariPanel.tsx** - Glass layer structure presets
- **HedefVardiyaPanel.tsx** - Production targets by shift
- **AksiyonNotuPresetsPanel.tsx** - Action note templates

### Sevkiyat (src/components/sevkiyat/)
- **SevkiyatPlanlama.tsx** - Shipping plan interface (drag-and-drop)

## Types (src/types/)

```typescript
// cari.ts
type CariTipi = 'musteri' | 'tedarikci'
interface Cari { id, kod, ad, tipi, telefon, email, adres, notlar, created_at }

// siparis.ts
type SiparisDurum = 'beklemede'|'batchte'|'yikamada'|'tamamlandi'|'eksik_var'|'iptal'
type UretimDurumu = 'bekliyor'|'kesildi'|'yikandi'|'etiketlendi'|'tamamlandi'
interface Siparis { id, siparis_no, cari_id, tarih, teslim_tarihi, durum, notlar, created_at, cari? }
interface SiparisDetay { id, siparis_id, stok_id, cam_kodu, genislik_mm, yukseklik_mm, adet, ara_bosluk_mm, cita_stok_id, kenar_islemi, notlar, uretim_durumu, created_at, stok?, cita_stok? }

// stok.ts
type StokKategori = 'cam'|'cita'|'yan_malzeme'
interface Stok { id, kod, ad, kategori, kalinlik_mm, renk, tip, birim, birim_fiyat, tedarikci_id, marka, mevcut_miktar, created_at, tedarikci_ad? }

// uretim.ts
type UretimEmriDurum = 'hazirlaniyor'|'onaylandi'|'export_edildi'|'yikamada'|'tamamlandi'|'eksik_var'
interface UretimEmri { id, batch_no, durum, notlar, olusturulma_tarihi, export_tarihi }
interface UretimEmriDetay { id, uretim_emri_id, siparis_detay_id, sira_no, siparis_detaylari? }
```

## Services (src/services/)

**exportService.ts**
- `exportDetaylariCSV(detaylar, batchNo)` - Export batch to PerfectCut CSV format
- `exportTarihiGuncelle(uretimEmriId)` - Update batch status to exported with timestamp

Exports with columns: cam_kodu, siparis_no, musteri, genislik_mm, yukseklik_mm, adet, ara_bosluk_mm, cam_tipi, kenar_islemi, notlar

## Edge Functions (supabase/functions/)

**mistral-ocr/index.ts**
- Deno Edge Function for PDF OCR via Mistral API
- Handles both raw PDF and page-by-page processing
- Fallback mechanism if Edge Function unavailable

**check-and-send-report/index.ts**
- Triggered by pg_cron every minute (`* * * * *`)
- Fetches Telegram settings, scheduled times, production data
- Validates duplicate sends via unique (tarih, saat) constraint
- Sends formatted MarkdownV2 messages to Telegram
- Force mode for manual testing

## Hooks (src/hooks/)

**useCari()** 
- State: cariler[], yukleniyor, hata
- Methods: getir(), ekle(), guncelle(), sil(), yenile()

**useSiparis()**
- State: siparisler[], yukleniyor, hata
- Methods: ekle(form), guncelle(id, form), durumGuncelle(id, durum), sil(id), yenile()
- Valid status transitions defined in GECERLI_GECISLER
- Export function: getSiparisDetaylari(siparisId)

**useStok()**
- State: stoklar[], yukleniyor, hata
- Methods: getir(), ekle(), guncelle(), sil(), yenile()
- Maps tedarikci FK to tedarikci_ad display

**useUretim()**
- State: emirler[], yukleniyor, hata
- Methods: yeniBatch(siparisIds, notlar), durumGuncelle(id, durum), sil(id), yenile()
- Valid status transitions defined in GECERLI_GECISLER
- Handles cascade updates: siparis_detaylari uretim_durumu and siparisler durum

## Utilities (src/lib/)

**idGenerator.ts** - Atomic ID generation
- generateCamKodulari(adet) → GLS-XXXX format
- generateSiparisNo() → SIP-YYYY-NNNN
- generateCariKod() → C-XXXX
- generateStokKod() → S-XXXX
- generateBatchNo() → BATCH-YYYY-NNNN
- Uses PostgreSQL `sonraki_sayac()` function with UPSERT for atomic increments

**supabase.ts** - Supabase client initialization

**utils.ts**
- cn() - Tailwind class merging (clsx + tailwind-merge)
- formatDate(dateStr) - Format to Turkish locale (16.04.2026)

## Routing Structure

```
/                           Dashboard
/cari                       Cari Management
/stok                       Stock Management
/siparisler                 Order Management
/uretim                     Production Orders
/ayarlar                    Settings (Etiket, Araçlar, Katman, Personel, Hedef, Presets, Telegram)
/istasyonlar                Production Stations Menu
  /istasyonlar/poz-giris    Barcode Entry (full screen)
  /istasyonlar/kumanda      Control Panel (full screen)
  /istasyonlar/gosterge     Display Screen (full screen)
  /istasyonlar/tamir        Repair/Scrap Station (full screen)
  /istasyonlar/sevkiyat     Shipping Plan (full screen)
*                           404 Not Found
```

## Key Features & Patterns

1. **Status Transitions**: Strict state machine with GECERLI_GECISLER validation
2. **Atomic ID Generation**: PostgreSQL function with UPSERT prevents race conditions
3. **Realtime Broadcasting**: Supabase channels for station synchronization
4. **Cascade Operations**: Batch deletion properly resets order statuses
5. **CSV Export**: PerfectCut compatible format
6. **PDF Import**: Order data extraction from PDF documents with OCR (Mistral API)
7. **Customer Metadata**: "Nihai Müşteri" (end customer) extracted from siparis.notlar field
8. **Turkish UI**: All text in Turkish, locale-specific formatting
9. **Operator Login**: Optional login credentials (kullanici_adi, giris_sifresi) for factory floor terminals
10. **Telegram Reporting**: Automated daily production reports sent to Telegram via pg_cron scheduler
11. **Repair Management**: Scrap/damage tracking with cascade updates to production status
12. **Shipping Planning**: Drag-and-drop vehicle assignment with calendar view
13. **System Settings**: JSONB-based key-value store for ERP-level configurations

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
- onaylandi → Approved
- export_edildi → Exported (to PerfectCut)
- yikamada → In Washing
- tamamlandi → Completed
- eksik_var → Incomplete/Missing

## Dependencies
- React 19.2.4, React Router 7.14.1
- Supabase JS 2.103.3
- TypeScript 6.0.2, Vite 8.0.4
- Tailwind CSS 4.2.2, Lucide React 1.8.0
- React Hook Form 7.72.1, Zod 4.3.6
- PapaParse 5.5.3, PDF.js 5.6.205
