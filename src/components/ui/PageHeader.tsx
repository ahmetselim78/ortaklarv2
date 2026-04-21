import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  baslik: string
  aciklama?: string
  icon?: LucideIcon
  /** Sağ üst köşede gözükecek aksiyon butonları. */
  aksiyon?: ReactNode
  className?: string
}

/**
 * Sayfa başlığı için tutarlı şablon.
 * - Sol: başlık + küçük gri açıklama + opsiyonel ikon kutusu
 * - Sağ: aksiyon alanı (butonlar vs.)
 */
export default function PageHeader({ baslik, aciklama, icon: Icon, aksiyon, className }: Props) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
            <Icon size={20} strokeWidth={2} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-800 leading-tight">{baslik}</h1>
          {aciklama && <p className="text-sm text-gray-500 mt-0.5">{aciklama}</p>}
        </div>
      </div>
      {aksiyon && <div className="flex flex-wrap items-center gap-2">{aksiyon}</div>}
    </div>
  )
}
