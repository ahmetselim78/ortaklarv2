import { getStokAdKatmansiz, getStokKatmanYapisi } from '@/lib/cam'
import {
  CIFT_FUME_ISICAM_KODU,
  FUME_KONFOR_ISICAM_KODU,
  TEK_YUZ_FUME_ISICAM_KODLARI,
} from '@/lib/fixtures/stok-katalog-036.fixture'

export type PaneCamTipi = 'dc' | 'fume' | 'sinerji' | 'konfor' | 'reflekte' | 'buzlu' | 'yesil'

export class OptiPaneCozumlemeHatasi extends Error {
  readonly stokKod: string
  readonly stokAd: string
  readonly belirsizPane: string

  constructor(stokKod: string, stokAd: string, belirsizPane: string) {
    super(
      `IMP export durduruldu — stok ${stokKod || '?'} (${stokAd || '—'}): ${belirsizPane}`,
    )
    this.name = 'OptiPaneCozumlemeHatasi'
    this.stokKod = stokKod
    this.stokAd = stokAd
    this.belirsizPane = belirsizPane
  }
}

type StokPaneLite = {
  kod?: string | null
  ad?: string | null
  grup?: string | null
  katman_yapisi?: string | null
} | null | undefined

function normalizeMetin(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ıİ]/g, 'i')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function stokKodNum(kod: string | null | undefined): number | null {
  if (!kod) return null
  const n = parseInt(kod.replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function camKatmanSayisi(katman: string): number {
  const parts = katman.split('+').map((p) => parseInt(p, 10)).filter(Number.isFinite)
  if (parts.length < 2) return 0
  return Math.ceil((parts.length + 1) / 2)
}

function paneSayisi(katman: string): number {
  const camSayisi = camKatmanSayisi(katman)
  if (camSayisi < 2) return 0
  if (camSayisi > 2) return camSayisi
  return 2
}

function tekTipPane(tip: PaneCamTipi, adet: number): PaneCamTipi[] {
  return Array.from({ length: adet }, () => tip)
}

function ucluCamMi(stok: StokPaneLite, katman: string): boolean {
  const grup = (stok?.grup ?? '').toUpperCase()
  if (grup.includes('ÜÇLÜ') || grup.includes('UCLU')) return true
  return camKatmanSayisi(katman) > 2
}

function tekYuzFumeAdDeseni(ad: string): boolean {
  if (!ad.includes('fume') && !ad.includes('füme')) return false
  if (!ad.includes('isicam')) return false
  if (ad.includes('cift') || ad.includes('çift')) return false
  if (ad.includes('konfor')) return false
  return true
}

function tekYuzFumeIsicamPane(kod: string, ad: string, paneAdet: number): PaneCamTipi[] | null {
  if (TEK_YUZ_FUME_ISICAM_KODLARI.has(kod)) {
    return paneAdet === 2 ? ['dc', 'fume'] : tekTipPane('dc', paneAdet)
  }
  if (tekYuzFumeAdDeseni(ad)) {
    return paneAdet === 2 ? ['dc', 'fume'] : tekTipPane('dc', paneAdet)
  }
  return null
}

/**
 * Isıcam stok kartından dış/iç pane cam tiplerini çözer.
 * Öncelik: kod aralığı + grup + katalog ad kalıbı.
 * Belirsiz kombinasyonlarda hata fırlatır (sessiz skip yok).
 */
export function paneCamTipleri(stok: StokPaneLite): PaneCamTipi[] {
  const kod = stok?.kod?.trim() ?? ''
  const ad = normalizeMetin(getStokAdKatmansiz(stok))
  const grup = (stok?.grup ?? '').toUpperCase()
  const katman = getStokKatmanYapisi(stok)

  if (!katman) {
    throw new OptiPaneCozumlemeHatasi(
      kod,
      stok?.ad ?? '',
      'Isıcam katman yapısı bulunamadı veya pane sayısı yetersiz.',
    )
  }

  if (ucluCamMi(stok, katman)) {
    throw new OptiPaneCozumlemeHatasi(
      kod,
      stok?.ad ?? '',
      'Üçlü cam (3+ cam katmanı) IMP export kapsamında desteklenmiyor.',
    )
  }

  const paneAdet = paneSayisi(katman)
  if (paneAdet < 2) {
    throw new OptiPaneCozumlemeHatasi(
      kod,
      stok?.ad ?? '',
      'Isıcam katman yapısı bulunamadı veya pane sayısı yetersiz.',
    )
  }

  const kodNum = stokKodNum(kod)

  if (kodNum != null) {
    if (kodNum >= 10000 && kodNum <= 10099) {
      if (ad.includes('buzlu') || ad.includes('fume') || ad.includes('reflekte') || ad.includes('sinerji') || ad.includes('konfor')) {
        throw new OptiPaneCozumlemeHatasi(
          kod,
          stok?.ad ?? '',
          '10000 serisi stokta beklenmeyen karışık tip ifadesi.',
        )
      }
      return tekTipPane('dc', paneAdet)
    }

    if (kodNum >= 10100 && kodNum <= 10199) {
      if (!ad.includes('buzlu')) {
        throw new OptiPaneCozumlemeHatasi(
          kod,
          stok?.ad ?? '',
          '10100 serisi stokta BUZLU pane tipi kanıtlanamadı.',
        )
      }
      return paneAdet === 2 ? ['dc', 'buzlu'] : tekTipPane('dc', paneAdet)
    }

    if (kod === CIFT_FUME_ISICAM_KODU || ad.includes('cift fume') || ad.includes('çift fume') || ad.includes('cift füme')) {
      return tekTipPane('fume', paneAdet)
    }

    if (kod === FUME_KONFOR_ISICAM_KODU || (ad.includes('fume') && ad.includes('konfor') && !ad.includes('cift') && !ad.includes('çift'))) {
      return paneAdet === 2 ? ['fume', 'konfor'] : tekTipPane('fume', paneAdet)
    }

    if (kodNum >= 10200 && kodNum <= 10299) {
      const tekYuz = tekYuzFumeIsicamPane(kod, ad, paneAdet)
      if (tekYuz) return tekYuz
      throw new OptiPaneCozumlemeHatasi(
        kod,
        stok?.ad ?? '',
        '10200 serisi tek-yüz FUME ısıcam: dış/iç pane sırası katalogdan kanıtlanamadı.',
      )
    }

    if (kodNum >= 10300 && kodNum <= 10399) {
      if (!ad.includes('reflekte')) {
        throw new OptiPaneCozumlemeHatasi(
          kod,
          stok?.ad ?? '',
          '10300 serisi stokta REFLEKTE pane tipi kanıtlanamadı.',
        )
      }
      return paneAdet === 2 ? ['dc', 'reflekte'] : tekTipPane('dc', paneAdet)
    }

    if (kodNum >= 10400 && kodNum <= 10499) {
      if (ad.includes('buzlu')) {
        throw new OptiPaneCozumlemeHatasi(
          kod,
          stok?.ad ?? '',
          '10400 serisi saf SINERJI beklenirken BUZLU karışımı tespit edildi (10500 serisine bakın).',
        )
      }
      return tekTipPane('sinerji', paneAdet)
    }

    if (kodNum >= 10500 && kodNum <= 10599) {
      if (!ad.includes('buzlu') || !ad.includes('sinerji')) {
        throw new OptiPaneCozumlemeHatasi(
          kod,
          stok?.ad ?? '',
          '10500 serisi SINERJI+BUZLU pane tipi kanıtlanamadı.',
        )
      }
      return paneAdet === 2 ? ['sinerji', 'buzlu'] : tekTipPane('sinerji', paneAdet)
    }

    if (kodNum >= 10600 && kodNum <= 10699) {
      if (ad.includes('buzlu')) {
        throw new OptiPaneCozumlemeHatasi(
          kod,
          stok?.ad ?? '',
          '10600 serisi saf KONFOR beklenirken BUZLU karışımı tespit edildi (10700 serisine bakın).',
        )
      }
      return tekTipPane('konfor', paneAdet)
    }

    if (kodNum >= 10700 && kodNum <= 10799) {
      if (!ad.includes('buzlu') || !ad.includes('konfor')) {
        throw new OptiPaneCozumlemeHatasi(
          kod,
          stok?.ad ?? '',
          '10700 serisi KONFOR+BUZLU pane tipi kanıtlanamadı.',
        )
      }
      return paneAdet === 2 ? ['konfor', 'buzlu'] : tekTipPane('konfor', paneAdet)
    }
  }

  if (grup === 'ISICAM-S' || ad.includes('isicam sinerji')) {
    if (ad.includes('buzlu')) {
      return paneAdet === 2 ? ['sinerji', 'buzlu'] : tekTipPane('sinerji', paneAdet)
    }
    return tekTipPane('sinerji', paneAdet)
  }

  if (grup === 'ISICAM-KONFOR' || ad.includes('isicam konfor')) {
    if (ad.includes('buzlu')) {
      return paneAdet === 2 ? ['konfor', 'buzlu'] : tekTipPane('konfor', paneAdet)
    }
    if (ad.includes('fume') && !ad.includes('cift') && !ad.includes('çift')) {
      return paneAdet === 2 ? ['fume', 'konfor'] : tekTipPane('fume', paneAdet)
    }
    return tekTipPane('konfor', paneAdet)
  }

  if (ad.includes('cift fume') || ad.includes('çift fume')) return tekTipPane('fume', paneAdet)
  if (ad.includes('c buzlu') || (ad.includes('isicam c') && ad.includes('buzlu'))) {
    return paneAdet === 2 ? ['dc', 'buzlu'] : tekTipPane('dc', paneAdet)
  }
  if (ad.includes('c reflekte') || (ad.includes('isicam c') && ad.includes('reflekte'))) {
    return paneAdet === 2 ? ['dc', 'reflekte'] : tekTipPane('dc', paneAdet)
  }
  if ((ad.includes('isicam c') || /\bc\s+isicam\b/.test(ad)) && !ad.includes('buzlu') && !ad.includes('fume') && !ad.includes('reflekte')) {
    return tekTipPane('dc', paneAdet)
  }

  const tekYuzFallback = tekYuzFumeIsicamPane(kod, ad, paneAdet)
  if (tekYuzFallback) return tekYuzFallback

  if ((ad.includes('fume') || ad.includes('füme')) && ad.includes('isicam') && !ad.includes('cift') && !ad.includes('çift')) {
    throw new OptiPaneCozumlemeHatasi(
      kod,
      stok?.ad ?? '',
      'FUME ISICAM tek-yüz kombinasyonu: pane yönü belirsiz (kod aralığı veya katalog kalıbı yok).',
    )
  }

  throw new OptiPaneCozumlemeHatasi(
    kod,
    stok?.ad ?? '',
    'Pane cam tipleri yapılandırılmış stok verisinden çözülemedi.',
  )
}

export function paneKalinliklari(stok: StokPaneLite): number[] {
  const katman = getStokKatmanYapisi(stok)
  if (!katman) return []
  const parts = katman.split('+').map((p) => parseInt(p, 10)).filter(Number.isFinite)
  if (parts.length < 2) return []
  if (parts.length === 2) return [parts[0], parts[1]]
  return [parts[0], parts[parts.length - 1]]
}

/** Güvenli pane çözümleme — throw etmez, hata döner */
export function paneCamTipleriGuvenli(stok: StokPaneLite): { tipler: PaneCamTipi[] } | { hata: OptiPaneCozumlemeHatasi } {
  try {
    return { tipler: paneCamTipleri(stok) }
  } catch (e) {
    if (e instanceof OptiPaneCozumlemeHatasi) return { hata: e }
    const kod = stok?.kod?.trim() ?? ''
    return {
      hata: new OptiPaneCozumlemeHatasi(
        kod,
        stok?.ad ?? '',
        e instanceof Error ? e.message : 'Pane çözümleme hatası.',
      ),
    }
  }
}
