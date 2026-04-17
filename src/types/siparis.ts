export type SiparisDurum = 'beklemede' | 'batchte' | 'yikamada' | 'tamamlandi' | 'eksik_var' | 'iptal'
export type UretimDurumu = 'bekliyor' | 'kesildi' | 'yikandi' | 'etiketlendi' | 'tamamlandi'

export interface Siparis {
  id: string
  siparis_no: string
  cari_id: string
  tarih: string
  teslim_tarihi: string | null
  durum: SiparisDurum
  notlar: string | null
  created_at: string
  cari?: { ad: string; kod: string }
}

export interface SiparisDetay {
  id: string
  siparis_id: string
  stok_id: string | null
  cam_kodu: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  ara_bosluk_mm: number | null
  cita_stok_id: string | null
  kenar_islemi: string | null
  notlar: string | null
  uretim_durumu: UretimDurumu
  created_at: string
  stok?: { ad: string } | null
  cita_stok?: { ad: string } | null
}

export interface CamFormSatiri {
  stok_id: string
  genislik_mm: number | string
  yukseklik_mm: number | string
  adet: number | string
  ara_bosluk_mm?: number | string
  kenar_islemi?: string
  notlar?: string
}
