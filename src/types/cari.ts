export type CariTipi = 'musteri' | 'tedarikci'

export interface Cari {
  id: string
  kod: string
  ad: string
  tipi: CariTipi
  telefon: string | null
  email: string | null
  adres: string | null
  notlar: string | null
  created_at: string
}

export type YeniCari = Omit<Cari, 'id' | 'created_at'>
