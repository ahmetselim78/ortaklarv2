import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'manage'

export interface AccessUser {
  auth_user_id: string
  personel_id: string | null
  username: string | null
  display_name: string
  account_type: 'personal' | 'device' | 'canary'
  is_active: boolean
  must_change_password: boolean
  auth_migrated_at: string | null
}

interface AccessContextResponse {
  user: AccessUser
  role: { slug: string; name_tr: string } | null
  permissions: Array<{ module: string; action: PermissionAction }>
  aal: 'aal1' | 'aal2'
}

interface AuthContextValue {
  session: Session | null
  access: AccessContextResponse | null
  loading: boolean
  error: string | null
  hasPermission: (module: string, action: PermissionAction) => boolean
  refreshAccess: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [access, setAccess] = useState<AccessContextResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAccess = useCallback(async (activeSession?: Session | null) => {
    const current = activeSession === undefined ? (await supabase.auth.getSession()).data.session : activeSession
    setSession(current)
    if (!current) {
      setAccess(null)
      setError(null)
      setLoading(false)
      return
    }

    const { data, error: rpcError } = await supabase.rpc('my_access_context')
    if (rpcError) {
      setAccess(null)
      setError(rpcError.message)
    } else if (!data) {
      setAccess(null)
      setError('Bu Auth hesabı aktif bir OrtaklarV2 kullanıcısına bağlı değil.')
    } else {
      setAccess(data as AccessContextResponse)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadAccess())
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void loadAccess(nextSession)
    })
    const timer = window.setInterval(() => void loadAccess(), 30_000)
    const visibility = () => {
      if (document.visibilityState === 'visible') void loadAccess()
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      listener.subscription.unsubscribe()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [loadAccess])

  const permissions = useMemo(
    () => new Set((access?.permissions ?? []).map(p => `${p.module}:${p.action}`)),
    [access],
  )

  const value = useMemo<AuthContextValue>(() => ({
    session,
    access,
    loading,
    error,
    hasPermission: (module, action) => permissions.has(`${module}:${action}`),
    refreshAccess: () => loadAccess(),
    signOut: async () => {
      await supabase.auth.signOut({ scope: 'local' })
      setSession(null)
      setAccess(null)
    },
  }), [session, access, loading, error, permissions, loadAccess])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth, AuthProvider içinde kullanılmalıdır.')
  return context
}
