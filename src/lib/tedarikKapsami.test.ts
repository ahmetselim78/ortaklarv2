import { describe, expect, it } from 'vitest'
import {
  stokKategorisininTedarikKapsami,
  stokProfilininTedarikKapsami,
  tedarikKapsamiEtiketi,
  tedarikKapsamiOzetMetni,
  tedarikKapsamlariniTemizle,
  tedarikciStokKapsaminaUyar,
} from '@/lib/tedarikKapsami'

describe('tedarik kapsamı', () => {
  it('tedarikçi için geçerli seçimleri tekilleştirir', () => {
    expect(tedarikKapsamlariniTemizle('tedarikci', ['cam', 'cita', 'cam'])).toEqual([
      'cam',
      'cita',
    ])
  })

  it('müşteriye çevrilen carinin tedarik kapsamını temizler', () => {
    expect(tedarikKapsamlariniTemizle('musteri', ['yan_malzeme'])).toEqual([])
  })

  it('kullanıcı etiketini döndürür', () => {
    expect(tedarikKapsamiEtiketi('yan_malzeme')).toBe('Yan malzeme / sarf')
    expect(tedarikKapsamiEtiketi('temper_hizmeti')).toBe('Temper hizmeti')
  })

  it('yalnız temper hizmeti veren tedarikçiyi ayrı kapsam olarak korur', () => {
    expect(
      tedarikKapsamlariniTemizle('tedarikci', ['temper_hizmeti']),
    ).toEqual(['temper_hizmeti'])
  })

  it('çıtacıya karışık katalogdan yalnız çıta stoklarını açar', () => {
    const stoklar = [
      { stok_kodu: '01002', profil_turu: 'cam' as const },
      { stok_kodu: 'CITA-AL-009', profil_turu: 'cita' as const },
      { stok_kodu: 'SARF-BUTIL', profil_turu: 'sarf' as const },
    ]

    expect(stoklar.filter((stok) => tedarikciStokKapsaminaUyar(['cita'], stok)))
      .toEqual([{ stok_kodu: 'CITA-AL-009', profil_turu: 'cita' }])
  })

  it('envantersiz temper hizmetini fiziksel yan malzemeden ayırır', () => {
    const temper = { stok_kodu: 'HIZMET-TEMPER-DIS', profil_turu: 'sarf' as const }

    expect(stokProfilininTedarikKapsami(temper)).toBe('temper_hizmeti')
    expect(tedarikciStokKapsaminaUyar(['yan_malzeme'], temper)).toBe(false)
    expect(tedarikciStokKapsaminaUyar(['temper_hizmeti'], temper)).toBe(true)
    expect(stokKategorisininTedarikKapsami('yan_malzeme', 'temper_dis_hizmet'))
      .toBe('temper_hizmeti')
  })

  it('tedarikçi kartında yalnız seçili kapsamları özetler', () => {
    expect(tedarikKapsamiOzetMetni(['cita'])).toBe('Çıta')
    expect(tedarikKapsamiOzetMetni(['cam', 'yan_malzeme']))
      .toBe('Cam ve Yan malzeme / sarf')
    expect(tedarikKapsamiOzetMetni([])).toBe('Ürün kapsamı tanımlanmamış')
  })
})
