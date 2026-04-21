import { Eye, Trash2, Download } from 'lucide-react'
import type { UretimEmri, UretimEmriDurum } from '@/types/uretim'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

interface Props {
  emirler: UretimEmri[]
  yukleniyor: boolean
  onGoruntule: (emir: UretimEmri) => void
  onSil: (emir: UretimEmri) => void
  onSiparisAc: (siparisId: string) => void
}

const DURUM_STIL: Record<UretimEmriDurum, string> = {
  hazirlaniyor: 'bg-gray-100 text-gray-600',
  onaylandi: 'bg-blue-50 text-blue-700',
  export_edildi: 'bg-orange-50 text-orange-700',
  yikamada: 'bg-cyan-50 text-cyan-700',
  tamamlandi: 'bg-green-50 text-green-700',
  eksik_var: 'bg-red-50 text-red-700',
}

const DURUM_ETIKET: Record<UretimEmriDurum, string> = {
  hazirlaniyor: 'Hazırlanıyor',
  onaylandi: 'Onaylandı',
  export_edildi: 'Export Edildi',
  yikamada: 'Yıkamada',
  tamamlandi: 'Tamamlandı',
  eksik_var: 'Eksik Var',
}

export default function UretimListesi({ emirler, yukleniyor, onGoruntule, onSil, onSiparisAc }: Props) {

  if (yukleniyor) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Yükleniyor...</div>
  }

  if (emirler.length === 0) return null

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
              className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
            >
              <td className="px-4 py-3 font-mono font-semibold text-gray-800">{emir.batch_no}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(emir.olusturulma_tarihi)}</td>
              <td className="px-4 py-3">
                <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', DURUM_STIL[emir.durum])}>
                  {DURUM_ETIKET[emir.durum]}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">
                {emir.export_tarihi ? (
                  <span className="flex items-center gap-1 text-orange-700">
                    <Download size={12} />
                    {formatDate(emir.export_tarihi)}
                  </span>
                ) : '—'}
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
                    title="Görüntüle / Düzenle"
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    onClick={() => onSil(emir)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Sil"
                  >
                    <Trash2 size={15} />
                  </button>
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
