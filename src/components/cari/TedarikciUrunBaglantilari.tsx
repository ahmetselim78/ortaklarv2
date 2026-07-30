import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  PackagePlus,
  Pencil,
  Power,
  Search,
  X,
} from 'lucide-react'
import {
  stokKategorisininTedarikKapsami,
  tedarikKapsamiEtiketi,
} from '@/lib/tedarikKapsami'
import {
  tedarikciStokBaglantisiKaydet,
  tedarikciStokBaglantisiPasiflestir,
} from '@/services/tedarikciService'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type { Cari, TedarikKapsami } from '@/types/cari'
import type {
  TedarikciStokAdayi,
  TedarikciStokBaglantiKatalogu,
  TedarikciStokBaglantisi,
} from '@/types/tedarikci'

const inputClass =
  'mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100'

function adayKapsami(aday: TedarikciStokAdayi) {
  return stokKategorisininTedarikKapsami(aday.kategori, aday.hizmet_turu)
}

function baglantiKapsami(baglanti: TedarikciStokBaglantisi) {
  return stokKategorisininTedarikKapsami(baglanti.kategori, baglanti.hizmet_turu)
}

export default function TedarikciUrunBaglantilari({
  tedarikci,
  katalog,
  kaydedebilir,
  pasiflestirebilir,
  onDegisti,
}: {
  tedarikci: Cari
  katalog: TedarikciStokBaglantiKatalogu
  kaydedebilir: boolean
  pasiflestirebilir: boolean
  onDegisti: () => Promise<void> | void
}) {
  const [kapsam, setKapsam] = useState<TedarikKapsami>(
    tedarikci.tedarik_kapsamlari[0] ?? 'cam',
  )
  const [arama, setArama] = useState('')
  const [formAcik, setFormAcik] = useState(false)
  const [seciliStoklar, setSeciliStoklar] = useState<Set<string>>(new Set())
  const [duzenlenen, setDuzenlenen] = useState<TedarikciStokBaglantisi | null>(null)
  const [marka, setMarka] = useState('')
  const [urunKodu, setUrunKodu] = useState('')
  const [vadeGunu, setVadeGunu] = useState('0')
  const [aciklama, setAciklama] = useState('')
  const [islem, setIslem] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)

  const aktifBaglantilar = useMemo(
    () => katalog.baglantilar.filter((baglanti) => baglanti.aktif),
    [katalog.baglantilar],
  )
  const pasifBaglantilar = useMemo(
    () => katalog.baglantilar.filter((baglanti) => !baglanti.aktif),
    [katalog.baglantilar],
  )
  const kapsamBaglantilari = useMemo(
    () => aktifBaglantilar.filter((baglanti) => baglantiKapsami(baglanti) === kapsam),
    [aktifBaglantilar, kapsam],
  )
  const kapsamPasifBaglantilari = useMemo(
    () => pasifBaglantilar.filter((baglanti) => baglantiKapsami(baglanti) === kapsam),
    [kapsam, pasifBaglantilar],
  )
  const adaylar = useMemo(() => {
    const aranan = arama.trim().toLocaleLowerCase('tr-TR')
    return katalog.adaylar
      .filter((aday) => adayKapsami(aday) === kapsam)
      .filter((aday) => !aranan || `${aday.stok_kodu} ${aday.stok_adi}`
        .toLocaleLowerCase('tr-TR')
        .includes(aranan))
  }, [arama, katalog.adaylar, kapsam])

  const formuSifirla = () => {
    setDuzenlenen(null)
    setSeciliStoklar(new Set())
    setMarka('')
    setUrunKodu('')
    setVadeGunu('0')
    setAciklama('')
  }

  const formuKapat = () => {
    setFormAcik(false)
    formuSifirla()
  }

  const duzenlemeyiAc = (baglanti: TedarikciStokBaglantisi) => {
    setKapsam(baglantiKapsami(baglanti))
    setDuzenlenen(baglanti)
    setSeciliStoklar(new Set([baglanti.stok_id]))
    setMarka(baglanti.marka ?? '')
    setUrunKodu(baglanti.tedarikci_urun_kodu ?? '')
    setVadeGunu(String(baglanti.varsayilan_vade_gunu))
    setAciklama(baglanti.aciklama ?? '')
    setFormAcik(true)
  }

  const baglantilariKaydet = async () => {
    const stokIdleri = duzenlenen ? [duzenlenen.stok_id] : [...seciliStoklar]
    const vade = Number(vadeGunu)
    if (stokIdleri.length === 0) {
      setHata('Bağlanacak en az bir ürün seçin.')
      return
    }
    if (!Number.isInteger(vade) || vade < 0 || vade > 3650) {
      setHata('Varsayılan vade 0–3650 arasında tam sayı olmalıdır.')
      return
    }
    setIslem('kaydet')
    setHata(null)
    setBilgi(null)
    try {
      await tedarikciStokBaglantisiKaydet({
        tedarikci_id: tedarikci.id,
        ...(duzenlenen || stokIdleri.length === 1
          ? { stok_id: stokIdleri[0] }
          : { stok_ids: stokIdleri }),
        marka: marka.trim() || undefined,
        tedarikci_urun_kodu: stokIdleri.length === 1 ? urunKodu.trim() || undefined : undefined,
        varsayilan_vade_gunu: vade,
        aciklama: aciklama.trim() || undefined,
        beklenen_revision_no: duzenlenen?.revision_no,
        kaynak_ekran: 'cari_tedarikci_detayi',
      }, yeniIdempotencyAnahtari())
      setBilgi(duzenlenen
        ? 'Ürün bağlantısı güncellendi.'
        : `${stokIdleri.length} ürün bu tedarikçiye bağlandı.`)
      formuKapat()
      await onDegisti()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Ürün bağlantıları kaydedilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const baglantiyiPasiflestir = async (baglanti: TedarikciStokBaglantisi) => {
    if (!window.confirm(`${baglanti.stok_adi} bağlantısı pasife alınsın mı? Fiyat geçmişi korunacaktır.`)) return
    setIslem(baglanti.id)
    setHata(null)
    setBilgi(null)
    try {
      await tedarikciStokBaglantisiPasiflestir(
        baglanti.id,
        baglanti.revision_no,
        'Cari tedarikçi çalışma alanından ürün bağlantısı pasife alındı.',
        yeniIdempotencyAnahtari(),
      )
      setBilgi('Ürün bağlantısı pasife alındı; geçmiş fiyatlar korundu.')
      await onDegisti()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Ürün bağlantısı pasife alınamadı.')
    } finally {
      setIslem(null)
    }
  }

  return (
    <div className="space-y-4" data-testid="tedarikci-urun-baglantilari">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-950">Tedarikçi ürünleri</h3>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-gray-500">
            Bu firmadan gerçekten aldığınız ürünleri bağlayın. Fiyat ekranında yalnız bu bağlantılar gösterilir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            formuSifirla()
            setFormAcik(true)
          }}
          disabled={!kaydedebilir || !tedarikci.aktif}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PackagePlus size={16} />
          Ürün bağla
        </button>
      </div>

      {hata && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{hata}</div>}
      {bilgi && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{bilgi}</div>}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tedarik kapsamları">
        {tedarikci.tedarik_kapsamlari.map((deger) => {
          const adet = aktifBaglantilar.filter((baglanti) => baglantiKapsami(baglanti) === deger).length
          return (
            <button
              key={deger}
              type="button"
              role="tab"
              aria-selected={kapsam === deger}
              onClick={() => {
                formuKapat()
                setArama('')
                setKapsam(deger)
              }}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${kapsam === deger ? 'border-violet-300 bg-violet-50 text-violet-800 ring-2 ring-violet-100' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {tedarikKapsamiEtiketi(deger)} · {adet}
            </button>
          )
        })}
      </div>

      {formAcik && (
        <section className="rounded-2xl border border-violet-200 bg-violet-50/35 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-violet-950">
                {duzenlenen
                  ? duzenlenen.aktif ? 'Ürün bağlantısını düzenle' : 'Ürün bağlantısını yeniden etkinleştir'
                  : `${tedarikKapsamiEtiketi(kapsam)} ürünü bağla`}
              </h4>
              <p className="mt-0.5 text-xs text-violet-700/80">Marka ve vade bu tedarikçi–ürün ilişkisinin varsayılanlarıdır.</p>
            </div>
            <button type="button" onClick={formuKapat} aria-label="Ürün bağlantısı formunu kapat" className="rounded-lg p-1.5 text-violet-500 hover:bg-white"><X size={16} /></button>
          </div>

          {!duzenlenen && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white">
              <label className="relative block border-b border-gray-100 p-3">
                <Search size={15} className="absolute left-6 top-[1.375rem] text-gray-400" />
                <input value={arama} onChange={(event) => setArama(event.target.value)} placeholder="Ürün kodu veya adı ara" className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-400" />
              </label>
              <div className="max-h-56 divide-y divide-gray-100 overflow-y-auto px-3">
                {adaylar.map((aday) => (
                  <label key={aday.stok_id} className="flex cursor-pointer items-start gap-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-gray-300 text-violet-600"
                      checked={seciliStoklar.has(aday.stok_id)}
                      onChange={(event) => setSeciliStoklar((onceki) => {
                        const sonraki = new Set(onceki)
                        if (event.target.checked) sonraki.add(aday.stok_id)
                        else sonraki.delete(aday.stok_id)
                        return sonraki
                      })}
                    />
                    <span className="min-w-0 flex-1"><span className="font-semibold text-gray-800">{aday.stok_kodu}</span><span className="ml-2 text-gray-600">{aday.stok_adi}</span></span>
                    <span className="text-xs text-gray-400">{aday.birim}</span>
                  </label>
                ))}
                {adaylar.length === 0 && <div className="py-8 text-center text-xs text-gray-500">Bu kapsamda bağlanabilecek yeni ürün yok.</div>}
              </div>
            </div>
          )}

          {duzenlenen && <div className="mt-4 rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm"><span className="font-semibold text-gray-800">{duzenlenen.stok_kodu}</span><span className="ml-2 text-gray-600">{duzenlenen.stok_adi}</span></div>}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-gray-700">Marka<input value={marka} onChange={(event) => setMarka(event.target.value)} placeholder="İsteğe bağlı" className={inputClass} /></label>
            <label className="text-xs font-medium text-gray-700">Tedarikçi ürün kodu<input value={urunKodu} disabled={!duzenlenen && seciliStoklar.size > 1} onChange={(event) => setUrunKodu(event.target.value)} placeholder={seciliStoklar.size > 1 ? 'Toplu seçimde kapalı' : 'İsteğe bağlı'} className={inputClass} /></label>
            <label className="text-xs font-medium text-gray-700">Varsayılan vade (gün)<input type="number" min="0" max="3650" step="1" value={vadeGunu} onChange={(event) => setVadeGunu(event.target.value)} className={inputClass} /></label>
            <label className="text-xs font-medium text-gray-700">Not<input value={aciklama} onChange={(event) => setAciklama(event.target.value)} placeholder="İsteğe bağlı" className={inputClass} /></label>
          </div>
          <button type="button" onClick={() => void baglantilariKaydet()} disabled={islem === 'kaydet' || (!duzenlenen && seciliStoklar.size === 0)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {islem === 'kaydet' ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
            {duzenlenen
              ? duzenlenen.aktif ? 'Bağlantıyı güncelle' : 'Yeniden etkinleştir'
              : `${seciliStoklar.size || ''} ürünü bağla`}
          </button>
        </section>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 bg-gray-50/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Bağlı {tedarikKapsamiEtiketi(kapsam)} ürünleri</div>
        <div className="divide-y divide-gray-100">
          {kapsamBaglantilari.map((baglanti) => (
            <div key={baglanti.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-gray-900">{baglanti.stok_kodu} · {baglanti.stok_adi}</span>{baglanti.marka && <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{baglanti.marka}</span>}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500"><span>{baglanti.varsayilan_vade_gunu === 0 ? 'Peşin' : `${baglanti.varsayilan_vade_gunu} gün vade`}</span><span>{baglanti.son_fiyat ? `Son fiyat: ${baglanti.son_fiyat.birim_fiyat} ${baglanti.son_fiyat.para_birimi}/${baglanti.son_fiyat.fiyat_birimi}` : 'Henüz fiyat yok'}</span>{baglanti.tedarikci_urun_kodu && <span>Tedarikçi kodu: {baglanti.tedarikci_urun_kodu}</span>}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => duzenlemeyiAc(baglanti)} disabled={!kaydedebilir} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Pencil size={13} /> Düzenle</button>
                <button type="button" onClick={() => void baglantiyiPasiflestir(baglanti)} disabled={!pasiflestirebilir || islem === baglanti.id} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">{islem === baglanti.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} Pasife al</button>
              </div>
            </div>
          ))}
          {kapsamBaglantilari.length === 0 && <div className="px-4 py-10 text-center text-sm text-gray-500">Bu kapsamda henüz bağlı ürün yok.</div>}
        </div>
      </div>

      {kapsamPasifBaglantilari.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/70">
          <div className="border-b border-gray-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Pasif bağlantılar · {kapsamPasifBaglantilari.length}
          </div>
          <div className="divide-y divide-gray-200">
            {kapsamPasifBaglantilari.map((baglanti) => (
              <div key={baglanti.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <div className="font-semibold text-gray-700">{baglanti.stok_kodu} · {baglanti.stok_adi}</div>
                  <div className="mt-1 text-xs text-gray-500">Fiyat geçmişi korunuyor; isterseniz aynı bağlantıyı yeniden etkinleştirebilirsiniz.</div>
                </div>
                <button
                  type="button"
                  onClick={() => duzenlemeyiAc(baglanti)}
                  disabled={!kaydedebilir || !tedarikci.aktif}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                >
                  <Link2 size={13} /> Yeniden bağla
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
