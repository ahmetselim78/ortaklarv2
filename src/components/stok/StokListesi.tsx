import { useMemo, useState } from 'react'
import { ArrowLeftRight, Eye, EyeOff, LockKeyhole, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import Pagination from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { CAM_GRUPLARI, citaStokSira } from '@/lib/cam'
import { stokMiktari } from '@/lib/stokHareket'
import { cn } from '@/lib/utils'
import type { StokKatalogKaydi, StokKategori } from '@/types/stok'

type AktifFiltresi = 'aktif' | 'pasif' | 'tumu'

interface Props {
  stoklar: StokKatalogKaydi[]
  yukleniyor: boolean
  kategori: StokKategori
  yonetimModu: boolean
  duzenleyebilir: boolean
  silebilir: boolean
  durumDegistirebilir: boolean
  onDetay: (stok: StokKatalogKaydi) => void
  onDuzenle: (stok: StokKatalogKaydi) => void
  onSil: (stok: StokKatalogKaydi) => void
  onPasiflestir: (stok: StokKatalogKaydi) => void
  onAktiflestir: (stok: StokKatalogKaydi) => void
  onHareket: (stok: StokKatalogKaydi) => void
}

function TeknikTanim({ stok }: { stok: StokKatalogKaydi }) {
  if (stok.kategori === 'cam') {
    return (
      <div>
        <div className="font-medium text-gray-800">{stok.grup ?? 'Grup tanımsız'}</div>
        <div className="mt-0.5 text-xs text-gray-500">
          {stok.katman_yapisi
            ? `${stok.katman_yapisi} katman yapısı`
            : stok.kalinlik_mm != null
              ? `${stok.kalinlik_mm} mm tek cam`
              : 'Teknik tanım yok'}
        </div>
      </div>
    )
  }

  if (stok.kategori === 'cita') {
    return (
      <div>
        <div className="font-medium text-gray-800">
          {stok.kalinlik_mm != null ? `${stok.kalinlik_mm} mm` : 'Boyut tanımsız'}
        </div>
        <div className="mt-0.5 text-xs text-gray-500">Birim: {stok.birim}</div>
      </div>
    )
  }

  return (
    <div>
      <div className="font-medium text-gray-800">
        {stok.kalinlik_mm != null ? `${stok.kalinlik_mm} mm` : 'Ölçü belirtilmemiş'}
      </div>
      <div className="mt-0.5 text-xs text-gray-500">
        {[stok.marka, `Birim: ${stok.birim}`].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}

export default function StokListesi({
  stoklar,
  yukleniyor,
  kategori,
  yonetimModu,
  duzenleyebilir,
  silebilir,
  durumDegistirebilir,
  onDetay,
  onDuzenle,
  onSil,
  onPasiflestir,
  onAktiflestir,
  onHareket,
}: Props) {
  const [arama, setArama] = useState('')
  const [grupFiltresi, setGrupFiltresi] = useState('')
  const [aktifFiltresi, setAktifFiltresi] = useState<AktifFiltresi>('aktif')
  const [sayfa, setSayfa] = useState(1)
  const sayfaBoyutu = 25

  const kategoriStoklar = useMemo(
    () => stoklar.filter((stok) => stok.kategori === kategori),
    [kategori, stoklar],
  )
  const mevcutGruplar = [...new Set(
    kategoriStoklar.map((stok) => stok.grup).filter((grup): grup is string => Boolean(grup)),
  )].sort((a, b) => a.localeCompare(b, 'tr'))
  const grupSecenekleri = kategori === 'cam'
    ? CAM_GRUPLARI.filter((grup) => mevcutGruplar.includes(grup))
    : mevcutGruplar

  const filtrelenmis = useMemo(() => {
    const query = arama.trim().toLocaleLowerCase('tr-TR')
    return kategoriStoklar
      .filter((stok) => {
        if (aktifFiltresi === 'aktif') return stok.aktif
        if (aktifFiltresi === 'pasif') return !stok.aktif
        return true
      })
      .filter((stok) => !grupFiltresi || stok.grup === grupFiltresi)
      .filter((stok) => !query || [
        stok.kod,
        stok.ad,
        stok.grup,
        stok.katman_yapisi,
        stok.kalinlik_mm != null ? String(stok.kalinlik_mm) : null,
        stok.marka,
      ].some((deger) => deger?.toLocaleLowerCase('tr-TR').includes(query)))
      .sort((a, b) => kategori === 'cita'
        ? citaStokSira(a, b)
        : a.kod.localeCompare(b.kod, 'tr', { numeric: true }))
  }, [aktifFiltresi, arama, grupFiltresi, kategori, kategoriStoklar])

  const toplamSayfa = Math.max(1, Math.ceil(filtrelenmis.length / sayfaBoyutu))
  const mevcutSayfa = Math.min(sayfa, toplamSayfa)
  const sayfali = filtrelenmis.slice(
    (mevcutSayfa - 1) * sayfaBoyutu,
    mevcutSayfa * sayfaBoyutu,
  )

  if (yukleniyor) return <TableSkeleton satir={7} kolon={4} />

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <input
            type="search"
            placeholder={kategori === 'cam'
              ? 'Kod, ad, grup, katman veya kalınlık ara…'
              : 'Kod, ad, ölçü veya marka ara…'}
            value={arama}
            onChange={(event) => { setArama(event.target.value); setSayfa(1) }}
            className="min-w-[240px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex overflow-hidden rounded-lg border border-gray-200">
            {([
              ['aktif', 'Aktif'],
              ['pasif', 'Pasif'],
              ['tumu', 'Tümü'],
            ] as Array<[AktifFiltresi, string]>).map(([deger, etiket]) => (
              <button
                key={deger}
                type="button"
                onClick={() => { setAktifFiltresi(deger); setSayfa(1) }}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors',
                  aktifFiltresi === deger
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50',
                )}
              >
                {etiket}
              </button>
            ))}
          </div>
        </div>

        {kategori === 'cam' && grupSecenekleri.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
            {['', ...grupSecenekleri].map((grup) => (
              <button
                key={grup || 'tumu'}
                type="button"
                onClick={() => { setGrupFiltresi(grup); setSayfa(1) }}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                  grupFiltresi === grup
                    ? 'border-blue-500 bg-blue-50 font-medium text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                )}
              >
                {grup || 'Tüm gruplar'}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtrelenmis.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-500">
          Filtreye uygun stok kartı bulunamadı.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className={cn('w-full text-sm', yonetimModu ? 'min-w-[980px]' : 'min-w-[820px]')}>
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Stok kodu / adı</th>
                  <th className="px-4 py-3">Teknik tanım</th>
                  <th className="px-4 py-3">Stok bakiyesi</th>
                  <th className="px-4 py-3">Durum ve kullanım</th>
                  {yonetimModu && <th className="px-4 py-3 text-right">Yönetim</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sayfali.map((stok) => {
                  const kilitAciklamasi = yonetimModu
                    ? 'Kart dış kayıtlarda kullanılıyor; kimlik/teknik alanları düzenlenemez ve silinemez.'
                    : 'Kart dış kayıtlarda kullanılıyor.'
                  return (
                    <tr
                      key={stok.id}
                      tabIndex={0}
                      onClick={() => onDetay(stok)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') onDetay(stok)
                      }}
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-blue-50/40 focus:bg-blue-50/50 focus:outline-none',
                        !stok.aktif && 'bg-gray-50/60 text-gray-500',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-semibold text-blue-700">{stok.kod}</div>
                        <div className="mt-1 font-semibold text-gray-900">{stok.ad}</div>
                      </td>
                      <td className="px-4 py-3"><TeknikTanim stok={stok} /></td>
                      <td className="px-4 py-3">
                        <div className={`font-semibold tabular-nums ${stok.kritik_stok ? 'text-red-700' : 'text-gray-900'}`}>
                          {stokMiktari(Number(stok.mevcut_miktar ?? 0), stok.birim)}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {stok.minimum_miktar > 0
                            ? `Kritik seviye: ${stokMiktari(stok.minimum_miktar, stok.birim)}`
                            : 'Kritik seviye tanımsız'}
                        </div>
                        {stok.stok_yeri && <div className="mt-0.5 text-[11px] text-gray-400">{stok.stok_yeri}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <span className={cn(
                            'rounded-full px-2 py-1 text-xs font-medium',
                            stok.aktif ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-200 text-gray-600',
                          )}>
                            {stok.aktif ? 'Aktif' : 'Pasif'}
                          </span>
                          {stok.kullaniliyor ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
                              title={kilitAciklamasi}
                            >
                              <LockKeyhole size={12} /> Kullanımda
                            </span>
                          ) : (
                            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                              Kullanılmamış
                            </span>
                          )}
                          {stok.kritik_stok && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                              <TriangleAlert size={12} /> Kritik
                            </span>
                          )}
                        </div>
                      </td>
                      {yonetimModu && <td className="px-4 py-3">
                        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                          {durumDegistirebilir && stok.aktif && (
                            <button
                              type="button"
                              onClick={() => onHareket(stok)}
                              className="rounded-lg p-2 text-gray-400 hover:bg-emerald-50 hover:text-emerald-700"
                              title="Stok girişi veya çıkışı kaydet"
                              aria-label={`${stok.ad} stok hareketi`}
                            >
                              <ArrowLeftRight size={15} />
                            </button>
                          )}
                          {duzenleyebilir && (
                            <button
                              type="button"
                              disabled={stok.kullaniliyor}
                              onClick={() => onDuzenle(stok)}
                              className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-35"
                              title={stok.kullaniliyor ? kilitAciklamasi : 'Düzenle'}
                              aria-label={`${stok.ad} düzenle`}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          {durumDegistirebilir && (
                            <button
                              type="button"
                              onClick={() => stok.aktif ? onPasiflestir(stok) : onAktiflestir(stok)}
                              className="rounded-lg p-2 text-gray-400 hover:bg-amber-50 hover:text-amber-700"
                              title={stok.aktif ? 'Pasifleştir' : 'Yeniden aktifleştir'}
                              aria-label={`${stok.ad} ${stok.aktif ? 'pasifleştir' : 'aktifleştir'}`}
                            >
                              {stok.aktif ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          )}
                          {silebilir && (
                            <button
                              type="button"
                              disabled={stok.kullaniliyor}
                              onClick={() => onSil(stok)}
                              className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-35"
                              title={stok.kullaniliyor ? kilitAciklamasi : 'Kalıcı olarak sil'}
                              aria-label={`${stok.ad} sil`}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>}
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
    </div>
  )
}
