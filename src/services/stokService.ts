import { supabase } from '@/lib/supabase'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type {
  StokBaslangicKatalogDurumu,
  StokBaslangicKatalogKategoriOzeti,
  StokHareketi,
  StokHareketPayload,
  StokKatalogKaydi,
  StokKategori,
  StokKartPayload,
  StokPanelOzeti,
  StokTedarikcisi,
  StokTicariKapsami,
} from '@/types/stok'

function stokHatasi(mesaj: string) {
  const karsiliklar: Array<[RegExp, string]> = [
    [/STOK_KODU_ZATEN_KULLANILIYOR|duplicate key.*stok.*kod/i, 'Bu stok kodu zaten kullanılıyor.'],
    [/KULLANILAN_STOK_DUZENLENEMEZ|KULLANILAN_STOK_KIMLIGI_DEGISTIRILEMEZ|HAREKETLI_STOK_TANIMI_DEGISTIRILEMEZ/i, 'Bu kart kullanımda olduğu için kimlik ve teknik bilgileri değiştirilemez.'],
    [/KULLANILAN_STOK_SILINEMEZ|HAREKETLI_STOK_SILINEMEZ/i, 'Bu kart kullanımda olduğu için silinemez. Pasifleştirebilirsiniz.'],
    [/AAL2_GEREKLI/i, 'Silme işlemi için iki aşamalı doğrulama (AAL2) gereklidir.'],
    [/INVENTORY_CREATE_YETKISI_GEREKLI/i, 'Stok kartı oluşturma yetkiniz yok.'],
    [/INVENTORY_UPDATE_YETKISI_GEREKLI/i, 'Stok kartını değiştirme yetkiniz yok.'],
    [/INVENTORY_DELETE_YETKISI_GEREKLI/i, 'Stok kartını silme yetkiniz yok.'],
    [/STOK_KODU_DEGISTIRILEMEZ/i, 'Stok kodu sistem tarafından atanır ve değiştirilemez.'],
    [/STOK_MIKTARI_DOGRUDAN_DEGISTIRILEMEZ/i, 'Stok miktarı doğrudan değiştirilemez; giriş veya çıkış hareketi kaydedin.'],
    [/STOK_HAREKETI_BILGILERI_GECERSIZ/i, 'Stok hareketinin tür, miktar ve açıklama bilgilerini kontrol edin.'],
    [/PASIF_STOGA_HAREKET_GIRILEMEZ/i, 'Pasif stok kartına hareket girilemez.'],
    [/TEDARIKCI_ZORUNLU/i, 'Alış girişi ve tedarikçiye iade için tedarikçi seçmelisiniz.'],
    [/AKTIF_TEDARIKCI_GEREKLI/i, 'Aktif bir tedarikçi seçmelisiniz.'],
    [/YETERSIZ_STOK/i, 'Bu çıkış için yeterli stok bulunmuyor.'],
    [/STOK_HAREKETI_DEGISTIRILEMEZ/i, 'Stok hareketleri değiştirilemez; ters yönde yeni bir düzeltme hareketi girin.'],
  ]
  return karsiliklar.find(([desen]) => desen.test(mesaj))?.[1] ?? mesaj
}

function rpcHatasi(error: { message: string } | null) {
  if (error) throw new Error(stokHatasi(error.message))
}

export async function stokKatalogunuGetir(): Promise<StokKatalogKaydi[]> {
  const { data, error } = await supabase.rpc('stok_katalogu_getir')
  rpcHatasi(error)
  return (data ?? []).map((kayit: StokKatalogKaydi) => ({
    ...kayit,
    mevcut_miktar: sayi(kayit.mevcut_miktar),
    minimum_miktar: sayi(kayit.minimum_miktar),
    kritik_stok: Boolean(kayit.kritik_stok),
    kullaniliyor: Boolean(kayit.kullaniliyor),
    kullanimlar: (kayit.kullanimlar ?? []).map((kullanim) => ({
      ...kullanim,
      adet: Number(kullanim.adet),
    })),
  }))
}

