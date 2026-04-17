import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'

// Worker ayarı (text extraction fallback için)
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY as string

/* ===== Tipler ===== */

export interface PDFParseResult {
  format: 'pimapen' | 'bilinmeyen'
  header: PDFSiparisHeader | null
  satirlar: PDFCamSatir[]
  hamMetin: string // debug için
}

export interface PDFSiparisHeader {
  cariKodu: string
  cariUnvan: string
  siparisNo: string
  sipTarihi: string | null
  sevkTarihi: string | null
  toplamAdet: number | null
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

/** Mistral OCR API — PDF'i base64 olarak gönderir, markdown metin döner */
async function mistralOCR(buffer: ArrayBuffer, onProgress?: PDFProgressCallback): Promise<string> {
  if (!MISTRAL_API_KEY || MISTRAL_API_KEY === 'your_mistral_api_key_here') {
    throw new Error('Mistral API anahtarı ayarlanmamış. .env.local dosyasına VITE_MISTRAL_API_KEY ekleyin.')
  }

  onProgress?.('Mistral OCR isteği gönderiliyor...')

  const base64 = arrayBufferToBase64(buffer)
  const dataUrl = `data:application/pdf;base64,${base64}`

  const res = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        document_url: dataUrl,
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Mistral OCR hatası (${res.status}): ${errText}`)
  }

  onProgress?.('Sonuçlar işleniyor...')
  const data = await res.json()
  const pages = data.pages as { index: number; markdown: string }[]

  const fullText = pages.map(p => p.markdown).join('\n')
  console.log('[Mistral OCR] Toplam karakter:', fullText.length)
  console.log('[Mistral OCR] İlk 500 karakter:', fullText.substring(0, 500))
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

  return {
    cariKodu: cariKoduMatch?.[1] ?? '',
    cariUnvan,
    siparisNo: siparisNoMatch?.[1] ?? '',
    sipTarihi: tarihMatch?.[1] ?? null,
    sevkTarihi: tarihMatch?.[2] ?? null,
    toplamAdet: adetMatch ? parseInt(adetMatch[1], 10) : null,
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
    const m = trimmed.match(
      /^(.+?[Çç]ift\s+Cam(?:\s+\S+)?)\s+(\d{1,3})\s+([\d.]+)\s+(\S+)\s+(\d[,.]\d[\d,]*)\s+(\d[,.]\d[\d,]*)\s*(.*)/
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
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.8

  // Word-level Jaccard similarity
  const wordsA = new Set(na.split(' ').filter(Boolean))
  const wordsB = new Set(nb.split(' ').filter(Boolean))
  let ortak = 0
  for (const w of wordsA) if (wordsB.has(w)) ortak++
  const birlesim = new Set([...wordsA, ...wordsB]).size
  return birlesim > 0 ? ortak / birlesim : 0
}

/** Cari listesinden en yakın eşleşmeyi bul */
export function cariEslestir(
  pdfCariKodu: string,
  pdfCariUnvan: string,
  cariler: { id: string; ad: string; kod: string }[]
): { id: string; ad: string; kod: string; skor: number } | null {
  if (cariler.length === 0) return null

  let enIyi: { id: string; ad: string; kod: string; skor: number } | null = null

  for (const c of cariler) {
    // Kod eşleşmesi → tam puan
    if (c.kod && pdfCariKodu && normalize(c.kod) === normalize(pdfCariKodu)) {
      return { ...c, skor: 1 }
    }

    const skor = benzerlikSkoru(pdfCariUnvan, c.ad)
    if (!enIyi || skor > enIyi.skor) {
      enIyi = { ...c, skor }
    }
  }

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
