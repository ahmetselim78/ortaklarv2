import { describe, expect, it } from 'vitest'
import { fiyatUrunGruplariniGetir } from './fiyatGruplari'
import type { FiyatHesapSonucu } from '@/types/ticari'

const taban = {
  gecerli: true,
  hatalar: [],
  girdi_hash: 'g',
  fiyat_baglam_hash: 'b',
  sonuc_hash: 's',
  hesaplama_surumu: '1',
  para_birimi: 'TRY',
  fiyatlandirma_tarihi: '2026-07-27',
  kdv_haric_tutar: 300,
  kdv_tutari: 60,
  genel_toplam: 360,
  satir_iskonto_tutari: 0,
  belge_iskonto_tutari: 0,
  manuel_fiyat_farki: 0,
  manuel_yuvarlama_farki: 0,
  hesaplama_yuvarlama_farki: 0,
  nakliye_override_farki: 0,
  vade_farki: 0,
  bilesenler: [],
  kdv_ozetleri: [],
} satisfies Omit<FiyatHesapSonucu, 'satirlar'>

describe('fiyatUrunGruplariniGetir', () => {
  it('aynı camın satırlarını adet, m² ve tutar bazında gruplar', () => {
    const sonuc = {
      ...taban,
      satirlar: [
        {
          satir_no: 1, detay_id: null, stok_id: 'stok-1', recete_id: 'r',
          recete_surumu_id: 'rs', kdv_grubu_id: 'k', kdv_grup_surumu_id: 'ks',
          genislik_mm: 1000, yukseklik_mm: 1000, yuvarlanmis_genislik_mm: 1000,
          yuvarlanmis_yukseklik_mm: 1000, adet: 2, tek_parca_m2: 1,
          faturalanabilir_m2: 2, birim_fiyat: 100, brut_tutar: 200,
          satir_iskonto_tutari: 0, net_tutar: 200,
        },
        {
          satir_no: 2, detay_id: null, stok_id: 'stok-1', recete_id: 'r',
          recete_surumu_id: 'rs', kdv_grubu_id: 'k', kdv_grup_surumu_id: 'ks',
          genislik_mm: 500, yukseklik_mm: 1000, yuvarlanmis_genislik_mm: 500,
          yuvarlanmis_yukseklik_mm: 1000, adet: 2, tek_parca_m2: 0.5,
          faturalanabilir_m2: 1, birim_fiyat: 100, brut_tutar: 100,
          satir_iskonto_tutari: 0, net_tutar: 100,
        },
      ],
    } satisfies FiyatHesapSonucu

    expect(fiyatUrunGruplariniGetir(sonuc)).toMatchObject([{
      stok_id: 'stok-1',
      adet: 4,
      gercek_m2: 3,
      faturalanabilir_m2: 3,
      birim_fiyat: 100,
      grup_toplami: 300,
      fiyat_durumu: 'bulundu',
    }])
  })

  it('backend gruplarını değiştirmeden kullanır', () => {
    const gruplar = [{
      stok_id: 's', stok_kodu: 'C-1', stok_adi: 'Cam', adet: 1,
      gercek_m2: 1, faturalanabilir_m2: 1, birim_fiyat: null,
      grup_toplami: 0, fiyat_durumu: 'eksik' as const,
    }]
    expect(fiyatUrunGruplariniGetir({ ...taban, satirlar: [], urun_gruplari: gruplar }))
      .toBe(gruplar)
  })
})

