// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.103.3'

const defaultOrigins = [
  'https://glassflow-production-281837608848.europe-west10.run.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://192.168.1.14:5173',
]

const configuredOrigins = [...new Set([
  ...defaultOrigins,
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(','),
].map(v => v.trim()).filter(Boolean))]

function assertAllowedOrigin(req: Request) {
  const origin = req.headers.get('origin')
  // Sunucudan sunucuya çağrılarda Origin bulunmaz. Tarayıcı çağrılarında ise
  // yalnızca açık allowlist kabul edilir; yalnız preflight kontrolüne güvenilmez.
  if (origin && !configuredOrigins.includes(origin)) {
    throw new ResponseError(403, 'CORS origin reddedildi')
  }
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = configuredOrigins.includes(origin) ? origin : configuredOrigins[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-ops-alert-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export function handleOptions(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  const origin = req.headers.get('origin') ?? ''
  if (!configuredOrigins.includes(origin)) return json(req, { error: 'CORS origin reddedildi' }, 403)
  return new Response(null, { status: 204, headers: corsHeaders(req) })
}

export async function requirePermission(req: Request, module: string, action: string, requireAal2 = false) {
  assertAllowedOrigin(req)
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) throw new ResponseError(401, 'Geçerli kullanıcı JWT’si gerekli')
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) throw new ResponseError(500, 'Supabase Edge yapılandırması eksik')
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const token = authorization.slice('Bearer '.length)
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError?.code === 'session_not_found') {
    throw new ResponseError(401, 'Oturum artık geçerli değil. Lütfen yeniden giriş yapın')
  }
  if (userError || !userData.user) throw new ResponseError(401, 'JWT doğrulanamadı')
  const { data: allowed, error: permissionError } = await client.rpc('has_permission', { p_module: module, p_action: action })
  if (permissionError || allowed !== true) throw new ResponseError(403, 'Bu işlem için yetkiniz yok')
  if (requireAal2) {
    const { data: aal2, error: aalError } = await client.rpc('current_aal2')
    if (aalError || aal2 !== true) throw new ResponseError(403, 'AAL2 doğrulaması gerekli')
  }
  return { client, user: userData.user, authorization }
}

// Oturum kaydı henüz oluşturulmadan çağrılan cihaz bootstrap akışları RBAC
// yardımcısına bağımlı olamaz. Bu yardımcı yalnız JWT/Auth oturumunu doğrular;
// uygulama kullanıcısı ve session_id bağı servis RPC'sinde ayrıca doğrulanır.
export async function requireAuthenticated(req: Request) {
  assertAllowedOrigin(req)
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) throw new ResponseError(401, 'Geçerli kullanıcı JWT’si gerekli')
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) throw new ResponseError(500, 'Supabase Edge yapılandırması eksik')
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const token = authorization.slice('Bearer '.length)
  const { data, error } = await client.auth.getUser(token)
  if (error?.code === 'session_not_found') {
    throw new ResponseError(401, 'SESSION_NOT_FOUND')
  }
  if (error || !data.user) throw new ResponseError(401, 'JWT doğrulanamadı')
  return { client, user: data.user, authorization, token }
}

export function requireServiceSecret(req: Request, header: string, envName: string) {
  assertAllowedOrigin(req)
  const expected = Deno.env.get(envName)
  const actual = req.headers.get(header)
  if (!expected || !actual || actual.length !== expected.length || actual !== expected) {
    throw new ResponseError(401, 'Servis kimliği doğrulanamadı')
  }
}

export class ResponseError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export async function errorResponse(req: Request, error: unknown): Promise<Response> {
  const status = error instanceof ResponseError ? error.status : 500
  if (status === 401 || status === 403 || status >= 500) {
    try {
      const url = Deno.env.get('SUPABASE_URL')
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (url && serviceKey) {
        const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        await admin.rpc('report_system_error', {
          p_source: status === 401 || status === 403 ? 'authorization' : 'edge_function',
          p_severity: status >= 500 ? 'critical' : 'warning',
          p_title: status >= 500 ? 'Edge Function hatası' : 'Yetkilendirme ihlali',
          p_message: error instanceof Error ? error.message : 'Bilinmeyen Edge hatası',
          p_function_name: new URL(req.url).pathname.replace(/^\/+|\/+$/g, '') || null,
          p_context: { status, method: req.method },
        })
      }
    } catch { /* hata raporlama ana yanıtı engellemez */ }
  }
  if (error instanceof ResponseError) return json(req, { error: error.message }, error.status)
  console.error(error)
  return json(req, { error: 'İşlem sırasında sunucu hatası oluştu' }, 500)
}
