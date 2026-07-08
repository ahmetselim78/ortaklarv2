
/**
 * Cam kompozisyonu yardımcıları.
 *
 * Tek doğruluk kaynağı stok kartıdır (stok.katman_yapisi + stok.ad).
 *   "4+16+4"           → çift cam
 *   "4+12+4+16+5"      → üçlü cam (asimetrik destekli)
 *   "4+14+5"           → 2 katmanlı asimetrik / temperli
 */

type DetayLite = { katman_yapisi?: string | null }

type StokLite = {
  kod?: string | null
  ad?: string | null
  aktif?: boolean | null
  kalinlik_mm?: number | null
  katman_yapisi?: string | null
} | null | undefined

export type StokKartLite = {
  id: string
  kod?: string | null
  ad: string
  grup?: string | null
  kalinlik_mm?: number | null
  katman_yapisi?: string | null
  aktif?: boolean | null
}

export const CAM_GRUPLARI = [
  'DÜZCAM',
  'BUZLUCAM',
  'AYNA',
  'LOW-E',
  'KONFOR',
  'ISICAM',
  'ISICAM-S',
  'ISICAM-KONFOR',
  'ÜÇLÜ CAM',
] as const

export const KOD_ARALIK_IPUCLARI: Record<string, string> = {
  DÜZCAM: '01002–01023',
  BUZLUCAM: '01008–01016',
  AYNA: '01017–01019',
  'LOW-E': '01020',
  KONFOR: '01022–01023',
  ISICAM: '10000–10399',
  'ISICAM-S': '10400–10599',
  'ISICAM-KONFOR': '10600–10799',
  'ÜÇLÜ CAM': '10800–20004',
}

export const CITA_BOYUTLARI = [9, 11, 12, 14, 15, 16, 20, 22] as const

export type CitaStokLite = {
  id: string
  ad?: string
  kod?: string | null
  kalinlik_mm?: number | null
  aktif?: boolean | null
  kategori?: string | null
}

/** Standart çıta stok adı — ara boşluk mm ile eşleşir. */
export function citaStokAdi(mm: number): string {
  return `Alüminyum Çıta ${mm}mm`
}

/** Önerilen çıta stok kodu: C-09, C-16 … */
export function citaKodOnerisi(mm: number): string {
  return `C-${String(mm).padStart(2, '0')}`
}

export function aktifCitaStoklari<T extends CitaStokLite>(stoklar: T[]): T[] {
  return stoklar.filter((s) => s.kategori === 'cita' && s.aktif !== false)
}

/** Stok kartı katman yapısından ana ara boşluk (mm) — ısıcam orta katman. */
export function getAraBoslukMm(stok: StokLite): number | null {
  const katman = getStokKatmanYapisi(stok)
  if (!katman) return null
  const parts = katman.split('+').map((p) => parseInt(p, 10))
  if (parts.length >= 3 && Number.isFinite(parts[1])) return parts[1]
  if (parts.length === 2 && Number.isFinite(parts[1])) return parts[1]
  return null
}

/** Çıta büküm CSV H sütunu — malzeme adı (kalınlık G sütununda ayrı). */
export function citaBukumMalzemeEtiketi(ad: string): string {
  const trimmed = ad.trim()
  if (!trimmed) return 'Alüminyum'
  const match = trimmed.match(/^(Alüminyum|Plastik|Paslanmaz)/i)
  if (match) {
    const w = match[1]
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }
  return trimmed.split(/\s+/)[0] ?? trimmed
}

/** Ara boşluk mm → aktif çıta stok kartı (kalinlik_mm tek doğruluk kaynağı). */
export function citaEslestir(
  mm: number,
  citaStoklar: CitaStokLite[],
): { id: string; ad: string; skor: number } | null {
  const aktif = aktifCitaStoklari(citaStoklar)
  if (aktif.length === 0) return null

  const hedef = Math.round(mm)

  for (const s of aktif) {
    if (s.kalinlik_mm != null && Math.round(s.kalinlik_mm) === hedef) {
      return { id: s.id, ad: s.ad ?? citaStokAdi(hedef), skor: 1 }
    }
  }

  for (const s of aktif) {
    const adMatch = s.ad?.match(/\b(\d+)\s*mm\b/i)
    if (adMatch && Number(adMatch[1]) === hedef) {
      return { id: s.id, ad: s.ad!, skor: 0.95 }
    }
  }

  return null
}

