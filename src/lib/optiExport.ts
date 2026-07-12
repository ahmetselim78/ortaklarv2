import {
  isicamPaneFamCoz,
  isicamStokMu,
  monolitFamCoz,
  hctFamEtiketi,
  optiExportSorunlariTekillestir,
  type HctFamSonuc,
  type OptiExportSorun,
} from '@/lib/hctFam'
import {
  OptiPaneCozumlemeHatasi,
  paneCamTipleriGuvenli,
  paneKalinliklari,
  type PaneCamTipi,
} from '@/lib/paneCamTipi'
import type { OptiFamEsleme } from '@/types/ayarlar'
import type { UretimEmriDetay } from '@/types/uretim'

type StokLite = NonNullable<UretimEmriDetay['siparis_detaylari']>['stok']

export class OptiExportSiraNoHatasi extends Error {
  readonly detayId: string
  readonly siraNo: number | null | undefined

  constructor(detayId: string, siraNo: number | null | undefined) {
    super(
      `IMP export durduruldu — batch sıra numarası geçersiz (detay: ${detayId}, sira_no: ${siraNo ?? '—'})`,
    )
    this.name = 'OptiExportSiraNoHatasi'
    this.detayId = detayId
    this.siraNo = siraNo
  }
}

export class OptiExportKritikHatasi extends Error {
  readonly sorunlar: OptiExportSorun[]

  constructor(sorunlar: OptiExportSorun[]) {
    super('IMP export durduruldu — kritik çözümleme sorunları var.')
    this.name = 'OptiExportKritikHatasi'
    this.sorunlar = sorunlar
  }
}

export interface ImpPiece {
  sourceLineId: string
  sourceSiraNo: number
  nota3: string
  n: number
  b: number
  h: number
  cl: string
  ord: string
  fam: string
}

/** @deprecated ImpPiece kullanın */
export interface OptiParca {
  b: number
  h: number
  cl: string
  ord: string
  fam: string
}

export interface OptiExportTuru {
  anahtar: string
  etiket: string
  adet: number
}

export interface OptiPaneAnaliz {
  index: number
  kalinlik: number
  tip: PaneCamTipi
  fam: string
  famSonuc: HctFamSonuc
}

export interface OptiSatirAnaliz {
  detayId: string
  stokKod: string
  stokAd: string
  adet: number
  isicam: boolean
  paneller: OptiPaneAnaliz[]
  monolitFam?: HctFamSonuc
  paneHata?: OptiPaneCozumlemeHatasi
  famHata?: string
}

export interface OptiExportAnaliz {
  satirlar: OptiSatirAnaliz[]
  turler: OptiExportTuru[]
  sorunlar: OptiExportSorun[]
  kritikVar: boolean
}

const CL_MAX_UZUNLUK = 48

export { OptiPaneCozumlemeHatasi }
export type { OptiExportSorun } from '@/lib/hctFam'

export function impSiraNoDogrula(
  siraNo: number | null | undefined,
  detayId = '',
): number {
  if (
    typeof siraNo === 'number' &&
    Number.isInteger(siraNo) &&
    siraNo > 0
  ) {
    return siraNo
  }
  throw new OptiExportSiraNoHatasi(detayId, siraNo)
}

export const VARSAYILAN_FAM_HARITASI: OptiFamEsleme[] = [
  { stok_kod: '01002', fam_kodu: '4DC' },
  { stok_kod: '01003', fam_kodu: '5DC' },
  { stok_kod: '01004', fam_kodu: '6DC' },
  { stok_kod: '01005', fam_kodu: '8DC' },
  { stok_kod: '01008', fam_kodu: '4BC' },
  { stok_kod: '01009', fam_kodu: '4REN' },
  { stok_kod: '01012', fam_kodu: '4SAT' },
  { stok_kod: '01013', fam_kodu: '4FM' },
  { stok_kod: '01014', fam_kodu: '8FM' },
  { stok_kod: '01015', fam_kodu: '4BRZ' },
  { stok_kod: '01016', fam_kodu: '44LM' },
  { stok_kod: '01017', fam_kodu: 'AYN' },
  { stok_kod: '01018', fam_kodu: '4BRZREF' },
  { stok_kod: '01019', fam_kodu: '4FUMEREF' },
  { stok_kod: '01020', fam_kodu: '4SN' },
  { stok_kod: '01022', fam_kodu: '4KF' },
  { stok_kod: '01023', fam_kodu: '6KF' },
]

