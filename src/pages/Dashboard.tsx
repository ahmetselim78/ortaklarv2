import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardList, Factory, Package, Users, TrendingUp, Clock,
  ChevronLeft, ChevronRight, Droplets, X, Save, StickyNote,
  CalendarDays, CalendarRange, Truck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import SevkiyatPlanlama from '@/components/sevkiyat/SevkiyatPlanlama'

/* ===================================================================
   Types
=================================================================== */

interface Istatistikler {
  toplamSiparis: number
  beklemedeSiparis: number
  aktifBatch: number
  tamamlananBatch: number
  toplamCari: number
  toplamStok: number
}

interface SonSiparis {
  id: string
  siparis_no: string
  musteri: string
  tarih: string
  durum: string
}

interface TakvimSiparis {
  id: string
  siparis_no: string
  musteri: string
  teslim_tarihi: string
  durum: string
}

interface TakvimNotu {
  id: string
  tarih: string
  not_metni: string
}

interface YikamaSiparis {
  siparis_id: string
  siparis_no: string
  musteri: string
  cam_adet: number
}

interface YikamaBatch {
  id: string
  batch_no: string
  siparisler: YikamaSiparis[]
}

/* ===================================================================
   Pure helpers
=================================================================== */

function getMonday(d: Date): Date {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  return date
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

/** Local-time date → YYYY-MM-DD (DST safe) */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toTurkishMonthName(month: number): string {
  return ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][month]
}

