import { describe, expect, it } from 'vitest'
import { istasyonAktifMi } from './istasyonPresence'

describe('istasyonAktifMi', () => {
  it('presence listesi boşken istasyonu kapalı kabul eder', () => {
    expect(istasyonAktifMi({}, 'kumanda')).toBe(false)
  })

  it('kumanda presence kaydı varsa istasyonu aktif kabul eder', () => {
    expect(istasyonAktifMi({
      'kumanda-1': [{ istasyon: 'kumanda' }],
      'poz-1': [{ istasyon: 'poz_giris' }],
    }, 'kumanda')).toBe(true)
  })

  it('yalnızca başka istasyonlar bağlıysa kumandayı kapalı kabul eder', () => {
    expect(istasyonAktifMi({
      'poz-1': [{ istasyon: 'poz_giris' }],
      'gosterge-1': [{ istasyon: 'gosterge' }],
    }, 'kumanda')).toBe(false)
  })
})
