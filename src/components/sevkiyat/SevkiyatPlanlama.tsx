import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react'
import {
  X, Maximize2, Minimize2, Truck, ChevronLeft, ChevronRight,
  GripVertical, Save, Check, CalendarDays, CalendarRange, Search, Inbox, Calendar,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface Arac {
  id: string; plaka: string; ad: string | null; kapasite_m2: number | null; aktif: boolean
}
interface PlanliSiparis {
  plan_id: string; siparis_id: string; arac_id: string; tarih: string
  siparis_no: string; cari_ad: string; cari_kod: string; alt_musteri: string | null
  teslim_tarihi: string; cam_adedi: number; notlar: string | null; plan_notlar: string | null
}
interface HavuzSiparis {
  id: string; siparis_no: string; cari_ad: string; cari_kod: string; alt_musteri: string | null
  teslim_tarihi: string; cam_adedi: number; notlar: string | null
}
interface Props { onKapat: () => void }

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(d: Date, n: number): Date {
  const date = new Date(d); date.setDate(date.getDate() + n); return date
}
function getMonday(d: Date): Date {
  const date = new Date(d); date.setHours(0, 0, 0, 0)
  const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day)); return date
}
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const HAFTA_GUNLERI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function buildMonthGrid(currentMonth: Date): (Date | null)[] {
  const year = currentMonth.getFullYear(); const month = currentMonth.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const startPad = firstDow === 0 ? 6 : firstDow - 1
  const lastDay = new Date(year, month + 1, 0).getDate()
  const days: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) days.push(null)
  for (let d = 1; d <= lastDay; d++) days.push(new Date(year, month, d))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

function tarihBaslik(ds: string): string {
  const [y, m, d] = ds.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yarin = addDays(today, 1)
  const dun = addDays(today, -1)
  if (toDateStr(date) === toDateStr(today)) return 'Bugün'
  if (toDateStr(date) === toDateStr(yarin)) return 'Yarın'
  if (toDateStr(date) === toDateStr(dun)) return 'Dün'
  const gun = HAFTA_GUNLERI[(date.getDay() + 6) % 7]
  return `${date.getDate()} ${AYLAR[date.getMonth()]} ${date.getFullYear()} · ${gun}`
}

type DragPayload =
  | { kind: 'havuz'; siparis_id: string }
  | { kind: 'plan'; plan_id: string; siparis_id: string; from_arac_id: string }
function encodeDrag(p: DragPayload): string { return JSON.stringify(p) }
function decodeDrag(s: string): DragPayload | null { try { return JSON.parse(s) } catch { return null } }

