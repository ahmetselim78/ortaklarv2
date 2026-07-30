import type { ParaBirimi } from '@/types/ticari'

export type MaliyetMalzemeTuru = 'cam' | 'cita' | 'sarf'
export type MaliyetCamTuru =
  | 'duz'
  | 'konfor'
  | 'sinerji'
  | 'buzlu'
  | 'fume'
  | 'bronz'
  | 'reflekte'
  | 'satina'
  | 'lamine'
  | 'diger'
export type MaliyetCitaTuru = 'aluminyum' | 'sicak_kenar' | 'paslanmaz' | 'diger'
export type MaliyetSarfBirimi = 'kg' | 'litre' | 'adet' | 'metre'
export type MaliyetSarfHesaplamaTipi = 'cevre_m' | 'm2' | 'adet' | 'sabit'
export type StokMaliyetKaynagiTuru = 'dogrudan_fiyat' | 'cam_baglantisi'
export type StokAlisFiyatiDurumu =
  | 'taslak'
  | 'dogrulanmis'
  | 'dogrulama_bekliyor'
  | 'duzeltme'

export interface CamFiyatGrubu {
  id: string
  kod: MaliyetCamTuru
  ad: string
  sira_no: number
  aktif: boolean
}

export interface StokMaliyetAdayi {
  id: string
  kod: string
  ad: string
  kategori: 'cam' | 'cita' | 'yan_malzeme'
  grup: string | null
  kalinlik_mm: number | null
  birim: string
}

export interface StokMaliyetProfili {
  id: string
  stok_id: string
  profil_turu: MaliyetMalzemeTuru
  stok_kodu: string
  stok_adi: string
  kategori: 'cam' | 'cita' | 'yan_malzeme'
  grup: string | null
  birim: string
  cam_fiyat_grubu_id: string | null
  cam_fiyat_grubu_kodu: MaliyetCamTuru | null
  cam_fiyat_grubu_adi: string | null
  cita_malzeme_turu: MaliyetCitaTuru | null
  olcu_mm: number | null
  hesaplama_tipi: MaliyetSarfHesaplamaTipi | null
  tuketim_katsayisi: number | null
  bosluk_basi: boolean
  fire_orani: number
  fiyat_birimi: string
  stok_ana_birimi: string
  donusum_katsayisi: number
  gecerlilik_baslangici: string
  gecerlilik_bitisi: string | null
  revision_no: number
}

export interface StokMaliyetOzeti {
  stok_id: string
  stok_kodu: string
  stok_adi: string
  kategori: string
  profil_turu: MaliyetMalzemeTuru
  fiyat_id: string | null
  kaynak_turu: StokMaliyetKaynagiTuru | null
  kaynak_id: string | null
  baglanti_id: string | null
  tedarikci_id: string | null
  tedarikci_adi: string | null
  birim_fiyat: number | null
  para_birimi: ParaBirimi | null
  fiyat_birimi: string | null
  hesaplanan_maliyet_try: number | null
  gecerlilik_baslangici: string | null
  gecerlilik_bitisi: string | null
  fiyat_tarihi: string | null
  dogrulama_durumu: 'dogrulanmis' | 'fiyat_eksik' | 'kur_veya_vade_eksik'
}

export interface MaliyetCamHammaddesi {
  id: string
  stok_id: string
  profil_id: string
  stok_kodu: string
  stok_adi: string
  kalinlik_mm: number
  cam_turu: MaliyetCamTuru
  ozel_tur_adi: string | null
  aktif: boolean
  created_at: string
}

export interface MaliyetCitasi {
  id: string
  stok_id: string
  profil_id: string
  stok_kodu: string
  stok_adi: string
  genislik_mm: number
  malzeme_turu: MaliyetCitaTuru
  ozel_malzeme_adi: string | null
  aktif: boolean
  created_at: string
}

export interface MaliyetSarfMalzemesi {
  id: string
  stok_id: string
  profil_id: string
  stok_kodu: string
  ad: string
  alis_birimi: MaliyetSarfBirimi
  aktif: boolean
  created_at: string
}

export interface MaliyetSarfKatsayiSurumu {
  id: string
  sarf_malzeme_id: string
  hesaplama_tipi: MaliyetSarfHesaplamaTipi
  tuketim_katsayisi: number
  bosluk_basi: boolean
  fire_orani: number
  gecerli_baslangic: string
  aciklama: string | null
  created_at: string
  profil_id?: string
}

