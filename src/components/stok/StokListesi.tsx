import { useState } from 'react'
import { Pencil, Trash2, ArrowRightLeft, EyeOff, Eye } from 'lucide-react'
import type { Stok, StokKategori } from '@/types/stok'
import Pagination from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { CAM_GRUPLARI, citaStokSira, stokKodSira } from '@/lib/cam'

type AktifFiltresi = 'aktif' | 'pasif' | 'tumu'

interface Props {
  stoklar: Stok[]
  yukleniyor: boolean
  kategori: StokKategori
  onDuzenle: (stok: Stok) => void
  onSil: (stok: Stok) => void
  onPasifleştir: (stok: Stok) => void
  onAktifleştir: (stok: Stok) => void
  onReferansAktar?: (stok: Stok) => void
}

export default function StokListesi({
  stoklar,
  yukleniyor,
  kategori,
  onDuzenle,
  onSil,
  onPasifleştir,
  onAktifleştir,
  onReferansAktar,
}: Props) {
  const [arama, setArama] = useState('')
  const [grupFiltresi, setGrupFiltresi] = useState<string>('')
  const [aktifFiltresi, setAktifFiltresi] = useState<AktifFiltresi>('aktif')
  const [sayfa, setSayfa] = useState(1)
  const SAYFA_BOYUTU = 25

  const kategoriStoklar = stoklar.filter((s) => s.kategori === kategori)

  const mevcutGruplar = [...new Set(
    kategoriStoklar
      .map((s) => s.grup)
      .filter((g): g is string => !!g)
  )].sort()

  const grupSecenekleri = kategori === 'cam'
    ? CAM_GRUPLARI.filter((g) => mevcutGruplar.includes(g) || kategoriStoklar.some((s) => s.grup === g))
    : mevcutGruplar

  const filtrelenmis = kategoriStoklar
    .filter((s) => {
      if (aktifFiltresi === 'aktif') return s.aktif !== false
      if (aktifFiltresi === 'pasif') return s.aktif === false
      return true
    })
    .filter((s) => !grupFiltresi || s.grup === grupFiltresi)
    .filter((s) => {
      const q = arama.toLocaleLowerCase('tr-TR')
      if (!q) return true
      return (
        s.ad.toLocaleLowerCase('tr-TR').includes(q) ||
        s.kod.toLocaleLowerCase('tr-TR').includes(q) ||
        (s.grup ?? '').toLocaleLowerCase('tr-TR').includes(q) ||
        (s.katman_yapisi ?? '').toLocaleLowerCase('tr-TR').includes(q) ||
        (s.kalinlik_mm != null ? String(s.kalinlik_mm) : '').includes(q) ||
        (s.tedarikci_ad ?? '').toLocaleLowerCase('tr-TR').includes(q)
      )
    })
    .sort((a, b) => (
      kategori === 'cita'
        ? citaStokSira(a, b)
        : stokKodSira(a.kod) - stokKodSira(b.kod)
    ))

  const toplamSayfa = Math.max(1, Math.ceil(filtrelenmis.length / SAYFA_BOYUTU))
  const mevcutSayfa = Math.min(sayfa, toplamSayfa)
  const sayfali = filtrelenmis.slice((mevcutSayfa - 1) * SAYFA_BOYUTU, mevcutSayfa * SAYFA_BOYUTU)

  if (yukleniyor) {
    return <TableSkeleton satir={6} kolon={6} />
  }

  const aramaPlaceholder = kategori === 'cam'
    ? 'Kod, açıklama veya grup ile ara...'
    : kategori === 'cita'
      ? 'Kod veya boyut ile ara...'
      : 'Kod veya ad ile ara...'

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder={aramaPlaceholder}
          value={arama}
          onChange={(e) => {
            setArama(e.target.value)
            setSayfa(1)
          }}
          className="flex-1 max-w-md rounded-lg border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
          {([
            { key: 'aktif' as const, label: 'Aktif' },
            { key: 'pasif' as const, label: 'Pasif' },
            { key: 'tumu' as const, label: 'Tümü' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setAktifFiltresi(key); setSayfa(1) }}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                aktifFiltresi === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {kategori === 'cam' && grupSecenekleri.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => { setGrupFiltresi(''); setSayfa(1) }}
            className={cn(
              'px-2.5 py-1 text-xs rounded-lg border transition-colors',
              !grupFiltresi
                ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
          >
            Tüm Gruplar
          </button>
          {grupSecenekleri.map((grup) => (
            <button
              key={grup}
              type="button"
              onClick={() => { setGrupFiltresi(grup); setSayfa(1) }}
              className={cn(
                'px-2.5 py-1 text-xs rounded-lg border transition-colors',
                grupFiltresi === grup
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              )}
            >
              {grup}
            </button>
          ))}
        </div>
      )}

      {filtrelenmis.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {arama || grupFiltresi || aktifFiltresi !== 'aktif'
            ? 'Filtreye uygun kayıt bulunamadı.'
            : 'Henüz stok kaydı yok.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500 font-medium">
                <th className="px-4 py-3">Stok Kodu</th>
                <th className="px-4 py-3">Açıklama</th>
                <th className="px-4 py-3">{kategori === 'cam' ? 'Grup' : 'Ölçü'}</th>
                {kategori !== 'cam' && <th className="px-4 py-3">Tedarikçi</th>}
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {sayfali.map((stok) => (
                <tr
                  key={stok.id}
                  className={cn(
                    'border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors',
                    stok.aktif === false && 'opacity-70 bg-gray-50/50'
                  )}
                >
                  <td className="px-4 py-3 font-mono text-gray-700">{stok.kod}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{stok.ad}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {kategori === 'cam'
                      ? stok.grup ?? '—'
                      : stok.kalinlik_mm ? `${stok.kalinlik_mm} mm` : '—'}
                  </td>
                  {kategori !== 'cam' && (
                    <td className="px-4 py-3 text-gray-600">{stok.tedarikci_ad ?? '—'}</td>
                  )}
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex rounded-md px-2 py-1 text-xs font-medium',
                      stok.aktif === false
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-green-50 text-green-700'
                    )}>
                      {stok.aktif === false ? 'Pasif' : 'Aktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => onDuzenle(stok)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Düzenle"
                      >
                        <Pencil size={15} />
                      </button>
                      {stok.aktif !== false ? (
                        <button
                          onClick={() => onPasifleştir(stok)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title="Pasifleştir"
                        >
                          <EyeOff size={15} />
                        </button>
                      ) : (
                        <button
                          onClick={() => onAktifleştir(stok)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          title="Aktifleştir"
                        >
                          <Eye size={15} />
                        </button>
                      )}
                      {onReferansAktar && (
                        <button
                          onClick={() => onReferansAktar(stok)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                          title="Referansları Aktar"
                        >
                          <ArrowRightLeft size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => onSil(stok)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Sil"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            toplamKayit={filtrelenmis.length}
            sayfaBoyutu={SAYFA_BOYUTU}
            mevcutSayfa={mevcutSayfa}
            onSayfaDegistir={setSayfa}
          />
        </div>
      )}
    </div>
  )
}
