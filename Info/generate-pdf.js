const fs = require('fs');
const path = require('path');

// Simple markdown to HTML converter
function markdownToHtml(markdown) {
  let html = markdown
    // Headers
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    // Bold & Italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/```typescript\n([\s\S]*?)\n```/g, '<pre><code class="language-typescript">$1</code></pre>')
    .replace(/```\n([\s\S]*?)\n```/g, '<pre><code>$1</code></pre>')
    // Lists
    .replace(/^\- (.*?)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>')
    // Tables (basic)
    .replace(/\| (.*?) \|/g, '<td>$1</td>')
    // Links
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    // Emojis
    .replace(/✅/g, '✓')
    .replace(/✨/g, '*')
    .replace(/⚠️/g, '⚠')
    .replace(/❌/g, '✗');

  return `<p>${html}</p>`;
}

// PDF HTML template
const htmlTemplate = (content) => `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Teknolojik Altyapı ve State Yönetimi</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #fff;
      padding: 40px;
    }
    h1 {
      font-size: 2.5em;
      margin: 30px 0 15px 0;
      color: #1a202c;
      border-bottom: 3px solid #3182ce;
      padding-bottom: 10px;
    }
    h2 {
      font-size: 1.8em;
      margin: 25px 0 12px 0;
      color: #2d3748;
      border-left: 4px solid #3182ce;
      padding-left: 12px;
    }
    h3 {
      font-size: 1.3em;
      margin: 18px 0 10px 0;
      color: #4a5568;
    }
    p {
      margin: 10px 0;
      text-align: justify;
    }
    code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      color: #d63384;
    }
    pre {
      background: #2d3748;
      color: #e2e8f0;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      margin: 12px 0;
      font-size: 0.85em;
      line-height: 1.4;
    }
    pre code {
      background: none;
      color: inherit;
      padding: 0;
    }
    ul {
      margin: 15px 0 15px 25px;
      list-style: disc;
    }
    li {
      margin: 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 0.9em;
    }
    th {
      background: #edf2f7;
      padding: 12px;
      border: 1px solid #cbd5e0;
      text-align: left;
      font-weight: 600;
      color: #2d3748;
    }
    td {
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
    }
    tr:nth-child(even) {
      background: #f7fafc;
    }
    a {
      color: #3182ce;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .badge-success {
      display: inline-block;
      background: #c6f6d5;
      color: #22543d;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 0.85em;
      font-weight: 500;
    }
    .badge-warning {
      display: inline-block;
      background: #feebc8;
      color: #7c2d12;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 0.85em;
      font-weight: 500;
    }
    .badge-error {
      display: inline-block;
      background: #fed7d7;
      color: #742a2a;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 0.85em;
      font-weight: 500;
    }
    .section-divider {
      border-top: 2px solid #cbd5e0;
      margin: 40px 0;
      padding-top: 20px;
    }
    .diagram {
      background: #f7fafc;
      border-left: 4px solid #3182ce;
      padding: 15px;
      margin: 15px 0;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.85em;
      line-height: 1.4;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    strong {
      color: #2d3748;
      font-weight: 600;
    }
    em {
      font-style: italic;
      color: #4a5568;
    }
    .header-info {
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e2e8f0;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #cbd5e0;
      text-align: center;
      font-size: 0.85em;
      color: #718096;
    }
    .page-break {
      page-break-after: always;
    }
  </style>
</head>
<body>
  <div class="header-info">
    <h1>🚀 Cam Yönetim Üretim Paneli</h1>
    <h3>Teknolojik Altyapı & State Yönetimi Analizi</h3>
    <p><strong>Proje:</strong> OrtaklarV2 | <strong>Tarih:</strong> ${new Date().toLocaleDateString('tr-TR')} | <strong>Versiyon:</strong> 2.1</p>
    <p><strong>Güncellik notu:</strong> Bu rapor state yönetimi odağındadır. Yetki, güvenlik ve veritabanı için <code>OrtaklarV2_Architecture.md</code> ve <code>SECURITY_ROLLOUT.md</code> nihai kaynaktır.</p>
  </div>

  ${content}

  <div class="footer">
    <p>Bu dokümantasyon projenin mevcut teknoloji stack'i ve state yönetimi mimarisini detaylı olarak açıklamaktadır.</p>
    <p>© 2026 - OrtaklarV2 Project Documentation</p>
  </div>
</body>
</html>
`;

// Generate PDF from HTML using system command
async function generatePDF() {
  try {
    console.log('📄 PDF oluşturuluyor...');
    
    // Try using wkhtmltopdf if available
    const { execSync } = require('child_process');
    
    try {
      execSync('wkhtmltopdf --version', { stdio: 'ignore' });
      console.log('✓ wkhtmltopdf bulundu');
      
      // Read HTML file and create PDF
      const htmlPath = path.join(__dirname, 'temp.html');
      const pdfPath = path.join(__dirname, 'Cam_Yonetim_Teknoloji_Analiz.pdf');
      
      fs.writeFileSync(htmlPath, htmlTemplate(markdownToHtml(getDocs())));
      
      execSync(`wkhtmltopdf --quiet --enable-local-file-access "${htmlPath}" "${pdfPath}"`, { stdio: 'inherit' });
      
      fs.unlinkSync(htmlPath);
      
      console.log(`\n✅ PDF başarıyla oluşturuldu!\n📁 Konum: ${pdfPath}`);
      return;
    } catch (e) {
      // wkhtmltopdf not found, use alternative
      console.log('⚠ wkhtmltopdf bulunamadı, alternatif method kullanılıyor...');
    }
    
    // Fallback: Just create HTML version
    const htmlPath = path.join(__dirname, 'Cam_Yonetim_Teknoloji_Analiz.html');
    fs.writeFileSync(htmlPath, htmlTemplate(markdownToHtml(getDocs())));
    console.log(`\n✅ HTML başarıyla oluşturuldu!\n📁 Konum: ${htmlPath}`);
    console.log("💡 PDF'ye çevirmek için: wkhtmltopdf dosya.html dosya.pdf");
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
    process.exit(1);
  }
}

function getDocs() {
  return `
# Cam Yönetim Üretim Paneli - Teknolojik Altyapı & State Yönetimi Analizi

> **Doğrulama:** 23 Temmuz 2026 — migration aralığı 001–060. Ayrıntılı ve
> güncel mimari doğruluk kaynağı: \`Info/OrtaklarV2_Architecture.md\`.

## 1. Teknoloji Stack'i

### Frontend Framework
- **React 19.2.4** - Modern UI kütüphanesi, Server Components desteği
- **React Router 7.14.1** - SPA routing ve navigation

### State Management
- **React Hooks (useState, useEffect, useCallback, useRef)** - Local component state
- **Custom Hooks** - Business logic encapsulation
  - useStok(), useCari(), useSiparis(), useUretim(), useSevkiyat(), useAyarlar(), useKatmanYapilari(), useSiparisTaslaklari()
- **No Global State Management Tool** (Redux, Zustand, Jotai yok)

### Build & Tooling
- **Vite 8.0.4** - Lightning-fast bundler
- **TypeScript 6.0.2** - Type-safe development
- **Tailwind CSS 4.2.2** - Utility-first styling
- **ESLint 9.39.4** - Code quality

### Backend & Database
- **Supabase 2.103.3** - PostgreSQL + Real-time API
- **Direct Supabase Queries** - No ORM layer

### UI Components & Styling
- **Lucide React 1.8.0** - Icon library
- **Tailwind Merge 3.5.0** - CSS class merging utility
- **clsx 2.1.1** - Conditional className builder

### Forms & Validation
- **React Hook Form 7.72.1** - Performant form management
- **@hookform/resolvers 5.2.2** - Validation library integration
- **Zod 4.3.6** - Schema validation (TypeScript-first)

### Data Processing
- **PapaParse 5.5.3** - Kurulu; mevcut kaynakta doğrudan kullanılmıyor
- **pdfjs-dist 5.6.205** - PDF manipulation

## 2. State Yönetimi Mimarisi

### 2.1 Hiyerarşi

\`\`\`
App Layer
├── Component Local State (useState)
│   ├── Modal visibility states
│   ├── Form input values
│   ├── Loading/error states
│   └── UI interactions (drag-drop)
├── Custom Hooks
│   ├── Data fetching logic
│   ├── Supabase queries
│   ├── Business logic
│   └── Memoization
└── Supabase (External State)
    ├── PostgreSQL database
    ├── Real-time subscriptions
    └── Supabase Auth + DB RBAC/AAL2
\`\`\`

### 2.2 State Türleri

#### A. Ephemeral UI State
- Modal açık/kapalı durumları
- Form input değerleri  
- Drag-drop interactions
- Selection states

#### B. Derived State
- Computed calendar grid
- Filtered/mapped data
- Memoized collections

#### C. Data State
- Database records
- Fetched collections
- Server-side data

#### D. Reference State (useRef)
- Intervals ve timeouts
- DOM references
- Cleanup functions

## 3. Veri Akışı Patterns

### Pattern 1: Initial Fetch + Polling
- Component mount
- Parallel Supabase queries
- 30 second polling for updates
- Cleanup on unmount

### Pattern 2: Optimistic Updates
- User interaction (drag-drop)
- Immediate local state update
- Background Supabase sync
- Rollback on error (not implemented)

### Pattern 3: Custom Hooks Encapsulation
- Reusable data logic
- Automatic cleanup
- Hook composition
- Type-safe returns

## 4. Avantajlar & Dezavantajlar

### Avantajlar ✓
| Avantaj | Detay |
|---------|--------|
| Simplicity | No Redux boilerplate, learn React first |
| Performance | Granular control, only needed re-renders |
| Type Safety | TypeScript + Zod validation |
| Dev Experience | Fast refresh, small bundle |
| Custom Logic | Hooks pattern, reusable logic |

### Dezavantajlar ⚠
| Dezavantaj | Risk |
|-----------|------|
| Prop Drilling | Deep nesting → context passing |
| No Time-Travel Debugging | Redux DevTools yok |
| Manual Cache Management | Supabase queries repeat edilebilir |
| No Global Error Handling | Her component'te try-catch |
| Race Conditions | Manual cancellation token yönetimi |

## 5. Type System & Validation

### TypeScript Interfaces
Projedeki tüm data models TypeScript interfaces ile tanımlanmış:
- Siparis, SiparisDetay, CamFormSatiri
- Discriminated unions (SiparisDurum)
- Nullable relations (cari, stok)

### Validation Stack
- React Hook Form: Form state management
- Zod: Schema validation ve parsing
- Type inference: Automatic TS types from Zod schemas

## 6. Supabase Integration

### Direct Queries (No GraphQL/REST wrapper)
- Type-safe TypeScript client
- Real-time capable
- No request caching (manual management needed)
- No GraphQL complexity reduction

### Data Fetching Strategy
- Parallel Promise.all() for multiple queries
- .select() with relations
- .order() for sorting
- .eq(), .in(), .neq() for filtering

## 7. Performance Optimizations

### Current Implementations ✓
- useCallback for event handlers
- Memoized Maps (siparisMap, notMap)
- Conditional rendering
- Lazy queries on demand

### Missing Opportunities ⚠
- React.memo() for child components
- useMemo() for expensive computations
- Virtual scrolling for long lists
- Request debouncing
- Stale-while-revalidate pattern

## 8. Önerilen İyileştirmeler

### 1. Global State Management
Eğer prop drilling sorun olursa:
- Zustand (lightweight)
- Jotai (atomic)
- Context API + useReducer (built-in)

### 2. Request Caching
- React Query / TanStack Query
- SWR (Vercel)
- Apollo Client (if GraphQL)

### 3. Error Handling
- Error Boundary components
- Global error toast notifications
- Retry logic with exponential backoff

### 4. Accessibility
- Add ARIA labels
- Keyboard navigation support
- Screen reader testing
- Color contrast validation

## 9. Teknoloji Stack Özet Tablosu

| Kategori | Çözüm | Durum |
|----------|--------|-------|
| State | useState + custom hooks | ✓ Production-ready |
| Routing | React Router v7 | ✓ Modern |
| Styling | Tailwind CSS v4 | ✓ Up-to-date |
| Forms | React Hook Form + Zod | ✓ Robust |
| Backend | Supabase | ✓ Real-time capable |
| Types | TypeScript 6.0 | ✓ Type-safe |
| Build | Vite | ✓ Lightning-fast |
| Caching | Manual/None | ⚠ Improvement needed |
| Global State | None | ⚠ May need if scaling |
| Testing | Vitest + pgTAP | ✓ 20 Vitest dosyası / 183 test; DB testleri ayrı çalışır |

## 10. Mimari Karar Nedenleri

Bu mimari neden tercih edilmiş?

1. **Hız & Basitlik** - MVP'yi hızlı deliver etmek
2. **Team Size** - 1-2 dev için yeterli
3. **Feature Complexity** - Lineer state akışı
4. **TypeScript** - Type safety built-in
5. **Supabase** - Backend + Auth + Real-time one-stop

## 11. Dosya Yapısı

\`\`\`
src/
├── pages/                    # Route handlers
│   ├── Dashboard.tsx        # Main dashboard
│   ├── SiparisPage.tsx      # Orders page
│   ├── UretimPage.tsx       # Production page
│   └── ...
├── components/              # Reusable UI components
│   ├── layout/
│   ├── siparis/            # Order-specific components
│   ├── uretim/             # Production-specific
│   ├── ui/                 # Generic UI (buttons, modals)
│   └── ...
├── hooks/                  # Custom React hooks
│   ├── useSiparis.ts
│   ├── useUretim.ts
│   └── ...
├── types/                  # TypeScript interfaces
│   ├── siparis.ts
│   ├── uretim.ts
│   └── ...
├── lib/                    # Utilities & clients
│   ├── supabase.ts        # Supabase client config
│   └── utils.ts
├── App.tsx                # Route definitions
└── main.tsx              # React entry point
\`\`\`

## Sonuç

Proje, React hooks ve TypeScript kullanarak **scalable, type-safe, ve maintainable** bir mimari sunmaktadır. Global state management gerekmeden, custom hooks pattern ile clean separation of concerns sağlanmıştır. Gelecekte projenin büyümesi halinde, request caching ve error handling konularında iyileştirmeler yapılması önerilmektedir.
  `;
}

generatePDF();
