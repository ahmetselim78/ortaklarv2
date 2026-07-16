import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Barcode,
  CheckCircle2,
  Crosshair,
  CloudUpload,
  ImagePlus,
  Loader2,
  Move,
  RotateCcw,
  Ruler,
  Trash2,
  Type,
} from 'lucide-react'
import type {
  EtiketAlanAnahtari,
  EtiketAlanYerlesimi,
  EtiketAyarlari,
  EtiketVeri,
} from '@/types/ayarlar'
import {
  DPL_FONT_METRIKLERI,
  ETIKET_ALAN_ANAHTARLARI,
  VARSAYILAN_ETIKET_AYARLARI,
  etiketBaskiAlanDegeri,
  etiketAlanOlculeriMm,
  etiketYerlesimUyarilari,
} from '@/types/ayarlar'
import { ETIKET_ALAN_META } from '@/lib/etiketAlanlari'
import { r2Upload, R2UploadHata } from '@/lib/r2Upload'

const INPUT_CLASS = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

/** Diğer alanların X/Y köşelerine yaklaşınca hizalanma eşiği (mm). */
const HIZALAMA_ESIGI_MM = 1

interface SnapCizgileri {
  dikey?: number
  yatay?: number
}

function hizalaKoordinat(
  deger: number,
  hedefler: number[],
  esik: number,
): { deger: number; cizgi?: number } {
  let enYakin: { fark: number; hedef: number } | null = null
  for (const hedef of hedefler) {
    const fark = Math.abs(deger - hedef)
    if (fark <= esik && (!enYakin || fark < enYakin.fark)) {
      enYakin = { fark, hedef }
    }
  }
  return enYakin ? { deger: enYakin.hedef, cizgi: enYakin.hedef } : { deger }
}

function yuvarla(value: number, hassasiyet = 1): number {
  const carpan = 10 ** hassasiyet
  return Math.round((value + Number.EPSILON) * carpan) / carpan
}

function sinirla(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function SayiAlani({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  birim,
  alt,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  birim?: string
  alt?: string
}) {
  const [taslak, setTaslak] = useState(String(value))

  useEffect(() => {
    setTaslak(String(value))
  }, [value])

  function taslagiUygula() {
    const next = Number(taslak)
    if (!taslak.trim() || !Number.isFinite(next)) {
      setTaslak(String(value))
      return
    }
    const sinirlanmis = sinirla(next, min, max)
    setTaslak(String(sinirlanmis))
    onChange(sinirlanmis)
  }

  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-gray-600">
        <span>{label}</span>
        {birim && <span className="font-normal text-gray-400">{birim}</span>}
      </span>
      <input
        type="number"
        value={taslak}
        min={min}
        max={max}
        step={step}
        onChange={event => setTaslak(event.target.value)}
        onBlur={taslagiUygula}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            taslagiUygula()
            event.currentTarget.blur()
          }
        }}
        className={INPUT_CLASS}
      />
      {alt && <span className="mt-1 block text-[11px] leading-4 text-gray-400">{alt}</span>}
    </label>
  )
}

interface EtiketKanvasProps {
  ayarlar: EtiketAyarlari
  veri: EtiketVeri
  seciliAlan?: EtiketAlanAnahtari | null
  onAlanSec?: (alan: EtiketAlanAnahtari | null) => void
  onAlanKonumDegistir?: (alan: EtiketAlanAnahtari, xMm: number, yMm: number) => void
  hareketAdimi?: number
  zeminUrl?: string | null
  zeminOpakligi?: number
  izgara?: boolean
  buyuk?: boolean
}

