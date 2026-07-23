import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Filter,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  User,
  XCircle,
} from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import Pagination from '@/components/ui/Pagination'
import { supabase } from '@/lib/supabase'

type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'INTENT' | 'SUCCESS' | 'FAILURE'

interface AuditEvent {
  id: string
  occurred_at: string
  actor_user_id: string | null
  actor_personel_id: string | null
  table_name: string
  record_id: string
  action: AuditAction
  changed_fields: string[]
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

interface Personel {
  id: string
  ad_soyad: string
}

interface ActorAccount {
  auth_user_id: string
  personel_id: string | null
  display_name: string
  username: string | null
}

interface Role {
  id: string
  name_tr: string
}

interface Permission {
  id: string
  module: string
  action: string
  description_tr: string
}

interface AuditLookups {
  actorAccounts: Map<string, ActorAccount>
  personnel: Map<string, string>
  roles: Map<string, string>
  permissions: Map<string, Permission>
}

interface Filters {
  start: string
  end: string
  actor: string
  table: string
  record: string
  action: string
}

const EMPTY_FILTERS: Filters = { start: '', end: '', actor: '', table: '', record: '', action: '' }
const PAGE_SIZE = 25

const TABLE_LABELS: Record<string, string> = {
  app_users: 'Kullanıcı hesapları',
  hr_personel: 'Personel',
  hr_personel_istasyon_yetkileri: 'Personel istasyon yetkileri',
  roles: 'Roller',
  role_permissions: 'Rol yetkileri',
  user_roles: 'Kullanıcı rolleri',
  siparisler: 'Siparişler',
  siparis_detaylari: 'Sipariş kalemleri',
  uretim_emirleri: 'Üretim partileri',
  uretim_emri_detaylari: 'Üretim kalemleri',
  gunluk_uretim_raporlari: 'Günlük üretim raporları',
  gunluk_uretim_istasyon_kayitlari: 'İstasyon kayıtları',
  tamir_kayitlari: 'Tamir kayıtları',
  ayarlar: 'Genel ayarlar',
  telegram_ayarlari: 'Telegram ayarları',
  telegram_rapor_saatleri: 'Telegram rapor saatleri',
  uretim_istasyonlari: 'Üretim istasyonları',
  stok: 'Stok',
  admin_operation: 'Yönetici işlemi',
  auth_migration: 'Hesap aktarımı',
}

const FIELD_LABELS: Record<string, string> = {
  id: 'Kayıt no',
  ad_soyad: 'Ad soyad',
  username: 'Kullanıcı adı',
  email: 'E-posta',
  account_type: 'Hesap türü',
  auth_user_id: 'Giriş hesabı',
  auth_migrated_at: 'Hesaba aktarılma tarihi',
  must_change_password: 'Parola değişikliği gerekli',
  assigned_at: 'Atanma tarihi',
  assigned_by: 'Atayan kullanıcı',
  is_aktif: 'Aktiflik',
  is_active: 'Aktiflik',
  durum: 'Durum',
  rol: 'Rol',
  role_id: 'Rol',
  permission_id: 'Yetki',
  personel_id: 'Personel',
  ad: 'Ad',
  name_tr: 'Rol adı',
  slug: 'Sistem adı',
  is_system: 'Sistem rolü',
  aciklama: 'Açıklama',
  siparis_no: 'Sipariş no',
  siparis_id: 'Sipariş',
  batch_no: 'Parti no',
  uretim_emri_id: 'Üretim partisi',
  cari_id: 'Cari',
  stok_id: 'Stok',
  stok_adi: 'Stok adı',
  adet: 'Adet',
  en: 'En',
  boy: 'Boy',
  fiyat: 'Fiyat',
  iskonto: 'İskonto',
  termin_tarihi: 'Termin tarihi',
  sevk_tarihi: 'Sevk tarihi',
  notlar: 'Notlar',
  olusturma_tarihi: 'Oluşturulma tarihi',
  guncelleme_tarihi: 'Güncellenme tarihi',
  created_at: 'Oluşturulma tarihi',
  updated_at: 'Güncellenme tarihi',
  operation: 'Operasyon',
  target_type: 'Hedef türü',
}

const TABLE_ENTITY_LABELS: Record<string, string> = {
  app_users: 'kullanıcı hesabı',
  hr_personel: 'personel',
  hr_personel_istasyon_yetkileri: 'personel istasyon yetkisi',
  roles: 'rol',
  role_permissions: 'rol yetkisi',
  user_roles: 'kullanıcı rolü',
  siparisler: 'sipariş',
  siparis_detaylari: 'sipariş kalemi',
  uretim_emirleri: 'üretim partisi',
  uretim_emri_detaylari: 'üretim kalemi',
  gunluk_uretim_raporlari: 'günlük üretim raporu',
  gunluk_uretim_istasyon_kayitlari: 'istasyon kaydı',
  tamir_kayitlari: 'tamir kaydı',
  ayarlar: 'ayar',
  telegram_ayarlari: 'Telegram ayarı',
  telegram_rapor_saatleri: 'Telegram rapor saati',
  uretim_istasyonlari: 'üretim istasyonu',
  stok: 'stok kartı',
  admin_operation: 'yönetici işlemi',
  auth_migration: 'hesap aktarımı',
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
  audit: 'İşlem Kayıtları',
  errors: 'Hata Kayıtları',
  admin: 'Sistem Yönetimi',
}

const PERMISSION_ACTION_LABELS: Record<string, string> = {
  read: 'Görüntüleme',
  create: 'Yeni kayıt ekleme',
  update: 'Düzenleme',
  delete: 'Silme',
  manage: 'Tam yönetim',
}

const TECHNICAL_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'olusturma_tarihi',
  'guncelleme_tarihi',
  'assigned_at',
  'auth_migrated_at',
  'slug',
])