export interface MaliyetHesaplamaAyarSurumu {
  id: string
  yillik_finansman_orani: number
  cam_fire_orani: number
  cita_fire_orani: number
  referans_en_mm: number
  referans_boy_mm: number
  gecerli_baslangic: string
  aciklama: string | null
  created_at: string
}

export interface MaliyetTedarikcisi {
  id: string
  kod: string
  ad: string
  tedarik_kapsamlari?: Array<'cam' | 'cita' | 'yan_malzeme' | 'temper_hizmeti'>
}

export interface MaliyetGuncelAlisFiyati {
  fiyat_id: string
  malzeme_turu: MaliyetMalzemeTuru
  malzeme_id: string
  malzeme_adi: string
  alis_birimi: string
  tedarikci_id: string
  tedarikci_adi: string
  birim_fiyat: number
  para_birimi: ParaBirimi
  vade_gunu: number
  fiyat_tarihi: string
  yillik_finansman_orani: number | null
  kur: number | null
  kur_tarihi: string | null
  baz_birim_maliyet_try: number | null
  finansman_birim_etkisi_try: number | null
  faiz_dahil_birim_maliyet_try: number | null
  ayar_eksik: boolean
  kur_eksik: boolean
  stok_id: string
  kaynak_turu: StokMaliyetKaynagiTuru | null
  kaynak_id: string | null
  baglanti_id: string | null
  fiyat_birimi: string
  gecerlilik_baslangici: string | null
  gecerlilik_bitisi: string | null
  dogrulama_durumu: string
}

export interface MaliyetAlisFiyatiTarihceKaydi {
  fiyat_id: string
  atama_id: string | null
  malzeme_turu: MaliyetMalzemeTuru | null
  malzeme_id: string
  malzeme_adi: string
  alis_birimi: string
  tedarikci_id: string | null
  tedarikci_adi: string | null
  birim_fiyat: number
  para_birimi: ParaBirimi
  vade_gunu: number
  fiyat_tarihi: string
  aciklama: string | null
  olusturan_kullanici: string
  olusturulma_tarihi: string
  gecersiz: boolean
  gecersiz_kilma_gerekcesi: string | null
  gecersiz_kilan_kullanici: string | null
  gecersiz_kilma_tarihi: string | null
  stok_id: string
  stok_kodu: string
  stok_adi: string
  stok_kategorisi: 'cam' | 'cita' | 'yan_malzeme' | null
  profil_turu: MaliyetMalzemeTuru | null
  fiyat_birimi: string
  paket_miktari: number | null
  stok_ana_birimi: string
  donusum_katsayisi: number
  kaynak_turu: string
  kaynak_referansi: string | null
  durum: StokAlisFiyatiDurumu
  onceki_fiyat_id: string | null
  duzeltme_nedeni: string | null
  aktif_donem_baslangici: string | null
  aktif_donem_bitisi: string | null
  fiyat_varyanti: string
  marka: string | null
  fiyat_liste_kodu: string | null
  toplam_kayit: number | null
}

export interface MaliyetUrunTarihceKaydi {
  olay_tarihi: string
  olay_turleri: string[]
  stok_id: string
  stok_kodu: string
  urun_adi: string
  urun_grubu: string | null
  gecerli: boolean
  hesaplama_surumu: string | null
  recete_surumu_id: string | null
  toplam_maliyet: number | null
  m2_maliyet: number | null
  cam_maliyeti: number | null
  cita_maliyeti: number | null
  sarf_maliyeti: number | null
  islem_maliyeti: number | null
  fire_etkisi: number | null
  finansman_etkisi: number | null
  kur_etkisi: number | null
  onceki_toplam_maliyet: number | null
  maliyet_farki: number | null
  maliyet_farki_yuzde: number | null
  toplam_kayit: number
  detay: Record<string, unknown>
}

export interface MaliyetTarihceUrunu {
  stok_id: string
  stok_kodu: string
  urun_adi: string
  urun_grubu: string | null
}

export interface MaliyetUrunEksigi {
  kod: string
  bilesen: string
  mesaj?: string
  islem_sira_no?: number
  islem_turu?: string
  detaylar?: Array<Record<string, unknown>>
}

