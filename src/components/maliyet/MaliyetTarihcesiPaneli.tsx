import {
  AlertTriangle,
  History,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ticariPara, ticariTarih } from '@/lib/ticariFormat'
import { cn } from '@/lib/utils'
import { maliyetAlisFiyatiTarihcesiniGetir } from '@/services/maliyetService'
import type {
  MaliyetAlisFiyatiTarihceKaydi,
  MaliyetMalzemeTuru,
} from '@/types/maliyet'

type KategoriFiltresi = 'tumu' | MaliyetMalzemeTuru
type FiyatDegisimi = { fark: number; yuzde: number | null }

const TARIHCE_KAYIT_LIMITI = 2000

const kategoriSekmeleri: Array<{ id: KategoriFiltresi; etiket: string }> = [
  { id: 'tumu', etiket: 'Tümü' },
  { id: 'cam', etiket: 'Cam' },
  { id: 'cita', etiket: 'Çıta' },
  { id: 'sarf', etiket: 'Sarf' },
]

const kategoriEtiketleri: Record<MaliyetMalzemeTuru, string> = {
  cam: 'Cam',
  cita: 'Çıta',
  sarf: 'Sarf',
}

const kategoriRozetleri: Record<MaliyetMalzemeTuru, string> = {
  cam: 'bg-sky-100 text-sky-700',
  cita: 'bg-amber-100 text-amber-800',
  sarf: 'bg-violet-100 text-violet-700',
}

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

// Test edilen sınıflandırma sözleşmesi panelle aynı kaynakta tutulur.
// eslint-disable-next-line react-refresh/only-export-components
export function kayitKategorisi(
  kayit: MaliyetAlisFiyatiTarihceKaydi,
): MaliyetMalzemeTuru | null {
  const kategori = kayit.malzeme_turu ?? kayit.profil_turu
  if (kategori === 'cam' || kategori === 'cita' || kategori === 'sarf') {
    return kategori
  }
  if (kayit.stok_kategorisi === 'cam' || kayit.stok_kategorisi === 'cita') {
    return kayit.stok_kategorisi
  }
  return kayit.stok_kategorisi === 'yan_malzeme' ? 'sarf' : null
}

function tarihSirasi(kayit: MaliyetAlisFiyatiTarihceKaydi) {
  const tarih = new Date(kayit.fiyat_tarihi).getTime()
  return Number.isNaN(tarih) ? 0 : tarih
}

function olusturulmaSirasi(kayit: MaliyetAlisFiyatiTarihceKaydi) {
  const tarih = new Date(kayit.olusturulma_tarihi).getTime()
  return Number.isNaN(tarih) ? 0 : tarih
}

function vadeEtiketi(vadeGunu: number) {
  return vadeGunu === 0 ? 'Vade girilmemiş / peşin' : `${vadeGunu} gün`
}

function durumEtiketi(durum: MaliyetAlisFiyatiTarihceKaydi['durum']) {
  switch (durum) {
    case 'dogrulanmis':
      return 'Doğrulanmış'
    case 'dogrulama_bekliyor':
      return 'Doğrulama bekliyor'
    case 'duzeltme':
      return 'Düzeltme'
    case 'taslak':
      return 'Taslak'
  }
}

function seriParcasi(value: string | null | undefined, varsayilan: string) {
  const deger = value?.trim().toLocaleLowerCase('tr-TR')
  return deger || varsayilan
}

function fiyatSerisiAnahtari(kayit: MaliyetAlisFiyatiTarihceKaydi) {
  const tedarikci = kayit.tedarikci_id
    ?? `adsiz:${seriParcasi(kayit.tedarikci_adi, 'tedarikci-yok')}`
  const kaynakSerisi = kayit.tedarikci_id
    ? seriParcasi(kayit.kaynak_turu, 'kaynak-yok')
    : [
        seriParcasi(kayit.kaynak_turu, 'kaynak-yok'),
        seriParcasi(
          kayit.fiyat_liste_kodu ?? kayit.kaynak_referansi,
          'referans-yok',
        ),
      ].join(':')
  const durumSerisi = kayit.durum === 'dogrulanmis' || kayit.durum === 'duzeltme'
    ? 'onayli'
    : kayit.durum
  return [
    kayit.stok_id,
    tedarikci,
    seriParcasi(kayit.fiyat_varyanti, 'genel'),
    kaynakSerisi,
    seriParcasi(kayit.marka, 'marka-yok'),
    String(kayit.vade_gunu),
    kayit.para_birimi,
    seriParcasi(kayit.fiyat_birimi, 'birim-yok'),
    durumSerisi,
  ].join('\u001f')
}