function hesaplaRange(
  gorunum: 'aylik' | 'haftalik',
  currentMonth: Date,
  weekStart: Date,
): [string, string] {
  if (gorunum === 'aylik') {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const last = new Date(y, m + 1, 0).getDate()
    return [
      `${y}-${String(m + 1).padStart(2, '0')}-01`,
      `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    ]
  }
  return [toDateStr(weekStart), toDateStr(addDays(weekStart, 6))]
}

/* ===================================================================
   Constants
=================================================================== */

const DURUM_ETIKET: Record<string, string> = {
  beklemede: 'Beklemede', batchte: "Batch'te", yikamada: 'Yıkamada',
  tamamlandi: 'Tamamlandı', eksik_var: 'Eksik Var', iptal: 'İptal',
}

const DURUM_STIL: Record<string, string> = {
  beklemede: 'bg-gray-100 text-gray-600',
  batchte: 'bg-blue-50 text-blue-700',
  yikamada: 'bg-cyan-50 text-cyan-700',
  tamamlandi: 'bg-green-50 text-green-700',
  eksik_var: 'bg-red-50 text-red-600',
  iptal: 'bg-red-50 text-red-600',
}

const DURUM_DOT: Record<string, string> = {
  beklemede: 'bg-gray-400',
  batchte: 'bg-blue-500',
  yikamada: 'bg-cyan-500',
  tamamlandi: 'bg-green-500',
  eksik_var: 'bg-red-500',
  iptal: 'bg-red-400',
}

const HAFTA_GUNLERI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

/* ===================================================================
   Component
=================================================================== */

export default function Dashboard() {

  /* ---------- stats ---------- */
  const [istatistikler, setIstatistikler] = useState<Istatistikler | null>(null)
  const [sonSiparisler, setSonSiparisler] = useState<SonSiparis[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)

  /* ---------- sevkiyat planlama modal ---------- */
  const [sevkiyatAcik, setSevkiyatAcik] = useState(false)

  /* ---------- calendar ---------- */
  const [takvimGorunum, setTakvimGorunum] = useState<'aylik' | 'haftalik'>('aylik')
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [takvimSiparisler, setTakvimSiparisler] = useState<TakvimSiparis[]>([])
  const [takvimNotlari, setTakvimNotlari] = useState<TakvimNotu[]>([])
  const [notDuzenle, setNotDuzenle] = useState('')
  const [notKaydiyor, setNotKaydiyor] = useState(false)

  /* ---------- yıkamada ---------- */
  const [yikamaBatchler, setYikamaBatchler] = useState<YikamaBatch[]>([])
  const [yikamaYukleniyor, setYikamaYukleniyor] = useState(true)
  const [sonGuncelleme, setSonGuncelleme] = useState<Date>(new Date())
  const yikamaIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ===================================================================
     Data: initial stats
  =================================================================== */
  useEffect(() => {
    async function yukle() {
      const [
        { count: toplamSiparis },
        { count: beklemedeSiparis },
        { count: aktifBatch },
        { count: tamamlananBatch },
        { count: toplamCari },
        { count: toplamStok },
        { data: sonSip },
      ] = await Promise.all([
        supabase.from('siparisler').select('*', { count: 'exact', head: true }),
        supabase.from('siparisler').select('*', { count: 'exact', head: true }).in('durum', ['beklemede', 'batchte', 'yikamada']),
        supabase.from('uretim_emirleri').select('*', { count: 'exact', head: true }).in('durum', ['hazirlaniyor', 'onaylandi', 'export_edildi', 'yikamada']),
        supabase.from('uretim_emirleri').select('*', { count: 'exact', head: true }).eq('durum', 'tamamlandi'),
        supabase.from('cari').select('*', { count: 'exact', head: true }),
        supabase.from('stok').select('*', { count: 'exact', head: true }),
        supabase.from('siparisler').select('id, siparis_no, tarih, durum, cari(ad)').order('created_at', { ascending: false }).limit(5),
      ])

      setIstatistikler({
        toplamSiparis: toplamSiparis ?? 0,
        beklemedeSiparis: beklemedeSiparis ?? 0,
        aktifBatch: aktifBatch ?? 0,
        tamamlananBatch: tamamlananBatch ?? 0,
        toplamCari: toplamCari ?? 0,
        toplamStok: toplamStok ?? 0,
      })
      setSonSiparisler(
        (sonSip ?? []).map((s: any) => ({
          id: s.id,
          siparis_no: s.siparis_no,
          musteri: s.cari?.ad ?? '—',
          tarih: s.tarih,
          durum: s.durum,
        }))
      )
      setYukleniyor(false)
    }
    yukle()
  }, [])

  /* ===================================================================
     Data: calendar (reloads when month / week / view type changes)
  =================================================================== */
  useEffect(() => {
    const [baslangic, bitis] = hesaplaRange(takvimGorunum, currentMonth, currentWeekStart)
    let cancelled = false

    async function yukle() {
      const [{ data: sipVerisi }, { data: notVerisi }] = await Promise.all([
        supabase
          .from('siparisler')
          .select('id, siparis_no, teslim_tarihi, durum, cari(ad)')
          .gte('teslim_tarihi', baslangic)
          .lte('teslim_tarihi', bitis)
          .neq('durum', 'iptal')
          .not('teslim_tarihi', 'is', null),
        supabase
          .from('takvim_notlari')
          .select('id, tarih, not_metni')
          .gte('tarih', baslangic)
          .lte('tarih', bitis),
      ])
      if (cancelled) return
      setTakvimSiparisler(
        (sipVerisi ?? []).map((s: any) => ({
          id: s.id,
          siparis_no: s.siparis_no,
          musteri: s.cari?.ad ?? '—',
          teslim_tarihi: s.teslim_tarihi,
          durum: s.durum,
        }))
      )
      setTakvimNotlari(notVerisi ?? [])
    }

    yukle()
    return () => { cancelled = true }
  }, [takvimGorunum, currentMonth, currentWeekStart])

  /* Sync note editor when selected date changes */
  useEffect(() => {
    if (!selectedDate) { setNotDuzenle(''); return }
    setNotDuzenle(takvimNotlari.find(n => n.tarih === selectedDate)?.not_metni ?? '')
  }, [selectedDate, takvimNotlari])

  /* ===================================================================
     Data: yıkamada (30s polling)
  =================================================================== */
  useEffect(() => {
    async function yukleYikama() {
      const { data } = await supabase
        .from('uretim_emirleri')
        .select(`
          id, batch_no,
          uretim_emri_detaylari(
            siparis_detaylari(
              id, adet,
              siparisler(id, siparis_no, cari(ad))
            )
          )
        `)
        .eq('durum', 'yikamada')
        .order('olusturulma_tarihi', { ascending: false })

      if (!data) { setYikamaYukleniyor(false); return }

      const batchler: YikamaBatch[] = data.map((batch: any) => {
        const sipMap = new Map<string, YikamaSiparis>()
        ;(batch.uretim_emri_detaylari ?? []).forEach((d: any) => {
          const det = d.siparis_detaylari
          if (!det) return
          const sip = det.siparisler
          if (!sip) return
          if (!sipMap.has(sip.id)) {
            sipMap.set(sip.id, {
              siparis_id: sip.id,
              siparis_no: sip.siparis_no,
              musteri: sip.cari?.ad ?? '—',
              cam_adet: 0,
            })
          }
          sipMap.get(sip.id)!.cam_adet += det.adet ?? 1
        })
        return { id: batch.id, batch_no: batch.batch_no, siparisler: Array.from(sipMap.values()) }
      })

      setYikamaBatchler(batchler)
      setYikamaYukleniyor(false)
      setSonGuncelleme(new Date())
    }

    yukleYikama()
    yikamaIntervalRef.current = setInterval(yukleYikama, 30_000)
    return () => {
      if (yikamaIntervalRef.current) clearInterval(yikamaIntervalRef.current)
    }
  }, [])

  /* ===================================================================
     Note save / delete
  =================================================================== */
  async function notiKaydet() {
    if (!selectedDate) return
    setNotKaydiyor(true)
    try {
      const mevcut = takvimNotlari.find(n => n.tarih === selectedDate)
      if (notDuzenle.trim() === '') {
        if (mevcut) {
          await supabase.from('takvim_notlari').delete().eq('id', mevcut.id)
          setTakvimNotlari(prev => prev.filter(n => n.id !== mevcut.id))
        }
      } else if (mevcut) {
        await supabase.from('takvim_notlari')
          .update({ not_metni: notDuzenle, guncelleme: new Date().toISOString() })
          .eq('id', mevcut.id)
        setTakvimNotlari(prev => prev.map(n => n.id === mevcut.id ? { ...n, not_metni: notDuzenle } : n))
      } else {
        const { data } = await supabase.from('takvim_notlari')
          .insert({ tarih: selectedDate, not_metni: notDuzenle })
          .select('id, tarih, not_metni')
          .single()
        if (data) setTakvimNotlari(prev => [...prev, data as TakvimNotu])
      }
    } finally {
      setNotKaydiyor(false)
    }
  }

  /* ===================================================================
     Calendar grid builders
  =================================================================== */
  function buildMonthGrid(): (Date | null)[] {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDow = new Date(year, month, 1).getDay()
    const startPad = firstDow === 0 ? 6 : firstDow - 1   // Monday = 0 offset
    const lastDay = new Date(year, month + 1, 0).getDate()
    const days: (Date | null)[] = []
    for (let i = 0; i < startPad; i++) days.push(null)
    for (let d = 1; d <= lastDay; d++) days.push(new Date(year, month, d))
    while (days.length % 7 !== 0) days.push(null)
    return days
  }

  function buildWeekDays(): Date[] {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i))
  }

  /* ===================================================================
     Render
  =================================================================== */
  if (yukleniyor) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Yükleniyor...</div>
  }

  const kartlar = [
    { baslik: 'Toplam Sipariş', deger: istatistikler?.toplamSiparis ?? 0, icon: ClipboardList, renk: 'text-blue-600 bg-blue-50', link: '/siparisler' },
    { baslik: 'Aktif Sipariş', deger: istatistikler?.beklemedeSiparis ?? 0, icon: Clock, renk: 'text-amber-600 bg-amber-50', link: '/siparisler' },
    { baslik: 'Aktif Batch', deger: istatistikler?.aktifBatch ?? 0, icon: Factory, renk: 'text-purple-600 bg-purple-50', link: '/uretim' },
    { baslik: 'Tamamlanan Batch', deger: istatistikler?.tamamlananBatch ?? 0, icon: TrendingUp, renk: 'text-green-600 bg-green-50', link: '/uretim' },
    { baslik: 'Cari Kayıtları', deger: istatistikler?.toplamCari ?? 0, icon: Users, renk: 'text-cyan-600 bg-cyan-50', link: '/cari' },
    { baslik: 'Stok Kayıtları', deger: istatistikler?.toplamStok ?? 0, icon: Package, renk: 'text-orange-600 bg-orange-50', link: '/stok' },
  ]

  const today = toDateStr(new Date())

  const siparisMap = new Map<string, TakvimSiparis[]>()
  takvimSiparisler.forEach(s => {
    if (!siparisMap.has(s.teslim_tarihi)) siparisMap.set(s.teslim_tarihi, [])
    siparisMap.get(s.teslim_tarihi)!.push(s)
  })
  const notMap = new Map<string, TakvimNotu>()
  takvimNotlari.forEach(n => notMap.set(n.tarih, n))

  const selectedSiparisler = selectedDate ? (siparisMap.get(selectedDate) ?? []) : []
  const monthGrid = buildMonthGrid()
  const weekDays = buildWeekDays()
  const weekEnd = addDays(currentWeekStart, 6)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Genel üretim özeti</p>
        </div>
        <button
          onClick={() => setSevkiyatAcik(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Truck size={16} />
          Sevkiyat Planlaması
        </button>
      </div>

      {/* Sevkiyat Planlama Modal */}
      {sevkiyatAcik && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setSevkiyatAcik(false)} />
          <SevkiyatPlanlama onKapat={() => setSevkiyatAcik(false)} />
        </>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {kartlar.map((k) => {
          const Icon = k.icon
          return (
            <Link
              key={k.baslik}
              to={k.link}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${k.renk}`}>
                <Icon size={20} />
              </div>
              <p className="text-2xl font-bold text-gray-800">{k.deger}</p>
              <p className="text-xs text-gray-500 mt-0.5">{k.baslik}</p>
            </Link>
          )
        })}
      </div>

      {/* ── Takvim + Yıkamada ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* === Takvim (2/3 width) === */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-700">Teslim Takvimi</h2>
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setTakvimGorunum('aylik')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    takvimGorunum === 'aylik' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <CalendarDays size={13} /> Aylık
                </button>
                <button
                  onClick={() => setTakvimGorunum('haftalik')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    takvimGorunum === 'haftalik' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <CalendarRange size={13} /> Haftalık
                </button>
              </div>
            </div>

            {/* Navigation */}
            {takvimGorunum === 'aylik' ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { const d = new Date(currentMonth); d.setMonth(d.getMonth() - 1); setCurrentMonth(d) }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-sm font-medium text-gray-700 min-w-[130px] text-center">
                  {toTurkishMonthName(currentMonth.getMonth())} {currentMonth.getFullYear()}
                </span>
                <button
                  onClick={() => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + 1); setCurrentMonth(d) }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <ChevronRight size={15} />
                </button>
                <button
                  onClick={() => {
                    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
                    setCurrentMonth(d); setSelectedDate(today)
                  }}
                  className="px-2.5 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium transition-colors"
                >
                  Bugün
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-sm font-medium text-gray-700 min-w-[170px] text-center whitespace-nowrap">
                  {currentWeekStart.getDate()} {toTurkishMonthName(currentWeekStart.getMonth())} –{' '}
                  {weekEnd.getDate()} {toTurkishMonthName(weekEnd.getMonth())} {weekEnd.getFullYear()}
                </span>
                <button
                  onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <ChevronRight size={15} />
                </button>
                <button
                  onClick={() => { setCurrentWeekStart(getMonday(new Date())); setSelectedDate(today) }}
                  className="px-2.5 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium transition-colors"
                >
                  Bu Hafta
                </button>
              </div>
            )}
          </div>

          {/* ── Monthly grid ── */}
          {takvimGorunum === 'aylik' && (
            <div className="p-3">
              <div className="grid grid-cols-7 mb-1">
                {HAFTA_GUNLERI.map(g => (
                  <div key={g} className="text-center text-xs font-medium text-gray-400 py-1">{g}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {monthGrid.map((day, idx) => {
                  if (!day) return <div key={`pad-${idx}`} className="min-h-[56px]" />
                  const dateStr = toDateStr(day)
                  const sipList = siparisMap.get(dateStr) ?? []
                  const hasNote = notMap.has(dateStr)
                  const isToday = dateStr === today
                  const isSelected = dateStr === selectedDate

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`relative p-1.5 rounded-xl text-left transition-all min-h-[56px] ${
                        isSelected
                          ? 'bg-blue-500 shadow-md'
                          : isToday
                          ? 'bg-blue-50 ring-1 ring-blue-200'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className={`text-xs font-semibold ${
                        isSelected ? 'text-white' : isToday ? 'text-blue-600' : 'text-gray-700'
                      }`}>
                        {day.getDate()}
                      </span>

                      {sipList.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-0.5 items-center">
                          {sipList.slice(0, 4).map(s => (
                            <span
                              key={s.id}
                              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                isSelected ? 'bg-blue-200' : (DURUM_DOT[s.durum] ?? 'bg-gray-400')
                              }`}
                            />
                          ))}
                          {sipList.length > 4 && (
                            <span className={`text-[9px] font-bold leading-none ${
                              isSelected ? 'text-blue-200' : 'text-gray-400'
                            }`}>
                              +{sipList.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      {sipList.length > 0 && (
                        <div className={`text-[10px] font-medium leading-tight mt-0.5 ${
                          isSelected ? 'text-blue-100' : 'text-gray-400'
                        }`}>
                          {sipList.length} sip.
                        </div>
                      )}

                      {hasNote && (
                        <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-yellow-300' : 'bg-yellow-400'
                        }`} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Weekly view ── */}
          {takvimGorunum === 'haftalik' && (
            <div className="p-4">
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day, i) => {
                  const dateStr = toDateStr(day)
                  const sipList = siparisMap.get(dateStr) ?? []
                  const hasNote = notMap.has(dateStr)
                  const isToday = dateStr === today
                  const isSelected = dateStr === selectedDate

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`flex flex-col items-center py-3 px-1 rounded-xl transition-all border ${
                        isSelected
                          ? 'bg-blue-500 border-blue-400 shadow-md'
                          : isToday
                          ? 'bg-blue-50 border-blue-200'
                          : 'border-gray-100 hover:bg-gray-50 hover:border-gray-200'
                      }`}
                    >
                      <span className={`text-xs font-medium mb-1 ${
                        isSelected ? 'text-blue-100' : 'text-gray-400'
                      }`}>
                        {HAFTA_GUNLERI[i]}
                      </span>
                      <span className={`text-xl font-bold mb-1.5 ${
                        isSelected ? 'text-white' : isToday ? 'text-blue-600' : 'text-gray-800'
                      }`}>
                        {day.getDate()}
                      </span>
                      {sipList.length > 0 ? (
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                          isSelected ? 'bg-blue-400 text-white' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {sipList.length} sip.
                        </span>
                      ) : (
                        <span className="h-5" />
                      )}
                      {hasNote && (
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-yellow-300' : 'bg-yellow-400'
                        }`} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Selected date detail panel ── */}
          {selectedDate && (
            <div className="border-t border-gray-100 bg-gray-50/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  {formatDate(selectedDate)}
                  {selectedSiparisler.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      — {selectedSiparisler.length} sipariş teslim edilecek
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="p-0.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {selectedSiparisler.length > 0 ? (
                <div className="space-y-1.5 mb-4">
                  {selectedSiparisler.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-gray-100"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-semibold text-gray-700 shrink-0">{s.siparis_no}</span>
                        <span className="text-xs text-gray-500 truncate">{s.musteri}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 ${
                        DURUM_STIL[s.durum] ?? 'bg-gray-100 text-gray-600'
                      }`}>
                        {DURUM_ETIKET[s.durum] ?? s.durum}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-4 italic">Bu gün için teslim siparişi yok.</p>
              )}

              {/* Note editor */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <StickyNote size={13} className="text-yellow-500" />
                  <span className="text-xs font-medium text-gray-600">Günlük Not</span>
                </div>
                <textarea
                  value={notDuzenle}
                  onChange={e => setNotDuzenle(e.target.value)}
                  placeholder="Bu gün için not ekle..."
                  rows={2}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 bg-white"
                />
                <div className="flex justify-end mt-1.5">
                  <button
                    onClick={notiKaydet}
                    disabled={notKaydiyor}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Save size={12} />
                    {notKaydiyor ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* === Yıkamada panel (1/3 width) === */}
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets size={15} className="text-cyan-500" />
              <h2 className="text-sm font-semibold text-gray-700">Yıkamada</h2>
              {yikamaBatchler.length > 0 && (
                <span className="bg-cyan-100 text-cyan-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {yikamaBatchler.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5" title="30 saniyede bir güncellenir">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-gray-400">
                {sonGuncelleme.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
            {yikamaYukleniyor ? (
              <div className="flex items-center justify-center py-10 text-gray-400 text-xs">
                Yükleniyor…
              </div>
            ) : yikamaBatchler.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-300">
                <Droplets size={36} className="mb-2 opacity-40" />
                <p className="text-xs">Yıkamada batch yok</p>
              </div>
            ) : (
              yikamaBatchler.map(batch => {
                const toplamCam = batch.siparisler.reduce((a, s) => a + s.cam_adet, 0)
                return (
                  <div key={batch.id} className="bg-cyan-50 rounded-xl border border-cyan-100 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-cyan-800">{batch.batch_no}</span>
                      <span className="text-xs text-cyan-600 bg-cyan-100 px-2 py-0.5 rounded-full font-medium">
                        {toplamCam} cam
                      </span>
                    </div>
                    <div className="space-y-1">
                      {batch.siparisler.map(s => (
                        <div key={s.siparis_id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-gray-500 shrink-0">{s.siparis_no}</span>
                            <span className="text-gray-500 truncate">{s.musteri}</span>
                          </div>
                          <span className="text-cyan-700 font-semibold shrink-0 ml-2">{s.cam_adet}</span>
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

      {/* ── Son Siparişler ── */}
      {sonSiparisler.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Son Siparişler</h2>
            <Link to="/siparisler" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Tümünü Gör →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500 font-medium text-xs">
                <th className="px-4 py-2">Sipariş No</th>
                <th className="px-4 py-2">Müşteri</th>
                <th className="px-4 py-2">Tarih</th>
                <th className="px-4 py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {sonSiparisler.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-mono font-medium text-gray-800">{s.siparis_no}</td>
                  <td className="px-4 py-2.5 text-gray-700">{s.musteri}</td>
                  <td className="px-4 py-2.5 text-gray-600">{formatDate(s.tarih)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      DURUM_STIL[s.durum] ?? 'bg-gray-100 text-gray-600'
                    }`}>
                      {DURUM_ETIKET[s.durum] ?? s.durum}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
