import { useState, useEffect } from 'react'
import { Pencil, Trash2, Phone, Mail } from 'lucide-react'
import type { Cari } from '@/types/cari'
import { cn } from '@/lib/utils'
import Pagination from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'

interface Props {
  cariler: Cari[]
  yukleniyor: boolean
  onDuzenle: (cari: Cari) => void
  onSil: (cari: Cari) => void
}

const TIPLER = { musteri: 'Müşteri', tedarikci: 'Tedarikçi' }

export default function CariListesi({ cariler, yukleniyor, onDuzenle, onSil }: Props) {
  const [arama, setArama] = useState('')
  const [filtre, setFiltre] = useState<'hepsi' | 'musteri' | 'tedarikci'>('hepsi')

  const [sayfa, setSayfa] = useState(1)
  const SAYFA_BOYUTU = 20

  const filtrelenmis = cariler.filter((c) => {
    const aramaEslesi =
      c.ad.toLowerCase().includes(arama.toLowerCase()) ||
      c.kod.toLowerCase().includes(arama.toLowerCase())
    const filtreEslesi = filtre === 'hepsi' || c.tipi === filtre
    return aramaEslesi && filtreEslesi
  })

  const sayfali = filtrelenmis.slice((sayfa - 1) * SAYFA_BOYUTU, sayfa * SAYFA_BOYUTU)

  useEffect(() => { setSayfa(1) }, [arama, filtre])

  if (yukleniyor) {
    return <TableSkeleton satir={6} kolon={5} />
  }

  return (
    <div className="space-y-4">
      {/* Arama ve Filtre */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Ad veya kod ile ara..."
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['hepsi', 'musteri', 'tedarikci'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFiltre(t)}
              className={cn(
                'px-4 py-2 transition-colors',
                filtre === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {t === 'hepsi' ? 'Hepsi' : TIPLER[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Tablo */}
      {filtrelenmis.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {arama ? 'Arama sonucu bulunamadı.' : 'Henüz cari kaydı yok.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500 font-medium">
                <th className="px-4 py-3">Kod</th>
                <th className="px-4 py-3">Ad</th>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3">İletişim</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {sayfali.map((cari) => (
                <tr
                  key={cari.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-gray-500">{cari.kod}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{cari.ad}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-xs font-medium',
                        cari.tipi === 'musteri'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-orange-50 text-orange-700'
                      )}
                    >
                      {TIPLER[cari.tipi]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <div className="flex flex-col gap-0.5">
                      {cari.telefon && (
                        <span className="flex items-center gap-1">
                          <Phone size={12} /> {cari.telefon}
                        </span>
                      )}
                      {cari.email && (
                        <span className="flex items-center gap-1">
                          <Mail size={12} /> {cari.email}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onDuzenle(cari)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Düzenle"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => onSil(cari)}
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
          <Pagination
            toplamKayit={filtrelenmis.length}
            sayfaBoyutu={SAYFA_BOYUTU}
            mevcutSayfa={sayfa}
            onSayfaDegistir={setSayfa}
          />
        </div>
      )}
    </div>
  )
}
