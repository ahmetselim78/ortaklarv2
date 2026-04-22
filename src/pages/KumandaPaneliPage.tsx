import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Wifi, WifiOff, Wrench } from 'lucide-react'
import TamireGonderModal from '@/components/tamir/TamireGonderModal'
import type { TamireGonderCam } from '@/components/tamir/TamireGonderModal'

/* ========== Yardımcılar ========== */

function extractNihaiMusteri(notlar: string): string {
  const m = notlar.match(/Nihai\s+M[\u00fc\u00dc][\u015f\u015e]teri:\s*(.+?)(?:\s*\/|$)/i)
  return m?.[1]?.trim() ?? ''
}

/** Cari adı + nihai müşteri → görüntü etiketi: "NOVEL — AKYOL LOUNGE" */
function musteriEtiket(musteri: string, nihai: string): string {
  return nihai ? `${musteri} \u2014 ${nihai}` : musteri
}

/** "musteri||nihaiMusteri" bileşik anahtarını görüntü etiketine çevirir */
function musteriKeyToLabel(key: string): string {
  const sep = key.indexOf('||')
  if (sep === -1) return key
  return musteriEtiket(key.slice(0, sep), key.slice(sep + 2))
}

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
  siparis_detay_id: string
  cam_kodu: string
  musteri: string
  nihai_musteri: string
  siparis_no: string
  uretim_durumu: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  taranan_adet: number
  stok_ad: string
  sira_no: number | null
}

/* ========== Bileşen ========== */