function sorunEkle(
  liste: OptiExportSorun[],
  sorun: Omit<OptiExportSorun, 'etkilenenSatir' | 'etkilenenAdet'> & { etkilenenSatir?: number; etkilenenAdet?: number },
) {
  liste.push({
    ...sorun,
    etkilenenSatir: sorun.etkilenenSatir ?? 1,
    etkilenenAdet: sorun.etkilenenAdet ?? 1,
  })
}

function famUyariSonuc(sonuc: HctFamSonuc, stokKod: string, stokAd: string, adet: number, sorunlar: OptiExportSorun[]) {
  if (!sonuc.destekleniyor) {
    sorunEkle(sorunlar, {
      seviye: 'uyari',
      kod: 'HCT_DISI_FAM',
      stokKod,
      stokAd,
      fam: sonuc.fam,
      mesaj: sonuc.uyari,
      etkilenenAdet: adet,
    })
  }
}

function famEtiketi(fam: string): string {
  return hctFamEtiketi(fam)
}

export function impBoyutlari(genislik: number, yukseklik: number): { b: number; h: number } {
  const w = Math.round(genislik)
  const h = Math.round(yukseklik)
  return { b: Math.max(w, h), h: Math.min(w, h) }
}

function musteriEtiketi(d: NonNullable<UretimEmriDetay['siparis_detaylari']>): string {
  const ad = d.siparisler?.alt_musteri?.trim() || d.siparisler?.cari?.ad?.trim() || ''
  return ad.length > CL_MAX_UZUNLUK ? ad.slice(0, CL_MAX_UZUNLUK) : ad
}

function siparisOrd(d: NonNullable<UretimEmriDetay['siparis_detaylari']>): string {
  return (
    d.siparisler?.harici_siparis_no?.trim() ||
    d.siparisler?.siparis_no?.trim() ||
    ''
  )
}

function satirAnalizEt(
  item: UretimEmriDetay,
  famHaritasi: OptiFamEsleme[],
  sorunlar: OptiExportSorun[],
): OptiSatirAnaliz | null {
  const d = item.siparis_detaylari
  if (!d) return null

  const stok = d.stok ?? null
  const stokKod = stok?.kod?.trim() ?? ''
  const stokAd = stok?.ad ?? ''
  const adet = Math.max(1, d.adet ?? 1)
  const isicam = isicamStokMu(stok)

  if (isicam) {
    const paneSonuc = paneCamTipleriGuvenli(stok)
    if ('hata' in paneSonuc) {
      sorunEkle(sorunlar, {
        seviye: 'kritik',
        kod: 'PANE_COZULEMEDI',
        stokKod,
        stokAd,
        mesaj: paneSonuc.hata.belirsizPane,
        etkilenenAdet: adet,
      })
      return {
        detayId: item.id,
        stokKod,
        stokAd,
        adet,
        isicam: true,
        paneller: [],
        paneHata: paneSonuc.hata,
      }
    }

    const kalinliklar = paneKalinliklari(stok)
    const tipler = paneSonuc.tipler
    const paneller: OptiPaneAnaliz[] = []

    for (let i = 0; i < tipler.length; i++) {
      try {
        const famSonuc = isicamPaneFamCoz(kalinliklar[i], tipler[i])
        famUyariSonuc(famSonuc, stokKod, stokAd, adet, sorunlar)
        paneller.push({
          index: i,
          kalinlik: kalinliklar[i],
          tip: tipler[i],
          fam: famSonuc.fam,
          famSonuc,
        })
      } catch (e) {
        const mesaj = e instanceof Error ? e.message : 'Pane FAM çözülemedi.'
        sorunEkle(sorunlar, {
          seviye: 'kritik',
          kod: 'FAM_COZULEMEDI',
          stokKod,
          stokAd,
          fam: tipler[i],
          mesaj,
          etkilenenAdet: adet,
        })
        return {
          detayId: item.id,
          stokKod,
          stokAd,
          adet,
          isicam: true,
          paneller,
          famHata: mesaj,
        }
      }
    }

    return {
      detayId: item.id,
      stokKod,
      stokAd,
      adet,
      isicam: true,
      paneller,
    }
  }

  try {
    const { sonuc, legacyNormalize } = monolitFamCoz(stok, famHaritasi)
    if (legacyNormalize) {
      sorunEkle(sorunlar, {
        seviye: 'uyari',
        kod: 'LEGACY_FAM_NORMALIZE',
        stokKod,
        stokAd,
        fam: sonuc.fam,
        mesaj: !sonuc.destekleniyor ? sonuc.uyari : `Legacy FAM normalize edildi → ${sonuc.fam}`,
        etkilenenAdet: adet,
      })
    }
    famUyariSonuc(sonuc, stokKod, stokAd, adet, sorunlar)
    return {
      detayId: item.id,
      stokKod,
      stokAd,
      adet,
      isicam: false,
      paneller: [],
      monolitFam: sonuc,
    }
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : 'Monolit FAM çözülemedi.'
    sorunEkle(sorunlar, {
      seviye: 'kritik',
      kod: 'FAM_COZULEMEDI',
      stokKod,
      stokAd,
      mesaj,
      etkilenenAdet: adet,
    })
    return {
      detayId: item.id,
      stokKod,
      stokAd,
      adet,
      isicam: false,
      paneller: [],
      famHata: mesaj,
    }
  }
}

