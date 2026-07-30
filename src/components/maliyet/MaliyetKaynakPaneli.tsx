import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Save,
  Search,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ticariBugun, ticariPara, ticariTarih } from '@/lib/ticariFormat'
import {
  stokMaliyetKaynakPaneliniGetirV3,
  stokMaliyetStokOverrideUygulaV3,
  stokMaliyetTopluPolitikaUygulaV3,
} from '@/services/maliyetService'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type {
  MaliyetTedarikcisi,
  StokMaliyetFiyatVaryanti,
  StokMaliyetKapsami,
  StokMaliyetKaynakPaneli,
  StokMaliyetKaynakPaneliSatiri,
} from '@/types/maliyet'

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

const kapsamEtiketi: Record<StokMaliyetKapsami, string> = {
  cam: 'Cam',
  cita: 'Çıta',
  yan_malzeme: 'Yan malzeme',
}

function varyantEtiketi(varyant: StokMaliyetFiyatVaryanti) {
  if (varyant === 'me') return 'ME'
  if (varyant === 'ju') return 'JU'
  return 'Genel'
}

function secimEtiketi(seviye: StokMaliyetKaynakPaneliSatiri['secim_seviyesi']) {
  if (seviye === 'stok_override') return 'Stok özel seçimi'
  if (seviye === 'toplu_politika') return 'Toplu politika'
  return 'Seçilmedi'
}

function vadeEtiketi(gun: number) {
  return gun === 0 ? 'Vade girilmemiş / peşin' : `${gun} gün`
}

function seciliFiyatIdiniBul(
  satir: StokMaliyetKaynakPaneliSatiri,
  taslakFiyatId?: string,
) {
  if (
    taslakFiyatId
    && satir.alternatifler.some((fiyat) => fiyat.fiyat_id === taslakFiyatId)
  ) {
    return taslakFiyatId
  }
  if (
    satir.aktif_fiyat
    && satir.alternatifler.some(
      (fiyat) => fiyat.fiyat_id === satir.aktif_fiyat?.fiyat_id,
    )
  ) {
    return satir.aktif_fiyat.fiyat_id
  }
  return satir.alternatifler[0]?.fiyat_id ?? ''
}