const ACTION_CONFIG: Record<AuditAction, { label: string; description: string; classes: string; icon: typeof Plus }> = {
  INSERT: { label: 'Oluşturuldu', description: 'Yeni kayıt eklendi', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: Plus },
  UPDATE: { label: 'Güncellendi', description: 'Kayıt bilgileri değiştirildi', classes: 'bg-blue-50 text-blue-700 ring-blue-600/20', icon: Pencil },
  DELETE: { label: 'Silindi', description: 'Kayıt kaldırıldı', classes: 'bg-red-50 text-red-700 ring-red-600/20', icon: Trash2 },
  INTENT: { label: 'Başlatıldı', description: 'Yönetici işlemi başlatıldı', classes: 'bg-amber-50 text-amber-700 ring-amber-600/20', icon: Clock },
  SUCCESS: { label: 'Başarılı', description: 'Yönetici işlemi tamamlandı', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: CheckCircle2 },
  FAILURE: { label: 'Başarısız', description: 'Yönetici işlemi tamamlanamadı', classes: 'bg-red-50 text-red-700 ring-red-600/20', icon: XCircle },
}

function tableLabel(value: string) {
  return TABLE_LABELS[value] ?? value.replaceAll('_', ' ')
}

function fieldLabel(value: string) {
  return FIELD_LABELS[value] ?? value.replaceAll('_', ' ')
}

