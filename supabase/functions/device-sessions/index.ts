// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.103.3'
import {
  errorResponse,
  handleOptions,
  json,
  requireAuthenticated,
  requirePermission,
  ResponseError,
} from '../_shared/security.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseClaims(token: string) {
  try {
    const payload = token.split('.')[1]
    if (!payload) throw new Error('JWT payload eksik')
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    throw new ResponseError(401, 'JWT talepleri okunamadı')
  }
}

function requiredSessionId(token: string, expectedUserId: string) {
  const claims = parseClaims(token)
  const sessionId = String(claims.session_id ?? '')
  if (!uuidPattern.test(sessionId) || claims.sub !== expectedUserId) {
    throw new ResponseError(401, 'Geçerli Auth session_id gerekli')
  }
  return sessionId
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) throw new ResponseError(500, 'Cihaz oturumu servisi yapılandırılmamış')
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { error: 'Yalnızca POST desteklenir' }, 405)

  let intentId: string | null = null
  let intentClient: ReturnType<typeof createClient> | null = null

  try {
    const body = await req.json()
    const operation = String(body.operation ?? '')
    const admin = serviceClient()

    if (operation === 'register' || operation === 'touch' || operation === 'end_current') {
      const { user, token } = await requireAuthenticated(req)
      const sessionId = requiredSessionId(token, user.id)

      if (operation === 'register') {
        const device = body.device ?? {}
        const clientDeviceId = String(body.client_device_id ?? '')
        if (!uuidPattern.test(clientDeviceId)) throw new ResponseError(400, 'Geçersiz cihaz kimliği')
        const previousSessionId = body.previous_auth_session_id == null
          ? null
          : String(body.previous_auth_session_id)
        if (previousSessionId && !uuidPattern.test(previousSessionId)) {
          throw new ResponseError(400, 'Geçersiz önceki oturum kimliği')
        }
        const { data, error } = await admin.rpc('register_device_session', {
          p_auth_user_id: user.id,
          p_auth_session_id: sessionId,
          p_client_device_id: clientDeviceId,
          p_auto_display_name: String(device.auto_display_name ?? '').slice(0, 80),
          p_device_type: String(device.device_type ?? 'unknown'),
          p_os_family: String(device.os_family ?? 'unknown'),
          p_browser_family: String(device.browser_family ?? 'unknown'),
          p_event: String(body.event ?? 'initial_session'),
          p_previous_auth_session_id: previousSessionId,
        })
        if (error) {
          const status = /SESSION_|LEGACY_/.test(error.message) ? 401 : 400
          throw new ResponseError(status, error.message)
        }
        return json(req, { ok: true, session: data })
      }

      if (operation === 'touch') {
        const event = String(body.event ?? 'heartbeat')
        const actionType = body.action_type == null ? null : String(body.action_type).slice(0, 64)
        const { error } = await admin.rpc('touch_device_session', {
          p_auth_user_id: user.id,
          p_auth_session_id: sessionId,
          p_event: event,
          p_action_type: actionType,
        })
        if (error) throw new ResponseError(/SESSION_/.test(error.message) ? 401 : 400, error.message)
        return json(req, { ok: true })
      }

      const { error } = await admin.rpc('end_device_session', {
        p_auth_user_id: user.id,
        p_auth_session_id: sessionId,
      })
      if (error) throw new ResponseError(400, error.message)
      return json(req, { ok: true })
    }

    if (operation === 'list') {
      await requirePermission(req, 'sessions', 'read', true)
      const { data, error } = await admin.rpc('admin_list_device_sessions', {
        p_page: Number(body.page ?? 1),
        p_page_size: Number(body.page_size ?? 50),
        p_search: body.search == null ? null : String(body.search).slice(0, 100),
        p_status: String(body.status ?? 'all'),
        p_device_type: body.device_type || null,
        p_recent_only: body.recent_only === true,
        p_role_slug: body.role_slug || null,
        p_account_type: body.account_type || null,
        p_signed_in_from: body.signed_in_from || null,
        p_signed_in_to: body.signed_in_to || null,
      })
      if (error) throw new ResponseError(400, error.message)
      return json(req, data)
    }

    if (operation === 'rename' || operation === 'revoke' || operation === 'revoke_all') {
      const { client, user, authorization } = await requirePermission(req, 'sessions', 'manage', true)
      intentClient = client
      const actorSessionId = requiredSessionId(authorization.slice('Bearer '.length), user.id)
      const targetId = operation === 'rename'
        ? String(body.device_id ?? '')
        : String(body.auth_session_id ?? body.auth_user_id ?? '')
      if (!uuidPattern.test(targetId)) throw new ResponseError(400, 'Geçersiz hedef kimliği')

      const { data: intent, error: intentError } = await client.rpc('begin_admin_operation', {
        p_operation: operation,
        p_target_type: operation === 'rename' ? 'device' : 'device_session',
        p_target_id: targetId,
        p_metadata: { actor_session_id: actorSessionId },
      })
      if (intentError || !intent) throw new ResponseError(500, 'Audit intent yazılamadı; işlem başlatılmadı')
      intentId = intent

      if (operation === 'rename') {
        const { error } = await admin.rpc('admin_rename_device', {
          p_device_id: body.device_id,
          p_custom_display_name: body.custom_display_name == null ? null : String(body.custom_display_name),
          p_actor_user_id: user.id,
        })
        if (error) throw new ResponseError(400, error.message)
        const { error: completeError } = await client.rpc('complete_admin_operation', {
          p_intent_id: intentId, p_success: true, p_metadata: {},
        })
        if (completeError) throw new ResponseError(500, 'Audit sonuç kaydı yazılamadı')
        intentId = null
        return json(req, { ok: true })
      }

      const { data: revokeData, error: revokeError } = await admin.rpc('admin_revoke_device_sessions', {
        p_actor_user_id: user.id,
        p_actor_session_id: actorSessionId,
        p_scope: operation === 'revoke' ? 'single' : 'all',
        p_target_session_id: operation === 'revoke' ? body.auth_session_id : null,
        p_target_user_id: operation === 'revoke_all' ? body.auth_user_id : null,
      })
      if (revokeError) throw new ResponseError(400, revokeError.message)

      const sessionIds = Array.isArray(revokeData?.auth_session_ids) ? revokeData.auth_session_ids : []
      let confirmed = 0
      for (const authSessionId of sessionIds) {
        const { data, error } = await admin.rpc('revoke_auth_device_session', {
          p_auth_session_id: authSessionId,
        })
        if (!error && data === true) confirmed += 1
      }
      const pending = Math.max(0, sessionIds.length - confirmed)
      if (pending > 0) {
        await admin.rpc('report_system_error', {
          p_source: 'edge_function',
          p_severity: 'critical',
          p_title: 'Cihaz Auth iptali doğrulanamadı',
          p_message: 'Uygulama oturumu kapatıldı; Auth silme sözleşmesi doğrulanamadı ve yeni iptaller devre dışı bırakıldı.',
          p_function_name: 'device-sessions',
          p_context: { pending_count: pending },
        })
      }

      const { error: completeError } = await client.rpc('complete_admin_operation', {
        p_intent_id: intentId,
        p_success: true,
        p_metadata: { revoked_count: sessionIds.length, auth_confirmed: confirmed, auth_pending: pending },
      })
      if (completeError) throw new ResponseError(500, 'Audit sonuç kaydı yazılamadı')
      intentId = null
      return json(req, { ok: true, revoked_count: sessionIds.length, auth_confirmed: confirmed, auth_pending: pending })
    }

    throw new ResponseError(400, 'Desteklenmeyen cihaz oturumu işlemi')
  } catch (error) {
    if (intentId && intentClient) {
      try {
        await intentClient.rpc('complete_admin_operation', {
          p_intent_id: intentId,
          p_success: false,
          p_metadata: { error: error instanceof Error ? error.message : 'unknown' },
        })
      } catch { /* intent kaydı kalıcıdır */ }
    }
    return errorResponse(req, error)
  }
})
