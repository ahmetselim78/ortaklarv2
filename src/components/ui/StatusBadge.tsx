import { cn } from '@/lib/utils'

/**
 * Projede her yerde kullanılan sipariş / üretim durumu renk paleti.
 * Tüm sayfalarda tutarlı görünmesi için tek noktadan yönetilir.
 */
export const SIPARIS_DURUM_STIL: Record<string, string> = {
  beklemede: 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200',
  batchte: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100',
  yikamada: 'bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-100',
  tamamlandi: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-100',
  eksik_var: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-100',
  iptal: 'bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200 line-through',
}

export const SIPARIS_DURUM_ETIKET: Record<string, string> = {
  beklemede: 'Beklemede',
  batchte: "Batch'te",
  yikamada: 'Yıkamada',
  tamamlandi: 'Tamamlandı',
  eksik_var: 'Eksik Var',
  iptal: 'İptal',
}

export const URETIM_DURUM_STIL: Record<string, string> = {
  hazirlaniyor: 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200',
  onaylandi: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100',
  export_edildi: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-100',
  yikamada: 'bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-100',
  tamamlandi: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-100',
  eksik_var: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-100',
}

export const URETIM_DURUM_ETIKET: Record<string, string> = {
  hazirlaniyor: 'Hazırlanıyor',
  onaylandi: 'Onaylandı',
  export_edildi: 'Export Edildi',
  yikamada: 'Yıkamada',
  tamamlandi: 'Tamamlandı',
  eksik_var: 'Eksik Var',
}

interface StatusBadgeProps {
  durum: string
  /** 'siparis' veya 'uretim' — doğru etiket ve rengi seçmek için. */
  tip?: 'siparis' | 'uretim'
  className?: string
}

/**
 * Her yerde aynı görünümde bir durum rozet etiketi.
 */
export default function StatusBadge({ durum, tip = 'siparis', className }: StatusBadgeProps) {
  const stil = tip === 'uretim' ? URETIM_DURUM_STIL : SIPARIS_DURUM_STIL
  const etiket = tip === 'uretim' ? URETIM_DURUM_ETIKET : SIPARIS_DURUM_ETIKET
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
        stil[durum] ?? 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200',
        className,
      )}
    >
      {etiket[durum] ?? durum}
    </span>
  )
}
