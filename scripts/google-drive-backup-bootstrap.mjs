import { readFile } from 'node:fs/promises'

const credentialsUrl = new URL('../ops/drive-backup/oauth-token.local.json', import.meta.url)
const credentials = JSON.parse(await readFile(credentialsUrl, 'utf8'))

for (const key of ['client_id', 'client_secret', 'refresh_token']) {
  if (!credentials[key]) {
    throw new Error(`OAuth kimlik dosyasında ${key} eksik.`)
  }
}

const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
  }),
})
const tokenPayload = await tokenResponse.json()
if (!tokenResponse.ok || !tokenPayload.access_token) {
  throw new Error(`Google erişim tokenı yenilenemedi (${tokenPayload.error ?? tokenResponse.status}).`)
}

const driveRequest = async (path, init = {}) => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`Google Drive API isteği başarısız (${response.status}).`)
  }
  return payload
}

const escapeQuery = (value) => value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
const folderMime = 'application/vnd.google-apps.folder'

const ensureFolder = async (name, parentId = null) => {
  const parentClause = parentId ? ` and '${escapeQuery(parentId)}' in parents` : ''
  const query = [
    `name = '${escapeQuery(name)}'`,
    `mimeType = '${folderMime}'`,
    'trashed = false',
  ].join(' and ') + parentClause
  const listParams = new URLSearchParams({
    q: query,
    fields: 'files(id,name)',
    pageSize: '10',
  })
  const existing = await driveRequest(`files?${listParams}`)
  if (existing.files?.length) return { id: existing.files[0].id, created: false }

  const body = {
    name,
    mimeType: folderMime,
    ...(parentId ? { parents: [parentId] } : {}),
  }
  const created = await driveRequest('files?fields=id,name', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return { id: created.id, created: true }
}

const root = await ensureFolder('Yedekler')
const daily = await ensureFolder('Günlük Yedekler', root.id)
const monthly = await ensureFolder('Aylık Yedekler', root.id)

console.log('Google Drive bağlantısı doğrulandı.')
console.log(`Yedekler: ${root.created ? 'oluşturuldu' : 'mevcuttu'}`)
console.log(`Günlük Yedekler: ${daily.created ? 'oluşturuldu' : 'mevcuttu'}`)
console.log(`Aylık Yedekler: ${monthly.created ? 'oluşturuldu' : 'mevcuttu'}`)
