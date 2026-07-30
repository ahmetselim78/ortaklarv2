import { describe, expect, it } from 'vitest'
import {
  tcmbArsivUrl,
  tcmbXmlKurlariniCoz,
} from '../../supabase/functions/_shared/tcmbRates'

const ORNEK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="24.07.2026" Date="07/24/2026">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <ForexBuying>40.1234</ForexBuying>
    <ForexSelling>40.2345</ForexSelling>
    <BanknoteBuying>40.0953</BanknoteBuying>
    <BanknoteSelling>40.2949</BanknoteSelling>
  </Currency>
  <Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR">
    <ForexBuying>47,1111</ForexBuying>
    <ForexSelling>47.2222</ForexSelling>
    <BanknoteBuying>47.0781</BanknoteBuying>
    <BanknoteSelling>47.2930</BanknoteSelling>
  </Currency>
</Tarih_Date>`

describe('TCMB kur ayrıştırıcısı', () => {
  it('USD ve EUR için dört resmi kur tipini RPC satırlarına dönüştürür', () => {
    expect(tcmbXmlKurlariniCoz(ORNEK_XML)).toEqual([
      { para_birimi: 'USD', kur_tipi: 'doviz_alis', try_karsiligi: 40.1234 },
      { para_birimi: 'USD', kur_tipi: 'doviz_satis', try_karsiligi: 40.2345 },
      { para_birimi: 'USD', kur_tipi: 'efektif_alis', try_karsiligi: 40.0953 },
      { para_birimi: 'USD', kur_tipi: 'efektif_satis', try_karsiligi: 40.2949 },
      { para_birimi: 'EUR', kur_tipi: 'doviz_alis', try_karsiligi: 47.1111 },
      { para_birimi: 'EUR', kur_tipi: 'doviz_satis', try_karsiligi: 47.2222 },
      { para_birimi: 'EUR', kur_tipi: 'efektif_alis', try_karsiligi: 47.0781 },
      { para_birimi: 'EUR', kur_tipi: 'efektif_satis', try_karsiligi: 47.293 },
    ])
  })

  it('boş veya sıfır kur alanlarını cache girdisine almaz', () => {
    const xml = ORNEK_XML
      .replace('<BanknoteBuying>40.0953</BanknoteBuying>', '<BanknoteBuying></BanknoteBuying>')
      .replace('<BanknoteSelling>47.2930</BanknoteSelling>', '<BanknoteSelling>0</BanknoteSelling>')

    expect(tcmbXmlKurlariniCoz(xml)).toHaveLength(6)
  })

  it('yalnız sabit resmi TCMB arşiv adresini üretir', () => {
    expect(tcmbArsivUrl('2026-07-24')).toBe(
      'https://www.tcmb.gov.tr/kurlar/202607/24072026.xml',
    )
  })
})
