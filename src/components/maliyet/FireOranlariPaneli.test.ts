import { describe, expect, it } from 'vitest'
import type { StokFireOraniSurumu } from '@/types/maliyet'
import { fireDegerleriniBirlestir } from './FireOranlariPaneli'

function fire(stokId: string, oran: number): StokFireOraniSurumu {
  return {
    fire_surumu_id: `surum-${stokId}`,
    stok_id: stokId,
    stok_kodu: stokId.toLocaleUpperCase('tr-TR'),
    stok_adi: `${stokId} ürünü`,
    kategori: 'yan_malzeme',
    fire_orani: oran,
    revision_no: 1,
    gecerlilik_baslangici: '2026-01-01',
    gecerlilik_bitisi: null,
  }
}

describe('fire paneli sunucu/taslak birleştirmesi', () => {
  it('taslak satırı korur, dokunulmayanı yeniler ve silinen stoku düşürür', () => {
    const sonuc = fireDegerleriniBirlestir(
      [fire('stok-a', 5.5), fire('stok-b', 4.5), fire('stok-yeni', 2)],
      {
        'stok-a': '6',
        'stok-b': '4',
        'stok-silinen': '9',
      },
      {
        'stok-a': 5,
        'stok-b': 4,
        'stok-silinen': 8,
      },
      {},
    )

    expect(sonuc.degerler).toEqual({
      'stok-a': '6',
      'stok-b': '4.5',
      'stok-yeni': '2',
    })
    expect(sonuc.sunucuOranlari).not.toHaveProperty('stok-silinen')
    expect(sonuc.kaydedilenOranlar).not.toHaveProperty('stok-silinen')
  })

  it('başarılı kayıt sunucuya yansıyıncaya kadar yerel kayıt baselineını korur', () => {
    const gecikenSunucu = fireDegerleriniBirlestir(
      [fire('stok-a', 5)],
      { 'stok-a': '6' },
      { 'stok-a': 5 },
      { 'stok-a': 6 },
    )

    expect(gecikenSunucu.degerler['stok-a']).toBe('6')
    expect(gecikenSunucu.kaydedilenOranlar['stok-a']).toBe(6)

    const guncelSunucu = fireDegerleriniBirlestir(
      [fire('stok-a', 6)],
      gecikenSunucu.degerler,
      gecikenSunucu.sunucuOranlari,
      gecikenSunucu.kaydedilenOranlar,
    )

    expect(guncelSunucu.degerler['stok-a']).toBe('6')
    expect(guncelSunucu.kaydedilenOranlar).toEqual({})
  })

  it('boş veya geçersiz kullanıcı girdisini yenilemede ezmez', () => {
    const sonuc = fireDegerleriniBirlestir(
      [fire('stok-bos', 3), fire('stok-gecersiz', 4)],
      { 'stok-bos': '', 'stok-gecersiz': 'abc' },
      { 'stok-bos': 2, 'stok-gecersiz': 2 },
      {},
    )

    expect(sonuc.degerler).toEqual({
      'stok-bos': '',
      'stok-gecersiz': 'abc',
    })
  })
})
