import { useCallback, useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertCircle,
  Building2,
  Check,
  LoaderCircle,
  Mail,
  MapPin,
  NotebookPen,
  PackageCheck,
  Phone,
  Save,
  UserRound,
  X,
} from 'lucide-react'
import type { Cari } from '@/types/cari'
import { cn } from '@/lib/utils'
import { useEscape } from '@/hooks/useEscape'
import {
  TEDARIK_KAPSAMI_SECENEKLERI,
  tedarikKapsamiOzetMetni,
} from '@/lib/tedarikKapsami'

const schema = z.object({
  ad: z.string().min(1, 'Ad zorunludur'),
  tipi: z.enum(['musteri', 'tedarikci']),
  telefon: z.string().optional(),
  email: z.string().email('Geçersiz e-posta').optional().or(z.literal('')),
  adres: z.string().optional(),
  notlar: z.string().optional(),
  aktif: z.boolean(),
  tedarik_kapsamlari: z.array(z.enum([
    'cam',
    'cita',
    'yan_malzeme',
    'temper_hizmeti',
  ])),
  tedarikci_calisma_modeli: z.enum(['sisecam_portal', 'manuel_fiyat']),
}).superRefine((veri, ctx) => {
  if (veri.tipi === 'tedarikci' && veri.tedarik_kapsamlari.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['tedarik_kapsamlari'],
      message: 'Tedarikçinin sağladığı en az bir malzeme grubunu seçin',
    })
  }
})

type FormVeri = z.infer<typeof schema>

interface Props {
  duzenlenecek?: Cari | null
  onKaydet: (veri: FormVeri) => Promise<void>
  onKapat: () => void
}

const alanSinifi =
  'mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm shadow-slate-950/[0.02] outline-none transition placeholder:text-gray-400 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

function AlanHatasi({ id, mesaj }: { id: string; mesaj?: string }) {
  if (!mesaj) return null
  return (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
      <AlertCircle size={13} aria-hidden="true" />
      {mesaj}
    </p>
  )
}

