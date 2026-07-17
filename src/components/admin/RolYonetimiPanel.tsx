import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Role { id: string; slug: string; name_tr: string; is_system: boolean }
interface Permission { id: string; module: string; action: string; description_tr: string }
interface RolePermission { role_id: string; permission_id: string }

export default function RolYonetimiPanel() {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [links, setLinks] = useState<RolePermission[]>([])
  const [selected, setSelected] = useState<string>('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    const [r, p, l] = await Promise.all([
      supabase.from('roles').select('id, slug, name_tr, is_system').order('name_tr'),
      supabase.from('permissions').select('*').order('module').order('action'),
      supabase.from('role_permissions').select('role_id, permission_id'),
    ])
    const firstError = r.error ?? p.error ?? l.error
    if (firstError) setError(firstError.message)
    else {
      setRoles((r.data ?? []) as Role[]); setPermissions((p.data ?? []) as Permission[]); setLinks((l.data ?? []) as RolePermission[])
      setSelected(current => current || r.data?.[0]?.id || '')
    }
    setLoading(false)
  }, [])
  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  const selectedLinks = useMemo(() => new Set(links.filter(link => link.role_id === selected).map(link => link.permission_id)), [links, selected])
  async function createRole() {
    const normalized = slug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    if (!name.trim() || !/^[a-z][a-z0-9_]*$/.test(normalized)) { setError('Geçerli rol adı ve kodu gerekli.'); return }
    const { error: insertError } = await supabase.from('roles').insert({ name_tr: name.trim(), slug: normalized, is_system: false })
    if (insertError) setError(insertError.message); else { setName(''); setSlug(''); await load() }
  }
  async function toggle(permissionId: string) {
    const exists = selectedLinks.has(permissionId)
    const query = exists
      ? supabase.from('role_permissions').delete().eq('role_id', selected).eq('permission_id', permissionId)
      : supabase.from('role_permissions').insert({ role_id: selected, permission_id: permissionId })
    const { error: updateError } = await query
    if (updateError) setError(updateError.message); else await load()
  }
  return <div className="p-6 space-y-5">
    <div><h2 className="text-lg font-bold">Rol ve İzin Yönetimi</h2><p className="text-sm text-gray-500">Özel roller yalnızca sabit izin kataloğundan oluşturulur.</p></div>
    <div className="flex flex-wrap gap-2 rounded-xl border bg-gray-50 p-3"><input value={name} onChange={e => setName(e.target.value)} placeholder="Rol adı" className="rounded-lg border px-3 py-2 text-sm" /><input value={slug} onChange={e => setSlug(e.target.value)} placeholder="rol_kodu" className="rounded-lg border px-3 py-2 text-sm" /><button onClick={() => void createRole()} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"><Plus size={14} />Rol oluştur</button></div>
    {error && <p className="text-sm text-red-600">{error}</p>}
    {loading ? <Loader2 className="animate-spin" /> : <div className="grid gap-4 lg:grid-cols-[240px_1fr]"><div className="space-y-1">{roles.map(role => <button key={role.id} onClick={() => setSelected(role.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected === role.id ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>{role.name_tr}{role.is_system && <span className="ml-2 text-[10px] opacity-60">sistem</span>}</button>)}</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{permissions.map(permission => <label key={permission.id} className="flex items-center gap-2 rounded-lg border p-2 text-xs"><input type="checkbox" checked={selectedLinks.has(permission.id)} onChange={() => void toggle(permission.id)} /><span><strong>{permission.module}</strong> / {permission.action}</span></label>)}</div></div>}
  </div>
}
