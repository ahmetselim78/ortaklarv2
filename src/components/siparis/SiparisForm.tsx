import { useState } from 'react'
import { useForm, useFieldArray, useWatch, Controller, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Trash2, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Truck, PackageCheck, AlertTriangle, Plus } from 'lucide-react'
import type { Cari } from '@/types/cari'
import type { Stok } from '@/types/stok'
import type { YeniSiparisForm } from '@/types/siparis'
import type { SiparisTaslakCam, SiparisTaslakVerisi } from '@/types/taslak'
import type { EkleIlerleme } from '@/hooks/useSiparis'
import type { FiyatHesapSonucu, FiyatOnizlemesi, TicariMod } from '@/types/ticari'
import { cn } from '@/lib/utils'
import { useEscape } from '@/hooks/useEscape'
import CamStokPicker from '@/components/siparis/CamStokPicker'
import FiyatGrupOzeti from '@/components/ticari/FiyatGrupOzeti'
import { aktifCitaStoklari, citaEslestir, getAraBoslukMm } from '@/lib/cam'
import { ticariBugun } from '@/lib/ticariFormat'
import { TicariRpcError } from '@/services/ticariService'

const KENAR_ISLEMLERI = ['Rodaj', 'Bizote'] as const
const NOT_ETIKETLERI = ['Menfez'] as const

const ticariSayiSchema = z.union([z.literal(''), z.coerce.number().finite()]).optional()

const camSchema = z.object({
  detay_id: z.string().optional(),
  stok_id: z.string().min(1, 'Cam cinsi seçiniz'),
  cita_stok_id: z.string().optional(),
  genislik_mm: z.coerce.number().positive('Pozitif olmalı'),
  yukseklik_mm: z.coerce.number().positive('Pozitif olmalı'),
  adet: z.coerce.number().int().min(1, 'En az 1'),
  kenar_islemi: z.string().optional(),
  notlar: z.string().optional(),
  poz: z.string().optional(),
  menfez_cap_mm: ticariSayiSchema,
  kucuk_cam: z.boolean().optional(),
  satir_iskonto_yuzdesi: ticariSayiSchema,
  satir_iskonto_tutari: ticariSayiSchema,
  kenar_islemi_ucretsiz: z.boolean().optional(),
  menfez_ucretsiz: z.boolean().optional(),
  kucuk_cam_ucretsiz: z.boolean().optional(),
})

const schema = z.object({
  para_birimi: z.enum(['TRY', 'USD', 'EUR']).optional(),
  harici_siparis_no: z.string().optional(),
  kaynak: z.enum(['pdf', 'manuel']).optional(),
  belge_iskonto_yuzdesi: ticariSayiSchema,
  belge_iskonto_tutari: ticariSayiSchema,
  manuel_fiyat_farki: ticariSayiSchema,
  manuel_yuvarlama_farki: ticariSayiSchema,
  nakliye_satis_override: ticariSayiSchema,
  nakliye_maliyet_override: ticariSayiSchema,
  vade_gunu: ticariSayiSchema,
  cari_id: z.string().min(1, 'Müşteri seçiniz'),
  tarih: z.string().min(1, 'Tarih zorunludur'),
  teslim_tarihi: z.string().optional(),
  alt_musteri: z.string().optional(),
  notlar: z.string().optional(),
  teslimat_tipi: z.string().optional(),
  ticari_mudahale_gerekcesi: z.string().optional(),
  dusuk_marj_gerekcesi: z.string().optional(),
  camlar: z.array(camSchema).min(1, 'En az 1 cam parçası eklenmelidir'),
})

type FormGirdi = z.input<typeof schema>
type FormVeri = z.output<typeof schema>

