import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import type { UretimEmriDetay } from '@/types/uretim'
import { getEtiketCamTipi } from '@/lib/cam'

interface ExportRow {
  cam_kodu: string
  siparis_no: string
  musteri: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  katman_yapisi: string
  cam_tipi: string
  kenar_islemi: string
  notlar: string
}

/**
 * Verilen Üretim Emri detay listesinden PerfectCut formatında
 * CSV oluşturur ve tarayıcıya indirir.
 */
export function exportDetaylariCSV(detaylar: UretimEmriDetay[], batchNo: string) {
  const rows: ExportRow[] = detaylar.map((item) => {
    const d = item.siparis_detaylari!
    return {
      cam_kodu: d.cam_kodu,
      siparis_no: d.siparisler?.siparis_no ?? '',
      musteri: d.siparisler?.cari?.ad ?? '',
      genislik_mm: d.genislik_mm,
      yukseklik_mm: d.yukseklik_mm,
      adet: d.adet,
      katman_yapisi: d.katman_yapisi ?? '',
      cam_tipi: getEtiketCamTipi(d, d.stok ?? null),
      kenar_islemi: d.kenar_islemi ?? '',
      notlar: d.notlar ?? '',
    }
  })

  const csv = Papa.unparse(rows)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${batchNo}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Safari ve bazı tarayıcılarda hemen revoke indirmeyi iptal edebilir
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Export sonrası batch'in durumunu ve export tarihini günceller.
 *  Sadece 'onaylandi' veya 'eksik_var' durumundan 'export_edildi'ye geçiş yapar. */
export async function exportTarihiGuncelle(uretimEmriId: string) {
  const { data, error } = await supabase
    .from('uretim_emirleri')
    .update({ export_tarihi: new Date().toISOString(), durum: 'export_edildi' })
    .eq('id', uretimEmriId)
    .in('durum', ['onaylandi', 'eksik_var'])
    .select('id')

  if (error) throw new Error(`Export tarihi güncellenemedi: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('Batch export edilemez: sadece Onaylandı veya Eksik Var durumundaki batch\'ler export edilebilir.')
  }
}

