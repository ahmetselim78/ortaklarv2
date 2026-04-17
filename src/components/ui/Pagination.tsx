import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  toplamKayit: number
  sayfaBoyutu: number
  mevcutSayfa: number
  onSayfaDegistir: (sayfa: number) => void
}

export default function Pagination({ toplamKayit, sayfaBoyutu, mevcutSayfa, onSayfaDegistir }: Props) {
  const toplamSayfa = Math.ceil(toplamKayit / sayfaBoyutu)
  if (toplamSayfa <= 1) return null

  const baslangic = (mevcutSayfa - 1) * sayfaBoyutu + 1
  const bitis = Math.min(mevcutSayfa * sayfaBoyutu, toplamKayit)

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100 text-sm">
      <span className="text-xs text-gray-400">
        {baslangic}–{bitis} / {toplamKayit} kayıt
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onSayfaDegistir(mevcutSayfa - 1)}
          disabled={mevcutSayfa <= 1}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: toplamSayfa }, (_, i) => i + 1)
          .filter(s => s === 1 || s === toplamSayfa || Math.abs(s - mevcutSayfa) <= 1)
          .reduce<(number | '...')[]>((acc, s, i, arr) => {
            if (i > 0 && s - (arr[i - 1]) > 1) acc.push('...')
            acc.push(s)
            return acc
          }, [])
          .map((item, i) =>
            item === '...' ? (
              <span key={`dots-${i}`} className="px-1 text-gray-400">…</span>
            ) : (
              <button
                key={item}
                onClick={() => onSayfaDegistir(item)}
                className={cn(
                  'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                  mevcutSayfa === item
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 hover:bg-gray-200'
                )}
              >
                {item}
              </button>
            )
          )}
        <button
          onClick={() => onSayfaDegistir(mevcutSayfa + 1)}
          disabled={mevcutSayfa >= toplamSayfa}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
