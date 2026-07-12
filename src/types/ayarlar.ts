import {
  dplAscii,
  dplBarkod,
  dplEtiketIskeleti,
  dplMetin,
  mmToDplBarkodYuksekligi,
  mmToDplMetric,
} from '@/lib/dplEtiket'
import type { DplRotasyon } from '@/lib/dplEtiket'

/** Etiket üzerinde basılacak içerik alanları. */
export interface EtiketIcerik {
  barkod: boolean
  cam_tipi: boolean
  boyut: boolean
  musteri_adi: boolean
  alt_musteri: boolean
  siparis_no: boolean
  poz: boolean
  liste_adedi: boolean
  batch_sira: boolean
  tarih: boolean
}

export const ETIKET_ALAN_ANAHTARLARI = [
  'barkod',
  'cam_tipi',
  'boyut',
  'musteri_adi',
  'alt_musteri',
  'siparis_no',
  'poz',
  'liste_adedi',
  'batch_sira',
  'tarih',
] as const

export type EtiketAlanAnahtari = typeof ETIKET_ALAN_ANAHTARLARI[number]

/** Yazıcı bağlantı bilgileri. */
export interface YaziciBaglanti {
  kopru_adresi: string
  kopru_port: number
  yazici_adi: string
  ip_adresi: string
  port: number
}

/** Hazır basılı fiziksel etiket ölçüsü. */
export interface EtiketBoyutu {
  genislik_mm: number
  yukseklik_mm: number
}

/** Bir alanın DPL home-position (sol alt) merkezli hassas yerleşimi. */
export interface EtiketAlanYerlesimi {
  x_mm: number
  y_mm: number
  rotasyon: DplRotasyon
  font: number
  genislik_carpani: number
  yukseklik_carpani: number
  maks_karakter: number
  barkod_yukseklik_mm: number
  barkod_modul_genisligi: number
  barkod_okunabilir_metin: boolean
}

export type EtiketAlanYerlesimleri = Record<EtiketAlanAnahtari, EtiketAlanYerlesimi>

/** Baskı motoru ve tüm alanların ortak kalibrasyon ayarları. */
export interface EtiketYerlesimi {
  surum: 2
  dpi: 203 | 300
  nokta_genislik: 1 | 2
  nokta_yukseklik: 1 | 2 | 3
  isi: number
  x_ofset_mm: number
  y_ofset_mm: number
  alanlar: EtiketAlanYerlesimleri
}

/** Etiket basım ayarlarının tamamı. */
export interface EtiketAyarlari {
  yazici: YaziciBaglanti
  boyut: EtiketBoyutu
  icerik: EtiketIcerik
  yerlesim: EtiketYerlesimi
  yazdirma_kosulu: 'otomatik' | 'manuel'
  dpl_modu: 'panel' | 'ozel'
  dpl_sablonu: string
}

/** Supabase ayarlar tablosundaki bir satır. */
export interface AyarlarRow {
  id: string
  anahtar: string
  deger: Record<string, unknown>
  guncelleme: string
}

/** Opti / PerfectCut IMP export FAM eşlemesi. */
export interface OptiFamEsleme {
  stok_kod: string
  fam_kodu: string
}

/** Opti export ayarları. */
export interface OptiExportAyarlari {
  sayac: number
  cita_dusme: number
  fam_haritasi: OptiFamEsleme[]
}

const ORTAK_METIN_AYARI: Omit<EtiketAlanYerlesimi, 'x_mm' | 'y_mm'> = {
  rotasyon: 1,
  font: 2,
  genislik_carpani: 1,
  yukseklik_carpani: 1,
  maks_karakter: 40,
  barkod_yukseklik_mm: 12,
  barkod_modul_genisligi: 1,
  barkod_okunabilir_metin: false,
}

