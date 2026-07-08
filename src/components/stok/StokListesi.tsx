import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Stok, StokKategori } from '@/types/stok'
import Pagination from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { normalizeCamAilesiAd } from '@/lib/cam'

interface Props {
  stoklar: Stok[]
  yukleniyor: boolean
  kategori: StokKategori
  onDuzenle: (stok: Stok) => void
  onSil: (stok: Stok) => void
}

export default function StokListesi({ stoklar, yukleniyor, kategori, onDuzenle, onSil }: Props) {
  const [arama, setArama] = useState('')

  const [sayfa, setSayfa] = useState(1)
  const SAYFA_BOYUTU = 20
  const stokAd = (stok: Stok) => stok.kategori === 'cam' ? normalizeCamAilesiAd(stok.ad) : stok.ad

  const filtrelenmis = stoklar
    .filter((s) => s.kategori === kategori)
    .filter(
      (s) =>
        stokAd(s).toLowerCase().includes(arama.toLowerCase()) ||
        s.ad.toLowerCase().includes(arama.toLowerCase()) ||
        s.kod.toLowerCase().includes(arama.toLowerCase()) ||
        (s.tedarikci_ad ?? '').toLowerCase().includes(arama.toLowerCase())
    )

  const toplamSayfa = Math.max(1, Math.ceil(filtrelenmis.length / SAYFA_BOYUTU))
  const mevcutSayfa = Math.min(sayfa, toplamSayfa)
  const sayfali = filtrelenmis.slice((mevcutSayfa - 1) * SAYFA_BOYUTU, mevcutSayfa * SAYFA_BOYUTU)

  if (yukleniyor) {
    return <TableSkeleton satir={6} kolon={5} />
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Ad veya kod ile ara..."
        value={arama}
        onChange={(e) => {
          setArama(e.target.value)
          setSayfa(1)
        }}
        className="w-full max-w-sm rounded-lg border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {filtrelenmis.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {arama ? 'Arama sonucu bulunamadı.' : 'Henüz stok kaydı yok.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500 font-medium">
                <th className="px-4 py-3">Kod</th>
                <th className="px-4 py-3">{kategori === 'cam' ? 'Cam Ailesi' : 'Ad'}</th>
                <th className="px-4 py-3">{kategori === 'cam' ? 'Kapsam' : kategori === 'cita' ? 'Boyut' : 'Ölçü'}</th>
                {kategori !== 'cam' && <th className="px-4 py-3">Tedarikçi</th>}
                <th className="px-4 py-3">Birim Fiyat</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {sayfali.map((stok) => (
                <tr
                  key={stok.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-gray-500">{stok.kod}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{stokAd(stok)}</div>
                    {kategori === 'cam' && stokAd(stok) !== stok.ad.trim() && (
                      <div className="text-xs text-gray-400">Eski ad: {stok.ad}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {kategori === 'cam' ? (
                      <div>
                        <span className="inline-flex rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                          Aile stoğu
                        </span>
                        <div className="mt-1 text-xs text-gray-400">Katman siparişte</div>
                      </div>
                    ) : stok.kalinlik_mm ? `${stok.kalinlik_mm} mm` : '—'}
                  </td>
                  {kategori !== 'cam' && (
                    <td className="px-4 py-3 text-gray-600">{stok.tedarikci_ad ?? '—'}</td>
                  )}
                  <td className="px-4 py-3 text-gray-600">
                    {stok.birim_fiyat
                      ? `${Number(stok.birim_fiyat).toLocaleString('tr-TR')} ₺ / ${stok.birim}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onDuzenle(stok)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Düzenle"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => onSil(stok)}
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
            mevcutSayfa={mevcutSayfa}
            onSayfaDegistir={setSayfa}
          />
        </div>
      )}
    </div>
  )
}
