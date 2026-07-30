import { supabase } from '@/lib/supabase'
import { ticariBugun } from '@/lib/ticariFormat'
import { TicariRpcError, yeniIdempotencyAnahtari } from '@/services/ticariService'
import type {
  CamFiyatGrubu,
  CamTedarikBaglantisi,
  MaliyetAlisFiyatiPayload,
  MaliyetAlisFiyatiTarihceKaydi,
  MaliyetCamHammaddesi,
  MaliyetCitasi,
  MaliyetGuncelAlisFiyati,
  MaliyetHesaplamaAyarSurumu,
  MaliyetHesapSonucu,
  MaliyetMalzemeTuru,
  MaliyetSarfKatsayiSurumu,
  MaliyetSarfMalzemesi,
  MaliyetTedarikcisi,
  MaliyetUrunBileseni,
  MaliyetUrunIslemi,
  MaliyetUrunSonucu,
  MaliyetUrunTarihceKaydi,
  SadeMaliyetYonetimi,
  StandartReceteKurulumSonucu,
  StokMaliyetKaynakPaneli,
  StokMaliyetStokOverridePayload,
  StokMaliyetTopluPolitikaPayload,
  StokMaliyetAdayi,
  StokFireOraniSurumu,
  StokMaliyetReceteOzeti,
  StokMaliyetOzeti,
  StokMaliyetProfili,
  StokMaliyetProfiliPayload,
  StokTedarikciFiyatTeklifiPayload,
  TemperDisHizmetFiyatSecimiPayload,
  TemperHizmetStogu,
  TemperIcUretimKalemi,
  TemperMaliyetCozumu,
  TemperMaliyetModSurumu,
  TemperMaliyetModuPayload,
  TemperMaliyetPaneli,
  TemperUrunCozumu,
  TemperUrunFiyatSecimi,
  TedarikciMaliyetDetayi,
} from '@/types/maliyet'

const MALIYET_HATA_MESAJLARI: Record<string, string> = {
  COSTING_READ_YETKISI_GEREKLI: 'Maliyet verilerini görüntüleme yetkiniz yok.',
  COSTING_CREATE_YETKISI_GEREKLI: 'Alış fiyatı oluşturma yetkiniz yok.',
  COSTING_UPDATE_YETKISI_GEREKLI: 'Maliyet profilini güncelleme yetkiniz yok.',
  COSTING_MANAGE_YETKISI_GEREKLI: 'Fiyat aktifleştirme veya kapatma yetkiniz yok.',
  AAL2_GEREKLI: 'Bu kritik işlem için iki adımlı doğrulama gereklidir.',
  STOK_MALIYET_PROFILI_GEREKLI:
    'Bu stok için önce stoktan maliyet bileşeni profili oluşturun.',
  AKTIF_TEDARIKCI_GEREKLI: 'Aktif ve uygun kapsama sahip bir tedarikçi seçin.',
  TEDARIKCI_KAPSAMI_UYUSMUYOR:
    'Tedarikçinin tedarik kapsamı seçilen stok türünü içermiyor.',
  DOGRULANMIS_FIYAT_GEREKLI: 'Doğrulanmamış legacy fiyat aktifleştirilemez.',
  CAM_MALIYET_KAYNAGI_BAGLANTI_OLMALI:
    'Sirküler/portal modelindeki cam fiyatı doğrudan aktifleştirilemez; Şişecam fiyat akışını kullanın.',
  KUR_BULUNAMADI: 'Seçilen tarih ve para birimi için döviz kuru bulunamadı.',
  AYNI_BASLANGICTA_FARKLI_FIYAT_VAR:
    'Aynı başlangıç anında başka bir fiyat var. Daha sonraki bir başlangıç seçin.',
  TEDARIKCI_AKTIF_MALIYET_KAYNAKLARI_NEDENIYLE_PASIFLESTIRILEMEZ:
    'Tedarikçi, aktif veya gelecek tarihli maliyet kaynakları kapatılmadan pasifleştirilemez.',
  TEDARIKCI_AKTIFLESTIRME_GEREKCESI_ZORUNLU:
    'Tedarikçiyi yeniden aktifleştirmek için en az 5 karakterlik gerekçe yazın.',
  TEDARIKCI_BULUNAMADI: 'Tedarikçi bulunamadı.',
  TEDARIKCI_ZATEN_AKTIF: 'Tedarikçi zaten aktif durumda.',
  STOK_LEGACY_FIYAT_ALANLARI_YENI_YAZIMA_KAPALI:
    'Eski stok fiyat alanları salt okunurdur. Alış fiyatları bölümünü kullanın.',
  FIYAT_TEKLIFI_KALEMLERI_ZORUNLU: 'Kaydedilecek en az bir fiyat satırı gereklidir.',
  FIYAT_TEKLIFI_AKTIF_STOK_GEREKLI: 'Fiyat satırındaki stok aktif değil veya bulunamadı.',
  V3_FIYAT_BIRIMI_DESTEKLENMIYOR: 'İlk aşamada cam fiyatları yalnız TRY/m² olarak girilebilir.',
  FIYAT_TEKLIFI_DONEMI_GECERSIZ: 'Fiyatın bitiş tarihi başlangıç tarihinden sonra olmalıdır.',
  FIRE_ORANI_GECERSIZ: 'Fire oranı 0 ile 100 arasında olmalıdır.',
  FIRE_DONEMI_GECERSIZ: 'Fire oranının geçerlilik dönemi geçersiz.',
  URUN_STOK_ID_GEREKLI: 'Maliyet tarihçesi için bir ürün seçin.',
  MALIYET_TARIH_ARALIGI_GECERSIZ:
    'Maliyet tarihçesinde başlangıç tarihi bitiş tarihinden sonra olamaz.',
  AKTIF_URUN_STOGU_BULUNAMADI:
    'Maliyet tarihçesi yalnız aktif cam ürünleri için görüntülenebilir.',
  AYNI_BASLANGICTA_FIRE_SURUMU_VAR:
    'Aynı başlangıç tarihinde başka bir fire sürümü var. Farklı bir tarih seçin.',
  AKTIF_FIYAT_SECIMI_EKSIK: 'Bu stok için hesapta kullanılacak aktif fiyat seçilmemiş.',
  RECETE_IKINCIL_DOLGU_CAKISMASI:
    'Poliüretan ve Thiokol aynı ürün boşluğunda birlikte kullanılamaz.',
  TEMPER_MALIYET_MODU_BILGILERI_GECERSIZ:
    'Temper modeli, başlangıç/bitiş dönemi veya gerekçesi geçersiz.',
  AYNI_BASLANGICTA_TEMPER_MALIYET_MODU_VAR:
    'Bu başlangıç tarihinde başka bir temper maliyet modeli sürümü var.',
  DIS_HIZMET_MODUNDA_IC_URETIM_KALEMI_OLAMAZ:
    'Dış hizmet modeline iç üretim maliyet kalemi eklenemez.',
  TEMPER_DIS_HIZMET_STOGU_KURULMAMIS:
    'Önce stok ekranındaki başlangıç kataloğu butonuyla Temper Dış Hizmet kartını oluşturun.',
  TEMPER_IC_URETIM_UC_TEMEL_KALEM_GEREKLI:
    'İç üretimde amortisman, enerji ve işçilik kalemlerinin üçü de geçerli değerlerle zorunludur.',
  TEMPER_DIS_HIZMET_FIYAT_SECIMI_GECERSIZ:
    'Temper fiyat seçimi, dönemi veya gerekçesi geçersiz.',
  TEMPER_URUN_LISTESI_GECERSIZ:
    'Toplu temper fiyatı için en az bir geçerli ürün seçin.',
  TEMPER_DIS_HIZMET_MODU_AKTIF_DEGIL:
    'Fiyat seçmeden önce ilgili tarihte dış hizmet temper modelini etkinleştirin.',
  TEMPER_DIS_HIZMET_TRY_M2_FIYATI_GEREKLI:
    'Temper dış hizmet fiyatı TRY/m² biriminde ve doğrulanmış olmalıdır.',
  TEMPER_FIYAT_SECIMI_ICIN_AKTIF_CAM_URUNU_GEREKLI:
    'Ürün özel temper fiyatı yalnız katman yapısı tanımlı aktif cam ürünlerine uygulanabilir.',
  TEMPER_DIS_HIZMET_FIYATI_SECIM_DONEMINI_KAPSAMIYOR:
    'Seçilen tedarikçi fiyatı temper seçim dönemini kapsamıyor.',
  TEMPER_DIS_HIZMET_MODU_SECIM_DONEMINI_KAPSAMIYOR:
    'Dış hizmet modeli seçilen fiyat döneminin tamamını kapsamıyor.',
  TEMPER_DIS_HIZMET_FIYAT_SECIM_DONEMI_GECERSIZ:
    'Temper dış hizmet fiyatının geçerlilik dönemi geçersiz.',
  AYNI_BASLANGICTA_FARKLI_TEMPER_FIYAT_SECIMI_VAR:
    'Aynı başlangıç tarihinde farklı bir temper fiyat seçimi var.',
  AYNI_BASLANGICTA_TEMPER_FIYAT_SECIMI_VAR:
    'Aynı başlangıç tarihinde zaten bir temper fiyat seçimi var. Farklı bir başlangıç tarihi seçin.',
}

