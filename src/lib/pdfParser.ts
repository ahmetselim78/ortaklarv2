import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from './supabase'

// Worker ayarı — ?url ile Vite'ın doğru şekilde resolve etmesi sağlanır
GlobalWorkerOptions.workerSrc = workerUrl

/* ===== Tipler ===== */

export interface PDFParseResult {
  format: 'pimapen' | 'bilinmeyen'
  header: PDFSiparisHeader | null
  satirlar: PDFCamSatir[]
  hamMetin: string // debug için
}

export interface PDFSiparisHeader {
  /** PDF'in en üstündeki şirket — bizim doğrudan müşterimiz (örn. NOVEL PVC) */
  tedarikciUnvan: string
  /** Tedarikçinin kendi müşterisi — nihai kullanıcı (örn. AKYOL LOUNGE) */
  cariKodu: string
  cariUnvan: string
  siparisNo: string
  sipTarihi: string | null
  sevkTarihi: string | null
  toplamAdet: number | null
  /** PDF'nin en altındaki toplam m² değeri (doğrulama için) */
  toplamMetrekare: number | null
}

export interface PDFCamSatir {
  aciklama: string
  adet: number
  genislik_mm: number
  yukseklik_mm: number
  ara_bosluk_mm: number | null
  /** "4+16+4" → 4 (dış cam kalınlığı) */
  dis_kalinlik_mm: number | null
  pozNo: string
  /** Yıldız işareti varsa → %20'den küçük cam (farklı fiyat) */
  kucuk_cam: boolean
  /** Ø işareti yanındaki sayı → menfez delik çapı (mm) */
  menfez_cap_mm: number | null
}

/** Progress callback tipi */
export type PDFProgressCallback = (msg: string) => void

/* ===== PDF → Metin ===== */

/**
 * PDF → metin. **Birincil yol: ham PDF'i doğrudan Mistral OCR API'ye gönder.**
 *
 * Neden pdf.js bypass?
 *   ERP kaynaklı bazı PDF'lerde pdf.js worker "Badly formatted number: minus sign
 *   in the middle" hatası verip sayfa sonundaki satırları (örn. Poz 44) canvas'a
 *   eksik çiziyor. Bu canvas'ı Mistral'e gönderince satır kaybı yaşanıyor.
 *   Mistral OCR API native PDF desteği veriyor → dosyayı olduğu gibi yollayalım.
 *
 * Fallback (yalnızca raw PDF başarısız olursa):
 *   1. Sayfa-sayfa canvas OCR (pdf.js + Mistral image OCR)
 *   2. pdf.js text extraction
 */
export async function pdfToText(file: File, onProgress?: PDFProgressCallback): Promise<string> {
  const buffer = await file.arrayBuffer()

  // 1) Raw PDF → Mistral OCR (BİRİNCİL YOL)
  try {
    onProgress?.('PDF Mistral OCR\'a gönderiliyor...')
    const text = await mistralOCR(buffer, onProgress)
    if (text && text.length > 100) {
      console.log('[PDF] ✓ Raw PDF OCR başarılı, fallback gerekmiyor')
      return text
    }
    console.warn('[PDF] Raw PDF OCR çok az metin döndürdü, fallback denenecek')
  } catch (e) {
    console.warn('[PDF] Raw PDF OCR başarısız, fallback denenecek:', e)
  }

  // 2) Sayfa-sayfa canvas OCR fallback
  try {
    onProgress?.('Sayfa-sayfa görüntü OCR fallback...')
    const text = await mistralOCRPageByPage(buffer.slice(0), onProgress)
    if (text && text.length > 100) {
      console.log('[PDF] ✓ Sayfa-sayfa OCR fallback başarılı')
      return text
    }
  } catch (e) {
    console.warn('[PDF] Sayfa-sayfa OCR de başarısız:', e)
  }

  // 3) pdf.js text extraction son çare
  onProgress?.('pdf.js text extraction son fallback...')
  const lines = await tryTextExtraction(buffer.slice(0))
  const text = lines.join('\n')
  console.log(`[PDF] pdf.js fallback: ${lines.length} satır, ${text.length} karakter`)
  return text
}

/** ArrayBuffer → base64 string */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/** Mistral OCR — Ham PDF'i doğrudan API'ye yollar (pdf.js BYPASS).
 *  Önce Supabase Edge Function dener, başarısız olursa doğrudan Mistral API'ye gider. */
