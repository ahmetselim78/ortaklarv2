import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Percent,
  Save,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ticariBugun, ticariTarih } from '@/lib/ticariFormat'
import { stokFireOraniKaydetV3 } from '@/services/maliyetService'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type { StokFireOraniSurumu } from '@/types/maliyet'

type FireKategorisi = StokFireOraniSurumu['kategori']

interface FireOranlariPaneliProps {
  fireler: StokFireOraniSurumu[]
  duzenleyebilir: boolean
  onDegisti: () => Promise<void> | void
}

const kategoriBilgileri: Record<FireKategorisi, {
  etiket: string
  aciklama: string
  kayitAciklamasi: string
}> = {
  cam: {
    etiket: 'Cam',
    aciklama: 'Kesim ve ebatlama sırasında oluşan cam kaybını her cam ürünü için ayrı belirleyin.',
    kayitAciklamasi: 'cam fire oranı',
  },
  cita: {
    etiket: 'Çıta',
    aciklama: 'Çıta kesimi ve birleştirme işlemlerindeki kaybı her çıta ürünü için ayrı belirleyin.',
    kayitAciklamasi: 'çıta fire oranı',
  },
  yan_malzeme: {
    etiket: 'Yan malzeme',
    aciklama: 'Conta, butil ve diğer yardımcı malzemelerdeki kullanım kaybını ürün bazında belirleyin.',
    kayitAciklamasi: 'yan malzeme fire oranı',
  },
}

const kategoriler = Object.keys(kategoriBilgileri) as FireKategorisi[]

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500'

// Panel yenilenirken kullanıcı taslaklarını koruyan birleştirme sözleşmesi test edilir.
// eslint-disable-next-line react-refresh/only-export-components
export function fireDegerleriniBirlestir(
  fireler: StokFireOraniSurumu[],
  oncekiDegerler: Record<string, string>,
  oncekiSunucuOranlari: Record<string, number>,
  kaydedilenOranlar: Record<string, number>,
) {
  const yeniDegerler: Record<string, string> = {}
  const yeniSunucuOranlari: Record<string, number> = {}
  const bekleyenKaydedilenOranlar: Record<string, number> = {}

  for (const fire of fireler) {
    const stokId = fire.stok_id
    const sunucuOrani = fire.fire_orani
    const kaydedilenOran = kaydedilenOranlar[stokId]
    const oncekiBazOran = kaydedilenOran ?? oncekiSunucuOranlari[stokId]
    const oncekiDeger = oncekiDegerler[stokId]
    const sayisalDeger = Number(oncekiDeger?.trim())
    const taslakDegisti = oncekiDeger != null
      && (
        oncekiDeger.trim() === ''
        || !Number.isFinite(sayisalDeger)
        || (oncekiBazOran != null && sayisalDeger !== oncekiBazOran)
      )
    const kayitSunucuyaYansidi = kaydedilenOran != null
      && sunucuOrani === kaydedilenOran

    yeniSunucuOranlari[stokId] = sunucuOrani
    if (kaydedilenOran != null && !kayitSunucuyaYansidi) {
      bekleyenKaydedilenOranlar[stokId] = kaydedilenOran
    }

    if (taslakDegisti) {
      yeniDegerler[stokId] = oncekiDeger
    } else if (bekleyenKaydedilenOranlar[stokId] != null) {
      yeniDegerler[stokId] = String(bekleyenKaydedilenOranlar[stokId])
    } else {
      yeniDegerler[stokId] = String(sunucuOrani)
    }
  }

  return {
    degerler: yeniDegerler,
    sunucuOranlari: yeniSunucuOranlari,
    kaydedilenOranlar: bekleyenKaydedilenOranlar,
  }
}

