import { describe, expect, it } from 'vitest'
import {
  SISECAM_PDF_MANUEL_FIYAT_STOKLARI,
  sisecamFiyatListesiniCozumle,
  sisecamPdfManuelFiyatGerektirir,
  sisecamSatirlariniStoklarlaEslestir,
  sisecamVadeFiyati,
} from '@/lib/sisecamFiyatListesi'

const ORNEK = `
2026 YURTİÇİ SATIŞLAR GRUP MÜDÜRLÜĞÜ TÜRKİYE MİMARİ CAMLAR FİYAT LİSTESİ Revize Tarihi: 06.04.2026/ No:2
Düzcam Şişecam Clear
(Şişecam Renksiz Düzcam)
4 JU 321.00 346.68 353.10
4 ME 305.00 329.40 335.50
Şişecam Renkli Düz Cam
4 Füme JU 434.00 468.72 477.40
4 Füme ME 412.00 444.96 453.20
4 Bronz ME 421.00 454.68 463.10
Hat dışı Kaplamalı Camlar Şişecam Climax
(Şişecam Low-E Cam)
4 ME + JU 408.00 440.64 448.80
Şişecam Climax Select
4 ME + JU 526.00 568.08 578.60
Buzlu Cam Şişecam Deco Buzlu
4 184.00 198.72 202.40
Lamine Şişecam SafeProtec - Clear
4+4 0,38 PVB 917.00 990.36 1,008.70
`

describe('Şişecam fiyat listesi', () => {
  it('revizyonu, vadeleri ve ebat varyantlarını ayrıştırır', () => {
    const sonuc = sisecamFiyatListesiniCozumle(ORNEK)

    expect(sonuc.revizyonTarihi).toBe('2026-04-06')
    expect(sonuc.sirkulerNo).toBe('2')
    expect(sonuc.satirlar).toHaveLength(9)
    expect(sonuc.satirlar[0]).toMatchObject({
      urunAilesi: 'clear',
      kalinlik: '4',
      ebatVaryanti: 'JU',
      pesin: 321,
      gun60: 346.68,
      gun75: 353.1,
    })
    expect(sonuc.satirlar.find((satir) => satir.urunAilesi === 'safeprotec_clear')).toMatchObject({
      kalinlik: '4+4',
      pvb: '0.38',
      gun75: 1008.7,
    })
  })

  it('Peşin, 60 gün ve 75 gün fiyatını aynı satırdan seçer', () => {
    const satir = sisecamFiyatListesiniCozumle(ORNEK).satirlar[0]

    expect(sisecamVadeFiyati(satir, 'pesin')).toBe(321)
    expect(sisecamVadeFiyati(satir, '60_gun')).toBe(346.68)
    expect(sisecamVadeFiyati(satir, '75_gun')).toBe(353.1)
  })

  it('036 stok kodlarını doğru ürün ailelerine eşler ve ME satırını önerir', () => {
    const satirlar = sisecamFiyatListesiniCozumle(ORNEK).satirlar
    const sonuc = sisecamSatirlariniStoklarlaEslestir(satirlar, [
      { id: 'duz', kod: '01002', ad: '4 mm DC' },
      { id: 'fume', kod: '01013', ad: '4mm Füme' },
      { id: 'sinerji', kod: '01020', ad: '4 mm Sinerji' },
      { id: 'konfor', kod: '01022', ad: '4 mm Konfor' },
      { id: 'renkli', kod: '01009', ad: 'Renkli Cam' },
      { id: 'satina', kod: '01012', ad: 'Satina Beyaz' },
    ])

    expect(sonuc.find(({ stok }) => stok.id === 'duz')?.satir?.ebatVaryanti).toBe('ME')
    expect(sonuc.find(({ stok }) => stok.id === 'fume')?.satir?.gun75).toBe(453.2)
    expect(sonuc.find(({ stok }) => stok.id === 'sinerji')?.satir?.gun75).toBe(448.8)
    expect(sonuc.find(({ stok }) => stok.id === 'konfor')?.satir?.gun75).toBe(578.6)
    expect(sonuc.some(({ stok }) => stok.id === 'renkli')).toBe(false)
    expect(sonuc.some(({ stok }) => stok.id === 'satina')).toBe(false)
  })

  it('Renkli Cam ve Satina Beyaz ürünlerini PDF dışı manuel fiyat olarak işaretler', () => {
    expect(SISECAM_PDF_MANUEL_FIYAT_STOKLARI).toEqual([
      { kod: '01009', ad: 'Renkli Cam' },
      { kod: '01012', ad: 'Satina Beyaz' },
    ])
    expect(sisecamPdfManuelFiyatGerektirir('01009')).toBe(true)
    expect(sisecamPdfManuelFiyatGerektirir(' 01012 ')).toBe(true)
    expect(sisecamPdfManuelFiyatGerektirir('01002')).toBe(false)
  })
})
