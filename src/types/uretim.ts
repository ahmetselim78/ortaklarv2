export type UretimEmriDurum = 'hazirlaniyor' | 'onaylandi' | 'export_edildi' | 'yikamada' | 'tamamlandi' | 'eksik_var'

export interface UretimEmri {
  id: string
  batch_no: string
  durum: UretimEmriDurum
  notlar: string | null
  olusturulma_tarihi: string
  export_tarihi: string | null
}

export interface UretimEmriDetay {
  id: string
  uretim_emri_id: string
  siparis_detay_id: string
  sira_no: number | null
  siparis_detaylari?: {
    cam_kodu: string
    genislik_mm: number
    yukseklik_mm: number
    adet: number
    ara_bosluk_mm: number | null
    kenar_islemi: string | null
    notlar: string | null
    stok?: { ad: string } | null
    siparisler?: {
      siparis_no: string
      cari?: { ad: string } | null
    } | null
  }
}
