import type { ParaBirimi } from '@/types/ticari'

export function ticariBugun(simdi = new Date()) {
  const parcalar = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(simdi)
  const degerler = Object.fromEntries(
    parcalar
      .filter((parca) => parca.type !== 'literal')
      .map((parca) => [parca.type, parca.value]),
  )
  return `${degerler.year}-${degerler.month}-${degerler.day}`
}

export function ticariTarih(value: string | null | undefined, saat = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    ...(saat ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Europe/Istanbul',
  }).format(date)
}

export function ticariPara(value: number | string | null | undefined, paraBirimi: ParaBirimi) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: paraBirimi,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(parsed) ? parsed : 0)
}
