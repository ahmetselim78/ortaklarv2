import { describe, expect, it } from 'vitest'
import { pdfM2Kontrolu } from './pdfImportKontrol'

describe('pdfM2Kontrolu', () => {
  it('küçük listede 0,5 m² mutlak toleransı uygular', () => {
    const sonuc = pdfM2Kontrolu([{ genislik_mm: 1000, yukseklik_mm: 1000, adet: 2 }], 2.49)
    expect(sonuc).toMatchObject({ hesaplanan: 2, tolerans: 0.5, uyumsuz: false })
    expect(sonuc.fark).toBeCloseTo(0.49)
  })

  it('büyük listede yüzde 0,5 toleransı aşan farkı engel sayar', () => {
    expect(pdfM2Kontrolu([{ genislik_mm: 1000, yukseklik_mm: 1000, adet: 200 }], 202))
      .toMatchObject({ hesaplanan: 200, fark: 2, tolerans: 1.01, uyumsuz: true })
  })

  it('PDF toplamı yoksa kullanıcı onayı gerektiren uyumsuzluk üretmez', () => {
    expect(pdfM2Kontrolu([{ genislik_mm: 1000, yukseklik_mm: 1000, adet: 1 }], null))
      .toMatchObject({ pdf: null, fark: null, uyumsuz: false })
  })
})
