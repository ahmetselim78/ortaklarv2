import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Archive, RefreshCw, Maximize2, Minimize2, X,
  User, ChevronLeft, ChevronRight, AlertTriangle, Loader2,
  TrendingUp, TrendingDown, Minus, Sun, Moon,
} from 'lucide-react'
import { useSaatlikUretim } from '@/hooks/useSaatlikUretim'
import type { HesaplanmisSatir, HrPersonel } from '@/types/saatlikUretim'
import { presetsOku } from '@/lib/aksiyonPresets'
import type { AksiyonPreset } from '@/lib/aksiyonPresets'

// ── Tema Paleti ───────────────────────────────────────────────────────────────

type Tema = 'dark' | 'light'

interface TemaPaleti {
  wrap: string
  headerBg: string
  headerBorder: string
  headerText: string
  headerMuted: string
  headerFaint: string
  tableHeadBg: string
  tableHeadText: string
  tableHeadFaint: string
  tableHeadBorder: string
  tfootBg: string
  tfootBorder: string
  tfootText: string
  satirAktif: string
  satirGecmis: (renk: HesaplanmisSatir['durumRengi']) => string
  satirGelecek: string
  satirBorderAktif: string
  satirBorderDiger: string
  sagPanelBg: string
  sagPanelBorder: string
  personelBaslikText: string
  personelKartBg: string
  personelKartBorder: string
  personelAdText: string
  personelRolDirekt: string
  personelRolEndirekt: string
  personelFotoBorder: string
  personelAvatarBg: string
  personelAvatarText: string
  dividerColor: string
  dividerText: string
  isgucuBg: string
  isgucuBorder: string
  isgucuBaslikText: string
  isgucuValText: string
  isgucuDirektLabel: string
  isgucuEndirektLabel: string
  nptNormal: string
  nptUyari: string
  nptUyariBg: string
  nptUyariBorder: string
  arsivPanelBg: string
  arsivPanelBorder: string
  arsivInputBg: string
  arsivInputBorder: string
  arsivInputText: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  notModalBg: string
  notModalBorder: string
  notModalInputBg: string
  notModalInputBorder: string
  butonGhost: string
  butonGhostHover: string
  butonArsivAktif: string
  notHint: string
  emptyText: string
  performans: Record<HesaplanmisSatir['durumRengi'], { text: string; bg: string }>
}

const DARK: TemaPaleti = {
  wrap:              'bg-[#060d1f] text-white',
  headerBg:          'bg-slate-950/70',
  headerBorder:      'border-slate-800/80',
  headerText:        'text-white/90',
  headerMuted:       'text-slate-500',
  headerFaint:       'text-amber-400',
  tableHeadBg:       'bg-slate-900/95 backdrop-blur',
  tableHeadText:     'text-slate-400',
  tableHeadFaint:    'text-slate-600',
  tableHeadBorder:   'border-slate-800',
  tfootBg:           'bg-slate-900/80',
  tfootBorder:       'border-slate-700',
  tfootText:         'text-slate-400',
  satirAktif:        'bg-slate-800/80',
  satirGecmis:       (r) => ({
    yesil:   'bg-emerald-950/30',
    sari:    'bg-amber-950/30',
    kirmizi: 'bg-red-950/30',
    gri:     'bg-slate-900/20',
  }[r]),
  satirGelecek:      'bg-transparent opacity-40',
  satirBorderAktif:  'border-l-blue-400',
  satirBorderDiger:  'border-l-transparent',
  sagPanelBg:        'bg-slate-950/50',
  sagPanelBorder:    'border-slate-800/70',
  personelBaslikText:'text-slate-500',
  personelKartBg:    'bg-slate-900/60',
  personelKartBorder:'border-slate-800/70',
  personelAdText:    'text-white',
  personelRolDirekt: 'text-blue-400',
  personelRolEndirekt:'text-purple-400',
  personelFotoBorder:'border-slate-700',
  personelAvatarBg:  'bg-slate-800',
  personelAvatarText:'text-slate-400',
  dividerColor:      'border-slate-700',
  dividerText:       'text-slate-600',
  isgucuBg:          'bg-slate-900/60',
  isgucuBorder:      'border-slate-800/70',
  isgucuBaslikText:  'text-slate-500',
  isgucuValText:     'text-white',
  isgucuDirektLabel: 'text-blue-400',
  isgucuEndirektLabel:'text-purple-400',
  nptNormal:         'text-slate-300',
  nptUyari:          'text-red-400',
  nptUyariBg:        'bg-red-950/40',
  nptUyariBorder:    'border-red-800/60',
  arsivPanelBg:      'bg-slate-800',
  arsivPanelBorder:  'border-slate-700',
  arsivInputBg:      'bg-slate-900',
  arsivInputBorder:  'border-slate-700',
  arsivInputText:    'text-white',
  tooltipBg:         'bg-slate-700',
  tooltipBorder:     'border-slate-600',
  tooltipText:       'text-white',
  notModalBg:        'bg-slate-800',
  notModalBorder:    'border-slate-700',
  notModalInputBg:   'bg-slate-900',
  notModalInputBorder:'border-slate-700',
  butonGhost:        'text-slate-500 hover:text-slate-200 hover:bg-slate-800',
  butonGhostHover:   'hover:bg-slate-700/80',
  butonArsivAktif:   'bg-amber-900/50 text-amber-300 border-amber-800/70',
  notHint:           'text-slate-700',
  emptyText:         'text-slate-600',
  performans: {
    yesil:   { text: 'text-emerald-400', bg: 'bg-emerald-950/40' },
    sari:    { text: 'text-amber-400',   bg: 'bg-amber-950/40'   },
    kirmizi: { text: 'text-red-400',     bg: 'bg-red-950/40'     },
    gri:     { text: 'text-slate-400',   bg: 'bg-slate-900/30'   },
  },
}