export default function SevkiyatPlanlama({ onKapat }: Props) {
  const [fullscreen, setFullscreen] = useState(false)
  const [takvimGorunum, setTakvimGorunum] = useState<'aylik' | 'haftalik'>('aylik')
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [selectedDate, setSelectedDate] = useState<string>(toDateStr(new Date()))
  const [araclar, setAraclar] = useState<Arac[]>([])
  const [tumSevkiyatlar, setTumSevkiyatlar] = useState<HavuzSiparis[]>([])
  const [tumPlanlar, setTumPlanlar] = useState<PlanliSiparis[]>([])
  const [aramaMetni, setAramaMetni] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [listYukleniyor, setListYukleniyor] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragPayloadRef = useRef<DragPayload | null>(null)
  const [overZone, setOverZone] = useState<string | null>(null)

  // Load aktif araçlar
  useEffect(() => {
    supabase.from('araclar').select('id, plaka, ad, kapasite_m2, aktif').eq('aktif', true).order('plaka')
      .then(({ data, error }) => {
        if (error) console.error('[Sevkiyat] araçlar yüklenemedi:', error)
        setAraclar(data ?? []); setYukleniyor(false)
      })
  }, [])

  // Load tüm sevkiyat siparişleri (teslimat_tipi='sevkiyat')
  const yukleSevkiyatlar = useCallback(async () => {
    setListYukleniyor(true)
    const { data, error } = await supabase.from('siparisler')
      .select('id, siparis_no, teslim_tarihi, notlar, alt_musteri, cari(ad, kod), siparis_detaylari(id, adet)')
      .eq('teslimat_tipi', 'sevkiyat').order('teslim_tarihi')
    if (error) console.error('[Sevkiyat] sipariş listesi yüklenemedi:', error)
    const cam = (det: any[]) => (det ?? []).reduce((s: number, d: any) => s + (d.adet ?? 1), 0)
    setTumSevkiyatlar((data ?? []).map((s: any) => ({
      id: s.id, siparis_no: s.siparis_no,
      cari_ad: s.cari?.ad ?? '—', cari_kod: s.cari?.kod ?? '',
      alt_musteri: s.alt_musteri ?? null,
      teslim_tarihi: s.teslim_tarihi,
      cam_adedi: cam(s.siparis_detaylari), notlar: s.notlar ?? null,
    })))
    setListYukleniyor(false)
  }, [])

  // Load TÜM planlar (tüm tarihler) — tek sorgu, sağ panel + takvim noktaları + atanmış filtresi için
  const yuklePlanlar = useCallback(async () => {
    const cam = (det: any[]) => (det ?? []).reduce((s: number, d: any) => s + (d.adet ?? 1), 0)
    const { data, error } = await supabase.from('sevkiyat_planlari')
      .select('id, siparis_id, arac_id, tarih, notlar, siparisler(siparis_no, teslim_tarihi, notlar, alt_musteri, cari(ad, kod), siparis_detaylari(id, adet))')
      .order('tarih')
    if (error) console.error('[Sevkiyat] planlar yüklenemedi:', error)
    setTumPlanlar((data ?? []).map((p: any) => ({
      plan_id: p.id, siparis_id: p.siparis_id, arac_id: p.arac_id, tarih: p.tarih,
      siparis_no: p.siparisler?.siparis_no ?? '—',
      cari_ad: p.siparisler?.cari?.ad ?? '—',
      cari_kod: p.siparisler?.cari?.kod ?? '',
      alt_musteri: p.siparisler?.alt_musteri ?? null,
      teslim_tarihi: p.siparisler?.teslim_tarihi ?? p.tarih,
      cam_adedi: cam(p.siparisler?.siparis_detaylari),
      notlar: p.siparisler?.notlar ?? null,
      plan_notlar: p.notlar ?? null,
    })))
  }, [])

  useEffect(() => { yukleSevkiyatlar() }, [yukleSevkiyatlar])
  useEffect(() => { yuklePlanlar() }, [yuklePlanlar])

  // Türev veriler
  const atanmisIds = useMemo(() => new Set(tumPlanlar.map(p => p.siparis_id)), [tumPlanlar])
  const sevkEdilecek = useMemo(() => {
    const arr = tumSevkiyatlar.filter(s => !atanmisIds.has(s.id))
    if (!aramaMetni.trim()) return arr
    const q = aramaMetni.toLowerCase()
    return arr.filter(s =>
      s.siparis_no.toLowerCase().includes(q) ||
      s.cari_ad.toLowerCase().includes(q) ||
      s.cari_kod.toLowerCase().includes(q) ||
      (s.alt_musteri ?? '').toLowerCase().includes(q))
  }, [tumSevkiyatlar, atanmisIds, aramaMetni])

  const gunPlanlari = useMemo(
    () => tumPlanlar.filter(p => p.tarih === selectedDate),
    [tumPlanlar, selectedDate])

  const calPlanCounts = useMemo(() => {
    const m: Record<string, number> = {}
    tumPlanlar.forEach(p => { m[p.tarih] = (m[p.tarih] ?? 0) + 1 })
    return m
  }, [tumPlanlar])

  // Sağ panel: tüm tarihlere göre gruplu, tarih artan sırada
  const sagPanelGruplari = useMemo(() => {
    const grup: Record<string, PlanliSiparis[]> = {}
    tumPlanlar.forEach(p => { (grup[p.tarih] ??= []).push(p) })
    return Object.entries(grup).sort(([a], [b]) => a.localeCompare(b))
      .map(([tarih, planlar]) => ({ tarih, planlar }))
  }, [tumPlanlar])

  const today = toDateStr(new Date())

  // Sağ paneldeki "bugün" kısmına otomatik scroll
  const sagPanelRef = useRef<HTMLDivElement>(null)
  const bugunAnchorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sagPanelRef.current) return
    // bugüne en yakın grup başlığına scroll
    const anchor = bugunAnchorRef.current
    if (anchor) anchor.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [sagPanelGruplari.length])

  function onSiparisDragStart(e: React.DragEvent, payload: DragPayload, id: string) {
    dragPayloadRef.current = payload
    e.dataTransfer.setData('text/plain', encodeDrag(payload))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }
  function onDragEnd() { setDraggingId(null); setOverZone(null); dragPayloadRef.current = null }
  function onDragOver(e: React.DragEvent, zone: string) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverZone(zone) }
  function onDragLeave(e: React.DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOverZone(null)
  }

  async function onDropToArac(e: React.DragEvent, arac_id: string) {
    e.preventDefault(); setOverZone(null)
    const payload = decodeDrag(e.dataTransfer.getData('text/plain'))
    if (!payload) return
    const siparis_id = payload.siparis_id
    if (payload.kind === 'plan' && payload.from_arac_id === arac_id) return

    // Aynı tarihte upsert: unique(siparis_id, tarih) sayesinde aynı sipariş tekrarlamaz.
    // Strict mod: havuzdan bırakılırken siparişin başka tarihte planı olmamalı (zaten sol listeden filtrelenir),
    // plan kartı ise yalnızca aynı tarihte araç değiştirir.
    const { data, error } = await supabase.from('sevkiyat_planlari')
      .upsert({ siparis_id, arac_id, tarih: selectedDate }, { onConflict: 'siparis_id,tarih' })
      .select('id, siparis_id, arac_id, tarih, notlar, siparisler(siparis_no, teslim_tarihi, notlar, alt_musteri, cari(ad, kod), siparis_detaylari(id, adet))')
      .single()
    if (error || !data) { console.error('[Sevkiyat] araç ataması yapılamadı:', error); return }
    const p = data as any
    const cam = ((p.siparisler?.siparis_detaylari) ?? []).reduce((s: number, d: any) => s + (d.adet ?? 1), 0)
    const yeni: PlanliSiparis = {
      plan_id: p.id, siparis_id: p.siparis_id, arac_id: p.arac_id, tarih: p.tarih,
      siparis_no: p.siparisler?.siparis_no ?? '—',
      cari_ad: p.siparisler?.cari?.ad ?? '—',
      cari_kod: p.siparisler?.cari?.kod ?? '',
      alt_musteri: p.siparisler?.alt_musteri ?? null,
      teslim_tarihi: p.siparisler?.teslim_tarihi ?? selectedDate,
      cam_adedi: cam, notlar: p.siparisler?.notlar ?? null, plan_notlar: p.notlar ?? null,
    }
    setTumPlanlar(prev => {
      // Aynı tarihte aynı sipariş varsa eskisini kaldır (araç değiştirme)
      const filtered = prev.filter(pl => !(pl.siparis_id === siparis_id && pl.tarih === selectedDate))
      return [...filtered, yeni]
    })
  }

  async function planKaldir(plan: PlanliSiparis) {
    const { error } = await supabase.from('sevkiyat_planlari').delete().eq('id', plan.plan_id)
    if (error) { console.error('[Sevkiyat] plan kaldırılamadı:', error); return }
    setTumPlanlar(prev => prev.filter(p => p.plan_id !== plan.plan_id))
  }

  async function onDropToList(e: React.DragEvent) {
    e.preventDefault(); setOverZone(null)
    const payload = decodeDrag(e.dataTransfer.getData('text/plain'))
    if (!payload || payload.kind !== 'plan') return
    const { error } = await supabase.from('sevkiyat_planlari').delete().eq('id', payload.plan_id)
    if (error) { console.error('[Sevkiyat] plan silinemedi:', error); return }
    setTumPlanlar(prev => prev.filter(p => p.plan_id !== payload.plan_id))
  }

  const monthGrid = buildMonthGrid(currentMonth)
  const weekEnd = addDays(weekStart, 6)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const modalCls = fullscreen
    ? 'fixed inset-0 z-50 bg-white flex flex-col'
    : 'fixed inset-2 z-50 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[98vh]'

  // Render fonksiyonları (component değil — re-mount engellemek için)
  const renderSiparisKarti = ({ siparis, isDragging, draggable, onDragStartFn, onDragEndFn, onRemove, faded }: {
    siparis: HavuzSiparis | PlanliSiparis; cardId?: string; isDragging: boolean
    draggable: boolean
    onDragStartFn?: (e: React.DragEvent) => void; onDragEndFn?: () => void
    onRemove?: () => void; faded?: boolean
  }) => {
    const s = siparis as any
    const planNotlar: string | null = s.plan_notlar ?? null
    return (
      <div className={`group rounded-xl border bg-white transition-all select-none ${isDragging ? 'opacity-40 scale-95' : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'} ${faded ? 'opacity-50 hover:opacity-100' : ''}`}>
        <div
          draggable={draggable}
          onDragStart={onDragStartFn}
          onDragEnd={onDragEndFn}
          className={`flex items-start gap-2 px-3 py-2.5 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          {draggable && (
            <GripVertical size={14} className="mt-1 text-gray-300 group-hover:text-gray-400 shrink-0" />
          )}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Üst satır: alt_musteri (büyük) */}
            <div className="text-sm font-bold text-gray-900 truncate leading-tight">
              {s.alt_musteri || s.cari_ad}
            </div>
            {/* Cari ad (renkli) */}
            {s.alt_musteri && (
              <div className="text-xs font-semibold text-blue-600 truncate">{s.cari_ad}</div>
            )}
            {/* Cari kod */}
            {s.cari_kod && (
              <div className="text-[10px] text-gray-400 font-mono">{s.cari_kod}</div>
            )}
            {/* Meta satırı */}
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-50">
              <span className="font-mono text-[10px] font-bold text-gray-700 bg-gray-50 px-1.5 py-0.5 rounded">
                {s.siparis_no}
              </span>
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Calendar size={9} /> {formatDate(s.teslim_tarihi)}
              </span>
              {s.cam_adedi > 0 && (
                <span className="text-[10px] text-blue-600 font-medium">◧ {s.cam_adedi} cam</span>
              )}
            </div>
            {s.notlar && (
              <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 truncate border border-amber-100">
                📌 {s.notlar}
              </div>
            )}
            {planNotlar && (
              <div className="text-[10px] text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5 truncate border border-indigo-100">
                🚛 {planNotlar}
              </div>
            )}
          </div>
          {onRemove && (
            <button
              onClick={e => { e.stopPropagation(); onRemove() }}
              className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded text-gray-300 hover:text-red-500 transition-all"
              title="Atamayı kaldır"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderDropZone = ({ isOver, onDragOverFn, onDragLeaveFn, onDropFn, children, className }: {
    isOver: boolean; onDragOverFn: (e: React.DragEvent) => void
    onDragLeaveFn: (e: React.DragEvent) => void; onDropFn: (e: React.DragEvent) => void
    children: React.ReactNode; className?: string
  }) => (
    <div
      onDragOver={onDragOverFn}
      onDragLeave={onDragLeaveFn}
      onDrop={onDropFn}
      className={`transition-all ${isOver ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/50 rounded-xl' : ''} ${className ?? ''}`}
    >
      {children}
    </div>
  )

  return (
    <div className={modalCls}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm shadow-blue-200">
            <Truck size={15} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800 leading-tight">Sevkiyat Planlaması</h2>
            <p className="text-[10px] text-gray-400">Sürükle-bırak ile araç ataması yapın · <span className="text-gray-300">araç yönetimi → Ayarlar</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFullscreen(v => !v)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main 4-column layout: Takvim | Sevk Edilecek | Araç Kolonları | Sevkiyat Listesi */}
      <div className="flex flex-1 overflow-hidden">

        {/* COL 1: Takvim */}
        <div className="w-[280px] shrink-0 border-r border-gray-100 flex flex-col bg-gradient-to-b from-slate-50 to-white overflow-hidden">
          <div className="px-4 pt-4 pb-4 shrink-0">
            <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5 mb-4">
              <button onClick={() => setTakvimGorunum('aylik')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${takvimGorunum === 'aylik' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                <CalendarDays size={12} /> Aylık
              </button>
              <button onClick={() => setTakvimGorunum('haftalik')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${takvimGorunum === 'haftalik' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                <CalendarRange size={12} /> Haftalık
              </button>
            </div>

            {takvimGorunum === 'aylik' ? (
              <div className="flex items-center justify-between mb-3 px-1">
                <button onClick={() => { const d = new Date(currentMonth); d.setMonth(d.getMonth() - 1); setCurrentMonth(d) }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-200">
                  <ChevronLeft size={14} />
                </button>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-800 leading-tight">{AYLAR[currentMonth.getMonth()]}</p>
                  <p className="text-[10px] text-gray-400 font-medium">{currentMonth.getFullYear()}</p>
                </div>
                <button onClick={() => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + 1); setCurrentMonth(d) }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-200">
                  <ChevronRight size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between mb-3 px-1">
                <button onClick={() => setWeekStart(addDays(weekStart, -7))}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-200">
                  <ChevronLeft size={14} />
                </button>
                <p className="text-[11px] font-semibold text-gray-700">
                  {weekStart.getDate()} {AYLAR[weekStart.getMonth()]} – {weekEnd.getDate()} {AYLAR[weekEnd.getMonth()]}
                </p>
                <button onClick={() => setWeekStart(addDays(weekStart, 7))}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-200">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {takvimGorunum === 'aylik' && (
              <div>
                <div className="grid grid-cols-7 mb-2">
                  {HAFTA_GUNLERI.map(g => (
                    <div key={g} className="text-center text-[9px] font-bold text-gray-300 uppercase tracking-widest pb-1">{g}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {monthGrid.map((day, idx) => {
                    if (!day) return <div key={`pad-${idx}`} className="h-9" />
                    const ds = toDateStr(day)
                    const isToday = ds === today
                    const isSelected = ds === selectedDate
                    const count = calPlanCounts[ds] ?? 0
                    const hasPlan = count > 0
                    return (
                      <button key={ds} onClick={() => setSelectedDate(ds)}
                        className={`flex flex-col items-center justify-center h-9 rounded-xl transition-all
                          ${isSelected
                            ? 'bg-blue-500 shadow-md shadow-blue-200/60'
                            : isToday
                            ? 'bg-white ring-2 ring-blue-400 shadow-sm'
                            : hasPlan
                            ? 'bg-white hover:bg-blue-50 shadow-sm border border-gray-100'
                            : 'hover:bg-white/70'}`}>
                        <span className={`text-xs font-bold leading-none ${isSelected ? 'text-white' : isToday ? 'text-blue-600' : hasPlan ? 'text-gray-800' : 'text-gray-400'}`}>
                          {day.getDate()}
                        </span>
                        {hasPlan && (
                          <div className="flex gap-px mt-0.5">
                            {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                              <div key={i} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-blue-200' : 'bg-blue-400'}`} />
                            ))}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCurrentMonth(d); setSelectedDate(today) }}
                    className="text-[10px] text-blue-500 hover:text-blue-700 font-semibold transition-colors px-3 py-1 rounded-lg hover:bg-blue-50">
                    Bugüne dön
                  </button>
                </div>
              </div>
            )}

            {takvimGorunum === 'haftalik' && (
              <div>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((day, i) => {
                    const ds = toDateStr(day)
                    const isToday = ds === today
                    const isSelected = ds === selectedDate
                    const count = calPlanCounts[ds] ?? 0
                    const hasPlan = count > 0
                    return (
                      <button key={ds} onClick={() => setSelectedDate(ds)}
                        className={`flex flex-col items-center py-2.5 rounded-xl transition-all
                          ${isSelected ? 'bg-blue-500 shadow-md shadow-blue-200/60'
                            : isToday ? 'bg-white ring-2 ring-blue-400 shadow-sm'
                            : hasPlan ? 'bg-white shadow-sm border border-gray-100 hover:bg-blue-50'
                            : 'hover:bg-white/70'}`}>
                        <span className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${isSelected ? 'text-blue-200' : 'text-gray-300'}`}>{HAFTA_GUNLERI[i]}</span>
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : isToday ? 'text-blue-600' : 'text-gray-700'}`}>{day.getDate()}</span>
                        {hasPlan && (
                          <div className="flex gap-px mt-1">
                            {Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                              <div key={j} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-blue-200' : 'bg-blue-400'}`} />
                            ))}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-3 flex justify-center">
                  <button onClick={() => { setWeekStart(getMonday(new Date())); setSelectedDate(today) }}
                    className="text-[10px] text-blue-500 hover:text-blue-700 font-semibold transition-colors px-3 py-1 rounded-lg hover:bg-blue-50">
                    Bu haftaya dön
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Seçili tarih bilgi kartı */}
          <div className="mx-4 mb-4 shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mb-1">Seçili Tarih</p>
              <p className="text-sm font-bold text-gray-800">{formatDate(selectedDate)}</p>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {gunPlanlari.length} atama
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  {sevkEdilecek.length} sevk edilecek
                </span>
              </div>
            </div>
          </div>
          <div className="flex-1" />
        </div>

        {/* COL 2: Sevk Edilecek Listeler */}
        <div className="w-[300px] shrink-0 border-r border-gray-100 flex flex-col bg-white overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <Inbox size={12} className="text-gray-400" />
                  Sevk Edilecek Listeler
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {listYukleniyor ? 'Yükleniyor…' : `${sevkEdilecek.length} bekleyen sipariş`}
                </p>
              </div>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
              <input
                type="search"
                value={aramaMetni}
                onChange={e => setAramaMetni(e.target.value)}
                placeholder="Sipariş no, müşteri, kod ara…"
                className="w-full text-xs border border-gray-200 rounded-xl pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-gray-50 focus:bg-white transition-all placeholder:text-gray-300"
              />
            </div>
          </div>

          {renderDropZone({
            isOver: overZone === 'list',
            onDragOverFn: e => onDragOver(e, 'list'),
            onDragLeaveFn: onDragLeave,
            onDropFn: onDropToList,
            className: 'flex-1 overflow-y-auto px-3 py-2.5 space-y-2 min-h-0',
            children: (
              <Fragment>
                {listYukleniyor ? (
                  <div className="flex flex-col items-center justify-center py-14 text-gray-300">
                    <div className="w-7 h-7 rounded-full border-2 border-gray-200 border-t-blue-400 animate-spin mb-2" />
                    <p className="text-[10px]">Yükleniyor…</p>
                  </div>
                ) : sevkEdilecek.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-gray-300">
                    <Check size={28} className="mb-2 opacity-40" />
                    <p className="text-[10px] text-center font-medium">
                      {aramaMetni ? 'Sonuç bulunamadı' : 'Tüm siparişler atanmış'}
                    </p>
                    <p className="text-[9px] text-center mt-0.5 opacity-60">
                      {aramaMetni ? 'Farklı bir arama deneyin' : 'Yeni sipariş geldiğinde burada listelenir'}
                    </p>
                  </div>
                ) : (
                  <Fragment>
                    {sevkEdilecek.map(s => (
                      <Fragment key={s.id}>
                        {renderSiparisKarti({
                          siparis: s,
                          cardId: s.id,
                          isDragging: draggingId === s.id,
                          draggable: true,
                          onDragStartFn: e => onSiparisDragStart(e, { kind: 'havuz', siparis_id: s.id }, s.id),
                          onDragEndFn: onDragEnd,
                        })}
                      </Fragment>
                    ))}
                  </Fragment>
                )}
              </Fragment>
            ),
          })}
        </div>

        {/* COL 3: Araç kolonları */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-gray-50/30 border-r border-gray-100">
          {yukleniyor ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">Yükleniyor…</div>
          ) : araclar.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <Truck size={40} className="opacity-20" />
              <p className="text-sm font-medium">Henüz aktif araç yok</p>
              <p className="text-[11px] text-gray-400">Araçları Ayarlar sayfasından ekleyebilirsiniz</p>
            </div>
          ) : (
            <div className="flex h-full gap-3 p-4">
              {araclar.map(arac => {
                const aracPlanlar = gunPlanlari.filter(p => p.arac_id === arac.id)
                const isOver = overZone === arac.id
                const toplamCam = aracPlanlar.reduce((s, p) => s + p.cam_adedi, 0)
                return (
                  <div key={arac.id} className="flex flex-col w-56 shrink-0 h-full">
                    <div className={`flex items-center gap-2 px-3 py-3 rounded-t-xl border-x border-t transition-colors ${isOver ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isOver ? 'bg-blue-100' : 'bg-gray-50 border border-gray-200'}`}>
                        <Truck size={16} className={isOver ? 'text-blue-600' : 'text-gray-400'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-base font-extrabold text-gray-900 truncate tracking-wider">
                          {arac.plaka}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${aracPlanlar.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                            {aracPlanlar.length} sipariş
                          </span>
                          {toplamCam > 0 && (
                            <span className="text-[10px] text-gray-500 font-medium">· {toplamCam} cam</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {renderDropZone({
                      isOver,
                      onDragOverFn: e => onDragOver(e, arac.id),
                      onDragLeaveFn: onDragLeave,
                      onDropFn: e => onDropToArac(e, arac.id),
                      className: `flex-1 overflow-y-auto p-2 space-y-2 rounded-b-xl border-x border-b ${isOver ? 'border-blue-300' : 'border-gray-200'} bg-white`,
                      children: (
                        <Fragment>
                          {aracPlanlar.length === 0 && !isOver && (
                            <div className="flex flex-col items-center justify-center py-8 text-gray-300">
                              <Truck size={22} className="mb-1 opacity-30" />
                              <p className="text-[10px] text-center">Sipariş bırakın</p>
                            </div>
                          )}
                          {aracPlanlar.map(plan => (
                            <Fragment key={plan.plan_id}>
                              {renderSiparisKarti({
                                siparis: plan,
                                cardId: plan.plan_id,
                                isDragging: draggingId === plan.plan_id,
                                draggable: true,
                                onDragStartFn: e => onSiparisDragStart(e, { kind: 'plan', plan_id: plan.plan_id, siparis_id: plan.siparis_id, from_arac_id: plan.arac_id }, plan.plan_id),
                                onDragEndFn: onDragEnd,
                                onRemove: () => planKaldir(plan),
                              })}
                            </Fragment>
                          ))}
                        </Fragment>
                      ),
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* COL 4: Sevkiyat Listesi (tüm tarihler, gruplu) */}
        <div className="w-[320px] shrink-0 flex flex-col bg-gradient-to-b from-white to-slate-50 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
            <h3 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <Truck size={12} className="text-blue-500" />
              Sevkiyat Listesi
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {tumPlanlar.length} planlı atama · tüm tarihler
            </p>
          </div>

          <div ref={sagPanelRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4 min-h-0">
            {sagPanelGruplari.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-300">
                <Truck size={32} className="mb-2 opacity-30" />
                <p className="text-[11px] font-medium">Henüz planlanmış sevkiyat yok</p>
                <p className="text-[9px] mt-0.5 opacity-70">Soldan araç kolonlarına sürükleyerek başlayın</p>
              </div>
            ) : (
              sagPanelGruplari.map(({ tarih, planlar }) => {
                const gecmis = tarih < today
                const seciliMi = tarih === selectedDate
                const isFirst = tarih === sagPanelGruplari.find(g => g.tarih >= today)?.tarih

                // Aynı tarih içinde araca göre grupla
                const aracMap = new Map<string, PlanliSiparis[]>()
                planlar.forEach(p => {
                  const arr = aracMap.get(p.arac_id) ?? []; arr.push(p); aracMap.set(p.arac_id, arr)
                })
                const aracGruplari = Array.from(aracMap.entries())
                  .map(([arac_id, ps]) => ({ arac: araclar.find(a => a.id === arac_id), planlar: ps }))
                  .sort((a, b) => (a.arac?.plaka ?? '').localeCompare(b.arac?.plaka ?? ''))

                return (
                  <div
                    key={tarih}
                    ref={isFirst ? bugunAnchorRef : undefined}
                    className={gecmis ? 'opacity-70 hover:opacity-100 transition-opacity' : ''}
                  >
                    {/* Tarih başlığı — sticky DEĞİL, plakaya binmesin */}
                    <button
                      onClick={() => setSelectedDate(tarih)}
                      className={`w-full text-left rounded-lg px-2.5 py-1.5 mb-2 border transition-all ${seciliMi ? 'bg-blue-50 border-blue-300' : gecmis ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-blue-300'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${seciliMi ? 'bg-blue-500' : gecmis ? 'bg-gray-400' : tarih === today ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                          <span className={`text-[11px] font-bold truncate ${gecmis ? 'text-gray-600' : 'text-gray-900'}`}>
                            {tarihBaslik(tarih)}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-full ${seciliMi ? 'bg-blue-600 text-white' : gecmis ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
                          {planlar.length}
                        </span>
                      </div>
                    </button>

                    {/* Araç grupları — her araç tek bir başlık, altında birden fazla sipariş */}
                    <div className="space-y-2 mb-1">
                      {aracGruplari.map(({ arac, planlar: aracPlanlar }) => (
                        <div key={arac?.id ?? 'unknown'} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                          {/* Plaka şeridi — sadece bir kez gösterilir */}
                          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-900 text-white">
                            <Truck size={11} className="shrink-0 text-gray-400" />
                            <span className="font-mono text-[11px] font-extrabold tracking-wider text-white">
                              {arac?.plaka ?? '—'}
                            </span>
                            <span className="text-[10px] text-gray-500 font-medium ml-0.5">
                              · {aracPlanlar.length} sipariş
                            </span>
                          </div>

                          {/* Bu araca atanan siparişler */}
                          <div className="divide-y divide-gray-100">
                            {aracPlanlar.map(plan => (
                              <div key={plan.plan_id} className="group/card px-3 py-2.5 hover:bg-gray-50 transition-colors">
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="text-sm font-bold text-gray-900 truncate leading-tight">
                                      {plan.alt_musteri || plan.cari_ad}
                                    </div>
                                    {plan.alt_musteri && (
                                      <div className="text-xs font-semibold text-blue-600 truncate">{plan.cari_ad}</div>
                                    )}
                                    {plan.cari_kod && (
                                      <div className="text-[10px] text-gray-500 font-mono">{plan.cari_kod}</div>
                                    )}
                                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                      <span className="font-mono text-[10px] font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">
                                        {plan.siparis_no}
                                      </span>
                                      <span className="text-[10px] text-gray-600 flex items-center gap-1">
                                        <Calendar size={9} /> {formatDate(plan.teslim_tarihi)}
                                      </span>
                                      {plan.cam_adedi > 0 && (
                                        <span className="text-[10px] text-blue-700 font-semibold">◧ {plan.cam_adedi} cam</span>
                                      )}
                                    </div>
                                    {plan.notlar && (
                                      <div className="text-[10px] text-amber-800 bg-amber-50 rounded px-1.5 py-0.5 truncate border border-amber-100">
                                        📌 {plan.notlar}
                                      </div>
                                    )}
                                    {plan.plan_notlar && (
                                      <div className="text-[10px] text-indigo-800 bg-indigo-50 rounded px-1.5 py-0.5 truncate border border-indigo-100">
                                        🚛 {plan.plan_notlar}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => planKaldir(plan)}
                                    className="shrink-0 p-1 mt-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/card:opacity-100 transition-all"
                                    title="Atamayı kaldır"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-5 py-2 border-t border-gray-100 shrink-0 flex items-center gap-3 text-xs text-gray-400">
        <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
        <span className="font-medium text-gray-600">{formatDate(selectedDate)}</span>
        <span>·</span>
        <span>{gunPlanlari.length} bugünkü atama</span>
        <span>·</span>
        <span>{sevkEdilecek.length} bekleyen</span>
        <span>·</span>
        <span>{tumPlanlar.length} toplam plan</span>
        <span className="ml-auto flex items-center gap-1.5 text-emerald-500 font-medium">
          <Save size={11} /> Otomatik kaydediliyor
        </span>
      </div>
    </div>
  )
}