export default function FireOranlariPaneli({
  fireler,
  duzenleyebilir,
  onDegisti,
}: FireOranlariPaneliProps) {
  const [kategori, setKategori] = useState<FireKategorisi>('cam')
  const [arama, setArama] = useState('')
  const [degerler, setDegerler] = useState<Record<string, string>>({})
  const [kaydedilenOranlar, setKaydedilenOranlar] = useState<Record<string, number>>({})
  const [kaydediliyor, setKaydediliyor] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [yenilemeHatasi, setYenilemeHatasi] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const degerlerRef = useRef<Record<string, string>>({})
  const sunucuOranlariRef = useRef<Record<string, number>>({})
  const kaydedilenOranlarRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const birlesmis = fireDegerleriniBirlestir(
      fireler,
      degerlerRef.current,
      sunucuOranlariRef.current,
      kaydedilenOranlarRef.current,
    )
    degerlerRef.current = birlesmis.degerler
    sunucuOranlariRef.current = birlesmis.sunucuOranlari
    kaydedilenOranlarRef.current = birlesmis.kaydedilenOranlar
    setDegerler(birlesmis.degerler)
    setKaydedilenOranlar(birlesmis.kaydedilenOranlar)
  }, [fireler])

  const kategoriAdetleri = useMemo(() => Object.fromEntries(
    kategoriler.map((anahtar) => [
      anahtar,
      fireler.filter((fire) => fire.kategori === anahtar).length,
    ]),
  ) as Record<FireKategorisi, number>, [fireler])

  const gorunenFireler = useMemo(() => {
    const terim = arama.trim().toLocaleLowerCase('tr-TR')
    return fireler
      .filter((fire) => fire.kategori === kategori)
      .filter((fire) => !terim || `${fire.stok_kodu} ${fire.stok_adi}`
        .toLocaleLowerCase('tr-TR')
        .includes(terim))
      .sort((sol, sag) => sol.stok_kodu.localeCompare(sag.stok_kodu, 'tr-TR', {
        numeric: true,
        sensitivity: 'base',
      }))
  }, [arama, fireler, kategori])

  const fireKaydet = async (fire: StokFireOraniSurumu) => {
    const hamDeger = degerler[fire.stok_id]?.trim() ?? ''
    const oran = Number(hamDeger)

    if (hamDeger === '' || !Number.isFinite(oran) || oran < 0 || oran >= 100) {
      setBilgi(null)
      setYenilemeHatasi(null)
      setHata('Fire oranı 0 veya daha büyük, 100’den küçük bir sayı olmalıdır.')
      return
    }

    setHata(null)
    setYenilemeHatasi(null)
    setBilgi(null)
    setKaydediliyor(fire.stok_id)

    try {
      const kategoriBilgisi = kategoriBilgileri[fire.kategori]
      await stokFireOraniKaydetV3({
        stok_id: fire.stok_id,
        fire_orani: oran,
        baslangic: ticariBugun(),
        aciklama: `${fire.stok_kodu} ${kategoriBilgisi.kayitAciklamasi} kullanıcı tarafından güncellendi.`,
        kaynak_ekran: 'maliyet_fire_oranlari',
      }, yeniIdempotencyAnahtari())

      const yeniKaydedilenOranlar = {
        ...kaydedilenOranlarRef.current,
        [fire.stok_id]: oran,
      }
      kaydedilenOranlarRef.current = yeniKaydedilenOranlar
      setKaydedilenOranlar(yeniKaydedilenOranlar)
      setBilgi(`${fire.stok_kodu} için fire oranı %${oran} olarak kaydedildi.`)
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Fire oranı kaydedilemedi.')
      setKaydediliyor(null)
      return
    }

    try {
      await onDegisti()
    } catch (error) {
      const ayrinti = error instanceof Error ? ` ${error.message}` : ''
      setYenilemeHatasi(
        `Fire oranı kaydedildi ancak güncel liste yeniden alınamadı.${ayrinti}`,
      )
    } finally {
      setKaydediliyor(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-amber-100 p-2.5 text-amber-700">
            <Percent size={20} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Ürün fire oranları</h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Maliyet hesabına eklenecek üretim kaybını kategori ve ürün bazında yönetin.
              Her kayıt bugünden başlayan yeni bir sürüm oluşturur.
            </p>
          </div>
        </div>
        {!duzenleyebilir && (
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
            Salt okunur
          </span>
        )}
      </div>

      {hata && (
        <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{hata}</span>
        </div>
      )}
      {bilgi && (
        <div role="status" className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          <span>{bilgi}</span>
        </div>
      )}
      {yenilemeHatasi && (
        <div role="alert" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{yenilemeHatasi} Kaydı tekrar göndermeyin; sayfayı yenileyerek kontrol edin.</span>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-3 sm:p-4">
          <div role="tablist" aria-label="Fire oranı kategorileri" className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
            {kategoriler.map((anahtar) => {
              const aktif = kategori === anahtar
              return (
                <button
                  key={anahtar}
                  type="button"
                  role="tab"
                  aria-selected={aktif}
                  onClick={() => {
                    setKategori(anahtar)
                    setHata(null)
                    setYenilemeHatasi(null)
                    setBilgi(null)
                  }}
                  className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                    aktif
                      ? 'bg-white text-amber-800 shadow-sm ring-1 ring-black/5'
                      : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
                  }`}
                >
                  {kategoriBilgileri[anahtar].etiket}
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                    aktif ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {kategoriAdetleri[anahtar]}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-gray-600">{kategoriBilgileri[kategori].aciklama}</p>
            <label className="relative block w-full lg:w-80">
              <span className="sr-only">Ürün ara</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={arama}
                onChange={(event) => setArama(event.target.value)}
                placeholder="Kod veya ürün adı ara..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </label>
          </div>
        </div>

        {gorunenFireler.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Percent size={28} className="mx-auto text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">
              {arama.trim() ? 'Aramayla eşleşen ürün bulunamadı.' : 'Bu kategoride fire kaydı bulunmuyor.'}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {arama.trim() ? 'Farklı bir kod veya ürün adı deneyin.' : 'Ürünler hazır olduğunda burada listelenecek.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
            {gorunenFireler.map((fire) => {
              const deger = degerler[fire.stok_id] ?? ''
              const sayisalDeger = Number(deger)
              const kayitliOran = kaydedilenOranlar[fire.stok_id] ?? fire.fire_orani
              const degisti = deger.trim() !== ''
                && Number.isFinite(sayisalDeger)
                && sayisalDeger !== kayitliOran
              const buSatirKaydediliyor = kaydediliyor === fire.stok_id

              return (
                <article key={fire.stok_id} className="flex flex-col rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900" title={fire.stok_adi}>
                      {fire.stok_adi}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                      <span className="font-mono font-medium text-gray-600">{fire.stok_kodu}</span>
                      <span aria-hidden="true">·</span>
                      <span>Sürüm {fire.revision_no}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ticariTarih(fire.gecerlilik_baslangici)}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-xs font-medium text-gray-700">
                      Fire oranı
                      <span className="relative mt-1 block">
                        <input
                          type="number"
                          min="0"
                          max="99.9999"
                          step="0.01"
                          inputMode="decimal"
                          disabled={!duzenleyebilir || kaydediliyor !== null}
                          value={deger}
                          onChange={(event) => {
                            const yeniDegerler = {
                              ...degerlerRef.current,
                              [fire.stok_id]: event.target.value,
                            }
                            degerlerRef.current = yeniDegerler
                            setDegerler(yeniDegerler)
                          }}
                          aria-label={`${fire.stok_adi} fire oranı`}
                          className={`${inputClass} pr-9`}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">%</span>
                      </span>
                    </label>
                    {duzenleyebilir && (
                      <button
                        type="button"
                        disabled={kaydediliyor !== null || !degisti}
                        onClick={() => void fireKaydet(fire)}
                        className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {buSatirKaydediliyor
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Save size={14} />}
                        {buSatirKaydediliyor ? 'Kaydediliyor' : 'Kaydet'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
