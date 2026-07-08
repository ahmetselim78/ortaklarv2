import { getStokKatmanYapisi } from '@/lib/cam'
import type { OptiFamEsleme } from '@/types/ayarlar'
import type { UretimEmriDetay } from '@/types/uretim'

type StokLite = NonNullable<UretimEmriDetay['siparis_detaylari']>['stok']

export interface OptiParca {
  b: number
  h: number
  cl: string
  ord: string
  fam: string
}

export interface OptiExportTuru {
  /** FAM kodu — seçim anahtarı */
  anahtar: string
  /** UI etiketi, örn. "4 mm DC" */
  etiket: string
  adet: number
}

const CL_MAX_UZUNLUK = 48

/** Migration kataloğundan varsayılan FAM eşlemeleri */
export const VARSAYILAN_FAM_HARITASI: OptiFamEsleme[] = [
  { stok_kod: '01002', fam_kodu: '4DC' },
  { stok_kod: '01003', fam_kodu: '5DC' },
  { stok_kod: '01004', fam_kodu: '6DC' },
  { stok_kod: '01005', fam_kodu: '8DC' },
  { stok_kod: '01006', fam_kodu: '10DC' },
  { stok_kod: '01008', fam_kodu: '4BUZ' },
  { stok_kod: '01009', fam_kodu: '4REN' },
  { stok_kod: '01012', fam_kodu: '4SAT' },
  { stok_kod: '01013', fam_kodu: '4FUME' },
  { stok_kod: '01014', fam_kodu: '8FUME' },
  { stok_kod: '01015', fam_kodu: '4BRZ' },
  { stok_kod: '01016', fam_kodu: '44LAM' },
  { stok_kod: '01017', fam_kodu: '4AYN' },
  { stok_kod: '01018', fam_kodu: '4BRZREF' },
  { stok_kod: '01019', fam_kodu: '4FUMEREF' },
  { stok_kod: '01020', fam_kodu: '4SIN' },
  { stok_kod: '01022', fam_kodu: '4KON' },
  { stok_kod: '01023', fam_kodu: '6KON' },
]

function normalizeMetin(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ıİ]/g, 'i')
    .toLowerCase()
}

function famHaritasindanBul(stokKod: string | null | undefined, harita: OptiFamEsleme[]): string | null {
  if (!stokKod) return null
  const esleme = harita.find((e) => e.stok_kod === stokKod)
  return esleme?.fam_kodu?.trim() || null
}

/** Stok kartından otomatik FAM kodu türetir. */
export function optiFamKoduOtomatik(stok: StokLite): string {
  const ad = normalizeMetin(stok?.ad ?? '')
  const kal = stok?.kalinlik_mm != null ? Math.round(stok.kalinlik_mm) : null
  const katman = getStokKatmanYapisi(stok)

  if (katman) {
    const parts = katman.split('+').map((p) => parseInt(p, 10))
    const dis = parts[0]
    if (Number.isFinite(dis)) {
      if (ad.includes('fume')) return `${dis}FUME`
      if (ad.includes('sinerji')) return `${dis}SIN`
      if (ad.includes('konfor')) return `${dis}KON`
      if (ad.includes('reflekte')) return `${dis}REF`
      if (ad.includes('buzlu')) return `${dis}BUZ`
      return `${dis}DC`
    }
  }

  const k = kal ?? 4
  if (ad.includes('fume') && ad.includes('reflekte')) return `${k}FUMEREF`
  if (ad.includes('bronz') && ad.includes('reflekte')) return `${k}BRZREF`
  if (ad.includes('fume')) return `${k}FUME`
  if (ad.includes('bronz')) return `${k}BRZ`
  if (ad.includes('sinerji')) return `${k}SIN`
  if (ad.includes('konfor')) return `${k}KON`
  if (ad.includes('reflekte')) return `${k}REF`
  if (ad.includes('buzlu')) return `${k}BUZ`
  if (ad.includes('ayna')) return `${k}AYN`
  if (ad.includes('renkli')) return `${k}REN`
  if (ad.includes('satina')) return `${k}SAT`
  if (ad.includes('lamine')) return `${k}LAM`
  if (stok?.grup === 'DÜZCAM' || ad.includes('dc') || ad.includes('duz')) return `${k}DC`
  return `${k}DC`
}

