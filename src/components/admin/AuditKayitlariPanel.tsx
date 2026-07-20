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
  kullanici_adi: 'Kullanıcı adı',
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
  personel_id: 'Personel',
  ad: 'Ad',
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

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Boş'
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function recordDescription(event: AuditEvent) {
  const data = event.new_data ?? event.old_data ?? {}
  const preferredFields = ['ad_soyad', 'siparis_no', 'batch_no', 'stok_adi', 'ad', 'kullanici_adi', 'operation']
  const preferred = preferredFields.find(field => data[field] !== undefined && data[field] !== null)
  if (preferred) return formatValue(data[preferred])
  return event.record_id
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

function EventDetails({ event }: { event: AuditEvent }) {
  const fields = event.changed_fields.length > 0
    ? event.changed_fields
    : Array.from(new Set([...Object.keys(event.old_data ?? {}), ...Object.keys(event.new_data ?? {})]))

  if (fields.length === 0) {
    return <p className="text-sm text-gray-500">Bu işlem için alan detayı bulunmuyor.</p>
  }

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Değişiklik detayı</p>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[minmax(130px,0.8fr)_minmax(160px,1fr)_minmax(160px,1fr)] bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          <span>Alan</span>
          <span>Önce</span>
          <span>Sonra</span>
        </div>
        {fields.map(field => (
          <div key={field} className="grid grid-cols-[minmax(130px,0.8fr)_minmax(160px,1fr)_minmax(160px,1fr)] border-t border-gray-100 px-4 py-3 text-xs">
            <span className="font-semibold capitalize text-gray-700">{fieldLabel(field)}</span>
            <pre className="whitespace-pre-wrap break-all font-sans text-gray-500">{formatValue(event.old_data?.[field])}</pre>
            <pre className="whitespace-pre-wrap break-all font-sans font-medium text-gray-800">{formatValue(event.new_data?.[field])}</pre>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] text-gray-400">Kayıt no: {event.record_id}</p>
    </div>
  )
}

export default function AuditKayitlariPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [actorAccounts, setActorAccounts] = useState<ActorAccount[]>([])
  const [personnel, setPersonnel] = useState<Personel[]>([])
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
    ]).then(([accountResult, personelResult]) => {
      if (ignore) return
      setActorAccounts((accountResult.data ?? []) as ActorAccount[])
      setPersonnel((personelResult.data ?? []) as Personel[])
    })
    return () => { ignore = true }
  }, [])

  const actorAccountById = useMemo(() => new Map(actorAccounts.map(account => [account.auth_user_id, account])), [actorAccounts])
  const personelById = useMemo(() => new Map(personnel.map(person => [person.id, person.ad_soyad])), [personnel])
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
            <div className="overflow-x-auto">
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
                      : event.actor_user_id
                        ? `${event.actor_user_id.slice(0, 8)}…`
                        : null
                    return (
                      <Fragment key={event.id}>
                        <tr className={`transition hover:bg-gray-50 ${isExpanded ? 'bg-blue-50/40' : ''}`}>
                          <td className="whitespace-nowrap px-4 py-4"><div className="font-medium text-gray-800">{formatDate(event.occurred_at)}</div><div className="mt-0.5 text-[11px] text-gray-400">İstanbul saati</div></td>
                          <td className="px-4 py-4"><div className="flex items-center gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500"><User size={14} /></div><div><div className="font-medium text-gray-800">{actorName}</div>{actorDetail && <div title={event.actor_user_id ?? undefined} className="mt-0.5 text-[10px] text-gray-400">{actorDetail}</div>}</div></div></td>
                          <td className="px-4 py-4"><div className="font-medium text-gray-800">{tableLabel(event.table_name)}</div><div title={event.record_id} className="mt-0.5 max-w-52 truncate text-xs text-gray-500">{recordDescription(event)}</div></td>
                          <td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${config.classes}`}><Icon size={12} />{config.label}</span></td>
                          <td className="px-4 py-4"><div className="max-w-72 text-xs text-gray-600">{event.changed_fields.length > 0 ? event.changed_fields.slice(0, 3).map(fieldLabel).join(', ') : config.description}{event.changed_fields.length > 3 && <span className="text-gray-400"> +{event.changed_fields.length - 3} alan</span>}</div></td>
                          <td className="px-3 py-4"><button type="button" onClick={() => setExpandedId(isExpanded ? null : event.id)} aria-expanded={isExpanded} aria-label={isExpanded ? 'Detayı kapat' : 'Detayı göster'} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">{isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button></td>
                        </tr>
                        {isExpanded && <tr key={`${event.id}-detail`}><td colSpan={6} className="bg-gray-50/70 px-5 py-5"><EventDetails event={event} /></td></tr>}
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
