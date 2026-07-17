import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AUTH_MIGRATION_MAP']
for (const name of required) if (!process.env[name]) throw new Error(`Eksik ortam değişkeni: ${name}`)

const mapping = JSON.parse(readFileSync(process.env.AUTH_MIGRATION_MAP, 'utf8'))
if (!Array.isArray(mapping)) throw new Error('AUTH_MIGRATION_MAP bir JSON dizi olmalıdır')
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const strong = value => value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)

const { data: roles, error: roleError } = await service.from('roles').select('id, slug')
if (roleError) throw roleError
const roleBySlug = new Map(roles.map(role => [role.slug, role.id]))

for (const item of mapping) {
  const { data: personel, error: personelError } = await service.from('hr_personel')
    .select('id, ad_soyad, kullanici_adi, giris_sifresi, is_aktif').eq('id', item.personel_id).single()
  if (personelError) throw personelError
  if (!personel.is_aktif) { console.log(`${personel.id}: pasif, atlandı`); continue }
  const roleId = roleBySlug.get(item.role_slug)
  if (!roleId) throw new Error(`${personel.id}: rol bulunamadı: ${item.role_slug}`)
  const email = String(item.email ?? '').trim().toLowerCase()
  if (!email.includes('@')) throw new Error(`${personel.id}: geçerli e-posta gerekli`)

  const intentId = randomUUID()
  await service.from('audit_events').insert({
    id: intentId, table_name: 'auth_migration', record_id: personel.id, action: 'INTENT',
    new_data: { email_domain: email.split('@')[1], role_slug: item.role_slug }, metadata: { script: 'migrate-auth-users' },
  }).throwOnError()

  const legacyPassword = String(personel.giris_sifresi ?? '')
  const canKeepPassword = strong(legacyPassword)
  const initialPassword = canKeepPassword ? legacyPassword : `${randomBytes(18).toString('base64url')}aA1!`
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email, password: initialPassword, email_confirm: true,
    user_metadata: { display_name: personel.ad_soyad, username: personel.kullanici_adi, must_change_password: !canKeepPassword },
  })
  if (createError || !created.user) {
    await service.from('audit_events').insert({
      table_name: 'auth_migration', record_id: intentId, action: 'FAILURE',
      new_data: { compensated: false, phase: 'auth_create' }, metadata: {},
    }).throwOnError()
    throw createError ?? new Error('Auth hesabı oluşturulamadı')
  }
  try {
    await service.from('app_users').upsert({
      auth_user_id: created.user.id, personel_id: personel.id, username: personel.kullanici_adi,
      display_name: personel.ad_soyad, account_type: 'personal', is_active: true,
      must_change_password: !canKeepPassword, auth_migrated_at: null,
    }).throwOnError()
    await service.from('user_roles').upsert({ auth_user_id: created.user.id, role_id: roleId }).throwOnError()

    let verified = false
    if (canKeepPassword) {
      const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password: legacyPassword })
      verified = !signInError && signIn.user?.id === created.user.id
      await anon.auth.signOut()
    } else {
      const { error: resetError } = await service.auth.resetPasswordForEmail(email, { redirectTo: `${process.env.APP_ORIGIN ?? 'http://localhost:5173'}/parola-degistir` })
      if (resetError) throw resetError
    }
    if (verified) await service.from('app_users').update({ auth_migrated_at: new Date().toISOString() }).eq('auth_user_id', created.user.id).throwOnError()
    await service.from('audit_events').insert({
      table_name: 'auth_migration', record_id: intentId, action: 'SUCCESS',
      new_data: { auth_user_id: created.user.id, verified, reset_required: !canKeepPassword }, metadata: {},
    }).throwOnError()
    console.log(`${personel.id}: Auth oluşturuldu; doğrulandı=${verified}; reset_gerekli=${!canKeepPassword}`)
  } catch (error) {
    await service.auth.admin.deleteUser(created.user.id)
    await service.from('audit_events').insert({ table_name: 'auth_migration', record_id: intentId, action: 'FAILURE', new_data: { compensated: true }, metadata: {} })
    throw error
  }
}

console.log('Geçiş işi tamamlandı. Reset bekleyen hesaplar giriş yapıp parola değiştirmeden 053 uygulanmamalıdır.')
