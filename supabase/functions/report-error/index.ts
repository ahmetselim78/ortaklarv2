// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.103.3'
import { errorResponse, handleOptions, json, requirePermission, requireServiceSecret, ResponseError } from '../_shared/security.ts'

const sensitiveKey = /(password|parola|sifre|şifre|token|secret|authorization|cookie|service.?role|api.?key|email|telefon|phone)/i
function scrub(value: unknown): unknown {
  if (typeof value === 'string') return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [TEMİZLENDİ]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[E-POSTA]')
    .replace(/(password|parola|sifre|şifre|token|secret|authorization|api[_-]?key)\s*[:=]\s*[^\s,;&]+/gi, '$1=[TEMİZLENDİ]')
  if (Array.isArray(value)) return value.slice(0, 20).map(scrub)
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).slice(0, 30)
      .map(([key, item]) => [key, sensitiveKey.test(key) ? '[TEMİZLENDİ]' : scrub(item)]),
  )
  return value
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { error: 'Yalnızca POST desteklenir' }, 405)
  try {
    if (req.headers.get('x-ops-alert-secret')) {
      requireServiceSecret(req, 'x-ops-alert-secret', 'OPS_ALERT_SECRET')
    } else {
      await requirePermission(req, 'dashboard', 'read')
    }
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const body = await req.json()
    const scrubbedTitle = String(scrub(body.title ?? 'Uygulama hatası')).slice(0, 300)
    const { data, error } = await client.rpc('report_system_error', {
      p_source: body.source,
      p_severity: body.severity ?? 'error',
      p_title: scrubbedTitle,
      p_message: String(scrub(body.message ?? '')),
      p_route: body.route ? String(scrub(body.route)).split('?')[0] : null,
      p_function_name: body.function_name ? String(scrub(body.function_name)) : null,
      p_context: scrub(body.context ?? {}),
      p_fingerprint: body.fingerprint ?? null,
    })
    if (error) throw new ResponseError(400, error.message)
    const result = Array.isArray(data) ? data[0] : data
    if (result?.should_alert) {
      const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
      const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
      if (token && chatId) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `🚨 OrtaklarV2 kritik hata\n${scrubbedTitle.slice(0, 200)}\nKod: ${String(result.error_id).slice(0, 8)}` }),
          signal: AbortSignal.timeout(10_000),
        })
      }
    }
    return json(req, { ok: true, ...result })
  } catch (error) { return errorResponse(req, error) }
})
