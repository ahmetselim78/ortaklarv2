import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
  /** Yuvarlak hatlı küçük parça (avatar vb.) */
  yuvarlak?: boolean
}

/**
 * Tailwind tabanlı tek parça iskelet. `animate-pulse` ile yumuşak bir
 * yükleme efekti sağlar. Genişlik/yükseklik dışarıdan verilir.
 */
export function Skeleton({ className, yuvarlak }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-gray-200/80',
        yuvarlak ? 'rounded-full' : 'rounded-md',
        className,
      )}
    />
  )
}

/** Tabloya özel iskelet: başlık çizgisi + N adet satır. */
export function TableSkeleton({ satir = 6, kolon = 5 }: { satir?: number; kolon?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex gap-4">
        {Array.from({ length: kolon }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: satir }).map((_, r) => (
          <div key={r} className="px-4 py-3.5 flex gap-4 items-center">
            {Array.from({ length: kolon }).map((_, c) => (
              <Skeleton key={c} className={cn('h-3', c === 0 ? 'w-20' : 'flex-1')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Dashboard / panel kartları için kutu iskeleti. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 p-4', className)}>
      <Skeleton className="h-10 w-10 mb-3" />
      <Skeleton className="h-7 w-16 mb-2" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}