/** Admin haritası + otomatik türetim ile FAM kodu. */
export function optiFamKodu(stok: StokLite, famHaritasi: OptiFamEsleme[] = []): string {
  const kayitli = famHaritasindanBul(stok?.kod, famHaritasi)
  if (kayitli) return kayitli
  return optiFamKoduOtomatik(stok)
}

/** Pane kalınlığı + cam tipi için FAM (ısıcam pane export). */
export function optiPaneFamKodu(
  kalinlikMm: number,
  camTipi: 'dc' | 'fume' | 'sinerji' | 'konfor' | 'reflekte' | 'buzlu',
): string {
  const k = Math.round(kalinlikMm)
  switch (camTipi) {
    case 'fume': return `${k}FUME`
    case 'sinerji': return `${k}SIN`
    case 'konfor': return `${k}KON`
    case 'reflekte': return `${k}REF`
    case 'buzlu': return `${k}BUZ`
    default: return `${k}DC`
  }
}

function stokCamTipi(stok: StokLite): 'dc' | 'fume' | 'sinerji' | 'konfor' | 'reflekte' | 'buzlu' {
  const ad = normalizeMetin(stok?.ad ?? '')
  if (ad.includes('fume')) return 'fume'
  if (ad.includes('sinerji')) return 'sinerji'
  if (ad.includes('konfor')) return 'konfor'
  if (ad.includes('reflekte')) return 'reflekte'
  if (ad.includes('buzlu')) return 'buzlu'
  return 'dc'
}

function isicamMi(stok: StokLite): boolean {
  return !!getStokKatmanYapisi(stok)
}

function paneKalinliklari(stok: StokLite): number[] {
  const katman = getStokKatmanYapisi(stok)
  if (!katman) return []
  const parts = katman.split('+').map((p) => parseInt(p, 10)).filter(Number.isFinite)
  if (parts.length < 2) return []
  if (parts.length === 2) return [parts[0], parts[1]]
  return [parts[0], parts[parts.length - 1]]
}

function musteriEtiketi(d: NonNullable<UretimEmriDetay['siparis_detaylari']>): string {
  const ad = d.siparisler?.alt_musteri?.trim() || d.siparisler?.cari?.ad?.trim() || ''
  return ad.length > CL_MAX_UZUNLUK ? ad.slice(0, CL_MAX_UZUNLUK) : ad
}

function famEtiketi(fam: string, stokOrnek: StokLite | null, famHaritasi: OptiFamEsleme[]): string {
  if (stokOrnek) {
    const kod = stokOrnek.kod
    const haritada = famHaritasi.find((e) => e.fam_kodu === fam && e.stok_kod === kod)
    if (haritada && stokOrnek.ad) return stokOrnek.ad
    if (stokOrnek.ad && optiFamKodu(stokOrnek, famHaritasi) === fam) return stokOrnek.ad
  }
  if (fam.endsWith('DC')) return `${fam.replace('DC', '')} mm DC`
  if (fam.endsWith('FUME')) return `${fam.replace('FUME', '')}mm Fume`
  return fam
}

