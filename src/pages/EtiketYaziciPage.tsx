import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Printer, Wifi, WifiOff, Tag } from 'lucide-react'

interface CamBilgisi {
  cam_kodu: string
  musteri: string
  siparis_no: string
  cam_tipi: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  ara_bosluk_mm: number | null
  zaman: number
}

function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 1046 // C6
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
  } catch { /* ses çalınamıyorsa sessiz devam */ }
}

export default function EtiketYaziciPage() {
  const [sonCam, setSonCam] = useState<CamBilgisi | null>(null)
  const [gecmis, setGecmis] = useState<CamBilgisi[]>([])
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
        const cam = payload as CamBilgisi
        setSonCam(cam)
        setGecmis(prev => [cam, ...prev].slice(0, 10))
        beep()
        setFlash(true)
        setTimeout(() => setFlash(false), 700)
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div
      className={`min-h-screen text-white flex flex-col transition-colors duration-200 ${flash ? 'bg-purple-950' : 'bg-gray-950'}`}
    >
      {/* Üst Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <Tag size={20} className="text-purple-400" />
          <span className="font-bold tracking-widest text-sm text-white">ETİKET YAZICI</span>
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
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-10">
        {!sonCam ? (
          <div className="text-center">
            <Tag size={72} className="mx-auto mb-5 text-gray-800" />
            <p className="text-2xl font-semibold text-gray-600">Tarama bekleniyor...</p>
            <p className="text-sm text-gray-700 mt-2">
              Yıkama istasyonundan cam okutulduğunda etiket bilgileri burada görünür
            </p>
          </div>
        ) : (
          <div className="w-full max-w-xl">
            {/* Etiket Kartı */}
            <div className="bg-gray-900 border-2 border-purple-700 rounded-3xl p-8 space-y-6">
              <div className="text-center">
                <div className="text-xs text-purple-500 uppercase tracking-widest mb-3">Etiket Hazır</div>
                <div className="font-mono text-6xl font-black tracking-widest text-purple-300">
                  {sonCam.cam_kodu}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="bg-gray-800/60 rounded-xl p-4">
                  <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Müşteri</div>
                  <div className="text-white font-bold text-lg leading-tight">{sonCam.musteri || '—'}</div>
                  <div className="text-gray-500 text-sm mt-0.5">{sonCam.siparis_no}</div>
                </div>
                <div className="bg-gray-800/60 rounded-xl p-4">
                  <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Boyut</div>
                  <div className="text-white font-bold text-2xl">
                    {sonCam.genislik_mm} × {sonCam.yukseklik_mm}
                    <span className="text-gray-500 text-sm ml-1">mm</span>
                  </div>
                </div>
                <div className="bg-gray-800/60 rounded-xl p-4">
                  <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Cam Tipi</div>
                  <div className="text-white font-semibold">{sonCam.cam_tipi || '—'}</div>
                </div>
                <div className="bg-gray-800/60 rounded-xl p-4">
                  <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Adet</div>
                  <div className="text-white font-bold text-3xl">{sonCam.adet}</div>
                </div>
                {sonCam.ara_bosluk_mm && (
                  <div className="col-span-2 bg-purple-900/30 border border-purple-800 rounded-xl p-4 text-center">
                    <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">Çıta Kalınlığı</div>
                    <div className="text-purple-300 font-black text-4xl">{sonCam.ara_bosluk_mm} <span className="text-purple-500 text-lg">mm</span></div>
                  </div>
                )}
              </div>

              <div className="flex justify-center pt-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors text-lg"
                >
                  <Printer size={20} />
                  Yazdır
                </button>
              </div>
            </div>

            <p className="text-center text-xs text-gray-700 mt-3 tabular-nums">
              {new Date(sonCam.zaman).toLocaleTimeString('tr-TR')} tarihinde tarandı
            </p>
          </div>
        )}
      </div>

      {/* Alt: Geçmiş */}
      {gecmis.length > 0 && (
        <div className="border-t border-gray-800 px-6 py-4 shrink-0">
          <p className="text-xs text-gray-700 uppercase tracking-widest mb-3">Son Etiketler</p>
          <div className="flex gap-2 flex-wrap">
            {gecmis.map((c, i) => (
              <span
                key={i}
                className={`px-3 py-1 rounded-lg font-mono text-sm cursor-pointer transition-colors
                  ${i === 0 ? 'bg-purple-900 text-purple-300' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}
                onClick={() => setSonCam(c)}
              >
                {c.cam_kodu}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
