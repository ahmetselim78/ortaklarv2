export type ParaBirimi = 'TRY' | 'USD' | 'EUR'
export type SurumDurumu = 'taslak' | 'yayinda' | 'arsiv'
export type TicariMod = 'hazirlik' | 'golge' | 'aktif' | 'bakim'

export interface TicariModDurumu {
  mod: TicariMod
  ilk_aktiflesme_tarihi: string | null
  son_readiness_hash: string | null
  gerekce: string | null
  revision_no: number
  guncelleyen_kullanici_id: string | null
  updated_at: string | null
}

export interface FiyatListesi {
  id: string
  kod: string | null
  ad: string
  tur: 'ana' | 'musteri'
  miras_ana_fiyat_listesi_id: string | null
  cari_id: string | null
  aktif: boolean
  created_at: string | null
}

export interface FiyatListesiSurumu {
  id: string
  fiyat_listesi_id: string
  surum_no: number
  durum: SurumDurumu
  gecerli_baslangic: string | null
  gecerli_bitis: string | null
  yayinlanma_tarihi: string | null
  revision_no: number
  created_at: string | null
}

export interface MaliyetTarifesi {
  id: string
  kod: string | null
  ad: string
  aktif: boolean
  varsayilan: boolean
  created_at: string | null
}

export interface MaliyetTarifeSurumu {
  id: string
  maliyet_tarifesi_id: string
  surum_no: number
  durum: SurumDurumu
  gecerli_baslangic: string | null
  gecerli_bitis: string | null
  yayinlanma_tarihi: string | null
  revision_no: number
  created_at: string | null
}

export interface MaliyetRecetesi {
  id: string
  stok_id: string
  kod: string | null
  ad: string
  aktif: boolean
  created_at: string | null
}

export interface MaliyetReceteSurumu {
  id: string
  urun_maliyet_recetesi_id: string
  surum_no: number
  durum: SurumDurumu
  gecerli_baslangic: string | null
  gecerli_bitis: string | null
  yayinlanma_tarihi: string | null
  revision_no: number
  created_at: string | null
}

export interface MusteriTicariProfili {
  id: string
  cari_id: string
  aktif: boolean
  created_at: string | null
}

export interface MusteriTicariProfilSurumu {
  id: string
  musteri_ticari_profili_id: string
  surum_no: number
  durum: SurumDurumu
  varsayilan_para_birimi: ParaBirimi
  ana_fiyat_listesi_id: string
  musteri_fiyat_listesi_id: string | null
  varsayilan_kdv_grubu_id: string
  varsayilan_vade_gunu: number
  vade_profili_id: string | null
  vade_profili_surumu_id: string | null
  nakliye_hesaplama_tipi: 'siparis_sabiti' | 'm2' | null
  sabit_nakliye_satis_tutari: number | null
  sabit_nakliye_maliyet_tutari: number | null
  m2_nakliye_satis_tutari: number | null
  m2_nakliye_maliyet_tutari: number | null
  minimum_marj_yuzdesi_override: number | null
  varsayilan_belge_notu: string | null
  teklif_gecerlilik_gunu: number
  gecerli_baslangic: string | null
  gecerli_bitis: string | null
  yayinlanma_tarihi: string | null
  revision_no: number
  created_at: string | null
}

export interface CariOzet {
  cari_id: string
  para_birimi: ParaBirimi
  borc_toplami: number
  alacak_toplami: number
  net_bakiye: number
  son_hareket_tarihi: string | null
  guncellendi_at: string | null
}

export interface CariHareket {
  id: string
  cari_id: string
  para_birimi: ParaBirimi
  yon: 'borc' | 'alacak'
  hareket_turu: string
  tutar: number
  islem_tarihi: string
  tahsilat_yontemi: string | null
  aciklama: string | null
  siparis_id: string | null
  cari_baglantisi_id?: string | null
  kaynak_sinifi: 'sistem' | 'manuel'
  kaynak_turu: string | null
  terslenen_hareket_id: string | null
  created_at: string | null
}

export type TahsilatHareketTuru = 'tahsilat' | 'on_odeme'
export type CariHareketYonu = 'borc' | 'alacak'

export interface TahsilatPayload {
  cari_id: string
  para_birimi: ParaBirimi
  tutar: string
  hareket_turu: TahsilatHareketTuru
  tahsilat_yontemi: string
  islem_tarihi: string
  aciklama: string
}