type SupabaseSonucu<T> = {
  data: T | null
  error: { message: string; code?: string; details?: string } | null
}

function hataFirlat(error: SupabaseSonucu<unknown>['error']) {
  if (!error) return
  const kod = Object.keys(MALIYET_HATA_MESAJLARI).find((aday) =>
    error.message.includes(aday),
  )
  if (kod) {
    const typed = new TicariRpcError(kod, {
      supabase_code: error.code ?? null,
      details: error.details ?? null,
    })
    typed.message = MALIYET_HATA_MESAJLARI[kod]
    throw typed
  }
  throw new Error(error.details ? `${error.message} — ${error.details}` : error.message)
}

function kayit(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function dizi(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function sayi(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableSayi(value: unknown) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stokMaliyetKategorisiniDonustur(
  value: unknown,
): MaliyetAlisFiyatiTarihceKaydi['stok_kategorisi'] {
  return value === 'cam' || value === 'cita' || value === 'yan_malzeme'
    ? value
    : null
}

function maliyetMalzemeTurunuDonustur(
  profilTuru: unknown,
  stokKategorisi: MaliyetAlisFiyatiTarihceKaydi['stok_kategorisi'],
): MaliyetMalzemeTuru | null {
  if (profilTuru === 'cam' || profilTuru === 'cita' || profilTuru === 'sarf') {
    return profilTuru
  }
  if (stokKategorisi === 'cam' || stokKategorisi === 'cita') {
    return stokKategorisi
  }
  return stokKategorisi === 'yan_malzeme' ? 'sarf' : null
}

function temperSozlesmeHatasi(alan: string, value: unknown): never {
  const gosterim = typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : JSON.stringify(value)
  throw new Error(
    `Temper maliyet verisi beklenen sözleşmeyle uyuşmuyor (${alan}: ${gosterim ?? 'tanımsız'}).`,
  )
}

function temperZorunluMetin(value: unknown, alan: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    temperSozlesmeHatasi(alan, value)
  }
  return value
}

function temperZorunluSayi(value: unknown, alan: string) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) temperSozlesmeHatasi(alan, value)
  return parsed
}

function temperNullableSayi(value: unknown, alan: string) {
  if (value == null || value === '') return null
  return temperZorunluSayi(value, alan)
}

function temperZorunluBoolean(value: unknown, alan: string) {
  if (typeof value !== 'boolean') temperSozlesmeHatasi(alan, value)
  return value
}

function temperParaBiriminiDonustur(value: unknown) {
  if (value === 'TRY' || value === 'USD' || value === 'EUR') return value
  temperSozlesmeHatasi('para_birimi', value)
}

function temperVaryantiniDonustur(value: unknown) {
  if (value === 'genel' || value === 'me' || value === 'ju') return value
  temperSozlesmeHatasi('varyant', value)
}

function rpcSonucunuDogrula(value: unknown) {
  const sonuc = kayit(value)
  if (sonuc.basarili === false || sonuc.gecerli === false) {
    const kod = typeof sonuc.hata_kodu === 'string'
      ? sonuc.hata_kodu
      : 'MALIYET_ISLEMI_BASARISIZ'
    const hata = new TicariRpcError(kod, sonuc)
    hata.message = MALIYET_HATA_MESAJLARI[kod] ?? hata.message
    throw hata
  }
  return sonuc
}

async function kaydetmeRpc(ad: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(ad, args)
  hataFirlat(error)
  return rpcSonucunuDogrula(data)
}

function profiliDonustur(value: unknown): StokMaliyetProfili {
  const row = kayit(value)
  return {
    ...row,
    olcu_mm: nullableSayi(row.olcu_mm),
    tuketim_katsayisi: nullableSayi(row.tuketim_katsayisi),
    fire_orani: sayi(row.fire_orani),
    donusum_katsayisi: sayi(row.donusum_katsayisi),
    revision_no: sayi(row.revision_no),
  } as StokMaliyetProfili
}

