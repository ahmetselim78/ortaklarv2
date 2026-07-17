import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'

interface TotpEnrollment { id: string; qr_code: string; secret: string }

export default function MfaPage() {
  const { refreshAccess } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors()
      const verified = data?.totp.find(f => f.status === 'verified')
      if (verified) { setFactorId(verified.id); return }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'OrtaklarV2 Yönetici' })
      if (enrollError) { setError(enrollError.message); return }
      setFactorId(enrolled.id)
      setEnrollment({ id: enrolled.id, qr_code: enrolled.totp.qr_code, secret: enrolled.totp.secret })
    })()
  }, [])

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    if (!factorId) return
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError) { setError(challengeError.message); return }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    if (verifyError) { setError('Doğrulama kodu geçersiz.'); return }
    await refreshAccess()
    navigate((location.state as { from?: string } | null)?.from ?? '/admin', { replace: true })
  }

  return (
    <main className="min-h-screen grid place-items-center bg-gray-50 p-4">
      <form onSubmit={verify} className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold">İki adımlı doğrulama</h1>
        {enrollment && <><p className="mt-2 text-sm text-gray-600">QR kodunu doğrulayıcı uygulamanızla tarayın.</p><img src={enrollment.qr_code} alt="TOTP QR kodu" className="mx-auto my-4 h-48 w-48" /><p className="mb-3 break-all text-xs text-gray-500">Manuel anahtar: {enrollment.secret}</p></>}
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6 haneli kod" className="w-full rounded-lg border px-3 py-2 text-center tracking-widest" />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button disabled={code.length !== 6 || !factorId} className="mt-4 w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white disabled:opacity-50">Doğrula</button>
      </form>
    </main>
  )
}