/** Çıta listesi sıralaması — önce kalinlik_mm, sonra kod. */
export function citaStokSira(
  a: { kalinlik_mm?: number | null; kod?: string | null },
  b: { kalinlik_mm?: number | null; kod?: string | null },
): number {
  const ka = a.kalinlik_mm ?? Infinity
  const kb = b.kalinlik_mm ?? Infinity
  if (ka !== kb) return ka - kb
  return stokKodSira(a.kod ?? '') - stokKodSira(b.kod ?? '')
}

/** Standart katalogda eksik kalan aktif çıta boyutları. */
export function eksikCitaBoyutlari(mevcutStoklar: CitaStokLite[]): number[] {
  const mevcut = new Set(
    aktifCitaStoklari(mevcutStoklar)
      .map((s) => s.kalinlik_mm)
      .filter((mm): mm is number => mm != null)
      .map(Math.round),
  )
  return CITA_BOYUTLARI.filter((b) => !mevcut.has(b))
}

export type CamAilesi = string

export interface OcrCamCozumleme {
  ocr_aciklama: string
  katman_yapisi: string
  cam_ailesi: CamAilesi | null
  emin: boolean
  uyari: string | null
  sistem_etiketi: string
}

const CAM_AILELERI: CamAilesi[] = ['Isıcam', 'Isıcam Sinerji', 'Isıcam Konfor']

const OZEL_CAM_AILELERI: Array<{ test: RegExp; aile: CamAilesi }> = [
  { test: /\bfume\b/, aile: 'Füme Cam' },
  { test: /\bbuzlu\b/, aile: 'Buzlu Cam' },
  { test: /\bduz\b/, aile: 'Düz Cam' },
  { test: /\btemperli\b|\btemp\b/, aile: 'Temperli Cam' },
  { test: /\blamine\b/, aile: 'Lamine Cam' },
  { test: /\breflekte\b/, aile: 'Reflekte Cam' },
  { test: /\bayna\b/, aile: 'Ayna Cam' },
]

/**
 * Geçerli katman_yapisi formatı: "4+16+4", "4+12+4+16+5", vb.
 * En az 2 sayı, en fazla 5 sayı (4 artı), her sayı 1-3 hane.
 */
export function isValidKatmanYapisi(s: string | null | undefined): boolean {
  if (!s) return false
  return /^\d+(\+\d+){1,4}$/.test(s.trim())
}

/** Katman yapısını normalize et: boşlukları kaldır, geçerli değilse '' döner. */
export function normalizeKatmanYapisi(s: string | null | undefined): string {
  if (!s) return ''
  const cleaned = s.replace(/\s+/g, '')
  return isValidKatmanYapisi(cleaned) ? cleaned : ''
}