function formatPermission(permission: Permission) {
  const moduleLabel = MODULE_LABELS[permission.module] ?? permission.module
  const actionLabel = PERMISSION_ACTION_LABELS[permission.action] ?? permission.action
  return `${moduleLabel} · ${actionLabel}`
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function formatTechnicalId(value: string) {
  return isUuid(value) ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

function formatDateTimeValue(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function formatValue(value: unknown, field?: string, lookups?: AuditLookups): string {
  if (value === null || value === undefined || value === '') return 'Boş'
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)

  const stringValue = String(value)
  if (field && lookups) {
    if (field === 'role_id') return lookups.roles.get(stringValue) ?? `Rol (${formatTechnicalId(stringValue)})`
    if (field === 'permission_id') {
      const permission = lookups.permissions.get(stringValue)
      return permission ? formatPermission(permission) : `Yetki (${formatTechnicalId(stringValue)})`
    }
    if (field === 'personel_id') return lookups.personnel.get(stringValue) ?? `Personel (${formatTechnicalId(stringValue)})`
    if (field === 'auth_user_id' || field === 'assigned_by') {
      const account = lookups.actorAccounts.get(stringValue)
      return account?.display_name.trim() || account?.username || `Kullanıcı (${formatTechnicalId(stringValue)})`
    }
  }

  if (field && (field.endsWith('_at') || field.includes('tarih'))) return formatDateTimeValue(stringValue)
  return field === 'id' || (field?.endsWith('_id') && isUuid(stringValue))
    ? formatTechnicalId(stringValue)
    : stringValue
}

function recordDescription(event: AuditEvent, lookups: AuditLookups) {
  const data = event.new_data ?? event.old_data ?? {}
  if (event.table_name === 'role_permissions') {
    const role = data.role_id ? lookups.roles.get(String(data.role_id)) : null
    const permission = data.permission_id ? lookups.permissions.get(String(data.permission_id)) : null
    if (role && permission) return `${role} · ${formatPermission(permission)}`
  }
  if (event.table_name === 'user_roles' && data.auth_user_id) {
    const account = lookups.actorAccounts.get(String(data.auth_user_id))
    if (account) return account.display_name.trim() || account.username || 'Kullanıcı hesabı'
  }
  const preferredFields = ['ad_soyad', 'siparis_no', 'batch_no', 'stok_adi', 'name_tr', 'ad', 'username', 'operation']
  const preferred = preferredFields.find(field => data[field] !== undefined && data[field] !== null)
  if (preferred) return formatValue(data[preferred], preferred, lookups)
  return 'İlgili kayıt'
}

function eventFields(event: AuditEvent) {
  return event.changed_fields.length > 0
    ? event.changed_fields
    : Array.from(new Set([...Object.keys(event.old_data ?? {}), ...Object.keys(event.new_data ?? {})]))
}

function eventSummary(event: AuditEvent, lookups: AuditLookups) {
  const data = event.new_data ?? event.old_data ?? {}
  const entity = TABLE_ENTITY_LABELS[event.table_name] ?? 'kayıt'

  if (event.table_name === 'role_permissions') {
    const role = data.role_id ? formatValue(data.role_id, 'role_id', lookups) : 'ilgili rol'
    const permission = data.permission_id ? formatValue(data.permission_id, 'permission_id', lookups) : 'Yetki'
    if (event.action === 'INSERT') return `${permission} yetkisi ${role} rolüne verildi.`
    if (event.action === 'DELETE') return `${permission} yetkisi ${role} rolünden kaldırıldı.`
  }

  if (event.table_name === 'user_roles') {
    const account = data.auth_user_id ? formatValue(data.auth_user_id, 'auth_user_id', lookups) : 'Kullanıcı'
    if (event.action === 'UPDATE' && event.old_data?.role_id && event.new_data?.role_id) {
      return `${account} rolü ${formatValue(event.old_data.role_id, 'role_id', lookups)} yerine ${formatValue(event.new_data.role_id, 'role_id', lookups)} olarak değiştirildi.`
    }
    const role = data.role_id ? formatValue(data.role_id, 'role_id', lookups) : 'rol'
    if (event.action === 'INSERT') return `${account} kullanıcısına ${role} rolü atandı.`
    if (event.action === 'DELETE') return `${account} kullanıcısından ${role} rolü kaldırıldı.`
  }

  const visibleFields = eventFields(event).filter(field => !TECHNICAL_FIELDS.has(field))
  if (event.action === 'UPDATE') {
    if (visibleFields.length === 1) {
      const field = visibleFields[0]
      return `${fieldLabel(field)}: ${formatValue(event.old_data?.[field], field, lookups)} → ${formatValue(event.new_data?.[field], field, lookups)}`
    }
    if (visibleFields.length > 1) {
      const names = visibleFields.slice(0, 3).map(fieldLabel).join(', ')
      const remaining = visibleFields.length > 3 ? ` ve ${visibleFields.length - 3} bilgi daha` : ''
      return `${visibleFields.length} bilgi güncellendi: ${names}${remaining}.`
    }
  }

  const name = recordDescription(event, lookups)
  const namedRecord = name === 'İlgili kayıt' ? `Bu ${entity}` : `“${name}” ${entity} kaydı`
  if (event.action === 'INSERT') return `${namedRecord} oluşturuldu.`
  if (event.action === 'DELETE') return `${namedRecord} silindi.`
  return ACTION_CONFIG[event.action].description
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function isToday(value: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' })
  return formatter.format(new Date(value)) === formatter.format(new Date())
}

function EventDetails({ event, lookups }: { event: AuditEvent; lookups: AuditLookups }) {
  const fields = eventFields(event)
  const visibleFields = fields.filter(field => !TECHNICAL_FIELDS.has(field))
  const technicalFields = fields.filter(field => TECHNICAL_FIELDS.has(field))
  const isUpdate = event.action === 'UPDATE'
  const valueSource = event.action === 'DELETE' ? event.old_data : event.new_data
  const detailTitle = event.action === 'INSERT'
    ? 'Oluşturulan bilgiler'
    : event.action === 'DELETE'
      ? 'Silinen kaydın bilgileri'
      : isUpdate
        ? 'Neler değişti?'
        : 'İşlem bilgileri'

  if (fields.length === 0) {
    return <p className="text-sm text-gray-500">Bu işlem için alan detayı bulunmuyor.</p>
  }

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{detailTitle}</p>
      {visibleFields.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className={`hidden sm:grid ${isUpdate ? 'sm:grid-cols-[minmax(130px,0.8fr)_minmax(160px,1fr)_minmax(160px,1fr)]' : 'sm:grid-cols-[minmax(160px,0.8fr)_minmax(200px,2fr)]'} bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500`}>
            <span>Bilgi</span>
            {isUpdate ? <><span>Önce</span><span>Sonra</span></> : <span>Değer</span>}
          </div>
          {visibleFields.map(field => (
            <div key={field} className={`grid grid-cols-1 gap-2 ${isUpdate ? 'sm:grid-cols-[minmax(130px,0.8fr)_minmax(160px,1fr)_minmax(160px,1fr)]' : 'sm:grid-cols-[minmax(160px,0.8fr)_minmax(200px,2fr)]'} border-t border-gray-100 px-4 py-3 text-xs`}>
              <span className="font-semibold text-gray-700">{fieldLabel(field)}</span>
              {isUpdate ? (
                <>
                  <pre className="whitespace-pre-wrap break-words font-sans text-gray-500"><span className="mr-1 font-semibold text-gray-400 sm:hidden">Önce:</span>{formatValue(event.old_data?.[field], field, lookups)}</pre>
                  <pre className="whitespace-pre-wrap break-words font-sans font-medium text-gray-800"><span className="mr-1 font-semibold text-gray-400 sm:hidden">Sonra:</span>{formatValue(event.new_data?.[field], field, lookups)}</pre>
                </>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans font-medium text-gray-800">{formatValue(valueSource?.[field], field, lookups)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
      <details className="mt-3 text-xs text-gray-500">
        <summary className="w-fit cursor-pointer select-none font-medium hover:text-gray-700">Teknik bilgileri göster</summary>
        <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
          {technicalFields.map(field => (
            <div key={field} className="grid grid-cols-1 gap-1 border-b border-gray-100 py-2 last:border-0 sm:grid-cols-[minmax(140px,0.7fr)_minmax(200px,2fr)] sm:gap-4">
              <span className="font-medium text-gray-600">{fieldLabel(field)}</span>
              <span className="break-all font-mono text-[11px] text-gray-500">{formatValue(valueSource?.[field], field, lookups)}</span>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[minmax(140px,0.7fr)_minmax(200px,2fr)] sm:gap-4">
            <span className="font-medium text-gray-600">Kayıt no</span>
            <span className="break-all font-mono text-[11px] text-gray-500">{event.record_id}</span>
          </div>
        </div>
      </details>
    </div>
  )
}

export default function AuditKayitlariPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [actorAccounts, setActorAccounts] = useState<ActorAccount[]>([])
  const [personnel, setPersonnel] = useState<Personel[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS)
  const [activeFilters, setActiveFilters] = useState<Filters>(EMPTY_FILTERS)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase.from('audit_events')
      .select('id, occurred_at, actor_user_id, actor_personel_id, table_name, record_id, action, changed_fields, old_data, new_data')
      .order('occurred_at', { ascending: false })
      .limit(500)

    if (activeFilters.start) query = query.gte('occurred_at', `${activeFilters.start}T00:00:00+03:00`)
    if (activeFilters.end) query = query.lte('occurred_at', `${activeFilters.end}T23:59:59+03:00`)
    if (activeFilters.actor === 'system') query = query.is('actor_user_id', null)
    else if (activeFilters.actor) query = query.eq('actor_user_id', activeFilters.actor)
    if (activeFilters.table) query = query.eq('table_name', activeFilters.table)
    if (activeFilters.record) query = query.eq('record_id', activeFilters.record.trim())
    if (activeFilters.action) query = query.eq('action', activeFilters.action)

    const { data, error: queryError } = await query
    if (queryError) setError('İşlem kayıtları alınamadı. Lütfen yeniden deneyin.')
    else setEvents((data ?? []) as AuditEvent[])
    setLoading(false)
  }, [activeFilters])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  useEffect(() => {
    let ignore = false
    Promise.all([
      supabase.from('app_users').select('auth_user_id, personel_id, display_name, username').order('display_name'),
      supabase.from('hr_personel').select('id, ad_soyad').order('ad_soyad'),
      supabase.from('roles').select('id, name_tr').order('name_tr'),
      supabase.from('permissions').select('id, module, action, description_tr').order('module').order('action'),
    ]).then(([accountResult, personelResult, roleResult, permissionResult]) => {
      if (ignore) return
      setActorAccounts((accountResult.data ?? []) as ActorAccount[])
      setPersonnel((personelResult.data ?? []) as Personel[])
      setRoles((roleResult.data ?? []) as Role[])
      setPermissions((permissionResult.data ?? []) as Permission[])
    })
    return () => { ignore = true }
  }, [])

  const actorAccountById = useMemo(() => new Map(actorAccounts.map(account => [account.auth_user_id, account])), [actorAccounts])
  const personelById = useMemo(() => new Map(personnel.map(person => [person.id, person.ad_soyad])), [personnel])
  const roleById = useMemo(() => new Map(roles.map(role => [role.id, role.name_tr])), [roles])
  const permissionById = useMemo(() => new Map(permissions.map(permission => [permission.id, permission])), [permissions])
  const lookups = useMemo<AuditLookups>(() => ({
    actorAccounts: actorAccountById,
    personnel: personelById,
    roles: roleById,
    permissions: permissionById,
  }), [actorAccountById, personelById, permissionById, roleById])
  const actorOptions = useMemo(() => actorAccounts.map(account => ({
    id: account.auth_user_id,
    name: account.display_name.trim()
      || (account.personel_id ? personelById.get(account.personel_id) : undefined)
      || account.username
      || `Kullanıcı ${account.auth_user_id.slice(0, 8)}`,
  })).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR')), [actorAccounts, personelById])
  const hasActiveFilters = Object.values(activeFilters).some(Boolean)
  const hasDraftFilters = Object.values(draftFilters).some(Boolean)
  const pageEvents = events.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const todayCount = events.filter(event => isToday(event.occurred_at)).length
  const updateCount = events.filter(event => event.action === 'UPDATE').length
  const failureCount = events.filter(event => event.action === 'FAILURE').length

  function applyFilters() {
    setPage(1)
    setExpandedId(null)
    setActiveFilters(draftFilters)
  }

  function clearFilters() {
    setPage(1)
    setExpandedId(null)
    setDraftFilters(EMPTY_FILTERS)
    setActiveFilters(EMPTY_FILTERS)
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">İşlem Kayıtları</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Uygulamada kimin, ne zaman ve hangi bilgiyi değiştirdiğini burada görebilirsiniz.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Gösterilen kayıt', value: events.length, icon: Database, classes: 'bg-gray-100 text-gray-600' },
          { label: 'Bugünkü işlem', value: todayCount, icon: Clock, classes: 'bg-violet-50 text-violet-600' },
          { label: 'Güncelleme', value: updateCount, icon: Pencil, classes: 'bg-blue-50 text-blue-600' },
          { label: 'Başarısız işlem', value: failureCount, icon: AlertCircle, classes: failureCount ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600' },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm sm:p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.classes}`}><item.icon size={17} /></div>
              <div><p className="text-xl font-bold text-gray-900">{item.value}</p><p className="text-xs text-gray-500">{item.label}</p></div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={event => { event.preventDefault(); applyFilters() }} className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Filter size={15} /> Kayıtları filtrele</div>
          {(hasActiveFilters || hasDraftFilters) && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"><RotateCcw size={13} /> Temizle</button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="space-y-1.5"><span className="text-xs font-medium text-gray-600">Başlangıç tarihi</span><input aria-label="Başlangıç tarihi" type="date" value={draftFilters.start} onChange={event => setDraftFilters(value => ({ ...value, start: event.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-gray-600">Bitiş tarihi</span><input aria-label="Bitiş tarihi" type="date" value={draftFilters.end} onChange={event => setDraftFilters(value => ({ ...value, end: event.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-gray-600">İşlemi yapan</span><select aria-label="İşlemi yapan" value={draftFilters.actor} onChange={event => setDraftFilters(value => ({ ...value, actor: event.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">Tüm kullanıcılar</option><option value="system">Sistem işlemleri</option>{actorOptions.map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-gray-600">Kayıt türü</span><select aria-label="Kayıt türü" value={draftFilters.table} onChange={event => setDraftFilters(value => ({ ...value, table: event.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">Tüm kayıt türleri</option>{Object.entries(TABLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-gray-600">İşlem türü</span><select aria-label="İşlem türü" value={draftFilters.action} onChange={event => setDraftFilters(value => ({ ...value, action: event.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">Tüm işlemler</option>{Object.entries(ACTION_CONFIG).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-gray-600">Kayıt numarası</span><div className="flex gap-2"><input aria-label="Kayıt numarası" placeholder="Tam kayıt no" value={draftFilters.record} onChange={event => setDraftFilters(value => ({ ...value, record: event.target.value }))} className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /><button type="submit" aria-label="Filtreleri uygula" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white transition hover:bg-gray-700"><Search size={16} /></button></div></label>
        </div>
      </form>

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span className="flex items-center gap-2"><AlertCircle size={16} /> {error}</span><button type="button" onClick={() => void load()} className="font-semibold hover:underline">Tekrar dene</button></div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-gray-400"><Loader2 size={26} className="animate-spin" /><span className="text-sm">Kayıtlar yükleniyor…</span></div>
        ) : pageEvents.length === 0 ? (
          <EmptyState icon={Search} baslik={hasActiveFilters ? 'Bu filtrelere uygun kayıt bulunamadı' : 'Henüz işlem kaydı yok'} aciklama={hasActiveFilters ? 'Filtreleri değiştirerek yeniden deneyebilirsiniz.' : 'Yeni işlemler yapıldığında kayıtlar burada görünecek.'} boyut="md" aksiyon={hasActiveFilters ? <button type="button" onClick={clearFilters} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white">Filtreleri temizle</button> : undefined} />
        ) : (
          <>
            <div className="divide-y divide-gray-100 md:hidden">
              {pageEvents.map(event => {
                const config = ACTION_CONFIG[event.action]
                const Icon = config.icon
                const isExpanded = expandedId === event.id
                const actorAccount = event.actor_user_id ? actorAccountById.get(event.actor_user_id) : null
                const linkedPersonelName = actorAccount?.personel_id ? personelById.get(actorAccount.personel_id) : null
                const eventPersonelName = event.actor_personel_id ? personelById.get(event.actor_personel_id) : null
                const actorName = actorAccount?.display_name.trim() || linkedPersonelName || eventPersonelName || (event.actor_user_id ? 'Silinmiş kullanıcı' : 'Sistem')
                return (
                  <article key={event.id} className={isExpanded ? 'bg-blue-50/30' : 'bg-white'}>
                    <button type="button" onClick={() => setExpandedId(isExpanded ? null : event.id)} aria-expanded={isExpanded} className="w-full p-4 text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500"><User size={14} /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-gray-900">{actorName}</p><p className="mt-0.5 text-[11px] text-gray-400">{formatDate(event.occurred_at)}</p></div></div>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${config.classes}`}><Icon size={11} />{config.label}</span>
                      </div>
                      <div className="mt-3 rounded-xl bg-gray-50 p-3">
                        <p className="text-xs font-bold text-gray-800">{tableLabel(event.table_name)}</p>
                        <p className="mt-1 text-xs leading-5 text-gray-600">{eventSummary(event, lookups)}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs"><span className="truncate text-gray-400">{recordDescription(event, lookups)}</span><span className="ml-3 inline-flex shrink-0 items-center gap-1 font-semibold text-indigo-600">Detay {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span></div>
                    </button>
                    {isExpanded && <div className="border-t border-gray-100 bg-gray-50/70 p-4"><EventDetails event={event} lookups={lookups} /></div>}
                  </article>
                )
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3.5">Tarih ve saat</th><th className="px-4 py-3.5">İşlemi yapan</th><th className="px-4 py-3.5">Kayıt</th><th className="px-4 py-3.5">İşlem</th><th className="px-4 py-3.5">Değişiklik özeti</th><th className="w-12 px-3 py-3.5"><span className="sr-only">Detay</span></th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {pageEvents.map(event => {
                    const config = ACTION_CONFIG[event.action]
                    const Icon = config.icon
                    const isExpanded = expandedId === event.id
                    const actorAccount = event.actor_user_id ? actorAccountById.get(event.actor_user_id) : null
                    const linkedPersonelName = actorAccount?.personel_id ? personelById.get(actorAccount.personel_id) : null
                    const eventPersonelName = event.actor_personel_id ? personelById.get(event.actor_personel_id) : null
                    const actorName = actorAccount?.display_name.trim()
                      || linkedPersonelName
                      || eventPersonelName
                      || (event.actor_user_id ? 'Silinmiş kullanıcı' : 'Sistem')
                    const actorDetail = actorAccount?.username
                      ? `@${actorAccount.username}`
                      : null
                    return (
                      <Fragment key={event.id}>
                        <tr className={`transition hover:bg-gray-50 ${isExpanded ? 'bg-blue-50/40' : ''}`}>
                          <td className="whitespace-nowrap px-4 py-4"><div className="font-medium text-gray-800">{formatDate(event.occurred_at)}</div><div className="mt-0.5 text-[11px] text-gray-400">İstanbul saati</div></td>
                          <td className="px-4 py-4"><div className="flex items-center gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500"><User size={14} /></div><div><div className="font-medium text-gray-800">{actorName}</div>{actorDetail && <div title={event.actor_user_id ?? undefined} className="mt-0.5 text-[10px] text-gray-400">{actorDetail}</div>}</div></div></td>
                          <td className="px-4 py-4"><div className="font-medium text-gray-800">{tableLabel(event.table_name)}</div><div className="mt-0.5 max-w-64 text-xs leading-5 text-gray-500">{recordDescription(event, lookups)}</div></td>
                          <td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${config.classes}`}><Icon size={12} />{config.label}</span></td>
                          <td className="px-4 py-4"><div className="max-w-96 text-xs leading-5 text-gray-700">{eventSummary(event, lookups)}</div></td>
                          <td className="px-3 py-4"><button type="button" onClick={() => setExpandedId(isExpanded ? null : event.id)} aria-expanded={isExpanded} aria-label={isExpanded ? 'Detayı kapat' : 'Detayı göster'} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">{isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button></td>
                        </tr>
                        {isExpanded && <tr key={`${event.id}-detail`}><td colSpan={6} className="bg-gray-50/70 px-5 py-5"><EventDetails event={event} lookups={lookups} /></td></tr>}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination toplamKayit={events.length} sayfaBoyutu={PAGE_SIZE} mevcutSayfa={page} onSayfaDegistir={nextPage => { setPage(nextPage); setExpandedId(null) }} />
          </>
        )}
      </div>
      {events.length === 500 && <p className="text-center text-xs text-gray-400">Performans için en son 500 kayıt gösteriliyor. Daha eski kayıtlar için tarih filtresi kullanın.</p>}
    </div>
  )
}
