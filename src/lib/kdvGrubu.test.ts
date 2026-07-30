import { describe, expect, it } from 'vitest'
import { kdvGrubuOtomatikAlanlariniOlustur } from './kdvGrubu'

describe('kdvGrubuOtomatikAlanlariniOlustur', () => {
  it('tam sayı oranından kod ve adı otomatik üretir', () => {
    expect(kdvGrubuOtomatikAlanlariniOlustur('20')).toEqual({
      oran: 20,
      kod: 'KDV20',
      ad: 'KDV %20',
    })
  })

  it('ondalıklı oranı Türkçe ad ve güvenli kod biçimine çevirir', () => {
    expect(kdvGrubuOtomatikAlanlariniOlustur('8,5')).toEqual({
      oran: 8.5,
      kod: 'KDV8_5',
      ad: 'KDV %8,5',
    })
  })

  it.each(['', '-1', '100.0001', 'abc', '8.12345'])(
    'geçersiz oranı reddeder: %s',
    (oran) => {
      expect(kdvGrubuOtomatikAlanlariniOlustur(oran)).toBeNull()
    },
  )
})
