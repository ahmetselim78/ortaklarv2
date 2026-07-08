import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import type { Stok, StokKategori } from '@/types/stok'
import type { Cari } from '@/types/cari'
import { cn } from '@/lib/utils'
import { useEscape } from '@/hooks/useEscape'
import {
  CAM_GRUPLARI,
  CITA_BOYUTLARI,
  citaKodOnerisi,
  citaStokAdi,
  extractKatmanYapisiFromText,
  KOD_ARALIK_IPUCLARI,
  normalizeKatmanYapisi,
} from '@/lib/cam'

const schema = z.object({
  kod: z.string().optional(),
  kategori: z.enum(['cam', 'cita', 'yan_malzeme']),
  ad: z.string().min(1, 'Açıklama zorunludur'),
  grup: z.string().optional(),
  katman_yapisi: z.string().optional(),
  kalinlik_mm: z.coerce.number().positive('Pozitif olmalı').optional().or(z.literal('')),
  birim: z.string().min(1, 'Birim zorunludur'),
  birim_fiyat: z.coerce.number().min(0).optional().or(z.literal('')),
  tedarikci_id: z.string().optional(),
  marka: z.string().optional(),
  aktif: z.boolean(),
}).superRefine((veri, ctx) => {
  if (veri.kategori === 'cam' && !veri.kod?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['kod'],
      message: 'Cam stok kodu zorunludur',
    })
  }
  if (veri.kategori === 'cita') {
    const mm = typeof veri.kalinlik_mm === 'number' ? veri.kalinlik_mm : null
    if (mm == null || mm <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['kalinlik_mm'],
        message: 'Çıta boyutu (mm) zorunludur',
      })
    }
  }
})

type FormGirdi = z.input<typeof schema>
type FormVeri = z.output<typeof schema>
export type StokPayload = Omit<
  FormVeri,
  'kod' | 'tedarikci_id' | 'marka' | 'kalinlik_mm' | 'birim_fiyat' | 'grup' | 'katman_yapisi'
> & {
  kod: string
  tedarikci_id: string | null
  marka: string | null
  kalinlik_mm: number | null
  birim_fiyat: number | null
  grup: string | null
  katman_yapisi: string | null
}

export interface StokFormOnDegerleri {
  kod?: string
  ad?: string
  grup?: string
  katman_yapisi?: string
  kategori?: StokKategori
}

interface Props {
  duzenlenecek?: Stok | null
  cariler: Cari[]
  defaultKategori?: StokKategori
  onDegerler?: StokFormOnDegerleri | null
  onKaydet: (veri: StokPayload) => Promise<void>
  onKapat: () => void
}

