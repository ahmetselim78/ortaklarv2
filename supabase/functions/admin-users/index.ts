// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.103.3'
import { errorResponse, handleOptions, json, requirePermission, ResponseError } from '../_shared/security.ts'

const isValidPassword = (password: string) => password.length >= 6
  && /[a-z]/.test(password)
  && /[A-Z]/.test(password)
  && /\d/.test(password)
  && /[!@#$%^&*()_+\-=[\]{};'":|<>?,./`~\\]/.test(password)

const passwordPolicyMessage = 'Parola en az 6 karakter olmalı; küçük harf, büyük harf, rakam ve özel karakter içermelidir'

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { error: 'Yalnızca POST desteklenir' }, 405)
  let intentId: string | null = null
  let createdUserId: string | null = null
  try {
    const { client, user } = await requirePermission(req, 'users', 'manage', true)
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceKey) throw new ResponseError(500, 'Auth yönetim servisi yapılandırılmamış')
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const body = await req.json()
    const operation = String(body.operation ?? '')
    if (operation === 'list') {
      const [{ data: authData, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        admin.from('app_users').select('auth_user_id, personel_id, username, display_name, account_type, is_active, must_change_password, user_roles!user_roles_auth_user_id_fkey(role_id, roles(slug, name_tr))'),
      ])
      if (authError || profileError) throw new ResponseError(500, authError?.message ?? profileError?.message ?? 'Kullanıcılar alınamadı')
      const emails = new Map(authData.users.map(item => [item.id, item.email ?? null]))
      return json(req, { users: (profiles ?? []).map(item => ({ ...item, email: emails.get(item.auth_user_id) ?? null })) })
    }
    const targetId = String(body.auth_user_id ?? body.email ?? 'new-user').slice(0, 200)
    const { data: intent, error: intentError } = await client.rpc('begin_admin_operation', {
      p_operation: operation,
      p_target_type: 'auth_user',
      p_target_id: targetId,
      p_metadata: { actor: user.id, account_type: body.account_type, role_id: body.role_id },
    })
    if (intentError || !intent) throw new ResponseError(500, 'Audit intent yazılamadı; işlem başlatılmadı')
    intentId = intent

    if (operation === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.temporary_password ?? '')
      if (!email.includes('@') || !isValidPassword(password)) throw new ResponseError(400, `Geçerli e-posta ve ${passwordPolicyMessage.toLowerCase()} gerekli`)
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { display_name: String(body.display_name ?? ''), account_type: body.account_type ?? 'personal', must_change_password: true },
      })
      if (error || !data.user) throw new ResponseError(400, error?.message ?? 'Auth kullanıcısı oluşturulamadı')
      createdUserId = data.user.id
      const { error: accessError } = await client.rpc('admin_set_user_access', {
        p_auth_user_id: data.user.id,
        p_personel_id: body.personel_id ?? null,
        p_role_id: body.role_id,
        p_display_name: String(body.display_name ?? ''),
        p_username: String(body.username ?? ''),
        p_account_type: body.account_type ?? 'personal',
        p_must_change_password: true,
      })
      if (accessError) {
        await admin.auth.admin.deleteUser(data.user.id)
        createdUserId = null
        throw new ResponseError(400, accessError.message)
      }
    } else if (operation === 'temporary_password') {
      const password = String(body.temporary_password ?? '')
      if (!isValidPassword(password)) throw new ResponseError(400, passwordPolicyMessage)
      const { error } = await admin.auth.admin.updateUserById(body.auth_user_id, { password })
      if (error) throw new ResponseError(400, error.message)
      const { error: flagError } = await admin.from('app_users').update({ must_change_password: true }).eq('auth_user_id', body.auth_user_id)
      if (flagError) throw new ResponseError(500, 'Geçici parola zorunluluğu kaydedilemedi')
    } else if (operation === 'reset_password') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${Deno.env.get('APP_ORIGIN')}/parola-degistir` })
      if (error) throw new ResponseError(400, error.message)
    } else if (operation === 'deactivate' || operation === 'activate') {
      const active = operation === 'activate'
      const { error: dbError } = await client.rpc('admin_set_user_active', { p_auth_user_id: body.auth_user_id, p_active: active })
      if (dbError) throw new ResponseError(400, dbError.message)
      const { error: authError } = await admin.auth.admin.updateUserById(body.auth_user_id, { ban_duration: active ? 'none' : '876000h' })
      if (authError) {
        const { error: compensationError } = await client.rpc('admin_set_user_active', {
          p_auth_user_id: body.auth_user_id,
          p_active: !active,
        })
        if (compensationError) {
          throw new ResponseError(500, `Auth durumu güncellenemedi ve profil telafisi başarısız oldu: ${authError.message}`)
        }
        throw new ResponseError(400, authError.message)
      }
    } else if (operation === 'assign_role') {
      const { error } = await client.rpc('admin_assign_user_role', {
        p_auth_user_id: body.auth_user_id,
        p_role_id: body.role_id,
      })
      if (error) throw new ResponseError(400, error.message)
    } else {
      throw new ResponseError(400, 'Desteklenmeyen kullanıcı yönetim işlemi')
    }

    const { error: completeError } = await client.rpc('complete_admin_operation', { p_intent_id: intentId, p_success: true, p_metadata: {} })
    if (completeError) {
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId)
      throw new ResponseError(500, 'Audit sonuç kaydı yazılamadı; uygun telafi işlemi uygulandı')
    }
    return json(req, { ok: true, auth_user_id: createdUserId ?? body.auth_user_id ?? null })
  } catch (error) {
    // Intent mevcutsa başarısızlık sonucu best-effort yazılır. Intent yazılamadıysa
    // dış Auth işlemi hiç başlamamıştır.
    try {
      if (intentId) {
        const authorization = req.headers.get('authorization')!
        const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
        await client.rpc('complete_admin_operation', { p_intent_id: intentId, p_success: false, p_metadata: { error: error instanceof Error ? error.message : 'unknown' } })
      }
    } catch { /* intent kaydı zaten kalıcıdır */ }
    return errorResponse(req, error)
  }
})
