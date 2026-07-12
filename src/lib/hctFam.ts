import { getStokKatmanYapisi } from '@/lib/cam'
import type { PaneCamTipi } from '@/lib/paneCamTipi'

/** Ercom HCT kesim stokları — birebir eşleşme gerekir */
export const HCT_FAM_KODLARI = new Set([
  '44LM',
  '4BC',
  '4DC',
  '4FM',
  '4KF',
  '4SN',
  '4YS',
  '5DC',
  '6DC',
  '6KF',
  'AYN',
])

export type HctFamSonuc =
  | { fam: string; destekleniyor: true }
  | { fam: string; destekleniyor: false; uyari: string }

export type OptiExportSorunSeviye = 'kritik' | 'uyari'

export type OptiExportSorun = {
  seviye: OptiExportSorunSeviye
  kod: string
  stokKod?: string
  stokAd?: string
  fam?: string
  mesaj: string
  etkilenenSatir: number
  etkilenenAdet: number
}

type StokFamLite = {
  kod?: string | null
  ad?: string | null
  grup?: string | null
  katman_yapisi?: string | null
  kalinlik_mm?: number | null
} | null | undefined

/** Legacy FAM → HCT normalize tablosu */
const LEGACY_FAM_NORMALIZE: Record<string, string> = {
  '4FUME': '4FM',
  '8FUME': '8FM',
  '4BUZ': '4BC',
  '4KON': '4KF',
  '6KON': '6KF',
  '4SIN': '4SN',
  '4LAM': '44LM',
  '44LAM': '44LM',
  '4AYN': 'AYN',
}

/**
 * Belgelenmiş legacy monolit stok→FAM eşlemeleri (VARSAYILAN_FAM_HARITASI + migration 036).
 * HCT dışı; export uyarı ile devam eder.
 */
export const LEGACY_MONOLIT_STOK_FAM: Record<string, string> = {
  '01009': '4REN',
  '01012': '4SAT',
  '01014': '8FM',
  '01015': '4BRZ',
  '01018': '4BRZREF',
  '01019': '4FUMEREF',
}

const MONOLIT_44_LAMINE_KOD = '01016'
const MONOLIT_AYNA_KOD = '01017'

export function normalizeLegacyFamKodu(fam: string): { fam: string; normalizeEdildi: boolean } {
  const trimmed = fam.trim().toUpperCase()
  const normalized = LEGACY_FAM_NORMALIZE[trimmed]
  if (normalized) return { fam: normalized, normalizeEdildi: true }
  return { fam: trimmed, normalizeEdildi: false }
}

export function hctFamSonuc(fam: string, uyariMesaji?: string): HctFamSonuc {
  const upper = fam.trim().toUpperCase()
  if (HCT_FAM_KODLARI.has(upper)) {
    return { fam: upper, destekleniyor: true }
  }
  return {
    fam: upper,
    destekleniyor: false,
    uyari: uyariMesaji ?? `FAM ${upper} HCT kesim stok listesinde yok; export uyarı ile devam eder.`,
  }
}

export function paneToHctFam(kalinlikMm: number, paneTipi: PaneCamTipi): HctFamSonuc {
  const k = Math.round(kalinlikMm)

  switch (paneTipi) {
    case 'dc':
      if (k === 4) return { fam: '4DC', destekleniyor: true }
      if (k === 5) return { fam: '5DC', destekleniyor: true }
      if (k === 6) return { fam: '6DC', destekleniyor: true }
      return hctFamSonuc(`${k}DC`, `${k}DC HCT kesim stok listesinde yok.`)
    case 'buzlu':
      if (k === 4) return { fam: '4BC', destekleniyor: true }
      return hctFamSonuc(`${k}BC`, `${k}BC HCT kesim stok listesinde yok.`)
    case 'fume':
      if (k === 4) return { fam: '4FM', destekleniyor: true }
      if (k === 6) return hctFamSonuc('6FM', '6FM HCT kesim stok listesinde yok; export uyarı ile devam eder.')
      return hctFamSonuc(`${k}FM`, `${k}FM HCT kesim stok listesinde yok.`)
    case 'konfor':
      if (k === 4) return { fam: '4KF', destekleniyor: true }
      if (k === 6) return { fam: '6KF', destekleniyor: true }
      return hctFamSonuc(`${k}KF`, `${k}KF HCT kesim stok listesinde yok.`)
    case 'sinerji':
      if (k === 4) return { fam: '4SN', destekleniyor: true }
      return hctFamSonuc(`${k}SN`, `${k}SN HCT kesim stok listesinde yok.`)
    case 'yesil':
      if (k === 4) return { fam: '4YS', destekleniyor: true }
      return hctFamSonuc(`${k}YS`, `${k}YS HCT kesim stok listesinde yok.`)
    case 'reflekte':
      throw new Error('REFLEKTE pane FAM otomatik üretilemez; belgelenmiş legacy veya kullanıcı override gerekir.')
    default:
      return hctFamSonuc(`${k}DC`)
  }
}

