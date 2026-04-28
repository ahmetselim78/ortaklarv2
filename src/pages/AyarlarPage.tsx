import { useState, useCallback } from 'react'
import { Printer, ChevronRight, ArrowLeft, Truck } from 'lucide-react'
import { useAyarlar } from '@/hooks/useAyarlar'
import EtiketAyarlariPanel, { EtiketOnizleme, ORNEK_VERI } from '@/components/ayarlar/EtiketAyarlariPanel'
import AraclarPanel from '@/components/ayarlar/AraclarPanel'
import type { EtiketAyarlari } from '@/types/ayarlar'

/* ── Kategori tanımları ──────────────────────────────────────── */

type AyarKategori = 'etiket' | 'araclar'

interface Kategori {
  id: AyarKategori
  label: string
  aciklama: string
  icon: React.ElementType
  renk: string       // bg + text ring rengi (Tailwind)
  ikonRenk: string
}

const kategoriler: Kategori[] = [
  {
    id: 'etiket',
    label: 'Etiket Basım',
    aciklama: 'Datamax M-Serisi yazıcı bağlantısı, etiket boyutu ve DPL şablonu ayarları.',
    icon: Printer,
    renk: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
    ikonRenk: 'text-blue-600 bg-blue-100',
  },
  {
    id: 'araclar',
    label: 'Araçlar',
    aciklama: 'Sevkiyat planlamada kullanılan şirket araçlarını ekle, düzenle veya pasife al.',
    icon: Truck,
    renk: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
    ikonRenk: 'text-orange-600 bg-orange-100',
  },
]

/* ── Ana Sayfa (Landing) ─────────────────────────────────────────────────── */

function AyarlarAnaSayfa({ onSec }: { onSec: (k: AyarKategori) => void }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Ayarlar</h1>
      <p className="text-sm text-gray-500 mb-8">Uygulama ayarlarını buradan yönetebilirsiniz.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kategoriler.map(({ id, label, aciklama, icon: Icon, renk, ikonRenk }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSec(id)}
            className={`flex items-start gap-4 p-5 rounded-xl border text-left transition-all group ${renk}`}
          >
            <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${ikonRenk}`}>
              <Icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm leading-tight">{label}</div>
              <div className="text-xs text-gray-500 mt-1 leading-snug">{aciklama}</div>
            </div>
            <ChevronRight size={16} className="shrink-0 text-gray-400 mt-1 group-hover:text-gray-600 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Sayfa ──────────────────────────────────────────────────────────────── */

export default function AyarlarPage() {
  const { etiketAyarlari, yukleniyor, kaydediyor, hata, etiketAyarlariGuncelle } = useAyarlar()
  const [aktifKategori, setAktifKategori] = useState<AyarKategori | null>(null)
  const [liveForm, setLiveForm] = useState<EtiketAyarlari | null>(null)

  const handleFormChange = useCallback((f: EtiketAyarlari) => setLiveForm(f), [])

  if (yukleniyor) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Yükleniyor…
      </div>
    )
  }

  /* Landing */
  if (!aktifKategori) {
    return <AyarlarAnaSayfa onSec={setAktifKategori} />
  }

  /* Etiket Basım ayarları — 2 kolon */
  if (aktifKategori === 'etiket') return (
    <div className="flex flex-col h-full">
      {/* Başlık barı */}
      <div className="flex items-center gap-3 px-8 py-4 border-b border-gray-200 bg-white shrink-0">
        <button
          type="button"
          onClick={() => setAktifKategori(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Ayarlar
        </button>
        <span className="text-gray-300">/</span>
        <div className="flex items-center gap-2">
          <Printer size={16} className="text-blue-600" />
          <span className="text-sm font-semibold text-gray-900">Etiket Basım</span>
        </div>
      </div>

      {/* 2 kolon: sol form, sağ sticky önizleme */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sol — form (scroll eder) */}
        <div className="flex-1 overflow-auto p-8">
          <p className="text-sm text-gray-500 mb-6">
            Poz girişinde tarandığında otomatik olarak basılacak etiketin format ve yazıcı ayarları.
            Yazıcı markası: <strong className="text-gray-700">Datamax M-Serisi</strong> (DPL protokolü).
          </p>
          <EtiketAyarlariPanel
            ayarlar={etiketAyarlari}
            kaydediyor={kaydediyor}
            hata={hata}
            onKaydet={etiketAyarlariGuncelle}
            onFormChange={handleFormChange}
          />
        </div>

        {/* Sağ — sticky önizleme */}
        <div className="w-80 shrink-0 border-l border-gray-200 bg-gray-50 flex flex-col">
          <div className="sticky top-0 p-6 flex flex-col items-center gap-4">
            <EtiketOnizleme
              ayarlar={liveForm ?? etiketAyarlari}
              veri={ORNEK_VERI}
            />
          </div>
        </div>
      </div>
    </div>
  )

  /* Araçlar ayarları */
  if (aktifKategori === 'araclar') return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-8 py-4 border-b border-gray-200 bg-white shrink-0">
        <button
          type="button"
          onClick={() => setAktifKategori(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Ayarlar
        </button>
        <span className="text-gray-300">/</span>
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-orange-600" />
          <span className="text-sm font-semibold text-gray-900">Araçlar</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-8">
        <AraclarPanel />
      </div>
    </div>
  )

  return null
}

