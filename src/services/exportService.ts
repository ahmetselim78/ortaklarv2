import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import type { UretimEmriDetay } from '@/types/uretim'

interface ExportRow {
  cam_kodu: string
  siparis_no: string
  musteri: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  ara_bosluk_mm: number | string
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
      ara_bosluk_mm: d.ara_bosluk_mm ?? '',
      cam_tipi: d.stok?.ad ?? '',
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
  link.click()
  URL.revokeObjectURL(url)
}

/** Export sonrası batch'in durumunu ve export tarihini günceller */
export async function exportTarihiGuncelle(uretimEmriId: string) {
  await supabase
    .from('uretim_emirleri')
    .update({ export_tarihi: new Date().toISOString(), durum: 'export_edildi' })
    .eq('id', uretimEmriId)
}

