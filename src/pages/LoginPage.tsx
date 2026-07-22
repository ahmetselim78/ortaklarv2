import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getSignInErrorMessage } from '@/lib/authError'
import { useAuth } from '@/auth/AuthContext'

type Notice = { type: 'error' | 'success'; message: string }

export default function LoginPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  if (session) return <Navigate to="/" replace />

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setNotice(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (signInError) {
      setNotice({ type: 'error', message: getSignInErrorMessage(signInError) })
      return
    }
    const requestedDestination = (location.state as { from?: string } | null)?.from
    const destination = requestedDestination?.startsWith('/') && !requestedDestination.startsWith('//')
      ? requestedDestination
      : '/'
    navigate(destination, { replace: true })
  }

  async function resetPassword() {
    if (!email.trim()) {
      setNotice({ type: 'error', message: 'Parola sıfırlama için önce e-posta adresinizi yazın.' })
      return
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/parola-degistir`,
    })
    setNotice(resetError
      ? { type: 'error', message: resetError.message }
      : { type: 'success', message: 'Parola sıfırlama bağlantısı e-posta adresinize gönderildi.' })
  }

  return (
    <main className="relative h-dvh max-h-dvh overflow-hidden bg-[#07111f] text-slate-950">
      <div aria-hidden="true" className="auth-glow absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-blue-500/20 blur-3xl" />
      <div aria-hidden="true" className="auth-glow auth-delay-2 absolute -bottom-52 right-[-8rem] h-[38rem] w-[38rem] rounded-full bg-cyan-400/10 blur-3xl" />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />

      <div className="relative mx-auto grid h-full min-h-0 w-full max-w-7xl min-w-0 content-center items-start gap-4 px-4 py-4 sm:gap-6 sm:px-8 sm:py-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16 lg:px-12 lg:py-8">
        <section className="auth-enter mx-auto min-w-0 w-full max-w-lg text-white lg:mx-0">
          <div className="flex items-center gap-3 lg:mb-12">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/25">
              <ShieldCheck size={23} aria-hidden="true" />
            </div>
            <div>
              <p className="font-bold tracking-tight">OrtaklarV2</p>
              <p className="text-xs text-slate-400">Güvenli çalışma alanı</p>
            </div>
          </div>

          <div className="hidden lg:block">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
              <Sparkles size={14} aria-hidden="true" /> Her şey tek bir güvenli alanda
            </span>
            <h1 className="mt-5 max-w-lg text-5xl font-bold leading-[1.06] tracking-tight">
              İşinize kaldığınız yerden devam edin.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
              Üretimden sevkiyata tüm operasyonlarınıza güvenli ve hızlı biçimde erişin.
            </p>

            <div className="relative mt-10 h-52 max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
              <div aria-hidden="true" className="auth-orbit absolute -right-14 -top-24 h-72 w-72 rounded-full border border-blue-300/20" />
              <div aria-hidden="true" className="auth-orbit auth-orbit-reverse absolute -right-4 -top-14 h-52 w-52 rounded-full border border-dashed border-cyan-300/25" />
              <div className="relative z-10 flex h-full flex-col justify-between">
                <div className="auth-float flex w-fit items-center gap-3 rounded-2xl border border-white/10 bg-[#0d1a2c]/90 px-4 py-3 shadow-xl">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300"><Check size={18} aria-hidden="true" /></div>
                  <div><p className="text-xs text-slate-400">Güvenli bağlantı</p><p className="text-sm font-semibold">Verileriniz korunuyor</p></div>
                </div>
                <div className="auth-float auth-delay-1 ml-16 flex w-fit items-center gap-3 self-end rounded-2xl border border-blue-300/15 bg-blue-500/15 px-4 py-3 shadow-xl backdrop-blur-md">
                  <ShieldCheck size={20} className="text-blue-200" aria-hidden="true" />
                  <div><p className="text-xs text-blue-200/70">2 adımlı doğrulama</p><p className="text-sm font-semibold">Ek güvenlik katmanı</p></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-enter auth-delay-1 mx-auto min-w-0 w-full max-w-xl">
          <form onSubmit={submit} className="min-w-0 rounded-[1.75rem] border border-white/50 bg-white/[0.97] p-5 shadow-[0_35px_100px_-30px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:p-8 lg:rounded-[2rem] lg:p-10">
            <div className="mb-7">
              <div className="mb-5 flex items-center gap-3 lg:hidden">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                  <LockKeyhole size={19} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-950">Güvenli giriş</p>
                  <p className="text-xs text-slate-500">Hesabınıza devam edin</p>
                </div>
              </div>
              <p className="hidden text-xs font-bold uppercase tracking-[0.18em] text-blue-600 lg:block">Tekrar hoş geldiniz</p>
              <h2 className="text-[1.65rem] font-bold tracking-tight text-slate-950 sm:text-2xl lg:mt-2 lg:text-3xl">Hesabınıza giriş yapın</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Çalışma alanınıza erişmek için bilgilerinizi girin.</p>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-slate-800">E-posta adresi</label>
                <div className="relative">
                  <Mail aria-hidden="true" size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-email"
                    value={email}
                    onChange={event => { setEmail(event.target.value); setNotice(null) }}
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    required
                    placeholder="ornek@sirket.com"
                    className="h-14 min-w-0 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <label htmlFor="login-password" className="text-sm font-semibold text-slate-800">Parola</label>
                  <button type="button" onClick={resetPassword} className="text-xs font-semibold text-blue-600 transition hover:text-blue-800 focus:outline-none focus:underline">Parolamı unuttum</button>
                </div>
                <div className="relative">
                  <LockKeyhole aria-hidden="true" size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-password"
                    value={password}
                    onChange={event => { setPassword(event.target.value); setNotice(null) }}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    placeholder="Parolanızı girin"
                    className="h-14 min-w-0 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-12 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
                    className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </div>

            {notice && (
              <div
                role={notice.type === 'error' ? 'alert' : 'status'}
                aria-live="polite"
                className={`mt-5 rounded-xl border px-3.5 py-3 text-sm leading-5 ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
              >
                {notice.message}
              </div>
            )}

            <button
              disabled={loading}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
              {loading ? 'Giriş yapılıyor…' : 'Güvenli giriş yap'}
              {!loading && <ArrowRight size={17} aria-hidden="true" />}
            </button>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
              <LockKeyhole size={13} aria-hidden="true" /> Oturumunuz uçtan uca korunur
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