async function mistralOCR(buffer: ArrayBuffer, onProgress?: PDFProgressCallback): Promise<string> {
  onProgress?.('Mistral OCR isteği gönderiliyor...')

  const base64 = arrayBufferToBase64(buffer)

  /** Per-page diagnostic — Mistral'in döndürdüğü her sayfada kaç cam-satır var */
  const logPagesDiagnostic = (pages: { index?: number; markdown: string }[]) => {
    const camRowRe = /\d{1,3}\s+\d{3,4}(?:[.,]\d{3})?\s+\d{3,4}(?:[.,]\d{3})?\s+\d[.,]\d{3}\s+\d[.,]\d{3}/
    let totalRows = 0
    pages.forEach((p, idx) => {
      const camRowCount = (p.markdown ?? '').split('\n').filter(l => {
        let s = l.trim()
        if (!s) return false
        if (s.startsWith('|')) s = s.replace(/^\||\|$/g, '').split('|').map(c => c.trim()).join(' ')
        return camRowRe.test(s)
      }).length
      totalRows += camRowCount
      console.log(
        `[Mistral OCR] Sayfa ${(p.index ?? idx) + 1}: ${(p.markdown ?? '').length} kar, ${camRowCount} cam-satır`,
      )
    })
    console.log(`[Mistral OCR] Toplam: ${pages.length} sayfa, ${totalRows} cam-satır`)
  }

  // 1) Supabase Edge Function dene
  const { data, error } = await supabase.functions.invoke('mistral-ocr', {
    body: { document_base64: base64 },
  })

  if (!error && data?.pages) {
    onProgress?.('Sonuçlar işleniyor...')
    const pages = data.pages as { index: number; markdown: string }[]
    logPagesDiagnostic(pages)
    return pages.map(p => p.markdown).join('\n')
  }

  // 2) Fallback: VITE_MISTRAL_API_KEY varsa doğrudan Mistral API'ye git
  const apiKey = import.meta.env.VITE_MISTRAL_API_KEY as string | undefined
  if (!apiKey) {
    throw new Error(
      `Mistral OCR hatası: ${error?.message ?? 'Bilinmeyen hata'}. Edge Function deploy edilmemiş ve VITE_MISTRAL_API_KEY tanımlı değil.`,
    )
  }

  console.warn('[Mistral OCR] Edge Function başarısız, doğrudan API kullanılıyor')
  onProgress?.('Mistral OCR (doğrudan API)...')

  const res = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${base64}`,
      },
    }),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(`Mistral OCR API hatası (${res.status}): ${JSON.stringify(errBody)}`)
  }

  const result = await res.json()
  onProgress?.('Sonuçlar işleniyor...')
  const pages = result.pages as { index: number; markdown: string }[]
  logPagesDiagnostic(pages)
  return pages.map(p => p.markdown).join('\n')
}

/**
 * Sayfa-sayfa görüntü OCR — pdfjs ile her sayfayı yüksek çözünürlüklü canvas'a render
 * eder, PNG'ye çevirir ve Mistral OCR'a tek tek gönderir.
 *
 * Sorun: Tek-belge OCR çok-sayfalı PDF'lerde her sayfanın SON satırlarını
 * (footer'a yakın olanları) düşürebiliyor. Sayfa-sayfa OCR'da her sayfa kendi
 * bağlamında işlenir; ama Mistral yine de canvas'ın alt kenarına yapışık satırları
 * bazen "footer" sanıp atlayabiliyor.
 *
 * Çözüm:
 *   - scale=3 ile yüksek çözünürlük (rakamlar net)
 *   - Canvas'a 8% bottom padding (beyaz boşluk) ekle → son tablo satırı ile
 *     görüntü kenarı arasında nefes alanı kalır, OCR son satırı atmaz
 *   - Edge Function (401) atlanıp doğrudan API'ye gidilir
 *   - Her sayfa için cam-satır sayısı log'lanır → satır kaybı anında görünür
 */
async function mistralOCRPageByPage(
  buffer: ArrayBuffer,
  onProgress?: PDFProgressCallback,
): Promise<string> {
  const apiKey = import.meta.env.VITE_MISTRAL_API_KEY as string | undefined
  if (!apiKey) {
    throw new Error(
      `Sayfa-sayfa OCR yapılamıyor: VITE_MISTRAL_API_KEY tanımlı değil. ` +
      `.env.local dosyasına ekleyin.`,
    )
  }

  const doc = await getDocument({
    data: buffer,
    cMapUrl: '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/standard_fonts/',
  }).promise

  const pageTexts: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.(`Sayfa ${i}/${doc.numPages} OCR ediliyor...`)

    const page = await doc.getPage(i)
    // scale 3 → daha net rakamlar (pozNo, ölçüler güvenilir okunur)
    const viewport = page.getViewport({ scale: 3 })

    // Padding: alt kenarda %10, sağ/sol/üst %3 — Mistral son satırı footer
    // sanıp atmasın diye alt kenarda fazladan beyaz alan bırakıyoruz.
    const padX = Math.ceil(viewport.width * 0.03)
    const padTop = Math.ceil(viewport.height * 0.03)
    const padBottom = Math.ceil(viewport.height * 0.10)

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width) + padX * 2
    canvas.height = Math.ceil(viewport.height) + padTop + padBottom
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context oluşturulamadı')

    // Beyaz arka plan
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // Padding ile içeri çiz
    ctx.translate(padX, padTop)

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    } as Parameters<typeof page.render>[0]).promise

    const dataUrl = canvas.toDataURL('image/png')

    // Doğrudan Mistral API (Edge Function atlanıyor)
    const res = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'image_url',
          image_url: dataUrl,
        },
      }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(`Mistral OCR sayfa ${i} hatası (${res.status}): ${JSON.stringify(errBody)}`)
    }
    const result = await res.json()
    const pages = result.pages as { markdown: string }[]
    const pageMarkdown = pages.map(p => p.markdown).join('\n')

    // Diagnostic: bu sayfada kaç cam-satır geldi?
    // Hem düz metin hem markdown tablo satırlarını sayar.
    const camSatirCount = pageMarkdown.split('\n').filter(l => {
      let s = l.trim()
      if (!s) return false
      // Markdown tablo satırını düzleştir
      if (s.startsWith('|')) s = s.replace(/^\||\|$/g, '').split('|').map(c => c.trim()).join(' ')
      // Cam-satır pattern: <adet> <gen> <yük> <Bm²> <Tm²>
      return /\d{1,3}\s+\d{3,4}(?:[.,]\d{3})?\s+\d{3,4}(?:[.,]\d{3})?\s+\d[.,]\d{3}\s+\d[.,]\d{3}/.test(s)
    }).length
    console.log(
      `[Mistral OCR] Sayfa ${i}/${doc.numPages}: ${pageMarkdown.length} kar, ${camSatirCount} cam-satır`,
    )

    pageTexts.push(pageMarkdown)

    // Canvas'ı temizle — bellek birikmesin
    canvas.width = 0
    canvas.height = 0
  }

  onProgress?.('Sayfa OCR sonuçları birleştiriliyor...')
  const fullText = pageTexts.join('\n\n')
  console.log('[Mistral OCR] Sayfa-sayfa toplam karakter:', fullText.length)
  return fullText
}

/** pdfjs-dist text extraction denemesi */
async function tryTextExtraction(buffer: ArrayBuffer): Promise<string[]> {
  const doc = await getDocument({
    data: buffer,
    cMapUrl: '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/standard_fonts/',
  }).promise
  const allLines: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const items = content.items as any[]

    const rows: { y: number; items: { x: number; str: string }[] }[] = []
    for (const item of items) {
      if (typeof item.str !== 'string' || !item.str.trim() || !item.transform) continue
      const y = Math.round(item.transform[5])
      const x = Math.round(item.transform[4])
      let row = rows.find(r => Math.abs(r.y - y) <= 3)
      if (!row) { row = { y, items: [] }; rows.push(row) }
      row.items.push({ x, str: item.str })
    }

    rows.sort((a, b) => b.y - a.y)
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x)
      allLines.push(row.items.map(it => it.str).join(' '))
    }
  }

  return allLines
}

/* ===== Format Algılama ===== */

/** dd.mm.yyyy formatındaki tarihi doğrular */
function isValidDate(s: string | null): boolean {
  if (!s) return false
  const parts = s.split('.')
  if (parts.length !== 3) return false
  const [d, m, y] = parts.map(Number)
  if (isNaN(d) || isNaN(m) || isNaN(y)) return false
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

function isPimapenFormat(text: string): boolean {
  const checks = [
    /cari\s*kodu/i,
    /sipari.?\s*no/i,
    /cam\s*s\s*no/i,
    /pimapen|ercom|firatpen/i,
    /\d+[+\-]\d+[+\-]\d+|\d{441644}|441\d{3}/,  // "4+16+4" veya OCR varyantı
    /cam\s*.*sipari/i,
    /cari\s*.?nvan/i,
    /poz\s*no/i,
    /[Çç]ift\s*Cam/,       // OCR'de en güvenilir: "Çift Cam"
    // Encoding-bağımsız: cam-satır numeric pattern (en az 3 satır)
    /\d{1,3}\s+\d{3,4}(?:[.,]\d{3})?\s+\d{3,4}(?:[.,]\d{3})?\s+\d[.,]\d{3}\s+\d[.,]\d{3}/,
  ]
  let hits = 0
  for (const r of checks) {
    if (r.test(text)) hits++
  }
  return hits >= 2
}

/* ===== Türkçe Sayı → number ===== */

/** "1.081" (binlik noktalı) → 1081 */
function parseTrInt(s: string): number {
  const cleaned = s.replace(/\./g, '').replace(',', '.').trim()
  return Math.round(parseFloat(cleaned))
}

/** "31,248" veya "1,243" (Türkçe ondalık) → 31.248 */
function parseTrFloat(s: string): number {
  const trimmed = s.trim()
  // "1.234,56" → 1234.56 (binlik nokta, ondalık virgül)
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(trimmed)) {
    return parseFloat(trimmed.replace(/\./g, '').replace(',', '.'))
  }
  // "31,248" → 31.248 (ondalık virgül)
  return parseFloat(trimmed.replace(',', '.'))
}

/**
 * PDF metnindeki "toplam satırı" satırlarından toplam metrekareyi çıkarır.
 * Pimapen/Ercom formatında footer: "66  26,716 m²." veya "74  27,319 m²."
 *
 * NOT: pdfjs-dist superscript ² glifini ana satırdan farklı y koordinatında
 * çıkarabilir. Bu durumda satır "27,319  m ." şeklinde görünür (² ayrı satır).
 * Bu nedenle m²/m2/m sonrası karakterler opsiyonel tutulur.
 */
function extractToplamMetrekare(text: string): number | null {
  const candidates: number[] = []
  for (let rawLine of text.split('\n')) {
    let trimmed = rawLine.trim()
    if (!trimmed) continue

    // Markdown tablo satırlarını düzleştir: "| a | b |" → "a b"
    if (trimmed.startsWith('|')) {
      trimmed = trimmed.replace(/^\||\|$/g, '').split('|').map((s) => s.trim()).join(' ').trim()
    }

    // Toplam/ara-toplam satırı tespiti:
    // Satır "m²." veya "m2." veya "m ." (² ayrı satırda) ile bitiyor olmalı.
    // \u00b2 = ², \s* opsiyonel boşluk (² ile . arasında), \.? opsiyonel nokta
    if (!/m[\u00b222]?\s*\.?\s*$/i.test(trimmed)) continue

    // Sadece ondalık (virgüllü) sayıları al — tam sayılar (adet) değil
    const matches = [...trimmed.matchAll(/(\d+[,]\d+)/g)]
    for (const m of matches) {
      const val = parseTrFloat(m[1])
      if (!isNaN(val) && val > 0) candidates.push(val)
    }
  }
  if (candidates.length === 0) return null
  // En büyük değer genel toplam (her satır toplamından büyük ya da eşit)
  return Math.max(...candidates)
}

/* ===== Ara Boşluk Çıkarma ===== */

/** "4+16+4 Çift Cam Konfor" → 16 */
export function extractAraBosluk(aciklama: string): number | null {
  const match = aciklama.match(/(\d+)\+(\d+)\+(\d+)/)
  if (!match) return null
  return parseInt(match[2], 10)
}

/* ===== PIMAPEN Parser ===== */

function parsePimapenHeader(text: string): PDFSiparisHeader {
  // cariKodu: OCR bazen "Cari Kodu — : C4-00975" şeklinde okur (— em dash)
  const cariKoduMatch = text.match(/Cari\s*Kodu\s*[—\-:]+\s*:?\s*([A-Z][\w\-]+)/i)
  const cariUnvanMatch = text.match(/Cari\s*.?nvan.?\s*:?\s*(.+)/i)
  const siparisNoMatch = text.match(/Sipari.?\s*No\s*[:\s]+([A-Z0-9]+)/i)
  const adetMatch = text.match(/Adet\s*:?\s*(\d+)/i)
  const tarihMatch = text.match(/Sip\s*\/\s*Sevk\s*:?\s*([\d.]+)\s*\/\s*([\d.]+)/i)

  let cariUnvan = cariUnvanMatch?.[1]?.trim() ?? ''
  cariUnvan = cariUnvan.replace(/\s{2,}.*/, '').replace(/Cam\s*S.*/i, '').replace(/Sipari.*/i, '').trim()

  // Tedarikçi ünvanı: PDF'in en üstündeki şirket adı — bizim doğrudan müşterimiz.
  // Strateji:
  //   1) LTD.ŞTİ/A.Ş. gibi yasal suffix içeren satırlara bak (en güvenilir)
  //   2) Bulamazsa: ilk 10 satırda, veri etiketleri hariç, tamamen büyük harfli ve
  //      en az 3 kelimeli satırı al ("YKS PVC PLASTİK DOĞRAMA" gibi)
  const lines = text.split(/\n/).slice(0, 15)
  const skipPattern = /^\s*(?:Cari|Tel|Fax|Sipari|Cam\s*S|Müşteri|Sip\s*\/|Adres|\d)/i

  let tedarikciLine = lines.find(
    (line) =>
      /(?:LTD\.?\s*ŞTİ\.?|A\.\u015e\.?|LİMİTED|ANONİM)/i.test(line) &&
      !skipPattern.test(line.trim()),
  )

  if (!tedarikciLine) {
    // Fallback: büyük harfli, kısa, etiket olmayan satır
    tedarikciLine = lines.find((line) => {
      const t = line.trim()
      if (!t || skipPattern.test(t)) return false
      // En az 3 karakter, çoğunluğu büyük harf veya rakam/boşluk olan satır
      const upperRatio = (t.match(/[A-ZİÜÖÇŞĞ]/g)?.length ?? 0) / t.replace(/\s/g, '').length
      return upperRatio >= 0.6 && t.length >= 5 && t.length <= 80
    })
  }

  const tedarikciUnvan = (tedarikciLine ?? '')
    // Logo marka etiketini sil ("PIMAPEN", "Ercom Smart" vb.)
    .replace(/\s*(?:pimapen|ercom\s*smart)[^\n]*/gi, '')
    // Sayfa numarası / sonuç bilgisi sil
    .replace(/\s{2,}.*/, '')
    .trim()

  return {
    tedarikciUnvan,
    cariKodu: cariKoduMatch?.[1] ?? '',
    cariUnvan,
    siparisNo: siparisNoMatch?.[1] ?? '',
    sipTarihi: isValidDate(tarihMatch?.[1] ?? null) ? tarihMatch![1] : null,
    sevkTarihi: isValidDate(tarihMatch?.[2] ?? null) ? tarihMatch![2] : null,
    toplamAdet: adetMatch ? parseInt(adetMatch[1], 10) : null,
    toplamMetrekare: extractToplamMetrekare(text),
  }
}

/**
 * OCR metninden ara boşluk değerini tespit et.
 * "4+16+4" → 16  |  OCR bozulmuş "441644" → 4+16+4 → 16
 */
function detectAraBosluk(text: string): number {
  // Standart format
  const m = text.match(/(\d+)\+(\d+)\+(\d+)/)
  if (m) return parseInt(m[2], 10)

  // OCR bozulmuş: "441644" gibi (+ işareti yanındaki rakam olarak okunmuş)
  // "4+16+4" → "441644": ilk 2 ve son 2 karakter dış cam, kalan orta = boşluk
  for (const line of text.split('\n')) {
    const m2 = line.trim().match(/^(\d{5,8})\s+[Çç]ift\s+Cam/i)
    if (!m2) continue
    const s = m2[1]
    const mid = s.slice(2, s.length - 2)
    const val = parseInt(mid, 10)
    if (!isNaN(val) && val >= 4 && val <= 32) return val
  }
  return 16
}

/** Açıklama stringinden ara boşluk çıkar (normal + OCR varyantı) */
function extractAraBoslukFromDesc(aciklama: string): number | null {
  // Standart: "4+16+4"
  const m = aciklama.match(/(\d+)\+(\d+)\+(\d+)/)
  if (m) return parseInt(m[2], 10)
  // OCR bozulmuş: "441644"
  const m2 = aciklama.match(/\b(\d{5,8})\b/)
  if (m2) {
    const s = m2[1]
    const mid = s.slice(2, s.length - 2)
    const val = parseInt(mid, 10)
    if (!isNaN(val) && val >= 4 && val <= 32) return val
  }
  return null
}

/** Açıklama stringinden dış cam kalınlığını çıkar.
 *  "4+16+4 Çift Cam" → 4 ; "6+22+6 Sinerji" → 6 ; OCR "441644" → 4 ; "622266" → 6 */
function extractDisKalinlikFromDesc(aciklama: string): number | null {
  const m = aciklama.match(/(\d+)\+\d+\+(\d+)/)
  if (m) {
    const a = parseInt(m[1], 10)
    const b = parseInt(m[2], 10)
    if (a >= 3 && a <= 12 && a === b) return a
    return a
  }
  const m2 = aciklama.match(/\b(\d{5,8})\b/)
  if (m2) {
    const s = m2[1]
    const first = parseInt(s.slice(0, 2), 10)
    const last = parseInt(s.slice(-2), 10)
    // "441644" → first=44 → 4 ; "612246" → first=61 → 6
    const v = first >= 30 ? Math.floor(first / 10) : first
    if (v >= 3 && v <= 12) return v
    if (last >= 30) {
      const lv = Math.floor(last / 10)
      if (lv >= 3 && lv <= 12) return lv
    }
  }
  return null
}

/**
 * PIMAPEN satır parser — hem düz metin hem Mistral markdown tablosu destekler.
 *
 * Strateji (sırayla denenir):
 *   1) Türkçe metin sağlamsa: "...Çift Cam... <adet> <gen> <yük> <Bm²> <Tm²> <pozNo>" regex'i
 *   2) "Çift Cam" yoksa/bozuksa: SAF NUMERIC TAIL regex — satır sonunda
 *      "<adet 1-3hane> <gen 3-4hane> <yük 3-4hane> <Bm² 0,xxx> <Tm² 0,xxx> <pozNo>"
 *      pattern'i varsa kabul et. pdfjs encoding bozuksa bile çalışır.
 *
 * Mistral OCR çıktısı iki formatta gelebilir:
 *   1) Markdown tablo: "| 4+16+4 Çift Cam Konfor | 2 | 612 | 2.031 | 1,243 | 2,486 | 1 |"
 *   2) Düz metin:      "4+16+4 Çift Cam Konfor 2 612 2.031 1,243 2,486 1"
 */
function parsePimapenSatirlar(text: string): PDFCamSatir[] {
  const satirlar: PDFCamSatir[] = []
  const lines = text.split('\n')
  const araBoslukDefault = detectAraBosluk(text)

  // Birincil regex: "Çift Cam" gerektirir, açıklamayı düzgün yakalar.
  // pozNo "19 - K5", "4-A2", "12/B" gibi boşluk/tire içerebilir → satır sonuna
  // kadar her şeyi al (.*) ama sadece anlamlı karakterler içersin.
  const primaryRe =
    /^(.+?[Çç]ift\s*Cam(?:\s+[A-Za-zÇĞİÖŞÜçğıöşü]+){0,3}?)\s*(\*+)?\s*(?:Ø\s*(\d+))?\s+(\d{1,3})\s+(\d{1,3}(?:[.,]\d{3})?|\d{3,4})\s+(\d{1,3}(?:[.,]\d{3})?|\d{3,4})\s+(\d{1,3}(?:[.,]\d{3,})?)\s+(\d{1,3}(?:[.,]\d{3,})?)\s*(.*?)\s*$/

  // İkincil regex: SAF NUMERIC TAIL — sadece sondaki sayı yapısı eşleşir.
  // Encoding bozulsa da, "4+16+4 Çift Cam"in bozuk hali olsa da çalışır.
  // Yapı: <açıklama> <adet 1-3 hane> <gen 3-4 hane> <yük 3-4 hane> <Bm²> <Tm²> [<poz>]
  const numericTailRe =
    /^(.*?)\s*(\*+)?\s*(?:Ø\s*(\d+))?\s+(\d{1,3})\s+(\d{1,3}(?:[.,]\d{3})?|\d{3,4})\s+(\d{1,3}(?:[.,]\d{3})?|\d{3,4})\s+(\d{1,3}[.,]\d{3,})\s+(\d{1,3}[.,]\d{3,})\s*(.*?)\s*$/

  // Diagnostic istatistik
  let camIceren = 0
  let primaryHit = 0
  let numericFallback = 0
  let toplamSkip = 0
  const reddedilen: string[] = []

  for (const line of lines) {
    let trimmed = line.trim()
    if (!trimmed) continue

    // Markdown tablo header/separator satırlarını atla
    if (/^\|[\s\-|:]+\|$/.test(trimmed)) continue

    // === STRATEJİ 0: Kolon-bazlı markdown tablo parser (en sağlam) ===
    // "| Açıklama | Adet | Gen | Yük | B m² | T m² | Poz No |" formatında 7 kolon.
    // Bazen poz dahil 6 kolon, bazen ek olarak Ø/menfez kolonları gelebilir.
    // Kolon konumları sabit olduğu için regex'e değil, hücre konumuna güveniriz.
    if (trimmed.startsWith('|')) {
      const cells = trimmed
        .replace(/^\||\|$/g, '')
        .split('|')
        .map(s => s.trim())

      // En az 6 hücre olmalı: açıklama, adet, gen, yük, bm², tm² (poz opsiyonel)
      if (cells.length >= 6) {
        // Header satırını atla: "Açıklama" / "Adet" / "Poz No" gibi kelimeler içeriyor
        const isHeaderRow = cells.some(c => /^(a[çc]?[ıi]klama|adet|gen|y[üu]k|poz\s*no)$/i.test(c))
        if (isHeaderRow) continue

        // Toplam satırı: "| 4+16+4 Çift Cam | 217 | | | 172,623 | m². |" gibi
        // → 5+ hücre var ama gen/yük/Bm² boş veya m² içeriyor.
        const hasM2Cell = cells.some(c => /^m[²2]\.?$/i.test(c) || /\d[,.]\d+\s*m[²2]/i.test(c))
        const emptyCells = cells.filter(c => c === '').length

        // Hücre konumlarını tespit et:
        //   Sondan: pozNo (opsiyonel, son), Tm², Bm², yük, gen, adet, açıklama
        // Önce, sayısal kolon yapısını belirleyen "ondalık ile bitenleri" bul.
        // Bm² ve Tm² Türkçe ondalıklı ("0,886"), gen/yük binlik noktalı veya tam sayı.
        const hasOndalik = (s: string) => /^\d+[,.]\d{2,}$/.test(s) || /^\d+,\d+$/.test(s)

        // Sondan başlayarak boş ve sayısal-olmayan hücreleri elle: pozNo'yu bul.
        // pozNo: tam sayı VEYA "19 - K5", "4-A", "B5/12" gibi alfanümerik.
        let pozIdx = cells.length - 1
        // Eğer son hücre boş veya "m²" ise → toplam satırıdır, atla
        if (cells[pozIdx] === '' || /^m[²2]\.?$/i.test(cells[pozIdx])) {
          if (hasM2Cell) continue
        }

        // Sondan 6 hücreyi bekle: [açıklama-prefix..., adet, gen, yük, bm², tm², pozNo?]
        // Önce pozNo'nun olup olmadığını test et: son hücre Tm² formatında mı?
        let tm2Idx: number
        let bm2Idx: number
        let yukIdx: number
        let genIdx: number
        let adetIdx: number
        let pozValue = ''

        if (hasOndalik(cells[pozIdx])) {
          // Son hücre Tm² → pozNo yok
          tm2Idx = pozIdx
          pozValue = ''
        } else {
          // Son hücre pozNo
          pozValue = cells[pozIdx]
          tm2Idx = pozIdx - 1
        }
        bm2Idx = tm2Idx - 1
        yukIdx = bm2Idx - 1
        genIdx = yukIdx - 1
        adetIdx = genIdx - 1

        if (adetIdx < 0) continue

        const adetStr = cells[adetIdx]
        const genStr = cells[genIdx]
        const yukStr = cells[yukIdx]
        const bm2Str = cells[bm2Idx]
        const tm2Str = cells[tm2Idx]

        // Hücre validasyonu: tüm kritik kolonlar dolu olmalı
        if (!adetStr || !genStr || !yukStr || !bm2Str || !tm2Str) {
          // Toplam satırı olabilir → m² varsa atla, yoksa diğer stratejilere bırak
          if (hasM2Cell || emptyCells >= 2) continue
        } else if (
          /^\d{1,3}$/.test(adetStr) &&
          /^\d{1,4}([.,]\d{3})?$/.test(genStr) &&
          /^\d{1,4}([.,]\d{3})?$/.test(yukStr) &&
          /^\d+[,.]\d+$/.test(bm2Str) &&
          /^\d+[,.]\d+$/.test(tm2Str)
        ) {
          // Açıklama: 0..adetIdx arası hücreler (bazen prefix'te * veya Ø olabilir)
          const aciklamaCells = cells.slice(0, adetIdx).filter(c => c !== '')
          let aciklamaRaw = aciklamaCells.join(' ').trim()

          // * (yıldız) işareti → küçük cam
          const kucukCam = /\*+/.test(aciklamaRaw)
          aciklamaRaw = aciklamaRaw.replace(/\s*\*+\s*/g, ' ').trim()

          // Ø menfez
          const menfezMatch = aciklamaRaw.match(/Ø\s*(\d+)/)
          const menfezCap = menfezMatch ? parseInt(menfezMatch[1], 10) : null
          if (menfezMatch) aciklamaRaw = aciklamaRaw.replace(/Ø\s*\d+/, '').trim()

          if (!aciklamaRaw) aciklamaRaw = '4+16+4 Çift Cam'

          const adet = parseInt(adetStr, 10)
          const gen = parseTrInt(genStr)
          const yuk = parseTrInt(yukStr)
          const bm2 = parseTrFloat(bm2Str)

          if (adet > 0 && gen >= 50 && yuk >= 50 && bm2 > 0) {
            const araBosluk = extractAraBoslukFromDesc(aciklamaRaw) ?? araBoslukDefault
            const disKalinlik = extractDisKalinlikFromDesc(aciklamaRaw)

            if (/[Çç]ift\s*Cam/i.test(aciklamaRaw)) camIceren++
            primaryHit++

            satirlar.push({
              aciklama: aciklamaRaw,
              adet,
              genislik_mm: gen,
              yukseklik_mm: yuk,
              ara_bosluk_mm: araBosluk,
              dis_kalinlik_mm: disKalinlik,
              pozNo: pozValue,
              kucuk_cam: kucukCam,
              menfez_cap_mm: menfezCap,
            })
            continue
          }
        }
      }

      // Markdown tablo satırı kolon parser ile yakalanamadı → düz metne çevir,
      // diğer regex stratejilerine düşsün
      trimmed = trimmed.replace(/^\||\|$/g, '').split('|').map(s => s.trim()).join(' ')
    }

    const hasCiftCam = /[Çç]ift\s*Cam/i.test(trimmed)
    if (hasCiftCam) camIceren++

    // Toplam/ara-toplam satırını atla:
    //   "... 217  172,623 m²."   (yalnızca adet + m² var, gen/yük yok)
    //   "... 5  0,411 m². % 20 den küçük camlar."
    // Tespit: m² işareti var VE 5+ sayı (adet/gen/yük/bm²/tm²) yok
    const hasM2 = /\d[,.]\d+\s*m[²2]\.?/i.test(trimmed)
    if (hasM2) {
      const numCount = (trimmed.match(/\b\d/g) ?? []).length
      const hasFullRow = /\d{1,3}\s+\d{3,4}(?:[.,]\d{3})?\s+\d{3,4}(?:[.,]\d{3})?\s+\d[,.]\d{3}/.test(trimmed)
      if (!hasFullRow) {
        // Toplam satırı — atla, log'a yazma
        continue
      }
      if (numCount < 5) continue
    }

    // 1) Birincil regex (Çift Cam ile)
    let m = primaryRe.exec(trimmed)
    let isFallback = false

    // 2) Numeric tail fallback (Çift Cam zorunlu değil)
    if (!m) {
      m = numericTailRe.exec(trimmed)
      if (m) {
        // "Açıklama" tarafında en az 1 alfa karakter olsun (boş prefix'leri ele)
        // ve toplam satırı maskelenmesin (yukarıda ayrıldı zaten)
        const prefix = m[1].trim()
        if (prefix.length === 0) continue
        // Ay/yıl formatlı tarih satırlarını ele (örn: "27.02.2026 - : 3.07")
        if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(prefix)) continue
        isFallback = true
      }
    }

    if (!m) {
      // Yalnız belirgin "veri-benzeri" satırları reddedildi olarak logla
      if (/\d{3,4}\s+\d{3,4}/.test(trimmed) || hasCiftCam) {
        toplamSkip++
        if (reddedilen.length < 20) reddedilen.push(trimmed)
      }
      continue
    }

    const aciklamaRaw   = m[1].trim()
    const kucuk_cam     = !!m[2]
    const menfez_cap_mm = m[3] ? parseInt(m[3], 10) : null
    const adet          = parseInt(m[4], 10)
    const gen           = parseTrInt(m[5])
    const yukRaw        = m[6]
    const bm2           = parseTrFloat(m[7])
    const pozNo         = (m[9] ?? '').trim()

    if (isNaN(gen) || gen <= 0 || adet <= 0 || isNaN(bm2) || bm2 <= 0) {
      toplamSkip++
      if (reddedilen.length < 20) reddedilen.push(`[değer hatası] ${trimmed}`)
      continue
    }

    // Mantık kontrolü: gen ve yük mm cinsinden makul aralıkta olmalı (50-9999)
    let yuk = parseTrInt(yukRaw)
    if (isNaN(yuk) || yuk < 10 || yuk > 9999) {
      yuk = Math.round((bm2 * 1_000_000) / gen)
    }
    if (yuk <= 0 || gen < 50 || yuk < 50) {
      toplamSkip++
      continue
    }

    // Açıklama: fallback'te boş/bozuk olabilir → temizle ve normalize et
    let aciklama = aciklamaRaw
    if (isFallback) {
      // Boş veya çok kısa açıklama → varsayılan ata
      if (!aciklama || aciklama.length < 3 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(aciklama)) {
        aciklama = '4+16+4 Çift Cam'
      }
      numericFallback++
    } else {
      primaryHit++
    }

    const araBosluk = extractAraBoslukFromDesc(aciklama) ?? araBoslukDefault
    const disKalinlik = extractDisKalinlikFromDesc(aciklama)

    satirlar.push({
      aciklama,
      adet,
      genislik_mm: gen,
      yukseklik_mm: yuk,
      ara_bosluk_mm: araBosluk,
      dis_kalinlik_mm: disKalinlik,
      pozNo,
      kucuk_cam,
      menfez_cap_mm,
    })
  }

  console.log(
    `[PDF Parse] "Çift Cam" satır=${camIceren} | birincil=${primaryHit} | numeric-fallback=${numericFallback} | ` +
    `toplam parse=${satirlar.length} | reddedilen=${toplamSkip}`
  )
  if (reddedilen.length > 0) {
    console.warn('[PDF Parse] Reddedilen satır örnekleri:')
    reddedilen.forEach((s, i) => console.warn(`  ${i + 1}. ${s}`))
  }

  return satirlar
}

/* ===== Ana Parse Fonksiyonu ===== */

export async function parsePDF(
  file: File,
  onProgress?: PDFProgressCallback,
): Promise<PDFParseResult> {
  const hamMetin = await pdfToText(file, onProgress)

  console.log('[PDF Parse] Ham metin ilk 500 karakter:', hamMetin.substring(0, 500))

  if (!isPimapenFormat(hamMetin)) {
    return { format: 'bilinmeyen', header: null, satirlar: [], hamMetin }
  }

  onProgress?.('Veriler ayrıştırılıyor...')
  const header = parsePimapenHeader(hamMetin)
  const satirlar = parsePimapenSatirlar(hamMetin)

  console.log('[PDF Parse] Header:', header)
  console.log('[PDF Parse] Satır sayısı:', satirlar.length)

  // === Doğrulama: PDF footer toplamı ile parse edilen toplam karşılaştır ===
  // Header'daki "Adet" değeri PDF formatına göre değişir:
  //   - Pimapen/Ercom: poz/doğrama sayısı (eşsiz pozNo'larla eşleşmeli)
  //   - Bazı formatlar: toplam cam parça sayısı (sum(adet) ile eşleşmeli)
  // Her iki yorumdan en az biri tutuyorsa "doğrulandı" sayılır.
  const parsedAdetSum = satirlar.reduce((sum, s) => sum + s.adet, 0)
  const eşsizPozSet = new Set(satirlar.map(s => s.pozNo).filter(p => p !== ''))
  const eşsizPozCount = eşsizPozSet.size
  const parsedM2 = satirlar.reduce((sum, s) => {
    return sum + (s.adet * s.genislik_mm * s.yukseklik_mm) / 1_000_000
  }, 0)

  if (header.toplamAdet != null) {
    const matchAsPoz = header.toplamAdet === eşsizPozCount
    const matchAsSum = header.toplamAdet === parsedAdetSum
    if (matchAsPoz) {
      console.log(
        `[PDF Parse] ✓ Adet doğrulama (poz sayısı): ${eşsizPozCount}/${header.toplamAdet} eşleşti ` +
        `(toplam cam parça=${parsedAdetSum})`,
      )
    } else if (matchAsSum) {
      console.log(
        `[PDF Parse] ✓ Adet doğrulama (parça sayısı): ${parsedAdetSum}/${header.toplamAdet} eşleşti ` +
        `(eşsiz poz=${eşsizPozCount})`,
      )
    } else {
      console.warn(
        `[PDF Parse] ⚠ Adet kontrol: header=${header.toplamAdet}, eşsiz poz=${eşsizPozCount}, ` +
        `toplam parça=${parsedAdetSum}. Hiçbiri eşleşmedi — ` +
        `header değeri farklı bir anlam taşıyor olabilir veya satır kaybı vardır.`,
      )
    }
  }

  if (header.toplamMetrekare != null) {
    const m2Fark = header.toplamMetrekare - parsedM2
    if (Math.abs(m2Fark) < 0.5) {
      console.log(
        `[PDF Parse] ✓ m² doğrulama: ${parsedM2.toFixed(3)}/${header.toplamMetrekare.toFixed(3)} eşleşti`,
      )
    } else {
      console.error(
        `[PDF Parse] ✗ M² FARKI: PDF=${header.toplamMetrekare.toFixed(3)}, ` +
        `parse=${parsedM2.toFixed(3)}, eksik=${m2Fark.toFixed(3)} m². ` +
        `OCR bazı satırları kaçırmış olabilir.`,
      )
    }
  }

  return { format: 'pimapen', header, satirlar, hamMetin }
}

/* ===== Eşleştirme Yardımcıları ===== */

/** Normalize: küçük harf, Türkçe karakter düzleştirme, boşlukları koru */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[çÇ]/g, 'c')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Kelime bazlı Jaccard benzerlik skoru */
export function benzerlikSkoru(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  // Boş string kontrolü — '' her stringin içinde yer alır, yanlış 0.8 skoru üretir
  if (!na || !nb) return 0
  if (na === nb) return 1
  // includes kontrolü: kısa string uzun stringin tam parçasıysa (min 4 karakter)
  if (na.length >= 4 && nb.includes(na)) return 0.8
  if (nb.length >= 4 && na.includes(nb)) return 0.8

  // Word-level Jaccard similarity
  const wordsA = new Set(na.split(' ').filter(Boolean))
  const wordsB = new Set(nb.split(' ').filter(Boolean))
  let ortak = 0
  for (const w of wordsA) if (wordsB.has(w)) ortak++
  const birlesim = new Set([...wordsA, ...wordsB]).size
  return birlesim > 0 ? ortak / birlesim : 0
}

/** Cari listesinden en yakın eşleşmeyi bul.
 *  minSkor altında kalan sonuçlar null döndürür — yanlış otomatik eşleştirmeyi önler. */
export function cariEslestir(
  pdfCariKodu: string,
  pdfCariUnvan: string,
  cariler: { id: string; ad: string; kod: string }[],
  minSkor = 0.6
): { id: string; ad: string; kod: string; skor: number } | null {
  if (cariler.length === 0) return null

  let enIyi: { id: string; ad: string; kod: string; skor: number } | null = null

  for (const c of cariler) {
    // Kod eşleşmesi → tam puan, direkt döndür
    if (c.kod && pdfCariKodu && normalize(c.kod) === normalize(pdfCariKodu)) {
      return { ...c, skor: 1 }
    }

    const skor = benzerlikSkoru(pdfCariUnvan, c.ad)
    if (!enIyi || skor > enIyi.skor) {
      enIyi = { ...c, skor }
    }
  }

  // Eşik altında kalan en iyi skor → eşleşme yok say
  if (!enIyi || enIyi.skor < minSkor) return null

  return enIyi
}

/** Cam tipi anahtar kelimeleri — açıklamada veya stok adında geçen tip kelimeleri */
const CAM_TIPI_KELIMELER = [
  'duz', 'cift', 'sinerji', 'konfor', 'temp', 'temperli', 'buzlu', 'fume',
  'lowe', 'lowemissivity', 'reflekte', 'ayna', 'lamine',
] as const

/** Açıklamadaki/ad'daki cam tipi anahtar kelimelerini çıkar */
function camTipiAnahtarlar(s: string): Set<string> {
  const n = normalize(s)
  const out = new Set<string>()
  for (const w of n.split(' ').filter(Boolean)) {
    if ((CAM_TIPI_KELIMELER as readonly string[]).includes(w)) out.add(w)
  }
  return out
}

/**
 * Stok eşleştirme — açıklamadan cam tipi + dış kalınlık çıkar, stokla karşılaştır.
 *  Stok'un `kalinlik_mm` ile `dis_kalinlik_mm` eşit olması zorunlu (varsa).
 *  Stok adındaki tip kelimeleri açıklama ile çakışmalı; "çift cam" generic
 *  kelimesi tek başına eşleşmez (Sinerji ile karışmasın).
 */
export function stokEslestir(
  aciklama: string,
  stoklar: { id: string; ad: string; kalinlik_mm?: number | null }[],
  disKalinlikMm?: number | null,
): { id: string; ad: string; skor: number } | null {
  if (stoklar.length === 0) return null

  const aciklamaTipler = camTipiAnahtarlar(aciklama)
  // "cift" generic, tek başına eşleştirme için yetersiz
  const aciklamaSpesifik = new Set([...aciklamaTipler].filter(w => w !== 'cift'))

  let enIyi: { id: string; ad: string; skor: number } | null = null

  for (const s of stoklar) {
    // Kalınlık zorunluluğu: ikisi de biliniyorsa eşit olmalı
    if (disKalinlikMm != null && s.kalinlik_mm != null && Number(s.kalinlik_mm) !== disKalinlikMm) {
      continue
    }

    const stokTipler = camTipiAnahtarlar(s.ad)
    const stokSpesifik = new Set([...stokTipler].filter(w => w !== 'cift'))

    let skor = 0

    // Spesifik tip kelimesi kesişimi en güçlü sinyal
    let kesisim = 0
    for (const w of stokSpesifik) if (aciklamaSpesifik.has(w)) kesisim++

    if (stokSpesifik.size > 0 && kesisim > 0) {
      skor = 0.6 + 0.4 * (kesisim / stokSpesifik.size)
      // Kalınlık da eşleşiyorsa bonus
      if (disKalinlikMm != null && s.kalinlik_mm != null && Number(s.kalinlik_mm) === disKalinlikMm) {
        skor = Math.min(1, skor + 0.1)
      }
    } else if (stokSpesifik.size === 0 && aciklamaSpesifik.size === 0) {
      // İki taraf da generic ("Düz Cam" gibi) — Jaccard fallback
      skor = benzerlikSkoru(aciklama, s.ad) * 0.7
      if (disKalinlikMm != null && s.kalinlik_mm != null && Number(s.kalinlik_mm) === disKalinlikMm) {
        skor = Math.min(1, skor + 0.2)
      }
    } else {
      // Bir tarafta spesifik var diğerinde yok: zayıf eşleşme; sadece kalınlık eşitse al
      if (disKalinlikMm != null && s.kalinlik_mm != null && Number(s.kalinlik_mm) === disKalinlikMm
          && stokSpesifik.size === 0) {
        skor = 0.5
      }
    }

    if (!enIyi || skor > enIyi.skor) {
      enIyi = { id: s.id, ad: s.ad, skor }
    }
  }

  if (!enIyi || enIyi.skor < 0.5) return null
  return enIyi
}

/** Çıta eşleştirme — ara boşluk mm değerine göre çıta stok bul */
export function citaEslestir(
  mm: number,
  citaStoklar: { id: string; ad: string }[]
): { id: string; ad: string; skor: number } | null {
  if (citaStoklar.length === 0) return null

  // Önce ad'ında "Xmm" geçen stok ara (kesin eşleşme)
  for (const s of citaStoklar) {
    const normalAd = normalize(s.ad)
    if (normalAd.includes(`${mm}mm`) || normalAd.includes(`${mm} mm`)) {
      return { ...s, skor: 1 }
    }
  }

  // Fallback: en yüksek Jaccard
  let enIyi: { id: string; ad: string; skor: number } | null = null
  for (const s of citaStoklar) {
    const skor = benzerlikSkoru(`${mm}mm cita`, s.ad)
    if (!enIyi || skor > enIyi.skor) enIyi = { ...s, skor }
  }
  return enIyi
}
