import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  optiTumParcalar,
  optiImpOlustur,
  impBoyutlari,
  OptiExportSiraNoHatasi,
  OptiExportKritikHatasi,
  optiExportAnalizEt,
  optiExportTurleri,
} from './optiExport'
import { paneCamTipleri } from './paneCamTipi'
import { optiImpBufferOlustur } from '@/services/exportService'
import {
  parseImpBytes,
  compareImpPiecesCore,
  inspectImpBinary,
  impNDagilimi,
  impEncodeCp1254,
} from './impParser'
import {
  impExport0851Detaylari,
  IMP_EXPORT_0851_META,
  N1_REFERANS_STOK,
} from './fixtures/imp-export-0851.fixture'
import fixtureRows from './fixtures/imp-export-0851-rows.json'
import type { UretimEmriDetay } from '@/types/uretim'

const REFERANS_IMP = path.resolve('opti programı için export/gerçek.IMP')

function detaySatir(
  overrides: Partial<UretimEmriDetay> & {
    genislik_mm: number
    yukseklik_mm: number
    adet?: number
    stok: NonNullable<UretimEmriDetay['siparis_detaylari']>['stok']
  },
): UretimEmriDetay {
  const id = overrides.id ?? 'test-line-1'
  return {
    id,
    uretim_emri_id: 'batch-1',
    siparis_detay_id: 'sd-1',
    sira_no: 'sira_no' in overrides ? overrides.sira_no! : 1,
    siparis_detaylari: {
      cam_kodu: 'GLS-0001',
      genislik_mm: overrides.genislik_mm,
      yukseklik_mm: overrides.yukseklik_mm,
      adet: overrides.adet ?? 1,
      kenar_islemi: null,
      notlar: null,
      poz: null,
      cita_stok_id: null,
      stok: overrides.stok,
      siparisler: {
        id: 's1',
        siparis_no: 'SIP-2026-0001',
        harici_siparis_no: '26/0851',
        alt_musteri: 'TEST',
        cari: { ad: 'TEST' },
      },
    },
  }
}

const STOK_DC = {
  kod: '10005',
  ad: '4+16+4 ISICAM C',
  grup: 'ISICAM',
  katman_yapisi: '4+16+4',
  kalinlik_mm: null,
}

const STOK_FUME_ISICAM = {
  kod: '10208',
  ad: 'K 4+16+4 FUME ISICAM',
  grup: 'ISICAM',
  katman_yapisi: '4+16+4',
  kalinlik_mm: null,
}

const STOK_C_BUZLU = {
  kod: '10105',
  ad: '4+16+4 ISICAM C BUZLU',
  grup: 'ISICAM',
  katman_yapisi: '4+16+4',
  kalinlik_mm: null,
}

const STOK_MONOLIT_DC = {
  kod: '01005',
  ad: '4 mm DC',
  grup: 'DÜZCAM',
  kalinlik_mm: 4,
}

describe('impBoyutlari', () => {
  it('Test E: 657×1244 → B=1244, H=657', () => {
    expect(impBoyutlari(657, 1244)).toEqual({ b: 1244, h: 657 })
  })

  it('Test F: 1359×627 → B=1359, H=627', () => {
    expect(impBoyutlari(1359, 627)).toEqual({ b: 1359, h: 627 })
  })
})

