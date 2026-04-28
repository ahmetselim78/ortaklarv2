import { useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Trash2, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Truck, PackageCheck, AlertTriangle } from 'lucide-react'
import type { Cari } from '@/types/cari'
import type { Stok } from '@/types/stok'
import { cn } from '@/lib/utils'
import { camTipiAd } from '@/lib/utils'

const KENAR_ISLEMLERI = ['Rodaj', 'Bizote'] as const
const NOT_ETIKETLERI = ['Menfez'] as const

const camSchema = z.object({
  stok_id: z.string().min(1, 'Cam cinsi seçiniz'),
  genislik_mm: z.coerce.number().positive('Pozitif olmalı'),
  yukseklik_mm: z.coerce.number().positive('Pozitif olmalı'),
  adet: z.coerce.number().int().min(1, 'En az 1'),
  ara_bosluk_mm: z.coerce.number().positive('Seçiniz').optional(),
  kenar_islemi: z.string().optional(),
  notlar: z.string().optional(),
  poz: z.string().optional(),
})

const schema = z.object({
  cari_id: z.string().min(1, 'Müşteri seçiniz'),
  tarih: z.string().min(1, 'Tarih zorunludur'),
  teslim_tarihi: z.string().optional(),
  alt_musteri: z.string().optional(),
  notlar: z.string().optional(),
  teslimat_tipi: z.string().optional(),
  camlar: z.array(camSchema).min(1, 'En az 1 cam parçası eklenmelidir'),
})

type FormVeri = z.infer<typeof schema>

interface Props {
  cariler: Cari[]
  stoklar: Stok[]
  onKaydet: (veri: FormVeri) => Promise<unknown>
  onKapat: () => void
}

const BOŞ_CAM = {
  stok_id: '',
  genislik_mm: '' as unknown as number,
  yukseklik_mm: '' as unknown as number,
  adet: 1,
  ara_bosluk_mm: '' as unknown as number,
  kenar_islemi: '',
  notlar: '',
  poz: '',
}

