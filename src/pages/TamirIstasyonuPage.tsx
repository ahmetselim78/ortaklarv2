import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft, Wrench, CheckCircle2, AlertTriangle,
  Clock, Trash2, RefreshCw, XCircle,
} from 'lucide-react'
import type { TamirDurum, TamirKayit } from '@/types/tamir'
import {
  DURUM_ETIKETLERI, SORUN_ETIKETLERI, KAYNAK_ETIKETLERI,
} from '@/types/tamir'

/* ========== Yardımcı renkler ========== */

function durumRenk(d: TamirDurum) {
  switch (d) {
    case 'bekliyor':       return 'bg-amber-900/30 border-amber-700 text-amber-300'
    case 'tamir_ediliyor': return 'bg-blue-900/30 border-blue-700 text-blue-300'
    case 'tamamlandi':     return 'bg-emerald-900/30 border-emerald-700 text-emerald-300'
    case 'hurda':          return 'bg-red-900/30 border-red-700 text-red-300'
  }
}

function sorunRenk(s: string) {
  switch (s) {
    case 'kirik':       return 'bg-red-900/50 text-red-300 border-red-800'
    case 'cizik':       return 'bg-orange-900/50 text-orange-300 border-orange-800'
    case 'olcum_hatasi': return 'bg-purple-900/50 text-purple-300 border-purple-800'
    default:             return 'bg-gray-800 text-gray-300 border-gray-700'
  }
}

function kaynakRenk(k: string) {
  switch (k) {
    case 'poz_giris': return 'bg-blue-900/40 text-blue-300 border-blue-800'
    case 'kumanda':   return 'bg-violet-900/40 text-violet-300 border-violet-800'
    default:          return 'bg-gray-800 text-gray-400 border-gray-700'
  }
}

const TABS: { durum: TamirDurum | 'hepsi'; label: string }[] = [
  { durum: 'hepsi',        label: 'Tümü' },
  { durum: 'bekliyor',     label: 'Bekliyor' },
  { durum: 'tamir_ediliyor', label: 'Tamir Ediliyor' },
  { durum: 'tamamlandi',   label: 'Tamamlandı' },
  { durum: 'hurda',        label: 'Hurda' },
]

/* ========== Durum geçiş butonları ========== */

const GECIS_BUTONLARI: Record<TamirDurum, { durum: TamirDurum; label: string; renk: string }[]> = {
  bekliyor: [
    { durum: 'tamir_ediliyor', label: 'Tamire Al', renk: 'bg-blue-700 hover:bg-blue-600 text-white' },
    { durum: 'hurda',          label: 'Hurda',     renk: 'bg-red-800 hover:bg-red-700 text-white' },
  ],
  tamir_ediliyor: [
    { durum: 'tamamlandi',     label: 'Tamamlandı', renk: 'bg-emerald-700 hover:bg-emerald-600 text-white' },
    { durum: 'hurda',          label: 'Hurda',      renk: 'bg-red-800 hover:bg-red-700 text-white' },
  ],
  tamamlandi: [],
  hurda: [],
}

/* ========== Bileşen ========== */

