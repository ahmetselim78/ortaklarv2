export type DplRotasyon = 1 | 2 | 3 | 4

export interface DplEtiketIskeletiSecenekleri {
  nokta_genislik?: 1 | 2
  nokta_yukseklik?: 1 | 2 | 3
  isi?: number
  metrik?: boolean
}

function dplTamsayi(n: number, min: number, max: number, alan: string): number {
  if (!Number.isFinite(n)) throw new Error(`${alan} sayısal olmalı.`)
  const yuvarlanmis = Math.round(n)
  if (yuvarlanmis < min || yuvarlanmis > max) {
    throw new Error(`${alan} ${min}-${max} aralığında olmalı.`)
  }
  return yuvarlanmis
}

/** DPL metrik modunda row/column değerleri 0,1 mm birimindedir. */
export function mmToDplMetric(mm: number): number {
  return dplTamsayi(mm * 10, 0, 9999, 'Konum')
}

/** DPL barkod yüksekliği 1/100 inç birimindedir (0,254 mm). */
export function mmToDplBarkodYuksekligi(mm: number): number {
  return dplTamsayi(mm / 0.254, 1, 999, 'Barkod yüksekliği')
}

/** Row/column için 4 haneli sıfır doldurma. */
export function dplPad4(n: number): string {
  return dplTamsayi(n, 0, 9999, 'DPL koordinatı').toString().padStart(4, '0')
}

/** Türkçe karakterleri ASCII karşılıklarına çevirir (DPL ASCII akışını bozmamak için). */
export function dplAscii(str: string): string {
  return str
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/×/g, 'x')
    .replace(/[şŞ]/g, s => (s === 'ş' ? 's' : 'S'))
    .replace(/[ğĞ]/g, g => (g === 'ğ' ? 'g' : 'G'))
    .replace(/[üÜ]/g, u => (u === 'ü' ? 'u' : 'U'))
    .replace(/[öÖ]/g, o => (o === 'ö' ? 'o' : 'O'))
    .replace(/[ıİ]/g, i => (i === 'ı' ? 'i' : 'I'))
    .replace(/[çÇ]/g, c => (c === 'ç' ? 'c' : 'C'))
    .replace(/[^\x20-\x7E]/g, '?')
}

/**
 * Datamax DPL dahili bitmap metin alanı — 15 karakterlik sabit başlık + veri + CR.
 * rotation + font + widthMultiplier + heightMultiplier + 000 + row(4) + col(4)
 */
export function dplMetin(
  rotation: DplRotasyon,
  font: number,
  width: number,
  height: number,
  row: number,
  col: number,
  data: string,
): string {
  const fontNo = dplTamsayi(font, 0, 8, 'Font')
  const widthMultiplier = dplTamsayi(width, 1, 9, 'Yazı genişlik çarpanı')
  const heightMultiplier = dplTamsayi(height, 1, 9, 'Yazı yükseklik çarpanı')
  const header =
    `${rotation}${fontNo}${widthMultiplier}${heightMultiplier}000` +
    dplPad4(row) + dplPad4(col)
  if (header.length !== 15) {
    throw new Error(`DPL metin başlığı 15 değil: ${header.length}`)
  }
  return `${header}${dplAscii(data)}\r`
}

/**
 * Datamax DPL Code 128 barkod alanı — 15 karakterlik sabit başlık + veri + CR.
 * rotation + barcodeId + wide/module + narrow/module + height(3) + row(4) + col(4)
 */
export function dplBarkod(
  row: number,
  col: number,
  data: string,
  height = 80,
  humanReadable = false,
  rotation: DplRotasyon = 1,
  moduleWidth = 0,
): string {
  const barcodeId = humanReadable ? 'E' : 'e'
  const module = dplTamsayi(moduleWidth, 0, 9, 'Barkod modül genişliği')
  const height3 = dplTamsayi(height, 1, 999, 'Barkod yüksekliği').toString().padStart(3, '0')
  const header =
    `${rotation}${barcodeId}${module}${module}${height3}` +
    dplPad4(row) + dplPad4(col)
  if (header.length !== 15) {
    throw new Error(`DPL barkod başlığı 15 değil: ${header.length}`)
  }
  return `${header}${dplAscii(data)}\r`
}

/** Label formatı: açık metrik birim + baskı koyuluğu + nokta büyüklüğü + alanlar. */
export function dplEtiketIskeleti(
  satirlar: string,
  secenekler: DplEtiketIskeletiSecenekleri = {},
): string {
  const noktaGenislik = secenekler.nokta_genislik ?? 2
  const noktaYukseklik = secenekler.nokta_yukseklik ?? 2
  const isi = dplTamsayi(secenekler.isi ?? 10, 0, 30, 'Baskı koyuluğu')
  const metrik = secenekler.metrik ?? true

  return [
    '\x02L\r',
    `H${isi.toString().padStart(2, '0')}\r`,
    `D${noktaGenislik}${noktaYukseklik}\r`,
    metrik ? 'm\r' : '',
    satirlar,
    'Q0001\r',
    'E\r',
  ].join('')
}

/** Büyük ve görünür metin örnekleri — saha testi adım 1. */
export function dplMetinTestEtiketi(): string {
  const satirlar = [
    dplMetin(1, 2, 2, 2, 50, 50, 'METIN TEST 2X2'),
    dplMetin(1, 2, 3, 3, 160, 50, 'METIN 3X3'),
    dplMetin(1, 3, 2, 2, 290, 50, '123456'),
  ].join('')
  return dplEtiketIskeleti(satirlar)
}

/** Yalnızca Code 128 barkod — saha testi adım 2. */
export function dplBarkodTestEtiketi(): string {
  const satirlar = dplBarkod(50, 50, '37', mmToDplBarkodYuksekligi(12), false, 1, 1)
  return dplEtiketIskeleti(satirlar)
}
