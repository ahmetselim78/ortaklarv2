import { supabase } from '@/lib/supabase'

export type ErrorSource = 'react_boundary' | 'client_unhandled' | 'rpc_api' | 'edge_function' | 'backup_restore' | 'authorization'

const sensitiveKey = /(password|parola|sifre|şifre|token|secret|authorization|cookie|service.?role|api.?key|email|telefon|phone)/i
const bearer = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi
const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export function sanitizeErrorValue(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(bearer, 'Bearer [TEMİZLENDİ]').replace(email, '[E-POSTA]')
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeErrorValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 30).map(([key, item]) => [
      key, sensitiveKey.test(key) ? '[TEMİZLENDİ]' : sanitizeErrorValue(item),
    ]))
  }
  return value
}

async function fingerprint(parts: string[]) {
  const bytes = new TextEncoder().encode(parts.join('|'))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('')
}

export function shouldIgnoreGlobalError(error: unknown, isDevelopment = import.meta.env.DEV) {
  if (!isDevelopment) return false

  const candidate = error instanceof Error ? error : new Error(String(error))
  return candidate.message === 'send was called before connect'
    && candidate.stack?.includes('/@vite/client:') === true
}

export async function reportError(input: {
  source: ErrorSource
  error: unknown
  severity?: 'warning' | 'error' | 'critical'
  title?: string
  functionName?: string
  context?: Record<string, unknown>
}) {
  try {
    const err = input.error instanceof Error ? input.error : new Error(String(input.error))
    const title = input.title ?? 'Uygulama hatası'
    const fp = await fingerprint([input.source, title, err.name, err.message, input.functionName ?? '', window.location.pathname])
    await supabase.functions.invoke('report-error', {
      body: {
        source: input.source,
        severity: input.severity ?? 'error',
        title,
        message: sanitizeErrorValue(err.message),
        route: window.location.pathname,
        function_name: input.functionName ?? null,
        context: sanitizeErrorValue({ ...input.context, stack: err.stack?.split('\n').slice(0, 8).join('\n') }),
        fingerprint: fp,
      },
    })
  } catch {
    // Hata raporlama, yeni bir global hata döngüsü oluşturmamalıdır.
  }
}

export function installGlobalErrorReporting() {
  window.addEventListener('error', event => {
    const error = event.error ?? event.message
    if (shouldIgnoreGlobalError(error)) return
    void reportError({ source: 'client_unhandled', error, title: 'Yakalanmamış istemci hatası' })
  })
  window.addEventListener('unhandledrejection', event => {
    if (shouldIgnoreGlobalError(event.reason)) return
    void reportError({ source: 'client_unhandled', error: event.reason, title: 'Yakalanmamış promise hatası' })
  })
  window.addEventListener('ortaklar:api-error', event => {
    const detail = (event as CustomEvent<{ status: number; path: string; source: 'rpc_api' | 'authorization' }>).detail
    void reportError({
      source: detail.source,
      severity: detail.status >= 500 ? 'critical' : 'warning',
      error: new Error(`HTTP ${detail.status}`),
      title: detail.source === 'authorization' ? 'Yetkilendirme ihlali' : 'Kritik RPC/API hatası',
      functionName: detail.path,
      context: { status: detail.status },
    })
  })
}
