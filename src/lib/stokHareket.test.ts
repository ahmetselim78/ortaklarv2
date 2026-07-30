import { describe, expect, it } from 'vitest'
import {
  STOK_HAREKET_ETIKETLERI,
  stokHareketiGirisMi,
  stokMiktari,
  yerelTarihSaatDegeri,
} from './stokHareket'

describe('stok hareket yardımcıları', () => {
  it('giriş ve çıkış hareketlerini ayırır', () => {
    expect(stokHareketiGirisMi('alis_girisi')).toBe(true)
    expect(stokHareketiGirisMi('fire')).toBe(false)
    expect(STOK_HAREKET_ETIKETLERI.iade_cikisi).toContain('iade')
  })

  it('miktarı Türkçe ve birimiyle biçimler', () => {
    expect(stokMiktari(12.5, 'kg')).toContain('12,5 kg')
  })

  it('datetime-local için saniyesiz değer üretir', () => {
    expect(yerelTarihSaatDegeri(new Date('2026-07-27T09:15:30Z'))).toMatch(/^2026-07-27T\d{2}:15$/)
  })
})
