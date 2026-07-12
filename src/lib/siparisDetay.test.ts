import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/idGenerator', () => ({
  generateCamKodulari: vi.fn(async (adet: number) =>
    Array.from({ length: adet }, (_, i) => `GLS-${i + 1}`),
  ),
}))

import { tekilSiparisDetayRows, fizikselCamAdedi } from './siparisDetay'

describe('tekilSiparisDetayRows — Problem 1 kök neden düzeltmesi', () => {
  it('adet=5 olan TEK form satırından TEK bir DB satırı üretir (satır patlatma YOK)', async () => {
    const satirlar = await tekilSiparisDetayRows('siparis-1', [
      { genislik_mm: 1000, yukseklik_mm: 800, adet: 5 },
    ])
    expect(satirlar).toHaveLength(1)
    expect(satirlar[0].adet).toBe(5)
    expect(satirlar[0].genislik_mm).toBe(1000)
    expect(satirlar[0].yukseklik_mm).toBe(800)
  })

  it('birden fazla form satırı için satır sayısı = form satırı sayısı olur', async () => {
    const satirlar = await tekilSiparisDetayRows('siparis-1', [
      { genislik_mm: 1000, yukseklik_mm: 800, adet: 5 },
      { genislik_mm: 500, yukseklik_mm: 500, adet: 1 },
      { genislik_mm: 300, yukseklik_mm: 300, adet: 20 },
    ])
    expect(satirlar).toHaveLength(3)
    expect(satirlar.map(s => s.adet)).toEqual([5, 1, 20])
    // Her satıra benzersiz bir cam_kodu atanmalı (satır kimliği, fiziksel parça değil)
    const kodlar = satirlar.map(s => s.cam_kodu)
    expect(new Set(kodlar).size).toBe(3)
  })

  it('adet belirtilmezse 1 olarak varsayılır', async () => {
    const satirlar = await tekilSiparisDetayRows('siparis-1', [
      { genislik_mm: 1000, yukseklik_mm: 800 },
    ])
    expect(satirlar[0].adet).toBe(1)
  })

  it('fiziksel toplam adet, sum(adet) ile hesaplanabilir (satır sayısından bağımsız)', async () => {
    const satirlar = await tekilSiparisDetayRows('siparis-1', [
      { genislik_mm: 1000, yukseklik_mm: 800, adet: 5 },
      { genislik_mm: 500, yukseklik_mm: 500, adet: 3 },
    ])
    const toplamFizikselAdet = satirlar.reduce((sum, s) => sum + s.adet, 0)
    expect(satirlar).toHaveLength(2)       // satır sayısı
    expect(toplamFizikselAdet).toBe(8)      // fiziksel cam sayısı
  })
})

describe('fizikselCamAdedi', () => {
  it('geçersiz/sıfır/negatif değerler için 1 döner', () => {
    expect(fizikselCamAdedi(undefined)).toBe(1)
    expect(fizikselCamAdedi(0)).toBe(1)
    expect(fizikselCamAdedi(-5)).toBe(1)
    expect(fizikselCamAdedi('abc')).toBe(1)
  })

  it('ondalıklı değerleri aşağı yuvarlar', () => {
    expect(fizikselCamAdedi(5.9)).toBe(5)
  })

  it('string sayıları doğru parse eder', () => {
    expect(fizikselCamAdedi('12')).toBe(12)
  })
})
