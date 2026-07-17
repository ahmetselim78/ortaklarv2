import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, Loader2, Plus, RefreshCw, ShieldAlert, UserCheck, UserX } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/passwordPolicy'

interface Role { id: string; slug: string; name_tr: string }
interface Personel { id: string; ad_soyad: string }
interface UserRole { role_id: string; roles?: { slug?: string; name_tr?: string } }
interface UserRow {
  auth_user_id: string
  email: string | null
  display_name: string
  username: string | null
  account_type: string
  is_active: boolean
  must_change_password: boolean
  user_roles?: UserRole[]
}

async function functionErrorMessage(error: unknown) {
  const context = (error as { context?: Response } | null)?.context
  if (context) {
    try {
      const payload = await context.clone().json() as { error?: string }
      if (payload.error) return payload.error
    } catch { /* Yanıt JSON değilse standart hata mesajına düşülür. */ }
  }
  return error instanceof Error ? error.message : 'İşlem tamamlanamadı.'
}

export default function KullaniciYonetimiPanel() {
  const { access } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [personnel, setPersonnel] = useState<Personel[]>([])
  const [form, setForm] = useState({ email: '', temporary_password: '', display_name: '', username: '', role_id: '', personel_id: '', account_type: 'personal' })
  const [temporaryPasswords, setTemporaryPasswords] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const currentUserId = access?.user.auth_user_id
  const activeAdministratorCount = useMemo(() => users.filter(user => (
    user.is_active && user.user_roles?.[0]?.roles?.slug === 'administrator'
  )).length, [users])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [userRes, roleRes, personelRes] = await Promise.all([
      supabase.functions.invoke('admin-users', { body: { operation: 'list' } }),
      supabase.from('roles').select('id, slug, name_tr').eq('is_active', true).order('name_tr'),
      supabase.from('hr_personel').select('id, ad_soyad').eq('is_aktif', true).order('ad_soyad'),
    ])
    const firstError = userRes.error ?? roleRes.error ?? personelRes.error
    if (firstError) {
      setError(await functionErrorMessage(firstError))
    } else {
      setUsers((userRes.data?.users ?? []) as UserRow[])
      setRoles((roleRes.data ?? []) as Role[])
      setPersonnel((personelRes.data ?? []) as Personel[])
      setForm(current => ({ ...current, role_id: current.role_id || roleRes.data?.[0]?.id || '' }))
    }
    setLoading(false)
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  async function invoke(body: Record<string, unknown>, successMessage: string) {
    const operationKey = `${String(body.operation)}:${String(body.auth_user_id ?? body.email ?? 'new')}`
    setPending(operationKey)
    setError(null)
    setSuccess(null)
    const { data, error: invokeError } = await supabase.functions.invoke('admin-users', { body })
    if (invokeError || data?.error) {
      setError(data?.error ?? await functionErrorMessage(invokeError))
      setPending(null)
      return false
    }
    await load()
    setSuccess(successMessage)
    setPending(null)
    return true
  }

  async function create() {
    if (!form.email.trim() || !form.display_name.trim() || !form.role_id) {
      setError('E-posta, ad soyad ve rol zorunludur.')
      return
    }
    if (!isValidPassword(form.temporary_password)) {
      setError(PASSWORD_POLICY_MESSAGE)
      return
    }
    const created = await invoke(
      { operation: 'create', ...form, personel_id: form.personel_id || null },
      'Kullanıcı oluşturuldu. İlk girişte parola değişimi zorunludur.',
    )
    if (created) setForm(current => ({ ...current, email: '', temporary_password: '', display_name: '', username: '' }))
  }

  async function setTemporaryPassword(user: UserRow) {
    const temporaryPassword = temporaryPasswords[user.auth_user_id] ?? ''
    if (!isValidPassword(temporaryPassword)) {
      setError(PASSWORD_POLICY_MESSAGE)
      return
    }
    const changed = await invoke(
      { operation: 'temporary_password', auth_user_id: user.auth_user_id, temporary_password: temporaryPassword },
      `${user.display_name || user.email} için geçici parola atandı.`,
    )
    if (changed) setTemporaryPasswords(current => ({ ...current, [user.auth_user_id]: '' }))
  }

  async function changeRole(user: UserRow, roleId: string) {
    const currentRoleId = user.user_roles?.[0]?.role_id ?? ''
    if (roleId === currentRoleId) return
    if (user.auth_user_id === currentUserId) {
      setError('Güvenlik nedeniyle kendi rolünüzü değiştiremezsiniz.')
      return
    }
    const role = roles.find(item => item.id === roleId)
    if (!window.confirm(`${user.display_name || user.email} hesabının rolü “${role?.name_tr ?? 'seçili rol'}” olarak değiştirilsin mi?`)) return
    await invoke(
      { operation: 'assign_role', auth_user_id: user.auth_user_id, role_id: roleId },
      `${user.display_name || user.email} rolü güncellendi.`,
    )
  }

  async function changeActive(user: UserRow) {
    if (user.is_active && user.auth_user_id === currentUserId) {
      setError('Kendi hesabınızı pasifleştiremezsiniz.')
      return
    }
    const isLastAdministrator = user.is_active
      && user.user_roles?.[0]?.roles?.slug === 'administrator'
      && activeAdministratorCount <= 1
    if (isLastAdministrator) {
      setError('Son aktif yönetici hesabı pasifleştirilemez.')
      return
    }
    if (user.is_active && !window.confirm(`${user.display_name || user.email} hesabı pasifleştirilsin mi? Bu kullanıcı yeniden etkinleştirilene kadar giriş yapamaz.`)) return
    await invoke(
      { operation: user.is_active ? 'deactivate' : 'activate', auth_user_id: user.auth_user_id },
      user.is_active ? 'Hesap pasifleştirildi.' : 'Hesap yeniden etkinleştirildi.',
    )
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h2 className="text-lg font-bold">Hesap ve erişim yönetimi</h2>
        <p className="text-sm text-gray-500">Hesaplar bu ekrandan silinmez. Parolalar görüntülenmez; geçici parola, sıfırlama, rol ve aktiflik yönetilir.</p>
      </div>

      <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <ShieldAlert className="mt-0.5 shrink-0" size={16} />
        <p>Kendi hesabınız ve son aktif yönetici korunur. Rol değişikliği ve hesap pasifleştirme işlemleri ayrıca onay ister.</p>
      </div>

      <div className="grid gap-2 rounded-xl border bg-gray-50 p-4 md:grid-cols-3">
        <input type="email" placeholder="E-posta" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
        <input type="password" autoComplete="new-password" placeholder="Geçici parola (6+; büyük/küçük/rakam/özel)" value={form.temporary_password} onChange={e => setForm(v => ({ ...v, temporary_password: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
        <input placeholder="Ad soyad" value={form.display_name} onChange={e => setForm(v => ({ ...v, display_name: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
        <input placeholder="Kullanıcı adı (isteğe bağlı)" value={form.username} onChange={e => setForm(v => ({ ...v, username: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" />
        <select aria-label="Yeni kullanıcı rolü" value={form.role_id} onChange={e => setForm(v => ({ ...v, role_id: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm">{roles.map(role => <option key={role.id} value={role.id}>{role.name_tr}</option>)}</select>
        <select aria-label="Personel bağlantısı" value={form.personel_id} onChange={e => setForm(v => ({ ...v, personel_id: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm"><option value="">Personel bağlantısı yok</option>{personnel.map(person => <option key={person.id} value={person.id}>{person.ad_soyad}</option>)}</select>
        <select aria-label="Hesap tipi" value={form.account_type} onChange={e => {
          const accountType = e.target.value
          const deviceRole = roles.find(role => role.slug === 'viewer_device')
          setForm(v => ({ ...v, account_type: accountType, role_id: accountType === 'device' ? (deviceRole?.id ?? v.role_id) : v.role_id }))
        }} className="rounded-lg border px-3 py-2 text-sm"><option value="personal">Kişisel</option><option value="device">Cihaz</option></select>
        <button disabled={pending !== null} onClick={() => void create()} className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"><Plus size={14} />Kullanıcı oluştur</button>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

      {loading ? <Loader2 className="animate-spin" /> : (
        <div className="space-y-3">
          {users.map(user => {
            const isSelf = user.auth_user_id === currentUserId
            const roleSlug = user.user_roles?.[0]?.roles?.slug
            const isLastAdministrator = user.is_active && roleSlug === 'administrator' && activeAdministratorCount <= 1
            const actionPending = pending?.endsWith(`:${user.auth_user_id}`) ?? false
            return (
              <div key={user.auth_user_id} className={`rounded-xl border p-4 ${user.is_active ? 'bg-white' : 'bg-gray-50 opacity-75'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{user.display_name || user.email}</p>
                      {isSelf && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Bu hesap</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>{user.is_active ? 'Aktif' : 'Pasif'}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{user.email} · {user.user_roles?.[0]?.roles?.name_tr ?? 'rol yok'} · {user.account_type}{user.must_change_password ? ' · parola değişimi bekliyor' : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label={`${user.display_name || user.email} kullanıcı rolü`}
                      value={user.user_roles?.[0]?.role_id ?? ''}
                      disabled={isSelf || !user.is_active || actionPending}
                      title={isSelf ? 'Kendi rolünüzü değiştiremezsiniz' : undefined}
                      onChange={event => void changeRole(user, event.target.value)}
                      className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:bg-gray-100"
                    >{roles.map(role => <option key={role.id} value={role.id}>{role.name_tr}</option>)}</select>
                    <button disabled={!user.email || actionPending} onClick={() => void invoke({ operation: 'reset_password', email: user.email, auth_user_id: user.auth_user_id }, 'Parola sıfırlama bağlantısı gönderildi.')} className="rounded border px-2 py-1 text-xs disabled:opacity-50"><RefreshCw size={12} className="inline" /> Sıfırlama gönder</button>
                    <button
                      disabled={isSelf || isLastAdministrator || actionPending}
                      title={isSelf ? 'Kendi hesabınızı pasifleştiremezsiniz' : isLastAdministrator ? 'Son aktif yönetici korunur' : undefined}
                      onClick={() => void changeActive(user)}
                      className={`rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${user.is_active ? 'border-red-200 text-red-700' : 'border-emerald-200 text-emerald-700'}`}
                    >{user.is_active ? <><UserX size={12} className="inline" /> Hesabı pasifleştir</> : <><UserCheck size={12} className="inline" /> Hesabı etkinleştir</>}</button>
                  </div>
                </div>
                <div className="mt-3 flex max-w-lg gap-2">
                  <input type="password" autoComplete="new-password" placeholder="Yeni geçici parola (6+; büyük/küçük/rakam/özel)" value={temporaryPasswords[user.auth_user_id] ?? ''} onChange={e => setTemporaryPasswords(current => ({ ...current, [user.auth_user_id]: e.target.value }))} className="min-w-0 flex-1 rounded border px-2 py-1 text-xs" />
                  <button disabled={actionPending} onClick={() => void setTemporaryPassword(user)} className="rounded border px-2 py-1 text-xs disabled:opacity-50"><KeyRound size={12} className="inline" /> Geçici parola ata</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
