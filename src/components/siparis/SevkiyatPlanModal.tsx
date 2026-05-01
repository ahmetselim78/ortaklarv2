import { useState } from 'react'
import { Truck, X, PackageCheck } from 'lucide-react'
import { useAraclar, sevkiyatKaydet } from '@/hooks/useSevkiyat'
import { cn } from '@/lib/utils'
import { useEscape } from '@/hooks/useEscape'

interface Props {
  siparisId: string
  siparisNo: string
  teslimTarihi: string | null
  onKapat: () => void
}

export default function SevkiyatPlanModal({ siparisId, siparisNo, teslimTarihi, onKapat }: Props) {
  useEscape(onKapat)
  const { araclar, yukleniyor } = useAraclar()
  const [teslimatTipi, setTeslimatTipi] = useState<'teslim_alacak' | 'sevkiyat' | null>(null)
  const [aracId, setAracId] = useState('')
  const [tarih, setTarih] = useState(teslimTarihi ?? '')
  const [notlar, setNotlar] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  const handleKaydet = async () => {
    if (!aracId || !tarih) return
    setKaydediliyor(true)
    setHata(null)
    try {
      await sevkiyatKaydet(siparisId, aracId, tarih, notlar)
      onKapat()
    } catch (e: unknown) {
      setHata(e instanceof Error ? e.message : 'Bir hata oluştu')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        {/* Başlık */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Truck size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Teslimat Tipi</h3>
              <p className="text-xs text-gray-400">{siparisNo}</p>
            </div>
          </div>
          <button onClick={onKapat} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        {/* Seçim Kartları */}
        {!teslimatTipi && (
          <>
            <p className="text-sm text-gray-500 mb-4">Bu sipariş nasıl teslim edilecek?</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                onClick={() => setTeslimatTipi('teslim_alacak')}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-all"
              >
                <PackageCheck size={28} className="text-gray-400" />
                <div className="text-center">
                  <div className="text-sm font-semibold text-gray-600">Teslim Alacak</div>
                  <div className="text-xs text-gray-400 mt-0.5">Müşteri gelip alacak</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setTeslimatTipi('sevkiyat')}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-all"
              >
                <Truck size={28} className="text-gray-400" />
                <div className="text-center">
                  <div className="text-sm font-semibold text-gray-600">Sevkiyat</div>
                  <div className="text-xs text-gray-400 mt-0.5">Araçla teslim edilecek</div>
                </div>
              </button>
            </div>
            <button
              onClick={onKapat}
              className="w-full px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              Atla
            </button>
          </>
        )}

        {/* Teslim Alacak → Onayla */}
        {teslimatTipi === 'teslim_alacak' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
              <PackageCheck size={20} className="text-green-600 shrink-0" />
              <p className="text-sm text-green-700">Müşteri siparişi gelip teslim alacak.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTeslimatTipi(null)}
                className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Geri
              </button>
              <button
                onClick={onKapat}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                Tamam
              </button>
            </div>
          </div>
        )}

        {/* Sevkiyat → Araç / Tarih formu */}
        {teslimatTipi === 'sevkiyat' && (
          <div className="space-y-3">
            {/* Araç */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Araç</label>
              {yukleniyor ? (
                <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <select
                  value={aracId}
                  onChange={e => setAracId(e.target.value)}
                  className={cn(
                    'w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500',
                    !aracId ? 'border-gray-200' : 'border-gray-200'
                  )}
                >
                  <option value="">Araç seçin…</option>
                  {araclar.map(a => (
                    <option key={a.id} value={a.id}>{a.ad} — {a.plaka}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Tarih */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sevkiyat Tarihi</label>
              <input
                type="date"
                value={tarih}
                onChange={e => setTarih(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Notlar */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Not (isteğe bağlı)</label>
              <input
                type="text"
                value={notlar}
                onChange={e => setNotlar(e.target.value)}
                placeholder="Sevkiyat notu…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {hata && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{hata}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setTeslimatTipi(null)}
                className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Geri
              </button>
              <button
                onClick={handleKaydet}
                disabled={!aracId || !tarih || kaydediliyor}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {kaydediliyor ? 'Kaydediliyor…' : 'Planla'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
