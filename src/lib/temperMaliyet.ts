import type { TedarikKapsami } from '@/types/cari'

export const STANDART_TEMPER_URUN_KODLARI = [
  '11004',
  '11005',
  '11006',
  '11007',
  '11008',
] as const

const STANDART_TEMPER_URUN_KODU_KUMESI = new Set<string>(
  STANDART_TEMPER_URUN_KODLARI,
)

export function standartTemperUrunuMu(stokKodu: string): boolean {
  return STANDART_TEMPER_URUN_KODU_KUMESI.has(stokKodu.trim())
}

export function temperTedarikciKapsamiUygunMu(
  kapsamlar: TedarikKapsami[] | null | undefined,
): boolean {
  return (kapsamlar ?? []).some((kapsam) => (
    kapsam === 'temper_hizmeti'
    || kapsam === 'cam'
    || kapsam === 'yan_malzeme'
  ))
}