export default function KumandaPaneliPage() {
  const navigate = useNavigate()
  const [saat, setSaat] = useState(new Date())
  const [connected, setConnected] = useState(false)
  const [kartlar, setKartlar] = useState<CamKarti[]>([])
  const [flash, setFlash] = useState(false)

  // Batch & müşteri listesi
  const [batchId, setBatchId] = useState<string | null>(null)
  const [batchNo, setBatchNo] = useState<string | null>(null)
  const [batchCamlari, setBatchCamlari] = useState<BatchCamKumanda[]>([])
  const [aktifMusteri, setAktifMusteri] = useState<string | null>(null)
  const [tamirCam, setTamirCam] = useState<TamireGonderCam | null>(null)

  // Saat
  useEffect(() => {
    const t = setInterval(() => setSaat(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Batch camlarını Supabase'den yükle
  const batchYukle = useCallback(async (loadBatchId: string, batchNoStr: string) => {
    const { data } = await supabase
      .from('uretim_emri_detaylari')
      .select(`
        id, siparis_detay_id, sira_no,
        siparis_detaylari (
          cam_kodu, uretim_durumu, genislik_mm, yukseklik_mm, adet,
          stok!stok_id ( ad ),
          siparisler ( siparis_no, notlar, cari ( ad ) )
        )
      `)
      .eq('uretim_emri_id', loadBatchId)

    const camlar: BatchCamKumanda[] = (data ?? []).map((d: any) => ({
      siparis_detay_id: d.siparis_detay_id,
      cam_kodu: d.siparis_detaylari.cam_kodu,
      musteri: d.siparis_detaylari.siparisler?.cari?.ad ?? '',
      nihai_musteri: extractNihaiMusteri(d.siparis_detaylari.siparisler?.notlar ?? ''),
      siparis_no: d.siparis_detaylari.siparisler?.siparis_no ?? '',
      uretim_durumu: d.siparis_detaylari.uretim_durumu,
      genislik_mm: d.siparis_detaylari.genislik_mm,
      yukseklik_mm: d.siparis_detaylari.yukseklik_mm,
      adet: d.siparis_detaylari.adet ?? 1,
      taranan_adet: 0,
      stok_ad: d.siparis_detaylari.stok?.ad ?? '',
      sira_no: d.sira_no ?? null,
    }))

    // Yıkama log sayısını çek (kısmi adet takibi)
    const detayIds = camlar.map(c => c.siparis_detay_id)
    const logCountMap = new Map<string, number>()
    if (detayIds.length > 0) {
      const { data: loglar } = await supabase
        .from('yikama_loglari')
        .select('siparis_detay_id')
        .in('siparis_detay_id', detayIds)
      for (const log of loglar ?? []) {
        const prev = logCountMap.get((log as any).siparis_detay_id) ?? 0
        logCountMap.set((log as any).siparis_detay_id, prev + 1)
      }
    }

    const camlarFinal = camlar.map(c => ({
      ...c,
      taranan_adet: c.uretim_durumu === 'yikandi'
        ? c.adet
        : Math.min(logCountMap.get(c.siparis_detay_id) ?? 0, c.adet - 1),
    }))

    setBatchId(loadBatchId)
    setBatchNo(batchNoStr)
    setBatchCamlari(camlarFinal)
    // İlk tamamlanmamış müşteriyi otomatik seç (composite key)
    const ilkEksik = camlarFinal.find(c => c.uretim_durumu !== 'yikandi') ?? camlarFinal[0]
    setAktifMusteri(ilkEksik ? `${ilkEksik.musteri}||${ilkEksik.nihai_musteri}` : null)
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

  // batchCamlari ref — broadcast closure'ında güncel değere erişmek için
  const batchCamlariRef = useRef<BatchCamKumanda[]>([])
  useEffect(() => { batchCamlariRef.current = batchCamlari }, [batchCamlari])

  // Müşteri listesi: composite key + etiket (PozGiriş ile aynı format)
  const musteriListesi = useMemo(() => {
    const map = new Map<string, { key: string; etiket: string; toplam: number; tamamlandi: number }>()
    for (const c of batchCamlari) {
      const key = `${c.musteri}||${c.nihai_musteri}`
      const adet = c.adet ?? 1
      const e = map.get(key) ?? { key, etiket: musteriEtiket(c.musteri, c.nihai_musteri), toplam: 0, tamamlandi: 0 }
      e.toplam += adet
      if (c.uretim_durumu === 'yikandi') e.tamamlandi += adet
      map.set(key, e)
    }
    return Array.from(map.values())
  }, [batchCamlari])

  const aktifMusteriCamlari = useMemo(
    () => aktifMusteri
      ? batchCamlari.filter(c => `${c.musteri}||${c.nihai_musteri}` === aktifMusteri)
      : [],
    [aktifMusteri, batchCamlari]
  )

  // Sağ panel: scroll
  const sagListeRef = useRef<HTMLDivElement>(null)
  const [sonGelenKod, setSonGelenKod] = useState<string | null>(null)

  // Gelen cam koduna scroll
  useEffect(() => {
    if (!sagListeRef.current || !sonGelenKod) return
    const el = sagListeRef.current.querySelector(`[data-cam-kodu="${sonGelenKod}"]`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [sonGelenKod, aktifMusteriCamlari])

  // Müşteri değişince ilk bekleyene scroll
  useEffect(() => {
    if (!sagListeRef.current) return
    const el = sagListeRef.current.querySelector('[data-pending]') as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [aktifMusteri])

  useEffect(() => {
    const channel = supabase
      .channel('uretim-istasyonlar')
      .on('broadcast', { event: 'batch_secildi' }, ({ payload }) => {
        batchYukle(payload.batch_id, payload.batch_no)
        setKartlar([])
      })
      .on('broadcast', { event: 'yeni_cam' }, ({ payload }) => {
        // Tekrar girilen camlar kartlara eklenmez, sadece sayı güncellenir
        if (!payload.tekrar) {
          const yeniKart: CamKarti = {
            ...(payload as Omit<CamKarti, 'etiket_durumu'>),
            etiket_durumu: 'basildi',
          }
          setKartlar(prev => [yeniKart, ...prev].slice(0, 10))
          setFlash(true)
          setTimeout(() => setFlash(false), 600)
        }
        // Sol panelde sayıları güncelle + aktif müşteriyi seç
        setBatchCamlari(prev => prev.map(c => {
          if (c.cam_kodu !== payload.cam_kodu) return c
          const yeniTaranan = c.taranan_adet + 1
          const tamam = yeniTaranan >= c.adet
          return { ...c, taranan_adet: yeniTaranan, uretim_durumu: tamam ? 'yikandi' : c.uretim_durumu }
        }))
        if (payload.musteri) {
          const cam = batchCamlariRef.current.find(c => c.cam_kodu === payload.cam_kodu)
          const nihai = cam?.nihai_musteri ?? ''
          setAktifMusteri(`${payload.musteri}||${nihai}`)
        }
        setSonGelenKod(payload.cam_kodu ?? null)
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
            <span className="font-mono font-black text-base text-blue-400 tracking-wide">{batchNo}</span>
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
                const aktif = aktifMusteri === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => setAktifMusteri(m.key)}
                    className={`w-full text-left px-5 py-4 border-b border-gray-800 transition-colors ${
                      aktif
                        ? 'bg-blue-900/30 border-l-4 border-l-blue-400'
                        : 'hover:bg-gray-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-base font-bold truncate flex-1 min-w-0 ${
                        tamam ? 'text-emerald-300' : aktif ? 'text-white' : 'text-gray-200'
                      }`}>
                        {m.etiket || '—'}
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
        <div className="flex-1 flex flex-col px-6 py-3 overflow-y-auto gap-2">
          {kartlar.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              {batchId === null ? (
                <>
                  <div className="w-20 h-20 rounded-full bg-yellow-900/30 border-2 border-yellow-700/50 flex items-center justify-center mb-4 animate-pulse">
                    <WifiOff size={32} className="text-yellow-600" />
                  </div>
                  <p className="text-xl font-bold text-yellow-500 animate-pulse">Batch seçili değil</p>
                  <p className="text-sm text-yellow-700 mt-2 animate-pulse">Poz Giriş ekranından bir batch seçin</p>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-full bg-gray-900 flex items-center justify-center mb-4">
                    <Wifi size={32} className="text-gray-700" />
                  </div>
                  <p className="text-xl font-semibold text-gray-600">Cam bekleniyor...</p>
                  <p className="text-sm text-gray-700 mt-2">Poz Giriş'ten cam kodu girildiğinde burada görünecek</p>
                </>
              )}
            </div>
          ) : (
            kartlar.map((k) => {
              const batchCam = batchCamlari.find(c => c.cam_kodu === k.cam_kodu)
              return (
                <div
                  key={`${k.cam_kodu}-${k.zaman}`}
                  className="rounded-xl border p-3 bg-gray-900/70 border-gray-800"
                >
                  {/* Üst satır: GLS kodu + Etiket durumu + Tamir butonu */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black tracking-wider text-2xl text-gray-300">
                        {k.cam_kodu}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        Etiket Basıldı
                      </span>
                    </div>
                    <button
                      onClick={() => batchCam && setTamirCam({
                        cam_kodu: batchCam.cam_kodu,
                        siparis_detay_id: batchCam.siparis_detay_id,
                        uretim_emri_id: batchId ?? '',
                        batch_no: batchNo ?? '',
                        sira_no: batchCam.sira_no,
                        musteri: batchCam.musteri,
                        nihai_musteri: batchCam.nihai_musteri,
                        siparis_no: batchCam.siparis_no,
                        genislik_mm: batchCam.genislik_mm,
                        yukseklik_mm: batchCam.yukseklik_mm,
                        stok_ad: batchCam.stok_ad,
                        adet: batchCam.adet,
                      })}
                      disabled={!batchCam}
                      className="p-2 rounded-lg bg-red-900/60 border border-red-700 text-red-400 hover:bg-red-800/80 hover:text-red-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Tamire Gönder"
                    >
                      <Wrench size={18} />
                    </button>
                  </div>

                  {/* Detay grid */}
                  <div className="grid grid-cols-5 gap-3">
                    <div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5">MÜŞTERİ</div>
                      <div className="font-semibold text-white text-sm truncate">{k.musteri || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5">SİPARİŞ</div>
                      <div className="font-mono text-gray-300 text-sm">{k.siparis_no}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5">POZ</div>
                      <div className="font-black text-amber-300 text-base tabular-nums">
                        {batchCam?.sira_no != null ? `#${batchCam.sira_no}` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5">BOYUT</div>
                      <div className="font-bold text-white text-base tabular-nums">{k.genislik_mm} × {k.yukseklik_mm} mm</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5">ÇITA</div>
                      <div className="font-bold text-amber-300 text-base tabular-nums">
                        {k.ara_bosluk_mm != null ? `${k.ara_bosluk_mm} mm` : '—'}
                      </div>
                    </div>
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
                <p className="text-base font-bold text-white truncate">{musteriKeyToLabel(aktifMusteri)}</p>
              </div>
            ) : (
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Müşteri seçilmedi</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto" ref={sagListeRef}>
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
                  const kismi = !girildi && c.taranan_adet > 0
                  const aktifSatir = sonGelenKod === c.cam_kodu
                  return (
                    <div
                      key={c.cam_kodu}
                      data-cam-kodu={c.cam_kodu}
                      data-pending={!girildi ? '' : undefined}
                      className={`px-5 py-3.5 flex items-center gap-3 transition-colors ${
                        aktifSatir
                          ? 'bg-green-950/60 border-l-4 border-l-green-400 animate-pulse'
                          : girildi
                          ? 'opacity-40'
                          : ''
                      }`}
                    >
                      <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                        girildi
                          ? 'bg-emerald-900/60 text-emerald-300'
                          : kismi
                          ? 'bg-amber-900/60 text-amber-300'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {girildi ? `${c.adet}/${c.adet}` : `${c.taranan_adet}/${c.adet}`}
                      </span>
                      <div className="min-w-0">
                        <p className={`font-mono text-base font-bold leading-tight ${
                          girildi ? 'text-gray-500' : 'text-white'
                        }`}>{c.cam_kodu}</p>
                        <p className={`text-sm mt-0.5 ${
                          girildi ? 'text-gray-600' : 'text-gray-400'
                        }`}>{c.genislik_mm} × {c.yukseklik_mm} mm{c.adet > 1 ? ` · ${c.adet} adet` : ''}</p>
                        {c.stok_ad && (
                          <p className={`text-xs mt-0.5 truncate ${
                            girildi ? 'text-gray-600' : 'text-gray-500'
                          }`}>{c.stok_ad}</p>
                        )}
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

      {/* Tamir Modal */}
      {tamirCam && (
        <TamireGonderModal
          cam={tamirCam}
          kaynak="kumanda"
          onClose={() => setTamirCam(null)}
          onSuccess={() => setTamirCam(null)}
        />
      )}
    </div>
  )
}
