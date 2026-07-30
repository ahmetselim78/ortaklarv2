import { supabase } from '@/lib/supabase'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type {
  TedarikciFaturaPayload,
  TedarikciSiparisi,
  TedarikciSiparisiPayload,
  TedarikciStokBaglantiKatalogu,
  TedarikciStokBaglantisiPayload,
} from '@/types/tedarikci'

const HATA_MESAJLARI: Record<string, string> = {
  COSTING_READ_YETKISI_GEREKLI: 'Tedarikçi siparişlerini görüntüleme yetkiniz yok.',
  COSTING_CREATE_YETKISI_GEREKLI: 'Tedarikçi siparişi oluşturma yetkiniz yok.',
  COSTING_UPDATE_YETKISI_GEREKLI: 'Fatura veya ödeme bilgisi güncelleme yetkiniz yok.',
  AKTIF_TEDARIKCI_GEREKLI: 'Aktif bir tedarikçi seçin.',
  TEDARIKCI_PORTAL_MODELI_GEREKLI: 'Bu işlem yalnız sirküler ve portal modeliyle çalışan tedarikçiler içindir.',
  TEDARIKCI_SIPARIS_BILGILERI_GECERSIZ: 'Portal sipariş numarası, tarih ve vade bilgilerini kontrol edin.',
  PORTAL_SIPARIS_NO_ZATEN_VAR: 'Bu portal sipariş numarası daha önce kaydedilmiş.',
  FATURA_BILGILERI_GECERSIZ: 'Fatura numarası, tarihi ve tutarını kontrol edin.',
  FATURA_ZATEN_ISLENDI: 'Bu siparişe daha önce fatura işlenmiş.',
  TEDARIKCI_SIPARISI_BULUNAMADI: 'Tedarikçi siparişi bulunamadı.',
  TEDARIKCI_SIPARISI_REVIZYON_CAKISMASI: 'Sipariş başka bir kullanıcı tarafından güncellendi. Listeyi yenileyip tekrar deneyin.',
  ODEME_ICIN_FATURA_GEREKLI: 'Ödendi işaretlemek için önce faturayı kaydedin.',
  SIPARIS_ZATEN_ODENDI: 'Bu sipariş zaten ödendi olarak işaretlenmiş.',
  ODEME_TARIHI_GECERSIZ: 'Ödeme tarihi fatura tarihinden önce olamaz.',
  TEDARIKCI_STOK_BAGLANTISI_BULUNAMADI: 'Tedarikçi ürün bağlantısı bulunamadı.',
  TEDARIKCI_STOK_KAPSAMI_UYUSMUYOR: 'Seçilen ürün bu tedarikçinin kapsamına ait değil.',
  TEDARIKCI_STOK_BAGLANTISI_REVIZYON_CAKISMASI: 'Ürün bağlantısı başka bir kullanıcı tarafından güncellendi. Yenileyip tekrar deneyin.',
  AKTIF_TEDARIKCI_BULUNAMADI: 'Aktif bir tedarikçi seçin.',
  TEK_STOK_ID_VEYA_STOK_IDS_ZORUNLU: 'Tek ürün veya toplu ürün listesinden yalnız birini gönderin.',
  TOPLU_TEDARIKCI_STOK_LISTESI_GECERSIZ: 'Toplu ürün listesini kontrol edin.',
  TOPLU_TEDARIKCI_STOK_LISTESINDE_MEVCUT_BAGLANTI_VAR: 'Seçimde daha önce bağlanmış bir ürün var. Listeyi yenileyip tekrar deneyin.',
  TOPLU_TEDARIKCI_STOK_LISTESI_TEKIL_OLMALI: 'Toplu listede aynı ürün birden fazla kez seçilemez.',
  TOPLU_TEDARIKCI_URUN_KODU_DESTEKLENMIYOR: 'Tedarikçi ürün kodunu her ürün için ayrı düzenleyin.',
  AAL2_GEREKLI: 'Bu işlem için iki adımlı doğrulama gerekir.',
}

type SupabaseHatasi = {
  message: string
  details?: string
} | null

function hataFirlat(error: SupabaseHatasi) {
  if (!error) return
  const kod = Object.keys(HATA_MESAJLARI).find((aday) => error.message.includes(aday))
  throw new Error(kod ? HATA_MESAJLARI[kod] : error.details ? `${error.message} — ${error.details}` : error.message)
}

function sayi(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableSayi(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function siparisiDonustur(value: unknown): TedarikciSiparisi {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    ...row,
    vade_gunu: sayi(row.vade_gunu),
    siparis_tutari: nullableSayi(row.siparis_tutari),
    fatura_tutari: nullableSayi(row.fatura_tutari),
    kalan_gun: nullableSayi(row.kalan_gun),
    revision_no: sayi(row.revision_no),
  } as TedarikciSiparisi
}

export async function tedarikciSiparisleriniGetir(
  tedarikciId: string,
): Promise<TedarikciSiparisi[]> {
  const { data, error } = await supabase.rpc('tedarikci_siparislerini_getir', {
    p_tedarikci_id: tedarikciId,
  })
  hataFirlat(error)
  return (Array.isArray(data) ? data : []).map(siparisiDonustur)
}

export async function tedarikciSiparisiOlustur(
  payload: TedarikciSiparisiPayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  const { data, error } = await supabase.rpc('tedarikci_siparisi_olustur', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
  hataFirlat(error)
  return data
}

export async function tedarikciSiparisineFaturaIsle(
  siparisId: string,
  revisionNo: number,
  payload: TedarikciFaturaPayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  const faturaTutari = Number(payload.fatura_tutari)
  if (
    !payload.fatura_tutari.trim()
    || !Number.isFinite(faturaTutari)
    || faturaTutari <= 0
  ) {
    throw new Error(HATA_MESAJLARI.FATURA_BILGILERI_GECERSIZ)
  }
  const { data, error } = await supabase.rpc('tedarikci_siparisine_fatura_isle', {
    p_siparis_id: siparisId,
    p_revision_no: revisionNo,
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
  hataFirlat(error)
  return data
}

export async function tedarikciSiparisiniOdendiIsaretle(
  siparisId: string,
  revisionNo: number,
  odemeTarihi: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  const { data, error } = await supabase.rpc('tedarikci_siparisini_odendi_isaretle', {
    p_siparis_id: siparisId,
    p_revision_no: revisionNo,
    p_odeme_tarihi: odemeTarihi,
    p_idempotency_key: idempotencyKey,
  })
  hataFirlat(error)
  return data
}

export async function tedarikciStokBaglantilariniGetir(
  tedarikciId: string,
): Promise<TedarikciStokBaglantiKatalogu> {
  const { data, error } = await supabase.rpc('tedarikci_stok_baglantilarini_getir', {
    p_tedarikci_id: tedarikciId,
  })
  hataFirlat(error)
  return data as unknown as TedarikciStokBaglantiKatalogu
}

export async function tedarikciStokBaglantisiKaydet(
  payload: TedarikciStokBaglantisiPayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  const { data, error } = await supabase.rpc('tedarikci_stok_baglantisi_kaydet', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
  hataFirlat(error)
  return data
}

export async function tedarikciStokBaglantisiPasiflestir(
  baglantiId: string,
  revisionNo: number,
  gerekce: string,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
) {
  const { data, error } = await supabase.rpc('tedarikci_stok_baglantisi_pasiflestir', {
    p_baglanti_id: baglantiId,
    p_beklenen_revision_no: revisionNo,
    p_gerekce: gerekce,
    p_idempotency_key: idempotencyKey,
  })
  hataFirlat(error)
  return data
}