export default function SiparisForm({ cariler, stoklar, onKaydet, onKapat }: Props) {
  const [adim, setAdim] = useState<1 | 2 | 3>(1)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [sunucuHata, setSunucuHata] = useState<string | null>(null)
  const [genisletilmis, setGenisletilmis] = useState<Set<number>>(new Set())

  // Adım 3 state
  const [teslimatTipi, setTeslimatTipi] = useState<'teslim_alacak' | 'sevkiyat'>('teslim_alacak')

  const toggleGenislet = (idx: number) => {
    setGenisletilmis(prev => {
      const s = new Set(prev)
      s.has(idx) ? s.delete(idx) : s.add(idx)
      return s
    })
  }

  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<FormVeri>({    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      tarih: new Date().toISOString().split('T')[0],
      teslimat_tipi: 'teslim_alacak',
      camlar: [{ ...BOŞ_CAM }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'camlar' })
  const watchedCamlar = useWatch({ control, name: 'camlar' })
  const watchedTeslimTarihi = useWatch({ control, name: 'teslim_tarihi' })

  const appendCam = (fromIndex?: number) => {
    const src = watchedCamlar?.[fromIndex ?? 0]
    append({
      ...BOŞ_CAM,
      stok_id: src?.stok_id ?? '',
      ara_bosluk_mm: src?.ara_bosluk_mm ?? ('' as unknown as number),
    })
  }

  const handleEnterNav = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    fieldName: 'genislik_mm' | 'yukseklik_mm' | 'adet',
  ) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (fieldName === 'genislik_mm') {
      const val = e.currentTarget.value
      if (!val || Number(val) <= 0) return
    }
    const nextFieldMap: Record<string, string | null> = {
      genislik_mm: 'yukseklik_mm',
      yukseklik_mm: 'adet',
      adet: null,
    }
    const nextField = nextFieldMap[fieldName]
    if (nextField) {
      document.querySelector<HTMLElement>(`[data-row="${rowIdx}"][data-field="${nextField}"]`)?.focus()
    } else {
      const nextIdx = rowIdx + 1
      const existing = document.querySelector<HTMLElement>(`[data-row="${nextIdx}"][data-field="genislik_mm"]`)
      if (existing) {
        existing.focus()
      } else {
        appendCam(rowIdx)
        setTimeout(() => {
          document.querySelector<HTMLElement>(`[data-row="${nextIdx}"][data-field="genislik_mm"]`)?.focus()
        }, 60)
      }
    }
  }

  const handlePozEnter = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
  ) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const nextPoz = document.querySelector<HTMLElement>(`[data-row="${rowIdx + 1}"][data-field="poz"]`)
    if (nextPoz) nextPoz.focus()
    // Son satırda Enter yeni cam eklemez
  }

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

  const ilerle = async () => {
    if (adim === 1) {
      const ok = await trigger(['cari_id', 'tarih'])
      if (ok) setAdim(2)
    } else if (adim === 2) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = await trigger(fields.flatMap((_, i) => [
        `camlar.${i}.stok_id`,
        `camlar.${i}.genislik_mm`,
        `camlar.${i}.yukseklik_mm`,
        `camlar.${i}.adet`,
      ]) as any)
      if (ok) {
        setAdim(3)
      }
    }
  }

  const geriDon = () => {
    if (adim === 2) setAdim(1)
    else if (adim === 3) setAdim(2)
  }

  const onSubmit = async (veri: FormVeri) => {
    if (teslimatTipi === 'sevkiyat' && !veri.teslim_tarihi) {
      setSunucuHata('Sevkiyat seçildi ancak teslim tarihi girilmedi. Lütfen teslim tarihi belirleyiniz.')
      return
    }
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

  const camStoklar = stoklar.filter(s => s.kategori === 'cam')

  // Kalınlık + Cam Tipi ayrı seçim için yardımcılar
  const benzersizKalinliklar = [...new Set(
    camStoklar.map(s => s.kalinlik_mm).filter((k): k is number => k != null)
  )].sort((a, b) => a - b)
  const benzersizTipler = [...new Set(
    camStoklar.map(s => camTipiAd(s.ad)).filter(Boolean)
  )]
  const stokFromKalinlikTip = (kalinlik: number | null, tip: string | null): Stok | undefined => {
    return camStoklar.find(s =>
      (kalinlik == null || Number(s.kalinlik_mm) === kalinlik) &&
      (tip == null || camTipiAd(s.ad) === tip)
    )
  }
  const stokById = (id: string | undefined) => camStoklar.find(s => s.id === id)

  const ADIMLAR = [
    { no: 1, etiket: 'Müşteri Bilgileri' },
    { no: 2, etiket: 'Cam Listesi' },
    { no: 3, etiket: 'Sevkiyat' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={cn(
        'w-full bg-white rounded-2xl shadow-xl flex flex-col transition-all duration-300',
        adim === 2 ? 'max-w-5xl max-h-[95vh]' : 'max-w-lg max-h-[90vh]'
      )}>
        {/* Başlık + Adım göstergesi */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Yeni Sipariş</h2>
            <div className="flex items-center gap-2 mt-2">
              {ADIMLAR.map((a, i) => (
                <div key={a.no} className="flex items-center gap-2">
                  <div className={cn(
                    'flex items-center gap-1.5',
                    adim === a.no ? 'text-blue-600' : adim > a.no ? 'text-green-600' : 'text-gray-400'
                  )}>
                    <div className={cn(
                      'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                      adim === a.no ? 'bg-blue-600 text-white' : adim > a.no ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                    )}>
                      {adim > a.no ? '✓' : a.no}
                    </div>
                    <span className="text-xs font-medium whitespace-nowrap">{a.etiket}</span>
                  </div>
                  {i < ADIMLAR.length - 1 && <ChevronRight size={11} className="text-gray-300 shrink-0" />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 ml-4 shrink-0">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit as any)} className="hidden" />
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* ── ADIM 1: Müşteri Bilgileri ── */}
            {adim === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri *</label>
                  <select
                    {...register('cari_id')}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500',
                      errors.cari_id ? 'border-red-300' : 'border-gray-200'
                    )}
                  >
                    <option value="">Müşteri seçiniz...</option>
                    {cariler.filter(c => c.tipi === 'musteri').map(c => (
                      <option key={c.id} value={c.id}>{c.kod} — {c.ad}</option>
                    ))}
                  </select>
                  {errors.cari_id && <p className="mt-1 text-xs text-red-500">{errors.cari_id.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sipariş Tarihi *</label>
                    <input
                      type="date"
                      {...register('tarih')}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                        errors.tarih ? 'border-red-300' : 'border-gray-200'
                      )}
                    />
                    {errors.tarih && <p className="mt-1 text-xs text-red-500">{errors.tarih.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teslim Tarihi</label>
                    <input
                      type="date"
                      {...register('teslim_tarihi')}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alt Müşteri</label>
                  <input
                    type="text"
                    {...register('alt_musteri')}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nihai / alt müşteri adı (isteğe bağlı)..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
                  <textarea
                    {...register('notlar')}
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="İsteğe bağlı not..."
                  />
                </div>
              </div>
            )}

            {/* ── ADIM 2: Cam Listesi ── */}
            {adim === 2 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-700">Cam Listesi</h3>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-full">
                      {fields.length} satır
                    </span>
                    {errors.camlar?.root && (
                      <span className="text-xs text-red-500">{errors.camlar.root.message}</span>
                    )}
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="overflow-y-auto" style={{ maxHeight: 'calc(95vh - 280px)' }}>
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                          <th className="px-2 py-2 text-center text-gray-300 w-7">#</th>
                          <th className="px-2 py-2">Poz</th>
                          <th className="px-2 py-2">Kalınlık *</th>
                          <th className="px-2 py-2">Cam Cinsi *</th>
                          <th className="px-2 py-2">Gen. (mm)</th>
                          <th className="px-2 py-2">Yük. (mm)</th>
                          <th className="px-2 py-2">Adet</th>
                          <th className="px-2 py-2">Boşluk</th>
                          <th className="px-2 py-2 w-[210px]">Özellikler</th>
                          <th className="px-2 py-2 w-6"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, index) => (
                          <tr key={field.id} className={cn(
                            'border-b border-gray-100 last:border-0',
                            index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                          )}>
                            <td className="px-2 py-1.5 text-center text-[10px] text-gray-300 font-mono">{index + 1}</td>
                            <td className="px-1.5 py-1.5">
                              <input
                                type="text"
                                {...register(`camlar.${index}.poz`)}
                                data-row={index}
                                data-field="poz"
                                onKeyDown={e => handlePozEnter(e, index)}
                                onFocus={e => e.currentTarget.select()}
                                className="w-14 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="K1"
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              {(() => {
                                const cur = stokById(watchedCamlar?.[index]?.stok_id)
                                const curK = cur?.kalinlik_mm ?? ''
                                return (
                                  <select
                                    value={curK === '' ? '' : String(curK)}
                                    onChange={(e) => {
                                      const k = e.target.value ? Number(e.target.value) : null
                                      const tip = cur ? camTipiAd(cur.ad) : null
                                      const yeni = stokFromKalinlikTip(k, tip) ?? (k != null ? stokFromKalinlikTip(k, null) : undefined)
                                      setValue(`camlar.${index}.stok_id`, yeni?.id ?? '')
                                    }}
                                    className={cn(
                                      'w-16 rounded border px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
                                      errors.camlar?.[index]?.stok_id ? 'border-red-300' : 'border-gray-200'
                                    )}
                                  >
                                    <option value="">—</option>
                                    {benzersizKalinliklar.map(k => (
                                      <option key={k} value={k}>{k}mm</option>
                                    ))}
                                  </select>
                                )
                              })()}
                            </td>
                            <td className="px-1.5 py-1.5">
                              {(() => {
                                const cur = stokById(watchedCamlar?.[index]?.stok_id)
                                const curTip = cur ? camTipiAd(cur.ad) : ''
                                return (
                                  <select
                                    value={curTip}
                                    onChange={(e) => {
                                      const tip = e.target.value || null
                                      const k = cur?.kalinlik_mm ?? null
                                      const yeni = stokFromKalinlikTip(k, tip) ?? (tip != null ? stokFromKalinlikTip(null, tip) : undefined)
                                      setValue(`camlar.${index}.stok_id`, yeni?.id ?? '')
                                    }}
                                    className={cn(
                                      'w-32 rounded border px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
                                      errors.camlar?.[index]?.stok_id ? 'border-red-300' : 'border-gray-200'
                                    )}
                                  >
                                    <option value="">Seçiniz...</option>
                                    {benzersizTipler.map(t => (
                                      <option key={t} value={t}>{t}</option>
                                    ))}
                                  </select>
                                )
                              })()}
                              <input type="hidden" {...register(`camlar.${index}.stok_id`)} />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <input
                                type="number"
                                {...register(`camlar.${index}.genislik_mm`)}
                                data-row={index}
                                data-field="genislik_mm"
                                onKeyDown={e => handleEnterNav(e, index, 'genislik_mm')}
                                onFocus={e => e.currentTarget.select()}
                                className={cn(
                                  'w-20 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                                  errors.camlar?.[index]?.genislik_mm ? 'border-red-300' : 'border-gray-200'
                                )}
                                placeholder="0"
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <input
                                type="number"
                                {...register(`camlar.${index}.yukseklik_mm`)}
                                data-row={index}
                                data-field="yukseklik_mm"
                                onKeyDown={e => handleEnterNav(e, index, 'yukseklik_mm')}
                                onFocus={e => e.currentTarget.select()}
                                className={cn(
                                  'w-20 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                                  errors.camlar?.[index]?.yukseklik_mm ? 'border-red-300' : 'border-gray-200'
                                )}
                                placeholder="0"
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <input
                                type="number"
                                {...register(`camlar.${index}.adet`)}
                                data-row={index}
                                data-field="adet"
                                onKeyDown={e => handleEnterNav(e, index, 'adet')}
                                onFocus={e => e.currentTarget.select()}
                                className={cn(
                                  'w-14 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                                  errors.camlar?.[index]?.adet ? 'border-red-300' : 'border-gray-200'
                                )}
                                placeholder="1"
                                min={1}
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <select
                                {...register(`camlar.${index}.ara_bosluk_mm`)}
                                className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                            <td className="px-1.5 py-1.5 w-[210px]">
                              <div className="flex flex-wrap gap-1 items-center" style={{ maxWidth: '200px' }}>
                                {NOT_ETIKETLERI.map(tag => (
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
                                <button
                                  type="button"
                                  onClick={() => toggleGenislet(index)}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-gray-200 bg-white text-gray-400 hover:border-blue-300 hover:text-blue-600 transition-colors flex items-center gap-0.5"
                                >
                                  {genisletilmis.has(index)
                                    ? <><ChevronUp size={9} /> Az</>
                                    : <><ChevronDown size={9} /> Kenar</>}
                                </button>
                                {genisletilmis.has(index) && KENAR_ISLEMLERI.map(tag => (
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
                                <input type="hidden" {...register(`camlar.${index}.kenar_islemi`)} />
                                <input type="hidden" {...register(`camlar.${index}.notlar`)} />
                              </div>
                            </td>
                            <td className="px-1.5 py-1.5">
                              <button
                                type="button"
                                onClick={() => remove(index)}
                                disabled={fields.length <= 1}
                                className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                  <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">Enter</kbd> ile Gen → Yük → Adet → bir sonraki satır şeklinde ilerler.
                  {' '}Poz sütununda seçiliyken <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">Enter</kbd> aşağıdaki Poz'a geçer.
                  {' '}Poz numaralarını tüm ölçüler girildikten sonra toplu girmek tavsiye edilir.
                </p>
              </div>
            )}

            {/* ── ADIM 3: Sevkiyat / Teslim ── */}
            {adim === 3 && (
              <div className="space-y-5">
                <p className="text-sm text-gray-500">Bu sipariş nasıl teslim edilecek?</p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTeslimatTipi('teslim_alacak'); setValue('teslimat_tipi', 'teslim_alacak') }}
                    className={cn(
                      'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all',
                      teslimatTipi === 'teslim_alacak'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                  >
                    <PackageCheck size={30} className={teslimatTipi === 'teslim_alacak' ? 'text-blue-600' : 'text-gray-400'} />
                    <div className="text-center">
                      <div className={cn('text-sm font-semibold', teslimatTipi === 'teslim_alacak' ? 'text-blue-700' : 'text-gray-600')}>
                        Teslim Alacak
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">Müşteri gelip alacak</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTeslimatTipi('sevkiyat'); setValue('teslimat_tipi', 'sevkiyat') }}
                    className={cn(
                      'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all',
                      teslimatTipi === 'sevkiyat'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                  >
                    <Truck size={30} className={teslimatTipi === 'sevkiyat' ? 'text-blue-600' : 'text-gray-400'} />
                    <div className="text-center">
                      <div className={cn('text-sm font-semibold', teslimatTipi === 'sevkiyat' ? 'text-blue-700' : 'text-gray-600')}>
                        Sevkiyat
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">Araçla teslim edilecek</div>
                    </div>
                  </button>
                </div>

                {teslimatTipi === 'sevkiyat' && (
                  <div className={cn(
                    'rounded-xl border-2 p-4 transition-all',
                    !watchedTeslimTarihi ? 'border-orange-300 bg-orange-50' : 'border-green-200 bg-green-50'
                  )}>
                    {!watchedTeslimTarihi && (
                      <div className="flex items-center gap-2 text-orange-700 mb-3">
                        <AlertTriangle size={15} className="shrink-0" />
                        <span className="text-sm font-medium">Sevkiyat için teslim tarihi gereklidir</span>
                      </div>
                    )}
                    <label className={cn(
                      'block text-xs font-medium mb-1',
                      !watchedTeslimTarihi ? 'text-orange-700' : 'text-green-700'
                    )}>
                      Teslim Tarihi *
                    </label>
                    <input
                      type="date"
                      {...register('teslim_tarihi')}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
                        !watchedTeslimTarihi
                          ? 'border-orange-300 focus:ring-orange-400'
                          : 'border-green-300 focus:ring-green-400'
                      )}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Alt Butonlar */}
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            {sunucuHata && (
              <p className="mb-3 text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{sunucuHata}</p>
            )}
            <div className="flex items-center justify-between">
              <div>
                {adim > 1 && (
                  <button
                    type="button"
                    onClick={geriDon}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    <ChevronLeft size={15} /> Geri
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onKapat}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  İptal
                </button>
                {adim < 3 ? (
                  <button
                    type="button"
                    onClick={ilerle}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                  >
                    İleri <ChevronRight size={15} />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit(onSubmit as any)}
                    disabled={kaydediliyor}
                    className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {kaydediliyor ? 'Kaydediliyor...' : 'Siparişi Kaydet'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

