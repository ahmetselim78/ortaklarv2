import { supabase } from '@/lib/supabase'
import { tumSatirlariGetir } from '@/lib/supabasePagination'
import { ticariBugun } from '@/lib/ticariFormat'
import type {
  CariAcilisBakiyesiPayload,
  CariBaglantiHazirlik,
  CariBaglantiTaslakPayload,
  CariBakiyeTutarsizligi,
  CariBakiyeYenidenOlusturmaSonucu,
  CariDetayOzeti,
  CariHareket,
  CariOzet,
  CariSecenegi,
  FiyatListesi,
  FiyatListesiSurumu,
  FiyatOnizlemesi,
  MaliyetRecetesi,
  MaliyetReceteSurumu,
  MaliyetTarifesi,
  MaliyetTarifeSurumu,
  MusteriTicariProfili,
  MusteriTicariProfilSurumu,
  ReadinessKontrolu,
  ReadinessRaporu,
  SurumDurumu,
  TahsilatPayload,
  Teklif,
  TeklifDetayi,
  TeklifKdvOzeti,
  TeklifRevizyonu,
  TicariMod,
  TicariModDurumu,
} from '@/types/ticari'
import type { Siparis, YeniSiparisForm } from '@/types/siparis'
import type { Stok } from '@/types/stok'

interface SupabaseErrorLike {
  message: string
  code?: string
}

function throwQueryError(error: SupabaseErrorLike | null) {
  if (!error) return
  const knownCode = Object.keys(TICARI_HATA_MESAJLARI).find((code) => error.message.includes(code))
  if (knownCode) throw new TicariRpcError(knownCode, { supabase_code: error.code ?? null })
  throw new Error(error.message)
}

