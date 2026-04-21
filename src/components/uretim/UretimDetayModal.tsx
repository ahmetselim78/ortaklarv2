import { useEffect, useState, useMemo } from 'react'
import { X, Download, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import type { UretimEmri, UretimEmriDetay, UretimEmriDurum } from '@/types/uretim'
import type { Siparis } from '@/types/siparis'
import {
  getBatchDetaylari,
} from '@/hooks/useUretim'
import { exportDetaylariCSV, exportTarihiGuncelle } from '@/services/exportService'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useStok } from '@/hooks/useStok'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SiparisDetayModal from '@/components/siparis/SiparisDetayModal'

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
  const [onayDialogAcik, setOnayDialogAcik] = useState(false)
  const [exportDialogAcik, setExportDialogAcik] = useState(false)
  const [onayYapiliyor, setOnayYapiliyor] = useState(false)
  const [kapaliGruplar, setKapaliGruplar] = useState<Set<string>>(new Set())
  const [secilenSiparis, setSecilenSiparis] = useState<Siparis | null>(null)
  const { stoklar } = useStok()

  const handleSiparisAc = async (e: React.MouseEvent, siparisId: string) => {
    e.stopPropagation()
    const { data, error } = await supabase
      .from('siparisler')
      .select('*, cari(ad, kod)')
      .eq('id', siparisId)
      .single()
    if (!error && data) setSecilenSiparis(data as Siparis)
  }

  const detaylariGetir = async () => {
    setYukleniyor(true)
    const data = await getBatchDetaylari(emir.id)
    setDetaylar(data)
    setYukleniyor(false)
  }

  useEffect(() => { detaylariGetir() }, [emir.id])


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

  // Detayları müşteri adı + sipariş no'ya göre grupla
  type Grup = { musteriAd: string; siparisNo: string; siparisId: string; renkIndex: number; satirlar: UretimEmriDetay[] }
  const RENK_SINIFI = [
    { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
    { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
    { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
    { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' },
    { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' },
    { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700' },
  ]

  const { gruplar, musteriRenk } = useMemo(() => {
    const gruplar: Grup[] = []
    const musteriRenk: Record<string, number> = {}
    let renkSayac = 0
    for (const d of detaylar) {
      const musteriAd = d.siparis_detaylari?.siparisler?.cari?.ad ?? '—'
      const siparisNo = d.siparis_detaylari?.siparisler?.siparis_no ?? '—'
      if (!(musteriAd in musteriRenk)) {
        musteriRenk[musteriAd] = renkSayac++ % RENK_SINIFI.length
      }
      const siparisId = d.siparis_detaylari?.siparisler?.id ?? ''
      const mevcutGrup = gruplar.find((g) => g.musteriAd === musteriAd && g.siparisNo === siparisNo)
      if (mevcutGrup) {
        mevcutGrup.satirlar.push(d)
      } else {
        gruplar.push({ musteriAd, siparisNo, siparisId, renkIndex: musteriRenk[musteriAd], satirlar: [d] })
      }
    }
    return { gruplar, musteriRenk }
  }, [detaylar])

  const tumKapali = kapaliGruplar.size === gruplar.length && gruplar.length > 0

  const toggleTumu = () => {
    if (tumKapali) {
      setKapaliGruplar(new Set())
    } else {
      setKapaliGruplar(new Set(gruplar.map((g) => `${g.musteriAd}||${g.siparisNo}`)))
    }
  }

  const toggleGrup = (key: string) => {
    setKapaliGruplar((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl flex flex-col h-[90vh]">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{emir.batch_no}</h2>
            <p className="text-sm text-gray-500">{detaylar.length} cam parçası</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Durum badge — sadece hazirlaniyor iken tıklanabilir (onaylandi'ya geçer) */}
            <button
              onClick={() => emir.durum === 'hazirlaniyor' && setOnayDialogAcik(true)}
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
              onClick={() => setExportDialogAcik(true)}
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
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Batch'teki Cam Parçaları</h3>
              {gruplar.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  {Object.entries(musteriRenk).map(([ad, ri]) => (
                    <span key={ad} className={cn('text-xs font-medium px-2 py-0.5 rounded-full', RENK_SINIFI[ri].badge)}>{ad}</span>
                  ))}
                  <button
                    onClick={toggleTumu}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg px-2 py-1 transition-colors"
                    title={tumKapali ? 'Tümünü Aç' : 'Tümünü Kıs'}
                  >
                    {tumKapali ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
                    {tumKapali ? 'Tümünü Aç' : 'Tümünü Kıs'}
                  </button>
                </div>
              )}
            </div>

            {yukleniyor ? (
              <div className="text-center py-10 text-gray-400">Yükleniyor...</div>
            ) : detaylar.length === 0 ? (
              <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                <p className="font-medium">Bu batch'te henüz cam bulunmuyor</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Tablo başlığı */}
                <div className="flex bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
                  <div className="w-8 px-3 py-2 shrink-0">#</div>
                  <div className="w-32 px-3 py-2 shrink-0">Cam Kodu</div>
                  <div className="flex-1 px-3 py-2">Cam Cinsi</div>
                  <div className="w-28 px-3 py-2 shrink-0">Boyut (mm)</div>
                  <div className="w-14 px-3 py-2 shrink-0">Adet</div>
                </div>

                {/* Gruplar */}
                {(() => {
                  let globalSira = 0
                  return gruplar.map((grup) => {
                    const renk = RENK_SINIFI[grup.renkIndex]
                    const grupKey = `${grup.musteriAd}||${grup.siparisNo}`
                    const kapali = kapaliGruplar.has(grupKey)
                    const baslangicSira = globalSira
                    globalSira += grup.satirlar.length
                    return (
                      <div key={grupKey} className="border-b border-gray-100 last:border-0">
                        {/* Grup başlığı */}
                        <div
                          className={cn('flex items-center gap-2 px-3 py-2 cursor-pointer select-none border-b', renk.bg, renk.border)}
                          onClick={() => toggleGrup(grupKey)}
                        >
                          <span className={cn('transition-transform duration-200 shrink-0', renk.text)}>
                            {kapali ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </span>
                          <span className={cn('font-semibold text-xs', renk.text)}>{grup.musteriAd}</span>
                          <span className="text-gray-300">·</span>
                          <button
                            onClick={(e) => grup.siparisId && handleSiparisAc(e, grup.siparisId)}
                            className={cn('font-mono text-xs underline underline-offset-2 hover:opacity-70 transition-opacity', renk.text)}
                            title="Siparişi görüntüle"
                          >
                            {grup.siparisNo}
                          </button>
                          <span className={cn('ml-auto text-xs font-medium px-2 py-0.5 rounded-full shrink-0', renk.badge)}>
                            {grup.satirlar.length} parça
                          </span>
                        </div>

                        {/* Animasyonlu içerik */}
                        <div
                          className={cn(
                            'overflow-hidden transition-all duration-200 ease-in-out',
                            kapali ? 'max-h-0 opacity-0' : 'max-h-[5000px] opacity-100'
                          )}
                        >
                          {grup.satirlar.map((d, i) => {
                            const satirNo = baslangicSira + i + 1
                            const cam = d.siparis_detaylari
                            return (
                              <div
                                key={d.id}
                                className="flex items-center border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
                              >
                                <div className="w-8 px-3 py-2 text-gray-400 text-xs shrink-0">{satirNo}</div>
                                <div className="w-32 px-3 py-2 shrink-0">
                                  <span className={cn('font-mono font-semibold px-2 py-0.5 rounded text-xs', renk.badge)}>
                                    {cam?.cam_kodu}
                                  </span>
                                </div>
                                <div className="flex-1 px-3 py-2 text-xs text-gray-600">{cam?.stok?.ad ?? '—'}</div>
                                <div className="w-28 px-3 py-2 text-xs text-gray-600 shrink-0">
                                  {cam?.genislik_mm} × {cam?.yukseklik_mm}
                                </div>
                                <div className="w-14 px-3 py-2 text-xs text-gray-600 shrink-0">{cam?.adet}</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Onay diyalogu */}
        <ConfirmDialog
          acik={onayDialogAcik}
          baslik="Batch Onaylama"
          mesaj={`"${emir.batch_no}" batch'ini onaylamak istediğinize emin misiniz? Onaylanan batch'e yeni cam eklenemez.`}
          onayButon="Onayla"
          onayRenk="blue"
          yukleniyor={onayYapiliyor}
          onOnayla={async () => {
            setOnayYapiliyor(true)
            try {
              await onDurumDegisti(emir.id, 'onaylandi')
              setOnayDialogAcik(false)
            } finally {
              setOnayYapiliyor(false)
            }
          }}
          onKapat={() => setOnayDialogAcik(false)}
        />

        {/* Export diyalogu */}
        <ConfirmDialog
          acik={exportDialogAcik}
          baslik="CSV Export"
          mesaj={`"${emir.batch_no}" batch'ini CSV olarak dışa aktarmak istediğinize emin misiniz?`}
          onayButon="Export Et"
          onayRenk="green"
          yukleniyor={exportYapiliyor}
          onOnayla={async () => {
            await handleExport()
            setExportDialogAcik(false)
          }}
          onKapat={() => setExportDialogAcik(false)}
        />

        {/* Sipariş detay modalı */}
        {secilenSiparis && (
          <SiparisDetayModal
            siparis={secilenSiparis}
            stoklar={stoklar}
            onKapat={() => setSecilenSiparis(null)}
          />
        )}
      </div>
    </div>
  )
}
