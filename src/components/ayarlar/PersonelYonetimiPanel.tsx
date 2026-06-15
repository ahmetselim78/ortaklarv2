import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, UserCheck, UserX, User, AlertCircle, Loader2, Upload, X } from 'lucide-react'
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
    )
    .default(''),
  rol: z.enum(['Direkt', 'Endirekt'], {
    errorMap: () => ({ message: 'Rol seçiniz' }),
  }),
  is_aktif: z.boolean().default(true),
})

type PersonelFormDegerleri = z.infer<typeof personelSchema>

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

  const r2Aktif = !!import.meta.env.VITE_R2_UPLOAD_URL

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

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PersonelFormDegerleri>({
    resolver: zodResolver(personelSchema),
    defaultValues: { ad_soyad: '', foto_url: '', rol: 'Direkt', is_aktif: true },
  })

  const fotoUrl = watch('foto_url')

  // ── Veri getir ────────────────────────────────────────────────────────────
  const getir = useCallback(async () => {
    setYukleniyor(true)
    try {
      const { data, error } = await supabase.from('hr_personel').select('*').order('ad_soyad')
      if (error) throw error
      setPersoneller((data ?? []) as HrPersonel[])
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
    reset({ ad_soyad: p.ad_soyad, foto_url: p.foto_url ?? '', rol: p.rol as 'Direkt' | 'Endirekt', is_aktif: p.is_aktif })
  }

  const duzenleIptal = () => {
    setDuzenlePersonel(null)
    reset({ ad_soyad: '', foto_url: '', rol: 'Direkt', is_aktif: true })
  }

  // ── Personel ekle / güncelle ───────────────────────────────────────────────
  const onSubmit = async (form: PersonelFormDegerleri) => {
    setKaydediyor(true)
    setHata(null)
    try {
      if (duzenlePersonel) {
        const { error } = await supabase
          .from('hr_personel')
          .update({ ad_soyad: form.ad_soyad.trim(), foto_url: form.foto_url.trim(), rol: form.rol })
          .eq('id', duzenlePersonel.id)
        if (error) throw error
        setDuzenlePersonel(null)
      } else {
        const yeni: YeniPersonel = {
          ad_soyad: form.ad_soyad.trim(),
          foto_url: form.foto_url.trim(),
          rol: form.rol,
          is_aktif: true,
        }
        const { error } = await supabase.from('hr_personel').insert([yeni])
        if (error) throw error
      }
      reset({ ad_soyad: '', foto_url: '', rol: 'Direkt', is_aktif: true })
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
    <div className="max-w-3xl space-y-8">

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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">
            Personel Listesi
            <span className="ml-2 text-gray-400 font-normal">({personeller.length})</span>
          </h3>
          <div className="flex gap-3 text-xs text-gray-500">
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
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {personeller.map(p => (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  duzenlePersonel?.id === p.id
                    ? 'bg-blue-50 border-blue-300'
                    : p.is_aktif
                    ? 'bg-white border-gray-200'
                    : 'bg-gray-50 border-gray-100 opacity-60'
                }`}
              >
                <PersonelAvatar foto_url={p.foto_url} ad_soyad={p.ad_soyad} boyut="md" />

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${p.is_aktif ? 'text-gray-800' : 'text-gray-500'}`}>
                    {p.ad_soyad}
                  </p>
                  <p className="text-xs text-gray-400">{p.rol}</p>
                </div>

                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  p.rol === 'Direkt' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                }`}>
                  {p.rol}
                </span>

                {/* Düzenle */}
                <button
                  type="button"
                  onClick={() => duzenlePersonel?.id === p.id ? duzenleIptal() : duzenleBaslat(p)}
                  title="Düzenle"
                  className={`p-1.5 rounded-lg transition-colors ${
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
                  onClick={() => aktiflikDegistir(p)}
                  title={p.is_aktif ? 'Pasife Al' : 'Aktif Et'}
                  className={`p-1.5 rounded-lg transition-colors ${
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
                      onClick={() => sil(p.id)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Evet
                    </button>
                    <button
                      type="button"
                      onClick={() => setSilmeOnayId(null)}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                    >
                      Hayır
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSilmeOnayId(p.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