export const VARSAYILAN_ETIKET_AYARLARI: EtiketAyarlari = {
  yazici: {
    kopru_adresi: 'localhost',
    kopru_port: 9876,
    yazici_adi: '',
    ip_adresi: '',
    port: 9100,
  },
  boyut: {
    genislik_mm: 100,
    yukseklik_mm: 50,
  },
  icerik: {
    barkod: true,
    cam_tipi: false,
    musteri_adi: false,
    alt_musteri: false,
    siparis_no: false,
    poz: false,
    liste_adedi: false,
    batch_sira: false,
    boyut: false,
    tarih: false,
  },
  yerlesim: {
    surum: 2,
    dpi: 203,
    nokta_genislik: 2,
    nokta_yukseklik: 2,
    isi: 10,
    x_ofset_mm: 0,
    y_ofset_mm: 0,
    alanlar: {
      barkod: {
        ...ORTAK_METIN_AYARI,
        x_mm: 5,
        y_mm: 5,
        barkod_yukseklik_mm: 12,
        barkod_modul_genisligi: 1,
      },
      cam_tipi: { ...ORTAK_METIN_AYARI, x_mm: 38, y_mm: 38, maks_karakter: 32 },
      boyut: { ...ORTAK_METIN_AYARI, x_mm: 38, y_mm: 29, maks_karakter: 24 },
      musteri_adi: { ...ORTAK_METIN_AYARI, x_mm: 38, y_mm: 21, maks_karakter: 34 },
      alt_musteri: { ...ORTAK_METIN_AYARI, x_mm: 38, y_mm: 13, maks_karakter: 34 },
      siparis_no: { ...ORTAK_METIN_AYARI, x_mm: 72, y_mm: 21, maks_karakter: 4 },
      poz: { ...ORTAK_METIN_AYARI, x_mm: 5, y_mm: 38, maks_karakter: 22 },
      liste_adedi: { ...ORTAK_METIN_AYARI, x_mm: 5, y_mm: 21, maks_karakter: 10 },
      batch_sira: { ...ORTAK_METIN_AYARI, x_mm: 5, y_mm: 29, maks_karakter: 8 },
      tarih: { ...ORTAK_METIN_AYARI, x_mm: 72, y_mm: 5, font: 1, maks_karakter: 14 },
    },
  },
  yazdirma_kosulu: 'otomatik',
  dpl_modu: 'panel',
  dpl_sablonu: '',
}

export const VARSAYILAN_OPTI_EXPORT_AYARLARI: OptiExportAyarlari = {
  sayac: 1,
  cita_dusme: 1,
  fam_haritasi: [],
}

