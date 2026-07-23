import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, UserCheck, UserX, User, AlertCircle, Loader2, Upload, X, Factory } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { r2Upload, R2UploadHata } from '@/lib/r2Upload'
import type { HrPersonel, YeniPersonel } from '@/types/saatlikUretim'

// ── Validasyon şeması ─────────────────────────────────────────────────────────

const personelSchema = z.object({
  ad_soyad: z.string().min(2, 'En az 2 karakter giriniz'),
  foto_url: z
    .string()
    .refine(
      v => v === '' || /^https?:\/\/.+/.test(v),
      'Geçerli bir URL giriniz (http/https ile başlamalı)',
    ),
  rol: z.enum(['Direkt', 'Endirekt'], { message: 'Rol seciniz' }),
  is_aktif: z.boolean(),
  uretim_yetkileri_sinirli: z.boolean(),
})

type PersonelFormDegerleri = z.infer<typeof personelSchema>

interface YetkiIstasyonu {
  id: string
  ad: string
  sira_no: number
  aktif: boolean
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function PersonelAvatar({ foto_url, ad_soyad, boyut = 'md' }: {
  foto_url: string
  ad_soyad: string
  boyut?: 'sm' | 'md' | 'lg'
}) {
  const [hatali, setHatali] = useState(false)
  const boyutSinif = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' }[boyut]
  const initials = ad_soyad.split(' ').slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('')

  if (foto_url && !hatali) {
    return (
      <img
        src={foto_url}
        alt={ad_soyad}
        onError={() => setHatali(true)}
        crossOrigin="anonymous"
        className={`${boyutSinif} rounded-full object-cover shrink-0 border border-gray-200`}
      />
    )
  }
  return (
    <div className={`${boyutSinif} rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 text-gray-500 font-semibold`}>
      {initials || <User size={14} />}
    </div>
  )
}

// ── Fotoğraf Yükleme Alanı ────────────────────────────────────────────────────

interface FotoAlanıProps {
  deger: string
  onDegisim: (url: string) => void
  hata?: string
}

function FotoAlani({ deger, onDegisim, hata }: FotoAlanıProps) {
  const [yuklemeDurumu, setYuklemeDurumu] = useState<'bos' | 'yukleniyor' | 'tamam' | 'hata'>('bos')
  const [yuklemeyuzdesi, setYuklemeYuzdesi] = useState(0)
  const [yukleHata, setYukleHata] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // R2 kimlik bilgileri tarayıcıda tutulmaz; kullanılabilirlik Edge Function
  // tarafından JWT ve izin kontrolünden sonra belirlenir.
  const r2Aktif = true

  const dosyaSec = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dosya = e.target.files?.[0]
    if (!dosya) return

    setYuklemeDurumu('yukleniyor')
    setYukleHata(null)
    setYuklemeYuzdesi(0)

    try {
      const sonuc = await r2Upload(dosya, yuzde => setYuklemeYuzdesi(yuzde))
      onDegisim(sonuc.url)
      setYuklemeDurumu('tamam')
    } catch (err) {
      const mesaj = err instanceof R2UploadHata
        ? err.message
        : 'Yükleme sırasında bilinmeyen bir hata oluştu.'
      setYukleHata(mesaj)
      setYuklemeDurumu('hata')
    }
    // input'u temizle (aynı dosya tekrar seçilebilsin)
    if (inputRef.current) inputRef.current.value = ''
  }

