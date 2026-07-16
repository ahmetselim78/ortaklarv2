import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Printer, Wifi, WifiOff, Wrench } from 'lucide-react'
import TamireGonderModal from '@/components/tamir/TamireGonderModal'
import type { TamireGonderCam } from '@/components/tamir/TamireGonderModal'
import { fizikselGlsKodu } from '@/lib/siparisDetay'
import { getCamKompozisyon } from '@/lib/cam'
import { tumSatirlariGetir } from '@/lib/supabasePagination'
import { camTarananSayisi, tarananAdetHesapla, yikamaLogSayilariGetir } from '@/lib/yikamaLoglari'
import { etiketKopruSaglikKontrolu, etiketOtomatikYazdir } from '@/lib/etiketBasim'
import type { EtiketBasimDurumu } from '@/lib/etiketBasim'
import type { EtiketVeri } from '@/types/ayarlar'
import { useAyarlar } from '@/hooks/useAyarlar'

/* ========== Yardımcılar ========== */

/** Cari adı + nihai müşteri → görüntü etiketi: "NOVEL — AKYOL LOUNGE" */
function musteriEtiket(musteri: string, nihai: string): string {
  return nihai ? `${musteri} \u2014 ${nihai}` : musteri
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
  etiket_durumu: EtiketBasimDurumu
  etiket_mesaji: string
  tamirde: boolean
}

interface BatchCamKumanda {
  uretim_emri_detay_id: string
  siparis_detay_id: string
  siparis_id: string
  cam_kodu: string
  teknik_cam_kodu: string
  musteri: string
  nihai_musteri: string
  siparis_no: string
  poz: string
  liste_adedi: number
  uretim_durumu: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  taranan_adet: number
  stok_ad: string
  sira_no: number | null
  katman_yapisi: string | null
  cita_kalinlik_mm: number | null
}

interface YeniCamPayload {
  cam_kodu?: string
  teknik_cam_kodu?: string
  siparis_detay_id?: string
  uretim_emri_detay_id?: string
  musteri?: string
  nihai_musteri?: string
  poz?: string
  liste_adedi?: number
  sira_no?: number | null
  siparis_no?: string
  cam_tipi?: string
  genislik_mm?: number
  yukseklik_mm?: number
  cita_kalinlik_mm?: number | null
  zaman?: number
  tekrar?: boolean
  etiket_durumu?: EtiketBasimDurumu
  etiket_mesaji?: string
}

interface EtiketDurumuPayload {
  cam_kodu?: string
  zaman?: number
  etiket_durumu?: EtiketBasimDurumu
  etiket_mesaji?: string
}

interface TamirOlayPayload {
  cam_kodu?: string
  batch_no?: string
}

/* ========== Bileşen ========== */

