import { describe, it, expect } from 'vitest'
import {
  tarananAdetHesapla,
  camTarananSayisi,
  batchYikamaOzetiHesapla,
} from './yikamaLoglari'

describe('tarananAdetHesapla', () => {
  it('kısmi tarama: adet=50, log=15 → 15', () => {
    const logMap = new Map([['ued-1', 15]])
    expect(tarananAdetHesapla('kesildi', 50, 'ued-1', logMap)).toBe(15)
  })

  it('tek adet bekliyor: adet=1, log=0 → 0', () => {
    const logMap = new Map<string, number>()
    expect(tarananAdetHesapla('kesildi', 1, 'ued-1', logMap)).toBe(0)
  })

  it('tek adet tamamlandı: adet=1, log=0, uretim_durumu=yikandi → 1', () => {
    const logMap = new Map<string, number>()
    expect(tarananAdetHesapla('yikandi', 1, 'ued-1', logMap)).toBe(1)
  })

  it('fazla log: adet=50, log=53 → 50', () => {
    const logMap = new Map([['ued-1', 53]])
    expect(tarananAdetHesapla('kesildi', 50, 'ued-1', logMap)).toBe(50)
  })

  it('eksik legacy log ancak durum tamamlandı: adet=50, log=47, yikandi → 50', () => {
    const logMap = new Map([['ued-1', 47]])
    expect(tarananAdetHesapla('yikandi', 50, 'ued-1', logMap)).toBe(50)
  })

  it('siparis_detay_id fallback kullanmaz — yalnızca uretim_emri_detay_id', () => {
    const logMap = new Map([['siparis-1', 20]])
    expect(tarananAdetHesapla('kesildi', 50, 'ued-1', logMap)).toBe(0)
  })
})

describe('camTarananSayisi', () => {
  it('kısmi tarama', () => {
    expect(camTarananSayisi({ uretim_durumu: 'kesildi', adet: 50, taranan_adet: 15 })).toBe(15)
  })

  it('negatif değerleri sıfırlar', () => {
    expect(camTarananSayisi({ uretim_durumu: 'kesildi', adet: -5, taranan_adet: -3 })).toBe(0)
  })

  it('yikandi durumunda tam adet döner', () => {
    expect(camTarananSayisi({ uretim_durumu: 'yikandi', adet: 50, taranan_adet: 10 })).toBe(50)
  })

  it('taranan adet toplam adedi aşamaz', () => {
    expect(camTarananSayisi({ uretim_durumu: 'kesildi', adet: 50, taranan_adet: 60 })).toBe(50)
  })
})

describe('batchYikamaOzetiHesapla', () => {
  it('aynı sipariş detayı farklı batch üretim detayları birbirine karışmaz', () => {
    const logMap = new Map([
      ['ued-A1', 10],
      ['ued-B1', 20],
    ])
    const ozetA = batchYikamaOzetiHesapla(
      [{ id: 'ued-A1', siparis_detay_id: 'sd-1', uretim_durumu: 'kesildi', adet: 20 }],
      logMap,
    )
    const ozetB = batchYikamaOzetiHesapla(
      [{ id: 'ued-B1', siparis_detay_id: 'sd-1', uretim_durumu: 'kesildi', adet: 30 }],
      logMap,
    )
    expect(ozetA).toEqual({ taranan: 10, toplam: 20 })
    expect(ozetB).toEqual({ taranan: 20, toplam: 30 })
  })

  it('karışık batch özeti: bekleyen, kısmi, tamamlanmış, fazla loglu', () => {
    const logMap = new Map([
      ['ued-1', 0],
      ['ued-2', 15],
      ['ued-3', 50],
      ['ued-4', 55],
    ])
    const ozet = batchYikamaOzetiHesapla(
      [
        { id: 'ued-1', siparis_detay_id: 'sd-1', uretim_durumu: 'bekliyor', adet: 10 },
        { id: 'ued-2', siparis_detay_id: 'sd-2', uretim_durumu: 'kesildi', adet: 50 },
        { id: 'ued-3', siparis_detay_id: 'sd-3', uretim_durumu: 'yikandi', adet: 50 },
        { id: 'ued-4', siparis_detay_id: 'sd-4', uretim_durumu: 'kesildi', adet: 40 },
      ],
      logMap,
    )
    expect(ozet).toEqual({ taranan: 105, toplam: 150 })
  })
})