interface Props {
  cariler: Cari[]
  stoklar: Stok[]
  onKaydet: (veri: FormVeri, onizleme?: FiyatOnizlemesi | null) => Promise<unknown>
  onFiyatOnizle?: (veri: FormVeri) => Promise<FiyatOnizlemesi>
  ticariMod?: TicariMod | null
  onKapat: () => void
  /** Taslaktan devam ediliyorsa başlangıç verisi */
  initialTaslak?: SiparisTaslakVerisi
  /**
   * Modal kapatılırken çağrılır. Form verisi parent'a iletilir; parent
   * (SiparisPage) verinin boş olup olmadığını kontrol edip localStorage'a yazar.
   * Döndürülmezse default davranışa düşer (sadece onKapat).
   */
  onTaslakKaydet?: (veri: SiparisTaslakVerisi) => void
  /** Büyük siparişlerde (300+ satır) parçalı ekleme ilerlemesi (opsiyonel gösterge). */
  ekleIlerleme?: EkleIlerleme | null
  /** Fiyatlı sipariş revizyonunda mevcut snapshot'tan hazırlanan başlangıç verisi. */
  initialVeri?: YeniSiparisForm
  /** Verildiğinde form yeni sipariş yerine fiyat revizyonu olarak çalışır. */
  revizyonTuru?: 'teknik' | 'ticari'
  /** Kullanıcıya gösterilen mevcut fiyat revizyon numarası. */
  fiyatRevizyonNo?: number
}

const BOŞ_CAM = {
  detay_id: '',
  stok_id: '',
  cita_stok_id: '',
  genislik_mm: '' as unknown as number,
  yukseklik_mm: '' as unknown as number,
  adet: 1,
  kenar_islemi: '',
  notlar: '',
  poz: '',
  menfez_cap_mm: '' as unknown as number,
  kucuk_cam: false,
  satir_iskonto_yuzdesi: '' as unknown as number,
  satir_iskonto_tutari: '' as unknown as number,
  kenar_islemi_ucretsiz: false,
  menfez_ucretsiz: false,
  kucuk_cam_ucretsiz: false,
}