/** Tek sipariş satırından export parçaları üretir. */
export function optiParcalariUret(
  item: UretimEmriDetay,
  hedefFam: string,
  famHaritasi: OptiFamEsleme[] = [],
  citaDusme = 0,
): OptiParca[] {
  const d = item.siparis_detaylari
  if (!d) return []

  const stok = d.stok ?? null
  const adet = Math.max(1, d.adet ?? 1)
  const cl = musteriEtiketi(d)
  const ord = d.siparisler?.siparis_no ?? ''
  const dusme = Math.max(0, Math.round(citaDusme))
  const b = Math.max(1, d.genislik_mm - dusme)
  const h = Math.max(1, d.yukseklik_mm - dusme)
  const parcalar: OptiParca[] = []

  if (isicamMi(stok)) {
    const panes = paneKalinliklari(stok)
    const tip = stokCamTipi(stok)
    for (const kal of panes) {
      const paneTip = hedefFam.endsWith('DC') ? 'dc' : tip
      const fam = optiPaneFamKodu(kal, paneTip)
      if (fam !== hedefFam) continue
      for (let i = 0; i < adet; i++) {
        parcalar.push({ b, h, cl, ord, fam })
      }
    }
    return parcalar
  }

  const fam = optiFamKodu(stok, famHaritasi)
  if (fam !== hedefFam) return []

  for (let i = 0; i < adet; i++) {
    parcalar.push({ b, h, cl, ord, fam })
  }
  return parcalar
}

/** Batch'teki tüm export parçalarını hedef FAM için üretir. */
export function optiTumParcalar(
  detaylar: UretimEmriDetay[],
  hedefFam: string,
  famHaritasi: OptiFamEsleme[] = [],
  citaDusme = 0,
): OptiParca[] {
  return detaylar.flatMap((item) => optiParcalariUret(item, hedefFam, famHaritasi, citaDusme))
}

/** Batch içinde export edilebilir cam türlerini listeler. */
export function optiExportTurleri(
  detaylar: UretimEmriDetay[],
  famHaritasi: OptiFamEsleme[] = [],
): OptiExportTuru[] {
  const sayac = new Map<string, { adet: number; ornekStok: StokLite }>()

  for (const item of detaylar) {
    const d = item.siparis_detaylari
    if (!d) continue
    const stok = d.stok ?? null
    const adet = Math.max(1, d.adet ?? 1)

    if (isicamMi(stok)) {
      const panes = paneKalinliklari(stok)
      const tip = stokCamTipi(stok)
      for (const kal of panes) {
        const famDc = optiPaneFamKodu(kal, 'dc')
        const famOzel = optiPaneFamKodu(kal, tip)
        for (const fam of new Set([famDc, famOzel])) {
          const mevcut = sayac.get(fam) ?? { adet: 0, ornekStok: stok }
          mevcut.adet += adet
          sayac.set(fam, mevcut)
        }
      }
    } else {
      const fam = optiFamKodu(stok, famHaritasi)
      const mevcut = sayac.get(fam) ?? { adet: 0, ornekStok: stok }
      mevcut.adet += adet
      sayac.set(fam, mevcut)
    }
  }

  return [...sayac.entries()]
    .map(([anahtar, { adet, ornekStok }]) => ({
      anahtar,
      etiket: famEtiketi(anahtar, ornekStok, famHaritasi),
      adet,
    }))
    .sort((a, b) => a.etiket.localeCompare(b.etiket, 'tr'))
}

/** Parçaları gruplayıp IMP içeriği üretir. */
export function optiImpOlustur(parcalar: OptiParca[]): string {
  const grup = new Map<string, OptiParca & { n: number }>()

  for (const p of parcalar) {
    const key = `${p.b}|${p.h}|${p.cl}|${p.ord}|${p.fam}`
    const mevcut = grup.get(key)
    if (mevcut) {
      mevcut.n += 1
    } else {
      grup.set(key, { ...p, n: 1 })
    }
  }

  const satirlar = [...grup.values()].map((p, idx) => {
    return `N${idx + 1}=;N=${p.n};B=${p.b};H=${p.h};CL=${p.cl};ORD=${p.ord};FAM=${p.fam};MOL=0;STND=0;PRIO=0;NOROT=;TOOL=;NOSTETI=;NUMETI=;DES=;NOTA1=;NOTA2=;NOTA3= `
  })

  return `[PIECES]\r\n${satirlar.join('\r\n')}\r\n`
}

export function optiDosyaAdi(sayac: number): string {
  return `OP_${String(sayac).padStart(5, '0')}.IMP`
}
