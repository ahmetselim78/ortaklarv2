import { createClient } from '@supabase/supabase-js'

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BOOTSTRAP_ADMIN_EMAIL']
for (const name of required) if (!process.env[name]) throw new Error(`Eksik ortam değişkeni: ${name}`)

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const email = process.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()
let authUser = null
for (let page = 1; !authUser; page += 1) {
  const { data: pageData, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (listError) throw listError
  authUser = pageData.users.find(user => user.email?.toLowerCase() === email) ?? null
  if (pageData.users.length < 1000) break
}

let createdByScript = false
if (!authUser) {
  if (!process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    throw new Error('Kullanıcı Auth içinde yok; oluşturmak için BOOTSTRAP_ADMIN_PASSWORD gerekli')
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Sistem Yöneticisi', must_change_password: true },
  })
  if (error || !data.user) throw error ?? new Error('Auth kullanıcısı oluşturulamadı')
  authUser = data.user
  createdByScript = true
}

const administratorRole = '10000000-0000-0000-0000-000000000001'
const { error: profileError } = await supabase.from('app_users').upsert({
  auth_user_id: authUser.id,
  personel_id: process.env.BOOTSTRAP_PERSONEL_ID || null,
  display_name: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Sistem Yöneticisi',
  account_type: 'personal', is_active: true, must_change_password: true, auth_migrated_at: new Date().toISOString(),
})
if (profileError) {
  if (createdByScript) await supabase.auth.admin.deleteUser(authUser.id)
  throw profileError
}
const { error: roleError } = await supabase.from('user_roles').upsert({ auth_user_id: authUser.id, role_id: administratorRole })
if (roleError) {
  if (createdByScript) await supabase.auth.admin.deleteUser(authUser.id)
  throw roleError
}
console.log(`Bootstrap yönetici hazır: ${authUser.id}. İlk girişte parola değişimi ve TOTP zorunludur.`)