describe('optiTumParcalar — birim testler', () => {
  it('Test A: 4DC+4DC, adet 1 → N toplamı 2', () => {
    const parcalar = optiTumParcalar(
      [detaySatir({ genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_DC })],
      '4DC',
    )
    expect(parcalar).toHaveLength(1)
    expect(parcalar[0].n).toBe(2)
  })

  it('Test B: 4DC+4DC, adet 2 → N toplamı 4', () => {
    const parcalar = optiTumParcalar(
      [detaySatir({ genislik_mm: 800, yukseklik_mm: 1000, adet: 2, stok: STOK_DC })],
      '4DC',
    )
    expect(parcalar[0].n).toBe(4)
  })

  it('Test C: 4DC+BUZLU, adet 1 → 4DC:1, 4BC:1', () => {
    const detay = detaySatir({ genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_C_BUZLU })
    const dc = optiTumParcalar([detay], '4DC')
    const buz = optiTumParcalar([detay], '4BC')
    expect(dc[0]?.n).toBe(1)
    expect(buz[0]?.n).toBe(1)
  })

  it('Test D: aynı ölçü iki poz → iki ayrı IMP satırı', () => {
    const parcalar = optiTumParcalar(
      [
        detaySatir({ id: 'l1', sira_no: 1, genislik_mm: 657, yukseklik_mm: 1244, stok: STOK_DC }),
        detaySatir({ id: 'l2', sira_no: 2, genislik_mm: 657, yukseklik_mm: 1244, stok: STOK_DC }),
      ],
      '4DC',
    )
    expect(parcalar).toHaveLength(2)
    expect(parcalar[0].n).toBe(2)
    expect(parcalar[1].n).toBe(2)
    expect(parcalar[0].nota3).toBe('1')
    expect(parcalar[1].nota3).toBe('2')
  })

  it('T1: ısıcam DC+BUZLU, null sira_no, 4DC export → hata', () => {
    expect(() =>
      optiTumParcalar(
        [detaySatir({ sira_no: null, genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_C_BUZLU })],
        '4DC',
      ),
    ).toThrow(OptiExportSiraNoHatasi)
  })

  it('T2: ısıcam DC+BUZLU, null sira_no, 4FM export → atlanır, hata yok', () => {
    const parcalar = optiTumParcalar(
      [detaySatir({ sira_no: null, genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_C_BUZLU })],
      '4FM',
    )
    expect(parcalar).toEqual([])
  })

  it('T3: monolit 4DC, sira_no 0, 4DC export → hata', () => {
    expect(() =>
      optiTumParcalar(
        [detaySatir({ sira_no: 0, genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_MONOLIT_DC })],
        '4DC',
      ),
    ).toThrow(OptiExportSiraNoHatasi)
  })

  it('T4: monolit 4DC, sira_no 0, 4BC export → atlanır, hata yok', () => {
    const parcalar = optiTumParcalar(
      [detaySatir({ sira_no: 0, genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_MONOLIT_DC })],
      '4BC',
    )
    expect(parcalar).toEqual([])
  })

  it('T5: ondalık sira_no, export edilen satır → hata', () => {
    expect(() =>
      optiTumParcalar(
        [detaySatir({ sira_no: 1.5, genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_DC })],
        '4DC',
      ),
    ).toThrow(OptiExportSiraNoHatasi)
  })

  it('T6: sira_no 42 → nota3 ve sourceSiraNo', () => {
    const parcalar = optiTumParcalar(
      [detaySatir({ sira_no: 42, genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_DC })],
      '4DC',
    )
    expect(parcalar[0].nota3).toBe('42')
    expect(parcalar[0].sourceSiraNo).toBe(42)
  })

  it('T7: optiImpOlustur NOTA3 formatı', () => {
    const parcalar = optiTumParcalar(
      [detaySatir({ sira_no: 42, genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_DC })],
      '4DC',
    )
    const icerik = optiImpOlustur(parcalar)
    expect(icerik).toContain('NOTA3=42 ')
    expect(icerik).not.toContain('NOTA3=42;')
  })

  it('T8: ısıcam çift DC pane, adet 2 → tek satır, n=4, tek nota3', () => {
    const parcalar = optiTumParcalar(
      [detaySatir({ sira_no: 7, genislik_mm: 800, yukseklik_mm: 1000, adet: 2, stok: STOK_DC })],
      '4DC',
    )
    expect(parcalar).toHaveLength(1)
    expect(parcalar[0].n).toBe(4)
    expect(parcalar[0].nota3).toBe('7')
  })

  it('10208 adet=1 → 4DC ve 4FM ayrı pane', () => {
    const detay = detaySatir({ genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_FUME_ISICAM })
    const dc = optiTumParcalar([detay], '4DC')
    const fm = optiTumParcalar([detay], '4FM')
    expect(dc[0]?.n).toBe(1)
    expect(fm[0]?.n).toBe(1)
    expect(dc[0]?.fam).toBe('4DC')
    expect(fm[0]?.fam).toBe('4FM')
  })

  it('10208 adet=3 → 3×4DC ve 3×4FM', () => {
    const detay = detaySatir({ genislik_mm: 800, yukseklik_mm: 1000, adet: 3, stok: STOK_FUME_ISICAM })
    const dc = optiTumParcalar([detay], '4DC')
    const fm = optiTumParcalar([detay], '4FM')
    expect(dc[0]?.n).toBe(3)
    expect(fm[0]?.n).toBe(3)
  })

  it('belirsiz 10299 → kritik analiz, export engeli', () => {
    const detay = detaySatir({
      genislik_mm: 800,
      yukseklik_mm: 1000,
      stok: { kod: '10299', ad: 'Bilinmeyen', grup: 'ISICAM', katman_yapisi: '4+16+4', kalinlik_mm: null },
    })
    const analiz = optiExportAnalizEt([detay])
    expect(analiz.kritikVar).toBe(true)
    expect(analiz.turler).toEqual([])
    expect(() => optiTumParcalar([detay], '4DC')).toThrow(OptiExportKritikHatasi)
  })
})

