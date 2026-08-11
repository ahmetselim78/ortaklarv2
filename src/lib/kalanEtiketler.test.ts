import { describe, expect, it } from 'vitest'
import {
  kalanEtiketAdedi,
  kalanEtiketListeleriniOlustur,
  kalanEtiketToplami,
  seciliKalanEtiketKalemleri,
} from './kalanEtiketler'
import type { KalanEtiketCami } from './kalanEtiketler'

function cam(overrides: Partial<KalanEtiketCami>): KalanEtiketCami {
  return {
    uretim_emri_detay_id: 'detay-1',
    siparis_id: 'siparis-1',
    siparis_no: 'S-1',
    musteri: 'Müşteri',
    nihai_musteri: '',
    adet: 1,
    taranan_adet: 0,
    uretim_durumu: 'bekliyor',
    ...overrides,
  }
}

describe('kalanEtiketAdedi', () => {
  it('toplam adetten taranan adedi düşer', () => {
    expect(kalanEtiketAdedi(cam({ adet: 4, taranan_adet: 1 }))).toBe(3)
  })

  it('yıkanmış satırı tamamen işlenmiş kabul eder', () => {
    expect(kalanEtiketAdedi(cam({ adet: 4, taranan_adet: 1, uretim_durumu: 'yikandi' }))).toBe(0)
  })
})

describe('kalan etiket listeleri', () => {
  const camlar = [
    cam({ uretim_emri_detay_id: 'a', siparis_id: 'siparis-1', adet: 3, taranan_adet: 1 }),
    cam({ uretim_emri_detay_id: 'b', siparis_id: 'siparis-1', adet: 2, taranan_adet: 2 }),
    cam({
      uretim_emri_detay_id: 'c',
      siparis_id: 'siparis-2',
      siparis_no: 'S-2',
      adet: 5,
      taranan_adet: 0,
      uretim_durumu: 'yikandi',
    }),
  ]

  it('batch camlarını sipariş bazında doğru özetler', () => {
    expect(kalanEtiketListeleriniOlustur(camlar)).toEqual([
      expect.objectContaining({ key: 'siparis-1', toplam: 5, islenen: 3, kalan: 2 }),
      expect.objectContaining({ key: 'siparis-2', toplam: 5, islenen: 5, kalan: 0 }),
    ])
  })

  it('yalnızca seçilen listelerin kalan kalemlerini ve toplamını döndürür', () => {
    const kalemler = seciliKalanEtiketKalemleri(camlar, new Set(['siparis-1']))
    expect(kalemler).toHaveLength(1)
    expect(kalemler[0]).toMatchObject({ cam: { uretim_emri_detay_id: 'a' }, adet: 2 })
    expect(kalanEtiketToplami(kalemler)).toBe(2)
  })
})