export async function stokKartiOlustur(payload: StokKartPayload): Promise<StokKatalogKaydi> {
  const { data, error } = await supabase.rpc('stok_karti_olustur', {
    p_payload: { ...payload, kod: '' },
  })
  rpcHatasi(error)
  return data as StokKatalogKaydi
}

function sayi(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nesne(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function tanimliSayi(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function ilkSayi(
  kaynaklar: Array<Record<string, unknown>>,
  anahtarlar: string[],
): number | undefined {
  for (const kaynak of kaynaklar) {
    for (const anahtar of anahtarlar) {
      const deger = tanimliSayi(kaynak[anahtar])
      if (deger !== undefined) return deger
    }
  }
  return undefined
}

function ilkBoolean(
  kaynaklar: Array<Record<string, unknown>>,
  anahtarlar: string[],
): boolean | undefined {
  for (const kaynak of kaynaklar) {
    for (const anahtar of anahtarlar) {
      const deger = kaynak[anahtar]
      if (typeof deger === 'boolean') return deger
      if (deger === 'true' || deger === 1 || deger === '1') return true
      if (deger === 'false' || deger === 0 || deger === '0') return false
    }
  }
  return undefined
}

const BASLANGIC_KATALOG_KATEGORILERI: StokKategori[] = ['cam', 'cita', 'yan_malzeme']

function kategoriKaynaklariniBul(
  kok: Record<string, unknown>,
  kategori: StokKategori,
): Array<Record<string, unknown>> {
  const kapsayici = kok.kategoriler
    ?? kok.kategori_dagilimi
    ?? kok.kategori_bazinda
    ?? kok.kategori_ozetleri
    ?? kok.detaylar
    ?? kok.sayilar
  const kaynaklar: Array<Record<string, unknown>> = []

  if (Array.isArray(kapsayici)) {
    const satir = kapsayici.find((deger) => {
      const kayit = nesne(deger)
      return (kayit.kategori ?? kayit.tur ?? kayit.key) === kategori
    })
    if (satir) kaynaklar.push(nesne(satir))
  } else {
    const kayitlar = nesne(kapsayici)
    const alternatif = kategori === 'yan_malzeme' ? kayitlar.yanMalzeme : undefined
    kaynaklar.push(nesne(kayitlar[kategori] ?? alternatif))
  }

  kaynaklar.push(nesne(kok[kategori]))
  return kaynaklar
}

function kategoriOzetiniDonustur(
  kok: Record<string, unknown>,
  kategori: StokKategori,
): StokBaslangicKatalogKategoriOzeti {
  const kaynaklar = kategoriKaynaklariniBul(kok, kategori)
  const toplam = ilkSayi(kaynaklar, ['toplam', 'toplam_sayi', 'hedef', 'beklenen'])
    ?? tanimliSayi(kok[`${kategori}_toplam`])
    ?? 0
  const mevcut = ilkSayi(kaynaklar, ['mevcut', 'mevcut_sayi', 'var_olan', 'bulunan'])
    ?? tanimliSayi(kok[`${kategori}_mevcut`])
    ?? 0
  const cakisan = ilkSayi(kaynaklar, ['cakisan', 'cakisan_sayi'])
    ?? tanimliSayi(kok[`${kategori}_cakisan`])
    ?? 0
  const uyumlu = ilkSayi(kaynaklar, ['uyumlu', 'uyumlu_sayi'])
    ?? tanimliSayi(kok[`${kategori}_uyumlu`])
    ?? Math.max(0, mevcut - cakisan)
  const eksik = ilkSayi(kaynaklar, ['eksik', 'eksik_sayi'])
    ?? tanimliSayi(kok[`${kategori}_eksik`])
    ?? Math.max(0, toplam - mevcut)
  const eklenen = ilkSayi(kaynaklar, ['eklenen', 'eklenen_sayi', 'olusturulan'])
    ?? tanimliSayi(kok[`${kategori}_eklenen`])
    ?? 0

  return { kategori, toplam, mevcut, uyumlu, cakisan, eksik, eklenen }
}

function stokBaslangicKatalogDurumunuDonustur(value: unknown): StokBaslangicKatalogDurumu {
  const ilkSatir = Array.isArray(value) ? value[0] : value
  const hamKok = nesne(ilkSatir)
  const icDurum = nesne(
    hamKok.durum
      ?? hamKok.katalog_durumu
      ?? hamKok.katalog
      ?? hamKok.sonuc,
  )
  const kok = { ...hamKok, ...icDurum }
  const ozet = nesne(kok.ozet)
  const toplamDugumu = nesne(kok.toplam)
  const kategoriler = Object.fromEntries(
    BASLANGIC_KATALOG_KATEGORILERI.map((kategori) => [
      kategori,
      kategoriOzetiniDonustur(kok, kategori),
    ]),
  ) as Record<StokKategori, StokBaslangicKatalogKategoriOzeti>
  const kategoriDegerleri = Object.values(kategoriler)

  const toplam = tanimliSayi(kok.toplam)
    ?? ilkSayi([ozet, toplamDugumu], ['toplam', 'toplam_sayi', 'hedef', 'beklenen'])
    ?? kategoriDegerleri.reduce((sonuc, kategori) => sonuc + kategori.toplam, 0)
  const mevcut = ilkSayi([kok, ozet, toplamDugumu], ['mevcut', 'mevcut_sayi', 'var_olan', 'bulunan'])
    ?? kategoriDegerleri.reduce((sonuc, kategori) => sonuc + kategori.mevcut, 0)
  const cakisan = ilkSayi([kok, ozet, toplamDugumu], ['cakisan', 'cakisan_sayi'])
    ?? kategoriDegerleri.reduce((sonuc, kategori) => sonuc + kategori.cakisan, 0)
  const uyumlu = ilkSayi([kok, ozet, toplamDugumu], ['uyumlu', 'uyumlu_sayi'])
    ?? kategoriDegerleri.reduce((sonuc, kategori) => sonuc + kategori.uyumlu, 0)
  const eksik = ilkSayi([kok, ozet, toplamDugumu], ['eksik', 'eksik_sayi'])
    ?? (kategoriDegerleri.some((kategori) => kategori.toplam > 0)
      ? kategoriDegerleri.reduce((sonuc, kategori) => sonuc + kategori.eksik, 0)
      : Math.max(0, toplam - mevcut))
  const eklenen = ilkSayi([kok, ozet, toplamDugumu], ['eklenen', 'eklenen_sayi', 'olusturulan'])
    ?? kategoriDegerleri.reduce((sonuc, kategori) => sonuc + kategori.eklenen, 0)
  const kurulu = ilkBoolean(
    [kok, ozet],
    ['kurulu', 'tamamlandi', 'katalog_hazir', 'hazir', 'tamam'],
  ) ?? (toplam > 0 && eksik === 0)
  const katalogSurumu = typeof kok.katalog_surumu === 'string'
    ? kok.katalog_surumu
    : '105'

  return {
    katalog_surumu: katalogSurumu,
    toplam,
    mevcut,
    uyumlu,
    cakisan,
    eksik,
    eklenen,
    kurulu,
    tamamlandi: kurulu,
    kategoriler,
  }
}

export async function stokBaslangicKataloguDurumunuGetir(): Promise<StokBaslangicKatalogDurumu> {
  const { data, error } = await supabase.rpc('stok_baslangic_katalogu_durumu')
  rpcHatasi(error)
  return stokBaslangicKatalogDurumunuDonustur(data)
}

export async function stokBaslangicKatalogunuKur(
  idempotencyKey: string = yeniIdempotencyAnahtari(),
): Promise<StokBaslangicKatalogDurumu> {
  const { data, error } = await supabase.rpc('stok_baslangic_katalogunu_kur', {
    p_idempotency_key: idempotencyKey,
  })
  rpcHatasi(error)
  return stokBaslangicKatalogDurumunuDonustur(data)
}

function stokHareketiniDonustur(value: unknown): StokHareketi {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    ...row,
    miktar: sayi(row.miktar),
    net_miktar: sayi(row.net_miktar),
    bakiye_sonrasi: sayi(row.bakiye_sonrasi),
  } as StokHareketi
}

export async function stokHareketleriniGetir(
  stokId: string | null = null,
  limit = 200,
): Promise<StokHareketi[]> {
  const { data, error } = await supabase.rpc('stok_hareketlerini_getir', {
    p_stok_id: stokId,
    p_limit: limit,
  })
  rpcHatasi(error)
  return (Array.isArray(data) ? data : []).map(stokHareketiniDonustur)
}

export async function stokHareketiKaydet(
  payload: StokHareketPayload,
  idempotencyKey: string = yeniIdempotencyAnahtari(),
): Promise<StokHareketi> {
  const { data, error } = await supabase.rpc('stok_hareketi_kaydet', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  })
  rpcHatasi(error)
  return stokHareketiniDonustur(data)
}

export async function stokTedarikcileriniGetir(): Promise<StokTedarikcisi[]> {
  const { data, error } = await supabase.rpc('stok_tedarikcileri_getir')
  rpcHatasi(error)
  return (Array.isArray(data) ? data : []).map((row) => ({
    ...(row as StokTedarikcisi),
    tedarik_kapsamlari: Array.isArray((row as StokTedarikcisi).tedarik_kapsamlari)
      ? (row as StokTedarikcisi).tedarik_kapsamlari
      : [],
  }))
}

export async function stokPanelOzetiniGetir(): Promise<StokPanelOzeti> {
  const { data, error } = await supabase.rpc('stok_panel_ozeti_getir')
  rpcHatasi(error)
  const row = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  return {
    aktif_kart_sayisi: sayi(row.aktif_kart_sayisi),
    kritik_stok_sayisi: sayi(row.kritik_stok_sayisi),
    stoksuz_kart_sayisi: sayi(row.stoksuz_kart_sayisi),
    bugunku_hareket_sayisi: sayi(row.bugunku_hareket_sayisi),
  }
}

export async function stokOperasyonAyarlariGuncelle(
  id: string,
  minimumMiktar: number,
  stokYeri: string,
) {
  const { data, error } = await supabase.rpc('stok_operasyon_ayarlari_guncelle', {
    p_id: id,
    p_minimum_miktar: minimumMiktar,
    p_stok_yeri: stokYeri,
  })
  rpcHatasi(error)
  return data as StokKatalogKaydi
}

export async function stokKartiGuncelle(id: string, payload: StokKartPayload) {
  const { data, error } = await supabase.rpc('stok_karti_guncelle', {
    p_id: id,
    p_payload: payload,
  })
  rpcHatasi(error)
  return data as StokKatalogKaydi
}

export async function stokAktiflikAyarla(id: string, aktif: boolean) {
  const { error } = await supabase.rpc('stok_aktiflik_ayarla', {
    p_id: id,
    p_aktif: aktif,
  })
  rpcHatasi(error)
}

export async function stokKartiSil(id: string) {
  const { error } = await supabase.rpc('stok_karti_sil', { p_id: id })
  rpcHatasi(error)
}

export async function stokSatisKapsamiAyarla(id: string, etkin: boolean) {
  const { data, error } = await supabase.rpc('stok_satis_kapsami_ayarla', {
    p_id: id,
    p_etkin: etkin,
  })
  rpcHatasi(error)
  return data as StokTicariKapsami
}

export async function stokMaliyetKapsamiAyarla(id: string, etkin: boolean) {
  const { data, error } = await supabase.rpc('stok_maliyet_kapsami_ayarla', {
    p_id: id,
    p_etkin: etkin,
  })
  rpcHatasi(error)
  return data as StokTicariKapsami
}