/** Gerçek DPL home-position koordinatlarını kullanan ortak etiket kanvası. */
export function EtiketKanvas({
  ayarlar,
  veri,
  seciliAlan = null,
  onAlanSec,
  onAlanKonumDegistir,
  hareketAdimi = 0.1,
  zeminUrl = null,
  zeminOpakligi = 0.55,
  izgara = true,
  buyuk = false,
}: EtiketKanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [snapCizgileri, setSnapCizgileri] = useState<SnapCizgileri>({})
  const dragRef = useRef<{
    alan: EtiketAlanAnahtari
    pointerId: number
    baslangicClientX: number
    baslangicClientY: number
    baslangicX: number
    baslangicY: number
  } | null>(null)

  const genislik = Math.max(10, ayarlar.boyut.genislik_mm)
  const yukseklik = Math.max(10, ayarlar.boyut.yukseklik_mm)
  const maxW = buyuk ? 920 : 700
  const maxH = buyuk ? 620 : 430
  const scale = Math.min(maxW / genislik, maxH / yukseklik)
  const canvasW = genislik * scale
  const gridMm = genislik <= 60 ? 2 : 5

  function pointerDown(event: React.PointerEvent<HTMLButtonElement>, alan: EtiketAlanAnahtari) {
    event.stopPropagation()
    onAlanSec?.(alan)
    if (!onAlanKonumDegistir) return
    const yerlesim = ayarlar.yerlesim.alanlar[alan]
    dragRef.current = {
      alan,
      pointerId: event.pointerId,
      baslangicClientX: event.clientX,
      baslangicClientY: event.clientY,
      baslangicX: yerlesim.x_mm,
      baslangicY: yerlesim.y_mm,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function pointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !rect || !onAlanKonumDegistir) return
    const dxMm = (event.clientX - drag.baslangicClientX) * genislik / rect.width
    const dyMm = (event.clientY - drag.baslangicClientY) * yukseklik / rect.height
    let x = yuvarla(Math.round((drag.baslangicX + dxMm) / hareketAdimi) * hareketAdimi)
    let y = yuvarla(Math.round((drag.baslangicY - dyMm) / hareketAdimi) * hareketAdimi)

    const digerAlanlar = ETIKET_ALAN_ANAHTARLARI.filter(
      anahtar => ayarlar.icerik[anahtar] && anahtar !== drag.alan,
    )
    const xHedefler = digerAlanlar.map(anahtar => ayarlar.yerlesim.alanlar[anahtar].x_mm)
    const yHedefler = digerAlanlar.map(anahtar => ayarlar.yerlesim.alanlar[anahtar].y_mm)

    const xSnap = hizalaKoordinat(x, xHedefler, HIZALAMA_ESIGI_MM)
    const ySnap = hizalaKoordinat(y, yHedefler, HIZALAMA_ESIGI_MM)
    x = xSnap.deger
    y = ySnap.deger

    setSnapCizgileri({
      dikey: xSnap.cizgi,
      yatay: ySnap.cizgi,
    })

    onAlanKonumDegistir(
      drag.alan,
      sinirla(x, -100, genislik + 100),
      sinirla(y, -100, yukseklik + 100),
    )
  }

  function pointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
      setSnapCizgileri({})
    }
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-slate-100 p-4 shadow-inner">
      <div
        ref={canvasRef}
        className="relative mx-auto overflow-hidden border border-slate-400 bg-white shadow-lg"
        style={{
          width: canvasW,
          maxWidth: '100%',
          aspectRatio: `${genislik} / ${yukseklik}`,
          backgroundImage: izgara
            ? 'linear-gradient(to right, rgba(37,99,235,.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,.10) 1px, transparent 1px)'
            : undefined,
          backgroundSize: izgara ? `${gridMm / genislik * 100}% ${gridMm / yukseklik * 100}%` : undefined,
        }}
        onPointerDown={() => onAlanSec?.(null)}
      >
        {zeminUrl && (
          <img
            src={zeminUrl}
            alt="Hazır etiket referansı"
            className="pointer-events-none absolute inset-0 h-full w-full object-fill"
            style={{ opacity: zeminOpakligi }}
          />
        )}

        <div className="pointer-events-none absolute bottom-0 left-0 z-20 h-3 w-3 border-b-2 border-l-2 border-red-500">
          <span className="absolute bottom-3 left-1 whitespace-nowrap rounded bg-red-600 px-1 py-0.5 text-[8px] font-semibold text-white">
            DPL 0,0
          </span>
        </div>
        <div className="pointer-events-none absolute bottom-1 right-2 z-20 rounded bg-white/85 px-1.5 py-0.5 text-[8px] font-medium text-gray-500 shadow-sm">
          X → soldan
        </div>
        <div className="pointer-events-none absolute left-1 top-2 z-20 rounded bg-white/85 px-1.5 py-0.5 text-[8px] font-medium text-gray-500 shadow-sm [writing-mode:vertical-rl] rotate-180">
          Y → alttan
        </div>

        {snapCizgileri.dikey != null && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-[15] w-px bg-fuchsia-500 shadow-[0_0_0_1px_rgba(217,70,239,.35)]"
            style={{ left: `${snapCizgileri.dikey / genislik * 100}%` }}
          />
        )}
        {snapCizgileri.yatay != null && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-[15] h-px bg-fuchsia-500 shadow-[0_0_0_1px_rgba(217,70,239,.35)]"
            style={{ bottom: `${snapCizgileri.yatay / yukseklik * 100}%` }}
          />
        )}

        {ETIKET_ALAN_ANAHTARLARI.filter(anahtar => ayarlar.icerik[anahtar]).map(anahtar => {
          const meta = ETIKET_ALAN_META[anahtar]
          const alan = ayarlar.yerlesim.alanlar[anahtar]
          const olcu = etiketAlanOlculeriMm(ayarlar, anahtar, veri)
          const x = alan.x_mm + ayarlar.yerlesim.x_ofset_mm
          const y = alan.y_mm + ayarlar.yerlesim.y_ofset_mm
          const deger = etiketBaskiAlanDegeri(anahtar, veri, undefined, alan.maks_karakter)
          const selected = seciliAlan === anahtar
          const fontPx = Math.max(7, Math.min(48, olcu.yukseklik * scale * 0.72))

          return (
            <button
              key={anahtar}
              type="button"
              title={`${meta.baslik} — X ${x.toFixed(1)} mm / Y ${y.toFixed(1)} mm`}
              onPointerDown={event => pointerDown(event, anahtar)}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={pointerUp}
              onClick={event => { event.stopPropagation(); onAlanSec?.(anahtar) }}
              className={`absolute z-10 overflow-visible whitespace-nowrap text-left outline-none ${onAlanKonumDegistir ? 'cursor-move touch-none' : 'cursor-pointer'}`}
              style={{
                left: `${x / genislik * 100}%`,
                bottom: `${y / yukseklik * 100}%`,
                width: `${Math.max(olcu.genislik, 2) / genislik * 100}%`,
                height: `${Math.max(olcu.yukseklik, 1.5) / yukseklik * 100}%`,
                minWidth: 8,
                minHeight: 6,
                transform: `rotate(${(alan.rotasyon - 1) * 90}deg)`,
                transformOrigin: 'left bottom',
                color: meta.renk,
              }}
            >
              <span
                className={`absolute inset-0 rounded-sm border ${selected ? 'border-blue-600 bg-blue-100/35 ring-2 ring-blue-400/40' : 'border-dashed border-current bg-white/25'}`}
              />
              {meta.tur === 'barkod' ? (
                <span className="absolute inset-[2px] overflow-hidden bg-white/70">
                  <span
                    className="block h-full w-full"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(90deg, #111 0 1px, transparent 1px 2px, #111 2px 4px, transparent 4px 6px)',
                    }}
                  />
                  {alan.barkod_okunabilir_metin && (
                    <span className="absolute bottom-0 left-0 right-0 bg-white text-center font-mono text-[8px] font-bold text-black">{deger}</span>
                  )}
                </span>
              ) : (
                <span
                  className="absolute bottom-0 left-0 max-w-full overflow-hidden text-ellipsis font-mono font-bold leading-none"
                  style={{ fontSize: fontPx }}
                >
                  {deger || '—'}
                </span>
              )}
              {selected && (
                <span className="absolute -top-5 left-0 rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow">
                  {meta.kisa} · {alan.x_mm.toFixed(1)}, {alan.y_mm.toFixed(1)} mm
                </span>
              )}
            </button>
          )
        })}

        {ayarlar.dpl_modu === 'ozel' && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-30 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-center text-xs font-semibold text-amber-800 shadow">
            Özel DPL etkin — bu görsel yerleşim baskıda kullanılmıyor
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-gray-500">
        <span>{genislik} × {yukseklik} mm · {izgara ? `${gridMm} mm ızgara` : 'ızgara kapalı'}</span>
        <span>Önizleme yaklaşık; X/Y değerleri baskıya birebir gönderilir.</span>
      </div>
    </div>
  )
}

