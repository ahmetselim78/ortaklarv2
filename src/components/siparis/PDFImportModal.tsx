import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Upload, FileText, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import { parsePDF, cariEslestir, stokEslestir, citaEslestir } from '@/lib/pdfParser'
import type { PDFParseResult } from '@/lib/pdfParser'
import type { Stok } from '@/types/stok'
import type { CamFormSatiri } from '@/types/siparis'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getDocument } from 'pdfjs-dist'
import { generateCariKod } from '@/lib/idGenerator'

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

interface Props {
  cariler: { id: string; ad: string; kod: string }[]
  stoklar: Stok[]
  onIceAktar: (form: {
    cari_id: string
    tarih: string
    teslim_tarihi?: string
    alt_musteri?: string
    notlar?: string
    camlar: CamFormSatiri[]
  }) => Promise<string>
  onKapat: () => void
}

type Adim = 'yukleme' | 'eslestirme' | 'onizleme'

export default function PDFImportModal({ cariler, stoklar, onIceAktar, onKapat }: Props) {
  const [adim, setAdim] = useState<Adim>('yukleme')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [yuklemeDurum, setYuklemeDurum] = useState('')
  const [hata, setHata] = useState<string | null>(null)

  // Parse sonucu
  const [parseResult, setParseResult] = useState<PDFParseResult | null>(null)

  // Eşleştirme
  const [secilenCariId, setSecilenCariId] = useState<string>('')
  const [cariSkor, setCariSkor] = useState<number>(0)
  const [secilenStokId, setSecilenStokId] = useState<string>('')
  const [stokSkor, setStokSkor] = useState<number>(0)
  const [mukerrer, setMukerrer] = useState(false)

  // Yerel cari listesi (prop + modal içinde yeni eklenenler)
  const [localCariler, setLocalCariler] = useState<{ id: string; ad: string; kod: string }[]>(() => cariler)

  // Yeni cari ekleme (inline form)
  const [yeniCariGoster, setYeniCariGoster] = useState(false)
  const [yeniCariAd, setYeniCariAd] = useState('')
  const [yeniCariKaydediliyor, setYeniCariKaydediliyor] = useState(false)

  // Çıta eşleştirme: mm → stok_id
  const [citaSecimler, setCitaSecimler] = useState<Record<number, string>>({})

  // Import
  const [iceAktariliyor, setIceAktariliyor] = useState(false)

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

      // Stok eşleştirme — sadece cam kategorisi
      const camStoklar = stoklar.filter((s) => s.kategori === 'cam')
      if (result.satirlar.length > 0) {
        const stokMatch = stokEslestir(result.satirlar[0].aciklama, camStoklar)
        if (stokMatch) {
          setSecilenStokId(stokMatch.id)
          setStokSkor(stokMatch.skor)
        }
      }

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

      const camlar: CamFormSatiri[] = parseResult.satirlar.map((s) => ({
        stok_id: secilenStokId || '',
        genislik_mm: s.genislik_mm,
        yukseklik_mm: s.yukseklik_mm,
        adet: s.adet,
        ara_bosluk_mm: s.ara_bosluk_mm ?? '',
        kenar_islemi: '',
        poz: s.pozNo || '',
        notlar: '',
      }))

      await onIceAktar({
        cari_id: secilenCariId,
        tarih,
        teslim_tarihi: teslimTarihi,
        alt_musteri: header.cariUnvan || undefined,
        notlar: `PDF Import — Sipariş No: ${header.siparisNo} / Tedarikçi: ${header.tedarikciUnvan}`,
        camlar,
      })

      onKapat()
    } catch (err: any) {
      setHata(`İçe aktarma başarısız: ${err.message ?? 'Bilinmeyen hata'}`)
    } finally {
      setIceAktariliyor(false)
    }
  }

  /* ===== RENDER ===== */

  const adimlar: { key: Adim; label: string }[] = [
    { key: 'yukleme', label: 'PDF Yükle' },
    { key: 'eslestirme', label: 'Eşleştirme' },
    { key: 'onizleme', label: 'Önizleme' },
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

              {/* Stok Eşleştirme — sadece cam */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Cam Tipi (Stok) Eşleştirme
                  {stokSkor >= 0.8 && (
                    <span className="ml-2 text-xs text-green-600 font-normal inline-flex items-center gap-1">
                      <CheckCircle2 size={12} /> Otomatik eşleştirildi
                    </span>
                  )}
                  {stokSkor > 0 && stokSkor < 0.8 && (
                    <span className="ml-2 text-xs text-yellow-600 font-normal">— eşleşme düşük, kontrol edin</span>
                  )}
                </label>
                <div className="text-xs text-gray-400 mb-1.5">
                  PDF'deki açıklama: <span className="font-mono text-gray-600">{parseResult.satirlar[0]?.aciklama ?? '—'}</span>
                </div>
                <select
                  value={secilenStokId}
                  onChange={(e) => { setSecilenStokId(e.target.value); setStokSkor(0) }}
                  className={cn(
                    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                    stokSkor >= 0.8
                      ? 'border-green-400 bg-green-50 focus:ring-green-400'
                      : stokSkor > 0
                      ? 'border-yellow-400 bg-yellow-50 focus:ring-yellow-400'
                      : 'border-gray-200 focus:ring-blue-500'
                  )}
                >
                  <option value="">— Cam Stok Seçin (opsiyonel) —</option>
                  {stoklar.filter((s) => s.kategori === 'cam').map((s) => (
                    <option key={s.id} value={s.id}>{s.kod} — {s.ad}</option>
                  ))}
                </select>
              </div>

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
                  Cari: {cariler.find(c => c.id === secilenCariId)?.ad ?? '—'} ·
                  Stok: {stoklar.find(s => s.id === secilenStokId)?.ad ?? 'Belirtilmemiş'}
                </span>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Genişlik</th>
                        <th className="px-3 py-2">Yükseklik</th>
                        <th className="px-3 py-2">Adet</th>
                        <th className="px-3 py-2">M²</th>
                        <th className="px-3 py-2">Çıta (mm)</th>
                        <th className="px-3 py-2">Çıta Stok</th>
                        <th className="px-3 py-2">Poz No</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.satirlar.map((s, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-gray-800">{s.genislik_mm}</td>
                          <td className="px-3 py-2 font-mono text-gray-800">{s.yukseklik_mm}</td>
                          <td className="px-3 py-2 text-gray-700">{s.adet}</td>
                          <td className="px-3 py-2 font-mono text-xs text-blue-700">
                            {(s.genislik_mm * s.yukseklik_mm * s.adet / 1_000_000).toFixed(3)}
                          </td>
                          <td className="px-3 py-2">
                            {s.ara_bosluk_mm ? (
                              <span className="text-cyan-700 font-medium">{s.ara_bosluk_mm}</span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {s.ara_bosluk_mm && citaSecimler[s.ara_bosluk_mm]
                              ? stoklar.find((st) => st.id === citaSecimler[s.ara_bosluk_mm!])?.ad ?? '—'
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{s.pozNo || '—'}</td>
                        </tr>
                      ))}
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
        </div>

        {/* Alt bar */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
          <div className="text-xs text-gray-400">
            {adim === 'yukleme' && 'Cam sipariş listesi PDF dosyası seçin'}
            {adim === 'eslestirme' && 'Cari ve stok bilgilerini doğrulayın'}
            {adim === 'onizleme' && 'Verileri kontrol edip içe aktarın'}
          </div>
          <div className="flex gap-3">
            {adim !== 'yukleme' && (
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
          </div>
        </div>
      </div>
    </div>
  )
}
