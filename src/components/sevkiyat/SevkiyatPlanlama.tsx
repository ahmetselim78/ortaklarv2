/**
 * SevkiyatPlanlama.tsx
 *
 * Tam ekran / modal sürükle-bırak sevkiyat planlama paneli.
 *
 * Layout:
 *  [Sol: Takvim + Sipariş Havuzu]  [Sağ: Araç Kolonları]
 *
 * Kullanım:
 *  - Takvimden gün seçilir → o günün sipariş havuzu sol altta görünür
 *  - Sipariş kartları araç kolonlarına sürüklenir → sevkiyat_planlari kaydedilir
 *  - Araç kolonundaki kartlar geri havuza sürüklenebilir (iptal)
 *  - Araç yönetimi: plaka/ad/kapasite ekleme-silme (sağ üst köşe)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Maximize2, Minimize2, Plus, Truck, Trash2, ChevronLeft,
  ChevronRight, GripVertical, AlertCircle, Settings, Save, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

/* ===================================================================
   Types
=================================================================== */

interface Arac {
  id: string
  plaka: string
  ad: string
  kapasite_m2: number | null
  aktif: boolean
}

interface PlanliSiparis {
  plan_id: string
  siparis_id: string
  arac_id: string
  tarih: string
  siparis_no: string
  musteri: string
  teslim_tarihi: string
  durum: string
}

interface HavuzSiparis {
  id: string
  siparis_no: string
  musteri: string
  teslim_tarihi: string
  durum: string
}

interface Props {
  onKapat: () => void
}

/* ===================================================================
   Helpers
=================================================================== */

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  return date
}

function toTurkishMonthName(month: number): string {
  return ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][month]
}

const DURUM_STIL: Record<string, string> = {
  beklemede: 'bg-gray-100 text-gray-600',
  batchte: 'bg-blue-50 text-blue-700',
  yikamada: 'bg-cyan-50 text-cyan-700',
  tamamlandi: 'bg-green-50 text-green-700',
  eksik_var: 'bg-red-50 text-red-600',
}

const DURUM_ETIKET: Record<string, string> = {
  beklemede: 'Beklemede', batchte: "Batch'te", yikamada: 'Yıkamada',
  tamamlandi: 'Tamamlandı', eksik_var: 'Eksik Var', iptal: 'İptal',
}

const HAFTA_GUNLERI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

/* ===================================================================
   Drag helpers  (HTML5 DataTransfer)
=================================================================== */

type DragPayload =
  | { kind: 'havuz'; siparis_id: string }
  | { kind: 'plan'; plan_id: string; siparis_id: string; from_arac_id: string }

function encodeDrag(p: DragPayload): string { return JSON.stringify(p) }
function decodeDrag(s: string): DragPayload | null {
  try { return JSON.parse(s) } catch { return null }
}

/* ===================================================================
   Sub-component: Sipariş Kartı
=================================================================== */

function SiparisKarti({
  siparis,
  isDragging,
  onDragStart,
  onDragEnd,
  onRemove,
}: {
  siparis: HavuzSiparis | PlanliSiparis
  isDragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onRemove?: () => void
}) {
  const s = siparis as any
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg border cursor-grab active:cursor-grabbing select-none transition-all ${
        isDragging
          ? 'opacity-40 scale-95'
          : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
      }`}
    >
      <GripVertical size={14} className="mt-0.5 text-gray-300 group-hover:text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-xs font-bold text-gray-800 truncate">{s.siparis_no}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${DURUM_STIL[s.durum] ?? 'bg-gray-100 text-gray-500'}`}>
            {DURUM_ETIKET[s.durum] ?? s.durum}
          </span>
        </div>
        <div className="text-xs text-gray-500 truncate mt-0.5">{s.musteri}</div>
        <div className="text-[10px] text-gray-400 mt-0.5">Teslim: {formatDate(s.teslim_tarihi)}</div>
      </div>
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-gray-300 hover:text-red-500 transition-all"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

/* ===================================================================
   Sub-component: Drop Zone
=================================================================== */

