export type StokKategori = 'cam' | 'cita' | 'yan_malzeme'

export interface Stok {
  id: string
  kod: string
  ad: string
  kategori: StokKategori
  kalinlik_mm: number | null
  renk: string | null
  tip: string | null
  birim: string
  birim_fiyat: number | null
  tedarikci_id: string | null
  marka: string | null
  mevcut_miktar: number | null
  created_at: string
  // join'den gelen
  tedarikci_ad?: string
}

export type YeniStok = Omit<Stok, 'id' | 'created_at' | 'tedarikci_ad'>
