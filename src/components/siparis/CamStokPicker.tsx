import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X } from 'lucide-react'
import type { Stok } from '@/types/stok'
import { CAM_GRUPLARI, stokKodSira } from '@/lib/cam'
import { cn } from '@/lib/utils'

const GRUP_ETIKETLERI: Record<string, string> = {
  DÜZCAM: 'Düz',
  BUZLUCAM: 'Buzlu',
  AYNA: 'Ayna',
  'LOW-E': 'Low-E',
  KONFOR: 'Konfor',
  ISICAM: 'Isıcam',
  'ISICAM-S': 'Isıcam-S',
  'ISICAM-KONFOR': 'Isı-Konfor',
  'ÜÇLÜ CAM': 'Üçlü',
}

/** Filtre chip sırası — ısıcam aileleri önce */
const PICKER_ONCELIK_GRUPLARI = ['ISICAM', 'ISICAM-S', 'ISICAM-KONFOR'] as const

function pickerGrupSirasi(mevcut: Set<string>): string[] {
  const sonuc: string[] = []
  for (const g of PICKER_ONCELIK_GRUPLARI) {
    if (mevcut.has(g)) sonuc.push(g)
  }
  for (const g of CAM_GRUPLARI) {
    if (mevcut.has(g) && !sonuc.includes(g)) sonuc.push(g)
  }
  for (const g of mevcut) {
    if (!sonuc.includes(g)) sonuc.push(g)
  }
  return sonuc
}

interface CamStokPickerProps {
  stoklar: Stok[]
  value: string
  onChange: (stokId: string) => void
  /** Seçili stok varken Enter'a basıldığında picker dışındaki sonraki alana geçiş yapar. */
  onSelectedEnter?: () => void
  invalid?: boolean
  placeholder?: string
  className?: string
  /** Pasif (eski) stok kartlarını listede işaretle */
  pasifEtiketi?: boolean
  disabled?: boolean
}

function aramaEslesir(stok: Stok, q: string): boolean {
  if (!q) return true
  const metin = [
    stok.kod,
    stok.ad,
    stok.grup ?? '',
    stok.katman_yapisi ?? '',
    stok.kalinlik_mm != null ? String(stok.kalinlik_mm) : '',
  ].join(' ').toLocaleLowerCase('tr-TR')
  return metin.includes(q)
}

type ListeOgesi =
  | { tip: 'baslik'; grup: string; adet: number }
  | { tip: 'stok'; stok: Stok }

