import { describe, expect, it } from 'vitest'
import {
  ticariKalemFarklariniHesapla,
  ticariSurumAlanFarklariniHesapla,
} from './ticariSurumKarsilastirma'

describe('ticari sürüm karşılaştırma', () => {
  it('doğal anahtarla eklenen, kaldırılan ve değişen fiyat kalemlerini ayırır', () => {
    const farklar = ticariKalemFarklariniHesapla(
      'fiyat',
      {
        urun: [
          { kapsam_tipi: 'urun', stok_id: 'stok-1', birim_fiyat: 10 },
          { kapsam_tipi: 'urun', stok_id: 'stok-2', birim_fiyat: 20 },
        ],
      },
      {
        urun: [
          { kapsam_tipi: 'urun', stok_id: 'stok-1', birim_fiyat: 12 },
          { kapsam_tipi: 'urun', stok_id: 'stok-3', birim_fiyat: 30 },
        ],
      },
    )

    expect(farklar[0].degisiklikler).toEqual(expect.arrayContaining([
      expect.objectContaining({ anahtar: 'urun · stok-1 · ', tur: 'degisti', degisenAlanlar: ['birim_fiyat'] }),
      expect.objectContaining({ anahtar: 'urun · stok-2 · ', tur: 'kaldirildi' }),
      expect.objectContaining({ anahtar: 'urun · stok-3 · ', tur: 'eklendi' }),
    ]))
  })

  it('audit alanlarını sürüm iş alanı farkına dahil etmez', () => {
    expect(ticariSurumAlanFarklariniHesapla(
      { revision_no: 1, created_at: '2026-01-01', varsayilan_vade_gunu: 15 },
      { revision_no: 2, created_at: '2026-01-02', varsayilan_vade_gunu: 30 },
    )).toEqual([
      { alan: 'varsayilan_vade_gunu', eski: 15, yeni: 30 },
    ])
  })
})
