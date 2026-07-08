import { useEffect, useLayoutEffect, useState, useMemo } from 'react'
import {
  X, Download, ChevronDown, ChevronRight,
  Package, Layers, Square, Calendar,
} from 'lucide-react'
import type { UretimEmri, UretimEmriDetay, UretimEmriDurum } from '@/types/uretim'
import type { Siparis } from '@/types/siparis'
import { getBatchDetaylari } from '@/hooks/useUretim'
import { exportOptiIMP, exportCitaBukumCSV, exportTarihiGuncelle } from '@/services/exportService'
import { optiExportTurleri } from '@/lib/optiExport'
import { useOptiExportAyarlari } from '@/hooks/useOptiExportAyarlari'
import { formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { fizikselGlsKodu } from '@/lib/siparisDetay'
import { aktifCitaStoklari } from '@/lib/cam'
import { useEscape } from '@/hooks/useEscape'
import { useStok } from '@/hooks/useStok'
import { useCari } from '@/hooks/useCari'
import SiparisDetayModal from '@/components/siparis/SiparisDetayModal'
import StatusBadge from '@/components/ui/StatusBadge'
import { TableSkeleton } from '@/components/ui/Skeleton'

interface Props {
  emir: UretimEmri
  onDurumDegisti: (id: string, durum: UretimEmriDurum) => Promise<void>
  onKapat: () => void
  onGuncellendi: () => void
}

type SiparisGrup = {
  key: string
  musteriAd: string
  altMusteri: string | null
  siparisNo: string
  siparisId: string
  satirlar: UretimEmriDetay[]
}

function toplamM2(detaylar: UretimEmriDetay[]): number {
  return detaylar.reduce((sum, d) => {
    const cam = d.siparis_detaylari
    if (!cam) return sum
    const adet = cam.adet ?? 1
    return sum + (adet * cam.genislik_mm * cam.yukseklik_mm) / 1_000_000
  }, 0)
}

function toplamAdet(detaylar: UretimEmriDetay[]): number {
  return detaylar.reduce((sum, d) => sum + (d.siparis_detaylari?.adet ?? 1), 0)
}

function gruplariOlustur(detaylar: UretimEmriDetay[]): SiparisGrup[] {
  const liste: SiparisGrup[] = []
  for (const d of detaylar) {
    const sip = d.siparis_detaylari?.siparisler
    const musteriAd = sip?.cari?.ad ?? '—'
    const siparisNo = sip?.siparis_no ?? '—'
    const key = `${siparisNo}||${musteriAd}`
    const mevcut = liste.find((g) => g.key === key)
    if (mevcut) {
      mevcut.satirlar.push(d)
    } else {
      liste.push({
        key,
        musteriAd,
        altMusteri: sip?.alt_musteri ?? null,
        siparisNo,
        siparisId: sip?.id ?? '',
        satirlar: [d],
      })
    }
  }
  return liste
}

export default function UretimDetayModal({
  emir, onKapat, onGuncellendi,
}: Props) {
  useEscape(onKapat)

  useLayoutEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const prevOverflow = main.style.overflow
    const prevPaddingRight = main.style.paddingRight
    const scrollbarWidth = main.offsetWidth - main.clientWidth
    main.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      main.style.paddingRight = `${scrollbarWidth}px`
    }
    return () => {
      main.style.overflow = prevOverflow
      main.style.paddingRight = prevPaddingRight
    }
  }, [])

  const [detaylar, setDetaylar] = useState<UretimEmriDetay[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [exportYapiliyor, setExportYapiliyor] = useState(false)
  const [kapaliGruplar, setKapaliGruplar] = useState<Set<string>>(new Set())
  const [secilenSiparis, setSecilenSiparis] = useState<Siparis | null>(null)
  const { stoklar } = useStok()
  const { cariler } = useCari()
  const { ayarlar: optiAyarlar, sayacArttir } = useOptiExportAyarlari()
  const citaStoklar = useMemo(() => aktifCitaStoklari(stoklar), [stoklar])

  const exportTurleri = useMemo(
    () => optiExportTurleri(detaylar, optiAyarlar.fam_haritasi),
    [detaylar, optiAyarlar.fam_haritasi],
  )

  const handleSiparisAc = async (siparisId: string) => {
    const { data, error } = await supabase
      .from('siparisler')
      .select('*, cari(ad, kod)')
      .eq('id', siparisId)
      .single()
    if (!error && data) setSecilenSiparis(data as Siparis)
  }

  useEffect(() => {
    let iptal = false
    setYukleniyor(true)
    setDetaylar([])
    setKapaliGruplar(new Set())

    getBatchDetaylari(emir.id).then((data) => {
      if (iptal) return
      const yeniGruplar = gruplariOlustur(data)
      setDetaylar(data)
      setKapaliGruplar(new Set(yeniGruplar.map((g) => g.key)))
      setYukleniyor(false)
    })

    return () => { iptal = true }
  }, [emir.id])

  const handleCitaExport = async () => {
    setExportYapiliyor(true)
    try {
      exportCitaBukumCSV(detaylar, emir.batch_no, citaStoklar)
      await exportTarihiGuncelle(emir.id)
      onGuncellendi()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Export sırasında hata oluştu')
    } finally {
      setExportYapiliyor(false)
    }
  }

  const handleOptiExport = async (hedefFam: string) => {
    setExportYapiliyor(true)
    try {
      exportOptiIMP(detaylar, hedefFam, optiAyarlar.sayac, optiAyarlar.fam_haritasi)
      await sayacArttir()
      await exportTarihiGuncelle(emir.id)
      onGuncellendi()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Export sırasında hata oluştu')
    } finally {
      setExportYapiliyor(false)
    }
  }

  const gruplar = useMemo(() => gruplariOlustur(detaylar), [detaylar])

  const toggleGrup = (key: string) => {
    setKapaliGruplar((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  let globalSira = 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">

        {/* Başlık */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100 shrink-0 bg-gray-50/60">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-semibold text-gray-900 font-mono">{emir.batch_no}</h2>
              <StatusBadge durum={emir.durum} tip="uretim" boyut="sm" className="rounded-md" />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Oluşturulma: {formatDate(emir.olusturulma_tarihi)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onKapat}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Özet kartları */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b border-gray-100 shrink-0 min-h-[88px]">
          {yukleniyor ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[72px] rounded-xl bg-gray-100 animate-pulse" />
            ))
          ) : detaylar.length > 0 ? (
            [
              { icon: Package, label: 'Sipariş Adedi', value: String(gruplar.length) },
              { icon: Layers, label: 'Toplam Adet', value: String(toplamAdet(detaylar)) },
              { icon: Calendar, label: 'Export Tarihi', value: emir.export_tarihi ? formatDate(emir.export_tarihi) : '—' },
              { icon: Square, label: 'Toplam m²', value: toplamM2(detaylar).toFixed(2) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500">
                  <Icon size={16} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-lg font-semibold text-gray-900 tabular-nums">{value}</p>
                </div>
              </div>
            ))
          ) : null}
        </div>

        {/* Export */}
        {!yukleniyor && detaylar.length > 0 && (
          <div className="px-6 py-4 border-b border-gray-100 shrink-0 space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Export</p>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">PerfectCut <span className="text-xs font-normal text-gray-400">(IMP)</span></p>
              {exportTurleri.length === 0 ? (
                <p className="text-xs text-gray-400">Export edilebilir cam türü bulunamadı.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {exportTurleri.map((tur) => (
                    <button
                      key={tur.anahtar}
                      type="button"
                      onClick={() => handleOptiExport(tur.anahtar)}
                      disabled={exportYapiliyor}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 disabled:opacity-40 transition-colors text-sm"
                    >
                      <Download size={14} className="text-orange-600 shrink-0" />
                      <span className="font-medium text-orange-800">{tur.etiket}</span>
                      <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full tabular-nums">
                        {tur.adet} adet
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Çıta Büküm <span className="text-xs font-normal text-gray-400">(CSV)</span></p>
              <button
                type="button"
                onClick={handleCitaExport}
                disabled={exportYapiliyor}
                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-40 transition-colors text-sm"
              >
                <Download size={14} className="text-blue-600 shrink-0" />
                <span className="font-medium text-blue-800">CSV İndir</span>
              </button>
            </div>
            {exportYapiliyor && (
              <p className="text-xs text-gray-500">İndiriliyor...</p>
            )}
          </div>
        )}

        {/* Liste */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {yukleniyor ? (
            <div className="p-6">
              <TableSkeleton satir={8} kolon={5} />
            </div>
          ) : detaylar.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Package size={40} className="mb-3 opacity-40" />
              <p className="font-medium text-gray-500">Bu batch&apos;te henüz cam bulunmuyor</p>
            </div>
          ) : (
            <div className="p-6 pt-4 space-y-4">
              <h3 className="text-sm font-medium text-gray-700 pb-2 border-b border-gray-100">
                Siparişler ({gruplar.length})
              </h3>
              {gruplar.map((grup) => {
                const kapali = kapaliGruplar.has(grup.key)
                const grupAdet = grup.satirlar.reduce((s, d) => s + (d.siparis_detaylari?.adet ?? 1), 0)
                const baslangicSira = globalSira
                globalSira += grup.satirlar.length

                return (
                  <section
                    key={grup.key}
                    className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm"
                  >
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <button
                        type="button"
                        onClick={() => toggleGrup(grup.key)}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0 transition-colors"
                      >
                        {kapali
                          ? <ChevronRight size={16} />
                          : <ChevronDown size={16} />}
                      </button>
                      {grup.siparisId ? (
                        <button
                          type="button"
                          onClick={() => handleSiparisAc(grup.siparisId)}
                          className="flex-1 min-w-0 text-left hover:bg-gray-100/80 rounded-lg px-2 py-1 -mx-2 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-gray-900">{grup.siparisNo}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-sm text-gray-700 truncate">{grup.musteriAd}</span>
                            {grup.altMusteri && (
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md truncate">
                                {grup.altMusteri}
                              </span>
                            )}
                          </div>
                        </button>
                      ) : (
                        <div className="flex-1 min-w-0 px-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-gray-900">{grup.siparisNo}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-sm text-gray-700 truncate">{grup.musteriAd}</span>
                          </div>
                        </div>
                      )}
                      <span className="text-xs text-gray-500 tabular-nums shrink-0">
                        {grupAdet} adet
                      </span>
                    </div>

                    {!kapali && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs font-medium text-gray-500 border-b border-gray-100">
                              <th className="px-4 py-2.5 w-10">#</th>
                              <th className="px-4 py-2.5 w-24">Sıra</th>
                              <th className="px-4 py-2.5">Cam Cinsi</th>
                              <th className="px-4 py-2.5 w-32">Boyut (mm)</th>
                              <th className="px-4 py-2.5 w-16 text-right">Adet</th>
                            </tr>
                          </thead>
                          <tbody>
                            {grup.satirlar.map((d, i) => {
                              const cam = d.siparis_detaylari
                              const satirNo = baslangicSira + i + 1
                              return (
                                <tr
                                  key={d.id}
                                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors"
                                >
                                  <td className="px-4 py-2.5 text-gray-400 text-xs tabular-nums">{satirNo}</td>
                                  <td className="px-4 py-2.5">
                                    <span className="font-mono text-xs font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
                                      {fizikselGlsKodu(d.sira_no, cam?.cam_kodu)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-700">{cam?.stok?.ad ?? '—'}</td>
                                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs tabular-nums">
                                    {cam?.genislik_mm} × {cam?.yukseklik_mm}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{cam?.adet}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {secilenSiparis && (
        <SiparisDetayModal
          siparis={secilenSiparis}
          stoklar={stoklar}
          cariler={cariler}
          batchKonteksti={{ uretimEmriId: emir.id }}
          onKapat={() => setSecilenSiparis(null)}
        />
      )}
    </div>
  )
}
