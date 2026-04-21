export type TamirDurum = 'bekliyor' | 'tamamlandi' | 'hurda'
export type TamirSorun = 'kirik' | 'cizik' | 'olcum_hatasi' | 'diger'
export type TamirKaynak = 'poz_giris' | 'kumanda' | 'manuel'

export interface TamirKayit {
  id: string
  cam_kodu: string
  siparis_detay_id: string | null
  uretim_emri_id: string | null
  batch_no: string
  sira_no: number | null
  kaynak_istasyon: TamirKaynak
  sorun_tipi: TamirSorun
  aciklama: string | null
  durum: TamirDurum
  adet: number
  musteri: string
  nihai_musteri: string
  siparis_no: string
  genislik_mm: number | null
  yukseklik_mm: number | null
  stok_ad: string
  created_at: string
  tamamlanma_tarihi: string | null
}

export type YeniTamirKayit = Omit<TamirKayit, 'id' | 'created_at'>

export const SORUN_ETIKETLERI: Record<TamirSorun, string> = {
  kirik: 'Kırık',
  cizik: 'Çizik',
  olcum_hatasi: 'Ölçüm Hatası',
  diger: 'Diğer',
}

export const DURUM_ETIKETLERI: Record<TamirDurum, string> = {
  bekliyor: 'Bekliyor',
  tamamlandi: 'Tamamlandı',
  hurda: 'Hurda',
}

export const KAYNAK_ETIKETLERI: Record<TamirKaynak, string> = {
  poz_giris: 'Poz Giriş',
  kumanda: 'Kumanda Paneli',
  manuel: 'Manuel',
}
