import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'

export default function LoginPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) return <Navigate to="/" replace />

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (signInError) {
      setError('E-posta veya parola hatalı.')
      return
    }
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    navigate(from, { replace: true })
  }

  async function resetPassword() {
    if (!email.trim()) {
      setError('Parola sıfırlama için e-posta adresinizi yazın.')
      return
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/parola-degistir`,
    })
    setError(resetError ? resetError.message : 'Parola sıfırlama bağlantısı gönderildi.')
  }

  return (
    <main className="min-h-screen grid place-items-center bg-gray-950 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600"><ShieldCheck className="text-white" size={21} /></div>
          <div><h1 className="font-bold text-white">OrtaklarV2</h1><p className="text-xs text-gray-400">Güvenli kullanıcı girişi</p></div>
        </div>
        <label className="mb-1 block text-xs font-medium text-gray-300">E-posta</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="username" required className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
        <label className="mb-1 block text-xs font-medium text-gray-300">Parola</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" required className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
        {error && <p className="mb-4 rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</p>}
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Giriş yap
        </button>
        <button type="button" onClick={resetPassword} className="mt-3 w-full text-xs text-blue-300 hover:text-blue-200">Parolamı unuttum</button>
      </form>
    </main>
  )
}
