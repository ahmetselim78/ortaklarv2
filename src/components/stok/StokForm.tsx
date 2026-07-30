import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LockKeyhole, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEscape } from '@/hooks/useEscape'
import {
  CAM_GRUPLARI,
  CITA_BOYUTLARI,
  citaStokAdi,
  normalizeKatmanYapisi,
} from '@/lib/cam'
import type { StokKatalogKaydi, StokKartPayload, StokKategori } from '@/types/stok'

const schema = z.object({
  kod: z.string().optional(),
  ad: z.string().trim().min(1, 'Ad zorunludur'),
  kategori: z.enum(['cam', 'cita', 'yan_malzeme']),
  cam_turu: z.enum(['tek_cam', 'kombinasyon']),
  grup: z.string().optional(),
  katman_yapisi: z.string().optional(),
  kalinlik_mm: z.coerce.number().positive('Sıfırdan büyük olmalıdır').optional().or(z.literal('')),
  birim: z.string().trim().min(1, 'Birim zorunludur'),
  marka: z.string().optional(),
  minimum_miktar: z.coerce.number().min(0, 'Negatif olamaz'),
  stok_yeri: z.string().optional(),
}).superRefine((veri, ctx) => {
  if (veri.kategori === 'cam') {
    if (!veri.grup?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['grup'], message: 'Cam grubu zorunludur' })
    }
    if (veri.cam_turu === 'tek_cam') {
      if (typeof veri.kalinlik_mm !== 'number' || veri.kalinlik_mm <= 0) {
        ctx.addIssue({ code: 'custom', path: ['kalinlik_mm'], message: 'Tek cam kalınlığı zorunludur' })
      }
    } else {
      const katman = normalizeKatmanYapisi(veri.katman_yapisi ?? '')
      if (!katman || !/^[0-9]+(?:\+[0-9]+){1,4}$/.test(katman)) {
        ctx.addIssue({
          code: 'custom',
          path: ['katman_yapisi'],
          message: 'Geçerli bir katman yapısı girin (örn. 4+16+4)',
        })
      }
    }
  }
  if (veri.kategori === 'cita'
      && (typeof veri.kalinlik_mm !== 'number' || veri.kalinlik_mm <= 0)) {
    ctx.addIssue({ code: 'custom', path: ['kalinlik_mm'], message: 'Çıta boyutu zorunludur' })
  }
})

type FormGirdi = z.input<typeof schema>
type FormVeri = z.output<typeof schema>
export type StokPayload = StokKartPayload

export interface StokFormOnDegerleri {
  kod?: string
  ad?: string
  grup?: string
  katman_yapisi?: string
  kategori?: StokKategori
}

interface Props {
  duzenlenecek?: StokKatalogKaydi | null
  defaultKategori?: StokKategori
  onDegerler?: StokFormOnDegerleri | null
  onKaydet: (veri: StokPayload) => Promise<void>
  onKapat: () => void
}

const KATEGORI_ETIKETLERI: Record<StokKategori, string> = {
  cam: 'Cam',
  cita: 'Çıta',
  yan_malzeme: 'Yan Malzeme',
}

