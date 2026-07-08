import { useState, useEffect, useMemo } from 'react'
import { X, Search, Package, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useEscape } from '@/hooks/useEscape'

interface SiparisOzet {
  id: string
  siparis_no: string
  musteri: string
  tarih: string
  cam_sayisi: number
  batchte: boolean       // zaten bir batch'te mi (eksik_var hariç)?
  eksik_var: boolean     // eksik_var durumunda mı?
  batch_no: string | null
}

type BatchJoinRow = {
  siparis_detay_id: string
  uretim_emirleri?: { batch_no?: string | null; durum?: string | null } | { batch_no?: string | null; durum?: string | null }[] | null
}

const IN_FILTER_CHUNK_SIZE = 100

interface Props {
  onOlustur: (siparisIds: string[]) => Promise<void>
  onKapat: () => void
}

function joinedBatch(row: BatchJoinRow) {
  const joined = row.uretim_emirleri
  return Array.isArray(joined) ? joined[0] : joined
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function batchDetaylariniGetir(detayIds: string[]) {
  const rows: BatchJoinRow[] = []
  for (const chunk of chunkArray(detayIds, IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('uretim_emri_detaylari')
      .select('siparis_detay_id, uretim_emirleri(batch_no, durum)')
      .in('siparis_detay_id', chunk)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as BatchJoinRow[]))
  }
  return rows
}

export default function YeniBatchModal({ onOlustur, onKapat }: Props) {
  useEscape(onKapat)
  const [siparisler, setSiparisler] = useState<SiparisOzet[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [seciliIds, setSeciliIds] = useState<Set<string>>(new Set())
  const [olusturuluyor, setOlusturuluyor] = useState(false)
  const [arama, setArama] = useState('')
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    verileriGetir()
  }, [])

  const verileriGetir = async () => {
    setYukleniyor(true)
    setHata(null)

    // 1. Tüm siparişleri getir (durum dahil)
    const { data: tumSiparisler, error: siparisHata } = await supabase
      .from('siparisler')
      .select('id, siparis_no, tarih, durum, cari(ad), siparis_detaylari(id, adet)')
      .or('durum.in.(beklemede,batchte,eksik_var),durum.is.null')
      .order('created_at', { ascending: false })

    if (siparisHata) { setHata(siparisHata.message); setYukleniyor(false); return }
    if (!tumSiparisler) { setYukleniyor(false); return }

    const sipIds = tumSiparisler.map((s: any) => s.id)
    if (sipIds.length === 0) {
      setSiparisler([])
      setYukleniyor(false)
      return
    }
    const tumDetaylar = tumSiparisler.flatMap((s: any) =>
      ((s.siparis_detaylari ?? []) as any[]).map((d) => ({
        id: d.id,
        siparis_id: s.id,
        adet: d.adet,
      }))
    )

    // 3. Zaten batch'te olan sipariş detaylarını bul
    let batchDetaylar: BatchJoinRow[] = []
    try {
      batchDetaylar = await batchDetaylariniGetir(tumDetaylar.map((d) => d.id))
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Batch detayları alınamadı')
      setYukleniyor(false)
      return
    }

    const aktifBatchDetaylar = batchDetaylar
      .filter((d) => joinedBatch(d)?.durum !== 'iptal')

    const batchteOlanDetayIds = new Set(
      aktifBatchDetaylar.map((d) => d.siparis_detay_id)
    )

    // siparis_detay_id → batch_no mapping
    const detayBatchMap = new Map<string, string>()
    for (const d of aktifBatchDetaylar) {
      detayBatchMap.set(d.siparis_detay_id, joinedBatch(d)?.batch_no ?? '')
    }

    // siparis_id → cam sayısı (adet toplamı)
    const camSayisiMap = new Map<string, number>()
    for (const d of tumDetaylar ?? []) {
      const hamAdet = Number((d as any).adet)
      const adet = Number.isFinite(hamAdet) && hamAdet > 0 ? hamAdet : 1
      camSayisiMap.set(d.siparis_id, (camSayisiMap.get(d.siparis_id) ?? 0) + adet)
    }

    // siparis_id → batch'te mi (tüm cam parçaları batch'te ise)
    const siparisBatchteMap = new Map<string, { batchte: boolean; batch_no: string | null }>()
    for (const sipId of sipIds) {
      const sipDetaylar = (tumDetaylar ?? []).filter((d: any) => d.siparis_id === sipId)
      if (sipDetaylar.length === 0) {
        siparisBatchteMap.set(sipId, { batchte: false, batch_no: null })
        continue
      }
      const tumParaclarBatchte = sipDetaylar.every((d: any) => batchteOlanDetayIds.has(d.id))
      const ilkBatchNo = sipDetaylar.length > 0 && batchteOlanDetayIds.has(sipDetaylar[0].id)
        ? detayBatchMap.get(sipDetaylar[0].id) ?? null
        : null
      siparisBatchteMap.set(sipId, { batchte: tumParaclarBatchte, batch_no: ilkBatchNo })
    }

    const sonuc: SiparisOzet[] = tumSiparisler.map((s: any) => {
      const batchBilgi = siparisBatchteMap.get(s.id) ?? { batchte: false, batch_no: null }
      const eksikVar = s.durum === 'eksik_var'
      return {
        id: s.id,
        siparis_no: s.siparis_no,
        musteri: s.cari?.ad ?? '—',
        tarih: s.tarih,
        cam_sayisi: camSayisiMap.get(s.id) ?? 0,
        batchte: batchBilgi.batchte && !eksikVar, // eksik_var ise seçilebilir
        eksik_var: eksikVar,
        batch_no: batchBilgi.batch_no,
      }
    })

    setSiparisler(sonuc)
    setYukleniyor(false)
  }

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
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Batch oluşturulamadı')
    } finally {
      setOlusturuluyor(false)
    }
  }

  const seciliCamToplam = siparisler
    .filter((s) => seciliIds.has(s.id))
    .reduce((sum, s) => sum + s.cam_sayisi, 0)

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
            {seciliIds.size > 0
              ? <><span className="font-semibold text-gray-800">{seciliIds.size}</span> sipariş seçili · <span className="font-semibold text-gray-800">{seciliCamToplam}</span> cam parçası</>
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