async function tumunuGetir<T>(tablo: string): Promise<T[]> {
  return tumSatirlariGetir<T>(
    (from, to) => {
      const sorgu = supabase.from(tablo).select('*', { count: 'exact' })
      if (tablo === 'cari_bakiye_ozetleri') {
        return sorgu
          .order('cari_id', { ascending: true })
          .order('para_birimi', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
            data: T[] | null
            error: { message: string } | null
            count?: number | null
          }>
      }
      return sorgu
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
          data: T[] | null
          error: { message: string } | null
          count?: number | null
        }>
    },
    { baglam: tablo },
  )
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function metin(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function sayi(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

const TICARI_HATA_MESAJLARI: Record<string, string> = {
  FIYAT_ONIZLEME_SURESI_DOLDU: 'Fiyat önizlemesinin süresi doldu. Kesin fiyatı yeniden hesaplayın.',
  FIYAT_ONIZLEME_GIRDI_CAKISMASI: 'Sipariş bilgileri fiyat önizlemesinden sonra değişti. Kesin fiyatı yeniden hesaplayın.',
  FIYAT_ONIZLEME_CAKISMASI: 'Fiyatlandırma verileri önizlemeden sonra değişti. Yeni toplamları inceleyip tekrar onaylayın.',
  FIYAT_ONIZLEME_HASH_GECERSIZ: 'Fiyat önizlemesi doğrulanamadı. Kesin fiyatı yeniden hesaplayın.',
  FEATURE_MODE_ISLEME_KAPALI: 'Ticari mod bu işleme kapalı. Legacy sipariş akışına geri dönüş yapılmadı.',
  REVISION_CONFLICT: 'Sipariş başka bir kullanıcı tarafından değiştirildi. Güncel kaydı açıp tekrar deneyin.',
  AAL2_GEREKLI: 'Bu işlem için iki adımlı doğrulama gereklidir.',
  FIYATLI_SIPARIS_SILINEMEZ: 'Fiyatlandırılmış siparişler ve finansal kayıtları kalıcı olarak silinemez.',
  TEKLIF_DURUM_GECISI_GECERSIZ: 'Teklif bu duruma geçirilemez. Güncel durumu yenileyip tekrar deneyin.',
  TEKLIF_MUSTERISI_DEGISTIRILEMEZ: 'Mevcut bir teklifin müşterisi değiştirilemez. Yeni teklif oluşturun.',
  TEKLIF_BULUNAMADI: 'Teklif bulunamadı veya erişim yetkiniz yok.',
  SISTEM_HAREKETI_MANUEL_TERSLENEMEZ: 'Sipariş kaynaklı sistem cari hareketleri manuel terslenemez; ilgili sipariş revizyonu veya iptali kullanılmalıdır.',
  TERS_KAYIT_YENIDEN_TERSLENEMEZ: 'Bir ters kayıt yeniden terslenemez.',
  CARI_HAREKETI_ZATEN_TERSLENMIS: 'Bu cari hareket daha önce terslenmiş.',
  TAHSILAT_PARA_BIRIMI_SIPARISLE_ESLESMIYOR: 'Tahsilat para birimi bağlı siparişin para birimiyle aynı olmalıdır.',
  IDEMPOTENCY_PAYLOAD_CONFLICT: 'Aynı işlem anahtarı farklı içerikle kullanıldı. İşlemi güncelleyip yeni anahtarla tekrar deneyin.',
  IDEMPOTENCY_ISLEM_DEVAM_EDIYOR: 'Aynı işlem halen devam ediyor. Kısa süre sonra tekrar deneyin.',
  SIPARIS_ZATEN_IPTAL: 'Sipariş daha önce iptal edilmiş.',
  TICARI_MUDAHALE_GEREKCESI_GEREKLI: 'İskonto, ücretsiz ekstra, override veya düşük marj için gerekçe zorunludur.',
  GELECEK_TARIHLI_SURUM_YAYINLANAMAZ: 'Gelecek başlangıç tarihli sürüm bugün yayınlanamaz.',
  READINESS_KRITIK_EKSIK: 'Kritik readiness eksikleri tamamlanmadan ticari mod aktifleştirilemez.',
  BAGLANTI_GIRDISI_GECERSIZ: 'Bağlantı ödeme veya fiyat bilgileri eksik.',
  BAGLANTI_BULUNAMADI: 'Bağlantı bulunamadı veya erişim yetkiniz yok.',
  BAGLANTI_ONAY_YETKISI_GEREKLI: 'Bağlantı onayı için fiyat yönetimi ve finans yetkisi gerekir.',
  BAGLANTI_ACIK_DONEM_FIYATI_EKSIK: 'Açık dönemdeki ürünlerden en az birinin yeni bağlantı fiyatı eksik.',
  EKSIK_MUSTERI_TICARI_PROFILI: 'Bu cari için yayımlanmış ticari profil bulunamadı.',
}

export class TicariRpcError extends Error {
  readonly kod: string
  readonly detay: Record<string, unknown> | null

  constructor(kod: string, detay: Record<string, unknown> | null = null) {
    super(TICARI_HATA_MESAJLARI[kod] ?? kod.replaceAll('_', ' '))
    this.name = 'TicariRpcError'
    this.kod = kod
    this.detay = detay
  }
}

function rpcSonucunuDogrula(value: unknown): Record<string, unknown> {
  const sonuc = record(value)
  const hataKodu = metin(sonuc.hata_kodu)
  if (hataKodu || sonuc.gecerli === false || sonuc.basarili === false) {
    throw new TicariRpcError(hataKodu || 'TICARI_ISLEM_BASARISIZ', sonuc)
  }
  return sonuc
}

function readinessRaporunaDonustur(value: unknown): ReadinessRaporu {
  const kaynak = record(Array.isArray(value) ? value[0] : value)
  const hamKontroller = Array.isArray(kaynak.kontroller) ? kaynak.kontroller : []
  const kontroller: ReadinessKontrolu[] = hamKontroller.map((ham, index) => {
    const kontrol = record(ham)
    const basarili = kontrol.durum === true
    const kritik = kontrol.kritik !== false
    const hamDurum = metin(kontrol.durum, basarili ? 'basarili' : kritik ? 'kritik' : 'uyari')
    const detay = record(kontrol.sonuc_detayi)
    const uiDurum: ReadinessKontrolu['durum'] = hamDurum === 'basarili'
      ? 'basarili'
      : kritik ? 'kritik' : 'uyari'
    return {
      kod: metin(kontrol.kontrol_kodu, metin(kontrol.kod, `kontrol_${index + 1}`)),
      baslik: metin(
        kontrol.aciklama,
        metin(kontrol.baslik, metin(kontrol.kontrol_kodu, metin(kontrol.kod, 'Readiness kontrolü'))),
      ),
      kontrol_turu: kontrol.kontrol_turu === 'manuel' ? 'manuel' : 'dinamik',
      durum: uiDurum,
      mesaj: metin(kontrol.mesaj, metin(detay.mesaj)) || null,
      eksik_sayisi: sayi(kontrol.eksik_sayisi) ?? sayi(detay.eksik_sayisi),
      revision_no: sayi(kontrol.revision_no),
      onaylayan_kullanici_id: metin(kontrol.onaylayan_kullanici_id) || null,
      onay_gerekcesi: metin(kontrol.onay_gerekcesi) || null,
    }
  })

  const hamMod = metin(kaynak.mod)
  const mod: TicariMod | null = ['hazirlik', 'golge', 'aktif', 'bakim'].includes(hamMod)
    ? hamMod as TicariMod
    : null

  return {
    uygun: kaynak.hazir === true || kaynak.uygun === true,
    mod,
    kontroller,
    olusturulma_tarihi: metin(kaynak.kontrol_tarihi, metin(kaynak.olusturulma_tarihi)) || null,
  }
}

export async function ticariModDurumunuGetir(): Promise<TicariModDurumu | null> {
  const { data, error } = await supabase.rpc('ticari_modul_modu_getir')
  throwQueryError(error)
  return data as unknown as TicariModDurumu | null
}

export function siparisTicariBelgesineDonustur(form: YeniSiparisForm): Record<string, unknown> {
  const numericOrNull = (value: number | string | undefined) =>
    value === '' || value == null ? null : Number(value)
  return {
    belge_turu: 'siparis',
    cari_id: form.cari_id,
    tarih: form.tarih,
    para_birimi: form.para_birimi || null,
    teslim_tarihi: form.teslim_tarihi || null,
    notlar: form.notlar || null,
    alt_musteri: form.alt_musteri || null,
    harici_siparis_no: form.harici_siparis_no || null,
    teslimat_tipi: form.teslimat_tipi || 'teslim_alacak',
    kaynak: form.kaynak || 'manuel',
    ticari_mudahale_gerekcesi: form.ticari_mudahale_gerekcesi || null,
    dusuk_marj_gerekcesi: form.dusuk_marj_gerekcesi || null,
    belge_iskonto_yuzdesi: numericOrNull(form.belge_iskonto_yuzdesi),
    belge_iskonto_tutari: numericOrNull(form.belge_iskonto_tutari),
    manuel_fiyat_farki: numericOrNull(form.manuel_fiyat_farki),
    manuel_yuvarlama_farki: numericOrNull(form.manuel_yuvarlama_farki),
    nakliye_satis_override: numericOrNull(form.nakliye_satis_override),
    nakliye_maliyet_override: numericOrNull(form.nakliye_maliyet_override),
    vade_gunu: numericOrNull(form.vade_gunu),
    satirlar: form.camlar.map((cam) => ({
      detay_id: cam.detay_id || null,
      stok_id: cam.stok_id,
      genislik_mm: Number(cam.genislik_mm),
      yukseklik_mm: Number(cam.yukseklik_mm),
      adet: Number(cam.adet),
      cita_stok_id: cam.cita_stok_id || null,
      kenar_islemi: cam.kenar_islemi || null,
      notlar: cam.notlar || null,
      poz: cam.poz || null,
      menfez_cap_mm: cam.menfez_cap_mm === '' || cam.menfez_cap_mm == null
        ? null
        : Number(cam.menfez_cap_mm),
      kucuk_cam: cam.kucuk_cam === true,
      satir_iskonto_yuzdesi: numericOrNull(cam.satir_iskonto_yuzdesi),
      satir_iskonto_tutari: numericOrNull(cam.satir_iskonto_tutari),
      kenar_islemi_ucretsiz: cam.kenar_islemi_ucretsiz === true,
      menfez_ucretsiz: cam.menfez_ucretsiz === true,
      kucuk_cam_ucretsiz: cam.kucuk_cam_ucretsiz === true,
    })),
  }
}

export function siparisRevizyonBelgesineDonustur(
  form: YeniSiparisForm,
  siparis: Pick<Siparis, 'id' | 'revision_no' | 'para_birimi'>,
): Record<string, unknown> {
  return {
    ...siparisTicariBelgesineDonustur(form),
    belge_id: siparis.id,
    beklenen_revision_no: siparis.revision_no ?? null,
    para_birimi: siparis.para_birimi ?? form.para_birimi ?? null,
  }
}

export function teklifTicariBelgesineDonustur(
  form: YeniSiparisForm,
  teklif?: { id: string; revisionNo: number } | null,
): Record<string, unknown> {
  return {
    ...siparisTicariBelgesineDonustur(form),
    belge_turu: 'teklif',
    belge_id: teklif?.id ?? null,
    beklenen_revision_no: teklif?.revisionNo ?? null,
  }
}

export async function fiyatOnizle(belge: Record<string, unknown>): Promise<FiyatOnizlemesi> {
  const { data, error } = await supabase.rpc('fiyat_onizle', { p_belge: belge })
  throwQueryError(error)
  const sonuc = record(data)
  if (!metin(sonuc.onizleme_id) || !metin(record(sonuc.sonuc).sonuc_hash)) {
    throw new TicariRpcError('FIYAT_ONIZLEME_GECERSIZ', sonuc)
  }
  return data as unknown as FiyatOnizlemesi
}

export async function fiyatliSiparisOlustur(
  belge: Record<string, unknown>,
  onizleme: FiyatOnizlemesi,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('siparis_fiyatli_olustur', {
    p_belge: belge,
    p_onizleme_id: onizleme.onizleme_id,
    p_onizleme_hash: onizleme.sonuc_hash,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

export async function fiyatliSiparisIptal(
  siparisId: string,
  beklenenRevisionNo: number,
  gerekce: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('siparis_fiyatli_iptal', {
    p_siparis_id: siparisId,
    p_beklenen_revision_no: beklenenRevisionNo,
    p_gerekce: gerekce,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

export async function fiyatliSiparisGuncelle(
  siparisId: string,
  beklenenRevisionNo: number,
  revizyonTuru: 'teknik' | 'ticari',
  belge: Record<string, unknown>,
  onizleme: FiyatOnizlemesi,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('siparis_fiyatli_guncelle', {
    p_siparis_id: siparisId,
    p_beklenen_revision_no: beklenenRevisionNo,
    p_revizyon_turu: revizyonTuru,
    p_belge: belge,
    p_onizleme_id: onizleme.onizleme_id,
    p_onizleme_hash: onizleme.sonuc_hash,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

interface SiparisRevizyonSnapshotSatiri {
  girdi_satir_no: number
  siparis_detay_id: string
  stok_id: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
}

export interface SiparisRevizyonHazirligi {
  form: YeniSiparisForm
  fiyatRevizyonNo: number
}

export async function siparisRevizyonHazirliginiGetir(
  siparis: Siparis,
): Promise<SiparisRevizyonHazirligi> {
  if (!siparis.fiyatlandirildi || !siparis.aktif_fiyat_revizyon_id) {
    throw new TicariRpcError('FIYATLI_SIPARIS_BULUNAMADI')
  }

  const [revizyonSonucu, satirSonucu] = await Promise.all([
    supabase
      .from('siparis_fiyat_revizyonlari')
      .select('id, revizyon_no, ticari_girdi_snapshot')
      .eq('id', siparis.aktif_fiyat_revizyon_id)
      .single(),
    supabase
      .from('siparis_detay_fiyat_snapshotlari')
      .select('girdi_satir_no, siparis_detay_id, stok_id, genislik_mm, yukseklik_mm, adet')
      .eq('siparis_fiyat_revizyonu_id', siparis.aktif_fiyat_revizyon_id)
      .order('girdi_satir_no', { ascending: true }),
  ])
  throwQueryError(revizyonSonucu.error)
  throwQueryError(satirSonucu.error)

  const revizyon = record(revizyonSonucu.data)
  const girdi = record(revizyon.ticari_girdi_snapshot)
  const hamSatirlar = Array.isArray(girdi.satirlar) ? girdi.satirlar : []
  const snapshotSatirlari = (satirSonucu.data ?? []) as unknown as SiparisRevizyonSnapshotSatiri[]
  if (snapshotSatirlari.length === 0) {
    throw new TicariRpcError('FIYATLI_SIPARIS_DETAYI_BULUNAMADI')
  }

  const numericInput = (value: unknown): number | '' => sayi(value) ?? ''
  const camlar = snapshotSatirlari.map((snapshot, index) => {
    const kaynak = record(hamSatirlar[snapshot.girdi_satir_no - 1] ?? hamSatirlar[index])
    return {
      detay_id: snapshot.siparis_detay_id,
      stok_id: snapshot.stok_id,
      genislik_mm: snapshot.genislik_mm,
      yukseklik_mm: snapshot.yukseklik_mm,
      adet: snapshot.adet,
      cita_stok_id: metin(kaynak.cita_stok_id),
      kenar_islemi: metin(kaynak.kenar_islemi),
      notlar: metin(kaynak.notlar),
      poz: metin(kaynak.poz),
      menfez_cap_mm: numericInput(kaynak.menfez_cap_mm),
      kucuk_cam: kaynak.kucuk_cam === true,
      satir_iskonto_yuzdesi: numericInput(kaynak.satir_iskonto_yuzdesi),
      satir_iskonto_tutari: numericInput(kaynak.satir_iskonto_tutari),
      kenar_islemi_ucretsiz: kaynak.kenar_islemi_ucretsiz === true,
      menfez_ucretsiz: kaynak.menfez_ucretsiz === true,
      kucuk_cam_ucretsiz: kaynak.kucuk_cam_ucretsiz === true,
    }
  })

  return {
    fiyatRevizyonNo: sayi(revizyon.revizyon_no) ?? 1,
    form: {
      cari_id: siparis.cari_id,
      tarih: siparis.tarih,
      para_birimi: siparis.para_birimi ?? undefined,
      teslim_tarihi: metin(girdi.teslim_tarihi, siparis.teslim_tarihi ?? ''),
      notlar: metin(girdi.notlar, siparis.notlar ?? ''),
      alt_musteri: metin(girdi.alt_musteri, siparis.alt_musteri ?? ''),
      harici_siparis_no: metin(girdi.harici_siparis_no, siparis.harici_siparis_no ?? ''),
      teslimat_tipi: metin(girdi.teslimat_tipi, siparis.teslimat_tipi ?? 'teslim_alacak'),
      kaynak: siparis.kaynak ?? 'manuel',
      ticari_mudahale_gerekcesi: '',
      dusuk_marj_gerekcesi: metin(girdi.dusuk_marj_gerekcesi),
      belge_iskonto_yuzdesi: numericInput(girdi.belge_iskonto_yuzdesi),
      belge_iskonto_tutari: numericInput(girdi.belge_iskonto_tutari),
      manuel_fiyat_farki: numericInput(girdi.manuel_fiyat_farki),
      manuel_yuvarlama_farki: numericInput(girdi.manuel_yuvarlama_farki),
      nakliye_satis_override: numericInput(girdi.nakliye_satis_override),
      nakliye_maliyet_override: numericInput(girdi.nakliye_maliyet_override),
      vade_gunu: numericInput(girdi.vade_gunu),
      camlar,
    },
  }
}

export async function fiyatYonetiminiGetir() {
  const [listeler, surumler] = await Promise.all([
    tumunuGetir<FiyatListesi>('fiyat_listeleri'),
    tumunuGetir<FiyatListesiSurumu>('fiyat_listesi_surmleri'),
  ])
  return { listeler, surumler }
}

export async function maliyetYonetiminiGetir() {
  const [tarifeler, tarifeSurumleri, receteler, receteSurumleri] = await Promise.all([
    tumunuGetir<MaliyetTarifesi>('maliyet_tarifeleri'),
    tumunuGetir<MaliyetTarifeSurumu>('maliyet_tarife_surmleri'),
    tumunuGetir<MaliyetRecetesi>('urun_maliyet_receteleri'),
    tumunuGetir<MaliyetReceteSurumu>('urun_maliyet_recete_surmleri'),
  ])
  return { tarifeler, tarifeSurumleri, receteler, receteSurumleri }
}

export async function musteriProfilleriniGetir() {
  const [profiller, surumler, cariler] = await Promise.all([
    tumunuGetir<MusteriTicariProfili>('musteri_ticari_profilleri'),
    tumunuGetir<MusteriTicariProfilSurumu>('musteri_ticari_profil_surmleri'),
    tumunuGetir<CariSecenegi>('cari'),
  ])
  return { profiller, surumler, cariler }
}

export async function cariPanelOzetleriniGetir() {
  return tumunuGetir<CariOzet>('cari_bakiye_ozetleri')
}

export async function cariPanelProfilleriniGetir() {
  const [profiller, surumler] = await Promise.all([
    tumunuGetir<MusteriTicariProfili>('musteri_ticari_profilleri'),
    tumunuGetir<MusteriTicariProfilSurumu>('musteri_ticari_profil_surmleri'),
  ])
  return { profiller, surumler }
}

export async function vergiVadeKurYonetiminiGetir() {
  const [kdvGruplari, kdvSurumleri, vadeProfilleri, vadeSurumleri, kurlar] =
    await Promise.all([
      tumunuGetir<{ id: string; kod: string; ad: string; aktif: boolean }>('kdv_gruplari'),
      tumunuGetir<{
        id: string
        kdv_grubu_id: string
        surum_no: number
        durum: SurumDurumu
        kdv_orani: number
        gecerli_baslangic: string
        gecerli_bitis: string | null
        yayinlanma_tarihi: string | null
        revision_no: number
        created_at: string
      }>('kdv_grup_surmleri'),
      tumunuGetir<{ id: string; kod: string; ad: string; aktif: boolean }>('vade_profilleri'),
      tumunuGetir<{
        id: string
        vade_profili_id: string
        surum_no: number
        durum: SurumDurumu
        gecerli_baslangic: string
        gecerli_bitis: string | null
        yayinlanma_tarihi: string | null
        revision_no: number
        created_at: string
      }>('vade_profili_surmleri'),
      tumunuGetir<{
        id: string
        kur_tarihi: string
        para_birimi: 'USD' | 'EUR'
        kur_tipi: 'doviz_alis' | 'doviz_satis' | 'efektif_alis' | 'efektif_satis'
        try_karsiligi: number
        tcmb_kaynak_tarihi: string | null
        kaynak: 'otomatik' | 'manuel'
        manuel_gerekce: string | null
        revision_no: number
        aktif: boolean
        created_at: string
      }>('doviz_kurlari'),
    ])
  return { kdvGruplari, kdvSurumleri, vadeProfilleri, vadeSurumleri, kurlar }
}

export async function cariHesabiniGetir() {
  const [ozetler, hareketler, cariler] = await Promise.all([
    tumunuGetir<CariOzet>('cari_bakiye_ozetleri'),
    tumunuGetir<CariHareket>('cari_hareketleri'),
    tumunuGetir<CariSecenegi>('cari'),
  ])
  return { ozetler, hareketler, cariler }
}

export async function teklifleriGetir() {
  const [hamTeklifler, hamRevizyonlar, cariler, stoklar] = await Promise.all([
    tumunuGetir<Omit<Teklif, 'para_birimi'>>('teklifler'),
    tumunuGetir<TeklifRevizyonu>('teklif_revizyonlari'),
    tumunuGetir<CariSecenegi>('cari'),
    tumunuGetir<Stok>('stok'),
  ])
  const revizyonlar = hamRevizyonlar.map((revizyon) => ({
    ...revizyon,
    revizyon_kodu: revizyon.revizyon_kodu || `R${String(revizyon.revizyon_no).padStart(2, '0')}`,
  }))
  const teklifler = hamTeklifler.map((teklif) => {
    const aktifRevizyon = revizyonlar.find((revizyon) => revizyon.id === teklif.aktif_revizyon_id)
      ?? revizyonlar
        .filter((revizyon) => revizyon.teklif_id === teklif.id)
        .sort((a, b) => b.revizyon_no - a.revizyon_no)[0]
    return {
      ...teklif,
      para_birimi: aktifRevizyon?.para_birimi ?? null,
    } satisfies Teklif
  })
  return {
    teklifler,
    revizyonlar,
    cariler,
    stoklar: stoklar.filter((stok) => stok.aktif && stok.kategori === 'cam'),
  }
}

export async function teklifRevizyonDetayiniGetir(revizyonId: string) {
  const [detaySonucu, kdvSonucu] = await Promise.all([
    supabase
      .from('teklif_detaylari')
      .select('*, stok:stok!stok_id(kod, ad)')
      .eq('teklif_revizyonu_id', revizyonId)
      .order('satir_no', { ascending: true }),
    supabase
      .from('teklif_kdv_ozetleri')
      .select('*, kdv_grubu:kdv_gruplari!kdv_grubu_id(kod, ad)')
      .eq('teklif_revizyonu_id', revizyonId)
      .order('kdv_orani', { ascending: true }),
  ])
  throwQueryError(detaySonucu.error)
  throwQueryError(kdvSonucu.error)
  return {
    detaylar: (detaySonucu.data ?? []) as unknown as TeklifDetayi[],
    kdvOzetleri: (kdvSonucu.data ?? []) as unknown as TeklifKdvOzeti[],
  }
}

export async function readinessRaporunuGetir() {
  const { data, error } = await supabase.rpc('ticari_modul_readiness')
  throwQueryError(error)
  return readinessRaporunaDonustur(data)
}

export interface TicariEksikKayitRaporSatiri {
  kaynak_turu: string
  kaynak_id: string
  kod: string | null
  ad: string | null
  detay: Record<string, unknown>
}

export type TicariEksikKayitRaporTuru = 'satis_fiyati' | 'maliyet' | 'recete' | 'profil'

export async function ticariEksikKayitRaporunuGetir(
  raporTuru: TicariEksikKayitRaporTuru,
  tarih = ticariBugun(),
): Promise<TicariEksikKayitRaporSatiri[]> {
  const { data, error } = await supabase.rpc('ticari_eksik_kayit_raporu', {
    p_rapor_turu: raporTuru,
    p_tarih: tarih,
  })
  throwQueryError(error)
  return (data ?? []) as unknown as TicariEksikKayitRaporSatiri[]
}

export async function readinessKontroluOnayla(
  kontrolKodu: string,
  beklenenRevisionNo: number,
  gerekce: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('ticari_readiness_kontrolu_onayla', {
    p_kontrol_kodu: kontrolKodu,
    p_beklenen_revision_no: beklenenRevisionNo,
    p_gerekce: gerekce,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

export async function ticariModuDegistir(
  yeniMod: TicariMod,
  beklenenRevisionNo: number,
  gerekce: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('ticari_modul_modu_degistir', {
    p_yeni_mod: yeniMod,
    p_beklenen_revision_no: beklenenRevisionNo,
    p_gerekce: gerekce,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

export function yeniIdempotencyAnahtari() {
  return crypto.randomUUID()
}

export async function tahsilatKaydet(payload: TahsilatPayload, idempotencyKey: string) {
  const { data, error } = await supabase.rpc('tahsilat_kaydet', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return data
}

export async function cariBaglantiHazirliginiGetir(
  cariId: string,
): Promise<CariBaglantiHazirlik> {
  const { data, error } = await supabase.rpc('cari_baglanti_hazirlik_getir', {
    p_cari_id: cariId,
  })
  throwQueryError(error)
  return record(data) as unknown as CariBaglantiHazirlik
}

export async function cariBaglantiTaslakKaydet(payload: CariBaglantiTaslakPayload) {
  const { data, error } = await supabase.rpc('cari_baglanti_taslak_kaydet', {
    p_payload: payload,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data) as {
    basarili: true
    baglanti_id: string
    baglanti_no: string
    fiyat_listesi_surumu_id: string
    revision_no: number
  }
}

export async function cariBaglantiAcikDonemFarkiniGetir(baglantiId: string) {
  const { data, error } = await supabase.rpc('cari_baglanti_acik_donem_farki_getir', {
    p_baglanti_id: baglantiId,
  })
  throwQueryError(error)
  return record(data) as {
    etkilenen_satir_sayisi: number
    etkilenen_m2: number
    fiyat_farki: number
    urun_gruplari: Array<{
      stok_id: string
      stok_kodu: string
      stok_adi: string
      acik_m2: number
      onceki_birim_fiyat: number
      yeni_birim_fiyat: number
      fark_tutari: number
    }>
  }
}

export async function cariBaglantiOnayla(
  baglantiId: string,
  beklenenRevisionNo: number,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('cari_baglanti_onayla', {
    p_baglanti_id: baglantiId,
    p_beklenen_revision_no: beklenenRevisionNo,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

export async function cariDetayOzetiniGetir(
  cariId: string,
  sayfa = 1,
  sayfaBoyutu = 25,
): Promise<CariDetayOzeti> {
  const { data, error } = await supabase.rpc('cari_detay_ozeti_getir', {
    p_cari_id: cariId,
    p_sayfa: sayfa,
    p_sayfa_boyutu: sayfaBoyutu,
  })
  throwQueryError(error)
  return record(data) as unknown as CariDetayOzeti
}

export async function cariAcilisBakiyesiKaydet(
  payload: CariAcilisBakiyesiPayload,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('cari_acilis_bakiyesi_kaydet', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

export async function cariBakiyeTutarlilikKontrolu(): Promise<CariBakiyeTutarsizligi[]> {
  const { data, error } = await supabase.rpc('cari_bakiye_tutarlilik_kontrolu')
  throwQueryError(error)
  return (data ?? []) as unknown as CariBakiyeTutarsizligi[]
}

export async function cariBakiyeOzetleriniYenidenOlustur(): Promise<CariBakiyeYenidenOlusturmaSonucu> {
  const { data, error } = await supabase.rpc('cari_bakiye_ozetlerini_yeniden_olustur')
  throwQueryError(error)
  return rpcSonucunuDogrula(data) as unknown as CariBakiyeYenidenOlusturmaSonucu
}

export async function cariHareketTersle(hareketId: string, gerekce: string, idempotencyKey: string) {
  const { data, error } = await supabase.rpc('cari_hareket_tersle', {
    p_hareket_id: hareketId,
    p_gerekce: gerekce,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return data
}

type YayinlamaRpc =
  | 'fiyat_listesi_surumu_yayinla'
  | 'maliyet_tarife_surumu_yayinla'
  | 'maliyet_recete_surumu_yayinla'
  | 'musteri_ticari_profil_surumu_yayinla'
  | 'kdv_grup_surumu_yayinla'
  | 'vade_profili_surumu_yayinla'

export async function surumYayinla(
  rpc: YayinlamaRpc,
  surumId: string,
  revisionNo: number,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc(rpc, {
    p_surum_id: surumId,
    p_beklenen_revision_no: revisionNo,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return data
}

type KopyalamaRpc =
  | 'fiyat_listesi_surumu_kopyala'
  | 'maliyet_tarife_surumu_kopyala'
  | 'maliyet_recete_surumu_kopyala'
  | 'kdv_grup_surumu_kopyala'
  | 'vade_profili_surumu_kopyala'
  | 'musteri_ticari_profil_surumu_kopyala'

export async function surumKopyala(rpc: KopyalamaRpc, surumId: string) {
  const { data, error } = await supabase.rpc(rpc, {
    p_kaynak_surum_id: surumId,
  })
  throwQueryError(error)
  return data
}

export function fiyatListesiSurumuKopyala(surumId: string) {
  return surumKopyala('fiyat_listesi_surumu_kopyala', surumId)
}

export type TicariTaslakTuru = 'fiyat' | 'maliyet' | 'recete' | 'vade'

const ticariTaslakTablolari: Record<
  TicariTaslakTuru,
  Record<string, { tablo: string; yabanciAnahtar: string }>
> = {
  fiyat: {
    urun: { tablo: 'fiyat_listesi_urun_kalemleri', yabanciAnahtar: 'fiyat_listesi_surumu_id' },
    kenar: { tablo: 'fiyat_listesi_kenar_islem_kalemleri', yabanciAnahtar: 'fiyat_listesi_surumu_id' },
    menfez: { tablo: 'fiyat_listesi_menfez_kalemleri', yabanciAnahtar: 'fiyat_listesi_surumu_id' },
    kucuk_cam: { tablo: 'fiyat_listesi_kucuk_cam_kurallari', yabanciAnahtar: 'fiyat_listesi_surumu_id' },
    nakliye: { tablo: 'fiyat_listesi_nakliye_kurallari', yabanciAnahtar: 'fiyat_listesi_surumu_id' },
    diger: { tablo: 'fiyat_listesi_diger_kalemleri', yabanciAnahtar: 'fiyat_listesi_surumu_id' },
  },
  maliyet: {
    stok: { tablo: 'maliyet_stok_kalemleri', yabanciAnahtar: 'maliyet_tarife_surumu_id' },
    islem: { tablo: 'maliyet_islem_kalemleri', yabanciAnahtar: 'maliyet_tarife_surumu_id' },
    nakliye: { tablo: 'maliyet_nakliye_kurallari', yabanciAnahtar: 'maliyet_tarife_surumu_id' },
    genel_gider: { tablo: 'maliyet_genel_gider_kalemleri', yabanciAnahtar: 'maliyet_tarife_surumu_id' },
  },
  recete: {
    kalemler: { tablo: 'urun_maliyet_recete_kalemleri', yabanciAnahtar: 'urun_maliyet_recete_surumu_id' },
  },
  vade: {
    kademeler: { tablo: 'vade_profili_kademeleri', yabanciAnahtar: 'vade_profili_surumu_id' },
  },
}

async function filtreliTumunuGetir(
  tablo: string,
  yabanciAnahtar: string,
  surumId: string,
): Promise<Array<Record<string, unknown>>> {
  return tumSatirlariGetir<Record<string, unknown>>(
    (from, to) => supabase
      .from(tablo)
      .select('*', { count: 'exact' })
      .eq(yabanciAnahtar, surumId)
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{
        data: Array<Record<string, unknown>> | null
        error: { message: string } | null
        count?: number | null
      }>,
    { baglam: `${tablo}:${surumId}` },
  )
}

export async function ticariTaslakKalemleriniGetir(
  tur: TicariTaslakTuru,
  surumId: string,
) {
  const tabloTanimlari = ticariTaslakTablolari[tur]
  const entries = await Promise.all(
    Object.entries(tabloTanimlari).map(async ([anahtar, tanim]) => [
      anahtar,
      (await filtreliTumunuGetir(tanim.tablo, tanim.yabanciAnahtar, surumId))
        .map((satir) => {
          const temiz = { ...satir }
          delete temiz.id
          delete temiz[tanim.yabanciAnahtar]
          delete temiz.olusturan_kullanici_id
          delete temiz.created_at
          return temiz
        }),
    ] as const),
  )
  return Object.fromEntries(entries) as Record<string, Array<Record<string, unknown>>>
}

export async function ticariExcelReferanslariniGetir() {
  const [stoklar, kdvGruplari] = await Promise.all([
    tumunuGetir<{ id: string; kod: string; ad: string }>('stok'),
    tumunuGetir<{ id: string; kod: string; ad: string }>('kdv_gruplari'),
  ])
  return { stoklar, kdvGruplari }
}

export async function ticariTaslakOlusturmaReferanslariniGetir() {
  const [stoklar, kdvGruplari, cariler, fiyatListeleri, vadeProfilleri, vadeSurumleri] =
    await Promise.all([
      tumunuGetir<{ id: string; kod: string; ad: string; aktif: boolean }>('stok'),
      tumunuGetir<{ id: string; kod: string; ad: string; aktif: boolean }>('kdv_gruplari'),
      tumunuGetir<CariSecenegi>('cari'),
      tumunuGetir<FiyatListesi>('fiyat_listeleri'),
      tumunuGetir<{ id: string; kod: string; ad: string; aktif: boolean }>('vade_profilleri'),
      tumunuGetir<{
        id: string
        vade_profili_id: string
        surum_no: number
        durum: SurumDurumu
      }>('vade_profili_surmleri'),
    ])
  return { stoklar, kdvGruplari, cariler, fiyatListeleri, vadeProfilleri, vadeSurumleri }
}

export async function ticariTaslakKalemleriniTopluDegistir(
  tur: TicariTaslakTuru,
  surumId: string,
  beklenenRevisionNo: number,
  kalemler: Record<string, Array<Record<string, unknown>>>,
) {
  const { data, error } = await supabase.rpc('ticari_taslak_kalemlerini_toplu_degistir', {
    p_surum_turu: tur,
    p_surum_id: surumId,
    p_beklenen_revision_no: beklenenRevisionNo,
    p_kalemler: kalemler,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

export type TicariTaslakAnaKayitTuru =
  | 'fiyat'
  | 'maliyet'
  | 'recete'
  | 'kdv'
  | 'vade'
  | 'profil'

export async function ticariTaslakAnaKaydiOlustur(
  tur: TicariTaslakAnaKayitTuru,
  payload: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc('ticari_taslak_ana_kaydi_olustur', {
    p_kayit_turu: tur,
    p_payload: payload,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

export async function kdvTaslakOraniniGuncelle(
  surumId: string,
  beklenenRevisionNo: number,
  kdvOrani: number,
) {
  const { data, error } = await supabase
    .from('kdv_grup_surmleri')
    .update({ kdv_orani: kdvOrani })
    .eq('id', surumId)
    .eq('durum', 'taslak')
    .eq('revision_no', beklenenRevisionNo)
    .select('*')
    .maybeSingle()
  throwQueryError(error)
  if (!data) throw new TicariRpcError('REVISION_CONFLICT')
  return data
}

export async function musteriTicariProfilTaslaginiGuncelle(
  surumId: string,
  beklenenRevisionNo: number,
  payload: Record<string, unknown>,
) {
  const izinliAlanlar = [
    'gecerli_baslangic',
    'gecerli_bitis',
    'ana_fiyat_listesi_id',
    'musteri_fiyat_listesi_id',
    'varsayilan_para_birimi',
    'varsayilan_kdv_grubu_id',
    'varsayilan_vade_gunu',
    'vade_profili_id',
    'vade_profili_surumu_id',
    'nakliye_hesaplama_tipi',
    'sabit_nakliye_satis_tutari',
    'sabit_nakliye_maliyet_tutari',
    'm2_nakliye_satis_tutari',
    'm2_nakliye_maliyet_tutari',
    'minimum_marj_yuzdesi_override',
    'varsayilan_belge_notu',
    'teklif_gecerlilik_gunu',
  ] as const
  const guncelleme = Object.fromEntries(
    izinliAlanlar.map((alan) => [alan, payload[alan] === '' ? null : payload[alan]]),
  )
  const { data, error } = await supabase
    .from('musteri_ticari_profil_surmleri')
    .update(guncelleme)
    .eq('id', surumId)
    .eq('durum', 'taslak')
    .eq('revision_no', beklenenRevisionNo)
    .select('*')
    .maybeSingle()
  throwQueryError(error)
  if (!data) throw new TicariRpcError('REVISION_CONFLICT')
  return data
}

export async function manuelDovizKuruKaydet(
  kurTarihi: string,
  paraBirimi: 'USD' | 'EUR',
  kurTipi: 'doviz_alis' | 'doviz_satis' | 'efektif_alis' | 'efektif_satis',
  tryKarsiligi: number,
  gerekce: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('manuel_doviz_kuru_kaydet', {
    p_kur_tarihi: kurTarihi,
    p_para_birimi: paraBirimi,
    p_kur_tipi: kurTipi,
    p_try_karsiligi: tryKarsiligi,
    p_gerekce: gerekce,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

export interface TeklifRevizyonuOlusturGirdisi {
  teklifId: string | null
  beklenenRevisionNo: number | null
  belge: Record<string, unknown>
  onizlemeId: string
  onizlemeHash: string
  idempotencyKey: string
}

export async function teklifRevizyonuOlustur(girdi: TeklifRevizyonuOlusturGirdisi) {
  const { data, error } = await supabase.rpc('teklif_revizyonu_olustur', {
    p_teklif_id: girdi.teklifId,
    p_beklenen_revision_no: girdi.beklenenRevisionNo,
    p_belge: girdi.belge,
    p_onizleme_id: girdi.onizlemeId,
    p_onizleme_hash: girdi.onizlemeHash,
    p_idempotency_key: girdi.idempotencyKey,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}

export async function teklifDurumDegistir(
  teklifId: string,
  beklenenRevisionNo: number,
  yeniDurum: 'gonderildi' | 'kabul_edildi' | 'reddedildi',
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('teklif_durum_degistir', {
    p_teklif_id: teklifId,
    p_beklenen_revision_no: beklenenRevisionNo,
    p_yeni_durum: yeniDurum,
    p_idempotency_key: idempotencyKey,
  })
  throwQueryError(error)
  return rpcSonucunuDogrula(data)
}
