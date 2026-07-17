import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface AuditEvent {
  id: string
  occurred_at: string
  actor_user_id: string | null
  table_name: string
  record_id: string
  action: string
  changed_fields: string[]
}

export default function AuditKayitlariPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({ start: '', end: '', user: '', table: '', record: '', action: '' })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    let query = supabase.from('audit_events')
      .select('id, occurred_at, actor_user_id, table_name, record_id, action, changed_fields')
      .order('occurred_at', { ascending: false }).limit(500)
    if (filters.start) query = query.gte('occurred_at', `${filters.start}T00:00:00+03:00`)
    if (filters.end) query = query.lte('occurred_at', `${filters.end}T23:59:59+03:00`)
    if (filters.user) query = query.eq('actor_user_id', filters.user.trim())
    if (filters.table) query = query.eq('table_name', filters.table.trim())
    if (filters.record) query = query.eq('record_id', filters.record.trim())
    if (filters.action) query = query.eq('action', filters.action)
    const { data, error: queryError } = await query
    if (queryError) setError(queryError.message)
    else setEvents((data ?? []) as AuditEvent[])
    setLoading(false)
  }, [filters])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  return <div className="p-6 space-y-4">
    <div><h2 className="text-lg font-bold text-gray-900">İşlem Kayıtları</h2><p className="text-sm text-gray-500">Çevrimiçi append-only audit kayıtları.</p></div>
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
      <input type="date" value={filters.start} onChange={e => setFilters(v => ({ ...v, start: e.target.value }))} className="rounded-lg border px-2 py-2 text-xs" />
      <input type="date" value={filters.end} onChange={e => setFilters(v => ({ ...v, end: e.target.value }))} className="rounded-lg border px-2 py-2 text-xs" />
      <input placeholder="Kullanıcı UUID" value={filters.user} onChange={e => setFilters(v => ({ ...v, user: e.target.value }))} className="rounded-lg border px-2 py-2 text-xs" />
      <input placeholder="Tablo" value={filters.table} onChange={e => setFilters(v => ({ ...v, table: e.target.value }))} className="rounded-lg border px-2 py-2 text-xs" />
      <input placeholder="Kayıt" value={filters.record} onChange={e => setFilters(v => ({ ...v, record: e.target.value }))} className="rounded-lg border px-2 py-2 text-xs" />
      <select value={filters.action} onChange={e => setFilters(v => ({ ...v, action: e.target.value }))} className="rounded-lg border px-2 py-2 text-xs"><option value="">Tüm işlemler</option>{['INSERT','UPDATE','DELETE','INTENT','SUCCESS','FAILURE'].map(a => <option key={a}>{a}</option>)}</select>
    </div>
    <button onClick={() => void load()} className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white"><Search size={13} />Filtrele</button>
    {error && <p className="text-sm text-red-600">{error}</p>}
    {loading ? <Loader2 className="animate-spin text-gray-400" /> : <div className="overflow-auto rounded-xl border"><table className="w-full text-xs"><thead className="bg-gray-50 text-left"><tr><th className="p-3">Zaman</th><th>Kullanıcı</th><th>Tablo</th><th>Kayıt</th><th>İşlem</th><th>Değişen alanlar</th></tr></thead><tbody>{events.map(event => <tr key={event.id} className="border-t"><td className="p-3 whitespace-nowrap">{new Date(event.occurred_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</td><td className="font-mono">{event.actor_user_id?.slice(0, 8) ?? 'sistem'}</td><td>{event.table_name}</td><td className="font-mono max-w-40 truncate">{event.record_id}</td><td>{event.action}</td><td>{event.changed_fields.join(', ')}</td></tr>)}</tbody></table></div>}
  </div>
}
