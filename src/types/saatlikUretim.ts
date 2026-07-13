// ────────────────────────────────────────────────────────────────────────────
// Saatlik Üretim Takip Panosu — Tip Tanımlamaları
// ────────────────────────────────────────────────────────────────────────────

// ── Personel ─────────────────────────────────────────────────────────────────

export type PersonelRol = 'Direkt' | 'Endirekt'

/** hr_personel tablosu */
export interface HrPersonel {
  id: string
  ad_soyad: string
  foto_url: string
  /** 'Direkt' | 'Endirekt' — ileride yüz tanıma API'si için string genişletildi */
  rol: PersonelRol | string
  is_aktif: boolean
  kullanici_adi?: string | null
  giris_sifresi?: string | null
  /** false ise tüm aktif istasyonlar, true ise ilişki tablosunda seçilen istasyonlar */
  uretim_yetkileri_sinirli?: boolean
  hr_personel_istasyon_yetkileri?: Array<{ istasyon_id: string }>
}

export type YeniPersonel = Omit<HrPersonel, 'id'>

// ── Şablon (Vardiya Tanımı) ───────────────────────────────────────────────────

/** uretim_saat_sablonlari tablosu */
export interface UretimSaatSablonu {
  id: string
  sablon_adi: string
  /** Genel çalışma aralığı, örn: "08:00 - 18:00" */
  saat_araligi: string
  sira_no: number
}

export type YeniSablon = Omit<UretimSaatSablonu, 'id'>

// ── Saatlik Hedef (Şablona Bağlı) ────────────────────────────────────────────

/** uretim_saatlik_hedefler tablosu */
export interface UretimSaatlikHedef {
  id: string
  sablon_id: string
  /** Saat dilimi, örn: "08:00 - 09:00" */
  saat_araligi: string
  hedef_adet: number
  sira_no: number
}

export type YeniHedef = Omit<UretimSaatlikHedef, 'id'>

// ── Günlük Takip Satırı ───────────────────────────────────────────────────────

/** gunluk_uretim_takip tablosu */
export interface GunlukUretimSatiri {
  id: string
  /** YYYY-MM-DD */
  tarih: string
  /** Örn: "08:00 - 09:00" */
  saat_araligi: string
  hedef_adet: number
  gerceklesen_adet: number
  fire_adet: number
  aksiyon_notu: string | null
  /** Non-Productive Time yüzdesi */
  npt_orani: number
  sira_no: number
}

// ── UI Hesaplamalı Satır ──────────────────────────────────────────────────────

export type PerformansRengi = 'yesil' | 'sari' | 'kirmizi' | 'gri'

/** GunlukUretimSatiri + kümülatif hesaplamalar (UI'da kullanılır) */
export interface HesaplanmisSatir extends GunlukUretimSatiri {
  kumulatifHedef: number
  kumulatifGerceklesen: number
  kumulatifFire: number
  /** Saatlik performans renk kodu */
  durumRengi: PerformansRengi
  /** Saat diliminin durumu: geçmiş / aktif / gelecek */
  zamanDurumu: 'gecmis' | 'aktif' | 'gelecek'
}

// ── İş Gücü Özeti ────────────────────────────────────────────────────────────

export interface IsGucuOzeti {
  direkt: number
  endirekt: number
  toplam: number
  nptYuzdesi: number
}

// ── Telegram ──────────────────────────────────────────────────────────────────

export type TelegramRaporTipi = 'saatlik' | 'uretim_giris' | 'her_ikisi'

export interface TelegramSablonAyarlari {
  sablon_baslik: boolean
  sablon_saatlik_detay: boolean
  sablon_saatlik_ozet: boolean
  sablon_istasyonlar: boolean
  sablon_araclar: boolean
  sablon_personel: boolean
  sablon_operator: boolean
  sablon_notlar: boolean
}

export interface TelegramAyarlari extends TelegramSablonAyarlari {
  id: string
  bot_token: string
  chat_id: string
  aktif: boolean
}

export interface TelegramRaporSaati {
  id: string
  saat: string
  aktif: boolean
  rapor_tipi: TelegramRaporTipi
}

export const TELEGRAM_RAPOR_TIPI_ETIKETLERI: Record<TelegramRaporTipi, string> = {
  saatlik: 'Saatlik Takip',
  uretim_giris: 'Üretim Girişi',
  her_ikisi: 'İkisi Birden',
}

export const VARSAYILAN_TELEGRAM_SABLON: TelegramSablonAyarlari = {
  sablon_baslik: true,
  sablon_saatlik_detay: true,
  sablon_saatlik_ozet: true,
  sablon_istasyonlar: true,
  sablon_araclar: true,
  sablon_personel: true,
  sablon_operator: true,
  sablon_notlar: true,
}