const LIGHT: TemaPaleti = {
  wrap:              'bg-gray-50 text-gray-900',
  headerBg:          'bg-white',
  headerBorder:      'border-gray-200',
  headerText:        'text-gray-900',
  headerMuted:       'text-gray-500',
  headerFaint:       'text-amber-600',
  tableHeadBg:       'bg-gray-100',
  tableHeadText:     'text-gray-600',
  tableHeadFaint:    'text-gray-400',
  tableHeadBorder:   'border-gray-200',
  tfootBg:           'bg-gray-100',
  tfootBorder:       'border-gray-300',
  tfootText:         'text-gray-600',
  satirAktif:        'bg-blue-50',
  satirGecmis:       (r) => ({
    yesil:   'bg-emerald-50',
    sari:    'bg-amber-50',
    kirmizi: 'bg-red-50',
    gri:     'bg-white',
  }[r]),
  satirGelecek:      'bg-white opacity-50',
  satirBorderAktif:  'border-l-blue-600',
  satirBorderDiger:  'border-l-transparent',
  sagPanelBg:        'bg-white',
  sagPanelBorder:    'border-gray-200',
  personelBaslikText:'text-gray-500',
  personelKartBg:    'bg-gray-50',
  personelKartBorder:'border-gray-200',
  personelAdText:    'text-gray-900',
  personelRolDirekt: 'text-blue-600',
  personelRolEndirekt:'text-purple-600',
  personelFotoBorder:'border-gray-200',
  personelAvatarBg:  'bg-gray-200',
  personelAvatarText:'text-gray-500',
  dividerColor:      'border-gray-300',
  dividerText:       'text-gray-400',
  isgucuBg:          'bg-gray-50',
  isgucuBorder:      'border-gray-200',
  isgucuBaslikText:  'text-gray-500',
  isgucuValText:     'text-gray-900',
  isgucuDirektLabel: 'text-blue-600',
  isgucuEndirektLabel:'text-purple-600',
  nptNormal:         'text-gray-700',
  nptUyari:          'text-red-600',
  nptUyariBg:        'bg-red-50',
  nptUyariBorder:    'border-red-200',
  arsivPanelBg:      'bg-white',
  arsivPanelBorder:  'border-gray-200',
  arsivInputBg:      'bg-gray-50',
  arsivInputBorder:  'border-gray-300',
  arsivInputText:    'text-gray-900',
  tooltipBg:         'bg-gray-800',
  tooltipBorder:     'border-gray-700',
  tooltipText:       'text-white',
  notModalBg:        'bg-white',
  notModalBorder:    'border-gray-200',
  notModalInputBg:   'bg-gray-50',
  notModalInputBorder:'border-gray-300',
  butonGhost:        'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
  butonGhostHover:   'hover:bg-gray-100',
  butonArsivAktif:   'bg-amber-100 text-amber-700 border-amber-300',
  notHint:           'text-gray-400',
  emptyText:         'text-gray-400',
  performans: {
    yesil:   { text: 'text-emerald-600', bg: 'bg-emerald-50' },
    sari:    { text: 'text-amber-600',   bg: 'bg-amber-50'   },
    kirmizi: { text: 'text-red-600',     bg: 'bg-red-50'     },
    gri:     { text: 'text-gray-400',    bg: 'bg-gray-50'    },
  },
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function farkHesapla(gerceklesen: number, hedef: number): number {
  if (hedef === 0) return 0
  return Math.round(((gerceklesen - hedef) / hedef) * 100)
}

function toDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function turkishDateLabel(tarih: string): string {
  const [y, m, d] = tarih.split('-')
  const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                 'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
  const gunler = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  return `${gunler[dt.getDay()]}, ${Number(d)} ${aylar[Number(m) - 1]} ${y}`
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipState { text: string; x: number; y: number }

function Tooltip({ state, T }: { state: TooltipState | null; T: TemaPaleti }) {
  if (!state) return null
  return (
    <div
      style={{ left: state.x, top: state.y - 48, maxWidth: 340 }}
      className={`fixed z-[9999] pointer-events-none ${T.tooltipBg} ${T.tooltipText} text-sm px-4 py-2.5 rounded-xl shadow-xl border ${T.tooltipBorder} leading-relaxed whitespace-pre-wrap`}
    >
      {state.text}
    </div>
  )
}

// ── Personel Karusel ──────────────────────────────────────────────────────────

function PersonelKarusel({ personeller, T }: { personeller: HrPersonel[]; T: TemaPaleti }) {
  const [hataliIds, setHataliIds] = useState<Set<string>>(new Set())
  const innerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const lastTRef = useRef<number | null>(null)

  // Hız: 40 px/saniye — daha az personel varsa biraz yavaşlat
  const HIZ = Math.max(20, 55 - personeller.length * 1.2)

  useEffect(() => {
    if (personeller.length === 0) return
    lastTRef.current = null

    const tick = (ts: number) => {
      if (lastTRef.current === null) lastTRef.current = ts
      const dt = ts - lastTRef.current
      lastTRef.current = ts

      const el = innerRef.current
      if (el) {
        const halfH = el.scrollHeight / 2
        if (halfH > 0) {
          offsetRef.current += (dt / 1000) * HIZ
          if (offsetRef.current >= halfH) offsetRef.current -= halfH
          el.style.transform = `translateY(-${offsetRef.current}px)`
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      lastTRef.current = null
    }
  }, [personeller, HIZ])

  if (personeller.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 ${T.emptyText} text-sm`}>
        <User size={28} className="opacity-40" />
        <p>Aktif personel yok</p>
        <p className="text-xs opacity-70">Ayarlar → Personel</p>
      </div>
    )
  }

  const Kart = ({ p }: { p: HrPersonel }) => {
    const hatali = hataliIds.has(p.id)
    const initials = p.ad_soyad.split(' ').slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('')
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${T.personelKartBg} ${T.personelKartBorder}`}>
        {p.foto_url && !hatali ? (
          <img
            src={p.foto_url}
            alt={p.ad_soyad}
            onError={() => setHataliIds(prev => new Set([...prev, p.id]))}
            className={`w-14 h-14 rounded-full object-cover shrink-0 border-2 ${T.personelFotoBorder}`}
          />
        ) : (
          <div className={`w-14 h-14 rounded-full ${T.personelAvatarBg} border-2 ${T.personelFotoBorder} flex items-center justify-center shrink-0 ${T.personelAvatarText} text-lg font-bold`}>
            {initials || <User size={22} />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-base font-semibold leading-tight truncate ${T.personelAdText}`}>{p.ad_soyad}</p>
          <p className={`text-sm mt-0.5 font-medium ${p.rol === 'Direkt' ? T.personelRolDirekt : T.personelRolEndirekt}`}>
            {p.rol}
          </p>
        </div>
      </div>
    )
  }

  const Divider = () => (
    <div className="flex items-center gap-3 py-3 px-2">
      <div className={`flex-1 border-t ${T.dividerColor}`} />
      <span className={`text-xs ${T.dividerText} tracking-widest`}>— devam —</span>
      <div className={`flex-1 border-t ${T.dividerColor}`} />
    </div>
  )

  return (
    <div className="overflow-hidden">
      <div ref={innerRef} className="space-y-2 px-3 will-change-transform">
        {personeller.map(p => <Kart key={`a-${p.id}`} p={p} />)}
        <Divider />
        {personeller.map(p => <Kart key={`b-${p.id}`} p={p} />)}
        <Divider />
      </div>
    </div>
  )
}

// ── Çift Değer Hücresi ────────────────────────────────────────────────────────
// Görünüm: "50 / 150" — saatlik / kümülatif yatay olarak

function CiftDeger({ saatlik, kumulatif, renkSinifi }: {
  saatlik: number
  kumulatif: number
  renkSinifi: string
}) {
  return (
    <div className="flex items-baseline justify-center gap-1 tabular-nums whitespace-nowrap">
      <span className={`text-xl font-bold ${renkSinifi}`}>{saatlik}</span>
      <span className="text-sm opacity-40">/</span>
      <span className={`text-base opacity-60 ${renkSinifi}`}>{kumulatif}</span>
    </div>
  )
}

// ── Üretim Satırı ─────────────────────────────────────────────────────────────

interface SatirProps {
  satir: HesaplanmisSatir
  bugunMu: boolean
  T: TemaPaleti
  onNotClick: (id: string, not: string) => void
  onTooltip: (state: TooltipState | null) => void
}

function UretimSatiri({ satir, bugunMu, T, onNotClick, onTooltip }: SatirProps) {
  const perf = T.performans[satir.durumRengi]
  const fark = farkHesapla(satir.gerceklesen_adet, satir.hedef_adet)
  const notRef = useRef<HTMLDivElement>(null)

  const aktif    = bugunMu && satir.zamanDurumu === 'aktif'
  const gecmis   = satir.zamanDurumu === 'gecmis'
  const gelecek  = satir.zamanDurumu === 'gelecek'

  const satirBg = aktif
    ? T.satirAktif
    : gecmis
    ? T.satirGecmis(satir.durumRengi)
    : T.satirGelecek

  const borderL = aktif ? T.satirBorderAktif : T.satirBorderDiger

  return (
    <tr className={`border-b ${T.tableHeadBorder} transition-colors ${satirBg} border-l-2 ${borderL}`}>
      {/* Saat Aralığı */}
      <td className="w-40 px-4 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {aktif && (
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
          )}
          <span className={`font-mono text-lg font-semibold ${aktif || gecmis ? T.headerText : T.emptyText}`}>
            {satir.saat_araligi}
          </span>
        </div>
      </td>

      {/* Hedef */}
      <td className="w-44 px-2 py-4 text-center">
        <CiftDeger
          saatlik={satir.hedef_adet}
          kumulatif={satir.kumulatifHedef}
          renkSinifi={T.tableHeadText}
        />
      </td>

      {/* Gerçekleşen */}
      <td className="w-48 px-2 py-4 text-center">
        <CiftDeger
          saatlik={satir.gerceklesen_adet}
          kumulatif={satir.kumulatifGerceklesen}
          renkSinifi={gecmis || aktif ? perf.text : T.emptyText}
        />
      </td>

      {/* Fire */}
      <td className="w-36 px-2 py-4 text-center">
        <CiftDeger
          saatlik={satir.fire_adet}
          kumulatif={satir.kumulatifFire}
          renkSinifi={satir.fire_adet > 0 ? 'text-orange-500' : T.emptyText}
        />
      </td>

      {/* Fark % */}
      <td className="w-24 px-2 py-4 text-center">
        {gecmis || aktif ? (
          <div className={`flex items-center justify-center gap-1 text-base font-bold ${perf.text}`}>
            {fark > 0 ? <TrendingUp size={15} /> : fark < 0 ? <TrendingDown size={15} /> : <Minus size={15} />}
            <span>{Math.abs(fark)}%</span>
          </div>
        ) : (
          <span className={`text-sm ${T.emptyText}`}>—</span>
        )}
      </td>

      {/* NPT % */}
      <td className="w-20 px-2 py-4 text-center">
        <span className={`text-base tabular-nums font-medium ${
          satir.npt_orani > 10 ? T.nptUyari + ' font-bold' : T.tableHeadText
        }`}>
          {satir.npt_orani > 0 ? `${satir.npt_orani}%` : '—'}
        </span>
      </td>

      {/* Aksiyon Notu */}
      <td className="w-44 px-3 py-4">
        <div
          ref={notRef}
          className={`truncate text-xs cursor-pointer transition-colors ${T.tableHeadText} hover:opacity-80`}
          onClick={() => onNotClick(satir.id, satir.aksiyon_notu ?? '')}
          onMouseEnter={() => {
            const el = notRef.current
            if (!el || !satir.aksiyon_notu) return
            if (el.scrollWidth > el.clientWidth) {
              const rect = el.getBoundingClientRect()
              onTooltip({ text: satir.aksiyon_notu, x: rect.left + rect.width / 2, y: rect.top })
            }
          }}
          onMouseLeave={() => onTooltip(null)}
        >
          {satir.aksiyon_notu ?? (
            <span className={`italic text-xs ${T.notHint}`}>+ Not ekle</span>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Not Düzenleme Modal ───────────────────────────────────────────────────────

function NotModal({
  open, ilkDeger, T, onKaydet, onKapat,
}: {
  open: boolean
  ilkDeger: string
  T: TemaPaleti
  onKaydet: (not: string) => void
  onKapat: () => void
}) {
  const [deger, setDeger] = useState(ilkDeger)
  const [presets, setPresets] = useState<AksiyonPreset[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setDeger(ilkDeger)
      setPresets(presetsOku())
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open, ilkDeger])

  // Kısayol tuşu dinleyici (modal açıkken 1-9 → preset seç)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      // Textarea içinde yazarken tuşları engelleme
      if (document.activeElement === inputRef.current) return
      const preset = presets.find(p => p.kisayol === e.key)
      if (preset) {
        e.preventDefault()
        setDeger(preset.metin)
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, presets])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onKapat} />
      <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={`${T.notModalBg} border ${T.notModalBorder} rounded-2xl shadow-2xl p-6 w-full max-w-lg pointer-events-auto`}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-base font-semibold ${T.headerText}`}>Aksiyon Notu</h3>
            <button type="button" onClick={onKapat} className={`p-1.5 rounded-lg transition-colors ${T.butonGhost}`}>
              <X size={16} />
            </button>
          </div>

          {/* Hazır Cevaplar */}
          {presets.length > 0 && (
            <div className="mb-4">
              <p className={`text-xs font-medium uppercase tracking-wide ${T.headerMuted} mb-2`}>Hazır Cevaplar</p>
              <div className="flex flex-wrap gap-2">
                {presets.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setDeger(p.metin); inputRef.current?.focus() }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl border transition-all ${
                      deger === p.metin
                        ? 'bg-blue-600 text-white border-blue-600'
                        : `${T.butonGhostHover} border ${T.notModalBorder} ${T.headerText}`
                    }`}
                  >
                    {p.kisayol && (
                      <kbd className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                        deger === p.metin
                          ? 'bg-blue-500 border-blue-400 text-white'
                          : 'bg-gray-100 border-gray-300 text-gray-500'
                      }`}>
                        {p.kisayol}
                      </kbd>
                    )}
                    {p.metin}
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea
            ref={inputRef}
            value={deger}
            onChange={e => setDeger(e.target.value)}
            rows={3}
            placeholder="Bu saat dilimi için not giriniz…"
            className={`w-full px-3 py-2.5 text-sm ${T.notModalInputBg} border ${T.notModalInputBorder} rounded-xl ${T.headerText} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
          />

          {presets.length > 0 && (
            <p className={`text-[11px] ${T.headerMuted} mt-1.5`}>
              Hazır cevap seçmek için yukarıdaki tuşlara (1–9) basın veya tıklayın.
            </p>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onKapat} className={`px-4 py-2 text-sm rounded-xl transition-colors ${T.butonGhost}`}>
              İptal
            </button>
            <button
              type="button"
              onClick={() => { onKaydet(deger); onKapat() }}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition-colors"
            >
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Ana Bileşen ───────────────────────────────────────────────────────────────

interface SaatlikTakipPanosuProps {
  tamEkran?: boolean
}

export default function SaatlikTakipPanosu({ tamEkran = false }: SaatlikTakipPanosuProps) {
  const {
    hesaplanmisSatirlar,
    personeller,
    isGucuOzeti,
    seciliTarih,
    bugun,
    yukleniyor,
    hata,
    fetchPastDateData,
    buguneDon,
    aksiyonNotuGuncelle,
    yenile,
  } = useSaatlikUretim()

  // ── Tema ──────────────────────────────────────────────────────────────────
  const [tema, setTema] = useState<Tema>(() => {
    try { return (localStorage.getItem('saatlik-takip-tema') as Tema) ?? 'dark' }
    catch { return 'dark' }
  })
  const T = tema === 'dark' ? DARK : LIGHT

  const temaDegistir = useCallback(() => {
    setTema(t => {
      const yeni = t === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('saatlik-takip-tema', yeni) } catch { /* ignore */ }
      return yeni
    })
  }, [])

  // ── Yerel state ───────────────────────────────────────────────────────────
  const [saat, setSaat] = useState('')
  const [arsivAcik, setArsivAcik] = useState(false)
  const [arsivTarih, setArsivTarih] = useState('')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [notModal, setNotModal] = useState<{ id: string; not: string } | null>(null)
  const [tamEkranYerel, setTamEkranYerel] = useState(false)

  const arsivRef = useRef<HTMLDivElement>(null)
  const gercekTamEkran = tamEkran || tamEkranYerel

  // Canlı saat
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setSaat(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Arşiv dışı tıklama
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (arsivRef.current && !arsivRef.current.contains(e.target as Node)) {
        setArsivAcik(false)
      }
    }
    if (arsivAcik) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [arsivAcik])

  const sonSatir = hesaplanmisSatirlar[hesaplanmisSatirlar.length - 1]
  const toplamHedef        = sonSatir?.kumulatifHedef        ?? 0
  const toplamGerceklesen  = sonSatir?.kumulatifGerceklesen  ?? 0
  const toplamFire         = sonSatir?.kumulatifFire         ?? 0

  const arsivUygula = useCallback(() => {
    if (!arsivTarih) return
    fetchPastDateData(arsivTarih)
    setArsivAcik(false)
  }, [arsivTarih, fetchPastDateData])

  const notKaydet = useCallback(
    async (id: string, not: string) => { await aksiyonNotuGuncelle(id, not) },
    [aksiyonNotuGuncelle],
  )

  const wrapSinif = gercekTamEkran
    ? `h-screen flex flex-col ${T.wrap}`
    : `flex flex-col flex-1 min-h-[600px] ${T.wrap} rounded-2xl overflow-hidden border ${T.headerBorder} shadow-xl`

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={wrapSinif}>

      {/* ══════════════════════════════════════════════
          BAŞLIK BARI
      ══════════════════════════════════════════════ */}
      <div className={`flex items-center gap-4 px-5 py-3.5 border-b ${T.headerBorder} ${T.headerBg} shrink-0`}>

        {/* Sol: Arşiv butonu */}
        <div className="relative" ref={arsivRef}>
          <button
            type="button"
            onClick={() => setArsivAcik(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
              seciliTarih !== bugun
                ? T.butonArsivAktif
                : `${T.headerBorder} ${T.butonGhost}`
            }`}
          >
            <Archive size={15} />
            {seciliTarih !== bugun ? 'Arşiv Görünümü' : 'Geçmiş Kayıtlar'}
          </button>

          {arsivAcik && (
            <div className={`absolute top-full left-0 mt-2 z-50 ${T.arsivPanelBg} border ${T.arsivPanelBorder} rounded-xl shadow-2xl p-4 min-w-[240px]`}>
              <p className={`text-sm ${T.headerMuted} mb-2`}>Tarih seçin</p>
              <input
                type="date"
                max={toDateStr()}
                value={arsivTarih}
                onChange={e => setArsivTarih(e.target.value)}
                className={`w-full px-3 py-2 text-sm ${T.arsivInputBg} border ${T.arsivInputBorder} rounded-lg ${T.arsivInputText} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={arsivUygula}
                  disabled={!arsivTarih}
                  className="flex-1 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  Getir
                </button>
                {seciliTarih !== bugun && (
                  <button
                    type="button"
                    onClick={() => { buguneDon(); setArsivAcik(false) }}
                    className={`flex-1 py-1.5 text-sm rounded-lg transition-colors ${T.butonGhost}`}
                  >
                    Bugüne Dön
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Arşiv navigasyon okları */}
        {seciliTarih !== bugun && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { const d = new Date(seciliTarih); d.setDate(d.getDate() - 1); fetchPastDateData(toDateStr(d)) }}
              className={`p-1.5 rounded-lg transition-colors ${T.butonGhost}`}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => { const d = new Date(seciliTarih); d.setDate(d.getDate() + 1); const n = toDateStr(d); if (n <= bugun) fetchPastDateData(n) }}
              disabled={seciliTarih >= bugun}
              className={`p-1.5 rounded-lg transition-colors ${T.butonGhost} disabled:opacity-30`}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Orta: Başlık */}
        <div className="flex-1 flex flex-col items-center">
          <h1 className={`text-base font-bold tracking-[0.1em] uppercase ${T.headerText}`}>
            Saatlik Üretim Takip Panosu
          </h1>
          <p className={`text-sm mt-0.5 ${seciliTarih !== bugun ? T.headerFaint : T.headerMuted}`}>
            {turkishDateLabel(seciliTarih)}{seciliTarih !== bugun && ' — Arşiv'}
          </p>
        </div>

        {/* Sağ: Saat + tema toggle + araçlar */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`font-mono text-xl font-bold tabular-nums ${T.headerMuted}`}>{saat}</span>

          <button
            type="button"
            onClick={temaDegistir}
            title={tema === 'dark' ? 'Aydınlık Tema' : 'Karanlık Tema'}
            className={`p-1.5 rounded-lg transition-colors ${T.butonGhost}`}
          >
            {tema === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button
            type="button"
            onClick={yenile}
            title="Yenile"
            className={`p-1.5 rounded-lg transition-colors ${T.butonGhost}`}
          >
            <RefreshCw size={15} />
          </button>

          {!tamEkran && (
            <button
              type="button"
              onClick={() => setTamEkranYerel(v => !v)}
              title={tamEkranYerel ? 'Küçült' : 'Tam Ekran'}
              className={`p-1.5 rounded-lg transition-colors ${T.butonGhost}`}
            >
              {tamEkranYerel ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          ANA İÇERİK
      ══════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Sol: Takip Tablosu ───────────────────────────── */}
        <div className="flex-1 overflow-auto min-w-0">
          {yukleniyor ? (
            <div className={`flex items-center justify-center h-64 gap-3 ${T.headerMuted}`}>
              <Loader2 size={22} className="animate-spin" />
              <span className="text-base">Yükleniyor…</span>
            </div>
          ) : hata ? (
            <div className="flex items-center justify-center h-64 gap-3 text-red-500">
              <AlertTriangle size={22} />
              <span className="text-base">{hata}</span>
            </div>
          ) : hesaplanmisSatirlar.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-64 ${T.emptyText} text-base gap-3`}>
              <p>Bu tarih için kayıt bulunamadı.</p>
              <p className="text-sm">Ayarlar → Hedef &amp; Vardiya → Bugüne Uygula</p>
            </div>
          ) : (
            <table className="w-full table-fixed border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className={`${T.tableHeadBg} border-b ${T.tableHeadBorder}`}>
                  <th className={`w-40 px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide ${T.tableHeadText}`}>
                    Saat
                  </th>
                  <th className={`w-44 px-2 py-3 text-center text-sm font-semibold uppercase tracking-wide ${T.tableHeadText}`}>
                    Hedef
                    <div className={`text-xs font-normal normal-case ${T.tableHeadFaint}`}>saat / kümülatif</div>
                  </th>
                  <th className={`w-48 px-2 py-3 text-center text-sm font-semibold uppercase tracking-wide ${T.tableHeadText}`}>
                    Gerçekleşen
                    <div className={`text-xs font-normal normal-case ${T.tableHeadFaint}`}>saat / kümülatif</div>
                  </th>
                  <th className="w-36 px-2 py-3 text-center text-sm font-semibold uppercase tracking-wide text-orange-500">
                    Fire
                    <div className="text-xs font-normal normal-case text-orange-700">saat / kümülatif</div>
                  </th>
                  <th className={`w-24 px-2 py-3 text-center text-sm font-semibold uppercase tracking-wide ${T.tableHeadText}`}>
                    Fark
                  </th>
                  <th className={`w-20 px-2 py-3 text-center text-sm font-semibold uppercase tracking-wide ${T.tableHeadText}`}>
                    NPT
                  </th>
                  <th className={`w-44 px-3 py-3 text-left text-sm font-semibold uppercase tracking-wide ${T.tableHeadText}`}>
                    Not
                  </th>
                </tr>
              </thead>

              <tbody>
                {hesaplanmisSatirlar.map(satir => (
                  <UretimSatiri
                    key={satir.id}
                    satir={satir}
                    bugunMu={seciliTarih === bugun}
                    T={T}
                    onNotClick={(id, not) => setNotModal({ id, not })}
                    onTooltip={setTooltip}
                  />
                ))}
              </tbody>

              <tfoot>
                <tr className={`border-t-2 ${T.tfootBorder} ${T.tfootBg}`}>
                  <td className={`px-4 py-3 text-sm font-bold uppercase tracking-wider ${T.tfootText}`}>
                    Toplam
                  </td>
                  <td className="px-2 py-3 text-center">
                    <span className={`text-lg font-bold tabular-nums ${T.tableHeadText}`}>{toplamHedef}</span>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <span className={`text-lg font-bold tabular-nums ${
                      toplamGerceklesen >= toplamHedef && toplamHedef > 0
                        ? T.performans.yesil.text
                        : toplamHedef > 0
                        ? T.performans.sari.text
                        : T.tableHeadText
                    }`}>{toplamGerceklesen}</span>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <span className={`text-lg font-bold tabular-nums ${toplamFire > 0 ? 'text-orange-500' : T.tableHeadText}`}>
                      {toplamFire}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-center">
                    {toplamHedef > 0 && (
                      <span className={`text-lg font-bold ${
                        toplamGerceklesen >= toplamHedef
                          ? T.performans.yesil.text
                          : T.performans.kirmizi.text
                      }`}>
                        {farkHesapla(toplamGerceklesen, toplamHedef) > 0 ? '+' : ''}
                        {farkHesapla(toplamGerceklesen, toplamHedef)}%
                      </span>
                    )}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* ── Sağ: Personel + İş Gücü Özeti ──────────────── */}
        {/* CSS Grid ile: header (auto) | karusel (1fr) | footer (auto) */}
        <div
          className={`w-80 xl:w-96 shrink-0 border-l ${T.sagPanelBorder} ${T.sagPanelBg} overflow-hidden`}
          style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto' }}
        >

          {/* Başlık — grid satır 1 */}
          <div className={`px-4 pt-4 pb-2.5 border-b ${T.sagPanelBorder}`}>
            <h2 className={`text-sm font-semibold uppercase tracking-wider ${T.personelBaslikText}`}>
              Bugünkü Personel
              <span className="ml-1.5 opacity-50">({personeller.length})</span>
            </h2>
          </div>

          {/* Karusel — grid satır 2 (1fr) */}
          <PersonelKarusel personeller={personeller} T={T} />

          {/* ── İş Gücü Özeti — grid satır 3 ── */}
          <div className={`border-t ${T.sagPanelBorder} px-4 py-4 ${T.isgucuBg}`}>
            <p className={`text-xs font-semibold uppercase tracking-wider ${T.isgucuBaslikText} mb-3`}>
              İş Gücü Özeti
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Direkt */}
              <div className={`rounded-xl px-3 py-3 border ${T.isgucuBorder} text-center`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${T.isgucuDirektLabel}`}>Direkt</p>
                <p className={`text-3xl font-black tabular-nums mt-1 ${T.isgucuValText}`}>{isGucuOzeti.direkt}</p>
              </div>
              {/* Endirekt */}
              <div className={`rounded-xl px-3 py-3 border ${T.isgucuBorder} text-center`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${T.isgucuEndirektLabel}`}>Endirekt</p>
                <p className={`text-3xl font-black tabular-nums mt-1 ${T.isgucuValText}`}>{isGucuOzeti.endirekt}</p>
              </div>
              {/* Toplam */}
              <div className={`rounded-xl px-3 py-3 border ${T.isgucuBorder} text-center`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${T.isgucuBaslikText}`}>Toplam</p>
                <p className={`text-3xl font-black tabular-nums mt-1 ${T.isgucuValText}`}>{isGucuOzeti.toplam}</p>
              </div>
              {/* NPT */}
              <div className={`rounded-xl px-3 py-3 border text-center ${
                isGucuOzeti.nptYuzdesi > 10
                  ? `${T.nptUyariBg} ${T.nptUyariBorder}`
                  : T.isgucuBorder
              }`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${
                  isGucuOzeti.nptYuzdesi > 10 ? T.nptUyari : T.isgucuBaslikText
                }`}>NPT</p>
                <p className={`text-3xl font-black tabular-nums mt-1 ${
                  isGucuOzeti.nptYuzdesi > 10 ? T.nptUyari : T.isgucuValText
                }`}>
                  %{isGucuOzeti.nptYuzdesi}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      <Tooltip state={tooltip} T={T} />

      {/* Not Modal */}
      {notModal && (
        <NotModal
          open={!!notModal}
          ilkDeger={notModal.not}
          T={T}
          onKaydet={not => notKaydet(notModal.id, not)}
          onKapat={() => setNotModal(null)}
        />
      )}
    </div>
  )
}
