import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import type { Cari } from '@/types/cari'
import { cn } from '@/lib/utils'
import { useEscape } from '@/hooks/useEscape'

const schema = z.object({
  ad: z.string().min(1, 'Ad zorunludur'),
  tipi: z.enum(['musteri', 'tedarikci']),
  telefon: z.string().optional(),
  email: z.string().email('Geçersiz e-posta').optional().or(z.literal('')),
  adres: z.string().optional(),
  notlar: z.string().optional(),
})

type FormVeri = z.infer<typeof schema>

interface Props {
  duzenlenecek?: Cari | null
  onKaydet: (veri: FormVeri) => Promise<void>
  onKapat: () => void
}

export default function CariForm({ duzenlenecek, onKaydet, onKapat }: Props) {
  useEscape(onKapat)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [sunucuHata, setSunucuHata] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormVeri>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipi: 'musteri',
    },
  })

  useEffect(() => {
    if (duzenlenecek) {
      reset({
        ad: duzenlenecek.ad,
        tipi: duzenlenecek.tipi,
        telefon: duzenlenecek.telefon ?? '',
        email: duzenlenecek.email ?? '',
        adres: duzenlenecek.adres ?? '',
        notlar: duzenlenecek.notlar ?? '',
      })
    } else {
      reset({ tipi: 'musteri', ad: '', telefon: '', email: '', adres: '', notlar: '' })
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
    /* Overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            {duzenlenecek ? 'Cari Düzenle' : 'Yeni Cari Ekle'}
          </h2>
          <button
            onClick={onKapat}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Tip Seçimi */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tip</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {(['musteri', 'tedarikci'] as const).map((t) => (
                <label
                  key={t}
                  className="flex-1 flex items-center justify-center gap-2 py-2 cursor-pointer has-[:checked]:bg-blue-600 has-[:checked]:text-white text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <input type="radio" value={t} {...register('tipi')} className="sr-only" />
                  {t === 'musteri' ? 'Müşteri' : 'Tedarikçi'}
                </label>
              ))}
            </div>
          </div>

          {/* Ad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ad / Unvan *</label>
            <input
              {...register('ad')}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                errors.ad ? 'border-red-300' : 'border-gray-200'
              )}
              placeholder="Örn: Ahmet Cam Ltd."
            />
            {errors.ad && <p className="mt-1 text-xs text-red-500">{errors.ad.message}</p>}
          </div>

          {/* Telefon & E-posta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input
                {...register('telefon')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0555 000 00 00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
              <input
                {...register('email')}
                type="email"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.email ? 'border-red-300' : 'border-gray-200'
                )}
                placeholder="ornek@mail.com"
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>
          </div>

          {/* Adres */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
            <textarea
              {...register('adres')}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Adres..."
            />
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
            <textarea
              {...register('notlar')}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="İsteğe bağlı not..."
            />
          </div>

          {/* Sunucu Hatası */}
          {sunucuHata && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{sunucuHata}</p>
          )}

          {/* Butonlar */}
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
