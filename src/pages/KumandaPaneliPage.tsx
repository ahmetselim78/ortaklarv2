import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react'

/* ========== Tipler ========== */

interface CamKarti {
  cam_kodu: string
  musteri: string
  siparis_no: string
  cam_tipi: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  ara_bosluk_mm: number | null
  zaman: number
  etiket_durumu: 'basildi'
}

interface BatchCamKumanda {
  cam_kodu: string
  musteri: string
  uretim_durumu: string
  genislik_mm: number
  yukseklik_mm: number
}

/* ========== Bileşen ========== */

export default function KumandaPaneliPage() {
  const navigate = useNavigate()
  const [saat, setSaat] = useState(new Date())
  const [connected, setConnected] = useState(false)
  const [kartlar, setKartlar] = useState<CamKarti[]>([])
  const [flash, setFlash] = useState(false)

  // Batch & müşteri listesi
  const [batchNo, setBatchNo] = useState<string | null>(null)
  const [batchCamlari, setBatchCamlari] = useState<BatchCamKumanda[]>([])
  const [aktifMusteri, setAktifMusteri] = useState<string | null>(null)

  // Saat
  useEffect(() => {
    const t = setInterval(() => setSaat(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Batch camlarını Supabase'den yükle
  const batchYukle = useCallback(async (batchId: string, batchNoStr: string) => {
    const { data } = await supabase
      .from('uretim_emri_detaylari')
      .select(`
        siparis_detaylari (
          cam_kodu, uretim_durumu, genislik_mm, yukseklik_mm,
          siparisler ( cari ( ad ) )
        )
      `)
      .eq('uretim_emri_id', batchId)

    const camlar: BatchCamKumanda[] = (data ?? []).map((d: any) => ({
      cam_kodu: d.siparis_detaylari.cam_kodu,
      musteri: d.siparis_detaylari.siparisler?.cari?.ad ?? '',
      uretim_durumu: d.siparis_detaylari.uretim_durumu,
      genislik_mm: d.siparis_detaylari.genislik_mm,
      yukseklik_mm: d.siparis_detaylari.yukseklik_mm,
    }))
    setBatchNo(batchNoStr)
    setBatchCamlari(camlar)
  }, [])

  // On mount: aktif (yikamada) batch varsa yükle
  useEffect(() => {
    async function loadActiveBatch() {
      const { data } = await supabase
        .from('uretim_emirleri')
        .select('id, batch_no')
        .eq('durum', 'yikamada')
        .order('olusturulma_tarihi', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        await batchYukle(data.id, data.batch_no)
      }
    }
    loadActiveBatch()
  }, [batchYukle])

  // Müşteri listesi: PozGiriş ile aynı format
  const musteriListesi = useMemo(() => {
    const map = new Map<string, { toplam: number; tamamlandi: number }>()
    for (const c of batchCamlari) {
      const e = map.get(c.musteri) ?? { toplam: 0, tamamlandi: 0 }
      e.toplam++
      if (c.uretim_durumu === 'yikandi') e.tamamlandi++
      map.set(c.musteri, e)
    }
    return Array.from(map.entries()).map(([musteri, d]) => ({ musteri, ...d }))
  }, [batchCamlari])

  const aktifMusteriCamlari = useMemo(
    () => aktifMusteri ? batchCamlari.filter(c => c.musteri === aktifMusteri) : [],
    [aktifMusteri, batchCamlari]
  )

  useEffect(() => {
    const channel = supabase
      .channel('uretim-istasyonlar')
      .on('broadcast', { event: 'batch_secildi' }, ({ payload }) => {
        batchYukle(payload.batch_id, payload.batch_no)
        setKartlar([])
      })
      .on('broadcast', { event: 'yeni_cam' }, ({ payload }) => {
        const yeniKart: CamKarti = {
          ...(payload as Omit<CamKarti, 'etiket_durumu'>),
          etiket_durumu: 'basildi',
        }
        setKartlar(prev => [yeniKart, ...prev].slice(0, 10))
        setFlash(true)
        setTimeout(() => setFlash(false), 600)
        // Sol panelde sayıları güncelle + aktif müşteriyi seç
        setBatchCamlari(prev => prev.map(c =>
          c.cam_kodu === payload.cam_kodu
            ? { ...c, uretim_durumu: 'yikandi' }
            : c
        ))
        if (payload.musteri) setAktifMusteri(payload.musteri)
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [batchYukle])

  return (
    <div className={`h-screen text-white flex flex-col transition-colors duration-300 ${flash ? 'bg-gray-900' : 'bg-black'}`}>
      {/* Üst bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <button onClick={() => navigate('/istasyonlar')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          {batchNo && (
            <span className="font-mono font-bold text-sm text-blue-400">{batchNo}</span>
          )}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${
            connected ? 'bg-emerald-900/60 border border-emerald-700 text-emerald-300' : 'bg-red-900/60 border border-red-700 text-red-300'
          }`}>
            {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] text-gray-400">SUNUCU</span>
              <span>{connected ? 'ÇEVRİMİÇİ' : 'ÇEVRİMDIŞI'}</span>
            </div>
          </div>
        </div>
        <span className="font-mono text-gray-500 text-sm tabular-nums">
          {saat.toLocaleTimeString('tr-TR')}
        </span>
      </div>

      {/* Ana alan: sol müşteri + orta kartlar + sağ cam listesi */}
      <div className="flex-1 flex overflow-hidden">

        {/* ===== SOL: Müşteri Listesi ===== */}
        <div className="w-72 shrink-0 border-r-2 border-gray-700 bg-gray-900/40 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b-2 border-gray-700 shrink-0">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400">Müşteriler</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {musteriListesi.length === 0 ? (
              <div className="flex items-center justify-center h-full px-4 text-center">
                <p className="text-gray-700 text-xs leading-relaxed">
                  Poz Giriş'ten batch seçilince burada görünecek
                </p>
              </div>
            ) : (
              musteriListesi.map(m => {
                const pct = m.toplam > 0 ? Math.round((m.tamamlandi / m.toplam) * 100) : 0
                const tamam = m.tamamlandi === m.toplam
                const aktif = aktifMusteri === m.musteri
                return (
                  <button
                    key={m.musteri}
                    onClick={() => setAktifMusteri(m.musteri)}
                    className={`w-full text-left px-5 py-4 border-b border-gray-800 transition-colors ${
                      aktif
                        ? 'bg-blue-900/30 border-l-4 border-l-blue-400'
                        : 'hover:bg-gray-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-base font-bold truncate max-w-[150px] ${
                        tamam ? 'text-emerald-300' : aktif ? 'text-white' : 'text-gray-200'
                      }`}>
                        {m.musteri || '—'}
                      </span>
                      <span className={`text-sm font-bold tabular-nums shrink-0 ml-2 ${
                        tamam ? 'text-emerald-300' : aktif ? 'text-blue-300' : 'text-gray-400'
                      }`}>
                        {m.tamamlandi}/{m.toplam}
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          tamam ? 'bg-emerald-400' : aktif ? 'bg-blue-400' : 'bg-gray-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ===== ORTA: Cam Kartları ===== */}
        <div className="flex-1 flex flex-col px-6 py-4 overflow-y-auto gap-3">
          {kartlar.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-gray-900 flex items-center justify-center mb-4">
                <Wifi size={32} className="text-gray-700" />
              </div>
              <p className="text-xl font-semibold text-gray-600">Cam bekleniyor...</p>
              <p className="text-sm text-gray-700 mt-2">Poz Giriş'ten cam kodu girildiğinde burada görünecek</p>
            </div>
          ) : (
            kartlar.map((k, i) => {
              const aktif = i === 0
              return (
                <div
                  key={`${k.cam_kodu}-${k.zaman}`}
                  className={`rounded-2xl border p-6 transition-all ${
                    aktif
                      ? 'bg-gray-900 border-blue-600 ring-1 ring-blue-600/30'
                      : 'bg-gray-900/70 border-gray-800'
                  }`}
                >
                  {/* Üst satır: GLS kodu + Etiket durumu */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-black tracking-wider text-3xl ${aktif ? 'text-blue-300' : 'text-gray-300'}`}>
                        {k.cam_kodu}
                      </span>
                      {aktif && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-300 font-semibold">
                          AKTİF
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1.5 text-sm text-green-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      Etiket Basıldı
                    </span>
                  </div>

                  {/* Detay grid */}
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">MÜŞTERİ</div>
                      <div className="font-semibold text-white text-base truncate">{k.musteri || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">SİPARİŞ</div>
                      <div className="font-mono text-gray-300 text-sm">{k.siparis_no}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">BOYUT</div>
                      <div className="text-gray-300 text-sm">{k.genislik_mm} × {k.yukseklik_mm} mm</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">ÇITA</div>
                      <div className="font-bold text-amber-300 text-lg">
                        {k.ara_bosluk_mm != null ? `${k.ara_bosluk_mm} mm` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Zaman */}
                  <div className="mt-3 text-xs text-gray-600 tabular-nums">
                    {new Date(k.zaman).toLocaleTimeString('tr-TR')}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ===== SAĞ: Aktif Müşteri Cam Listesi ===== */}
        <div className="w-80 shrink-0 border-l-2 border-gray-700 bg-gray-900/40 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b-2 border-gray-700 shrink-0">
            {aktifMusteri ? (
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-0.5">Seçili Müşteri</p>
                <p className="text-base font-bold text-white truncate">{aktifMusteri}</p>
              </div>
            ) : (
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Müşteri seçilmedi</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {aktifMusteriCamlari.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-5 py-8">
                <p className="text-gray-500 text-sm leading-relaxed">
                  {aktifMusteri
                    ? 'Bu müşteriye ait cam bulunamadı.'
                    : 'Sol listeden müşteri seçin.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {aktifMusteriCamlari.map(c => {
                  const girildi = c.uretim_durumu === 'yikandi'
                  return (
                    <div
                      key={c.cam_kodu}
                      className={`px-5 py-3.5 flex items-center gap-3 ${
                        girildi ? 'opacity-40' : ''
                      }`}
                    >
                      <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                        girildi
                          ? 'bg-emerald-900/60 text-emerald-300'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {girildi ? 'Girildi' : 'Bekliyor'}
                      </span>
                      <div className="min-w-0">
                        <p className={`font-mono text-base font-bold leading-tight ${
                          girildi ? 'text-gray-500' : 'text-white'
                        }`}>{c.cam_kodu}</p>
                        <p className={`text-sm mt-0.5 ${
                          girildi ? 'text-gray-600' : 'text-gray-400'
                        }`}>{c.genislik_mm} × {c.yukseklik_mm} mm</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Alt bar */}
      <div className="border-t border-gray-800 px-6 py-2 flex items-center justify-between text-xs text-gray-600 shrink-0">
        <span>Kumanda Paneli — Çıta İstasyonu</span>
        <span className="font-mono tabular-nums">{saat.toLocaleTimeString('tr-TR')}</span>
      </div>
    </div>
  )
}
