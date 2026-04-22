import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Maximize2, Minimize2, Plus, Truck, Trash2, ChevronLeft,
  ChevronRight, GripVertical, AlertCircle, Settings, Save, Check,
  CalendarDays, CalendarRange, ChevronDown, Search,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface Arac {
  id: string; plaka: string; ad: string; kapasite_m2: number | null; aktif: boolean
}
interface PlanliSiparis {
  plan_id: string; siparis_id: string; arac_id: string; tarih: string
  siparis_no: string; musteri: string; teslim_tarihi: string; durum: string
  cam_adedi: number; notlar: string | null; plan_notlar: string | null
}
interface HavuzSiparis {
  id: string; siparis_no: string; musteri: string; teslim_tarihi: string
  durum: string; cam_adedi: number; notlar: string | null
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
function toTurkishMonthName(month: number): string {
  return ['Ocak', '\u015eubat', 'Mart', 'Nisan', 'May\u0131s', 'Haziran',
    'Temmuz', 'A\u011fustos', 'Eyl\u00fcl', 'Ekim', 'Kas\u0131m', 'Aral\u0131k'][month]
}
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

const DURUM_STIL: Record<string, string> = {
  beklemede: 'bg-gray-100 text-gray-600', batchte: 'bg-blue-50 text-blue-700',
  yikamada: 'bg-cyan-50 text-cyan-700', tamamlandi: 'bg-green-50 text-green-700',
  eksik_var: 'bg-red-50 text-red-600', iptal: 'bg-red-50 text-red-400',
}
const DURUM_ETIKET: Record<string, string> = {
  beklemede: 'Beklemede', batchte: "Batch'te", yikamada: 'Y\u0131kamada',
  tamamlandi: 'Tamamland\u0131', eksik_var: 'Eksik Var', iptal: '\u0130ptal',
}
const DURUM_BTN: Record<string, string> = {
  beklemede: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300',
  batchte: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300',
  yikamada: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200 border-cyan-300',
  tamamlandi: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-300',
  eksik_var: 'bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-300',
  iptal: 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300',
}
const GECERLI_GECISLER: Record<string, string[]> = {
  beklemede: ['batchte', 'iptal'], batchte: ['yikamada', 'beklemede', 'eksik_var'],
  yikamada: ['tamamlandi', 'eksik_var'], tamamlandi: [],
  eksik_var: ['batchte', 'beklemede', 'tamamlandi'], iptal: ['beklemede'],
}
const HAFTA_GUNLERI = ['Pzt', 'Sal', '\u00c7ar', 'Per', 'Cum', 'Cmt', 'Paz']

type DragPayload =
  | { kind: 'havuz'; siparis_id: string }
  | { kind: 'plan'; plan_id: string; siparis_id: string; from_arac_id: string }
function encodeDrag(p: DragPayload): string { return JSON.stringify(p) }
function decodeDrag(s: string): DragPayload | null { try { return JSON.parse(s) } catch { return null } }

export default function SevkiyatPlanlama({ onKapat }: Props) {
  const [fullscreen, setFullscreen] = useState(false)
  const [aracYonetimiAcik, setAracYonetimiAcik] = useState(false)
  const [takvimGorunum, setTakvimGorunum] = useState<'aylik' | 'haftalik'>('aylik')
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [selectedDate, setSelectedDate] = useState<string>(toDateStr(new Date()))
  const [calPlanCounts, setCalPlanCounts] = useState<Record<string, number>>({})
  const [araclar, setAraclar] = useState<Arac[]>([])
  const [tumSevkiyatlar, setTumSevkiyatlar] = useState<HavuzSiparis[]>([])
  const [planlar, setPlanlar] = useState<PlanliSiparis[]>([])
  const [aramaMetni, setAramaMetni] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [listYukleniyor, setListYukleniyor] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragPayloadRef = useRef<DragPayload | null>(null)
  const [overZone, setOverZone] = useState<string | null>(null)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [durumDegistiriyorId, setDurumDegistiriyorId] = useState<string | null>(null)
  const [yeniPlaka, setYeniPlaka] = useState('')
  const [yeniAd, setYeniAd] = useState('')
  const [yeniKapasite, setYeniKapasite] = useState('')
  const [aracKaydediyor, setAracKaydediyor] = useState(false)
  const [aracHata, setAracHata] = useState('')

  useEffect(() => {
    supabase.from('araclar').select('id, plaka, ad, kapasite_m2, aktif').eq('aktif', true).order('created_at')
      .then(({ data }) => { setAraclar(data ?? []); setYukleniyor(false) })
  }, [])

  const yukleAllSevkiyat = useCallback(async () => {
    setListYukleniyor(true)
    const { data } = await supabase.from('siparisler')
      .select('id, siparis_no, teslim_tarihi, durum, notlar, cari(ad), siparis_detaylari(id, adet)')
      .eq('teslimat_tipi', 'sevkiyat').order('teslim_tarihi')
    const cam = (det: any[]) => (det ?? []).reduce((s: number, d: any) => s + (d.adet ?? 1), 0)
    setTumSevkiyatlar((data ?? []).map((s: any) => ({
      id: s.id, siparis_no: s.siparis_no, musteri: s.cari?.ad ?? '\u2014',
      teslim_tarihi: s.teslim_tarihi, durum: s.durum,
      cam_adedi: cam(s.siparis_detaylari), notlar: s.notlar ?? null,
    })))
    setListYukleniyor(false)
  }, [])

  useEffect(() => { yukleAllSevkiyat() }, [yukleAllSevkiyat])

  useEffect(() => {
    let baslangic: string, bitis: string
    if (takvimGorunum === 'aylik') {
      const y = currentMonth.getFullYear(); const m = currentMonth.getMonth()
      const lastDay = new Date(y, m + 1, 0).getDate()
      baslangic = `${y}-${String(m + 1).padStart(2, '0')}-01`
      bitis = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    } else {
      baslangic = toDateStr(weekStart); bitis = toDateStr(addDays(weekStart, 6))
    }
    supabase.from('sevkiyat_planlari').select('tarih').gte('tarih', baslangic).lte('tarih', bitis)
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        ;(data ?? []).forEach((p: any) => { counts[p.tarih] = (counts[p.tarih] ?? 0) + 1 })
        setCalPlanCounts(counts)
      })
  }, [takvimGorunum, currentMonth, weekStart, planlar])

  const yukleGun = useCallback(async (tarih: string) => {
    const cam = (det: any[]) => (det ?? []).reduce((s: number, d: any) => s + (d.adet ?? 1), 0)
    const { data: planData } = await supabase.from('sevkiyat_planlari')
      .select('id, siparis_id, arac_id, tarih, notlar, siparisler(siparis_no, teslim_tarihi, durum, notlar, cari(ad), siparis_detaylari(id, adet))')
      .eq('tarih', tarih)
    setPlanlar((planData ?? []).map((p: any) => ({
      plan_id: p.id, siparis_id: p.siparis_id, arac_id: p.arac_id, tarih: p.tarih,
      siparis_no: p.siparisler?.siparis_no ?? '\u2014', musteri: p.siparisler?.cari?.ad ?? '\u2014',
      teslim_tarihi: p.siparisler?.teslim_tarihi ?? tarih, durum: p.siparisler?.durum ?? '',
      cam_adedi: cam(p.siparisler?.siparis_detaylari), notlar: p.siparisler?.notlar ?? null, plan_notlar: p.notlar ?? null,
    })))
  }, [])

  useEffect(() => { yukleGun(selectedDate) }, [selectedDate, yukleGun])

  async function durumDegistir(siparisId: string, yeniDurum: string) {
    setDurumDegistiriyorId(siparisId)
    await supabase.from('siparisler').update({ durum: yeniDurum }).eq('id', siparisId)
    setTumSevkiyatlar(prev => prev.map(s => s.id === siparisId ? { ...s, durum: yeniDurum } : s))
    setPlanlar(prev => prev.map(p => p.siparis_id === siparisId ? { ...p, durum: yeniDurum } : p))
    setDurumDegistiriyorId(null); setExpandedCardId(null)
  }

  function onSiparisDragStart(e: React.DragEvent, payload: DragPayload, id: string) {
    dragPayloadRef.current = payload
    e.dataTransfer.setData('text/plain', encodeDrag(payload))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id); setExpandedCardId(null)
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
    if (payload.kind === 'plan') await supabase.from('sevkiyat_planlari').delete().eq('id', payload.plan_id)
    const { data, error } = await supabase.from('sevkiyat_planlari')
      .upsert({ siparis_id, arac_id, tarih: selectedDate }, { onConflict: 'siparis_id,tarih' })
      .select('id, siparis_id, arac_id, tarih, notlar, siparisler(siparis_no, teslim_tarihi, durum, notlar, cari(ad), siparis_detaylari(id, adet))')
      .single()
    if (error || !data) return
    const p = data as any
    const cam = ((p.siparisler?.siparis_detaylari) ?? []).reduce((s: number, d: any) => s + (d.adet ?? 1), 0)
    const yeniPlan: PlanliSiparis = {
      plan_id: p.id, siparis_id: p.siparis_id, arac_id: p.arac_id, tarih: p.tarih,
      siparis_no: p.siparisler?.siparis_no ?? '\u2014', musteri: p.siparisler?.cari?.ad ?? '\u2014',
      teslim_tarihi: p.siparisler?.teslim_tarihi ?? selectedDate, durum: p.siparisler?.durum ?? '',
      cam_adedi: cam, notlar: p.siparisler?.notlar ?? null, plan_notlar: p.notlar ?? null,
    }
    setPlanlar(prev => [...prev.filter(pl => pl.siparis_id !== siparis_id), yeniPlan])
  }

  async function onDropToList(e: React.DragEvent) {
    e.preventDefault(); setOverZone(null)
    const payload = decodeDrag(e.dataTransfer.getData('text/plain'))
    if (!payload || payload.kind !== 'plan') return
    await supabase.from('sevkiyat_planlari').delete().eq('id', payload.plan_id)
    setPlanlar(prev => prev.filter(p => p.plan_id !== payload.plan_id))
  }

  async function planKaldir(plan: PlanliSiparis) {
    await supabase.from('sevkiyat_planlari').delete().eq('id', plan.plan_id)
    setPlanlar(prev => prev.filter(p => p.plan_id !== plan.plan_id))
  }

  async function aracEkle() {
    if (!yeniPlaka.trim() || !yeniAd.trim()) { setAracHata('Plaka ve ara\u00e7 ad\u0131 zorunludur.'); return }
    setAracKaydediyor(true); setAracHata('')
    const { data, error } = await supabase.from('araclar')
      .insert({ plaka: yeniPlaka.trim().toUpperCase(), ad: yeniAd.trim(), kapasite_m2: yeniKapasite ? parseFloat(yeniKapasite) : null })
      .select('id, plaka, ad, kapasite_m2, aktif').single()
    setAracKaydediyor(false)
    if (error) { setAracHata(error.message); return }
    setAraclar(prev => [...prev, data as Arac])
    setYeniPlaka(''); setYeniAd(''); setYeniKapasite('')
  }
  async function aracSil(id: string) {
    await supabase.from('araclar').update({ aktif: false }).eq('id', id)
    setAraclar(prev => prev.filter(a => a.id !== id))
  }

  const today = toDateStr(new Date())
  const monthGrid = buildMonthGrid(currentMonth)
  const weekEnd = addDays(weekStart, 6)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const modalCls = fullscreen
    ? 'fixed inset-0 z-50 bg-white flex flex-col'
    : 'fixed inset-2 z-50 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[98vh]'
  const aramaLower = aramaMetni.toLowerCase()
  const filtreliSiparisler = aramaMetni.trim()
    ? tumSevkiyatlar.filter(s =>
        s.siparis_no.toLowerCase().includes(aramaLower) ||
        s.musteri.toLowerCase().includes(aramaLower))
    : tumSevkiyatlar
  const bugunPlanMap = new Map(planlar.map(p => [p.siparis_id, p]))

  function SiparisKartiComp({ siparis, cardId, isDragging, onDragStartFn, onDragEndFn, onRemove, assignedPlan }: {
    siparis: HavuzSiparis | PlanliSiparis; cardId: string; isDragging: boolean
    onDragStartFn: (e: React.DragEvent) => void; onDragEndFn: () => void
    onRemove?: () => void; assignedPlan?: PlanliSiparis
  }) {
    const s = siparis as any
    const planNotlar: string | null = s.plan_notlar ?? null
    const gecerliGecisler = GECERLI_GECISLER[s.durum] ?? []
    const isExp = expandedCardId === cardId
    const assignedArac = assignedPlan ? araclar.find(a => a.id === assignedPlan.arac_id) : undefined
    return (
      <div className={`rounded-xl border transition-all select-none ${isDragging ? 'opacity-40 scale-95' : isExp ? 'bg-white border-blue-300 shadow-md' : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'}`}>
        <div draggable onDragStart={onDragStartFn} onDragEnd={onDragEndFn}
          onClick={() => setExpandedCardId(isExp ? null : cardId)}
          className="group flex items-start gap-2 px-3 py-2.5 cursor-grab active:cursor-grabbing">
          <GripVertical size={14} className="mt-1 text-gray-300 group-hover:text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-xs font-bold text-gray-800 truncate">{s.siparis_no}</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${DURUM_STIL[s.durum] ?? 'bg-gray-100 text-gray-500'}`}>{DURUM_ETIKET[s.durum] ?? s.durum}</span>
                <ChevronDown size={11} className={`text-gray-300 transition-transform ${isExp ? 'rotate-180' : ''}`} />
              </div>
            </div>
            <div className="text-xs font-medium text-gray-700 truncate">{s.musteri}</div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] text-gray-400">📅 <span className="font-medium text-gray-600">{formatDate(s.teslim_tarihi)}</span></span>
              {s.cam_adedi > 0 && <span className="text-[10px] text-blue-500 font-medium">🔲 {s.cam_adedi} cam</span>}
            </div>
            {s.notlar && <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 truncate border border-amber-100">📌 {s.notlar}</div>}
            {planNotlar && <div className="text-[10px] text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5 truncate border border-indigo-100">🚛 {planNotlar}</div>}
            {assignedArac && (
              <div className="text-[10px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 border border-emerald-100 flex items-center gap-1">
                <Truck size={9} className="shrink-0" />{assignedArac.ad} · {assignedArac.plaka}
              </div>
            )}
          </div>
          {onRemove && (
            <button onClick={e => { e.stopPropagation(); onRemove() }}
              className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-gray-300 hover:text-red-500 transition-all mt-0.5">
              <X size={12} />
            </button>
          )}
        </div>
        {isExp && (
          <div className="px-3 pb-3 border-t border-gray-100 pt-2">
            <p className="text-[10px] text-gray-400 mb-2 font-medium uppercase tracking-wide">Durumu Değiştir</p>
            {gecerliGecisler.length === 0
              ? <p className="text-[10px] text-gray-400 italic">Bu durumdan geçiş yapılamaz.</p>
              : <div className="flex flex-wrap gap-1.5">
                  {gecerliGecisler.map(durum => (
                    <button key={durum} disabled={durumDegistiriyorId === (s.id ?? s.siparis_id)}
                      onClick={e => { e.stopPropagation(); durumDegistir(s.id ?? s.siparis_id, durum) }}
                      className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-all disabled:opacity-50 ${DURUM_BTN[durum] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {durumDegistiriyorId === (s.id ?? s.siparis_id) ? '...' : `\u2192 ${DURUM_ETIKET[durum] ?? durum}`}
                    </button>
                  ))}
                </div>
            }
          </div>
        )}
      </div>
    )
  }

  function DropZoneComp({ isOver, onDragOverFn, onDragLeaveFn, onDropFn, children, className }: {
    isOver: boolean; onDragOverFn: (e: React.DragEvent) => void
    onDragLeaveFn: (e: React.DragEvent) => void; onDropFn: (e: React.DragEvent) => void
    children: React.ReactNode; className?: string
  }) {
    return (
      <div onDragOver={onDragOverFn} onDragLeave={onDragLeaveFn} onDrop={onDropFn}
        className={`transition-all ${isOver ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/50 rounded-xl' : ''} ${className ?? ''}`}>
        {children}
      </div>
    )
  }

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
            <p className="text-[10px] text-gray-400">Sürükle-bırak ile araç ataması yapın</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAracYonetimiAcik(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${aracYonetimiAcik ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}>
            <Settings size={13} /> Araçlar
          </button>
          <button onClick={() => setFullscreen(v => !v)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"><X size={16} /></button>
        </div>
      </div>

      {/* Arac Yonetimi panel */}
      {aracYonetimiAcik && (
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/80 shrink-0">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex flex-wrap gap-2">
              {araclar.map(a => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs shadow-sm">
                  <span className="font-mono font-bold text-gray-700">{a.plaka}</span>
                  <span className="text-gray-500">{a.ad}</span>
                  {a.kapasite_m2 && <span className="text-gray-400">{a.kapasite_m2}m²</span>}
                  <button onClick={() => aracSil(a.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 flex-wrap">
              <input value={yeniPlaka} onChange={e => setYeniPlaka(e.target.value)} placeholder="Plaka" className="w-28 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={yeniAd} onChange={e => setYeniAd(e.target.value)} placeholder="Araç Adı" className="w-32 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={yeniKapasite} onChange={e => setYeniKapasite(e.target.value)} placeholder="Kapasite (m²)" type="number" min="0" className="w-28 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <button onClick={aracEkle} disabled={aracKaydediyor}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                <Plus size={13} /> Ekle
              </button>
              {aracHata && <div className="flex items-center gap-1 text-xs text-red-600"><AlertCircle size={12} /> {aracHata}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* COL 1: Takvim */}
        <div className="w-[288px] shrink-0 border-r border-gray-100 flex flex-col bg-gradient-to-b from-slate-50 to-white overflow-hidden">
          <div className="px-4 pt-4 pb-4 shrink-0">

            {/* View toggle */}
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

            {/* Month/Week nav */}
            {takvimGorunum === 'aylik' ? (
              <div className="flex items-center justify-between mb-3 px-1">
                <button onClick={() => { const d = new Date(currentMonth); d.setMonth(d.getMonth() - 1); setCurrentMonth(d) }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-200">
                  <ChevronLeft size={14} />
                </button>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-800 leading-tight">{toTurkishMonthName(currentMonth.getMonth())}</p>
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
                  {weekStart.getDate()} {toTurkishMonthName(weekStart.getMonth())} – {weekEnd.getDate()} {toTurkishMonthName(weekEnd.getMonth())}
                </p>
                <button onClick={() => setWeekStart(addDays(weekStart, 7))}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-200">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Monthly grid */}
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
                        className={`flex flex-col items-center justify-center h-9 rounded-xl transition-all group
                          ${isSelected
                            ? 'bg-blue-500 shadow-md shadow-blue-200/60'
                            : isToday
                            ? 'bg-white ring-2 ring-blue-400 shadow-sm'
                            : hasPlan
                            ? 'bg-white hover:bg-blue-50 shadow-sm border border-gray-100'
                            : 'hover:bg-white/70'}`}>
                        <span className={`text-xs font-bold leading-none ${isSelected ? 'text-white' : isToday ? 'text-blue-600' : hasPlan ? 'text-gray-800' : 'text-gray-400 group-hover:text-gray-600'}`}>
                          {day.getDate()}
                        </span>
                        {hasPlan && (
                          <div className="flex gap-px mt-0.5">
                            {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                              <div key={i} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-blue-200' : isToday ? 'bg-blue-500' : 'bg-blue-400'}`} />
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

            {/* Weekly grid */}
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

          {/* Selected date info card */}
          <div className="mx-4 mb-4 shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mb-1">Seçili Tarih</p>
              <p className="text-sm font-bold text-gray-800">{formatDate(selectedDate)}</p>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {planlar.length} atama
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  {tumSevkiyatlar.length} toplam
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1" />
        </div>

        {/* COL 2: Sevkiyat Listesi */}
        <div className="w-[300px] shrink-0 border-r border-gray-100 flex flex-col bg-white overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold text-gray-800">Sevkiyat Listesi</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {listYukleniyor ? 'Y\u00fckleniyor\u2026' : `${filtreliSiparisler.length} sipari\u015f`}
                </p>
              </div>
              <span className="text-[9px] text-gray-400 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg font-medium text-center leading-tight whitespace-nowrap">
                Karta tıkla<br />durum değiştir
              </span>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
              <input
                value={aramaMetni}
                onChange={e => setAramaMetni(e.target.value)}
                placeholder="Sipariş no veya müşteri ara…"
                className="w-full text-xs border border-gray-200 rounded-xl pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-gray-50 focus:bg-white transition-all placeholder:text-gray-300"
              />
            </div>
          </div>

          <DropZoneComp
            isOver={overZone === 'list'}
            onDragOverFn={e => onDragOver(e, 'list')}
            onDragLeaveFn={onDragLeave}
            onDropFn={onDropToList}
            className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2 min-h-0"
          >
            {listYukleniyor ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-300">
                <div className="w-7 h-7 rounded-full border-2 border-gray-200 border-t-blue-400 animate-spin mb-2" />
                <p className="text-[10px]">Yükleniyor…</p>
              </div>
            ) : filtreliSiparisler.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-300">
                <Check size={28} className="mb-2 opacity-40" />
                <p className="text-[10px] text-center font-medium">
                  {aramaMetni ? 'Sonu\u00e7 bulunamad\u0131' : 'Sevkiyat sipari\u015fi yok'}
                </p>
                <p className="text-[9px] text-center mt-0.5 opacity-60">
                  {aramaMetni ? 'Farkl\u0131 bir arama deneyin' : 'S\u0131rapi\u015f\'te sevkiyat se\u00e7iniz'}
                </p>
              </div>
            ) : (
              filtreliSiparisler.map(s => (
                <SiparisKartiComp
                  key={s.id}
                  siparis={s}
                  cardId={s.id}
                  isDragging={draggingId === s.id}
                  onDragStartFn={e => onSiparisDragStart(e, { kind: 'havuz', siparis_id: s.id }, s.id)}
                  onDragEndFn={onDragEnd}
                  assignedPlan={bugunPlanMap.get(s.id)}
                />
              ))
            )}
          </DropZoneComp>
        </div>

        {/* COL 3: Arac kolonlari */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-gray-50/20">
          {yukleniyor ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">Yükleniyor…</div>
          ) : araclar.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <Truck size={40} className="opacity-20" />
              <p className="text-sm font-medium">Henüz araç tanımlanmamış</p>
              <button onClick={() => setAracYonetimiAcik(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm shadow-blue-200">
                <Plus size={15} /> Araç Ekle
              </button>
            </div>
          ) : (
            <div className="flex h-full gap-3 p-4">
              {araclar.map(arac => {
                const aracPlanlar = planlar.filter(p => p.arac_id === arac.id)
                const isOver = overZone === arac.id
                const toplamCam = aracPlanlar.reduce((s, p) => s + p.cam_adedi, 0)
                return (
                  <div key={arac.id} className="flex flex-col w-52 shrink-0 h-full">
                    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl border-x border-t transition-colors ${isOver ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isOver ? 'bg-blue-100' : 'bg-gray-50 border border-gray-200'}`}>
                        <Truck size={13} className={isOver ? 'text-blue-600' : 'text-gray-400'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-800 truncate">{arac.ad}</div>
                        <div className="text-[10px] text-gray-400 font-mono truncate">{arac.plaka}</div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ${aracPlanlar.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>{aracPlanlar.length}</span>
                        {toplamCam > 0 && <span className="text-[9px] text-gray-400 mt-0.5">{toplamCam} cam</span>}
                      </div>
                    </div>
                    <DropZoneComp
                      isOver={isOver}
                      onDragOverFn={e => onDragOver(e, arac.id)}
                      onDragLeaveFn={onDragLeave}
                      onDropFn={e => onDropToArac(e, arac.id)}
                      className={`flex-1 overflow-y-auto p-2 space-y-2 rounded-b-xl border-x border-b ${isOver ? 'border-blue-300' : 'border-gray-200'}`}
                    >
                      {aracPlanlar.length === 0 && !isOver && (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-300">
                          <Truck size={22} className="mb-1 opacity-30" />
                          <p className="text-[10px] text-center">Sipariş bırakın</p>
                        </div>
                      )}
                      {aracPlanlar.map(plan => (
                        <SiparisKartiComp
                          key={plan.plan_id}
                          siparis={plan}
                          cardId={plan.plan_id}
                          isDragging={draggingId === plan.plan_id}
                          onDragStartFn={e => onSiparisDragStart(e, { kind: 'plan', plan_id: plan.plan_id, siparis_id: plan.siparis_id, from_arac_id: plan.arac_id }, plan.plan_id)}
                          onDragEndFn={onDragEnd}
                          onRemove={() => planKaldir(plan)}
                        />
                      ))}
                    </DropZoneComp>
                  </div>
                )
              })}
              <div className="w-40 shrink-0 h-full flex items-start pt-2">
                <button onClick={() => setAracYonetimiAcik(true)}
                  className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-gray-200 text-gray-300 hover:border-blue-300 hover:text-blue-400 transition-all w-full">
                  <Plus size={18} />
                  <span className="text-xs font-medium">Araç Ekle</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="px-5 py-2 border-t border-gray-100 shrink-0 flex items-center gap-3 text-xs text-gray-400">
        <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
        <span className="font-medium text-gray-600">{formatDate(selectedDate)}</span>
        <span>·</span>
        <span>{planlar.length} araç ataması</span>
        <span>·</span>
        <span>{tumSevkiyatlar.length} toplam sevkiyat</span>
        <span className="ml-auto flex items-center gap-1.5 text-emerald-500 font-medium">
          <Save size={11} /> Otomatik kaydediliyor
        </span>
      </div>
    </div>
  )
}
