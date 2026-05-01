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

/** Kompozisyon string'i (katman_yapisi tek otorite). */
export function getCamKompozisyon(detay: DetayLite, _stok: StokLite): string {
  return normalizeKatmanYapisi(detay.katman_yapisi)
}

/** Etikete basılacak tam cam tipi: "4+16+4 KONFOR". */
export function getEtiketCamTipi(detay: DetayLite, stok: StokLite): string {
  const komp = getCamKompozisyon(detay, stok)
  const ad = stok?.ad?.trim() ?? ''
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
