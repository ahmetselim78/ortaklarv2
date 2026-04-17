import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, LayoutGrid, Monitor, Info, Keyboard } from 'lucide-react'

const stations = [
  {
    key: 1,
    to: '/istasyonlar/poz-giris',
    label: 'Poz Giriş',
    sub: 'Planlama / Ofis',
    desc: 'Üretim sırasındaki poz numarasını girmek için.',
    icon: ClipboardList,
  },
  {
    key: 2,
    to: '/istasyonlar/kumanda',
    label: 'Kumanda Paneli',
    sub: 'Çıta İstasyonu',
    desc: 'Gelen pozu gör, ölçüyü seç ve gönder.',
    icon: LayoutGrid,
  },
  {
    key: 3,
    to: '/istasyonlar/gosterge',
    label: 'Gösterge Ekranı',
    sub: 'Macun Robotu',
    desc: 'Sadece ölçü bilgisini dev ekranda gösterir.',
    icon: Monitor,
  },
]

export default function UretimIstasyonlariPage() {
  const navigate = useNavigate()

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const s = stations.find((s) => String(s.key) === e.key)
      if (s) navigate(s.to)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [navigate])

  return (
    <div className="min-h-full bg-gray-950 flex flex-col items-center justify-center px-6 py-16">
      {/* Başlık */}
      <div className="text-center mb-14">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
          ISICAM <span className="text-amber-500">PROV2</span> LINK
        </h1>
        <p className="text-gray-500 mt-3 text-base">Üretim hattı senkronizasyon sistemi.</p>
      </div>

      {/* Kartlar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
        {stations.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.key}
              onClick={() => navigate(s.to)}
              className="group relative bg-gray-900 border border-gray-700 hover:border-amber-600 rounded-2xl p-8 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {/* Badge */}
              <span className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-gray-800 text-gray-400 text-xs font-bold flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                {s.key}
              </span>

              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center group-hover:bg-gray-700 transition-colors">
                  <Icon size={32} className="text-gray-400 group-hover:text-amber-400 transition-colors" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">{s.label}</h3>
                  <p className="text-gray-500 text-sm mt-0.5">{s.sub}</p>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Klavye Kısayolları */}
      <div className="mt-12 max-w-4xl w-full">
        <div className="flex items-start gap-3 bg-amber-950/30 border border-amber-900/50 rounded-xl px-5 py-4">
          <Info size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-500 font-semibold text-sm flex items-center gap-1.5">
              <Keyboard size={14} />
              Klavye Kısayolları
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Hızlı seçim için klavyenizdeki{' '}
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-xs font-mono text-white">1</kbd>
              {' '},{' '}
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-xs font-mono text-white">2</kbd>
              {' '}veya{' '}
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-xs font-mono text-white">3</kbd>
              {' '}tuşlarını kullanabilirsiniz.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
