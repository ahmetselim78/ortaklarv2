import { describe, expect, it } from 'vitest'
import {
  VARSAYILAN_ETIKET_AYARLARI,
  dplUret,
  etiketAlanDegeri,
  etiketAyarlariBirlestir,
  etiketSiparisNoMetni,
  etiketYerlesimUyarilari,
} from '@/types/ayarlar'
import type { EtiketAyarlari, EtiketVeri } from '@/types/ayarlar'

const VERI: EtiketVeri = {
  cam_kodu: '37',
  cam_tipi: '4+16+4 TEMP',
  cari_adi: 'NOVEL',
  alt_musteri: 'AKYOL LOUNGE',
  siparis_no: 'SIP-2026-0058',
  poz: '12',
  liste_adedi: 48,
  batch_sira: 37,
  genislik_mm: 600,
  yukseklik_mm: 400,
}

function varsayilan(): EtiketAyarlari {
  return structuredClone(VARSAYILAN_ETIKET_AYARLARI)
}

describe('etiketAyarlariBirlestir', () => {
  it('eski JSON kaydını V2 alan varsayılanlarıyla derin birleştirir', () => {
    const ayarlar = etiketAyarlariBirlestir({
      boyut: { genislik_mm: 80 },
      icerik: { barkod: false },
      yerlesim: { alanlar: { poz: { x_mm: 12.5 } } },
    })

    expect(ayarlar.boyut).toEqual({ genislik_mm: 80, yukseklik_mm: 50 })
    expect(ayarlar.icerik.barkod).toBe(false)
    expect(ayarlar.icerik.poz).toBe(false)
    expect(ayarlar.yerlesim.surum).toBe(2)
    expect(ayarlar.yerlesim.nokta_genislik).toBe(2)
    expect(ayarlar.yerlesim.alanlar.poz.x_mm).toBe(12.5)
    expect(ayarlar.yerlesim.alanlar.poz.font).toBe(2)
    expect(ayarlar.yerlesim.alanlar.barkod.barkod_yukseklik_mm).toBe(12)
  })

  it('eski dolu DPL şablonunu sessizce ezmez ve uzman moduna taşır', () => {
    const ayarlar = etiketAyarlariBirlestir({ dpl_sablonu: '\\x02L\\rE\\r' })
    expect(ayarlar.dpl_modu).toBe('ozel')
    expect(ayarlar.dpl_sablonu).toBe('\\x02L\\rE\\r')
  })
})

describe('etiketAlanDegeri', () => {
  it('boyutu yükseklik×genişlik olarak mm suffix olmadan üretir', () => {
    expect(etiketAlanDegeri('boyut', VERI)).toBe('400x600')
  })

  it('poz ve toplam adet alanlarına P ve AD ekler', () => {
    expect(etiketAlanDegeri('poz', VERI)).toBe('P 12')
    expect(etiketAlanDegeri('liste_adedi', VERI)).toBe('48 AD')
  })

  it('poz ve adet karakter sınırını önek/sonek yerine gövdeye uygular', () => {
    expect(etiketAlanDegeri('poz', VERI, undefined, 1)).toBe('P 1')
    expect(etiketAlanDegeri('poz', VERI, undefined, 2)).toBe('P 12')
    expect(etiketAlanDegeri('liste_adedi', VERI, undefined, 1)).toBe('4 AD')
    expect(etiketAlanDegeri('liste_adedi', VERI, undefined, 2)).toBe('48 AD')
  })

  it('batch sıra numarasını basar', () => {
    expect(etiketAlanDegeri('batch_sira', VERI)).toBe('37')
  })

  it('sipariş numarasının son 4 hanesini basar', () => {
    expect(etiketSiparisNoMetni('SIP-2026-0058')).toBe('0058')
    expect(etiketAlanDegeri('siparis_no', VERI)).toBe('0058')
  })
})