function turleriHesapla(satirlar: OptiSatirAnaliz[]): OptiExportTuru[] {
  const sayac = new Map<string, number>()

  for (const satir of satirlar) {
    if (satir.paneHata || satir.famHata) continue

    if (satir.isicam) {
      const famAdet = new Map<string, number>()
      for (const p of satir.paneller) {
        famAdet.set(p.fam, (famAdet.get(p.fam) ?? 0) + 1)
      }
      for (const [fam, paneCount] of famAdet) {
        sayac.set(fam, (sayac.get(fam) ?? 0) + satir.adet * paneCount)
      }
    } else if (satir.monolitFam) {
      const fam = satir.monolitFam.fam
      sayac.set(fam, (sayac.get(fam) ?? 0) + satir.adet)
    }
  }

  return [...sayac.entries()]
    .map(([anahtar, adet]) => ({
      anahtar,
      etiket: famEtiketi(anahtar),
      adet,
    }))
    .sort((a, b) => a.etiket.localeCompare(b.etiket, 'tr'))
}

/** Merkezi export analizi — throw etmez */
export function optiExportAnalizEt(
  detaylar: UretimEmriDetay[],
  famHaritasi: OptiFamEsleme[] = [],
): OptiExportAnaliz {
  const hamSorunlar: OptiExportSorun[] = []
  const satirlar: OptiSatirAnaliz[] = []

  for (const item of detaylar) {
    const d = item.siparis_detaylari
    if (!d) continue

    const satir = satirAnalizEt(item, famHaritasi, hamSorunlar)
    if (satir) satirlar.push(satir)
  }

  const sorunlar = optiExportSorunlariTekillestir(hamSorunlar)
  const kritikVar = sorunlar.some((s) => s.seviye === 'kritik')
  const turler = kritikVar ? [] : turleriHesapla(satirlar)

  return { satirlar, turler, sorunlar, kritikVar }
}

export function optiExportTurleri(
  detaylar: UretimEmriDetay[],
  famHaritasi: OptiFamEsleme[] = [],
): OptiExportTuru[] {
  return optiExportAnalizEt(detaylar, famHaritasi).turler
}

export function optiExportSorunlari(
  detaylar: UretimEmriDetay[],
  famHaritasi: OptiFamEsleme[] = [],
): OptiExportSorun[] {
  return optiExportAnalizEt(detaylar, famHaritasi).sorunlar
}