function normalizeAramaMetni(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ıİ]/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripKatmanYapisi(s: string): string {
  return s
    .replace(/^\s*\d+(\s*\+\s*\d+){1,4}\s*/g, '')
    .replace(/\b\d{5,8}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function packedKatmanYapisi(raw: string): string {
  const firstRaw = Number(raw.slice(0, 2))
  const lastRaw = Number(raw.slice(-2))
  const ortaRaw = Number(raw.slice(2, -2))
  const first = firstRaw >= 30 ? Math.floor(firstRaw / 10) : firstRaw
  const last = lastRaw >= 30 ? Math.floor(lastRaw / 10) : lastRaw
  if (
    Number.isFinite(first) && first >= 3 && first <= 12 &&
    Number.isFinite(ortaRaw) && ortaRaw >= 4 && ortaRaw <= 32 &&
    Number.isFinite(last) && last >= 3 && last <= 12
  ) {
    return `${first}+${ortaRaw}+${last}`
  }
  return ''
}

export function extractKatmanYapisiFromText(s: string | null | undefined): string {
  if (!s) return ''
  const match = s.match(/\b\d+(?:\s*\+\s*\d+){1,4}\b/)
  const normal = normalizeKatmanYapisi(match?.[0])
  if (normal) return normal

  const packed = s.match(/\b\d{5,8}\b/)
  return normalizeKatmanYapisi(packed ? packedKatmanYapisi(packed[0]) : '')
}

/** Stok kartındaki kombinasyon bilgisini döndürür. */
export function getStokKatmanYapisi(stok: StokLite): string {
  const explicit = normalizeKatmanYapisi(stok?.katman_yapisi)
  if (explicit) return explicit
  return extractKatmanYapisiFromText(stok?.ad)
}

/** Stok adı tam kombinasyon ise başındaki katmanı temizler. */
export function getStokAdKatmansiz(stok: StokLite): string {
  return stripKatmanYapisi(stok?.ad?.trim() ?? '')
}

export function detectCamAilesi(s: string | null | undefined): { aile: CamAilesi | null; ambiguous: boolean } {
  const n = normalizeAramaMetni(stripKatmanYapisi(s ?? ''))
  const compact = n.replace(/\s+/g, '')
  const hasKonfor = /\bkonfor\b/.test(n) || compact.includes('konfor')
  const hasSinerji = /\bsinerji\b/.test(n) || compact.includes('sinerji')

  if (hasKonfor && hasSinerji) return { aile: null, ambiguous: true }
  if (hasKonfor) return { aile: 'Isıcam Konfor', ambiguous: false }
  if (hasSinerji) return { aile: 'Isıcam Sinerji', ambiguous: false }

  const ozelCam = OZEL_CAM_AILELERI.find(({ test }) => test.test(n))
  if (ozelCam) return { aile: ozelCam.aile, ambiguous: false }

  const hasIsicam = compact.includes('isicam')
  const hasCiftCam = /\bcift\s*cam\b/.test(n) || compact.includes('ciftcam')
  if (hasIsicam || hasCiftCam) {
    return { aile: 'Isıcam', ambiguous: false }
  }

  return { aile: null, ambiguous: false }
}

export function normalizeCamAilesiAd(ad: string | null | undefined): string {
  const temiz = stripKatmanYapisi(ad?.trim() ?? '')
  const detected = detectCamAilesi(temiz)
  return detected.aile ?? temiz
}

export function camAilesiEsit(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeAramaMetni(normalizeCamAilesiAd(a)) === normalizeAramaMetni(normalizeCamAilesiAd(b))
}

export function cozumleOcrCam(aciklama: string | null | undefined): OcrCamCozumleme {
  const ocr = aciklama?.trim() ?? ''
  const katman = extractKatmanYapisiFromText(ocr)
  const detected = detectCamAilesi(ocr)
  const uyari = !katman
    ? 'Katman yapısı okunamadı.'
    : detected.ambiguous
      ? 'Aynı açıklamada Konfor ve Sinerji birlikte görünüyor.'
      : detected.aile == null
        ? 'Cam tipi okunamadı.'
        : null
  const sistemEtiketi = [katman || null, detected.aile].filter(Boolean).join(' ')
  return {
    ocr_aciklama: ocr,
    katman_yapisi: katman,
    cam_ailesi: detected.aile,
    emin: uyari == null,
    uyari,
    sistem_etiketi: sistemEtiketi,
  }
}

export function varsayilanCamAileleri(): readonly CamAilesi[] {
  return CAM_AILELERI
}

function stokMetinSkoru(hedef: string, stokMetni: string): number {
  const h = normalizeAramaMetni(hedef)
  const t = normalizeAramaMetni(stokMetni)
  if (!h || !t) return 0
  if (h === t) return 1
  if (h.length >= 4 && t.includes(h)) return 0.9
  if (t.length >= 4 && h.includes(t)) return 0.85

  const wordsH = new Set(h.split(' ').filter(Boolean))
  const wordsT = new Set(t.split(' ').filter(Boolean))
  let ortak = 0
  for (const w of wordsH) if (wordsT.has(w)) ortak++
  const birlesim = new Set([...wordsH, ...wordsT]).size
  return birlesim > 0 ? ortak / birlesim : 0
}

function ozelTipSkoru(hedefMetin: string, stokMetni: string): number {
  const h = normalizeAramaMetni(hedefMetin)
  const t = normalizeAramaMetni(stokMetni)
  const ozellikler = ['konfor', 'sinerji', 'buzlu', 'fume', 'reflekte', 'temp', 'temperli', 'renkli', 'lamine']
  let skor = 0
  for (const oz of ozellikler) {
    const hedefte = h.includes(oz)
    const stokta = t.includes(oz)
    if (hedefte === stokta) skor += hedefte ? 0.15 : 0.05
    else skor -= 0.2
  }
  return skor
}

/** OCR/PDF açıklamasından en uygun kombinasyon stok kartını bulur. */
export function stokKartEslestir(
  aciklama: string,
  stoklar: StokKartLite[],
  minSkor = 0.55,
): { id: string; ad: string; skor: number } | null {
  if (stoklar.length === 0) return null

  const cozum = cozumleOcrCam(aciklama)
  const katman = normalizeKatmanYapisi(cozum.katman_yapisi) || extractKatmanYapisiFromText(aciklama)
  const hedefMetin = `${katman} ${cozum.ocr_aciklama}`.trim()

  let enIyi: { id: string; ad: string; skor: number } | null = null

  for (const s of stoklar) {
    if (s.aktif === false) continue

    const stokKatman = getStokKatmanYapisi(s)
    const stokMetni = `${s.kod ?? ''} ${s.ad} ${s.grup ?? ''}`

    let skor: number
    if (katman && stokKatman) {
      if (stokKatman !== katman) continue
      skor = stokMetinSkoru(hedefMetin, stokMetni) + ozelTipSkoru(aciklama, stokMetni)
    } else if (!katman && !stokKatman) {
      skor = stokMetinSkoru(aciklama, stokMetni)
    } else {
      continue
    }

    if (!enIyi || skor > enIyi.skor) enIyi = { id: s.id, ad: s.ad, skor }
  }

  return enIyi && enIyi.skor >= minSkor ? enIyi : null
}

/** Ad içindeki katman ile katman_yapisi alanı uyumlu mu? */
export function adKatmanUyumlu(ad: string, katmanYapisi: string | null | undefined): boolean {
  const adKatman = extractKatmanYapisiFromText(ad)
  const alanKatman = normalizeKatmanYapisi(katmanYapisi)
  if (!adKatman || !alanKatman) return true
  return adKatman === alanKatman
}

/** Stok kodunu sayısal karşılaştırma için parse eder. */
export function stokKodSira(kod: string): number {
  const n = parseInt(kod.replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

/** Kompozisyon string'i — yalnızca stok kartından. */
export function getCamKompozisyon(_detay: DetayLite, stok: StokLite): string {
  return getStokKatmanYapisi(stok)
}

/** UI'da gösterilecek tam cam açıklaması — stok kartından, katman tekrarı yok. */
export function getStokGosterimAciklamasi(stok: StokLite): string {
  return getEtiketCamTipi({}, stok) || stok?.ad?.trim() || '—'
}

/** Etikete basılacak tam cam tipi: "4+16+4 KONFOR". */
export function getEtiketCamTipi(detay: DetayLite, stok: StokLite): string {
  const ad = stok?.ad?.trim() ?? ''
  const adKatman = extractKatmanYapisiFromText(ad)
  if (adKatman && ad) return ad

  const komp = getCamKompozisyon(detay, stok)
  if (!komp) return ad

  const temizAd = normalizeCamAilesiAd(ad)
  if (!temizAd) return komp
  if (ad && normalizeAramaMetni(ad).startsWith(normalizeAramaMetni(komp))) return ad

  return `${komp} ${temizAd}`
}

/** Toplu Düzenle vb. için gruplama anahtarı: aynı stok + aynı kompozisyon → aynı grup. */
export function getKompozisyonKey(stokId: string | null, stok: StokLite): string {
  return `${stokId ?? ''}|${getStokKatmanYapisi(stok)}`
}

/** UI suggestion chip'leri için sık kullanılan kompozisyonlar. */
export const POPULER_KATMAN_YAPILARI = [
  '4+12+4',
  '4+16+4',
  '4+20+4',
  '4+12+4+16+4',
  '4+16+4+16+4',
  '4+14+5',
  '4+12+5',
  '5+16+5',
] as const
