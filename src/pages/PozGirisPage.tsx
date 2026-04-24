import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { beep } from '@/lib/audio'
import {
  Wifi, WifiOff, ArrowLeft, Package, CheckCircle2,
  AlertTriangle, XCircle, Loader2, Wrench,
} from 'lucide-react'
import type { UretimEmriDurum } from '@/types/uretim'
import TamireGonderModal from '@/components/tamir/TamireGonderModal'
import { useAyarlar } from '@/hooks/useAyarlar'
import { dplUret } from '@/types/ayarlar'
import type { EtiketVeri } from '@/types/ayarlar'

/* ========== Tipler ========== */

interface BatchSatir {
  id: string
  batch_no: string
  durum: UretimEmriDurum
  toplam_cam: number
  taranan_cam: number
  musteriler: string[]  // "NOVEL — AKYOL LOUNGE" formatında benzersiz müşteri listesi
}

interface BatchCam {
  uretim_emri_detay_id: string
  siparis_detay_id: string
  siparis_id: string
  cam_kodu: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  taranan_adet: number  // kaç adet yıkamadan geçti (yikama_loglari'dan)
  ara_bosluk_mm: number | null
  uretim_durumu: string
  stok_ad: string
  musteri: string
  nihai_musteri: string  // siparisler.notlar'dan çıkarılan nihai kullanıcı
  siparis_no: string
  sira_no: number | null
}

interface GecmisSatir {
  cam_kodu: string
  musteri: string
  boyut: string
  zaman: Date
  durum: 'ok' | 'tekrar' | 'hata' | 'yanlis_batch'
}

type TaramaDurum = 'bos' | 'yukleniyor' | 'basarili' | 'hata' | 'tekrar' | 'yanlis_batch' | 'tamamlandi'

/* ========== Yardımcılar ========== */