function parcalarForFam(
  analiz: OptiExportAnaliz,
  detaylar: UretimEmriDetay[],
  hedefFam: string,
): ImpPiece[] {
  if (analiz.kritikVar) {
    throw new OptiExportKritikHatasi(analiz.sorunlar.filter((s) => s.seviye === 'kritik'))
  }

  const parcalar: ImpPiece[] = []
  const satirMap = new Map(analiz.satirlar.map((s) => [s.detayId, s]))

  for (const item of detaylar) {
    const satir = satirMap.get(item.id)
    if (!satir || satir.paneHata || satir.famHata) continue

    const d = item.siparis_detaylari
    if (!d) continue

    const cl = musteriEtiketi(d)
    const ord = siparisOrd(d)
    const { b, h } = impBoyutlari(d.genislik_mm, d.yukseklik_mm)

    if (satir.isicam) {
      const eslesenPaneSayisi = satir.paneller.filter((p) => p.fam === hedefFam).length
      if (eslesenPaneSayisi === 0) continue

      const sourceSiraNo = impSiraNoDogrula(item.sira_no, item.id)
      parcalar.push({
        sourceLineId: item.id,
        sourceSiraNo,
        nota3: String(sourceSiraNo),
        n: satir.adet * eslesenPaneSayisi,
        b,
        h,
        cl,
        ord,
        fam: hedefFam,
      })
    } else if (satir.monolitFam?.fam === hedefFam) {
      const sourceSiraNo = impSiraNoDogrula(item.sira_no, item.id)
      parcalar.push({
        sourceLineId: item.id,
        sourceSiraNo,
        nota3: String(sourceSiraNo),
        n: satir.adet,
        b,
        h,
        cl,
        ord,
        fam: hedefFam,
      })
    }
  }

  return parcalar
}

/** Tek batch satırından hedef FAM için en fazla bir ImpPiece üretir. */
export function optiParcalariUret(
  item: UretimEmriDetay,
  hedefFam: string,
  famHaritasi: OptiFamEsleme[] = [],
): ImpPiece[] {
  const analiz = optiExportAnalizEt([item], famHaritasi)
  return parcalarForFam(analiz, [item], hedefFam)
}

/** Batch'teki tüm parçaları hedef FAM için üretir. */
export function optiTumParcalar(
  detaylar: UretimEmriDetay[],
  hedefFam: string,
  famHaritasi: OptiFamEsleme[] = [],
): ImpPiece[] {
  const analiz = optiExportAnalizEt(detaylar, famHaritasi)
  return parcalarForFam(analiz, detaylar, hedefFam)
}

/** Monolit stok için otomatik FAM (ayarlar paneli önizlemesi) */
export function optiFamKoduOtomatik(stok: StokLite): string {
  try {
    return monolitFamCoz(stok, []).sonuc.fam
  } catch {
    return '4DC'
  }
}

/** Monolit stok FAM — override dahil (kombinasyon stoklarda kullanılmaz) */
export function optiFamKodu(stok: StokLite, famHaritasi: OptiFamEsleme[] = []): string {
  if (isicamStokMu(stok)) {
    return '—'
  }
  try {
    return monolitFamCoz(stok, famHaritasi).sonuc.fam
  } catch {
    return optiFamKoduOtomatik(stok)
  }
}

/** Parçaları kaynak sırasıyla IMP metnine dönüştürür (birleştirme yok). */
export function optiImpOlustur(parcalar: ImpPiece[]): string {
  const satirlar = parcalar.map((p, idx) => {
    return `N${idx + 1}=;N=${p.n};B=${p.b};H=${p.h};CL=${p.cl};ORD=${p.ord};FAM=${p.fam};MOL=0;STND=0;PRIO=0;NOROT=;TOOL=;NOSTETI=;NUMETI=;DES=;NOTA1=;NOTA2=;NOTA3=${p.nota3} `
  })

  return `[PIECES]\r\n${satirlar.join('\r\n')}\r\n`
}

export function optiDosyaAdi(sayac: number): string {
  return `OP_${String(sayac).padStart(5, '0')}.IMP`
}

/** @deprecated HCT FAM kullanın */
export function optiPaneFamKodu(kalinlikMm: number, camTipi: PaneCamTipi): string {
  return isicamPaneFamCoz(kalinlikMm, camTipi).fam
}