function hesapBileseniniDonustur(value: unknown): MaliyetUrunBileseni {
  const row = kayit(value)
  return {
    ...row,
    tur: row.tur ?? row.rol,
    ad: row.ad ?? row.stok_adi,
    miktar: nullableSayi(row.miktar),
    firesiz_miktar: nullableSayi(row.firesiz_miktar),
    fire_orani: nullableSayi(row.fire_orani),
    baz_birim_maliyet: nullableSayi(
      row.baz_birim_maliyet ?? row.birim_maliyet_try,
    ),
    finansman_birim_etkisi: nullableSayi(
      row.finansman_birim_etkisi ?? row.vade_etkisi,
    ),
    faiz_dahil_birim_maliyet: nullableSayi(
      row.faiz_dahil_birim_maliyet ?? row.birim_maliyet_try,
    ),
    baz_maliyet: nullableSayi(row.baz_maliyet),
    finansman_etkisi: nullableSayi(row.finansman_etkisi ?? row.vade_etkisi),
    toplam_maliyet: nullableSayi(row.toplam_maliyet),
    fire_etkisi: sayi(row.fire_etkisi),
    vade_etkisi: sayi(row.vade_etkisi),
    kur_etkisi: sayi(row.kur_etkisi),
    eksik_kodu: typeof row.eksik_kodu === 'string'
      ? row.eksik_kodu
      : typeof row.kod === 'string'
        ? row.kod
        : null,
  } as MaliyetUrunBileseni
}

function urunIsleminiDonustur(value: unknown): MaliyetUrunIslemi {
  const row = kayit(value)
  const hedefCamSirasi = dizi(row.hedef_cam_sira_nolari).map((sira) => (
    temperZorunluSayi(sira, 'islem.hedef_cam_sira_nolari')
  ))
  return {
    sira_no: temperZorunluSayi(row.sira_no, 'islem.sira_no'),
    islem_turu: temperZorunluMetin(row.islem_turu, 'islem.islem_turu'),
    tuketim_tipi: temperZorunluMetin(row.tuketim_tipi, 'islem.tuketim_tipi'),
    hedef_cam_sira_nolari: hedefCamSirasi,
    pane_sayisi: temperZorunluSayi(row.pane_sayisi, 'islem.pane_sayisi'),
    alan_katsayisi: temperZorunluSayi(row.alan_katsayisi, 'islem.alan_katsayisi'),
    maliyet_alan_m2: temperZorunluSayi(row.maliyet_alan_m2, 'islem.maliyet_alan_m2'),
    toplam_maliyet: temperZorunluSayi(row.toplam_maliyet, 'islem.toplam_maliyet'),
    temper_cozumu: temperCozumunuDonustur(row.temper_cozumu),
  }
}

function urunSonucunuDonustur(value: unknown): MaliyetUrunSonucu {
  const row = kayit(value)
  return {
    ...row,
    baz_maliyet: sayi(row.baz_maliyet),
    finansman_etkisi: sayi(row.finansman_etkisi ?? row.vade_etkisi),
    toplam_maliyet: sayi(row.toplam_maliyet),
    m2_maliyet: sayi(row.m2_maliyet),
    cam_maliyeti: sayi(row.cam_maliyeti),
    cita_maliyeti: sayi(row.cita_maliyeti),
    sarf_maliyeti: sayi(row.sarf_maliyeti),
    islem_maliyeti: sayi(row.islem_maliyeti),
    fire_etkisi: sayi(row.fire_etkisi),
    vade_etkisi: sayi(row.vade_etkisi),
    kur_etkisi: sayi(row.kur_etkisi),
    bilesenler: dizi(row.bilesenler).map(hesapBileseniniDonustur),
    islemler: dizi(row.islemler).map(urunIsleminiDonustur),
    eksikler: dizi(row.eksikler ?? row.hatalar).map((value) => {
      const eksik = kayit(value)
      return {
        ...eksik,
        kod: typeof eksik.kod === 'string' ? eksik.kod : 'MALIYET_BILGISI_EKSIK',
        bilesen: typeof eksik.bilesen === 'string'
          ? eksik.bilesen
          : typeof eksik.stok_kodu === 'string'
            ? eksik.stok_kodu
            : 'Ürün',
      }
    }) as MaliyetUrunSonucu['eksikler'],
  } as MaliyetUrunSonucu
}

function hesapSonucunuDonustur(value: unknown): MaliyetHesapSonucu {
  const row = kayit(value)
  return {
    ...row,
    gecerli: temperZorunluBoolean(row.gecerli, 'cozum.gecerli'),
    urun_sayisi: sayi(row.urun_sayisi),
    gecerli_urun_sayisi: sayi(row.gecerli_urun_sayisi),
    eksik_urun_sayisi: sayi(row.eksik_urun_sayisi),
    urunler: dizi(row.urunler).map(urunSonucunuDonustur),
  } as MaliyetHesapSonucu
}

function fiyatiDonustur(value: unknown): MaliyetGuncelAlisFiyati | null {
  const row = kayit(value)
  if (typeof row.fiyat_id !== 'string') return null
  return {
    ...row,
    malzeme_turu: row.profil_turu,
    malzeme_id: row.stok_id,
    malzeme_adi: row.stok_adi,
    alis_birimi: row.fiyat_birimi,
    fiyat_tarihi: row.fiyat_tarihi,
    birim_fiyat: sayi(row.birim_fiyat),
    vade_gunu: sayi(row.vade_gunu),
    yillik_finansman_orani: nullableSayi(row.yillik_finansman_orani),
    kur: nullableSayi(row.kur),
    kur_tarihi: typeof row.kur_tarihi === 'string' ? row.kur_tarihi : null,
    baz_birim_maliyet_try: nullableSayi(
      row.baz_birim_maliyet_try ?? row.hesaplanan_maliyet_try,
    ),
    finansman_birim_etkisi_try: nullableSayi(row.finansman_birim_etkisi_try),
    faiz_dahil_birim_maliyet_try: nullableSayi(row.hesaplanan_maliyet_try),
    ayar_eksik: row.hesaplanan_maliyet_try == null,
    kur_eksik: row.hesaplanan_maliyet_try == null && row.para_birimi !== 'TRY',
  } as MaliyetGuncelAlisFiyati
}

