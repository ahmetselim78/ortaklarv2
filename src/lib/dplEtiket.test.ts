import { describe, expect, it } from 'vitest'
import {
  dplAscii,
  dplBarkod,
  dplEtiketIskeleti,
  dplMetin,
  mmToDplBarkodYuksekligi,
  mmToDplMetric,
} from '@/lib/dplEtiket'

function kayitBasligi(kayit: string): string {
  return kayit.slice(0, 15)
}

function kayitVeri(kayit: string): string {
  const son = kayit.endsWith('\r') ? kayit.length - 1 : kayit.length
  return kayit.slice(15, son)
}

describe('dplMetin', () => {
  it('15 karakterlik başlık üretir', () => {
    const kayit = dplMetin(1, 1, 1, 1, 50, 30, 'TEST')
    expect(kayitBasligi(kayit)).toBe('111100000500030')
    expect(kayitBasligi(kayit).length).toBe(15)
  })

  it('kayıt yalnızca \\r ile biter', () => {
    const kayit = dplMetin(1, 1, 1, 1, 50, 30, 'TEST')
    expect(kayit.endsWith('\r')).toBe(true)
    expect(kayit).not.toContain('\r\n')
    expect(kayitVeri(kayit)).toBe('TEST')
  })

  it('2x2 çarpanlı metin başlığı doğru', () => {
    const kayit = dplMetin(1, 1, 2, 2, 25, 30, '37')
    expect(kayitBasligi(kayit)).toBe('112200000250030')
  })
})

describe('dplBarkod', () => {
  it('15 karakterlik başlık üretir (insan okunur yok)', () => {
    const kayit = dplBarkod(25, 30, '37', 80, false)
    expect(kayitBasligi(kayit)).toBe('1e0008000250030')
    expect(kayitBasligi(kayit).length).toBe(15)
  })

  it('insan okunur barkod büyük E kullanır', () => {
    const kayit = dplBarkod(25, 30, '37', 80, true)
    expect(kayitBasligi(kayit)).toBe('1E0008000250030')
  })

  it('kayıt yalnızca \\r ile biter', () => {
    const kayit = dplBarkod(25, 30, '37', 80, false)
    expect(kayit.endsWith('\r')).toBe(true)
    expect(kayit).not.toContain('\r\n')
  })

  it('dönüş, modül ve yüksekliği başlığa yansıtır', () => {
    const kayit = dplBarkod(50, 75, '37', 47, false, 2, 2)
    expect(kayitBasligi(kayit)).toBe('2e2204700500075')
  })
})

describe('dplAscii', () => {
  it('Türkçe karakterleri ASCII karşılığına çevirir', () => {
    expect(dplAscii('ışık')).toBe('isik')
    expect(dplAscii('Çağrı')).toBe('Cagri')
  })

  it('tipografik ayraçları yazıcının basabileceği ASCII karakterlere çevirir', () => {
    expect(dplAscii('NOVEL — AKYOL × 2')).toBe('NOVEL - AKYOL x 2')
  })
})

describe('metrik dönüşüm ve etiket iskeleti', () => {
  it('milimetreyi DPL 0,1 mm row/column birimine çevirir', () => {
    expect(mmToDplMetric(0)).toBe(0)
    expect(mmToDplMetric(12.34)).toBe(123)
    expect(mmToDplMetric(50)).toBe(500)
  })

  it('barkod yüksekliğini 1/100 inç birimine çevirir', () => {
    expect(mmToDplBarkodYuksekligi(12)).toBe(47)
    expect(mmToDplBarkodYuksekligi(25.4)).toBe(100)
  })

  it('ısı, D22 ve metrik modu açıkça gönderir', () => {
    const dpl = dplEtiketIskeleti('ALAN\r', {
      isi: 15,
      nokta_genislik: 2,
      nokta_yukseklik: 2,
      metrik: true,
    })
    expect(dpl).toBe('\x02L\rH15\rD22\rm\rALAN\rQ0001\rE\r')
  })
})
