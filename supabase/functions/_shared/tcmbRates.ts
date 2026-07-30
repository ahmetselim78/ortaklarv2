export const TCMB_PARA_BIRIMLERI = ['USD', 'EUR'] as const
export const TCMB_KUR_TIPLERI = [
  'doviz_alis',
  'doviz_satis',
  'efektif_alis',
  'efektif_satis',
] as const

export type TcmbParaBirimi = (typeof TCMB_PARA_BIRIMLERI)[number]
export type TcmbKurTipi = (typeof TCMB_KUR_TIPLERI)[number]

export interface TcmbKurSatiri {
  para_birimi: TcmbParaBirimi
  kur_tipi: TcmbKurTipi
  try_karsiligi: number
}

const xmlEtiketleri: Record<TcmbKurTipi, string> = {
  doviz_alis: 'ForexBuying',
  doviz_satis: 'ForexSelling',
  efektif_alis: 'BanknoteBuying',
  efektif_satis: 'BanknoteSelling',
}

function regexDegeriniKacir(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function xmlEtiketDegeri(xml: string, etiket: string) {
  const eslesme = xml.match(
    new RegExp(`<${regexDegeriniKacir(etiket)}\\b[^>]*>([^<]*)<\\/${regexDegeriniKacir(etiket)}>`, 'i'),
  )
  return eslesme?.[1]?.trim() ?? ''
}

function numericMetni(value: string) {
  const normalized = value.replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || Number(normalized) <= 0) return null
  return Number(normalized)
}

/**
 * TCMB'nin Tarih_Date/Currency XML yanıtını DB RPC'sinin kabul ettiği satırlara
 * dönüştürür. XML içeriği yalnız sabit USD/EUR ve bilinen kur etiketlerinden okunur.
 */
export function tcmbXmlKurlariniCoz(xml: string): TcmbKurSatiri[] {
  const sonuc: TcmbKurSatiri[] = []

  for (const paraBirimi of TCMB_PARA_BIRIMLERI) {
    const blok = [...xml.matchAll(/<Currency\b([^>]*)>([\s\S]*?)<\/Currency>/gi)]
      .find(([, attributes]) => new RegExp(`\\bCurrencyCode=["']${paraBirimi}["']`, 'i').test(attributes))

    if (!blok) continue

    for (const kurTipi of TCMB_KUR_TIPLERI) {
      const tryKarsiligi = numericMetni(xmlEtiketDegeri(blok[2], xmlEtiketleri[kurTipi]))
      if (tryKarsiligi) {
        sonuc.push({
          para_birimi: paraBirimi,
          kur_tipi: kurTipi,
          try_karsiligi: tryKarsiligi,
        })
      }
    }
  }

  return sonuc
}

export function tcmbArsivUrl(tarih: string) {
  const [yil, ay, gun] = tarih.split('-')
  if (!yil || !ay || !gun) throw new Error('Geçersiz TCMB arşiv tarihi')
  return `https://www.tcmb.gov.tr/kurlar/${yil}${ay}/${gun}${ay}${yil}.xml`
}
