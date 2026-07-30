export type SisecamVadeSecenegi = 'pesin' | '60_gun' | '75_gun'
export type SisecamEbatVaryanti = 'ME' | 'JU' | 'ME+JU' | 'ME_K4' | 'SP' | 'GENEL'

export type SisecamUrunAilesi =
  | 'clear'
  | 'renkli_duzcam'
  | 'extra_clear'
  | 'ultra_clear'
  | 'tentesol'
  | 'tentesol_titanyum'
  | 'climax'
  | 'climax_select'
  | 'ecosol'
  | 'duosol'
  | 'duosol_one'
  | 'climax_lamine'
  | 'climax_select_lamine'
  | 'deco_buzlu'
  | 'flotal_renksiz'
  | 'flotal_renkli'
  | 'flotal_ultra_clear'
  | 'safeprotec_clear'
  | 'safeprotec_extra_clear'
  | 'safeprotec_tek_renkli'
  | 'safeprotec_cift_renkli'
  | 'safeprotec_opak'
  | 'soundprotec_clear'
  | 'soundprotec_extra_clear'
  | 'deco_boyali'
  | 'deco_bembeyaz'

export interface SisecamFiyatSatiri {
  satirNo: number
  urunAilesi: SisecamUrunAilesi
  urunAilesiEtiketi: string
  kalinlik: string
  detay: string
  ebatVaryanti: SisecamEbatVaryanti
  pvb: string | null
  pesin: number
  gun60: number
  gun75: number
  birim: 'TL/m2'
  hamSatir: string
}

export interface SisecamFiyatListesi {
  revizyonTarihi: string | null
  sirkulerNo: string | null
  satirlar: SisecamFiyatSatiri[]
  taninmayanSatirlar: string[]
}

export interface SisecamStokAdayi {
  id: string
  kod: string
  ad: string
  aktif?: boolean | null
}

export interface SisecamStokEslesmesi {
  stok: SisecamStokAdayi
  satir: SisecamFiyatSatiri | null
  durum: 'eslesti' | 'eslesmedi' | 'birden_fazla'
  adaylar: SisecamFiyatSatiri[]
}

const AILE_DESENLERI: Array<{
  desen: RegExp
  kod: SisecamUrunAilesi
  etiket: string
}> = [
  { desen: /Şişecam\s+Tentesol\s+Titanyum/i, kod: 'tentesol_titanyum', etiket: 'Şişecam Tentesol Titanyum' },
  { desen: /Şişecam\s+Tentesol/i, kod: 'tentesol', etiket: 'Şişecam Tentesol' },
  { desen: /Şişecam\s+Climax\s+Select\s*-\s*Lamine/i, kod: 'climax_select_lamine', etiket: 'Şişecam Climax Select - Lamine' },
  { desen: /Şişecam\s+Climax\s*-\s*Lamine/i, kod: 'climax_lamine', etiket: 'Şişecam Climax - Lamine' },
  { desen: /Şişecam\s+Climax\s+Select/i, kod: 'climax_select', etiket: 'Şişecam Climax Select' },
  { desen: /Şişecam\s+Climax/i, kod: 'climax', etiket: 'Şişecam Climax' },
  { desen: /Şişecam\s+Duosol\s+70\s+One/i, kod: 'duosol_one', etiket: 'Şişecam Duosol 70 One / Duosol 50 One' },
  { desen: /Şişecam\s+Duosol\s+70/i, kod: 'duosol', etiket: 'Şişecam Duosol 70' },
  { desen: /Şişecam\s+Ecosol/i, kod: 'ecosol', etiket: 'Şişecam Ecosol' },
  { desen: /Şişecam\s+Deco\s+Buzlu/i, kod: 'deco_buzlu', etiket: 'Şişecam Deco Buzlu' },
  { desen: /Flotal\s*-\s*Renksiz/i, kod: 'flotal_renksiz', etiket: 'Flotal - Renksiz' },
  { desen: /Flotal\s*-\s*Renkli/i, kod: 'flotal_renkli', etiket: 'Flotal - Renkli' },
  { desen: /Flotal\s*-\s*Ultra\s+Clear/i, kod: 'flotal_ultra_clear', etiket: 'Flotal - Ultra Clear' },
  { desen: /SafeProtec\s*-\s*Extra\s+Clear/i, kod: 'safeprotec_extra_clear', etiket: 'Şişecam SafeProtec - Extra Clear' },
  { desen: /SafeProtec\s*-\s*Tek\s+cam\s+renkli/i, kod: 'safeprotec_tek_renkli', etiket: 'Şişecam SafeProtec - Tek cam renkli' },
  { desen: /SafeProtec\s*-\s*Çift\s+cam\s+renkli/i, kod: 'safeprotec_cift_renkli', etiket: 'Şişecam SafeProtec - Çift cam renkli' },
  { desen: /SafeProtec\s+Opak/i, kod: 'safeprotec_opak', etiket: 'Şişecam SafeProtec Opak' },
  { desen: /SafeProtec\s*-\s*Clear/i, kod: 'safeprotec_clear', etiket: 'Şişecam SafeProtec - Clear' },
  { desen: /SoundProtec\s*-\s*Extra\s+Clear/i, kod: 'soundprotec_extra_clear', etiket: 'Şişecam SoundProtec - Extra Clear' },
  { desen: /SoundProtec\s*-\s*Clear/i, kod: 'soundprotec_clear', etiket: 'Şişecam SoundProtec - Clear' },
  { desen: /Şişecam\s+Deco\s+Bembeyaz/i, kod: 'deco_bembeyaz', etiket: 'Şişecam Deco Bembeyaz' },
  { desen: /Şişecam\s+Deco\s+Boyalı/i, kod: 'deco_boyali', etiket: 'Şişecam Deco Boyalı' },
  { desen: /Şişecam\s+Renkli\s+Düz\s+Cam/i, kod: 'renkli_duzcam', etiket: 'Şişecam Renkli Düz Cam' },
  { desen: /Şişecam\s+Extra\s+Clear/i, kod: 'extra_clear', etiket: 'Şişecam Extra Clear' },
  { desen: /Şişecam\s+Ultra\s+Clear/i, kod: 'ultra_clear', etiket: 'Şişecam Ultra Clear' },
  { desen: /Şişecam\s+Clear/i, kod: 'clear', etiket: 'Şişecam Clear' },
]