export default function StokForm({
  duzenlenecek,
  cariler,
  defaultKategori,
  onDegerler,
  onKaydet,
  onKapat,
}: Props) {
  useEscape(onKapat)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [sunucuHata, setSunucuHata] = useState<string | null>(null)

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
      kategori: defaultKategori ?? 'cam',
      birim: defaultKategori === 'cita' ? 'm' : defaultKategori === 'yan_malzeme' ? 'kg' : 'm2',
      ad: '',
      grup: '',
      katman_yapisi: '',
      kalinlik_mm: '',
      birim_fiyat: '',
      tedarikci_id: '',
      marka: '',
      aktif: true,
    },
  })

  const kategori = watch('kategori')
  const ad = watch('ad')
  const katman = watch('katman_yapisi')
  const grup = watch('grup')
  const kalinlikMm = watch('kalinlik_mm')

  useEffect(() => {
    if (duzenlenecek) return
    if (kategori === 'cita') {
      setValue('birim', 'm')
      setValue('grup', '')
      setValue('katman_yapisi', '')
    } else if (kategori === 'yan_malzeme') {
      setValue('birim', 'kg')
      setValue('kalinlik_mm', '')
      setValue('grup', '')
      setValue('katman_yapisi', '')
    } else {
      setValue('birim', 'm2')
      setValue('kalinlik_mm', '')
    }
  }, [kategori, duzenlenecek, setValue])

  useEffect(() => {
    if (duzenlenecek) {
      const stokKategori = duzenlenecek.kategori ?? 'cam'
      const katmanVal = normalizeKatmanYapisi(duzenlenecek.katman_yapisi) || extractKatmanYapisiFromText(duzenlenecek.ad)
      reset({
        kod: duzenlenecek.kod ?? '',
        kategori: stokKategori,
        ad: duzenlenecek.ad,
        grup: duzenlenecek.grup ?? '',
        katman_yapisi: katmanVal,
        kalinlik_mm: stokKategori === 'cam' ? '' : duzenlenecek.kalinlik_mm ?? '',
        birim: duzenlenecek.birim,
        birim_fiyat: duzenlenecek.birim_fiyat ?? '',
        tedarikci_id: duzenlenecek.tedarikci_id ?? '',
        marka: duzenlenecek.marka ?? '',
        aktif: duzenlenecek.aktif ?? true,
      })
    } else if (onDegerler) {
      reset({
        kod: onDegerler.kod ?? '',
        kategori: onDegerler.kategori ?? defaultKategori ?? 'cam',
        birim: 'm2',
        ad: onDegerler.ad ?? '',
        grup: onDegerler.grup ?? '',
        katman_yapisi: onDegerler.katman_yapisi ?? '',
        kalinlik_mm: '',
        birim_fiyat: '',
        tedarikci_id: '',
        marka: '',
        aktif: true,
      })
    } else {
      reset({
        kod: '',
        kategori: defaultKategori ?? 'cam',
        birim: defaultKategori === 'cita' ? 'm' : defaultKategori === 'yan_malzeme' ? 'kg' : 'm2',
        ad: '',
        grup: '',
        katman_yapisi: '',
        kalinlik_mm: '',
        birim_fiyat: '',
        tedarikci_id: '',
        marka: '',
        aktif: true,
      })
    }
  }, [duzenlenecek, defaultKategori, onDegerler, reset])

  useEffect(() => {
    if (kategori !== 'cam') return
    const bulunan = extractKatmanYapisiFromText(ad)
    setValue('katman_yapisi', bulunan)
  }, [ad, kategori, setValue])

  const onSubmit = async (veri: FormVeri) => {
    setKaydediliyor(true)
    setSunucuHata(null)
    try {
      const camMi = veri.kategori === 'cam'
      const citaMi = veri.kategori === 'cita'
      const katmanYapisi = camMi
        ? normalizeKatmanYapisi(katman) || normalizeKatmanYapisi(veri.katman_yapisi) || extractKatmanYapisiFromText(veri.ad) || null
        : null
      const citaMm = citaMi && typeof veri.kalinlik_mm === 'number' ? Math.round(veri.kalinlik_mm) : null
      const payload: StokPayload = {
        ...veri,
        kod: veri.kod?.trim()
          || (citaMm != null ? citaKodOnerisi(citaMm) : ''),
        ad: veri.ad.trim(),
        grup: camMi ? (veri.grup?.trim().toLocaleUpperCase('tr-TR') || null) : null,
        katman_yapisi: katmanYapisi,
        tedarikci_id: camMi ? null : veri.tedarikci_id || null,
        marka: camMi ? null : veri.marka || null,
        kalinlik_mm: camMi ? null : typeof veri.kalinlik_mm === 'number' ? veri.kalinlik_mm : null,
        birim_fiyat: typeof veri.birim_fiyat === 'number' ? veri.birim_fiyat : null,
        aktif: veri.aktif ?? true,
      }
      await onKaydet(payload)
      onKapat()
    } catch (e: unknown) {
      setSunucuHata(e instanceof Error ? e.message : 'Bir hata oluştu')
    } finally {
      setKaydediliyor(false)
    }
  }

  const handleCitaBoyut = (boyut: number) => {
    setValue('ad', citaStokAdi(boyut))
    setValue('kalinlik_mm', boyut)
    if (!duzenlenecek && !getValues('kod')?.trim()) {
      setValue('kod', citaKodOnerisi(boyut))
    }
  }

  const tedarikciListesi = cariler.filter(c => c.tipi === 'tedarikci')
  const kodIpucu = grup ? KOD_ARALIK_IPUCLARI[grup] : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
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

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {duzenlenecek?.aktif === false && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              Bu kart pasif — yeni siparişlerde görünmez.
            </div>
          )}

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
                  <input type="radio" value={value} {...register('kategori')} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {kategori === 'cam' && (
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Kimlik</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Grup</label>
                <div className="flex flex-wrap gap-2">
                  {CAM_GRUPLARI.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setValue('grup', g)}
                      className={cn(
                        'px-2.5 py-1 text-xs rounded-lg border transition-colors',
                        grup === g
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:bg-white'
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stok Kodu *</label>
                  <input
                    {...register('kod')}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white',
                      errors.kod ? 'border-red-300' : 'border-gray-200'
                    )}
                    placeholder={kodIpucu ?? '01002'}
                  />
                  {kodIpucu && (
                    <p className="mt-1 text-xs text-gray-400">Önerilen aralık: {kodIpucu}</p>
                  )}
                  {errors.kod && <p className="mt-1 text-xs text-red-500">{errors.kod.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Birim *</label>
                  <select
                    {...register('birim')}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="m2">m²</option>
                    <option value="m">metre</option>
                    <option value="adet">Adet</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {kategori !== 'cam' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stok Kodu</label>
                <input
                  {...register('kod')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Boşsa otomatik"
                />
              </div>
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
            </div>
          )}

          {kategori === 'cita' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Çıta Boyutu (mm) *</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {CITA_BOYUTLARI.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => handleCitaBoyut(b)}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                      kalinlikMm === b
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    {b} mm
                  </button>
                ))}
              </div>
              <input
                {...register('kalinlik_mm')}
                type="number"
                step="1"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                  errors.kalinlik_mm ? 'border-red-300' : 'border-gray-200'
                )}
                placeholder="Standart dışı boyut girebilirsiniz"
              />
              {errors.kalinlik_mm && (
                <p className="mt-1 text-xs text-red-500">{errors.kalinlik_mm.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-400">
                Ara boşluk mm değeri; sipariş ve üretim ekranlarında çıta kalınlığı olarak kullanılır.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {kategori === 'cam' ? 'Açıklama *' : 'Ad *'}
            </label>
            <input
              {...register('ad')}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                errors.ad ? 'border-red-300' : 'border-gray-200'
              )}
              placeholder={
                kategori === 'cam' ? 'Örn: 4+16+4 ISICAM C' :
                kategori === 'cita' ? 'Yukarıdan boyut seçin veya yazın' :
                'Örn: Poliüretan, Butil...'
              }
            />
            {errors.ad && <p className="mt-1 text-xs text-red-500">{errors.ad.message}</p>}
          </div>

          {kategori !== 'cam' && (
            <>
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
              </div>
              {kategori === 'yan_malzeme' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kalınlık / Ölçü</label>
                  <input
                    {...register('kalinlik_mm')}
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Örn: 16"
                  />
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
              <input
                type="checkbox"
                {...register('aktif')}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Aktif stok
            </label>
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
