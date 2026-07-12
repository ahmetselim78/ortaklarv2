import { cn } from '@/lib/utils'

export interface YikamaAdetBadgeProps {
  taranan: number
  toplam: number
  compact?: boolean
  veriAlinamadi?: boolean
}

export default function YikamaAdetBadge({
  taranan,
  toplam,
  compact = false,
  veriAlinamadi = false,
}: YikamaAdetBadgeProps) {
  const guvenliToplam = Math.max(0, toplam)
  const guvenliTaranan = Math.max(0, Math.min(taranan, guvenliToplam))
  const tamamlandi = !veriAlinamadi && guvenliToplam > 0 && guvenliTaranan >= guvenliToplam
  const kismi = !veriAlinamadi && guvenliTaranan > 0 && !tamamlandi

  if (veriAlinamadi) {
    return (
      <span
        className={cn(
          'inline-flex items-center font-semibold tabular-nums rounded-full',
          compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
          'bg-gray-100 text-gray-500 border border-gray-200',
        )}
        title="İlerleme alınamadı"
      >
        — / {guvenliToplam}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold tabular-nums rounded-full',
        compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
        tamamlandi
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : kismi
            ? 'bg-amber-50 text-amber-700 border border-amber-200'
            : 'bg-gray-100 text-gray-500 border border-gray-200',
      )}
    >
      {guvenliTaranan} / {guvenliToplam}
    </span>
  )
}
