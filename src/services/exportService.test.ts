import { describe, expect, it, vi } from 'vitest'
import type { UretimEmriDetay } from '@/types/uretim'
import { citaBukumCsvOlustur } from './exportService'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

function detay(adet: number, siraNo = 1): UretimEmriDetay {
  return {
    id: `detay-${siraNo}`,
    uretim_emri_id: 'batch-1',
    siparis_detay_id: `siparis-detay-${siraNo}`,
    sira_no: siraNo,
    siparis_detaylari: {
      cam_kodu: `GLS-${siraNo}`,
      genislik_mm: 1000,
      yukseklik_mm: 500,
      adet,
      kenar_islemi: null,
      notlar: null,
      poz: null,
      cita_stok_id: null,
      stok: {
        ad: '4+16+4 ISICAM',
        katman_yapisi: '4+16+4',
      },
      siparisler: {
        id: 'siparis-1',
        siparis_no: 'SIP-1',
        alt_musteri: 'TEST',
      },
    },
  }
}

describe('citaBukumCsvOlustur', () => {
  it('liste adedini D sütununa yazar ve sipariş satırını çoğaltmaz', () => {
    const satirlar = citaBukumCsvOlustur([detay(5)]).split('\r\n')

    expect(satirlar).toHaveLength(1)
    expect(satirlar[0].split(';')[3]).toBe('5')
  })

  it('her liste satırının kendi adedini D sütununa aktarır', () => {
    const satirlar = citaBukumCsvOlustur([detay(2, 1), detay(7, 2)]).split('\r\n')

    expect(satirlar.map((satir) => satir.split(';')[3])).toEqual(['2', '7'])
  })
})
