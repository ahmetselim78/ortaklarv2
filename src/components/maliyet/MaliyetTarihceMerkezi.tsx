import { ReceiptText, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { MaliyetTarihceUrunu } from '@/types/maliyet'
import MaliyetTarihcesiPaneli from './MaliyetTarihcesiPaneli'
import UrunMaliyetTarihcesiPaneli from './UrunMaliyetTarihcesiPaneli'

type TarihceGorunumu = 'urun_maliyeti' | 'alis_fiyati'

export default function MaliyetTarihceMerkezi({
  urunler,
}: {
  urunler: MaliyetTarihceUrunu[]
}) {
  const [gorunum, setGorunum] = useState<TarihceGorunumu>('urun_maliyeti')

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-2">
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Maliyet tarihçesi görünümü">
          <button
            type="button"
            aria-pressed={gorunum === 'urun_maliyeti'}
            onClick={() => setGorunum('urun_maliyeti')}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition',
              gorunum === 'urun_maliyeti'
                ? 'border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-100'
                : 'border-transparent text-gray-600 hover:bg-gray-50',
            )}
          >
            <span className={cn(
              'rounded-lg p-2',
              gorunum === 'urun_maliyeti' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500',
            )}>
              <TrendingUp size={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold">Ürün maliyetleri</span>
              <span className="mt-0.5 block text-xs opacity-70">Reçete, kaynak, fire ve temper dahil</span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={gorunum === 'alis_fiyati'}
            onClick={() => setGorunum('alis_fiyati')}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition',
              gorunum === 'alis_fiyati'
                ? 'border-violet-500 bg-violet-50 text-violet-900 ring-2 ring-violet-100'
                : 'border-transparent text-gray-600 hover:bg-gray-50',
            )}
          >
            <span className={cn(
              'rounded-lg p-2',
              gorunum === 'alis_fiyati' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500',
            )}>
              <ReceiptText size={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold">Alış fiyatı geçmişi</span>
              <span className="mt-0.5 block text-xs opacity-70">Cam, çıta ve sarf fiyat kayıtları</span>
            </span>
          </button>
        </div>
      </section>

      {gorunum === 'urun_maliyeti'
        ? <UrunMaliyetTarihcesiPaneli urunler={urunler} />
        : <MaliyetTarihcesiPaneli />}
    </div>
  )
}
