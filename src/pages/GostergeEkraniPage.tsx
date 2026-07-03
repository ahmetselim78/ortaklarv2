import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { beepAlert } from '@/lib/audio'
import { ArrowLeft, Wifi, WifiOff, Volume2, VolumeX, AlertTriangle, Keyboard, ArrowRight } from 'lucide-react'

/* ========== Tipler ========== */

/* ========== Bileşen ========== */

export default function GostergeEkraniPage() {
  const navigate = useNavigate()
  const [saat, setSaat] = useState(new Date())
  const [connected, setConnected] = useState(false)
  const [sesAcik, setSesAcik] = useState(false)

  // Değer takibi (çıta kalınlığı mm)
  const [mevcutDeger, setMevcutDeger] = useState<number | null>(null)
  const [yeniDeger, setYeniDeger] = useState<number | null>(null)
  const [onayBekliyor, setOnayBekliyor] = useState(false)
  const [flash, setFlash] = useState(false)

  const sesRef = useRef(sesAcik)
  useEffect(() => { sesRef.current = sesAcik }, [sesAcik])

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mevcutDegerRef = useRef<number | null>(null)
  useEffect(() => { mevcutDegerRef.current = mevcutDeger }, [mevcutDeger])

  // Saat
  useEffect(() => {
    const t = setInterval(() => setSaat(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // ENTER ile onaylama
  const handleOnay = useCallback(() => {
    if (!onayBekliyor || yeniDeger == null) return
    const confirmed = yeniDeger
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

  // Realtime kanal
  useEffect(() => {
    const channel = supabase
      .channel('uretim-istasyonlar')
      .on('broadcast', { event: 'yeni_cam' }, async ({ payload }) => {
        const p = payload as any

        // Çıta kalınlığını doğrudan DB'den çek (broadcast payload'a bağımsız)
        let gelenMm: number | null = null
        if (p.siparis_detay_id || p.teknik_cam_kodu || p.cam_kodu) {
          let sorgu = supabase
            .from('siparis_detaylari')
            .select('katman_yapisi, cita_stok:stok!cita_stok_id(kalinlik_mm)')
          if (p.siparis_detay_id) sorgu = sorgu.eq('id', p.siparis_detay_id)
          else sorgu = sorgu.eq('cam_kodu', p.teknik_cam_kodu ?? p.cam_kodu)
          const { data } = await sorgu.maybeSingle()
          if (data) {
            // 1) cita_stok.kalinlik_mm
            gelenMm = (data as any).cita_stok?.kalinlik_mm ?? null
            // 2) katman_yapisi orta sayısı ("4+16+4" → 16)
            if (gelenMm == null && data.katman_yapisi) {
              const p2 = data.katman_yapisi.split('+')
              if (p2.length >= 3) gelenMm = Number(p2[1]) || null
              else if (p2.length === 2) gelenMm = Number(p2[1]) || null
            }
          }
        }

        if (gelenMm == null) return

        const onceki = mevcutDegerRef.current
        if (onceki == null) {
          setMevcutDeger(gelenMm)
        } else if (gelenMm !== onceki) {
          setYeniDeger(gelenMm)
          setOnayBekliyor(true)
          setFlash(true)
          setTimeout(() => setFlash(false), 600)
          if (sesRef.current) beepAlert()
          channelRef.current?.send({
            type: 'broadcast',
            event: 'cita_onay_durumu',
            payload: { bekliyor: true, eski: onceki, yeni: gelenMm },
          })
        }
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleSesToggle = () => {
    try { new AudioContext() } catch { /* */ }
    setSesAcik(prev => !prev)
  }

  return (
    <div className={`min-h-screen text-white flex flex-col transition-colors duration-200 ${
      flash ? 'bg-purple-950' : 'bg-black'
    }`}>
      {/* Üst bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <button onClick={() => navigate('/istasyonlar')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${
            connected ? 'bg-emerald-900/60 border border-emerald-700 text-emerald-300' : 'bg-red-900/60 border border-red-700 text-red-300'
          }`}>
            {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] text-gray-400">SUNUCU</span>
              <span>{connected ? 'ÇEVRİMİÇİ' : 'ÇEVRİMDIŞI'}</span>
            </div>
          </div>
          <button
            onClick={handleSesToggle}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            {sesAcik ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </div>

      {/* Ses Kapalı uyarısı */}
      {!sesAcik && (
        <div className="absolute top-16 right-6 flex items-start gap-3 bg-amber-950/80 border border-amber-800/50 rounded-xl px-4 py-3 max-w-xs z-10">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-400 font-semibold text-sm">Ses Kapalı</p>
            <p className="text-gray-400 text-xs">Uyarı seslerini duymak için ses ikonuna tıklayarak açın.</p>
          </div>
        </div>
      )}

      {/* Ana alan */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {mevcutDeger == null && !onayBekliyor ? (
          /* Henüz değer yok */
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-gray-900 flex items-center justify-center mx-auto mb-6">
              <span className="text-5xl font-black text-gray-700">—</span>
            </div>
            <p className="text-2xl font-semibold text-gray-600">Değer bekleniyor...</p>
            <p className="text-sm text-gray-700 mt-2">
              Poz Giriş'ten sıra no girildiğinde çıta kalınlığı burada görünecek
            </p>
          </div>
        ) : onayBekliyor && yeniDeger != null ? (
          /* Değer değişikliği — onay bekleniyor */
          <div className="text-center w-full max-w-3xl">
            <h2 className="text-xl md:text-2xl font-bold tracking-[.3em] text-gray-400 mb-12">
              D E Ğ E R &nbsp; D E Ğ İ Ş İ K L İ Ğ İ
            </h2>

            <div className="flex items-center justify-center gap-8 md:gap-16">
              {/* Mevcut */}
              <div className="text-center">
                <p className="text-sm uppercase tracking-widest text-gray-500 mb-4">MEVCUT</p>
                <p className="font-black tabular-nums leading-none text-white"
                  style={{ fontSize: 'clamp(4rem, 12vw, 9rem)' }}>
                  {mevcutDeger}
                </p>
                <p className="text-gray-500 text-xl mt-2">mm</p>
              </div>

              {/* Ok */}
              <ArrowRight size={48} className="text-amber-500 shrink-0" strokeWidth={3} />

              {/* Yeni */}
              <div className="text-center">
                <p className="text-sm uppercase tracking-widest text-gray-500 mb-4">YENİ</p>
                <p className="font-black tabular-nums leading-none text-purple-400"
                  style={{ fontSize: 'clamp(4rem, 12vw, 9rem)' }}>
                  {yeniDeger}
                </p>
                <p className="text-purple-500 text-xl mt-2">mm</p>
              </div>
            </div>

            {/* Onay butonu */}
            <button
              onClick={handleOnay}
              className="mt-16 inline-flex items-center gap-3 px-10 py-5 bg-purple-700 hover:bg-purple-600 rounded-2xl text-white font-bold text-xl transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              <Keyboard size={24} />
              Onaylamak için ENTER tuşuna basın
            </button>
          </div>
        ) : (
          /* Normal gösterim — mevcut değer */
          <div className="text-center">
            <p className="text-sm uppercase tracking-[.3em] text-gray-600 mb-6">ÇİTA KALINLIĞI</p>
            <p className="font-black tabular-nums leading-none text-emerald-300"
              style={{ fontSize: 'clamp(6rem, 20vw, 14rem)' }}>
              {mevcutDeger}
            </p>
            <p className="text-emerald-500/60 text-4xl font-light mt-2 tracking-widest">mm</p>
            <p className="text-gray-700 text-sm mt-8">Değer değişikliği bekleniyor...</p>
          </div>
        )}
      </div>

      {/* Alt bar */}
      <div className="border-t border-gray-800 px-6 py-2 flex items-center justify-between text-xs text-gray-600 shrink-0">
        <span>Gösterge Ekranı — Macun Robotu</span>
        <span className="font-mono tabular-nums">{saat.toLocaleTimeString('tr-TR')}</span>
      </div>
    </div>
  )
}