describe('optiExportAnalizEt — 10208 turleri', () => {
  it('optiExportTurleri → 4DC ve 4FM etiketleri', () => {
    const detay = detaySatir({ genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_FUME_ISICAM })
    const turler = optiExportTurleri([detay])
    const anahtarlar = turler.map((t) => t.anahtar).sort()
    expect(anahtarlar).toEqual(['4DC', '4FM'])
    expect(turler.find((t) => t.anahtar === '4DC')?.etiket).toBe('4mm DC')
    expect(turler.find((t) => t.anahtar === '4FM')?.etiket).toBe('4mm FUME')
    expect(turler.find((t) => t.anahtar === '4DC')?.adet).toBe(1)
    expect(turler.find((t) => t.anahtar === '4FM')?.adet).toBe(1)
  })

  it('legacy fam_haritasi normalize uyarısı', () => {
    const detay = detaySatir({ genislik_mm: 800, yukseklik_mm: 1000, stok: STOK_MONOLIT_DC })
    const analiz = optiExportAnalizEt([detay], [{ stok_kod: '01005', fam_kodu: '4FUME' }])
    expect(analiz.kritikVar).toBe(false)
    expect(analiz.sorunlar.some((s) => s.kod === 'LEGACY_FAM_NORMALIZE')).toBe(true)
  })

  it('üçlü cam kritik', () => {
    const detay = detaySatir({
      genislik_mm: 800,
      yukseklik_mm: 1000,
      stok: {
        kod: '10803',
        ad: '4+14+4+14+4 3+ ISICAM KLASIK',
        grup: 'ÜÇLÜ CAM',
        katman_yapisi: '4+14+4+14+4',
        kalinlik_mm: null,
      },
    })
    const analiz = optiExportAnalizEt([detay])
    expect(analiz.kritikVar).toBe(true)
  })
})

describe('N=1 referans satırları — pane doğrulama', () => {
  const n1Lines = Object.entries(N1_REFERANS_STOK)

  it.each(n1Lines)('sira_no %i stok %s pane çözümlemesi kanıtlı', (siraNo, stok) => {
    const tipler = paneCamTipleri(stok)
    const dcSay = tipler.filter((t) => t === 'dc').length
    expect(dcSay).toBe(1)
    expect(tipler).toHaveLength(2)
    expect(stok.kod).toBe('10105')
    void siraNo
  })
})