export type CariBaglantiDurumu = 'taslak' | 'onaylandi' | 'iptal'
export type CariBaglantiOperasyonDurumu =
  | 'taslak'
  | 'sirada'
  | 'aktif_kredi'
  | 'acik_donem'
  | 'tukendi'
  | 'iptal'

export interface CariBaglantiFiyati {
  stok_id: string
  stok_kodu: string
  stok_adi: string
  stok_grubu?: string | null
  birim_fiyat: number | null
  kdv_grubu_id: string | null
  minimum_m2: number | null
  en_adimi_mm: number | null
  boy_adimi_mm: number | null
}

export interface CariBaglantiHazirlik {
  fiyat_listesi_surumu_id: string | null
  para_birimi: ParaBirimi
  ticari_profil_durumu: 'yayinda' | 'taslak' | 'baglanti_ile_olusturulacak'
  fiyatlar: CariBaglantiFiyati[]
  kdv_gruplari: Array<{ id: string; kod: string; ad: string }>
}

export interface CariBaglantiTaslakPayload {
  cari_id: string
  para_birimi: ParaBirimi
  on_odeme_tutari: string
  odeme_tarihi: string
  odeme_yontemi: string
  aciklama?: string
  fiyatlar: Array<{
    stok_id: string
    birim_fiyat: number
    kdv_grubu_id: string
    minimum_m2?: number | null
    en_adimi_mm?: number | null
    boy_adimi_mm?: number | null
  }>
}

export interface CariBaglantisi {
  id: string
  baglanti_no: string
  cari_id: string
  para_birimi: ParaBirimi
  baglanti_turu: 'normal' | 'devir'
  on_odeme_tutari: number
  fiyat_listesi_surumu_id: string
  durum: CariBaglantiDurumu
  sira_no: number | null
  odeme_tarihi: string
  odeme_yontemi: string
  aciklama: string | null
  revision_no: number
  created_at: string
  kalan_tutar: number
  operasyon_durumu: CariBaglantiOperasyonDurumu
  fiyatlar?: CariBaglantiFiyati[]
}

export interface CariDetaySiparisi {
  id: string
  siparis_no: string
  tarih: string
  created_at: string
  durum: string
  para_birimi: ParaBirimi
  kaynak: string
  alt_musteri: string | null
  harici_siparis_no: string | null
  genel_toplam: number | null
  adet: number
  m2: number
}

export interface CariDetayOzeti {
  bakiyeler: CariOzet[]
  baglantilar: CariBaglantisi[]
  siparis_toplami: number
  siparisler: CariDetaySiparisi[]
  hareketler: CariHareket[]
}

export interface CariAcilisBakiyesiPayload {
  cari_id: string
  para_birimi: ParaBirimi
  yon: CariHareketYonu
  tutar: string
  islem_tarihi: string
  gerekce: string
}

export interface CariBakiyeTutarsizligi {
  cari_id: string
  para_birimi: ParaBirimi
  hareket_borc_toplami: number | string
  ozet_borc_toplami: number | string
  hareket_alacak_toplami: number | string
  ozet_alacak_toplami: number | string
  hareket_net_bakiye: number | string
  ozet_net_bakiye: number | string
}

export interface CariBakiyeYenidenOlusturmaSonucu {
  durum: 'basarili'
  satir_sayisi: number
}

export interface Teklif {
  id: string
  teklif_no: string
  cari_id: string | null
  durum: 'taslak' | 'gonderildi' | 'kabul_edildi' | 'reddedildi'
  /** Parent tabloda tutulmaz; servis aktif/son revizyondan türetir. */
  para_birimi: ParaBirimi | null
  aktif_revizyon_id: string | null
  revision_no: number
  created_at: string | null
  updated_at: string | null
}

export interface TeklifRevizyonu {
  id: string
  teklif_id: string
  revizyon_no: number
  revizyon_kodu: string | null
  durum: 'taslak' | 'gonderildi' | 'kabul_edildi' | 'reddedildi'
  teklif_tarihi: string
  genel_toplam: number
  kdv_haric_tutar: number
  kdv_tutari: number
  para_birimi: ParaBirimi
  gecerlilik_tarihi: string | null
  belge_snapshot: Record<string, unknown>
  gonderilme_tarihi: string | null
  created_at: string | null
}

export interface TeklifStokSecenegi {
  id: string
  kod: string
  ad: string
  kategori: string
  aktif: boolean
}

