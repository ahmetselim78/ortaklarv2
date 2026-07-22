import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, AlertCircle, ArrowRight, Bug, CheckCircle2, ClipboardCheck,
  Clock3, KeyRound, Loader2, RefreshCw, Settings, ShieldAlert, UserCog, Users,
} from 'lucide-react'
import { functionErrorMessage } from '@/lib/edgeFunctionError'
import { supabase } from '@/lib/supabase'
import { bugunTarih } from '@/lib/tarih'

interface OverviewUser {
  auth_user_id: string
  display_name: string
  email: string | null
  is_active: boolean
  must_change_password: boolean
}

interface OverviewError {
  id: string
  title: string
  source: string
  severity: string
  status: string
  occurrence_count: number
  last_seen_at: string
}

interface OverviewAudit {
  id: string
  occurred_at: string
  table_name: string
  action: string
}

interface OverviewData {
  productionCount: number | null
  activeUserCount: number | null
  unresolvedErrorCount: number | null
  auditDayCount: number | null
  passwordUsers: OverviewUser[]
  criticalErrors: OverviewError[]
  recentAudit: OverviewAudit[]
}

const EMPTY_DATA: OverviewData = {
  productionCount: null,
  activeUserCount: null,
  unresolvedErrorCount: null,
  auditDayCount: null,
  passwordUsers: [],
  criticalErrors: [],
  recentAudit: [],
}

const TABLE_LABELS: Record<string, string> = {
  app_users: 'Kullanıcı hesabı',
  hr_personel: 'Personel',
  roles: 'Rol',
  role_permissions: 'Rol yetkisi',
  user_roles: 'Kullanıcı rolü',
  gunluk_uretim_raporlari: 'Üretim girişi',
  siparisler: 'Sipariş',
  uretim_emirleri: 'Üretim emri',
  ayarlar: 'Ayar',
  admin_operation: 'Yönetici işlemi',
}

const ACTION_LABELS: Record<string, string> = {
  INSERT: 'oluşturuldu',
  UPDATE: 'güncellendi',
  DELETE: 'silindi',
  FAILURE: 'başarısız oldu',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Veri alınamadı'
}

