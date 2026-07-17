import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface SystemError {
  id: string; source: string; severity: string; status: string; title: string
  sanitized_message: string; occurrence_count: number; first_seen_at: string; last_seen_at: string
}

export default function HataKayitlariPanel() {
  const [rows, setRows] = useState<SystemError[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase.from('system_errors').select('*').order('last_seen_at', { ascending: false }).limit(500)
    if (queryError) setError(queryError.message); else { setRows((data ?? []) as SystemError[]); setError(null) }
    setLoading(false)
  }, [])
  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  async function setStatus(id: string, status: 'open' | 'acknowledged' | 'resolved') {
    const { error: rpcError } = await supabase.rpc('set_system_error_status', { p_error_id: id, p_status: status })
    if (rpcError) setError(rpcError.message); else await load()
  }
  return <div className="p-6 space-y-4">
    <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Merkezi Hatalar</h2><p className="text-sm text-gray-500">Dedup edilmiş kritik istemci, API, Edge ve operasyon hataları.</p></div><button onClick={() => void load()} className="rounded-lg border p-2"><RefreshCw size={15} /></button></div>
    {error && <p className="text-sm text-red-600">{error}</p>}
    {loading ? <Loader2 className="animate-spin" /> : <div className="space-y-2">{rows.map(row => <div key={row.id} className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex gap-2"><span className={row.severity === 'critical' ? 'text-red-700 font-bold' : 'text-amber-700'}>{row.severity}</span><span className="text-xs text-gray-500">{row.source}</span><span className="text-xs text-gray-500">×{row.occurrence_count}</span></div><h3 className="mt-1 text-sm font-semibold">{row.title}</h3><p className="mt-1 text-xs text-gray-600">{row.sanitized_message}</p><p className="mt-2 text-[11px] text-gray-400">İlk: {new Date(row.first_seen_at).toLocaleString('tr-TR')} · Son: {new Date(row.last_seen_at).toLocaleString('tr-TR')}</p></div><div className="flex gap-1">{(['open','acknowledged','resolved'] as const).map(status => <button key={status} onClick={() => void setStatus(row.id, status)} className={`rounded px-2 py-1 text-[11px] ${row.status === status ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{status === 'open' ? 'Açık' : status === 'acknowledged' ? 'Onaylandı' : 'Çözüldü'}</button>)}</div></div></div>)}</div>}
  </div>
}
