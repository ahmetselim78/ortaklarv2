import { describe, it, expect } from 'vitest'
import { paneCamTipleri, paneKalinliklari, OptiPaneCozumlemeHatasi } from './paneCamTipi'

const STOK_10208 = {
  kod: '10208',
  ad: 'K 4+16+4 FUME ISICAM',
  grup: 'ISICAM',
  katman_yapisi: '4+16+4',
  kalinlik_mm: null,
}

describe('paneCamTipleri — 10200 FUME', () => {
  it('10208 → dc + fume', () => {
    expect(paneCamTipleri(STOK_10208)).toEqual(['dc', 'fume'])
  })

  it('10204 çift fume', () => {
    expect(paneCamTipleri({ ...STOK_10208, kod: '10204', ad: 'K 4+16+4 CIFT FUME ISICAM' })).toEqual(['fume', 'fume'])
  })

  it('10205 fume + konfor', () => {
    expect(paneCamTipleri({ ...STOK_10208, kod: '10205', ad: 'K 4+16+4 FUME KONFOR', grup: 'ISICAM-KONFOR' })).toEqual(['fume', 'konfor'])
  })

  it('sahte 10299 kritik', () => {
    expect(() =>
      paneCamTipleri({ ...STOK_10208, kod: '10299', ad: 'Bilinmeyen FUME' }),
    ).toThrow(OptiPaneCozumlemeHatasi)
  })

  it('ad fallback: FÜME varyasyonu', () => {
    expect(
      paneCamTipleri({ kod: '99999', ad: 'K 4+16+4 FÜME ISICAM', grup: 'ISICAM', katman_yapisi: '4+16+4' }),
    ).toEqual(['dc', 'fume'])
  })

  it('ad fallback: büyük harf ve ekstra boşluk', () => {
    expect(
      paneCamTipleri({ kod: '99999', ad: 'K  4+16+4   FUME   ISICAM', grup: 'ISICAM', katman_yapisi: '4+16+4' }),
    ).toEqual(['dc', 'fume'])
  })

  it('ÇİFT FUME ad deseni çift fume pane üretir', () => {
    expect(
      paneCamTipleri({ kod: '99999', ad: 'K 4+16+4 ÇİFT FUME ISICAM', grup: 'ISICAM', katman_yapisi: '4+16+4' }),
    ).toEqual(['fume', 'fume'])
  })

  it('ÇİFT içeren ama fume olmayan ad tek-yüz sayılmaz', () => {
    expect(() =>
      paneCamTipleri({ kod: '99999', ad: 'K 4+16+4 ÇİFT ISICAM', grup: 'ISICAM', katman_yapisi: '4+16+4' }),
    ).toThrow(OptiPaneCozumlemeHatasi)
  })
})

describe('paneCamTipleri — üçlü cam', () => {
  it('10803 üçlü cam kritik', () => {
    expect(() =>
      paneCamTipleri({
        kod: '10803',
        ad: '4+14+4+14+4 3+ ISICAM KLASIK',
        grup: 'ÜÇLÜ CAM',
        katman_yapisi: '4+14+4+14+4',
      }),
    ).toThrow(/Üçlü cam/)
  })
})

describe('paneKalinliklari — asimetrik', () => {
  it('4+16+6 → [4, 6]', () => {
    expect(paneKalinliklari({ katman_yapisi: '4+16+6' })).toEqual([4, 6])
  })

  it('6+16+4 → [6, 4]', () => {
    expect(paneKalinliklari({ katman_yapisi: '6+16+4' })).toEqual([6, 4])
  })
})
