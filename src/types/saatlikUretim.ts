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
