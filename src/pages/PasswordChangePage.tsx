import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'

export default function PasswordChangePage() {
  const { refreshAccess } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password.length < 12 || password !== confirm) {
      setError('Parola en az 12 karakter olmalı ve iki alan eşleşmelidir.')
      return
    }
    setSaving(true)
    const { error: authError } = await supabase.auth.updateUser({ password })
    if (authError) { setError(authError.message); setSaving(false); return }
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
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Yeni parola" autoComplete="new-password" className="mb-3 w-full rounded-lg border px-3 py-2" />
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Yeni parola tekrar" autoComplete="new-password" className="mb-3 w-full rounded-lg border px-3 py-2" />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button disabled={saving} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Kaydediliyor…' : 'Parolayı değiştir'}</button>
      </form>
    </main>
  )
}
