import { describe, expect, it, vi } from 'vitest'
import { stokKataloguVeReceteleriKur } from './stokBaslangicKurulumAkisi'

describe('stok başlangıç katalogu iki aşamalı kurulumu', () => {
  it('katalog ve reçete başarılı olduğunda iki sonucu birlikte döndürür', async () => {
    const kataloguKur = vi.fn().mockResolvedValue({ kurulu: true, eklenen: 128 })
    const receteleriKur = vi.fn().mockResolvedValue({ kurulanlar: [{ stok_kodu: '10005' }] })

    const sonuc = await stokKataloguVeReceteleriKur(kataloguKur, receteleriKur)

    expect(sonuc).toEqual({
      katalog: { kurulu: true, eklenen: 128 },
      recete: { kurulanlar: [{ stok_kodu: '10005' }] },
      receteHatasi: null,
    })
    expect(receteleriKur).toHaveBeenCalledOnce()
  })

  it('reçete kurulumu hata verse de başarılı katalog sonucunu kaybetmez', async () => {
    const kataloguKur = vi.fn().mockResolvedValue({ kurulu: true, eklenen: 13 })
    const receteleriKur = vi.fn().mockRejectedValue(new Error('RECETE_EKSIK_BILESEN'))

    const sonuc = await stokKataloguVeReceteleriKur(kataloguKur, receteleriKur)

    expect(sonuc.katalog).toEqual({ kurulu: true, eklenen: 13 })
    expect(sonuc.recete).toBeNull()
    expect(sonuc.receteHatasi?.message).toBe('RECETE_EKSIK_BILESEN')
  })

  it('katalog kurulumu hata verirse reçete aşamasını hiç çalıştırmaz', async () => {
    const kataloguKur = vi.fn().mockRejectedValue(new Error('KATALOG_KURULAMADI'))
    const receteleriKur = vi.fn()

    await expect(stokKataloguVeReceteleriKur(
      kataloguKur,
      receteleriKur,
    )).rejects.toThrow('KATALOG_KURULAMADI')
    expect(receteleriKur).not.toHaveBeenCalled()
  })
})
