import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { beepAlert } from '@/lib/audio'
import {
  ArrowLeft, Wifi, WifiOff, Volume2, VolumeX,
  AlertTriangle, Keyboard, ArrowRight,
} from 'lucide-react'
import { getStokKatmanYapisi } from '@/lib/cam'

type YeniCamPayload = {
  cam_kodu?: string
  teknik_cam_kodu?: string
  siparis_detay_id?: string
  cita_kalinlik_mm?: number | null
  musteri?: string
  nihai_musteri?: string
  batch_no?: string
  batch_taranan?: number
  batch_toplam?: number
  liste_no?: string
  liste_taranan?: number
  liste_toplam?: number
}

type CitaDetayRow = {
  cita_stok?: { kalinlik_mm?: number | null } | { kalinlik_mm?: number | null }[] | null
  stok?: { katman_yapisi?: string | null; ad?: string | null } | { katman_yapisi?: string | null; ad?: string | null }[] | null
}

type SonOlcu = {
  id: string
  cam_kodu: string
  mm: number
  degisti: boolean
}

type UretimBilgisi = {
  batchNo: string
  musteri: string
  altMusteri: string
  batchTaranan: number
  batchToplam: number
  listeNo: string
  listeTaranan: number
  listeToplam: number
}

const BOS_URETIM_BILGISI: UretimBilgisi = {
  batchNo: '',
  musteri: '',
  altMusteri: '',
  batchTaranan: 0,
  batchToplam: 0,
  listeNo: '',
  listeTaranan: 0,
  listeToplam: 0,
}

