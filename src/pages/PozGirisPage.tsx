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
import { getCamKompozisyon, getEtiketCamTipi } from '@/lib/cam'
import { glsSayacArttir } from '@/lib/saatlikSayac'
import { fizikselGlsKodu, normalizeBatchSiraInput } from '@/lib/siparisDetay'
import { recalculateSiparisDurumu, recalculateUretimEmriDurumu } from '@/services/durumService'
import { tumSatirlariGetir } from '@/lib/supabasePagination'
import { camTarananSayisi, tarananAdetHesapla, yikamaLogSayilariGetir } from '@/lib/yikamaLoglari'
import { useAuth } from '@/auth/AuthContext'

/* ========== Tipler ========== */

interface BatchMusteriOzet {
  musteri: string
  altMusteri: string
}

interface BatchSatir {
  id: string
  batch_no: string
  durum: UretimEmriDurum
  toplam_cam: number
  taranan_cam: number
  musteriler: BatchMusteriOzet[]
}

interface BatchCam {
  uretim_emri_detay_id: string
  siparis_detay_id: string
  siparis_id: string
  cam_kodu: string
  teknik_cam_kodu: string
  genislik_mm: number
  yukseklik_mm: number
  adet: number
  poz: string
  liste_adedi: number
  taranan_adet: number  // kaç adet yıkamadan geçti (yikama_loglari'dan)
  katman_yapisi: string | null  // Model B: tek otorite, ör. "4+16+4" / "4+12+4+16+5"
  ic_kalinlik_mm: number | null  // stok.kalinlik_mm (yalnız etiket bilgisi için)
  cita_kalinlik_mm: number | null  // cita_stok.kalinlik_mm = ara boşluk (gösterge ekranı)
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
  durum: 'ok' | 'tekrar' | 'hata' | 'yanlis_batch' | 'tamir'
}

interface TamirOlayPayload {
  cam_kodu?: string
  batch_no?: string
  musteri?: string
  genislik_mm?: number
  yukseklik_mm?: number
}

type TaramaDurum = 'bos' | 'yukleniyor' | 'basarili' | 'hata' | 'tekrar' | 'yanlis_batch' | 'tamamlandi'

/* ========== Yardımcılar ========== */

/** Müşteri / alt müşteri alfabetik sıralama (TR) */
function musteriSirala<T extends { musteri: string; altMusteri?: string; nihai_musteri?: string }>(a: T, b: T) {
  const c = a.musteri.localeCompare(b.musteri, 'tr')
  if (c !== 0) return c
  const aAlt = a.altMusteri ?? a.nihai_musteri ?? ''
  const bAlt = b.altMusteri ?? b.nihai_musteri ?? ''
  return aAlt.localeCompare(bAlt, 'tr')
}

