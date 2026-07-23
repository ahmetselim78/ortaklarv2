import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  createRandomUuid,
  endCurrentDeviceSession,
  getCurrentSessionId,
  isDeviceSessionServiceUnavailable,
  isTerminalSessionError,
  registerCurrentDeviceSession,
  SESSION_ACTION_EVENT,
  touchCurrentDeviceSession,
  type DeviceSessionEvent,
} from '@/lib/deviceSession'

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

type SessionMessage =
  | { type: 'leader'; tabId: string }
  | { type: 'action'; actionType: string }
  | { type: 'terminal'; message: string }

const LEADER_KEY = 'ortaklar.session.leader.v1'
const LEADER_TTL_MS = 45_000
const LEADER_RENEW_MS = 15_000
const ACCESS_CHECK_MS = 30_000

const AuthContext = createContext<AuthContextValue | null>(null)

function eventForAuthChange(event: AuthChangeEvent): DeviceSessionEvent {
  if (event === 'TOKEN_REFRESHED') return 'token_refreshed'
  if (event === 'SIGNED_IN') return 'signed_in'
  return 'initial_session'
}

function noticeForSessionError(message: string) {
  return /LEGACY_SESSION_REAUTH_REQUIRED|SESSION_REQUIRED/i.test(message)
    ? 'Güvenlik güncellemesi nedeniyle yeniden giriş yapmanız gerekiyor.'
    : 'Bu cihazdaki oturumunuz sonlandırıldı. Lütfen yeniden giriş yapın.'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [access, setAccess] = useState<AccessContextResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const currentSessionRef = useRef<Session | null>(null)
  const previousSessionIdRef = useRef<string | null>(null)
  const registrationRef = useRef<Promise<void>>(Promise.resolve())
  const terminalCleanupRef = useRef(false)
  const isLeaderRef = useRef(false)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const tabIdRef = useRef(createRandomUuid())

  const setCurrentSession = useCallback((next: Session | null) => {
    currentSessionRef.current = next
    setSession(next)
  }, [])

  const clearLocalSession = useCallback(async (message: string, broadcast = true) => {
    if (terminalCleanupRef.current) return
    terminalCleanupRef.current = true
    try {
      window.sessionStorage.setItem('ortaklar.auth.notice', noticeForSessionError(message))
      if (broadcast) channelRef.current?.postMessage({ type: 'terminal', message } satisfies SessionMessage)
      await supabase.removeAllChannels()
      await supabase.auth.signOut({ scope: 'local' })
    } finally {
      setCurrentSession(null)
      setAccess(null)
      setError(null)
      setLoading(false)
      previousSessionIdRef.current = null
      window.setTimeout(() => { terminalCleanupRef.current = false }, 0)
    }
  }, [setCurrentSession])

  const loadAccess = useCallback(async (activeSession?: Session | null) => {
    const current = activeSession === undefined ? (await supabase.auth.getSession()).data.session : activeSession
    setCurrentSession(current)
    if (!current) {
      setAccess(null)
      setError(null)
      setLoading(false)
      return
    }

    const { data, error: rpcError } = await supabase.rpc('my_access_context')
    if (rpcError) {
      if (isTerminalSessionError(rpcError.message)) {
        await clearLocalSession(rpcError.message)
        return
      }
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
  }, [clearLocalSession, setCurrentSession])

  const registerAndLoad = useCallback(async (nextSession: Session, event: DeviceSessionEvent) => {
    const currentId = getCurrentSessionId(nextSession.access_token)
    const previousId = previousSessionIdRef.current
    const register = async () => {
      await registerCurrentDeviceSession(event, previousId && previousId !== currentId ? previousId : null)
      previousSessionIdRef.current = currentId
      await supabase.realtime.setAuth(nextSession.access_token)
    }
    const queuedRegistration = registrationRef.current.catch(() => undefined).then(register)
    registrationRef.current = queuedRegistration
    try {
      await queuedRegistration
      const latestSession = (await supabase.auth.getSession()).data.session
      if (!latestSession || getCurrentSessionId(latestSession.access_token) !== currentId) return
      await loadAccess(nextSession)
    } catch (registerError) {
      const message = registerError instanceof Error ? registerError.message : 'Cihaz oturumu kaydedilemedi'
      if (import.meta.env.DEV && isDeviceSessionServiceUnavailable(message)) {
        await loadAccess(nextSession)
        return
      }
      if (isTerminalSessionError(message)) {
        await clearLocalSession(message)
        return
      }
      setCurrentSession(nextSession)
      setAccess(null)
      setError(message)
      setLoading(false)
    }
  }, [clearLocalSession, loadAccess, setCurrentSession])

  const validateCurrentSession = useCallback(async (event: 'heartbeat' | 'visible') => {
    const current = currentSessionRef.current ?? (await supabase.auth.getSession()).data.session
    if (!current) return
    await registerAndLoad(current, event)
  }, [registerAndLoad])

  const safeTouch = useCallback(async (event: 'heartbeat' | 'visible' | 'token_refreshed' | 'action', actionType?: string) => {
    try {
      await touchCurrentDeviceSession(event, actionType)
    } catch (touchError) {
      const message = touchError instanceof Error ? touchError.message : ''
      if (isTerminalSessionError(message)) await clearLocalSession(message)
    }
  }, [clearLocalSession])

  useEffect(() => {
    let disposed = false
    queueMicrotask(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (disposed) return
        if (data.session) void registerAndLoad(data.session, 'initial_session')
        else void loadAccess(null)
      })
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      window.setTimeout(() => {
        if (disposed) return
        if (event === 'SIGNED_OUT' || !nextSession) {
          setCurrentSession(null)
          setAccess(null)
          setLoading(false)
          return
        }
        void registerAndLoad(nextSession, eventForAuthChange(event))
      }, 0)
    })
    return () => {
      disposed = true
      listener.subscription.unsubscribe()
    }
  }, [loadAccess, registerAndLoad, setCurrentSession])

  useEffect(() => {
    const tabId = tabIdRef.current
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ortaklar-session')
    channelRef.current = channel

    const readLease = () => {
      try {
        return JSON.parse(localStorage.getItem(LEADER_KEY) ?? 'null') as { tabId: string; expiresAt: number } | null
      } catch { return null }
    }
    const writeLease = () => {
      localStorage.setItem(LEADER_KEY, JSON.stringify({ tabId, expiresAt: Date.now() + LEADER_TTL_MS }))
      isLeaderRef.current = true
      channel?.postMessage({ type: 'leader', tabId } satisfies SessionMessage)
    }
    const acquireOrRenew = () => {
      const lease = readLease()
      if (!lease || lease.expiresAt <= Date.now() || lease.tabId === tabId) writeLease()
      else isLeaderRef.current = false
    }
    const handleMessage = (event: MessageEvent<SessionMessage>) => {
      const message = event.data
      if (message.type === 'leader' && message.tabId !== tabId) isLeaderRef.current = false
      if (message.type === 'action' && isLeaderRef.current) void safeTouch('action', message.actionType)
      if (message.type === 'terminal') void clearLocalSession(message.message, false)
    }
    const handleAction = (event: Event) => {
      const actionType = (event as CustomEvent<{ actionType?: string }>).detail?.actionType
      if (!actionType) return
      if (isLeaderRef.current) void safeTouch('action', actionType)
      else {
        channel?.postMessage({ type: 'action', actionType } satisfies SessionMessage)
        const lease = readLease()
        if (!lease || lease.expiresAt <= Date.now()) void safeTouch('action', actionType)
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      acquireOrRenew()
      if (isLeaderRef.current && currentSessionRef.current) {
        void validateCurrentSession('visible')
      }
    }

    acquireOrRenew()
    channel?.addEventListener('message', handleMessage)
    window.addEventListener(SESSION_ACTION_EVENT, handleAction)
    document.addEventListener('visibilitychange', handleVisibility)
    const leaderTimer = window.setInterval(acquireOrRenew, LEADER_RENEW_MS)
    const accessTimer = window.setInterval(() => {
      if (!isLeaderRef.current || !currentSessionRef.current) return
      void validateCurrentSession('heartbeat')
    }, ACCESS_CHECK_MS)

    return () => {
      window.clearInterval(leaderTimer)
      window.clearInterval(accessTimer)
      channel?.removeEventListener('message', handleMessage)
      channel?.close()
      if (channelRef.current === channel) channelRef.current = null
      window.removeEventListener(SESSION_ACTION_EVENT, handleAction)
      document.removeEventListener('visibilitychange', handleVisibility)
      const lease = readLease()
      if (lease?.tabId === tabId) localStorage.removeItem(LEADER_KEY)
    }
  }, [clearLocalSession, safeTouch, validateCurrentSession])

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
      try { await endCurrentDeviceSession() } catch { /* local çıkış engellenmez */ }
      await supabase.removeAllChannels()
      await supabase.auth.signOut({ scope: 'local' })
      setCurrentSession(null)
      setAccess(null)
      previousSessionIdRef.current = null
    },
  }), [session, access, loading, error, permissions, loadAccess, setCurrentSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth, AuthProvider içinde kullanılmalıdır.')
  return context
}
