import { createClient } from '@supabase/supabase-js'

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD']
for (const name of required) if (!process.env[name]) throw new Error(`Eksik ortam değişkeni: ${name}`)

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { data, error } = await supabase.auth.admin.createUser({
  email: process.env.BOOTSTRAP_ADMIN_EMAIL,
  password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  email_confirm: true,
  user_metadata: { display_name: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Sistem Yöneticisi', must_change_password: true },
})
if (error || !data.user) throw error ?? new Error('Auth kullanıcısı oluşturulamadı')

const administratorRole = '10000000-0000-0000-0000-000000000001'
const { error: profileError } = await supabase.from('app_users').upsert({
  auth_user_id: data.user.id,
  personel_id: process.env.BOOTSTRAP_PERSONEL_ID || null,
  display_name: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Sistem Yöneticisi',
  account_type: 'personal', is_active: true, must_change_password: true, auth_migrated_at: new Date().toISOString(),
})
if (profileError) { await supabase.auth.admin.deleteUser(data.user.id); throw profileError }
const { error: roleError } = await supabase.from('user_roles').upsert({ auth_user_id: data.user.id, role_id: administratorRole })
if (roleError) { await supabase.auth.admin.deleteUser(data.user.id); throw roleError }
console.log(`Bootstrap yönetici oluşturuldu: ${data.user.id}. İlk girişte parola değişimi ve TOTP zorunludur.`)
