import {
  AlertCircle,
  Ban,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEscape } from '@/hooks/useEscape'
import { ticariPara, ticariTarih } from '@/lib/ticariFormat'
import {
  maliyetAlisFiyatiGecersizKil,
  maliyetAlisFiyatiTarihcesiniGetir,
} from '@/services/maliyetService'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type { MaliyetAlisFiyatiTarihceKaydi } from '@/types/maliyet'

type GecersizKilmaIslemi = {
  kayit: MaliyetAlisFiyatiTarihceKaydi
  idempotencyKey: string
}

function GecersizKilmaModal({
  islem,
  onKapat,
  onTamamlandi,
}: {
  islem: GecersizKilmaIslemi
  onKapat: () => void
  onTamamlandi: () => Promise<void>
}) {
  const [gerekce, setGerekce] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const kapatilabilir = !kaydediliyor

  useEscape(onKapat, kapatilabilir)

  const gecersizKil = async () => {
    if (gerekce.trim().length < 5) {
      setHata('En az 5 karakterlik bir gerekçe yazın.')
      return
    }

    setKaydediliyor(true)
    setHata(null)
    try {
      await maliyetAlisFiyatiGecersizKil(
        islem.kayit.fiyat_id,
        gerekce,
        islem.idempotencyKey,
      )
      await onTamamlandi()
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Fiyat geçersiz kılınamadı.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && kapatilabilir) onKapat()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="maliyet-fiyati-gecersiz-kil-baslik"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1 pr-3">
            <h3
              id="maliyet-fiyati-gecersiz-kil-baslik"
              className="text-lg font-bold text-gray-900"
            >
              Alış fiyatını geçersiz kıl
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Kayıt silinmez; tarihçede gerekçesiyle korunur.
            </p>
          </div>
          <button
            type="button"
            disabled={!kapatilabilir}
            onClick={onKapat}
            aria-label="Kapat"
            className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="font-semibold text-gray-900">{islem.kayit.malzeme_adi}</div>
            <div className="mt-1 text-sm text-gray-600">{islem.kayit.tedarikci_adi}</div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className="font-bold text-gray-900">
                {ticariPara(islem.kayit.birim_fiyat, islem.kayit.para_birimi)}
              </span>
              <span className="text-gray-500">{islem.kayit.vade_gunu} gün vade</span>
              <span className="text-gray-500">
                {ticariTarih(islem.kayit.fiyat_tarihi)} başlangıç
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            Bu fiyat maliyet hesabından çıkarılır. Aynı tedarikçi ve malzemenin
            önceki geçerli fiyatı varsa otomatik olarak yeniden kullanılmaya başlanır.
          </div>

          {hata && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {hata}
            </div>
          )}

          <label className="block text-sm font-semibold text-gray-700">
            Geçersiz kılma gerekçesi
            <textarea
              value={gerekce}
              onChange={(event) => setGerekce(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Örneğin: Tedarikçi fiyatı yanlış para birimiyle girildi."
              className="mt-1 w-full resize-y rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex sm:justify-end">
          <button
            type="button"
            disabled={kaydediliyor}
            onClick={onKapat}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={kaydediliyor}
            onClick={() => void gecersizKil()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {kaydediliyor
              ? <Loader2 size={15} className="animate-spin" />
              : <Ban size={15} />}
            Geçersiz kıl
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MaliyetFiyatYonetimiSekmesi() {
  const [kayitlar, setKayitlar] = useState<MaliyetAlisFiyatiTarihceKaydi[]>([])
  const [aramaGirdisi, setAramaGirdisi] = useState('')
  const [arama, setArama] = useState('')
  const [gecersizleriGoster, setGecersizleriGoster] = useState(true)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [islem, setIslem] = useState<GecersizKilmaIslemi | null>(null)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      setKayitlar(await maliyetAlisFiyatiTarihcesiniGetir(arama))
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Alış fiyatları yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }, [arama])

  useEffect(() => {
    void getir()
  }, [getir])

  const gorunenKayitlar = useMemo(
    () => gecersizleriGoster ? kayitlar : kayitlar.filter((kayit) => !kayit.gecersiz),
    [gecersizleriGoster, kayitlar],
  )
  const gecersizSayisi = kayitlar.filter((kayit) => kayit.gecersiz).length

  return (
    <>
      {islem && (
        <GecersizKilmaModal
          islem={islem}
          onKapat={() => setIslem(null)}
          onTamamlandi={getir}
        />
      )}

      <div className="shrink-0 space-y-3 border-b border-gray-200 bg-white px-6 py-4">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setArama(aramaGirdisi.trim())
          }}
          className="flex flex-wrap items-center gap-3"
        >
          <div className="relative min-w-[220px] max-w-lg flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={aramaGirdisi}
              onChange={(event) => setAramaGirdisi(event.target.value)}
              placeholder="Malzeme, tedarikçi veya para birimi ara…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Ara
          </button>
          <button
            type="button"
            disabled={yukleniyor}
            onClick={() => void getir()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={yukleniyor ? 'animate-spin' : ''} />
            Yenile
          </button>
          <label className="ml-auto inline-flex items-center gap-2 text-xs font-medium text-gray-600">
            <input
              type="checkbox"
              checked={gecersizleriGoster}
              onChange={(event) => setGecersizleriGoster(event.target.checked)}
            />
            Geçersiz kayıtları göster
          </label>
        </form>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
            {kayitlar.length - gecersizSayisi} kullanılabilir
          </span>
          <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">
            {gecersizSayisi} geçersiz
          </span>
          <span className="px-1 py-1 text-gray-400">En fazla 500 kayıt gösterilir.</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {hata && (
          <div className="mx-6 mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={15} /> {hata}
          </div>
        )}

        {yukleniyor ? (
          <div className="p-10 text-center text-sm text-gray-500">
            <Loader2 size={22} className="mx-auto mb-2 animate-spin text-indigo-500" />
            Fiyat tarihçesi yükleniyor…
          </div>
        ) : gorunenKayitlar.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <CircleDollarSign size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Alış fiyatı bulunamadı.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Malzeme</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tedarikçi</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Fiyat</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Vade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Başlangıç</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Durum</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {gorunenKayitlar.map((kayit) => (
                  <tr
                    key={kayit.fiyat_id}
                    className={`border-b border-gray-100 align-top ${
                      kayit.gecersiz ? 'bg-red-50/30 text-gray-500' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{kayit.malzeme_adi}</div>
                      <div className="mt-0.5 text-xs text-gray-400">{kayit.alis_birimi}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-700">{kayit.tedarikci_adi}</div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        Ekleyen: {kayit.olusturan_kullanici}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-gray-900">
                      {ticariPara(kayit.birim_fiyat, kayit.para_birimi)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-600">
                      {kayit.vade_gunu} gün
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {ticariTarih(kayit.fiyat_tarihi)}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      {kayit.gecersiz ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700">
                            <Ban size={11} /> Geçersiz
                          </span>
                          <p className="mt-1 text-xs leading-5 text-red-700">
                            {kayit.gecersiz_kilma_gerekcesi}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {kayit.gecersiz_kilan_kullanici}
                            {kayit.gecersiz_kilma_tarihi
                              ? ` · ${ticariTarih(kayit.gecersiz_kilma_tarihi)}`
                              : ''}
                          </p>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 size={11} /> Kullanılabilir
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!kayit.gecersiz && (
                        <button
                          type="button"
                          onClick={() => setIslem({
                            kayit,
                            idempotencyKey: yeniIdempotencyAnahtari(),
                          })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          <Ban size={12} />
                          Geçersiz kıl
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
