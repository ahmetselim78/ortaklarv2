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
  pozNo: string
}

/** Progress callback tipi */
export type PDFProgressCallback = (msg: string) => void

/* ===== PDF → Metin ===== */

/**
 * Önce pdfjs-dist text extraction'ı dener.
 * Yetersiz metin çıkarsa Mistral OCR API'ye gönderir.
 */
export async function pdfToText(file: File, onProgress?: PDFProgressCallback): Promise<string> {
  const buffer = await file.arrayBuffer()

  // 1) Hızlı text extraction dene
  // buffer.slice(0) kopya oluşturur — pdfjs-dist orijinali detach eder
  onProgress?.('Metin çıkarılıyor...')
  const textLines = await tryTextExtraction(buffer.slice(0))

  if (textLines.filter(l => l.trim().length > 5).length >= 20) {
    console.log('[PDF] Text extraction başarılı:', textLines.length, 'satır')
    return textLines.join('\n')
  }

  console.log('[PDF] Text extraction yetersiz, Mistral OCR\'ye geçiliyor...')

  // 2) Mistral OCR
  return await mistralOCR(buffer, onProgress)
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

/** Mistral OCR — Önce Supabase Edge Function dener, başarısız olursa doğrudan API'ye gider */
async function mistralOCR(buffer: ArrayBuffer, onProgress?: PDFProgressCallback): Promise<string> {
  onProgress?.('Mistral OCR isteği gönderiliyor...')

  const base64 = arrayBufferToBase64(buffer)

  // 1) Supabase Edge Function dene
  const { data, error } = await supabase.functions.invoke('mistral-ocr', {
    body: { document_base64: base64 },
  })

  if (!error && data?.pages) {
    onProgress?.('Sonuçlar işleniyor...')
    const pages = data.pages as { index: number; markdown: string }[]
    const fullText = pages.map((p: { markdown: string }) => p.markdown).join('\n')
    console.log('[Mistral OCR] Edge Function başarılı, toplam karakter:', fullText.length)
    return fullText
  }

  // 2) Fallback: VITE_MISTRAL_API_KEY varsa doğrudan Mistral API'ye git
  const apiKey = import.meta.env.VITE_MISTRAL_API_KEY as string | undefined
  if (!apiKey) {
    throw new Error(
      `Mistral OCR hatası: ${error?.message ?? 'Bilinmeyen hata'}. Edge Function deploy edilmemiş ve VITE_MISTRAL_API_KEY tanımlı değil.`
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
  const fullText = pages.map((p: { markdown: string }) => p.markdown).join('\n')
  console.log('[Mistral OCR] Doğrudan API başarılı, toplam karakter:', fullText.length)
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
    /pimapen|ercom/i,
    /\d+[+\-]\d+[+\-]\d+|\d{441644}|441\d{3}/,  // "4+16+4" veya OCR varyantı
    /cam\s*.*sipari/i,
    /cari\s*.?nvan/i,
    /poz\s*no/i,
    /[Çç]ift\s+Cam/,       // OCR'de en güvenilir: "Çift Cam"
  ]
  let hits = 0
  for (const r of checks) {
    if (r.test(text)) hits++
  }
  return hits >= 3
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

/**
 * PIMAPEN satır parser — hem düz metin hem Mistral markdown tablosu destekler.
 *
 * Mistral OCR çıktısı iki formatta gelebilir:
 *   1) Markdown tablo: "| 4+16+4 Çift Cam Konfor | 2 | 612 | 2.031 | 1,243 | 2,486 | 1 |"
 *   2) Düz metin:      "4+16+4 Çift Cam Konfor 2 612 2.031 1,243 2,486 1"
 */
function parsePimapenSatirlar(text: string): PDFCamSatir[] {
  const satirlar: PDFCamSatir[] = []
  const lines = text.split('\n')
  const araBoslukDefault = detectAraBosluk(text)

  for (const line of lines) {
    let trimmed = line.trim()
    if (!trimmed) continue

    // Markdown tablo header/separator satırlarını atla
    if (/^\|[\s\-|:]+\|$/.test(trimmed)) continue

    // Markdown tablo satırını düz metne çevir: "| a | b |" → "a b"
    if (trimmed.startsWith('|')) {
      trimmed = trimmed.replace(/^\||\|$/g, '').split('|').map(s => s.trim()).join(' ')
    }

    // Cam satırı tespiti: "Çift Cam" içermeli
    if (!/[Çç]ift\s+Cam/i.test(trimmed)) continue

    // Toplam satırını atla
    if (/m[²2]\.?\s*$/.test(trimmed)) continue

    // Format: {açıklama} {adet} {gen} {yük_veya_çöp} {Bm²: D,DDD} {Tm²: D,DDD} {pozNo}
    // Not: "Ø 150" gibi iki kelimeli açıklama sonekleri (delik çapı) özel olarak ele alınır.
    // Sadece \S+ kullanılsaydı "Ø" açıklamaya, "150" yanlışlıkla adet'e atanırdı.
    const m = trimmed.match(
      /^(.+?[Çç]ift\s+Cam(?:\s+(?:Ø\s*\d+|\S+))?)\s+(\d{1,3})\s+([\d.]+)\s+(\S+)\s+(\d[,.]\d[\d,]*)\s+(\d[,.]\d[\d,]*)\s*(.*)/
    )
    if (!m) continue

    const aciklama = m[1].trim()
    const adet    = parseInt(m[2], 10)
    const gen     = parseTrInt(m[3])
    const yukRaw  = m[4]
    const bm2     = parseFloat(m[5].replace(',', '.'))
    const pozNo   = (m[7] ?? '').trim()

    if (isNaN(gen) || gen <= 0 || adet <= 0 || isNaN(bm2) || bm2 <= 0) continue

    // Yük: numeric parse; yoksa Bm² formülünden hesapla
    let yuk = parseTrInt(yukRaw)
    if (isNaN(yuk) || yuk < 10 || yuk > 9999) {
      yuk = Math.round((bm2 * 1_000_000) / gen)
    }
    if (yuk <= 0) continue

    const araBosluk = extractAraBoslukFromDesc(aciklama) ?? araBoslukDefault

    satirlar.push({ aciklama, adet, genislik_mm: gen, yukseklik_mm: yuk, ara_bosluk_mm: araBosluk, pozNo })
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

/** Stok eşleştirme — açıklamadan cam tipi çıkar ve stokla karşılaştır */
export function stokEslestir(
  aciklama: string,
  stoklar: { id: string; ad: string }[]
): { id: string; ad: string; skor: number } | null {
  if (stoklar.length === 0) return null

  let enIyi: { id: string; ad: string; skor: number } | null = null

  for (const s of stoklar) {
    const skor = benzerlikSkoru(aciklama, s.ad)
    if (!enIyi || skor > enIyi.skor) {
      enIyi = { ...s, skor }
    }
  }

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

  // Fallback: genel benzerlik
  return stokEslestir(`${mm}mm çıta`, citaStoklar)
}
