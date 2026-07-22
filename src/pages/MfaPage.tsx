import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'
import { canEnrollTotp, canOpenMfaFlow } from '@/lib/mfaAccessPolicy'

interface TotpEnrollment { id: string; qr_code: string; secret: string }

export default function MfaPage() {
  const { access, hasPermission, refreshAccess } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const requestedDestination = (location.state as { from?: string } | null)?.from
  const hasAdminPermission = hasPermission('admin', 'manage')
  const mfaFlowAllowed = canOpenMfaFlow({
    hasAdminPermission,
    mustChangePassword: access?.user.must_change_password ?? false,
    requestedDestination,
  })
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    void (async () => {
      if (!mfaFlowAllowed) {
        navigate('/yetkisiz', { replace: true })
        return
      }
      const { data, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) { setError('Doğrulama bilgileri yüklenemedi. Lütfen yeniden giriş yapın.'); setLoading(false); return }
      const verified = data?.totp.find(f => f.status === 'verified')
      if (verified) { setFactorId(verified.id); setLoading(false); return }
      if (!canEnrollTotp(hasAdminPermission)) {
        setError('Bu hesapta doğrulanmış TOTP bulunmuyor. Yeni QR kaydı yalnızca yönetici yetkisi olan hesaplar için açılır.')
        setLoading(false)
        return
      }
      const staleFactor = data?.all.find(f => f.factor_type === 'totp' && f.status === 'unverified')
      if (staleFactor) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: staleFactor.id })
        if (removeError) { setError('Yarım kalan doğrulama kaydı temizlenemedi. Lütfen yeniden giriş yapın.'); setLoading(false); return }
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'OrtaklarV2' })
      if (enrollError) { setError(enrollError.message); setLoading(false); return }
      setFactorId(enrolled.id)
      setEnrollment({ id: enrolled.id, qr_code: enrolled.totp.qr_code, secret: enrolled.totp.secret })
      setLoading(false)
    })()
  }, [hasAdminPermission, mfaFlowAllowed, navigate])

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    if (!factorId || verifying) return
    setVerifying(true)
    setError(null)
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError) { setError(challengeError.message); setVerifying(false); return }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    if (verifyError) { setError('Doğrulama kodu geçersiz veya süresi dolmuş. Yeni kodu deneyin.'); setCode(''); setVerifying(false); return }
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError || assurance?.currentLevel !== 'aal2') {
      setError('İki adımlı doğrulama tamamlanamadı. Lütfen yeni bir kodla tekrar deneyin.')
      setVerifying(false)
      return
    }
    await refreshAccess()
    const safeDestination = requestedDestination?.startsWith('/') && !requestedDestination.startsWith('//')
      ? requestedDestination
      : '/admin'
    const destination = access?.user.must_change_password ? '/parola-degistir' : safeDestination
    navigate(destination, {
      replace: true,
      state: destination === '/parola-degistir' ? { mfaVerified: true } : undefined,
    })
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] text-slate-950">
      <div aria-hidden="true" className="absolute -left-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-blue-500/15 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-40 right-0 h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-12">
        <section className="mx-auto w-full max-w-lg text-white lg:mx-0">
          <div className="mb-10 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/25">
              <ShieldCheck size={23} aria-hidden="true" />
            </div>
            <div>
              <p className="font-bold tracking-tight">OrtaklarV2</p>
              <p className="text-xs text-slate-400">Güvenli oturum doğrulaması</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            <BadgeCheck size={15} aria-hidden="true" /> İlk faktör doğrulandı
          </span>
          <h1 className="mt-5 max-w-md text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
            Son bir güvenlik adımı.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
            Parolanızla giriş tamamlandı. Hesabın gerçekten size ait olduğunu doğrulamak için uygulamanızdaki tek kullanımlık kodu girin.
          </p>

          <div className="mt-9 max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                <BadgeCheck size={20} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">1. faktör</p>
                <p className="text-sm font-medium text-slate-100">E-posta ve parola</p>
              </div>
              <span className="text-xs font-semibold text-emerald-300">Tamamlandı</span>
            </div>
            <div className="mx-8 h-3 border-l border-dashed border-slate-700" />
            <div className="flex items-center gap-3 rounded-xl border border-blue-400/20 bg-blue-400/10 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-500 text-white shadow-md shadow-blue-500/20">
                <KeyRound size={19} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300/70">2. faktör</p>
                <p className="text-sm font-medium text-white">6 haneli güvenlik kodu</p>
              </div>
              <span className="rounded-full bg-blue-400/15 px-2.5 py-1 text-xs font-semibold text-blue-200">Şimdi</span>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl">
          <form onSubmit={verify} className="rounded-[2rem] border border-white/50 bg-white/95 p-5 shadow-[0_35px_100px_-30px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:p-8">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Kimlik doğrulama</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  {enrollment ? 'Doğrulayıcıyı bağlayın' : 'Güvenlik kodunu girin'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {enrollment
                    ? 'QR kodunu uygulamanızla tarayın, ardından oluşan kodu aşağıya yazın.'
                    : 'Doğrulayıcı uygulamanızda görünen güncel kodu kullanın.'}
                </p>
              </div>
              <div className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700 sm:grid">
                <Smartphone size={22} aria-hidden="true" />
              </div>
            </div>

            {enrollment && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 sm:grid-cols-[9rem_1fr] sm:items-center">
                  <div className="mx-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                    <img src={enrollment.qr_code} alt="Doğrulayıcı uygulama için TOTP QR kodu" className="h-32 w-32" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Telefonunuzla tarayın</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Google Authenticator, Microsoft Authenticator veya uyumlu bir uygulama kullanabilirsiniz.</p>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Manuel kurulum anahtarı</p>
                    <code className="mt-1 block break-all rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold tracking-wide text-slate-700">{enrollment.secret}</code>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6">
              <label htmlFor="mfa-code" className="mb-2 block text-sm font-semibold text-slate-800">6 haneli doğrulama kodu</label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="mfa-code"
                  aria-describedby="mfa-code-help"
                  aria-invalid={Boolean(error)}
                  autoFocus
                  disabled={loading || verifying}
                  value={code}
                  onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={loading ? 'Hazırlanıyor…' : '000 000'}
                  className="h-14 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-center text-xl font-bold tracking-[0.45em] text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100"
                />
              </div>
              <p id="mfa-code-help" className="mt-2 text-xs leading-5 text-slate-500">Kodlar yaklaşık 30 saniyede bir yenilenir. En güncel kodu girdiğinizden emin olun.</p>
            </div>

            {error && (
              <div role="alert" aria-live="polite" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
                {error}
              </div>
            )}

            <button
              disabled={loading || verifying || code.length !== 6 || !factorId}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {verifying ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
              {verifying ? 'Doğrulanıyor…' : 'Doğrula ve devam et'}
              {!verifying && <ArrowRight size={17} aria-hidden="true" />}
            </button>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
              <LockKeyhole size={13} aria-hidden="true" /> Kodunuz hiçbir zaman saklanmaz
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