export default function CariForm({ duzenlenecek, onKaydet, onKapat }: Props) {
  const baslikId = useId()
  const aciklamaId = useId()
  const formId = useId()
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [sunucuHata, setSunucuHata] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    watch,
    formState: { errors, isDirty, isSubmitted },
  } = useForm<FormVeri>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipi: 'musteri',
      aktif: true,
      tedarik_kapsamlari: [],
      tedarikci_calisma_modeli: 'manuel_fiyat',
    },
  })
  const tipi = watch('tipi')
  const aktif = watch('aktif')
  const tedarikKapsamlari = watch('tedarik_kapsamlari') ?? []

  const kapatmayiDene = useCallback(() => {
    if (kaydediliyor) return
    if (isDirty && !window.confirm('Kaydedilmemiş değişiklikler var. Yine de kapatmak istiyor musunuz?')) {
      return
    }
    onKapat()
  }, [isDirty, kaydediliyor, onKapat])

  useEscape(kapatmayiDene, !kaydediliyor)

  useEffect(() => {
    if (duzenlenecek) {
      reset({
        ad: duzenlenecek.ad,
        tipi: duzenlenecek.tipi,
        telefon: duzenlenecek.telefon ?? '',
        email: duzenlenecek.email ?? '',
        adres: duzenlenecek.adres ?? '',
        notlar: duzenlenecek.notlar ?? '',
        aktif: duzenlenecek.aktif !== false,
        tedarik_kapsamlari: duzenlenecek.tedarik_kapsamlari ?? [],
        tedarikci_calisma_modeli: duzenlenecek.tedarikci_calisma_modeli ?? 'manuel_fiyat',
      })
    } else {
      reset({
        tipi: 'musteri',
        ad: '',
        telefon: '',
        email: '',
        adres: '',
        notlar: '',
        aktif: true,
        tedarik_kapsamlari: [],
        tedarikci_calisma_modeli: 'manuel_fiyat',
      })
    }
    const focusAnimation = window.requestAnimationFrame(() => setFocus('ad'))
    return () => window.cancelAnimationFrame(focusAnimation)
  }, [duzenlenecek, reset, setFocus])

  useEffect(() => {
    const oncekiOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = oncekiOverflow
    }
  }, [])

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) kapatmayiDene()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={baslikId}
        aria-describedby={aciklamaId}
        className="flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl shadow-slate-950/20 sm:max-h-[92vh] sm:rounded-2xl"
      >
        <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
                {tipi === 'tedarikci'
                  ? <Building2 size={20} aria-hidden="true" />
                  : <UserRound size={20} aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <h2 id={baslikId} className="text-lg font-semibold text-gray-950">
                  {duzenlenecek ? 'Cari bilgilerini düzenle' : 'Yeni cari oluştur'}
                </h2>
                <p id={aciklamaId} className="mt-0.5 text-sm leading-5 text-gray-500">
                  {duzenlenecek
                    ? 'İletişim bilgilerini ve cari özelliklerini güncelleyin.'
                    : 'Müşteri veya tedarikçi kartının temel bilgilerini girin.'}
                </p>
                {duzenlenecek && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200">
                      {duzenlenecek.kod}
                    </span>
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold',
                      duzenlenecek.aktif !== false
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
                    )}>
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        duzenlenecek.aktif !== false ? 'bg-emerald-500' : 'bg-gray-400',
                      )} />
                      {duzenlenecek.aktif !== false ? 'Aktif' : 'Pasif'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={kapatmayiDene}
              disabled={kaydediliyor}
              aria-label="Pencereyi kapat"
              className="shrink-0 rounded-xl p-2 text-gray-400 transition hover:bg-white hover:text-gray-700 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        <form
          id={formId}
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 space-y-4 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-6"
        >
          {isSubmitted && Object.keys(errors).length > 0 && (
            <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Bazı bilgiler eksik veya hatalı.</p>
                <p className="mt-0.5 text-xs leading-5 text-red-600">Kırmızıyla işaretlenen alanları kontrol edin.</p>
              </div>
            </div>
          )}

          <fieldset className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-950/[0.02] sm:p-5">
            <legend className="px-1 text-sm font-semibold text-gray-900">Cari türü</legend>
            <p className="mt-0.5 text-xs leading-5 text-gray-500">
              {duzenlenecek
                ? 'Cari türü geçmiş satış ve satın alma ilişkilerini korumak için sabittir.'
                : 'Kartın uygulamadaki kullanım alanını belirler.'}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cari türü">
              {([
                {
                  deger: 'musteri',
                  etiket: 'Müşteri',
                  aciklama: 'Satış, teklif ve tahsilat işlemleri',
                  icon: UserRound,
                },
                {
                  deger: 'tedarikci',
                  etiket: 'Tedarikçi',
                  aciklama: 'Satın alma ve maliyet işlemleri',
                  icon: Building2,
                },
              ] as const).map((secenek) => {
                const Icon = secenek.icon
                const secili = tipi === secenek.deger
                return (
                  <label
                    key={secenek.deger}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition',
                      secili
                        ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-100'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                    )}
                  >
                    <input type="radio" value={secenek.deger} {...register('tipi')} disabled={Boolean(duzenlenecek)} className="sr-only" />
                    <span className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                      secili ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500',
                    )}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn(
                        'block text-sm font-semibold',
                        secili ? 'text-blue-900' : 'text-gray-800',
                      )}>
                        {secenek.etiket}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">{secenek.aciklama}</span>
                    </span>
                    <span className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                      secili ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white',
                    )}>
                      {secili && <Check size={13} strokeWidth={3} aria-hidden="true" />}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-950/[0.02] sm:p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <Building2 size={16} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Temel bilgiler</h3>
                <p className="text-xs text-gray-500">Cari kartını tanımlayan ana bilgi</p>
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor={`${formId}-ad`} className="text-sm font-medium text-gray-700">
                Ad / unvan <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={`${formId}-ad`}
                {...register('ad')}
                aria-invalid={Boolean(errors.ad)}
                aria-describedby={errors.ad ? `${formId}-ad-hata` : undefined}
                className={cn(
                  alanSinifi,
                  errors.ad && 'border-red-300 focus:border-red-500 focus:ring-red-100',
                )}
                placeholder={tipi === 'tedarikci' ? 'Örn: Anadolu Cam Sanayi A.Ş.' : 'Örn: Ahmet Cam Ltd.'}
                autoComplete="organization"
              />
              <AlanHatasi id={`${formId}-ad-hata`} mesaj={errors.ad?.message} />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-950/[0.02] sm:p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <Phone size={16} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">İletişim</h3>
                <p className="text-xs text-gray-500">Hızlı erişim için isteğe bağlı bilgiler</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${formId}-telefon`} className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Phone size={14} className="text-gray-400" aria-hidden="true" />
                  Telefon
                </label>
                <input
                  id={`${formId}-telefon`}
                  {...register('telefon')}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className={alanSinifi}
                  placeholder="0555 000 00 00"
                />
              </div>
              <div>
                <label htmlFor={`${formId}-email`} className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Mail size={14} className="text-gray-400" aria-hidden="true" />
                  E-posta
                </label>
                <input
                  id={`${formId}-email`}
                  {...register('email')}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? `${formId}-email-hata` : undefined}
                  className={cn(
                    alanSinifi,
                    errors.email && 'border-red-300 focus:border-red-500 focus:ring-red-100',
                  )}
                  placeholder="ornek@firma.com"
                />
                <AlanHatasi id={`${formId}-email-hata`} mesaj={errors.email?.message} />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor={`${formId}-adres`} className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <MapPin size={14} className="text-gray-400" aria-hidden="true" />
                Adres
              </label>
              <textarea
                id={`${formId}-adres`}
                {...register('adres')}
                rows={3}
                className={cn(alanSinifi, 'resize-y leading-6')}
                placeholder="Açık adres bilgisi"
                autoComplete="street-address"
              />
            </div>
          </section>

          {tipi === 'tedarikci' && (
            <>
            <fieldset className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-950/[0.02] sm:p-5">
              <legend className="sr-only">Tedarikçi çalışma şekli</legend>
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-700">
                  <Building2 size={16} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Çalışma şekli</h3>
                  <p className="text-xs text-gray-500">Sipariş ve fiyat girişinin nasıl yapılacağını belirler</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {([
                  {
                    deger: 'sisecam_portal',
                    etiket: 'Sirküler + portal siparişi',
                    aciklama: 'Şişecam tır siparişi, fatura ve vade takibi',
                  },
                  {
                    deger: 'manuel_fiyat',
                    etiket: 'Manuel ürün fiyatı',
                    aciklama: tedarikKapsamlari.length > 0
                      ? `${tedarikKapsamiOzetMetni(tedarikKapsamlari)} ürünleri için stok bazında fiyat girişi`
                      : 'Seçilecek ürün kapsamı için stok bazında fiyat girişi',
                  },
                ] as const).map((secenek) => (
                  <label key={secenek.deger} className="flex cursor-pointer gap-2.5 rounded-xl border border-gray-200 p-3 transition has-[:checked]:border-violet-400 has-[:checked]:bg-violet-50/70 has-[:checked]:ring-2 has-[:checked]:ring-violet-100">
                    <input
                      type="radio"
                      value={secenek.deger}
                      {...register('tedarikci_calisma_modeli')}
                      className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-800">{secenek.etiket}</span>
                      <span className="mt-0.5 block text-xs leading-4 text-gray-500">{secenek.aciklama}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className={cn(
              'rounded-2xl border bg-white p-4 shadow-sm shadow-slate-950/[0.02] sm:p-5',
              errors.tedarik_kapsamlari ? 'border-red-200' : 'border-gray-200',
            )}>
              <legend className="sr-only">Tedarik kapsamı</legend>
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
                  <PackageCheck size={16} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Tedarik kapsamı <span className="text-red-500" aria-hidden="true">*</span>
                  </h3>
                  <p className="text-xs text-gray-500">Bir veya birden fazla malzeme grubu seçin</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {TEDARIK_KAPSAMI_SECENEKLERI.map((secenek) => {
                  const secili = tedarikKapsamlari.includes(secenek.deger)
                  return (
                    <label
                      key={secenek.deger}
                      className={cn(
                        'relative flex cursor-pointer gap-2.5 rounded-xl border p-3 transition',
                        secili
                          ? 'border-blue-400 bg-blue-50/70 ring-2 ring-blue-100'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        value={secenek.deger}
                        {...register('tedarik_kapsamlari')}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-gray-800">{secenek.etiket}</span>
                        <span className="mt-0.5 block text-xs leading-4 text-gray-500">{secenek.aciklama}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              <AlanHatasi
                id={`${formId}-tedarik-hata`}
                mesaj={errors.tedarik_kapsamlari?.message}
              />
            </fieldset>
            </>
          )}

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-950/[0.02] sm:p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <NotebookPen size={16} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Notlar ve durum</h3>
                <p className="text-xs text-gray-500">Ekip içi bilgi ve kullanım durumu</p>
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor={`${formId}-notlar`} className="text-sm font-medium text-gray-700">Notlar</label>
              <textarea
                id={`${formId}-notlar`}
                {...register('notlar')}
                rows={3}
                className={cn(alanSinifi, 'resize-y leading-6')}
                placeholder="Bu cariyle ilgili ekip içi notlar"
              />
            </div>

            {tipi === 'musteri' ? (
              <label className={cn(
                'mt-4 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition',
                aktif
                  ? 'border-emerald-200 bg-emerald-50/70'
                  : 'border-gray-200 bg-gray-50',
              )}>
                <input
                  type="checkbox"
                  {...register('aktif')}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-800">
                    {aktif ? 'Aktif müşteri' : 'Pasif müşteri'}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-gray-500">
                    {aktif
                      ? 'Yeni teklif ve siparişlerde seçilebilir.'
                      : 'Yeni işlemlerde görünmez; geçmiş hareketleri korunur.'}
                  </span>
                </span>
                <span className={cn(
                  'mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full',
                  aktif ? 'bg-emerald-500' : 'bg-gray-400',
                )} />
              </label>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">
                  Durum: {aktif ? 'Aktif tedarikçi' : 'Pasif tedarikçi'}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-amber-800">
                  Tedarikçi durumunu, açık bağlantı ve fiyat kontrolleri nedeniyle Admin Paneli / Stok, Cari ve Maliyet alanından değiştirebilirsiniz.
                </p>
              </div>
            )}
          </section>

          {sunucuHata && (
            <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{sunucuHata}</span>
            </div>
          )}
        </form>

        <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.04)] sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="hidden text-xs text-gray-500 sm:block">
              {isDirty ? 'Kaydedilmemiş değişiklikler var' : 'Bilgiler güncel'}
            </p>
            <div className="ml-auto flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                onClick={kapatmayiDene}
                disabled={kaydediliyor}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                form={formId}
                disabled={kaydediliyor || (Boolean(duzenlenecek) && !isDirty)}
                className="inline-flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              >
                {kaydediliyor ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                    Kaydediliyor…
                  </>
                ) : (
                  <>
                    <Save size={16} aria-hidden="true" />
                    {duzenlenecek ? 'Değişiklikleri kaydet' : 'Cariyi oluştur'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
