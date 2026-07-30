export interface M2KontrolSatiri {
  genislik_mm: number
  yukseklik_mm: number
  adet: number
}

export function pdfM2Kontrolu(
  satirlar: M2KontrolSatiri[],
  pdfToplamM2: number | null | undefined,
) {
  const hesaplanan = satirlar.reduce(
    (toplam, satir) => toplam
      + satir.genislik_mm * satir.yukseklik_mm * satir.adet / 1_000_000,
    0,
  )
  const pdf = pdfToplamM2 ?? null
  const fark = pdf == null ? null : Math.abs(hesaplanan - pdf)
  const tolerans = pdf ? Math.max(0.5, pdf * 0.005) : 0.5
  return {
    hesaplanan,
    pdf,
    fark,
    tolerans,
    uyumsuz: fark != null && fark > tolerans,
  }
}