export interface MaliyetUrunBileseni {
  tur: MaliyetMalzemeTuru
  ad: string
  miktar: number | null
  firesiz_miktar: number | null
  fire_orani: number | null
  birim: string
  tedarikci: string | null
  baz_birim_maliyet: number | null
  finansman_birim_etkisi: number | null
  faiz_dahil_birim_maliyet: number | null
  baz_maliyet: number | null
  finansman_etkisi: number | null
  toplam_maliyet: number | null
  eksik_kodu: string | null
  stok_id: string
  fiyat_id: string
  fiyat_kaynagi_id: string
  kaynak_turu: StokMaliyetKaynagiTuru
  baglanti_id: string | null
  tedarikci_id: string
  kur_id: string | null
  vade_parametre_id: string | null
  parametre_surumu: string
  gecerlilik_baslangici: string
  gecerlilik_bitisi: string | null
  fire_surumu_id: string | null
  fire_etkisi: number
  vade_etkisi: number
  kur_etkisi: number
}

export interface MaliyetUrunIslemi {
  sira_no: number
  islem_turu: string
  tuketim_tipi: string
  hedef_cam_sira_nolari: number[]
  pane_sayisi: number
  alan_katsayisi: number
  maliyet_alan_m2: number
  toplam_maliyet: number
  temper_cozumu: TemperMaliyetCozumu | null
}

export interface MaliyetUrunSonucu {
  stok_id: string
  stok_kodu: string
  urun_adi: string
  urun_grubu: string | null
  katman_yapisi: string
  gecerli: boolean
  baz_maliyet: number
  finansman_etkisi: number
  toplam_maliyet: number
  m2_maliyet: number
  cam_maliyeti: number
  cita_maliyeti: number
  sarf_maliyeti: number
  islem_maliyeti: number
  bilesenler: MaliyetUrunBileseni[]
  islemler: MaliyetUrunIslemi[]
  eksikler: MaliyetUrunEksigi[]
  hesaplama_tarihi: string
  hesaplama_surumu: string
  stok_yapi_surumu: string
  fire_etkisi: number
  vade_etkisi: number
  kur_etkisi: number
}

export interface MaliyetHesapSonucu {
  gecerli: boolean
  hata_kodu?: string
  hatalar?: Array<{ kod: string; mesaj: string }>
  hesaplama_surumu?: string
  hesaplama_tarihi?: string
  para_birimi?: 'TRY'
  referans_en_mm?: number
  referans_boy_mm?: number
  referans_alan_m2?: number
  referans_cevre_m?: number
  yillik_finansman_orani?: number
  cam_fire_orani?: number
  cita_fire_orani?: number
  finansman_formulu?: string
  urun_sayisi?: number
  gecerli_urun_sayisi?: number
  eksik_urun_sayisi?: number
  urunler: MaliyetUrunSonucu[]
}

export interface SadeMaliyetYonetimi {
  camlar: MaliyetCamHammaddesi[]
  citalar: MaliyetCitasi[]
  sarflar: MaliyetSarfMalzemesi[]
  sarfKatsayilari: MaliyetSarfKatsayiSurumu[]
  ayarlar: MaliyetHesaplamaAyarSurumu[]
  tedarikciler: MaliyetTedarikcisi[]
  fiyatlar: MaliyetGuncelAlisFiyati[]
  hesap: MaliyetHesapSonucu
  profiller: StokMaliyetProfili[]
  adayStoklar: StokMaliyetAdayi[]
  camFiyatGruplari: CamFiyatGrubu[]
  fireler: StokFireOraniSurumu[]
  receteler: StokMaliyetReceteOzeti[]
}

export interface StokFireOraniSurumu {
  fire_surumu_id: string
  stok_id: string
  stok_kodu: string
  stok_adi: string
  kategori: 'cam' | 'cita' | 'yan_malzeme'
  fire_orani: number
  revision_no: number
  gecerlilik_baslangici: string
  gecerlilik_bitisi: string | null
}

export interface StokMaliyetReceteOzeti {
  urun_stok_id: string
  stok_kodu: string
  urun_adi: string
  katman_yapisi: string
  durum: 'hazir' | 'eksik'
  recete_surumu_id: string | null
  revision_no: number | null
  recete_kaynagi: 'manuel' | 'standart_036' | null
  kalem_sayisi: number
}

