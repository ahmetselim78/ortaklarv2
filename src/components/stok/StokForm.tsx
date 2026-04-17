import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import type { Stok } from '@/types/stok'
import { cn } from '@/lib/utils'

const CAM_TIPLERI = ['Şeffaf', 'Renkli', 'Temperli', 'Lamine', 'Aynalı', 'Buzlu', 'Diğer']

const schema = z.object({
  ad: z.string().min(1, 'Ad zorunludur'),
  tip: z.string().optional(),
  kalinlik_mm: z.coerce.number().positive('Pozitif olmalı').optional().or(z.literal('')),
  renk: z.string().optional(),
  birim: z.string().min(1, 'Birim zorunludur'),
  birim_fiyat: z.coerce.number().min(0).optional().or(z.literal('')),
})

type FormVeri = z.infer<typeof schema>

interface Props {
  duzenlenecek?: Stok | null
  onKaydet: (veri: FormVeri) => Promise<void>
  onKapat: () => void
}

export default function StokForm({ duzenlenecek, onKaydet, onKapat }: Props) {
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [sunucuHata, setSunucuHata] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormVeri>({
    resolver: zodResolver(schema),
    defaultValues: { birim: 'm2' },
  })

  useEffect(() => {
    if (duzenlenecek) {
      reset({
        ad: duzenlenecek.ad,
        tip: duzenlenecek.tip ?? '',
        kalinlik_mm: duzenlenecek.kalinlik_mm ?? '',
        renk: duzenlenecek.renk ?? '',
        birim: duzenlenecek.birim,
        birim_fiyat: duzenlenecek.birim_fiyat ?? '',
      })
    } else {
      reset({ birim: 'm2', ad: '', tip: '', renk: '', kalinlik_mm: '', birim_fiyat: '' })
    }
  }, [duzenlenecek, reset])

  const onSubmit = async (veri: FormVeri) => {
    setKaydediliyor(true)
    setSunucuHata(null)
    try {
      await onKaydet(veri)
      onKapat()
    } catch (e: unknown) {
      setSunucuHata(e instanceof Error ? e.message : 'Bir hata oluştu')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
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

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Ad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ad *</label>
            <input
              {...register('ad')}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                errors.ad ? 'border-red-300' : 'border-gray-200'
              )}
              placeholder="Örn: Şeffaf Cam 6mm"
            />
            {errors.ad && <p className="mt-1 text-xs text-red-500">{errors.ad.message}</p>}
          </div>

          {/* Tip & Kalınlık */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cam Tipi</label>
              <select
                {...register('tip')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Seçiniz...</option>
                {CAM_TIPLERI.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kalınlık (mm)</label>
              <input
                {...register('kalinlik_mm')}
                type="number"
                step="0.1"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.kalinlik_mm ? 'border-red-300' : 'border-gray-200'
                )}
                placeholder="Örn: 6"
              />
              {errors.kalinlik_mm && (
                <p className="mt-1 text-xs text-red-500">{errors.kalinlik_mm.message}</p>
              )}
            </div>
          </div>

          {/* Renk & Birim */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Renk</label>
              <input
                {...register('renk')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Örn: Şeffaf, Bronz..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birim *</label>
              <select
                {...register('birim')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="m2">m²</option>
                <option value="adet">Adet</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>

          {/* Birim Fiyat */}
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
            {errors.birim_fiyat && (
              <p className="mt-1 text-xs text-red-500">{errors.birim_fiyat.message}</p>
            )}
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
