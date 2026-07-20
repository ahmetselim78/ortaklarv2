import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  ChevronRight,
  KeyRound,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/passwordPolicy'
import { supabase } from '@/lib/supabase'

type OpenSection = 'password' | null

interface AccountDrawerProps {
  open: boolean
  onClose: () => void
}

export default function AccountDrawer({ open, onClose }: AccountDrawerProps) {
  const { access, session, signOut, hasPermission } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [openSection, setOpenSection] = useState<OpenSection>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [saving, setSaving] = useState<OpenSection>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const displayName = access?.user.display_name || session?.user.email || 'Oturum sahibi'
  const roleName = access?.role?.name_tr
    ?? (access?.user.account_type === 'device'
      ? 'Cihaz hesabı'
      : access?.user.account_type === 'canary'
        ? 'Canary hesabı'
        : 'Kişisel hesap')
  const avatarUrl = session?.user.user_metadata?.avatar_url || session?.user.user_metadata?.picture
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toLocaleUpperCase('tr-TR'))
    .join('') || 'K'
  const isAal2 = access?.aal === 'aal2'
  const canOpenMfa = hasPermission('admin', 'manage') || Boolean(access?.user.must_change_password)

  useEffect(() => {
    if (!open) return
    window.setTimeout(() => closeButtonRef.current?.focus(), 50)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, session?.user.email])

  function toggleSection(section: Exclude<OpenSection, null>) {
    setMessage(null)
    setOpenSection(current => current === section ? null : section)
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (!isValidPassword(password) || password !== passwordConfirm) {
      setMessage({ type: 'error', text: `${PASSWORD_POLICY_MESSAGE} İki parola alanı aynı olmalıdır.` })
      return
    }

    setSaving('password')
    setMessage(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      const needsAal2 = /aal2 session is required/i.test(error.message)
      setMessage({
        type: 'error',
        text: needsAal2
          ? 'Şifreyi değiştirmek için önce iki adımlı doğrulamayı tamamlayın.'
          : error.message,
      })
    } else {
      setPassword('')
      setPasswordConfirm('')
      setOpenSection(null)
      setMessage({ type: 'success', text: 'Şifreniz başarıyla değiştirildi.' })
    }
    setSaving(null)
  }

  function openMfa() {
    onClose()
    navigate('/mfa', { state: { from: location.pathname } })
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/giris', { replace: true })
  }

  return (
    <>
      <button
        type="button"
        aria-label="Hesap panelini kapat"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[3px] transition-all duration-300 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Hesap ve güvenlik"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(92vw,410px)] flex-col overflow-hidden border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Hesabım</p>
            <h2 className="mt-1 text-xl font-bold leading-tight tracking-[-0.02em] text-slate-900">Hesap ve güvenlik</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Kapat"
          >
            <X size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex items-center gap-3.5 rounded-2xl bg-slate-950 p-4 text-white shadow-sm">
            <div className="grid h-13 w-13 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-600 text-sm font-bold ring-2 ring-white/20">
              {avatarUrl
                ? <img src={avatarUrl} alt="Profil fotoğrafı" className="h-full w-full object-cover" />
                : initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-[15px] font-semibold leading-5 tracking-[-0.01em]">{displayName}</p>
              <p className="mt-1 truncate text-[12px] leading-none text-slate-400">{session?.user.email}</p>
              <span className="mt-2.5 inline-flex max-w-full whitespace-normal break-words rounded-full bg-blue-500/15 px-2.5 py-1 text-[10px] font-bold uppercase leading-4 tracking-[0.08em] text-blue-300">
                {roleName}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Güvenlik durumu</p>
            <div className={`rounded-2xl border p-4 ${isAal2 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-start gap-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${isAal2 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {isAal2 ? <BadgeCheck size={19} /> : <ShieldCheck size={19} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] font-semibold leading-tight ${isAal2 ? 'text-emerald-900' : 'text-amber-900'}`}>
                    {isAal2 ? 'İki adımlı doğrulandı' : 'Standart doğrulama'}
                  </p>
                  <p className={`mt-1.5 text-[12px] leading-[1.5] ${isAal2 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {isAal2 ? 'Bu oturum ek güvenlik adımıyla korunuyor.' : 'Hassas işlemler için ek doğrulama gerekebilir.'}
                  </p>
                </div>
              </div>
              {!isAal2 && canOpenMfa && (
                <button type="button" onClick={openMfa} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white/70 px-3 py-2 text-xs font-bold text-amber-900 transition-colors hover:bg-white">
                  İki adımlı doğrulamayı aç <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Hesap işlemleri</p>

            <button type="button" onClick={() => toggleSection('password')} aria-expanded={openSection === 'password'} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-left transition-colors hover:border-violet-200 hover:bg-violet-50/50">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600"><KeyRound size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-tight text-slate-800">Şifreyi değiştir</span>
                <span className="mt-1 block text-[11px] leading-none text-slate-500">Yeni ve güçlü bir şifre belirleyin</span>
              </span>
              <ChevronRight size={16} className={`text-slate-400 transition-transform ${openSection === 'password' ? 'rotate-90' : ''}`} />
            </button>

            {openSection === 'password' && (
              <form onSubmit={changePassword} className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                <label htmlFor="account-password" className="mb-1.5 block text-xs font-bold text-slate-700">Yeni şifre</label>
                <input id="account-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                <label htmlFor="account-password-confirm" className="mb-1.5 mt-2 block text-xs font-bold text-slate-700">Yeni şifre tekrar</label>
                <input id="account-password-confirm" type="password" value={passwordConfirm} onChange={event => setPasswordConfirm(event.target.value)} autoComplete="new-password" required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">En az 6 karakter; büyük/küçük harf, rakam ve özel karakter kullanın.</p>
                <button disabled={saving === 'password'} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60">
                  {saving === 'password' && <LoaderCircle size={14} className="animate-spin" />}
                  Şifreyi güncelle
                </button>
              </form>
            )}
          </div>

          {message && (
            <p role="status" className={`mt-4 rounded-xl border px-3 py-2.5 text-xs font-medium leading-relaxed ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {message.text}
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50 p-4">
          <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">
            {signingOut ? <LoaderCircle size={17} className="animate-spin" /> : <LogOut size={17} />}
            {signingOut ? 'Çıkış yapılıyor…' : 'Çıkış yap'}
          </button>
        </div>

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center">
          <div className="h-12 w-1 rounded-l-full bg-slate-200" />
        </div>
      </section>
    </>
  )
}
