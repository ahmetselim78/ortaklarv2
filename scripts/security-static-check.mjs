import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function files(root) {
  return readdirSync(root).flatMap(name => {
    const path = join(root, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

const sourceFiles = files('src').concat(files('supabase/functions')).filter(path => /\.(ts|tsx|js)$/.test(path))
const source = sourceFiles.map(path => `${path}\n${readFileSync(path, 'utf8')}`).join('\n')
const checks = [
  ['Frontend Mistral sırrı', /VITE_MISTRAL_API_KEY/],
  ['Frontend R2 sırrı', /VITE_R2_UPLOAD_SECRET/],
  ['Geniş Edge CORS', /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/],
  ['Düz metin parola sorgusu', /\.eq\(['"]giris_sifresi['"]/],
  ['Sabit admin parolası', /dogru_sifre\s*=|['"]xxx['"]/],
]
let failed = false
for (const [label, pattern] of checks) {
  if (pattern.test(source)) { console.error(`BAŞARISIZ: ${label}`); failed = true }
}
const cleanup = readFileSync('supabase/migrations/053_legacy_security_cleanup.sql', 'utf8')
if (!cleanup.includes('DROP COLUMN IF EXISTS giris_sifresi')) { console.error('BAŞARISIZ: legacy parola drop kapısı yok'); failed = true }
if (failed) process.exit(1)
console.log('Güvenlik statik kontrolleri başarılı.')
