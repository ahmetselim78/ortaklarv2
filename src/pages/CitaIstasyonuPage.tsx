import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Wifi, WifiOff, Ruler } from 'lucide-react'

interface CamBilgisi {
  cam_kodu: string
  ara_bosluk_mm: number | null
  cam_tipi: string
  genislik_mm: number
  yukseklik_mm: number
  zaman: number
}

export default function CitaIstasyonuPage() {
  const [sonCam, setSonCam] = useState<CamBilgisi | null>(null)
  const [connected, setConnected] = useState(false)
  const [saat, setSaat] = useState(new Date())
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setSaat(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('yikama-etiket')
      .on('broadcast', { event: 'yeni_cam' }, ({ payload }) => {
        setSonCam(payload as CamBilgisi)
        setFlash(true)
        setTimeout(() => setFlash(false), 600)

        // Ses bildirim
        try {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.type = 'sine'
          osc.frequency.value = 660
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
          osc.start()
          osc.stop(ctx.currentTime + 0.15)
        } catch { /* */ }
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [])

  const bosluk = sonCam?.ara_bosluk_mm

  return (
    <div className={`min-h-screen text-white flex flex-col transition-colors duration-200 ${flash ? 'bg-amber-950' : 'bg-gray-950'}`}>
      {/* Üst Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <Ruler size={20} className="text-amber-400" />
          <span className="font-bold tracking-widest text-sm text-white">ÇITA İSTASYONU</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="font-mono text-gray-400 text-sm tabular-nums">
            {saat.toLocaleTimeString('tr-TR')}
          </span>
          <div className="flex items-center gap-1.5 text-sm">
            {connected
              ? <><Wifi size={14} className="text-green-400" /><span className="text-green-400">Dinleniyor</span></>
              : <><WifiOff size={14} className="text-red-400" /><span className="text-red-400">Bağlantı yok</span></>
            }
          </div>
        </div>
      </div>

      {/* Ana Alan */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {!sonCam ? (
          <div className="text-center">
            <Ruler size={80} className="mx-auto mb-6 text-gray-800" />
            <p className="text-2xl font-semibold text-gray-600">Tarama bekleniyor...</p>
            <p className="text-sm text-gray-700 mt-2">
              Yıkama istasyonundan cam okutulduğunda çıta kalınlığı burada görünür
            </p>
          </div>
        ) : (
          <div className="text-center space-y-8">
            {/* Çıta kalınlığı — DEV FONT */}
            <div>
              <div className="text-sm text-amber-500 uppercase tracking-[.3em] mb-4">Çıta Kalınlığı</div>
              <div className={`font-black tabular-nums leading-none ${bosluk ? 'text-amber-300' : 'text-gray-600'}`}
                style={{ fontSize: bosluk ? 'clamp(8rem, 25vw, 18rem)' : '6rem' }}>
                {bosluk ?? '—'}
              </div>
              {bosluk && (
                <div className="text-amber-500/60 text-4xl font-light mt-2 tracking-widest">mm</div>
              )}
            </div>

            {/* Alt bilgi */}
            <div className="flex items-center justify-center gap-10 text-gray-500 text-sm">
              <div className="text-center">
                <div className="text-xs text-gray-700 uppercase mb-1">Cam Kodu</div>
                <div className="font-mono text-amber-300/80 text-lg">{sonCam.cam_kodu}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-700 uppercase mb-1">Boyut</div>
                <div className="text-gray-400">{sonCam.genislik_mm} × {sonCam.yukseklik_mm} mm</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-700 uppercase mb-1">Cam Tipi</div>
                <div className="text-gray-400">{sonCam.cam_tipi || '—'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
