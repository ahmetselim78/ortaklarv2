import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Loader2,
  LockKeyhole,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useEscape } from '@/hooks/useEscape'
import { supabase } from '@/lib/supabase'
import { tumSatirlariGetir } from '@/lib/supabasePagination'

interface Role { id: string; slug: string; name_tr: string; is_system: boolean }
interface Permission { id: string; module: string; action: string; description_tr: string }
interface RolePermission { role_id: string; permission_id: string }
interface UserRole { role_id: string }

interface RoleChange {
  role: Role
  added: Permission[]
  removed: Permission[]
  permissionIds: string[]
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Genel Bakış',
  cari: 'Cari Yönetimi',
  inventory: 'Stok Yönetimi',
  orders: 'Siparişler',
  production: 'Üretim',
  production_stations: 'Üretim İstasyonları',
  repair: 'Tamir',
  shipping: 'Sevkiyat',
  hourly_tracking: 'Saatlik Takip',
  production_entry: 'Üretim Girişi',
  settings: 'Ayarlar',
  users: 'Kullanıcılar',
  roles: 'Roller ve Yetkiler',
  telegram: 'Telegram',
  files: 'Dosyalar',
  ocr: 'Belge Okuma (OCR)',
  audit: 'Denetim Kayıtları',
  errors: 'Hata Kayıtları',
  admin: 'Sistem Yönetimi',
}

const MODULE_HELP: Record<string, string> = {
  dashboard: 'Ana sayfadaki özetleri, sayıları ve genel durum bilgilerini kapsar.',
  cari: 'Müşteri ve firma kartlarıyla ilgili kayıt ve işlemleri kapsar.',
  inventory: 'Stok kartları, ürün bilgileri ve mevcut stok işlemlerini kapsar.',
  orders: 'Sipariş oluşturma, takip etme ve sipariş kayıtlarıyla çalışmayı kapsar.',
  production: 'Üretim emirleri, üretim planları ve süreç kayıtlarını kapsar.',
  production_stations: 'Poz Giriş, Kumanda Paneli, Gösterge Ekranı ve Tamir İstasyonu’nu tek çatı altında kapsar. Üretim Girişi istasyon seçimleri Personel Yönetimi’nde kalır.',
  repair: 'Tamire alınan ürünlerin kayıtlarını ve tamir süreçlerini kapsar.',
  shipping: 'Sevkiyat planlarını, yüklemeleri ve teslimat kayıtlarını kapsar.',
  hourly_tracking: 'Saatlik üretim miktarlarını ve performans takibini kapsar.',
  production_entry: 'Operatörlerin üretim miktarı ve işlem girişi yapmasını kapsar.',
  settings: 'Uygulamanın çalışma biçimini belirleyen ayarları kapsar.',
  users: 'Kullanıcı hesaplarını, durumlarını ve hesap bağlantılarını kapsar.',
  roles: 'Rollerin hangi bölümlere ve işlemlere erişebileceğini kapsar.',
  telegram: 'Telegram bildirimlerini ve otomatik rapor gönderimlerini kapsar.',
  files: 'Dosya yükleme, görüntüleme ve dosya işlemlerini kapsar.',
  ocr: 'Belgelerden otomatik bilgi okuma ve aktarma işlemlerini kapsar.',
  audit: 'Kullanıcıların yaptığı kritik işlemlerin geçmişini kapsar.',
  errors: 'Uygulamada oluşan sistem hatalarını görüntüleme ve incelemeyi kapsar.',
  admin: 'Kullanıcı, rol ve güvenlikle ilgili kritik yönetim işlemlerini kapsar.',
}

const ACTION_LABELS: Record<string, string> = {
  read: 'Görüntüleme',
  create: 'Yeni kayıt ekleme',
  update: 'Düzenleme',
  delete: 'Silme',
  manage: 'Tam yönetim',
}

