import { useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Plus, Trash2 } from 'lucide-react'
import type { Cari } from '@/types/cari'
import type { Stok } from '@/types/stok'
import { cn } from '@/lib/utils'

const KENAR_ISLEMLERI = ['Rodaj', 'Bizote', 'Düz Kesim'] as const
const NOT_ETIKETLERI = ['Menfez'] as const

const camSchema = z.object({
  stok_id: z.string().min(1, 'Cam cinsi seçiniz'),
  genislik_mm: z.coerce.number().positive('Pozitif olmalı'),
  yukseklik_mm: z.coerce.number().positive('Pozitif olmalı'),
  adet: z.coerce.number().int().min(1, 'En az 1'),
  ara_bosluk_mm: z.coerce.number().positive('Seçiniz').optional(),
  kenar_islemi: z.string().optional(),
  notlar: z.string().optional(),
})

const schema = z.object({
  cari_id: z.string().min(1, 'Müşteri seçiniz'),
  tarih: z.string().min(1, 'Tarih zorunludur'),
  teslim_tarihi: z.string().optional(),
  notlar: z.string().optional(),
  camlar: z.array(camSchema).min(1, 'En az 1 cam parçası eklenmelidir'),
})

type FormVeri = z.infer<typeof schema>

interface Props {
  cariler: Cari[]
  stoklar: Stok[]
  onKaydet: (veri: FormVeri) => Promise<unknown>
  onKapat: () => void
}

const BOŞ_CAM = { stok_id: '', genislik_mm: '' as unknown as number, yukseklik_mm: '' as unknown as number, adet: 1, ara_bosluk_mm: '' as unknown as number, kenar_islemi: '', notlar: '' }

export default function SiparisForm({ cariler, stoklar, onKaydet, onKapat }: Props) {
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [sunucuHata, setSunucuHata] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormVeri>({
    resolver: zodResolver(schema),
    defaultValues: {
      tarih: new Date().toISOString().split('T')[0],
      camlar: [{ ...BOŞ_CAM }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'camlar' })
  const watchedCamlar = useWatch({ control, name: 'camlar' })

  const toggleTag = (index: number, field: 'kenar_islemi' | 'notlar', tag: string) => {
    const current = (watchedCamlar?.[index]?.[field] ?? '') as string
    const tags = current ? current.split(',').map(t => t.trim()).filter(Boolean) : []
    const has = tags.includes(tag)
    const next = has ? tags.filter(t => t !== tag) : [...tags, tag]
    setValue(`camlar.${index}.${field}`, next.join(', '))
  }

  const hasTag = (index: number, field: 'kenar_islemi' | 'notlar', tag: string): boolean => {
    const current = (watchedCamlar?.[index]?.[field] ?? '') as string
    return current.split(',').map(t => t.trim()).includes(tag)
  }

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
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">Yeni Sipariş</h2>
          <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          {/* Kaydırılabilir içerik */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Sipariş Bilgileri */}
            <div className="grid grid-cols-2 gap-4">
              {/* Müşteri */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri *</label>
                <select
                  {...register('cari_id')}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500',
                    errors.cari_id ? 'border-red-300' : 'border-gray-200'
                  )}
                >
                  <option value="">Müşteri seçiniz...</option>
                  {cariler
                    .filter((c) => c.tipi === 'musteri')
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.kod} — {c.ad}</option>
                    ))}
                </select>
                {errors.cari_id && <p className="mt-1 text-xs text-red-500">{errors.cari_id.message}</p>}
              </div>

              {/* Tarih */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sipariş Tarihi *</label>
                <input
                  type="date"
                  {...register('tarih')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Teslim Tarihi */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teslim Tarihi</label>
                <input
                  type="date"
                  {...register('teslim_tarihi')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Notlar */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
                <textarea
                  {...register('notlar')}
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="İsteğe bağlı not..."
                />
              </div>
            </div>

            {/* Cam Parçaları */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Cam Parçaları
                  {errors.camlar?.root && (
                    <span className="ml-2 text-xs text-red-500 font-normal">{errors.camlar.root.message}</span>
                  )}
                </h3>
                <button
                  type="button"
                  onClick={() => append({ ...BOŞ_CAM })}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus size={14} /> Cam Ekle
                </button>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                      <th className="px-3 py-2">Cam Cinsi *</th>
                      <th className="px-3 py-2">Gen. (mm) *</th>
                      <th className="px-3 py-2">Yük. (mm) *</th>
                      <th className="px-3 py-2">Adet</th>
                      <th className="px-3 py-2">Çıta (mm)</th>
                      <th className="px-3 py-2">Özellikler</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-2 py-2">
                          <select
                            {...register(`camlar.${index}.stok_id`)}
                            className={cn(
                              'w-36 rounded border px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
                              errors.camlar?.[index]?.stok_id ? 'border-red-300' : 'border-gray-200'
                            )}
                          >
                            <option value="">Seçiniz...</option>
                            {stoklar.filter((s) => s.kategori === 'cam').map((s) => (
                              <option key={s.id} value={s.id}>{s.ad}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            {...register(`camlar.${index}.genislik_mm`)}
                            className={cn(
                              'w-20 rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                              errors.camlar?.[index]?.genislik_mm ? 'border-red-300' : 'border-gray-200'
                            )}
                            placeholder="0"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            {...register(`camlar.${index}.yukseklik_mm`)}
                            className={cn(
                              'w-20 rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                              errors.camlar?.[index]?.yukseklik_mm ? 'border-red-300' : 'border-gray-200'
                            )}
                            placeholder="0"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            {...register(`camlar.${index}.adet`)}
                            className="w-14 rounded border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="1"
                            min={1}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            {...register(`camlar.${index}.ara_bosluk_mm`)}
                            className="w-20 rounded border border-gray-200 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">—</option>
                            <option value="9">9</option>
                            <option value="12">12</option>
                            <option value="14">14</option>
                            <option value="16">16</option>
                            <option value="20">20</option>
                            <option value="24">24</option>
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            {/* Not etiketleri */}
                            {NOT_ETIKETLERI.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => toggleTag(index, 'notlar', tag)}
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                                  hasTag(index, 'notlar', tag)
                                    ? 'bg-amber-100 text-amber-700 border-amber-300'
                                    : 'bg-white text-gray-400 border-gray-200 hover:border-amber-300 hover:text-amber-600'
                                )}
                              >
                                {tag}
                              </button>
                            ))}
                            {/* Kenar işlemi etiketleri */}
                            {KENAR_ISLEMLERI.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => toggleTag(index, 'kenar_islemi', tag)}
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                                  hasTag(index, 'kenar_islemi', tag)
                                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                                    : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                                )}
                              >
                                {tag}
                              </button>
                            ))}
                            {/* Hidden inputs for form registration */}
                            <input type="hidden" {...register(`camlar.${index}.kenar_islemi`)} />
                            <input type="hidden" {...register(`camlar.${index}.notlar`)} />
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            disabled={fields.length <= 1}
                            className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            title="Cam kaldır"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Her cam parçasına otomatik <span className="font-mono font-medium text-gray-600">GLS-XXXX</span> kodu atanacak.
              </p>
            </div>
          </div>

          {/* Alt Butonlar */}
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            {sunucuHata && (
              <p className="mb-3 text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{sunucuHata}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onKapat}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={kaydediliyor}
                className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {kaydediliyor ? 'Kaydediliyor...' : 'Siparişi Kaydet'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