function IlerlemeKarti({ baslik, altBaslik, tamamlanan, toplam }: {
  baslik: string
  altBaslik: string
  tamamlanan: number
  toplam: number
}) {
  const yuzde = toplam > 0 ? Math.min(100, Math.round((tamamlanan / toplam) * 100)) : 0
  const tamam = toplam > 0 && tamamlanan >= toplam
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3.5 min-w-0">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-1">{baslik}</p>
          <p className="text-base font-bold text-white truncate">{altBaslik || '—'}</p>
        </div>
        <div className={`text-right font-black tabular-nums shrink-0 ${tamam ? 'text-emerald-400' : 'text-blue-400'}`}>
          <div className="text-2xl leading-none">{tamamlanan}/{toplam}</div>
          <div className="text-sm mt-1 opacity-90">%{yuzde}</div>
        </div>
      </div>
      <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tamam ? 'bg-emerald-400' : 'bg-blue-500'}`}
          style={{ width: `${yuzde}%` }}
        />
      </div>
    </div>
  )
}

export default function GostergeEkraniPage() {
  const navigate = useNavigate()
  const [saat, setSaat] = useState(new Date())
  const [connected, setConnected] = useState(false)
  // Tarayıcılar kullanıcı etkileşimi olmadan sesi engeller; operatör düğmeyle bir kez etkinleştirir.
  const [sesAcik, setSesAcik] = useState(false)
  const [mevcutDeger, setMevcutDeger] = useState<number | null>(null)
  const [yeniDeger, setYeniDeger] = useState<number | null>(null)
  const [onayBekliyor, setOnayBekliyor] = useState(false)
  const [flash, setFlash] = useState(false)
  const [sonOlculer, setSonOlculer] = useState<SonOlcu[]>([])
  const [uretimBilgisi, setUretimBilgisi] = useState<UretimBilgisi>(BOS_URETIM_BILGISI)

  const sesRef = useRef(sesAcik)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mevcutDegerRef = useRef<number | null>(null)
  const sonGelenDegerRef = useRef<number | null>(null)

  useEffect(() => { sesRef.current = sesAcik }, [sesAcik])
  useEffect(() => { mevcutDegerRef.current = mevcutDeger }, [mevcutDeger])
  useEffect(() => {
    const t = setInterval(() => setSaat(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleOnay = useCallback(() => {
    if (!onayBekliyor || yeniDeger == null) return
    const confirmed = yeniDeger
    mevcutDegerRef.current = confirmed
    setMevcutDeger(confirmed)
    setYeniDeger(null)
    setOnayBekliyor(false)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'cita_onay_durumu',
      payload: { bekliyor: false, mevcut: confirmed },
    })
  }, [onayBekliyor, yeniDeger])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Enter') handleOnay()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleOnay])

  useEffect(() => {
    const channel = supabase
      .channel('uretim-istasyonlar')
      .on('broadcast', { event: 'batch_secildi' }, ({ payload }) => {
        setUretimBilgisi({ ...BOS_URETIM_BILGISI, batchNo: payload.batch_no ?? '' })
        setSonOlculer([])
      })
      .on('broadcast', { event: 'yeni_cam' }, async ({ payload }) => {
        const p = payload as YeniCamPayload
        setUretimBilgisi(prev => ({
          batchNo: p.batch_no ?? prev.batchNo,
          musteri: p.musteri ?? prev.musteri,
          altMusteri: p.nihai_musteri ?? prev.altMusteri,
          batchTaranan: p.batch_taranan ?? prev.batchTaranan,
          batchToplam: p.batch_toplam ?? prev.batchToplam,
          listeNo: p.liste_no ?? prev.listeNo,
          listeTaranan: p.liste_taranan ?? prev.listeTaranan,
          listeToplam: p.liste_toplam ?? prev.listeToplam,
        }))

        let gelenMm = p.cita_kalinlik_mm ?? null
        if (gelenMm == null && (p.siparis_detay_id || p.teknik_cam_kodu || p.cam_kodu)) {
          let sorgu = supabase
            .from('siparis_detaylari')
            .select('cita_stok:stok!cita_stok_id(kalinlik_mm), stok:stok_id(katman_yapisi, ad)')
          if (p.siparis_detay_id) sorgu = sorgu.eq('id', p.siparis_detay_id)
          else sorgu = sorgu.eq('cam_kodu', p.teknik_cam_kodu ?? p.cam_kodu)
          const { data } = await sorgu.maybeSingle()
          if (data) {
            const detay = data as CitaDetayRow
            const citaStok = Array.isArray(detay.cita_stok) ? detay.cita_stok[0] : detay.cita_stok
            const camStok = Array.isArray(detay.stok) ? detay.stok[0] : detay.stok
            gelenMm = citaStok?.kalinlik_mm ?? null
            if (gelenMm == null && camStok) {
              const katman = getStokKatmanYapisi(camStok)
              if (katman) {
                const parcalar = katman.split('+')
                if (parcalar.length >= 2) gelenMm = Number(parcalar[1]) || null
              }
            }
          }
        }
        if (gelenMm == null) return

        const sonGelen = sonGelenDegerRef.current
        const olcuDegisti = sonGelen != null && gelenMm !== sonGelen
        sonGelenDegerRef.current = gelenMm
        setSonOlculer(prev => [...prev, {
          id: `${Date.now()}-${p.cam_kodu ?? 'cam'}`,
          cam_kodu: p.cam_kodu ?? '—',
          mm: gelenMm,
          degisti: olcuDegisti,
        }].slice(-8))

        const onceki = mevcutDegerRef.current
        if (onceki == null) {
          mevcutDegerRef.current = gelenMm
          setMevcutDeger(gelenMm)
          channelRef.current?.send({
            type: 'broadcast',
            event: 'cita_onay_durumu',
            payload: { bekliyor: false, mevcut: gelenMm },
          })
        } else if (gelenMm !== onceki) {
          setYeniDeger(gelenMm)
          setOnayBekliyor(true)
          setFlash(true)
          setTimeout(() => setFlash(false), 700)
          if (olcuDegisti && sesRef.current) beepAlert()
          channelRef.current?.send({
            type: 'broadcast',
            event: 'cita_onay_durumu',
            payload: { bekliyor: true, eski: onceki, yeni: gelenMm },
          })
        }
      })
      .subscribe(status => setConnected(status === 'SUBSCRIBED'))

    channelRef.current = channel
    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [])

  const handleSesToggle = () => {
    if (!sesAcik) beepAlert()
    setSesAcik(prev => !prev)
  }

  const olcuSlotlari: Array<SonOlcu | null> = [
    ...Array(Math.max(0, 8 - sonOlculer.length)).fill(null),
    ...sonOlculer,
  ]

  return (
    <div className={`h-screen text-white flex flex-col overflow-hidden transition-colors duration-200 ${
      flash ? 'bg-red-950' : 'bg-black'
    }`}>
      <div className="relative flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <button onClick={() => navigate('/istasyonlar')} className="relative z-10 flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-sans font-black text-2xl tracking-widest text-blue-400 [text-shadow:0_0_1px_currentColor,0_0_1px_currentColor]">
          {uretimBilgisi.batchNo || 'GÖSTERGE EKRANI'}
        </span>
        <div className="relative z-10 flex items-center gap-3">
          <div className={`h-11 w-[148px] flex items-center gap-2 px-3 rounded-xl border text-sm font-bold ${
            connected ? 'bg-emerald-900/60 border-emerald-700 text-emerald-300' : 'bg-red-900/60 border-red-700 text-red-300'
          }`}>
            {connected ? <Wifi size={16} className="shrink-0" /> : <WifiOff size={16} className="shrink-0" />}
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[10px] text-gray-400">SUNUCU</span>
              <span className="truncate">{connected ? 'ÇEVRİMİÇİ' : 'ÇEVRİMDIŞI'}</span>
            </div>
          </div>
          <button
            onClick={handleSesToggle}
            className={`h-11 w-[148px] flex items-center gap-2 px-3 rounded-xl border text-sm font-bold transition-colors ${
              sesAcik
                ? 'bg-emerald-900/50 border-emerald-700 text-emerald-300'
                : 'bg-red-900/50 border-red-700 text-red-300'
            }`}
            title={sesAcik ? 'Çıta değişim sesi açık' : 'Çıta değişim sesi kapalı'}
          >
            {sesAcik ? <Volume2 size={16} className="shrink-0" /> : <VolumeX size={16} className="shrink-0" />}
            <div className="flex flex-col leading-tight text-left min-w-0">
              <span className="text-[10px] text-gray-400">SES</span>
              <span className="truncate">{sesAcik ? 'AÇIK' : 'KAPALI'}</span>
            </div>
          </button>
          <span className="font-mono font-bold text-white text-xl tabular-nums tracking-wide">{saat.toLocaleTimeString('tr-TR')}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 px-4 py-3 border-b border-gray-800 bg-gray-950/70 shrink-0">
        <div className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3.5 min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-1.5">Müşteri</p>
          <p className="text-lg font-black text-white leading-tight truncate">{uretimBilgisi.musteri || '—'}</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3.5 min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-1.5">Alt Müşteri</p>
          <p className="text-lg font-black text-white leading-tight truncate">{uretimBilgisi.altMusteri || '—'}</p>
        </div>
        <IlerlemeKarti
          baslik="Batch İlerlemesi"
          altBaslik={uretimBilgisi.batchNo}
          tamamlanan={uretimBilgisi.batchTaranan}
          toplam={uretimBilgisi.batchToplam}
        />
        <IlerlemeKarti
          baslik="Liste İlerlemesi"
          altBaslik={uretimBilgisi.listeNo}
          tamamlanan={uretimBilgisi.listeTaranan}
          toplam={uretimBilgisi.listeToplam}
        />
      </div>

      {!sesAcik && (
        <div className="mx-4 mt-2 flex items-center justify-center gap-2 rounded-lg border border-amber-700/60 bg-amber-950/70 px-4 py-2 text-amber-300 shrink-0">
          <AlertTriangle size={16} />
          <span className="text-sm font-bold">Çıta değişim sesini etkinleştirmek için üstteki ses düğmesine bir kez basın</span>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        {mevcutDeger == null && !onayBekliyor ? (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl font-black text-gray-700">—</span>
            </div>
            <p className="text-2xl font-semibold text-gray-600">Değer bekleniyor...</p>
            <p className="text-sm text-gray-700 mt-2">Poz Giriş'ten cam girildiğinde çıta kalınlığı burada görünecek</p>
          </div>
        ) : onayBekliyor && yeniDeger != null ? (
          <div className="text-center w-full max-w-4xl">
            <h2 className="text-xl font-black tracking-[.28em] text-red-300 mb-6">ÇITA KALINLIĞI DEĞİŞTİ</h2>
            <div className="flex items-center justify-center gap-10 md:gap-20">
              <div className="rounded-2xl border-2 border-gray-700 bg-gray-900/80 px-12 py-5">
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">MEVCUT</p>
                <p className="font-black tabular-nums leading-none text-white" style={{ fontSize: 'clamp(4rem, 9vw, 8rem)' }}>{mevcutDeger}</p>
                <p className="text-gray-500 text-xl mt-1">mm</p>
              </div>
              <ArrowRight size={52} className="text-red-400 shrink-0" strokeWidth={3} />
              <div className="rounded-2xl border-2 border-red-500 bg-red-950/80 px-12 py-5 shadow-[0_0_28px_rgba(239,68,68,.22)]">
                <p className="text-xs uppercase tracking-widest text-red-300 mb-2">YENİ</p>
                <p className="font-black tabular-nums leading-none text-red-300" style={{ fontSize: 'clamp(4rem, 9vw, 8rem)' }}>{yeniDeger}</p>
                <p className="text-red-400 text-xl mt-1">mm</p>
              </div>
            </div>
            <button
              onClick={handleOnay}
              className="mt-6 inline-flex items-center gap-3 px-9 py-4 bg-red-700 hover:bg-red-600 border border-red-500 rounded-xl text-white font-black text-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <Keyboard size={22} />
              ENTER ile onaylayın
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-base font-black uppercase tracking-[.25em] text-gray-300 mb-4">AKTİF ÇITA KALINLIĞI</p>
            <p className="font-black tabular-nums leading-none text-emerald-300 [text-shadow:0_0_24px_rgba(110,231,183,0.35)]" style={{ fontSize: 'clamp(7rem, 18vw, 13rem)' }}>{mevcutDeger}</p>
            <p className="text-emerald-300 text-4xl font-bold mt-2 tracking-widest">mm</p>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800 bg-gray-950/90 px-4 py-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-black uppercase tracking-widest text-gray-300">Son 8 Çıta Kalınlığı</p>
          <p className="text-xs text-gray-500">En yeni ölçü sağda</p>
        </div>
        <div className="overflow-x-auto kumanda-scroll">
          <div className="grid grid-cols-8 gap-2.5 min-w-[960px]">
            {olcuSlotlari.map((olcu, index) => olcu ? (
              <div
                key={olcu.id}
                className={`rounded-xl border px-3 py-3 text-center ${
                  olcu.degisti
                    ? 'border-red-500 bg-red-950/70'
                    : index === 7
                    ? 'border-emerald-500 bg-emerald-950/50'
                    : 'border-gray-700 bg-gray-900'
                }`}
              >
                <p className={`font-mono text-xs font-bold truncate mb-1 ${
                  olcu.degisti ? 'text-red-300' : index === 7 ? 'text-emerald-300' : 'text-gray-300'
                }`}>GLS {olcu.cam_kodu}</p>
                <p className={`text-3xl font-black tabular-nums leading-none ${
                  olcu.degisti ? 'text-red-300' : 'text-white'
                }`}>
                  {olcu.mm}<span className="text-sm text-gray-400 ml-1 font-bold">mm</span>
                </p>
              </div>
            ) : (
              <div key={`bos-${index}`} className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 px-3 py-3 text-center">
                <p className="text-xs font-bold text-gray-600 mb-1">GLS —</p>
                <p className="text-3xl font-black text-gray-700 leading-none">—</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800 px-6 py-2 flex items-center justify-between text-xs text-gray-600 shrink-0">
        <span>Gösterge Ekranı — Macun Robotu</span>
        <span className="font-mono tabular-nums">{saat.toLocaleTimeString('tr-TR')}</span>
      </div>
    </div>
  )
}
