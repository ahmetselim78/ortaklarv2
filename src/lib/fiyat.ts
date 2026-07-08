export interface FiyatSatiri {
  genislik_mm: number
  yukseklik_mm: number
  adet?: number | null
}

export function camMetrekareHesapla(satir: FiyatSatiri): number {
  const adet = Number.isFinite(Number(satir.adet)) && Number(satir.adet) > 0
    ? Number(satir.adet)
    : 1
  return (Number(satir.genislik_mm) * Number(satir.yukseklik_mm) * adet) / 1_000_000
}

export function camSatirTutariHesapla(
  satir: FiyatSatiri,
  birimFiyat: number | null | undefined,
): number | null {
  if (birimFiyat == null || !Number.isFinite(Number(birimFiyat))) return null
  return camMetrekareHesapla(satir) * Number(birimFiyat)
}
