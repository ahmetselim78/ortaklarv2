import { describe, it, expect } from 'vitest'
import {
  paneToHctFam,
  monolitStokToHctFam,
  monolitFamCoz,
  normalizeLegacyFamKodu,
  normalizeFamHaritasi,
  optiExportSorunlariTekillestir,
  hctFamEtiketi,
} from './hctFam'

describe('normalizeLegacyFamKodu', () => {
  it('4FUME → 4FM', () => {
    expect(normalizeLegacyFamKodu('4FUME')).toEqual({ fam: '4FM', normalizeEdildi: true })
  })

  it('4BUZ → 4BC', () => {
    expect(normalizeLegacyFamKodu('4BUZ')).toEqual({ fam: '4BC', normalizeEdildi: true })
  })

  it('zaten HCT kodu dokunulmaz', () => {
    expect(normalizeLegacyFamKodu('4FM')).toEqual({ fam: '4FM', normalizeEdildi: false })
  })
})

describe('paneToHctFam', () => {
  it('4mm fume → 4FM destekleniyor', () => {
    expect(paneToHctFam(4, 'fume')).toEqual({ fam: '4FM', destekleniyor: true })
  })

  it('6mm fume → 6FM uyarı', () => {
    const sonuc = paneToHctFam(6, 'fume')
    expect(sonuc.fam).toBe('6FM')
    expect(sonuc.destekleniyor).toBe(false)
    if (!sonuc.destekleniyor) expect(sonuc.uyari).toContain('6FM')
  })

  it('4mm yesil → 4YS', () => {
    expect(paneToHctFam(4, 'yesil')).toEqual({ fam: '4YS', destekleniyor: true })
  })

  it('reflekte pane throw', () => {
    expect(() => paneToHctFam(4, 'reflekte')).toThrow(/REFLEKTE/)
  })
})

describe('monolitStokToHctFam', () => {
  it('01016 4+4 lamine → 44LM', () => {
    expect(monolitStokToHctFam({ kod: '01016', ad: '4+4 Lamine', grup: 'DÜZCAM', katman_yapisi: '4+4' })).toEqual({
      fam: '44LM',
      destekleniyor: true,
    })
  })

  it('01017 ayna → AYN', () => {
    expect(monolitStokToHctFam({ kod: '01017', ad: '4 mm Ayna', grup: 'AYNA', kalinlik_mm: 4 })).toEqual({
      fam: 'AYN',
      destekleniyor: true,
    })
  })

  it('6+6 lamine otomatik 44LM yapılmaz', () => {
    expect(() =>
      monolitStokToHctFam({ kod: '01999', ad: '6+6 Lamine', grup: 'DÜZCAM', katman_yapisi: '6+6' }),
    ).toThrow(/yalnızca 4\+4/)
  })

  it('01005 düzcam → 4DC', () => {
    expect(monolitStokToHctFam({ kod: '01005', ad: '4 mm DC', grup: 'DÜZCAM', kalinlik_mm: 4 })).toEqual({
      fam: '4DC',
      destekleniyor: true,
    })
  })
})

describe('monolitFamCoz', () => {
  it('legacy override normalize', () => {
    const { sonuc, legacyNormalize } = monolitFamCoz(
      { kod: '01013', ad: '4 mm Fume', grup: 'DÜZCAM', kalinlik_mm: 4 },
      [{ stok_kod: '01013', fam_kodu: '4FUME' }],
    )
    expect(sonuc.fam).toBe('4FM')
    expect(legacyNormalize).toBe(true)
  })

  it('belgelenmiş legacy 01018', () => {
    const { sonuc } = monolitFamCoz(
      { kod: '01018', ad: '4 mm Bronz Reflekte', grup: 'DÜZCAM', kalinlik_mm: 4 },
      [],
    )
    expect(sonuc.fam).toBe('4BRZREF')
    expect(sonuc.destekleniyor).toBe(false)
  })
})

describe('normalizeFamHaritasi', () => {
  it('duplicate ve legacy temizler', () => {
    const { harita } = normalizeFamHaritasi([
      { stok_kod: '01013', fam_kodu: '4FUME' },
      { stok_kod: '01013', fam_kodu: '4FM' },
      { stok_kod: '01008', fam_kodu: '4BUZ' },
    ])
    expect(harita).toEqual([
      { stok_kod: '01013', fam_kodu: '4FM' },
      { stok_kod: '01008', fam_kodu: '4BC' },
    ])
  })
})

describe('hctFamEtiketi', () => {
  it('4DC → 4mm DC', () => {
    expect(hctFamEtiketi('4DC')).toBe('4mm DC')
  })

  it('4FM → 4mm FUME', () => {
    expect(hctFamEtiketi('4FM')).toBe('4mm FUME')
  })

  it('44LM → 4+4 LAMINE', () => {
    expect(hctFamEtiketi('44LM')).toBe('4+4 LAMINE')
  })
})

describe('optiExportSorunlariTekillestir', () => {
  it('aynı anahtar satır ve adet toplar', () => {
    const birlesik = optiExportSorunlariTekillestir([
      { seviye: 'uyari', kod: 'HCT_DISI_FAM', stokKod: '01014', fam: '8FM', mesaj: 'uyarı', etkilenenSatir: 1, etkilenenAdet: 2 },
      { seviye: 'uyari', kod: 'HCT_DISI_FAM', stokKod: '01014', fam: '8FM', mesaj: 'uyarı', etkilenenSatir: 1, etkilenenAdet: 3 },
    ])
    expect(birlesik).toHaveLength(1)
    expect(birlesik[0].etkilenenSatir).toBe(2)
    expect(birlesik[0].etkilenenAdet).toBe(5)
  })
})
