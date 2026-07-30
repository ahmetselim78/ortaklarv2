import { describe, expect, it } from 'vitest'
import {
  STANDART_TEMPER_URUN_KODLARI,
  standartTemperUrunuMu,
  temperTedarikciKapsamiUygunMu,
} from '@/lib/temperMaliyet'

describe('standart temper ürün kapsamı', () => {
  it('yalnız 11004–11008 ürünlerini temper işlemi için kabul eder', () => {
    expect(STANDART_TEMPER_URUN_KODLARI).toEqual([
      '11004',
      '11005',
      '11006',
      '11007',
      '11008',
    ])
    expect(STANDART_TEMPER_URUN_KODLARI.every(standartTemperUrunuMu)).toBe(true)
  })

  it('07122 lamine ürünü temper kapsamına almaz', () => {
    expect(standartTemperUrunuMu('07122')).toBe(false)
    expect(standartTemperUrunuMu('11009')).toBe(false)
  })

  it('özel temper kapsamını ve geçiş uyumlu cam/yan malzeme tedarikçilerini kabul eder', () => {
    expect(temperTedarikciKapsamiUygunMu(['temper_hizmeti'])).toBe(true)
    expect(temperTedarikciKapsamiUygunMu(['cam'])).toBe(true)
    expect(temperTedarikciKapsamiUygunMu(['yan_malzeme'])).toBe(true)
    expect(temperTedarikciKapsamiUygunMu(['cita'])).toBe(false)
    expect(temperTedarikciKapsamiUygunMu([])).toBe(false)
  })
})