export default function CamStokPicker({
  stoklar,
  value,
  onChange,
  onSelectedEnter,
  invalid,
  placeholder = 'Cam stoğu seçin...',
  className,
  pasifEtiketi = false,
  disabled = false,
}: CamStokPickerProps) {
  const [acik, setAcik] = useState(false)
  const [arama, setArama] = useState('')
  const [grupFiltresi, setGrupFiltresi] = useState('')
  const [aktifIdx, setAktifIdx] = useState(-1)
  const [panelKonum, setPanelKonum] = useState({ top: 0, left: 0, width: 0 })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const aramaRef = useRef<HTMLInputElement>(null)
  const listeRef = useRef<HTMLDivElement>(null)
  const listeScrollRef = useRef<HTMLDivElement>(null)

  const seciliStok = useMemo(
    () => stoklar.find(s => s.id === value) ?? null,
    [stoklar, value],
  )

  const mevcutGruplar = useMemo(() => {
    const set = new Set(stoklar.map(s => s.grup).filter((g): g is string => !!g))
    return pickerGrupSirasi(set)
  }, [stoklar])

  const aramaNorm = arama.trim().toLocaleLowerCase('tr-TR')

  const filtrelenmis = useMemo(() => {
    return stoklar
      .filter(s => !grupFiltresi || s.grup === grupFiltresi)
      .filter(s => aramaEslesir(s, aramaNorm))
      .sort((a, b) => stokKodSira(a.kod) - stokKodSira(b.kod))
  }, [stoklar, grupFiltresi, aramaNorm])

  const listeOgeleri = useMemo((): ListeOgesi[] => {
    if (aramaNorm) {
      return filtrelenmis.map(stok => ({ tip: 'stok', stok }))
    }

    const gruplu = new Map<string, Stok[]>()
    for (const stok of filtrelenmis) {
      const g = stok.grup ?? 'Diğer'
      if (!gruplu.has(g)) gruplu.set(g, [])
      gruplu.get(g)!.push(stok)
    }

    const sira = [...mevcutGruplar, ...[...gruplu.keys()].filter(g => !mevcutGruplar.includes(g))]
    const ogeler: ListeOgesi[] = []
    for (const grup of sira) {
      const liste = gruplu.get(grup)
      if (!liste?.length) continue
      ogeler.push({ tip: 'baslik', grup, adet: liste.length })
      for (const stok of liste) ogeler.push({ tip: 'stok', stok })
    }
    return ogeler
  }, [filtrelenmis, aramaNorm, mevcutGruplar])

  const secilebilirIndeksler = useMemo(
    () => listeOgeleri
      .map((o, i) => (o.tip === 'stok' ? i : -1))
      .filter(i => i >= 0),
    [listeOgeleri],
  )

  const panelGuncelle = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const panelGenislik = Math.min(520, window.innerWidth - 16)
    let left = rect.left
    if (left + panelGenislik > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - panelGenislik - 8)
    }
    const ustAlan = rect.top
    const altAlan = window.innerHeight - rect.bottom
    const panelYukseklik = 400
    const ustAc = ustAlan > altAlan && altAlan < panelYukseklik
    setPanelKonum({
      top: ustAc ? rect.top - panelYukseklik - 4 : rect.bottom + 4,
      left,
      width: Math.max(rect.width, panelGenislik),
    })
  }, [])

  const ac = useCallback(() => {
    if (disabled) return
    panelGuncelle()
    setAcik(true)
    setAktifIdx(-1)
  }, [panelGuncelle, disabled])

  const kapat = useCallback(() => {
    setAcik(false)
    setArama('')
    setGrupFiltresi('')
    setAktifIdx(-1)
  }, [])

  const sec = useCallback((stokId: string) => {
    onChange(stokId)
    kapat()
    triggerRef.current?.focus()
  }, [onChange, kapat])

  useEffect(() => {
    if (!acik) return
    const t = window.setTimeout(() => aramaRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [acik])

  useEffect(() => {
    if (!acik) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (listeRef.current?.contains(target)) return
      kapat()
    }
    const scrollHandler = () => panelGuncelle()
    document.addEventListener('mousedown', handler)
    window.addEventListener('resize', scrollHandler)
    window.addEventListener('scroll', scrollHandler, true)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('resize', scrollHandler)
      window.removeEventListener('scroll', scrollHandler, true)
    }
  }, [acik, kapat, panelGuncelle])

  useEffect(() => {
    listeScrollRef.current?.scrollTo({ top: 0 })
  }, [grupFiltresi, aramaNorm])

  useEffect(() => {
    if (!acik || aktifIdx < 0) return
    const el = listeScrollRef.current?.querySelector(`[data-idx="${aktifIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [aktifIdx, acik])

  const sonrakiSecilebilir = (yön: 1 | -1) => {
    if (secilebilirIndeksler.length === 0) return
    const mevcut = secilebilirIndeksler.indexOf(aktifIdx)
    if (mevcut < 0) {
      setAktifIdx(yön === 1 ? secilebilirIndeksler[0] : secilebilirIndeksler[secilebilirIndeksler.length - 1])
      return
    }
    const sonraki = mevcut + yön
    if (sonraki < 0 || sonraki >= secilebilirIndeksler.length) return
    setAktifIdx(secilebilirIndeksler[sonraki])
  }

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !acik && value && onSelectedEnter) {
      e.preventDefault()
      onSelectedEnter()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!acik) ac()
      else sonrakiSecilebilir(1)
    } else if (e.key === 'Escape' && acik) {
      e.preventDefault()
      e.stopPropagation()
      kapat()
    }
  }

  const onAramaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      sonrakiSecilebilir(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sonrakiSecilebilir(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (aktifIdx >= 0) {
        const oge = listeOgeleri[aktifIdx]
        if (oge?.tip === 'stok') sec(oge.stok.id)
      } else if (filtrelenmis.length === 1) {
        sec(filtrelenmis[0].id)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      kapat()
    } else if (e.key === 'Tab') {
      kapat()
    }
  }

  const panel = acik ? createPortal(
    <div
      ref={listeRef}
      style={{ top: panelKonum.top, left: panelKonum.left, width: panelKonum.width }}
      className="fixed z-[200] rounded-xl border border-gray-200 bg-white shadow-2xl flex flex-col overflow-hidden"
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="p-3 border-b border-gray-100 shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            ref={aramaRef}
            type="text"
            value={arama}
            onChange={e => { setArama(e.target.value); setAktifIdx(-1) }}
            onKeyDown={onAramaKeyDown}
            placeholder="Kod, ad veya katman ara..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
          {arama && (
            <button
              type="button"
              onClick={() => { setArama(''); setAktifIdx(-1); aramaRef.current?.focus() }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
              aria-label="Aramayı temizle"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {mevcutGruplar.length > 1 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => { setGrupFiltresi(''); setAktifIdx(-1) }}
              className={cn(
                'shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                !grupFiltresi
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300',
              )}
            >
              Tümü
            </button>
            {mevcutGruplar.map(grup => (
              <button
                key={grup}
                type="button"
                onClick={() => { setGrupFiltresi(g => g === grup ? '' : grup); setAktifIdx(-1) }}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap',
                  grupFiltresi === grup
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300',
                )}
              >
                {GRUP_ETIKETLERI[grup] ?? grup}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={listeScrollRef} className="overflow-y-auto max-h-80 min-h-[140px]">
        {filtrelenmis.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            Eşleşen cam stoğu bulunamadı
          </div>
        ) : (
          listeOgeleri.map((oge, idx) => {
            if (oge.tip === 'baslik') {
              return (
                <div
                  key={`h-${oge.grup}`}
                  className="sticky top-0 z-10 px-4 py-2 bg-gray-50 border-y border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wide"
                >
                  {oge.grup}
                  <span className="ml-1.5 font-normal text-gray-400">({oge.adet})</span>
                </div>
              )
            }

            const { stok } = oge
            const secili = stok.id === value
            const vurgulu = idx === aktifIdx
            const pasif = pasifEtiketi && stok.aktif === false
            return (
              <button
                key={stok.id}
                type="button"
                data-idx={idx}
                onMouseEnter={() => setAktifIdx(idx)}
                onClick={() => sec(stok.id)}
                className={cn(
                  'w-full text-left px-4 py-2.5 flex items-start gap-3 border-b border-gray-50 last:border-0 transition-colors',
                  vurgulu ? 'bg-blue-50' : 'hover:bg-gray-50',
                  secili && 'bg-green-50/80',
                  pasif && 'opacity-75',
                )}
              >
                <span className={cn(
                  'shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-mono font-bold',
                  secili ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600',
                )}>
                  {stok.kod}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn(
                    'block text-sm font-medium leading-snug',
                    secili ? 'text-green-800' : 'text-gray-800',
                  )}>
                    {stok.ad}
                    {pasif && <span className="ml-1.5 text-xs font-normal text-amber-600">(eski kart)</span>}
                  </span>
                  {(stok.katman_yapisi || stok.kalinlik_mm != null) && (
                    <span className="block text-xs text-gray-400 mt-0.5">
                      {stok.katman_yapisi ?? `${stok.kalinlik_mm} mm`}
                    </span>
                  )}
                </span>
              </button>
            )
          })
        )}
      </div>

      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 shrink-0">
        {filtrelenmis.length} stok · ↑↓ gezin · Enter seç · Esc kapat
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (acik ? kapat() : ac())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'w-full min-w-[220px] max-w-[320px] rounded-lg border px-3 py-2 text-sm bg-white text-left',
          'flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500',
          invalid ? 'border-red-300 bg-red-50/50' : 'border-gray-200',
          !seciliStok && 'text-gray-400',
          disabled && 'opacity-50 cursor-not-allowed bg-gray-50',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate leading-snug">
          {seciliStok ? (
            <>
              <span className="font-mono font-semibold text-gray-800">{seciliStok.kod}</span>
              <span className="text-gray-400 mx-1.5">·</span>
              <span className="text-gray-700">{seciliStok.ad}</span>
              {pasifEtiketi && seciliStok.aktif === false && (
                <span className="text-amber-600 text-xs ml-1">(eski)</span>
              )}
            </>
          ) : placeholder}
        </span>
        <ChevronDown size={14} className={cn('shrink-0 text-gray-400 transition-transform', acik && 'rotate-180')} />
      </button>
      {panel}
    </>
  )
}