/** Sekme kapanırken Supabase güncellemesi — keepalive ile tamamlanır */
function supabaseKeepalivePatch(
  table: string,
  filter: string,
  body: Record<string, unknown>,
) {
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  fetch(`${url}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => { /* sekme kapanıyor — sessiz */ })
}

function batchTarananSayisi(camlar: BatchCam[]) {
  return camlar.reduce((sum, c) => sum + camTarananSayisi(c), 0)
}

function batchToplamSayisi(camlar: BatchCam[]) {
  return camlar.reduce((sum, c) => sum + c.adet, 0)
}

/** Aktif batch'ten çıkış — geri tuşu ve sekme kapanışında aynı mantık */
async function batchTenCikIsle(
  batch: BatchSatir,
  camlar: BatchCam[],
  keepalive = false,
) {
  // Yalnızca aktif yıkama oturumundan çıkışta işlem yap
  if (batch.durum !== 'yikamada') return

  const taranan = batchTarananSayisi(camlar)
  const toplam = batchToplamSayisi(camlar)

  if (taranan > 0 && taranan < toplam) {
    // Kısmi ilerleme (adet bazlı taramalar dahil) → eksik_var
    // Not: recalculateUretimEmriDurumu yalnızca satır bazlı 'yikandi' sayar;
    // kısmi adet taramalarında batch'i yikamada bırakır — bu yüzden açıkça set edilir.
    if (keepalive) {
      supabaseKeepalivePatch('uretim_emirleri', `id=eq.${batch.id}`, { durum: 'eksik_var' })
      const eksikCamlar = camlar.filter(c => c.uretim_durumu !== 'yikandi')
      const eksikSiparisIds = [...new Set(eksikCamlar.map(c => c.siparis_id))]
      if (eksikSiparisIds.length > 0) {
        supabaseKeepalivePatch(
          'siparisler',
          `id=in.(${eksikSiparisIds.join(',')})`,
          { durum: 'eksik_var' },
        )
      }
      const tamamSiparisIds = [...new Set(camlar.map(c => c.siparis_id))]
        .filter(sid => !eksikSiparisIds.includes(sid))
      if (tamamSiparisIds.length > 0) {
        supabaseKeepalivePatch(
          'siparisler',
          `id=in.(${tamamSiparisIds.join(',')})`,
          { durum: 'tamamlandi' },
        )
      }
    } else {
      await supabase
        .from('uretim_emirleri')
        .update({ durum: 'eksik_var' })
        .eq('id', batch.id)
      const tumSiparisIds = [...new Set(camlar.map(c => c.siparis_id))]
      for (const sipId of tumSiparisIds) {
        await recalculateSiparisDurumu(sipId)
      }
    }
  } else if (taranan === 0) {
    if (keepalive) {
      supabaseKeepalivePatch('uretim_emirleri', `id=eq.${batch.id}`, { durum: 'export_edildi' })
    } else {
      await supabase
        .from('uretim_emirleri')
        .update({ durum: 'export_edildi' })
        .eq('id', batch.id)
      const tumSiparisIds = [...new Set(camlar.map(c => c.siparis_id))]
      for (const sipId of tumSiparisIds) {
        await recalculateSiparisDurumu(sipId)
      }
    }
  } else if (taranan >= toplam) {
    if (keepalive) {
      supabaseKeepalivePatch('uretim_emirleri', `id=eq.${batch.id}`, { durum: 'tamamlandi' })
    } else {
      await recalculateUretimEmriDurumu(batch.id)
    }
    const tumSiparisIds = [...new Set(camlar.map(c => c.siparis_id))]
    if (!keepalive) {
      for (const sipId of tumSiparisIds) {
        await recalculateSiparisDurumu(sipId)
      }
    }
  }
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
  const { hasPermission } = useAuth()
  const canCreateRepair = hasPermission('production_stations', 'update')
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
  const [tamirCam, setTamirCam] = useState<BatchCam | null>(null)
  const [tamirGonderildi, setTamirGonderildi] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const sagListeRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const resetTimerRef = useRef<number | null>(null)
  const seciliBatchRef = useRef<BatchSatir | null>(null)
  const batchCamlariRef = useRef<BatchCam[]>([])
  const batchTemizlendiRef = useRef(false)

  // Saat
  useEffect(() => {
    const t = setInterval(() => setSaat(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Realtime kanal
  useEffect(() => {
    const ch = supabase
      .channel('uretim-istasyonlar')
      .on('broadcast', { event: 'cam_tamire_gonderildi' }, ({ payload }) => {
        const p = payload as TamirOlayPayload
        if (!p.cam_kodu || (p.batch_no && p.batch_no !== seciliBatchRef.current?.batch_no)) return
        setGecmis(prev => [{
          cam_kodu: p.cam_kodu!,
          musteri: p.musteri ?? '—',
          boyut: p.genislik_mm != null && p.yukseklik_mm != null
            ? `${p.genislik_mm}×${p.yukseklik_mm}`
            : '—',
          zaman: new Date(),
          durum: 'tamir' as const,
        }, ...prev].slice(0, 15))
      })
    ch.subscribe((status) => setConnected(status === 'SUBSCRIBED'))
    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Batch listesini getir
  const batchleriGetir = useCallback(async () => {
    setBatchYukleniyor(true)
    try {
      const { data: emirler, error: emirHatasi } = await supabase
        .from('uretim_emirleri')
        .select('id, batch_no, durum')
        .in('durum', ['export_edildi', 'yikamada', 'eksik_var'])
        .order('olusturulma_tarihi', { ascending: false })

      if (emirHatasi) {
        console.error('Batch listesi getirme hatası:', emirHatasi)
        setBatchYukleniyor(false)
        return
      }

      if (!emirler || emirler.length === 0) {
        setBatchler([])
        setBatchYukleniyor(false)
        return
      }

      const emirIds = emirler.map(e => e.id)

      let tumDetaylar: any[]
      try {
        tumDetaylar = await tumSatirlariGetir(
          (from, to) =>
            supabase
              .from('uretim_emri_detaylari')
              .select(`
                id, uretim_emri_id, siparis_detay_id,
                siparis_detaylari (
                  id, uretim_durumu, adet,
                  siparisler ( siparis_no, alt_musteri, cari ( ad ) )
                )
              `, { count: 'exact' })
              .in('uretim_emri_id', emirIds)
              .range(from, to),
          { baglam: 'batch listesi detayları' },
        )
      } catch (detayHatasi) {
        console.error('Batch detay getirme hatası:', detayHatasi)
        setBatchYukleniyor(false)
        return
      }

      const logMap = await yikamaLogSayilariGetir(emirIds)

      const detayMap = new Map<string, { toplam: number; taranan: number; musteriMap: Map<string, BatchMusteriOzet> }>()
      for (const d of tumDetaylar) {
        const entry = detayMap.get(d.uretim_emri_id) ?? { toplam: 0, taranan: 0, musteriMap: new Map() }
        const detay = d.siparis_detaylari
        const adet: number = detay?.adet ?? 1
        const uretimDurumu: string = detay?.uretim_durumu ?? ''
        entry.toplam += adet
        entry.taranan += tarananAdetHesapla(
          uretimDurumu,
          adet,
          d.id,
          logMap,
        )
        const musteriAd: string = detay?.siparisler?.cari?.ad ?? ''
        const nihai: string = detay?.siparisler?.alt_musteri ?? ''
        if (musteriAd || nihai) {
          const key = `${musteriAd}||${nihai}`
          entry.musteriMap.set(key, { musteri: musteriAd, altMusteri: nihai })
        }
        detayMap.set(d.uretim_emri_id, entry)
      }

      const sonuc: BatchSatir[] = emirler.map(e => {
        const d = detayMap.get(e.id) ?? { toplam: 0, taranan: 0, musteriMap: new Map() }
        return {
          id: e.id,
          batch_no: e.batch_no,
          durum: e.durum as UretimEmriDurum,
          toplam_cam: d.toplam,
          taranan_cam: d.taranan,
          musteriler: Array.from(d.musteriMap.values()).sort(musteriSirala),
        }
      })

      setBatchler(sonuc)
      setBatchYukleniyor(false)
    } catch (err) {
      console.error('Batch getirme hata:', err)
      setBatchYukleniyor(false)
    }
  }, [])

  useEffect(() => { batchleriGetir() }, [batchleriGetir])

  useEffect(() => { seciliBatchRef.current = seciliBatch }, [seciliBatch])
  useEffect(() => { batchCamlariRef.current = batchCamlari }, [batchCamlari])

  // Sekme kapanışı ve sayfa ayrılışında batch'i geri tuşu ile aynı şekilde kapat
  useEffect(() => {
    const onPageHide = () => {
      const batch = seciliBatchRef.current
      if (!batch || batchTemizlendiRef.current) return
      batchTemizlendiRef.current = true
      void batchTenCikIsle(batch, batchCamlariRef.current, true)
    }

    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      const batch = seciliBatchRef.current
      if (!batch || batchTemizlendiRef.current) return
      batchTemizlendiRef.current = true
      void batchTenCikIsle(batch, batchCamlariRef.current)
    }
  }, [])

  // Batch seçildiğinde cam listesini getir
  const batchCamlariniGetir = useCallback(async (batchId: string) => {
    let data: any[]
    try {
      // 1000+ camlı büyük batch'lerde satır kesilmesin diye sayfalı okunur.
      data = await tumSatirlariGetir(
        (from, to) =>
          supabase
            .from('uretim_emri_detaylari')
            .select(`
              id, siparis_detay_id, sira_no,
              siparis_detaylari (
                siparis_id, cam_kodu, genislik_mm, yukseklik_mm, adet, poz,
                uretim_durumu,
                stok!stok_id ( kod, ad, grup, kalinlik_mm, katman_yapisi, birim_fiyat ),
                cita_stok:stok!cita_stok_id ( kalinlik_mm ),
                siparisler ( siparis_no, alt_musteri, cari ( ad ) )
              )
            `, { count: 'exact' })
            .eq('uretim_emri_id', batchId)
            .order('sira_no')
            .range(from, to),
        { baglam: `batch ${batchId} camları` },
      )
    } catch (error) {
      console.error('Batch camlari getirilemedi:', error)
      setBatchCamlari([])
      return []
    }

    const hamCamlar: BatchCam[] = (data ?? []).flatMap((d: any) => {
      const detay = d.siparis_detaylari
      if (!detay) return []
      return [{
      uretim_emri_detay_id: d.id,
      siparis_detay_id: d.siparis_detay_id,
      siparis_id: detay.siparis_id,
      cam_kodu: fizikselGlsKodu(d.sira_no, detay.cam_kodu),
      teknik_cam_kodu: detay.cam_kodu,
      genislik_mm: detay.genislik_mm,
      yukseklik_mm: detay.yukseklik_mm,
      adet: detay.adet ?? 1,
      poz: detay.poz ?? '',
      liste_adedi: 0,
      taranan_adet: 0,  // aşağıda yikama_loglari ile doldurulacak
      katman_yapisi: getCamKompozisyon({}, detay.stok ?? null) || null,
      ic_kalinlik_mm: detay.stok?.kalinlik_mm ?? null,
      cita_kalinlik_mm: detay.cita_stok?.kalinlik_mm ?? null,
      sira_no: d.sira_no ?? null,
      uretim_durumu: detay.uretim_durumu,
      stok_ad: detay.stok?.ad ?? '',
      musteri: detay.siparisler?.cari?.ad ?? '',
      nihai_musteri: detay.siparisler?.alt_musteri ?? '',
      siparis_no: detay.siparisler?.siparis_no ?? '',
      }]
    })

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
          { baglam: 'sipariş toplam adet' },
        )
        for (const satir of detaySatirlari) {
          const sid = satir.siparis_id as string
          siparisToplamMap.set(sid, (siparisToplamMap.get(sid) ?? 0) + (satir.adet ?? 1))
        }
      } catch (error) {
        console.error('Sipariş toplam adet getirilemedi:', error)
      }
    }

    const camlar = hamCamlar.map(c => ({
      ...c,
      liste_adedi: siparisToplamMap.get(c.siparis_id) ?? 0,
    }))

    const logCountMap = await yikamaLogSayilariGetir([batchId])

    const camlarFinal = camlar.map(c => ({
      ...c,
      taranan_adet: tarananAdetHesapla(
        c.uretim_durumu,
        c.adet,
        c.uretim_emri_detay_id,
        logCountMap,
      ),
    }))

    setBatchCamlari(camlarFinal)
    return camlarFinal
  }, [])

  const handleBatchSec = async (batch: BatchSatir) => {
    batchTemizlendiRef.current = false
    setGecmis([])
    setDurum('bos')
    setSonTarananCam(null)
    setAktifMusteri(null)

    // export_edildi / eksik_var → yikamada: state'i DB'den önce güncelle (çıkışta stale durum kalmasın)
    const baslangicBatch =
      batch.durum === 'export_edildi' || batch.durum === 'eksik_var'
        ? { ...batch, durum: 'yikamada' as UretimEmriDurum }
        : batch
    setSeciliBatch(baslangicBatch)

    const camlar = await batchCamlariniGetir(batch.id)
    if (camlar && camlar.length > 0) {
      // Tamamlanmamış ilk müşteriyi bul; hepsi tamamlandıysa ilk müşteriden başla
      const ilkTamamlanmamis = camlar.find(c => c.uretim_durumu !== 'yikandi')
      const ilkCam = ilkTamamlanmamis ?? camlar[0]
      setAktifMusteri(`${ilkCam.musteri}||${ilkCam.nihai_musteri}`)
    }
    setTimeout(() => inputRef.current?.focus(), 100)

    // Batch henüz yıkamada değilse DB'ye yaz
    if (batch.durum === 'export_edildi' || batch.durum === 'eksik_var') {
      await supabase
        .from('uretim_emirleri')
        .update({ durum: 'yikamada' })
        .eq('id', batch.id)
    }

    const aktifBatch = baslangicBatch

    // Kumanda Paneli ve diğer istasyonlara aktif batch'i bildir
    channelRef.current?.send({
      type: 'broadcast',
      event: 'batch_secildi',
      payload: { batch_id: aktifBatch.id, batch_no: aktifBatch.batch_no },
    })
  }

  const handleBatchDegistir = async () => {
    const batch = seciliBatchRef.current
    if (batch && !batchTemizlendiRef.current) {
      batchTemizlendiRef.current = true
      await batchTenCikIsle(batch, batchCamlariRef.current)
    }
    setSeciliBatch(null)
    setBatchCamlari([])
    setDurum('bos')
    setSonTarananCam(null)
    setAktifMusteri(null)
    batchleriGetir()
  }

  // Input odak — tamir modalı açıkken arka plan input'u odağı çekmesin
  useEffect(() => {
    if (!seciliBatch || tamirCam) return
    inputRef.current?.focus()
    const t = setInterval(() => inputRef.current?.focus(), 800)
    return () => clearInterval(t)
  }, [seciliBatch, tamirCam])

  const sifirla = (ms = 4000) => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => {
      setDurum('bos')
      setSonTarananCam(null)
      setHataMesaji('')
    }, ms)
  }

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  const tarananSayisi = useMemo(
    () => batchCamlari.reduce((sum, c) => sum + camTarananSayisi(c), 0),
    [batchCamlari]
  )
  const toplamSayisi = useMemo(
    () => batchCamlari.reduce((sum, c) => sum + c.adet, 0),
    [batchCamlari]
  )

  const musteriListesi = useMemo(() => {
    const map = new Map<string, { key: string; musteri: string; altMusteri: string; toplam: number; tamamlandi: number }>()
    for (const c of batchCamlari) {
      const key = `${c.musteri}||${c.nihai_musteri}`
      const e = map.get(key) ?? {
        key,
        musteri: c.musteri,
        altMusteri: c.nihai_musteri,
        toplam: 0,
        tamamlandi: 0,
      }
      e.toplam += c.adet
      e.tamamlandi += camTarananSayisi(c)
      map.set(key, e)
    }
    return Array.from(map.values()).sort(musteriSirala)
  }, [batchCamlari])

  const aktifMusteriCamlari = useMemo(
    () => {
      if (!aktifMusteri) return []
      return batchCamlari
        .filter(c => `${c.musteri}||${c.nihai_musteri}` === aktifMusteri)
        .slice()
        .sort((a, b) => (a.sira_no ?? 0) - (b.sira_no ?? 0))
    },
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
    const kod = input.trim()
    const siraNo = normalizeBatchSiraInput(kod)
    if (!kod) return
    setInput('')
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    setDurum('yukleniyor')

    const cam = siraNo != null
      ? batchCamlari.find(c => c.sira_no === siraNo)
      : batchCamlari.find(c => c.cam_kodu === kod || c.teknik_cam_kodu.toUpperCase() === kod.toUpperCase())

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

    // Etiket içeriğini hazırla. Fiziksel baskıyı köprünün bulunduğu Kumanda Paneli yapar.
    const camTipiTam = getEtiketCamTipi(
      {},
      { ad: cam.stok_ad, kalinlik_mm: cam.ic_kalinlik_mm, katman_yapisi: cam.katman_yapisi },
    )

    if (!tekrar) {
      await supabase.from('yikama_loglari').insert({
        cam_kodu: cam.cam_kodu,
        siparis_detay_id: cam.siparis_detay_id,
        uretim_emri_detay_id: cam.uretim_emri_detay_id,
      })
    }

    // Saatlik üretim sayacını arttır (tekrar taramalarda sayma)
    if (!tekrar) glsSayacArttir().catch(err => console.error('Saatlik sayaç artırılamadı:', err))

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
          c.uretim_emri_detay_id === cam.uretim_emri_detay_id
            ? { ...c, uretim_durumu: 'yikandi', taranan_adet: yeniTarananadet }
            : c
        ))
      } else {
        // Kısmi tamamlama — sadece lokal sayacı güncelle
        setBatchCamlari(prev => prev.map(c =>
          c.uretim_emri_detay_id === cam.uretim_emri_detay_id
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

    // Taranan camın siparişinin durumunu yeniden hesapla (tekrar değilse)
    if (!tekrar) {
      await recalculateSiparisDurumu(cam.siparis_id)
    }

    // Broadcast — kumanda + gösterge
    const listeCamlari = batchCamlari.filter(c => c.siparis_id === cam.siparis_id)
    const listeToplam = listeCamlari.reduce((sum, c) => sum + c.adet, 0)
    const listeTaranan = listeCamlari.reduce((sum, c) => sum + camTarananSayisi(c), 0)
    const sonrakiBatchTaranan = Math.min(toplamSayisi, tarananSayisi + (tekrar ? 0 : 1))
    const sonrakiListeTaranan = Math.min(listeToplam, listeTaranan + (tekrar ? 0 : 1))
    const taramaZamani = Date.now()
    await channelRef.current?.send({
      type: 'broadcast',
      event: 'yeni_cam',
      payload: {
        cam_kodu: cam.cam_kodu,
        teknik_cam_kodu: cam.teknik_cam_kodu,
        siparis_detay_id: cam.siparis_detay_id,
        uretim_emri_detay_id: cam.uretim_emri_detay_id,
        sira_no: cam.sira_no,
        musteri: cam.musteri,
        nihai_musteri: cam.nihai_musteri ?? '',
        poz: cam.poz ?? '',
        liste_adedi: cam.liste_adedi,
        siparis_no: cam.siparis_no,
        cam_tipi: camTipiTam,
        genislik_mm: cam.genislik_mm,
        yukseklik_mm: cam.yukseklik_mm,
        adet: cam.adet,
        katman_yapisi: cam.katman_yapisi,
        cita_kalinlik_mm: cam.cita_kalinlik_mm,
        batch_no: seciliBatch.batch_no,
        batch_taranan: sonrakiBatchTaranan,
        batch_toplam: toplamSayisi,
        liste_no: cam.siparis_no,
        liste_taranan: sonrakiListeTaranan,
        liste_toplam: listeToplam,
        zaman: taramaZamani,
        tekrar: tekrar,
        etiket_durumu: 'gonderiliyor',
        etiket_mesaji: 'Kumanda Paneli yazıcı köprüsüne gönderecek.',
      },
    })

    setSonTarananCam({ ...cam, taranan_adet: tekrar ? cam.taranan_adet : yeniTarananadet })
    setAktifMusteri(`${cam.musteri}||${cam.nihai_musteri}`)

    // Tüm camlar yıkandı mı kontrol (her tarama 1 adet sayar)
    const yeniTaranan = tarananSayisi + (tekrar ? 0 : 1)
    if (yeniTaranan >= toplamSayisi) {
      beep('complete')
      setDurum('tamamlandi')
      await recalculateUretimEmriDurumu(seciliBatch.id)
      setSeciliBatch(prev => prev ? { ...prev, durum: 'tamamlandi' } : prev)

      const benzersizSiparisIdsTamam = [...new Set(batchCamlari.map(c => c.siparis_id))]
      for (const sipId of benzersizSiparisIdsTamam) {
        await recalculateSiparisDurumu(sipId)
      }
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
      <div className="h-screen overflow-y-auto kumanda-scroll bg-black text-white flex flex-col">
        {/* Üst bar */}
        <div className="relative flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
          <button onClick={() => navigate('/istasyonlar')} className="relative z-10 flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">Geri</span>
          </button>
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-black tracking-widest text-xl text-blue-400">POZ GİRİŞ</span>
          <div className="relative z-10 flex items-center gap-4">
            <span className="font-mono font-bold text-white text-xl tabular-nums tracking-wide">{saat.toLocaleTimeString('tr-TR')}</span>
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
                      {b.taranan_cam} / {b.toplam_cam} adet girildi
                    </div>
                    {b.musteriler.length > 0 && (
                      <div className="flex flex-col gap-1.5 mb-3">
                        {b.musteriler.map((m, i) => (
                          <div key={i} className="rounded-lg bg-gray-800/80 border border-gray-700 px-2.5 py-1.5">
                            <div className="flex items-baseline gap-2 min-w-0">
                              <span className="text-[10px] uppercase tracking-wide text-gray-500 shrink-0">Müşteri</span>
                              <span className="text-xs font-bold text-white truncate">{m.musteri || '—'}</span>
                            </div>
                            {m.altMusteri ? (
                              <div className="flex items-baseline gap-2 min-w-0 mt-0.5">
                                <span className="text-[10px] uppercase tracking-wide text-gray-500 shrink-0">Alt</span>
                                <span className="text-xs font-semibold text-blue-300 truncate">{m.altMusteri}</span>
                              </div>
                            ) : null}
                          </div>
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
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden">
      {/* Üst bar */}
      <div className="relative flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <button onClick={handleBatchDegistir} className="relative z-10 flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Batch Değiştir</span>
        </button>
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono font-black text-xl tracking-widest text-blue-400">
          {seciliBatch.batch_no}
        </span>
        <div className="relative z-10 flex items-center gap-4">
          <span className="font-mono font-bold text-white text-xl tabular-nums tracking-wide">
            {saat.toLocaleTimeString('tr-TR')}
          </span>
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
      </div>

      {/* 3 kolonlu ana içerik */}
      <div className="flex-1 flex overflow-hidden">

        {/* ===== SOL: Müşteri Listesi ===== */}
        <div className="w-80 shrink-0 border-r-2 border-gray-700 bg-gray-900/40 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b-2 border-gray-700 shrink-0">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400">Müşteriler</p>
          </div>
          <div className="flex-1 overflow-y-auto kumanda-scroll">
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
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] uppercase tracking-wide mb-0.5 ${
                        tamam ? 'text-emerald-500' : aktif ? 'text-blue-400' : 'text-gray-500'
                      }`}>Müşteri</p>
                      <p className={`text-base font-bold leading-tight whitespace-normal break-words ${
                        tamam ? 'text-emerald-300' : aktif ? 'text-white' : 'text-gray-200'
                      }`}>
                        {m.musteri || '—'}
                      </p>
                      {m.altMusteri ? (
                        <>
                          <p className={`text-[10px] uppercase tracking-wide mt-1.5 mb-0.5 ${
                            tamam ? 'text-emerald-500' : aktif ? 'text-blue-400' : 'text-gray-500'
                          }`}>Alt Müşteri</p>
                          <p className={`text-sm font-semibold leading-tight whitespace-normal break-words ${
                            tamam ? 'text-emerald-300/80' : aktif ? 'text-blue-300' : 'text-gray-400'
                          }`}>
                            {m.altMusteri}
                          </p>
                        </>
                      ) : null}
                    </div>
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${
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
          <div className="shrink-0 px-4 pt-4 pb-3">
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
          <div className="flex-1 flex flex-col items-center justify-center px-4 gap-3 overflow-y-auto py-3 kumanda-scroll">
            {/* Durum kartı */}
            <div className={`w-full border-2 rounded-2xl p-6 text-center transition-colors ${durumRenk(durum)}`}>
              {durum === 'bos' && !tamirGonderildi && (
                <>
                  <p className="text-gray-300 text-xl font-semibold mb-1">Sıra numarasını girin</p>
                  <p className="text-gray-500 text-sm">Seçili batch içindeki kısa GLS numarası</p>
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
                  {canCreateRepair && <button
                    onClick={() => setTamirCam(sonTarananCam)}
                    className="mt-3 flex items-center gap-2 mx-auto px-4 py-2 bg-red-900/50 hover:bg-red-800/70 border border-red-700 rounded-xl text-red-300 text-sm font-semibold transition-colors"
                  >
                    <Wrench size={14} />
                    Tamire Gönder
                    <kbd className="ml-1 px-1.5 py-0.5 rounded bg-red-950 border border-red-800 text-red-400 text-xs font-mono">X</kbd>
                  </button>}
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
                onKeyDown={e => {
                  if (
                    (e.key === 'x' || e.key === 'X') &&
                    !input &&
                    sonTarananCam &&
                    !tamirCam &&
                    durum !== 'tamamlandi' &&
                    canCreateRepair
                  ) {
                    e.preventDefault()
                    setTamirCam(sonTarananCam)
                  }
                }}
                placeholder="Sıra no girin..."
                className="w-full text-center text-2xl font-mono bg-gray-900 border-2 border-gray-700 rounded-xl px-6 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                autoComplete="off"
                disabled={durum === 'tamamlandi'}
              />
            </form>

            {/* Tamir butonu — yeni cam girilene kadar göster */}
            {canCreateRepair && sonTarananCam && durum !== 'basarili' && durum !== 'tamamlandi' && (
              <button
                onClick={() => setTamirCam(sonTarananCam)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-900/30 hover:bg-red-800/50 border border-red-800 rounded-xl text-red-400 text-sm font-semibold transition-colors"
              >
                <Wrench size={14} />
                {sonTarananCam.cam_kodu} — Tamire Gönder
                <kbd className="ml-1 px-1.5 py-0.5 rounded bg-red-950 border border-red-800 text-red-500 text-xs font-mono">X</kbd>
              </button>
            )}
          </div>

          {/* Alt: Geçmiş */}
          <div className="border-t border-gray-700 shrink-0 flex flex-col" style={{ height: '35%' }}>
            <div className="px-4 py-2.5 shrink-0 border-b border-gray-800">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Son İşlemler</p>
            </div>
            {gecmis.length === 0 ? (
              <div className="flex items-center justify-center flex-1">
                <p className="text-sm text-gray-600">Henüz giriş yapılmadı.</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 divide-y divide-gray-800 kumanda-scroll">
                {gecmis.map((g, i) => (
                  <div key={i} className={`flex items-center gap-4 px-4 py-3 ${
                    g.durum === 'tamir' ? 'bg-red-950/50 border-l-4 border-l-red-500' : i === 0 ? 'bg-gray-900/60' : ''
                  }`}>
                    <span className={`w-3 h-3 rounded-full shrink-0 ${
                      g.durum === 'ok' ? 'bg-green-400' :
                      g.durum === 'tekrar' ? 'bg-yellow-400' : 'bg-red-400'
                    }`} />
                    <span className="font-mono text-base font-bold text-white w-28 shrink-0">{g.cam_kodu}</span>
                    <span className="text-gray-300 text-base font-medium flex-1 truncate">{g.musteri}</span>
                    {g.durum === 'tamir' && (
                      <span className="text-xs font-black uppercase tracking-wide text-red-300 bg-red-900/60 border border-red-700 rounded-full px-3 py-1 shrink-0">
                        Tamire Gönderildi
                      </span>
                    )}
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
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-0.5">Müşteri</p>
                <p className="text-base font-bold text-white whitespace-normal break-words leading-tight">
                  {aktifMusteriCamlari[0]?.musteri || '—'}
                </p>
                {aktifMusteriCamlari[0]?.nihai_musteri ? (
                  <>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1.5 mb-0.5">Alt Müşteri</p>
                    <p className="text-sm font-semibold text-blue-300 whitespace-normal break-words leading-tight">
                      {aktifMusteriCamlari[0].nihai_musteri}
                    </p>
                  </>
                ) : null}
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
                    : 'Sol listeden müşteri seçin veya sıra no girin.'}
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

      {/* Tamir Modal */}
      {canCreateRepair && tamirCam && seciliBatch && (
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
            const gonderilenCam = tamirCam
            setGecmis(prev => [{
              cam_kodu: gonderilenCam.cam_kodu,
              musteri: gonderilenCam.musteri,
              boyut: `${gonderilenCam.genislik_mm}×${gonderilenCam.yukseklik_mm}`,
              zaman: new Date(),
              durum: 'tamir' as const,
            }, ...prev].slice(0, 15))
            void channelRef.current?.send({
              type: 'broadcast',
              event: 'cam_tamire_gonderildi',
              payload: {
                cam_kodu: gonderilenCam.cam_kodu,
                batch_no: seciliBatch.batch_no,
                musteri: gonderilenCam.musteri,
                nihai_musteri: gonderilenCam.nihai_musteri,
                genislik_mm: gonderilenCam.genislik_mm,
                yukseklik_mm: gonderilenCam.yukseklik_mm,
              },
            })
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
