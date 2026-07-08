/**
 * Manuel sipariş giriş ekranındaki yarım kalmış formu localStorage'da
 * tutmak için kullanılan tip. Yapı, SiparisForm'un FormVeri'si ile uyumlu
 * olmalıdır (zod schema'sı ile birlikte değişirse burası da güncellenmeli).
 */
export interface SiparisTaslakCam {
  stok_id?: string
  genislik_mm?: number | string
  yukseklik_mm?: number | string
  adet?: number | string
  ara_bosluk_mm?: number | string
  kenar_islemi?: string
  notlar?: string
  poz?: string
}

export interface SiparisTaslakVerisi {
  cari_id?: string
  tarih?: string
  teslim_tarihi?: string
  alt_musteri?: string
  notlar?: string
  teslimat_tipi?: string
  camlar?: SiparisTaslakCam[]
}

export interface SiparisTaslak {
  id: string                  // uuid benzeri
  created_at: string          // ISO
  updated_at: string          // ISO
  veri: SiparisTaslakVerisi
}