function paraDegeri(raw: string): number {
  const deger = Number(raw.replace(/,/g, ''))
  return Number.isFinite(deger) ? deger : Number.NaN
}

function isoTarih(gun: string, ay: string, yil: string): string {
  return `${yil.padStart(4, '0')}-${ay.padStart(2, '0')}-${gun.padStart(2, '0')}`
}

function ebatVaryanti(detay: string): SisecamEbatVaryanti {
  const duz = detay.toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ').trim()
  if (/\bME\s*\+\s*JU\b/.test(duz)) return 'ME+JU'
  if (/\bME\s+K4\b/.test(duz)) return 'ME_K4'
  if (/\bJU\b/.test(duz)) return 'JU'
  if (/\bME\b/.test(duz)) return 'ME'
  if (/\bSP\b/.test(duz)) return 'SP'
  return 'GENEL'
}

function normalizeMetin(metin: string): string {
  return metin
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '')
    .trim()
}

const FIYAT_UCLUSU_DESENI =
  /^(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})$/
const URUN_GOVDESI_DESENI =
  /^\d+(?:[.,]\d+)?(?:\+\d+(?:[.,]\d+)?)*\s*(?:.*)?$/

function bolunmusFiyatSatirlariniBirlesitir(satirlar: string[]): string[] {
  const sonuc: string[] = []
  for (let index = 0; index < satirlar.length; index += 1) {
    const mevcut = satirlar[index]
    const sonraki = satirlar[index + 1]
    if (
      sonraki
      && URUN_GOVDESI_DESENI.test(mevcut)
      && FIYAT_UCLUSU_DESENI.test(sonraki)
    ) {
      sonuc.push(`${mevcut} ${sonraki}`)
      index += 1
      continue
    }
    if (
      sonraki
      && FIYAT_UCLUSU_DESENI.test(mevcut)
      && URUN_GOVDESI_DESENI.test(sonraki)
    ) {
      sonuc.push(`${sonraki} ${mevcut}`)
      index += 1
      continue
    }
    sonuc.push(mevcut)
  }
  return sonuc
}