export interface TeklifDetayi {
  id: string
  teklif_revizyonu_id: string
  satir_no: number
  stok_id: string
  genislik_mm: number
  yukseklik_mm: number
  yuvarlanmis_genislik_mm: number
  yuvarlanmis_yukseklik_mm: number
  adet: number
  faturalanabilir_m2: number
  birim_fiyat: number
  brut_tutar: number
  satir_iskonto_tutari: number
  net_tutar: number
  satir_snapshot: Record<string, unknown>
  stok?: { kod: string; ad: string } | null
}

export interface TeklifKdvOzeti {
  id: string
  teklif_revizyonu_id: string
  kdv_grubu_id: string
  matrah: number
  kdv_orani: number
  kdv_tutari: number
  dagitim_farki: number
  kdv_grubu?: { kod: string; ad: string } | null
}

export interface ReadinessKontrolu {
  kod: string
  baslik: string
  kontrol_turu: 'dinamik' | 'manuel'
  durum: 'basarili' | 'uyari' | 'kritik'
  mesaj: string | null
  eksik_sayisi: number | null
  revision_no: number | null
  onaylayan_kullanici_id: string | null
  onay_gerekcesi: string | null
}

export interface ReadinessRaporu {
  uygun: boolean
  mod: TicariMod | null
  kontroller: ReadinessKontrolu[]
  olusturulma_tarihi: string | null
}

export interface FiyatOnizlemeHatasi {
  kod: string
  satir_no: number | null
  detay: Record<string, unknown>
}

export interface FiyatHesapSatiri {
  satir_no: number
  detay_id: string | null
  stok_id: string
  recete_id: string
  recete_surumu_id: string
  kdv_grubu_id: string
  kdv_grup_surumu_id: string
  genislik_mm: number
  yukseklik_mm: number
  yuvarlanmis_genislik_mm: number
  yuvarlanmis_yukseklik_mm: number
  adet: number
  tek_parca_m2: number
  faturalanabilir_m2: number
  birim_fiyat: number
  brut_tutar: number
  satir_iskonto_tutari: number
  net_tutar: number
  tahmini_maliyet?: number
  tahmini_kar?: number
  marj_yuzdesi?: number | null
}

export interface FiyatUrunGrubu {
  stok_id: string
  stok_kodu: string
  stok_adi: string
  adet: number
  gercek_m2: number
  faturalanabilir_m2: number
  birim_fiyat: number | null
  grup_toplami: number
  baglanti_no?: string | null
  fiyat_durumu: 'bulundu' | 'eksik' | 'birden_fazla_baglanti'
}

export interface FiyatBaglantiDagilimi {
  baglanti_id: string
  baglanti_no: string
  operasyon_durumu: CariBaglantiOperasyonDurumu
  kalan_tutar: number
  para_birimi: ParaBirimi
  tahmini_oran?: number
  tahmini_kullanilan_tutar?: number
}

export interface FiyatCariEtkisi {
  onceki_net_bakiye: number
  siparis_borcu: number
  sonraki_net_bakiye: number
  para_birimi: ParaBirimi
}

export interface FiyatHesapSonucu {
  gecerli: boolean
  hatalar: FiyatOnizlemeHatasi[]
  girdi_hash: string
  fiyat_baglam_hash: string
  sonuc_hash: string
  hesaplama_surumu: string
  para_birimi: ParaBirimi
  fiyatlandirma_tarihi: string
  kdv_haric_tutar: number
  kdv_tutari: number
  genel_toplam: number
  satir_iskonto_tutari: number
  belge_iskonto_tutari: number
  manuel_fiyat_farki: number
  manuel_yuvarlama_farki: number
  hesaplama_yuvarlama_farki: number
  nakliye_override_farki: number
  vade_farki: number
  dusuk_marj?: boolean
  dusuk_marj_gerekcesi?: string | null
  tahmini_maliyet?: number
  tahmini_kar?: number
  marj_yuzdesi?: number | null
  minimum_marj_yuzdesi?: number | null
  satirlar: FiyatHesapSatiri[]
  bilesenler: Array<Record<string, unknown>>
  kdv_ozetleri: Array<Record<string, unknown>>
  urun_gruplari?: FiyatUrunGrubu[]
  baglanti_dagilimlari?: FiyatBaglantiDagilimi[]
  cari_etkisi?: FiyatCariEtkisi
}

export interface FiyatOnizlemesi {
  onizleme_id: string
  sona_erme_tarihi: string
  girdi_hash: string
  fiyat_baglam_hash: string
  sonuc_hash: string
  sonuc: FiyatHesapSonucu
}

export interface CariSecenegi {
  id: string
  kod: string
  ad: string
  tipi: 'musteri' | 'tedarikci'
  aktif: boolean
}
