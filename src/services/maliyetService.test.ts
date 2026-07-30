import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}))

import {
  maliyetAlisFiyatiKaydet,
  maliyetAlisFiyatiTarihcesiniGetir,
  maliyetUrunMaliyetTarihcesiniGetir,
  maliyetUrunMaliyetleriniHesapla,
  sadeMaliyetYonetiminiGetir,
  standartUrunReceteleriniKurV3,
  stokAlisFiyatiKaydet,
  stokMaliyetKaynakPaneliniGetirV3,
  stokMaliyetProfiliKaydet,
  stokMaliyetTopluPolitikaUygulaV3,
  stokTedarikciFiyatTeklifleriniKaydetV3,
  temperDisHizmetFiyatSecV4,
  temperMaliyetModuKaydetV4,
  temperMaliyetPaneliniGetirV4,
} from './maliyetService'

describe('stok merkezli maliyet servis sözleşmesi', () => {
  beforeEach(() => {
    supabaseMock.rpc.mockReset()
    supabaseMock.from.mockReset()
  })

  it('stok ve maliyet ekranı için katalog, fiyat ve hesabı tek RPC ile getirir', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        profiller: [],
        fiyatlar: [],
        ayarlar: [],
        tedarikciler: [],
        cam_fiyat_gruplari: [],
        aday_stoklar: [],
        hesap: { gecerli: true, urunler: [] },
      },
      error: null,
    })

    await sadeMaliyetYonetiminiGetir('2026-07-27')

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1)
    expect(supabaseMock.rpc).toHaveBeenCalledWith('stok_maliyet_katalogu_getir_v3', {
      p_tarih: '2026-07-27',
    })
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('maliyet bileşenini bağımsız malzeme kimliği olmadan stok_id ile kaydeder', async () => {
    const payload = {
      stok_id: '00000000-0000-4000-8000-000000000001',
      profil_turu: 'cam' as const,
      cam_fiyat_grubu_id: '00000000-0000-4000-8000-000000000002',
      olcu_mm: '4',
      fire_orani: '3',
      fiyat_birimi: 'm2',
      stok_ana_birimi: 'm2',
      donusum_katsayisi: '1',
      gecerlilik_baslangici: '2026-07-27',
      aciklama: 'Stoktan cam maliyet bileşeni seçildi.',
      kaynak: 'maliyet_ekrani' as const,
    }
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await stokMaliyetProfiliKaydet(payload, 'stok-profili-tekil-anahtar')

    expect(supabaseMock.rpc).toHaveBeenCalledWith('stok_maliyet_profili_kaydet', {
      p_payload: payload,
      p_idempotency_key: 'stok-profili-tekil-anahtar',
    })
    expect(payload).not.toHaveProperty('malzeme_id')
  })

  it('fiyatı aynı atomik RPC ile kaydedip aktif döneme alır', async () => {
    const payload = {
      stok_id: '00000000-0000-4000-8000-000000000001',
      tedarikci_id: '00000000-0000-4000-8000-000000000002',
      birim_fiyat: '125.50',
      para_birimi: 'TRY' as const,
      fiyat_birimi: 'm2',
      stok_ana_birimi: 'm2',
      donusum_katsayisi: '1',
      vade_gunu: '60',
      fiyat_tarihi: '2026-07-27T00:00:00+03:00',
      gecerlilik_baslangici: '2026-07-27T00:00:00+03:00',
      kaynak_ekran: 'maliyet_ekrani' as const,
    }
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await maliyetAlisFiyatiKaydet(payload, 'stok-fiyati-tekil-anahtar')

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'stok_alis_fiyati_kaydet_ve_aktiflestir',
      {
        p_payload: payload,
        p_gerekce: 'Kullanıcı tarafından aktif fiyat olarak kaydedildi.',
        p_idempotency_key: 'stok-fiyati-tekil-anahtar',
      },
    )
  })

  it('fiyat oluşturma yetkisi aktifleştirme yapmadan yalnız değişmez kaydı açabilir', async () => {
    const payload = {
      stok_id: '00000000-0000-4000-8000-000000000001',
      tedarikci_id: '00000000-0000-4000-8000-000000000002',
      birim_fiyat: '125.50',
      para_birimi: 'TRY' as const,
      fiyat_birimi: 'm',
      stok_ana_birimi: 'm',
      donusum_katsayisi: '1',
      vade_gunu: '0',
      fiyat_tarihi: '2026-07-27T00:00:00+03:00',
      gecerlilik_baslangici: '2026-07-27T00:00:00+03:00',
      kaynak_ekran: 'stok_karti' as const,
    }
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await stokAlisFiyatiKaydet(payload, 'yalniz-fiyat-kaydi-anahtari')

    expect(supabaseMock.rpc).toHaveBeenCalledWith('stok_alis_fiyati_kaydet', {
      p_payload: payload,
      p_idempotency_key: 'yalniz-fiyat-kaydi-anahtari',
    })
  })

  it('tarihsel ürün maliyetini yeni PostgreSQL motorundan ister', async () => {
    const sonuc = {
      gecerli: true,
      urunler: [{
        stok_id: '00000000-0000-4000-8000-000000000010',
        stok_kodu: '11004',
        urun_adi: 'Temperli Isıcam',
        gecerli: true,
        fire_etkisi: '42.75',
        bilesenler: [{
          rol: 'cam',
          stok_adi: '4 mm Düz Cam',
          firesiz_miktar: '1',
          fire_orani: '5',
          miktar: '1.05',
          birim: 'm2',
          fire_etkisi: '42.75',
          toplam_maliyet: '897.75',
        }],
        islem_maliyeti: '125.50',
        islemler: [{
          sira_no: '1',
          islem_turu: 'temper',
          tuketim_tipi: 'alan',
          hedef_cam_sira_nolari: ['1'],
          pane_sayisi: '1',
          alan_katsayisi: '1',
          maliyet_alan_m2: '1',
          toplam_maliyet: '125.50',
          temper_cozumu: {
            gecerli: true,
            mod: 'dis_hizmet',
            mod_surumu_id: '00000000-0000-4000-8000-000000000011',
            alan_m2: '1',
            birim_maliyet_try: '125.50',
            toplam_maliyet: '125.50',
            dis_hizmet_fiyati: {
              fiyat_id: '00000000-0000-4000-8000-000000000012',
              hizmet_stok_id: '00000000-0000-4000-8000-000000000013',
              tedarikci_id: '00000000-0000-4000-8000-000000000014',
              tedarikci_adi: 'Bursa Temper',
              birim_fiyat: '125.50',
              para_birimi: 'TRY',
              fiyat_birimi: 'm2',
              varyant: 'genel',
              vade_gunu: '60',
              fiyat_tarihi: '2026-07-27T00:00:00+03:00',
              secim_baslangici: '2026-07-27T00:00:00+03:00',
            },
            ic_uretim_kalemleri: [],
            hatalar: [],
          },
        }],
      }],
    }
    supabaseMock.rpc.mockResolvedValue({ data: sonuc, error: null })

    await expect(
      maliyetUrunMaliyetleriniHesapla('2026-07-27', 1200, 800),
    ).resolves.toEqual(expect.objectContaining({
      gecerli: true,
      urunler: [
        expect.objectContaining({
          islem_maliyeti: 125.5,
          fire_etkisi: 42.75,
          bilesenler: [
            expect.objectContaining({
              tur: 'cam',
              ad: '4 mm Düz Cam',
              firesiz_miktar: 1,
              fire_orani: 5,
              miktar: 1.05,
              fire_etkisi: 42.75,
            }),
          ],
          islemler: [
            expect.objectContaining({
              maliyet_alan_m2: 1,
              toplam_maliyet: 125.5,
              temper_cozumu: expect.objectContaining({
                mod: 'dis_hizmet',
                birim_maliyet_try: 125.5,
                dis_hizmet_fiyati: expect.objectContaining({
                  tedarikci_adi: 'Bursa Temper',
                  vade_gunu: 60,
                }),
              }),
            }),
          ],
        }),
      ],
    }))
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'urun_maliyetlerini_hesapla_v3',
      {
        p_tarih: '2026-07-27',
        p_en_mm: 1200,
        p_boy_mm: 800,
      },
    )
  })

  it('stok fiyat geçmişini stok_id filtresiyle ortak RPCden getirir', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{
        fiyat_id: '00000000-0000-4000-8000-000000000003',
        stok_id: '00000000-0000-4000-8000-000000000001',
        stok_kodu: 'CAM-4',
        stok_adi: '4 mm Düz Cam',
        stok_kategorisi: 'cam',
        profil_turu: null,
        birim_fiyat: '142.75',
        donusum_katsayisi: '1',
        vade_gunu: 60,
        fiyat_varyanti: 'me',
        toplam_kayit: '2403',
      }],
      error: null,
    })

    await expect(
      maliyetAlisFiyatiTarihcesiniGetir('', 250, '00000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual([
      expect.objectContaining({
        stok_id: '00000000-0000-4000-8000-000000000001',
        birim_fiyat: 142.75,
        malzeme_turu: 'cam',
        fiyat_varyanti: 'me',
        toplam_kayit: 2403,
      }),
    ])
    expect(supabaseMock.rpc).toHaveBeenCalledWith('stok_alis_fiyati_tarihcesi_v3', {
      p_stok_id: '00000000-0000-4000-8000-000000000001',
      p_tedarikci_id: null,
      p_limit: 250,
    })
  })

  it('profil olmayan yan malzeme fiyatını stok kategorisinden sarf olarak dönüştürür', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{
        fiyat_id: '00000000-0000-4000-8000-000000000004',
        stok_id: '00000000-0000-4000-8000-000000000005',
        stok_kodu: 'SARF-BUTIL',
        stok_adi: 'Butil',
        stok_kategorisi: 'yan_malzeme',
        profil_turu: null,
        birim_fiyat: '19.25',
        donusum_katsayisi: '1',
        vade_gunu: 0,
      }],
      error: null,
    })

    const [fiyat] = await maliyetAlisFiyatiTarihcesiniGetir()

    expect(fiyat).toEqual(expect.objectContaining({
      stok_kategorisi: 'yan_malzeme',
      profil_turu: null,
      malzeme_turu: 'sarf',
      fiyat_varyanti: 'genel',
    }))
  })

  it('ürün maliyet tarihçesinin olay, nullable sayısal ve detay alanlarını dönüştürür', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{
        olay_tarihi: '2026-07-30',
        olay_turleri: ['bilesen_fire_baslangici', 'sorgu_bitisi'],
        stok_id: '00000000-0000-4000-8000-000000000101',
        stok_kodu: 'URU-CAM-01',
        urun_adi: 'Isıcam Ürünü',
        urun_grubu: null,
        gecerli: true,
        hesaplama_surumu: 'acik-recete-v3',
        recete_surumu_id: '00000000-0000-4000-8000-000000000102',
        toplam_maliyet: '1250.45',
        m2_maliyet: '1250.45',
        cam_maliyeti: '1000.25',
        cita_maliyeti: null,
        sarf_maliyeti: '80.20',
        islem_maliyeti: '0',
        fire_etkisi: '42.75',
        finansman_etkisi: '0',
        kur_etkisi: null,
        onceki_toplam_maliyet: '1200.45',
        maliyet_farki: '50',
        maliyet_farki_yuzde: '4.1651',
        toplam_kayit: '17',
        detay: {
          gecerli: true,
          eksikler: [],
        },
      }],
      error: null,
    })

    await expect(maliyetUrunMaliyetTarihcesiniGetir(
      '00000000-0000-4000-8000-000000000101',
      '2026-01-01',
      '2026-07-30',
      75,
    )).resolves.toEqual([{
      olay_tarihi: '2026-07-30',
      olay_turleri: ['bilesen_fire_baslangici', 'sorgu_bitisi'],
      stok_id: '00000000-0000-4000-8000-000000000101',
      stok_kodu: 'URU-CAM-01',
      urun_adi: 'Isıcam Ürünü',
      urun_grubu: null,
      gecerli: true,
      hesaplama_surumu: 'acik-recete-v3',
      recete_surumu_id: '00000000-0000-4000-8000-000000000102',
      toplam_maliyet: 1250.45,
      m2_maliyet: 1250.45,
      cam_maliyeti: 1000.25,
      cita_maliyeti: null,
      sarf_maliyeti: 80.2,
      islem_maliyeti: 0,
      fire_etkisi: 42.75,
      finansman_etkisi: 0,
      kur_etkisi: null,
      onceki_toplam_maliyet: 1200.45,
      maliyet_farki: 50,
      maliyet_farki_yuzde: 4.1651,
      toplam_kayit: 17,
      detay: {
        gecerli: true,
        eksikler: [],
      },
    }])
    expect(supabaseMock.rpc).toHaveBeenCalledWith('urun_maliyeti_tarihcesi_v1', {
      p_stok_id: '00000000-0000-4000-8000-000000000101',
      p_baslangic: '2026-01-01',
      p_bitis: '2026-07-30',
      p_limit: 75,
    })
  })

  it('ürün maliyet tarihçesinde boş tarihleri null ve varsayılan limiti 200 gönderir', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: [], error: null })

    await expect(maliyetUrunMaliyetTarihcesiniGetir(
      '00000000-0000-4000-8000-000000000101',
      ' ',
      '',
    )).resolves.toEqual([])
    expect(supabaseMock.rpc).toHaveBeenCalledWith('urun_maliyeti_tarihcesi_v1', {
      p_stok_id: '00000000-0000-4000-8000-000000000101',
      p_baslangic: null,
      p_bitis: null,
      p_limit: 200,
    })
  })

  it('tedarikçi fiyat seçeneklerini ürün, varyant ve serbest vadeyle toplu kaydeder', async () => {
    const payload = {
      tedarikci_id: '00000000-0000-4000-8000-000000000010',
      fiyat_tarihi: '2026-07-29T00:00:00+03:00',
      gecerlilik_baslangici: '2026-07-29T00:00:00+03:00',
      kaynak_referansi: 'Bursa tedarikçi listesi',
      kalemler: [{
        stok_id: '00000000-0000-4000-8000-000000000011',
        birim_fiyat: 455.75,
        para_birimi: 'TRY' as const,
        fiyat_birimi: 'm2' as const,
        varyant: 'genel' as const,
        vade_gunu: 45,
        marka: 'Yerel Marka',
      }],
    }
    supabaseMock.rpc.mockResolvedValue({
      data: { basarili: true, fiyat_ids: ['00000000-0000-4000-8000-000000000012'] },
      error: null,
    })

    await stokTedarikciFiyatTeklifleriniKaydetV3(payload, 'fiyat-v3-anahtar')

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'stok_tedarikci_fiyat_tekliflerini_kaydet_v3',
      {
        p_payload: payload,
        p_idempotency_key: 'fiyat-v3-anahtar',
      },
    )
  })

  it('toplu politikada ME eşleşmesi yoksa genel fiyatı açık tercihle kullanabilir', async () => {
    const payload = {
      kapsam: 'cam' as const,
      tedarikci_id: '00000000-0000-4000-8000-000000000020',
      varyant: 'me' as const,
      vade_gunu: 60,
      genel_fallback: true,
      baslangic: '2026-07-29T00:00:00+03:00',
      gerekce: 'Şişecam 60 gün ME politikası',
    }
    supabaseMock.rpc.mockResolvedValue({
      data: { basarili: true, secilenler: [], eksikler: [] },
      error: null,
    })

    await stokMaliyetTopluPolitikaUygulaV3(payload, 'politika-v3-anahtar')

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'stok_maliyet_toplu_politika_uygula_v3',
      {
        p_payload: payload,
        p_idempotency_key: 'politika-v3-anahtar',
      },
    )
  })

  it('aktif kaynak panelindeki sayısal fiyat ve vade alanlarını normalize eder', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        tarih: '2026-07-29',
        stoklar: [{
          stok_id: '00000000-0000-4000-8000-000000000030',
          stok_kodu: '01002',
          stok_adi: '4 mm DC',
          kategori: 'cam',
          aktif_fiyat: {
            fiyat_id: '00000000-0000-4000-8000-000000000031',
            secim_seviyesi: 'toplu',
            tedarikci_adi: 'Şişecam',
            fiyat_varyanti: 'me',
            birim_fiyat: '329.40',
            vade_gunu: '60',
          },
          toplu_politika: {},
          alternatifler: [{
            fiyat_id: '00000000-0000-4000-8000-000000000031',
            tedarikci: 'Şişecam',
            varyant: 'me',
            birim_fiyat: '329.40',
            vade_gunu: '60',
          }],
        }],
        eksikler: [],
      },
      error: null,
    })

    await expect(stokMaliyetKaynakPaneliniGetirV3('2026-07-29')).resolves.toEqual(
      expect.objectContaining({
        stoklar: [
          expect.objectContaining({
            kapsam: 'cam',
            secim_seviyesi: 'toplu_politika',
            aktif_fiyat: expect.objectContaining({
              birim_fiyat: 329.4,
              vade_gunu: 60,
              varyant: 'me',
              tedarikci_adi: 'Şişecam',
            }),
            alternatifler: [
              expect.objectContaining({
                stok_id: '00000000-0000-4000-8000-000000000030',
                birim_fiyat: 329.4,
                vade_gunu: 60,
                tedarikci_adi: 'Şişecam',
              }),
            ],
          }),
        ],
      }),
    )
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'stok_maliyet_kaynak_paneli_getir_v3',
      { p_tarih: '2026-07-29' },
    )
  })

  it('temiz katalogdan sonra standart reçete ve stok firelerini idempotent kurar', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        basarili: true,
        uygulandi: true,
        baslangic: '2026-07-29',
        kurulanlar: [{ stok_kodu: '03001' }],
        mevcutlar: [],
        oneriler: [],
        belirsizler: [],
        eksikler: [],
      },
      error: null,
    })

    await expect(
      standartUrunReceteleriniKurV3('2026-07-29', undefined, true),
    ).resolves.toEqual(expect.objectContaining({
      basarili: true,
      uygulandi: true,
      baslangic: '2026-07-29',
      oneriler: [],
    }))

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'standart_urun_recetelerini_kur_v3',
      {
        p_baslangic: '2026-07-29',
        p_urun_stok_ids: null,
        p_uygula: true,
      },
    )
  })

  it('temper panelindeki sayısal alanları ve tek aktif modeli normalize eder', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        tarih: '2026-07-29',
        hazir: true,
        hizmet_stogu: {
          stok_id: '00000000-0000-4000-8000-000000000040',
          stok_kodu: 'HIZMET-TEMPER-DIS',
          stok_adi: 'Temper Dış Hizmet',
          birim: 'm2',
          aktif_fiyat: null,
          alternatifler: [{
            fiyat_id: '00000000-0000-4000-8000-000000000041',
            stok_id: '00000000-0000-4000-8000-000000000040',
            tedarikci_id: '00000000-0000-4000-8000-000000000042',
            tedarikci_adi: 'Bursa Temper',
            birim_fiyat: '125.50',
            para_birimi: 'TRY',
            fiyat_birimi: 'm2',
            varyant: 'genel',
            vade_gunu: '60',
            fiyat_tarihi: '2026-07-29',
          }],
        },
        aktif_cozum: {
          gecerli: true,
          mod: 'dis_hizmet',
          mod_surumu_id: '00000000-0000-4000-8000-000000000043',
          alan_m2: '1',
          birim_maliyet_try: '125.50',
          toplam_maliyet: '125.50',
          dis_hizmet_fiyati: {
            fiyat_id: '00000000-0000-4000-8000-000000000041',
            hizmet_stok_id: '00000000-0000-4000-8000-000000000040',
            tedarikci_id: '00000000-0000-4000-8000-000000000042',
            tedarikci_adi: 'Bursa Temper',
            birim_fiyat: '125.50',
            para_birimi: 'TRY',
            fiyat_birimi: 'm2',
            varyant: 'genel',
            vade_gunu: '60',
            fiyat_tarihi: '2026-07-29T00:00:00+03:00',
            secim_baslangici: '2026-07-29T00:00:00+03:00',
          },
          ic_uretim_kalemleri: [],
          hatalar: [],
        },
        mod_surumleri: [{
          mod_surumu_id: '00000000-0000-4000-8000-000000000043',
          mod: 'dis_hizmet',
          revision_no: '2',
          gecerlilik_baslangici: '2026-07-29',
          gerekce: 'Dış hizmet modeli seçildi.',
          ic_uretim_kalemleri: [],
        }],
        urun_fiyat_secimleri: [{
          secim_id: '00000000-0000-4000-8000-000000000044',
          urun_stok_id: '00000000-0000-4000-8000-000000000045',
          urun_stok_kodu: '11004',
          fiyat_id: '00000000-0000-4000-8000-000000000041',
          tedarikci_id: '00000000-0000-4000-8000-000000000042',
          tedarikci_adi: 'Bursa Temper',
          birim_fiyat: '130.25',
          para_birimi: 'TRY',
          fiyat_birimi: 'm2',
          vade_gunu: '30',
          marka: 'Temper Bursa',
          gecerlilik_baslangici: '2026-07-29',
          gerekce: 'Ürüne özel fiyat.',
        }],
        urun_cozumleri: [{
          stok_id: '00000000-0000-4000-8000-000000000045',
          stok_kodu: '11004',
          stok_adi: 'Temperli Isıcam',
          recete_surumu_id: '00000000-0000-4000-8000-000000000046',
          gecerli: true,
          mod: 'dis_hizmet',
          birim_maliyet_try: '130.25',
          hatalar: [],
          cozum: {
            gecerli: true,
            mod: 'dis_hizmet',
            mod_surumu_id: '00000000-0000-4000-8000-000000000043',
            alan_m2: '1',
            birim_maliyet_try: '130.25',
            toplam_maliyet: '130.25',
            dis_hizmet_fiyati: {
              fiyat_id: '00000000-0000-4000-8000-000000000041',
              hizmet_stok_id: '00000000-0000-4000-8000-000000000040',
              tedarikci_id: '00000000-0000-4000-8000-000000000042',
              tedarikci_adi: 'Bursa Temper',
              birim_fiyat: '130.25',
              para_birimi: 'TRY',
              fiyat_birimi: 'm2',
              varyant: 'genel',
              vade_gunu: '30',
              marka: 'Temper Bursa',
              fiyat_tarihi: '2026-07-29T00:00:00+03:00',
              secim_baslangici: '2026-07-29T00:00:00+03:00',
            },
            ic_uretim_kalemleri: [],
            hatalar: [],
          },
        }],
        eksikler: [],
      },
      error: null,
    })

    await expect(temperMaliyetPaneliniGetirV4('2026-07-29')).resolves.toEqual(
      expect.objectContaining({
        aktif_cozum: expect.objectContaining({
          mod: 'dis_hizmet',
          alan_m2: 1,
          birim_maliyet_try: 125.5,
          dis_hizmet_fiyati: expect.objectContaining({
            stok_id: '00000000-0000-4000-8000-000000000040',
          }),
        }),
        hizmet_stogu: expect.objectContaining({
          alternatifler: [
            expect.objectContaining({
              birim_fiyat: 125.5,
              vade_gunu: 60,
            }),
          ],
        }),
        mod_surumleri: [
          expect.objectContaining({ mod: 'dis_hizmet', revision_no: 2 }),
        ],
        urun_fiyat_secimleri: [
          expect.objectContaining({
            urun_stok_kodu: '11004',
            birim_fiyat: 130.25,
            vade_gunu: 30,
            marka: 'Temper Bursa',
          }),
        ],
        urun_cozumleri: [
          expect.objectContaining({
            stok_kodu: '11004',
            gecerli: true,
            birim_maliyet_try: 130.25,
          }),
        ],
        hazir: true,
      }),
    )
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'temper_maliyet_paneli_getir_v4',
      { p_tarih: '2026-07-29' },
    )
  })

  it('temper panelinde bilinmeyen mod veya bileşeni geçerli varsaymak yerine sözleşme hatası verir', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: {
        tarih: '2026-07-29',
        hazir: false,
        hizmet_stogu: null,
        aktif_cozum: {
          gecerli: false,
          mod: 'karma_model',
          mod_surumu_id: null,
          alan_m2: 1,
          birim_maliyet_try: null,
          toplam_maliyet: null,
          dis_hizmet_fiyati: null,
          ic_uretim_kalemleri: [],
          hatalar: [],
        },
        mod_surumleri: [],
        urun_fiyat_secimleri: [],
        urun_cozumleri: [],
        eksikler: [],
      },
      error: null,
    })

    await expect(temperMaliyetPaneliniGetirV4('2026-07-29')).rejects.toThrow(
      /beklenen sözleşmeyle uyuşmuyor.*mod/,
    )

    supabaseMock.rpc.mockResolvedValueOnce({
      data: {
        tarih: '2026-07-29',
        hazir: true,
        hizmet_stogu: null,
        aktif_cozum: null,
        mod_surumleri: [{
          mod_surumu_id: '00000000-0000-4000-8000-000000000050',
          mod: 'ic_uretim',
          revision_no: 1,
          gecerlilik_baslangici: '2026-07-29',
          gerekce: 'İç üretim modeli.',
          ic_uretim_kalemleri: [{
            sira_no: 1,
            bilesen_turu: 'bakim',
            aciklama: 'Bakım',
            tuketim_birimi: 'saat',
            m2_basina_tuketim: 1,
            birim_maliyet_try: 1,
          }],
        }],
        urun_fiyat_secimleri: [],
        urun_cozumleri: [],
        eksikler: [],
      },
      error: null,
    })

    await expect(temperMaliyetPaneliniGetirV4('2026-07-29')).rejects.toThrow(
      /beklenen sözleşmeyle uyuşmuyor.*bilesen_turu/,
    )
  })

  it('temper ürün çözümünde geçerli alanı boolean değilse sessizce eksik saymaz', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        tarih: '2026-07-29',
        hazir: false,
        hizmet_stogu: null,
        aktif_cozum: null,
        mod_surumleri: [],
        urun_fiyat_secimleri: [],
        urun_cozumleri: [{
          stok_id: '00000000-0000-4000-8000-000000000060',
          stok_kodu: '11004',
          stok_adi: 'Temperli Isıcam',
          recete_surumu_id: '00000000-0000-4000-8000-000000000061',
          gecerli: 'false',
          mod: null,
          birim_maliyet_try: null,
          hatalar: [],
          cozum: null,
        }],
        eksikler: [],
      },
      error: null,
    })

    await expect(temperMaliyetPaneliniGetirV4('2026-07-29')).rejects.toThrow(
      /beklenen sözleşmeyle uyuşmuyor.*urun_cozumu\.gecerli/,
    )
  })

  it('migration 110 temper seçim çatışmasını kullanıcı dostu mesaja çevirir', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '23P01',
        message: 'AYNI_BASLANGICTA_TEMPER_FIYAT_SECIMI_VAR',
      },
    })

    await expect(temperDisHizmetFiyatSecV4({
      fiyat_id: '00000000-0000-4000-8000-000000000041',
      baslangic: '2026-07-29T00:00:00+03:00',
      gerekce: 'Aynı başlangıç için yeni bir seçim denemesi.',
    }, 'temper-fiyat-cakisma-key')).rejects.toThrow(
      'Aynı başlangıç tarihinde zaten bir temper fiyat seçimi var. Farklı bir başlangıç tarihi seçin.',
    )
  })

  it('temper model sürümünü ve ürün grubu fiyat seçimini V4 RPC sözleşmesiyle kaydeder', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await temperMaliyetModuKaydetV4({
      mod: 'dis_hizmet',
      baslangic: '2026-07-29',
      gerekce: 'Dış hizmet modeli seçildi.',
      dis_hizmet_stok_id: '00000000-0000-4000-8000-000000000040',
    }, 'temper-mod-key')
    await temperDisHizmetFiyatSecV4({
      fiyat_id: '00000000-0000-4000-8000-000000000041',
      baslangic: '2026-07-29T00:00:00+03:00',
      gerekce: 'Seçili ürünlerin temper fiyatı.',
      urun_stok_ids: [
        '00000000-0000-4000-8000-000000000045',
        '00000000-0000-4000-8000-000000000046',
      ],
    }, 'temper-fiyat-key')

    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(
      1,
      'temper_maliyet_modu_kaydet_v4',
      {
        p_payload: expect.objectContaining({
          mod: 'dis_hizmet',
          dis_hizmet_stok_id: '00000000-0000-4000-8000-000000000040',
        }),
        p_idempotency_key: 'temper-mod-key',
      },
    )
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(
      2,
      'temper_dis_hizmet_fiyat_sec_v4',
      {
        p_payload: expect.objectContaining({
          urun_stok_ids: [
            '00000000-0000-4000-8000-000000000045',
            '00000000-0000-4000-8000-000000000046',
          ],
        }),
        p_idempotency_key: 'temper-fiyat-key',
      },
    )
  })
})
