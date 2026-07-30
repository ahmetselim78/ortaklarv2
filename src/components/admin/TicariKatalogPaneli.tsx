import { useMemo, useState } from 'react'
import { AlertCircle, Loader2, Search } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { useStok } from '@/hooks/useStok'

function satisKapsaminda(kapsam: string) {
  return kapsam === 'satilabilir' || kapsam === 'her_ikisi'
}

function maliyetKapsaminda(kapsam: string) {
  return kapsam === 'maliyet_bileseni' || kapsam === 'her_ikisi'
}

export default function TicariKatalogPaneli() {
  const { stoklar, yukleniyor, hata, satisKapsamiAyarla } = useStok()
  const { hasPermission } = useAuth()
  const degistirebilir = hasPermission('pricing', 'update') || hasPermission('admin', 'manage')
  const [arama, setArama] = useState('')
  const [kaydedilen, setKaydedilen] = useState<string | null>(null)
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null)

  const filtrelenmis = useMemo(() => {
    const query = arama.trim().toLocaleLowerCase('tr-TR')
    return stoklar.filter((stok) => !query || [stok.kod, stok.ad, stok.grup]
      .some((deger) => deger?.toLocaleLowerCase('tr-TR').includes(query)))
  }, [arama, stoklar])

  const toggle = async (id: string, etkin: boolean) => {
    setKaydedilen(id)
    setIslemHatasi(null)
    try {
      await satisKapsamiAyarla(id, etkin)
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : 'Ticari kapsam değiştirilemedi.')
    } finally {
      setKaydedilen(null)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Ticari Katalog</h3>
          <p className="mt-1 text-sm text-gray-500">
            Satışa sunulacak stok kartlarını belirleyin. Maliyet kapsamı, Maliyet Hesaplama ekranında
            stoktan bileşen oluşturulduğunda bağımsız olarak korunur.
          </p>
        </div>

        {(hata || islemHatasi) && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5" /> {islemHatasi || hata}
          </div>
        )}

        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={arama}
            onChange={(event) => setArama(event.target.value)}
            placeholder="Stok kodu, adı veya grubu ara…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Stok</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Maliyet kapsamı</th>
                  <th className="px-4 py-3 text-right">Satılabilir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {yukleniyor ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-500">Katalog yükleniyor…</td></tr>
                ) : filtrelenmis.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-500">Kayıt bulunamadı.</td></tr>
                ) : filtrelenmis.map((stok) => {
                  const satilabilir = satisKapsaminda(stok.ticari_kapsam)
                  return (
                    <tr key={stok.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{stok.ad}</div>
                        <div className="mt-0.5 font-mono text-xs text-gray-500">{stok.kod}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {stok.kategori === 'cam' ? 'Cam' : stok.kategori === 'cita' ? 'Çıta' : 'Yan Malzeme'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={maliyetKapsaminda(stok.ticari_kapsam)
                          ? 'rounded-full bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700'
                          : 'text-xs text-gray-400'}>
                          {maliyetKapsaminda(stok.ticari_kapsam) ? 'Maliyet bileşeni' : 'Kapsam dışı'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={satilabilir}
                          disabled={!degistirebilir || kaydedilen === stok.id}
                          onClick={() => void toggle(stok.id, !satilabilir)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${satilabilir ? 'bg-blue-600' : 'bg-gray-300'}`}
                          title={degistirebilir ? 'Satış kapsamını değiştir' : 'Fiyatlandırma güncelleme yetkisi gerekli'}
                        >
                          {kaydedilen === stok.id ? (
                            <Loader2 size={13} className="mx-auto animate-spin text-white" />
                          ) : (
                            <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${satilabilir ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
