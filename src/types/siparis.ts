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
  alt_musteri: string | null
  harici_siparis_no: string | null
  created_at: string
  cari?: { ad: string; kod: string }
  siparis_detaylari?: { count: number }[]
  sevkiyat_planlari?: { id: string; tarih: string }[]
  teslimat_tipi?: string
  tamamlandi_tarihi?: string | null
  kaynak?: 'pdf' | 'manuel'
}

export interface SiparisDetay {
  id: string
  siparis_id: string
  stok_id: string | null
  cam_kodu: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  cita_stok_id: string | null
  kenar_islemi: string | null
  notlar: string | null
  poz: string | null
  menfez_cap_mm?: number | null
  kucuk_cam?: boolean
  katman_yapisi?: string | null
  uretim_durumu: UretimDurumu
  created_at: string
  stok?: { ad: string; kalinlik_mm?: number | null } | null
  cita_stok?: { ad: string } | null
}

export interface CamFormSatiri {
  stok_id: string
  genislik_mm: number | string
  yukseklik_mm: number | string
  adet: number | string
  cita_stok_id?: string
  kenar_islemi?: string
  notlar?: string
  poz?: string
  menfez_cap_mm?: number | string
  kucuk_cam?: boolean
  katman_yapisi?: string
}
