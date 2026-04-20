import { useEffect, useState } from 'react'
import { X, Pencil, Wrench } from 'lucide-react'
import type { Siparis, SiparisDetay, SiparisDurum, UretimDurumu } from '@/types/siparis'
import { getSiparisDetaylari } from '@/hooks/useSiparis'
import { supabase } from '@/lib/supabase'
import { cn, formatDate } from '@/lib/utils'
import { SORUN_ETIKETLERI } from '@/types/tamir'

interface Props {
  siparis: Siparis
  onKapat: () => void
  onGuncelle?: (id: string, form: { tarih?: string; teslim_tarihi?: string | null; notlar?: string | null }) => Promise<void>
}

const SIPARIS_DURUM_STIL: Record<SiparisDurum, string> = {
  beklemede: 'bg-gray-100 text-gray-600',
  batchte: 'bg-blue-50 text-blue-700',
  yikamada: 'bg-cyan-50 text-cyan-700',
  tamamlandi: 'bg-green-50 text-green-700',
  eksik_var: 'bg-red-50 text-red-600',
  iptal: 'bg-red-50 text-red-600',
}

const SIPARIS_DURUM_ETIKET: Record<SiparisDurum, string> = {
  beklemede: 'Beklemede',
  batchte: 'Batch\'te',
  yikamada: 'Yıkamada',
  tamamlandi: 'Tamamlandı',
  eksik_var: 'Eksik Var',
  iptal: 'İptal',
}

const URETIM_DURUM_STIL: Record<UretimDurumu, string> = {
  bekliyor: 'bg-gray-100 text-gray-500',
  kesildi: 'bg-yellow-50 text-yellow-700',
  yikandi: 'bg-blue-50 text-blue-600',
  etiketlendi: 'bg-purple-50 text-purple-700',
  tamamlandi: 'bg-green-50 text-green-700',
}

const URETIM_DURUM_ETIKET: Record<UretimDurumu, string> = {
  bekliyor: 'Bekliyor',
  kesildi: 'Kesildi',
  yikandi: 'Yıkandı',
  etiketlendi: 'Etiketlendi',
  tamamlandi: 'Tamamlandı',
}

/* ========== Tamir badge yardımcısı ========== */

const TAMIR_DURUM_STIL: Record<string, string> = {
  bekliyor:       'bg-red-50 text-red-700 border border-red-200',
  tamir_ediliyor: 'bg-amber-50 text-amber-700 border border-amber-200',
  tamamlandi:     'bg-gray-100 text-gray-500 border border-gray-200',
  hurda:          'bg-gray-100 text-gray-400 border border-gray-200 line-through',
}

const TAMIR_DURUM_ETIKET: Record<string, string> = {
  bekliyor:       'Tamirde',
  tamir_ediliyor: 'Tamir Ediliyor',
  tamamlandi:     'Tamir Tamamlandı',
  hurda:          'Hurda',
}

function TamirBadge({ tamir }: { tamir: { durum: string; sorun_tipi: string } }) {
  const sorunEtiket = SORUN_ETIKETLERI[tamir.sorun_tipi as keyof typeof SORUN_ETIKETLERI] ?? tamir.sorun_tipi
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', TAMIR_DURUM_STIL[tamir.durum] ?? 'bg-gray-100 text-gray-500')}>
        <Wrench size={9} />
        {TAMIR_DURUM_ETIKET[tamir.durum] ?? tamir.durum}
      </span>
      <span className="text-[10px] text-gray-400 pl-1">{sorunEtiket}</span>
    </div>
  )
}

interface TamirBilgi {
  durum: string
  sorun_tipi: string
}

interface DetayWithBatch extends SiparisDetay {
  batch_no?: string | null
  aktif_tamir?: TamirBilgi | null
}

