import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  Wifi, WifiOff, ArrowLeft, Package, CheckCircle2,
  AlertTriangle, XCircle, Loader2,
} from 'lucide-react'
import type { UretimEmriDurum } from '@/types/uretim'

/* ========== Tipler ========== */

interface BatchSatir {
  id: string
  batch_no: string
  durum: UretimEmriDurum
  toplam_cam: number
  taranan_cam: number
}

interface BatchCam {
  uretim_emri_detay_id: string
  siparis_detay_id: string
  siparis_id: string
  cam_kodu: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  ara_bosluk_mm: number | null
  uretim_durumu: string
  stok_ad: string
  musteri: string
  siparis_no: string
}

interface GecmisSatir {
  cam_kodu: string
  musteri: string
  boyut: string
  zaman: Date
  durum: 'ok' | 'tekrar' | 'hata' | 'yanlis_batch'
}

type TaramaDurum = 'bos' | 'yukleniyor' | 'basarili' | 'hata' | 'tekrar' | 'yanlis_batch' | 'tamamlandi'

/* ========== Ses ========== */

function beep(type: 'success' | 'error' | 'complete') {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    if (type === 'success') {
      osc.type = 'sine'; osc.frequency.value = 880
    } else if (type === 'complete') {
      osc.type = 'sine'; osc.frequency.value = 1200
    } else {
      osc.type = 'sawtooth'; osc.frequency.value = 220
    }
    const dur = type === 'complete' ? 0.4 : type === 'success' ? 0.15 : 0.4
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start()
    osc.stop(ctx.currentTime + dur)
  } catch { /* */ }
}

/* ========== Durum renkleri ========== */

function durumRenk(d: TaramaDurum) {
  switch (d) {
    case 'basarili': return 'border-green-500 bg-green-950/40'
    case 'tekrar': return 'border-yellow-500 bg-yellow-950/40'
    case 'yanlis_batch': return 'border-red-500 bg-red-950/40'
    case 'hata': return 'border-red-500 bg-red-950/40'
    case 'tamamlandi': return 'border-emerald-400 bg-emerald-950/40'
    case 'yukleniyor': return 'border-blue-500 bg-blue-950/40'
    default: return 'border-gray-700 bg-gray-900'
  }
}

/* ========== Bileşen ========== */

