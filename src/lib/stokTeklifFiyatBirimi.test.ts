import { describe, expect, it } from 'vitest'
import { stokTeklifFiyatBiriminiCoz } from '@/lib/stokTeklifFiyatBirimi'

describe('stok teklif fiyat birimi', () => {
  it('temiz katalog ve legacy cita birimlerini kanonik metre koduna cevirir', () => {
    expect(stokTeklifFiyatBiriminiCoz({
      profil_turu: 'cita',
      birim: 'm',
      fiyat_birimi: 'm',
    })).toBe('m')
    expect(stokTeklifFiyatBiriminiCoz({
      profil_turu: 'cita',
      birim: 'm',
      fiyat_birimi: 'metre',
    })).toBe('m')
  })

  it('cam fiyatini ilk fazda m2 olarak normalize eder', () => {
    expect(stokTeklifFiyatBiriminiCoz({
      profil_turu: 'cam',
      birim: 'm2',
      fiyat_birimi: 'm²',
    })).toBe('m2')
  })
})
