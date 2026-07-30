import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  CircleDollarSign,
  Mail,
  MapPin,
  PackageCheck,
  Pencil,
  Phone,
  Trash2,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react'
import Pagination from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { ticariBugun, ticariPara, ticariTarih } from '@/lib/ticariFormat'
import { tedarikKapsamiEtiketi } from '@/lib/tedarikKapsami'
import { cn } from '@/lib/utils'
import type { Cari } from '@/types/cari'
import type {
  CariOzet,
  MusteriTicariProfili,
  MusteriTicariProfilSurumu,
  ParaBirimi,
} from '@/types/ticari'

type CariFiltresi = 'hepsi' | 'musteri' | 'tedarikci' | 'borclu' | 'alacakli' | 'pasif'

interface Props {
  cariler: Cari[]
  yukleniyor: boolean
  ozetler: CariOzet[]
  profiller: MusteriTicariProfili[]
  profilSurumleri: MusteriTicariProfilSurumu[]
  finansGorunur: boolean
  profilGorunur: boolean
  onDuzenle: (cari: Cari) => void
  onSil: (cari: Cari) => void
  onCariHesapAc: (cari: Cari) => void
}

const paraBirimleri: ParaBirimi[] = ['TRY', 'USD', 'EUR']

function profilSurumuSec(
  profilId: string,
  surumler: MusteriTicariProfilSurumu[],
) {
  const bugun = ticariBugun()
  const profilSurumleri = surumler
    .filter((surum) => surum.musteri_ticari_profili_id === profilId)
    .sort((a, b) => b.surum_no - a.surum_no)
  return profilSurumleri.find((surum) => (
    surum.durum === 'yayinda'
    && (!surum.gecerli_baslangic || surum.gecerli_baslangic <= bugun)
    && (!surum.gecerli_bitis || surum.gecerli_bitis >= bugun)
  )) ?? profilSurumleri[0] ?? null
}

function ProfilRozeti({
  profil,
  surum,
}: {
  profil: MusteriTicariProfili | null
  surum: MusteriTicariProfilSurumu | null
}) {
  if (!profil || !surum) {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
        Profil eksik
      </span>
    )
  }
  const yayinda = profil.aktif && surum.durum === 'yayinda'
  return (
    <span className={cn(
      'inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset',
      yayinda
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
        : 'bg-slate-100 text-slate-600 ring-slate-500/20',
    )}>
      {yayinda ? 'Ticari hazır' : surum.durum === 'taslak' ? 'Profil taslak' : 'Profil pasif'}
    </span>
  )
}

function BakiyeEtiketi({
  ozet,
  paraBirimi,
}: {
  ozet: CariOzet | undefined
  paraBirimi: ParaBirimi
}) {
  const net = Number(ozet?.net_bakiye ?? 0)
  return (
    <div className={cn(
      'flex min-w-[126px] items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
      net > 0
        ? 'border-rose-100 bg-rose-50 text-rose-700'
        : net < 0
          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
          : 'border-gray-100 bg-gray-50 text-gray-500',
    )}>
      <span className="font-semibold">{paraBirimi}</span>
      <span className="tabular-nums">{ticariPara(Math.abs(net), paraBirimi)}</span>
    </div>
  )
}

