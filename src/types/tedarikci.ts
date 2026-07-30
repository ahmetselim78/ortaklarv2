import type { ParaBirimi } from './ticari'

export type TedarikciSiparisDurumu =
  | 'fatura_bekliyor'
  | 'odeme_bekliyor'
  | 'gecikti'
  | 'odendi'

export interface TedarikciSiparisi {
  id: string
  tedarikci_id: string
  portal_siparis_no: string
  siparis_tarihi: string
  vade_gunu: number
  para_birimi: ParaBirimi
  siparis_tutari: number | null
  fatura_no: string | null
  fatura_tarihi: string | null
  fatura_tutari: number | null
  son_odeme_tarihi: string | null
  odeme_tarihi: string | null
  durum: TedarikciSiparisDurumu
  kalan_gun: number | null
  aciklama: string | null
  revision_no: number
  created_at: string
  updated_at: string
}

export interface TedarikciSiparisiPayload {
  tedarikci_id: string
  portal_siparis_no: string
  siparis_tarihi: string
  vade_gunu: number
  para_birimi: ParaBirimi
  siparis_tutari?: string
  aciklama?: string
}

export interface TedarikciFaturaPayload {
  fatura_no: string
  fatura_tarihi: string
  fatura_tutari: string
}

export interface TedarikciStokSonFiyati {
  id: string
  birim_fiyat: number
  para_birimi: string
  fiyat_birimi: string
  fiyat_varyanti: string
  marka: string | null
  vade_gunu: number
  fiyat_tarihi: string
  gecerlilik_baslangici: string | null
  gecerlilik_bitisi: string | null
  durum: string
}

export interface TedarikciStokBaglantisi {
  id: string
  tedarikci_id: string
  stok_id: string
  stok_kodu: string
  stok_adi: string
  kategori: 'cam' | 'cita' | 'yan_malzeme'
  ticari_kapsam: string
  birim: string
  hizmet_turu: string | null
  marka: string | null
  tedarikci_urun_kodu: string | null
  varsayilan_vade_gunu: number
  aciklama: string | null
  aktif: boolean
  revision_no: number
  created_at: string
  updated_at: string
  son_fiyat: TedarikciStokSonFiyati | null
}

export interface TedarikciStokAdayi {
  stok_id: string
  stok_kodu: string
  stok_adi: string
  kategori: 'cam' | 'cita' | 'yan_malzeme'
  birim: string
  hizmet_turu: string | null
}

export interface TedarikciStokBaglantiKatalogu {
  tedarikci: {
    id: string
    kod: string
    ad: string
    aktif: boolean
    tedarik_kapsamlari: Array<'cam' | 'cita' | 'yan_malzeme' | 'temper_hizmeti'>
  }
  baglantilar: TedarikciStokBaglantisi[]
  adaylar: TedarikciStokAdayi[]
  ozet: {
    aktif_baglanti_sayisi: number
    pasif_baglanti_sayisi: number
    aday_sayisi: number
  }
}

export interface TedarikciStokBaglantisiPayload {
  tedarikci_id: string
  stok_id?: string
  stok_ids?: string[]
  marka?: string
  tedarikci_urun_kodu?: string
  varsayilan_vade_gunu?: number
  aciklama?: string
  beklenen_revision_no?: number
  kaynak_ekran?: string
}
