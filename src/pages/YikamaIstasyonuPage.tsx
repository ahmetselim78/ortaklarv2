import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Wifi, WifiOff, CheckCircle2, AlertTriangle, Droplets, ArrowLeft, Package } from 'lucide-react'
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

/* ========== Bileşen ========== */

export default function YikamaIstasyonuPage() {
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
    const ch = supabase.channel('yikama-etiket')
    ch.subscribe((status) => setConnected(status === 'SUBSCRIBED'))
    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Batch listesini getir
  const batchleriGetir = useCallback(async () => {
    setBatchYukleniyor(true)
    // Sadece export_edildi ve yikamada batch'leri göster
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

    // Her batch için cam sayılarını getir
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
          stok ( ad ),
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
  }, [])

  const handleBatchSec = async (batch: BatchSatir) => {
    setSeciliBatch(batch)
    setGecmis([])
    setDurum('bos')
    setSonTarananCam(null)
    await batchCamlariniGetir(batch.id)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleBatchDegistir = async () => {
    // Eğer yıkamaya başlanmış ama tamamlanmamışsa → eksik_var
    if (seciliBatch && seciliBatch.durum === 'yikamada') {
      const taranan = batchCamlari.filter(c => c.uretim_durumu === 'yikandi').length
      const toplam = batchCamlari.length
      if (taranan > 0 && taranan < toplam) {
        await supabase
          .from('uretim_emirleri')
          .update({ durum: 'eksik_var' })
          .eq('id', seciliBatch.id)

        // Eksik camı olan siparişleri 'eksik_var' yap
        const eksikCamlar = batchCamlari.filter(c => c.uretim_durumu !== 'yikandi')
        const eksikSiparisIds = [...new Set(eksikCamlar.map(c => c.siparis_id))]
        await supabase
          .from('siparisler')
          .update({ durum: 'eksik_var' })
          .in('id', eksikSiparisIds)

        // Tüm camları yıkanmış siparişleri 'tamamlandi' yap
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

  // Tarama ve durum sayısı
  const tarananSayisi = batchCamlari.filter(c => c.uretim_durumu === 'yikandi').length
  const toplamSayisi = batchCamlari.length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!seciliBatch) return
    let kod = input.trim().toUpperCase()
    if (/^\d+$/.test(kod)) kod = `GLS-${kod}`
    if (!kod) return
    setInput('')
    setDurum('yukleniyor')

    // Bu batch'te bu cam var mı?
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

      // Lokal state güncelle
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

      // Bu batch'teki tüm siparişlerin durumunu 'yikamada' yap
      const benzersizSiparisIds = [...new Set(batchCamlari.map(c => c.siparis_id))]
      await supabase
        .from('siparisler')
        .update({ durum: 'yikamada' })
        .in('id', benzersizSiparisIds)
    }

    // Broadcast — etiket + çıta istasyonu
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

    // Tüm camlar yıkandı mı kontrol
    const yeniTaranan = tekrar ? tarananSayisi : tarananSayisi + 1
    if (yeniTaranan >= toplamSayisi) {
      beep('complete')
      setDurum('tamamlandi')
      // Batch'i tamamla
      await supabase
        .from('uretim_emirleri')
        .update({ durum: 'tamamlandi' })
        .eq('id', seciliBatch.id)
      setSeciliBatch(prev => prev ? { ...prev, durum: 'tamamlandi' } : prev)

      // Bu batch'teki tüm siparişleri 'tamamlandi' yap
      const benzersizSiparisIdsTamam = [...new Set(batchCamlari.map(c => c.siparis_id))]
      await supabase
        .from('siparisler')
        .update({ durum: 'tamamlandi' })
        .in('id', benzersizSiparisIdsTamam)
    } else if (tekrar) {
      beep('error')
      setDurum('tekrar')
      setHataMesaji(`${cam.cam_kodu} daha önce yıkandı`)
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

    if (yeniTaranan < toplamSayisi) sifirla(6000)
  }

  /* ========== RENDER ========== */

  const bantRenk: Record<TaramaDurum, string> = {
    bos: '',
    yukleniyor: 'border-blue-800 bg-blue-900/30',
    basarili:   'border-green-800 bg-green-900/30',
    hata:       'border-red-800 bg-red-900/30',
    tekrar:     'border-yellow-700 bg-yellow-900/30',
    yanlis_batch: 'border-red-800 bg-red-900/30',
    tamamlandi: 'border-green-700 bg-green-900/40',
  }
  const bantYazi: Record<TaramaDurum, string> = {
    bos: '',
    yukleniyor: 'text-blue-300',
    basarili:   'text-green-300',
    hata:       'text-red-400',
    tekrar:     'text-yellow-400',
    yanlis_batch: 'text-red-400',
    tamamlandi: 'text-green-300',
  }

  const bantMetin = (d: TaramaDurum) => {
    switch (d) {
      case 'yukleniyor': return 'Aranıyor...'
      case 'basarili': return '✓ Tarama başarılı — etiket yazıcıya gönderildi'
      case 'hata': return hataMesaji
      case 'tekrar': return hataMesaji
      case 'yanlis_batch': return hataMesaji
      case 'tamamlandi': return `🎉 Tüm camlar yıkandı — ${seciliBatch?.batch_no} tamamlandı!`
      default: return ''
    }
  }

  return (
    <div
      className="min-h-screen bg-gray-950 text-white flex flex-col select-none"
      onClick={() => seciliBatch && inputRef.current?.focus()}
    >
      {/* Üst Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <Droplets size={20} className="text-cyan-400" />
          <span className="font-bold tracking-widest text-sm text-white">YIKAMA İSTASYONU</span>
          {seciliBatch && (
            <span className="ml-3 px-3 py-0.5 rounded-lg bg-cyan-900/40 text-cyan-300 text-xs font-bold tracking-wider">
              {seciliBatch.batch_no}
            </span>
          )}
        </div>
        <div className="flex items-center gap-6">
          {seciliBatch && (
            <span className="text-sm text-gray-400 tabular-nums">
              <span className="text-cyan-300 font-bold">{tarananSayisi}</span> / {toplamSayisi} cam
            </span>
          )}
          <span className="font-mono text-gray-400 text-sm tabular-nums">
            {saat.toLocaleTimeString('tr-TR')}
          </span>
          <div className="flex items-center gap-1.5 text-sm">
            {connected
              ? <><Wifi size={14} className="text-green-400" /><span className="text-green-400">Bağlı</span></>
              : <><WifiOff size={14} className="text-red-400" /><span className="text-red-400">Bağlantı yok</span></>
            }
          </div>
        </div>
      </div>

      {/* ===================== EKRAN 1: BATCH SEÇİMİ ===================== */}
      {!seciliBatch && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-10">
          <div className="text-center">
            <Package size={48} className="mx-auto mb-4 text-gray-700" />
            <h1 className="text-2xl font-bold text-white">Batch Seçin</h1>
            <p className="text-gray-500 text-sm mt-1">Yıkamaya alınacak batch'i listeden seçin</p>
          </div>

          {batchYukleniyor ? (
            <div className="text-gray-500">Yükleniyor...</div>
          ) : batchler.length === 0 ? (
            <div className="text-gray-600 text-center">
              <p className="text-lg font-medium">Hazır batch bulunamadı</p>
              <p className="text-sm mt-1">Üretim Emirleri panelinden batch oluşturup CSV export edin.</p>
            </div>
          ) : (
            <div className="w-full max-w-xl space-y-3">
              {batchler.map((b) => {
                const yuzde = b.toplam_cam > 0 ? Math.round((b.taranan_cam / b.toplam_cam) * 100) : 0
                return (
                  <button
                    key={b.id}
                    onClick={() => handleBatchSec(b)}
                    className="w-full p-5 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-cyan-700 rounded-2xl transition-all text-left group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-white group-hover:text-cyan-300 tracking-wider">
                        {b.batch_no}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                        b.durum === 'yikamada' ? 'bg-cyan-900/40 text-cyan-300' :
                        b.durum === 'eksik_var' ? 'bg-red-900/40 text-red-400' :
                        'bg-blue-900/30 text-blue-300'
                      }`}>
                        {b.durum === 'yikamada' ? 'Yıkamada (devam)' :
                         b.durum === 'eksik_var' ? '⚠ Eksik Var' :
                         'Export Edildi'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 bg-gray-800 rounded-full h-2">
                        <div
                          className="bg-cyan-500 h-2 rounded-full transition-all"
                          style={{ width: `${yuzde}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-400 tabular-nums w-20 text-right">
                        {b.taranan_cam} / {b.toplam_cam}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== EKRAN 2: TARAMA ===================== */}
      {seciliBatch && (
        <>
          {/* Batch değiştir butonu */}
          <div className="px-6 pt-3 shrink-0">
            <button
              onClick={handleBatchDegistir}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ArrowLeft size={12} /> Batch Değiştir
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-6">
            {/* Progress bar */}
            <div className="w-full max-w-2xl">
              <div className="flex items-center gap-3 mb-1">
                <div className="flex-1 bg-gray-800 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      tarananSayisi >= toplamSayisi ? 'bg-green-500' : 'bg-cyan-500'
                    }`}
                    style={{ width: `${toplamSayisi > 0 ? (tarananSayisi / toplamSayisi) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-mono text-gray-400 tabular-nums">
                  {tarananSayisi}/{toplamSayisi}
                </span>
              </div>
            </div>

            {/* Durum Bandı */}
            {durum !== 'bos' && (
              <div className={`w-full max-w-2xl rounded-xl border px-5 py-3 ${bantRenk[durum]}`}>
                <p className={`text-center text-lg font-semibold ${bantYazi[durum]}`}>
                  {bantMetin(durum)}
                </p>
              </div>
            )}

            {/* Son tarama detayı */}
            {sonTarananCam && !['hata', 'yanlis_batch'].includes(durum) && (
              <div className="w-full max-w-2xl bg-gray-900 rounded-2xl p-6 border border-gray-800">
                <div className="text-center mb-5">
                  <span className="font-mono text-5xl font-black tracking-widest text-cyan-300">
                    {sonTarananCam.cam_kodu}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Müşteri</div>
                    <div className="text-white font-semibold">{sonTarananCam.musteri || '—'}</div>
                    <div className="text-gray-500 text-xs mt-0.5">{sonTarananCam.siparis_no}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Boyut</div>
                    <div className="text-white font-bold text-xl">
                      {sonTarananCam.genislik_mm} × {sonTarananCam.yukseklik_mm}
                      <span className="text-gray-500 text-sm ml-1">mm</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Cam Cinsi</div>
                    <div className="text-white font-semibold">{sonTarananCam.stok_ad || '—'}</div>
                    <div className="text-gray-500 text-xs mt-0.5">{sonTarananCam.adet} adet</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Çıta</div>
                    <div className="text-cyan-300 font-bold text-2xl">
                      {sonTarananCam.ara_bosluk_mm ?? '—'}
                      {sonTarananCam.ara_bosluk_mm && <span className="text-gray-500 text-sm ml-1">mm</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="w-full max-w-2xl">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value.toUpperCase())}
                  placeholder="GLS-XXXX"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={durum === 'tamamlandi'}
                  className={`w-full bg-gray-900 border-2 text-white text-3xl font-mono text-center rounded-2xl py-6 px-6 outline-none tracking-[.25em] transition-colors placeholder:text-gray-800 uppercase disabled:opacity-30
                    ${durum === 'basarili' ? 'border-green-700 focus:border-green-500' :
                      durum === 'hata' || durum === 'yanlis_batch' ? 'border-red-800 focus:border-red-600' :
                      durum === 'tekrar' ? 'border-yellow-700 focus:border-yellow-500' :
                      durum === 'tamamlandi' ? 'border-green-700' :
                      'border-gray-800 focus:border-cyan-600'}`}
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-700 text-xs font-mono">
                  ENTER
                </span>
              </div>
            </form>

            {durum !== 'tamamlandi' && (
              <p className="text-gray-700 text-sm">
                Barkod okuyucu veya klavye — Enter ile onayla
              </p>
            )}
          </div>

          {/* Alt: Geçmiş */}
          {gecmis.length > 0 && (
            <div className="border-t border-gray-800 px-6 py-4 shrink-0">
              <p className="text-xs text-gray-700 uppercase tracking-widest mb-3">Son Taramalar</p>
              <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
                {gecmis.map((g, i) => (
                  <div key={i} className="flex items-center gap-4 text-sm">
                    {g.durum === 'ok'
                      ? <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                      : <AlertTriangle size={14} className={`shrink-0 ${g.durum === 'yanlis_batch' ? 'text-red-500' : 'text-yellow-600'}`} />
                    }
                    <span className="font-mono text-gray-300 w-28">{g.cam_kodu}</span>
                    <span className="text-gray-500 w-36 truncate">{g.musteri}</span>
                    <span className="text-gray-600 w-28">{g.boyut} mm</span>
                    <span className="text-gray-700 text-xs ml-auto tabular-nums">
                      {g.zaman.toLocaleTimeString('tr-TR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
