import { useEffect, useState } from 'react'
import { X, Plus, Trash2, Download } from 'lucide-react'
import type { UretimEmri, UretimEmriDetay, UretimEmriDurum } from '@/types/uretim'
import type { SiparisDetay } from '@/types/siparis'
import {
  getBatchDetaylari,
  batcheCamEkle,
  batchtenCamCikar,
} from '@/hooks/useUretim'
import { exportDetaylariCSV, exportTarihiGuncelle } from '@/services/exportService'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface Props {
  emir: UretimEmri
  onDurumDegisti: (id: string, durum: UretimEmriDurum) => Promise<void>
  onKapat: () => void
  onGuncellendi: () => void
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

export default function UretimDetayModal({ emir, onDurumDegisti, onKapat, onGuncellendi }: Props) {
  const [detaylar, setDetaylar] = useState<UretimEmriDetay[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [exportYapiliyor, setExportYapiliyor] = useState(false)

  // Sipariş detaylarından cam ekleme paneli
  const [camPaneliAcik, setCamPaneliAcik] = useState(false)
  const [eklenebilirCamlar, setEklenebilirCamlar] = useState<SiparisDetay[]>([])
  const [camArama, setCamArama] = useState('')
  const [ekleniyor, setEkleniyor] = useState<string | null>(null)

  const detaylariGetir = async () => {
    setYukleniyor(true)
    const data = await getBatchDetaylari(emir.id)
    setDetaylar(data)
    setYukleniyor(false)
  }

  useEffect(() => { detaylariGetir() }, [emir.id])

  // Batch'e henüz eklenmemiş, onaylanmış kamları getir
  const eklenebilirGetir = async () => {
    const ekliIds = detaylar.map((d) => d.siparis_detay_id)

    const { data } = await supabase
      .from('siparis_detaylari')
      .select('*, stok!stok_id(ad), siparisler(siparis_no, cari(ad))')
      .order('cam_kodu')

    const filtrelenmis = (data as SiparisDetay[]).filter(
      (c) => !ekliIds.includes(c.id)
    )
    setEklenebilirCamlar(filtrelenmis)
  }

  const handlePaneliAc = async () => {
    await eklenebilirGetir()
    setCamPaneliAcik(true)
  }

  const handleCamEkle = async (siparisBatchId: string) => {
    setEkleniyor(siparisBatchId)
    try {
      await batcheCamEkle(emir.id, siparisBatchId)
      await detaylariGetir()
      await eklenebilirGetir()
      onGuncellendi()
    } finally {
      setEkleniyor(null)
    }
  }

  const handleCamCikar = async (uretimDetayId: string) => {
    await batchtenCamCikar(uretimDetayId)
    await detaylariGetir()
    onGuncellendi()
  }

  const handleExport = async () => {
    setExportYapiliyor(true)
    try {
      exportDetaylariCSV(detaylar, emir.batch_no)
      await exportTarihiGuncelle(emir.id)
      onGuncellendi()
    } finally {
      setExportYapiliyor(false)
    }
  }

  const aramaFiltresi = eklenebilirCamlar.filter((c) => {
    const q = camArama.toLowerCase()
    return (
      c.cam_kodu.toLowerCase().includes(q) ||
      (c as any).siparisler?.siparis_no?.toLowerCase().includes(q) ||
      (c as any).siparisler?.cari?.ad?.toLowerCase().includes(q) ||
      (c as any).stok?.ad?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{emir.batch_no}</h2>
            <p className="text-sm text-gray-500">{detaylar.length} cam parçası</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Durum badge — sadece hazirlaniyor iken tıklanabilir (onaylandi'ya geçer) */}
            <button
              onClick={() => emir.durum === 'hazirlaniyor' && onDurumDegisti(emir.id, 'onaylandi')}
              disabled={emir.durum !== 'hazirlaniyor'}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                DURUM_STIL[emir.durum],
                emir.durum === 'hazirlaniyor' && 'cursor-pointer hover:bg-blue-100 hover:text-blue-700 ring-1 ring-blue-300',
                emir.durum !== 'hazirlaniyor' && 'cursor-default'
              )}
              title={emir.durum === 'hazirlaniyor' ? 'Tıklayarak Onayla' : DURUM_ETIKET[emir.durum]}
            >
              {DURUM_ETIKET[emir.durum]}
            </button>

            {/* Export Butonu */}
            <button
              onClick={handleExport}
              disabled={exportYapiliyor || detaylar.length === 0}
              className="flex items-center gap-2 px-4 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-40 transition-colors"
            >
              <Download size={14} />
              {exportYapiliyor ? 'İndiriliyor...' : 'CSV Export'}
            </button>

            <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sol: Batch'teki camlar */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Batch'teki Cam Parçaları</h3>
              <button
                onClick={handlePaneliAc}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus size={13} /> Cam Ekle
              </button>
            </div>

            {yukleniyor ? (
              <div className="text-center py-10 text-gray-400">Yükleniyor...</div>
            ) : detaylar.length === 0 ? (
              <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                <p className="font-medium">Henüz cam eklenmedi</p>
                <p className="text-xs mt-1">"Cam Ekle" butonuyla sipariş detaylarından ekleyin.</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Cam Kodu</th>
                      <th className="px-3 py-2">Sipariş / Müşteri</th>
                      <th className="px-3 py-2">Cam Cinsi</th>
                      <th className="px-3 py-2">Boyut (mm)</th>
                      <th className="px-3 py-2">Adet</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detaylar.map((d, i) => {
                      const cam = d.siparis_detaylari
                      return (
                        <tr key={d.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2">
                            <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">
                              {cam?.cam_kodu}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            <div className="font-medium">{cam?.siparisler?.cari?.ad}</div>
                            <div className="text-gray-400">{cam?.siparisler?.siparis_no}</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">{cam?.stok?.ad ?? '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {cam?.genislik_mm} × {cam?.yukseklik_mm}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">{cam?.adet}</td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => handleCamCikar(d.id)}
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                              title="Batch'ten çıkar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sağ: Cam ekleme paneli */}
          {camPaneliAcik && (
            <div className="w-80 border-l border-gray-100 flex flex-col shrink-0">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-semibold text-gray-700">Cam Seç</h3>
                <button
                  onClick={() => { setCamPaneliAcik(false); setCamArama('') }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="p-3 border-b border-gray-100 shrink-0">
                <input
                  type="text"
                  placeholder="Kod, müşteri veya sipariş ara..."
                  value={camArama}
                  onChange={(e) => setCamArama(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {aramaFiltresi.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400">
                    {camArama ? 'Sonuç bulunamadı' : 'Tüm camlar zaten eklendi'}
                  </div>
                ) : (
                  aramaFiltresi.map((cam) => (
                    <div
                      key={cam.id}
                      className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50"
                    >
                      <div>
                        <div className="font-mono text-xs font-semibold text-blue-700">{cam.cam_kodu}</div>
                        <div className="text-xs text-gray-500">
                          {(cam as any).siparisler?.cari?.ad} · {(cam as any).stok?.ad ?? '—'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {cam.genislik_mm}×{cam.yukseklik_mm} · {cam.adet} adet
                        </div>
                      </div>
                      <button
                        onClick={() => handleCamEkle(cam.id)}
                        disabled={ekleniyor === cam.id}
                        className="ml-2 p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-40 transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