function normalizeMetin(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ıİ]/g, 'i')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function stokKodTemiz(kod: string | null | undefined): string {
  return (kod ?? '').trim()
}

/**
 * Monolit stok FAM çözümü.
 * Öncelik: açık stok kodu/katalog → grup → katman_yapisi → normalize ad.
 */
export function monolitStokToHctFam(stok: StokFamLite): HctFamSonuc {
  const kod = stokKodTemiz(stok?.kod)
  const grup = (stok?.grup ?? '').toUpperCase()
  const katman = getStokKatmanYapisi(stok)
  const ad = normalizeMetin(stok?.ad ?? '')
  const kal = stok?.kalinlik_mm != null ? Math.round(stok.kalinlik_mm) : null

  if (kod === MONOLIT_44_LAMINE_KOD || katman === '4+4') {
    return { fam: '44LM', destekleniyor: true }
  }

  if (kod === MONOLIT_AYNA_KOD || grup === 'AYNA' || ad.includes('ayna')) {
    return { fam: 'AYN', destekleniyor: true }
  }

  if (katman && katman !== '4+4') {
    if (ad.includes('lamine')) {
      throw new Error(`Lamine stok ${kod}: yalnızca 4+4 → 44LM desteklenir; katman=${katman}`)
    }
    throw new Error(`Monolit çözücü ısıcam katman yapısı olan stokta kullanılamaz: ${kod}`)
  }

  const k = kal ?? 4

  if (ad.includes('fume') && ad.includes('reflekte')) {
    return hctFamSonuc('4FUMEREF', '4FUMEREF HCT dışı legacy FAM (01019).')
  }
  if (ad.includes('bronz') && ad.includes('reflekte')) {
    return hctFamSonuc('4BRZREF', '4BRZREF HCT dışı legacy FAM (01018).')
  }
  if (ad.includes('fume')) return paneToHctFam(k, 'fume')
  if (ad.includes('sinerji')) return paneToHctFam(k, 'sinerji')
  if (ad.includes('konfor')) return paneToHctFam(k, 'konfor')
  if (ad.includes('buzlu')) return paneToHctFam(k, 'buzlu')
  if (ad.includes('yesil') || ad.includes('yeşil')) return paneToHctFam(k, 'yesil')
  if (ad.includes('renkli')) return hctFamSonuc(`${k}REN`, '4REN HCT dışı legacy FAM (01009).')
  if (ad.includes('satina')) return hctFamSonuc(`${k}SAT`, '4SAT HCT dışı legacy FAM (01012).')
  if (ad.includes('bronz')) return hctFamSonuc(`${k}BRZ`, '4BRZ HCT dışı legacy FAM (01015).')
  if (ad.includes('lamine')) {
    throw new Error(`Lamine stok ${kod}: yalnızca 4+4 → 44LM desteklenir; katman=${katman ?? '—'}`)
  }
  if (ad.includes('reflekte')) {
    throw new Error(`REFLEKTE monolit stok ${kod}: belgelenmiş legacy stok kodu gerekir (01018/01019).`)
  }

  if (grup === 'DÜZCAM' || ad.includes('dc') || ad.includes('duz')) {
    return paneToHctFam(k, 'dc')
  }

  return paneToHctFam(k, 'dc')
}

export function isicamStokMu(stok: StokFamLite): boolean {
  return !!getStokKatmanYapisi(stok)
}

export function famHaritasindanBul(
  stokKod: string | null | undefined,
  harita: Array<{ stok_kod: string; fam_kodu: string }>,
): string | null {
  if (!stokKod) return null
  const esleme = harita.find((e) => e.stok_kod === stokKod)
  return esleme?.fam_kodu?.trim() || null
}

/**
 * Monolit stok FAM öncelik zinciri:
 * 1. Kullanıcı override al → legacy ise normalize → geçerliyse kullan
 * 2. Otomatik monolit HCT
 * 3. Belgelenmiş legacy stok tablosu
 * 4. Kritik
 */
