import { useState, useEffect, useMemo, useRef } from 'react'
import { X, Search, Package, Check, Layers, Square, Shapes } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useEscape } from '@/hooks/useEscape'

interface DetayOzet {
  adet: number
  genislik_mm: number
  yukseklik_mm: number
  stok_id: string | null
}

interface SiparisOzet {
  id: string
  siparis_no: string
  musteri: string
  tarih: string
  cam_sayisi: number
  batchte: boolean
  eksik_var: boolean
  batch_no: string | null
}

type AktifBatchRow = {
  batch_no: string
  uretim_emri_detaylari?: {
    siparis_detaylari?: { siparis_id?: string | null } | { siparis_id?: string | null }[] | null
  }[] | null
}

const IN_FILTER_CHUNK_SIZE = 200
const LISTE_CACHE_TTL_MS = 30_000

let listeCache: { veri: SiparisOzet[]; zaman: number } | null = null

interface Props {
  onOlustur: (siparisIds: string[]) => Promise<void>
  onKapat: () => void
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function paralelChunkSorgu<T>(
  ids: string[],
  sorgu: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return []
  const chunks = chunkArray(ids, IN_FILTER_CHUNK_SIZE)
  const sonuclar = await Promise.all(chunks.map(sorgu))
  return sonuclar.flat()
}

function detayOzetOlustur(d: {
  adet?: number | null
  genislik_mm?: number | null
  yukseklik_mm?: number | null
  stok_id?: string | null
}): DetayOzet {
  const hamAdet = Number(d.adet)
  const adet = Number.isFinite(hamAdet) && hamAdet > 0 ? hamAdet : 1
  return {
    adet,
    genislik_mm: Number(d.genislik_mm) || 0,
    yukseklik_mm: Number(d.yukseklik_mm) || 0,
    stok_id: d.stok_id ?? null,
  }
}

function siparisBatchNoHaritasi(aktifBatchler: AktifBatchRow[]) {
  const map = new Map<string, string>()
  for (const emir of aktifBatchler) {
    for (const ued of emir.uretim_emri_detaylari ?? []) {
      const joined = ued.siparis_detaylari
      const siparisDetay = Array.isArray(joined) ? joined[0] : joined
      const siparisId = siparisDetay?.siparis_id
      if (siparisId && !map.has(siparisId)) {
        map.set(siparisId, emir.batch_no)
      }
    }
  }
  return map
}

async function siparisListesiniGetir(): Promise<SiparisOzet[]> {
  const { data: tumSiparisler, error: siparisHata } = await supabase
    .from('siparisler')
    .select('id, siparis_no, tarih, durum, cari(ad)')
    .or('durum.in.(beklemede,batchte,eksik_var),durum.is.null')
    .order('created_at', { ascending: false })

  if (siparisHata) throw new Error(siparisHata.message)
  if (!tumSiparisler || tumSiparisler.length === 0) return []

  const sipIds = tumSiparisler.map((s) => s.id)

  const [adetSatirlari, aktifBatchler] = await Promise.all([
    paralelChunkSorgu(sipIds, async (chunk) => {
      const { data, error } = await supabase
        .from('siparis_detaylari')
        .select('siparis_id, adet')
        .in('siparis_id', chunk)
      if (error) throw new Error(error.message)
      return data ?? []
    }),
    supabase
      .from('uretim_emirleri')
      .select('batch_no, uretim_emri_detaylari(siparis_detaylari(siparis_id))')
      .neq('durum', 'iptal')
      .then(({ data, error }) => {
        if (error) throw new Error(error.message)
        return (data ?? []) as AktifBatchRow[]
      }),
  ])

  const camSayisiMap = new Map<string, number>()
  for (const satir of adetSatirlari) {
    const hamAdet = Number(satir.adet)
    const adet = Number.isFinite(hamAdet) && hamAdet > 0 ? hamAdet : 1
    camSayisiMap.set(satir.siparis_id, (camSayisiMap.get(satir.siparis_id) ?? 0) + adet)
  }

  const batchNoMap = siparisBatchNoHaritasi(aktifBatchler)

  return tumSiparisler.map((s) => {
    const eksikVar = s.durum === 'eksik_var'
    const batchte = s.durum === 'batchte' && !eksikVar
    return {
      id: s.id,
      siparis_no: s.siparis_no,
      musteri: (s.cari as { ad?: string } | null)?.ad ?? '—',
      tarih: s.tarih,
      cam_sayisi: camSayisiMap.get(s.id) ?? 0,
      batchte,
      eksik_var: eksikVar,
      batch_no: batchNoMap.get(s.id) ?? null,
    }
  })
}

export default function YeniBatchModal({ onOlustur, onKapat }: Props) {
  useEscape(onKapat)
  const [siparisler, setSiparisler] = useState<SiparisOzet[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [seciliIds, setSeciliIds] = useState<Set<string>>(new Set())
  const [detayCache, setDetayCache] = useState<Map<string, DetayOzet[]>>(new Map())
  const detayCacheRef = useRef(detayCache)
  detayCacheRef.current = detayCache
  const [detayYukleniyor, setDetayYukleniyor] = useState(false)
  const [olusturuluyor, setOlusturuluyor] = useState(false)
  const [arama, setArama] = useState('')
  const [hata, setHata] = useState<string | null>(null)
  const yuklemeRef = useRef(0)

  useEffect(() => {
    const yuklemeId = ++yuklemeRef.current
    const cacheGecerli = listeCache && Date.now() - listeCache.zaman < LISTE_CACHE_TTL_MS

    if (cacheGecerli) {
      setSiparisler(listeCache!.veri)
      setYukleniyor(false)
    }

    const verileriGetir = async () => {
      if (!cacheGecerli) setYukleniyor(true)
      setHata(null)

      try {
        const sonuc = await siparisListesiniGetir()
        if (yuklemeId !== yuklemeRef.current) return
        listeCache = { veri: sonuc, zaman: Date.now() }
        setSiparisler(sonuc)
      } catch (e) {
        if (yuklemeId !== yuklemeRef.current) return
        setHata(e instanceof Error ? e.message : 'Siparişler alınamadı')
      } finally {
        if (yuklemeId === yuklemeRef.current) setYukleniyor(false)
      }
    }

    void verileriGetir()
  }, [])

  useEffect(() => {
    const eksikIds = [...seciliIds].filter((id) => !detayCacheRef.current.has(id))
    if (eksikIds.length === 0) return

    let iptal = false
    setDetayYukleniyor(true)

    void (async () => {
      try {
        const satirlar = await paralelChunkSorgu(eksikIds, async (chunk) => {
          const { data, error } = await supabase
            .from('siparis_detaylari')
            .select('siparis_id, adet, genislik_mm, yukseklik_mm, stok_id')
            .in('siparis_id', chunk)
          if (error) throw new Error(error.message)
          return data ?? []
        })

        if (iptal) return

        setDetayCache((prev) => {
          const next = new Map(prev)
          for (const siparisId of eksikIds) next.set(siparisId, [])
          for (const satir of satirlar) {
            const liste = next.get(satir.siparis_id) ?? []
            liste.push(detayOzetOlustur(satir))
            next.set(satir.siparis_id, liste)
          }
          return next
        })
      } catch (e) {
        if (!iptal) {
          setHata(e instanceof Error ? e.message : 'Seçili sipariş detayları alınamadı')
        }
      } finally {
        if (!iptal) setDetayYukleniyor(false)
      }
    })()

    return () => { iptal = true }
  }, [seciliIds])

  const filtrelenmis = useMemo(() => {
    if (!arama.trim()) return siparisler
    const q = arama.toLowerCase()
    return siparisler.filter(
      (s) =>
        s.siparis_no.toLowerCase().includes(q) ||
        s.musteri.toLowerCase().includes(q)
    )
  }, [siparisler, arama])

  const toggleSecim = (id: string) => {
    setHata(null)
    setSeciliIds((prev) => {
      const yeni = new Set(prev)
      if (yeni.has(id)) yeni.delete(id)
      else yeni.add(id)
      return yeni
    })
  }

  const handleOlustur = async () => {
    if (seciliIds.size === 0) return
    setOlusturuluyor(true)
    setHata(null)
    try {
      await onOlustur(Array.from(seciliIds))
      listeCache = null
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Batch oluşturulamadı')
    } finally {
      setOlusturuluyor(false)
    }
  }

  const seciliOzet = useMemo(() => {
    let toplamAdet = 0
    let toplamM2 = 0
    const stokIds = new Set<string>()

    for (const siparisId of seciliIds) {
      const detaylar = detayCache.get(siparisId) ?? []
      for (const d of detaylar) {
        toplamAdet += d.adet
        toplamM2 += (d.adet * d.genislik_mm * d.yukseklik_mm) / 1_000_000
        if (d.stok_id) stokIds.add(d.stok_id)
      }
    }

    return {
      siparisAdedi: seciliIds.size,
      toplamAdet,
      toplamM2,
      camTuruAdedi: stokIds.size,
      detayHazir: [...seciliIds].every((id) => detayCache.has(id)),
    }
  }, [seciliIds, detayCache])

  const ozetDeger = (deger: string) => {
    if (seciliOzet.siparisAdedi > 0 && !seciliOzet.detayHazir && detayYukleniyor) return '…'
    return deger
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[85vh]">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Yeni Batch Oluştur</h2>
            <p className="text-sm text-gray-500">Batch'e eklenecek siparişleri seçin</p>
          </div>
          <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Arama */}
        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Sipariş no veya müşteri ara..."
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Seçim özeti — liste kayarken sabit kalır */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          {[
            { icon: Package, label: 'Sipariş Adedi', value: String(seciliOzet.siparisAdedi) },
            { icon: Layers, label: 'Toplam Adet', value: ozetDeger(String(seciliOzet.toplamAdet)) },
            { icon: Square, label: 'Toplam m²', value: ozetDeger(seciliOzet.toplamM2.toFixed(2)) },
            { icon: Shapes, label: 'Cam Türü', value: ozetDeger(String(seciliOzet.camTuruAdedi)) },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors',
                seciliOzet.siparisAdedi > 0
                  ? 'bg-white border-blue-100'
                  : 'bg-white/60 border-gray-100'
              )}
            >
              <div className="p-1.5 rounded-lg bg-gray-50 border border-gray-100 text-gray-500 shrink-0">
                <Icon size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-gray-500 truncate">{label}</p>
                <p className="text-base font-semibold text-gray-900 tabular-nums leading-tight">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {hata ? (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {hata}
            </div>
          ) : yukleniyor ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filtrelenmis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Package size={32} className="mb-2" />
              <p>{arama ? 'Sonuç bulunamadı' : 'Henüz sipariş yok'}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtrelenmis.map((s) => {
                const secili = seciliIds.has(s.id)
                const disabled = s.batchte
                return (
                  <button
                    key={s.id}
                    onClick={() => !disabled && toggleSecim(s.id)}
                    disabled={disabled}
                    className={cn(
                      'w-full flex items-center gap-4 px-6 py-3.5 text-left transition-colors',
                      disabled
                        ? 'opacity-50 cursor-not-allowed bg-gray-50'
                        : s.eksik_var
                          ? secili ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-red-50'
                          : secili
                            ? 'bg-blue-50 hover:bg-blue-100'
                            : 'hover:bg-gray-50'
                    )}
                  >
                    {/* Checkbox */}
                    <div
                      className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        disabled
                          ? 'border-gray-300 bg-gray-200'
                          : secili && s.eksik_var
                            ? 'border-red-600 bg-red-600'
                            : secili
                              ? 'border-blue-600 bg-blue-600'
                              : s.eksik_var
                                ? 'border-red-300'
                                : 'border-gray-300'
                      )}
                    >
                      {secili && <Check size={12} className="text-white" />}
                    </div>

                    {/* Bilgi */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-gray-800">{s.siparis_no}</span>
                        <span className="text-gray-500 text-sm">—</span>
                        <span className="text-sm text-gray-600 truncate">{s.musteri}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-400">{new Date(s.tarih).toLocaleDateString('tr-TR')}</span>
                        <span className="text-xs text-gray-400">{s.cam_sayisi} cam parçası</span>
                        {s.eksik_var && (
                          <span className="text-xs text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded">
                            ⚠ Eksik Var — yeniden seçilebilir
                          </span>
                        )}
                        {s.batchte && !s.eksik_var && (
                          <span className="text-xs text-orange-600 font-medium bg-orange-50 px-1.5 py-0.5 rounded">
                            {s.batch_no ? `${s.batch_no} batch'inde` : 'Zaten batch\'te'}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Alt bar */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
          <div className="text-sm text-gray-500">
            {seciliOzet.siparisAdedi > 0
              ? <><span className="font-semibold text-gray-800">{seciliOzet.siparisAdedi}</span> sipariş seçili</>
              : 'Sipariş seçin'
            }
          </div>
          <div className="flex gap-3">
            <button
              onClick={onKapat}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
            >
              İptal
            </button>
            <button
              onClick={handleOlustur}
              disabled={seciliIds.size === 0 || olusturuluyor}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {olusturuluyor ? 'Oluşturuluyor...' : 'Batch Oluştur'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