describe('dplUret V2 yerleşimi', () => {
  it('M-4206 profili, metrik mod ve alan koordinatlarını üretir', () => {
    const dpl = dplUret(varsayilan(), VERI)

    expect(dpl.startsWith('\x02L\rH10\rD22\rm\r')).toBe(true)
    expect(dpl).toContain('1e110470050005037\r')
    expect(dpl.endsWith('Q0001\rE\r')).toBe(true)
  })

  it('alan X/Y ve genel ofsetini 0,1 mm hassasiyetle gerçek DPL row/column alanına yansıtır', () => {
    const ayarlar = varsayilan()
    ayarlar.icerik.barkod = false
    ayarlar.icerik.poz = true
    ayarlar.yerlesim.alanlar.poz.x_mm = 12.3
    ayarlar.yerlesim.alanlar.poz.y_mm = 7.8
    ayarlar.yerlesim.x_ofset_mm = 0.2
    ayarlar.yerlesim.y_ofset_mm = -0.3

    const dpl = dplUret(ayarlar, VERI)
    expect(dpl).toContain('121100000750125P 12\r')
  })

  it('font, ölçek, dönüş ve karakter sınırını uygular', () => {
    const ayarlar = varsayilan()
    ayarlar.icerik.barkod = false
    ayarlar.icerik.poz = true
    ayarlar.yerlesim.alanlar.poz = {
      ...ayarlar.yerlesim.alanlar.poz,
      x_mm: 10,
      y_mm: 12,
      rotasyon: 2,
      font: 4,
      genislik_carpani: 3,
      yukseklik_carpani: 2,
      maks_karakter: 1,
    }

    const dpl = dplUret(ayarlar, VERI)
    expect(dpl).toContain('243200001200100P 1\r')
  })

  it('uzun sipariş pozunu sağ sınırda kesmek yerine font ve genişliği otomatik sığdırır', () => {
    const ayarlar = varsayilan()
    ayarlar.icerik.barkod = false
    ayarlar.icerik.poz = true
    ayarlar.yerlesim.alanlar.poz = {
      ...ayarlar.yerlesim.alanlar.poz,
      x_mm: 57.9,
      y_mm: 26.9,
      font: 5,
      genislik_carpani: 3,
      yukseklik_carpani: 1,
    }

    const dpl = dplUret(ayarlar, { ...VERI, poz: '4 - K-1' })
    expect(dpl).toContain('131100002690579P 4 - K-1\r')
  })

  it('poz maksimum karakteri artınca DPL içeriğinde daha fazla poz karakteri üretir', () => {
    const ayarlar = varsayilan()
    ayarlar.icerik.barkod = false
    ayarlar.icerik.poz = true
    ayarlar.yerlesim.alanlar.poz.maks_karakter = 3
    expect(dplUret(ayarlar, { ...VERI, poz: '12 - K-1' })).toContain('P 12 \r')

    ayarlar.yerlesim.alanlar.poz.maks_karakter = 8
    expect(dplUret(ayarlar, { ...VERI, poz: '12 - K-1' })).toContain('P 12 - K-1\r')
  })

  it('barkod dönüş, modül, yükseklik ve okunabilir metin seçimini uygular', () => {
    const ayarlar = varsayilan()
    ayarlar.yerlesim.alanlar.barkod = {
      ...ayarlar.yerlesim.alanlar.barkod,
      x_mm: 8,
      y_mm: 9,
      rotasyon: 3,
      barkod_yukseklik_mm: 25.4,
      barkod_modul_genisligi: 2,
      barkod_okunabilir_metin: true,
    }

    const dpl = dplUret(ayarlar, VERI)
    expect(dpl).toContain('3E221000090008037\r')
  })

  it('seçili alan testinde alan kapalı olsa da yalnız o alanı üretir', () => {
    const ayarlar = varsayilan()
    const dpl = dplUret(ayarlar, VERI, { sadece_alan: 'musteri_adi', paneli_zorla: true })
    expect(dpl).toContain('NOVEL\r')
    expect(dpl).not.toContain('37\r')
  })

  it('özel DPL modunda panel üretimini açıkça bypass eder', () => {
    const ayarlar = varsayilan()
    ayarlar.dpl_modu = 'ozel'
    ayarlar.dpl_sablonu = '\\x02L\\r111100000500050{cam_kodu}\\rE\\r'

    expect(dplUret(ayarlar, VERI)).toBe('\x02L\r11110000050005037\rE\r')
    expect(dplUret(ayarlar, VERI, { paneli_zorla: true })).toContain('D22\r')
  })
})

describe('etiketYerlesimUyarilari', () => {
  it('açık bir alan etiketten taştığında kaydetmeyi engelleyecek hata üretir', () => {
    const ayarlar = varsayilan()
    ayarlar.icerik.poz = true
    ayarlar.yerlesim.alanlar.poz.x_mm = 98
    const uyarilar = etiketYerlesimUyarilari(ayarlar, VERI)
    expect(uyarilar.some(uyari => uyari.alan === 'poz' && uyari.seviye === 'hata')).toBe(true)
  })

  it('tüm alanlar kapalıysa boş etiket uyarısı üretir', () => {
    const ayarlar = varsayilan()
    Object.keys(ayarlar.icerik).forEach(anahtar => {
      ayarlar.icerik[anahtar as keyof typeof ayarlar.icerik] = false
    })
    const uyarilar = etiketYerlesimUyarilari(ayarlar, VERI)
    expect(uyarilar).toContainEqual({ seviye: 'hata', mesaj: 'Basılacak en az bir alanı açın.' })
  })
})