const ACTION_HELP: Record<string, string> = {
  read: 'Bu bölümdeki kayıtları, listeleri ve ayrıntıları görüntüleyebilir.',
  create: 'Bu bölümde yeni kayıt oluşturabilir. Görüntüleme yetkisi otomatik olarak eklenir.',
  update: 'Mevcut kayıtların bilgilerini değiştirebilir. Görüntüleme yetkisi gereklidir.',
  delete: 'Kayıtları kalıcı olarak silebilir. Görüntüleme yetkisi gereklidir.',
  manage: 'Görüntüleme, ekleme, düzenleme ve silme işlemlerinin tamamını yapabilir.',
}

const ACTION_ORDER = ['read', 'create', 'update', 'delete', 'manage']

const MODULE_CATEGORIES = [
  {
    key: 'business',
    label: 'Genel ve Ticari',
    description: 'Genel görünüm, müşteri, stok ve sipariş işlemleri',
    modules: ['dashboard', 'cari', 'inventory', 'orders'],
  },
  {
    key: 'operations',
    label: 'Üretim Operasyonları',
    description: 'Üretim, operatör girişleri, tamir, takip ve sevkiyat',
    modules: ['production', 'production_stations', 'production_entry', 'hourly_tracking', 'repair', 'shipping'],
  },
  {
    key: 'integrations',
    label: 'Dosya ve Entegrasyonlar',
    description: 'Dosyalar, belge okuma ve dış bildirim araçları',
    modules: ['files', 'ocr', 'telegram'],
  },
  {
    key: 'administration',
    label: 'Yönetim ve Güvenlik',
    description: 'Ayarlar, kullanıcılar, roller ve sistem kayıtları',
    modules: ['settings', 'users', 'roles', 'audit', 'errors', 'admin'],
  },
] as const

function moduleLabel(module: string) {
  return MODULE_LABELS[module] ?? module
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action
}

function permissionLabel(permission: Permission) {
  return `${moduleLabel(permission.module)} — ${actionLabel(permission.action)}`
}