export default function CariListesi({
  cariler,
  yukleniyor,
  ozetler,
  profiller,
  profilSurumleri,
  finansGorunur,
  profilGorunur,
  onDuzenle,
  onSil,
  onCariHesapAc,
}: Props) {
  const [arama, setArama] = useState('')
  const [filtre, setFiltre] = useState<CariFiltresi>('hepsi')
  const [seciliCariId, setSeciliCariId] = useState<string | null>(null)
  const [sayfa, setSayfa] = useState(1)
  const sayfaBoyutu = 16

  const bakiyeHaritasi = useMemo(
    () => new Map(ozetler.map((ozet) => [`${ozet.cari_id}:${ozet.para_birimi}`, ozet])),
    [ozetler],
  )
  const profilHaritasi = useMemo(
    () => new Map(profiller.map((profil) => [profil.cari_id, profil])),
    [profiller],
  )
  const profilSurumuHaritasi = useMemo(() => new Map(
    profiller.map((profil) => [profil.cari_id, profilSurumuSec(profil.id, profilSurumleri)]),
  ), [profilSurumleri, profiller])

  const cariNeti = (cariId: string, paraBirimi: ParaBirimi) => (
    Number(bakiyeHaritasi.get(`${cariId}:${paraBirimi}`)?.net_bakiye ?? 0)
  )
  const borcluMu = (cariId: string) => paraBirimleri.some((para) => cariNeti(cariId, para) > 0)
  const alacakliMi = (cariId: string) => paraBirimleri.some((para) => cariNeti(cariId, para) < 0)

  const filtrelenmis = useMemo(() => {
    const query = arama.trim().toLocaleLowerCase('tr-TR')
    return [...cariler]
      .filter((cari) => !query || [
        cari.ad,
        cari.kod,
        cari.telefon,
        cari.email,
        ...(cari.tedarik_kapsamlari ?? []).map(tedarikKapsamiEtiketi),
      ].some((deger) => deger?.toLocaleLowerCase('tr-TR').includes(query)))
      .filter((cari) => {
        if (filtre === 'musteri') return cari.tipi === 'musteri' && cari.aktif !== false
        if (filtre === 'tedarikci') return cari.tipi === 'tedarikci' && cari.aktif !== false
        if (filtre === 'borclu') return cari.tipi === 'musteri' && borcluMu(cari.id)
        if (filtre === 'alacakli') return cari.tipi === 'musteri' && alacakliMi(cari.id)
        if (filtre === 'pasif') return cari.aktif === false
        return cari.aktif !== false
      })
      .sort((a, b) => {
        const borcFarki = cariNeti(b.id, 'TRY') - cariNeti(a.id, 'TRY')
        if (borcFarki !== 0) return borcFarki
        return a.ad.localeCompare(b.ad, 'tr')
      })
  // borcluMu ve cariNeti bakiyeHaritasi üzerinden deterministik hesaplanır.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arama, bakiyeHaritasi, cariler, filtre])

  const toplamSayfa = Math.max(1, Math.ceil(filtrelenmis.length / sayfaBoyutu))
  const mevcutSayfa = Math.min(sayfa, toplamSayfa)
  const sayfali = filtrelenmis.slice(
    (mevcutSayfa - 1) * sayfaBoyutu,
    mevcutSayfa * sayfaBoyutu,
  )
  const seciliCari = cariler.find((cari) => cari.id === seciliCariId)
    ?? sayfali[0]
    ?? filtrelenmis[0]
    ?? null

  useEffect(() => {
    setSayfa(1)
  }, [arama, filtre])

  if (yukleniyor) {
    return <TableSkeleton satir={8} kolon={6} />
  }

  const filtreler: Array<{ key: CariFiltresi; label: string }> = [
    { key: 'hepsi', label: 'Aktif cariler' },
    { key: 'musteri', label: 'Müşteriler' },
    { key: 'borclu', label: 'Borçlular' },
    { key: 'alacakli', label: 'Kredisi olanlar' },
    { key: 'tedarikci', label: 'Tedarikçiler' },
    { key: 'pasif', label: 'Pasif' },
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <input
              type="search"
              placeholder="Müşteri, kod, telefon veya e-posta ara…"
              value={arama}
              onChange={(event) => setArama(event.target.value)}
              className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-1 overflow-x-auto pb-1 lg:pb-0">
              {filtreler.map((secenek) => (
                <button
                  key={secenek.key}
                  type="button"
                  onClick={() => setFiltre(secenek.key)}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                    filtre === secenek.key
                      ? 'bg-slate-900 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  {secenek.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtrelenmis.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-500">
            Filtreye uygun cari bulunamadı.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Cari</th>
                    <th className="px-4 py-3">Ticari bilgi</th>
                    <th className="px-4 py-3">Genel bakiye</th>
                    <th className="px-4 py-3">Son hareket</th>
                    <th className="px-4 py-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sayfali.map((cari) => {
                    const profil = profilHaritasi.get(cari.id) ?? null
                    const profilSurumu = profilSurumuHaritasi.get(cari.id) ?? null
                    const sonHareket = paraBirimleri
                      .map((para) => bakiyeHaritasi.get(`${cari.id}:${para}`)?.son_hareket_tarihi)
                      .filter((tarih): tarih is string => Boolean(tarih))
                      .sort()
                      .at(-1)
                    return (
                      <tr
                        key={cari.id}
                        onClick={() => setSeciliCariId(cari.id)}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-blue-50/40',
                          seciliCari?.id === cari.id && 'bg-blue-50/60',
                          cari.aktif === false && 'opacity-65',
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                              {cari.ad.slice(0, 2).toLocaleUpperCase('tr-TR')}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-gray-900">{cari.ad}</div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                                <span className="font-mono">{cari.kod}</span>
                                <span>·</span>
                                <span>{cari.tipi === 'musteri' ? 'Müşteri' : 'Tedarikçi'}</span>
                                {cari.aktif === false && <span>· Pasif</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {cari.tipi === 'tedarikci' ? (
                            <div className="flex max-w-[250px] flex-wrap gap-1">
                              {(cari.tedarik_kapsamlari ?? []).length > 0 ? (
                                cari.tedarik_kapsamlari.map((kapsam) => (
                                  <span
                                    key={kapsam}
                                    className="rounded-md bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700"
                                  >
                                    {tedarikKapsamiEtiketi(kapsam)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs font-medium text-amber-700">Tedarik kapsamı eksik</span>
                              )}
                            </div>
                          ) : profilGorunur ? (
                            <ProfilRozeti profil={profil} surum={profilSurumu} />
                          ) : (
                            <span className="text-xs text-gray-400">Yetki gerekli</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {cari.tipi !== 'musteri' ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : finansGorunur ? (
                            <div className="flex flex-wrap gap-1.5">
                              {paraBirimleri.map((para) => {
                                const ozet = bakiyeHaritasi.get(`${cari.id}:${para}`)
                                const net = Number(ozet?.net_bakiye ?? 0)
                                if (!ozet || net === 0) return null
                                return (
                                  <span
                                    key={para}
                                    className={cn(
                                      'rounded-md px-2 py-1 text-xs font-semibold tabular-nums',
                                      net > 0
                                        ? 'bg-rose-50 text-rose-700'
                                        : 'bg-emerald-50 text-emerald-700',
                                    )}
                                  >
                                    {para} {ticariPara(Math.abs(net), para)}
                                  </span>
                                )
                              })}
                              {!paraBirimleri.some((para) => cariNeti(cari.id, para) !== 0) && (
                                <span className="text-xs font-medium text-emerald-700">Bakiye kapalı</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Finans yetkisi gerekli</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                          {finansGorunur ? ticariTarih(sonHareket) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {finansGorunur && cari.tipi === 'musteri' && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onCariHesapAc(cari)
                                }}
                                className="rounded-lg p-2 text-gray-400 hover:bg-emerald-50 hover:text-emerald-700"
                                title="Cari hesap hareketlerini aç"
                                aria-label={`${cari.ad} cari hesap hareketlerini aç`}
                              >
                                <WalletCards size={15} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                onDuzenle(cari)
                              }}
                              className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-700"
                              title="Düzenle"
                              aria-label={`${cari.ad} düzenle`}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                onSil(cari)
                              }}
                              className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-700"
                              title="Sil"
                              aria-label={`${cari.ad} sil`}
                            >
                              <Trash2 size={15} />
                            </button>
                            <ChevronRight size={16} className="my-auto ml-1 text-gray-300" />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              toplamKayit={filtrelenmis.length}
              sayfaBoyutu={sayfaBoyutu}
              mevcutSayfa={mevcutSayfa}
              onSayfaDegistir={setSayfa}
            />
          </div>
        )}
      </section>

      <aside className="self-start overflow-hidden rounded-xl border border-gray-200 bg-white xl:sticky xl:top-4">
        {seciliCari ? (
          <>
            <div className="border-b border-gray-100 bg-slate-50/70 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-semibold text-blue-600">{seciliCari.kod}</p>
                  <h2 className="mt-1 text-lg font-semibold text-gray-900">{seciliCari.ad}</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {seciliCari.tipi === 'musteri' ? 'Müşteri hesabı' : 'Tedarikçi kartı'}
                    {seciliCari.aktif === false ? ' · Pasif' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDuzenle(seciliCari)}
                  className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:text-blue-700"
                  aria-label={`${seciliCari.ad} düzenle`}
                >
                  <Pencil size={15} />
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5">
              {seciliCari.tipi === 'musteri' && (
                <section>
                  <div className="mb-2 flex items-center gap-2">
                    <CircleDollarSign size={16} className="text-rose-600" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Borç / kredi özeti
                    </h3>
                  </div>
                  {finansGorunur ? (
                    <div className="space-y-2">
                      {paraBirimleri.map((para) => (
                        <BakiyeEtiketi
                          key={para}
                          paraBirimi={para}
                          ozet={bakiyeHaritasi.get(`${seciliCari.id}:${para}`)}
                        />
                      ))}
                      <p className="text-[11px] leading-4 text-gray-500">
                        Kırmızı müşteri borcunu, yeşil müşteri kredisini veya ön ödemeyi gösterir.
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                      Bakiye bilgisi için finans okuma yetkisi gerekir.
                    </p>
                  )}
                </section>
              )}

              {seciliCari.tipi === 'musteri' && profilGorunur && (
                <section>
                  <div className="mb-2 flex items-center gap-2">
                    <UserRoundCheck size={16} className="text-blue-600" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Ticari profil
                    </h3>
                  </div>
                  {(() => {
                    const profil = profilHaritasi.get(seciliCari.id) ?? null
                    const surum = profilSurumuHaritasi.get(seciliCari.id) ?? null
                    if (!profil || !surum) {
                      return (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          Bu müşteri için fiyat listesi, KDV, vade ve para birimi profili henüz tamamlanmamış.
                        </div>
                      )
                    }
                    return (
                      <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                        <div className="mb-3">
                          <ProfilRozeti profil={profil} surum={surum} />
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                          <dt className="text-gray-500">Para birimi</dt>
                          <dd className="text-right font-semibold text-gray-800">{surum.varsayilan_para_birimi}</dd>
                          <dt className="text-gray-500">Standart vade</dt>
                          <dd className="text-right font-semibold text-gray-800">{surum.varsayilan_vade_gunu} gün</dd>
                          <dt className="text-gray-500">Teklif geçerliliği</dt>
                          <dd className="text-right font-semibold text-gray-800">{surum.teklif_gecerlilik_gunu} gün</dd>
                          <dt className="text-gray-500">Profil sürümü</dt>
                          <dd className="text-right font-semibold text-gray-800">v{surum.surum_no}</dd>
                        </dl>
                      </div>
                    )
                  })()}
                </section>
              )}

              {seciliCari.tipi === 'tedarikci' && (
                <section>
                  <div className="mb-2 flex items-center gap-2">
                    <PackageCheck size={16} className="text-violet-600" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Tedarik kapsamı
                    </h3>
                  </div>
                  {(seciliCari.tedarik_kapsamlari ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-2 rounded-lg border border-violet-100 bg-violet-50/50 p-3">
                      {seciliCari.tedarik_kapsamlari.map((kapsam) => (
                        <span
                          key={kapsam}
                          className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200"
                        >
                          {tedarikKapsamiEtiketi(kapsam)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      Bu tedarikçinin sağladığı malzeme grupları henüz seçilmemiş. Düzenle
                      düğmesinden ekleyebilirsiniz.
                    </div>
                  )}
                </section>
              )}

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  İletişim
                </h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="shrink-0 text-gray-400" />
                    <span>{seciliCari.telefon || 'Telefon eklenmemiş'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="shrink-0 text-gray-400" />
                    <span className="truncate">{seciliCari.email || 'E-posta eklenmemiş'}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
                    <span>{seciliCari.adres || 'Adres eklenmemiş'}</span>
                  </div>
                </div>
              </section>

              {finansGorunur && seciliCari.tipi === 'musteri' && (
                <button
                  type="button"
                  onClick={() => onCariHesapAc(seciliCari)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <WalletCards size={16} />
                  Tüm hesap hareketleri
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-sm text-gray-500">Cari seçin.</div>
        )}
      </aside>
    </div>
  )
}
