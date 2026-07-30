import {
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ticariBugun, ticariPara, ticariTarih } from '@/lib/ticariFormat'
import { cn } from '@/lib/utils'
import { maliyetUrunMaliyetTarihcesiniGetir } from '@/services/maliyetService'
import type { MaliyetTarihceUrunu, MaliyetUrunTarihceKaydi } from '@/types/maliyet'

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

const olayEtiketleri: Record<string, string> = {
  recete_baslangici: 'Reçete',
  recete_bitisi: 'Reçete dönemi',
  bilesen_fire_baslangici: 'Fire',
  bilesen_fire_bitisi: 'Fire dönemi',
  bilesen_kaynak_baslangici: 'Kaynak',
  bilesen_kaynak_bitisi: 'Kaynak dönemi',
  temper_modu_baslangici: 'Temper modeli',
  temper_modu_bitisi: 'Temper modeli dönemi',
  temper_fiyat_baslangici: 'Temper fiyatı',
  temper_fiyat_bitisi: 'Temper fiyat dönemi',
  sorgu_baslangici: 'Aralık başlangıcı',
  sorgu_bitisi: 'Aralık sonu',
}

function grupEtiketi(urun: MaliyetTarihceUrunu) {
  return urun.urun_grubu?.trim() || 'Diğer'
}

function olaylariEtiketle(olaylar: string[]) {
  return [...new Set(olaylar.map((olay) => olayEtiketleri[olay] ?? olay))]
}

function eksikSayisi(kayit: MaliyetUrunTarihceKaydi) {
  const eksikler = kayit.detay.eksikler
  return Array.isArray(eksikler) ? eksikler.length : 0
}

function degisimRengi(fark: number | null) {
  if (fark == null || fark === 0) return 'text-gray-500'
  return fark > 0 ? 'text-red-700' : 'text-emerald-700'
}

