import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import type { Stok, StokKategori } from '@/types/stok'
import type { Cari } from '@/types/cari'
import { cn } from '@/lib/utils'
import { useEscape } from '@/hooks/useEscape'

const CITA_BOYUTLARI = [9, 11, 12, 14, 15, 16, 20, 22]

const schema = z.object({
  kategori: z.enum(['cam', 'cita', 'yan_malzeme']),
  ad: z.string().min(1, 'Ad zorunludur'),
  kalinlik_mm: z.coerce.number().positive('Pozitif olmalı').optional().or(z.literal('')),
  birim: z.string().min(1, 'Birim zorunludur'),
  birim_fiyat: z.coerce.number().min(0).optional().or(z.literal('')),
  tedarikci_id: z.string().optional(),
  marka: z.string().optional(),
})

type FormVeri = z.infer<typeof schema>

interface Props {
  duzenlenecek?: Stok | null
  cariler: Cari[]
  defaultKategori?: StokKategori
  onKaydet: (veri: FormVeri) => Promise<void>
  onKapat: () => void
}

export default function StokForm({ duzenlenecek, cariler, defaultKategori, onKaydet, onKapat }: Props) {
  useEscape(onKapat)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [sunucuHata, setSunucuHata] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormVeri>({
    resolver: zodResolver(schema),
    defaultValues: {
      kategori: defaultKategori ?? 'cam',
      birim: 'm2',
      ad: '',
      kalinlik_mm: '',
      birim_fiyat: '',
      tedarikci_id: '',
      marka: '',
    },
  })

  const kategori = watch('kategori')

  // Kategori değiştiğinde varsayılan birim ayarla
  useEffect(() => {
    if (duzenlenecek) return
    if (kategori === 'cita') {
      setValue('birim', 'm')
    } else if (kategori === 'yan_malzeme') {
      setValue('birim', 'kg')
      setValue('kalinlik_mm', '')
    } else {
      setValue('birim', 'm2')
    }
  }, [kategori, duzenlenecek, setValue])

  useEffect(() => {
    if (duzenlenecek) {
      reset({
        kategori: duzenlenecek.kategori ?? 'cam',
        ad: duzenlenecek.ad,
        kalinlik_mm: duzenlenecek.kalinlik_mm ?? '',
        birim: duzenlenecek.birim,
        birim_fiyat: duzenlenecek.birim_fiyat ?? '',
        tedarikci_id: duzenlenecek.tedarikci_id ?? '',
        marka: duzenlenecek.marka ?? '',
      })
    } else {
      reset({
        kategori: defaultKategori ?? 'cam',
        birim: defaultKategori === 'cita' ? 'm' : defaultKategori === 'yan_malzeme' ? 'kg' : 'm2',
        ad: '',
        kalinlik_mm: '',
        birim_fiyat: '',
        tedarikci_id: '',
        marka: '',
      })
    }
  }, [duzenlenecek, defaultKategori, reset])

  const onSubmit = async (veri: FormVeri) => {
    setKaydediliyor(true)
    setSunucuHata(null)
    try {
      const payload = {
        ...veri,
        tedarikci_id: veri.tedarikci_id || null,
        marka: veri.marka || null,
        kalinlik_mm: typeof veri.kalinlik_mm === 'number' ? veri.kalinlik_mm : null,
        birim_fiyat: typeof veri.birim_fiyat === 'number' ? veri.birim_fiyat : null,
      }
      await onKaydet(payload as any)
      onKapat()
    } catch (e: unknown) {
      setSunucuHata(e instanceof Error ? e.message : 'Bir hata oluştu')
    } finally {
      setKaydediliyor(false)
    }
  }

  const handleCitaBoyut = (boyut: number) => {
    setValue('ad', `Alüminyum Çıta ${boyut}mm`)
    setValue('kalinlik_mm', boyut)
  }

  const tedarikciListesi = cariler.filter(c => c.tipi === 'tedarikci')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {duzenlenecek ? 'Stok Düzenle' : 'Yeni Stok Ekle'}
          </h2>
          <button
            onClick={onKapat}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Kategori */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori *</label>
            <div className="flex gap-2">
              {([
                { value: 'cam', label: 'Cam' },
                { value: 'cita', label: 'Çıta' },
                { value: 'yan_malzeme', label: 'Yan Malzeme' },
              ] as const).map(({ value, label }) => (
                <label
                  key={value}
                  className={cn(
                    'flex-1 text-center px-3 py-2 text-sm rounded-lg border cursor-pointer transition-colors',
                    kategori === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <input
                    type="radio"
                    value={value}
                    {...register('kategori')}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Çıta boyut preset */}
          {kategori === 'cita' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Çıta Boyutu</label>
              <div className="flex flex-wrap gap-2">
                {CITA_BOYUTLARI.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => handleCitaBoyut(b)}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                      watch('kalinlik_mm') === b
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    {b} mm
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ad *</label>
            <input
              {...register('ad')}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                errors.ad ? 'border-red-300' : 'border-gray-200'
              )}
              placeholder={
                kategori === 'cam' ? 'Örn: Şeffaf Cam 6mm' :
                kategori === 'cita' ? 'Yukarıdan boyut seçin veya yazın' :
                'Örn: Poliüretan, Butil...'
              }
            />
            {errors.ad && <p className="mt-1 text-xs text-red-500">{errors.ad.message}</p>}
          </div>

          {/* Cam: Kalınlık */}
          {kategori === 'cam' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kalınlık (mm) *</label>
              <input
                {...register('kalinlik_mm')}
                type="number"
                step="0.1"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.kalinlik_mm ? 'border-red-300' : 'border-gray-200'
                )}
                placeholder="Örn: 4, 5, 6, 8"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Kalınlık stok için zorunlu, Kompozisyon (4+16+4 vb.) siparişte satır bazında girilir.
              </p>
            </div>
          )}

          {/* Tedarikçi — cam dışında */}
          {kategori !== 'cam' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tedarikçi</label>
              <select
                {...register('tedarikci_id')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Seçiniz...</option>
                {tedarikciListesi.map((c) => (
                  <option key={c.id} value={c.id}>{c.kod} — {c.ad}</option>
                ))}
              </select>
              {tedarikciListesi.length === 0 && (
                <p className="mt-1 text-xs text-amber-500">
                  Henüz tedarikçi eklenmemiş. Cari panelinden tedarikçi ekleyin.
                </p>
              )}
            </div>
          )}

          {/* Birim & Fiyat */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birim *</label>
              <select
                {...register('birim')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="m2">m²</option>
                <option value="m">metre</option>
                <option value="adet">Adet</option>
                <option value="kg">kg</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birim Fiyat (₺)</label>
              <input
                {...register('birim_fiyat')}
                type="number"
                step="0.01"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.birim_fiyat ? 'border-red-300' : 'border-gray-200'
                )}
                placeholder="Örn: 250.00"
              />
            </div>
          </div>

          {sunucuHata && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{sunucuHata}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onKapat}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={kaydediliyor}
              className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {kaydediliyor ? 'Kaydediliyor...' : duzenlenecek ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