/** Sipariş notlarından nihai müşteri adını çıkarır ("Nihai Müşteri: ..." kalıbı) */
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
  const { etiketAyarlari } = useAyarlar()

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
  const [tamirCam, setTamirCam] = useState<BatchCam | null>(null)
  const [tamirGonderildi, setTamirGonderildi] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const sagListeRef = useRef<HTMLDivElement>(null)
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

    // Tek sorguda tüm batch'lerin detaylarını getir (N+1 yerine)
    const emirIds = emirler.map(e => e.id)
    const { data: tumDetaylar } = await supabase
      .from('uretim_emri_detaylari')
      .select(`
        uretim_emri_id, siparis_detay_id,
        siparis_detaylari ( uretim_durumu, adet, siparisler ( notlar, cari ( ad ) ) )
      `)
      .in('uretim_emri_id', emirIds)

    // Gruplama
    const detayMap = new Map<string, { toplam: number; taranan: number; musteriSet: Set<string> }>()
    for (const d of tumDetaylar ?? []) {
      const entry = detayMap.get(d.uretim_emri_id) ?? { toplam: 0, taranan: 0, musteriSet: new Set<string>() }
      const adet: number = (d as any).siparis_detaylari?.adet ?? 1
      entry.toplam += adet
      if ((d as any).siparis_detaylari?.uretim_durumu === 'yikandi') entry.taranan += adet
      const musteriAd: string = (d as any).siparis_detaylari?.siparisler?.cari?.ad ?? ''
      const nihai = extractNihaiMusteri((d as any).siparis_detaylari?.siparisler?.notlar ?? '')
      const etiket = musteriEtiket(musteriAd, nihai)
      if (etiket) entry.musteriSet.add(etiket)
      detayMap.set(d.uretim_emri_id, entry)
    }

    const sonuc: BatchSatir[] = emirler.map(e => {
      const d = detayMap.get(e.id) ?? { toplam: 0, taranan: 0, musteriSet: new Set<string>() }
      return {
        id: e.id,
        batch_no: e.batch_no,
        durum: e.durum as UretimEmriDurum,
        toplam_cam: d.toplam,
        taranan_cam: d.taranan,
        musteriler: Array.from(d.musteriSet),
      }
    })

    setBatchler(sonuc)
    setBatchYukleniyor(false)
  }, [])

  useEffect(() => { batchleriGetir() }, [batchleriGetir])

  // Batch seçildiğinde cam listesini getir
  const batchCamlariniGetir = useCallback(async (batchId: string) => {
    const { data } = await supabase
      .from('uretim_emri_detaylari')
      .select(`
        id, siparis_detay_id, sira_no,
        siparis_detaylari (
          siparis_id, cam_kodu, genislik_mm, yukseklik_mm, adet, ara_bosluk_mm, uretim_durumu,
          stok!stok_id ( ad ),
          siparisler ( siparis_no, notlar, cari ( ad ) )
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
      adet: d.siparis_detaylari.adet ?? 1,
      taranan_adet: 0,  // aşağıda yikama_loglari ile doldurulacak
      ara_bosluk_mm: d.siparis_detaylari.ara_bosluk_mm,
      sira_no: d.sira_no ?? null,
      uretim_durumu: d.siparis_detaylari.uretim_durumu,
      stok_ad: d.siparis_detaylari.stok?.ad ?? '',
      musteri: d.siparis_detaylari.siparisler?.cari?.ad ?? '',
      nihai_musteri: extractNihaiMusteri(d.siparis_detaylari.siparisler?.notlar ?? ''),
      siparis_no: d.siparis_detaylari.siparisler?.siparis_no ?? '',
    }))

    // Yıkama log sayısını her cam için çek (kısmi adet takibi için)
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

    // taranan_adet'i doldur: yikandi ise adet, değilse log sayısı (adet-1 ile sınırlı)
    const camlarFinal = camlar.map(c => ({
      ...c,
      taranan_adet: c.uretim_durumu === 'yikandi'
        ? c.adet
        : Math.min(logCountMap.get(c.siparis_detay_id) ?? 0, c.adet - 1),
    }))

    setBatchCamlari(camlarFinal)
    return camlarFinal
  }, [])

  const handleBatchSec = async (batch: BatchSatir) => {
    setSeciliBatch(batch)
    setGecmis([])
    setDurum('bos')
    setSonTarananCam(null)
    setAktifMusteri(null)
    const camlar = await batchCamlariniGetir(batch.id)
    if (camlar && camlar.length > 0) {
      // Tamamlanmamış ilk müşteriyi bul; hepsi tamamlandıysa ilk müşteriden başla
      const ilkTamamlanmamis = camlar.find(c => c.uretim_durumu !== 'yikandi')
      const ilkCam = ilkTamamlanmamis ?? camlar[0]
      setAktifMusteri(`${ilkCam.musteri}||${ilkCam.nihai_musteri}`)
    }
    setTimeout(() => inputRef.current?.focus(), 100)

    // Batch henüz yıkamada değilse hemen yıkamada'ya al
    let aktifBatch = batch
    if (batch.durum === 'export_edildi') {
      await supabase
        .from('uretim_emirleri')
        .update({ durum: 'yikamada' })
        .eq('id', batch.id)
      aktifBatch = { ...batch, durum: 'yikamada' }
      setSeciliBatch(aktifBatch)
    }

    // Kumanda Paneli ve diğer istasyonlara aktif batch'i bildir
    channelRef.current?.send({
      type: 'broadcast',
      event: 'batch_secildi',
      payload: { batch_id: aktifBatch.id, batch_no: aktifBatch.batch_no },
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
      } else if (taranan === 0) {
        // Hiç tarama yapılmadan çıkıldı — batch'i export_edildi'ye geri al
        await supabase
          .from('uretim_emirleri')
          .update({ durum: 'export_edildi' })
          .eq('id', seciliBatch.id)
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

  const tarananSayisi = useMemo(
    () => batchCamlari.reduce((sum, c) => sum + (c.uretim_durumu === 'yikandi' ? c.adet : c.taranan_adet), 0),
    [batchCamlari]
  )
  const toplamSayisi = useMemo(
    () => batchCamlari.reduce((sum, c) => sum + c.adet, 0),
    [batchCamlari]
  )

  const musteriListesi = useMemo(() => {
    const map = new Map<string, { key: string; etiket: string; toplam: number; tamamlandi: number }>()
    for (const c of batchCamlari) {
      const key = `${c.musteri}||${c.nihai_musteri}`
      const e = map.get(key) ?? { key, etiket: musteriEtiket(c.musteri, c.nihai_musteri), toplam: 0, tamamlandi: 0 }
      e.toplam += c.adet
      if (c.uretim_durumu === 'yikandi') e.tamamlandi += c.adet
      map.set(key, e)
    }
    return Array.from(map.values())
  }, [batchCamlari])

  const aktifMusteriCamlari = useMemo(
    () => aktifMusteri ? batchCamlari.filter(c => `${c.musteri}||${c.nihai_musteri}` === aktifMusteri) : [],
    [aktifMusteri, batchCamlari]
  )

  // Sağ panel: taranan cama kaydır; tarama yoksa ilk bekleyene kaydır
  useEffect(() => {
    if (!sagListeRef.current) return
    if (sonTarananCam) {
      const el = sagListeRef.current.querySelector(
        `[data-cam-kodu="${sonTarananCam.cam_kodu}"]`
      ) as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      const el = sagListeRef.current.querySelector('[data-pending]') as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [sonTarananCam, aktifMusteriCamlari])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!seciliBatch) return
    let kod = input.trim().toUpperCase()
    if (/^\d+$/.test(kod)) kod = `GLS-${kod}`
    if (!kod) return
    setInput('')
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    setDurum('yukleniyor')

    const cam = batchCamlari.find(c => c.cam_kodu === kod)

    if (!cam) {
      beep('error')
      setDurum('yanlis_batch')
      setHataMesaji(`"${kod}" bu batch'e (${seciliBatch.batch_no}) ait değil`)
      setGecmis(prev => [{
        cam_kodu: kod, musteri: '—', boyut: '—', zaman: new Date(), durum: 'yanlis_batch' as const,
      }, ...prev].slice(0, 15))
      sifirla(4000)
      return
    }

    const tekrar = cam.uretim_durumu === 'yikandi'

    // Etiket bas (tekrar taramalarda da bas — her cam geçişinde etiket gerekir)
    if (etiketAyarlari.yazici.kopru_adresi && etiketAyarlari.yazdirma_kosulu === 'otomatik') {
      const veri: EtiketVeri = {
        cam_kodu: cam.cam_kodu,
        musteri: musteriEtiket(cam.musteri, cam.nihai_musteri),
        genislik_mm: cam.genislik_mm,
        yukseklik_mm: cam.yukseklik_mm,
        sira_no: cam.sira_no ?? 0,
        siparis_no: cam.siparis_no,
      }
      const dpl = dplUret(etiketAyarlari, veri)
      const kopruUrl = `http://${etiketAyarlari.yazici.kopru_adresi.trim()}:9876/yazdir`
      const usb = etiketAyarlari.yazici.yazici_adi?.trim()
      const fetchBody = usb
        ? { yazici_adi: usb, dpl }
        : {
            ip: (etiketAyarlari.yazici.ip_adresi.trim()
              .replace(/^https?:\/\//i, '').replace(/\/+$/, '') || 'localhost'),
            port: etiketAyarlari.yazici.port,
            dpl,
          }
      fetch(kopruUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fetchBody),
      }).catch(() => { /* sessiz hata — tarama akışını bozma */ })
    }
    await supabase.from('yikama_loglari').insert({
      cam_kodu: cam.cam_kodu,
      siparis_detay_id: cam.siparis_detay_id,
    })

    // Adet takibi: her tarama 1 adet sayar
    const yeniTarananadet = cam.taranan_adet + 1
    const tumAdetTamamlandi = yeniTarananadet >= cam.adet

    if (!tekrar) {
      if (tumAdetTamamlandi) {
        // Tüm adetler işlendi → satırı yikandi olarak işaretle
        await supabase
          .from('siparis_detaylari')
          .update({ uretim_durumu: 'yikandi' })
          .eq('id', cam.siparis_detay_id)

        setBatchCamlari(prev => prev.map(c =>
          c.siparis_detay_id === cam.siparis_detay_id
            ? { ...c, uretim_durumu: 'yikandi', taranan_adet: yeniTarananadet }
            : c
        ))
      } else {
        // Kısmi tamamlama — sadece lokal sayacı güncelle
        setBatchCamlari(prev => prev.map(c =>
          c.siparis_detay_id === cam.siparis_detay_id
            ? { ...c, taranan_adet: yeniTarananadet }
            : c
        ))
      }
    }

    // İlk taramada batch durumunu 'yikamada' yap
    if (seciliBatch.durum !== 'yikamada') {
      await supabase
        .from('uretim_emirleri')
        .update({ durum: 'yikamada' })
        .eq('id', seciliBatch.id)
      setSeciliBatch(prev => prev ? { ...prev, durum: 'yikamada' } : prev)
    }

    // Sadece taranan camın siparişini yıkamada yap (tekrar değilse)
    if (!tekrar) {
      await supabase
        .from('siparisler')
        .update({ durum: 'yikamada' })
        .eq('id', cam.siparis_id)
        .in('durum', ['batchte', 'eksik_var'])
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
        tekrar: tekrar,
      },
    })

    setSonTarananCam({ ...cam, taranan_adet: tekrar ? cam.taranan_adet : yeniTarananadet })
    setAktifMusteri(`${cam.musteri}||${cam.nihai_musteri}`)

    // Tüm camlar yıkandı mı kontrol (her tarama 1 adet sayar)
    const yeniTaranan = tarananSayisi + (tekrar ? 0 : 1)
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
      sifirla(4000)
    } else {
      beep('success')
      setDurum('basarili')
      // basarili durumu yeni GLS girilene kadar ekranda kalır — sifirla çağrılmaz
    }

    setGecmis(prev => [{
      cam_kodu: cam.cam_kodu,
      musteri: cam.musteri,
      boyut: `${cam.genislik_mm}×${cam.yukseklik_mm}`,
      zaman: new Date(),
      durum: (tekrar ? 'tekrar' : 'ok') as 'ok' | 'tekrar',
    }, ...prev].slice(0, 15))
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
                    <div className="text-sm text-gray-400 mb-2">
                      {b.taranan_cam} / {b.toplam_cam} cam girildi
                    </div>
                    {b.musteriler.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {b.musteriler.map((m, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 font-medium border border-gray-700">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
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
              const aktif = aktifMusteri === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => { setAktifMusteri(m.key); setTimeout(() => inputRef.current?.focus(), 50) }}
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
                      {m.tamamlandi}/{m.toplam} adet
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
              {durum === 'bos' && !tamirGonderildi && (
                <>
                  <p className="text-gray-300 text-xl font-semibold mb-1">GLS kodunu girin</p>
                  <p className="text-gray-500 text-sm">Numara veya tam GLS-XXXX formatı</p>
                </>
              )}
              {durum === 'bos' && tamirGonderildi && (
                <>
                  <Wrench size={44} className="text-orange-400 mx-auto mb-2" />
                  <p className="text-orange-200 font-bold text-xl">Tamire Gönderildi</p>
                  <p className="text-orange-400/70 text-sm mt-1">Kayıt oluşturuldu</p>
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
                  {sonTarananCam.adet > 1 && (
                    <p className={`text-sm mt-1.5 font-bold tabular-nums ${sonTarananCam.taranan_adet >= sonTarananCam.adet ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {sonTarananCam.taranan_adet} / {sonTarananCam.adet} adet
                    </p>
                  )}
                  <button
                    onClick={() => setTamirCam(sonTarananCam)}
                    className="mt-3 flex items-center gap-2 mx-auto px-4 py-2 bg-red-900/50 hover:bg-red-800/70 border border-red-700 rounded-xl text-red-300 text-sm font-semibold transition-colors"
                  >
                    <Wrench size={14} />
                    Tamire Gönder
                  </button>
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

            {/* Tamir butonu — yeni cam girilene kadar göster */}
            {sonTarananCam && durum !== 'basarili' && durum !== 'tamamlandi' && (
              <button
                onClick={() => setTamirCam(sonTarananCam)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-900/30 hover:bg-red-800/50 border border-red-800 rounded-xl text-red-400 text-sm font-semibold transition-colors"
              >
                <Wrench size={14} />
                {sonTarananCam.cam_kodu} — Tamire Gönder
              </button>
            )}
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
                <p className="text-base font-bold text-white truncate">{aktifMusteri ? musteriKeyToLabel(aktifMusteri) : ''}</p>
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
                    : 'Sol listeden müşteri seçin veya GLS kodu girin.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {aktifMusteriCamlari.map(c => {
                  const girildi = c.uretim_durumu === 'yikandi'
                  const kismi = !girildi && c.taranan_adet > 0
                  const aktifSatir = sonTarananCam?.cam_kodu === c.cam_kodu
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
                      <div className="min-w-0 flex-1">
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

      {/* Tamir Modal */}
      {tamirCam && seciliBatch && (
        <TamireGonderModal
          cam={{
            cam_kodu: tamirCam.cam_kodu,
            siparis_detay_id: tamirCam.siparis_detay_id,
            uretim_emri_id: seciliBatch.id,
            batch_no: seciliBatch.batch_no,
            sira_no: tamirCam.sira_no,
            musteri: tamirCam.musteri,
            nihai_musteri: tamirCam.nihai_musteri,
            siparis_no: tamirCam.siparis_no,
            genislik_mm: tamirCam.genislik_mm,
            yukseklik_mm: tamirCam.yukseklik_mm,
            stok_ad: tamirCam.stok_ad,
            adet: tamirCam.adet,
          }}
          kaynak="poz_giris"
          onClose={() => { setTamirCam(null); setTimeout(() => inputRef.current?.focus(), 100) }}
          onSuccess={() => {
            setTamirCam(null)
            setDurum('bos')
            setSonTarananCam(null)
            setTamirGonderildi(true)
            setTimeout(() => {
              setTamirGonderildi(false)
              inputRef.current?.focus()
            }, 2500)
          }}
        />
      )}
    </div>
  )
}