function tarihceyiDonustur(value: unknown): MaliyetAlisFiyatiTarihceKaydi {
  const row = kayit(value)
  const stokKategorisi = stokMaliyetKategorisiniDonustur(row.stok_kategorisi)
  const malzemeTuru = maliyetMalzemeTurunuDonustur(row.profil_turu, stokKategorisi)
  return {
    ...row,
    birim_fiyat: sayi(row.birim_fiyat),
    paket_miktari: nullableSayi(row.paket_miktari),
    donusum_katsayisi: sayi(row.donusum_katsayisi),
    vade_gunu: sayi(row.vade_gunu),
    stok_kategorisi: stokKategorisi,
    profil_turu: maliyetMalzemeTurunuDonustur(row.profil_turu, null),
    malzeme_turu: malzemeTuru,
    malzeme_id: row.stok_id,
    malzeme_adi: row.stok_adi,
    alis_birimi: row.fiyat_birimi,
    tedarikci_id: typeof row.tedarikci_id === 'string' ? row.tedarikci_id : null,
    tedarikci_adi: typeof row.tedarikci_adi === 'string' ? row.tedarikci_adi : null,
    aciklama: row.duzeltme_nedeni ?? row.kaynak_referansi ?? null,
    gecersiz: false,
    gecersiz_kilma_gerekcesi: null,
    gecersiz_kilan_kullanici: null,
    gecersiz_kilma_tarihi: null,
    fiyat_varyanti: typeof row.fiyat_varyanti === 'string' && row.fiyat_varyanti.trim()
      ? row.fiyat_varyanti
      : 'genel',
    marka: typeof row.marka === 'string' && row.marka.trim() ? row.marka : null,
    fiyat_liste_kodu: typeof row.fiyat_liste_kodu === 'string' && row.fiyat_liste_kodu.trim()
      ? row.fiyat_liste_kodu
      : null,
    toplam_kayit: nullableSayi(row.toplam_kayit),
  } as MaliyetAlisFiyatiTarihceKaydi
}

function urunMaliyetTarihcesiniDonustur(value: unknown): MaliyetUrunTarihceKaydi {
  const row = kayit(value)
  return {
    olay_tarihi: typeof row.olay_tarihi === 'string' ? row.olay_tarihi : '',
    olay_turleri: dizi(row.olay_turleri)
      .filter((olay): olay is string => typeof olay === 'string'),
    stok_id: typeof row.stok_id === 'string' ? row.stok_id : '',
    stok_kodu: typeof row.stok_kodu === 'string' ? row.stok_kodu : '',
    urun_adi: typeof row.urun_adi === 'string' ? row.urun_adi : '',
    urun_grubu: typeof row.urun_grubu === 'string' ? row.urun_grubu : null,
    gecerli: row.gecerli === true,
    hesaplama_surumu: typeof row.hesaplama_surumu === 'string'
      ? row.hesaplama_surumu
      : null,
    recete_surumu_id: typeof row.recete_surumu_id === 'string'
      ? row.recete_surumu_id
      : null,
    toplam_maliyet: nullableSayi(row.toplam_maliyet),
    m2_maliyet: nullableSayi(row.m2_maliyet),
    cam_maliyeti: nullableSayi(row.cam_maliyeti),
    cita_maliyeti: nullableSayi(row.cita_maliyeti),
    sarf_maliyeti: nullableSayi(row.sarf_maliyeti),
    islem_maliyeti: nullableSayi(row.islem_maliyeti),
    fire_etkisi: nullableSayi(row.fire_etkisi),
    finansman_etkisi: nullableSayi(row.finansman_etkisi),
    kur_etkisi: nullableSayi(row.kur_etkisi),
    onceki_toplam_maliyet: nullableSayi(row.onceki_toplam_maliyet),
    maliyet_farki: nullableSayi(row.maliyet_farki),
    maliyet_farki_yuzde: nullableSayi(row.maliyet_farki_yuzde),
    toplam_kayit: sayi(row.toplam_kayit),
    detay: kayit(row.detay),
  }
}

export async function sadeMaliyetYonetiminiGetir(
  tarih = ticariBugun(),
): Promise<SadeMaliyetYonetimi> {
  const { data, error } = await supabase.rpc('stok_maliyet_katalogu_getir_v3', {
    p_tarih: tarih,
  })
  hataFirlat(error)
  const katalog = kayit(data)
  const profiller = dizi(katalog.profiller).map(profiliDonustur)
  const fiyatlar = dizi(katalog.fiyatlar)
    .map(fiyatiDonustur)
    .filter((fiyat): fiyat is MaliyetGuncelAlisFiyati => fiyat !== null)

  const camlar: MaliyetCamHammaddesi[] = profiller
    .filter((profil) => profil.profil_turu === 'cam')
    .map((profil) => ({
      id: profil.stok_id,
      stok_id: profil.stok_id,
      profil_id: profil.id,
      stok_kodu: profil.stok_kodu,
      stok_adi: profil.stok_adi,
      kalinlik_mm: profil.olcu_mm ?? 0,
      cam_turu: profil.cam_fiyat_grubu_kodu ?? 'diger',
      ozel_tur_adi: null,
      aktif: true,
      created_at: profil.gecerlilik_baslangici,
    }))
  const citalar: MaliyetCitasi[] = profiller
    .filter((profil) => profil.profil_turu === 'cita')
    .map((profil) => ({
      id: profil.stok_id,
      stok_id: profil.stok_id,
      profil_id: profil.id,
      stok_kodu: profil.stok_kodu,
      stok_adi: profil.stok_adi,
      genislik_mm: profil.olcu_mm ?? 0,
      malzeme_turu: profil.cita_malzeme_turu ?? 'diger',
      ozel_malzeme_adi: null,
      aktif: true,
      created_at: profil.gecerlilik_baslangici,
    }))
  const sarflar: MaliyetSarfMalzemesi[] = profiller
    .filter((profil) => profil.profil_turu === 'sarf')
    .map((profil) => ({
      id: profil.stok_id,
      stok_id: profil.stok_id,
      profil_id: profil.id,
      stok_kodu: profil.stok_kodu,
      ad: profil.stok_adi,
      alis_birimi: profil.fiyat_birimi as MaliyetSarfMalzemesi['alis_birimi'],
      aktif: true,
      created_at: profil.gecerlilik_baslangici,
    }))
  const sarfKatsayilari: MaliyetSarfKatsayiSurumu[] = profiller
    .filter((profil) => profil.profil_turu === 'sarf')
    .map((profil) => ({
      id: profil.id,
      profil_id: profil.id,
      sarf_malzeme_id: profil.stok_id,
      hesaplama_tipi: profil.hesaplama_tipi ?? 'sabit',
      tuketim_katsayisi: profil.tuketim_katsayisi ?? 0,
      bosluk_basi: profil.bosluk_basi,
      fire_orani: profil.fire_orani,
      gecerli_baslangic: profil.gecerlilik_baslangici,
      aciklama: null,
      created_at: profil.gecerlilik_baslangici,
    }))

  return {
    camlar,
    citalar,
    sarflar,
    sarfKatsayilari,
    ayarlar: dizi(katalog.ayarlar).map((value) => {
      const row = kayit(value)
      return {
        ...row,
        yillik_finansman_orani: sayi(row.yillik_finansman_orani),
        cam_fire_orani: sayi(row.cam_fire_orani),
        cita_fire_orani: sayi(row.cita_fire_orani),
        referans_en_mm: sayi(row.referans_en_mm),
        referans_boy_mm: sayi(row.referans_boy_mm),
      } as MaliyetHesaplamaAyarSurumu
    }),
    tedarikciler: dizi(katalog.tedarikciler) as MaliyetTedarikcisi[],
    fiyatlar,
    hesap: hesapSonucunuDonustur(katalog.hesap),
    profiller,
    adayStoklar: dizi(katalog.aday_stoklar).map((value) => {
      const row = kayit(value)
      return { ...row, kalinlik_mm: nullableSayi(row.kalinlik_mm) } as StokMaliyetAdayi
    }),
    camFiyatGruplari: dizi(katalog.cam_fiyat_gruplari) as CamFiyatGrubu[],
    fireler: dizi(katalog.fireler).map((value) => {
      const row = kayit(value)
      return {
        ...row,
        fire_orani: sayi(row.fire_orani),
        revision_no: sayi(row.revision_no),
      } as StokFireOraniSurumu
    }),
    receteler: dizi(katalog.receteler).map((value) => {
      const row = kayit(value)
      return {
        ...row,
        revision_no: row.revision_no == null ? null : sayi(row.revision_no),
        kalem_sayisi: sayi(row.kalem_sayisi),
      } as StokMaliyetReceteOzeti
    }),
  }
}

