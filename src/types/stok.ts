export interface Stok {
  id: string
  kod: string
  ad: string
  kalinlik_mm: number | null
  renk: string | null
  tip: string | null
  birim: string
  birim_fiyat: number | null
  created_at: string
}

export type YeniStok = Omit<Stok, 'id' | 'created_at'>