export default function TamirIstasyonuPage() {
  const navigate = useNavigate()
  const [saat, setSaat] = useState(new Date())
  const [kayitlar, setKayitlar] = useState<TamirKayit[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [aktifTab, setAktifTab] = useState<TamirDurum | 'hepsi'>('bekliyor')
  const [guncellenenId, setGuncellenenId] = useState<string | null>(null)

  // Saat
  useEffect(() => {
    const t = setInterval(() => setSaat(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Veri yükleme
  const kayitlariGetir = useCallback(async () => {
    setYukleniyor(true)
    const { data } = await supabase
      .from('tamir_kayitlari')
      .select('*')
      .order('created_at', { ascending: false })
    setKayitlar((data as TamirKayit[]) ?? [])
    setYukleniyor(false)
  }, [])

  useEffect(() => { kayitlariGetir() }, [kayitlariGetir])

  // Realtime: postgres_changes
  useEffect(() => {
    const channel = supabase
      .channel('tamir-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tamir_kayitlari' },
        () => { kayitlariGetir() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [kayitlariGetir])

  const durumGuncelle = async (id: string, yeniDurum: TamirDurum) => {
    setGuncellenenId(id)
    const patch: Record<string, unknown> = { durum: yeniDurum }
    if (yeniDurum === 'tamamlandi' || yeniDurum === 'hurda') {
      patch.tamamlanma_tarihi = new Date().toISOString()
    }
    await supabase.from('tamir_kayitlari').update(patch).eq('id', id)
    // optimistic update
    setKayitlar(prev => prev.map(k =>
      k.id === id
        ? { ...k, durum: yeniDurum, tamamlanma_tarihi: patch.tamamlanma_tarihi as string ?? k.tamamlanma_tarihi }
        : k,
    ))
    setGuncellenenId(null)
  }

  const kayitSil = async (id: string) => {
    await supabase.from('tamir_kayitlari').delete().eq('id', id)
    setKayitlar(prev => prev.filter(k => k.id !== id))
  }

  const filtreliKayitlar = aktifTab === 'hepsi'
    ? kayitlar
    : kayitlar.filter(k => k.durum === aktifTab)

  // Sayaçlar
  const sayac = (d: TamirDurum) => kayitlar.filter(k => k.durum === d).length

  /* ========== RENDER ========== */

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* ===== ÜST BAR ===== */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <button
          onClick={() => navigate('/istasyonlar')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Geri</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-900/60 border border-red-700 flex items-center justify-center">
            <Wrench size={16} className="text-red-400" />
          </div>
          <span className="font-bold tracking-widest text-sm">TAMİR İSTASYONU</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={kayitlariGetir}
            className="flex items-center gap-1.5 text-gray-500 hover:text-white text-xs transition-colors"
          >
            <RefreshCw size={13} />
            Yenile
          </button>
          <span className="font-mono text-gray-500 text-sm tabular-nums">
            {saat.toLocaleTimeString('tr-TR')}
          </span>
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-800 shrink-0 overflow-x-auto">
        {TABS.map((tab) => {
          const count = tab.durum === 'hepsi' ? kayitlar.length : sayac(tab.durum as TamirDurum)
          const aktif = aktifTab === tab.durum
          return (
            <button
              key={tab.durum}
              onClick={() => setAktifTab(tab.durum)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                aktif
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  aktif ? 'bg-gray-600 text-gray-200' : 'bg-gray-800 text-gray-400'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ===== KAYIT LİSTESİ ===== */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {yukleniyor ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3 text-gray-500">
              <RefreshCw size={20} className="animate-spin" />
              <span>Yükleniyor...</span>
            </div>
          </div>
        ) : filtreliKayitlar.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-900 flex items-center justify-center">
              <Wrench size={32} className="text-gray-700" />
            </div>
            <p className="text-gray-500 text-lg font-medium">
              {aktifTab === 'hepsi' ? 'Henüz tamir kaydı yok.' : `${DURUM_ETIKETLERI[aktifTab as TamirDurum]} kaydı yok.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtreliKayitlar.map((k) => (
              <TamirKarti
                key={k.id}
                kayit={k}
                guncelleniyor={guncellenenId === k.id}
                onDurumGuncelle={durumGuncelle}
                onSil={kayitSil}
              />
            ))}
          </div>
        )}
      </div>

      {/* ===== ALT BAR ===== */}
      <div className="border-t border-gray-800 px-6 py-2 flex items-center justify-between text-xs text-gray-600 shrink-0">
        <span>
          {sayac('bekliyor')} bekliyor · {sayac('tamir_ediliyor')} tamir ediliyor · {sayac('tamamlandi')} tamamlandı · {sayac('hurda')} hurda
        </span>
        <span className="font-mono tabular-nums">{saat.toLocaleTimeString('tr-TR')}</span>
      </div>

    </div>
  )
}

/* ========== Tamir Kartı Alt Bileşeni ========== */

interface TamirKartiProps {
  kayit: TamirKayit
  guncelleniyor: boolean
  onDurumGuncelle: (id: string, durum: TamirDurum) => void
  onSil: (id: string) => void
}

function TamirKarti({ kayit: k, guncelleniyor, onDurumGuncelle, onSil }: TamirKartiProps) {
  const [silOnay, setSilOnay] = useState(false)

  const gecisler = GECIS_BUTONLARI[k.durum]

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition-colors">

      {/* Üst şerit: durum + kaynak */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${durumRenk(k.durum)}`}>
          {k.durum === 'bekliyor' && <Clock size={10} className="inline mr-1" />}
          {k.durum === 'tamir_ediliyor' && <Wrench size={10} className="inline mr-1" />}
          {k.durum === 'tamamlandi' && <CheckCircle2 size={10} className="inline mr-1" />}
          {k.durum === 'hurda' && <XCircle size={10} className="inline mr-1" />}
          {DURUM_ETIKETLERI[k.durum]}
        </span>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${kaynakRenk(k.kaynak_istasyon)}`}>
          {KAYNAK_ETIKETLERI[k.kaynak_istasyon]}
        </span>
      </div>

      {/* İçerik */}
      <div className="px-5 py-4">

        {/* Cam kodu + sorun */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-mono font-black text-white text-2xl leading-tight">{k.cam_kodu}</p>
            <p className="text-gray-400 text-sm mt-0.5">{k.genislik_mm} × {k.yukseklik_mm} mm</p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border shrink-0 ml-2 ${sorunRenk(k.sorun_tipi)}`}>
            {SORUN_ETIKETLERI[k.sorun_tipi as keyof typeof SORUN_ETIKETLERI]}
          </span>
        </div>

        {/* Detay grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">

          {/* Müşteri */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-0.5">MÜŞTERİ</p>
            <p className="text-gray-200 font-medium truncate">{k.musteri || '—'}</p>
          </div>

          {/* Alt Müşteri */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-0.5">ALT MÜŞTERİ</p>
            <p className="text-gray-200 font-medium truncate">{k.nihai_musteri || '—'}</p>
          </div>

          {/* Sipariş No */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-0.5">SİPARİŞ NO</p>
            <p className="font-mono text-gray-300 text-xs">{k.siparis_no || '—'}</p>
          </div>

          {/* Batch / Panel */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-0.5">BATCH</p>
            <p className="font-mono text-gray-300 text-xs">{k.batch_no || '—'}</p>
          </div>

          {/* Poz No */}
          {k.sira_no != null && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-0.5">POZ NO</p>
              <p className="font-mono font-bold text-amber-400">#{k.sira_no}</p>
            </div>
          )}

          {/* Ürün */}
          {k.stok_ad && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-0.5">ÜRÜN</p>
              <p className="text-gray-300 text-xs truncate">{k.stok_ad}</p>
            </div>
          )}
        </div>

        {/* Açıklama */}
        {k.aciklama && (
          <div className="mt-3 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">AÇIKLAMA</p>
            <p className="text-gray-300 text-sm">{k.aciklama}</p>
          </div>
        )}

        {/* Tarihler */}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-600 tabular-nums">
          <span>Giriş: {new Date(k.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          {k.tamamlanma_tarihi && (
            <span>Çıkış: {new Date(k.tamamlanma_tarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>
      </div>

      {/* Aksiyon butonları */}
      {(gecisler.length > 0 || k.durum === 'tamamlandi' || k.durum === 'hurda') && (
        <div className="px-5 pb-4 flex items-center gap-2">
          {gecisler.map((g) => (
            <button
              key={g.durum}
              onClick={() => onDurumGuncelle(k.id, g.durum)}
              disabled={guncelleniyor}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${g.renk}`}
            >
              {guncelleniyor ? '...' : g.label}
            </button>
          ))}

          {/* Silme — sadece tamamlandı veya hurda için */}
          {(k.durum === 'tamamlandi' || k.durum === 'hurda') && (
            silOnay ? (
              <div className="flex gap-1.5">
                <button
                  onClick={() => onSil(k.id)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-red-800 hover:bg-red-700 text-white transition-colors"
                >
                  Evet, sil
                </button>
                <button
                  onClick={() => setSilOnay(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                >
                  Vazgeç
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSilOnay(true)}
                className="p-2 rounded-xl text-gray-600 hover:text-red-400 hover:bg-gray-800 transition-colors"
                title="Kaydı sil"
              >
                <Trash2 size={15} />
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
