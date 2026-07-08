import { Eye, Trash2, Ban, Inbox } from 'lucide-react'
import type { UretimEmri, UretimEmriDurum } from '@/types/uretim'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { TableSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'

interface Props {
  emirler: UretimEmri[]
  yukleniyor: boolean
  aktifFiltre: string
  onGoruntule: (emir: UretimEmri) => void
  onSil: (emir: UretimEmri) => void
  onIptal: (emir: UretimEmri) => void
  onSiparisAc: (siparisId: string) => void
}

// Satır sol kenar rengi
const DURUM_KENAR: Record<UretimEmriDurum, string> = {
  hazirlaniyor: 'border-l-4 border-l-gray-300',
  export_edildi: 'border-l-4 border-l-orange-400',
  yikamada:     'border-l-4 border-l-cyan-400',
  tamamlandi:   'border-l-4 border-l-green-400',
  eksik_var:    'border-l-4 border-l-red-400',
  iptal:        'border-l-4 border-l-red-300',
}

// Satır arka plan tonu
const DURUM_SATIR_BG: Record<UretimEmriDurum, string> = {
  hazirlaniyor: '',
  export_edildi: 'bg-orange-50/40',
  yikamada:     'bg-cyan-50/40',
  tamamlandi:   'bg-green-50/40',
  eksik_var:    'bg-red-50/40',
  iptal:        'bg-gray-50/60 opacity-70',
}

export default function UretimListesi({ emirler, yukleniyor, aktifFiltre, onGoruntule, onSil, onIptal, onSiparisAc }: Props) {

  if (yukleniyor) {
    return <TableSkeleton satir={6} kolon={7} />
  }

  if (emirler.length === 0) return (
    <EmptyState icon={Inbox} baslik="Bu filtrede kayit yok" boyut="md" className="border-2 border-dashed border-gray-200 rounded-xl" />
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500 font-medium">
            <th className="px-4 py-3">Batch No</th>
            <th className="px-4 py-3">Oluşturma Tarihi</th>
            <th className="px-4 py-3">Durum</th>
            <th className="px-4 py-3">Export Tarihi</th>
            <th className="px-4 py-3">Cam Adedi</th>
            <th className="px-4 py-3">Siparişler</th>
            <th className="px-4 py-3 text-right">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {emirler.map((emir) => (
            <tr
              key={emir.id}
              className={cn(
                'border-b border-gray-100 last:border-0 transition-colors',
                DURUM_KENAR[emir.durum],
                DURUM_SATIR_BG[emir.durum],
                'hover:brightness-95',
              )}
            >
              <td className="px-4 py-3 font-mono font-semibold text-gray-800">{emir.batch_no}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(emir.olusturulma_tarihi)}</td>
              <td className="px-4 py-3">
                <StatusBadge durum={emir.durum} tip="uretim" />
              </td>
              <td className="px-4 py-3 text-gray-600">
                {emir.export_tarihi ? formatDate(emir.export_tarihi) : '—'}
              </td>
              <td className="px-4 py-3">
                {emir.cam_sayisi != null ? (
                  <span className="text-sm font-semibold text-gray-700">{emir.cam_sayisi}</span>
                ) : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {(emir.siparis_listesi ?? []).map((sip) => (
                    <button
                      key={sip.id}
                      onClick={() => onSiparisAc(sip.id)}
                      className="group flex flex-col items-start px-2 py-1 rounded-lg bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 transition-colors text-left"
                      title={`${sip.siparis_no} — ${sip.musteri_ad}`}
                    >
                      <span className="font-mono text-xs font-semibold text-gray-700 group-hover:text-blue-700">{sip.siparis_no}</span>
                      <span className="text-xs text-gray-400 group-hover:text-blue-500 leading-tight">{sip.musteri_ad}</span>
                      {sip.alt_musteri && (
                        <span className="text-xs text-blue-600 group-hover:text-blue-700 leading-tight font-medium">{sip.alt_musteri}</span>
                      )}
                      {sip.ref_no && (
                        <span className="font-mono text-xs text-gray-500 group-hover:text-blue-500 leading-tight bg-gray-100 group-hover:bg-blue-100 px-1 rounded mt-0.5">{sip.ref_no}</span>
                      )}
                    </button>
                  ))}
                  {(emir.siparis_listesi ?? []).length === 0 && <span className="text-gray-400">—</span>}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onGoruntule(emir)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Görüntüle"
                  >
                    <Eye size={15} />
                  </button>
                  {emir.durum === 'hazirlaniyor' && (
                    <button
                      onClick={() => onIptal(emir)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      title="Batch'i İptal Et"
                    >
                      <Ban size={15} />
                    </button>
                  )}
                  {aktifFiltre === 'iptal' && (
                    <button
                      onClick={() => onSil(emir)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Sil"
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
        {emirler.length} üretim emri
      </div>
    </div>
  )
}