interface EtiketYerlesimEditorProps {
  ayarlar: EtiketAyarlari
  veri: EtiketVeri
  onChange: (ayarlar: EtiketAyarlari) => void
  onKaliciDegistir?: (ayarlar: EtiketAyarlari) => Promise<boolean>
  seciliAlan: EtiketAlanAnahtari | null
  onSeciliAlanChange: (alan: EtiketAlanAnahtari | null) => void
}

export default function EtiketYerlesimEditor({
  ayarlar,
  veri,
  onChange,
  onKaliciDegistir,
  seciliAlan,
  onSeciliAlanChange,
}: EtiketYerlesimEditorProps) {
  const [hareketAdimi, setHareketAdimi] = useState(0.1)
  const [izgara, setIzgara] = useState(true)
  const [zeminYukleniyor, setZeminYukleniyor] = useState(false)
  const [zeminYuklemeYuzdesi, setZeminYuklemeYuzdesi] = useState(0)
  const [zeminHatasi, setZeminHatasi] = useState<string | null>(null)
  const [topluFont, setTopluFont] = useState(ayarlar.yerlesim.alanlar.poz.font)
  const [topluGenislik, setTopluGenislik] = useState(ayarlar.yerlesim.alanlar.poz.genislik_carpani)
  const [topluYukseklik, setTopluYukseklik] = useState(ayarlar.yerlesim.alanlar.poz.yukseklik_carpani)
  const dosyaRef = useRef<HTMLInputElement>(null)
  const uyarilar = useMemo(() => etiketYerlesimUyarilari(ayarlar, veri), [ayarlar, veri])
  const alanUyarisi = seciliAlan ? uyarilar.find(uyari => uyari.alan === seciliAlan) : undefined
  const secili = seciliAlan ? ayarlar.yerlesim.alanlar[seciliAlan] : null
  const meta = seciliAlan ? ETIKET_ALAN_META[seciliAlan] : null

  function boyutGuncelle(alan: 'genislik_mm' | 'yukseklik_mm', value: number) {
    onChange({ ...ayarlar, boyut: { ...ayarlar.boyut, [alan]: value } })
  }

  function yerlesimGuncelle<K extends keyof EtiketAyarlari['yerlesim']>(alan: K, value: EtiketAyarlari['yerlesim'][K]) {
    onChange({ ...ayarlar, yerlesim: { ...ayarlar.yerlesim, [alan]: value } })
  }

  function alanGuncelle(anahtar: EtiketAlanAnahtari, patch: Partial<EtiketAlanYerlesimi>) {
    onChange({
      ...ayarlar,
      yerlesim: {
        ...ayarlar.yerlesim,
        alanlar: {
          ...ayarlar.yerlesim.alanlar,
          [anahtar]: { ...ayarlar.yerlesim.alanlar[anahtar], ...patch },
        },
      },
    })
  }

  function alanAcKapat(anahtar: EtiketAlanAnahtari, acik: boolean) {
    onChange({ ...ayarlar, icerik: { ...ayarlar.icerik, [anahtar]: acik } })
  }

  function alanHareket(anahtar: EtiketAlanAnahtari, xMm: number, yMm: number) {
    alanGuncelle(anahtar, { x_mm: xMm, y_mm: yMm })
  }

  function tumMetinlereUygula(font: number, genislik: number, yukseklik: number) {
    const alanlar = { ...ayarlar.yerlesim.alanlar }
    for (const anahtar of ETIKET_ALAN_ANAHTARLARI) {
      if (anahtar === 'barkod') continue
      alanlar[anahtar] = {
        ...alanlar[anahtar],
        font,
        genislik_carpani: genislik,
        yukseklik_carpani: yukseklik,
      }
    }
    onChange({
      ...ayarlar,
      yerlesim: { ...ayarlar.yerlesim, alanlar },
    })
  }

  function topluMetinAyarlariniUygula() {
    tumMetinlereUygula(topluFont, topluGenislik, topluYukseklik)
  }

  function alcakGenisPresetUygula() {
    setTopluFont(0)
    setTopluGenislik(2)
    setTopluYukseklik(1)
    tumMetinlereUygula(0, 2, 1)
  }

  async function kaliciAyarUygula(yeniAyarlar: EtiketAyarlari): Promise<boolean> {
    onChange(yeniAyarlar)
    return onKaliciDegistir ? onKaliciDegistir(yeniAyarlar) : true
  }

  async function zeminSec(file: File | undefined) {
    if (!file) return
    setZeminYukleniyor(true)
    setZeminYuklemeYuzdesi(0)
    setZeminHatasi(null)
    try {
      const sonuc = await r2Upload(file, setZeminYuklemeYuzdesi, 'etiket-zemin')
      const yeniAyarlar: EtiketAyarlari = {
        ...ayarlar,
        yerlesim: {
          ...ayarlar.yerlesim,
          zemin_fotografi_url: sonuc.url,
          zemin_fotografi_key: sonuc.key,
        },
      }
      const kaydedildi = await kaliciAyarUygula(yeniAyarlar)
      if (!kaydedildi) {
        onChange(ayarlar)
        setZeminHatasi('Fotoğraf depoya yüklendi ancak etiket ayarına kaydedilemedi.')
      }
    } catch (error) {
      setZeminHatasi(error instanceof R2UploadHata
        ? error.message
        : 'Etiket fotoğrafı yüklenemedi.')
    } finally {
      setZeminYukleniyor(false)
      if (dosyaRef.current) dosyaRef.current.value = ''
    }
  }

  async function zeminReferansiniKaldir() {
    setZeminHatasi(null)
    const yeniAyarlar: EtiketAyarlari = {
      ...ayarlar,
      yerlesim: {
        ...ayarlar.yerlesim,
        zemin_fotografi_url: '',
        zemin_fotografi_key: '',
      },
    }
    const kaydedildi = await kaliciAyarUygula(yeniAyarlar)
    if (!kaydedildi) {
      onChange(ayarlar)
      setZeminHatasi('Fotoğraf referansı ayarlardan kaldırılamadı.')
    }
  }

  function varsayilanM4206() {
    onChange({
      ...ayarlar,
      yerlesim: {
        ...ayarlar.yerlesim,
        dpi: 203,
        nokta_genislik: 2,
        nokta_yukseklik: 2,
        isi: 10,
      },
    })
  }

  const efektifX = secili ? secili.x_mm + ayarlar.yerlesim.x_ofset_mm : 0
  const efektifY = secili ? secili.y_mm + ayarlar.yerlesim.y_ofset_mm : 0
  const col = Math.round(efektifX * 10)
  const row = Math.round(efektifY * 10)
  const fizikselDotX = ayarlar.yerlesim.nokta_genislik * 25.4 / ayarlar.yerlesim.dpi
  const fizikselDotY = ayarlar.yerlesim.nokta_yukseklik * 25.4 / ayarlar.yerlesim.dpi
  const zeminUrl = ayarlar.yerlesim.zemin_fotografi_url || null
  const zeminOpakligi = ayarlar.yerlesim.zemin_opakligi

  return (
    <div className="space-y-5">
      {ayarlar.dpl_modu === 'ozel' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2 text-sm text-amber-900">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span><strong>Eski özel DPL şablonu etkin.</strong> Aşağıdaki hassas konumlar kaydedilse bile tam/üretim baskısında kullanılmaz.</span>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...ayarlar, dpl_modu: 'panel' })}
            className="shrink-0 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-800"
          >
            Görsel yerleşimi baskıda kullan
          </button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Ruler size={16} className="text-blue-600" />
                Fiziksel etiket ve yazıcı çözünürlüğü
              </div>
              <p className="mt-1 text-xs text-gray-500">Hazır gelen etiketin gerçek ölçüsünü girin. Koordinatlar 0,1 mm olarak DPL'ye gönderilir.</p>
            </div>
            <button
              type="button"
              onClick={varsayilanM4206}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              <RotateCcw size={13} /> M-4206 önerilen ayarlar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SayiAlani label="Etiket genişliği" value={ayarlar.boyut.genislik_mm} onChange={value => boyutGuncelle('genislik_mm', value)} min={10} max={300} birim="mm" />
            <SayiAlani label="Etiket yüksekliği" value={ayarlar.boyut.yukseklik_mm} onChange={value => boyutGuncelle('yukseklik_mm', value)} min={10} max={300} birim="mm" />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Yazıcı çözünürlüğü</span>
              <select
                value={ayarlar.yerlesim.dpi}
                onChange={event => yerlesimGuncelle('dpi', Number(event.target.value) as 203 | 300)}
                className={INPUT_CLASS}
              >
                <option value={203}>203 DPI — M-4206</option>
                <option value={300}>300 DPI</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Nokta genişliği</span>
              <select
                value={ayarlar.yerlesim.nokta_genislik}
                onChange={event => yerlesimGuncelle('nokta_genislik', Number(event.target.value) as 1 | 2)}
                className={INPUT_CLASS}
              >
                <option value={1}>1 — ince / hassas</option>
                <option value={2}>2 — M-4206 önerilen</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Nokta yüksekliği</span>
              <select
                value={ayarlar.yerlesim.nokta_yukseklik}
                onChange={event => yerlesimGuncelle('nokta_yukseklik', Number(event.target.value) as 1 | 2 | 3)}
                className={INPUT_CLASS}
              >
                <option value={1}>1 — ince / hassas</option>
                <option value={2}>2 — M-4206 önerilen</option>
                <option value={3}>3 — daha uzun</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-gray-600">
                <span>Baskı koyuluğu</span><span className="text-gray-400">H{String(ayarlar.yerlesim.isi).padStart(2, '0')}</span>
              </span>
              <input
                type="range"
                min={0}
                max={30}
                value={ayarlar.yerlesim.isi}
                onChange={event => yerlesimGuncelle('isi', Number(event.target.value))}
                className="h-10 w-full accent-blue-600"
              />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SayiAlani label="Genel X ofset" value={ayarlar.yerlesim.x_ofset_mm} onChange={value => yerlesimGuncelle('x_ofset_mm', value)} min={-100} max={100} birim="mm" alt="+ sağa / − sola" />
            <SayiAlani label="Genel Y ofset" value={ayarlar.yerlesim.y_ofset_mm} onChange={value => yerlesimGuncelle('y_ofset_mm', value)} min={-100} max={100} birim="mm" alt="+ yukarı / − aşağı" />
            <div className="col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <div className="font-semibold">Gönderilen profil: D{ayarlar.yerlesim.nokta_genislik}{ayarlar.yerlesim.nokta_yukseklik} · H{String(ayarlar.yerlesim.isi).padStart(2, '0')} · metrik</div>
              <div className="mt-1 text-blue-700">Fiziksel nokta: {fizikselDotX.toFixed(3)} × {fizikselDotY.toFixed(3)} mm. Metrik X/Y hassasiyeti 0,1 mm.</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-violet-950">
                  <Type size={15} /> Tüm etiket metinlerinin fontu
                </div>
                <p className="mt-1 text-[11px] text-violet-700">
                  Barkod hariç bütün bilgi alanlarına uygulanır. Yükseklik kısıtlıysa dikey çarpanı 1 tutup yatay çarpanı artırabilirsiniz.
                </p>
              </div>
              <button
                type="button"
                onClick={alcakGenisPresetUygula}
                className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-violet-800 hover:bg-violet-100"
              >
                Alçak + geniş hazır ayar
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(160px,1fr)_110px_110px_auto] sm:items-end">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">DPL fontu</span>
                <select value={topluFont} onChange={event => setTopluFont(Number(event.target.value))} className={INPUT_CLASS}>
                  {Object.entries(DPL_FONT_METRIKLERI).map(([font, olcu]) => (
                    <option key={font} value={font}>Font {font} — {olcu.genislik}×{olcu.yukseklik}</option>
                  ))}
                </select>
              </label>
              <SayiAlani label="Yatay genişlik" value={topluGenislik} onChange={value => setTopluGenislik(Math.round(value))} min={1} max={9} step={1} birim="×" />
              <SayiAlani label="Dikey yükseklik" value={topluYukseklik} onChange={value => setTopluYukseklik(Math.round(value))} min={1} max={9} step={1} birim="×" />
              <button
                type="button"
                onClick={topluMetinAyarlariniUygula}
                className="h-[42px] rounded-lg bg-violet-700 px-4 text-xs font-semibold text-white hover:bg-violet-800"
              >
                Tüm metinlere uygula
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Crosshair size={16} className="text-blue-600" /> Baskı alanları
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ETIKET_ALAN_ANAHTARLARI.map(anahtar => {
              const item = ETIKET_ALAN_META[anahtar]
              const acik = ayarlar.icerik[anahtar]
              const selected = seciliAlan === anahtar
              return (
                <div
                  key={anahtar}
                  className={`rounded-lg border p-2 transition ${selected ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                >
                  <button type="button" onClick={() => onSeciliAlanChange(anahtar)} className="flex w-full items-start gap-2 text-left">
                    <span className="mt-0.5" style={{ color: item.renk }}>{item.tur === 'barkod' ? <Barcode size={15} /> : <Type size={15} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-gray-800">{item.kisa}</span>
                      <span className="block truncate text-[10px] text-gray-400">X {ayarlar.yerlesim.alanlar[anahtar].x_mm.toFixed(1)} · Y {ayarlar.yerlesim.alanlar[anahtar].y_mm.toFixed(1)}</span>
                    </span>
                  </button>
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] font-medium text-gray-600">
                    <input
                      type="checkbox"
                      checked={acik}
                      onChange={event => alanAcKapat(anahtar, event.target.checked)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {acik ? 'Baskıda açık' : 'Kapalı'}
                  </label>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Move size={16} className="text-blue-600" /> Hassas yerleşim tuvali
            </div>
            <p className="mt-1 text-xs text-gray-500">Alanı sürükleyin veya aşağıdaki X/Y değerlerini girin. Sol alt köşe DPL 0,0 noktasıdır.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setIzgara(value => !value)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${izgara ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
              {izgara ? 'Izgara açık' : 'Izgara kapalı'}
            </button>
            <input
              ref={dosyaRef}
              type="file"
              accept="image/*"
              disabled={zeminYukleniyor}
              className="hidden"
              onChange={event => zeminSec(event.target.files?.[0])}
            />
            <button
              type="button"
              disabled={zeminYukleniyor}
              onClick={() => dosyaRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
            >
              {zeminYukleniyor
                ? <Loader2 size={13} className="animate-spin" />
                : zeminUrl ? <CloudUpload size={13} /> : <ImagePlus size={13} />}
              {zeminYukleniyor ? `Yükleniyor %${zeminYuklemeYuzdesi}` : zeminUrl ? 'Fotoğrafı değiştir' : 'Hazır etiket fotoğrafı'}
            </button>
            {zeminUrl && (
              <>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <CheckCircle2 size={13} /> Kalıcı olarak kaydedildi
                </span>
                <button type="button" disabled={zeminYukleniyor} onClick={zeminReferansiniKaldir} title="Referansı kaldır" className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        {zeminUrl && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <span className="text-xs font-medium text-gray-600">Fotoğraf opaklığı</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={zeminOpakligi}
              onChange={event => yerlesimGuncelle('zemin_opakligi', Number(event.target.value))}
              className="max-w-52 flex-1 accent-blue-600"
            />
            <span className="w-9 text-right text-xs text-gray-500">%{Math.round(zeminOpakligi * 100)}</span>
            <span className="text-[10px] text-emerald-600">R2'de saklanır; yalnız önizlemede kullanılır.</span>
          </div>
        )}

        {zeminHatasi && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {zeminHatasi}
          </div>
        )}

        <EtiketKanvas
          ayarlar={ayarlar}
          veri={veri}
          seciliAlan={seciliAlan}
          onAlanSec={onSeciliAlanChange}
          onAlanKonumDegistir={alanHareket}
          hareketAdimi={hareketAdimi}
          zeminUrl={zeminUrl}
          zeminOpakligi={zeminOpakligi}
          izgara={izgara}
        />
      </div>

      {seciliAlan && secili && meta && (
      <div className={`rounded-xl border p-4 ${alanUyarisi ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-lg p-2" style={{ color: meta.renk, backgroundColor: `${meta.renk}12` }}>
              {meta.tur === 'barkod' ? <Barcode size={19} /> : <Type size={19} />}
            </span>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">{meta.baslik}</h4>
              <p className="text-xs text-gray-500">
                {meta.aciklama} · örnek:{' '}
                <span className="font-mono">{etiketBaskiAlanDegeri(seciliAlan, veri, undefined, secili.maks_karakter)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
              <input type="checkbox" checked={ayarlar.icerik[seciliAlan]} onChange={event => alanAcKapat(seciliAlan, event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
              Baskıda göster
            </label>
            <button type="button" onClick={() => alanGuncelle(seciliAlan, { ...VARSAYILAN_ETIKET_AYARLARI.yerlesim.alanlar[seciliAlan] })} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              <RotateCcw size={12} /> Alanı sıfırla
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SayiAlani label="X — soldan" value={secili.x_mm} onChange={value => alanGuncelle(seciliAlan, { x_mm: value })} min={-100} max={300} birim="mm" alt={`Efektif: ${efektifX.toFixed(1)} mm`} />
            <SayiAlani label="Y — alttan" value={secili.y_mm} onChange={value => alanGuncelle(seciliAlan, { y_mm: value })} min={-100} max={300} birim="mm" alt={`Efektif: ${efektifY.toFixed(1)} mm`} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Dönüş</span>
              <select value={secili.rotasyon} onChange={event => alanGuncelle(seciliAlan, { rotasyon: Number(event.target.value) as 1 | 2 | 3 | 4 })} className={INPUT_CLASS}>
                <option value={1}>0° — düz</option>
                <option value={2}>90° — saat yönü</option>
                <option value={3}>180° — ters</option>
                <option value={4}>270° — saat yönü</option>
              </select>
            </label>

            {meta.tur === 'barkod' ? (
              <SayiAlani label="Barkod yüksekliği" value={secili.barkod_yukseklik_mm} onChange={value => alanGuncelle(seciliAlan, { barkod_yukseklik_mm: value })} min={0.3} max={100} birim="mm" />
            ) : (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">DPL fontu</span>
                <select value={secili.font} onChange={event => alanGuncelle(seciliAlan, { font: Number(event.target.value) })} className={INPUT_CLASS}>
                  {Object.entries(DPL_FONT_METRIKLERI).map(([font, olcu]) => (
                    <option key={font} value={font}>Font {font} — {olcu.genislik}×{olcu.yukseklik}</option>
                  ))}
                </select>
              </label>
            )}

            {meta.tur === 'barkod' ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Modül genişliği</span>
                  <select value={secili.barkod_modul_genisligi} onChange={event => alanGuncelle(seciliAlan, { barkod_modul_genisligi: Number(event.target.value) })} className={INPUT_CLASS}>
                    <option value={0}>0 — yazıcı varsayılanı</option>
                    {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} nokta</option>)}
                  </select>
                </label>
                <label className="col-span-2 flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 sm:col-span-2">
                  <input type="checkbox" checked={secili.barkod_okunabilir_metin} onChange={event => alanGuncelle(seciliAlan, { barkod_okunabilir_metin: event.target.checked })} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                  <span><span className="block text-xs font-medium text-gray-700">Değeri barkod altında yaz</span><span className="block text-[10px] text-gray-400">Büyük E barkod kaydı kullanılır</span></span>
                </label>
              </>
            ) : (
              <>
                <SayiAlani label="Yazı genişliği" value={secili.genislik_carpani} onChange={value => alanGuncelle(seciliAlan, { genislik_carpani: Math.round(value) })} min={1} max={9} step={1} birim="×" />
                <SayiAlani label="Yazı yüksekliği" value={secili.yukseklik_carpani} onChange={value => alanGuncelle(seciliAlan, { yukseklik_carpani: Math.round(value) })} min={1} max={9} step={1} birim="×" />
                {seciliAlan === 'poz' ? (
                  <div className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-[11px] leading-snug text-lime-800">
                    Poz metni kesilmez; uzun değerlerde uygun DPL fontu ve genişliği otomatik seçilir.
                  </div>
                ) : (
                  <SayiAlani label="En fazla karakter" value={secili.maks_karakter} onChange={value => alanGuncelle(seciliAlan, { maks_karakter: Math.round(value) })} min={1} max={255} step={1} />
                )}
              </>
            )}
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-blue-900">İnce hareket</span>
              <select value={hareketAdimi} onChange={event => setHareketAdimi(Number(event.target.value))} className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs text-blue-800 outline-none">
                <option value={0.1}>0,1 mm</option>
                <option value={0.5}>0,5 mm</option>
                <option value={1}>1 mm</option>
              </select>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <span />
              <button type="button" title="Yukarı" onClick={() => alanGuncelle(seciliAlan, { y_mm: yuvarla(secili.y_mm + hareketAdimi) })} className="flex h-9 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-100"><ArrowUp size={15} /></button>
              <span />
              <button type="button" title="Sola" onClick={() => alanGuncelle(seciliAlan, { x_mm: yuvarla(secili.x_mm - hareketAdimi) })} className="flex h-9 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-100"><ArrowLeft size={15} /></button>
              <div className="flex h-9 items-center justify-center rounded-lg bg-blue-600 text-[10px] font-bold text-white">{hareketAdimi} mm</div>
              <button type="button" title="Sağa" onClick={() => alanGuncelle(seciliAlan, { x_mm: yuvarla(secili.x_mm + hareketAdimi) })} className="flex h-9 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-100"><ArrowRight size={15} /></button>
              <span />
              <button type="button" title="Aşağı" onClick={() => alanGuncelle(seciliAlan, { y_mm: yuvarla(secili.y_mm - hareketAdimi) })} className="flex h-9 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-100"><ArrowDown size={15} /></button>
              <span />
            </div>
            <div className="mt-3 rounded-lg bg-white/80 px-2.5 py-2 font-mono text-[10px] leading-5 text-blue-900">
              <div>column / X: {String(Math.max(0, col)).padStart(4, '0')}</div>
              <div>row / Y: {String(Math.max(0, row)).padStart(4, '0')}</div>
              <div>rotation: {secili.rotasyon}</div>
            </div>
          </div>
        </div>

        {alanUyarisi && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {alanUyarisi.mesaj}
          </div>
        )}
      </div>
      )}

      <div className={`rounded-xl border px-4 py-3 ${uyarilar.some(uyari => uyari.seviye === 'hata') ? 'border-red-200 bg-red-50' : uyarilar.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="flex items-start gap-2">
          {uyarilar.length
            ? <AlertTriangle size={16} className={uyarilar.some(uyari => uyari.seviye === 'hata') ? 'mt-0.5 shrink-0 text-red-600' : 'mt-0.5 shrink-0 text-amber-600'} />
            : <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />}
          <div>
            <div className={`text-sm font-semibold ${uyarilar.some(uyari => uyari.seviye === 'hata') ? 'text-red-800' : uyarilar.length ? 'text-amber-800' : 'text-emerald-800'}`}>
              {uyarilar.length ? `${uyarilar.length} yerleşim uyarısı` : 'Tüm açık alanlar fiziksel etiket içinde'}
            </div>
            {uyarilar.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
                {uyarilar.map((uyari, index) => <li key={`${uyari.alan ?? 'genel'}-${index}`}>• {uyari.mesaj}</li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