// Test edilen fiyat-serisi hesabı panelle aynı kaynakta tutulur.
// eslint-disable-next-line react-refresh/only-export-components
export function fiyatDegisimleriniHesapla(
  kayitlar: MaliyetAlisFiyatiTarihceKaydi[],
) {
  const oncekiFiyatlar = new Map<string, number>()
  const degisimler = new Map<string, FiyatDegisimi>()
  const kronolojikKayitlar = [...kayitlar].sort((a, b) => (
    tarihSirasi(a) - tarihSirasi(b)
    || olusturulmaSirasi(a) - olusturulmaSirasi(b)
    || a.fiyat_id.localeCompare(b.fiyat_id)
  ))

  for (const kayit of kronolojikKayitlar) {
    const anahtar = fiyatSerisiAnahtari(kayit)
    const oncekiFiyat = oncekiFiyatlar.get(anahtar)
    if (oncekiFiyat != null) {
      const fark = kayit.birim_fiyat - oncekiFiyat
      degisimler.set(kayit.fiyat_id, {
        fark,
        yuzde: oncekiFiyat === 0 ? null : (fark / oncekiFiyat) * 100,
      })
    }
    oncekiFiyatlar.set(anahtar, kayit.birim_fiyat)
  }

  return degisimler
}

export default function MaliyetTarihcesiPaneli() {
  const [kayitlar, setKayitlar] = useState<MaliyetAlisFiyatiTarihceKaydi[]>([])
  const [kategori, setKategori] = useState<KategoriFiltresi>('tumu')
  const [stokId, setStokId] = useState('')
  const [arama, setArama] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [toplamKayit, setToplamKayit] = useState<number | null>(null)
  const [sonBasariliYukleme, setSonBasariliYukleme] = useState<string | null>(null)
  const [yenilemeNo, setYenilemeNo] = useState(0)

  useEffect(() => {
    let aktif = true
    maliyetAlisFiyatiTarihcesiniGetir('', TARIHCE_KAYIT_LIMITI)
      .then((sonuc) => {
        if (!aktif) return
        setKayitlar(sonuc)
        setToplamKayit(
          sonuc[0]?.toplam_kayit
          ?? (sonuc.length < TARIHCE_KAYIT_LIMITI ? sonuc.length : null),
        )
        setSonBasariliYukleme(new Date().toISOString())
        setHata(null)
      })
      .catch((error) => {
        if (!aktif) return
        setHata(error instanceof Error ? error.message : 'Maliyet tarihçesi yüklenemedi.')
      })
      .finally(() => {
        if (aktif) setYukleniyor(false)
      })
    return () => {
      aktif = false
    }
  }, [yenilemeNo])

  const yenile = () => {
    setYukleniyor(true)
    setHata(null)
    setYenilemeNo((deger) => deger + 1)
  }

  const kategoriKayitlari = useMemo(() => (
    kayitlar.filter((kayit) => (
      kategori === 'tumu' || kayitKategorisi(kayit) === kategori
    ))
  ), [kategori, kayitlar])

  const urunler = useMemo(() => {
    const urunHaritasi = new Map<string, { id: string; kod: string; ad: string }>()
    for (const kayit of kategoriKayitlari) {
      if (!urunHaritasi.has(kayit.stok_id)) {
        urunHaritasi.set(kayit.stok_id, {
          id: kayit.stok_id,
          kod: kayit.stok_kodu,
          ad: kayit.stok_adi,
        })
      }
    }
    return [...urunHaritasi.values()].sort((a, b) => (
      `${a.kod} ${a.ad}`.localeCompare(`${b.kod} ${b.ad}`, 'tr-TR')
    ))
  }, [kategoriKayitlari])

  const etkinStokId = urunler.some((urun) => urun.id === stokId) ? stokId : ''

  const gorunenKayitlar = useMemo(() => {
    const terim = arama.trim().toLocaleLowerCase('tr-TR')
    return kategoriKayitlari
      .filter((kayit) => !etkinStokId || kayit.stok_id === etkinStokId)
      .filter((kayit) => {
        if (!terim) return true
        return [
          kayit.stok_kodu,
          kayit.stok_adi,
          kayit.tedarikci_adi,
          kayit.kaynak_turu,
          kayit.kaynak_referansi,
          kayit.duzeltme_nedeni,
        ].some((deger) => deger?.toLocaleLowerCase('tr-TR').includes(terim))
      })
      .sort((a, b) => tarihSirasi(b) - tarihSirasi(a))
  }, [arama, etkinStokId, kategoriKayitlari])

  const gorunenUrunSayisi = useMemo(
    () => new Set(gorunenKayitlar.map((kayit) => kayit.stok_id)).size,
    [gorunenKayitlar],
  )
  const fiyatDegisimleri = useMemo(() => fiyatDegisimleriniHesapla(kayitlar), [kayitlar])
  const eskiVeriGosteriliyor = hata !== null && kayitlar.length > 0
  const kayitSinirinaUlasildi = toplamKayit != null
    ? toplamKayit > kayitlar.length
    : kayitlar.length >= TARIHCE_KAYIT_LIMITI

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Alış fiyatı geçmişi</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Cam, çıta ve sarf alış fiyatlarını kategori ve ürün bazında kronolojik olarak inceleyin.
          </p>
        </div>
        <button
          type="button"
          disabled={yukleniyor}
          onClick={yenile}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={yukleniyor ? 'animate-spin' : ''} />
          Yenile
        </button>
      </div>

      {hata && (
        <div className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm',
          eskiVeriGosteriliyor
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-red-200 bg-red-50 text-red-700',
        )}>
          <span className="flex items-center gap-2">
            <AlertTriangle size={17} className="shrink-0" />
            <span>
              <span className="block font-semibold">
                {eskiVeriGosteriliyor
                  ? 'Güncel tarihçe alınamadı; son başarılı veri gösteriliyor.'
                  : 'Maliyet tarihçesi yüklenemedi.'}
              </span>
              <span className="mt-0.5 block text-xs">
                {hata}
                {eskiVeriGosteriliyor && sonBasariliYukleme
                  ? ` Son başarılı yenileme: ${ticariTarih(sonBasariliYukleme, true)}.`
                  : ''}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={yenile}
            className="rounded-lg border border-current/20 bg-white px-3 py-1.5 text-xs font-semibold"
          >
            Tekrar dene
          </button>
        </div>
      )}

      {kayitSinirinaUlasildi && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>
            {toplamKayit != null
              ? `${toplamKayit.toLocaleString('tr-TR')} kaydın en yeni ${kayitlar.length.toLocaleString('tr-TR')} tanesi gösteriliyor.`
              : `En yeni ${TARIHCE_KAYIT_LIMITI.toLocaleString('tr-TR')} kayıt gösteriliyor; daha eski kayıtlar bulunabilir.`}
            {' '}Daha eski kayıtlar bu özet görünümde yer almaz.
          </span>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Maliyet kategorileri">
            {kategoriSekmeleri.map((sekme) => {
              const aktif = kategori === sekme.id
              return (
                <button
                  key={sekme.id}
                  type="button"
                  role="tab"
                  aria-selected={aktif}
                  onClick={() => {
                    setKategori(sekme.id)
                    setStokId('')
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs font-semibold transition',
                    aktif
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {sekme.etiket}
                </button>
              )
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(14rem,.75fr)_auto] md:items-end">
            <label className="text-xs font-medium text-gray-700">
              Ürün
              <select value={etkinStokId} onChange={(event) => setStokId(event.target.value)} className={inputClass}>
                <option value="">Tüm ürünler</option>
                {urunler.map((urun) => (
                  <option key={urun.id} value={urun.id}>{urun.kod} · {urun.ad}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-gray-700">
              Ara
              <span className="relative block">
                <Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-gray-400" />
                <input
                  value={arama}
                  onChange={(event) => setArama(event.target.value)}
                  placeholder="Ürün, tedarikçi veya kaynak ara…"
                  className={`${inputClass} pl-9`}
                />
              </span>
            </label>
            <div className="rounded-lg bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
              <strong className="text-gray-900">{gorunenKayitlar.length}</strong> kayıt ·{' '}
              <strong className="text-gray-900">{gorunenUrunSayisi}</strong> ürün
              {yukleniyor && kayitlar.length > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                  <Loader2 size={12} className="animate-spin" />
                  Güncelleniyor
                </span>
              )}
            </div>
          </div>
        </div>

        {yukleniyor && kayitlar.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-14 text-sm text-gray-500">
            <Loader2 size={18} className="animate-spin" />
            Maliyet tarihçesi yükleniyor…
          </div>
        ) : hata && kayitlar.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <AlertTriangle size={28} className="mx-auto text-red-300" />
            <p className="mt-3 text-sm font-semibold text-gray-700">Tarihçe verisi alınamadı</p>
            <p className="mt-1 text-xs text-gray-500">
              Hata ayrıntısını yukarıda inceleyip yeniden deneyin.
            </p>
          </div>
        ) : gorunenKayitlar.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
              <PackageSearch size={24} />
            </span>
            <p className="mt-3 text-sm font-semibold text-gray-700">Kayıt bulunamadı</p>
            <p className="mt-1 text-xs text-gray-500">
              Seçili kategori, ürün veya arama ölçütüne uygun fiyat geçmişi yok.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Tarih</th>
                  <th className="px-4 py-3">Kategori / ürün</th>
                  <th className="px-4 py-3">Tedarikçi / kaynak</th>
                  <th className="px-4 py-3 text-right">Fiyat</th>
                  <th
                    className="px-4 py-3 text-right"
                    title="Önceki aynı ürün, tedarikçi, varyant, kaynak türü, vade, para ve fiyat birimi kaydına göre"
                  >
                    Değişim
                  </th>
                  <th className="px-4 py-3">Vade</th>
                  <th className="px-4 py-3">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gorunenKayitlar.map((kayit) => {
                  const kayitKategorisiDegeri = kayitKategorisi(kayit)
                  const fiyatDegisimi = fiyatDegisimleri.get(kayit.fiyat_id)
                  return (
                    <tr
                      key={`${kayit.fiyat_id}-${kayit.atama_id ?? 'atamasiz'}`}
                      className="align-top hover:bg-gray-50/70"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-semibold text-gray-800">{ticariTarih(kayit.fiyat_tarihi)}</div>
                        <div className="mt-0.5 text-[11px] text-gray-400">
                          Kaydedildi: {ticariTarih(kayit.olusturulma_tarihi, true)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {kayitKategorisiDegeri && (
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              kategoriRozetleri[kayitKategorisiDegeri],
                            )}>
                              {kategoriEtiketleri[kayitKategorisiDegeri]}
                            </span>
                          )}
                          <span className="font-semibold text-gray-900">{kayit.stok_kodu}</span>
                        </div>
                        <div className="mt-1 max-w-xs text-xs text-gray-500">{kayit.stok_adi}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">
                          {kayit.tedarikci_adi || 'Tedarikçi belirtilmemiş'}
                        </div>
                        <div className="mt-0.5 max-w-xs text-xs text-gray-500">
                          {kayit.kaynak_referansi || kayit.duzeltme_nedeni || kayit.kaynak_turu}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-400">
                          {kayit.fiyat_varyanti === 'genel'
                            ? 'Genel fiyat'
                            : `${kayit.fiyat_varyanti.toLocaleUpperCase('tr-TR')} varyantı`}
                          {kayit.marka ? ` · ${kayit.marka}` : ''}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="font-bold text-blue-700">
                          {ticariPara(kayit.birim_fiyat, kayit.para_birimi)}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400">/{kayit.fiyat_birimi}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                        {fiyatDegisimi == null ? (
                          <span className="text-gray-400">İlk kayıt</span>
                        ) : Math.abs(fiyatDegisimi.fark) < 0.00000001 ? (
                          <span className="font-medium text-gray-500">Değişmedi</span>
                        ) : (
                          <>
                            <div className={cn(
                              'font-semibold',
                              fiyatDegisimi.fark > 0 ? 'text-red-600' : 'text-emerald-700',
                            )}>
                              {fiyatDegisimi.fark > 0 ? '+' : '−'}
                              {ticariPara(Math.abs(fiyatDegisimi.fark), kayit.para_birimi)}
                            </div>
                            {fiyatDegisimi.yuzde != null && (
                              <div className="mt-0.5 text-[11px] text-gray-400">
                                {fiyatDegisimi.yuzde > 0 ? '+' : ''}
                                {fiyatDegisimi.yuzde.toLocaleString('tr-TR', {
                                  minimumFractionDigits: 1,
                                  maximumFractionDigits: 1,
                                })}%
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                        {vadeEtiketi(kayit.vade_gunu)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600">
                          {durumEtiketi(kayit.durum)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