export default function StokForm({
  duzenlenecek,
  defaultKategori = 'cam',
  onDegerler,
  onKaydet,
  onKapat,
}: Props) {
  useEscape(onKapat)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [sunucuHata, setSunucuHata] = useState<string | null>(null)
  const sonCitaAdi = useRef('')

  const baslangicKategori = duzenlenecek?.kategori ?? onDegerler?.kategori ?? defaultKategori
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormGirdi, unknown, FormVeri>({
    resolver: zodResolver(schema),
    defaultValues: {
      kod: '',
      ad: '',
      kategori: baslangicKategori,
      cam_turu: 'tek_cam',
      grup: '',
      katman_yapisi: '',
      kalinlik_mm: '',
      birim: baslangicKategori === 'cam' ? 'm2' : baslangicKategori === 'cita' ? 'm' : 'adet',
      marka: '',
      minimum_miktar: 0,
      stok_yeri: '',
    },
  })

  useEffect(() => {
    const kategori = duzenlenecek?.kategori ?? onDegerler?.kategori ?? defaultKategori
    reset({
      kod: duzenlenecek?.kod ?? onDegerler?.kod ?? '',
      ad: duzenlenecek?.ad ?? onDegerler?.ad ?? '',
      kategori,
      cam_turu: duzenlenecek?.katman_yapisi || onDegerler?.katman_yapisi
        ? 'kombinasyon'
        : 'tek_cam',
      grup: duzenlenecek?.grup ?? onDegerler?.grup ?? '',
      katman_yapisi: duzenlenecek?.katman_yapisi ?? onDegerler?.katman_yapisi ?? '',
      kalinlik_mm: duzenlenecek?.kalinlik_mm ?? '',
      birim: duzenlenecek?.birim ?? (kategori === 'cam' ? 'm2' : kategori === 'cita' ? 'm' : 'adet'),
      marka: duzenlenecek?.marka ?? '',
      minimum_miktar: duzenlenecek?.minimum_miktar ?? 0,
      stok_yeri: duzenlenecek?.stok_yeri ?? '',
    })
  }, [defaultKategori, duzenlenecek, onDegerler, reset])

  const kategori = watch('kategori')
  const camTuru = watch('cam_turu')
  const citaBoyutu = watch('kalinlik_mm')

  useEffect(() => {
    if (kategori === 'cam') setValue('birim', 'm2')
    if (kategori === 'cita') setValue('birim', 'm')
  }, [kategori, setValue])

  useEffect(() => {
    if (kategori !== 'cita' || typeof citaBoyutu !== 'number' || citaBoyutu <= 0) return
    const yeniAd = citaStokAdi(citaBoyutu)
    const mevcutAd = getValues('ad').trim()
    if (!mevcutAd || mevcutAd === sonCitaAdi.current) setValue('ad', yeniAd)
    sonCitaAdi.current = yeniAd
  }, [citaBoyutu, getValues, kategori, setValue])

  const submit = async (veri: FormVeri) => {
    setSunucuHata(null)
    const katman = veri.kategori === 'cam' && veri.cam_turu === 'kombinasyon'
      ? normalizeKatmanYapisi(veri.katman_yapisi ?? '') || null
      : null
    const kalinlik = veri.kategori === 'cam' && veri.cam_turu === 'kombinasyon'
      ? null
      : typeof veri.kalinlik_mm === 'number' ? veri.kalinlik_mm : null

    const payload: StokPayload = {
      kod: duzenlenecek?.kod ?? '',
      ad: veri.ad.trim(),
      kategori: veri.kategori,
      grup: veri.kategori === 'cam' ? veri.grup?.trim() || null : null,
      katman_yapisi: katman,
      kalinlik_mm: kalinlik,
      birim: veri.kategori === 'cam' ? 'm2' : veri.kategori === 'cita' ? 'm' : veri.birim.trim(),
      marka: veri.kategori === 'yan_malzeme' ? veri.marka?.trim() || null : null,
      minimum_miktar: veri.minimum_miktar,
      stok_yeri: veri.stok_yeri?.trim() || null,
    }

    setKaydediliyor(true)
    try {
      await onKaydet(payload)
      onKapat()
    } catch (error) {
      setSunucuHata(error instanceof Error ? error.message : 'Stok kartı kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(event) => { if (event.target === event.currentTarget && !kaydediliyor) onKapat() }}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {duzenlenecek ? 'Stok Kartını Düzelt' : `Yeni ${KATEGORI_ETIKETLERI[baslangicKategori]} Kartı`}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Yeni kart aktif başlar. Satış ve maliyet ayarları ilgili yönetim ekranlarında belirlenir.
            </p>
          </div>
          <button type="button" onClick={onKapat} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(submit)} className="space-y-5 p-6">
          {duzenlenecek ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Kategori *</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(KATEGORI_ETIKETLERI) as StokKategori[]).map((deger) => (
                  <button
                    key={deger}
                    type="button"
                    onClick={() => setValue('kategori', deger, { shouldValidate: true })}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm',
                      kategori === deger
                        ? 'border-blue-500 bg-blue-50 font-medium text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    {KATEGORI_ETIKETLERI[deger]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Kategori: <strong>{KATEGORI_ETIKETLERI[baslangicKategori]}</strong>
            </div>
          )}

          {kategori === 'cam' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Cam türü *</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['tek_cam', 'Tek cam'],
                  ['kombinasyon', 'Kombinasyon'],
                ] as const).map(([deger, etiket]) => (
                  <button
                    key={deger}
                    type="button"
                    onClick={() => setValue('cam_turu', deger, { shouldValidate: true })}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm',
                      camTuru === deger
                        ? 'border-blue-500 bg-blue-50 font-medium text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    {etiket}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="block text-sm font-medium text-gray-700">
              Stok kodu
              <div className="mt-1 flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-600">
                <LockKeyhole size={14} className="shrink-0 text-gray-400" />
                {duzenlenecek?.kod ?? 'Kaydederken otomatik atanacak'}
              </div>
              <p className="mt-1 text-xs font-normal text-gray-400">Kod sistem tarafından üretilir ve sonradan değiştirilemez.</p>
            </div>
            <label className="block text-sm font-medium text-gray-700">
              Ad *
              <input
                {...register('ad')}
                className={cn(
                  'mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500',
                  errors.ad ? 'border-red-300' : 'border-gray-200',
                )}
                placeholder={kategori === 'yan_malzeme' ? 'Örn. Poliüretan' : 'Kart adı'}
              />
              {errors.ad && <span className="mt-1 block text-xs text-red-500">{errors.ad.message}</span>}
            </label>
          </div>

          {kategori === 'cam' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">
                Grup *
                <select
                  {...register('grup')}
                  className={cn(
                    'mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500',
                    errors.grup ? 'border-red-300' : 'border-gray-200',
                  )}
                >
                  <option value="">Grup seçin</option>
                  {CAM_GRUPLARI.map((grup) => <option key={grup} value={grup}>{grup}</option>)}
                </select>
                {errors.grup && <span className="mt-1 block text-xs text-red-500">{errors.grup.message}</span>}
              </label>
              {camTuru === 'tek_cam' ? (
                <label className="block text-sm font-medium text-gray-700">
                  Kalınlık (mm) *
                  <input
                    {...register('kalinlik_mm')}
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={cn(
                      'mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500',
                      errors.kalinlik_mm ? 'border-red-300' : 'border-gray-200',
                    )}
                  />
                  {errors.kalinlik_mm && <span className="mt-1 block text-xs text-red-500">{errors.kalinlik_mm.message}</span>}
                </label>
              ) : (
                <label className="block text-sm font-medium text-gray-700">
                  Katman yapısı *
                  <input
                    {...register('katman_yapisi')}
                    className={cn(
                      'mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500',
                      errors.katman_yapisi ? 'border-red-300' : 'border-gray-200',
                    )}
                    placeholder="4+16+4"
                  />
                  {errors.katman_yapisi && <span className="mt-1 block text-xs text-red-500">{errors.katman_yapisi.message}</span>}
                </label>
              )}
            </div>
          )}

          {kategori === 'cita' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Boyut (mm) *</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {CITA_BOYUTLARI.map((boyut) => (
                  <button
                    key={boyut}
                    type="button"
                    onClick={() => setValue('kalinlik_mm', boyut, { shouldValidate: true })}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs',
                      Number(citaBoyutu) === boyut
                        ? 'border-blue-500 bg-blue-50 font-medium text-blue-700'
                        : 'border-gray-200 text-gray-600',
                    )}
                  >
                    {boyut} mm
                  </button>
                ))}
              </div>
              <input
                {...register('kalinlik_mm')}
                type="number"
                min="0.01"
                step="0.01"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500',
                  errors.kalinlik_mm ? 'border-red-300' : 'border-gray-200',
                )}
                placeholder="Standart dışı boyut"
              />
              {errors.kalinlik_mm && <span className="mt-1 block text-xs text-red-500">{errors.kalinlik_mm.message}</span>}
              <p className="mt-1 text-xs text-gray-400">Kart adı ölçüye göre önerilir; stok kodunu sistem atar.</p>
            </div>
          )}

          {kategori === 'yan_malzeme' && (
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium text-gray-700">
                Birim *
                <select
                  {...register('birim')}
                  className={cn(
                    'mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500',
                    errors.birim ? 'border-red-300' : 'border-gray-200',
                  )}
                >
                  {['adet', 'kg', 'lt', 'm', 'm2', 'kutu', 'paket'].map((birim) => (
                    <option key={birim} value={birim}>{birim}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Ölçü (mm)
                <input {...register('kalinlik_mm')} type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Marka
                <input {...register('marka')} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>
          )}

          {(kategori === 'cam' || kategori === 'cita') && (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              Birim: <strong>{kategori === 'cam' ? 'm²' : 'm'}</strong>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Kritik stok seviyesi
              <input
                {...register('minimum_miktar')}
                type="number"
                min="0"
                step="0.001"
                className={cn(
                  'mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500',
                  errors.minimum_miktar ? 'border-red-300' : 'border-gray-200',
                )}
              />
              {errors.minimum_miktar && <span className="mt-1 block text-xs text-red-500">{errors.minimum_miktar.message}</span>}
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Stok yeri
              <input
                {...register('stok_yeri')}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Örn. A Deposu / Raf 3"
              />
            </label>
          </div>

          {sunucuHata && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {sunucuHata}
            </p>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={onKapat} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              İptal
            </button>
            <button type="submit" disabled={kaydediliyor} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {kaydediliyor ? 'Kaydediliyor…' : duzenlenecek ? 'Değişiklikleri Kaydet' : 'Kartı Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
