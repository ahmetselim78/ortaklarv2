import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
    <main className="min-h-screen grid place-items-center bg-gray-50 p-4">
      <form onSubmit={verify} className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold">İki adımlı doğrulama</h1>
        {enrollment && <><p className="mt-2 text-sm text-gray-600">QR kodunu doğrulayıcı uygulamanızla tarayın.</p><img src={enrollment.qr_code} alt="TOTP QR kodu" className="mx-auto my-4 h-48 w-48" /><p className="mb-3 break-all text-xs text-gray-500">Manuel anahtar: {enrollment.secret}</p></>}
        <input disabled={loading || verifying} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder={loading ? 'Hazırlanıyor…' : '6 haneli kod'} className="w-full rounded-lg border px-3 py-2 text-center tracking-widest disabled:bg-gray-100" />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button disabled={loading || verifying || code.length !== 6 || !factorId} className="mt-4 w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white disabled:opacity-50">{verifying ? 'Doğrulanıyor…' : 'Doğrula'}</button>
      </form>
    </main>
  )
}
