import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Loader2, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Role { id: string; name_tr: string }
interface Personel { id: string; ad_soyad: string }
interface UserRow { auth_user_id: string; email: string | null; display_name: string; username: string | null; account_type: string; is_active: boolean; must_change_password: boolean; user_roles?: Array<{ role_id: string; roles?: { name_tr?: string } }> }

export default function KullaniciYonetimiPanel() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [personnel, setPersonnel] = useState<Personel[]>([])
  const [form, setForm] = useState({ email: '', temporary_password: '', display_name: '', username: '', role_id: '', personel_id: '', account_type: 'personal' })
  const [temporaryPasswords, setTemporaryPasswords] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [userRes, roleRes, personelRes] = await Promise.all([
      supabase.functions.invoke('admin-users', { body: { operation: 'list' } }),
      supabase.from('roles').select('id, name_tr').eq('is_active', true).order('name_tr'),
      supabase.from('hr_personel').select('id, ad_soyad').eq('is_aktif', true).order('ad_soyad'),
    ])
    const firstError = userRes.error ?? roleRes.error ?? personelRes.error
    if (firstError) setError(firstError.message)
    else {
      setUsers((userRes.data?.users ?? []) as UserRow[]); setRoles((roleRes.data ?? []) as Role[]); setPersonnel((personelRes.data ?? []) as Personel[])
      setForm(current => ({ ...current, role_id: current.role_id || roleRes.data?.[0]?.id || '' }))
    }
    setLoading(false)
  }, [])
  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  async function invoke(body: Record<string, unknown>) {
    setError(null)
    const { error: invokeError } = await supabase.functions.invoke('admin-users', { body })
    if (invokeError) setError(invokeError.message); else await load()
  }
  async function create() {
    await invoke({ operation: 'create', ...form, personel_id: form.personel_id || null })
    setForm(current => ({ ...current, email: '', temporary_password: '', display_name: '', username: '' }))
  }
  async function setTemporaryPassword(authUserId: string) {
    const temporaryPassword = temporaryPasswords[authUserId] ?? ''
    if (temporaryPassword.length < 12) { setError('Geçici parola en az 12 karakter olmalıdır.'); return }
    await invoke({ operation: 'temporary_password', auth_user_id: authUserId, temporary_password: temporaryPassword })
    setTemporaryPasswords(current => ({ ...current, [authUserId]: '' }))
  }
  return <div className="p-6 space-y-5">
    <div><h2 className="text-lg font-bold">Auth Kullanıcıları</h2><p className="text-sm text-gray-500">Mevcut parola hiçbir zaman görüntülenmez; yalnızca geçici parola veya sıfırlama uygulanır.</p></div>
    <div className="grid gap-2 rounded-xl border bg-gray-50 p-4 md:grid-cols-3"><input placeholder="E-posta" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" /><input type="password" placeholder="Geçici parola (min. 12)" value={form.temporary_password} onChange={e => setForm(v => ({ ...v, temporary_password: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" /><input placeholder="Ad soyad" value={form.display_name} onChange={e => setForm(v => ({ ...v, display_name: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" /><input placeholder="Kullanıcı adı" value={form.username} onChange={e => setForm(v => ({ ...v, username: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm" /><select value={form.role_id} onChange={e => setForm(v => ({ ...v, role_id: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm">{roles.map(role => <option key={role.id} value={role.id}>{role.name_tr}</option>)}</select><select value={form.personel_id} onChange={e => setForm(v => ({ ...v, personel_id: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm"><option value="">Personel bağlantısı yok</option>{personnel.map(p => <option key={p.id} value={p.id}>{p.ad_soyad}</option>)}</select><select value={form.account_type} onChange={e => setForm(v => ({ ...v, account_type: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm"><option value="personal">Kişisel</option><option value="device">Cihaz</option></select><button onClick={() => void create()} className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"><Plus size={14} />Kullanıcı oluştur</button></div>
    {error && <p className="text-sm text-red-600">{error}</p>}
    {loading ? <Loader2 className="animate-spin" /> : <div className="space-y-2">{users.map(user => <div key={user.auth_user_id} className="rounded-xl border p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">{user.display_name || user.email}</p><p className="text-xs text-gray-500">{user.email} · {user.user_roles?.[0]?.roles?.name_tr ?? 'rol yok'} · {user.account_type}{user.must_change_password ? ' · parola değişimi bekliyor' : ''}</p></div><div className="flex flex-wrap gap-2"><select aria-label="Kullanıcı rolü" value={user.user_roles?.[0]?.role_id ?? ''} onChange={e => void invoke({ operation: 'assign_role', auth_user_id: user.auth_user_id, role_id: e.target.value })} className="rounded border px-2 py-1 text-xs">{roles.map(role => <option key={role.id} value={role.id}>{role.name_tr}</option>)}</select><button onClick={() => void invoke({ operation: 'reset_password', email: user.email, auth_user_id: user.auth_user_id })} className="rounded border px-2 py-1 text-xs"><RefreshCw size={12} className="inline" /> Sıfırlama gönder</button><button onClick={() => void invoke({ operation: user.is_active ? 'deactivate' : 'activate', auth_user_id: user.auth_user_id })} className="rounded border px-2 py-1 text-xs">{user.is_active ? 'İptal et' : 'Etkinleştir'}</button></div></div><div className="mt-2 flex max-w-md gap-2"><input type="password" autoComplete="new-password" placeholder="Yeni geçici parola (min. 12)" value={temporaryPasswords[user.auth_user_id] ?? ''} onChange={e => setTemporaryPasswords(current => ({ ...current, [user.auth_user_id]: e.target.value }))} className="min-w-0 flex-1 rounded border px-2 py-1 text-xs" /><button onClick={() => void setTemporaryPassword(user.auth_user_id)} className="rounded border px-2 py-1 text-xs"><KeyRound size={12} className="inline" /> Geçici parola ata</button></div></div>)}</div>}
  </div>
}