describe('gerçek.IMP entegrasyon — sipariş 26/0851', () => {
  const referansBuf = new Uint8Array(fs.readFileSync(REFERANS_IMP))
  const referans = parseImpBytes(referansBuf)
  const detaylar = impExport0851Detaylari()
  const parcalar = optiTumParcalar(detaylar, IMP_EXPORT_0851_META.hedefFam)
  const icerik = optiImpOlustur(parcalar)
  const uretilenBuf = optiImpBufferOlustur(parcalar)
  const uretilen = parseImpBytes(uretilenBuf)

  it('satır sayısı === 162', () => {
    expect(uretilen.pieces).toHaveLength(IMP_EXPORT_0851_META.beklenenSatir)
  })

  it('sum(N) === 328', () => {
    expect(uretilen.sumN).toBe(IMP_EXPORT_0851_META.beklenenSumN)
  })

  it('toplam alan ≈ 248.370318', () => {
    expect(uretilen.totalAreaM2).toBeCloseTo(IMP_EXPORT_0851_META.beklenenAlan, 6)
  })

  it('N dağılımı: 136×2 + 10×4 + 16×1', () => {
    expect(impNDagilimi(uretilen.pieces)).toEqual(IMP_EXPORT_0851_META.nDagilimi)
  })

  it('ilk satır N=2, B=1244, H=657', () => {
    expect(uretilen.pieces[0]).toMatchObject({ n: 2, b: 1244, h: 657, fam: '4DC' })
  })

  it('ikinci satır N=2, B=1144, H=557', () => {
    expect(uretilen.pieces[1]).toMatchObject({ n: 2, b: 1144, h: 557, fam: '4DC' })
  })

  it('tüm satırlarda FAM === 4DC', () => {
    expect(uretilen.pieces.every((p) => p.fam === '4DC')).toBe(true)
  })

  it('ORD === 26/0851', () => {
    expect(uretilen.pieces.every((p) => p.ord === '26/0851')).toBe(true)
  })

  it('satır numaraları N1..N162 kesintisiz', () => {
    expect(uretilen.pieces.map((p) => p.lineNo)).toEqual(
      Array.from({ length: 162 }, (_, i) => i + 1),
    )
  })

  it('tüm satırlarda N/B/H/FAM/ORD/sıra referansla eşleşir (NOTA3 hariç)', () => {
    const diffs = compareImpPiecesCore(uretilen.pieces, referans.pieces)
    expect(diffs).toEqual([])
  })

  it('T10: tüm satırlarda NOTA3 === fixture sira_no', () => {
    expect(parcalar).toHaveLength(fixtureRows.rows.length)
    for (let i = 0; i < parcalar.length; i++) {
      expect(parcalar[i].nota3).toBe(String(fixtureRows.rows[i].sira_no))
    }
  })

  it('T10b: üretilen IMP parse NOTA3 === fixture sira_no', () => {
    for (let i = 0; i < uretilen.pieces.length; i++) {
      expect(uretilen.pieces[i].nota3).toBe(String(fixtureRows.rows[i].sira_no))
    }
  })

  it('cp1254 binary: BOM yok, CRLF var, UTF-8 Blob değil', () => {
    const meta = inspectImpBinary(uretilenBuf, icerik)
    expect(meta.hasBom).toBe(false)
    expect(meta.hasCrlf).toBe(true)
    expect(meta.isUtf8Blob).toBe(false)
    expect(meta.turkishCp1254Ok).toBe(true)
  })

  it('referans dosya cp1254 meta', () => {
    const meta = inspectImpBinary(referansBuf)
    expect(meta.hasBom).toBe(false)
    expect(meta.hasCrlf).toBe(true)
    expect(meta.turkishCp1254Ok).toBe(true)
  })

  it('Türkçe CL cp1254 byte karşılığı (İ/Ş)', () => {
    const cl = IMP_EXPORT_0851_META.cl
    const encoded = impEncodeCp1254(cl)
    expect(encoded.includes(0xdd)).toBe(true)
    expect(encoded.includes(0xde)).toBe(true)
  })
})
