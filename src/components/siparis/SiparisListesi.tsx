import { Eye, Ban, Wrench } from 'lucide-react'
import type { Siparis, SiparisDurum } from '@/types/siparis'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

interface Props {
  siparisler: Siparis[]
  yukleniyor: boolean
  tamirdeSiparisIds?: Set<string>
  onGoruntule: (siparis: Siparis) => void
  onIptal: (siparis: Siparis) => void
}

const DURUM_STIL: Record<SiparisDurum, string> = {
  beklemede: 'bg-gray-100 text-gray-600',
  batchte: 'bg-blue-50 text-blue-700',
  yikamada: 'bg-cyan-50 text-cyan-700',
  tamamlandi: 'bg-green-50 text-green-700',
  eksik_var: 'bg-red-50 text-red-600',
  iptal: 'bg-red-50 text-red-600',
}

const DURUM_ETIKET: Record<SiparisDurum, string> = {
  beklemede: 'Beklemede',
  batchte: 'Batch\'te',
  yikamada: 'Yıkamada',
  tamamlandi: 'Tamamlandı',
  eksik_var: 'Eksik Var',
  iptal: 'İptal',
}

export default function SiparisListesi({ siparisler, yukleniyor, tamirdeSiparisIds, onGoruntule, onIptal }: Props) {
  if (yukleniyor) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Yükleniyor...</div>
  }

  if (siparisler.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500 font-medium">
            <th className="px-4 py-3">Sipariş No</th>
            <th className="px-4 py-3">Müşteri</th>
            <th className="px-4 py-3">Tarih</th>
            <th className="px-4 py-3">Teslim</th>
            <th className="px-4 py-3">Durum</th>
            <th className="px-4 py-3 text-right">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {siparisler.map((s) => (
            <tr
              key={s.id}
              className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
            >
              <td className="px-4 py-3 font-mono font-medium text-gray-800">{s.siparis_no}</td>
              <td className="px-4 py-3 text-gray-700">
                <div className="font-medium">{s.cari?.ad ?? '—'}</div>
                <div className="text-xs text-gray-400">{s.cari?.kod}</div>
              </td>
              <td className="px-4 py-3 text-gray-600">{formatDate(s.tarih)}</td>
              <td className="px-4 py-3 text-gray-600">
                {s.teslim_tarihi ? formatDate(s.teslim_tarihi) : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {s.durum === 'yikamada' ? (
                    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', DURUM_STIL[s.durum])}>
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500" />
                      </span>
                      {DURUM_ETIKET[s.durum]}
                    </span>
                  ) : (
                    <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', DURUM_STIL[s.durum])}>
                      {DURUM_ETIKET[s.durum]}
                    </span>
                  )}
                  {tamirdeSiparisIds?.has(s.id) && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200" title="Tamirde cam var">
                      <Wrench size={10} />
                      Tamirde
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onGoruntule(s)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Görüntüle"
                  >
                    <Eye size={15} />
                  </button>
                  {s.durum === 'beklemede' && (
                    <button
                      onClick={() => onIptal(s)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="İptal Et"
                    >
                      <Ban size={15} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
        {siparisler.length} sipariş
      </div>
    </div>
  )
}
