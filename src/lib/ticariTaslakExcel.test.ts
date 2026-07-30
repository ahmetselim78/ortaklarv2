import { describe, expect, it } from 'vitest'
import {
  ticariTaslakExcelOku,
  ticariTaslakExcelOlustur,
  type TicariExcelReferanslar,
} from './ticariTaslakExcel'

const referanslar: TicariExcelReferanslar = {
  stoklar: [
    { id: '00000000-0000-4000-8000-000000000001', kod: 'CAM-001', ad: 'Test Camı' },
  ],
  kdvGruplari: [
    { id: '00000000-0000-4000-8000-000000000002', kod: 'KDV20', ad: 'KDV %20' },
  ],
}

function arrayBuffer(value: unknown) {
  const bytes = Buffer.from(value as Uint8Array)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

describe('ticari taslak Excel sözleşmesi', () => {
  it('fiyat kalemlerini ayrı sayfalarda üretip UUID/kod referanslarıyla kayıpsız okur', async () => {
    const kaynak = {
      urun: [{
        kapsam_tipi: 'stok',
        stok_id: referanslar.stoklar[0].id,
        stok_grubu: null,
        birim_fiyat: 125.55,
        yuzde_fark: null,
        para_birimi: 'TRY',
        kdv_grubu_id: referanslar.kdvGruplari[0].id,
        minimum_m2: 0.25,
        en_adimi_mm: 10,
        boy_adimi_mm: 10,
        aktif: true,
      }],
      kenar: [],
      menfez: [],
      kucuk_cam: [],
      nakliye: [],
      diger: [],
    }

    const dosya = await ticariTaslakExcelOlustur('fiyat', kaynak, referanslar)
    const okunan = await ticariTaslakExcelOku('fiyat', arrayBuffer(dosya), referanslar)

    expect(okunan.urun).toHaveLength(1)
    expect(okunan.urun[0]).toMatchObject({
      stok_id: referanslar.stoklar[0].id,
      birim_fiyat: 125.55,
      para_birimi: 'TRY',
      kdv_grubu_id: referanslar.kdvGruplari[0].id,
      aktif: true,
    })
    expect(okunan).toMatchObject({
      kenar: [],
      menfez: [],
      kucuk_cam: [],
      nakliye: [],
      diger: [],
    })
  })

  it('reçete sayfasında stok kodunu UUID’ye çözebilir', async () => {
    const kaynak = {
      kalemler: [{
        sira_no: 1,
        bilesen_turu: 'stok',
        ham_stok_id: referanslar.stoklar[0].id,
        referans_kodu: null,
        hesaplama_birimi: 'm2',
        miktar_katsayisi: 1,
        cevre_katsayisi: 1,
        fire_orani_override: 3.5,
        aciklama: 'Ana cam',
      }],
    }

    const dosya = await ticariTaslakExcelOlustur('recete', kaynak, referanslar)
    const okunan = await ticariTaslakExcelOku('recete', arrayBuffer(dosya), referanslar)

    expect(okunan.kalemler[0]).toMatchObject({
      ham_stok_id: referanslar.stoklar[0].id,
      sira_no: 1,
      fire_orani_override: 3.5,
    })
  })
})