function kayit(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function metin(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function sayi(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function tamsayi(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(sayi(value, fallback, min, max))
}

function booleanDeger(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Eski/eksik JSONB ayarlarını V2 şemasıyla güvenli ve derin biçimde birleştirir. */
export function etiketAyarlariBirlestir(value: unknown): EtiketAyarlari {
  const raw = kayit(value)
  const rawYazici = kayit(raw.yazici)
  const rawBoyut = kayit(raw.boyut)
  const rawIcerik = kayit(raw.icerik)
  const rawYerlesim = kayit(raw.yerlesim)
  const rawAlanlar = kayit(rawYerlesim.alanlar)

  const alanlar = Object.fromEntries(
    ETIKET_ALAN_ANAHTARLARI.map(anahtar => {
      const varsayilan = VARSAYILAN_ETIKET_AYARLARI.yerlesim.alanlar[anahtar]
      const alan = kayit(rawAlanlar[anahtar])
      const rotasyon = tamsayi(alan.rotasyon, varsayilan.rotasyon, 1, 4) as DplRotasyon
      return [anahtar, {
        x_mm: sayi(alan.x_mm, varsayilan.x_mm, -300, 300),
        y_mm: sayi(alan.y_mm, varsayilan.y_mm, -300, 300),
        rotasyon,
        font: tamsayi(alan.font, varsayilan.font, 0, 8),
        genislik_carpani: tamsayi(alan.genislik_carpani, varsayilan.genislik_carpani, 1, 9),
        yukseklik_carpani: tamsayi(alan.yukseklik_carpani, varsayilan.yukseklik_carpani, 1, 9),
        maks_karakter: tamsayi(alan.maks_karakter, varsayilan.maks_karakter, 1, 255),
        barkod_yukseklik_mm: sayi(alan.barkod_yukseklik_mm, varsayilan.barkod_yukseklik_mm, 0.254, 253.7),
        barkod_modul_genisligi: tamsayi(alan.barkod_modul_genisligi, varsayilan.barkod_modul_genisligi, 0, 9),
        barkod_okunabilir_metin: booleanDeger(alan.barkod_okunabilir_metin, varsayilan.barkod_okunabilir_metin),
      } satisfies EtiketAlanYerlesimi]
    }),
  ) as EtiketAlanYerlesimleri

  const dplSablonu = metin(raw.dpl_sablonu, '')
  const legacyDplModu = dplSablonu.trim() ? 'ozel' : 'panel'

  return {
    yazici: {
      kopru_adresi: metin(rawYazici.kopru_adresi, VARSAYILAN_ETIKET_AYARLARI.yazici.kopru_adresi),
      kopru_port: tamsayi(rawYazici.kopru_port, VARSAYILAN_ETIKET_AYARLARI.yazici.kopru_port, 1, 65535),
      yazici_adi: metin(rawYazici.yazici_adi, ''),
      ip_adresi: metin(rawYazici.ip_adresi, ''),
      port: tamsayi(rawYazici.port, VARSAYILAN_ETIKET_AYARLARI.yazici.port, 1, 65535),
    },
    boyut: {
      genislik_mm: sayi(rawBoyut.genislik_mm, VARSAYILAN_ETIKET_AYARLARI.boyut.genislik_mm, 10, 300),
      yukseklik_mm: sayi(rawBoyut.yukseklik_mm, VARSAYILAN_ETIKET_AYARLARI.boyut.yukseklik_mm, 10, 300),
    },
    icerik: Object.fromEntries(
      ETIKET_ALAN_ANAHTARLARI.map(anahtar => [
        anahtar,
        booleanDeger(rawIcerik[anahtar], VARSAYILAN_ETIKET_AYARLARI.icerik[anahtar]),
      ]),
    ) as unknown as EtiketIcerik,
    yerlesim: {
      surum: 2,
      dpi: tamsayi(rawYerlesim.dpi, 203, 203, 300) >= 300 ? 300 : 203,
      nokta_genislik: tamsayi(rawYerlesim.nokta_genislik, 2, 1, 2) as 1 | 2,
      nokta_yukseklik: tamsayi(rawYerlesim.nokta_yukseklik, 2, 1, 3) as 1 | 2 | 3,
      isi: tamsayi(rawYerlesim.isi, 10, 0, 30),
      x_ofset_mm: sayi(rawYerlesim.x_ofset_mm, 0, -100, 100),
      y_ofset_mm: sayi(rawYerlesim.y_ofset_mm, 0, -100, 100),
      alanlar,
    },
    yazdirma_kosulu: raw.yazdirma_kosulu === 'manuel' ? 'manuel' : 'otomatik',
    dpl_modu: raw.dpl_modu === 'ozel' || raw.dpl_modu === 'panel'
      ? raw.dpl_modu
      : legacyDplModu,
    dpl_sablonu: dplSablonu,
  }
}

/** Etiket üzerindeki örnek/üretim verisi. */
export interface EtiketVeri {
  cam_kodu: string
  cam_tipi: string
  cari_adi: string
  alt_musteri: string
  siparis_no: string
  poz: string
  liste_adedi: number
  batch_sira: number | null
  genislik_mm: number
  yukseklik_mm: number
}

/** SIP-2026-0058 → 0058 (son 4 karakter). */
export function etiketSiparisNoMetni(siparisNo: string): string {
  const s = siparisNo.trim()
  if (!s) return ''
  return s.length <= 4 ? s : s.slice(-4)
}

export function etiketAlanDegeri(
  anahtar: EtiketAlanAnahtari,
  veri: EtiketVeri,
  tarih = new Date(),
  /** Varsa karakter sınırı; önek/sonekli alanlarda yalnızca anlamlı gövdeye uygulanır. */
  maksKarakter?: number,
): string {
  const kes = (metin: string) =>
    maksKarakter != null ? metin.slice(0, Math.max(0, maksKarakter)) : metin

  switch (anahtar) {
    case 'barkod': return kes(veri.cam_kodu)
    case 'cam_tipi': return kes(veri.cam_tipi)
    case 'boyut': return kes(`${veri.yukseklik_mm}x${veri.genislik_mm}`)
    case 'musteri_adi': return kes(veri.cari_adi)
    case 'alt_musteri': return kes(veri.alt_musteri)
    case 'siparis_no': return kes(etiketSiparisNoMetni(veri.siparis_no))
    case 'poz': {
      if (!veri.poz) return ''
      // "P " öneki korunur; karakter sınırı yalnızca siparişten gelen poz metnine uygulanır.
      const govde = kes(veri.poz)
      return govde ? `P ${govde}` : ''
    }
    case 'liste_adedi': {
      if (veri.liste_adedi <= 0) return ''
      const sayi = kes(String(veri.liste_adedi))
      return sayi ? `${sayi} AD` : ''
    }
    case 'batch_sira': return veri.batch_sira != null ? kes(String(veri.batch_sira)) : ''
    case 'tarih': return kes(tarih.toLocaleDateString('tr-TR'))
  }
}

export const DPL_FONT_METRIKLERI: Record<number, { yukseklik: number; genislik: number; bosluk: number }> = {
  0: { yukseklik: 7, genislik: 5, bosluk: 1 },
  1: { yukseklik: 13, genislik: 7, bosluk: 2 },
  2: { yukseklik: 18, genislik: 10, bosluk: 2 },
  3: { yukseklik: 27, genislik: 14, bosluk: 2 },
  4: { yukseklik: 36, genislik: 18, bosluk: 3 },
  5: { yukseklik: 52, genislik: 18, bosluk: 3 },
  6: { yukseklik: 64, genislik: 32, bosluk: 4 },
  7: { yukseklik: 32, genislik: 15, bosluk: 5 },
  8: { yukseklik: 28, genislik: 15, bosluk: 5 },
}

/** Önizleme ve sınır kontrolü için tahmini fiziksel alan ölçüsü. */
export function etiketAlanOlculeriMm(
  ayarlar: EtiketAyarlari,
  anahtar: EtiketAlanAnahtari,
  veri: EtiketVeri,
): { genislik: number; yukseklik: number } {
  const alan = ayarlar.yerlesim.alanlar[anahtar]
  if (anahtar === 'barkod') {
    const veriUzunlugu = Math.max(1, etiketAlanDegeri(anahtar, veri).length)
    const modulSayisi = 35 + (veriUzunlugu + 2) * 11
    const modulDot = alan.barkod_modul_genisligi || 2
    const genislik = modulSayisi * modulDot * ayarlar.yerlesim.nokta_genislik * 25.4 / ayarlar.yerlesim.dpi
    return {
      genislik,
      yukseklik: alan.barkod_yukseklik_mm + (alan.barkod_okunabilir_metin ? 3.5 : 0),
    }
  }

  const metrik = DPL_FONT_METRIKLERI[alan.font] ?? DPL_FONT_METRIKLERI[2]
  const deger = etiketAlanDegeri(anahtar, veri, undefined, alan.maks_karakter)
  const dpiOlcegi = ayarlar.yerlesim.dpi / 203
  return {
    genislik: Math.max(1, deger.length) * (metrik.genislik + metrik.bosluk) * dpiOlcegi *
      alan.genislik_carpani * ayarlar.yerlesim.nokta_genislik * 25.4 / ayarlar.yerlesim.dpi,
    yukseklik: metrik.yukseklik * dpiOlcegi * alan.yukseklik_carpani *
      ayarlar.yerlesim.nokta_yukseklik * 25.4 / ayarlar.yerlesim.dpi,
  }
}

export interface EtiketYerlesimUyarisi {
  alan?: EtiketAlanAnahtari
  seviye: 'hata' | 'uyari'
  mesaj: string
}

function alanSinirlari(
  x: number,
  y: number,
  genislik: number,
  yukseklik: number,
  rotasyon: DplRotasyon,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (rotasyon === 2) return { minX: x, minY: y - genislik, maxX: x + yukseklik, maxY: y }
  if (rotasyon === 3) return { minX: x - genislik, minY: y - yukseklik, maxX: x, maxY: y }
  if (rotasyon === 4) return { minX: x - yukseklik, minY: y, maxX: x, maxY: y + genislik }
  return { minX: x, minY: y, maxX: x + genislik, maxY: y + yukseklik }
}

function sinirlarEtiketIcinde(
  ayarlar: EtiketAyarlari,
  alan: EtiketAlanYerlesimi,
  olcu: { genislik: number; yukseklik: number },
): boolean {
  const sinir = alanSinirlari(
    alan.x_mm + ayarlar.yerlesim.x_ofset_mm,
    alan.y_mm + ayarlar.yerlesim.y_ofset_mm,
    olcu.genislik,
    olcu.yukseklik,
    alan.rotasyon,
  )
  return sinir.minX >= 0 && sinir.minY >= 0
    && sinir.maxX <= ayarlar.boyut.genislik_mm
    && sinir.maxY <= ayarlar.boyut.yukseklik_mm
}

/** Siparişten gelen değişken uzunluktaki poz metnini konumunu bozmadan etikete sığdırır. */
function pozMetinAyariniSigdir(
  ayarlar: EtiketAyarlari,
  veri: EtiketVeri,
  alan: EtiketAlanYerlesimi,
): EtiketAlanYerlesimi {
  const mevcutOlcu = etiketAlanOlculeriMm(ayarlar, 'poz', veri)
  if (sinirlarEtiketIcinde(ayarlar, alan, mevcutOlcu)) return alan

  const adaylar: Array<{ alan: EtiketAlanYerlesimi; olcu: { genislik: number; yukseklik: number } }> = []
  for (let font = 0; font <= 8; font++) {
    for (let genislik = 1; genislik <= alan.genislik_carpani; genislik++) {
      const adayAlan = { ...alan, font, genislik_carpani: genislik }
      const adayAyarlar: EtiketAyarlari = {
        ...ayarlar,
        yerlesim: {
          ...ayarlar.yerlesim,
          alanlar: { ...ayarlar.yerlesim.alanlar, poz: adayAlan },
        },
      }
      const olcu = etiketAlanOlculeriMm(adayAyarlar, 'poz', veri)
      if (olcu.yukseklik <= mevcutOlcu.yukseklik && sinirlarEtiketIcinde(ayarlar, adayAlan, olcu)) {
        adaylar.push({ alan: adayAlan, olcu })
      }
    }
  }

  adaylar.sort((a, b) =>
    b.olcu.yukseklik - a.olcu.yukseklik
    || b.alan.genislik_carpani - a.alan.genislik_carpani
    || b.olcu.genislik - a.olcu.genislik,
  )
  return adaylar[0]?.alan ?? alan
}

/** Açık alanların fiziksel etiketten taşma ve temel yapı kontrolleri. */
export function etiketYerlesimUyarilari(
  ayarlarGirdisi: EtiketAyarlari,
  veri: EtiketVeri,
): EtiketYerlesimUyarisi[] {
  const ayarlar = etiketAyarlariBirlestir(ayarlarGirdisi)
  const uyarilar: EtiketYerlesimUyarisi[] = []
  const acikAlanlar = ETIKET_ALAN_ANAHTARLARI.filter(anahtar => ayarlar.icerik[anahtar])

  if (acikAlanlar.length === 0) {
    uyarilar.push({ seviye: 'hata', mesaj: 'Basılacak en az bir alanı açın.' })
  }
  if (ayarlar.dpl_modu === 'ozel') {
    if (!ayarlar.dpl_sablonu.trim()) {
      uyarilar.push({ seviye: 'hata', mesaj: 'Özel DPL modu açık ancak şablon boş.' })
    } else {
      uyarilar.push({ seviye: 'uyari', mesaj: 'Özel DPL etkin; görsel yerleşim ayarları baskıda kullanılmayacak.' })
    }
    return uyarilar
  }

  for (const anahtar of acikAlanlar) {
    const alan = ayarlar.yerlesim.alanlar[anahtar]
    const x = alan.x_mm + ayarlar.yerlesim.x_ofset_mm
    const y = alan.y_mm + ayarlar.yerlesim.y_ofset_mm
    const olcu = etiketAlanOlculeriMm(ayarlar, anahtar, veri)
    const sinir = alanSinirlari(x, y, olcu.genislik, olcu.yukseklik, alan.rotasyon)
    if (sinir.minX < 0 || sinir.minY < 0 || sinir.maxX > ayarlar.boyut.genislik_mm || sinir.maxY > ayarlar.boyut.yukseklik_mm) {
      uyarilar.push({
        alan: anahtar,
        seviye: 'hata',
        mesaj: `${anahtar} alanı fiziksel etiket sınırının dışına taşıyor.`,
      })
    }
  }

  return uyarilar
}

export interface DplUretSecenekleri {
  sadece_alan?: EtiketAlanAnahtari
  paneli_zorla?: boolean
}

/** Datamax M-4206 için panel koordinatlarından doğrudan DPL komutu üretir. */
export function dplUret(
  ayarlarGirdisi: EtiketAyarlari,
  veri: EtiketVeri,
  secenekler: DplUretSecenekleri = {},
): string {
  const ayarlar = etiketAyarlariBirlestir(ayarlarGirdisi)
  if (!secenekler.paneli_zorla && ayarlar.dpl_modu === 'ozel' && ayarlar.dpl_sablonu.trim()) {
    return dplSablonuUygula(ayarlar.dpl_sablonu, veri)
  }

  const alanAnahtarlari = secenekler.sadece_alan
    ? [secenekler.sadece_alan]
    : ETIKET_ALAN_ANAHTARLARI.filter(anahtar => ayarlar.icerik[anahtar])
  const satirlar: string[] = []

  for (const anahtar of alanAnahtarlari) {
    const kayitliAlan = ayarlar.yerlesim.alanlar[anahtar]
    const alan = anahtar === 'poz' && kayitliAlan.rotasyon === 1
      ? pozMetinAyariniSigdir(ayarlar, veri, kayitliAlan)
      : kayitliAlan
    const row = mmToDplMetric(alan.y_mm + ayarlar.yerlesim.y_ofset_mm)
    const col = mmToDplMetric(alan.x_mm + ayarlar.yerlesim.x_ofset_mm)
    const deger = etiketAlanDegeri(anahtar, veri, undefined, alan.maks_karakter)
    if (!deger) continue

    if (anahtar === 'barkod') {
      satirlar.push(dplBarkod(
        row,
        col,
        deger,
        mmToDplBarkodYuksekligi(alan.barkod_yukseklik_mm),
        alan.barkod_okunabilir_metin,
        alan.rotasyon,
        alan.barkod_modul_genisligi,
      ))
    } else {
      satirlar.push(dplMetin(
        alan.rotasyon,
        alan.font,
        alan.genislik_carpani,
        alan.yukseklik_carpani,
        row,
        col,
        deger,
      ))
    }
  }

  return dplEtiketIskeleti(satirlar.join(''), {
    nokta_genislik: ayarlar.yerlesim.nokta_genislik,
    nokta_yukseklik: ayarlar.yerlesim.nokta_yukseklik,
    isi: ayarlar.yerlesim.isi,
    metrik: true,
  })
}

/** Seçilen etiket boyutu/ofseti üzerinde dört yön ve merkez referansı basar. */
export function dplKonumKalibrasyonUret(ayarlarGirdisi: EtiketAyarlari): string {
  const ayarlar = etiketAyarlariBirlestir(ayarlarGirdisi)
  const x0 = Math.max(0, 3 + ayarlar.yerlesim.x_ofset_mm)
  const y0 = Math.max(0, 3 + ayarlar.yerlesim.y_ofset_mm)
  const xSag = Math.max(x0, ayarlar.boyut.genislik_mm - 24 + ayarlar.yerlesim.x_ofset_mm)
  const yUst = Math.max(y0, ayarlar.boyut.yukseklik_mm - 7 + ayarlar.yerlesim.y_ofset_mm)
  const xOrta = Math.max(x0, ayarlar.boyut.genislik_mm / 2 - 8 + ayarlar.yerlesim.x_ofset_mm)
  const yOrta = Math.max(y0, ayarlar.boyut.yukseklik_mm / 2 + ayarlar.yerlesim.y_ofset_mm)
  const satirlar = [
    dplMetin(1, 0, 2, 2, mmToDplMetric(y0), mmToDplMetric(x0), '+ SOL ALT'),
    dplMetin(1, 0, 2, 2, mmToDplMetric(yUst), mmToDplMetric(x0), '+ SOL UST'),
    dplMetin(1, 0, 2, 2, mmToDplMetric(y0), mmToDplMetric(xSag), '+ SAG ALT'),
    dplMetin(1, 0, 2, 2, mmToDplMetric(yUst), mmToDplMetric(xSag), '+ SAG UST'),
    dplMetin(1, 0, 2, 2, mmToDplMetric(yOrta), mmToDplMetric(xOrta), '+ MERKEZ'),
  ].join('')
  return dplEtiketIskeleti(satirlar, {
    nokta_genislik: ayarlar.yerlesim.nokta_genislik,
    nokta_yukseklik: ayarlar.yerlesim.nokta_yukseklik,
    isi: ayarlar.yerlesim.isi,
  })
}

/** Aynı etikette 1×1, 2×2 ve 3×3 görünür metin örnekleri basar. */
export function dplMetinOlcekTestiUret(ayarlarGirdisi: EtiketAyarlari): string {
  const ayarlar = etiketAyarlariBirlestir(ayarlarGirdisi)
  const x = Math.max(0, 4 + ayarlar.yerlesim.x_ofset_mm)
  const y = Math.max(0, 4 + ayarlar.yerlesim.y_ofset_mm)
  const yukseklik = ayarlar.boyut.yukseklik_mm
  const satirlar = [
    dplMetin(1, 2, 1, 1, mmToDplMetric(y), mmToDplMetric(x), 'METIN 1X1'),
    dplMetin(1, 2, 2, 2, mmToDplMetric(Math.min(yukseklik - 10, y + 10)), mmToDplMetric(x), 'METIN 2X2'),
    dplMetin(1, 2, 3, 3, mmToDplMetric(Math.min(yukseklik - 5, y + 25)), mmToDplMetric(x), 'METIN 3X3'),
  ].join('')
  return dplEtiketIskeleti(satirlar, {
    nokta_genislik: ayarlar.yerlesim.nokta_genislik,
    nokta_yukseklik: ayarlar.yerlesim.nokta_yukseklik,
    isi: ayarlar.yerlesim.isi,
  })
}

/** Değişkenleri uzman DPL şablonuna yerleştirir. */
export function dplSablonuUygula(sablon: string, veri: EtiketVeri): string {
  const bugun = new Date().toLocaleDateString('tr-TR')
  const boyut = `${veri.yukseklik_mm}x${veri.genislik_mm}`
  const icerik = sablon
    .replace(/\{cam_kodu\}/g, dplAscii(veri.cam_kodu))
    .replace(/\{cam_tipi\}/g, dplAscii(veri.cam_tipi))
    .replace(/\{cari_adi\}/g, dplAscii(veri.cari_adi))
    .replace(/\{musteri\}/g, dplAscii(veri.cari_adi))
    .replace(/\{alt_musteri\}/g, dplAscii(veri.alt_musteri))
    .replace(/\{siparis_no\}/g, dplAscii(etiketSiparisNoMetni(veri.siparis_no)))
    .replace(/\{poz\}/g, dplAscii(veri.poz ? `P ${veri.poz}` : ''))
    .replace(/\{liste_adedi\}/g, veri.liste_adedi > 0 ? `${veri.liste_adedi} AD` : '')
    .replace(/\{batch_sira\}/g, veri.batch_sira != null ? String(veri.batch_sira) : '')
    .replace(/\{sira_no\}/g, veri.batch_sira != null ? String(veri.batch_sira) : '')
    .replace(/\{genislik_mm\}/g, String(veri.genislik_mm))
    .replace(/\{yukseklik_mm\}/g, String(veri.yukseklik_mm))
    .replace(/\{boyut\}/g, boyut)
    .replace(/\{tarih\}/g, bugun)
  return icerik
    .replace(/\\x02/g, '\x02')
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
}
