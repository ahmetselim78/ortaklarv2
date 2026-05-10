export type UretimEmriDurum = 'hazirlaniyor' | 'export_edildi' | 'yikamada' | 'tamamlandi' | 'eksik_var' | 'iptal'

export interface UretimEmriSiparisOzet {
  id: string
  siparis_no: string
  musteri_ad: string
  alt_musteri: string | null
  ref_no: string | null
}

export interface UretimEmri {
  id: string
  batch_no: string
  durum: UretimEmriDurum
  notlar: string | null
  olusturulma_tarihi: string
  export_tarihi: string | null
  cam_sayisi?: number
  siparis_listesi?: UretimEmriSiparisOzet[]
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
    katman_yapisi?: string | null
    kenar_islemi: string | null
    notlar: string | null
    poz: string | null
    cita_stok_id: string | null
    stok?: { ad: string; kalinlik_mm?: number | null } | null
    cita_stok?: { ad: string; kalinlik_mm: number | null } | null
    siparisler?: {
      id: string
      siparis_no: string
      alt_musteri: string | null
      cari?: { ad: string } | null
    } | null
  }
}