function DropZone({
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
  className,
}: {
  isOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`transition-all rounded-xl border-2 ${
        isOver
          ? 'border-blue-400 bg-blue-50/60 shadow-inner'
          : 'border-dashed border-gray-200'
      } ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

/* ===================================================================
   Main Component
=================================================================== */

export default function SevkiyatPlanlama({ onKapat }: Props) {
  /* ---------- UI State ---------- */
  const [fullscreen, setFullscreen] = useState(false)
  const [aracYonetimiAcik, setAracYonetimiAcik] = useState(false)

  /* ---------- Calendar ---------- */
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [selectedDate, setSelectedDate] = useState<string>(toDateStr(new Date()))

  /* ---------- Data ---------- */
  const [araclar, setAraclar] = useState<Arac[]>([])
  const [havuzSiparisler, setHavuzSiparisler] = useState<HavuzSiparis[]>([])
  const [planlar, setPlanlar] = useState<PlanliSiparis[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)

  /* ---------- Drag ---------- */
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragPayloadRef = useRef<DragPayload | null>(null)
  const [overZone, setOverZone] = useState<string | null>(null) // arac_id | 'havuz'

  /* ---------- Araç formu ---------- */
  const [yeniPlaka, setYeniPlaka] = useState('')
  const [yeniAd, setYeniAd] = useState('')
  const [yeniKapasite, setYeniKapasite] = useState('')
  const [aracKaydediyor, setAracKaydediyor] = useState(false)
  const [aracHata, setAracHata] = useState('')

  /* ===================================================================
     Load araclar (once)
  =================================================================== */
  useEffect(() => {
    async function yukle() {
      const { data } = await supabase
        .from('araclar')
        .select('id, plaka, ad, kapasite_m2, aktif')
        .eq('aktif', true)
        .order('created_at')
      setAraclar(data ?? [])
      setYukleniyor(false)
    }
    yukle()
  }, [])

  /* ===================================================================
     Load siparisler + plans for selectedDate
  =================================================================== */
  const yukleGun = useCallback(async (tarih: string) => {
    // 1) Tüm aktif siparişler (planlanıp planlanmadığından bağımsız)
    const { data: sipData } = await supabase
      .from('siparisler')
      .select('id, siparis_no, teslim_tarihi, durum, cari(ad)')
      .in('durum', ['beklemede', 'batchte', 'yikamada', 'tamamlandi'])
      .not('teslim_tarihi', 'is', null)
      .order('teslim_tarihi')

    // 2) O güne ait planlar
    const { data: planData } = await supabase
      .from('sevkiyat_planlari')
      .select(`
        id, siparis_id, arac_id, tarih,
        siparisler(siparis_no, teslim_tarihi, durum, cari(ad))
      `)
      .eq('tarih', tarih)

    const planMap = new Set<string>((planData ?? []).map((p: any) => p.siparis_id))

    setHavuzSiparisler(
      (sipData ?? [])
        .filter((s: any) => !planMap.has(s.id))
        .map((s: any) => ({
          id: s.id,
          siparis_no: s.siparis_no,
          musteri: s.cari?.ad ?? '—',
          teslim_tarihi: s.teslim_tarihi,
          durum: s.durum,
        }))
    )

    setPlanlar(
      (planData ?? []).map((p: any) => ({
        plan_id: p.id,
        siparis_id: p.siparis_id,
        arac_id: p.arac_id,
        tarih: p.tarih,
        siparis_no: p.siparisler?.siparis_no ?? '—',
        musteri: p.siparisler?.cari?.ad ?? '—',
        teslim_tarihi: p.siparisler?.teslim_tarihi ?? tarih,
        durum: p.siparisler?.durum ?? '',
      }))
    )
  }, [])

  useEffect(() => { yukleGun(selectedDate) }, [selectedDate, yukleGun])

  /* ===================================================================
     Week calendar helpers
  =================================================================== */
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = addDays(weekStart, 6)

  /* plan sayısı per day for calendar dots */
  const [weekPlanCounts, setWeekPlanCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    const from = toDateStr(weekStart)
    const to = toDateStr(weekEnd)
    supabase
      .from('sevkiyat_planlari')
      .select('tarih')
      .gte('tarih', from)
      .lte('tarih', to)
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        ;(data ?? []).forEach((p: any) => {
          counts[p.tarih] = (counts[p.tarih] ?? 0) + 1
        })
        setWeekPlanCounts(counts)
      })
  }, [weekStart, planlar])

  /* ===================================================================
     Drag handlers
  =================================================================== */
  function onSiparisDragStart(e: React.DragEvent, payload: DragPayload, id: string) {
    dragPayloadRef.current = payload
    e.dataTransfer.setData('text/plain', encodeDrag(payload))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }

  function onDragEnd() {
    setDraggingId(null)
    setOverZone(null)
    dragPayloadRef.current = null
  }

  function onDragOver(e: React.DragEvent, zone: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverZone(zone)
  }

  function onDragLeave(e: React.DragEvent) {
    // Only clear if leaving the zone container itself
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setOverZone(null)
    }
  }

  async function onDropToArac(e: React.DragEvent, arac_id: string) {
    e.preventDefault()
    setOverZone(null)
    const raw = e.dataTransfer.getData('text/plain')
    const payload = decodeDrag(raw)
    if (!payload) return

    const siparis_id = payload.siparis_id

    // Same arac, skip
    if (payload.kind === 'plan' && payload.from_arac_id === arac_id) return

    // Remove existing plan if dragged from another arac
    if (payload.kind === 'plan') {
      await supabase.from('sevkiyat_planlari').delete().eq('id', payload.plan_id)
    }

    // Upsert: aynı sipariş aynı tarihe zaten planlanmışsa güncelle
    const { data, error } = await supabase
      .from('sevkiyat_planlari')
      .upsert(
        { siparis_id, arac_id, tarih: selectedDate },
        { onConflict: 'siparis_id,tarih' }
      )
      .select(`id, siparis_id, arac_id, tarih,
        siparisler(siparis_no, teslim_tarihi, durum, cari(ad))`)
      .single()

    if (error || !data) return

    const p = data as any
    const yeniPlan: PlanliSiparis = {
      plan_id: p.id,
      siparis_id: p.siparis_id,
      arac_id: p.arac_id,
      tarih: p.tarih,
      siparis_no: p.siparisler?.siparis_no ?? '—',
      musteri: p.siparisler?.cari?.ad ?? '—',
      teslim_tarihi: p.siparisler?.teslim_tarihi ?? selectedDate,
      durum: p.siparisler?.durum ?? '',
    }

    // Havuzdan çıkar, planlar'a ekle (eski plan'ı replace)
    setHavuzSiparisler(prev => prev.filter(s => s.id !== siparis_id))
    setPlanlar(prev => [...prev.filter(pl => pl.siparis_id !== siparis_id), yeniPlan])
  }

  async function onDropToHavuz(e: React.DragEvent) {
    e.preventDefault()
    setOverZone(null)
    const raw = e.dataTransfer.getData('text/plain')
    const payload = decodeDrag(raw)
    if (!payload || payload.kind !== 'plan') return

    await supabase.from('sevkiyat_planlari').delete().eq('id', payload.plan_id)

    // Plan'dan havuza geri ekle
    const plan = planlar.find(p => p.plan_id === payload.plan_id)
    if (plan) {
      setHavuzSiparisler(prev => [...prev, {
        id: plan.siparis_id,
        siparis_no: plan.siparis_no,
        musteri: plan.musteri,
        teslim_tarihi: plan.teslim_tarihi,
        durum: plan.durum,
      }])
    }
    setPlanlar(prev => prev.filter(p => p.plan_id !== payload.plan_id))
  }

  async function planKaldir(plan: PlanliSiparis) {
    await supabase.from('sevkiyat_planlari').delete().eq('id', plan.plan_id)
    setHavuzSiparisler(prev => [...prev, {
      id: plan.siparis_id,
      siparis_no: plan.siparis_no,
      musteri: plan.musteri,
      teslim_tarihi: plan.teslim_tarihi,
      durum: plan.durum,
    }])
    setPlanlar(prev => prev.filter(p => p.plan_id !== plan.plan_id))
  }

  /* ===================================================================
     Araç yönetimi
  =================================================================== */
  async function aracEkle() {
    if (!yeniPlaka.trim() || !yeniAd.trim()) {
      setAracHata('Plaka ve araç adı zorunludur.')
      return
    }
    setAracKaydediyor(true)
    setAracHata('')
    const { data, error } = await supabase
      .from('araclar')
      .insert({
        plaka: yeniPlaka.trim().toUpperCase(),
        ad: yeniAd.trim(),
        kapasite_m2: yeniKapasite ? parseFloat(yeniKapasite) : null,
      })
      .select('id, plaka, ad, kapasite_m2, aktif')
      .single()
    setAracKaydediyor(false)
    if (error) { setAracHata(error.message); return }
    setAraclar(prev => [...prev, data as Arac])
    setYeniPlaka(''); setYeniAd(''); setYeniKapasite('')
  }

  async function aracSil(id: string) {
    await supabase.from('araclar').update({ aktif: false }).eq('id', id)
    setAraclar(prev => prev.filter(a => a.id !== id))
  }

  /* ===================================================================
     Render
  =================================================================== */
  const today = toDateStr(new Date())

  const modalCls = fullscreen
    ? 'fixed inset-0 z-50 bg-white flex flex-col'
    : 'fixed inset-4 z-50 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[95vh]'

  return (
    <div className={modalCls}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <Truck size={18} className="text-blue-600" />
          <h2 className="text-base font-semibold text-gray-800">Sevkiyat Planlaması</h2>
          <span className="text-xs text-gray-400 hidden sm:block">
            Sürükleyip araç kolonlarına bırakarak sevkiyat planı oluşturun
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAracYonetimiAcik(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Settings size={13} /> Araçlar
          </button>
          <button
            onClick={() => setFullscreen(v => !v)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            title={fullscreen ? 'Küçült' : 'Tam Ekran'}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={onKapat}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Araç Yönetimi Panel ── */}
      {aracYonetimiAcik && (
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          <div className="flex items-start gap-4 flex-wrap">
            {/* Mevcut araçlar */}
            <div className="flex flex-wrap gap-2">
              {araclar.map(a => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs">
                  <span className="font-mono font-bold text-gray-700">{a.plaka}</span>
                  <span className="text-gray-500">{a.ad}</span>
                  {a.kapasite_m2 && <span className="text-gray-400">{a.kapasite_m2}m²</span>}
                  <button onClick={() => aracSil(a.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
            {/* Yeni araç formu */}
            <div className="flex items-start gap-2 flex-wrap">
              <input
                value={yeniPlaka}
                onChange={e => setYeniPlaka(e.target.value)}
                placeholder="Plaka"
                className="w-32 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <input
                value={yeniAd}
                onChange={e => setYeniAd(e.target.value)}
                placeholder="Araç Adı"
                className="w-36 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <input
                value={yeniKapasite}
                onChange={e => setYeniKapasite(e.target.value)}
                placeholder="Kapasite (m²)"
                type="number"
                min="0"
                className="w-28 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                onClick={aracEkle}
                disabled={aracKaydediyor}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
              >
                <Plus size={13} /> Ekle
              </button>
              {aracHata && (
                <div className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle size={12} /> {aracHata}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ========== LEFT: Calendar + Sipariş Havuzu ========== */}
        <div className="w-72 shrink-0 flex flex-col border-r border-gray-100 overflow-hidden">

          {/* Week calendar */}
          <div className="px-3 pt-3 pb-2 border-b border-gray-100 shrink-0">
            {/* Nav */}
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-xs font-medium text-gray-600 text-center">
                {weekStart.getDate()} {toTurkishMonthName(weekStart.getMonth())} –{' '}
                {weekEnd.getDate()} {toTurkishMonthName(weekEnd.getMonth())}
              </span>
              <button
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
            {/* Bu hafta */}
            <button
              onClick={() => { setWeekStart(getMonday(new Date())); setSelectedDate(today) }}
              className="w-full text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg py-1 mb-2 font-medium transition-colors"
            >
              Bu Hafta
            </button>
            {/* Days */}
            <div className="grid grid-cols-7 gap-0.5">
              {weekDays.map((day, i) => {
                const ds = toDateStr(day)
                const isToday = ds === today
                const isSelected = ds === selectedDate
                const count = weekPlanCounts[ds] ?? 0
                return (
                  <button
                    key={ds}
                    onClick={() => setSelectedDate(ds)}
                    className={`flex flex-col items-center py-1.5 rounded-lg transition-all ${
                      isSelected
                        ? 'bg-blue-500 shadow-sm'
                        : isToday
                        ? 'bg-blue-50 ring-1 ring-blue-200'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`text-[10px] font-medium ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                      {HAFTA_GUNLERI[i]}
                    </span>
                    <span className={`text-sm font-bold ${isSelected ? 'text-white' : isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                      {day.getDate()}
                    </span>
                    {count > 0 && (
                      <span className={`text-[9px] font-bold ${isSelected ? 'text-blue-200' : 'text-blue-500'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sipariş Havuzu */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 pt-3 pb-1 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-600">Sipariş Havuzu</h3>
                <span className="text-xs text-gray-400">{havuzSiparisler.length} sipariş</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">Araç kolonuna sürükleyin</p>
            </div>

            <DropZone
              isOver={overZone === 'havuz'}
              onDragOver={e => onDragOver(e, 'havuz')}
              onDragLeave={onDragLeave}
              onDrop={onDropToHavuz}
              className="flex-1 overflow-y-auto mx-3 mb-3 p-2 space-y-1.5 min-h-[100px]"
            >
              {havuzSiparisler.length === 0 && overZone !== 'havuz' && (
                <div className="flex flex-col items-center justify-center py-8 text-gray-300">
                  <Check size={24} className="mb-1 opacity-50" />
                  <p className="text-[10px]">Tüm siparişler planlandı</p>
                </div>
              )}
              {havuzSiparisler.map(s => (
                <SiparisKarti
                  key={s.id}
                  siparis={s}
                  isDragging={draggingId === s.id}
                  onDragStart={e => onSiparisDragStart(e, { kind: 'havuz', siparis_id: s.id }, s.id)}
                  onDragEnd={onDragEnd}
                />
              ))}
            </DropZone>
          </div>
        </div>

        {/* ========== RIGHT: Araç Kolonları ========== */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          {yukleniyor ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Yükleniyor…
            </div>
          ) : araclar.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <Truck size={40} className="opacity-20" />
              <p className="text-sm">Henüz araç tanımlanmamış</p>
              <button
                onClick={() => setAracYonetimiAcik(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus size={15} /> Araç Ekle
              </button>
            </div>
          ) : (
            <div className="flex h-full gap-3 p-4">
              {araclar.map(arac => {
                const aracPlanlar = planlar.filter(p => p.arac_id === arac.id)
                const isOver = overZone === arac.id
                return (
                  <div
                    key={arac.id}
                    className="flex flex-col w-64 shrink-0 h-full"
                  >
                    {/* Araç header */}
                    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl border-x border-t transition-colors ${
                      isOver ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isOver ? 'bg-blue-100' : 'bg-white border border-gray-200'
                      }`}>
                        <Truck size={14} className={isOver ? 'text-blue-600' : 'text-gray-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-800 truncate">{arac.ad}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{arac.plaka}</div>
                      </div>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                        aracPlanlar.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {aracPlanlar.length}
                      </span>
                    </div>

                    {/* Drop zone body */}
                    <DropZone
                      isOver={isOver}
                      onDragOver={e => onDragOver(e, arac.id)}
                      onDragLeave={onDragLeave}
                      onDrop={e => onDropToArac(e, arac.id)}
                      className={`flex-1 overflow-y-auto p-2 space-y-1.5 rounded-b-xl border-x border-b ${
                        isOver ? 'border-blue-300' : 'border-gray-200'
                      }`}
                    >
                      {aracPlanlar.length === 0 && !isOver && (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-300">
                          <Truck size={28} className="mb-1 opacity-30" />
                          <p className="text-[10px] text-center">Sipariş bırakın</p>
                        </div>
                      )}
                      {aracPlanlar.map(plan => (
                        <SiparisKarti
                          key={plan.plan_id}
                          siparis={plan}
                          isDragging={draggingId === plan.plan_id}
                          onDragStart={e => onSiparisDragStart(
                            e,
                            { kind: 'plan', plan_id: plan.plan_id, siparis_id: plan.siparis_id, from_arac_id: plan.arac_id },
                            plan.plan_id
                          )}
                          onDragEnd={onDragEnd}
                          onRemove={() => planKaldir(plan)}
                        />
                      ))}
                    </DropZone>
                  </div>
                )
              })}

              {/* Add vehicle shortcut column */}
              <div className="w-52 shrink-0 h-full flex items-center justify-center">
                <button
                  onClick={() => { setAracYonetimiAcik(true) }}
                  className="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed border-gray-200 text-gray-300 hover:border-blue-300 hover:text-blue-400 transition-all w-full"
                >
                  <Plus size={22} />
                  <span className="text-xs font-medium">Araç Ekle</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="px-5 py-2 border-t border-gray-100 shrink-0 flex items-center gap-4 text-xs text-gray-400">
        <span>{formatDate(selectedDate)} için plan</span>
        <span>·</span>
        <span>{planlar.length} sipariş planlandı</span>
        <span>·</span>
        <span>{havuzSiparisler.length} bekliyor</span>
        <span className="ml-auto">Değişiklikler otomatik kaydedilir</span>
        <Save size={12} className="text-green-500" />
      </div>
    </div>
  )
}