function slugifyRoleName(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ç', 'c')
    .replaceAll('ğ', 'g')
    .replaceAll('ı', 'i')
    .replaceAll('ö', 'o')
    .replaceAll('ş', 's')
    .replaceAll('ü', 'u')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function friendlyError(message: string) {
  if (message.includes('roles_slug_key') || message.includes('duplicate key')) return 'Bu rol kodu daha önce kullanılmış.'
  if (message.includes('role_in_use') || message.includes('kullanıcıya atanmış')) return 'Bu rol bir veya daha fazla kullanıcıya atanmış. Önce kullanıcıların rollerini değiştirin.'
  if (message.includes('system_role')) return 'Sistem rolleri silinemez.'
  if (message.includes('AAL2')) return 'Bu işlem için yönetici doğrulaması gerekli. Oturumunuzu yenileyip tekrar deneyin.'
  return message
}

function ChangeReviewModal({
  changes,
  saving,
  onClose,
  onConfirm,
}: {
  changes: RoleChange[]
  saving: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  useEscape(onClose, !saving)
  const totalAdded = changes.reduce((sum, change) => sum + change.added.length, 0)
  const totalRemoved = changes.reduce((sum, change) => sum + change.removed.length, 0)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="role-change-title">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b px-6 py-5">
          <div>
            <h3 id="role-change-title" className="text-lg font-bold text-slate-900">Yetki değişikliklerini onaylayın</h3>
            <p className="mt-1 text-sm text-slate-500">
              {changes.length} rolde {totalAdded} yetki eklenecek, {totalRemoved} yetki kaldırılacak.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Pencereyi kapat" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-6">
          {changes.map(change => (
            <section key={change.role.id} className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 bg-slate-50 px-4 py-3">
                <ShieldCheck size={17} className="text-indigo-600" />
                <h4 className="font-semibold text-slate-900">{change.role.name_tr}</h4>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Eklenecek ({change.added.length})</p>
                  {change.added.length > 0 ? (
                    <ul className="space-y-1.5">
                      {change.added.map(permission => <li key={permission.id} className="flex gap-2 text-sm text-slate-700"><Plus size={15} className="mt-0.5 shrink-0 text-emerald-600" />{permissionLabel(permission)}</li>)}
                    </ul>
                  ) : <p className="text-sm text-slate-400">Eklenecek yetki yok</p>}
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-red-700">Kaldırılacak ({change.removed.length})</p>
                  {change.removed.length > 0 ? (
                    <ul className="space-y-1.5">
                      {change.removed.map(permission => <li key={permission.id} className="flex gap-2 text-sm text-slate-700"><X size={15} className="mt-0.5 shrink-0 text-red-500" />{permissionLabel(permission)}</li>)}
                    </ul>
                  ) : <p className="text-sm text-slate-400">Kaldırılacak yetki yok</p>}
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Geri dön</button>
          <button type="button" onClick={onConfirm} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? 'Kaydediliyor...' : 'Onayla ve kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RolYonetimiPanel() {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [links, setLinks] = useState<RolePermission[]>([])
  const [userRoles, setUserRoles] = useState<UserRole[]>([])
  const [drafts, setDrafts] = useState<Record<string, string[]>>({})
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [openModule, setOpenModule] = useState<string | null>(null)
  const [dependencyNotice, setDependencyNotice] = useState<{ module: string; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async (preferredRoleId?: string, preserveDrafts = false) => {
    setLoading(true)
    setError(null)
    try {
      const [nextRoles, nextPermissions, nextLinks, nextUserRoles] = await Promise.all([
        tumSatirlariGetir<Role>(
          (from, to) => supabase.from('roles').select('id, slug, name_tr, is_system', { count: 'exact' }).order('name_tr').range(from, to),
          { baglam: 'rol yönetimi - roller' },
        ),
        tumSatirlariGetir<Permission>(
          (from, to) => supabase.from('permissions').select('id, module, action, description_tr', { count: 'exact' }).order('module').order('action').range(from, to),
          { baglam: 'rol yönetimi - yetkiler' },
        ),
        tumSatirlariGetir<RolePermission>(
          (from, to) => supabase.from('role_permissions').select('role_id, permission_id', { count: 'exact' }).range(from, to),
          { baglam: 'rol yönetimi - rol yetkileri' },
        ),
        tumSatirlariGetir<UserRole>(
          (from, to) => supabase.from('user_roles').select('role_id', { count: 'exact' }).range(from, to),
          { baglam: 'rol yönetimi - kullanıcı rolleri' },
        ),
      ])
      setRoles(nextRoles)
      setPermissions(nextPermissions)
      setLinks(nextLinks)
      setUserRoles(nextUserRoles)
      setDrafts(current => {
        if (!preserveDrafts) return {}
        const existingRoleIds = new Set(nextRoles.map(role => role.id))
        return Object.fromEntries(Object.entries(current).filter(([roleId]) => existingRoleIds.has(roleId)))
      })
      setSelected(current => {
        const candidate = preferredRoleId ?? current
        return nextRoles.some(role => role.id === candidate) ? candidate : (nextRoles[0]?.id ?? '')
      })
    } catch (loadError) {
      setError(friendlyError(loadError instanceof Error ? loadError.message : 'Roller yüklenemedi.'))
    }
    setLoading(false)
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  const originalByRole = useMemo(() => {
    const result: Record<string, Set<string>> = {}
    for (const role of roles) result[role.id] = new Set<string>()
    for (const link of links) result[link.role_id]?.add(link.permission_id)
    return result
  }, [links, roles])

  const userCountByRole = useMemo(() => {
    const result: Record<string, number> = {}
    for (const role of roles) result[role.id] = 0
    for (const userRole of userRoles) result[userRole.role_id] = (result[userRole.role_id] ?? 0) + 1
    return result
  }, [roles, userRoles])

  const groupedPermissions = useMemo(() => {
    const result = new Map<string, Permission[]>()
    for (const permission of permissions) {
      const group = result.get(permission.module) ?? []
      group.push(permission)
      result.set(permission.module, group)
    }
    return [...result.entries()].map(([module, items]) => ({
      module,
      items: items.sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action)),
    }))
  }, [permissions])

  const categorizedPermissionGroups = useMemo(() => {
    const categorizedModules = new Set<string>(MODULE_CATEGORIES.flatMap(category => [...category.modules]))
    const categories: Array<{
      key: string
      label: string
      description: string
      modules: readonly string[]
      groups: typeof groupedPermissions
    }> = MODULE_CATEGORIES.map(category => ({
      ...category,
      groups: category.modules.flatMap(module => {
        const group = groupedPermissions.find(item => item.module === module)
        return group ? [group] : []
      }),
    })).filter(category => category.groups.length > 0)
    const otherGroups = groupedPermissions.filter(group => !categorizedModules.has(group.module))
    if (otherGroups.length > 0) {
      categories.push({
        key: 'other',
        label: 'Diğer',
        description: 'Henüz özel bir kategoriye alınmamış modüller',
        modules: otherGroups.map(group => group.module),
        groups: otherGroups,
      })
    }
    return categories
  }, [groupedPermissions])

  const selectedRole = roles.find(role => role.id === selected)
  const openPermissionGroup = groupedPermissions.find(group => group.module === openModule)
  const selectedPermissionIds = useMemo(
    () => new Set(drafts[selected] ?? [...(originalByRole[selected] ?? [])]),
    [drafts, originalByRole, selected],
  )
  const changes = useMemo<RoleChange[]>(() => roles.flatMap(role => {
    const draft = drafts[role.id]
    if (!draft) return []
    const original = originalByRole[role.id] ?? new Set<string>()
    const current = new Set(draft)
    const added = permissions.filter(permission => current.has(permission.id) && !original.has(permission.id))
    const removed = permissions.filter(permission => original.has(permission.id) && !current.has(permission.id))
    if (added.length === 0 && removed.length === 0) return []
    return [{ role, added, removed, permissionIds: draft }]
  }), [drafts, originalByRole, permissions, roles])

  const changedRoleIds = useMemo(() => new Set(changes.map(change => change.role.id)), [changes])
  const totalChanges = changes.reduce((sum, change) => sum + change.added.length + change.removed.length, 0)
  const selectedUserCount = selected ? (userCountByRole[selected] ?? 0) : 0
  async function createRole() {
    if (!name.trim()) { setError('Rol adını yazın.'); return }
    const baseSlug = slugifyRoleName(name)
    if (!/^[a-z][a-z0-9_]*$/.test(baseSlug)) { setError('Rol adı en az bir harf içermeli.'); return }
    let normalized = baseSlug
    let suffix = 2
    while (roles.some(role => role.slug === normalized)) {
      normalized = `${baseSlug}_${suffix}`
      suffix += 1
    }
    setCreating(true)
    setError(null)
    setSuccess(null)
    const { data, error: insertError } = await supabase
      .from('roles')
      .insert({ name_tr: name.trim(), slug: normalized, is_system: false })
      .select('id')
      .single()
    if (insertError) {
      setError(friendlyError(insertError.message))
    } else {
      setName('')
      setCreateOpen(false)
      setSuccess('Yeni rol oluşturuldu. Şimdi bu role yetki seçebilirsiniz.')
      await load(data.id, true)
    }
    setCreating(false)
  }

  function togglePermission(permission: Permission) {
    if (!selectedRole) return
    const protectedPermission = selectedRole.slug === 'administrator' && permission.module === 'admin' && permission.action === 'manage'
    if (protectedPermission) {
      setError('Yönetici rolünün Sistem Yönetimi / Tam yönetim yetkisi kaldırılamaz.')
      return
    }
    setError(null)
    setSuccess(null)
    const next = new Set(selectedPermissionIds)
    const modulePermissions = permissions.filter(item => item.module === permission.module)
    const readPermission = modulePermissions.find(item => item.action === 'read')
    const exists = next.has(permission.id)
    let notice: { module: string; text: string } | null = null

    if (exists) {
      if (permission.action === 'read') {
        const dependentCount = modulePermissions.filter(item => item.action !== 'read' && next.has(item.id)).length
        for (const item of modulePermissions) next.delete(item.id)
        if (dependentCount > 0) notice = { module: permission.module, text: `Görüntüleme kaldırıldığı için bu modüldeki ${dependentCount} bağlı yetki de kaldırıldı.` }
      } else {
        next.delete(permission.id)
      }
    } else if (permission.action === 'manage') {
      for (const item of modulePermissions) next.add(item.id)
      notice = { module: permission.module, text: 'Tam yönetim seçildiği için bu modülün tüm aşamaları birlikte eklendi.' }
    } else {
      next.add(permission.id)
      if (permission.action !== 'read' && readPermission && !next.has(readPermission.id)) {
        next.add(readPermission.id)
        notice = { module: permission.module, text: `${actionLabel(permission.action)} seçildi. Ön koşul olduğu için Görüntüleme de otomatik eklendi.` }
      }
    }
    setDependencyNotice(notice)
    setDrafts(current => ({ ...current, [selected]: [...next] }))
  }

  function discardChanges() {
    setDrafts({})
    setReviewOpen(false)
    setError(null)
    setSuccess('Kaydedilmemiş değişiklikler geri alındı.')
  }

  async function saveChanges() {
    if (changes.length === 0) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    const payload = changes.map(change => ({ role_id: change.role.id, permission_ids: change.permissionIds }))
    const { error: updateError } = await supabase.rpc('admin_set_role_permissions', { p_changes: payload })
    if (updateError) {
      setError(friendlyError(updateError.message))
    } else {
      setReviewOpen(false)
      await load(selected)
      setSuccess('Rol yetkileri başarıyla güncellendi.')
    }
    setSaving(false)
  }

  async function deleteRole() {
    if (!selectedRole || selectedRole.is_system || selectedUserCount > 0) return
    setDeleting(true)
    setError(null)
    setSuccess(null)
    const { error: deleteError } = await supabase.rpc('admin_delete_role', { p_role_id: selectedRole.id })
    if (deleteError) {
      setError(friendlyError(deleteError.message))
    } else {
      const nextRole = roles.find(role => role.id !== selectedRole.id)
      setDeleteOpen(false)
      await load(nextRole?.id, true)
      setSuccess(`“${selectedRole.name_tr}” rolü silindi.`)
    }
    setDeleting(false)
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-600 p-2.5 text-white"><ShieldCheck size={24} /></div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Rol ve Yetki Yönetimi</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Bir rol seçin, kullanabileceği işlemleri işaretleyin ve son olarak değişiklikleri kaydedin. Seçimleriniz, siz onaylayana kadar uygulanmaz.
            </p>
          </div>
        </div>
        <div aria-live="polite" className="mt-4 flex min-h-16 flex-col gap-3 border-t border-indigo-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-900">
              {changes.length > 0 ? `${changes.length} rolde ${totalChanges} kaydedilmemiş değişiklik var` : 'Kaydedilmemiş değişiklik yok'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {changes.length > 0 ? 'Değişiklikler henüz kullanıcılara uygulanmadı.' : 'Yetki seçiminde değişiklik yaptığınızda buradan kaydedebilirsiniz.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={changes.length === 0} onClick={discardChanges} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"><RotateCcw size={15} />Geri al</button>
            <button type="button" disabled={changes.length === 0} onClick={() => setReviewOpen(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:flex-none"><Save size={16} />Değişiklikleri kaydet</button>
          </div>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
      {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><Check size={18} className="mt-0.5 shrink-0" /><span>{success}</span></div>}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /><span className="ml-2 text-sm text-slate-500">Roller yükleniyor...</span></div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 p-4">
                <p className="text-sm font-bold text-slate-900">1. Rol seçin</p>
                <p className="mt-1 text-xs text-slate-500">Yetkilerini düzenlemek istediğiniz rol</p>
              </div>
              <div className="max-h-[560px] space-y-1 overflow-y-auto p-2">
                {roles.map(role => {
                  const isSelected = selected === role.id
                  const permissionCount = originalByRole[role.id]?.size ?? 0
                  const userCount = userCountByRole[role.id] ?? 0
                  return (
                    <button
                      type="button"
                      key={role.id}
                      onClick={() => { setSelected(role.id); setOpenModule(null); setDependencyNotice(null); setError(null); setSuccess(null) }}
                      className={`w-full rounded-xl border p-3 text-left transition ${isSelected ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-semibold ${isSelected ? 'text-indigo-950' : 'text-slate-800'}`}>{role.name_tr}</span>
                        {changedRoleIds.has(role.id) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">kaydedilmedi</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1"><KeyRound size={12} />{permissionCount} yetki</span>
                        <span className="flex items-center gap-1"><UserRound size={12} />{userCount} kullanıcı</span>
                        {role.is_system && <span className="flex items-center gap-1"><LockKeyhole size={12} />Sistem rolü</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button type="button" onClick={() => setCreateOpen(open => !open)} className="flex w-full items-center justify-between p-4 text-left">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-900"><Plus size={16} className="text-indigo-600" />Yeni rol oluştur</span>
                {createOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </button>
              {createOpen && (
                <div className="space-y-3 border-t border-slate-200 p-4">
                  <label className="block text-xs font-semibold text-slate-700">
                    Rol adı
                    <input value={name} onChange={event => setName(event.target.value)} placeholder="Örn. Depo Sorumlusu" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                  <button type="button" onClick={() => void createRole()} disabled={creating} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                    {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{creating ? 'Oluşturuluyor...' : 'Rolü oluştur'}
                  </button>
                </div>
              )}
            </div>
          </aside>

          <main className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {selectedRole ? (
              <>
                <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900">{selectedRole.name_tr}</h3>
                      {selectedRole.is_system && <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Sistem rolü</span>}
                      {changedRoleIds.has(selectedRole.id) && <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">Kaydedilmemiş değişiklik var</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">2. Bu role verilecek yetkileri seçin.</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-lg bg-indigo-50 px-2.5 py-1.5 font-medium text-indigo-700">{selectedPermissionIds.size} yetki seçili</span>
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-600">{selectedUserCount} kullanıcı bu rolde</span>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <button
                      type="button"
                      onClick={() => setDeleteOpen(true)}
                      disabled={selectedRole.is_system || selectedUserCount > 0}
                      title={selectedRole.is_system ? 'Sistem rolleri silinemez' : selectedUserCount > 0 ? 'Kullanıcıya atanmış roller silinemez' : 'Bu rolü sil'}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
                    >
                      <Trash2 size={15} />Rolü sil
                    </button>
                    {(selectedRole.is_system || selectedUserCount > 0) && (
                      <p className="mt-1.5 max-w-64 text-xs leading-4 text-slate-400">
                        {selectedRole.is_system ? 'Sistem rolleri güvenlik nedeniyle silinemez.' : `Bu rol ${selectedUserCount} kullanıcıya atanmış. Silmek için önce kullanıcıların rolünü değiştirin.`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-5">
                  <div className="space-y-8">
                    {categorizedPermissionGroups.map(category => (
                      <section key={category.key}>
                        <div className="mb-3 border-b border-slate-200 pb-2">
                          <h4 className="text-sm font-extrabold text-slate-900">{category.label}</h4>
                          <p className="mt-0.5 text-xs text-slate-500">{category.description}</p>
                        </div>
                        <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                          {category.groups.map(group => {
                            const selectedCount = group.items.filter(permission => selectedPermissionIds.has(permission.id)).length
                            const isOpen = openModule === group.module
                            const hasPermission = selectedCount > 0
                            return (
                              <button
                                key={group.module}
                                type="button"
                                onClick={() => { setOpenModule(current => current === group.module ? null : group.module); setDependencyNotice(null) }}
                                aria-expanded={isOpen}
                                className={`flex min-h-32 flex-col justify-between rounded-xl border p-4 text-left transition-colors ${hasPermission ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 hover:bg-emerald-50/60' : isOpen ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'}`}
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-3">
                                    <h5 className="text-sm font-bold text-slate-900">{moduleLabel(group.module)}</h5>
                                    <span className={`shrink-0 rounded-lg border px-2.5 py-1 text-sm font-extrabold tabular-nums ${hasPermission ? 'border-emerald-200 bg-emerald-100/70 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                                      {selectedCount}/{group.items.length}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-sm leading-5 text-slate-600">{MODULE_HELP[group.module] ?? 'Bu bölüme ait işlemleri kapsar.'}</p>
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <span className={`text-xs font-bold ${hasPermission ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    {hasPermission ? 'Yetki verildi' : 'Yetki verilmedi'}
                                  </span>
                                  <span className={`text-xs font-medium ${hasPermission ? 'text-emerald-800' : 'text-indigo-700'}`}>Yetkileri düzenle</span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    ))}

                  </div>
                </div>
              </>
            ) : <div className="p-8 text-center text-sm text-slate-500">Düzenlemek için bir rol seçin.</div>}
          </main>
        </div>
      )}

      {openPermissionGroup && selectedRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="yetki-duzenle-baslik" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 id="yetki-duzenle-baslik" className="font-bold text-gray-900">{moduleLabel(openPermissionGroup.module)} yetkileri</h3>
                <p className="mt-1 text-xs text-gray-500">{selectedRole.name_tr} rolü · Eklemek veya kaldırmak istediğiniz yetki kartına basın.</p>
              </div>
              <button type="button" aria-label="Pencereyi kapat" onClick={() => { setOpenModule(null); setDependencyNotice(null) }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="p-5">
              <div className="mb-4 h-12">
                {dependencyNotice?.module === openPermissionGroup.module && (
                  <div role="status" className="flex h-12 items-center overflow-hidden rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
                    <span className="line-clamp-2">{dependencyNotice.text}</span>
                  </div>
                )}
              </div>
              <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {openPermissionGroup.items.map((permission, index) => {
                  const checked = selectedPermissionIds.has(permission.id)
                  const protectedPermission = selectedRole.slug === 'administrator' && permission.module === 'admin' && permission.action === 'manage'
                  return (
                    <label
                      key={permission.id}
                      className={`flex min-h-32 gap-3 rounded-xl border p-4 transition-colors ${protectedPermission ? 'cursor-not-allowed border-amber-200 bg-amber-50' : checked ? 'cursor-pointer border-indigo-400 bg-indigo-50/40 ring-2 ring-indigo-100' : 'cursor-pointer border-gray-200 bg-white hover:border-indigo-300 hover:bg-gray-50'}`}
                    >
                      <input type="checkbox" checked={checked} disabled={protectedPermission} onChange={() => togglePermission(permission)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${checked ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{index + 1}</span>
                          <span className="text-sm font-bold text-gray-800">{actionLabel(permission.action)}</span>
                        </span>
                        <span className="mt-2 block text-sm leading-6 text-gray-600">{ACTION_HELP[permission.action] ?? permission.description_tr}</span>
                        <span className={`mt-2 block text-[11px] font-semibold ${checked ? 'text-indigo-700' : 'text-gray-400'}`}>{checked ? 'Seçildi' : 'Seçilmedi'}</span>
                        {protectedPermission && <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700"><LockKeyhole size={11} />Zorunlu yetki</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 px-5 py-4">
              <button type="button" onClick={() => { setOpenModule(null); setDependencyNotice(null) }} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Seçimleri tamamla</button>
            </div>
          </div>
        </div>
      )}

      {reviewOpen && <ChangeReviewModal changes={changes} saving={saving} onClose={() => setReviewOpen(false)} onConfirm={() => void saveChanges()} />}

      {deleteOpen && selectedRole && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-role-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="rounded-xl bg-red-100 p-2.5 text-red-700"><Trash2 size={22} /></div>
              <button type="button" onClick={() => setDeleteOpen(false)} disabled={deleting} aria-label="Pencereyi kapat" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={18} /></button>
            </div>
            <h3 id="delete-role-title" className="mt-4 text-lg font-bold text-slate-900">“{selectedRole.name_tr}” rolü silinsin mi?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Bu rol ve role ait tüm yetki seçimleri kalıcı olarak silinecek. Bu işlem geri alınamaz.</p>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><ShieldCheck size={15} />Kontrol edildi: Bu role atanmış kullanıcı yok.</div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setDeleteOpen(false)} disabled={deleting} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Vazgeç</button>
              <button type="button" onClick={() => void deleteRole()} disabled={deleting} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{deleting ? 'Siliniyor...' : 'Rolü kalıcı olarak sil'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
