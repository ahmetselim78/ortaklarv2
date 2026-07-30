import { describe, expect, it } from 'vitest'
import {
  maliyetCamAdi,
  maliyetCitaAdi,
  maliyetSarfKatsayiMetni,
  maliyetVadeFinansmanEtkisi,
} from './maliyetFormat'

describe('sade maliyet etiketleri', () => {
  it('cam adını kod veya kullanıcıdan genel ad istemeden alanlarından üretir', () => {
    expect(maliyetCamAdi({
      kalinlik_mm: 4,
      cam_turu: 'konfor',
      ozel_tur_adi: null,
    })).toBe('4 mm Konfor Cam')
  })

  it('çıta adını genişlik ve malzeme türünden üretir', () => {
    expect(maliyetCitaAdi({
      genislik_mm: 16,
      malzeme_turu: 'aluminyum',
      ozel_malzeme_adi: null,
    })).toBe('16 mm Alüminyum Çıta')
  })

  it('sarf katsayısını hesaplama kapsamı, boşluk ve fireyle açıklar', () => {
    expect(maliyetSarfKatsayiMetni({
      hesaplama_tipi: 'cevre_m',
      tuketim_katsayisi: 0.12,
      bosluk_basi: true,
      fire_orani: 3,
    }, 'kg')).toBe('0,12 kg · Çevre metresi başına · her cam boşluğu için · %3 fire')
  })
})

describe('satın alma vadesi finansman etkisi', () => {
  it('basit yıllık faiz formülünü gün/365 ile uygular', () => {
    expect(maliyetVadeFinansmanEtkisi(1000, 45, 60)).toBeCloseTo(
      1000 * 0.45 * 60 / 365,
      10,
    )
  })

  it('geçersiz sayılarda ekrana güvenli sıfır döndürür', () => {
    expect(maliyetVadeFinansmanEtkisi(Number.NaN, 45, 60)).toBe(0)
  })
})

