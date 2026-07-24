import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ChevronDown, Laptop, Loader2, LogOut, Pencil, RefreshCw, Search,
  ShieldCheck, Smartphone, Tablet, Users, Wifi, WifiOff,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { DEVICE_SESSION_TRACKING_ENABLED, recordSessionAction } from '@/lib/deviceSession'
import { functionErrorMessage } from '@/lib/edgeFunctionError'
import { supabase } from '@/lib/supabase'

interface DeviceSessionRow {
  id: string
  auth_user_id: string
  auth_session_id: string
  signed_in_at: string
  last_seen_at: string
  last_action_at: string | null
  last_action_type: string | null
  status: 'active' | 'ended' | 'revoked' | 'replaced' | 'auth_missing'
  termination_reason: string | null
  ended_at: string | null
  auth_revocation_confirmed_at: string | null
  auth_revocation_attempt_count: number
  device_id: string
  auto_display_name: string
  custom_display_name: string | null
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  os_family: string
  browser_family: string
  user_display_name: string
  username: string | null
  account_type: string
  role_slug: string | null
  role_name: string | null
  auth_active: boolean
  recently_seen: boolean
}

interface ListResponse {
  items: DeviceSessionRow[]
  total: number
  page: number
  page_size: number
}

const PAGE_SIZE = 25

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Istanbul',
  }).format(new Date(value))
}