export default function PozGirisPage() {
  const navigate = useNavigate()
  const [saat, setSaat] = useState(new Date())
  const [connected, setConnected] = useState(false)

  // Batch seçimi
  const [batchler, setBatchler] = useState<BatchSatir[]>([])
  const [batchYukleniyor, setBatchYukleniyor] = useState(true)
  const [seciliBatch, setSeciliBatch] = useState<BatchSatir | null>(null)

  // Tarama
  const [batchCamlari, setBatchCamlari] = useState<BatchCam[]>([])
  const [input, setInput] = useState('')
  const [durum, setDurum] = useState<TaramaDurum>('bos')
  const [hataMesaji, setHataMesaji] = useState('')
  const [sonTarananCam, setSonTarananCam] = useState<BatchCam | null>(null)
  const [gecmis, setGecmis] = useState<GecmisSatir[]>([])
  const [aktifMusteri, setAktifMusteri] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const resetTimerRef = useRef<number | null>(null)

  // Saat
  useEffect(() => {
    const t = setInterval(() => setSaat(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Realtime kanal
  useEffect(() => {
    const ch = supabase.channel('uretim-istasyonlar')
    ch.subscribe((status) => setConnected(status === 'SUBSCRIBED'))
    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Batch listesini getir
  const batchleriGetir = useCallback(async () => {
    setBatchYukleniyor(true)
    const { data: emirler } = await supabase
      .from('uretim_emirleri')
      .select('id, batch_no, durum')
      .in('durum', ['export_edildi', 'yikamada', 'eksik_var'])
      .order('olusturulma_tarihi', { ascending: false })

    if (!emirler || emirler.length === 0) {
      setBatchler([])
      setBatchYukleniyor(false)
      return
    }

    const sonuc: BatchSatir[] = []
    for (const e of emirler) {
      const { data: detaylar } = await supabase
        .from('uretim_emri_detaylari')
        .select('siparis_detay_id, siparis_detaylari ( uretim_durumu )')
        .eq('uretim_emri_id', e.id)

      const toplam = detaylar?.length ?? 0
      const taranan = detaylar?.filter(
        (d: any) => d.siparis_detaylari?.uretim_durumu === 'yikandi'
      ).length ?? 0

      sonuc.push({
        id: e.id,
        batch_no: e.batch_no,
        durum: e.durum as UretimEmriDurum,
        toplam_cam: toplam,
        taranan_cam: taranan,
      })
    }

    setBatchler(sonuc)
    setBatchYukleniyor(false)
  }, [])

  useEffect(() => { batchleriGetir() }, [batchleriGetir])

  // Batch seçildiğinde cam listesini getir
  const batchCamlariniGetir = useCallback(async (batchId: string) => {
    const { data } = await supabase
      .from('uretim_emri_detaylari')
      .select(`
        id, siparis_detay_id,
        siparis_detaylari (
          siparis_id, cam_kodu, genislik_mm, yukseklik_mm, adet, ara_bosluk_mm, uretim_durumu,
          stok!stok_id ( ad ),
          siparisler ( siparis_no, cari ( ad ) )
        )
      `)
      .eq('uretim_emri_id', batchId)
      .order('sira_no')

    const camlar: BatchCam[] = (data ?? []).map((d: any) => ({
      uretim_emri_detay_id: d.id,
      siparis_detay_id: d.siparis_detay_id,
      siparis_id: d.siparis_detaylari.siparis_id,
      cam_kodu: d.siparis_detaylari.cam_kodu,
      genislik_mm: d.siparis_detaylari.genislik_mm,
      yukseklik_mm: d.siparis_detaylari.yukseklik_mm,
      adet: d.siparis_detaylari.adet,
      ara_bosluk_mm: d.siparis_detaylari.ara_bosluk_mm,
      uretim_durumu: d.siparis_detaylari.uretim_durumu,
      stok_ad: d.siparis_detaylari.stok?.ad ?? '',
      musteri: d.siparis_detaylari.siparisler?.cari?.ad ?? '',
      siparis_no: d.siparis_detaylari.siparisler?.siparis_no ?? '',
    }))
    setBatchCamlari(camlar)
    return camlar
  }, [])

  const handleBatchSec = async (batch: BatchSatir) => {
    setSeciliBatch(batch)
    setGecmis([])
    setDurum('bos')
    setSonTarananCam(null)
    setAktifMusteri(null)
    const camlar = await batchCamlariniGetir(batch.id)
    if (camlar && camlar.length > 0) setAktifMusteri(camlar[0].musteri)
    setTimeout(() => inputRef.current?.focus(), 100)
    // Kumanda Paneli ve diğer istasyonlara aktif batch'i bildir
    channelRef.current?.send({
      type: 'broadcast',
      event: 'batch_secildi',
      payload: { batch_id: batch.id, batch_no: batch.batch_no },
    })
  }

  const handleBatchDegistir = async () => {
    if (seciliBatch && seciliBatch.durum === 'yikamada') {
      const taranan = batchCamlari.filter(c => c.uretim_durumu === 'yikandi').length
      const toplam = batchCamlari.length
      if (taranan > 0 && taranan < toplam) {
        await supabase
          .from('uretim_emirleri')
          .update({ durum: 'eksik_var' })
          .eq('id', seciliBatch.id)

        const eksikCamlar = batchCamlari.filter(c => c.uretim_durumu !== 'yikandi')
        const eksikSiparisIds = [...new Set(eksikCamlar.map(c => c.siparis_id))]
        await supabase
          .from('siparisler')
          .update({ durum: 'eksik_var' })
          .in('id', eksikSiparisIds)

        const tamamSiparisIds = [...new Set(batchCamlari.map(c => c.siparis_id))]
          .filter(sid => !eksikSiparisIds.includes(sid))
        if (tamamSiparisIds.length > 0) {
          await supabase
            .from('siparisler')
            .update({ durum: 'tamamlandi' })
            .in('id', tamamSiparisIds)
        }
      }
    }
    setSeciliBatch(null)
    setBatchCamlari([])
    setDurum('bos')
    setSonTarananCam(null)
    setAktifMusteri(null)
    batchleriGetir()
  }

  // Input odak
  useEffect(() => {
    if (!seciliBatch) return
    inputRef.current?.focus()
    const t = setInterval(() => inputRef.current?.focus(), 800)
    return () => clearInterval(t)
  }, [seciliBatch])

  const sifirla = (ms = 4000) => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => {
      setDurum('bos')
      setSonTarananCam(null)
      setHataMesaji('')
    }, ms)
  }

  const tarananSayisi = batchCamlari.filter(c => c.uretim_durumu === 'yikandi').length
  const toplamSayisi = batchCamlari.length

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!seciliBatch) return
    let kod = input.trim().toUpperCase()
    if (/^\d+$/.test(kod)) kod = `GLS-${kod}`
    if (!kod) return
    setInput('')
    setDurum('yukleniyor')

    const cam = batchCamlari.find(c => c.cam_kodu === kod)

    if (!cam) {
      beep('error')
      setDurum('yanlis_batch')
      setHataMesaji(`"${kod}" bu batch'e (${seciliBatch.batch_no}) ait değil`)
      setGecmis(prev => [{
        cam_kodu: kod, musteri: '—', boyut: '—', zaman: new Date(), durum: 'yanlis_batch',
      }, ...prev].slice(0, 15))
      sifirla(4000)
      return
    }

    const tekrar = cam.uretim_durumu === 'yikandi'

    // Yıkama logu
    await supabase.from('yikama_loglari').insert({
      cam_kodu: cam.cam_kodu,
      siparis_detay_id: cam.siparis_detay_id,
    })

    // Durumu güncelle (ilk kez)
    if (!tekrar) {
      await supabase
        .from('siparis_detaylari')
        .update({ uretim_durumu: 'yikandi' })
        .eq('id', cam.siparis_detay_id)

      setBatchCamlari(prev => prev.map(c =>
        c.siparis_detay_id === cam.siparis_detay_id
          ? { ...c, uretim_durumu: 'yikandi' }
          : c
      ))
    }

    // İlk taramada batch durumunu 'yikamada' yap
    if (seciliBatch.durum !== 'yikamada') {
      await supabase
        .from('uretim_emirleri')
        .update({ durum: 'yikamada' })
        .eq('id', seciliBatch.id)
      setSeciliBatch(prev => prev ? { ...prev, durum: 'yikamada' } : prev)

      const benzersizSiparisIds = [...new Set(batchCamlari.map(c => c.siparis_id))]
      await supabase
        .from('siparisler')
        .update({ durum: 'yikamada' })
        .in('id', benzersizSiparisIds)
    }

    // Broadcast — kumanda + gösterge
    await channelRef.current?.send({
      type: 'broadcast',
      event: 'yeni_cam',
      payload: {
        cam_kodu: cam.cam_kodu,
        musteri: cam.musteri,
        siparis_no: cam.siparis_no,
        cam_tipi: cam.stok_ad,
        genislik_mm: cam.genislik_mm,
        yukseklik_mm: cam.yukseklik_mm,
        adet: cam.adet,
        ara_bosluk_mm: cam.ara_bosluk_mm,
        zaman: Date.now(),
      },
    })

    setSonTarananCam(cam)
    setAktifMusteri(cam.musteri)

    // Tüm camlar yıkandı mı kontrol
    const yeniTaranan = tekrar ? tarananSayisi : tarananSayisi + 1
    if (yeniTaranan >= toplamSayisi) {
      beep('complete')
      setDurum('tamamlandi')
      await supabase
        .from('uretim_emirleri')
        .update({ durum: 'tamamlandi' })
        .eq('id', seciliBatch.id)
      setSeciliBatch(prev => prev ? { ...prev, durum: 'tamamlandi' } : prev)

      const benzersizSiparisIdsTamam = [...new Set(batchCamlari.map(c => c.siparis_id))]
      await supabase
        .from('siparisler')
        .update({ durum: 'tamamlandi' })
        .in('id', benzersizSiparisIdsTamam)
    } else if (tekrar) {
      beep('error')
      setDurum('tekrar')
      setHataMesaji(`${cam.cam_kodu} daha önce girildi`)
    } else {
      beep('success')
      setDurum('basarili')
    }

    setGecmis(prev => [{
      cam_kodu: cam.cam_kodu,
      musteri: cam.musteri,
      boyut: `${cam.genislik_mm}×${cam.yukseklik_mm}`,
      zaman: new Date(),
      durum: tekrar ? 'tekrar' : 'ok',
    }, ...prev].slice(0, 15))

    sifirla(4000)
  }

  /* ========== RENDER ========== */

  // Batch seçimi ekranı
  if (!seciliBatch) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        {/* Üst bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
          <button onClick={() => navigate('/istasyonlar')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">Geri</span>
          </button>
          <span className="font-bold tracking-widest text-sm">POZ GİRİŞ</span>
          <div className="flex items-center gap-4">
            <span className="font-mono text-gray-500 text-sm tabular-nums">
              {saat.toLocaleTimeString('tr-TR')}
            </span>
            <div className="flex items-center gap-1.5 text-sm">
              {connected
                ? <><Wifi size={14} className="text-green-400" /><span className="text-green-400 text-xs">Çevrimiçi</span></>
                : <><WifiOff size={14} className="text-red-400" /><span className="text-red-400 text-xs">Bağlantı yok</span></>
              }
            </div>
          </div>
        </div>

        {/* Batch listesi */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
          <Package size={48} className="text-gray-700 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Batch Seçimi</h2>
          <p className="text-gray-500 text-sm mb-8">İşlem yapılacak batch'i seçin</p>

          {batchYukleniyor ? (
            <Loader2 size={32} className="animate-spin text-gray-600" />
          ) : batchler.length === 0 ? (
            <p className="text-gray-600">Hazır batch bulunamadı.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
              {batchler.map(b => {
                const pct = b.toplam_cam > 0 ? Math.round((b.taranan_cam / b.toplam_cam) * 100) : 0
                return (
                  <button
                    key={b.id}
                    onClick={() => handleBatchSec(b)}
                    className="bg-gray-900 border border-gray-700 hover:border-blue-500 rounded-xl p-5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono font-bold text-lg text-white">{b.batch_no}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        b.durum === 'export_edildi' ? 'bg-blue-900 text-blue-300' :
                        b.durum === 'yikamada' ? 'bg-amber-900 text-amber-300' :
                        'bg-red-900 text-red-300'
                      }`}>
                        {b.durum === 'export_edildi' ? 'Hazır' :
                         b.durum === 'yikamada' ? 'Devam Ediyor' : 'Eksik Var'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400 mb-3">
                      {b.taranan_cam} / {b.toplam_cam} cam girildi
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Tarama ekranı — 3 kolonlu layout
  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      {/* Üst bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <button onClick={handleBatchDegistir} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Batch Değiştir</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-sm text-blue-400">{seciliBatch.batch_no}</span>
          <span className="text-gray-700">|</span>
          <span className="text-sm text-gray-400 tabular-nums">{tarananSayisi}/{toplamSayisi}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-gray-500 text-sm tabular-nums">
            {saat.toLocaleTimeString('tr-TR')}
          </span>
          <div className="flex items-center gap-1.5">
            {connected
              ? <><Wifi size={14} className="text-green-400" /><span className="text-green-400 text-xs">Çevrimiçi</span></>
              : <><WifiOff size={14} className="text-red-400" /><span className="text-red-400 text-xs">Bağlantı yok</span></>
            }
          </div>
        </div>
      </div>

      {/* 3 kolonlu ana içerik */}
      <div className="flex-1 flex overflow-hidden">

        {/* ===== SOL: Müşteri Listesi ===== */}
        <div className="w-72 shrink-0 border-r-2 border-gray-700 bg-gray-900/40 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b-2 border-gray-700 shrink-0">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400">Müşteriler</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {musteriListesi.map(m => {
              const pct = m.toplam > 0 ? Math.round((m.tamamlandi / m.toplam) * 100) : 0
              const tamam = m.tamamlandi === m.toplam
              const aktif = aktifMusteri === m.musteri
              return (
                <button
                  key={m.musteri}
                  onClick={() => { setAktifMusteri(m.musteri); setTimeout(() => inputRef.current?.focus(), 50) }}
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
            })}
          </div>
        </div>

        {/* ===== ORTA: İlerleme + Durum + Input + Geçmiş ===== */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Üst: toplam ilerleme — büyük ve belirgin */}
          <div className="shrink-0 px-6 pt-4 pb-3">
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Toplam İlerleme</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black tabular-nums text-white leading-none">{tarananSayisi}</span>
                  <span className="text-xl font-bold text-gray-500 leading-none">/ {toplamSayisi}</span>
                </div>
              </div>
              <span className={`text-4xl font-black tabular-nums leading-none ${
                tarananSayisi === toplamSayisi && toplamSayisi > 0
                  ? 'text-emerald-400'
                  : 'text-blue-400'
              }`}>
                {toplamSayisi > 0 ? Math.round((tarananSayisi / toplamSayisi) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
              <div
                className={`h-4 rounded-full transition-all duration-500 ${
                  tarananSayisi === toplamSayisi && toplamSayisi > 0
                    ? 'bg-emerald-500'
                    : 'bg-blue-500'
                }`}
                style={{ width: toplamSayisi > 0 ? `${(tarananSayisi / toplamSayisi) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/* Orta: durum kartı + input */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-3 overflow-y-auto py-3">
            {/* Durum kartı */}
            <div className={`w-full border-2 rounded-2xl p-6 text-center transition-colors ${durumRenk(durum)}`}>
              {durum === 'bos' && (
                <>
                  <p className="text-gray-300 text-xl font-semibold mb-1">GLS kodunu girin</p>
                  <p className="text-gray-500 text-sm">Numara veya tam GLS-XXXX formatı</p>
                </>
              )}
              {durum === 'yukleniyor' && (
                <Loader2 size={40} className="animate-spin text-blue-400 mx-auto" />
              )}
              {durum === 'basarili' && sonTarananCam && (
                <>
                  <CheckCircle2 size={44} className="text-green-400 mx-auto mb-2" />
                  <p className="font-mono text-3xl font-black text-green-300 mb-1">{sonTarananCam.cam_kodu}</p>
                  <p className="text-green-300/80 text-base font-medium">{sonTarananCam.musteri}</p>
                  <p className="text-green-400/60 text-sm mt-0.5">{sonTarananCam.genislik_mm} × {sonTarananCam.yukseklik_mm} mm</p>
                </>
              )}
              {durum === 'tekrar' && (
                <>
                  <AlertTriangle size={44} className="text-yellow-400 mx-auto mb-2" />
                  <p className="text-yellow-200 font-bold text-xl">{hataMesaji}</p>
                </>
              )}
              {durum === 'yanlis_batch' && (
                <>
                  <XCircle size={44} className="text-red-400 mx-auto mb-2" />
                  <p className="text-red-200 font-bold text-xl">{hataMesaji}</p>
                </>
              )}
              {durum === 'tamamlandi' && (
                <>
                  <CheckCircle2 size={52} className="text-emerald-400 mx-auto mb-2" />
                  <p className="text-emerald-200 font-black text-2xl">Batch Tamamlandı!</p>
                  <p className="text-emerald-400/70 text-base mt-1">{toplamSayisi} cam başarıyla işlendi</p>
                </>
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="w-full">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="GLS kodu girin..."
                className="w-full text-center text-2xl font-mono bg-gray-900 border-2 border-gray-700 rounded-xl px-6 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                autoComplete="off"
                disabled={durum === 'tamamlandi'}
              />
            </form>
          </div>

          {/* Alt: Geçmiş */}
          <div className="border-t border-gray-700 shrink-0 flex flex-col" style={{ height: '35%' }}>
            <div className="px-6 py-2.5 shrink-0 border-b border-gray-800">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Son İşlemler</p>
            </div>
            {gecmis.length === 0 ? (
              <div className="flex items-center justify-center flex-1">
                <p className="text-sm text-gray-600">Henüz giriş yapılmadı.</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 divide-y divide-gray-800">
                {gecmis.map((g, i) => (
                  <div key={i} className={`flex items-center gap-4 px-6 py-3 ${i === 0 ? 'bg-gray-900/60' : ''}`}>
                    <span className={`w-3 h-3 rounded-full shrink-0 ${
                      g.durum === 'ok' ? 'bg-green-400' :
                      g.durum === 'tekrar' ? 'bg-yellow-400' : 'bg-red-400'
                    }`} />
                    <span className="font-mono text-base font-bold text-white w-28 shrink-0">{g.cam_kodu}</span>
                    <span className="text-gray-300 text-base font-medium flex-1 truncate">{g.musteri}</span>
                    <span className="text-gray-400 text-sm font-mono shrink-0">{g.boyut} mm</span>
                    <span className="text-gray-500 text-sm tabular-nums shrink-0">{g.zaman.toLocaleTimeString('tr-TR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                    : 'Sol listeden müşteri seçin veya GLS kodu girin.'}
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
    </div>
  )
}