export default function MaliyetKaynakPaneli({
  tedarikciler,
  yonetebilir,
  onDegisti,
}: {
  tedarikciler: MaliyetTedarikcisi[]
  yonetebilir: boolean
  onDegisti: () => Promise<void> | void
}) {
  const [panel, setPanel] = useState<StokMaliyetKaynakPaneli | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [islem, setIslem] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const [arama, setArama] = useState('')
  const [filtre, setFiltre] = useState<'tumu' | StokMaliyetKapsami | 'eksik'>('tumu')
  const [acikStoklar, setAcikStoklar] = useState<Set<string>>(new Set())
  const [alternatifSecimleri, setAlternatifSecimleri] = useState<Record<string, string>>({})
  const [gerekce, setGerekce] = useState('Yetkili kullanıcı tarafından maliyet kaynağı seçildi.')
  const [kapsam, setKapsam] = useState<StokMaliyetKapsami>('cam')
  const [tedarikciId, setTedarikciId] = useState(tedarikciler[0]?.id ?? '')
  const [varyant, setVaryant] = useState<StokMaliyetFiyatVaryanti>('genel')
  const [vadeGunu, setVadeGunu] = useState('')
  const [genelFallback, setGenelFallback] = useState(true)
  const [baslangic, setBaslangic] = useState(ticariBugun())

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      setPanel(await stokMaliyetKaynakPaneliniGetirV3(baslangic))
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Aktif maliyet kaynakları yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }, [baslangic])

  useEffect(() => {
    void yukle()
  }, [yukle])

  const uygunTedarikciler = useMemo(
    () => tedarikciler.filter((tedarikci) => (
      !tedarikci.tedarik_kapsamlari
      || tedarikci.tedarik_kapsamlari.includes(kapsam)
    )),
    [kapsam, tedarikciler],
  )

  useEffect(() => {
    setTedarikciId((mevcut) => (
      uygunTedarikciler.some((tedarikci) => tedarikci.id === mevcut)
        ? mevcut
        : uygunTedarikciler[0]?.id ?? ''
    ))
    if (kapsam !== 'cam') setVaryant('genel')
  }, [kapsam, uygunTedarikciler])

  const vadeSecenekleri = useMemo(() => {
    const degerler = new Set<number>()
    for (const satir of panel?.stoklar ?? []) {
      if (satir.kapsam !== kapsam) continue
      for (const fiyat of satir.alternatifler) {
        if (fiyat.tedarikci_id !== tedarikciId) continue
        const varyantUygun = kapsam !== 'cam'
          || fiyat.varyant === varyant
          || (genelFallback && varyant !== 'genel' && fiyat.varyant === 'genel')
        if (varyantUygun && Number.isInteger(fiyat.vade_gunu) && fiyat.vade_gunu >= 0) {
          degerler.add(fiyat.vade_gunu)
        }
      }
    }
    return [...degerler].sort((a, b) => a - b)
  }, [genelFallback, kapsam, panel?.stoklar, tedarikciId, varyant])

  useEffect(() => {
    setVadeGunu((mevcut) => (
      mevcut !== '' && vadeSecenekleri.includes(Number(mevcut))
        ? mevcut
        : vadeSecenekleri[0] == null ? '' : String(vadeSecenekleri[0])
    ))
  }, [vadeSecenekleri])

  const satirlar = useMemo(() => {
    const terim = arama.trim().toLocaleLowerCase('tr-TR')
    return (panel?.stoklar ?? []).filter((satir) => {
      if (filtre === 'eksik' && satir.aktif_fiyat) return false
      if (filtre !== 'tumu' && filtre !== 'eksik' && satir.kapsam !== filtre) return false
      return !terim || `${satir.stok_kodu} ${satir.stok_adi}`
        .toLocaleLowerCase('tr-TR')
        .includes(terim)
    })
  }, [arama, filtre, panel?.stoklar])

  const aktifSayisi = panel?.stoklar.filter((satir) => satir.aktif_fiyat).length ?? 0
  const eksikSayisi = (panel?.stoklar.length ?? 0) - aktifSayisi

  const topluUygula = async (event: React.FormEvent) => {
    event.preventDefault()
    const vade = Number(vadeGunu)
    if (
      !tedarikciId
      || vadeGunu === ''
      || !Number.isInteger(vade)
      || vade < 0
      || vade > 3650
      || gerekce.trim().length < 5
    ) {
      setHata('Tedarikçi, mevcut fiyatlardan bir vade seçimi ve en az 5 karakterlik gerekçe zorunludur.')
      return
    }
    setHata(null)
    setBilgi(null)
    setIslem('toplu')
    try {
      const sonuc = await stokMaliyetTopluPolitikaUygulaV3({
        kapsam,
        tedarikci_id: tedarikciId,
        varyant: kapsam === 'cam' ? varyant : 'genel',
        vade_gunu: vade,
        genel_fallback: kapsam === 'cam' && genelFallback,
        baslangic: new Date(`${baslangic}T00:00:00+03:00`).toISOString(),
        gerekce: gerekce.trim(),
      }, yeniIdempotencyAnahtari())
      const secilenler = Array.isArray(sonuc.secilenler) ? sonuc.secilenler.length : 0
      const eksikler = Array.isArray(sonuc.eksikler) ? sonuc.eksikler.length : 0
      setBilgi(`${secilenler} stok için kaynak seçildi${eksikler > 0 ? `; ${eksikler} stokta eşleşen fiyat yok` : ''}.`)
      await Promise.all([yukle(), onDegisti()])
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Toplu maliyet politikası uygulanamadı.')
    } finally {
      setIslem(null)
    }
  }

  const tekUygula = async (satir: StokMaliyetKaynakPaneliSatiri) => {
    const fiyatId = seciliFiyatIdiniBul(
      satir,
      alternatifSecimleri[satir.stok_id],
    )
    if (!fiyatId || gerekce.trim().length < 5) {
      setHata('Bir fiyat seçin ve en az 5 karakterlik gerekçe yazın.')
      return
    }
    setHata(null)
    setBilgi(null)
    setIslem(satir.stok_id)
    try {
      await stokMaliyetStokOverrideUygulaV3({
        stok_id: satir.stok_id,
        fiyat_id: fiyatId,
        baslangic: new Date(`${baslangic}T00:00:00+03:00`).toISOString(),
        gerekce: gerekce.trim(),
      }, yeniIdempotencyAnahtari())
      setBilgi(`${satir.stok_kodu} için stok özel maliyet kaynağı seçildi.`)
      await Promise.all([yukle(), onDegisti()])
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Stok özel fiyatı seçilemedi.')
    } finally {
      setIslem(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Aktif maliyet kaynakları</h2>
          <p className="mt-1 text-sm text-gray-500">
            Her stokta hangi tedarikçi, marka, varyant ve vadenin hesapta kullanıldığını buradan izleyin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={yukleniyor}
            onClick={() => void yukle()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={yukleniyor ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>
      </div>

      {hata && (
        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" /> {hata}
        </div>
      )}
      {bilgi && (
        <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> {bilgi}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Ozet etiket="Toplam bileşen" deger={panel?.stoklar.length ?? 0} ton="text-gray-900" />
        <Ozet etiket="Aktif kaynak" deger={aktifSayisi} ton="text-emerald-700" />
        <Ozet etiket="Kaynağı eksik" deger={eksikSayisi} ton="text-red-700" />
      </div>

      {yonetebilir && (
        <form onSubmit={topluUygula} className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <h3 className="font-semibold text-blue-950">Toplu aktif kaynak seçimi</h3>
          <p className="mt-1 text-xs text-blue-700">Kategori için kullanılacak fiyat kaynağını tek adımda seçin.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-medium text-gray-700">
              Kapsam
              <select value={kapsam} onChange={(event) => setKapsam(event.target.value as StokMaliyetKapsami)} className={inputClass}>
                <option value="cam">Cam</option>
                <option value="cita">Çıta</option>
                <option value="yan_malzeme">Yan malzeme</option>
              </select>
            </label>
            <label className="text-xs font-medium text-gray-700">
              Tedarikçi
              <select value={tedarikciId} onChange={(event) => setTedarikciId(event.target.value)} className={inputClass}>
                <option value="">Tedarikçi seçin</option>
                {uygunTedarikciler.map((tedarikci) => (
                  <option key={tedarikci.id} value={tedarikci.id}>{tedarikci.ad}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-gray-700">
              Fiyat vadesi
              <select value={vadeGunu} onChange={(event) => setVadeGunu(event.target.value)} className={inputClass}>
                <option value="">Uygun fiyat/vade yok</option>
                {vadeSecenekleri.map((gun) => (
                  <option key={gun} value={gun}>{vadeEtiketi(gun)}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-gray-700">
              Varyant
              <select value={varyant} disabled={kapsam !== 'cam'} onChange={(event) => setVaryant(event.target.value as StokMaliyetFiyatVaryanti)} className={inputClass}>
                <option value="genel">Genel</option>
                <option value="me">ME</option>
                <option value="ju">JU</option>
              </select>
            </label>
            <label className="text-xs font-medium text-gray-700">
              Başlangıç
              <input type="date" value={baslangic} onChange={(event) => setBaslangic(event.target.value)} className={inputClass} />
            </label>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
            <label className="text-xs font-medium text-gray-700">
              Gerekçe
              <input value={gerekce} onChange={(event) => setGerekce(event.target.value)} className={inputClass} />
            </label>
            {kapsam === 'cam' && varyant !== 'genel' && (
              <label className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-xs text-gray-700">
                <input type="checkbox" checked={genelFallback} onChange={(event) => setGenelFallback(event.target.checked)} />
                ME/JU yoksa genel fiyatı kullan
              </label>
            )}
            <button
              type="submit"
              disabled={islem != null || !tedarikciId || vadeGunu === ''}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {islem === 'toplu' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Topluca uygula
            </button>
          </div>
        </form>
      )}

      <h3 className="text-base font-semibold text-gray-900">
        Ürün bazında aktif kaynak seçimi
      </h3>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="space-y-3 border-b border-gray-100 p-4">
          <label className="relative block w-full">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={arama} onChange={(event) => setArama(event.target.value)} placeholder="Stok kodu veya adı ara…" className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Kaynak listesi filtresi">
            {([
              ['tumu', 'Tümü'],
              ['eksik', `Eksikler (${eksikSayisi})`],
              ['cam', 'Cam'],
              ['cita', 'Çıta'],
              ['yan_malzeme', 'Yan malzeme'],
            ] as const).map(([deger, etiket]) => (
              <button
                key={deger}
                type="button"
                onClick={() => setFiltre(deger)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  filtre === deger
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {etiket}
              </button>
            ))}
          </div>
        </div>

        {yukleniyor && !panel ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-gray-500">
            <Loader2 size={18} className="animate-spin" /> Kaynaklar yükleniyor…
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {satirlar.map((satir) => {
              const acik = acikStoklar.has(satir.stok_id)
              const aktif = satir.aktif_fiyat
              const seciliFiyatId = seciliFiyatIdiniBul(
                satir,
                alternatifSecimleri[satir.stok_id],
              )
              return (
                <div key={satir.stok_id}>
                  <button
                    type="button"
                    onClick={() => setAcikStoklar((onceki) => {
                      const yeni = new Set(onceki)
                      if (yeni.has(satir.stok_id)) yeni.delete(satir.stok_id)
                      else yeni.add(satir.stok_id)
                      return yeni
                    })}
                    className="grid w-full gap-3 px-4 py-3 text-left hover:bg-gray-50 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_8rem_auto] sm:items-center"
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      {acik ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-gray-400" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-gray-400" />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-900">{satir.stok_kodu} · {satir.stok_adi}</span>
                        <span className="mt-0.5 block text-[11px] text-gray-400">{kapsamEtiketi[satir.kapsam]} · {secimEtiketi(satir.secim_seviyesi)}</span>
                      </span>
                    </span>
                    <span className="text-xs text-gray-600">
                      {aktif ? (
                        <>
                          <span className="block font-semibold text-gray-900">{aktif.tedarikci_adi}</span>
                          <span>{aktif.marka || 'Marka yok'} · {varyantEtiketi(aktif.varyant)} · {vadeEtiketi(aktif.vade_gunu)}</span>
                        </>
                      ) : <span className="font-semibold text-red-600">Aktif kaynak yok</span>}
                    </span>
                    <span className="text-right text-xs">
                      {aktif && (
                        <>
                          <span className="block font-bold text-blue-700">{ticariPara(aktif.birim_fiyat, aktif.para_birimi)}</span>
                          <span className="text-gray-400">/{aktif.fiyat_birimi}</span>
                        </>
                      )}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-center text-[10px] font-semibold text-gray-600">
                      {satir.alternatifler.length} alternatif
                    </span>
                  </button>
                  {acik && (
                    <div className="bg-slate-50 px-5 py-4">
                      {satir.alternatifler.length === 0 ? (
                        <p className="text-xs text-amber-700">Bu stok için henüz tedarikçi fiyatı girilmedi.</p>
                      ) : (
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                          <label className="text-xs font-medium text-gray-700">
                            Stok özel fiyatı
                            <select
                              value={seciliFiyatId}
                              onChange={(event) => setAlternatifSecimleri((onceki) => ({
                                ...onceki,
                                [satir.stok_id]: event.target.value,
                              }))}
                              className={inputClass}
                            >
                              {satir.alternatifler.map((fiyat) => (
                                <option key={fiyat.fiyat_id} value={fiyat.fiyat_id}>
                                  {aktif?.fiyat_id === fiyat.fiyat_id ? 'Hesapta · ' : ''}{fiyat.tedarikci_adi} · {fiyat.marka || 'markasız'} · {varyantEtiketi(fiyat.varyant)} · {vadeEtiketi(fiyat.vade_gunu)} · {ticariPara(fiyat.birim_fiyat, fiyat.para_birimi)}/{fiyat.fiyat_birimi} · {ticariTarih(fiyat.fiyat_tarihi)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {yonetebilir && (
                            <button
                              type="button"
                              disabled={islem != null || aktif?.fiyat_id === seciliFiyatId}
                              onClick={() => void tekUygula(satir)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {islem === satir.stok_id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                              Bu fiyatı kullan
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {satirlar.length === 0 && (
              <div className="p-10 text-center text-sm text-gray-500">Filtreye uygun stok bulunamadı.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Ozet({
  etiket,
  deger,
  ton,
}: {
  etiket: string
  deger: number
  ton: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-500">{etiket}</div>
      <div className={`mt-2 text-2xl font-bold ${ton}`}>{deger}</div>
    </div>
  )
}