export async function stokMaliyetProfiliKaydet(
  payload: StokMaliyetProfiliPayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('stok_maliyet_profili_kaydet', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}

export async function maliyetMalzemeKaydet(
  payload: StokMaliyetProfiliPayload | Record<string, unknown>,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return stokMaliyetProfiliKaydet(payload as StokMaliyetProfiliPayload, idempotencyKey)
}

export async function stokAlisFiyatiKaydet(
  payload: MaliyetAlisFiyatiPayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('stok_alis_fiyati_kaydet', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}

export async function stokAlisFiyatiKaydetVeAktiflestir(
  payload: MaliyetAlisFiyatiPayload,
  gerekce: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('stok_alis_fiyati_kaydet_ve_aktiflestir', {
    p_payload: payload,
    p_gerekce: gerekce.trim(),
    p_idempotency_key: idempotencyKey,
  })
}

export async function maliyetAlisFiyatiKaydet(
  payload: MaliyetAlisFiyatiPayload | Record<string, unknown>,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  const typedPayload = payload as MaliyetAlisFiyatiPayload
  return stokAlisFiyatiKaydetVeAktiflestir(
    typedPayload,
    typedPayload.duzeltme_nedeni?.trim() || 'Kullanıcı tarafından aktif fiyat olarak kaydedildi.',
    idempotencyKey,
  )
}

export async function stokAlisFiyatiAktiflestir(
  fiyatId: string,
  gecerlilikBaslangici: string,
  gerekce: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('stok_alis_fiyati_aktiflestir', {
    p_fiyat_id: fiyatId,
    p_gecerlilik_baslangici: gecerlilikBaslangici,
    p_gerekce: gerekce.trim(),
    p_idempotency_key: idempotencyKey,
  })
}

export async function legacyFiyatDogrula(
  legacyFiyatId: string,
  payload: MaliyetAlisFiyatiPayload,
  gerekce: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('legacy_fiyat_dogrula', {
    p_legacy_fiyat_id: legacyFiyatId,
    p_payload: payload,
    p_gerekce: gerekce.trim(),
    p_idempotency_key: idempotencyKey,
  })
}

export async function stokMaliyetKaynagiKapat(
  atamaId: string,
  kapanisZamani: string,
  gerekce: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('stok_maliyet_kaynagi_kapat', {
    p_atama_id: atamaId,
    p_kapanis_zamani: kapanisZamani,
    p_gerekce: gerekce.trim(),
    p_idempotency_key: idempotencyKey,
  })
}

export async function maliyetAlisFiyatiTarihcesiniGetir(
  arama = '',
  limit = 500,
  stokId?: string,
  tedarikciId?: string,
) {
  const { data, error } = await supabase.rpc('stok_alis_fiyati_tarihcesi_v3', {
    p_stok_id: stokId ?? null,
    p_tedarikci_id: tedarikciId ?? null,
    p_limit: limit,
  })
  hataFirlat(error)
  const query = arama.trim().toLocaleLowerCase('tr-TR')
  return dizi(data)
    .map(tarihceyiDonustur)
    .filter((row) => !query || [
      row.stok_kodu,
      row.stok_adi,
      row.tedarikci_adi,
      row.kaynak_referansi,
    ].some((value) => value?.toLocaleLowerCase('tr-TR').includes(query)))
}

export async function maliyetUrunMaliyetTarihcesiniGetir(
  stokId: string,
  baslangic?: string,
  bitis?: string,
  limit = 200,
): Promise<MaliyetUrunTarihceKaydi[]> {
  const { data, error } = await supabase.rpc('urun_maliyeti_tarihcesi_v1', {
    p_stok_id: stokId,
    p_baslangic: baslangic?.trim() || null,
    p_bitis: bitis?.trim() || null,
    p_limit: limit,
  })
  hataFirlat(error)
  return dizi(data).map(urunMaliyetTarihcesiniDonustur)
}

export async function maliyetAlisFiyatiGecersizKil(
  fiyatId: string,
  gerekce: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  const tarihce = await maliyetAlisFiyatiTarihcesiniGetir('', 2000)
  const fiyat = tarihce.find((row) => row.fiyat_id === fiyatId)
  if (!fiyat || typeof fiyat.atama_id !== 'string' || fiyat.aktif_donem_bitisi) {
    throw new Error('Fiyat aktif değil; düzeltme için yeni bir doğrulanmış fiyat kaydı oluşturun.')
  }
  return stokMaliyetKaynagiKapat(
    fiyat.atama_id,
    new Date().toISOString(),
    gerekce,
    idempotencyKey,
  )
}

export async function maliyetSarfKatsayisiKaydet(
  _sarfMalzemeId: string,
  payload: StokMaliyetProfiliPayload | Record<string, unknown>,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return stokMaliyetProfiliKaydet(payload as StokMaliyetProfiliPayload, idempotencyKey)
}

export async function maliyetHesaplamaAyariKaydet(
  payload: Record<string, unknown>,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('maliyet_hesaplama_ayari_kaydet', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}

export async function maliyetUrunMaliyetleriniHesapla(
  tarih: string,
  enMm?: number,
  boyMm?: number,
) {
  const { data, error } = await supabase.rpc('urun_maliyetlerini_hesapla_v3', {
    p_tarih: tarih,
    p_en_mm: enMm ?? null,
    p_boy_mm: boyMm ?? null,
  })
  hataFirlat(error)
  return hesapSonucunuDonustur(data)
}

export async function stokMaliyetOzetleriniGetir(
  tarihSaat?: string,
): Promise<StokMaliyetOzeti[]> {
  const { data, error } = await supabase.rpc('stok_maliyet_ozetleri', {
    p_an: tarihSaat ?? null,
  })
  hataFirlat(error)
  return dizi(data).map((value) => {
    const row = kayit(value)
    return {
      ...row,
      birim_fiyat: nullableSayi(row.birim_fiyat),
      hesaplanan_maliyet_try: nullableSayi(row.hesaplanan_maliyet_try),
    } as StokMaliyetOzeti
  })
}

export async function tedarikciMaliyetDetayiniGetir(
  tedarikciId: string,
): Promise<TedarikciMaliyetDetayi> {
  const { data, error } = await supabase.rpc('tedarikci_maliyet_detayi_getir', {
    p_tedarikci_id: tedarikciId,
  })
  hataFirlat(error)
  const result = kayit(data)
  return {
    baglantilar: dizi(result.baglantilar) as CamTedarikBaglantisi[],
    fiyatlar: dizi(result.fiyatlar).map(tarihceyiDonustur),
    engeller: kayit(result.engeller) as unknown as TedarikciMaliyetDetayi['engeller'],
  }
}

export async function camBaglantisiOlustur(
  payload: Record<string, unknown>,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('cam_baglantisi_olustur', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}

export async function camBaglantisiAktiflestir(
  baglantiId: string,
  revisionNo: number,
  gerekce: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('cam_baglantisi_aktiflestir', {
    p_baglanti_id: baglantiId,
    p_revision_no: revisionNo,
    p_gerekce: gerekce.trim(),
    p_idempotency_key: idempotencyKey,
  })
}

export async function camBaglantisiKapat(
  baglantiId: string,
  kapanisZamani: string,
  gerekce: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('cam_baglantisi_kapat', {
    p_baglanti_id: baglantiId,
    p_kapanis_zamani: kapanisZamani,
    p_gerekce: gerekce.trim(),
    p_idempotency_key: idempotencyKey,
  })
}

export async function tedarikciPasiflestir(
  tedarikciId: string,
  gerekce: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('tedarikci_pasiflestir', {
    p_tedarikci_id: tedarikciId,
    p_gerekce: gerekce.trim(),
    p_idempotency_key: idempotencyKey,
  })
}

export async function tedarikciAktiflestir(
  tedarikciId: string,
  gerekce: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('tedarikci_aktiflestir', {
    p_tedarikci_id: tedarikciId,
    p_gerekce: gerekce.trim(),
    p_idempotency_key: idempotencyKey,
  })
}

export async function stokTedarikciFiyatTeklifleriniKaydetV3(
  payload: StokTedarikciFiyatTeklifiPayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('stok_tedarikci_fiyat_tekliflerini_kaydet_v3', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}

export async function stokMaliyetTopluPolitikaUygulaV3(
  payload: StokMaliyetTopluPolitikaPayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('stok_maliyet_toplu_politika_uygula_v3', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}

export async function stokMaliyetStokOverrideUygulaV3(
  payload: StokMaliyetStokOverridePayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('stok_maliyet_stok_override_uygula_v3', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}

export async function stokMaliyetKaynakPaneliniGetirV3(
  tarih = ticariBugun(),
): Promise<StokMaliyetKaynakPaneli> {
  const { data, error } = await supabase.rpc('stok_maliyet_kaynak_paneli_getir_v3', {
    p_tarih: tarih,
  })
  hataFirlat(error)
  const result = kayit(data)
  const kaynakFiyatiniDonustur = (value: unknown, stokId: string) => {
    const fiyat = kayit(value)
    const hamVaryant = fiyat.varyant ?? fiyat.fiyat_varyanti
    const varyant = hamVaryant === 'me' || hamVaryant === 'ju'
      ? hamVaryant
      : 'genel'
    return {
      ...fiyat,
      stok_id: typeof fiyat.stok_id === 'string' ? fiyat.stok_id : stokId,
      tedarikci_adi: typeof fiyat.tedarikci_adi === 'string'
        ? fiyat.tedarikci_adi
        : String(fiyat.tedarikci ?? ''),
      varyant,
      birim_fiyat: sayi(fiyat.stok_birim_fiyati ?? fiyat.birim_fiyat),
      vade_gunu: sayi(fiyat.vade_gunu),
      gecerlilik_baslangici: String(
        fiyat.gecerlilik_baslangici
          ?? fiyat.secim_baslangici
          ?? fiyat.fiyat_tarihi
          ?? '',
      ),
      gecerlilik_bitisi: (
        fiyat.gecerlilik_bitisi
        ?? fiyat.secim_bitisi
        ?? null
      ) as string | null,
    }
  }
  return {
    tarih: typeof result.tarih === 'string' ? result.tarih : tarih,
    stoklar: dizi(result.stoklar).map((value) => {
      const row = kayit(value)
      const aktifFiyatKaydi = row.aktif_fiyat == null ? null : kayit(row.aktif_fiyat)
      const aktifFiyat = aktifFiyatKaydi == null
        ? null
        : kaynakFiyatiniDonustur(aktifFiyatKaydi, String(row.stok_id ?? ''))
      const hamSecimSeviyesi = aktifFiyatKaydi?.secim_seviyesi
      return {
        ...row,
        kapsam: row.kategori ?? row.kapsam,
        secim_seviyesi: hamSecimSeviyesi === 'stok_override'
          ? 'stok_override'
          : hamSecimSeviyesi === 'toplu'
            ? 'toplu_politika'
            : 'yok',
        aktif_fiyat: aktifFiyat,
        toplu_politika: row.toplu_politika == null ? null : kayit(row.toplu_politika),
        alternatifler: dizi(row.alternatifler).map((fiyat) => (
          kaynakFiyatiniDonustur(fiyat, String(row.stok_id ?? ''))
        )),
      }
    }) as StokMaliyetKaynakPaneli['stoklar'],
    eksikler: dizi(result.eksikler).map(kayit),
  }
}

export async function standartUrunReceteleriniKurV3(
  tarih = ticariBugun(),
  stokIds?: string[],
  uygula = true,
): Promise<StandartReceteKurulumSonucu> {
  const { data, error } = await supabase.rpc('standart_urun_recetelerini_kur_v3', {
    p_baslangic: tarih,
    p_urun_stok_ids: stokIds ?? null,
    p_uygula: uygula,
  })
  hataFirlat(error)
  const result = kayit(data)
  return {
    basarili: result.basarili !== false,
    uygulandi: result.uygulandi === true,
    baslangic: typeof result.baslangic === 'string' ? result.baslangic : tarih,
    kurulanlar: dizi(result.kurulanlar).map(kayit),
    mevcutlar: dizi(result.mevcutlar).map(kayit),
    oneriler: dizi(result.oneriler).map(kayit),
    belirsizler: dizi(result.belirsizler).map(kayit),
    eksikler: dizi(result.eksikler).map(kayit),
  }
}

export async function urunMaliyetRecetesiKaydetV3(
  payload: Record<string, unknown>,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('urun_maliyet_recetesi_kaydet_v3', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}

export async function stokFireOraniKaydetV3(
  payload: Record<string, unknown>,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('stok_fire_orani_kaydet_v3', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}

export async function urunMaliyetiDetayliHesaplaV3(
  stokId: string,
  tarih = ticariBugun(),
  enMm?: number,
  boyMm?: number,
) {
  const { data, error } = await supabase.rpc('urun_maliyeti_detayli_hesapla_v3', {
    p_stok_id: stokId,
    p_tarih: tarih,
    p_en_mm: enMm ?? null,
    p_boy_mm: boyMm ?? null,
  })
  hataFirlat(error)
  return kayit(data)
}

function temperModunuDonustur(value: unknown): TemperMaliyetModuPayload['mod'] | null {
  if (value == null || value === '') return null
  if (value === 'dis_hizmet' || value === 'ic_uretim') return value
  temperSozlesmeHatasi('mod', value)
}

function temperIcUretimKaleminiDonustur(value: unknown): TemperIcUretimKalemi {
  const row = kayit(value)
  const bilesenTuru = row.bilesen_turu
  if (
    bilesenTuru !== 'amortisman'
    && bilesenTuru !== 'enerji'
    && bilesenTuru !== 'iscilik'
  ) {
    temperSozlesmeHatasi('ic_uretim_kalemi.bilesen_turu', bilesenTuru)
  }
  return {
    kalem_id: typeof row.kalem_id === 'string' ? row.kalem_id : null,
    sira_no: temperZorunluSayi(row.sira_no, 'ic_uretim_kalemi.sira_no'),
    bilesen_turu: bilesenTuru,
    aciklama: temperZorunluMetin(row.aciklama, 'ic_uretim_kalemi.aciklama'),
    tuketim_birimi: temperZorunluMetin(
      row.tuketim_birimi,
      'ic_uretim_kalemi.tuketim_birimi',
    ),
    m2_basina_tuketim: temperZorunluSayi(
      row.m2_basina_tuketim,
      'ic_uretim_kalemi.m2_basina_tuketim',
    ),
    birim_maliyet_try: temperZorunluSayi(
      row.birim_maliyet_try,
      'ic_uretim_kalemi.birim_maliyet_try',
    ),
    miktar: temperNullableSayi(row.miktar, 'ic_uretim_kalemi.miktar'),
    toplam_maliyet: temperNullableSayi(
      row.toplam_maliyet,
      'ic_uretim_kalemi.toplam_maliyet',
    ),
  }
}

function temperKaynakFiyatiniDonustur(
  value: unknown,
  stokId: string,
): TemperHizmetStogu['alternatifler'][number] {
  const row = kayit(value)
  const hamVaryant = row.varyant ?? row.fiyat_varyanti
  const cozumlenenStokId = typeof row.stok_id === 'string' ? row.stok_id : stokId
  return {
    fiyat_id: temperZorunluMetin(row.fiyat_id, 'dis_hizmet_fiyati.fiyat_id'),
    stok_id: temperZorunluMetin(
      cozumlenenStokId,
      'dis_hizmet_fiyati.stok_id',
    ),
    tedarikci_id: temperZorunluMetin(
      row.tedarikci_id,
      'dis_hizmet_fiyati.tedarikci_id',
    ),
    tedarikci_adi: typeof row.tedarikci_adi === 'string'
      ? row.tedarikci_adi
      : temperZorunluMetin(row.tedarikci, 'dis_hizmet_fiyati.tedarikci_adi'),
    birim_fiyat: temperZorunluSayi(
      row.stok_birim_fiyati ?? row.birim_fiyat,
      'dis_hizmet_fiyati.birim_fiyat',
    ),
    para_birimi: temperParaBiriminiDonustur(row.para_birimi),
    fiyat_birimi: temperZorunluMetin(
      row.fiyat_birimi,
      'dis_hizmet_fiyati.fiyat_birimi',
    ),
    varyant: temperVaryantiniDonustur(hamVaryant),
    vade_gunu: temperZorunluSayi(
      row.vade_gunu,
      'dis_hizmet_fiyati.vade_gunu',
    ),
    marka: typeof row.marka === 'string' ? row.marka : null,
    fiyat_tarihi: temperZorunluMetin(
      row.fiyat_tarihi,
      'dis_hizmet_fiyati.fiyat_tarihi',
    ),
    gecerlilik_baslangici: temperZorunluMetin(
      row.gecerlilik_baslangici
        ?? row.secim_baslangici
        ?? row.fiyat_tarihi,
      'dis_hizmet_fiyati.gecerlilik_baslangici',
    ),
    gecerlilik_bitisi: typeof (row.gecerlilik_bitisi ?? row.secim_bitisi) === 'string'
      ? String(row.gecerlilik_bitisi ?? row.secim_bitisi)
      : null,
  }
}

function temperCozumunuDonustur(value: unknown): TemperMaliyetCozumu | null {
  if (value == null) return null
  const row = kayit(value)
  const mod = temperModunuDonustur(row.mod)
  return {
    gecerli: temperZorunluBoolean(row.gecerli, 'urun_cozumu.gecerli'),
    mod,
    mod_surumu_id: typeof row.mod_surumu_id === 'string' ? row.mod_surumu_id : null,
    alan_m2: temperZorunluSayi(row.alan_m2, 'cozum.alan_m2'),
    birim_maliyet_try: temperNullableSayi(
      row.birim_maliyet_try,
      'cozum.birim_maliyet_try',
    ),
    toplam_maliyet: temperNullableSayi(
      row.toplam_maliyet,
      'cozum.toplam_maliyet',
    ),
    dis_hizmet_fiyati: row.dis_hizmet_fiyati == null
      ? null
      : temperKaynakFiyatiniDonustur(
        row.dis_hizmet_fiyati,
        String(
          kayit(row.dis_hizmet_fiyati).stok_id
            ?? kayit(row.dis_hizmet_fiyati).hizmet_stok_id
            ?? '',
        ),
      ),
    ic_uretim_kalemleri: dizi(row.ic_uretim_kalemleri).map(
      temperIcUretimKaleminiDonustur,
    ),
    hatalar: dizi(row.hatalar).map(kayit),
  }
}

function temperModSurumunuDonustur(value: unknown): TemperMaliyetModSurumu {
  const row = kayit(value)
  const mod = temperModunuDonustur(row.mod)
  if (mod == null) temperSozlesmeHatasi('mod_surumu.mod', row.mod)
  return {
    mod_surumu_id: temperZorunluMetin(
      row.mod_surumu_id,
      'mod_surumu.mod_surumu_id',
    ),
    mod,
    revision_no: temperZorunluSayi(
      row.revision_no,
      'mod_surumu.revision_no',
    ),
    gecerlilik_baslangici: temperZorunluMetin(
      row.gecerlilik_baslangici,
      'mod_surumu.gecerlilik_baslangici',
    ),
    gecerlilik_bitisi: typeof row.gecerlilik_bitisi === 'string'
      ? row.gecerlilik_bitisi
      : null,
    gerekce: temperZorunluMetin(row.gerekce, 'mod_surumu.gerekce'),
    dis_hizmet_stok_id: typeof row.dis_hizmet_stok_id === 'string'
      ? row.dis_hizmet_stok_id
      : null,
    ic_uretim_kalemleri: dizi(row.ic_uretim_kalemleri).map(
      temperIcUretimKaleminiDonustur,
    ),
  }
}

function temperUrunFiyatSeciminiDonustur(value: unknown): TemperUrunFiyatSecimi {
  const row = kayit(value)
  return {
    secim_id: temperZorunluMetin(row.secim_id, 'fiyat_secimi.secim_id'),
    urun_stok_id: typeof row.urun_stok_id === 'string' ? row.urun_stok_id : null,
    urun_stok_kodu: typeof row.urun_stok_kodu === 'string' ? row.urun_stok_kodu : null,
    fiyat_id: temperZorunluMetin(row.fiyat_id, 'fiyat_secimi.fiyat_id'),
    tedarikci_id: temperZorunluMetin(
      row.tedarikci_id,
      'fiyat_secimi.tedarikci_id',
    ),
    tedarikci_adi: temperZorunluMetin(
      row.tedarikci_adi,
      'fiyat_secimi.tedarikci_adi',
    ),
    birim_fiyat: temperZorunluSayi(
      row.birim_fiyat,
      'fiyat_secimi.birim_fiyat',
    ),
    para_birimi: temperParaBiriminiDonustur(row.para_birimi),
    fiyat_birimi: temperZorunluMetin(
      row.fiyat_birimi,
      'fiyat_secimi.fiyat_birimi',
    ),
    vade_gunu: temperZorunluSayi(row.vade_gunu, 'fiyat_secimi.vade_gunu'),
    marka: typeof row.marka === 'string' ? row.marka : null,
    gecerlilik_baslangici: temperZorunluMetin(
      row.gecerlilik_baslangici,
      'fiyat_secimi.gecerlilik_baslangici',
    ),
    gecerlilik_bitisi: typeof row.gecerlilik_bitisi === 'string'
      ? row.gecerlilik_bitisi
      : null,
    gerekce: temperZorunluMetin(row.gerekce, 'fiyat_secimi.gerekce'),
  }
}

function temperUrunCozumunuDonustur(value: unknown): TemperUrunCozumu {
  const row = kayit(value)
  return {
    stok_id: temperZorunluMetin(row.stok_id, 'urun_cozumu.stok_id'),
    stok_kodu: temperZorunluMetin(row.stok_kodu, 'urun_cozumu.stok_kodu'),
    stok_adi: temperZorunluMetin(row.stok_adi, 'urun_cozumu.stok_adi'),
    recete_surumu_id: temperZorunluMetin(
      row.recete_surumu_id,
      'urun_cozumu.recete_surumu_id',
    ),
    gecerli: temperZorunluBoolean(
      row.gecerli,
      'urun_cozumu.gecerli',
    ),
    mod: temperModunuDonustur(row.mod),
    birim_maliyet_try: temperNullableSayi(
      row.birim_maliyet_try,
      'urun_cozumu.birim_maliyet_try',
    ),
    hatalar: dizi(row.hatalar).map(kayit),
    cozum: temperCozumunuDonustur(row.cozum),
  }
}

export async function temperMaliyetPaneliniGetirV4(
  tarih = ticariBugun(),
): Promise<TemperMaliyetPaneli> {
  const { data, error } = await supabase.rpc('temper_maliyet_paneli_getir_v4', {
    p_tarih: tarih,
  })
  hataFirlat(error)
  const result = kayit(data)
  const hizmetStoguKaydi = result.hizmet_stogu == null
    ? null
    : kayit(result.hizmet_stogu)
  const hizmetStokId = hizmetStoguKaydi == null
    ? ''
    : temperZorunluMetin(hizmetStoguKaydi.stok_id, 'hizmet_stogu.stok_id')
  return {
    tarih: temperZorunluMetin(result.tarih, 'panel.tarih'),
    hazir: temperZorunluBoolean(result.hazir, 'panel.hazir'),
    hizmet_stogu: hizmetStoguKaydi == null
      ? null
      : {
        stok_id: hizmetStokId,
        stok_kodu: temperZorunluMetin(
          hizmetStoguKaydi.stok_kodu,
          'hizmet_stogu.stok_kodu',
        ),
        stok_adi: temperZorunluMetin(
          hizmetStoguKaydi.stok_adi,
          'hizmet_stogu.stok_adi',
        ),
        birim: temperZorunluMetin(
          hizmetStoguKaydi.birim,
          'hizmet_stogu.birim',
        ),
        aktif_fiyat: hizmetStoguKaydi.aktif_fiyat == null
          ? null
          : temperKaynakFiyatiniDonustur(hizmetStoguKaydi.aktif_fiyat, hizmetStokId),
        alternatifler: dizi(hizmetStoguKaydi.alternatifler).map((fiyat) => (
          temperKaynakFiyatiniDonustur(fiyat, hizmetStokId)
        )),
      },
    aktif_cozum: temperCozumunuDonustur(result.aktif_cozum),
    mod_surumleri: dizi(result.mod_surumleri).map(temperModSurumunuDonustur),
    urun_fiyat_secimleri: dizi(result.urun_fiyat_secimleri).map(
      temperUrunFiyatSeciminiDonustur,
    ),
    urun_cozumleri: dizi(result.urun_cozumleri).map(
      temperUrunCozumunuDonustur,
    ),
    eksikler: dizi(result.eksikler).map(kayit),
  }
}

export async function temperMaliyetModuKaydetV4(
  payload: TemperMaliyetModuPayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('temper_maliyet_modu_kaydet_v4', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}

export async function temperDisHizmetFiyatSecV4(
  payload: TemperDisHizmetFiyatSecimiPayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  return kaydetmeRpc('temper_dis_hizmet_fiyat_sec_v4', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
}
