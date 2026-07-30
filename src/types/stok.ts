export type StokKategori = 'cam' | 'cita' | 'yan_malzeme'
export type StokTicariKapsami =
  | 'satilabilir'
  | 'maliyet_bileseni'
  | 'her_ikisi'
  | 'kapsam_disi'

export interface Stok {
  id: string
  kod: string
  ad: string
  kategori: StokKategori
  grup: string | null
  katman_yapisi: string | null
  kalinlik_mm: number | null
  birim: string
  birim_fiyat: number | null
  tedarikci_id: string | null
  marka: string | null
  mevcut_miktar: number | null
  minimum_miktar: number
  stok_yeri: string | null
  kritik_stok: boolean
  aktif: boolean
  ticari_kapsam: StokTicariKapsami
  ticari_kapsam_dogrulandi_at: string | null
  ticari_kapsam_dogrulayan_kullanici_id: string | null
  created_at: string
  // join'den gelen
  tedarikci_ad?: string
}

export type StokKullanimAlani =
  | 'siparis'
  | 'cita_referansi'
  | 'siparis_fiyat_snapshoti'
  | 'teklif'
  | 'satis_fiyati'
  | 'recete'
  | 'recete_bileseni'
  | 'maliyet_tarifesi'
  | 'maliyet_profili'
  | 'maliyet_kaynagi'
  | 'tedarik_baglantisi'
  | 'alis_fiyati'
  | 'stok_hareketi'
  | 'legacy_eslestirme'

export interface StokKullanimOzeti {
  alan: StokKullanimAlani
  adet: number
}

export interface StokKatalogKaydi extends Stok {
  kullaniliyor: boolean
  kullanimlar: StokKullanimOzeti[]
}

export interface StokKartPayload {
  kod: string
  ad: string
  kategori: StokKategori
  grup: string | null
  katman_yapisi: string | null
  kalinlik_mm: number | null
  birim: string
  marka: string | null
  minimum_miktar: number
  stok_yeri: string | null
}

export type YeniStok = StokKartPayload

export type StokHareketTuru =
  | 'devir_girisi'
  | 'alis_girisi'
  | 'iade_girisi'
  | 'sayim_fazlasi'
  | 'uretim_cikisi'
  | 'satis_cikisi'
  | 'iade_cikisi'
  | 'fire'
  | 'sayim_eksigi'

export interface StokHareketi {
  id: string
  stok_id: string
  stok_kodu: string
  stok_adi: string
  hareket_turu: StokHareketTuru
  miktar: number
  net_miktar: number
  bakiye_sonrasi: number
  birim: string
  tedarikci_id: string | null
  tedarikci_adi: string | null
  alis_fiyati_id: string | null
  tedarikci_siparisi_id: string | null
  islem_tarihi: string
  belge_no: string | null
  aciklama: string
  kaynak_turu: 'manuel' | 'tedarikci_siparisi' | 'sayim' | 'sistem_devir'
  created_at: string
}

export interface StokHareketPayload {
  stok_id: string
  hareket_turu: StokHareketTuru
  miktar: number
  tedarikci_id?: string | null
  alis_fiyati_id?: string | null
  tedarikci_siparisi_id?: string | null
  islem_tarihi: string
  belge_no?: string | null
  aciklama: string
}

export interface StokTedarikcisi {
  id: string
  kod: string
  ad: string
  tedarik_kapsamlari: Array<'cam' | 'cita' | 'yan_malzeme' | 'temper_hizmeti'>
}

export interface StokPanelOzeti {
  aktif_kart_sayisi: number
  kritik_stok_sayisi: number
  stoksuz_kart_sayisi: number
  bugunku_hareket_sayisi: number
}

export interface StokBaslangicKatalogKategoriOzeti {
  kategori: StokKategori
  toplam: number
  mevcut: number
  uyumlu: number
  cakisan: number
  eksik: number
  eklenen: number
}

export interface StokBaslangicKatalogDurumu {
  katalog_surumu: string
  toplam: number
  mevcut: number
  uyumlu: number
  cakisan: number
  eksik: number
  eklenen: number
  kurulu: boolean
  tamamlandi: boolean
  kategoriler: Record<StokKategori, StokBaslangicKatalogKategoriOzeti>
}
