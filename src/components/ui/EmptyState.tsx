import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  icon: LucideIcon
  baslik: string
  aciklama?: string
  aksiyon?: ReactNode
  className?: string
  /** Dikey padding varyantı */
  boyut?: 'sm' | 'md' | 'lg'
}

/**
 * Tutarlı boş-durum gösterimi. Metin bölümlerinin hepsi yeşillik gri tonunda,
 * ikon yumuşak bir daire üzerinde verilir. Sayfa ortasına hizalanmak üzere
 * tasarlanmıştır (parent'ta flex/center layout varsa daha iyi sonuç verir).
 */
export default function EmptyState({
  icon: Icon,
  baslik,
  aciklama,
  aksiyon,
  className,
  boyut = 'lg',
}: Props) {
  const pad = boyut === 'sm' ? 'py-10' : boyut === 'md' ? 'py-16' : 'py-24'
  return (
    <div className={cn('text-center', pad, className)}>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
        <Icon size={28} strokeWidth={1.8} />
      </div>
      <p className="text-base font-semibold text-gray-700">{baslik}</p>
      {aciklama && <p className="mt-1 text-sm text-gray-500">{aciklama}</p>}
      {aksiyon && <div className="mt-5 flex justify-center">{aksiyon}</div>}
    </div>
  )
}