export function sisecamFiyatListesiniCozumle(metin: string): SisecamFiyatListesi {
  const normalized = normalizeMetin(metin)
  const tarihEslesmesi = normalized.match(/Revize\s+Tarihi:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i)
  const noEslesmesi = normalized.match(/Revize\s+Tarihi:.*?No:\s*(\d+)/i)
  const satirlar: SisecamFiyatSatiri[] = []
  const taninmayanSatirlar: string[] = []
  let aktifAile: (typeof AILE_DESENLERI)[number] | null = null

  const hamSatirlar = bolunmusFiyatSatirlariniBirlesitir(
    normalized.split('\n').map(normalizeMetin).filter(Boolean),
  )
  hamSatirlar.forEach((hamSatir, index) => {
    const aile = AILE_DESENLERI.find(({ desen }) => desen.test(hamSatir))
    if (aile) {
      aktifAile = aile
      return
    }

    if (
      !aktifAile
      || /^\(/.test(hamSatir)
      || /^(2026|ÜRÜN CİNSİ|KAPLAMA|TL\s*\/)/i.test(hamSatir)
    ) return

    const fiyatliSatir = hamSatir.match(
      /^(.*?)\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})$/,
    )
    if (!fiyatliSatir) {
      if (/^\d/.test(hamSatir)) taninmayanSatirlar.push(hamSatir)
      return
    }

    const govde = fiyatliSatir[1].trim()
    const govdeEslesmesi = govde.match(/^(\d+(?:[.,]\d+)?(?:\+\d+(?:[.,]\d+)?)?)\s*(.*)$/)
    if (!govdeEslesmesi) {
      taninmayanSatirlar.push(hamSatir)
      return
    }

    const pesin = paraDegeri(fiyatliSatir[2])
    const gun60 = paraDegeri(fiyatliSatir[3])
    const gun75 = paraDegeri(fiyatliSatir[4])
    if (![pesin, gun60, gun75].every(Number.isFinite)) {
      taninmayanSatirlar.push(hamSatir)
      return
    }

    const detay = govdeEslesmesi[2].trim()
    satirlar.push({
      satirNo: index + 1,
      urunAilesi: aktifAile.kod,
      urunAilesiEtiketi: aktifAile.etiket,
      kalinlik: govdeEslesmesi[1].replace(',', '.'),
      detay,
      ebatVaryanti: ebatVaryanti(detay),
      pvb: detay.match(/\b(\d+[,.]\d+)\s*PVB\b/i)?.[1].replace(',', '.') ?? null,
      pesin,
      gun60,
      gun75,
      birim: 'TL/m2',
      hamSatir,
    })
  })

  return {
    revizyonTarihi: tarihEslesmesi
      ? isoTarih(tarihEslesmesi[1], tarihEslesmesi[2], tarihEslesmesi[3])
      : null,
    sirkulerNo: noEslesmesi?.[1] ?? null,
    satirlar,
    taninmayanSatirlar,
  }
}

export function sisecamVadeFiyati(
  satir: SisecamFiyatSatiri,
  vade: SisecamVadeSecenegi,
): number {
  if (vade === 'pesin') return satir.pesin
  if (vade === '60_gun') return satir.gun60
  return satir.gun75
}

type EslesmeKurali = {
  aile: SisecamUrunAilesi
  kalinlik: string
  detay?: RegExp
  tercih?: SisecamEbatVaryanti[]
}

export const SISECAM_PDF_MANUEL_FIYAT_STOKLARI = [
  { kod: '01009', ad: 'Renkli Cam' },
  { kod: '01012', ad: 'Satina Beyaz' },
] as const

const SISECAM_PDF_MANUEL_FIYAT_STOK_KODLARI = new Set<string>(
  SISECAM_PDF_MANUEL_FIYAT_STOKLARI.map(({ kod }) => kod),
)

export function sisecamPdfManuelFiyatGerektirir(stokKodu: string): boolean {
  return SISECAM_PDF_MANUEL_FIYAT_STOK_KODLARI.has(stokKodu.trim())
}

const STOK_ESLESME_KURALLARI: Record<string, EslesmeKurali> = {
  '01002': { aile: 'clear', kalinlik: '4', tercih: ['ME', 'JU'] },
  '01003': { aile: 'clear', kalinlik: '5', tercih: ['ME', 'JU'] },
  '01004': { aile: 'clear', kalinlik: '6', tercih: ['ME', 'JU'] },
  '01005': { aile: 'clear', kalinlik: '8', tercih: ['ME', 'JU'] },
  '01006': { aile: 'clear', kalinlik: '10', tercih: ['ME', 'JU'] },
  '01008': { aile: 'deco_buzlu', kalinlik: '4' },
  '01013': { aile: 'renkli_duzcam', kalinlik: '4', detay: /\bFüme\b/i, tercih: ['ME', 'JU'] },
  '01014': { aile: 'renkli_duzcam', kalinlik: '8', detay: /\bFüme\b/i, tercih: ['ME', 'JU'] },
  '01015': { aile: 'renkli_duzcam', kalinlik: '4', detay: /\bBronz\b/i, tercih: ['ME', 'JU'] },
  '01016': { aile: 'safeprotec_clear', kalinlik: '4+4', detay: /\b0[,.]38\s*PVB\b/i },
  '01017': { aile: 'flotal_renksiz', kalinlik: '4' },
  '01018': { aile: 'tentesol', kalinlik: '4', detay: /\bBronz\b/i, tercih: ['ME', 'JU'] },
  '01019': { aile: 'tentesol', kalinlik: '4', detay: /\bFüme\b/i, tercih: ['ME', 'JU'] },
  '01020': { aile: 'climax', kalinlik: '4' },
  '01022': { aile: 'climax_select', kalinlik: '4' },
  '01023': { aile: 'climax_select', kalinlik: '6' },
}

