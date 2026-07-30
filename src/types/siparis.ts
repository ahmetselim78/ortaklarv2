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
  siparis_detaylari?: { count?: number; adet?: number }[]
  sevkiyat_planlari?: { id: string; tarih: string }[]
  teslimat_tipi?: string
  tamamlandi_tarihi?: string | null
  kaynak?: 'pdf' | 'manuel'
  revision_no?: number
  fiyatlandirildi?: boolean
  para_birimi?: 'TRY' | 'USD' | 'EUR' | null
  fiyatlandirma_tarihi?: string | null
  aktif_fiyat_revizyon_id?: string | null
  aktif_fiyat_revizyon?: {
    genel_toplam: number
    para_birimi: 'TRY' | 'USD' | 'EUR'
  } | null
  iptal_tarihi?: string | null
  iptal_gerekcesi?: string | null
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
  uretim_durumu: UretimDurumu
  created_at: string
  stok?: {
    kod?: string | null
    ad: string
    grup?: string | null
    kalinlik_mm?: number | null
    katman_yapisi?: string | null
    birim_fiyat?: number | null
  } | null
  cita_stok?: { ad: string } | null
}

export interface CamFormSatiri {
  detay_id?: string
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
  satir_iskonto_yuzdesi?: number | string
  satir_iskonto_tutari?: number | string
  kenar_islemi_ucretsiz?: boolean
  menfez_ucretsiz?: boolean
  kucuk_cam_ucretsiz?: boolean
}

export interface YeniSiparisForm {
  cari_id: string
  tarih: string
  para_birimi?: 'TRY' | 'USD' | 'EUR'
  teslim_tarihi?: string
  notlar?: string
  alt_musteri?: string
  harici_siparis_no?: string
  teslimat_tipi?: string
  kaynak?: 'pdf' | 'manuel'
  ticari_mudahale_gerekcesi?: string
  dusuk_marj_gerekcesi?: string
  belge_iskonto_yuzdesi?: number | string
  belge_iskonto_tutari?: number | string
  manuel_fiyat_farki?: number | string
  manuel_yuvarlama_farki?: number | string
  nakliye_satis_override?: number | string
  nakliye_maliyet_override?: number | string
  vade_gunu?: number | string
  camlar: CamFormSatiri[]
}
