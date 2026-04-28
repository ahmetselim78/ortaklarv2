import { Eye, Ban, Wrench, Trash2 } from 'lucide-react'
import type { Siparis, SiparisDurum } from '@/types/siparis'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { TableSkeleton } from '@/components/ui/Skeleton'

interface Props {
  siparisler: Siparis[]
  yukleniyor: boolean
  tamirdeSiparisIds?: Set<string>
  onGoruntule: (siparis: Siparis) => void
  onIptal: (siparis: Siparis) => void
  onSil?: (siparis: Siparis) => void
  silGoster?: boolean
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

export default function SiparisListesi({ siparisler, yukleniyor, tamirdeSiparisIds, onGoruntule, onIptal, onSil, silGoster }: Props) {
  if (yukleniyor) {
    return <TableSkeleton satir={6} kolon={5} />
  }

  if (siparisler.length === 0) return null

  function extractRefNo(notlar: string | null): string | null {
    if (!notlar) return null
    const m = notlar.match(/Sipariş No:\s*([^\s/]+)/)
    return m ? m[1] : null
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500 font-medium">
            <th className="px-4 py-3">Sipariş No</th>
            <th className="px-4 py-3">Müşteri</th>
            <th className="px-4 py-3">Adet</th>
            <th className="px-4 py-3">Sipariş No</th>
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
              <td className="px-4 py-3 font-mono font-medium text-gray-800">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-block w-2 h-2 rounded-full shrink-0',
                      s.kaynak === 'pdf' ? 'bg-green-500' : 'bg-blue-500'
                    )}
                    title={s.kaynak === 'pdf' ? 'PDF\'den içe aktarıldı' : 'Manuel girildi'}
                  />
                  {s.siparis_no}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-700">
                <div className="font-medium">{s.cari?.ad ?? '—'}</div>
                {s.alt_musteri && (
                  <div className="text-xs text-blue-600 font-medium mt-0.5">{s.alt_musteri}</div>
                )}
                <div className="text-xs text-gray-400">{s.cari?.kod}</div>
              </td>
              <td className="px-4 py-3">
                {(() => {
                  const adet = s.siparis_detaylari?.[0]?.count ?? null
                  return adet !== null
                    ? <span className="text-xs text-gray-500">{adet} adet</span>
                    : <span className="text-gray-300">—</span>
                })()}
              </td>
              <td className="px-4 py-3">
                {extractRefNo(s.notlar)
                  ? <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{extractRefNo(s.notlar)}</span>
                  : <span className="text-gray-300">—</span>
                }
              </td>
              <td className="px-4 py-3 text-gray-600">{formatDate(s.tarih)}</td>
              <td className="px-4 py-3 text-gray-600">
                <div>{s.teslim_tarihi ? formatDate(s.teslim_tarihi) : '—'}</div>
                {(() => {
                  const plan = s.sevkiyat_planlari?.[0]
                  const isSevkiyat = s.teslimat_tipi === 'sevkiyat' || !!plan
                  if (isSevkiyat) {
                    return (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                          🚚 Sevkiyat
                        </span>
                        {plan && <span className="text-[10px] text-gray-400">{formatDate(plan.tarih)}</span>}
                      </div>
                    )
                  }
                  return (
                    <div className="mt-0.5">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-400">
                        Teslim Alacak
                      </span>
                    </div>
                  )
                })()}
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
                  ) : s.durum === 'tamamlandi' ? (
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', DURUM_STIL[s.durum])}>
                        {DURUM_ETIKET[s.durum]}
                      </span>
                      <span className="text-xs font-medium text-gray-700 pl-0.5">
                        {s.tamamlandi_tarihi
                          ? formatDate(s.tamamlandi_tarihi)
                          : formatDate(s.created_at)}
                      </span>
                    </div>
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
                  {s.durum === 'iptal' && onSil && silGoster && (
                    <button
                      onClick={() => onSil(s)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                      title="Kalıcı Sil"
                    >
                      <Trash2 size={15} />
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
