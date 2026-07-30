import type { StokHareketTuru } from '@/types/stok'

export const STOK_HAREKET_ETIKETLERI: Record<StokHareketTuru, string> = {
  devir_girisi: 'Açılış / devir girişi',
  alis_girisi: 'Alış girişi',
  iade_girisi: 'İade girişi',
  sayim_fazlasi: 'Sayım fazlası',
  uretim_cikisi: 'Üretim çıkışı',
  satis_cikisi: 'Satış çıkışı',
  iade_cikisi: 'Tedarikçiye iade',
  fire: 'Fire / hurda',
  sayim_eksigi: 'Sayım eksiği',
}

export const STOK_GIRIS_TURLERI: StokHareketTuru[] = [
  'devir_girisi',
  'alis_girisi',
  'iade_girisi',
  'sayim_fazlasi',
]

export function stokHareketiGirisMi(tur: StokHareketTuru) {
  return STOK_GIRIS_TURLERI.includes(tur)
}

export function yerelTarihSaatDegeri(tarih = new Date()) {
  const yerel = new Date(tarih.getTime() - tarih.getTimezoneOffset() * 60_000)
  return yerel.toISOString().slice(0, 16)
}

export function stokMiktari(value: number, birim: string) {
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value)} ${birim}`
}

