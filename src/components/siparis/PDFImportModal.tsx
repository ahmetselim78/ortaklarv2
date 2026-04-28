import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Upload, FileText, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft, ZoomIn, ZoomOut, Loader2, Truck, PackageCheck, Plus } from 'lucide-react'
import { parsePDF, cariEslestir, stokEslestir, citaEslestir } from '@/lib/pdfParser'
import type { PDFParseResult, PDFCamSatir } from '@/lib/pdfParser'
import type { Stok } from '@/types/stok'
import type { CamFormSatiri } from '@/types/siparis'
import { cn, camTipiAd } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getDocument } from 'pdfjs-dist'
import { generateCariKod, generateStokKod } from '@/lib/idGenerator'

/* ===== PDF Sayfa Görüntüleyici ===== */
function PDFPageViewer({
  file,
  scale,
  page,
  onTotalPages,
}: {
  file: File
  scale: number
  page: number
  onTotalPages: (n: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const docRef = useRef<any>(null)
  const taskRef = useRef<any>(null)
  const cbRef = useRef(onTotalPages)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    cbRef.current = onTotalPages
  })

  useEffect(() => {
    let active = true
    setReady(false)
    taskRef.current?.cancel()
    if (docRef.current) {
      docRef.current.destroy()
      docRef.current = null
    }
    file
      .arrayBuffer()
      .then((buf) => {
        if (!active) return null
        return getDocument({
          data: buf,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/standard_fonts/',
        }).promise
      })
      .then((doc) => {
        if (!doc || !active) return
        docRef.current = doc
        cbRef.current(doc.numPages)
        setReady(true)
      })
      .catch(console.error)
    return () => {
      active = false
      taskRef.current?.cancel()
      docRef.current?.destroy()
      docRef.current = null
    }
  }, [file])

  useEffect(() => {
    if (!ready || !docRef.current || !canvasRef.current) return
    let active = true
    taskRef.current?.cancel()
    docRef.current
      .getPage(page)
      .then((pg: any) => {
        if (!active || !canvasRef.current) return
        const viewport = pg.getViewport({ scale })
        const canvas = canvasRef.current
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const task = pg.render({ canvasContext: ctx, viewport })
        taskRef.current = task
        return task.promise
      })
      .catch((e: any) => {
        if (e?.name !== 'RenderingCancelledException') console.error('[PDFViewer]', e)
      })
    return () => {
      active = false
    }
  }, [ready, page, scale])

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-blue-400" />
      </div>
    )
  }

  return <canvas ref={canvasRef} className="max-w-full shadow-sm rounded border border-gray-100" />
}

/** PDFCamSatir → grup anahtarı (dış kalınlık + tip metni). Aynı tipdeki satırlar
 *  tek seçim üzerinden yönetilir. */
