import { describe, expect, it } from 'vitest'
import {
  cariCalismaDurumunuCoz,
  cariCalismaSekmesiniDogrula,
  cariHesapDurumunuCoz,
} from './cariNavigation'
import {
  acilisBakiyesiYonEtiketleri,
  cariBakiyeDurumu,
} from './cariHesapSemantics'

const cariler = [
  { id: 'm-1', tipi: 'musteri' as const },
  { id: 'm-2', tipi: 'musteri' as const },
  { id: 't-1', tipi: 'tedarikci' as const },
]

describe('cari çalışma alanı URL durumu', () => {
  it('cari kimliği yokken istenen türün ilk kaydını seçip geçerli sekmeyi korur', () => {
    const durum = cariCalismaDurumunuCoz(
      '?tur=tedarikci&sekme=siparisler',
      cariler,
    )

    expect(durum).toMatchObject({
      tur: 'tedarikci',
      cariId: 't-1',
      sekme: 'siparisler',
    })
    expect(durum.normalizedSearch).toContain('cari=t-1')
  })

  it('müşteri ve tedarikçi sekme kümelerini birbirine taşımaz', () => {
    expect(cariCalismaSekmesiniDogrula('musteri', 'fiyatlar')).toBe('genel')
    expect(cariCalismaSekmesiniDogrula('tedarikci', 'baglantilar')).toBe('genel')
    expect(cariCalismaSekmesiniDogrula('tedarikci', 'fiyatlar')).toBe('fiyatlar')
  })

  it('URL carisi varsa carinin gerçek türünü esas alır', () => {
    const durum = cariCalismaDurumunuCoz(
      '?tur=musteri&cari=t-1&sekme=gecmis',
      cariler,
    )

    expect(durum).toMatchObject({
      tur: 'tedarikci',
      cariId: 't-1',
      sekme: 'gecmis',
    })
  })
})

describe('cari hesap URL durumu', () => {
  it('tur parametresini portföy kaynağı sayıp uyumsuz cariyi temizler', () => {
    const durum = cariHesapDurumunuCoz(
      '?tur=tedarikci&cari=m-1',
      cariler,
    )

    expect(durum).toMatchObject({ tur: 'tedarikci', cariId: '' })
    expect(durum.normalizedSearch).not.toContain('cari=')
  })

  it('eski yalnız-cari bağlantısında carinin türünü türetir', () => {
    const durum = cariHesapDurumunuCoz('?cari=t-1', cariler)

    expect(durum).toMatchObject({ tur: 'tedarikci', cariId: 't-1' })
    expect(durum.normalizedSearch).toContain('tur=tedarikci')
  })

  it('veri yüklenmeden eski yalnız-cari bağlantısını temizlemez', () => {
    expect(cariHesapDurumunuCoz('?cari=t-1', null)).toMatchObject({
      cariId: 't-1',
      normalizedSearch: null,
    })
  })
})

describe('cari hesap semantiği', () => {
  it('tedarikçi alacak bakiyesini bizim borcumuz olarak adlandırır', () => {
    expect(cariBakiyeDurumu(-250, 'tedarikci').etiket)
      .toBe('Tedarikçiye borcumuz')
    expect(cariBakiyeDurumu(125, 'tedarikci').etiket)
      .toBe('Tedarikçiden alacağımız')
  })

  it('açılış bakiyesi yönlerini cari türüne göre açıklar', () => {
    expect(acilisBakiyesiYonEtiketleri('tedarikci')).toEqual({
      borc: 'Borç · tedarikçiden alacağımız',
      alacak: 'Alacak · tedarikçiye borcumuz',
    })
  })
})
