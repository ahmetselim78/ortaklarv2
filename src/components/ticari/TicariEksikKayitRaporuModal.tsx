import { Download, Loader2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useEscape } from '@/hooks/useEscape'
import { ticariBugun } from '@/lib/ticariFormat'
import {
  ticariEksikKayitRaporunuGetir,
  type TicariEksikKayitRaporSatiri,
  type TicariEksikKayitRaporTuru,
} from '@/services/ticariService'

interface Props {
  tur: TicariEksikKayitRaporTuru
  onKapat: () => void
}

const basliklar: Record<TicariEksikKayitRaporTuru, string> = {
  satis_fiyati: 'Eksik satış fiyatları',
  maliyet: 'Eksik maliyetler',
  recete: 'Eksik maliyet reçeteleri',
  profil: 'Eksik müşteri ticari profilleri',
}

function csvHucre(value: unknown) {
  const metin = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return `"${metin.replaceAll('"', '""')}"`
}

function csvIndir(tur: TicariEksikKayitRaporTuru, tarih: string, satirlar: TicariEksikKayitRaporSatiri[]) {
  const baslik = ['Kaynak Türü', 'Kaynak ID', 'Kod', 'Ad', 'Detay']
  const icerik = [
    baslik.map(csvHucre).join(';'),
    ...satirlar.map((satir) => [
      satir.kaynak_turu,
      satir.kaynak_id,
      satir.kod,
      satir.ad,
      satir.detay,
    ].map(csvHucre).join(';')),
  ].join('\r\n')
  const blob = new Blob([`\uFEFF${icerik}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${tur}_eksik_kayitlar_${tarih}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function TicariEksikKayitRaporuModal({ tur, onKapat }: Props) {
  const [tarih, setTarih] = useState(ticariBugun)
  const [arama, setArama] = useState('')
  const istekAnahtari = `${tur}:${tarih}`
  const [istekSonucu, setIstekSonucu] = useState<{
    anahtar: string
    satirlar: TicariEksikKayitRaporSatiri[]
    hata: string | null
  }>({ anahtar: '', satirlar: [], hata: null })
  useEscape(onKapat)

  useEffect(() => {
    let aktif = true
    ticariEksikKayitRaporunuGetir(tur, tarih)
      .then((veri) => {
        if (aktif) setIstekSonucu({ anahtar: istekAnahtari, satirlar: veri, hata: null })
      })
      .catch((error) => {
        if (aktif) {
          setIstekSonucu({
            anahtar: istekAnahtari,
            satirlar: [],
            hata: error instanceof Error ? error.message : 'Eksik kayıt raporu yüklenemedi.',
          })
        }
      })
    return () => { aktif = false }
  }, [istekAnahtari, tarih, tur])

  const yukleniyor = istekSonucu.anahtar !== istekAnahtari
  const satirlar = useMemo(
    () => yukleniyor ? [] : istekSonucu.satirlar,
    [istekSonucu.satirlar, yukleniyor],
  )
  const hata = yukleniyor ? null : istekSonucu.hata

  const filtreli = useMemo(() => {
    const aranan = arama.trim().toLocaleLowerCase('tr-TR')
    if (!aranan) return satirlar
    return satirlar.filter((satir) => (
      `${satir.kaynak_turu} ${satir.kod ?? ''} ${satir.ad ?? ''} ${JSON.stringify(satir.detay)}`
        .toLocaleLowerCase('tr-TR')
        .includes(aranan)
    ))
  }, [arama, satirlar])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{basliklar[tur]}</h2>
            <p className="mt-1 text-xs text-gray-500">
              Rapor yayınlanmış, seçilen tarihte geçerli sürümleri ve stok ticari kapsamını esas alır.
            </p>
          </div>
          <button type="button" onClick={onKapat} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {hata && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{hata}</div>}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <label className="text-xs font-semibold text-gray-700">
              Rapor tarihi
              <input
                type="date"
                value={tarih}
                onChange={(event) => setTarih(event.target.value)}
                className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="min-w-56 flex-1 text-xs font-semibold text-gray-700">
              Ara
              <span className="relative mt-1 block">
                <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-gray-400" />
                <input
                  value={arama}
                  onChange={(event) => setArama(event.target.value)}
                  placeholder="Kod, ad veya eksik nedeni"
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm"
                />
              </span>
            </label>
            <button
              type="button"
              disabled={satirlar.length === 0}
              onClick={() => csvIndir(tur, tarih, satirlar)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download size={15} /> CSV dışa aktar
            </button>
          </div>

          {yukleniyor ? (
            <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 size={18} className="animate-spin" /> Eksik kayıtlar hesaplanıyor…
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                {filtreli.length} kayıt gösteriliyor · toplam {satirlar.length}
              </div>
              <div className="max-h-[55vh] overflow-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="sticky top-0 bg-white text-left font-semibold text-gray-500 shadow-sm">
                    <tr>
                      <th className="px-3 py-2">Tür</th>
                      <th className="px-3 py-2">Kod</th>
                      <th className="px-3 py-2">Ad</th>
                      <th className="px-3 py-2">Eksik nedeni</th>
                      <th className="px-3 py-2">Kaynak ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtreli.map((satir) => (
                      <tr key={`${satir.kaynak_turu}:${satir.kaynak_id}`} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600">{satir.kaynak_turu.replaceAll('_', ' ')}</td>
                        <td className="px-3 py-2 font-semibold text-gray-800">{satir.kod ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-800">{satir.ad ?? '—'}</td>
                        <td className="px-3 py-2 text-red-700">
                          {String(satir.detay?.neden ?? 'eksik_kayit').replaceAll('_', ' ')}
                        </td>
                        <td className="max-w-52 truncate px-3 py-2 font-mono text-[10px] text-gray-400" title={satir.kaynak_id}>
                          {satir.kaynak_id}
                        </td>
                      </tr>
                    ))}
                    {filtreli.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                          {satirlar.length === 0 ? 'Bu tarihte eksik kritik kayıt yok.' : 'Aramayla eşleşen kayıt yok.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onKapat} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
