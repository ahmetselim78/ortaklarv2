// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.103.3'
import {
  errorResponse,
  handleOptions,
  json,
  requireServiceSecret,
  ResponseError,
} from '../_shared/security.ts'

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { error: 'Yalnızca POST desteklenir' }, 405)

  try {
    requireServiceSecret(req, 'x-cron-secret', 'TICARI_SHADOW_CRON_SECRET')

    const body = await req.json().catch(() => ({}))
    const limit = Number(body.limit ?? 20)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ResponseError(400, 'limit 1 ile 100 arasında bir tam sayı olmalıdır')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      throw new ResponseError(500, 'Supabase servis yapılandırması eksik')
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await admin.rpc('golge_fiyatlandirma_calistir', {
      p_limit: limit,
    })
    if (error) {
      console.error('Gölge fiyatlandırma worker RPC hatası', { code: error.code })
      throw new ResponseError(500, 'Gölge fiyatlandırma kuyruğu işlenemedi')
    }

    return json(req, {
      ok: true,
      limit,
      sonuc: data ?? { tamamlanan: 0, basarisiz: 0 },
    })
  } catch (error) {
    return errorResponse(req, error)
  }
})
