import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardList, Factory, Package, Users, TrendingUp, Clock,
  ChevronLeft, ChevronRight, Droplets, X, Save, StickyNote,
  CalendarDays, CalendarRange, Truck, ChevronDown,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import SevkiyatPlanlama from '@/components/sevkiyat/SevkiyatPlanlama'
import SiparisDetayModal from '@/components/siparis/SiparisDetayModal'
import { useStok } from '@/hooks/useStok'
import { useCari } from '@/hooks/useCari'
import type { Siparis } from '@/types/siparis'

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
  alt_musteri: string | null
  toplam_adet: number
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

// Google Calendar tarzı event pill renkleri
const DURUM_EVENT: Record<string, string> = {
  beklemede:  'bg-gray-100 text-gray-800 border-gray-300',
  batchte:    'bg-blue-100 text-blue-900 border-blue-400',
  yikamada:   'bg-cyan-100 text-cyan-900 border-cyan-400',
  tamamlandi: 'bg-green-100 text-green-900 border-green-400',
  eksik_var:  'bg-red-100 text-red-900 border-red-400',
  iptal:      'bg-red-50 text-red-500 border-red-300',
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

  /* ---------- takvim sipariş detay modal ---------- */
  const [takvimDetaySiparis, setTakvimDetaySiparis] = useState<Siparis | null>(null)
  const [takvimDetayYukleniyor, setTakvimDetayYukleniyor] = useState(false)
  const { stoklar } = useStok()
  const { cariler } = useCari()

  const takvimSiparisAc = useCallback(async (id: string) => {
    setTakvimDetayYukleniyor(true)
    const { data } = await supabase
      .from('siparisler')
      .select('*, cari(ad, kod), siparis_detaylari(count), sevkiyat_planlari(id, tarih)')
      .eq('id', id)
      .single()
    setTakvimDetayYukleniyor(false)
    if (data) setTakvimDetaySiparis(data as unknown as Siparis)
  }, [])

  /* ---------- kpi kartları görünürlük ---------- */
  const [kartlarAcik, setKartlarAcik] = useState(false)

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

  /* ---------- bugünün notu (sağ panel) ---------- */
  const [bugunNot, setBugunNot] = useState('')
  const [bugunNotKaydiyor, setBugunNotKaydiyor] = useState(false)

  /* ---------- drag & drop (takvim) ---------- */
  const [dragSiparis, setDragSiparis] = useState<TakvimSiparis | null>(null)
  const [overDate, setOverDate] = useState<string | null>(null)

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
          .select('id, siparis_no, teslim_tarihi, durum, alt_musteri, cari(ad), siparis_detaylari(adet)')
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
          alt_musteri: s.alt_musteri ?? null,
          toplam_adet: (s.siparis_detaylari ?? []).reduce((acc: number, d: any) => acc + (d.adet ?? 0), 0),
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

  /* Sync bugünün notu */
  useEffect(() => {
    setBugunNot(takvimNotlari.find(n => n.tarih === today)?.not_metni ?? '')
  }, [takvimNotlari])

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
     Bugünün notu kaydet
  =================================================================== */
  async function bugunNotiKaydet() {
    setBugunNotKaydiyor(true)
    try {
      const mevcut = takvimNotlari.find(n => n.tarih === today)
      if (bugunNot.trim() === '') {
        if (mevcut) {
          await supabase.from('takvim_notlari').delete().eq('id', mevcut.id)
          setTakvimNotlari(prev => prev.filter(n => n.id !== mevcut.id))
        }
      } else if (mevcut) {
        await supabase.from('takvim_notlari')
          .update({ not_metni: bugunNot, guncelleme: new Date().toISOString() })
          .eq('id', mevcut.id)
        setTakvimNotlari(prev => prev.map(n => n.id === mevcut.id ? { ...n, not_metni: bugunNot } : n))
      } else {
        const { data } = await supabase.from('takvim_notlari')
          .insert({ tarih: today, not_metni: bugunNot })
          .select('id, tarih, not_metni')
          .single()
        if (data) setTakvimNotlari(prev => [...prev, data as TakvimNotu])
      }
    } finally {
      setBugunNotKaydiyor(false)
    }
  }

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
     Drag & Drop: teslim tarihi güncelleme
  =================================================================== */
  async function teslimTarihiGuncelle(siparis: TakvimSiparis, yeniTarih: string) {
    if (siparis.teslim_tarihi === yeniTarih) return
    // Optimistik güncelleme
    setTakvimSiparisler(prev =>
      prev.map(s => s.id === siparis.id ? { ...s, teslim_tarihi: yeniTarih } : s)
    )
    await supabase.from('siparisler').update({ teslim_tarihi: yeniTarih }).eq('id', siparis.id)
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>
          <button
            onClick={() => setKartlarAcik(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors group"
          >
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${kartlarAcik ? 'rotate-0' : '-rotate-90'}`}
            />
            <span className="group-hover:underline">{kartlarAcik ? 'İstatistikleri Gizle' : 'İstatistikleri Göster'}</span>
          </button>
        </div>
        <p className="text-sm text-gray-500">Genel üretim özeti</p>
      </div>

      {/* Sevkiyat Planlama Modal */}
      {sevkiyatAcik && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setSevkiyatAcik(false)} />
          <SevkiyatPlanlama onKapat={() => setSevkiyatAcik(false)} />
        </>
      )}

      {/* Takvim Sipariş Detay Modal */}
      {takvimDetaySiparis && (
        <SiparisDetayModal
          siparis={takvimDetaySiparis}
          stoklar={stoklar}
          cariler={cariler}
          onKapat={() => setTakvimDetaySiparis(null)}
        />
      )}
      {takvimDetayYukleniyor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="bg-white rounded-xl shadow-lg px-5 py-3 text-sm text-gray-600 flex items-center gap-2">
            <svg className="animate-spin w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Yükleniyor…
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="mb-6">
        {kartlarAcik && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
        )}
      </div>

      {/* ── Takvim + Yıkamada ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* === Takvim (2/3 width) === */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">

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
            <div className="p-2">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-gray-100 mb-0">
                {HAFTA_GUNLERI.map(g => (
                  <div key={g} className="text-center text-[11px] font-semibold text-gray-500 py-1.5 uppercase tracking-wide">{g}</div>
                ))}
              </div>
              {/* Cells */}
              <div className="grid grid-cols-7 divide-x divide-y divide-gray-100 overflow-visible">
                {monthGrid.map((day, idx) => {
                  if (!day) return (
                    <div key={`pad-${idx}`} className="min-h-[110px] bg-gray-50/40" />
                  )
                  const dateStr = toDateStr(day)
                  const sipList = siparisMap.get(dateStr) ?? []
                  const hasNote = notMap.has(dateStr)
                  const isToday = dateStr === today
                  const isSelected = dateStr === selectedDate
                  const isDragOver = overDate === dateStr
                  const MAX_VISIBLE = 3

                  return (
                    <div
                      key={dateStr}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      onDragOver={e => { e.preventDefault(); setOverDate(dateStr) }}
                      onDragLeave={e => {
                        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                          setOverDate(null)
                        }
                      }}
                      onDrop={e => {
                        e.preventDefault()
                        setOverDate(null)
                        if (dragSiparis) teslimTarihiGuncelle(dragSiparis, dateStr)
                        setDragSiparis(null)
                      }}
                      className={`relative min-h-[110px] p-1.5 cursor-pointer transition-colors ${
                        isDragOver
                          ? 'bg-blue-50 ring-2 ring-inset ring-blue-400'
                          : isSelected
                          ? 'bg-blue-50/70'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Day number */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors ${
                          isToday
                            ? 'bg-blue-600 text-white'
                            : isSelected
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-700 hover:bg-gray-200'
                        }`}>
                          {day.getDate()}
                        </span>
                        {hasNote && (
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                        )}
                      </div>

                      {/* Event pills */}
                      <div className="space-y-0.5">
                        {sipList.slice(0, MAX_VISIBLE).map(s => (
                          <div key={s.id} className="relative group/pill">
                            {/* Compact pill */}
                            <div
                              draggable
                              onClick={e => e.stopPropagation()}
                              onDragStart={e => {
                                e.stopPropagation()
                                setDragSiparis(s)
                                e.dataTransfer.effectAllowed = 'move'
                              }}
                              onDragEnd={() => { setDragSiparis(null); setOverDate(null) }}
                              className={`flex flex-col px-1.5 py-0.5 rounded-md text-[11px] leading-tight border cursor-grab active:cursor-grabbing select-none transition-opacity ${
                                DURUM_EVENT[s.durum] ?? 'bg-gray-100 text-gray-800 border-gray-200'
                              } ${dragSiparis?.id === s.id ? 'opacity-40' : ''}`}
                              onClick={e => { e.stopPropagation(); takvimSiparisAc(s.id) }}
                            >
                              <span className="font-bold truncate">{s.siparis_no}</span>
                              <span className="truncate text-[10px] opacity-75">{s.musteri}</span>
                              {s.alt_musteri && (
                                <span className="truncate text-[10px] opacity-55">› {s.alt_musteri}</span>
                              )}
                            </div>
                            {/* Hover popover - son 2 satırda yukarı, diğerlerinde aşağı açılır */}
                            <div className={`absolute left-0 z-50 hidden group-hover/pill:block pointer-events-none w-52 ${
                              idx >= monthGrid.length - 14 ? 'bottom-full mb-0.5' : 'top-full mt-0.5'
                            }`}>
                              <div className={`rounded-xl border shadow-lg p-3 text-xs bg-white border-gray-200`}>
                                <div className="font-bold text-gray-900 text-[12px]">{s.siparis_no}</div>
                                <div className="text-gray-700 mt-0.5 font-medium text-[11px]">{s.musteri}</div>
                                {s.alt_musteri && (
                                  <div className="text-gray-500 text-[10px] mt-0.5">› {s.alt_musteri}</div>
                                )}
                                {s.toplam_adet > 0 && (
                                  <div className="text-gray-500 text-[10px] mt-1">{s.toplam_adet} adet cam</div>
                                )}
                                <div className="mt-1.5">
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                                    DURUM_STIL[s.durum] ?? 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {DURUM_ETIKET[s.durum] ?? s.durum}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {sipList.length > MAX_VISIBLE && (
                          <div className="text-[10px] text-gray-400 font-medium pl-1">
                            +{sipList.length - MAX_VISIBLE} daha
                          </div>
                        )}
                      </div>

                      {/* Drop hint */}
                      {isDragOver && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 shadow-sm">
                            Buraya taşı
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Weekly view ── */}
          {takvimGorunum === 'haftalik' && (
            <div className="flex divide-x divide-gray-100 h-full min-h-[360px]">
              {weekDays.map((day, i) => {
                const dateStr = toDateStr(day)
                const sipList = siparisMap.get(dateStr) ?? []
                const hasNote = notMap.has(dateStr)
                const isToday = dateStr === today
                const isSelected = dateStr === selectedDate
                const isDragOver = overDate === dateStr

                return (
                  <div
                    key={dateStr}
                    className={`flex-1 flex flex-col transition-colors ${
                      isDragOver ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : ''
                    }`}
                    onDragOver={e => { e.preventDefault(); setOverDate(dateStr) }}
                    onDragLeave={e => {
                      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                        setOverDate(null)
                      }
                    }}
                    onDrop={e => {
                      e.preventDefault()
                      setOverDate(null)
                      if (dragSiparis) teslimTarihiGuncelle(dragSiparis, dateStr)
                      setDragSiparis(null)
                    }}
                  >
                    {/* Day header */}
                    <button
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`flex flex-col items-center py-2.5 border-b transition-colors ${
                        isSelected ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${
                        isToday ? 'text-blue-600' : 'text-gray-400'
                      }`}>
                        {HAFTA_GUNLERI[i]}
                      </span>
                      <span className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                        isToday ? 'bg-blue-600 text-white' : isSelected ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
                      }`}>
                        {day.getDate()}
                      </span>
                      {hasNote && <span className="w-1 h-1 rounded-full bg-yellow-400 mt-0.5" />}
                    </button>

                    {/* Events */}
                    <div className="flex-1 p-1.5 space-y-1 overflow-y-auto">
                      {sipList.map(s => (
                        <div
                          key={s.id}
                          draggable
                          onDragStart={e => {
                            setDragSiparis(s)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragEnd={() => { setDragSiparis(null); setOverDate(null) }}
                          onClick={e => { e.stopPropagation(); takvimSiparisAc(s.id) }}
                          className={`px-2 py-2 rounded-lg border text-xs cursor-grab active:cursor-grabbing select-none transition-all ${
                            DURUM_EVENT[s.durum] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                          } ${dragSiparis?.id === s.id ? 'opacity-40' : 'hover:shadow-md hover:brightness-95'}`}
                        >
                          <div className="font-bold">{s.siparis_no}</div>
                          <div className="font-medium text-[11px] mt-0.5">{s.musteri}</div>
                          {s.alt_musteri && (
                            <div className="opacity-60 text-[10px] mt-0.5">› {s.alt_musteri}</div>
                          )}
                          {s.toplam_adet > 0 && (
                            <div className="text-[10px] font-semibold opacity-70 mt-0.5">{s.toplam_adet} adet cam</div>
                          )}
                          <div className="mt-1.5">
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white/60">
                              {DURUM_ETIKET[s.durum] ?? s.durum}
                            </span>
                          </div>
                        </div>
                      ))}
                      {sipList.length === 0 && !isDragOver && (
                        <div className="h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <span className="text-[10px] text-gray-300">Boş</span>
                        </div>
                      )}
                      {isDragOver && (
                        <div className="flex items-center justify-center py-3">
                          <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                            Buraya taşı
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* === Sağ kolon: Yıkamada + Sevkiyat === */}
        <div className="flex flex-col gap-6">

          {/* Yıkamada panel — dönen border animasyonu */}
          <div className="relative rounded-xl p-[2px] overflow-hidden">
            {/* Dönen çizgi — aktifse cyan, boşsa mavi/soluk */}
            <div
              className="absolute -inset-[100%] pointer-events-none"
              style={{
                animation: yikamaBatchler.length > 0
                  ? 'spin 6s linear infinite'
                  : 'spin 10s linear infinite',
                background: yikamaBatchler.length > 0
                  ? 'conic-gradient(transparent 0deg, transparent 300deg, #22d3ee 330deg, #67e8f9 345deg, transparent 360deg)'
                  : 'conic-gradient(transparent 0deg, transparent 320deg, #93c5fd 345deg, #bfdbfe 355deg, transparent 360deg)',
              }}
            />
            <div className="relative bg-white rounded-[10px] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {yikamaBatchler.length > 0
                  ? <Droplets size={15} className="text-cyan-500" />
                  : <Droplets size={15} className="text-gray-300" />
                }
                <h2 className="text-sm font-semibold text-gray-700">Yıkamada</h2>
                {yikamaBatchler.length > 0 && (
                  <span className="relative flex items-center">
                    <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-cyan-400 opacity-60" />
                    <span className="relative inline-flex items-center justify-center h-4 w-4 rounded-full bg-cyan-500 text-white text-[9px] font-bold">
                      {yikamaBatchler.length}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5" title="30 saniyede bir güncellenir">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-gray-400">
                  {sonGuncelleme.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {yikamaYukleniyor ? (
                <div className="flex items-center justify-center py-6 text-gray-400 text-xs">
                  Yükleniyor…
                </div>
              ) : yikamaBatchler.length === 0 ? (
                <div className="flex items-center gap-2 py-4 px-2 text-gray-300">
                  <Droplets size={16} className="opacity-40 shrink-0" />
                  <p className="text-xs">Şu an yıkamada batch yok</p>
                </div>
              ) : (
                yikamaBatchler.map(batch => {
                  const toplamCam = batch.siparisler.reduce((a, s) => a + s.cam_adet, 0)
                  return (
                    <div key={batch.id} className="rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 to-white p-2.5 shadow-sm">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                          </span>
                          <span className="font-mono text-xs font-bold text-cyan-800">{batch.batch_no}</span>
                        </div>
                        <span className="text-[10px] text-cyan-600 bg-cyan-100 px-1.5 py-0.5 rounded-full font-semibold">
                          {toplamCam} cam
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {batch.siparisler.map(s => (
                          <div key={s.siparis_id} className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="font-mono text-gray-400 shrink-0">{s.siparis_no}</span>
                              <span className="text-gray-500 truncate">{s.musteri}</span>
                            </div>
                            <span className="text-cyan-700 font-semibold shrink-0 ml-1">{s.cam_adet}</span>
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

          {/* Sevkiyat Planlaması kartı */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-center">
            <button
              onClick={() => setSevkiyatAcik(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Truck size={16} />
              Sevkiyat Planlaması
            </button>
          </div>

          {/* Seçili gün / Bugünün Notu */}
          {selectedDate ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-semibold text-gray-700">{formatDate(selectedDate)}</span>
                  {selectedSiparisler.length > 0 && (
                    <span className="ml-2 text-[11px] text-gray-400">— {selectedSiparisler.length} sipariş</span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="p-0.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {selectedSiparisler.length > 0 ? (
                <div className="space-y-1.5 mb-3">
                  {selectedSiparisler.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-2.5 py-2 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex flex-col min-w-0">
                        <span className="font-mono text-[11px] font-semibold text-gray-700">{s.siparis_no}</span>
                        <span className="text-[10px] text-gray-500 truncate">{s.musteri}</span>
                        {s.alt_musteri && <span className="text-[10px] text-gray-400 truncate">› {s.alt_musteri}</span>}
                        {s.toplam_adet > 0 && <span className="text-[10px] text-gray-400">{s.toplam_adet} adet cam</span>}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ml-2 ${
                        DURUM_STIL[s.durum] ?? 'bg-gray-100 text-gray-600'
                      }`}>
                        {DURUM_ETIKET[s.durum] ?? s.durum}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 mb-3 italic">Bu gün için teslim siparişi yok.</p>
              )}

              <div className="flex items-center gap-1.5 mb-1.5">
                <StickyNote size={12} className="text-yellow-500" />
                <span className="text-[11px] font-medium text-gray-600">Günlük Not</span>
              </div>
              <textarea
                value={notDuzenle}
                onChange={e => setNotDuzenle(e.target.value)}
                placeholder="Bu gün için not ekle..."
                rows={2}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 bg-white"
              />
              <div className="flex justify-end mt-1.5">
                <button
                  onClick={notiKaydet}
                  disabled={notKaydiyor}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={11} />
                  {notKaydiyor ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <StickyNote size={13} className="text-yellow-500" />
                <span className="text-xs font-semibold text-gray-600">Bugünün Notu</span>
                <span className="text-[10px] text-gray-300 ml-1">{today}</span>
              </div>
              <textarea
                value={bugunNot}
                onChange={e => setBugunNot(e.target.value)}
                placeholder="Bugün için not ekle..."
                rows={3}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-200 focus:border-yellow-300 bg-white"
              />
              <div className="flex justify-end mt-1.5">
                <button
                  onClick={bugunNotiKaydet}
                  disabled={bugunNotKaydiyor}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600 disabled:opacity-50 transition-colors"
                >
                  <Save size={11} />
                  {bugunNotKaydiyor ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>
          )}

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
