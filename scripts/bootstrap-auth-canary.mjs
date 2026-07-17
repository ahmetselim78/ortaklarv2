import { createClient } from '@supabase/supabase-js'

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AUTH_CANARY_EMAIL', 'AUTH_CANARY_PASSWORD']
for (const name of required) if (!process.env[name]) throw new Error(`Eksik ortam değişkeni: ${name}`)

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { data, error } = await supabase.auth.admin.createUser({
  email: process.env.AUTH_CANARY_EMAIL,
  password: process.env.AUTH_CANARY_PASSWORD,
  email_confirm: true,
  user_metadata: { display_name: 'Auth Restore Canary', account_type: 'canary' },
})
if (error || !data.user) throw error ?? new Error('Auth canary oluşturulamadı')

try {
  const { error: profileError } = await supabase.from('app_users').upsert({
    auth_user_id: data.user.id,
    display_name: 'Auth Restore Canary',
    account_type: 'canary',
    is_active: false,
    must_change_password: false,
    auth_migrated_at: new Date().toISOString(),
  })
  // Aşama 1, 046 Auth köprüsü migration'ından önce çalışabilir. Bu durumda
  // canary yalnız auth.users içinde kalır; zaten hiçbir uygulama rolü yoktur.
  if (profileError && !['42P01', 'PGRST205'].includes(profileError.code ?? '')) throw profileError
  // Bilinçli olarak user_roles satırı oluşturulmaz. Canary Auth'a girebilir,
  // fakat uygulama iş tablolarında hiçbir izni yoktur.
  console.log(`Auth canary oluşturuldu. UUID Secret Manager'a kaydedilmelidir: ${data.user.id}`)
} catch (profileError) {
  await supabase.auth.admin.deleteUser(data.user.id)
  throw profileError
}