export default function AdminOverview() {
  const [data, setData] = useState<OverviewData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErrors([])

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const results = await Promise.allSettled([
      supabase.from('gunluk_uretim_raporlari').select('id', { count: 'exact', head: true }).eq('tarih', bugunTarih()),
      supabase.from('system_errors').select('id', { count: 'exact', head: true }).neq('status', 'resolved'),
      supabase.from('audit_events').select('id', { count: 'exact', head: true }).gte('occurred_at', since),
      supabase.from('audit_events').select('id, occurred_at, table_name, action').order('occurred_at', { ascending: false }).limit(5),
      supabase.from('system_errors').select('id, title, source, severity, status, occurrence_count, last_seen_at').neq('status', 'resolved').order('last_seen_at', { ascending: false }).limit(4),
      supabase.functions.invoke('admin-users', { body: { operation: 'list' } }),
    ])

    const next: OverviewData = { ...EMPTY_DATA }
    const nextErrors: string[] = []
    const sourceLabels = ['Üretim özeti', 'Hata özeti', 'İşlem özeti', 'Son hareketler', 'Kritik hatalar', 'Kullanıcı özeti']

    results.forEach((result, index) => {
      if (result.status === 'rejected') nextErrors.push(`${sourceLabels[index]}: ${getErrorMessage(result.reason)}`)
    })

    if (results[0].status === 'fulfilled') {
      if (results[0].value.error) nextErrors.push(`Üretim özeti: ${results[0].value.error.message}`)
      else next.productionCount = results[0].value.count ?? 0
    }
    if (results[1].status === 'fulfilled') {
      if (results[1].value.error) nextErrors.push(`Hata özeti: ${results[1].value.error.message}`)
      else next.unresolvedErrorCount = results[1].value.count ?? 0
    }
    if (results[2].status === 'fulfilled') {
      if (results[2].value.error) nextErrors.push(`İşlem özeti: ${results[2].value.error.message}`)
      else next.auditDayCount = results[2].value.count ?? 0
    }
    if (results[3].status === 'fulfilled') {
      if (results[3].value.error) nextErrors.push(`Son hareketler: ${results[3].value.error.message}`)
      else next.recentAudit = (results[3].value.data ?? []) as OverviewAudit[]
    }
    if (results[4].status === 'fulfilled') {
      if (results[4].value.error) nextErrors.push(`Kritik hatalar: ${results[4].value.error.message}`)
      else next.criticalErrors = (results[4].value.data ?? []) as OverviewError[]
    }
    if (results[5].status === 'fulfilled') {
      const userResult = results[5].value
      if (userResult.error) {
        nextErrors.push(`Kullanıcı özeti: ${await functionErrorMessage(userResult.error, { serviceName: 'Kullanıcı yönetimi servisi', localEdgeRuntimeHint: import.meta.env.DEV })}`)
      } else {
        const users = (userResult.data?.users ?? []) as OverviewUser[]
        next.activeUserCount = users.filter(user => user.is_active).length
        next.passwordUsers = users.filter(user => user.is_active && user.must_change_password).slice(0, 4)
      }
    }

    setData(next)
    setErrors(Array.from(new Set(nextErrors)))
    setLastLoaded(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  const metrics = [
    { label: 'Bugünkü üretim girişi', value: data.productionCount, icon: ClipboardCheck, href: '/admin/uretim-giris', tone: 'indigo' },
    { label: 'Aktif kullanıcı', value: data.activeUserCount, icon: Users, href: '/admin/kullanicilar', tone: 'emerald' },
    { label: 'Çözülmemiş hata', value: data.unresolvedErrorCount, icon: Bug, href: '/admin/hatalar', tone: data.unresolvedErrorCount ? 'red' : 'emerald' },
    { label: 'Son 24 saat işlemi', value: data.auditDayCount, icon: Activity, href: '/admin/islem-kayitlari', tone: 'slate' },
  ] as const

  const toneClasses = {
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    red: 'bg-red-50 text-red-700 ring-red-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  }

  return (
    <div className="min-h-full bg-slate-50/70 p-4 sm:p-6 xl:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
              <span className="h-2 w-2 rounded-full bg-indigo-600" /> Operasyon merkezi
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Günaydın, sistem özeti hazır.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Üretim girişlerini, kullanıcı durumunu ve sistem sağlığını tek bakışta kontrol edin.</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {lastLoaded && <span className="text-xs text-slate-400">Son yenileme {lastLoaded.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
          </div>
        </header>

        {errors.length > 0 && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div><p className="font-semibold">Bazı özetler yüklenemedi.</p><p className="mt-0.5 text-xs leading-5 text-amber-800">Diğer bölümler kullanılabilir. Yenilemeyi deneyebilirsiniz.</p></div>
          </div>
        )}

        <section aria-label="Operasyon göstergeleri" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {metrics.map(metric => {
            const Icon = metric.icon
            return (
              <Link key={metric.label} to={metric.href} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ${toneClasses[metric.tone]}`}><Icon size={19} /></span>
                  <ArrowRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                </div>
                <div className="mt-5 text-2xl font-extrabold tabular-nums text-slate-950 sm:text-3xl">{loading && metric.value === null ? <Loader2 size={22} className="animate-spin text-slate-300" /> : (metric.value ?? '—')}</div>
                <p className="mt-1 text-xs font-medium leading-5 text-slate-500 sm:text-sm">{metric.label}</p>
              </Link>
            )
          })}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700"><ShieldAlert size={18} /></span><div><h2 className="font-bold text-slate-900">Dikkat gerektirenler</h2><p className="text-xs text-slate-500">Kontrol edilmesi önerilen güncel durumlar</p></div></div>
            </div>
            <div className="divide-y divide-slate-100">
              {!loading && data.criticalErrors.length === 0 && data.passwordUsers.length === 0 && (
                <div className="flex items-center gap-3 px-5 py-8 text-sm text-emerald-700"><CheckCircle2 size={20} /><span>Şu anda dikkat gerektiren bir durum görünmüyor.</span></div>
              )}
              {data.criticalErrors.map(item => (
                <Link key={item.id} to="/admin/hatalar" className="flex items-start gap-3 px-5 py-4 transition hover:bg-slate-50">
                  <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.source} · {item.occurrence_count} tekrar · {formatDate(item.last_seen_at)}</span></span>
                  <ArrowRight size={15} className="mt-1 shrink-0 text-slate-300" />
                </Link>
              ))}
              {data.passwordUsers.map(user => (
                <Link key={user.auth_user_id} to="/admin/kullanicilar" className="flex items-start gap-3 px-5 py-4 transition hover:bg-slate-50">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><KeyRound size={15} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{user.display_name || user.email || 'Kullanıcı'}</span><span className="mt-1 block text-xs text-slate-500">Geçici parolasını henüz değiştirmedi</span></span>
                  <ArrowRight size={15} className="mt-1 shrink-0 text-slate-300" />
                </Link>
              ))}
              {loading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 size={18} className="animate-spin" /> Durumlar yükleniyor…</div>}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div><h2 className="font-bold text-slate-900">Son hareketler</h2><p className="text-xs text-slate-500">En yeni beş yönetim işlemi</p></div>
              <Link to="/admin/islem-kayitlari" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Tümünü gör</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {!loading && data.recentAudit.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-400">Henüz işlem kaydı yok.</p>}
              {data.recentAudit.map(item => (
                <Link key={item.id} to="/admin/islem-kayitlari" className="flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><Clock3 size={15} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{TABLE_LABELS[item.table_name] ?? 'Kayıt'} {ACTION_LABELS[item.action] ?? 'değişti'}</span><span className="mt-0.5 block text-xs text-slate-400">{formatDate(item.occurred_at)}</span></span>
                </Link>
              ))}
              {loading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 size={18} className="animate-spin" /> Hareketler yükleniyor…</div>}
            </div>
          </section>
        </div>

        <section>
          <div className="mb-3"><h2 className="font-bold text-slate-900">Hızlı yönetim</h2><p className="mt-1 text-xs text-slate-500">Sık kullanılan yönetim ve ayar alanları</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { href: '/admin/kullanicilar', label: 'Kullanıcılar', desc: 'Hesapları ve personel bağlantılarını yönet', icon: UserCog },
              { href: '/admin/roller', label: 'Roller ve yetkiler', desc: 'Erişim kurallarını düzenle', icon: KeyRound },
              { href: '/admin/uretim-giris', label: 'Üretim kayıtları', desc: 'Günlük girişleri incele ve dışa aktar', icon: ClipboardCheck },
              { href: '/admin/ayarlar', label: 'Ayarlar merkezi', desc: 'Sekiz yapılandırma alanına eriş', icon: Settings },
            ].map(item => (
              <Link key={item.href} to={item.href} className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><item.icon size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.desc}</span></span>
                <ArrowRight size={15} className="mt-1 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