export interface MaliyetAlisFiyatiPayload {
  stok_id: string
  tedarikci_id: string
  birim_fiyat: string
  para_birimi: ParaBirimi
  fiyat_birimi: string
  stok_ana_birimi: string
  paket_miktari?: string
  donusum_katsayisi: string
  donusum_aciklamasi?: string
  vade_gunu: string
  fiyat_tarihi: string
  gecerlilik_baslangici: string
  kaynak_referansi?: string
  kaynak_ekran: 'stok_karti' | 'maliyet_ekrani' | 'cari_tedarikci_detayi'
  onceki_fiyat_id?: string
  duzeltme_nedeni?: string
}

export interface StokMaliyetProfiliPayload {
  stok_id: string
  profil_turu: MaliyetMalzemeTuru
  cam_fiyat_grubu_id?: string | null
  cita_malzeme_turu?: MaliyetCitaTuru | null
  olcu_mm?: string | null
  hesaplama_tipi?: MaliyetSarfHesaplamaTipi | null
  tuketim_katsayisi?: string | null
  bosluk_basi?: boolean
  fire_orani: string
  fiyat_birimi: string
  stok_ana_birimi: string
  donusum_katsayisi: string
  gecerlilik_baslangici: string
  aciklama: string
  kaynak: 'stok_karti' | 'maliyet_ekrani'
}

export interface CamTedarikBaglantiKalemi {
  id: string
  baglanti_id: string
  cam_fiyat_grubu_id: string
  cam_fiyat_grubu_adi: string
  birim_fiyat: number
  para_birimi: ParaBirimi
  fiyat_birimi: string
  paket_miktari: number | null
  stok_ana_birimi: string
  donusum_katsayisi: number
  vade_gunu: number
  stok_ids: string[]
}

export interface CamTedarikBaglantisi {
  id: string
  tedarikci_id: string
  baglanti_no: string
  toplam_tutar: number
  para_birimi: ParaBirimi
  baslangic_tarihi: string
  kapanis_tarihi: string | null
  durum: 'taslak' | 'aktif' | 'kapali' | 'iptal'
  revision_no: number
  kalemler: CamTedarikBaglantiKalemi[]
}

export interface TedarikciMaliyetDetayi {
  baglantilar: CamTedarikBaglantisi[]
  fiyatlar: MaliyetAlisFiyatiTarihceKaydi[]
  engeller: {
    aktif_cam_baglantisi_sayisi: number
    aktif_stok_fiyati_sayisi: number
    gelecek_fiyat_donemi_sayisi: number
    bagli_stok_sayisi: number
  }
}

export type StokMaliyetKapsami = 'cam' | 'cita' | 'yan_malzeme'
export type StokMaliyetFiyatVaryanti = 'genel' | 'me' | 'ju'
export type StokMaliyetSecimSeviyesi = 'stok_override' | 'toplu_politika' | 'yok'

export interface StokTedarikciFiyatTeklifiKalemi {
  stok_id: string
  birim_fiyat: number
  para_birimi: 'TRY'
  fiyat_birimi: 'm2' | 'm' | 'kg' | 'litre' | 'adet'
  varyant: StokMaliyetFiyatVaryanti
  vade_gunu: number
  marka?: string
}

export interface StokTedarikciFiyatTeklifiPayload {
  tedarikci_id: string
  fiyat_tarihi?: string
  gecerlilik_baslangici: string
  gecerlilik_bitisi?: string
  kaynak_referansi?: string
  kalemler: StokTedarikciFiyatTeklifiKalemi[]
}

export interface StokMaliyetTopluPolitikaPayload {
  kapsam: StokMaliyetKapsami
  tedarikci_id: string
  varyant: StokMaliyetFiyatVaryanti
  vade_gunu: number
  stok_ids?: string[]
  genel_fallback?: boolean
  baslangic: string
  bitis?: string
  gerekce: string
}

export interface StokMaliyetStokOverridePayload {
  stok_id: string
  fiyat_id: string
  baslangic: string
  bitis?: string
  gerekce: string
}

export interface StokMaliyetKaynakFiyati {
  fiyat_id: string
  stok_id: string
  tedarikci_id: string
  tedarikci_adi: string
  birim_fiyat: number
  para_birimi: ParaBirimi
  fiyat_birimi: string
  varyant: StokMaliyetFiyatVaryanti
  vade_gunu: number
  marka: string | null
  fiyat_tarihi: string
  gecerlilik_baslangici: string
  gecerlilik_bitisi: string | null
}

