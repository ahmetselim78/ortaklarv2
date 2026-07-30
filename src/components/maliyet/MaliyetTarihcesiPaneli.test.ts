import { describe, expect, it } from 'vitest'
import type { MaliyetAlisFiyatiTarihceKaydi } from '@/types/maliyet'
import {
  fiyatDegisimleriniHesapla,
  kayitKategorisi,
} from './MaliyetTarihcesiPaneli'

function tarihceKaydi(
  fiyatId: string,
  overrides: Partial<MaliyetAlisFiyatiTarihceKaydi> = {},
): MaliyetAlisFiyatiTarihceKaydi {
  return {
    fiyat_id: fiyatId,
    atama_id: null,
    malzeme_turu: 'cam',
    malzeme_id: 'stok-1',
    malzeme_adi: 'Düz cam',
    alis_birimi: 'm2',
    tedarikci_id: 'tedarikci-1',
    tedarikci_adi: 'Cam Tedarikçisi',
    birim_fiyat: 100,
    para_birimi: 'TRY',
    vade_gunu: 0,
    fiyat_tarihi: '2026-01-01T00:00:00+03:00',
    aciklama: null,
    olusturan_kullanici: 'Test',
    olusturulma_tarihi: '2026-01-01T00:00:00+03:00',
    gecersiz: false,
    gecersiz_kilma_gerekcesi: null,
    gecersiz_kilan_kullanici: null,
    gecersiz_kilma_tarihi: null,
    stok_id: 'stok-1',
    stok_kodu: 'CAM-001',
    stok_adi: 'Düz cam',
    stok_kategorisi: 'cam',
    profil_turu: 'cam',
    fiyat_birimi: 'm2',
    paket_miktari: null,
    stok_ana_birimi: 'm2',
    donusum_katsayisi: 1,
    kaynak_turu: 'dogrudan',
    kaynak_referansi: null,
    durum: 'dogrulanmis',
    onceki_fiyat_id: null,
    duzeltme_nedeni: null,
    aktif_donem_baslangici: null,
    aktif_donem_bitisi: null,
    fiyat_varyanti: 'genel',
    marka: null,
    fiyat_liste_kodu: null,
    toplam_kayit: 1,
    ...overrides,
  }
}

describe('maliyet tarihçesi sınıflandırma ve fiyat serisi', () => {
  it('profil bulunmadığında stok kategorisini güvenilir fallback olarak kullanır', () => {
    expect(kayitKategorisi(tarihceKaydi('fiyat-1', {
      malzeme_turu: null,
      profil_turu: null,
      stok_kategorisi: 'yan_malzeme',
    }))).toBe('sarf')
  })

  it('yalnız aynı tedarikçi, varyant, kaynak, marka ve vade serisini kıyaslar', () => {
    const ilk = tarihceKaydi('fiyat-1')
    const ayniSeri = tarihceKaydi('fiyat-2', {
      birim_fiyat: 125,
      fiyat_tarihi: '2026-02-01T00:00:00+03:00',
    })
    const farkliTedarikci = tarihceKaydi('fiyat-3', {
      tedarikci_id: 'tedarikci-2',
      birim_fiyat: 130,
      fiyat_tarihi: '2026-03-01T00:00:00+03:00',
    })
    const farkliVaryant = tarihceKaydi('fiyat-4', {
      fiyat_varyanti: 'me',
      birim_fiyat: 140,
      fiyat_tarihi: '2026-04-01T00:00:00+03:00',
    })
    const farkliKaynak = tarihceKaydi('fiyat-5', {
      kaynak_turu: 'cam_baglantisi',
      birim_fiyat: 150,
      fiyat_tarihi: '2026-05-01T00:00:00+03:00',
    })
    const farkliVade = tarihceKaydi('fiyat-6', {
      vade_gunu: 60,
      birim_fiyat: 160,
      fiyat_tarihi: '2026-06-01T00:00:00+03:00',
    })

    const degisimler = fiyatDegisimleriniHesapla([
      farkliVade,
      ayniSeri,
      farkliTedarikci,
      ilk,
      farkliKaynak,
      farkliVaryant,
    ])

    expect(degisimler.get('fiyat-2')).toEqual({ fark: 25, yuzde: 25 })
    expect(degisimler.has('fiyat-3')).toBe(false)
    expect(degisimler.has('fiyat-4')).toBe(false)
    expect(degisimler.has('fiyat-5')).toBe(false)
    expect(degisimler.has('fiyat-6')).toBe(false)
  })

  it('doğrulanmış fiyat ile düzeltmesini aynı onaylı seri içinde kıyaslar', () => {
    const degisimler = fiyatDegisimleriniHesapla([
      tarihceKaydi('duzeltme', {
        durum: 'duzeltme',
        birim_fiyat: 90,
        fiyat_tarihi: '2026-02-01T00:00:00+03:00',
      }),
      tarihceKaydi('dogrulanmis'),
    ])

    expect(degisimler.get('duzeltme')).toEqual({ fark: -10, yuzde: -10 })
  })
})
