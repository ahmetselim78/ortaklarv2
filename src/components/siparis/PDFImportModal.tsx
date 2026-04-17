import { useState, useRef, useCallback } from 'react'
import { X, Upload, FileText, AlertTriangle, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import { parsePDF, cariEslestir, stokEslestir, extractAraBosluk } from '@/lib/pdfParser'
import type { PDFParseResult, PDFCamSatir } from '@/lib/pdfParser'
import type { Stok } from '@/types/stok'
import type { CamFormSatiri } from '@/types/siparis'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface Props {
  cariler: { id: string; ad: string; kod: string }[]
  stoklar: Stok[]
  onIceAktar: (form: {
    cari_id: string
    tarih: string
    teslim_tarihi?: string
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

  // Import
  const [iceAktariliyor, setIceAktariliyor] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

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

      // Otomatik eşleştirme
      if (result.header) {
        const cariMatch = cariEslestir(result.header.cariKodu, result.header.cariUnvan, cariler)
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

      // Stok eşleştirme (ilk satırın açıklaması referans)
      if (result.satirlar.length > 0) {
        const stokMatch = stokEslestir(result.satirlar[0].aciklama, stoklar)
        if (stokMatch) {
          setSecilenStokId(stokMatch.id)
          setStokSkor(stokMatch.skor)
        }
      }

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

  /* ===== Adım 3: İçe Aktar ===== */

  const handleIceAktar = async () => {
    if (!parseResult || !secilenCariId) return
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
        notlar: s.pozNo ? `Poz: ${s.pozNo}` : '',
      }))

      await onIceAktar({
        cari_id: secilenCariId,
        tarih,
        teslim_tarihi: teslimTarihi,
        notlar: `PDF Import — Sipariş No: ${header.siparisNo} / Cari: ${header.cariUnvan}`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
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
        <div className="flex-1 overflow-y-auto px-6 py-5">
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
                  <div>
                    <span className="text-gray-400 text-xs">Cari Kodu</span>
                    <div className="font-mono font-medium text-gray-800">{parseResult.header?.cariKodu || '—'}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Cari Ünvanı</span>
                    <div className="font-medium text-gray-800">{parseResult.header?.cariUnvan || '—'}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Sipariş No</span>
                    <div className="font-mono font-medium text-gray-800">{parseResult.header?.siparisNo || '—'}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Cam Parçası</span>
                    <div className="font-bold text-blue-700">{parseResult.satirlar.length} adet</div>
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
                  {cariSkor > 0 && cariSkor < 0.8 && (
                    <span className="ml-2 text-xs text-yellow-600 font-normal">— eşleşme düşük, kontrol edin</span>
                  )}
                </label>
                <select
                  value={secilenCariId}
                  onChange={(e) => setSecilenCariId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Cari Seçin —</option>
                  {cariler.map((c) => (
                    <option key={c.id} value={c.id}>{c.kod} — {c.ad}</option>
                  ))}
                </select>
              </div>

              {/* Stok Eşleştirme */}
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
                  {parseResult.satirlar[0]?.ara_bosluk_mm && (
                    <span className="ml-2">→ Çıta: <strong>{parseResult.satirlar[0].ara_bosluk_mm}mm</strong></span>
                  )}
                </div>
                <select
                  value={secilenStokId}
                  onChange={(e) => setSecilenStokId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Stok Seçin (opsiyonel) —</option>
                  {stoklar.map((s) => (
                    <option key={s.id} value={s.id}>{s.kod} — {s.ad}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ===== ADIM 3: ÖNİZLEME ===== */}
          {adim === 'onizleme' && parseResult && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  İçe aktarılacak {parseResult.satirlar.length} cam parçası
                </h3>
                <span className="text-xs text-gray-400">
                  Cari: {cariler.find(c => c.id === secilenCariId)?.ad ?? '—'} ·
                  Stok: {stoklar.find(s => s.id === secilenStokId)?.ad ?? 'Belirtilmemiş'}
                </span>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="max-h-[45vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Genişlik</th>
                        <th className="px-3 py-2">Yükseklik</th>
                        <th className="px-3 py-2">Adet</th>
                        <th className="px-3 py-2">Çıta (mm)</th>
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
                          <td className="px-3 py-2">
                            {s.ara_bosluk_mm ? (
                              <span className="text-cyan-700 font-medium">{s.ara_bosluk_mm}</span>
                            ) : '—'}
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
            </div>
          )}
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
                disabled={!secilenCariId}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
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
                {iceAktariliyor ? 'İçe Aktarılıyor...' : `${parseResult?.satirlar.length} Cam Parçasını İçe Aktar`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