function satirAnahtari(s: PDFCamSatir): string {
  const tip = s.aciklama
    .replace(/\d+\+\d+\+\d+/, '')
    .replace(/\b\d{5,8}\b/, '')
    .replace(/\*+/, '')
    .replace(/Ø\s*\d+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${s.dis_kalinlik_mm ?? '?'}|${tip.toLowerCase()}`
}

/** Aynı anahtara sahip ilk satırın temsilci açıklaması — UI'da göstermek için */
function satirGrupBilgi(s: PDFCamSatir): { aciklama: string; kalinlik: number | null; tip: string } {
  const tip = s.aciklama
    .replace(/\d+\+\d+\+\d+/, '')
    .replace(/\b\d{5,8}\b/, '')
    .replace(/\*+/, '')
    .replace(/Ø\s*\d+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return { aciklama: s.aciklama, kalinlik: s.dis_kalinlik_mm ?? null, tip }
}

interface Props {
  cariler: { id: string; ad: string; kod: string }[]
  stoklar: Stok[]
  onIceAktar: (form: {
    cari_id: string
    tarih: string
    teslim_tarihi?: string
    alt_musteri?: string
    notlar?: string
    teslimat_tipi?: string
    kaynak?: 'pdf' | 'manuel'
    camlar: CamFormSatiri[]
  }) => Promise<{ id: string; siparis_no: string; teslim_tarihi: string | null }>
  onStokYenile?: () => Promise<void> | void
  onKapat: () => void
}

type Adim = 'yukleme' | 'eslestirme' | 'onizleme' | 'sevkiyat'

export default function PDFImportModal({ cariler, stoklar, onIceAktar, onStokYenile, onKapat }: Props) {
  const [adim, setAdim] = useState<Adim>('yukleme')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [yuklemeDurum, setYuklemeDurum] = useState('')
  const [hata, setHata] = useState<string | null>(null)

  // Parse sonucu
  const [parseResult, setParseResult] = useState<PDFParseResult | null>(null)

  // Eşleştirme
  const [secilenCariId, setSecilenCariId] = useState<string>('')
  const [cariSkor, setCariSkor] = useState<number>(0)
  /** Her unique cam tipi-kalınlık kombinasyonu için stok seçimleri.
   *  Anahtar: "{disKalinlik}|{normalizeCamTipi(aciklama)}" */
  const [satirStokSecimler, setSatirStokSecimler] = useState<Record<string, { stokId: string; skor: number }>>({})
  const [mukerrer, setMukerrer] = useState(false)

  // Yerel cari listesi (prop + modal içinde yeni eklenenler)
  const [localCariler, setLocalCariler] = useState<{ id: string; ad: string; kod: string }[]>(() => cariler)
  // Yerel stok listesi (eklenenler dahil)
  const [localStoklar, setLocalStoklar] = useState<Stok[]>(() => stoklar)
  useEffect(() => { setLocalStoklar(stoklar) }, [stoklar])

  // Yeni cari ekleme (inline form)
  const [yeniCariGoster, setYeniCariGoster] = useState(false)
  const [yeniCariAd, setYeniCariAd] = useState('')
  const [yeniCariKaydediliyor, setYeniCariKaydediliyor] = useState(false)

  // Yeni stok ekleme modal state
  const [yeniStokModal, setYeniStokModal] = useState<null | { gKey: string; ad: string; kalinlik: number | '' }>(null)
  const [yeniStokKaydediliyor, setYeniStokKaydediliyor] = useState(false)

  // Çıta eşleştirme: mm → stok_id
  const [citaSecimler, setCitaSecimler] = useState<Record<number, string>>({})

  // Import
  const [iceAktariliyor, setIceAktariliyor] = useState(false)

  // Adım 4: Sevkiyat state — sadece teslimat tipi (araç yok)
  const [savedSiparis, setSavedSiparis] = useState<{ id: string; siparis_no: string } | null>(null)
  const [teslimatTipi, setTeslimatTipi] = useState<'teslim_alacak' | 'sevkiyat'>('teslim_alacak')
  const [sevkiyatTeslimTarihi, setSevkiyatTeslimTarihi] = useState('')
  const [sevkiyatKaydediliyor, setSevkiyatKaydediliyor] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  // PDF Viewer state
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfViewerScale, setPdfViewerScale] = useState(1.2)
  const [pdfViewerPage, setPdfViewerPage] = useState(1)
  const [pdfViewerTotalPages, setPdfViewerTotalPages] = useState(0)

  /* ===== Adım 1: PDF Yükle ===== */

  const handleFileChange = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setHata('Lütfen PDF dosyası seçin.')
      return
    }

    setYukleniyor(true)
    setHata(null)
    setYuklemeDurum('PDF açılıyor...')

    try {
      const result = await parsePDF(file, (msg) => setYuklemeDurum(msg))
      console.log('[PDF Import] hamMetin:', result.hamMetin)
      console.log('[PDF Import] format:', result.format, 'satirlar:', result.satirlar.length)

      if (result.format === 'bilinmeyen') {
        setHata('PDF formatı tanınamadı. Şu an yalnızca PIMAPEN/Ercom Smart formatı desteklenmektedir.')
        console.warn('[PDF Import] Format algılanamadı. Ham metin:', result.hamMetin.substring(0, 500))
        setYukleniyor(false)
        return
      }

      if (result.satirlar.length === 0) {
        setHata('PDF okundu ancak cam satırı bulunamadı. Dosyayı kontrol edin.')
        console.warn('[PDF Import] Satır bulunamadı. Ham metin:', result.hamMetin.substring(0, 500))
        setYukleniyor(false)
        return
      }

      setParseResult(result)
      setPdfFile(file)
      setPdfViewerPage(1)
      setPdfViewerScale(1.2)

      // Otomatik eşleştirme
      if (result.header) {
        // Eşleştirme, PDF'in en üstündeki şirket (bizim müşterimiz) ile yapılır.
        // cariUnvan (AKYOL LOUNGE) tedarikçinin kendi müşterisidir; bizi ilgilendirmez.
        const cariMatch = cariEslestir('', result.header.tedarikciUnvan, cariler)
        if (cariMatch) {
          setSecilenCariId(cariMatch.id)
          setCariSkor(cariMatch.skor)
        }

        // Mükerrer kontrol
        if (result.header.siparisNo) {
          const { data } = await supabase
            .from('siparisler')
            .select('id')
            .ilike('notlar', `%${result.header.siparisNo}%`)
            .limit(1)
          setMukerrer((data?.length ?? 0) > 0)
        }
      }

      // Stok eşleştirme — her unique (kalınlık + tip) kombinasyonu için ayrı eşleştirme
      const camStoklar = localStoklar.filter((s) => s.kategori === 'cam')
      const yeniStokSecimler: Record<string, { stokId: string; skor: number }> = {}
      for (const satir of result.satirlar) {
        const key = satirAnahtari(satir)
        if (yeniStokSecimler[key]) continue
        const stokMatch = stokEslestir(satir.aciklama, camStoklar, satir.dis_kalinlik_mm)
        yeniStokSecimler[key] = stokMatch
          ? { stokId: stokMatch.id, skor: stokMatch.skor }
          : { stokId: '', skor: 0 }
      }
      setSatirStokSecimler(yeniStokSecimler)

      // Çıta eşleştirme — her unique ara_bosluk_mm için çıta stok bul
      const citaStoklar = stoklar.filter((s) => s.kategori === 'cita')
      const uniqueMmler = [...new Set(result.satirlar.map((s) => s.ara_bosluk_mm).filter((v): v is number => v != null))]
      const yeniCitaSecimler: Record<number, string> = {}
      for (const mm of uniqueMmler) {
        const match = citaEslestir(mm, citaStoklar)
        if (match && match.skor >= 0.5) {
          yeniCitaSecimler[mm] = match.id
        }
      }
      setCitaSecimler(yeniCitaSecimler)

      setAdim('eslestirme')
    } catch (err: any) {
      setHata(`PDF okunamadı: ${err.message ?? 'Bilinmeyen hata'}`)
    } finally {
      setYukleniyor(false)
    }
  }, [cariler, stoklar])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileChange(file)
  }, [handleFileChange])

  /* ===== Yeni Cari Ekle (inline) ===== */

  const handleYeniCariEkle = async () => {
    if (!yeniCariAd.trim()) return
    setYeniCariKaydediliyor(true)
    setHata(null)
    try {
      const kod = await generateCariKod()
      const { data, error } = await supabase
        .from('cari')
        .insert({ ad: yeniCariAd.trim(), kod, tipi: 'musteri', telefon: null, email: null, adres: null, notlar: null })
        .select('id, ad, kod')
        .single()
      if (error) throw new Error(error.message)
      const yeni = { id: data.id as string, ad: data.ad as string, kod: data.kod as string }
      setLocalCariler((prev) => [yeni, ...prev])
      setSecilenCariId(yeni.id)
      setCariSkor(1)
      setYeniCariGoster(false)
      setYeniCariAd('')
    } catch (err: any) {
      setHata(`Cari eklenemedi: ${err.message ?? 'Bilinmeyen hata'}`)
    } finally {
      setYeniCariKaydediliyor(false)
    }
  }

  /* ===== Adım 3: İçe Aktar ===== */

  const handleIceAktar = async () => {
    if (!parseResult) return
    setIceAktariliyor(true)
    setHata(null)

    try {
      const header = parseResult.header!
      const tarih = header.sipTarihi
        ? header.sipTarihi.split('.').reverse().join('-') // dd.mm.yyyy → yyyy-mm-dd
        : new Date().toISOString().split('T')[0]
      const teslimTarihi = header.sevkTarihi
        ? header.sevkTarihi.split('.').reverse().join('-')
        : undefined

      const camlar: CamFormSatiri[] = parseResult.satirlar.map((s) => {
        const notParcalari: string[] = []
        if (s.menfez_cap_mm != null) notParcalari.push(`Menfez Ø${s.menfez_cap_mm}`)
        if (s.kucuk_cam) notParcalari.push('%20<')
        const stokId = satirStokSecimler[satirAnahtari(s)]?.stokId ?? ''
        return {
          stok_id: stokId,
          genislik_mm: s.genislik_mm,
          yukseklik_mm: s.yukseklik_mm,
          adet: s.adet,
          ara_bosluk_mm: s.ara_bosluk_mm ?? '',
          cita_stok_id: s.ara_bosluk_mm != null ? (citaSecimler[s.ara_bosluk_mm] || undefined) : undefined,
          kenar_islemi: '',
          poz: s.pozNo || '',
          notlar: notParcalari.join(', '),
          dis_kalinlik_mm: s.dis_kalinlik_mm ?? undefined,
          menfez_cap_mm: s.menfez_cap_mm ?? undefined,
          kucuk_cam: s.kucuk_cam,
        }
      })

      const result = await onIceAktar({
        cari_id: secilenCariId,
        tarih,
        teslim_tarihi: teslimTarihi,
        alt_musteri: header.cariUnvan || undefined,
        notlar: `PDF Import — Sipariş No: ${header.siparisNo} / Tedarikçi: ${header.tedarikciUnvan}`,
        teslimat_tipi: 'teslim_alacak',
        kaynak: 'pdf',
        camlar,
      })
      setSavedSiparis({ id: result.id, siparis_no: result.siparis_no })
      setSevkiyatTeslimTarihi(result.teslim_tarihi ?? teslimTarihi ?? '')
      setAdim('sevkiyat')
    } catch (err: any) {
      setHata(`İçe aktarma başarısız: ${err.message ?? 'Bilinmeyen hata'}`)
    } finally {
      setIceAktariliyor(false)
    }
  }

  /* ===== Adım 4: Sevkiyat ===== */
  const handleSevkiyatTamamla = async () => {
    if (!savedSiparis) {
      onKapat()
      return
    }
    if (teslimatTipi === 'sevkiyat' && !sevkiyatTeslimTarihi) {
      setHata('Sevkiyat seçildi ancak teslim tarihi girilmedi.')
      return
    }
    setSevkiyatKaydediliyor(true)
    try {
      const update: Record<string, unknown> = { teslimat_tipi: teslimatTipi }
      if (teslimatTipi === 'sevkiyat' && sevkiyatTeslimTarihi) {
        update.teslim_tarihi = sevkiyatTeslimTarihi
      }
      const { error } = await supabase.from('siparisler').update(update).eq('id', savedSiparis.id)
      if (error) throw new Error(error.message)
    } catch (e: unknown) {
      setHata(e instanceof Error ? e.message : 'Teslimat tipi kaydedilemedi')
      setSevkiyatKaydediliyor(false)
      return
    }
    setSevkiyatKaydediliyor(false)
    onKapat()
  }

  /* ===== Yeni Stok Oluştur ===== */
  const handleStokOlustur = async () => {
    if (!yeniStokModal) return
    const { gKey, ad, kalinlik } = yeniStokModal
    if (!ad.trim() || kalinlik === '' || !kalinlik) return
    setYeniStokKaydediliyor(true)
    try {
      const kod = await generateStokKod()
      const { data, error } = await supabase
        .from('stok')
        .insert({
          kod,
          ad: ad.trim(),
          kalinlik_mm: Number(kalinlik),
          kategori: 'cam',
          birim: 'm2',
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      const yeniStok = data as Stok
      setLocalStoklar((prev) => [yeniStok, ...prev])
      setSatirStokSecimler((prev) => ({ ...prev, [gKey]: { stokId: yeniStok.id, skor: 1 } }))
      setYeniStokModal(null)
      await onStokYenile?.()
    } catch (err: any) {
      setHata(`Stok eklenemedi: ${err.message ?? 'Bilinmeyen hata'}`)
    } finally {
      setYeniStokKaydediliyor(false)
    }
  }

  /* ===== RENDER ===== */

  const adimlar: { key: Adim; label: string }[] = [
    { key: 'yukleme', label: 'PDF Yükle' },
    { key: 'eslestirme', label: 'Eşleştirme' },
    { key: 'onizleme', label: 'Önizleme' },
    { key: 'sevkiyat', label: 'Sevkiyat' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2">
      <div
        className="w-full bg-white rounded-2xl shadow-xl flex flex-col transition-all duration-300 ease-in-out"
        style={{
          maxWidth: adim === 'onizleme' ? '98vw' : '56rem',
          maxHeight: adim === 'onizleme' ? '97vh' : '90vh',
          height: adim === 'onizleme' ? '97vh' : 'auto',
        }}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">PDF'den Sipariş İçe Aktar</h2>
            <div className="flex items-center gap-4 mt-2">
              {adimlar.map((a, i) => (
                <div key={a.key} className="flex items-center gap-2">
                  <span className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    adim === a.key ? 'bg-blue-600 text-white' :
                    adimlar.findIndex(x => x.key === adim) > i ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-400'
                  )}>
                    {adimlar.findIndex(x => x.key === adim) > i ? '✓' : i + 1}
                  </span>
                  <span className={cn(
                    'text-xs font-medium',
                    adim === a.key ? 'text-gray-800' : 'text-gray-400'
                  )}>
                    {a.label}
                  </span>
                  {i < adimlar.length - 1 && <ChevronRight size={12} className="text-gray-300 ml-1" />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Hata */}
        {hata && (
          <div className="mx-6 mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            {hata}
          </div>
        )}

        {/* İçerik */}
        <div className={cn('flex-1 px-6 py-4 min-h-0', adim === 'onizleme' ? 'overflow-hidden' : 'overflow-y-auto')}>
          {/* ===== ADIM 1: YÜKLEME ===== */}
          {adim === 'yukleme' && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-gray-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileChange(f)
                }}
              />
              {yukleniyor ? (
                <>
                  <Loader2 size={48} className="text-blue-500 animate-spin mb-4" />
                  <p className="text-gray-600 font-medium">{yuklemeDurum || 'PDF okunuyor...'}</p>
                  <p className="text-xs text-gray-400 mt-2">OCR işlemi birkaç saniye sürebilir</p>
                </>
              ) : (
                <>
                  <Upload size={48} className="text-gray-300 mb-4" />
                  <p className="text-lg font-medium text-gray-700">PDF Dosyası Yükleyin</p>
                  <p className="text-sm text-gray-400 mt-1">Sürükle-bırak veya tıklayarak seçin</p>
                  <p className="text-xs text-gray-400 mt-3">PIMAPEN / Ercom Smart formatı desteklenir</p>
                </>
              )}
            </div>
          )}

          {/* ===== ADIM 2: EŞLEŞTİRME ===== */}
          {adim === 'eslestirme' && parseResult && (
            <div className="space-y-6">
              {/* Mükerrer uyarı */}
              {mukerrer && (
                <div className="p-3 bg-yellow-50 text-yellow-700 text-sm rounded-lg border border-yellow-200 flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <strong>Dikkat:</strong> Bu sipariş numarası ({parseResult.header?.siparisNo}) daha önce sisteme eklenmiş olabilir.
                    Yine de devam edebilirsiniz.
                  </div>
                </div>
              )}

              {/* PDF Özeti */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={16} className="text-gray-500" />
                  <span className="text-sm font-semibold text-gray-700">PDF Bilgileri</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2">
                    <span className="text-gray-400 text-xs">Bizim Müşterimiz (PDF Sahibi)</span>
                    <div className="font-semibold text-blue-700">{parseResult.header?.tedarikciUnvan || '\u2014'}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Nihai Kullanıcı (Müşterinin Müşterisi)</span>
                    <div className="font-medium text-gray-800">{parseResult.header?.cariUnvan || '\u2014'}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">İç Cari Kodu</span>
                    <div className="font-mono text-gray-500">{parseResult.header?.cariKodu || '\u2014'}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Sipariş No</span>
                    <div className="font-mono font-medium text-gray-800">{parseResult.header?.siparisNo || '—'}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Cam Parçası</span>
                    <div className="font-bold text-blue-700">
                      {parseResult.satirlar.reduce((s, r) => s + r.adet, 0)} adet
                      <span className="text-xs font-normal text-gray-400 ml-1">({parseResult.satirlar.length} satır)</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Sipariş Tarihi</span>
                    <div className="font-medium text-gray-800">{parseResult.header?.sipTarihi || '—'}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Sevk Tarihi</span>
                    <div className="font-medium text-gray-800">{parseResult.header?.sevkTarihi || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Cari Eşleştirme */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Cari Eşleştirme
                  {cariSkor >= 0.8 && (
                    <span className="ml-2 text-xs text-green-600 font-normal inline-flex items-center gap-1">
                      <CheckCircle2 size={12} /> Otomatik eşleştirildi
                    </span>
                  )}
                  {cariSkor >= 0.6 && cariSkor < 0.8 && (
                    <span className="ml-2 text-xs text-yellow-600 font-normal inline-flex items-center gap-1">
                      <AlertTriangle size={12} /> Eşleşme düşük — lütfen kontrol edin
                    </span>
                  )}
                  {cariSkor === 0 && !secilenCariId && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                      Müşteri Yok — sistemde bulunamadı
                    </span>
                  )}
                </label>
                {parseResult.header?.tedarikciUnvan && (
                  <div className="text-xs text-gray-400 mb-1.5">
                    PDF'deki şirket:{' '}
                    <span className="font-semibold text-blue-600">{parseResult.header.tedarikciUnvan}</span>
                    {parseResult.header.cariUnvan && (
                      <span className="text-gray-400"> &mdash; nihai kullanıcı: {parseResult.header.cariUnvan}</span>
                    )}
                  </div>
                )}
                <select
                  value={secilenCariId}
                  onChange={(e) => { setSecilenCariId(e.target.value); setCariSkor(0); setYeniCariGoster(false) }}
                  className={cn(
                    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                    cariSkor >= 0.8
                      ? 'border-green-400 bg-green-50 focus:ring-green-400'
                      : cariSkor >= 0.6
                      ? 'border-yellow-400 bg-yellow-50 focus:ring-yellow-400'
                      : 'border-gray-200 focus:ring-blue-500'
                  )}
                >
                  <option value="">— Müşteri Yok —</option>
                  {localCariler.map((c) => (
                    <option key={c.id} value={c.id}>{c.kod} — {c.ad}</option>
                  ))}
                </select>

                {/* Eşleşme yok: Yeni Cari Ekle seçeneği */}
                {!secilenCariId && !yeniCariGoster && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      "{parseResult.header?.tedarikciUnvan}" sistemde bulunamadı.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setYeniCariAd(parseResult.header?.tedarikciUnvan ?? '')
                        setYeniCariGoster(true)
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium underline-offset-2 underline"
                    >
                      + Yeni Cari Olarak Ekle
                    </button>
                  </div>
                )}

                {/* Inline yeni cari formu */}
                {yeniCariGoster && (
                  <div className="mt-2 p-3 border border-blue-200 bg-blue-50 rounded-xl space-y-2">
                    <div className="text-xs font-semibold text-blue-800">Yeni Cari Ekle</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={yeniCariAd}
                        onChange={(e) => setYeniCariAd(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleYeniCariEkle()}
                        placeholder="Cari adı"
                        autoFocus
                        className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <button
                        type="button"
                        onClick={handleYeniCariEkle}
                        disabled={!yeniCariAd.trim() || yeniCariKaydediliyor}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {yeniCariKaydediliyor ? <Loader2 size={14} className="animate-spin" /> : 'Kaydet'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setYeniCariGoster(false)}
                        className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        İptal
                      </button>
                    </div>
                    <p className="text-xs text-blue-600">Cari kodu otomatik atanacak (C-XXXX), tipi: Müşteri</p>
                  </div>
                )}
              </div>

              {/* Stok Eşleştirme — her unique cam tipi-kalınlık kombinasyonu */}
              {(() => {
                const camStoklar = localStoklar.filter((s) => s.kategori === 'cam')
                // Unique satır anahtarları
                const gosterilenKeyler = new Set<string>()
                const gruplar: { key: string; bilgi: ReturnType<typeof satirGrupBilgi>; satirSayisi: number }[] = []
                for (const s of parseResult.satirlar) {
                  const k = satirAnahtari(s)
                  if (gosterilenKeyler.has(k)) continue
                  gosterilenKeyler.add(k)
                  const adetSatir = parseResult.satirlar.filter((x) => satirAnahtari(x) === k).length
                  gruplar.push({ key: k, bilgi: satirGrupBilgi(s), satirSayisi: adetSatir })
                }

                return (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Cam Tipi (Stok) Eşleştirme
                      <span className="ml-2 text-xs text-gray-400 font-normal">
                        {gruplar.length} farklı cam tipi tespit edildi
                      </span>
                    </label>
                    <div className="space-y-2">
                      {gruplar.map((g) => {
                        const secim = satirStokSecimler[g.key]
                        const eslesti = secim?.stokId && secim.skor >= 0.6
                        return (
                          <div key={g.key} className="flex items-start gap-3 p-2 rounded-lg border border-gray-100 bg-gray-50/50">
                            <div className="shrink-0 w-32">
                              <div className="text-xs font-mono font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded">
                                {g.bilgi.kalinlik ? `${g.bilgi.kalinlik}mm` : '—'}
                              </div>
                              <div className="mt-1 text-xs text-gray-600 truncate" title={g.bilgi.tip}>
                                {g.bilgi.tip || '—'}
                              </div>
                              <div className="mt-0.5 text-[10px] text-gray-400">{g.satirSayisi} satır</div>
                            </div>
                            <div className="flex-1">
                              <select
                                value={secim?.stokId ?? ''}
                                onChange={(e) =>
                                  setSatirStokSecimler((prev) => ({
                                    ...prev,
                                    [g.key]: { stokId: e.target.value, skor: e.target.value ? 1 : 0 },
                                  }))
                                }
                                className={cn(
                                  'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                                  eslesti
                                    ? 'border-green-400 bg-green-50 focus:ring-green-400'
                                    : secim?.stokId
                                      ? 'border-yellow-400 bg-yellow-50 focus:ring-yellow-400'
                                      : 'border-red-200 bg-red-50/30 focus:ring-blue-500'
                                )}
                              >
                                <option value="">— Stok seçin —</option>
                                {camStoklar.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.kod} — {s.kalinlik_mm ? `${s.kalinlik_mm}mm ` : ''}{camTipiAd(s.ad)}
                                  </option>
                                ))}
                              </select>
                              {!secim?.stokId && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <span className="text-xs text-red-600">Bu cam için sistemde stok bulunamadı.</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setYeniStokModal({
                                        gKey: g.key,
                                        ad: g.bilgi.tip,
                                        kalinlik: g.bilgi.kalinlik ?? '',
                                      })
                                    }
                                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                  >
                                    <Plus size={12} /> Yeni Stok Aç
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Çıta Eşleştirme — her unique mm için */}
              {(() => {
                const uniqueMmler = [...new Set(parseResult.satirlar.map((s) => s.ara_bosluk_mm).filter((v): v is number => v != null))].sort((a, b) => a - b)
                if (uniqueMmler.length === 0) return null
                const citaStoklar = stoklar.filter((s) => s.kategori === 'cita')
                return (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Çıta Eşleştirme
                      <span className="ml-2 text-xs text-gray-400 font-normal">
                        {uniqueMmler.length} farklı çıta boyutu tespit edildi
                      </span>
                    </label>
                    <div className="space-y-2">
                      {uniqueMmler.map((mm) => {
                        const satirSayisi = parseResult.satirlar.filter((s) => s.ara_bosluk_mm === mm).length
                        return (
                          <div key={mm} className="flex items-center gap-3">
                            <div className="shrink-0 w-20 text-sm font-mono font-medium text-cyan-700 bg-cyan-50 px-2 py-1.5 rounded text-center">
                              {mm}mm
                            </div>
                            <select
                              value={citaSecimler[mm] ?? ''}
                              onChange={(e) => setCitaSecimler((prev) => ({ ...prev, [mm]: e.target.value }))}
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">— Çıta Stok Seçin —</option>
                              {citaStoklar.map((s) => (
                                <option key={s.id} value={s.id}>{s.kod} — {s.ad}</option>
                              ))}
                            </select>
                            <span className="shrink-0 text-xs text-gray-400">{satirSayisi} satır</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ===== ADIM 3: ÖNİZLEME ===== */}
          {adim === 'onizleme' && parseResult && (() => {
            const hesaplananM2 = parseResult.satirlar.reduce(
              (sum, s) => sum + (s.genislik_mm * s.yukseklik_mm * s.adet) / 1_000_000,
              0
            )
            const pdfM2 = parseResult.header?.toplamMetrekare ?? null
            const fark = pdfM2 !== null ? Math.abs(hesaplananM2 - pdfM2) : null
            const tolerans = pdfM2 ? Math.max(0.5, pdfM2 * 0.005) : 0.5
            const eslesme = fark !== null ? fark <= tolerans : null

            return (
            <div className="flex gap-0 h-full">
              {/* Sol: tablo + M² doğrulama */}
              <div className="flex-1 min-w-0 flex flex-col pr-5 border-r border-gray-100">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h3 className="text-sm font-semibold text-gray-700">
                  İçe aktarılacak {parseResult.satirlar.reduce((s, r) => s + r.adet, 0)} adet cam ({parseResult.satirlar.length} satır)
                </h3>
                <span className="text-xs text-gray-400">
                  Cari: {cariler.find(c => c.id === secilenCariId)?.ad ?? '—'}
                </span>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Açıklama</th>
                        <th className="px-3 py-2">Genişlik</th>
                        <th className="px-3 py-2">Yükseklik</th>
                        <th className="px-3 py-2">Adet</th>
                        <th className="px-3 py-2">M²</th>
                        <th className="px-3 py-2">Poz No</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.satirlar.map((s, i) => {
                        const stokSec = satirStokSecimler[satirAnahtari(s)]
                        const stok = stokSec?.stokId ? localStoklar.find((x) => x.id === stokSec.stokId) : null
                        return (
                          <tr key={i} className="border-b border-gray-50 last:border-0">
                            <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                            <td className="px-3 py-2 text-gray-700 text-xs">
                              {s.dis_kalinlik_mm != null && s.ara_bosluk_mm != null && (
                                <span className="font-mono text-gray-500 mr-1">
                                  {s.dis_kalinlik_mm}+{s.ara_bosluk_mm}+{s.dis_kalinlik_mm}
                                </span>
                              )}
                              {stok ? camTipiAd(stok.ad) : <span className="text-red-500">⚠ stok yok</span>}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-800">{s.genislik_mm}</td>
                            <td className="px-3 py-2 font-mono text-gray-800">{s.yukseklik_mm}</td>
                            <td className="px-3 py-2 text-gray-700">{s.adet}</td>
                            <td className="px-3 py-2 font-mono text-xs text-blue-700">
                              {(s.genislik_mm * s.yukseklik_mm * s.adet / 1_000_000).toFixed(3)}
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-xs">{s.pozNo || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                  Toplam: {parseResult.satirlar.reduce((s, r) => s + r.adet, 0)} adet · {parseResult.satirlar.length} satır
                </div>
              </div>

              {/* M² Doğrulama Kartı */}
              <div className={cn(
                'mt-3 rounded-xl border p-3 shrink-0',
                eslesme === true
                  ? 'border-green-200 bg-green-50'
                  : eslesme === false
                  ? 'border-red-200 bg-red-50'
                  : 'border-blue-200 bg-blue-50'
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-1">M² Doğrulama</div>
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <div className="text-xs text-gray-400">Hesaplanan (boyutlardan)</div>
                        <div className="text-lg font-bold text-blue-700">
                          {hesaplananM2.toFixed(3)} m²
                        </div>
                      </div>
                      {pdfM2 !== null ? (
                        <div>
                          <div className="text-xs text-gray-400">PDF'deki toplam</div>
                          <div className="text-lg font-bold text-gray-700">
                            {pdfM2.toFixed(3)} m²
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs text-gray-400">PDF'deki toplam</div>
                          <div className="text-sm text-gray-400 italic">Tespit edilemedi</div>
                        </div>
                      )}
                      {fark !== null && (
                        <div>
                          <div className="text-xs text-gray-400">Fark</div>
                          <div className={cn(
                            'text-sm font-semibold',
                            eslesme ? 'text-green-700' : 'text-red-700'
                          )}>
                            {fark < 0.001 ? '0.000' : fark.toFixed(3)} m²
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {eslesme === true && (
                      <div className="flex items-center gap-1.5 text-green-700 bg-green-100 px-2.5 py-1.5 rounded-lg">
                        <CheckCircle2 size={16} />
                        <span className="text-xs font-semibold">Eşleşti</span>
                      </div>
                    )}
                    {eslesme === false && (
                      <div className="flex items-center gap-1.5 text-red-700 bg-red-100 px-2.5 py-1.5 rounded-lg">
                        <AlertTriangle size={16} />
                        <span className="text-xs font-semibold">Uyumsuz!</span>
                      </div>
                    )}
                    {eslesme === null && (
                      <div className="flex items-center gap-1.5 text-blue-600 bg-blue-100 px-2.5 py-1.5 rounded-lg">
                        <AlertTriangle size={14} />
                        <span className="text-xs font-semibold">PDF toplamı bulunamadı</span>
                      </div>
                    )}
                  </div>
                </div>
                {eslesme === false && (
                  <div className="mt-2 text-xs text-red-700 border-t border-red-200 pt-2">
                    ⚠️ Hesaplanan m² ile PDF'deki toplam arasında {fark!.toFixed(3)} m² fark var. Ölçü okuma hatası olabilir; satırları tek tek kontrol edin.
                  </div>
                )}
              </div>
              </div>

              {/* Sağ: PDF Görüntüleyici */}
              <div className="w-[42%] shrink-0 flex flex-col pl-5">
                {/* Kontroller */}
                <div className="flex items-center gap-1 mb-2 pb-2 border-b border-gray-100 shrink-0">
                  <button
                    onClick={() => setPdfViewerScale((s) => Math.max(0.4, +(s - 0.2).toFixed(1)))}
                    disabled={pdfViewerScale <= 0.4}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30"
                    title="Küçült"
                  >
                    <ZoomOut size={15} />
                  </button>
                  <span className="text-xs text-gray-500 w-11 text-center select-none">
                    {Math.round(pdfViewerScale * 100)}%
                  </span>
                  <button
                    onClick={() => setPdfViewerScale((s) => Math.min(3.0, +(s + 0.2).toFixed(1)))}
                    disabled={pdfViewerScale >= 3.0}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30"
                    title="Büyüt"
                  >
                    <ZoomIn size={15} />
                  </button>
                  <button
                    onClick={() => setPdfViewerScale(1.2)}
                    className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100"
                    title="Sıfırla"
                  >
                    ↺
                  </button>
                  <div className="ml-auto flex items-center gap-0.5">
                    <button
                      onClick={() => setPdfViewerPage((p) => Math.max(1, p - 1))}
                      disabled={pdfViewerPage <= 1}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="text-xs text-gray-500 w-14 text-center select-none">
                      {pdfViewerPage} / {pdfViewerTotalPages || '?'}
                    </span>
                    <button
                      onClick={() => setPdfViewerPage((p) => Math.min(pdfViewerTotalPages || 1, p + 1))}
                      disabled={pdfViewerPage >= pdfViewerTotalPages}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
                {/* Canvas scroll alanı */}
                <div className="flex-1 overflow-auto bg-gray-50 rounded-xl flex items-start justify-center p-3">
                  {pdfFile && (
                    <PDFPageViewer
                      file={pdfFile}
                      scale={pdfViewerScale}
                      page={pdfViewerPage}
                      onTotalPages={(n) => setPdfViewerTotalPages(n)}
                    />
                  )}
                </div>
              </div>
            </div>
            )
          })()}

          {/* ===== ADIM 4: SEVKİYAT ===== */}
          {adim === 'sevkiyat' && (
            <div className="space-y-5 max-w-sm mx-auto py-2">
              <p className="text-sm text-gray-500">Bu sipariş nasıl teslim edilecek?</p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTeslimatTipi('teslim_alacak')}
                  className={cn(
                    'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all',
                    teslimatTipi === 'teslim_alacak'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  )}
                >
                  <PackageCheck size={30} className={teslimatTipi === 'teslim_alacak' ? 'text-blue-600' : 'text-gray-400'} />
                  <div className="text-center">
                    <div className={cn('text-sm font-semibold', teslimatTipi === 'teslim_alacak' ? 'text-blue-700' : 'text-gray-600')}>
                      Teslim Alacak
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Müşteri gelip alacak</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTeslimatTipi('sevkiyat')}
                  className={cn(
                    'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all',
                    teslimatTipi === 'sevkiyat'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  )}
                >
                  <Truck size={30} className={teslimatTipi === 'sevkiyat' ? 'text-blue-600' : 'text-gray-400'} />
                  <div className="text-center">
                    <div className={cn('text-sm font-semibold', teslimatTipi === 'sevkiyat' ? 'text-blue-700' : 'text-gray-600')}>
                      Sevkiyat
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Araçla teslim edilecek</div>
                  </div>
                </button>
              </div>

              {teslimatTipi === 'sevkiyat' && (
                <div className={cn(
                  'rounded-xl border-2 p-4 transition-all',
                  !sevkiyatTeslimTarihi ? 'border-orange-300 bg-orange-50' : 'border-green-200 bg-green-50'
                )}>
                  {!sevkiyatTeslimTarihi && (
                    <div className="flex items-center gap-2 text-orange-700 mb-3">
                      <AlertTriangle size={15} className="shrink-0" />
                      <span className="text-sm font-medium">Sevkiyat için teslim tarihi gereklidir</span>
                    </div>
                  )}
                  <label className={cn(
                    'block text-xs font-medium mb-1',
                    !sevkiyatTeslimTarihi ? 'text-orange-700' : 'text-green-700'
                  )}>
                    Teslim Tarihi *
                  </label>
                  <input
                    type="date"
                    value={sevkiyatTeslimTarihi}
                    onChange={(e) => setSevkiyatTeslimTarihi(e.target.value)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
                      !sevkiyatTeslimTarihi
                        ? 'border-orange-300 focus:ring-orange-400'
                        : 'border-green-300 focus:ring-green-400'
                    )}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alt bar */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
          <div className="text-xs text-gray-400">
            {adim === 'yukleme' && 'Cam sipariş listesi PDF dosyası seçin'}
            {adim === 'eslestirme' && 'Cari ve stok bilgilerini doğrulayın'}
            {adim === 'onizleme' && 'Verileri kontrol edip içe aktarın'}
            {adim === 'sevkiyat' && 'Sipariş kaydedildi. Teslimat tipini seçin.'}
          </div>
          <div className="flex gap-3">
            {adim !== 'yukleme' && adim !== 'sevkiyat' && (
              <button
                onClick={() => setAdim(adim === 'onizleme' ? 'eslestirme' : 'yukleme')}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
              >
                Geri
              </button>
            )}
            {adim === 'eslestirme' && (
              <button
                onClick={() => { setHata(null); setAdim('onizleme') }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Devam
              </button>
            )}
            {adim === 'onizleme' && (
              <button
                onClick={handleIceAktar}
                disabled={iceAktariliyor}
                className="px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {iceAktariliyor ? 'İçe Aktarılıyor...' : `${parseResult?.satirlar.reduce((s, r) => s + r.adet, 0)} Adet (${parseResult?.satirlar.length} Satır) İçe Aktar`}
              </button>
            )}
            {adim === 'sevkiyat' && (
              <button
                onClick={handleSevkiyatTamamla}
                disabled={sevkiyatKaydediliyor || (teslimatTipi === 'sevkiyat' && !sevkiyatTeslimTarihi)}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {sevkiyatKaydediliyor ? 'Kaydediliyor...' : 'Tamamla'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Yeni Stok Modal */}
      {yeniStokModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800">Yeni Cam Stoğu Ekle</h3>
              <button
                onClick={() => setYeniStokModal(null)}
                className="p-1 rounded text-gray-400 hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cam Tipi *</label>
                <input
                  type="text"
                  value={yeniStokModal.ad}
                  onChange={(e) => setYeniStokModal((prev) => prev ? { ...prev, ad: e.target.value } : null)}
                  placeholder="örn. Düz Cam, Konfor Cam"
                  autoFocus
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kalınlık (mm) *</label>
                <select
                  value={yeniStokModal.kalinlik === '' ? '' : String(yeniStokModal.kalinlik)}
                  onChange={(e) => setYeniStokModal((prev) => prev ? { ...prev, kalinlik: e.target.value ? Number(e.target.value) : '' } : null)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seçiniz...</option>
                  {[3, 4, 5, 6, 8, 10, 12].map((k) => (
                    <option key={k} value={k}>{k}mm</option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-gray-400">
                Stok kodu otomatik atanacak. Kategori: Cam.
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setYeniStokModal(null)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Vazgeç
              </button>
              <button
                onClick={handleStokOlustur}
                disabled={yeniStokKaydediliyor || !yeniStokModal.ad.trim() || !yeniStokModal.kalinlik}
                className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {yeniStokKaydediliyor ? 'Kaydediliyor...' : 'Stok Aç'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
