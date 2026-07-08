import type { SiparisDetay } from '@/types/siparis'

/**
 * Cam kompozisyonu yardımcıları.
 *
 * Tek doğruluk kaynağı: `siparis_detaylari.katman_yapisi` TEXT alanı.
 *   "4+16+4"           → çift cam
 *   "4+12+4+16+5"      → üçlü cam (asimetrik destekli)
 *   "4+14+5"           → 2 katmanlı asimetrik / temperli
 */

type DetayLite = Pick<SiparisDetay, 'katman_yapisi'>

type StokLite = { ad?: string | null; kalinlik_mm?: number | null } | null | undefined

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

function stripKatmanYapisi(s: string): string {
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
        ? 'Cam ailesi okunamadı.'
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

/** Kompozisyon string'i (katman_yapisi tek otorite). */
export function getCamKompozisyon(detay: DetayLite, _stok: StokLite): string {
  void _stok
  return normalizeKatmanYapisi(detay.katman_yapisi)
}

/** Etikete basılacak tam cam tipi: "4+16+4 KONFOR". */
export function getEtiketCamTipi(detay: DetayLite, stok: StokLite): string {
  const komp = getCamKompozisyon(detay, stok)
  const ad = normalizeCamAilesiAd(stok?.ad)
  if (!komp) return ad
  if (!ad) return komp
  return `${komp} ${ad}`
}

/** Toplu Düzenle vb. için gruplama anahtarı: aynı stok + aynı kompozisyon → aynı grup. */
export function getKompozisyonKey(detay: DetayLite, stokId: string | null): string {
  const komp = getCamKompozisyon(detay, null)
  return `${stokId ?? ''}|${komp}`
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
