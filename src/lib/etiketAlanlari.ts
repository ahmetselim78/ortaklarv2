import type { EtiketAlanAnahtari } from '@/types/ayarlar'

export const ETIKET_ALAN_META: Record<EtiketAlanAnahtari, {
  baslik: string
  kisa: string
  aciklama: string
  tur: 'barkod' | 'metin'
  renk: string
}> = {
  barkod: { baslik: 'Barkod', kisa: 'Barkod', aciklama: 'Code 128 — kısa GLS', tur: 'barkod', renk: '#2563eb' },
  cam_tipi: { baslik: 'Cam Tipi', kisa: 'Cam tipi', aciklama: 'Örn. 4+16+4 Temp Isıcam', tur: 'metin', renk: '#0f766e' },
  boyut: { baslik: 'Cam Boyutu', kisa: 'Boyut', aciklama: 'Yükseklik × genişlik (mm yok)', tur: 'metin', renk: '#c2410c' },
  musteri_adi: { baslik: 'Cari / Müşteri', kisa: 'Müşteri', aciklama: 'Cari sahibi adı', tur: 'metin', renk: '#be123c' },
  alt_musteri: { baslik: 'Alt Müşteri', kisa: 'Alt müşteri', aciklama: 'Nihai / alt müşteri adı', tur: 'metin', renk: '#9333ea' },
  siparis_no: { baslik: 'Sipariş No', kisa: 'Sipariş no', aciklama: 'Sipariş numarasının son 4 hanesi (örn. 0058)', tur: 'metin', renk: '#7c3aed' },
  poz: { baslik: 'Poz Numarası', kisa: 'Poz', aciklama: 'Sipariş listesinden gelen poz numarasını P önekiyle basar; karakter sınırı poz metnine uygulanır', tur: 'metin', renk: '#4d7c0f' },
  liste_adedi: { baslik: 'Toplam Liste Adedi', kisa: 'Toplam adet', aciklama: 'Etikette sayıdan sonra AD basılır (örn. 48 AD); karakter sınırı yalnızca sayıya uygulanır', tur: 'metin', renk: '#0369a1' },
  batch_sira: { baslik: 'Batch Sıra No', kisa: 'Batch sıra', aciklama: 'Batch içindeki GLS sıra numarası', tur: 'metin', renk: '#b45309' },
  tarih: { baslik: 'Baskı Tarihi', kisa: 'Tarih', aciklama: 'Etiket basım tarihi', tur: 'metin', renk: '#475569' },
}