export function monolitFamCoz(
  stok: StokFamLite,
  famHaritasi: Array<{ stok_kod: string; fam_kodu: string }>,
): { sonuc: HctFamSonuc; legacyNormalize: boolean } {
  const kod = stokKodTemiz(stok?.kod)
  const overrideHam = famHaritasindanBul(kod, famHaritasi)

  if (overrideHam) {
    const { fam, normalizeEdildi } = normalizeLegacyFamKodu(overrideHam)
    return {
      sonuc: hctFamSonuc(
        fam,
        normalizeEdildi ? `Legacy FAM ${overrideHam} → ${fam} olarak normalize edildi.` : undefined,
      ),
      legacyNormalize: normalizeEdildi,
    }
  }

  try {
    return { sonuc: monolitStokToHctFam(stok), legacyNormalize: false }
  } catch {
    const legacy = LEGACY_MONOLIT_STOK_FAM[kod]
    if (legacy) {
      return {
        sonuc: hctFamSonuc(legacy, `${legacy} belgelenmiş legacy monolit FAM (${kod}).`),
        legacyNormalize: false,
      }
    }
    throw new Error(`Monolit stok ${kod} FAM çözülemedi.`)
  }
}

/**
 * Isıcam pane FAM — stok bazlı override kullanılmaz (çoklu pane).
 */
export function isicamPaneFamCoz(
  kalinlikMm: number,
  paneTipi: PaneCamTipi,
): HctFamSonuc {
  if (paneTipi === 'reflekte') {
    throw new Error('REFLEKTE pane: HCT eşlemesi yok; belgelenmiş legacy kanıtı bulunamadı.')
  }
  return paneToHctFam(kalinlikMm, paneTipi)
}

export function hctFamEtiketi(fam: string): string {
  const upper = fam.trim().toUpperCase()

  const sabit: Record<string, string> = {
    '44LM': '4+4 LAMINE',
    'AYN': '4mm AYNA',
    '4BRZREF': '4mm BRONZ REFLEKTE',
    '4FUMEREF': '4mm FUME REFLEKTE',
    '4REN': '4mm RENKLİ',
    '4SAT': '4mm SATINA',
    '4BRZ': '4mm BRONZ',
  }
  if (sabit[upper]) return sabit[upper]

  const suffixEtiket: Record<string, string> = {
    DC: 'DC',
    FM: 'FUME',
    BC: 'BUZLU',
    KF: 'KONFOR',
    SN: 'SINERJI',
    YS: 'YEŞİL',
  }

  const m = upper.match(/^(\d+)(DC|FM|BC|KF|SN|YS)$/)
  if (m) {
    const etiket = suffixEtiket[m[2]]
    if (etiket) return `${m[1]}mm ${etiket}`
  }

  return upper
}

export function optiExportSorunAnahtari(s: Pick<OptiExportSorun, 'seviye' | 'kod' | 'stokKod' | 'fam'>): string {
  return `${s.seviye}|${s.kod}|${s.stokKod ?? ''}|${s.fam ?? ''}`
}

export function optiExportSorunlariTekillestir(sorunlar: OptiExportSorun[]): OptiExportSorun[] {
  const map = new Map<string, OptiExportSorun>()
  for (const s of sorunlar) {
    const key = optiExportSorunAnahtari(s)
    const mevcut = map.get(key)
    if (mevcut) {
      mevcut.etkilenenSatir += s.etkilenenSatir
      mevcut.etkilenenAdet += s.etkilenenAdet
    } else {
      map.set(key, { ...s })
    }
  }
  return [...map.values()]
}

export function normalizeFamHaritasi(
  harita: Array<{ stok_kod: string; fam_kodu: string }>,
): { harita: Array<{ stok_kod: string; fam_kodu: string }>; normalizeUyari: string[] } {
  const byStok = new Map<string, string>()
  const normalizeUyari: string[] = []

  for (const e of harita) {
    const stokKod = e.stok_kod?.trim()
    const famHam = e.fam_kodu?.trim()
    if (!stokKod || !famHam) continue

    const { fam, normalizeEdildi } = normalizeLegacyFamKodu(famHam)
    if (normalizeEdildi) {
      normalizeUyari.push(`${stokKod}: ${famHam} → ${fam}`)
    }
    byStok.set(stokKod, fam)
  }

  return {
    harita: [...byStok.entries()].map(([stok_kod, fam_kodu]) => ({ stok_kod, fam_kodu })),
    normalizeUyari,
  }
}
