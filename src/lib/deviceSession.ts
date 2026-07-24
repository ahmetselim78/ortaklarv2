import { supabase } from '@/lib/supabase'
import { functionErrorMessage } from '@/lib/edgeFunctionError'

const DEVICE_ID_KEY = 'ortaklar.device_id.v1'
export const SESSION_ACTION_EVENT = 'ortaklar:session-action'
export const DEVICE_SESSION_TRACKING_ENABLED = !import.meta.env.DEV
  || import.meta.env.VITE_DEVICE_SESSION_TRACKING === 'true'

export type DeviceSessionEvent = 'signed_in' | 'initial_session' | 'token_refreshed' | 'visible' | 'heartbeat'
export type DeviceTouchEvent = 'heartbeat' | 'visible' | 'token_refreshed' | 'action'

export interface CoarseDeviceInfo {
  auto_display_name: string
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  os_family: 'Windows' | 'Android' | 'iOS' | 'macOS' | 'Linux' | 'unknown'
  browser_family: 'Chrome' | 'Edge' | 'Firefox' | 'Safari' | 'unknown'
}

let memoryDeviceId: string | null = null

export function createRandomUuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function getOrCreateDeviceId() {
  if (memoryDeviceId) return memoryDeviceId
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_KEY)
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) {
      memoryDeviceId = stored
      return stored
    }
    const created = createRandomUuid()
    window.localStorage.setItem(DEVICE_ID_KEY, created)
    memoryDeviceId = created
    return created
  } catch {
    memoryDeviceId = createRandomUuid()
    return memoryDeviceId
  }
}

export function describeDevice(userAgent: string): CoarseDeviceInfo {
  const ua = userAgent.toLowerCase()
  const os_family: CoarseDeviceInfo['os_family'] = /windows/.test(ua) ? 'Windows'
    : /android/.test(ua) ? 'Android'
      : /iphone|ipad|ipod/.test(ua) ? 'iOS'
        : /mac os|macintosh/.test(ua) ? 'macOS'
          : /linux/.test(ua) ? 'Linux'
            : 'unknown'
  const browser_family: CoarseDeviceInfo['browser_family'] = /edg\//.test(ua) ? 'Edge'
    : /firefox\//.test(ua) ? 'Firefox'
      : /chrome\//.test(ua) || /crios\//.test(ua) ? 'Chrome'
        : /safari\//.test(ua) ? 'Safari'
          : 'unknown'
  const device_type: CoarseDeviceInfo['device_type'] = /ipad|tablet/.test(ua) ? 'tablet'
    : /mobile|iphone|ipod|android/.test(ua) ? 'mobile'
      : ua ? 'desktop' : 'unknown'
  const typeLabel = device_type === 'mobile' ? 'telefon'
    : device_type === 'tablet' ? 'tablet'
      : device_type === 'desktop' ? 'masaüstü'
        : 'cihaz'
  const osLabel = os_family === 'unknown' ? 'Bilinmeyen' : os_family
  const browserLabel = browser_family === 'unknown' ? '' : ` · ${browser_family}`
  return {
    auto_display_name: `${osLabel} ${typeLabel}${browserLabel}`.slice(0, 80),
    device_type,
    os_family,
    browser_family,
  }
}

export function getCurrentSessionId(accessToken: string | undefined | null) {
  if (!accessToken) return null
  try {
    const payload = accessToken.split('.')[1]
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const claims = JSON.parse(atob(padded)) as { session_id?: string }
    return claims.session_id ?? null
  } catch {
    return null
  }
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('device-sessions', { body })
  if (error) throw new Error(await functionErrorMessage(error, {
    serviceName: 'Cihaz oturumu servisi',
    localEdgeRuntimeHint: import.meta.env.DEV,
  }))
  return data
}

export async function registerCurrentDeviceSession(
  event: DeviceSessionEvent,
  previousAuthSessionId: string | null = null,
) {
  if (!DEVICE_SESSION_TRACKING_ENABLED) return { skipped: true }
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return invoke({
    operation: 'register',
    event,
    client_device_id: getOrCreateDeviceId(),
    previous_auth_session_id: previousAuthSessionId,
    device: describeDevice(userAgent),
  })
}

export async function touchCurrentDeviceSession(event: DeviceTouchEvent, actionType?: string) {
  if (!DEVICE_SESSION_TRACKING_ENABLED) return { skipped: true }
  return invoke({ operation: 'touch', event, action_type: actionType ?? null })
}

export async function endCurrentDeviceSession() {
  if (!DEVICE_SESSION_TRACKING_ENABLED) return { skipped: true }
  return invoke({ operation: 'end_current' })
}

export function recordSessionAction(actionType: string) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(actionType)) return
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_ACTION_EVENT, { detail: { actionType } }))
  }
}

export function isTerminalSessionError(message: string) {
  return /SESSION_REVOKED|SESSION_NOT_FOUND|SESSION_REQUIRED|LEGACY_SESSION_REAUTH_REQUIRED/i.test(message)
}

export function isDeviceSessionServiceUnavailable(message: string) {
  return /HTTP 404|Failed to send a request|Failed to fetch|NetworkError|ERR_NETWORK_CHANGED|ERR_NAME_NOT_RESOLVED|FunctionsRelayError/i.test(message)
}
