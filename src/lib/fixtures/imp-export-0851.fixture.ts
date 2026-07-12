/**
 * gerçek.IMP (ORD=26/0851) referansından türetilmiş anonimleştirilmiş batch fixture.
 *
 * N=1 satırlar (147–162): stok_kod alanı katalog doğrulaması gerektirir.
 * Canlı DB erişimi yoksa 10105 (4+16+4 ISICAM C BUZLU) kullanılır —
 * paneCamTipleri bu kod için ['dc','buzlu'] döndürür (036 katalog kanıtı).
 * scripts/fetch-batch-fixture.mjs ile canlı veri gelince güncellenmeli.
 */
import type { UretimEmriDetay } from '@/types/uretim'
import fixtureRows from './imp-export-0851-rows.json'

const STOK_10005 = {
  kod: '10005',
  ad: '4+16+4 ISICAM C',
  grup: 'ISICAM',
  katman_yapisi: '4+16+4',
  kalinlik_mm: null,
} as const

const STOK_10105 = {
  kod: '10105',
  ad: '4+16+4 ISICAM C BUZLU',
  grup: 'ISICAM',
  katman_yapisi: '4+16+4',
  kalinlik_mm: null,
} as const

function stokForRow(row: (typeof fixtureRows.rows)[0]) {
  if (row.stok_kod === '10105') return STOK_10105
  return STOK_10005
}

/** N=1 referans satırları için beklenen stok eşlemesi (impLine → stok). */
export const N1_REFERANS_STOK: Record<number, typeof STOK_10105 | typeof STOK_10005> = Object.fromEntries(
  fixtureRows.rows
    .filter((r) => r.expected.n === 1)
    .map((r) => [r.sira_no, STOK_10105]),
)

export function impExport0851Detaylari(): UretimEmriDetay[] {
  return fixtureRows.rows.map((row, idx) => {
    const stok = row.expected.n === 1 ? STOK_10105 : STOK_10005
    return {
      id: `fixture-line-${idx + 1}`,
      uretim_emri_id: 'fixture-batch',
      siparis_detay_id: `fixture-sd-${idx + 1}`,
      sira_no: row.sira_no,
      siparis_detaylari: {
        cam_kodu: `GLS-FIX-${String(idx + 1).padStart(4, '0')}`,
        genislik_mm: row.genislik_mm,
        yukseklik_mm: row.yukseklik_mm,
        adet: row.adet,
        kenar_islemi: null,
        notlar: null,
        poz: null,
        cita_stok_id: null,
        stok: stokForRow({ ...row, stok_kod: stok.kod }),
        siparisler: {
          id: 'fixture-siparis',
          siparis_no: 'SIP-2026-0052',
          harici_siparis_no: fixtureRows.ord,
          alt_musteri: fixtureRows.cl,
          cari: { ad: 'FIXTURE CARI' },
        },
      },
    }
  })
}

export const IMP_EXPORT_0851_META = {
  ord: fixtureRows.ord,
  cl: fixtureRows.cl,
  hedefFam: '4DC' as const,
  beklenenSatir: 162,
  beklenenSumN: 328,
  beklenenAlan: 248.370318,
  nDagilimi: { 1: 16, 2: 136, 4: 10 },
}