  const temizle = () => {
    onDegisim('')
    setYuklemeDurumu('bos')
    setYukleHata(null)
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        Fotoğraf
        {!r2Aktif && (
          <span className="ml-1 text-amber-600 font-normal">(R2 yapılandırılmamış — URL girin)</span>
        )}
      </label>

      {/* Mevcut fotoğraf önizlemesi */}
      {deger && (
        <div className="flex items-center gap-2 mb-2">
          <img
            src={deger}
            alt="Önizleme"
            crossOrigin="anonymous"
            className="w-10 h-10 rounded-full object-cover border border-gray-200"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <span className="text-xs text-gray-500 truncate flex-1">{deger}</span>
          <button
            type="button"
            onClick={temizle}
            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* R2 aktifse dosya yükleme butonu */}
      {r2Aktif && (
        <div className="mb-2">
          <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm text-gray-500 hover:text-blue-600">
            <Upload size={14} />
            <span>
              {yuklemeDurumu === 'yukleniyor'
                ? `Yükleniyor… ${yuklemeyuzdesi}%`
                : 'Fotoğraf Seç (jpg, png, webp — max 5 MB)'}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={dosyaSec}
              disabled={yuklemeDurumu === 'yukleniyor'}
            />
          </label>

          {/* İlerleme çubuğu */}
          {yuklemeDurumu === 'yukleniyor' && (
            <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${yuklemeyuzdesi}%` }}
              />
            </div>
          )}

          {yukleHata && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={11} />
              {yukleHata}
            </p>
          )}
        </div>
      )}

      {/* Manuel URL girişi (her zaman görünür) */}
      <input
        type="text"
        value={deger}
        onChange={e => { onDegisim(e.target.value); setYuklemeDurumu('bos') }}
        placeholder={r2Aktif ? 'veya direkt URL giriniz…' : 'https://...'}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {hata && <p className="mt-1 text-xs text-red-600">{hata}</p>}
      <p className="mt-1 text-[11px] text-gray-400">
        {r2Aktif
          ? 'Dosya yükleyebilir veya manuel URL girebilirsiniz. İleride yüz tanıma API\'si ile otomatik doldurulacak.'
          : 'İleride yüz tanıma API\'si ile otomatik doldurulacak. R2 kurulumu için cloudflare-worker/upload-worker.js dosyasına bakın.'}
      </p>
    </div>
  )
}

// ── Ana Panel ─────────────────────────────────────────────────────────────────

export default function PersonelYonetimiPanel() {
  const [personeller, setPersoneller] = useState<HrPersonel[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediyor, setKaydediyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [silmeOnayId, setSilmeOnayId] = useState<string | null>(null)
  const [duzenlePersonel, setDuzenlePersonel] = useState<HrPersonel | null>(null)
  const [istasyonlar, setIstasyonlar] = useState<YetkiIstasyonu[]>([])
  const [yetkiliIstasyonIds, setYetkiliIstasyonIds] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PersonelFormDegerleri>({
    resolver: zodResolver(personelSchema),
    defaultValues: { ad_soyad: '', foto_url: '', rol: 'Direkt', is_aktif: true, uretim_yetkileri_sinirli: false },
  })

  const fotoUrl = watch('foto_url')
  const yetkiSinirli = watch('uretim_yetkileri_sinirli')

  // ── Veri getir ────────────────────────────────────────────────────────────
  const getir = useCallback(async () => {
    setYukleniyor(true)
    try {
      const [personelRes, istasyonRes] = await Promise.all([
        supabase
          .from('hr_personel')
          .select('id, ad_soyad, foto_url, rol, is_aktif, uretim_yetkileri_sinirli, hr_personel_istasyon_yetkileri(istasyon_id)')
          .order('ad_soyad'),
        supabase.from('uretim_istasyonlari').select('id, ad, sira_no, aktif').eq('aktif', true).order('sira_no'),
      ])
      if (personelRes.error) throw personelRes.error
      if (istasyonRes.error) throw istasyonRes.error
      const aktifIstasyonlar = (istasyonRes.data ?? []) as YetkiIstasyonu[]
      setPersoneller((personelRes.data ?? []) as HrPersonel[])
      setIstasyonlar(aktifIstasyonlar)
      setYetkiliIstasyonIds(aktifIstasyonlar.map(i => i.id))
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Personel listesi yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => { getir() }, [getir])

  // ── Düzenleme başlat ──────────────────────────────────────────────────────
  const duzenleBaslat = (p: HrPersonel) => {
    setDuzenlePersonel(p)
    setSilmeOnayId(null)
    reset({
      ad_soyad: p.ad_soyad,
      foto_url: p.foto_url ?? '',
      rol: p.rol as 'Direkt' | 'Endirekt',
      is_aktif: p.is_aktif,
      uretim_yetkileri_sinirli: p.uretim_yetkileri_sinirli ?? false,
    })
    setYetkiliIstasyonIds(
      p.uretim_yetkileri_sinirli
        ? (p.hr_personel_istasyon_yetkileri ?? []).map(y => y.istasyon_id)
        : istasyonlar.map(i => i.id),
    )
  }

  const duzenleIptal = () => {
    setDuzenlePersonel(null)
    reset({ ad_soyad: '', foto_url: '', rol: 'Direkt', is_aktif: true, uretim_yetkileri_sinirli: false })
    setYetkiliIstasyonIds(istasyonlar.map(i => i.id))
  }

  const istasyonYetkileriniKaydet = async (personelId: string, sinirli: boolean) => {
    const { error: silmeHatasi } = await supabase
      .from('hr_personel_istasyon_yetkileri')
      .delete()
      .eq('personel_id', personelId)
    if (silmeHatasi) throw silmeHatasi
    if (!sinirli || yetkiliIstasyonIds.length === 0) return
    const { error: eklemeHatasi } = await supabase
      .from('hr_personel_istasyon_yetkileri')
      .insert(yetkiliIstasyonIds.map(istasyon_id => ({ personel_id: personelId, istasyon_id })))
    if (eklemeHatasi) throw eklemeHatasi
  }

  // ── Personel ekle / güncelle ───────────────────────────────────────────────
  const onSubmit = async (form: PersonelFormDegerleri) => {
    setKaydediyor(true)
    setHata(null)
    try {
      const sinirli = form.uretim_yetkileri_sinirli
      if (duzenlePersonel) {
        const { error } = await supabase
          .from('hr_personel')
          .update({
            ad_soyad: form.ad_soyad.trim(),
            foto_url: form.foto_url.trim(),
            rol: form.rol,
            uretim_yetkileri_sinirli: sinirli,
          })
          .eq('id', duzenlePersonel.id)
        if (error) throw error
        await istasyonYetkileriniKaydet(duzenlePersonel.id, sinirli)
        setDuzenlePersonel(null)
      } else {
        const yeni: YeniPersonel = {
          ad_soyad: form.ad_soyad.trim(),
          foto_url: form.foto_url.trim(),
          rol: form.rol,
          is_aktif: true,
          uretim_yetkileri_sinirli: sinirli,
        }
        const { data, error } = await supabase.from('hr_personel').insert([yeni]).select('id').single()
        if (error) throw error
        await istasyonYetkileriniKaydet(data.id, sinirli)
      }
      reset({ ad_soyad: '', foto_url: '', rol: 'Direkt', is_aktif: true, uretim_yetkileri_sinirli: false })
      setYetkiliIstasyonIds(istasyonlar.map(i => i.id))
      await getir()
    } catch (e) {
      setHata(e instanceof Error ? e.message : duzenlePersonel ? 'Personel güncellenemedi' : 'Personel eklenemedi')
    } finally {
      setKaydediyor(false)
    }
  }

  // ── Aktiflik toggle ───────────────────────────────────────────────────────
  const aktiflikDegistir = async (p: HrPersonel) => {
    const { error } = await supabase
      .from('hr_personel')
      .update({ is_aktif: !p.is_aktif })
      .eq('id', p.id)
    if (!error) {
      setPersoneller(prev => prev.map(x => x.id === p.id ? { ...x, is_aktif: !x.is_aktif } : x))
    }
  }

  // ── Silme ─────────────────────────────────────────────────────────────────
  const sil = async (id: string) => {
    const { error } = await supabase.from('hr_personel').delete().eq('id', id)
    if (!error) setPersoneller(prev => prev.filter(p => p.id !== id))
    setSilmeOnayId(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

      {/* ── Personel Formu ── */}
      <div className={`bg-white rounded-xl border p-6 ${duzenlePersonel ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-gray-800">
            {duzenlePersonel ? `Düzenle: ${duzenlePersonel.ad_soyad}` : 'Yeni Personel Ekle'}
          </h3>
          {duzenlePersonel && (
            <button type="button" onClick={duzenleIptal} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1">
              <X size={12} /> İptal
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Ad Soyad */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Ad Soyad <span className="text-red-500">*</span>
            </label>
            <input
              {...register('ad_soyad')}
              placeholder="Ahmet Yılmaz"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.ad_soyad && (
              <p className="mt-1 text-xs text-red-600">{errors.ad_soyad.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Fotoğraf */}
            <FotoAlani
              deger={fotoUrl}
              onDegisim={url => setValue('foto_url', url, { shouldValidate: true })}
              hata={errors.foto_url?.message}
            />

            {/* Rol */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Rol <span className="text-red-500">*</span>
              </label>
              <select
                {...register('rol')}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="Direkt">Direkt Çalışan</option>
                <option value="Endirekt">Endirekt Çalışan</option>
              </select>
              {errors.rol && <p className="mt-1 text-xs text-red-600">{errors.rol.message}</p>}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700">
              <input type="checkbox" {...register('uretim_yetkileri_sinirli')} />
              Üretim istasyonlarını sınırla
            </label>
          </div>

          {yetkiSinirli && (
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Factory size={13} className="text-amber-500" />
                  <p className="text-xs font-semibold text-gray-700">Üretim Girişi Yetkilendirme</p>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setYetkiliIstasyonIds(istasyonlar.map(i => i.id))}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Tümünü seç
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    type="button"
                    onClick={() => setYetkiliIstasyonIds([])}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    Temizle
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mb-3">
                Bu kullanıcı üretim girişinde yalnızca seçilen istasyonları görür. Not alanı herkes için açıktır.
              </p>
              {istasyonlar.length === 0 ? (
                <p className="text-xs text-gray-400 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                  Aktif üretim istasyonu bulunamadı.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {istasyonlar.map(istasyon => {
                    const secili = yetkiliIstasyonIds.includes(istasyon.id)
                    return (
                      <label
                        key={istasyon.id}
                        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                          secili ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={secili}
                          onChange={() => setYetkiliIstasyonIds(ids =>
                            secili ? ids.filter(id => id !== istasyon.id) : [...ids, istasyon.id],
                          )}
                          className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                        />
                        <span className="text-xs font-medium text-gray-700">{istasyon.ad}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Hata */}
          {hata && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0" />
              {hata}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={kaydediyor}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {kaydediyor
                ? <Loader2 size={14} className="animate-spin" />
                : duzenlePersonel ? <Pencil size={14} /> : <Plus size={14} />}
              {kaydediyor
                ? (duzenlePersonel ? 'Güncelleniyor…' : 'Ekleniyor…')
                : (duzenlePersonel ? 'Güncelle' : 'Personel Ekle')}
            </button>
            {duzenlePersonel && (
              <button
                type="button"
                onClick={duzenleIptal}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                İptal
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── Personel Listesi ── */}
      <div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-gray-800">
            Personel Listesi
            <span className="ml-2 text-gray-400 font-normal">({personeller.length})</span>
          </h3>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Aktif: {personeller.filter(p => p.is_aktif).length}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
              Pasif: {personeller.filter(p => !p.is_aktif).length}
            </span>
          </div>
        </div>

        {yukleniyor ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" />
            Yükleniyor…
          </div>
        ) : personeller.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            Henüz personel eklenmemiş.
          </div>
        ) : (
          <div className="space-y-2 px-1">
            {personeller.map(p => (
              <div
                key={p.id}
                className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 transition-all sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] ${
                  duzenlePersonel?.id === p.id
                    ? 'bg-blue-50 border-blue-400 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.45)]'
                    : p.is_aktif
                    ? 'bg-white border-gray-200'
                    : 'bg-gray-50 border-gray-100 opacity-60'
                }`}
              >
                <PersonelAvatar foto_url={p.foto_url} ad_soyad={p.ad_soyad} boyut="md" />

                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${p.is_aktif ? 'text-gray-800' : 'text-gray-500'}`}>
                    {p.ad_soyad}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{p.rol}</p>
                </div>

                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  p.rol === 'Direkt' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                }`}>
                  {p.rol}
                </span>

                <div className="col-span-3 flex items-center justify-end gap-1 border-t border-gray-100 pt-2 sm:contents">
                  {/* Düzenle */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      if (duzenlePersonel?.id === p.id) duzenleIptal()
                      else duzenleBaslat(p)
                    }}
                    title="Düzenle"
                    aria-label={`${p.ad_soyad} kaydını düzenle`}
                    className={`grid h-9 w-9 place-items-center rounded-lg transition-colors ${
                      duzenlePersonel?.id === p.id
                        ? 'text-blue-600 bg-blue-100'
                        : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    <Pencil size={14} />
                  </button>

                  {/* Aktif/Pasif toggle */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      aktiflikDegistir(p)
                    }}
                    title={p.is_aktif ? 'Pasife Al' : 'Aktif Et'}
                    aria-label={`${p.ad_soyad} kaydını ${p.is_aktif ? 'pasife al' : 'aktif et'}`}
                    className={`grid h-9 w-9 place-items-center rounded-lg transition-colors ${
                      p.is_aktif ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    {p.is_aktif ? <UserCheck size={16} /> : <UserX size={16} />}
                  </button>

                  {/* Sil */}
                  {silmeOnayId === p.id ? (
                    <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        sil(p.id)
                      }}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Evet
                    </button>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        setSilmeOnayId(null)
                      }}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                    >
                      Hayır
                    </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        setSilmeOnayId(p.id)
                      }}
                      aria-label={`${p.ad_soyad} kaydını sil`}
                      className="grid h-9 w-9 place-items-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
