/**
 * Bir kerelik: telegram_edge_config kaydini ayarlar tablosuna yazar.
 * Kullanim: node scripts/sync-telegram-edge-config.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env.local')
const envText = readFileSync(envPath, 'utf8')
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    }),
)

const baseUrl = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY
if (!baseUrl || !anonKey) {
  console.error('VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY .env.local icinde olmali')
  process.exit(1)
}

const url = `${baseUrl.replace(/\/$/, '')}/functions/v1/check-and-send-report`
const deger = {
  url,
  authorization: `Bearer ${anonKey}`,
  apikey: anonKey,
}

const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
}

const existingRes = await fetch(
  `${baseUrl}/rest/v1/ayarlar?anahtar=eq.telegram_edge_config&select=id`,
  { headers },
)
const existing = await existingRes.json()

if (Array.isArray(existing) && existing.length > 0) {
  const patchRes = await fetch(`${baseUrl}/rest/v1/ayarlar?id=eq.${existing[0].id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ deger, guncelleme: new Date().toISOString() }),
  })
  if (!patchRes.ok) {
    console.error('Guncelleme basarisiz:', await patchRes.text())
    process.exit(1)
  }
  console.log('telegram_edge_config guncellendi.')
} else {
  const postRes = await fetch(`${baseUrl}/rest/v1/ayarlar`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ anahtar: 'telegram_edge_config', deger }),
  })
  if (!postRes.ok) {
    console.error('Ekleme basarisiz:', await postRes.text())
    process.exit(1)
  }
  console.log('telegram_edge_config olusturuldu.')
}
