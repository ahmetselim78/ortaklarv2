import { useState, useEffect, useRef } from 'react'
import {
  Sun, Moon, Eye, EyeOff, Factory, LogOut, Plus, Trash2,
  AlertCircle, CheckCircle2, Loader2, ChevronRight, UserCheck, Truck, Users,
  History, ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, ClipboardCheck,
  FileText, LockKeyhole, Pencil, ShieldCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { bugunGoster, bugunTarih, formatSaatTr, tarihEtiketTr, trSaatStr } from '@/lib/tarih'
import type { HrPersonel } from '@/types/saatlikUretim'

// ─── Types ────────────────────────────────────────────────────────────────────
type Tema = 'dark' | 'light'

interface SonKullanici {
  id: string
  ad_soyad: string
  foto_url: string | null
  rol: string
}

interface IstasyonSatir {
  id: string
  ad: string
  sira_no: number
  fire_var: boolean
  adet: number
  fire_adet: number
}

interface IstasyonTanimi {
  id: string
  ad: string
  sira_no: number
  fire_var: boolean
}

interface KayitliIstasyonDegeri {
  istasyon_id: string
  adet: number
  fire_adet: number
}

interface KayitliAracYuklemesi {
  arac_id: string | null
  dis_arac_plakasi: string | null
  dis_arac_adi: string | null
  adet: number
}

interface KayitliGunlukRapor {
  id: string
  toplam_personel: number | null
  notlar: string | null
  gunluk_uretim_istasyon_kayitlari: KayitliIstasyonDegeri[] | null
  gunluk_uretim_arac_yuklemeleri: KayitliAracYuklemesi[] | null
}

interface AracKayit {
  id: string
  plaka: string
  ad: string
}

interface AracYuklemeForm {
  uid: string
  tip: 'mevcut' | 'harici'
  arac_id: string | null
  dis_plaka: string
  dis_ad: string
  adet: number
}

interface RaporData {
  istasyonlar: IstasyonSatir[]
  aracYuklemeleri: AracYuklemeForm[]
  araclarListesi: AracKayit[]
  toplamPersonel: number
  notlar: string
  kaydedildi: boolean
  raporId?: string
}

// ─── LocalStorage Keys ────────────────────────────────────────────────────────
const LS_TEMA = 'ogu_tema'
const GIRIS_YUKLEME_ZAMAN_ASIMI_MS = 15_000

/** Ağ isteği yanıtsız kalırsa çizelgeyi süresiz yükleme ekranında bırakma. */
function zamanAsimli<T>(islem: PromiseLike<T>, ms = GIRIS_YUKLEME_ZAMAN_ASIMI_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const zamanAsimi = window.setTimeout(() => {
      reject(new Error('Çizelge verileri zamanında alınamadı. Bağlantınızı kontrol edip tekrar deneyin.'))
    }, ms)

    Promise.resolve(islem).then(
      sonuc => {
        window.clearTimeout(zamanAsimi)
        resolve(sonuc)
      },
      hata => {
        window.clearTimeout(zamanAsimi)
        reject(hata)
      },
    )
  })
}

// ─── Tema Yardımcıları ────────────────────────────────────────────────────────
function pageBg(dk: boolean) { return dk ? 'bg-gray-950' : 'bg-gray-50' }
function sectionCls(dk: boolean) { return `rounded-2xl border p-5 ${dk ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}` }
function txtPrimary(dk: boolean) { return dk ? 'text-white' : 'text-gray-900' }
function txtSub(dk: boolean) { return dk ? 'text-gray-400' : 'text-gray-600' }
function txtMuted(dk: boolean) { return dk ? 'text-gray-600' : 'text-gray-400' }
function inputCls(dk: boolean) {
  return `w-full px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors ${dk ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`
}
/** Sayı input'larına odaklanınca mevcut değeri (ör. 0) seçili hale getirir,
 *  böylece kullanıcı elle silmeden yeni değeri yazabilir. */
function odaklaninceSec(e: React.FocusEvent<HTMLInputElement>) {
  e.target.select()
}

/** Mobilde sadece rakam tuşlarının olduğu klavyeyi açmak için ortak prop'lar. */
const sayiInputProps = {
  inputMode: 'numeric' as const,
  pattern: '[0-9]*',
  onFocus: odaklaninceSec,
}