export default function SiparisDetayModal({ siparis, onKapat, onGuncelle }: Props) {
  const [detaylar, setDetaylar] = useState<DetayWithBatch[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [duzenleAcik, setDuzenleAcik] = useState(false)
  const [editTarih, setEditTarih] = useState(siparis.tarih)
  const [editTeslim, setEditTeslim] = useState(siparis.teslim_tarihi ?? '')
  const [editNotlar, setEditNotlar] = useState(siparis.notlar ?? '')
  const [kaydediyor, setKaydediyor] = useState(false)

  useEffect(() => {
    const yukle = async () => {
      const camlar = await getSiparisDetaylari(siparis.id)

      if (camlar.length > 0) {
        const camIds = camlar.map(c => c.id)

        // Batch bilgisi
        const { data: batchData } = await supabase
          .from('uretim_emri_detaylari')
          .select('siparis_detay_id, uretim_emirleri(batch_no)')
          .in('siparis_detay_id', camIds)

        const batchMap = new Map<string, string>()
        for (const b of batchData ?? []) {
          batchMap.set(b.siparis_detay_id, (b as any).uretim_emirleri?.batch_no ?? '')
        }

        // Tamir bilgisi — aktif veya geçmiş kayıtlar
        const { data: tamirData } = await supabase
          .from('tamir_kayitlari')
          .select('siparis_detay_id, durum, sorun_tipi, created_at')
          .in('siparis_detay_id', camIds)
          .order('created_at', { ascending: false })

        // Her cam için en son tamir kaydını al
        const tamirMap = new Map<string, TamirBilgi>()
        for (const t of tamirData ?? []) {
          if (!tamirMap.has(t.siparis_detay_id)) {
            tamirMap.set(t.siparis_detay_id, { durum: t.durum, sorun_tipi: t.sorun_tipi })
          }
        }

        setDetaylar(camlar.map(c => ({
          ...c,
          batch_no: batchMap.get(c.id) || null,
          aktif_tamir: tamirMap.get(c.id) ?? null,
        })))
      } else {
        setDetaylar([])
      }
      setYukleniyor(false)
    }
    yukle()
  }, [siparis.id])

  const yikanmis = detaylar.filter(d => d.uretim_durumu === 'yikandi').length
  const toplam = detaylar.length

  const handleDuzenleKaydet = async () => {
    if (!onGuncelle) return
    setKaydediyor(true)
    try {
      await onGuncelle(siparis.id, {
        tarih: editTarih,
        teslim_tarihi: editTeslim || null,
        notlar: editNotlar || null,
      })
      setDuzenleAcik(false)
    } finally {
      setKaydediyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{siparis.siparis_no}</h2>
            <p className="text-sm text-gray-500">
              {siparis.cari?.ad} · {formatDate(siparis.tarih)}
              {siparis.teslim_tarihi && ` · Teslim: ${formatDate(siparis.teslim_tarihi)}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Düzenle butonu */}
            {onGuncelle && !duzenleAcik && (
              <button
                onClick={() => setDuzenleAcik(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Pencil size={14} />
                Düzenle
              </button>
            )}
            {/* Durum badge (readonly) */}
            <span className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium',
              SIPARIS_DURUM_STIL[siparis.durum]
            )}>
              {SIPARIS_DURUM_ETIKET[siparis.durum]}
            </span>
            <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Yıkama progress */}
        {toplam > 0 && siparis.durum !== 'beklemede' && (
          <div className="px-6 pt-4 shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs text-gray-500 font-medium">Yıkama İlerlemesi</span>
              <span className="text-xs text-gray-400 tabular-nums ml-auto">
                {yikanmis} / {toplam} cam
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all',
                  yikanmis >= toplam ? 'bg-green-500' : 'bg-cyan-500'
                )}
                style={{ width: `${toplam > 0 ? (yikanmis / toplam) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Düzenleme formu */}
        {duzenleAcik && (
          <div className="px-6 pt-4 shrink-0 border-b border-gray-100 pb-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tarih</label>
                <input
                  type="date"
                  value={editTarih}
                  onChange={(e) => setEditTarih(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Teslim Tarihi</label>
                <input
                  type="date"
                  value={editTeslim}
                  onChange={(e) => setEditTeslim(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notlar</label>
                <input
                  type="text"
                  value={editNotlar}
                  onChange={(e) => setEditNotlar(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Sipariş notu..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setDuzenleAcik(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleDuzenleKaydet}
                disabled={kaydediyor}
                className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {kaydediyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {yukleniyor ? (
            <div className="text-center py-10 text-gray-400">Yükleniyor...</div>
          ) : detaylar.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Cam parçası bulunamadı.</div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                    <th className="px-4 py-2.5">Cam Kodu</th>
                    <th className="px-4 py-2.5">Cam Cinsi</th>
                    <th className="px-4 py-2.5">Boyut (mm)</th>
                    <th className="px-4 py-2.5">Adet</th>
                    <th className="px-4 py-2.5">Batch</th>
                    <th className="px-4 py-2.5">Yıkama</th>
                    <th className="px-4 py-2.5">Tamir</th>
                  </tr>
                </thead>
                <tbody>
                  {detaylar.map((d) => (
                    <tr key={d.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">
                          {d.cam_kodu}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{d.stok?.ad ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {d.genislik_mm} × {d.yukseklik_mm}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{d.adet}</td>
                      <td className="px-4 py-2.5">
                        {d.batch_no ? (
                          <span className="font-mono text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded">
                            {d.batch_no}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'inline-block rounded px-2 py-0.5 text-xs font-medium',
                          URETIM_DURUM_STIL[d.uretim_durumu]
                        )}>
                          {URETIM_DURUM_ETIKET[d.uretim_durumu]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {d.aktif_tamir ? (
                          <TamirBadge tamir={d.aktif_tamir} />
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                {detaylar.length} cam parçası
              </div>
            </div>
          )}
          {siparis.notlar && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <span className="font-medium text-gray-700">Not: </span>{siparis.notlar}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
