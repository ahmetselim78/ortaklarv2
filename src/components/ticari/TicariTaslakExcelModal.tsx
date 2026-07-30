import { FileDown, FileUp, Loader2, Save, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEscape } from '@/hooks/useEscape'
import {
  ticariExcelReferanslariniGetir,
  ticariTaslakKalemleriniGetir,
  ticariTaslakKalemleriniTopluDegistir,
  type TicariTaslakTuru,
} from '@/services/ticariService'
import {
  ticariExcelSayfalari,
  ticariTaslakExcelIndir,
  ticariTaslakExcelOku,
  type TicariExcelReferanslar,
} from '@/lib/ticariTaslakExcel'

interface Props {
  tur: TicariTaslakTuru
  surumId: string
  surumNo: number
  revisionNo: number
  baslik: string
  onKaydedildi: () => Promise<void> | void
  onKapat: () => void
}

const turEtiketi: Record<TicariTaslakTuru, string> = {
  fiyat: 'satış fiyatı',
  maliyet: 'maliyet tarifesi',
  recete: 'maliyet reçetesi',
  vade: 'vade profili',
}

export default function TicariTaslakExcelModal({
  tur,
  surumId,
  surumNo,
  revisionNo,
  baslik,
  onKaydedildi,
  onKapat,
}: Props) {
  const [kalemler, setKalemler] = useState<Record<string, Array<Record<string, unknown>>> | null>(null)
  const [referanslar, setReferanslar] = useState<TicariExcelReferanslar | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [isleniyor, setIsleniyor] = useState(false)
  const [degisti, setDegisti] = useState(false)
  const dosyaRef = useRef<HTMLInputElement>(null)
  useEscape(onKapat, !isleniyor)

  useEffect(() => {
    let aktif = true
    setYukleniyor(true)
    Promise.all([
      ticariTaslakKalemleriniGetir(tur, surumId),
      ticariExcelReferanslariniGetir(),
    ])
      .then(([yeniKalemler, yeniReferanslar]) => {
        if (!aktif) return
        setKalemler(yeniKalemler)
        setReferanslar(yeniReferanslar)
      })
      .catch((error) => {
        if (aktif) setHata(error instanceof Error ? error.message : 'Taslak kalemleri yüklenemedi.')
      })
      .finally(() => {
        if (aktif) setYukleniyor(false)
      })
    return () => { aktif = false }
  }, [surumId, tur])

  const toplam = useMemo(
    () => Object.values(kalemler ?? {}).reduce((sum, satirlar) => sum + satirlar.length, 0),
    [kalemler],
  )
  const ilkSayfa = ticariExcelSayfalari[tur][0]
  const onizlemeSatirlari = kalemler?.[ilkSayfa.anahtar]?.slice(0, 8) ?? []
  const onizlemeKolonlari = ilkSayfa.kolonlar.slice(0, 7)

  const indir = async () => {
    if (!kalemler || !referanslar) return
    setIsleniyor(true)
    setHata(null)
    try {
      await ticariTaslakExcelIndir(
        `${tur}_${baslik.replaceAll(/[^A-Za-z0-9ğüşöçıİĞÜŞÖÇ-]+/g, '_')}_S${surumNo}.xlsx`,
        tur,
        kalemler,
        referanslar,
      )
      setBilgi('Excel çalışma kitabı indirildi. Düzenleyip aynı şablonla geri yükleyebilirsiniz.')
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Excel oluşturulamadı.')
    } finally {
      setIsleniyor(false)
    }
  }

  const dosyaSecildi = async (file: File | null) => {
    if (!file || !referanslar) return
    setIsleniyor(true)
    setHata(null)
    setBilgi(null)
    try {
      const yeniKalemler = await ticariTaslakExcelOku(tur, await file.arrayBuffer(), referanslar)
      setKalemler(yeniKalemler)
      setDegisti(true)
      const yeniToplam = Object.values(yeniKalemler).reduce((sum, satirlar) => sum + satirlar.length, 0)
      setBilgi(`${yeniToplam} kalem Excel’den doğrulandı. Veritabanına yazmak için “Taslağı kaydet” düğmesini kullanın.`)
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Excel okunamadı.')
    } finally {
      setIsleniyor(false)
      if (dosyaRef.current) dosyaRef.current.value = ''
    }
  }

  const kaydet = async () => {
    if (!kalemler || !degisti) return
    if (!window.confirm(
      `S${surumNo} taslağındaki mevcut ${turEtiketi[tur]} kalemleri Excel içeriğiyle atomik olarak değiştirilsin mi?`,
    )) return
    setIsleniyor(true)
    setHata(null)
    try {
      await ticariTaslakKalemleriniTopluDegistir(tur, surumId, revisionNo, kalemler)
      setBilgi('Taslak kalemleri tek transaction içinde kaydedildi.')
      setDegisti(false)
      await onKaydedildi()
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Taslak kalemleri kaydedilemedi.')
    } finally {
      setIsleniyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{baslik} · S{surumNo} taslak kalemleri</h2>
            <p className="mt-1 text-xs text-gray-500">
              Her kalem türü ayrı Excel sayfasındadır. İçeri aktarma, optimistic revision kontrolüyle tek transaction içinde uygulanır.
            </p>
          </div>
          <button type="button" onClick={onKapat} disabled={isleniyor} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {hata && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{hata}</div>}
          {bilgi && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{bilgi}</div>}
          {yukleniyor ? (
            <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 size={18} className="animate-spin" /> Taslak ve referanslar yükleniyor…
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ticariExcelSayfalari[tur].map((sayfa) => (
                  <div key={sayfa.anahtar} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">{sayfa.ad.replaceAll('_', ' ')}</div>
                    <div className="mt-1 text-2xl font-bold text-gray-900">{kalemler?.[sayfa.anahtar]?.length ?? 0}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 p-4">
                <button type="button" onClick={() => void indir()} disabled={isleniyor || !kalemler} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <FileDown size={16} /> Excel dışa aktar
                </button>
                <input
                  ref={dosyaRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => void dosyaSecildi(event.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <button type="button" onClick={() => dosyaRef.current?.click()} disabled={isleniyor || !referanslar} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                  <FileUp size={16} /> Excel içe aktar
                </button>
                <span className="ml-auto text-xs text-gray-500">{toplam} toplam kalem · revision {revisionNo}</span>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800">
                  {ilkSayfa.ad.replaceAll('_', ' ')} · ilk {Math.min(8, onizlemeSatirlari.length)} satır
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead className="bg-white text-left text-gray-500">
                      <tr>{onizlemeKolonlari.map((kolon) => <th key={kolon.alan} className="px-3 py-2">{kolon.baslik}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {onizlemeSatirlari.map((satir, index) => (
                        <tr key={index}>
                          {onizlemeKolonlari.map((kolon) => (
                            <td key={kolon.alan} className="max-w-56 truncate px-3 py-2 text-gray-700">
                              {satir[kolon.alan] == null ? '—' : String(satir[kolon.alan])}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {onizlemeSatirlari.length === 0 && (
                        <tr><td colSpan={onizlemeKolonlari.length} className="px-4 py-8 text-center text-gray-400">Bu sayfada kalem yok.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
          <span className="text-xs text-gray-500">Yayınlama ayrı AAL2 kontrollü işlemdir; bu ekran yalnız taslağı düzenler.</span>
          <div className="flex gap-2">
            <button type="button" onClick={onKapat} disabled={isleniyor} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Kapat</button>
            <button type="button" onClick={() => void kaydet()} disabled={isleniyor || !degisti} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {isleniyor ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Taslağı kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
