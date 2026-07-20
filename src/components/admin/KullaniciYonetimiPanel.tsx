import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, BadgeCheck, Clock3, Info, KeyRound, Link2, Loader2,
  Mail, Monitor, Pencil, Plus, RefreshCw, Search, ShieldCheck, UserCheck,
  Trash2, UserCog, Users, UserX, X,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import PersonelYonetimiPanel from '@/components/ayarlar/PersonelYonetimiPanel'
import { useEscape } from '@/hooks/useEscape'
import { supabase } from '@/lib/supabase'
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/passwordPolicy'

interface Role { id: string; slug: string; name_tr: string }
interface Personel { id: string; ad_soyad: string; rol: string; is_aktif: boolean }
interface UserRole { role_id: string; roles?: { slug?: string; name_tr?: string } }
interface UserRow {
  auth_user_id: string
  personel_id: string | null
  email: string | null
  display_name: string
  username: string | null
  account_type: 'personal' | 'device' | 'canary'
  is_active: boolean
  must_change_password: boolean
  last_sign_in_at: string | null
  personel?: Personel | null
  user_roles?: UserRole[]
}

type UserRowWire = Omit<UserRow, 'user_roles'> & { user_roles?: UserRole | UserRole[] | null }

type PanelSekmesi = 'hesaplar' | 'personel'
type DurumFiltresi = 'tumu' | 'aktif' | 'pasif'

const BOS_FORM = {
  email: '', temporary_password: '', display_name: '', username: '', role_id: '',
  personel_id: '', account_type: 'personal',
}

const inputSinifi = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-gray-100'

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

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?'
}

function tarihSaat(value: string | null) {
  if (!value) return 'Henüz giriş yapmadı'
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul',
  }).format(new Date(value))
}