function inputSmCls(dk: boolean) {
  return `w-full px-3 py-2 rounded-lg border text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors ${dk ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`
}
function inputFireCls(dk: boolean) {
  return `w-full px-3 py-2 rounded-lg border text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors ${dk ? 'bg-gray-800 border-red-900/40 text-red-300' : 'bg-gray-50 border-red-200 text-red-600'}`
}
function btnSecCls(dk: boolean) {
  return `flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-colors ${dk ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`
}
function errBoxCls(dk: boolean) {
  return `flex items-start gap-2 text-sm rounded-xl px-4 py-3 border ${dk ? 'text-red-400 bg-red-950/40 border-red-800/40' : 'text-red-600 bg-red-50 border-red-200'}`
}
// ─── Paylaşılan Header ────────────────────────────────────────────────────────
function PageHeader({
  tema,
  onTemaDegistir,
  rightContent,
}: {
  tema: Tema
  onTemaDegistir: () => void
  rightContent?: React.ReactNode
}) {
  const dk = tema === 'dark'
  const [saat, setSaat] = useState('')

  useEffect(() => {
    const tick = () => setSaat(trSaatStr())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${dk ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${dk ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
          <Factory size={15} className="text-amber-500" />
        </div>
        <span className={`font-black text-sm tracking-tight ${txtPrimary(dk)}`}>
          Üretim <span className="text-amber-500">Takip</span> <span className="hidden sm:inline">Çizelgesi</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {saat && (
          <span className={`hidden sm:inline font-mono text-sm tabular-nums ${txtMuted(dk)}`}>{saat}</span>
        )}
        {rightContent}
        <button
          type="button"
          onClick={onTemaDegistir}
          className={`p-2 rounded-lg transition-colors ${dk ? 'text-gray-500 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'}`}
          title={dk ? 'Açık temaya geç' : 'Koyu temaya geç'}
        >
          {dk ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  )
}

// ─── Personel Avatarı ─────────────────────────────────────────────────────────
function PersonelAvatar({
  personel,
  boyut = 'md',
  dk,
}: {
  personel: { ad_soyad: string; foto_url?: string | null }
  boyut?: 'sm' | 'md' | 'lg'
  dk: boolean
}) {
  const sizes = { sm: 'w-9 h-9 text-sm', md: 'w-16 h-16 text-2xl', lg: 'w-24 h-24 text-3xl' }
  const s = sizes[boyut]
  if (personel.foto_url) {
    return (
      <img
        src={personel.foto_url}
        alt={personel.ad_soyad}
        className={`${s} rounded-xl object-cover ring-2 ring-amber-500/30 shrink-0`}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div className={`${s} rounded-xl flex items-center justify-center font-bold shrink-0 ${dk ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
      {personel.ad_soyad.charAt(0).toUpperCase()}
    </div>
  )
}

// ─── GİRİŞ EKRANI ─────────────────────────────────────────────────────────────
function OperatorAuthShell({
  tema,
  onTemaDegistir,
  children,
}: {
  tema: Tema
  onTemaDegistir: () => void
  children: React.ReactNode
}) {
  const dk = tema === 'dark'

  return (
    <main className={`relative h-dvh max-h-dvh overflow-hidden ${dk ? 'bg-[#07111f]' : 'bg-slate-100'}`}>
      <div aria-hidden="true" className={`auth-glow absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full blur-3xl ${dk ? 'bg-blue-500/20' : 'bg-blue-300/25'}`} />
      <div aria-hidden="true" className={`auth-glow auth-delay-2 absolute -bottom-52 right-[-8rem] h-[38rem] w-[38rem] rounded-full blur-3xl ${dk ? 'bg-cyan-400/10' : 'bg-cyan-300/20'}`} />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.055)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />

      <div className="relative mx-auto grid h-full min-h-0 w-full max-w-7xl min-w-0 content-center items-start gap-4 px-4 py-4 sm:gap-6 sm:px-8 sm:py-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16 lg:px-12 lg:py-8">
        <section className={`auth-enter mx-auto min-w-0 w-full max-w-lg lg:mx-0 ${dk ? 'text-white' : 'text-slate-950'}`}>
          <div className="flex items-center justify-between gap-4 lg:mb-12">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25"><Factory size={22} aria-hidden="true" /></div>
              <div><p className="font-bold tracking-tight">OrtaklarV2</p><p className={`text-xs ${dk ? 'text-slate-400' : 'text-slate-500'}`}>Üretim operasyonları</p></div>
            </div>
            <button type="button" onClick={onTemaDegistir} aria-label={dk ? 'Açık temaya geç' : 'Koyu temaya geç'} title={dk ? 'Açık temaya geç' : 'Koyu temaya geç'} className={`grid h-10 w-10 place-items-center rounded-xl border transition ${dk ? 'border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/10 hover:text-white' : 'border-slate-200 bg-white text-slate-500 hover:text-slate-900'}`}>
              {dk ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            </button>
          </div>

          <div className="hidden lg:block">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${dk ? 'border-blue-400/20 bg-blue-400/10 text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-700'}`}><BadgeCheck size={14} aria-hidden="true" /> Yetkili personel alanı</span>
            <h1 className="mt-5 max-w-lg text-5xl font-bold leading-[1.06] tracking-tight">Vardiyanıza güvenle başlayın.</h1>
            <p className={`mt-5 max-w-md text-base leading-7 ${dk ? 'text-slate-300' : 'text-slate-600'}`}>Günlük üretim, araç yükleme ve personel bilgilerini tek bir güvenli akışta kaydedin.</p>
            <div className={`relative mt-10 overflow-hidden rounded-3xl border p-5 backdrop-blur-sm ${dk ? 'border-white/10 bg-white/[0.04]' : 'border-slate-200 bg-white/70'}`}>
              <div aria-hidden="true" className="auth-orbit absolute -right-10 -top-24 h-64 w-64 rounded-full border border-blue-300/20" />
              <div className="relative grid gap-3">
                {[
                  { icon: ShieldCheck, label: 'Personel doğrulama', detail: 'Güvenli oturum kontrolü', tone: 'text-blue-300 bg-blue-400/10' },
                  { icon: ClipboardCheck, label: 'Günlük üretim raporu', detail: 'İstasyon verilerini kaydedin', tone: 'text-emerald-300 bg-emerald-400/10' },
                  { icon: CalendarDays, label: 'Güncel kayıt akışı', detail: 'Bugünün verileri tek yerde', tone: 'text-violet-300 bg-violet-400/10' },
                ].map(({ icon: Icon, label, detail, tone }, index) => (
                  <div key={label} className={`auth-float flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg ${index === 1 ? 'auth-delay-1' : ''} ${dk ? 'border-white/10 bg-[#0d1a2c]/90' : 'border-slate-200 bg-white/90'}`}>
                    <div className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon size={19} aria-hidden="true" /></div>
                    <div><p className="text-sm font-semibold">{label}</p><p className={`text-xs ${dk ? 'text-slate-400' : 'text-slate-500'}`}>{detail}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="auth-enter auth-delay-1 mx-auto min-w-0 w-full max-w-xl">{children}</section>
      </div>
    </main>
  )
}

function operatorAuthCard(dk: boolean, extra = '') {
  return `min-w-0 rounded-[1.75rem] border p-5 shadow-[0_35px_100px_-30px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:p-8 lg:rounded-[2rem] lg:p-10 ${dk ? 'border-white/10 bg-slate-900/95 text-white' : 'border-white/60 bg-white/95 text-slate-950'} ${extra}`
}

function GirisEkrani({
  sonKullanici,
  tema,
  onGiris,
  onHesapDegistir,
  onTemaDegistir,
}: {
  sonKullanici: SonKullanici | null
  tema: Tema
  onGiris: (p: HrPersonel) => Promise<void>
  onHesapDegistir: () => Promise<void>
  onTemaDegistir: () => void
}) {
  type Adim = 'hatirlatma' | 'sifre' | 'onay'
  const [adim, setAdim] = useState<Adim>(sonKullanici ? 'hatirlatma' : 'sifre')
  const [bulunanPersonel, setBulunanPersonel] = useState<HrPersonel | null>(null)
  const [sifre, setSifre] = useState('')
  const [sifreGoster, setSifreGoster] = useState(false)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dk = tema === 'dark'

  useEffect(() => {
    if (adim === 'sifre') {
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [adim])

  async function hatirlatmaDevam() {
    // Hatırlanan kişi hiçbir zaman kimlik doğrulama yerine kullanılmaz.
    setHata(null)
    setAdim('sifre')
  }

  async function hesapDegistir() {
    setYukleniyor(true)
    setHata(null)
    try {
      await onHesapDegistir()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Oturum kapatılırken bir hata oluştu.')
      setYukleniyor(false)
    }
  }

  async function sifreIleGiris(e?: React.FormEvent) {
    e?.preventDefault()
    if (!sifre.trim()) return
    setYukleniyor(true)
    setHata(null)
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user?.email) throw new Error('Geçerli Auth oturumu bulunamadı.')
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: sifre,
      })
      if (reauthError) throw new Error('Parola hatalı.')

      const { data: access, error: accessError } = await supabase.rpc('my_access_context')
      const personelId = (access as { user?: { personel_id?: string | null } } | null)?.user?.personel_id
      if (accessError || !personelId) throw new Error('Hesabınız bir personel kaydına bağlı değil.')

      const { data, error } = await supabase
        .from('hr_personel')
        .select('id, ad_soyad, foto_url, rol, is_aktif, olusturma, kullanici_adi, uretim_yetkileri_sinirli')
        .eq('id', personelId)
        .eq('is_aktif', true)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        setHata('Geçersiz şifre veya hesap pasif. Lütfen tekrar deneyin.')
        setSifre('')
        inputRef.current?.focus()
        return
      }
      setBulunanPersonel(data as HrPersonel)
      setAdim('onay')
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Giriş hatası oluştu.')
    } finally {
      setYukleniyor(false)
    }
  }

  // ── Hatırlatma: "Bu sizin hesabınız mı?" ─────────────────────────────────
  if (adim === 'hatirlatma' && sonKullanici) {
    return (
      <OperatorAuthShell tema={tema} onTemaDegistir={onTemaDegistir}>
          <div className={operatorAuthCard(dk)}>
            <div className="mb-6 flex items-center gap-4">
              <PersonelAvatar personel={sonKullanici} boyut="md" dk={dk} />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Hatırlanan hesap</p>
                <p className="mt-1 truncate text-xl font-bold">{sonKullanici.ad_soyad}</p>
                <p className={`text-xs ${dk ? 'text-slate-400' : 'text-slate-500'}`}>{sonKullanici.rol}</p>
              </div>
            </div>
            <div className={`mb-5 rounded-2xl border p-4 ${dk ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-slate-50'}`}>
              <p className="font-semibold">Bu sizin hesabınız mı?</p>
              <p className={`mt-1 text-sm leading-6 ${dk ? 'text-slate-400' : 'text-slate-500'}`}>Devam etmek için hesabınızı doğrulayın.</p>
            </div>
            {hata && (
              <div className={`${errBoxCls(dk)} mb-4`}>
                <AlertCircle size={14} className="shrink-0 mt-0.5" />{hata}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={hatirlatmaDevam}
                disabled={yukleniyor}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-50"
              >
                {yukleniyor ? <Loader2 size={15} className="animate-spin" /> : <UserCheck size={15} />}
                {yukleniyor ? 'Doğrulanıyor…' : 'Evet, devam et'}
                {!yukleniyor && <ArrowRight size={16} aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => { setHata(null); setAdim('sifre') }}
                className={`w-full rounded-xl py-2.5 text-sm font-medium transition-colors ${dk ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                Hayır, farklı hesap
              </button>
            </div>
          </div>
      </OperatorAuthShell>
    )
  }

  // ── Şifre Girişi ─────────────────────────────────────────────────────────
  if (adim === 'sifre') {
    return (
      <OperatorAuthShell tema={tema} onTemaDegistir={onTemaDegistir}>
          <div className={operatorAuthCard(dk)}>
            <div className="mb-7">
              <div className="mb-5 flex items-center gap-3 lg:hidden">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20"><LockKeyhole size={19} aria-hidden="true" /></div>
                <div><p className="text-sm font-bold">Güvenli doğrulama</p><p className={`text-xs ${dk ? 'text-slate-400' : 'text-slate-500'}`}>Üretim girişine devam edin</p></div>
              </div>
              <p className="hidden text-xs font-bold uppercase tracking-[0.18em] text-blue-500 lg:block">Personel doğrulama</p>
              <h2 className="text-[1.65rem] font-bold tracking-tight sm:text-2xl lg:mt-2 lg:text-3xl">Operatör girişi</h2>
              <p className={`mt-2 text-sm leading-6 ${dk ? 'text-slate-400' : 'text-slate-500'}`}>Günlük üretim ekranını açmak için mevcut parolanızı girin.</p>
            </div>
            <form onSubmit={sifreIleGiris}>
              <label htmlFor="operator-password" className="mb-2 block text-sm font-semibold">Parola</label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" size={19} className={`absolute left-4 top-1/2 -translate-y-1/2 ${dk ? 'text-slate-500' : 'text-slate-400'}`} />
                <input
                  id="operator-password"
                  ref={inputRef}
                  type={sifreGoster ? 'text' : 'password'}
                  value={sifre}
                  onChange={e => { setSifre(e.target.value); setHata(null) }}
                  placeholder="Parolanızı girin"
                  autoComplete="current-password"
                  className={`h-14 min-w-0 w-full rounded-xl border pl-12 pr-12 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${dk ? 'border-slate-700 bg-slate-800 text-white placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-950 placeholder:text-slate-400'}`}
                />
                <button
                  type="button"
                  onClick={() => setSifreGoster(v => !v)}
                  aria-label={sifreGoster ? 'Parolayı gizle' : 'Parolayı göster'}
                  className={`absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg transition ${dk ? 'text-slate-500 hover:bg-slate-700 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
                >
                  {sifreGoster ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {hata && (
                <div className={`${errBoxCls(dk)} mt-4`}>
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />{hata}
                </div>
              )}
              <button
                type="submit"
                disabled={yukleniyor || !sifre.trim()}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {yukleniyor ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={17} />}
                {yukleniyor ? 'Kontrol ediliyor…' : 'Doğrula ve devam et'}
                {!yukleniyor && <ArrowRight size={16} />}
              </button>
            </form>
            <button
              type="button"
              onClick={() => void hesapDegistir()}
              disabled={yukleniyor}
              className={`mt-3 w-full rounded-xl border py-2.5 text-sm font-semibold transition disabled:opacity-50 ${dk ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
            >
              Başka hesapla giriş yap
            </button>
            <div className={`mt-5 flex items-center justify-center gap-2 text-xs ${dk ? 'text-slate-500' : 'text-slate-400'}`}><LockKeyhole size={13} /> Parolanız hiçbir zaman saklanmaz</div>
          </div>
      </OperatorAuthShell>
    )
  }

  // ── Onay: Şifre girildi, kim olduğunu göster ─────────────────────────────
  if (adim === 'onay' && bulunanPersonel) {
    return (
      <OperatorAuthShell tema={tema} onTemaDegistir={onTemaDegistir}>
          <div className={operatorAuthCard(dk, 'text-center')}>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400"><CheckCircle2 size={25} /></div>
            <div className="flex justify-center my-4">
              <PersonelAvatar personel={bulunanPersonel} boyut="lg" dk={dk} />
            </div>
            <p className={`text-2xl font-bold mb-0.5 ${txtPrimary(dk)}`}>{bulunanPersonel.ad_soyad}</p>
            <p className={`text-sm ${txtMuted(dk)} mb-1`}>{bulunanPersonel.rol}</p>
            <p className="mb-6 mt-2 text-sm font-semibold text-emerald-400">Kimliğiniz doğrulandı</p>
            <button
              type="button"
              onClick={async () => {
                setYukleniyor(true)
                setHata(null)
                try {
                  await onGiris(bulunanPersonel)
                } catch (err) {
                  setHata(err instanceof Error ? err.message : 'Çizelge açılırken bir hata oluştu.')
                } finally {
                  setYukleniyor(false)
                }
              }}
              disabled={yukleniyor}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-50"
            >
              {yukleniyor ? <Loader2 size={15} className="animate-spin" /> : <>Üretim ekranını aç <ChevronRight size={16} /></>}
            </button>
            {hata && (
              <div className={`${errBoxCls(dk)} mt-4 text-left`}>
                <AlertCircle size={14} className="shrink-0 mt-0.5" />{hata}
              </div>
            )}
          </div>
      </OperatorAuthShell>
    )
  }

  return null
}

// ─── ARAÇ EKLEME FORMU (Inline) ───────────────────────────────────────────────
function AracEkleForm({
  mevcutAraclar,
  dk,
  onEkle,
  onIptal,
}: {
  mevcutAraclar: AracKayit[]
  dk: boolean
  onEkle: (a: Omit<AracYuklemeForm, 'uid'>) => void
  onIptal: () => void
}) {
  const [tip, setTip] = useState<'mevcut' | 'harici'>('mevcut')
  const [aracId, setAracId] = useState(mevcutAraclar[0]?.id ?? '')
  const [disPlaka, setDisPlaka] = useState('')
  const [disAd, setDisAd] = useState('')
  const [adet, setAdet] = useState(1)
  const [hata, setHata] = useState<string | null>(null)

  function ekle() {
    if (tip === 'mevcut' && !aracId) { setHata('Lütfen bir araç seçin.'); return }
    if (tip === 'harici' && !disPlaka.trim()) { setHata('Lütfen araç plakasını girin.'); return }
    if (adet <= 0) { setHata('Adet 0\'dan büyük olmalıdır.'); return }
    onEkle({
      tip,
      arac_id: tip === 'mevcut' ? aracId : null,
      dis_plaka: tip === 'harici' ? disPlaka.trim().toUpperCase() : '',
      dis_ad: tip === 'harici' ? disAd.trim() : '',
      adet,
    })
  }

  const inpCls = `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors ${dk ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`
  const labelCls = `block text-xs font-medium mb-1 ${dk ? 'text-gray-400' : 'text-gray-600'}`

  return (
    <div className={`rounded-xl border p-4 mt-3 ${dk ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex gap-2 mb-4">
        {(['mevcut', 'harici'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { setTip(t); setHata(null) }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
              tip === t ? 'bg-amber-500 text-gray-950' : dk ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            {t === 'mevcut' ? 'Kayıtlı Araç' : 'Harici Araç'}
          </button>
        ))}
      </div>

      {tip === 'mevcut' ? (
        <div className="mb-3">
          <label className={labelCls}>Araç</label>
          {mevcutAraclar.length === 0 ? (
            <p className={`text-xs ${dk ? 'text-gray-500' : 'text-gray-400'}`}>
              Kayıtlı araç bulunamadı. Harici araç seçeneğini kullanın.
            </p>
          ) : (
            <select
              value={aracId}
              onChange={e => setAracId(e.target.value)}
              className={inpCls}
              style={{ colorScheme: dk ? 'dark' : 'normal' }}
            >
              {mevcutAraclar.map(a => (
                <option key={a.id} value={a.id}>{a.plaka} — {a.ad}</option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Plaka *</label>
            <input type="text" value={disPlaka} onChange={e => setDisPlaka(e.target.value.toUpperCase())} placeholder="34ABC123" className={inpCls} />
          </div>
          <div>
            <label className={labelCls}>Araç Adı</label>
            <input type="text" value={disAd} onChange={e => setDisAd(e.target.value)} placeholder="İsteğe bağlı" className={inpCls} />
          </div>
        </div>
      )}

      <div className="mb-4">
        <label className={labelCls}>Yüklenen Adet</label>
        <input
          type="number"
          min={1}
          value={adet}
          onChange={e => setAdet(Math.max(1, parseInt(e.target.value) || 1))}
          className={inpCls}
          {...sayiInputProps}
        />
      </div>

      {hata && <p className="text-xs text-red-400 mb-3">{hata}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={ekle} className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 text-sm font-bold rounded-lg transition-colors">
          Ekle
        </button>
        <button
          type="button"
          onClick={onIptal}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${dk ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
        >
          İptal
        </button>
      </div>
    </div>
  )
}

// ─── GÜNLÜK RAPOR FORMU ───────────────────────────────────────────────────────
function GunlukRaporFormu({
  personel,
  tema,
  initialVeri,
  onOzetGoster,
  onSonKayitlar,
  onCikis,
  onTemaDegistir,
}: {
  personel: HrPersonel
  tema: Tema
  initialVeri: RaporData | null
  onOzetGoster: (veri: RaporData) => void
  onSonKayitlar: () => void
  onCikis: () => void
  onTemaDegistir: () => void
}) {
  const dk = tema === 'dark'

  const [istasyonlar, setIstasyonlar] = useState<IstasyonSatir[]>([])
  const [araclar, setAraclar] = useState<AracKayit[]>([])
  const [aracYuklemeleri, setAracYuklemeleri] = useState<AracYuklemeForm[]>(
    () => initialVeri?.aracYuklemeleri ?? []
  )
  const [aracEkleAcik, setAracEkleAcik] = useState(false)
  const [toplamPersonel, setToplamPersonel] = useState(() => initialVeri?.toplamPersonel ?? 0)
  const [notlar, setNotlar] = useState(() => initialVeri?.notlar ?? '')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setYukleniyor(true)
      setHata(null)
      try {
        const [istRes, aracRes, yetkiRes] = await Promise.all([
          supabase.from('uretim_istasyonlari').select('*').eq('aktif', true).order('sira_no'),
          supabase.from('araclar').select('id, plaka, ad').eq('aktif', true).order('plaka'),
          supabase
            .from('hr_personel_istasyon_yetkileri')
            .select('istasyon_id')
            .eq('personel_id', personel.id),
        ])
        if (istRes.error) throw istRes.error
        if (aracRes.error) throw aracRes.error
        if (yetkiRes.error) throw yetkiRes.error

        const prevIstasyonlar = initialVeri?.istasyonlar ?? []
        const yetkiliIds = personel.uretim_yetkileri_sinirli
          ? new Set((yetkiRes.data ?? []).map(y => y.istasyon_id))
          : null
        const istasyonList: IstasyonSatir[] = ((istRes.data ?? []) as IstasyonTanimi[])
          .filter(ist => !yetkiliIds || yetkiliIds.has(ist.id))
          .map(ist => {
          const prev = prevIstasyonlar.find(i => i.id === ist.id)
          return {
            id: ist.id,
            ad: ist.ad,
            sira_no: ist.sira_no,
            fire_var: ist.fire_var,
            adet: prev?.adet ?? 0,
            fire_adet: prev?.fire_adet ?? 0,
          }
          })
        setIstasyonlar(istasyonList)
        setAraclar((aracRes.data ?? []) as AracKayit[])
      } catch (err) {
        setHata(err instanceof Error ? err.message : 'Veriler yüklenemedi.')
      } finally {
        setYukleniyor(false)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function istasyonGuncelle(id: string, alan: 'adet' | 'fire_adet', deger: string) {
    const sayi = Math.max(0, parseInt(deger) || 0)
    setIstasyonlar(prev => prev.map(s => s.id === id ? { ...s, [alan]: sayi } : s))
  }

  function aracEkle(a: Omit<AracYuklemeForm, 'uid'>) {
    setAracYuklemeleri(prev => [...prev, { ...a, uid: Math.random().toString(36).slice(2) }])
    setAracEkleAcik(false)
  }

  function aracSil(uid: string) {
    setAracYuklemeleri(prev => prev.filter(a => a.uid !== uid))
  }

  function aracAdiGoster(a: AracYuklemeForm): string {
    if (a.tip === 'harici') return `${a.dis_plaka}${a.dis_ad ? ` — ${a.dis_ad}` : ''}`
    const kayit = araclar.find(ar => ar.id === a.arac_id)
    return kayit ? `${kayit.plaka} — ${kayit.ad}` : 'Araç'
  }

  function ozetGoster() {
    const veri: RaporData = {
      istasyonlar,
      aracYuklemeleri,
      araclarListesi: araclar,
      toplamPersonel,
      notlar,
      kaydedildi: false,
      raporId: initialVeri?.raporId,
    }
    onOzetGoster(veri)
  }

  if (yukleniyor) {
    return (
      <div className={`min-h-screen flex flex-col ${pageBg(dk)}`}>
        <PageHeader tema={tema} onTemaDegistir={onTemaDegistir} rightContent={
          <button type="button" onClick={onCikis} className={btnSecCls(dk)}><LogOut size={14} /> Çıkış</button>
        } />
        <div className="flex-1 flex items-center justify-center gap-2">
          <Loader2 size={20} className={`animate-spin ${dk ? 'text-gray-500' : 'text-gray-400'}`} />
          <span className={`text-sm ${txtMuted(dk)}`}>Yükleniyor…</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen flex flex-col ${pageBg(dk)}`}>
      <PageHeader
        tema={tema}
        onTemaDegistir={onTemaDegistir}
        rightContent={
          <div className="flex items-center gap-2">
            <button type="button" onClick={onSonKayitlar} className={btnSecCls(dk)}>
              <History size={14} /> <span className="hidden sm:inline">Son Kayıtlar</span>
            </button>
            <button type="button" onClick={onCikis} className={btnSecCls(dk)}>
              <LogOut size={14} /> <span className="hidden sm:inline">Çıkış</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

          {/* Tarih + Operatör */}
          <div className={sectionCls(dk)}>
            <h1 className={`text-base font-bold mb-4 ${txtPrimary(dk)}`}>Günlük Üretim Girişi</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className={`text-xs font-medium mb-1 ${txtMuted(dk)}`}>Tarih</p>
                <p className={`text-sm font-semibold ${txtPrimary(dk)}`}>{bugunGoster()}</p>
              </div>
              <div>
                <p className={`text-xs font-medium mb-1 ${txtMuted(dk)}`}>Operatör</p>
                <div className="flex items-center gap-2">
                  <PersonelAvatar personel={personel} boyut="sm" dk={dk} />
                  <div>
                    <p className={`text-sm font-semibold leading-tight ${txtPrimary(dk)}`}>{personel.ad_soyad}</p>
                    <p className={`text-xs ${txtMuted(dk)}`}>{personel.rol}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {hata && (
            <div className={errBoxCls(dk)}>
              <AlertCircle size={14} className="shrink-0 mt-0.5" />{hata}
            </div>
          )}

          {/* İstasyon Üretim Adetleri */}
          <div className={sectionCls(dk)}>
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${dk ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                <Factory size={14} className="text-amber-500" />
              </div>
              <h2 className={`font-semibold text-sm ${txtPrimary(dk)}`}>İstasyon Üretim Adetleri</h2>
            </div>
            {istasyonlar.length === 0 ? (
              <p className={`text-sm text-center py-6 ${txtMuted(dk)}`}>Aktif istasyon bulunamadı.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {istasyonlar.map(ist => (
                  <div key={ist.id} className={`rounded-xl p-3.5 border ${dk ? 'bg-gray-800/50 border-gray-700/60' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-500 mb-3">{ist.ad}</p>
                    <div className="space-y-2">
                      <div>
                        <p className={`text-xs mb-1 ${txtMuted(dk)}`}>Adet</p>
                        <input
                          type="number"
                          min={0}
                          value={ist.adet}
                          onChange={e => istasyonGuncelle(ist.id, 'adet', e.target.value)}
                          className={inputSmCls(dk)}
                          {...sayiInputProps}
                        />
                      </div>
                      {ist.fire_var && (
                        <div>
                          <p className={`text-xs mb-1 ${dk ? 'text-red-500/70' : 'text-red-400'}`}>Fire/Hurda</p>
                          <input
                            type="number"
                            min={0}
                            value={ist.fire_adet}
                            onChange={e => istasyonGuncelle(ist.id, 'fire_adet', e.target.value)}
                            className={inputFireCls(dk)}
                            {...sayiInputProps}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Araç Yükleme */}
          <div className={sectionCls(dk)}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${dk ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                  <Truck size={14} className="text-blue-500" />
                </div>
                <h2 className={`font-semibold text-sm ${txtPrimary(dk)}`}>Araç Yükleme</h2>
              </div>
              {!aracEkleAcik && (
                <button
                  type="button"
                  onClick={() => setAracEkleAcik(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold rounded-xl transition-colors"
                >
                  <Plus size={13} /> Araç Ekle
                </button>
              )}
            </div>
            {aracYuklemeleri.length === 0 && !aracEkleAcik && (
              <div className={`rounded-xl border p-4 text-center ${dk ? 'border-gray-700/40 bg-gray-800/20' : 'border-gray-100 bg-gray-50'}`}>
                <p className={`text-xs ${txtMuted(dk)}`}>Henüz araç eklenmedi.</p>
              </div>
            )}
            <div className="space-y-2">
              {aracYuklemeleri.map(a => (
                <div key={a.uid} className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 border ${dk ? 'bg-gray-800/50 border-gray-700/50' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Truck size={14} className={`shrink-0 ${dk ? 'text-blue-400' : 'text-blue-500'}`} />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${txtPrimary(dk)}`}>{aracAdiGoster(a)}</p>
                      {a.tip === 'harici' && <p className={`text-xs ${txtMuted(dk)}`}>Harici araç</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-mono font-semibold ${dk ? 'text-amber-400' : 'text-amber-600'}`}>{a.adet} adet</span>
                    <button
                      type="button"
                      onClick={() => aracSil(a.uid)}
                      className={`p-1.5 rounded-lg transition-colors ${dk ? 'text-gray-600 hover:text-red-400 hover:bg-red-950/30' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {aracEkleAcik && (
              <AracEkleForm mevcutAraclar={araclar} dk={dk} onEkle={aracEkle} onIptal={() => setAracEkleAcik(false)} />
            )}
          </div>

          {/* Personel Bilgisi */}
          <div className={sectionCls(dk)}>
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${dk ? 'bg-violet-500/10' : 'bg-violet-50'}`}>
                <Users size={14} className="text-violet-500" />
              </div>
              <h2 className={`font-semibold text-sm ${txtPrimary(dk)}`}>Personel Bilgisi</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${txtMuted(dk)}`}>Toplam Personel Sayısı</label>
                <input
                  type="number"
                  min={0}
                  value={toplamPersonel}
                  onChange={e => setToplamPersonel(Math.max(0, parseInt(e.target.value) || 0))}
                  className={inputCls(dk)}
                  {...sayiInputProps}
                />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${txtMuted(dk)}`}>Açıklama / Notlar</label>
                <textarea
                  value={notlar}
                  onChange={e => setNotlar(e.target.value)}
                  placeholder="Geç gelenler, eksik personel veya diğer notlar…"
                  rows={3}
                  className={`${inputCls(dk)} resize-none`}
                />
              </div>
            </div>
          </div>

          {/* RAPORU KAYDET - SADECE EN ALTTA */}
          <button
            type="button"
            onClick={ozetGoster}
            className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-base rounded-2xl transition-colors"
          >
            <FileText size={18} /> Raporu Kaydet
          </button>

          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}

// ─── ÖZET EKRANI ──────────────────────────────────────────────────────────────
function OzetEkrani({
  personel,
  tema,
  veri,
  onDuzenle,
  onSonKayitlar,
  onCikis,
  onTemaDegistir,
  onKaydedildi,
}: {
  personel: HrPersonel
  tema: Tema
  veri: RaporData
  onDuzenle: () => void
  onSonKayitlar: () => void
  onCikis: () => void
  onTemaDegistir: () => void
  onKaydedildi: (raporId: string) => void
}) {
  const dk = tema === 'dark'
  const tarih = bugunTarih()
  const [kaydediyor, setKaydediyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [yerelKaydedildi, setYerelKaydedildi] = useState(false)

  const isKaydedildi = veri.kaydedildi || yerelKaydedildi

  function aracAdiGoster(a: AracYuklemeForm): string {
    if (a.tip === 'harici') return `${a.dis_plaka}${a.dis_ad ? ` — ${a.dis_ad}` : ''}`
    const kayit = veri.araclarListesi.find(ar => ar.id === a.arac_id)
    return kayit ? `${kayit.plaka} — ${kayit.ad}` : 'Araç'
  }

  async function onayla() {
    setKaydediyor(true)
    setHata(null)
    try {
      const { data: rapor, error: rErr } = await supabase
        .from('gunluk_uretim_raporlari')
        .upsert(
          {
            tarih,
            operator_id: personel.id,
            toplam_personel: veri.toplamPersonel,
            notlar: veri.notlar.trim() || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tarih,operator_id' },
        )
        .select()
        .single()
      if (rErr) throw rErr

      for (const ist of veri.istasyonlar) {
        const { error } = await supabase
          .from('gunluk_uretim_istasyon_kayitlari')
          .upsert(
            { rapor_id: rapor.id, istasyon_id: ist.id, adet: ist.adet, fire_adet: ist.fire_adet },
            { onConflict: 'rapor_id,istasyon_id' },
          )
        if (error) throw error
      }

      await supabase.from('gunluk_uretim_arac_yuklemeleri').delete().eq('rapor_id', rapor.id)
      for (const a of veri.aracYuklemeleri) {
        const { error } = await supabase.from('gunluk_uretim_arac_yuklemeleri').insert({
          rapor_id: rapor.id,
          arac_id: a.arac_id,
          dis_arac_plakasi: a.dis_plaka || null,
          dis_arac_adi: a.dis_ad || null,
          adet: a.adet,
        })
        if (error) throw error
      }

      setYerelKaydedildi(true)
      onKaydedildi(rapor.id)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Kayıt hatası oluştu.')
    } finally {
      setKaydediyor(false)
    }
  }

  return (
    <div className={`min-h-screen flex flex-col ${pageBg(dk)}`}>
      <PageHeader
        tema={tema}
        onTemaDegistir={onTemaDegistir}
        rightContent={
          <div className="flex items-center gap-2">
            <button type="button" onClick={onSonKayitlar} className={btnSecCls(dk)}>
              <History size={14} /> <span className="hidden sm:inline">Son Kayıtlar</span>
            </button>
            <button type="button" onClick={onCikis} className={btnSecCls(dk)}>
              <LogOut size={14} /> <span className="hidden sm:inline">Çıkış</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

          {/* Başlık */}
          <div className={sectionCls(dk)}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isKaydedildi ? (dk ? 'bg-green-500/10' : 'bg-green-50') : (dk ? 'bg-amber-500/10' : 'bg-amber-50')}`}>
                {isKaydedildi
                  ? <CheckCircle2 size={18} className="text-green-500" />
                  : <FileText size={18} className="text-amber-500" />}
              </div>
              <div>
                <h1 className={`font-bold text-base ${txtPrimary(dk)}`}>Rapor Özeti</h1>
                <p className={`text-xs ${isKaydedildi ? 'text-green-400' : txtMuted(dk)}`}>
                  {isKaydedildi ? '✓ Rapor sisteme kaydedildi' : 'Onaylamadan önce bilgileri kontrol edin'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className={`text-xs font-medium mb-1 ${txtMuted(dk)}`}>Tarih</p>
                <p className={`text-sm font-semibold ${txtPrimary(dk)}`}>{bugunGoster()}</p>
              </div>
              <div>
                <p className={`text-xs font-medium mb-1 ${txtMuted(dk)}`}>Operatör</p>
                <div className="flex items-center gap-2">
                  <PersonelAvatar personel={personel} boyut="sm" dk={dk} />
                  <p className={`text-sm font-semibold ${txtPrimary(dk)}`}>{personel.ad_soyad}</p>
                </div>
              </div>
            </div>
          </div>

          {hata && (
            <div className={errBoxCls(dk)}>
              <AlertCircle size={14} className="shrink-0 mt-0.5" />{hata}
            </div>
          )}

          {/* İstasyon Detayları */}
          <div className={sectionCls(dk)}>
            <h2 className={`font-semibold text-sm mb-3 ${txtPrimary(dk)}`}>İstasyon Detayları</h2>
            <div className="space-y-2">
              {veri.istasyonlar.map(ist => (
                <div key={ist.id} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${dk ? 'border-gray-700/50 bg-gray-800/30' : 'border-gray-100 bg-gray-50'}`}>
                  <span className={`text-sm font-medium ${txtPrimary(dk)}`}>{ist.ad}</span>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className={`text-[10px] ${txtMuted(dk)}`}>Adet</p>
                      <p className={`text-sm font-bold ${dk ? 'text-amber-400' : 'text-amber-600'}`}>{ist.adet}</p>
                    </div>
                    {ist.fire_var && (
                      <div className="text-right">
                        <p className={`text-[10px] ${dk ? 'text-red-500/70' : 'text-red-400'}`}>Fire</p>
                        <p className="text-sm font-bold text-red-400">{ist.fire_adet}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Araç Yüklemeleri */}
          {veri.aracYuklemeleri.length > 0 && (
            <div className={sectionCls(dk)}>
              <h2 className={`font-semibold text-sm mb-3 ${txtPrimary(dk)}`}>Araç Yüklemeleri</h2>
              <div className="space-y-2">
                {veri.aracYuklemeleri.map(a => (
                  <div key={a.uid} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${dk ? 'border-gray-700/50 bg-gray-800/30' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <Truck size={13} className={dk ? 'text-blue-400' : 'text-blue-500'} />
                      <span className={`text-sm ${txtPrimary(dk)}`}>{aracAdiGoster(a)}</span>
                      {a.tip === 'harici' && <span className={`text-xs ${txtMuted(dk)}`}>(harici)</span>}
                    </div>
                    <span className={`text-sm font-mono font-semibold ${dk ? 'text-amber-400' : 'text-amber-600'}`}>{a.adet} adet</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notlar */}
          {veri.notlar.trim() && (
            <div className={sectionCls(dk)}>
              <h2 className={`font-semibold text-sm mb-2 ${txtPrimary(dk)}`}>Notlar</h2>
              <p className={`text-sm ${txtSub(dk)} whitespace-pre-wrap`}>{veri.notlar}</p>
            </div>
          )}

          {/* Aksiyon Butonları */}
          {isKaydedildi ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onDuzenle}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm transition-colors ${dk ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                <Pencil size={16} /> Düzenle
              </button>
              <button
                type="button"
                onClick={onSonKayitlar}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors"
              >
                <History size={16} /> Son Kayıtlar
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onDuzenle}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm transition-colors ${dk ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                <Pencil size={16} /> Düzenle
              </button>
              <button
                type="button"
                onClick={onayla}
                disabled={kaydediyor}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white transition-colors"
              >
                {kaydediyor ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {kaydediyor ? 'Kaydediliyor…' : 'Onayla ve Kaydet'}
              </button>
            </div>
          )}

          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}

// ─── SON KAYITLAR EKRANI ──────────────────────────────────────────────────────
type SonKayitPersonel = { ad_soyad: string; foto_url?: string | null }

type SonKayitRaporu = {
  id: string
  tarih: string
  created_at?: string
  toplam_personel: number | null
  notlar: string | null
  hr_personel: SonKayitPersonel | SonKayitPersonel[] | null
  gunluk_uretim_istasyon_kayitlari?: Array<{
    adet: number | null
    fire_adet: number | null
    istasyon: { ad: string; sira_no: number } | null
  }> | null
  gunluk_uretim_arac_yuklemeleri?: { id: string }[] | null
}

type SonGunKaydi = {
  tarih: string
  kayitlar: SonKayitRaporu[]
}

type SonKayitOperatorOzeti = { ad: string; foto_url: string | null; count: number }

type SonKayitIstasyonToplami = { ad: string; sira_no: number; adet: number; fire: number }

function sonKayitIstasyonToplamlari(kayitlar: SonKayitRaporu[]): SonKayitIstasyonToplami[] {
  const toplamlar = new Map<string, SonKayitIstasyonToplami>()
  kayitlar.forEach(kayit => {
    ;(kayit.gunluk_uretim_istasyon_kayitlari ?? []).forEach(istasyonKaydi => {
      const adet = Math.max(0, istasyonKaydi.adet ?? 0)
      const fire = Math.max(0, istasyonKaydi.fire_adet ?? 0)
      if (adet === 0 && fire === 0) return
      const ad = istasyonKaydi.istasyon?.ad ?? 'Bilinmeyen İstasyon'
      const sira_no = istasyonKaydi.istasyon?.sira_no ?? 0
      const anahtar = `${sira_no}:${ad}`
      const mevcut = toplamlar.get(anahtar) ?? { ad, sira_no, adet: 0, fire: 0 }
      mevcut.adet += adet
      mevcut.fire += fire
      toplamlar.set(anahtar, mevcut)
    })
  })
  return [...toplamlar.values()].sort((a, b) => a.sira_no - b.sira_no || a.ad.localeCompare(b.ad, 'tr'))
}

function sonKayitlariGunlereGrupla(kayitlar: SonKayitRaporu[]): SonGunKaydi[] {
  const map = new Map<string, SonKayitRaporu[]>()
  kayitlar.forEach(k => {
    if (!map.has(k.tarih)) map.set(k.tarih, [])
    map.get(k.tarih)!.push(k)
  })
  return Array.from(map.entries())
    .map(([tarih, gunKayitlari]) => ({ tarih, kayitlar: gunKayitlari }))
    .sort((a, b) => b.tarih.localeCompare(a.tarih))
    .slice(0, 10)
}

function sonKayitPersoneli(kayit: SonKayitRaporu): SonKayitPersonel | null {
  if (Array.isArray(kayit.hr_personel)) return kayit.hr_personel[0] ?? null
  return kayit.hr_personel
}

function operatorleriOzetle(kayitlar: SonKayitRaporu[]) {
  const map = new Map<string, SonKayitOperatorOzeti>()
  kayitlar.forEach(k => {
    const personel = sonKayitPersoneli(k)
    const ad = personel?.ad_soyad ?? 'Bilinmiyor'
    const mevcut = map.get(ad)
    if (mevcut) {
      mevcut.count += 1
    } else {
      map.set(ad, { ad, foto_url: personel?.foto_url ?? null, count: 1 })
    }
  })
  return Array.from(map.values())
}

function OperatorAvatarStack({ operatorlar, dk }: { operatorlar: SonKayitOperatorOzeti[]; dk: boolean }) {
  const gorunenler = operatorlar.slice(0, 4)
  const kalan = operatorlar.length - gorunenler.length

  return (
    <div className="flex items-center -space-x-2 shrink-0" title={operatorlar.map(op => op.ad).join(', ')}>
      {gorunenler.map(op => (
        <div key={op.ad} className={`relative w-9 h-9 rounded-xl ring-2 overflow-hidden flex items-center justify-center text-sm font-bold ${dk ? 'ring-gray-900 bg-amber-500/10 text-amber-400' : 'ring-white bg-amber-50 text-amber-600'}`}>
          <span>{op.ad.charAt(0).toUpperCase()}</span>
          {op.foto_url && (
            <img
              src={op.foto_url}
              alt={op.ad}
              className="absolute inset-0 w-full h-full object-cover"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          )}
        </div>
      ))}
      {kalan > 0 && (
        <div className={`w-9 h-9 rounded-xl ring-2 flex items-center justify-center text-[10px] font-bold ${dk ? 'ring-gray-900 bg-blue-500/10 text-blue-300' : 'ring-white bg-blue-50 text-blue-600'}`}>
          +{kalan}
        </div>
      )}
    </div>
  )
}

function SonKayitlarEkrani({
  tema,
  onGeri,
  onCikis,
  onTemaDegistir,
}: {
  tema: Tema
  onGeri: () => void
  onCikis: () => void
  onTemaDegistir: () => void
}) {
  const dk = tema === 'dark'
  const [gunler, setGunler] = useState<SonGunKaydi[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setYukleniyor(true)
      setHata(null)
      try {
        const { data, error } = await supabase
          .from('gunluk_uretim_raporlari')
          .select('id, tarih, created_at, toplam_personel, notlar, hr_personel(ad_soyad, foto_url), gunluk_uretim_istasyon_kayitlari(adet, fire_adet, istasyon:istasyon_id(ad, sira_no)), gunluk_uretim_arac_yuklemeleri(id)')
          .order('tarih', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) throw error
        setGunler(sonKayitlariGunlereGrupla((data ?? []) as unknown as SonKayitRaporu[]))
      } catch (err) {
        setHata(err instanceof Error ? err.message : 'Kayıtlar yüklenemedi.')
      } finally {
        setYukleniyor(false)
      }
    })()
  }, [])

  return (
    <div className={`min-h-screen flex flex-col ${pageBg(dk)}`}>
      <PageHeader
        tema={tema}
        onTemaDegistir={onTemaDegistir}
        rightContent={
          <div className="flex items-center gap-2">
            <button type="button" onClick={onGeri} className={btnSecCls(dk)}>
              <ArrowLeft size={14} /> Geri
            </button>
            <button type="button" onClick={onCikis} className={btnSecCls(dk)}>
              <LogOut size={14} /> Çıkış
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className={`text-base font-bold mb-4 ${txtPrimary(dk)}`}>Son 10 Günlük Rapor</h1>

          {yukleniyor && (
            <div className="flex items-center justify-center gap-2 py-12">
              <Loader2 size={18} className={`animate-spin ${dk ? 'text-gray-500' : 'text-gray-400'}`} />
              <span className={`text-sm ${txtMuted(dk)}`}>Yükleniyor…</span>
            </div>
          )}
          {hata && (
            <div className={`${errBoxCls(dk)} mb-4`}>
              <AlertCircle size={14} className="shrink-0 mt-0.5" />{hata}
            </div>
          )}
          {!yukleniyor && gunler.length === 0 && (
            <p className={`text-center py-12 text-sm ${txtMuted(dk)}`}>Henüz kaydedilmiş rapor bulunamadı.</p>
          )}

          <div className="space-y-3">
            {gunler.map(g => {
              const istasyonToplamlari = sonKayitIstasyonToplamlari(g.kayitlar)
              const aracSayisi = g.kayitlar.reduce(
                (toplam, kayit) => toplam + (kayit.gunluk_uretim_arac_yuklemeleri ?? []).length,
                0,
              )
              const personelSayisi = g.kayitlar.reduce(
                (enYuksek, kayit) => Math.max(enYuksek, kayit.toplam_personel ?? 0),
                0,
              )
              const operatorlar = operatorleriOzetle(g.kayitlar)
              const gunNotlari = g.kayitlar.flatMap(kayit => {
                const not = kayit.notlar?.trim()
                if (!not) return []
                return [{ id: kayit.id, operator: sonKayitPersoneli(kayit)?.ad_soyad ?? 'Bilinmiyor', not }]
              })
              const operatorMetni = operatorlar.map(op => op.count > 1 ? `${op.ad} (${op.count})` : op.ad).join(', ')
              const tekOperator = operatorlar.length === 1 ? operatorlar[0] : null
              const tekOperatorMetni = tekOperator
                ? (tekOperator.count > 1 ? `${tekOperator.ad} (${tekOperator.count})` : tekOperator.ad)
                : ''
              return (
                <div key={g.tarih} className={`rounded-2xl border p-4 ${dk ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
                    <div>
                      <p className={`text-sm font-semibold ${txtPrimary(dk)}`}>{tarihEtiketTr(g.tarih)}</p>
                      {g.kayitlar.length > 1 && (
                        <p className={`text-[10px] mt-0.5 ${txtMuted(dk)}`}>
                          {g.kayitlar.length} giriş birleştirildi
                          {g.kayitlar.some(k => k.created_at) && (
                            <span className="ml-1">
                              ({g.kayitlar
                                .filter(k => k.created_at)
                                .map(k => formatSaatTr(k.created_at!))
                                .join(', ')})
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {tekOperator ? (
                      <div className="flex items-center gap-2 min-w-0 sm:justify-end">
                        <PersonelAvatar personel={{ ad_soyad: tekOperator.ad, foto_url: tekOperator.foto_url }} boyut="sm" dk={dk} />
                        <p className={`text-xs truncate max-w-full sm:max-w-[180px] ${txtSub(dk)}`} title={tekOperatorMetni}>{tekOperatorMetni}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0 sm:justify-end">
                        <OperatorAvatarStack operatorlar={operatorlar} dk={dk} />
                        <div className="min-w-0 max-w-full sm:max-w-[180px] sm:text-right">
                          <p className={`text-xs ${txtSub(dk)}`}>{operatorlar.length} operatör</p>
                          <p className={`text-[10px] truncate ${txtMuted(dk)}`} title={operatorMetni}>{operatorMetni}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 ${dk ? 'bg-violet-500/10 border-violet-500/20 text-violet-300' : 'bg-violet-50 border-violet-200 text-violet-700'}`}>
                      <Users size={14} />
                      <span className="text-xs"><strong className="text-sm">{personelSayisi}</strong> personel</span>
                    </div>
                    <div className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 ${dk ? 'bg-blue-500/10 border-blue-500/20 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                      <Truck size={14} />
                      <span className="text-xs"><strong className="text-sm">{aracSayisi}</strong> araç</span>
                    </div>
                  </div>
                  {istasyonToplamlari.length === 0 ? (
                    <p className={`text-xs rounded-xl px-3 py-2 ${dk ? 'bg-gray-800 text-gray-500' : 'bg-gray-50 text-gray-400'}`}>
                      Bu gün için istasyon girişi bulunmuyor.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {istasyonToplamlari.map(istasyon => (
                        <div
                          key={`${istasyon.sira_no}:${istasyon.ad}`}
                          className={`rounded-xl border px-3 py-2.5 ${dk ? 'bg-gray-800/60 border-gray-700/60' : 'bg-gray-50 border-gray-200'}`}
                        >
                          <p className={`text-xs font-semibold mb-1.5 ${txtPrimary(dk)}`}>{istasyon.ad}</p>
                          <div className="flex items-center gap-4 text-xs">
                            {istasyon.adet > 0 && (
                              <span className={dk ? 'text-amber-400' : 'text-amber-600'}>
                                <strong className="text-sm">{istasyon.adet}</strong> adet
                              </span>
                            )}
                            {istasyon.fire > 0 && (
                              <span className={dk ? 'text-red-400' : 'text-red-500'}>
                                Fire: <strong className="text-sm">{istasyon.fire}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {gunNotlari.length > 0 && (
                    <div className={`mt-2 rounded-xl border px-3 py-2.5 ${dk ? 'bg-gray-800/60 border-gray-700/60' : 'bg-gray-50 border-gray-200'}`}>
                      <p className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${txtPrimary(dk)}`}>
                        <FileText size={12} /> Notlar
                      </p>
                      <div className="space-y-2">
                        {gunNotlari.map(gunNotu => (
                          <div key={gunNotu.id} className="min-w-0">
                            <p className={`text-[10px] font-semibold ${dk ? 'text-amber-400' : 'text-amber-600'}`}>{gunNotu.operator}</p>
                            <p className={`text-xs whitespace-pre-wrap break-words ${txtSub(dk)}`}>{gunNotu.not}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────
type Ekran = 'form' | 'ozet' | 'son_kayitlar'

export default function OperatorGirisPage() {
  const [tema, setTema] = useState<Tema>(() => {
    const kayitli = localStorage.getItem(LS_TEMA) as Tema | null
    return kayitli === 'light' ? 'light' : 'dark'
  })
  const [sonKullanici, setSonKullanici] = useState<SonKullanici | null>(null)
  const [aktifPersonel, setAktifPersonel] = useState<HrPersonel | null>(null)
  const [ekran, setEkran] = useState<Ekran>('form')
  const [raporData, setRaporData] = useState<RaporData | null>(null)
  const [ilkYukleniyor, setIlkYukleniyor] = useState(false)

  function temaDegistir() {
    setTema(prev => {
      const yeni: Tema = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(LS_TEMA, yeni)
      return yeni
    })
  }

  async function girisYap(p: HrPersonel) {
    setIlkYukleniyor(true)

    try {
      const tarih = bugunTarih()
      const [raporRes, istRes, aracRes, yetkiRes] = await zamanAsimli(Promise.all([
        supabase
          .from('gunluk_uretim_raporlari')
          .select('*, gunluk_uretim_istasyon_kayitlari(*), gunluk_uretim_arac_yuklemeleri(*)')
          .eq('tarih', tarih)
          .eq('operator_id', p.id)
          .maybeSingle(),
        supabase.from('uretim_istasyonlari').select('*').eq('aktif', true).order('sira_no'),
        supabase.from('araclar').select('id, plaka, ad').eq('aktif', true).order('plaka'),
        supabase
          .from('hr_personel_istasyon_yetkileri')
          .select('istasyon_id')
          .eq('personel_id', p.id),
      ]))
      if (raporRes.error) throw raporRes.error
      if (istRes.error) throw istRes.error
      if (aracRes.error) throw aracRes.error
      if (yetkiRes.error) throw yetkiRes.error

      const mevcut = raporRes.data as unknown as KayitliGunlukRapor | null
      if (mevcut) {
        const mevcutKayitlar = mevcut.gunluk_uretim_istasyon_kayitlari ?? []
        const yetkiliIds = p.uretim_yetkileri_sinirli
          ? new Set((yetkiRes.data ?? []).map(y => y.istasyon_id))
          : null
        const istasyonlarFull: IstasyonSatir[] = ((istRes.data ?? []) as IstasyonTanimi[])
          .filter(ist => !yetkiliIds || yetkiliIds.has(ist.id))
          .map(ist => {
          const k = mevcutKayitlar.find(x => x.istasyon_id === ist.id)
          return { id: ist.id, ad: ist.ad, sira_no: ist.sira_no, fire_var: ist.fire_var, adet: k?.adet ?? 0, fire_adet: k?.fire_adet ?? 0 }
          })
        const yuklemeler: AracYuklemeForm[] = (mevcut.gunluk_uretim_arac_yuklemeleri ?? []).map(y => ({
          uid: Math.random().toString(36).slice(2),
          tip: y.arac_id ? 'mevcut' : 'harici',
          arac_id: y.arac_id ?? null,
          dis_plaka: y.dis_arac_plakasi ?? '',
          dis_ad: y.dis_arac_adi ?? '',
          adet: y.adet,
        }))
        const rd: RaporData = {
          istasyonlar: istasyonlarFull,
          aracYuklemeleri: yuklemeler,
          araclarListesi: (aracRes.data ?? []) as AracKayit[],
          toplamPersonel: mevcut.toplam_personel ?? 0,
          notlar: mevcut.notlar ?? '',
          kaydedildi: true,
          raporId: mevcut.id,
        }
        setRaporData(rd)
        setEkran('ozet')
      } else {
        setRaporData(null)
        setEkran('form')
      }
      const sk: SonKullanici = { id: p.id, ad_soyad: p.ad_soyad, foto_url: p.foto_url ?? null, rol: p.rol }
      setSonKullanici(sk)
      setAktifPersonel(p)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Çizelge verileri yüklenemedi.')
    } finally {
      setIlkYukleniyor(false)
    }
  }

  async function cikisYap() {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
    setAktifPersonel(null)
    setSonKullanici(null)
    setEkran('form')
    setRaporData(null)
    window.location.replace('/giris')
  }

  if (!aktifPersonel) {
    return (
      <GirisEkrani
        sonKullanici={sonKullanici}
        tema={tema}
        onGiris={girisYap}
        onHesapDegistir={cikisYap}
        onTemaDegistir={temaDegistir}
      />
    )
  }

  if (ilkYukleniyor) {
    const dk = tema === 'dark'
    return (
      <div className={`min-h-screen flex flex-col ${pageBg(dk)}`}>
        <PageHeader tema={tema} onTemaDegistir={temaDegistir} />
        <div className="flex-1 flex items-center justify-center gap-2">
          <Loader2 size={20} className={`animate-spin ${dk ? 'text-gray-500' : 'text-gray-400'}`} />
          <span className={`text-sm ${txtMuted(dk)}`}>Kontrol ediliyor…</span>
        </div>
      </div>
    )
  }

  if (ekran === 'son_kayitlar') {
    return (
      <SonKayitlarEkrani
        tema={tema}
        onGeri={() => setEkran(raporData ? (raporData.kaydedildi ? 'ozet' : 'form') : 'form')}
        onCikis={cikisYap}
        onTemaDegistir={temaDegistir}
      />
    )
  }

  if (ekran === 'ozet' && raporData) {
    return (
      <OzetEkrani
        personel={aktifPersonel}
        tema={tema}
        veri={raporData}
        onDuzenle={() => setEkran('form')}
        onSonKayitlar={() => setEkran('son_kayitlar')}
        onCikis={cikisYap}
        onTemaDegistir={temaDegistir}
        onKaydedildi={raporId => setRaporData(prev => prev ? { ...prev, kaydedildi: true, raporId } : null)}
      />
    )
  }

  return (
    <GunlukRaporFormu
      personel={aktifPersonel}
      tema={tema}
      initialVeri={raporData}
      onOzetGoster={veri => { setRaporData(veri); setEkran('ozet') }}
      onSonKayitlar={() => setEkran('son_kayitlar')}
      onCikis={cikisYap}
      onTemaDegistir={temaDegistir}
    />
  )
}
