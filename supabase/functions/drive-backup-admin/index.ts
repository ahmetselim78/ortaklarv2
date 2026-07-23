// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.103.3'
import { errorResponse, handleOptions, json, requirePermission, requireServiceSecret, ResponseError } from '../_shared/security.ts'

function triggerEndpoint(base: string, path: string) {
  const normalized = base.endsWith('/') ? base : `${base}/`
  return new URL(path.replace(/^\//, ''), normalized).toString()
}

function validateReturnUrl(req: Request, value: unknown) {
  const origin = req.headers.get('origin')
  if (!origin || typeof value !== 'string') throw new ResponseError(400, 'Güvenli dönüş adresi gerekli')
  const url = new URL(value)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new ResponseError(400, 'Geçersiz dönüş adresi')
  }
  return url.toString()
}

function cleanOptionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null
  return String(value).slice(0, maxLength)
}

async function handleJobStatus(req: Request, body: Record<string, unknown>) {
  requireServiceSecret(req, 'x-backup-secret', 'DRIVE_BACKUP_TRIGGER_SECRET')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) throw new ResponseError(500, 'Supabase servis yapilandirmasi eksik')

  const runId = String(body.run_id ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    throw new ResponseError(400, 'Gecersiz yedekleme calisma kimligi')
  }
  const status = String(body.status ?? '')
  if (!['running', 'succeeded', 'failed'].includes(status)) throw new ResponseError(400, 'Gecersiz yedekleme durumu')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  if (status === 'running') {
    const triggerSource = String(body.trigger_source ?? '')
    if (!['scheduled', 'manual'].includes(triggerSource)) throw new ResponseError(400, 'Gecersiz tetikleme kaynagi')
    const staleBefore = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    await admin.from('drive_backup_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: 'Calisma zaman asimi nedeniyle kapatildi',
    }).eq('status', 'running').lt('started_at', staleBefore)

    const { error } = await admin.from('drive_backup_runs').insert({
      id: runId,
      trigger_source: triggerSource,
      status: 'running',
    })
    if (error?.code === '23505') throw new ResponseError(409, 'Baska bir yedekleme halen calisiyor')
    if (error) throw new ResponseError(500, 'Yedekleme durum kaydi baslatilamadi')
    return json(req, { ok: true }, 201)
  }

  const duration = Number(body.duration_seconds)
  const size = body.size_bytes === null || body.size_bytes === undefined ? null : Number(body.size_bytes)
  const sha256 = body.sha256 === null || body.sha256 === undefined ? null : String(body.sha256)
  if (!Number.isInteger(duration) || duration < 0) throw new ResponseError(400, 'Gecersiz sure')
  if (size !== null && (!Number.isSafeInteger(size) || size < 0)) throw new ResponseError(400, 'Gecersiz yedek boyutu')
  if (sha256 !== null && !/^[0-9a-f]{64}$/.test(sha256)) throw new ResponseError(400, 'Gecersiz SHA-256')

  const update = {
    status,
    completed_at: new Date().toISOString(),
    drive_file_id: cleanOptionalText(body.drive_file_id, 300),
    drive_file_name: cleanOptionalText(body.drive_file_name, 500),
    monthly_drive_file_id: cleanOptionalText(body.monthly_drive_file_id, 300),
    size_bytes: size,
    sha256,
    duration_seconds: duration,
    error_message: cleanOptionalText(body.error_message, 1000),
  }
  const { data, error } = await admin.from('drive_backup_runs').update(update)
    .eq('id', runId).eq('status', 'running').select('id').maybeSingle()
  if (error) throw new ResponseError(500, 'Yedekleme durum kaydi guncellenemedi')
  if (!data) throw new ResponseError(404, 'Calisan yedekleme kaydi bulunamadi')
  return json(req, { ok: true })
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { error: 'Yalnızca POST desteklenir' }, 405)

  let intentId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    if (body.operation === 'job_status') return await handleJobStatus(req, body)

    const { client, user } = await requirePermission(req, 'admin', 'manage', true)
    const triggerUrl = Deno.env.get('DRIVE_BACKUP_TRIGGER_URL')?.trim()
    const triggerSecret = Deno.env.get('DRIVE_BACKUP_TRIGGER_SECRET')?.trim()

    if (body.operation === 'status') {
      if (!triggerUrl || !triggerSecret || triggerSecret.length < 32) {
        return json(req, { ok: true, automatic: false, configured: false })
      }
      try {
        const response = await fetch(triggerEndpoint(triggerUrl, '/status'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${triggerSecret}`, 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(8_000),
        })
        const result = await response.json().catch(() => ({}))
        return json(req, {
          ok: true,
          configured: response.ok && result.ok === true,
          automatic: response.ok && result.automatic === true,
          schedule: result.schedule ?? null,
          time_zone: result.time_zone ?? null,
        })
      } catch {
        return json(req, { ok: true, automatic: false, configured: false })
      }
    }

    if (!triggerUrl || !triggerSecret || triggerSecret.length < 32) {
      throw new ResponseError(503, 'Google Drive yedekleme servisi henüz yapılandırılmamış')
    }
    if (new URL(triggerUrl).protocol !== 'https:') throw new ResponseError(500, 'Yedekleme tetikleyici adresi güvenli değil')

    const operation = body.operation === 'run'
      ? 'drive_backup_run'
      : body.operation === 'change_account'
        ? 'drive_backup_change_account'
        : null
    if (!operation) throw new ResponseError(400, 'Desteklenmeyen yedekleme işlemi')

    const { data: intent, error: intentError } = await client.rpc('begin_admin_operation', {
      p_operation: operation,
      p_target_type: 'backup_job',
      p_target_id: 'ortaklar-drive-backup',
      p_metadata: { actor: user.id },
    })
    if (intentError || !intent) throw new ResponseError(500, 'Audit intent yazılamadı; işlem başlatılmadı')
    intentId = intent

    let endpoint = '/run'
    let payload: Record<string, unknown> = { trigger: 'manual' }
    if (body.operation === 'change_account') {
      endpoint = '/oauth/start'
      payload = { return_url: validateReturnUrl(req, body.return_url) }
    }

    const response = await fetch(triggerEndpoint(triggerUrl, endpoint), {
      method: 'POST',
      headers: { Authorization: `Bearer ${triggerSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.ok !== true) {
      throw new ResponseError(502, body.operation === 'run' ? 'Yedekleme işi başlatılamadı' : 'Google hesap değiştirme akışı başlatılamadı')
    }
    if (body.operation === 'change_account' && !String(result.auth_url ?? '').startsWith('https://accounts.google.com/')) {
      throw new ResponseError(502, 'Google yetkilendirme adresi alınamadı')
    }

    const { error: completeError } = await client.rpc('complete_admin_operation', {
      p_intent_id: intentId,
      p_success: true,
      p_metadata: body.operation === 'run'
        ? { execution: String(result.execution ?? '').slice(0, 300) }
        : { oauth_started: true },
    })
    if (completeError) throw new ResponseError(500, 'İşlem başlatıldı ancak audit sonucu yazılamadı')

    return body.operation === 'run'
      ? json(req, { ok: true, execution: result.execution ?? null }, 202)
      : json(req, { ok: true, auth_url: result.auth_url })
  } catch (error) {
    try {
      if (intentId) {
        const authorization = req.headers.get('authorization')!
        const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: authorization } },
        })
        await client.rpc('complete_admin_operation', {
          p_intent_id: intentId,
          p_success: false,
          p_metadata: { error: error instanceof Error ? error.message : 'unknown' },
        })
      }
    } catch { /* İlk audit intent kaydı kalıcıdır. */ }
    return errorResponse(req, error)
  }
})