export interface StokMaliyetKaynakPaneliSatiri {
  stok_id: string
  stok_kodu: string
  stok_adi: string
  kapsam: StokMaliyetKapsami
  secim_seviyesi: StokMaliyetSecimSeviyesi
  aktif_fiyat: StokMaliyetKaynakFiyati | null
  toplu_politika: Record<string, unknown> | null
  alternatifler: StokMaliyetKaynakFiyati[]
}

export interface StokMaliyetKaynakPaneli {
  tarih: string
  stoklar: StokMaliyetKaynakPaneliSatiri[]
  eksikler: Array<Record<string, unknown>>
}

export interface StandartReceteKurulumSonucu {
  basarili: boolean
  uygulandi: boolean
  baslangic: string
  kurulanlar: Array<Record<string, unknown>>
  mevcutlar: Array<Record<string, unknown>>
  oneriler: Array<Record<string, unknown>>
  belirsizler: Array<Record<string, unknown>>
  eksikler: Array<Record<string, unknown>>
}

export type TemperMaliyetModu = 'dis_hizmet' | 'ic_uretim'
export type TemperIcUretimBileseni = 'amortisman' | 'enerji' | 'iscilik'

export interface TemperIcUretimKalemi {
  kalem_id?: string | null
  sira_no: number
  bilesen_turu: TemperIcUretimBileseni
  aciklama: string
  tuketim_birimi: string
  m2_basina_tuketim: number
  birim_maliyet_try: number
  miktar?: number | null
  toplam_maliyet?: number | null
}

export interface TemperMaliyetCozumu {
  gecerli: boolean
  mod: TemperMaliyetModu | null
  mod_surumu_id: string | null
  alan_m2: number
  birim_maliyet_try: number | null
  toplam_maliyet: number | null
  dis_hizmet_fiyati: StokMaliyetKaynakFiyati | null
  ic_uretim_kalemleri: TemperIcUretimKalemi[]
  hatalar: Array<Record<string, unknown>>
}

export interface TemperMaliyetModSurumu {
  mod_surumu_id: string
  mod: TemperMaliyetModu
  revision_no: number
  gecerlilik_baslangici: string
  gecerlilik_bitisi: string | null
  gerekce: string
  dis_hizmet_stok_id: string | null
  ic_uretim_kalemleri: TemperIcUretimKalemi[]
}

export interface TemperHizmetStogu {
  stok_id: string
  stok_kodu: string
  stok_adi: string
  birim: string
  aktif_fiyat: StokMaliyetKaynakFiyati | null
  alternatifler: StokMaliyetKaynakFiyati[]
}

export interface TemperUrunFiyatSecimi {
  secim_id: string
  urun_stok_id: string | null
  urun_stok_kodu: string | null
  fiyat_id: string
  tedarikci_id: string
  tedarikci_adi: string
  birim_fiyat: number
  para_birimi: ParaBirimi
  fiyat_birimi: string
  vade_gunu: number
  marka: string | null
  gecerlilik_baslangici: string
  gecerlilik_bitisi: string | null
  gerekce: string
}

export interface TemperUrunCozumu {
  stok_id: string
  stok_kodu: string
  stok_adi: string
  recete_surumu_id: string
  gecerli: boolean
  mod: TemperMaliyetModu | null
  birim_maliyet_try: number | null
  hatalar: Array<Record<string, unknown>>
  cozum: TemperMaliyetCozumu | null
}

export interface TemperMaliyetPaneli {
  tarih: string
  hazir: boolean
  hizmet_stogu: TemperHizmetStogu | null
  aktif_cozum: TemperMaliyetCozumu | null
  mod_surumleri: TemperMaliyetModSurumu[]
  urun_fiyat_secimleri: TemperUrunFiyatSecimi[]
  urun_cozumleri: TemperUrunCozumu[]
  eksikler: Array<Record<string, unknown>>
}

export interface TemperMaliyetModuPayload {
  mod: TemperMaliyetModu
  baslangic: string
  bitis?: string
  gerekce: string
  dis_hizmet_stok_id?: string
  ic_uretim_kalemleri?: TemperIcUretimKalemi[]
}

export interface TemperDisHizmetFiyatSecimiPayload {
  fiyat_id: string
  baslangic: string
  bitis?: string
  gerekce: string
  urun_stok_id?: string
  urun_stok_ids?: string[]
}
