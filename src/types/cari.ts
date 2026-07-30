export type CariTipi = 'musteri' | 'tedarikci'
export type TedarikKapsami = 'cam' | 'cita' | 'yan_malzeme' | 'temper_hizmeti'
export type TedarikciCalismaModeli = 'sisecam_portal' | 'manuel_fiyat'

export interface Cari {
  id: string
  kod: string
  ad: string
  tipi: CariTipi
  aktif: boolean
  telefon: string | null
  email: string | null
  adres: string | null
  notlar: string | null
  tedarik_kapsamlari: TedarikKapsami[]
  tedarikci_calisma_modeli: TedarikciCalismaModeli | null
  created_at: string
}

export type YeniCari = Omit<Cari, 'id' | 'created_at'>
