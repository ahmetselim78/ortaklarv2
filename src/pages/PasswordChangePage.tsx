import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/passwordPolicy'

export default function PasswordChangePage() {
  const { refreshAccess } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const mfaVerified = Boolean((location.state as { mfaVerified?: boolean } | null)?.mfaVerified)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [requiresAal2, setRequiresAal2] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setRequiresAal2(false)
    if (!isValidPassword(password) || password !== confirm) {
      setError(`${PASSWORD_POLICY_MESSAGE} İki alan eşleşmelidir.`)
      return
    }
    setSaving(true)
    const { error: authError } = await supabase.auth.updateUser({ password })
    if (authError) {
      setRequiresAal2(/aal2 session is required/i.test(authError.message))
      setError(/aal2 session is required/i.test(authError.message) ? 'Parola değiştirmek için önce iki adımlı doğrulama gerekir.' : authError.message)
      setSaving(false)
      return
    }
    const { error: rpcError } = await supabase.rpc('complete_password_change')
    if (rpcError) { setError(rpcError.message); setSaving(false); return }
    await refreshAccess()
    navigate('/', { replace: true })
  }

  return (
    <main className="min-h-screen grid place-items-center bg-gray-50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">Parolanızı değiştirin</h1>
        <p className="mb-5 mt-1 text-sm text-gray-500">Geçici parolayla devam edemezsiniz.</p>
        {mfaVerified && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">TOTP doğrulandı. Yeni parolanızı iki alana tekrar yazıp kaydedin.</p>}
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Yeni parola" autoComplete="new-password" className="mb-3 w-full rounded-lg border px-3 py-2" />
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Yeni parola tekrar" autoComplete="new-password" className="mb-3 w-full rounded-lg border px-3 py-2" />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {requiresAal2 && <button type="button" onClick={() => navigate('/mfa', { state: { from: '/parola-degistir' } })} className="mb-3 w-full rounded-lg border border-indigo-200 bg-indigo-50 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">Önce TOTP doğrula</button>}
        <button disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Kaydediliyor…' : 'Parolayı değiştir'}</button>
      </form>
    </main>
  )
}