export default function KumandaPaneliPage() {
  const navigate = useNavigate()
  const [saat, setSaat] = useState(new Date())
  const [connected, setConnected] = useState(false)
  const [kartlar, setKartlar] = useState<CamKarti[]>([])
  const [flash, setFlash] = useState(false)
  const [kopruBagli, setKopruBagli] = useState<boolean | null>(null)
  const [kopruMesaji, setKopruMesaji] = useState('Yazıcı köprüsü kontrol ediliyor.')
  const { etiketAyarlari } = useAyarlar()
  const etiketAyarlariRef = useRef(etiketAyarlari)
  const islenenEtiketIstekleriRef = useRef(new Set<string>())

  // Batch & müşteri listesi
  const [batchId, setBatchId] = useState<string | null>(null)
  const [batchNo, setBatchNo] = useState<string | null>(null)
  const [batchCamlari, setBatchCamlari] = useState<BatchCamKumanda[]>([])
  const [aktifMusteri, setAktifMusteri] = useState<string | null>(null)
  const [tamirCam, setTamirCam] = useState<TamireGonderCam | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    etiketAyarlariRef.current = etiketAyarlari
  }, [etiketAyarlari])

  useEffect(() => {
    let aktif = true
    const kontrolEt = async () => {
      const sonuc = await etiketKopruSaglikKontrolu(etiketAyarlari)
      if (!aktif) return
      setKopruBagli(sonuc.bagli)
      setKopruMesaji(sonuc.mesaj)
    }
    void kontrolEt()
    const intervalId = window.setInterval(kontrolEt, 10000)
    return () => {
      aktif = false
      window.clearInterval(intervalId)
    }
  }, [etiketAyarlari])

  const kumandadanEtiketYazdir = useCallback(async (etiketVeri: EtiketVeri, taramaZamani: number) => {
    setKartlar(prev => prev.map(k =>
      k.cam_kodu === etiketVeri.cam_kodu && k.zaman === taramaZamani
        ? { ...k, etiket_durumu: 'gonderiliyor', etiket_mesaji: 'Kumanda Paneli yazıcı köprüsüne gönderiyor.' }
        : k
    ))

    const sonuc = await etiketOtomatikYazdir(etiketAyarlariRef.current, etiketVeri)
    setKopruBagli(sonuc.durum === 'yaziciya_gonderildi')
    setKopruMesaji(sonuc.mesaj)

    let ilkEslesmeGuncellendi = false
    setKartlar(prev => prev.map(k => {
      if (ilkEslesmeGuncellendi || k.cam_kodu !== etiketVeri.cam_kodu) return k
      if (k.zaman !== taramaZamani) return k
      ilkEslesmeGuncellendi = true
      return { ...k, etiket_durumu: sonuc.durum, etiket_mesaji: sonuc.mesaj }
    }))

    await channelRef.current?.send({
      type: 'broadcast',
      event: 'etiket_durumu',
      payload: {
        cam_kodu: etiketVeri.cam_kodu,
        zaman: taramaZamani,
        etiket_durumu: sonuc.durum,
        etiket_mesaji: sonuc.mesaj,
      },
    })
    return sonuc
  }, [])

  // Çıta onay durumu (gösterge ekranından gelir) — her zaman görünür
  const [citaOnay, setCitaOnay] = useState<{
    bekliyor: boolean
    eski: number | null
    yeni: number | null
    mevcut: number | null
  }>({ bekliyor: false, eski: null, yeni: null, mevcut: null })

  // Saat
  useEffect(() => {
    const t = setInterval(() => setSaat(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Batch camlarını Supabase'den yükle
  const batchYukle = useCallback(async (loadBatchId: string, batchNoStr: string) => {
    // 1000+ camlı büyük batch'lerde satır kesilmesin diye sayfalı okunur.
    let data: any[] = []
    try {
      data = await tumSatirlariGetir(
        (from, to) =>
          supabase
            .from('uretim_emri_detaylari')
            .select(`
              id, siparis_detay_id, sira_no,
              siparis_detaylari (
                siparis_id, cam_kodu, uretim_durumu, genislik_mm, yukseklik_mm, adet, poz,
                stok!stok_id ( kod, ad, grup, katman_yapisi ),
                cita_stok:stok!cita_stok_id ( kalinlik_mm ),
                siparisler ( siparis_no, alt_musteri, cari ( ad ) )
              )
            `, { count: 'exact' })
            .eq('uretim_emri_id', loadBatchId)
            .range(from, to),
        { baglam: `batch ${loadBatchId} camları (kumanda)` },
      )
    } catch (e) {
      console.error('Batch camlari getirilemedi:', e)
    }

    const hamCamlar: BatchCamKumanda[] = (data ?? []).map((d: any) => ({
      uretim_emri_detay_id: d.id,
      siparis_detay_id: d.siparis_detay_id,
      siparis_id: d.siparis_detaylari?.siparis_id ?? '',
      cam_kodu: fizikselGlsKodu(d.sira_no, d.siparis_detaylari.cam_kodu),
      teknik_cam_kodu: d.siparis_detaylari.cam_kodu,
      musteri: d.siparis_detaylari.siparisler?.cari?.ad ?? '',
      nihai_musteri: d.siparis_detaylari.siparisler?.alt_musteri ?? '',
      siparis_no: d.siparis_detaylari.siparisler?.siparis_no ?? '',
      poz: d.siparis_detaylari.poz ?? '',
      liste_adedi: 0,
      uretim_durumu: d.siparis_detaylari.uretim_durumu,
      genislik_mm: d.siparis_detaylari.genislik_mm,
      yukseklik_mm: d.siparis_detaylari.yukseklik_mm,
      adet: d.siparis_detaylari.adet ?? 1,
      taranan_adet: 0,
      stok_ad: d.siparis_detaylari.stok?.ad ?? '',
      sira_no: d.sira_no ?? null,
      katman_yapisi: getCamKompozisyon({}, d.siparis_detaylari.stok ?? null) || null,
      cita_kalinlik_mm: d.siparis_detaylari.cita_stok?.kalinlik_mm ?? null,
    }))

    const siparisIds = [...new Set(hamCamlar.map(c => c.siparis_id).filter(Boolean))]
    const siparisToplamMap = new Map<string, number>()
    if (siparisIds.length > 0) {
      try {
        const detaySatirlari = await tumSatirlariGetir(
          (from, to) =>
            supabase
              .from('siparis_detaylari')
              .select('siparis_id, adet', { count: 'exact' })
              .in('siparis_id', siparisIds)
              .range(from, to),
          { baglam: 'kumanda sipariş toplam adet' },
        )
        for (const satir of detaySatirlari) {
          const sid = satir.siparis_id as string
          siparisToplamMap.set(sid, (siparisToplamMap.get(sid) ?? 0) + (satir.adet ?? 1))
        }
      } catch (e) {
        console.error('Sipariş toplam adet getirilemedi:', e)
      }
    }

    const camlar = hamCamlar.map(c => ({
      ...c,
      liste_adedi: siparisToplamMap.get(c.siparis_id) ?? 0,
    }))

    const logCountMap = await yikamaLogSayilariGetir([loadBatchId])

    const camlarFinal = camlar.map(c => ({
      ...c,
      taranan_adet: tarananAdetHesapla(
        c.uretim_durumu,
        c.adet,
        c.uretim_emri_detay_id,
        logCountMap,
      ),
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
      e.tamamlandi += camTarananSayisi(c)
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

  // Gelen kisa GLS koduna scroll
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
      .on('broadcast', { event: 'cita_onay_durumu' }, ({ payload }) => {
        const p = payload as any
        if (p.bekliyor) {
          setCitaOnay({ bekliyor: true, eski: p.eski ?? null, yeni: p.yeni ?? null, mevcut: null })
        } else {
          setCitaOnay({ bekliyor: false, eski: null, yeni: null, mevcut: p.mevcut ?? null })
        }
      })
      .on('broadcast', { event: 'batch_secildi' }, ({ payload }) => {
        batchYukle(payload.batch_id, payload.batch_no)
        setKartlar([])
        setCitaOnay({ bekliyor: false, eski: null, yeni: null, mevcut: null })
      })
      .on('broadcast', { event: 'yeni_cam' }, ({ payload }) => {
        const p = payload as YeniCamPayload
        const cam = batchCamlariRef.current.find(c =>
          p.uretim_emri_detay_id
            ? c.uretim_emri_detay_id === p.uretim_emri_detay_id
            : c.cam_kodu === p.cam_kodu,
        )

        // Tekrar girilen camlar kartlara eklenmez, sadece sayı güncellenir
        if (!p.tekrar) {
          const yeniKart: CamKarti = {
            ...(payload as Omit<CamKarti, 'etiket_durumu' | 'etiket_mesaji' | 'tamirde'>),
            etiket_durumu: p.etiket_durumu ?? 'gonderiliyor',
            etiket_mesaji: p.etiket_mesaji ?? 'Kumanda Paneli yazıcı köprüsüne gönderiyor.',
            tamirde: false,
          }
          setKartlar(prev => [yeniKart, ...prev].slice(0, 10))
          setFlash(true)
          setTimeout(() => setFlash(false), 600)
        }
        // Sol panelde sayıları güncelle + aktif müşteriyi seç
        setBatchCamlari(prev => prev.map(c => {
          if (p.uretim_emri_detay_id
            ? c.uretim_emri_detay_id !== p.uretim_emri_detay_id
            : c.cam_kodu !== p.cam_kodu
          ) return c
          const yeniTaranan = c.taranan_adet + 1
          const tamam = yeniTaranan >= c.adet
          return { ...c, taranan_adet: yeniTaranan, uretim_durumu: tamam ? 'yikandi' : c.uretim_durumu }
        }))
        if (p.musteri) {
          const nihai = p.nihai_musteri ?? cam?.nihai_musteri ?? ''
          setAktifMusteri(`${p.musteri}||${nihai}`)
        }
        setSonGelenKod(p.cam_kodu ?? null)
        // Onay beklenmiyorsa aktif çıta mm bilgisini güncelle
        if (p.cita_kalinlik_mm != null) {
          setCitaOnay(prev => prev.bekliyor
            ? prev
            : { bekliyor: false, eski: null, yeni: null, mevcut: p.cita_kalinlik_mm ?? null })
        }

        // Yazıcı köprüsü Kumanda bilgisayarında çalışır. Bu nedenle fiziksel baskı
        // Poz Giriş cihazından değil, broadcast'i alan Kumanda Paneli'nden yapılır.
        const taramaZamani = p.zaman ?? Date.now()
        const etiketIstekId = `${p.uretim_emri_detay_id ?? p.cam_kodu ?? 'bilinmeyen'}:${taramaZamani}`
        if (!islenenEtiketIstekleriRef.current.has(etiketIstekId)) {
          islenenEtiketIstekleriRef.current.add(etiketIstekId)
          if (islenenEtiketIstekleriRef.current.size > 250) {
            const ilkIstek = islenenEtiketIstekleriRef.current.values().next().value
            if (ilkIstek) islenenEtiketIstekleriRef.current.delete(ilkIstek)
          }

          const etiketVeri: EtiketVeri = {
            cam_kodu: p.cam_kodu ?? cam?.cam_kodu ?? '',
            cam_tipi: p.cam_tipi ?? '',
            cari_adi: p.musteri ?? cam?.musteri ?? '',
            alt_musteri: p.nihai_musteri ?? cam?.nihai_musteri ?? '',
            siparis_no: p.siparis_no ?? cam?.siparis_no ?? '',
            poz: p.poz ?? cam?.poz ?? '',
            liste_adedi: p.liste_adedi ?? cam?.liste_adedi ?? 0,
            batch_sira: p.sira_no ?? cam?.sira_no ?? null,
            genislik_mm: p.genislik_mm ?? cam?.genislik_mm ?? 0,
            yukseklik_mm: p.yukseklik_mm ?? cam?.yukseklik_mm ?? 0,
          }

          void kumandadanEtiketYazdir(etiketVeri, taramaZamani).catch(error => {
            console.error('Kumanda Paneli etiket baskısı tamamlanamadı:', error)
          })
        }
      })
      .on('broadcast', { event: 'etiket_durumu' }, ({ payload }) => {
        const p = payload as EtiketDurumuPayload
        if (!p.cam_kodu || !p.etiket_durumu) return
        let ilkEslesmeGuncellendi = false
        setKartlar(prev => prev.map(k => {
          if (ilkEslesmeGuncellendi || k.cam_kodu !== p.cam_kodu) return k
          if (p.zaman != null && k.zaman !== p.zaman) return k
          ilkEslesmeGuncellendi = true
          return {
            ...k,
            etiket_durumu: p.etiket_durumu!,
            etiket_mesaji: p.etiket_mesaji ?? k.etiket_mesaji,
          }
        }))
      })
      .on('broadcast', { event: 'cam_tamire_gonderildi' }, ({ payload }) => {
        const p = payload as TamirOlayPayload
        if (!p.cam_kodu) return
        setKartlar(prev => prev.map(k => k.cam_kodu === p.cam_kodu ? { ...k, tamirde: true } : k))
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    channelRef.current = channel
    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [batchYukle, kumandadanEtiketYazdir])

  return (
    <div className={`h-screen text-white flex flex-col transition-colors duration-300 ${flash ? 'bg-gray-900' : 'bg-black'}`}>
      {/* Üst bar */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b shrink-0"
        style={citaOnay.bekliyor ? {
          animation: 'citaUyariPulse 1.2s ease-in-out infinite',
          borderColor: 'rgba(234,179,8,0.6)',
        } : {
          borderColor: 'rgb(31,41,55)',
        }}
      >
        <button onClick={() => navigate('/istasyonlar')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          {batchNo && (
            <span className="font-mono font-black text-xl text-blue-400 tracking-widest">{batchNo}</span>
          )}
          {/* Çıta onay durumu — her zaman görünür; normalde yeşil, onayda sarı */}
          {citaOnay.bekliyor ? (
            <div className="h-11 flex items-center gap-2 px-3 rounded-xl font-bold bg-yellow-500/20 border border-yellow-400 text-yellow-300">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0 animate-pulse" />
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-[10px] text-yellow-400/80 uppercase tracking-wide">Çıta — Onay bekliyor</span>
                <span className="tabular-nums text-sm font-black whitespace-nowrap">
                  {citaOnay.eski ?? '?'} → {citaOnay.yeni ?? '?'} mm
                </span>
              </div>
            </div>
          ) : (
            <div className="h-11 flex items-center gap-2 px-3 rounded-xl text-sm font-bold bg-emerald-900/60 border border-emerald-700 text-emerald-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Çıta — Aktif</span>
                <span className="tabular-nums whitespace-nowrap">
                  {citaOnay.mevcut != null ? `${citaOnay.mevcut} mm` : '—'}
                </span>
              </div>
            </div>
          )}
          <div className={`h-11 flex items-center gap-2 px-3 rounded-xl text-sm font-bold ${
            connected ? 'bg-emerald-900/60 border border-emerald-700 text-emerald-300' : 'bg-red-900/60 border border-red-700 text-red-300'
          }`}>
            {connected ? <Wifi size={16} className="shrink-0" /> : <WifiOff size={16} className="shrink-0" />}
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[10px] text-gray-400">SUNUCU</span>
              <span>{connected ? 'ÇEVRİMİÇİ' : 'ÇEVRİMDIŞI'}</span>
            </div>
          </div>
          <div
            title={kopruMesaji}
            className={`h-11 flex items-center gap-2 px-3 rounded-xl text-sm font-bold ${
              kopruBagli === true
                ? 'bg-emerald-900/60 border border-emerald-700 text-emerald-300'
                : kopruBagli === false
                  ? 'bg-red-900/60 border border-red-700 text-red-300'
                  : 'bg-gray-900/60 border border-gray-700 text-gray-300'
            }`}
          >
            <Printer size={16} className="shrink-0" />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[10px] text-gray-400">YAZICI KÖPRÜ</span>
              <span>{kopruBagli === true ? 'BAĞLI' : kopruBagli === false ? 'BAĞLI DEĞİL' : 'KONTROL'}</span>
            </div>
          </div>
        </div>
        <span className="font-mono font-bold text-white text-xl tabular-nums tracking-wide">
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
          <div className="flex-1 overflow-y-auto kumanda-scroll">
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
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-base font-bold leading-tight whitespace-normal break-words flex-1 min-w-0 ${
                        tamam ? 'text-emerald-300' : aktif ? 'text-white' : 'text-gray-200'
                      }`}>
                        {m.etiket || '—'}
                      </span>
                      <span className={`text-sm font-bold tabular-nums shrink-0 ${
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
        <div className="flex-1 flex flex-col px-6 py-3 overflow-y-auto gap-2 kumanda-scroll">
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
                  <p className="text-sm text-gray-700 mt-2">Poz Giriş'ten sıra no girildiğinde burada görünecek</p>
                </>
              )}
            </div>
          ) : (
            kartlar.map((k) => {
              const batchCam = batchCamlari.find(c => c.cam_kodu === k.cam_kodu)
              const etiketDurumu = (() => {
                switch (k.etiket_durumu) {
                  case 'yaziciya_gonderildi':
                    return { metin: 'Yazıcıya Gönderildi', renk: 'text-emerald-400', nokta: 'bg-emerald-400' }
                  case 'basarisiz':
                    return { metin: 'Baskı Başarısız', renk: 'text-red-400', nokta: 'bg-red-400' }
                  case 'devre_disi':
                    return { metin: 'Baskı Devre Dışı', renk: 'text-gray-400', nokta: 'bg-gray-500' }
                  default:
                    return { metin: 'Etiket Gönderiliyor', renk: 'text-amber-300', nokta: 'bg-amber-300 animate-pulse' }
                }
              })()
              return (
                <div
                  key={`${k.cam_kodu}-${k.zaman}`}
                  className={`rounded-xl border-2 px-4 py-3 ${
                    k.tamirde
                      ? 'tamir-karti-uyari border-red-500 bg-red-950/70'
                      : 'bg-gray-900/70 border-gray-800'
                  }`}
                >
                  {/* Üst satır: GLS + BOYUT büyük puntolarla + etiket durumu + tamir butonu */}
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="shrink-0">
                        <div className="text-[10px] text-amber-500/80 uppercase tracking-widest font-black mb-0.5">GLS</div>
                        <div className="font-black text-amber-300 text-4xl leading-none tabular-nums">
                          {batchCam?.sira_no != null ? `#${batchCam.sira_no}` : '—'}
                        </div>
                      </div>
                      <div className="h-10 w-px bg-gray-700 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-0.5">BOYUT</div>
                        <div className="font-black text-white text-4xl leading-none tabular-nums whitespace-nowrap">
                          {k.genislik_mm} × {k.yukseklik_mm}
                          <span className="text-xl text-gray-400 font-bold ml-1.5">mm</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {k.tamirde && (
                        <span className="flex items-center gap-1.5 text-xs text-red-200 font-black uppercase tracking-wide whitespace-nowrap bg-red-900/70 border border-red-500 rounded-full px-3 py-1.5">
                          <Wrench size={13} />
                          Tamire Gönderildi
                        </span>
                      )}
                      <span
                        className={`flex items-center gap-1.5 text-xs font-bold whitespace-nowrap ${etiketDurumu.renk}`}
                        title={k.etiket_mesaji}
                      >
                        <span className={`w-2 h-2 rounded-full ${etiketDurumu.nokta}`} />
                        {etiketDurumu.metin}
                      </span>
                      <button
                        type="button"
                        disabled={!batchCam || k.etiket_durumu === 'gonderiliyor'}
                        onClick={() => {
                          if (!batchCam) return
                          void kumandadanEtiketYazdir({
                            cam_kodu: batchCam.cam_kodu,
                            cam_tipi: k.cam_tipi,
                            cari_adi: batchCam.musteri,
                            alt_musteri: batchCam.nihai_musteri,
                            siparis_no: batchCam.siparis_no,
                            poz: batchCam.poz,
                            liste_adedi: batchCam.liste_adedi,
                            batch_sira: batchCam.sira_no,
                            genislik_mm: batchCam.genislik_mm,
                            yukseklik_mm: batchCam.yukseklik_mm,
                          }, k.zaman)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-700 bg-blue-950/70 px-2.5 py-1.5 text-xs font-bold text-blue-300 hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Bu etiketi Kumanda bilgisayarındaki köprüden yeniden yazdır"
                      >
                        <Printer size={13} />
                        Yeniden Yazdır
                      </button>
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
                        <Wrench size={20} />
                      </button>
                    </div>
                  </div>

                  {/* Detay grid: ikincil bilgiler daha küçük */}
                  <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-700/80">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-0.5">POZ</div>
                      <div className="font-bold text-white text-base leading-tight break-words">{batchCam?.poz || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-0.5">CAM TÜRÜ</div>
                      <div className="font-bold text-white text-base leading-tight break-words">{k.cam_tipi || batchCam?.stok_ad || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-0.5">ÇITA KALINLIĞI</div>
                      <div className="font-black text-amber-300 text-base leading-tight tabular-nums">
                        {(() => {
                          const mm = batchCam?.cita_kalinlik_mm
                          if (mm != null) return `${mm} mm`
                          if (batchCam?.katman_yapisi) {
                            const p = batchCam.katman_yapisi.split('+')
                            const ara = p.length >= 3 ? Number(p[1]) : null
                            if (ara) return `${ara} mm`
                          }
                          return <span className="text-gray-600">—</span>
                        })()} 
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ===== SAĞ: Aktif Müşteri Cam Listesi ===== */}
        <div className="w-96 shrink-0 border-l-2 border-gray-700 bg-gray-900/40 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b-2 border-gray-700 shrink-0">
            {aktifMusteri ? (
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-0.5">Seçili Müşteri</p>
                <p className="text-base font-bold text-white whitespace-normal break-words leading-tight">
                  {aktifMusteriCamlari[0]?.nihai_musteri || aktifMusteriCamlari[0]?.musteri || '—'}
                </p>
              </div>
            ) : (
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Müşteri seçilmedi</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto kumanda-scroll" ref={sagListeRef}>
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
                      className={`px-5 py-4 flex items-center gap-4 transition-colors ${
                        aktifSatir
                          ? 'bg-green-950/60 border-l-4 border-l-green-400 animate-pulse'
                          : girildi
                          ? 'opacity-40'
                          : ''
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1 shrink-0 w-14">
                        <span className={`font-mono text-2xl font-black leading-none tabular-nums ${
                          girildi ? 'text-gray-500' : 'text-amber-300'
                        }`}>{c.cam_kodu}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          girildi
                            ? 'bg-emerald-900/60 text-emerald-300'
                            : kismi
                            ? 'bg-amber-900/60 text-amber-300'
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          {girildi ? `${c.adet}/${c.adet}` : `${c.taranan_adet}/${c.adet}`}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-2xl font-black leading-tight tabular-nums ${
                          girildi ? 'text-gray-500' : 'text-white'
                        }`}>{c.genislik_mm} × {c.yukseklik_mm}<span className="text-base font-bold ml-1 text-gray-400">mm</span></p>
                        {c.stok_ad && (
                          <p className={`text-sm font-semibold mt-0.5 truncate ${
                            girildi ? 'text-gray-600' : 'text-white'
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
          onSuccess={() => {
            const gonderilenCam = tamirCam
            setKartlar(prev => prev.map(k => k.cam_kodu === gonderilenCam.cam_kodu ? { ...k, tamirde: true } : k))
            void channelRef.current?.send({
              type: 'broadcast',
              event: 'cam_tamire_gonderildi',
              payload: {
                cam_kodu: gonderilenCam.cam_kodu,
                batch_no: gonderilenCam.batch_no,
                musteri: gonderilenCam.musteri,
                nihai_musteri: gonderilenCam.nihai_musteri,
                genislik_mm: gonderilenCam.genislik_mm,
                yukseklik_mm: gonderilenCam.yukseklik_mm,
              },
            })
            setTamirCam(null)
          }}
        />
      )}
    </div>
  )
}
