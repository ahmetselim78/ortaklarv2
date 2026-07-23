import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { URL } from 'node:url'

const clientConfigUrl = new URL('../ops/drive-backup/google-oauth-client.local.json', import.meta.url)
let localConfig = {}
try {
  localConfig = JSON.parse(await readFile(clientConfigUrl, 'utf8')).installed ?? {}
} catch {
  // Ortam değişkenleri kullanılıyorsa yerel istemci dosyası zorunlu değildir.
}

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() || localConfig.client_id?.trim()
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() || localConfig.client_secret?.trim()
if (!clientId || !clientSecret) {
  console.error('Yerel OAuth istemci dosyası veya GOOGLE_DRIVE_CLIENT_ID/GOOGLE_DRIVE_CLIENT_SECRET gerekli.')
  process.exit(1)
}

const port = 53682
const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/drive.file',
  access_type: 'offline',
  prompt: 'consent',
}).toString()

console.log('\nBu adresi tarayıcıda açıp yedeklerin tutulacağı Google hesabıyla izin verin:\n')
console.log(authUrl.toString())

const code = await new Promise((resolve, reject) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', redirectUri)
    if (url.pathname !== '/oauth2/callback') {
      response.writeHead(404).end('Bulunamadı')
      return
    }
    const error = url.searchParams.get('error')
    const value = url.searchParams.get('code')
    if (error || !value) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Google Drive izni alınamadı. Bu pencereyi kapatabilirsiniz.')
      server.close()
      reject(new Error(error ?? 'OAuth kodu gelmedi'))
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Google Drive izni alındı. Bu pencereyi kapatabilirsiniz.')
    server.close()
    resolve(value)
  })
  server.listen(port, '127.0.0.1')
})

const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  }),
})
const tokens = await tokenResponse.json()
if (!tokenResponse.ok || !tokens.refresh_token) {
  console.error('Refresh token alınamadı:', tokens.error ?? tokenResponse.status)
  process.exit(1)
}

const output = new URL('../ops/drive-backup/oauth-token.local.json', import.meta.url)
await writeFile(output, JSON.stringify({
  client_id: clientId,
  client_secret: clientSecret,
  refresh_token: tokens.refresh_token,
  scope: tokens.scope,
}, null, 2), { mode: 0o600 })
console.log(`\nKimlik bilgileri yalnız yerel kullanım için kaydedildi: ${output.pathname}`)
console.log('Bu dosyayı Git’e eklemeyin; değerleri Secret Manager’a aktarınca güvenli biçimde silin.')
