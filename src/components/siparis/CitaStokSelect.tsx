import { aktifCitaStoklari } from '@/lib/cam'
import { cn } from '@/lib/utils'
import type { Stok } from '@/types/stok'

interface CitaStokSelectProps {
  stoklar: Stok[]
  value: string
  onChange: (stokId: string) => void
  invalid?: boolean
  disabled?: boolean
  className?: string
  /** Boş seçeneğin etiketi */
  placeholder?: string
}

export default function CitaStokSelect({
  stoklar,
  value,
  onChange,
  invalid,
  disabled,
  className,
  placeholder = 'Çıta seçin',
}: CitaStokSelectProps) {
  const citaStoklar = aktifCitaStoklari(stoklar).sort(
    (a, b) => (a.kalinlik_mm ?? 0) - (b.kalinlik_mm ?? 0),
  )

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full min-w-[110px] rounded border px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
        invalid ? 'border-red-300 bg-red-50/50' : 'border-gray-200',
        disabled && 'opacity-50 cursor-not-allowed bg-gray-50',
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {citaStoklar.map((s) => (
        <option key={s.id} value={s.id}>
          {s.kalinlik_mm != null ? `${Math.round(s.kalinlik_mm)}mm` : s.kod} · {s.ad}
        </option>
      ))}
    </select>
  )
}