function terciheGoreSirala(
  satirlar: SisecamFiyatSatiri[],
  tercihler: SisecamEbatVaryanti[] = [],
): SisecamFiyatSatiri[] {
  const sira = new Map(tercihler.map((varyant, index) => [varyant, index]))
  return [...satirlar].sort((a, b) => (
    (sira.get(a.ebatVaryanti) ?? 999) - (sira.get(b.ebatVaryanti) ?? 999)
  ))
}

export function sisecamSatirlariniStoklarlaEslestir(
  satirlar: SisecamFiyatSatiri[],
  stoklar: SisecamStokAdayi[],
): SisecamStokEslesmesi[] {
  return stoklar
    .filter((stok) => stok.aktif !== false && STOK_ESLESME_KURALLARI[stok.kod])
    .map((stok) => {
      const kural = STOK_ESLESME_KURALLARI[stok.kod]
      const adaylar = terciheGoreSirala(
        satirlar.filter((satir) => (
          satir.urunAilesi === kural.aile
          && satir.kalinlik === kural.kalinlik
          && (!kural.detay || kural.detay.test(satir.detay))
        )),
        kural.tercih,
      )
      if (adaylar.length === 0) {
        return { stok, satir: null, durum: 'eslesmedi', adaylar }
      }
      if (adaylar.length === 1 || kural.tercih?.includes(adaylar[0].ebatVaryanti)) {
        return { stok, satir: adaylar[0], durum: 'eslesti', adaylar }
      }
      return { stok, satir: null, durum: 'birden_fazla', adaylar }
    })
}

type PdfMetinKalemi = {
  str?: string
  transform?: number[]
}

export async function sisecamPdfMetniniOku(file: File): Promise<string> {
  // pdfjs-dist tarayıcıya özgü DOM sınıflarını modül yüklenirken değerlendiriyor.
  // Ayrıştırıcı yardımcılarının Node/Vitest ortamında da kullanılabilmesi için
  // PDF motorunu yalnızca gerçekten bir dosya okunacağı zaman yüklüyoruz.
  const pdfjs = typeof globalThis.DOMMatrix === 'undefined'
    ? await import('pdfjs-dist/legacy/build/pdf.mjs')
    : await import('pdfjs-dist')
  const { getDocument, GlobalWorkerOptions } = pdfjs
  if (typeof window !== 'undefined') {
    GlobalWorkerOptions.workerSrc = '/pdf.worker.js'
  }
  const buffer = await file.arrayBuffer()
  const belge = await getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: false,
    useSystemFonts: true,
  }).promise
  const sayfalar: string[] = []

  for (let sayfaNo = 1; sayfaNo <= belge.numPages; sayfaNo += 1) {
    const sayfa = await belge.getPage(sayfaNo)
    const icerik = await sayfa.getTextContent()
    const satirlar = new Map<number, Array<{ x: number; metin: string }>>()
    for (const item of icerik.items as PdfMetinKalemi[]) {
      const metin = item.str?.trim()
      if (!metin || !item.transform) continue
      const x = item.transform[4] ?? 0
      const y = Math.round((item.transform[5] ?? 0) * 2) / 2
      const grup = satirlar.get(y) ?? []
      grup.push({ x, metin })
      satirlar.set(y, grup)
    }
    sayfalar.push(
      [...satirlar.entries()]
        .sort(([yA], [yB]) => yB - yA)
        .map(([, kalemler]) => kalemler
          .sort((a, b) => a.x - b.x)
          .map(({ metin }) => metin)
          .join(' '))
        .join('\n'),
    )
  }

  return sayfalar.join('\n')
}