function roleRenk(slug?: string) {
  if (slug === 'administrator') return 'border-violet-200 bg-violet-50 text-violet-700'
  if (slug === 'operator') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (slug === 'office_planning') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function normalizeUserRow(row: UserRowWire): UserRow {
  const roleRelation = row.user_roles
  return {
    ...row,
    user_roles: roleRelation ? (Array.isArray(roleRelation) ? roleRelation : [roleRelation]) : [],
  }
}

export default function KullaniciYonetimiPanel() {
  const { access } = useAuth()
  const [aktifSekme, setAktifSekme] = useState<PanelSekmesi>('hesaplar')
  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [personnel, setPersonnel] = useState<Personel[]>([])
  const [form, setForm] = useState(BOS_FORM)
  const [arama, setArama] = useState('')
  const [durumFiltresi, setDurumFiltresi] = useState<DurumFiltresi>('tumu')
  const [rolFiltresi, setRolFiltresi] = useState('tumu')
  const [yeniHesapAcik, setYeniHesapAcik] = useState(false)
  const [duzenlenenUserId, setDuzenlenenUserId] = useState<string | null>(null)
  const [pasiflestirilecekUser, setPasiflestirilecekUser] = useState<UserRow | null>(null)
  const [silinecekUser, setSilinecekUser] = useState<UserRow | null>(null)
  const [editRoleId, setEditRoleId] = useState('')
  const [editPersonelId, setEditPersonelId] = useState('')
  const [editTemporaryPassword, setEditTemporaryPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const currentUserId = access?.user.auth_user_id
  const duzenlenenUser = users.find(user => user.auth_user_id === duzenlenenUserId) ?? null
  const activeAdministratorCount = useMemo(() => users.filter(user => (
    user.is_active && user.user_roles?.[0]?.roles?.slug === 'administrator'
  )).length, [users])
  const deviceRole = useMemo(() => roles.find(role => role.slug === 'viewer_device'), [roles])
  const personalRoles = useMemo(() => roles.filter(role => role.slug !== 'viewer_device'), [roles])
  const duzenlemeDegisti = Boolean(duzenlenenUser && (
    editRoleId !== (duzenlenenUser.user_roles?.[0]?.role_id ?? '')
    || (editPersonelId || null) !== (duzenlenenUser.personel_id ?? null)
  ))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [userRes, roleRes, personelRes] = await Promise.all([
      supabase.functions.invoke('admin-users', { body: { operation: 'list' } }),
      supabase.from('roles').select('id, slug, name_tr').eq('is_active', true).order('name_tr'),
      supabase.from('hr_personel').select('id, ad_soyad, rol, is_aktif').order('ad_soyad'),
    ])
    const firstError = userRes.error ?? roleRes.error ?? personelRes.error
    if (firstError) {
      setError(await functionErrorMessage(firstError))
    } else {
      const loadedRoles = (roleRes.data ?? []) as Role[]
      const defaultPersonalRole = loadedRoles.find(role => role.slug === 'operator')
        ?? loadedRoles.find(role => role.slug !== 'viewer_device')
      setUsers(((userRes.data?.users ?? []) as UserRowWire[]).map(normalizeUserRow))
      setRoles(loadedRoles)
      setPersonnel((personelRes.data ?? []) as Personel[])
      setForm(current => ({
        ...current,
        role_id: loadedRoles.some(role => role.id === current.role_id && role.slug !== 'viewer_device')
          ? current.role_id
          : (defaultPersonalRole?.id ?? ''),
      }))
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

  function yeniHesapAc() {
    const currentRoleIsPersonal = personalRoles.some(role => role.id === form.role_id)
    const defaultRole = personalRoles.find(role => role.slug === 'operator') ?? personalRoles[0]
    setForm({ ...BOS_FORM, role_id: currentRoleIsPersonal ? form.role_id : (defaultRole?.id ?? '') })
    setError(null)
    setSuccess(null)
    setYeniHesapAcik(true)
  }

  function duzenlemeAc(user: UserRow) {
    const defaultRole = user.account_type === 'device'
      ? deviceRole
      : (personalRoles.find(role => role.slug === 'operator') ?? personalRoles[0])
    setDuzenlenenUserId(user.auth_user_id)
    setEditRoleId(user.user_roles?.[0]?.role_id ?? defaultRole?.id ?? '')
    setEditPersonelId(user.personel_id ?? '')
    setEditTemporaryPassword('')
    setError(null)
    setSuccess(null)
  }

  async function create() {
    const resolvedRoleId = form.account_type === 'device' ? deviceRole?.id : form.role_id
    const selectedRole = roles.find(role => role.id === resolvedRoleId)
    if (!form.email.trim() || !form.display_name.trim() || !resolvedRoleId || !selectedRole) {
      setError('E-posta, ad soyad ve rol zorunludur.')
      return
    }
    if (form.account_type !== 'device' && selectedRole.slug === 'viewer_device') {
      setError('Kişisel hesap için kişisel bir rol seçin.')
      return
    }
    if (!isValidPassword(form.temporary_password)) {
      setError(PASSWORD_POLICY_MESSAGE)
      return
    }
    const created = await invoke({
      operation: 'create', ...form, role_id: resolvedRoleId,
      personel_id: form.account_type === 'device' ? null : (form.personel_id || null),
    }, `Kullanıcı “${selectedRole.name_tr}” rolüyle oluşturuldu. İlk girişte parola değişimi zorunludur.`)
    if (created) setYeniHesapAcik(false)
  }

  async function setTemporaryPassword(user: UserRow) {
    if (!isValidPassword(editTemporaryPassword)) {
      setError(PASSWORD_POLICY_MESSAGE)
      return
    }
    const changed = await invoke(
      { operation: 'temporary_password', auth_user_id: user.auth_user_id, temporary_password: editTemporaryPassword },
      `${user.display_name || user.email} için geçici parola atandı.`,
    )
    if (changed) setEditTemporaryPassword('')
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
    if (user.is_active) {
      setError(null)
      setSuccess(null)
      setPasiflestirilecekUser(user)
      return
    }
    await invoke(
      { operation: 'activate', auth_user_id: user.auth_user_id },
      'Hesap yeniden etkinleştirildi.',
    )
  }

  async function pasiflestirmeyiOnayla() {
    if (!pasiflestirilecekUser) return
    const user = pasiflestirilecekUser
    const changed = await invoke(
      { operation: 'deactivate', auth_user_id: user.auth_user_id },
      `${user.display_name || user.email} hesabı pasifleştirildi.`,
    )
    if (changed) setPasiflestirilecekUser(null)
  }

  function silmeOnayiAc(user: UserRow) {
    if (user.auth_user_id === currentUserId) {
      setError('Güvenlik nedeniyle kendi hesabınızı silemezsiniz.')
      return
    }
    const isLastAdministrator = user.is_active
      && user.user_roles?.[0]?.roles?.slug === 'administrator'
      && activeAdministratorCount <= 1
    if (isLastAdministrator) {
      setError('Son aktif yönetici hesabı silinemez.')
      return
    }
    setError(null)
    setSuccess(null)
    setSilinecekUser(user)
  }

  async function silmeyiOnayla() {
    if (!silinecekUser) return
    const user = silinecekUser
    const deleted = await invoke(
      { operation: 'delete', auth_user_id: user.auth_user_id },
      `${user.display_name || user.email} kullanıcısı kalıcı olarak silindi.`,
    )
    if (deleted) setSilinecekUser(null)
  }

  async function duzenlemeyiKaydetVeKapat() {
    const user = duzenlenenUser
    if (!user || pending !== null) return
    if (!duzenlemeDegisti) {
      setDuzenlenenUserId(null)
      setError(null)
      return
    }

    const selectedRole = roles.find(role => role.id === editRoleId)
    if (!selectedRole) {
      setError('Geçerli bir rol seçin.')
      return
    }
    if (user.account_type === 'device' && selectedRole.slug !== 'viewer_device') {
      setError('Cihaz hesabı yalnız Görüntüleyici/Cihaz rolünü kullanabilir.')
      return
    }
    if (user.account_type !== 'device' && selectedRole.slug === 'viewer_device') {
      setError('Kişisel hesap için kişisel bir rol seçin.')
      return
    }
    const currentRoleSlug = user.user_roles?.[0]?.roles?.slug
    if (user.auth_user_id === currentUserId && editRoleId !== user.user_roles?.[0]?.role_id) {
      setError('Güvenlik nedeniyle kendi rolünüzü değiştiremezsiniz.')
      return
    }
    if (user.is_active && currentRoleSlug === 'administrator' && selectedRole.slug !== 'administrator' && activeAdministratorCount <= 1) {
      setError('Son aktif yöneticinin rolü değiştirilemez.')
      return
    }

    const roleChanged = editRoleId !== (user.user_roles?.[0]?.role_id ?? '')
    const personelId = user.account_type === 'device' ? null : (editPersonelId || null)
    const personnelChanged = personelId !== (user.personel_id ?? null)
    const operations: Record<string, unknown>[] = []
    if (roleChanged) operations.push({ operation: 'assign_role', auth_user_id: user.auth_user_id, role_id: editRoleId })
    if (personnelChanged) operations.push({ operation: 'update_personnel_link', auth_user_id: user.auth_user_id, personel_id: personelId })

    setPending(`save_access:${user.auth_user_id}`)
    setError(null)
    setSuccess(null)
    for (const body of operations) {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-users', { body })
      if (invokeError || data?.error) {
        const message = data?.error ?? await functionErrorMessage(invokeError)
        await load()
        setError(message)
        setPending(null)
        return
      }
    }
    await load()
    setSuccess(`${user.display_name || user.email} kullanıcısının rol ve personel bilgileri güncellendi.`)
    setPending(null)
    setDuzenlenenUserId(null)
  }

  useEscape(() => {
    if (silinecekUser) setSilinecekUser(null)
    else if (pasiflestirilecekUser) setPasiflestirilecekUser(null)
    else if (duzenlenenUser) void duzenlemeyiKaydetVeKapat()
    else if (yeniHesapAcik) setYeniHesapAcik(false)
  }, pending === null && Boolean(silinecekUser || pasiflestirilecekUser || duzenlenenUser || yeniHesapAcik))

  const filtreliKullanicilar = useMemo(() => {
    const query = arama.trim().toLocaleLowerCase('tr-TR')
    return users.filter(user => {
      if (durumFiltresi === 'aktif' && !user.is_active) return false
      if (durumFiltresi === 'pasif' && user.is_active) return false
      if (rolFiltresi !== 'tumu' && user.user_roles?.[0]?.roles?.slug !== rolFiltresi) return false
      if (!query) return true
      return [user.display_name, user.email, user.username, user.personel?.ad_soyad, user.user_roles?.[0]?.roles?.name_tr]
        .some(value => value?.toLocaleLowerCase('tr-TR').includes(query))
    }).sort((a, b) => Number(b.is_active) - Number(a.is_active)
      || (a.display_name || a.email || '').localeCompare(b.display_name || b.email || '', 'tr-TR'))
  }, [arama, durumFiltresi, rolFiltresi, users])

  const secilebilirPersonel = (userId?: string) => {
    const mevcutPersonelId = users.find(user => user.auth_user_id === userId)?.personel_id
    return personnel.filter(person => (
      (person.is_aktif || person.id === mevcutPersonelId)
      && !users.some(user => user.auth_user_id !== userId && user.personel_id === person.id)
    ))
  }

  return (
    <div className="min-h-full bg-gray-50/70 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Kullanıcılar ve Personel</h2>
            <p className="mt-1 text-sm text-gray-500">Hesapları ve üretim personelini tek yerden yönetin.</p>
          </div>
          {aktifSekme === 'hesaplar' && (
            <button type="button" onClick={yeniHesapAc} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
              <Plus size={16} /> Yeni kullanıcı
            </button>
          )}
        </header>

        <div className="flex gap-6 border-b border-gray-200">
          <button type="button" onClick={() => setAktifSekme('hesaplar')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${aktifSekme === 'hesaplar' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            Giriş hesapları <span className="ml-1 text-xs font-normal text-gray-400">({users.length})</span>
          </button>
          <button type="button" onClick={() => setAktifSekme('personel')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${aktifSekme === 'personel' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            Personel kayıtları <span className="ml-1 text-xs font-normal text-gray-400">({personnel.length})</span>
          </button>
        </div>

        {aktifSekme === 'personel' ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <PersonelYonetimiPanel />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-800">
              <Info size={15} className="mt-0.5 shrink-0" />
              <p><strong>Personel bağlantısı</strong>, giriş hesabını üretimde görünen çalışan kaydıyla eşleştirir. Ortak cihaz hesaplarında kullanılmaz. Kullanıcı silindiğinde bağlı personel kaydı korunur.</p>
            </div>

            {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="mt-0.5 shrink-0" size={16} />{error}</div>}
            {success && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><BadgeCheck className="mt-0.5 shrink-0" size={16} />{success}</div>}

            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Kullanıcı listesi</h3>
                  <p className="mt-0.5 text-xs text-gray-500">Satırlar işlem yapmaz; yalnızca sağdaki düğmeleri kullanın.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                    <input aria-label="Kullanıcı ara" value={arama} onChange={e => setArama(e.target.value)} placeholder="Ad, e-posta veya personel ara" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500" />
                  </div>
                  <select aria-label="Duruma göre filtrele" value={durumFiltresi} onChange={e => setDurumFiltresi(e.target.value as DurumFiltresi)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="tumu">Tüm durumlar</option><option value="aktif">Aktif</option><option value="pasif">Pasif</option></select>
                  <select aria-label="Role göre filtrele" value={rolFiltresi} onChange={e => setRolFiltresi(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="tumu">Tüm roller</option>{roles.map(role => <option key={role.id} value={role.slug}>{role.name_tr}</option>)}</select>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400"><Loader2 size={18} className="animate-spin" /> Kullanıcılar yükleniyor…</div>
              ) : filtreliKullanicilar.length === 0 ? (
                <div className="py-20 text-center"><Users className="mx-auto text-gray-300" size={28} /><p className="mt-3 text-sm font-medium text-gray-600">Eşleşen kullanıcı bulunamadı</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-left text-sm">
                    <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <tr><th className="px-4 py-3">Kullanıcı</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Personel</th><th className="px-4 py-3">Hesap bilgisi</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3 text-right">İşlemler</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtreliKullanicilar.map(user => {
                        const isSelf = user.auth_user_id === currentUserId
                        const role = user.user_roles?.[0]?.roles
                        const isLastAdministrator = user.is_active && role?.slug === 'administrator' && activeAdministratorCount <= 1
                        const actionPending = pending?.endsWith(`:${user.auth_user_id}`) ?? false
                        return (
                          <tr key={user.auth_user_id} className={user.is_active ? 'bg-white' : 'bg-gray-50/80 text-gray-500'}>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${user.is_active ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'}`}>{initials(user.display_name || user.email || '')}</div>
                                <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-semibold text-gray-900">{user.display_name || user.email}</span>{isSelf && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">SİZ</span>}</div><p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><Mail size={11} />{user.email ?? 'E-posta yok'}</p></div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold ${roleRenk(role?.slug)}`}><ShieldCheck size={12} />{role?.name_tr ?? 'Rol yok'}</span></td>
                            <td className="px-4 py-3.5">{user.personel ? <div><p className="font-medium text-gray-800">{user.personel.ad_soyad}</p><p className="mt-0.5 text-xs text-gray-500">{user.personel.rol}</p></div> : <span className="text-xs text-gray-400">Bağlı değil</span>}</td>
                            <td className="px-4 py-3.5"><p className="flex items-center gap-1.5 text-xs font-medium text-gray-700">{user.account_type === 'device' ? <Monitor size={12} /> : <UserCog size={12} />}{user.account_type === 'device' ? 'Ortak cihaz' : 'Kişisel hesap'}{user.username ? ` · @${user.username}` : ''}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-gray-400"><Clock3 size={11} />{tarihSaat(user.last_sign_in_at)}</p></td>
                            <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${user.is_active ? 'text-emerald-700' : 'text-gray-500'}`}><span className={`h-2 w-2 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />{user.is_active ? 'Aktif' : 'Pasif'}</span>{user.must_change_password && <p className="mt-1 text-[11px] font-medium text-amber-600">Parola değişimi bekliyor</p>}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center justify-end gap-2">
                                {actionPending && <Loader2 size={15} className="animate-spin text-indigo-500" />}
                                <button type="button" onClick={() => duzenlemeAc(user)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Pencil size={12} /> Düzenle</button>
                                <button type="button" disabled={isSelf || isLastAdministrator || actionPending} title={isSelf ? 'Kendi hesabınızı pasifleştiremezsiniz' : isLastAdministrator ? 'Son aktif yönetici korunur' : undefined} onClick={() => void changeActive(user)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${user.is_active ? 'border-red-200 bg-white text-red-600 hover:bg-red-50' : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'}`}>{user.is_active ? <><UserX size={12} /> Pasifleştir</> : <><UserCheck size={12} /> Etkinleştir</>}</button>
                                <button type="button" disabled={isSelf || isLastAdministrator || actionPending} title={isSelf ? 'Kendi hesabınızı silemezsiniz' : isLastAdministrator ? 'Son aktif yönetici korunur' : 'Kullanıcıyı sil'} onClick={() => silmeOnayiAc(user)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={12} /> Sil</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {pasiflestirilecekUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="pasiflestir-baslik" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><UserX size={21} /></span>
                <button type="button" aria-label="Pencereyi kapat" onClick={() => setPasiflestirilecekUser(null)} disabled={pending !== null} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"><X size={18} /></button>
              </div>
              <h3 id="pasiflestir-baslik" className="mt-4 text-lg font-bold text-gray-900">Kullanıcı pasifleştirilsin mi?</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600"><strong>{pasiflestirilecekUser.display_name || pasiflestirilecekUser.email}</strong> artık giriş yapamaz.</p>
              {pasiflestirilecekUser.personel_id && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Bağlı personel kaydı da pasif duruma geçecektir.</p>}
              {error && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPasiflestirilecekUser(null)} disabled={pending !== null} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Vazgeç</button>
              <button type="button" onClick={() => void pasiflestirmeyiOnayla()} disabled={pending !== null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{pending?.startsWith('deactivate:') ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />} Pasifleştir</button>
            </div>
          </div>
        </div>
      )}

      {silinecekUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="kullanici-sil-baslik" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-100 text-red-700"><Trash2 size={21} /></span>
                <button type="button" aria-label="Pencereyi kapat" onClick={() => setSilinecekUser(null)} disabled={pending !== null} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"><X size={18} /></button>
              </div>
              <h3 id="kullanici-sil-baslik" className="mt-4 text-lg font-bold text-gray-900">Kullanıcı kalıcı olarak silinsin mi?</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600"><strong>{silinecekUser.display_name || silinecekUser.email}</strong> hesabı, giriş bilgileri ve rol bağlantısı kalıcı olarak silinecek.</p>
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">Bu işlem geri alınamaz. Bağlı personel kaydı silinmez; yalnızca kullanıcı hesabıyla bağlantısı kaldırılır.</div>
              {error && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setSilinecekUser(null)} disabled={pending !== null} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Vazgeç</button>
              <button type="button" onClick={() => void silmeyiOnayla()} disabled={pending !== null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{pending?.startsWith('delete:') ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Kalıcı olarak sil</button>
            </div>
          </div>
        </div>
      )}

      {yeniHesapAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="yeni-kullanici-baslik" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4"><div><h3 id="yeni-kullanici-baslik" className="font-bold text-gray-900">Yeni kullanıcı</h3><p className="mt-1 text-xs text-gray-500">Giriş hesabı oluşturun ve yetkisini belirleyin.</p></div><button type="button" aria-label="Pencereyi kapat" onClick={() => setYeniHesapAcik(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={18} /></button></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-semibold text-gray-700">Ad soyad *</label><input aria-label="Ad soyad" value={form.display_name} onChange={e => setForm(v => ({ ...v, display_name: e.target.value }))} className={inputSinifi} /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">E-posta *</label><input aria-label="E-posta" type="email" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} className={inputSinifi} /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">Kullanıcı adı</label><input aria-label="Kullanıcı adı" value={form.username} onChange={e => setForm(v => ({ ...v, username: e.target.value }))} className={inputSinifi} /></div>
              <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-semibold text-gray-700">Geçici parola *</label><input aria-label="Geçici parola" type="password" autoComplete="new-password" value={form.temporary_password} onChange={e => setForm(v => ({ ...v, temporary_password: e.target.value }))} placeholder="Büyük/küçük harf, rakam ve özel karakter" className={inputSinifi} /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">Hesap tipi</label><select aria-label="Hesap tipi" value={form.account_type} onChange={e => { const accountType = e.target.value; const defaultPersonalRole = personalRoles.find(role => role.slug === 'operator') ?? personalRoles[0]; setForm(v => ({ ...v, account_type: accountType, personel_id: accountType === 'device' ? '' : v.personel_id, role_id: accountType === 'device' ? (deviceRole?.id ?? '') : (personalRoles.some(role => role.id === v.role_id) ? v.role_id : (defaultPersonalRole?.id ?? '')) })) }} className={inputSinifi}><option value="personal">Kişisel hesap</option><option value="device">Ortak ekran / cihaz</option></select></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">Rol *</label><select aria-label="Rol" value={form.account_type === 'device' ? (deviceRole?.id ?? '') : form.role_id} disabled={form.account_type === 'device'} onChange={e => setForm(v => ({ ...v, role_id: e.target.value }))} className={inputSinifi}>{(form.account_type === 'device' ? (deviceRole ? [deviceRole] : []) : personalRoles).map(role => <option key={role.id} value={role.id}>{role.name_tr}</option>)}</select></div>
              <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-semibold text-gray-700">Personel bağlantısı</label><select aria-label="Personel bağlantısı" value={form.personel_id} disabled={form.account_type === 'device'} onChange={e => setForm(v => ({ ...v, personel_id: e.target.value }))} className={inputSinifi}><option value="">Bağlantı yok</option>{secilebilirPersonel().map(person => <option key={person.id} value={person.id}>{person.ad_soyad} · {person.rol}</option>)}</select><p className="mt-1.5 text-[11px] text-gray-500">Yalnızca hesap belirli bir çalışana aitse seçim yapın.</p></div>
              {error && <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4"><button type="button" onClick={() => setYeniHesapAcik(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Vazgeç</button><button type="button" disabled={pending !== null} onClick={() => void create()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{pending?.startsWith('create:') ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Kullanıcı oluştur</button></div>
          </div>
        </div>
      )}

      {duzenlenenUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="hesap-duzenle-baslik" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4"><div><h3 id="hesap-duzenle-baslik" className="font-bold text-gray-900">Hesabı düzenle</h3><p className="mt-1 text-sm font-medium text-gray-700">{duzenlenenUser.display_name || duzenlenenUser.email}</p><p className="mt-0.5 text-xs text-gray-500">{duzenlenenUser.email}</p></div><button type="button" aria-label="Kaydedip pencereyi kapat" onClick={() => void duzenlemeyiKaydetVeKapat()} disabled={pending !== null} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"><X size={18} /></button></div>
            <div className="space-y-5 p-5">
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              {success && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}
              {!duzenlenenUser.is_active && <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">Bu hesap pasif. Rol değişikliği yapmak için önce kullanıcı listesinden hesabı etkinleştirin.</div>}
              <section><h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Yetki ve personel</h4><div className="grid gap-4 sm:grid-cols-2">
                <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">Rol</label><select aria-label="Kullanıcı rolü" value={editRoleId} disabled={pending !== null || !duzenlenenUser.is_active || duzenlenenUser.auth_user_id === currentUserId || duzenlenenUser.account_type === 'device'} onChange={e => setEditRoleId(e.target.value)} className={inputSinifi}>{(duzenlenenUser.account_type === 'device' ? (deviceRole ? [deviceRole] : []) : personalRoles).map(role => <option key={role.id} value={role.id}>{role.name_tr}</option>)}</select><p className="mt-1.5 text-[11px] leading-4 text-gray-500">Seçilen rol pencere kapatılırken otomatik kaydedilir.</p></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">Personel bağlantısı</label><select aria-label="Personel bağlantısını düzenle" value={editPersonelId} disabled={pending !== null || duzenlenenUser.account_type === 'device'} onChange={e => setEditPersonelId(e.target.value)} className={inputSinifi}><option value="">Bağlantı yok</option>{secilebilirPersonel(duzenlenenUser.auth_user_id).map(person => <option key={person.id} value={person.id}>{person.ad_soyad} · {person.rol}</option>)}</select><p className="mt-1.5 text-[11px] leading-4 text-gray-500">Bağlantı değişikliği pencere kapatılırken otomatik kaydedilir.</p></div>
              </div></section>
              <section className="border-t border-gray-200 pt-5"><h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Parola işlemleri</h4><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Yeni geçici parola" type="password" autoComplete="new-password" value={editTemporaryPassword} onChange={e => setEditTemporaryPassword(e.target.value)} placeholder="Yeni geçici parola" className={inputSinifi} /><button type="button" disabled={pending !== null} onClick={() => void setTemporaryPassword(duzenlenenUser)} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"><KeyRound size={13} /> Geçici parola ata</button><button type="button" disabled={!duzenlenenUser.email || pending !== null} onClick={() => void invoke({ operation: 'reset_password', email: duzenlenenUser.email, auth_user_id: duzenlenenUser.auth_user_id }, 'Parola sıfırlama bağlantısı gönderildi.')} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"><RefreshCw size={13} /> Sıfırlama e-postası</button></div></section>
              <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600"><Link2 size={14} className="mt-0.5 shrink-0" /> Personel bağlantısı yalnızca bu hesap belirli bir çalışana aitse kullanılmalıdır.</div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4"><p className="text-xs text-gray-500">{duzenlemeDegisti ? 'Değişiklikler kapatılırken kaydedilecek.' : 'Kaydedilecek değişiklik yok.'}</p><button type="button" onClick={() => void duzenlemeyiKaydetVeKapat()} disabled={pending !== null} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">{pending?.startsWith('save_access:') && <Loader2 size={15} className="animate-spin" />}{pending?.startsWith('save_access:') ? 'Kaydediliyor...' : 'Kapat'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
