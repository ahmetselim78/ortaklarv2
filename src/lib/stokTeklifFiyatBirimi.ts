import type { StokTedarikciFiyatTeklifiKalemi } from '@/types/maliyet'

export type StokTeklifFiyatBirimiProfili = {
  profil_turu: 'cam' | 'cita' | 'sarf'
  birim: string
  fiyat_birimi: string
}

export function stokTeklifFiyatBiriminiCoz(
  profil: StokTeklifFiyatBirimiProfili,
): StokTedarikciFiyatTeklifiKalemi['fiyat_birimi'] {
  const birim = (profil.fiyat_birimi || profil.birim)
    .toLocaleLowerCase('tr-TR')
    .replace('m²', 'm2')
  if (birim === 'metre') return 'm'
  if (
    birim === 'm2'
    || birim === 'm'
    || birim === 'kg'
    || birim === 'litre'
    || birim === 'adet'
  ) {
    return birim
  }
  return profil.profil_turu === 'cam'
    ? 'm2'
    : profil.profil_turu === 'cita'
      ? 'm'
      : 'kg'
}