function taslakDegeri(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

export default function SiparisForm({
  cariler,
  stoklar,
  onKaydet,
  onFiyatOnizle,
  ticariMod,
  onKapat,
  initialTaslak,
  onTaslakKaydet,
  ekleIlerleme,
  initialVeri,
  revizyonTuru,
  fiyatRevizyonNo,
}: Props) {
  const [adim, setAdim] = useState<1 | 2 | 3 | 4>(1)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [onizleniyor, setOnizleniyor] = useState(false)
  const [fiyatOnizleme, setFiyatOnizleme] = useState<FiyatOnizlemesi | null>(null)
  const [fiyatCakismasi, setFiyatCakismasi] = useState<{
    onceki: FiyatHesapSonucu
    yeni: FiyatHesapSonucu
    degisenKaynaklar: string[]
  } | null>(null)
  const [sunucuHata, setSunucuHata] = useState<string | null>(null)
  const [genisletilmis, setGenisletilmis] = useState<Set<number>>(new Set())
  // Form başarıyla kaydedildi mi? (taslak kaydını atlamak için)
  const [basariliKayit, setBasariliKayit] = useState(false)

  // Adım 3 state
  const [teslimatTipi, setTeslimatTipi] = useState<'teslim_alacak' | 'sevkiyat'>(
    initialVeri?.teslimat_tipi === 'sevkiyat' ? 'sevkiyat' : 'teslim_alacak',
  )
  const revizyonMu = revizyonTuru != null
  const teknikAlanlarKilitli = revizyonTuru === 'ticari'
  const ticariAlanlarKilitli = revizyonTuru === 'teknik'

  const toggleGenislet = (idx: number) => {
    setGenisletilmis(prev => {
      const s = new Set(prev)
      if (s.has(idx)) {
        s.delete(idx)
      } else {
        s.add(idx)
      }
      return s
    })
  }

  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<FormGirdi, unknown, FormVeri>({
    resolver: zodResolver(schema),
    defaultValues: {
      tarih: initialVeri?.tarih || initialTaslak?.tarih || ticariBugun(),
      cari_id: initialVeri?.cari_id ?? initialTaslak?.cari_id ?? '',
      para_birimi: initialVeri?.para_birimi,
      teslim_tarihi: initialVeri?.teslim_tarihi ?? initialTaslak?.teslim_tarihi ?? '',
      alt_musteri: initialVeri?.alt_musteri ?? initialTaslak?.alt_musteri ?? '',
      notlar: initialVeri?.notlar ?? initialTaslak?.notlar ?? '',
      harici_siparis_no: initialVeri?.harici_siparis_no ?? '',
      kaynak: initialVeri?.kaynak ?? 'manuel',
      teslimat_tipi: initialVeri?.teslimat_tipi ?? initialTaslak?.teslimat_tipi ?? 'teslim_alacak',
      ticari_mudahale_gerekcesi: initialVeri?.ticari_mudahale_gerekcesi ?? '',
      dusuk_marj_gerekcesi: initialVeri?.dusuk_marj_gerekcesi ?? '',
      belge_iskonto_yuzdesi: initialVeri?.belge_iskonto_yuzdesi ?? '',
      belge_iskonto_tutari: initialVeri?.belge_iskonto_tutari ?? '',
      manuel_fiyat_farki: initialVeri?.manuel_fiyat_farki ?? '',
      manuel_yuvarlama_farki: initialVeri?.manuel_yuvarlama_farki ?? '',
      nakliye_satis_override: initialVeri?.nakliye_satis_override ?? '',
      nakliye_maliyet_override: initialVeri?.nakliye_maliyet_override ?? '',
      vade_gunu: initialVeri?.vade_gunu ?? '',
      camlar: initialVeri?.camlar?.length
        ? initialVeri.camlar
        : initialTaslak?.camlar?.length ? initialTaslak.camlar : [{ ...BOŞ_CAM }],
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
      cita_stok_id: src?.cita_stok_id ?? '',
    })
  }

  const camSecildi = (index: number, stokId: string) => {
    setValue(`camlar.${index}.stok_id`, stokId)
    const stok = stoklar.find((s) => s.id === stokId)
    const mm = getAraBoslukMm(stok ?? null)
    if (mm == null) {
      setValue(`camlar.${index}.cita_stok_id`, '')
      return
    }
    const eslesme = citaEslestir(mm, aktifCitaStoklari(stoklar))
    setValue(`camlar.${index}.cita_stok_id`, eslesme?.id ?? '')
  }

  const satirEkle = () => {
    const yeniIdx = fields.length
    appendCam(yeniIdx > 0 ? yeniIdx - 1 : undefined)
    setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-row="${yeniIdx}"][data-field="genislik_mm"]`)?.focus()
    }, 60)
  }

  const genislikAlaninaGec = (rowIdx: number) => {
    document.querySelector<HTMLElement>(`[data-row="${rowIdx}"][data-field="genislik_mm"]`)?.focus()
  }

  const sonrakiSatirGenisligineGec = (rowIdx: number) => {
    const nextIdx = rowIdx + 1
    const existing = document.querySelector<HTMLElement>(`[data-row="${nextIdx}"][data-field="genislik_mm"]`)
    if (existing) {
      existing.focus()
      return
    }

    appendCam(rowIdx)
    setTimeout(() => genislikAlaninaGec(nextIdx), 60)
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
      sonrakiSatirGenisligineGec(rowIdx)
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
      const alanlar = fields.flatMap((_, i) => [
        `camlar.${i}.stok_id`,
        `camlar.${i}.genislik_mm`,
        `camlar.${i}.yukseklik_mm`,
        `camlar.${i}.adet`,
      ] as FieldPath<FormGirdi>[])
      const ok = await trigger(alanlar)
      if (ok) {
        setAdim(3)
      }
    }
  }

  const geriDon = () => {
    if (adim === 2) setAdim(1)
    else if (adim === 3) setAdim(2)
    else if (adim === 4) {
      setFiyatOnizleme(null)
      setFiyatCakismasi(null)
      setAdim(3)
    }
  }

  const kesinFiyatiHesapla = handleSubmit(async (veri) => {
    if (teslimatTipi === 'sevkiyat' && !veri.teslim_tarihi) {
      setSunucuHata('Sevkiyat seçildi ancak teslim tarihi girilmedi. Lütfen teslim tarihi belirleyiniz.')
      return
    }
    if (!onFiyatOnizle) {
      setSunucuHata('Kesin fiyat önizleme servisi kullanılamıyor.')
      return
    }
    setOnizleniyor(true)
    setSunucuHata(null)
    setFiyatCakismasi(null)
    try {
      const yeniOnizleme = await onFiyatOnizle(veri)
      setFiyatOnizleme(yeniOnizleme)
      setFiyatCakismasi(null)
      setAdim(4)
    } catch (e: unknown) {
      setFiyatOnizleme(null)
      setSunucuHata(e instanceof Error ? e.message : 'Kesin fiyat hesaplanamadı.')
    } finally {
      setOnizleniyor(false)
    }
  })

  const onSubmit = async (veri: FormVeri) => {
    if (teslimatTipi === 'sevkiyat' && !veri.teslim_tarihi) {
      setSunucuHata('Sevkiyat seçildi ancak teslim tarihi girilmedi. Lütfen teslim tarihi belirleyiniz.')
      return
    }
    setKaydediliyor(true)
    setSunucuHata(null)
    try {
      if (ticariMod === 'aktif' && (!fiyatOnizleme || !fiyatOnizleme.sonuc.gecerli)) {
        throw new Error('Sipariş, geçerli ve kullanıcı tarafından incelenmiş kesin fiyat önizlemesi olmadan kaydedilemez.')
      }
      await onKaydet(veri, fiyatOnizleme)
      setBasariliKayit(true)
      onKapat()
    } catch (e: unknown) {
      const mesaj = e instanceof Error ? e.message : 'Bir hata oluştu'
      if (
        e instanceof TicariRpcError
        && e.kod === 'FIYAT_ONIZLEME_CAKISMASI'
        && fiyatOnizleme
        && e.detay?.yeni_sonuc
        && typeof e.detay.yeni_sonuc === 'object'
      ) {
        setFiyatCakismasi({
          onceki: fiyatOnizleme.sonuc,
          yeni: e.detay.yeni_sonuc as unknown as FiyatHesapSonucu,
          degisenKaynaklar: Array.isArray(e.detay.degisen_kaynaklar)
            ? e.detay.degisen_kaynaklar.map(String)
            : [],
        })
      }
      if (/FIYAT_ONIZLEME|önizleme|Fiyatlandırma verileri/i.test(mesaj)) setFiyatOnizleme(null)
      setSunucuHata(mesaj)
    } finally {
      setKaydediliyor(false)
    }
  }

  /** Modal kapatılmadan önce mevcut form verisini taslak olarak parent'a iletir. */
  const kapat = () => {
    if (!basariliKayit && onTaslakKaydet) {
      try {
        const v = getValues()
        const taslakCamlar: SiparisTaslakCam[] = (v.camlar ?? []).map((cam) => ({
          stok_id: cam.stok_id,
          cita_stok_id: cam.cita_stok_id,
          genislik_mm: taslakDegeri(cam.genislik_mm),
          yukseklik_mm: taslakDegeri(cam.yukseklik_mm),
          adet: taslakDegeri(cam.adet),
          kenar_islemi: cam.kenar_islemi,
          notlar: cam.notlar,
          poz: cam.poz,
        }))
        onTaslakKaydet({
          cari_id: v.cari_id,
          tarih: v.tarih,
          teslim_tarihi: v.teslim_tarihi,
          alt_musteri: v.alt_musteri,
          notlar: v.notlar,
          teslimat_tipi: v.teslimat_tipi,
          camlar: taslakCamlar,
        })
      } catch {
        // veri okunamazsa sessizce geç
      }
    }
    onKapat()
  }
  useEscape(kapat, !kaydediliyor)

  const camStoklar = stoklar.filter(s => s.kategori === 'cam' && s.aktif !== false)

  const ADIMLAR = [
    { no: 1, etiket: 'Müşteri Bilgileri' },
    { no: 2, etiket: 'Cam Listesi' },
    { no: 3, etiket: 'Sevkiyat' },
    ...(ticariMod === 'aktif' ? [{ no: 4, etiket: 'Fiyat Onayı' }] : []),
  ]

  const camListesiModu = adim === 2

  return (
    <div className={cn(
      'fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 ease-out',
      camListesiModu ? 'pt-2 pb-28 transition-[padding] duration-300' : 'py-4',
    )}>
      <div className={cn(
        'w-full bg-white rounded-2xl shadow-xl flex flex-col transition-all duration-300 ease-out',
        camListesiModu
          ? 'max-w-5xl max-h-[min(92vh,calc(100vh-8rem))] -translate-y-14'
          : 'max-w-lg max-h-[90vh] translate-y-0',
      )}>
        {/* Başlık + Adım göstergesi */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              {revizyonMu
                ? `${revizyonTuru === 'teknik' ? 'Teknik' : 'Ticari'} Fiyat Revizyonu · R${String((fiyatRevizyonNo ?? 0) + 1).padStart(2, '0')}`
                : 'Yeni Sipariş'}
            </h2>
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
          <button onClick={kapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 ml-4 shrink-0">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="hidden" />
        <input type="hidden" {...register('para_birimi')} />
        <input type="hidden" {...register('harici_siparis_no')} />
        <input type="hidden" {...register('kaynak')} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* ── ADIM 1: Müşteri Bilgileri ── */}
            {adim === 1 && (
              <div className="space-y-4">
                {revizyonMu && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    Müşteri, sipariş tarihi ve belge para birimi fiyatlı siparişte değiştirilemez.
                    {revizyonTuru === 'teknik'
                      ? ' Bu akışta ölçü, adet, stok ve teknik işlemleri değiştirebilirsiniz.'
                      : ' Bu akışta iskonto, vade, nakliye ve manuel fiyat müdahalelerini değiştirebilirsiniz.'}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri *</label>
                  <select
                    {...register('cari_id')}
                    disabled={revizyonMu}
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
                      disabled={revizyonMu}
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
                  <div className="overflow-y-auto" style={{ maxHeight: 'min(52vh, calc(100vh - 22rem))' }}>
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                          <th className="px-2 py-2 text-center text-gray-300 w-7">#</th>
                          <th className="px-2 py-2">Poz</th>
                          <th className="px-2 py-2">Cam Cinsi / Stok *</th>
                          <th className="px-2 py-2">Gen. (mm)</th>
                          <th className="px-2 py-2">Yük. (mm)</th>
                          <th className="px-2 py-2">Adet</th>
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
                                disabled={teknikAlanlarKilitli}
                                data-row={index}
                                data-field="poz"
                                onKeyDown={e => handlePozEnter(e, index)}
                                onFocus={e => e.currentTarget.select()}
                                className="w-14 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="K1"
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <Controller
                                name={`camlar.${index}.stok_id`}
                                control={control}
                                render={({ field }) => (
                                  <CamStokPicker
                                    stoklar={camStoklar}
                                    value={field.value ?? ''}
                                    onChange={(id) => camSecildi(index, id)}
                                    onSelectedEnter={() => genislikAlaninaGec(index)}
                                    invalid={!!errors.camlar?.[index]?.stok_id}
                                    disabled={teknikAlanlarKilitli}
                                  />
                                )}
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <input
                                type="number"
                                {...register(`camlar.${index}.genislik_mm`)}
                                disabled={teknikAlanlarKilitli}
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
                                disabled={teknikAlanlarKilitli}
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
                                disabled={teknikAlanlarKilitli}
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
                            <td className="px-1.5 py-1.5 w-[210px]">
                              <div className="flex flex-wrap gap-1 items-center" style={{ maxWidth: '200px' }}>
                                {NOT_ETIKETLERI.map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    disabled={teknikAlanlarKilitli}
                                    onClick={() => toggleTag(index, 'notlar', tag)}
                                    onKeyDown={e => {
                                      if (e.key !== 'Enter') return
                                      e.preventDefault()
                                      sonrakiSatirGenisligineGec(index)
                                    }}
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
                                    : <><ChevronDown size={9} /> Detay / iskonto</>}
                                </button>
                                {genisletilmis.has(index) && KENAR_ISLEMLERI.map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    disabled={teknikAlanlarKilitli}
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
                                <input type="hidden" {...register(`camlar.${index}.detay_id`)} />
                                {genisletilmis.has(index) && (
                                  <div className="mt-2 grid w-full min-w-[310px] grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                                    <label className="text-[10px] text-gray-600">
                                      Menfez çapı (mm)
                                      <input
                                        type="number"
                                        min={0}
                                        {...register(`camlar.${index}.menfez_cap_mm`)}
                                        disabled={teknikAlanlarKilitli}
                                        className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs disabled:bg-gray-100"
                                      />
                                    </label>
                                    <label className="flex items-center gap-1.5 self-end rounded border border-gray-200 bg-white px-2 py-1 text-[10px] text-gray-600">
                                      <input
                                        type="checkbox"
                                        {...register(`camlar.${index}.kucuk_cam`)}
                                        disabled={teknikAlanlarKilitli}
                                      />
                                      Küçük cam
                                    </label>
                                    <label className="text-[10px] text-gray-600">
                                      Satır iskonto %
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step="0.01"
                                        {...register(`camlar.${index}.satir_iskonto_yuzdesi`, {
                                          onChange: (event) => {
                                            if (event.target.value !== '') {
                                              setValue(`camlar.${index}.satir_iskonto_tutari`, '')
                                            }
                                            setFiyatOnizleme(null)
                                          },
                                        })}
                                        disabled={ticariAlanlarKilitli}
                                        className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs disabled:bg-gray-100"
                                      />
                                    </label>
                                    <label className="text-[10px] text-gray-600">
                                      Satır iskonto tutarı
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        {...register(`camlar.${index}.satir_iskonto_tutari`, {
                                          onChange: (event) => {
                                            if (event.target.value !== '') {
                                              setValue(`camlar.${index}.satir_iskonto_yuzdesi`, '')
                                            }
                                            setFiyatOnizleme(null)
                                          },
                                        })}
                                        disabled={ticariAlanlarKilitli}
                                        className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs disabled:bg-gray-100"
                                      />
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[10px] text-gray-600">
                                      <input
                                        type="checkbox"
                                        {...register(`camlar.${index}.kenar_islemi_ucretsiz`)}
                                        disabled={ticariAlanlarKilitli}
                                      />
                                      Kenar işlemi ücretsiz
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[10px] text-gray-600">
                                      <input
                                        type="checkbox"
                                        {...register(`camlar.${index}.menfez_ucretsiz`)}
                                        disabled={ticariAlanlarKilitli}
                                      />
                                      Menfez ücretsiz
                                    </label>
                                    <label className="col-span-2 flex items-center gap-1.5 text-[10px] text-gray-600">
                                      <input
                                        type="checkbox"
                                        {...register(`camlar.${index}.kucuk_cam_ucretsiz`)}
                                        disabled={ticariAlanlarKilitli}
                                      />
                                      Küçük cam ek bedeli ücretsiz
                                    </label>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-1.5 py-1.5">
                              <button
                                type="button"
                                onClick={() => remove(index)}
                                disabled={fields.length <= 1 || teknikAlanlarKilitli}
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
                  <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{fields.length} cam parçası</span>
                    <button
                      type="button"
                      onClick={satirEkle}
                      disabled={teknikAlanlarKilitli}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus size={13} />
                      Satır Ekle
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                  Cam stoğu için arama kutusunu kullanın veya grup filtresiyle daraltın.
                  {' '}<kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">Enter</kbd> ile Gen → Yük → Adet → bir sonraki satır şeklinde ilerler.
                  {' '}Poz sütununda seçiliyken <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">Enter</kbd> aşağıdaki Poz'a geçer.
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

            {/* ── ADIM 4: PostgreSQL kesin fiyat önizlemesi ── */}
            {adim === 4 && (
              <div className="space-y-4">
                <div className={cn(
                  'rounded-xl border p-4',
                  fiyatOnizleme?.sonuc.gecerli
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50',
                )}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">Kesin fiyat önizlemesi</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        Bu tutar PostgreSQL hesap motorundan geldi. Kaydetme sırasında fiyat bağlamı yeniden doğrulanır.
                      </p>
                    </div>
                    {fiyatOnizleme?.sonuc.gecerli && (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                        Kayda hazır
                      </span>
                    )}
                  </div>

                  {fiyatOnizleme ? (
                    <>
                      <div className="mt-4">
                        <FiyatGrupOzeti sonuc={fiyatOnizleme.sonuc} />
                      </div>

                      {!fiyatOnizleme.sonuc.gecerli && (
                        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                          <div className="text-xs font-semibold text-red-700">Kayıt engelleri</div>
                          <ul className="mt-2 space-y-1 text-xs text-red-700">
                            {fiyatOnizleme.sonuc.hatalar.map((hata, index) => (
                              <li key={`${hata.kod}-${hata.satir_no ?? 0}-${index}`}>
                                {hata.satir_no ? `${hata.satir_no}. satır: ` : ''}{hata.kod.replaceAll('_', ' ')}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : fiyatCakismasi ? (
                    <div className="mt-4 space-y-3 rounded-lg border border-red-200 bg-red-50 p-3">
                      <div>
                        <p className="text-xs font-semibold text-red-800">
                          Fiyatlandırma verileri önizlemeden sonra değişti
                        </p>
                        <p className="mt-1 text-xs text-red-700">
                          Yeni toplamı inceleyin. “Fiyatı Yenile” ile yeni hash’li önizleme alınmadan kayıt yapılmaz.
                        </p>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div className="rounded-lg bg-white p-3">
                          <div className="text-[11px] text-gray-500">Önceki onay</div>
                          <div className="mt-1 font-semibold text-gray-800">
                            {Number(fiyatCakismasi.onceki.genel_toplam).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            {' '}{fiyatCakismasi.onceki.para_birimi}
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-red-400" />
                        <div className="rounded-lg bg-white p-3 ring-1 ring-red-200">
                          <div className="text-[11px] text-red-600">Sunucudaki yeni toplam</div>
                          <div className="mt-1 font-bold text-red-800">
                            {Number(fiyatCakismasi.yeni.genel_toplam).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            {' '}{fiyatCakismasi.yeni.para_birimi}
                          </div>
                        </div>
                      </div>
                      {fiyatCakismasi.degisenKaynaklar.length > 0 && (
                        <p className="break-words text-[11px] text-red-600">
                          Değişen kaynaklar: {fiyatCakismasi.degisenKaynaklar.join(', ')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-lg bg-white/80 p-3 text-xs text-amber-700">
                      Form veya gerekçe değişti. Güncel kesin fiyatı yeniden hesaplayın.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ticari müdahale / düşük marj gerekçesi
                  </label>
                  <textarea
                    {...register('ticari_mudahale_gerekcesi', {
                      onChange: (event) => {
                        setValue('dusuk_marj_gerekcesi', event.target.value)
                        setFiyatOnizleme(null)
                        setFiyatCakismasi(null)
                      },
                    })}
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="İskonto, manuel fark veya düşük marj varsa gerekçeyi yazın..."
                  />
                  <input
                    type="hidden"
                    {...register('dusuk_marj_gerekcesi')}
                  />
                </div>
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
                  onClick={kapat}
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
                ) : adim === 3 && ticariMod === 'aktif' ? (
                  <button
                    type="button"
                    onClick={kesinFiyatiHesapla}
                    disabled={onizleniyor}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {onizleniyor ? 'Liste fiyatı hesaplanıyor...' : 'Liste Fiyatını Hesapla'}
                    {!onizleniyor && <ChevronRight size={15} />}
                  </button>
                ) : adim === 4 ? (
                  <>
                    <button
                      type="button"
                      onClick={kesinFiyatiHesapla}
                      disabled={onizleniyor}
                      className="px-4 py-2 text-sm rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {onizleniyor ? 'Hesaplanıyor...' : 'Fiyatı Yenile'}
                    </button>
                    <button
                      onClick={handleSubmit(onSubmit)}
                      disabled={kaydediliyor || !fiyatOnizleme?.sonuc.gecerli}
                      className="px-5 py-2 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {kaydediliyor ? 'Kaydediliyor...' : 'Fiyatı Onayla ve Kaydet'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleSubmit(onSubmit)}
                    disabled={kaydediliyor}
                    className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {kaydediliyor
                      ? (ekleIlerleme && ekleIlerleme.toplam > 300
                          ? `Kaydediliyor... (${ekleIlerleme.eklenen}/${ekleIlerleme.toplam})`
                          : 'Kaydediliyor...')
                      : 'Siparişi Kaydet'}
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

