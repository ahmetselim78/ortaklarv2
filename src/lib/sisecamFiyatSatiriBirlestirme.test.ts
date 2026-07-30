import { describe, expect, it } from 'vitest'
import { sisecamFiyatListesiniCozumle } from '@/lib/sisecamFiyatListesi'

describe('Sisecam bolunmus fiyat satirlari', () => {
  it('urun once ve fiyat once gelen PDF parcalarini birlestirir', () => {
    const sonuc = sisecamFiyatListesiniCozumle(`
      Revize Tarihi: 06.04.2026/ No:2
      Şişecam Climax Select
      4 ME + JU
      526.00 568.08 578.60
      Şişecam Deco Buzlu
      184.00 198.72 202.40
      4
    `)

    expect(sonuc.satirlar).toEqual([
      expect.objectContaining({
        urunAilesi: 'climax_select',
        kalinlik: '4',
        ebatVaryanti: 'ME+JU',
        pesin: 526,
      }),
      expect.objectContaining({
        urunAilesi: 'deco_buzlu',
        kalinlik: '4',
        ebatVaryanti: 'GENEL',
        pesin: 184,
      }),
    ])
  })
})