function formatDuration(start: string, end: string | null) {
  const milliseconds = Math.max(0, new Date(end ?? Date.now()).getTime() - new Date(start).getTime())
  const minutes = Math.floor(milliseconds / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days} gün ${hours} sa.`
  if (hours > 0) return `${hours} sa. ${minutes % 60} dk.`
  return `${minutes} dk.`
}

function reasonLabel(reason: string | null) {
  const labels: Record<string, string> = {
    manual_logout: 'Kullanıcı çıkışı',
    admin_single: 'Yönetici: tek cihaz',
    admin_all: 'Yönetici: tüm cihazlar',
    token_replaced: 'Oturum yenilendi',
    auth_deleted: 'Auth oturumu bulunamadı',
    unknown: 'Bilinmeyen',
  }
  return reason ? (labels[reason] ?? reason) : '—'
}

function DeviceIcon({ type }: { type: DeviceSessionRow['device_type'] }) {
  if (type === 'mobile') return <Smartphone size={17} />
  if (type === 'tablet') return <Tablet size={17} />
  return <Laptop size={17} />
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('device-sessions', { body })
  if (error) throw new Error(await functionErrorMessage(error, {
    serviceName: 'Cihaz oturumu servisi',
    localEdgeRuntimeHint: import.meta.env.DEV,
  }))
  return data
}

export default function CihazOturumlariPanel() {
  const { access, hasPermission } = useAuth()
  const [rows, setRows] = useState<DeviceSessionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active')
  const [deviceType, setDeviceType] = useState('')
  const [roleSlug, setRoleSlug] = useState('')
  const [accountType, setAccountType] = useState('')
  const [signedInFrom, setSignedInFrom] = useState('')
  const [signedInTo, setSignedInTo] = useState('')
  const [recentOnly, setRecentOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canManage = hasPermission('sessions', 'manage')

  const load = useCallback(async () => {
    if (!DEVICE_SESSION_TRACKING_ENABLED) {
      setRows([])
      setTotal(0)
      setError('Yerel cihaz oturumu takibi kapalı. Test etmek için VITE_DEVICE_SESSION_TRACKING=true ayarlayıp Edge Function’ı başlatın.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await invoke({
        operation: 'list', page, page_size: PAGE_SIZE, search, status,
        device_type: deviceType || null, role_slug: roleSlug || null,
        account_type: accountType || null, signed_in_from: signedInFrom || null,
        signed_in_to: signedInTo || null, recent_only: recentOnly,
      }) as ListResponse
      setRows(data.items ?? [])
      setTotal(data.total ?? 0)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Oturumlar alınamadı')
    } finally {
      setLoading(false)
    }
  }, [accountType, deviceType, page, recentOnly, roleSlug, search, signedInFrom, signedInTo, status])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setPage(1) }, [accountType, deviceType, recentOnly, roleSlug, search, signedInFrom, signedInTo, status])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const activeCount = useMemo(() => rows.filter(row => row.status === 'active' && row.auth_active).length, [rows])
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(() => new Set())

  const userGroups = useMemo(() => {
    const byUser = new Map<string, DeviceSessionRow[]>()
    for (const row of rows) {
      const existing = byUser.get(row.auth_user_id)
      if (existing) existing.push(row)
      else byUser.set(row.auth_user_id, [row])
    }
    return [...byUser.entries()].map(([authUserId, sessions]) => {
      const sorted = [...sessions].sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())
      const primary = sorted[0]
      const activeSessions = sorted.filter(session => session.status === 'active' && session.auth_active)
      return {
        authUserId,
        sessions: sorted,
        primary,
        activeCount: activeSessions.length,
        recentlySeen: sorted.some(session => session.recently_seen),
        lastSeenAt: primary?.last_seen_at ?? null,
      }
    }).sort((a, b) => {
      if (a.activeCount !== b.activeCount) return b.activeCount - a.activeCount
      return new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime()
    })
  }, [rows])

  function toggleUser(authUserId: string) {
    setExpandedUsers(current => {
      const next = new Set(current)
      if (next.has(authUserId)) next.delete(authUserId)
      else next.add(authUserId)
      return next
    })
  }

  async function revoke(row: DeviceSessionRow) {
    const name = row.custom_display_name ?? row.auto_display_name
    if (!window.confirm(`${row.user_display_name} kullanıcısının “${name}” oturumu sonlandırılsın mı?`)) return
    setBusyId(row.id)
    setError(null)
    try {
      const result = await invoke({ operation: 'revoke', auth_session_id: row.auth_session_id }) as { auth_pending?: number }
      recordSessionAction('admin_session_revoke')
      if ((result.auth_pending ?? 0) > 0) {
        setError('Uygulama erişimi kesildi; Auth iptal doğrulaması arka planda yeniden denenecek.')
      }
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Oturum sonlandırılamadı')
    } finally { setBusyId(null) }
  }

  async function revokeAll(row: DeviceSessionRow) {
    const self = row.auth_user_id === access?.user.auth_user_id
    const wording = self ? 'diğer bütün cihaz oturumlarınız' : `${row.user_display_name} kullanıcısının bütün cihaz oturumları`
    if (!window.confirm(`${wording} sonlandırılsın mı?`)) return
    setBusyId(`all:${row.auth_user_id}`)
    setError(null)
    try {
      await invoke({ operation: 'revoke_all', auth_user_id: row.auth_user_id })
      recordSessionAction('admin_sessions_revoke_all')
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Oturumlar sonlandırılamadı')
    } finally { setBusyId(null) }
  }

  async function rename(row: DeviceSessionRow) {
    const next = window.prompt('Cihaz için özel ad (boş bırakırsanız otomatik ad kullanılır):', row.custom_display_name ?? '')
    if (next === null) return
    setBusyId(`rename:${row.device_id}`)
    setError(null)
    try {
      await invoke({ operation: 'rename', device_id: row.device_id, custom_display_name: next.trim() || null })
      recordSessionAction('admin_device_rename')
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Cihaz adı değiştirilemedi')
    } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-950"><ShieldCheck className="text-indigo-600" /> Cihaz Oturumları</h1>
          <p className="mt-1 text-sm text-slate-500">Açık Auth oturumlarını, cihazları ve son anlamlı işlemleri yönetin.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-400">Toplam kayıt</div><div className="mt-1 text-2xl font-bold text-slate-900">{total}</div></div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs font-semibold uppercase text-emerald-600">Bu sayfada açık</div><div className="mt-1 text-2xl font-bold text-emerald-800">{activeCount}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase text-slate-400">Yakın zamanda görülen</div><div className="mt-1 text-2xl font-bold text-slate-900">{rows.filter(row => row.recently_seen).length}</div></div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Kullanıcı veya cihaz ara" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" /></label>
        <select value={status} onChange={event => setStatus(event.target.value as typeof status)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm"><option value="active">Açık oturumlar</option><option value="inactive">Pasif oturumlar</option><option value="all">Tümü</option></select>
        <select value={deviceType} onChange={event => setDeviceType(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm"><option value="">Tüm cihazlar</option><option value="desktop">Masaüstü</option><option value="mobile">Telefon</option><option value="tablet">Tablet</option><option value="unknown">Bilinmeyen</option></select>
        <select value={roleSlug} onChange={event => setRoleSlug(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm"><option value="">Tüm roller</option><option value="administrator">Yönetici</option><option value="office_planning">Ofis / planlama</option><option value="operator">Operatör</option><option value="viewer_device">Ortak cihaz</option></select>
        <select value={accountType} onChange={event => setAccountType(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm"><option value="">Tüm hesap türleri</option><option value="personal">Kişisel</option><option value="device">Cihaz</option><option value="canary">Canary</option></select>
        <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs font-medium text-slate-500"><span>Giriş başlangıcı</span><input type="date" value={signedInFrom} onChange={event => setSignedInFrom(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-700" /></label>
        <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs font-medium text-slate-500"><span>Giriş bitişi</span><input type="date" value={signedInTo} onChange={event => setSignedInTo(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-700" /></label>
        <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm"><input type="checkbox" checked={recentOnly} onChange={event => setRecentOnly(event.target.checked)} /> Yakın görülen</label>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? <div className="grid min-h-52 place-items-center text-slate-500"><Loader2 className="animate-spin" /></div>
          : userGroups.length === 0 ? <div className="grid min-h-52 place-items-center text-sm text-slate-500">Filtreye uygun oturum bulunamadı.</div>
            : (
              <div className="divide-y divide-slate-100">
                {userGroups.map(group => {
                  const { primary, sessions, authUserId } = group
                  const expanded = expandedUsers.has(authUserId)
                  const self = authUserId === access?.user.auth_user_id
                  const hasActive = group.activeCount > 0
                  return (
                    <article key={authUserId} className="bg-white">
                      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() => toggleUser(authUserId)}
                          aria-expanded={expanded}
                          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1 text-left outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${hasActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                            <Users size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-bold text-slate-900">{primary.user_display_name}</span>
                              {primary.username && <span className="text-xs text-slate-400">@{primary.username}</span>}
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${hasActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                {hasActive ? <><Wifi size={11} /> {group.activeCount} açık</> : <><WifiOff size={11} /> Pasif</>}
                              </span>
                            </span>
                            <span className="mt-1 block text-xs text-slate-500">
                              {primary.role_name ?? 'Rol yok'} · {primary.account_type} · {sessions.length} cihaz
                              {group.recentlySeen ? ' · Yakın zamanda görüldü' : ''}
                            </span>
                            <span className="mt-1 block text-[11px] text-slate-400">
                              Son görülme {formatDate(group.lastSeenAt)}
                            </span>
                          </span>
                          <ChevronDown size={18} className={`mt-1 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        {hasActive && (
                          <button
                            type="button"
                            title={self ? 'Diğer cihazlardan çıkış yap' : 'Tüm cihazlardan çıkış yap'}
                            onClick={() => void revokeAll(primary)}
                            disabled={!canManage || busyId != null}
                            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-200 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                          >
                            {busyId === `all:${authUserId}` ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                            Tümünden çıkış
                          </button>
                        )}
                      </div>

                      {expanded && (
                        <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                          {sessions.map(row => {
                            const technicallyActive = row.status === 'active' && row.auth_active
                            const deviceSelf = row.auth_user_id === access?.user.auth_user_id
                            return (
                              <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 text-slate-800">
                                      <DeviceIcon type={row.device_type} />
                                      <span className="font-semibold">{row.custom_display_name ?? row.auto_display_name}</span>
                                      {technicallyActive
                                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><Wifi size={11} /> Auth açık</span>
                                        : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"><WifiOff size={11} /> Pasif</span>}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">{row.os_family} · {row.browser_family}</p>
                                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                                      <div><span className="font-semibold text-slate-500">Giriş</span><div>{formatDate(row.signed_in_at)}</div><div className="text-slate-400">{formatDuration(row.signed_in_at, technicallyActive ? null : row.ended_at)}</div></div>
                                      <div><span className="font-semibold text-slate-500">Son işlem</span><div>{formatDate(row.last_action_at)}</div><div className="text-slate-400">{row.last_action_type ?? 'Anlamlı işlem yok'}</div></div>
                                      <div><span className="font-semibold text-slate-500">Son görülme</span><div>{formatDate(row.last_seen_at)}</div><div className={row.recently_seen ? 'font-medium text-emerald-600' : 'text-slate-400'}>{row.recently_seen ? 'Yakın zamanda görüldü' : 'Yakın değil'}</div></div>
                                      <div><span className="font-semibold text-slate-500">Durum notu</span><div>{reasonLabel(row.termination_reason)}</div>{row.status === 'revoked' && !row.auth_revocation_confirmed_at && <div className="font-medium text-amber-700">Auth iptali bekliyor · {row.auth_revocation_attempt_count} deneme</div>}</div>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 gap-2">
                                    <button type="button" title="Cihaz adını değiştir" onClick={() => void rename(row)} disabled={!canManage || busyId != null} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40"><Pencil size={15} /></button>
                                    {technicallyActive && (
                                      <button type="button" title="Bu cihazdan çıkış yap" onClick={() => void revoke(row)} disabled={!canManage || deviceSelf || busyId != null} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-40">
                                        {busyId === row.id ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500"><span>Sayfa {page} / {pageCount}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Önceki</button><button type="button" disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Sonraki</button></div></div>
      </div>
    </div>
  )
}