export default function UrunMaliyetTarihcesiPaneli({
  urunler,
}: {
  urunler: MaliyetTarihceUrunu[]
}) {
  const tekilUrunler = useMemo(() => {
    const harita = new Map<string, MaliyetTarihceUrunu>()
    for (const urun of urunler) harita.set(urun.stok_id, urun)
    return [...harita.values()].sort((sol, sag) => (
      `${sol.stok_kodu} ${sol.urun_adi}`.localeCompare(
        `${sag.stok_kodu} ${sag.urun_adi}`,
        'tr-TR',
        { numeric: true, sensitivity: 'base' },
      )
    ))
  }, [urunler])
  const gruplar = useMemo(() => [...new Set(tekilUrunler.map(grupEtiketi))]
    .sort((a, b) => a.localeCompare(b, 'tr-TR')), [tekilUrunler])

  const [grup, setGrup] = useState('tumu')
  const [arama, setArama] = useState('')
  const [stokId, setStokId] = useState('')
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState(ticariBugun())
  const [limit, setLimit] = useState(200)
  const [kayitlar, setKayitlar] = useState<MaliyetUrunTarihceKaydi[]>([])
  const [kayitBaglami, setKayitBaglami] = useState('')
  const [toplamKayit, setToplamKayit] = useState(0)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [yenilemeNo, setYenilemeNo] = useState(0)

  const filtreliUrunler = useMemo(() => {
    const terim = arama.trim().toLocaleLowerCase('tr-TR')
    return tekilUrunler.filter((urun) => (
      (grup === 'tumu' || grupEtiketi(urun) === grup)
      && (!terim || `${urun.stok_kodu} ${urun.urun_adi}`
        .toLocaleLowerCase('tr-TR')
        .includes(terim))
    ))
  }, [arama, grup, tekilUrunler])

  const etkinStokId = filtreliUrunler.some((urun) => urun.stok_id === stokId)
    ? stokId
    : filtreliUrunler[0]?.stok_id ?? ''
  const etkinUrun = tekilUrunler.find((urun) => urun.stok_id === etkinStokId) ?? null
  const tarihHatasi = baslangic && bitis && baslangic > bitis
    ? 'Başlangıç tarihi bitiş tarihinden sonra olamaz.'
    : null
  const sorguBaglami = [etkinStokId, baslangic, bitis, String(limit)].join('\u001f')

  useEffect(() => {
    let aktif = true
    if (!etkinStokId || tarihHatasi) {
      return () => {
        aktif = false
      }
    }

    void Promise.resolve()
      .then(() => {
        if (!aktif) return []
        setYukleniyor(true)
        setHata(null)
        return maliyetUrunMaliyetTarihcesiniGetir(
          etkinStokId,
          baslangic || undefined,
          bitis || undefined,
          limit,
        )
      })
      .then((sonuc) => {
        if (!aktif) return
        setKayitlar(sonuc)
        setKayitBaglami(sorguBaglami)
        setToplamKayit(sonuc[0]?.toplam_kayit ?? sonuc.length)
      })
      .catch((error) => {
        if (!aktif) return
        setHata(error instanceof Error ? error.message : 'Ürün maliyeti tarihçesi yüklenemedi.')
      })
      .finally(() => {
        if (aktif) setYukleniyor(false)
      })

    return () => {
      aktif = false
    }
  }, [baslangic, bitis, etkinStokId, limit, sorguBaglami, tarihHatasi, yenilemeNo])

  const gorunenKayitlar = kayitBaglami === sorguBaglami ? kayitlar : []
  const gorunenToplamKayit = kayitBaglami === sorguBaglami ? toplamKayit : 0
  const gorunenYukleniyor = Boolean(etkinStokId && !tarihHatasi && yukleniyor)
  const sonKayit = gorunenKayitlar[0] ?? null
  const sonDegisimKaydi = gorunenKayitlar.find((kayit) => (
    kayit.gecerli
    && kayit.maliyet_farki != null
    && kayit.maliyet_farki !== 0
  )) ?? null

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Ürün maliyeti zaman çizelgesi</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Seçilen ürünün 1 m² maliyeti, tarihsel reçete ve maliyet girdileriyle yeniden hesaplanır.
          </p>
        </div>
        <button
          type="button"
          disabled={gorunenYukleniyor || !etkinStokId || Boolean(tarihHatasi)}
          onClick={() => setYenilemeNo((deger) => deger + 1)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={gorunenYukleniyor ? 'animate-spin' : ''} />
          Yenile
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ürün grubu filtresi">
          {['tumu', ...gruplar].map((deger) => (
            <button
              key={deger}
              type="button"
              onClick={() => setGrup(deger)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                grup === deger
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {deger === 'tumu' ? `Tümü (${tekilUrunler.length})` : deger}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(14rem,.8fr)_10rem_10rem_8rem]">
          <label className="relative block text-xs font-medium text-gray-700">
            Ürün ara
            <span className="relative mt-1 block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={arama}
                onChange={(event) => setArama(event.target.value)}
                placeholder="Kod veya ürün adı..."
                className={`${inputClass} mt-0 pl-9`}
              />
            </span>
          </label>
          <label className="text-xs font-medium text-gray-700">
            Ürün
            <select
              value={etkinStokId}
              onChange={(event) => setStokId(event.target.value)}
              className={inputClass}
            >
              {filtreliUrunler.length === 0 && <option value="">Ürün bulunamadı</option>}
              {filtreliUrunler.map((urun) => (
                <option key={urun.stok_id} value={urun.stok_id}>
                  {urun.stok_kodu} · {urun.urun_adi}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-700">
            Başlangıç
            <input type="date" value={baslangic} onChange={(event) => setBaslangic(event.target.value)} className={inputClass} />
          </label>
          <label className="text-xs font-medium text-gray-700">
            Bitiş
            <input type="date" value={bitis} onChange={(event) => setBitis(event.target.value)} className={inputClass} />
          </label>
          <label className="text-xs font-medium text-gray-700">
            Kayıt sınırı
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} className={inputClass}>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </label>
        </div>
      </div>

      {etkinStokId && (tarihHatasi || hata) && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>
            {tarihHatasi || hata}
            {!tarihHatasi && gorunenKayitlar.length > 0 ? ' Son alınan sonuçlar gösteriliyor.' : ''}
          </span>
        </div>
      )}

      {etkinUrun && sonKayit && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Ozet etiket="Seçili ürün" deger={etkinUrun.stok_kodu} aciklama={etkinUrun.urun_adi} />
          <Ozet
            etiket="Son 1 m² maliyeti"
            deger={sonKayit.m2_maliyet == null ? 'Hesaplanamadı' : ticariPara(sonKayit.m2_maliyet, 'TRY')}
            aciklama={ticariTarih(sonKayit.olay_tarihi)}
          />
          <Ozet
            etiket="Son değişim"
            deger={sonDegisimKaydi ? ticariPara(sonDegisimKaydi.maliyet_farki, 'TRY') : 'Değişim yok'}
            aciklama={sonDegisimKaydi
              ? `${ticariTarih(sonDegisimKaydi.olay_tarihi)} · %${sonDegisimKaydi.maliyet_farki_yuzde?.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) ?? '—'}`
              : 'Seçilen aralıkta farklı maliyet bulunamadı'}
            ton={degisimRengi(sonDegisimKaydi?.maliyet_farki ?? null)}
          />
          <Ozet
            etiket="Tarihçe kapsamı"
            deger={`${gorunenKayitlar.length}/${gorunenToplamKayit}`}
            aciklama="olay tarihi gösteriliyor"
          />
        </div>
      )}

      {gorunenToplamKayit > gorunenKayitlar.length && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {gorunenToplamKayit.toLocaleString('tr-TR')} olayın en yeni {gorunenKayitlar.length.toLocaleString('tr-TR')} tanesi gösteriliyor.
          Daha eski kayıtlar için bitiş tarihini geriye alın veya kayıt sınırını yükseltin.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {gorunenYukleniyor && gorunenKayitlar.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-gray-500">
            <Loader2 size={18} className="animate-spin" /> Maliyet tarihçesi hesaplanıyor…
          </div>
        ) : gorunenKayitlar.length === 0 ? (
          <div className="p-12 text-center">
            <History size={28} className="mx-auto text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">Bu ürün ve tarih aralığında maliyet olayı bulunamadı.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 md:hidden">
              {gorunenKayitlar.map((kayit) => {
                const olaylar = olaylariEtiketle(kayit.olay_turleri)
                return (
                  <article key={`mobil-${kayit.stok_id}-${kayit.olay_tarihi}`} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{ticariTarih(kayit.olay_tarihi)}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {olaylar.map((olay) => (
                            <span key={olay} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              {olay}
                            </span>
                          ))}
                        </div>
                      </div>
                      {kayit.gecerli ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 size={13} /> Hesaplandı
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-700">
                          <AlertTriangle size={13} /> {eksikSayisi(kayit)} eksik
                        </span>
                      )}
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3 rounded-lg bg-gray-50 p-3">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">1 m² maliyet</div>
                        <div className="mt-1 text-lg font-bold text-blue-700">
                          {kayit.m2_maliyet == null ? '—' : ticariPara(kayit.m2_maliyet, 'TRY')}
                        </div>
                      </div>
                      <div className={cn('text-right text-xs font-semibold', degisimRengi(kayit.maliyet_farki))}>
                        <div>{kayit.maliyet_farki == null ? 'İlk kayıt' : `${kayit.maliyet_farki > 0 ? '+' : ''}${ticariPara(kayit.maliyet_farki, 'TRY')}`}</div>
                        {kayit.maliyet_farki_yuzde != null && (
                          <div className="mt-0.5 text-[10px] font-normal">
                            {kayit.maliyet_farki_yuzde > 0 ? '+' : ''}%{kayit.maliyet_farki_yuzde.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <MobilMaliyetKalemi etiket="Cam" deger={kayit.cam_maliyeti} />
                      <MobilMaliyetKalemi etiket="Çıta" deger={kayit.cita_maliyeti} />
                      <MobilMaliyetKalemi etiket="Sarf" deger={kayit.sarf_maliyeti} />
                      <MobilMaliyetKalemi etiket="Temper / işlem" deger={kayit.islem_maliyeti} />
                    </div>
                  </article>
                )
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="bg-gray-50 text-left font-semibold text-gray-500">
                <tr>
                  <th className="px-4 py-3">Tarih / değişiklik</th>
                  <th className="px-3 py-3">Durum</th>
                  <th className="px-3 py-3 text-right">1 m² maliyet</th>
                  <th className="px-3 py-3 text-right">Cam</th>
                  <th className="px-3 py-3 text-right">Çıta</th>
                  <th className="px-3 py-3 text-right">Sarf</th>
                  <th className="px-3 py-3 text-right">Temper / işlem</th>
                  <th className="px-4 py-3 text-right">Önceki kayda göre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gorunenKayitlar.map((kayit) => {
                  const olaylar = olaylariEtiketle(kayit.olay_turleri)
                  const yukselis = (kayit.maliyet_farki ?? 0) > 0
                  const dusus = (kayit.maliyet_farki ?? 0) < 0
                  return (
                    <tr key={`${kayit.stok_id}-${kayit.olay_tarihi}`} className="align-top hover:bg-gray-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{ticariTarih(kayit.olay_tarihi)}</div>
                        <div className="mt-1 flex max-w-xs flex-wrap gap-1">
                          {olaylar.map((olay) => (
                            <span key={olay} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              {olay}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {kayit.gecerli ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <CheckCircle2 size={13} /> Hesaplandı
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                            <AlertTriangle size={13} /> {eksikSayisi(kayit)} eksik
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-blue-700">
                        {kayit.m2_maliyet == null ? '—' : ticariPara(kayit.m2_maliyet, 'TRY')}
                        {kayit.fire_etkisi != null && kayit.fire_etkisi !== 0 && (
                          <div className="mt-0.5 text-[10px] font-normal text-amber-600">
                            Fire: {ticariPara(kayit.fire_etkisi, 'TRY')}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700">{kayit.cam_maliyeti == null ? '—' : ticariPara(kayit.cam_maliyeti, 'TRY')}</td>
                      <td className="px-3 py-3 text-right text-gray-700">{kayit.cita_maliyeti == null ? '—' : ticariPara(kayit.cita_maliyeti, 'TRY')}</td>
                      <td className="px-3 py-3 text-right text-gray-700">{kayit.sarf_maliyeti == null ? '—' : ticariPara(kayit.sarf_maliyeti, 'TRY')}</td>
                      <td className="px-3 py-3 text-right text-gray-700">{ticariPara(kayit.islem_maliyeti, 'TRY')}</td>
                      <td className={cn('px-4 py-3 text-right font-semibold', degisimRengi(kayit.maliyet_farki))}>
                        {kayit.maliyet_farki == null ? 'İlk kayıt' : (
                          <span className="inline-flex items-center justify-end gap-1">
                            {yukselis && <TrendingUp size={13} />}
                            {dusus && <TrendingDown size={13} />}
                            {kayit.maliyet_farki > 0 ? '+' : ''}{ticariPara(kayit.maliyet_farki, 'TRY')}
                          </span>
                        )}
                        {kayit.maliyet_farki_yuzde != null && (
                          <div className="mt-0.5 text-[10px] font-normal">
                            {kayit.maliyet_farki_yuzde > 0 ? '+' : ''}%{kayit.maliyet_farki_yuzde.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function MobilMaliyetKalemi({ etiket, deger }: { etiket: string; deger: number | null }) {
  return (
    <div className="rounded-lg border border-gray-100 px-3 py-2">
      <div className="text-[10px] text-gray-400">{etiket}</div>
      <div className="mt-0.5 font-semibold text-gray-700">
        {deger == null ? '—' : ticariPara(deger, 'TRY')}
      </div>
    </div>
  )
}

function Ozet({
  etiket,
  deger,
  aciklama,
  ton = 'text-gray-900',
}: {
  etiket: string
  deger: string
  aciklama: string
  ton?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-500">{etiket}</div>
      <div className={cn('mt-2 truncate text-lg font-bold', ton)} title={deger}>{deger}</div>
      <div className="mt-1 truncate text-[11px] text-gray-400" title={aciklama}>{aciklama}</div>
    </div>
  )
}
