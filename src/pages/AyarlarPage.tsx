import { useState, useEffect } from 'react'
import { Printer, ChevronRight, ArrowLeft, Truck, Target, MessageSquare, Send, Factory } from 'lucide-react'
import { useAyarlar } from '@/hooks/useAyarlar'
import { supabase } from '@/lib/supabase'

const GORUNUM_ANAHTAR = 'admin_ayarlar_gorunum'

const VARSAYILAN_GORUNUM = {
  etiket: true,
  araclar: true,
  hedef: true,
  presets: true,
  telegram: true,
  istasyon: true,
}

function useGorunumAyarlari() {
  const [gorunum, setGorunum] = useState<Record<string, boolean> | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('ayarlar')
          .select('deger')
          .eq('anahtar', GORUNUM_ANAHTAR)
          .maybeSingle()
        if (data?.deger) {
          setGorunum({ ...VARSAYILAN_GORUNUM, ...(data.deger as Record<string, boolean>) })
        } else {
          setGorunum(VARSAYILAN_GORUNUM)
        }
      } catch {
        setGorunum(VARSAYILAN_GORUNUM)
      } finally {
        setYukleniyor(false)
      }
    })()
  }, [])

  return { gorunum, yukleniyor }
}
import EtiketAyarlariPanel from '@/components/ayarlar/EtiketAyarlariPanel'
import AraclarPanel from '@/components/ayarlar/AraclarPanel'
import HedefVardiyaPanel from '@/components/ayarlar/HedefVardiyaPanel'
import AksiyonNotuPresetsPanel from '@/components/ayarlar/AksiyonNotuPresetsPanel'
import TelegramAyarlariPanel from '@/components/ayarlar/TelegramAyarlariPanel'
import IstasyonYonetimiPanel from '@/components/ayarlar/IstasyonYonetimiPanel'

/* ── Kategori tanımları ──────────────────────────────────────── */

type AyarKategori = 'etiket' | 'araclar' | 'hedef' | 'presets' | 'telegram' | 'istasyon'

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
  {
    id: 'hedef',
    label: 'Hedef & Vardiya',
    aciklama: 'Vardiya şablonları oluştur, saatlik üretim hedeflerini belirle ve bugüne uygula.',
    icon: Target,
    renk: 'bg-rose-50 hover:bg-rose-100 border-rose-200',
    ikonRenk: 'text-rose-600 bg-rose-100',
  },
  {
    id: 'presets',
    label: 'Aksiyon Notu Hazır Cevaplar',
    aciklama: 'Saatlik takip panosunda not eklerken hızlıca seçilebilecek hazır cevapları ve kısayol tuşlarını yönet.',
    icon: MessageSquare,
    renk: 'bg-sky-50 hover:bg-sky-100 border-sky-200',
    ikonRenk: 'text-sky-600 bg-sky-100',
  },
  {
    id: 'telegram',
    label: 'Telegram Raporu',
    aciklama: 'Bot token ve chat ID ayarla; günlük üretim raporunun hangi saatlerde otomatik gönderileceğini belirle.',
    icon: Send,
    renk: 'bg-teal-50 hover:bg-teal-100 border-teal-200',
    ikonRenk: 'text-teal-600 bg-teal-100',
  },
  {
    id: 'istasyon',
    label: 'Üretim İstasyonları',
    aciklama: 'Operatör günlük rapor formunda görünecek istasyonları ekle, sırala veya pasife al.',
    icon: Factory,
    renk: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
    ikonRenk: 'text-amber-600 bg-amber-100',
  },
]

/* ── Ana Sayfa (Landing) ─────────────────────────────────────────────────── */

function AyarlarAnaSayfa({ onSec }: { onSec: (k: AyarKategori) => void }) {
  const { gorunum, yukleniyor } = useGorunumAyarlari()

  if (yukleniyor || !gorunum) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Yükleniyor…
      </div>
    )
  }

  const gorünürKategoriler = kategoriler.filter(k => gorunum[k.id] !== false)

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Ayarlar</h1>
      <p className="text-sm text-gray-500 mb-8">Uygulama ayarlarını buradan yönetebilirsiniz.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {gorünürKategoriler.map(({ id, label, aciklama, icon: Icon, renk, ikonRenk }) => (
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

      <div className="flex flex-1 overflow-hidden">
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
          />
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

  /* Hedef & Vardiya */
  if (aktifKategori === 'hedef') return (
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
          <Target size={16} className="text-rose-600" />
          <span className="text-sm font-semibold text-gray-900">Hedef &amp; Vardiya</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-8">
        <HedefVardiyaPanel />
      </div>
    </div>
  )

  /* Aksiyon Notu Hazır Cevaplar */
  if (aktifKategori === 'presets') return (
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
          <MessageSquare size={16} className="text-sky-600" />
          <span className="text-sm font-semibold text-gray-900">Aksiyon Notu Hazır Cevaplar</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-8">
        <AksiyonNotuPresetsPanel />
      </div>
    </div>
  )

  /* Telegram Raporu */
  if (aktifKategori === 'telegram') return (
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
          <Send size={16} className="text-teal-600" />
          <span className="text-sm font-semibold text-gray-900">Telegram Raporu</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-8">
        <TelegramAyarlariPanel />
      </div>
    </div>
  )

  /* Üretim İstasyonları */
  if (aktifKategori === 'istasyon') return (
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
          <Factory size={16} className="text-amber-600" />
          <span className="text-sm font-semibold text-gray-900">Üretim İstasyonları</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-8">
        <IstasyonYonetimiPanel />
      </div>
    </div>
  )

  return null
}

