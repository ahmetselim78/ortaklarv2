/**
 * Cloudflare R2 Fotoğraf Yükleme Yardımcısı
 *
 * Gerekli ortam değişkenleri (.env.local):
 *   VITE_R2_UPLOAD_URL      = https://upload-worker.your-subdomain.workers.dev/upload
 *   VITE_R2_UPLOAD_SECRET   = gizli_anahtar   (Worker ile eşleşmeli)
 *   VITE_R2_PUBLIC_BASE_URL = https://pub-xxxx.r2.dev  (R2 bucket'ınızın public URL'i)
 *
 * Kurulum adımları:
 *   1. cloudflare-worker/upload-worker.js dosyasını Cloudflare Workers'a deploy edin.
 *   2. Worker → Settings → Bindings → R2 Bucket binding ekleyin: name="BUCKET", bucket="personel-fotolar"
 *   3. Cloudflare R2 → personel-fotolar → Settings → R2.dev subdomain aktif edin (public read).
 *   4. R2 bucket → Settings → R2.dev subdomain değerini kopyalayın (https://pub-xxxx.r2.dev).
 *   5. .env.local'a VITE_R2_UPLOAD_URL, VITE_R2_UPLOAD_SECRET ve VITE_R2_PUBLIC_BASE_URL ekleyin.
 */

export interface R2UploadSonucu {
  url: string
  key: string
}

export class R2UploadHata extends Error {
  constructor(mesaj: string) {
    super(mesaj)
    this.name = 'R2UploadHata'
  }
}

/**
 * Dosyayı R2'ye yükler ve public URL döner.
 * @param dosya     - Yüklenecek File nesnesi
 * @param onProgress - 0–100 arasında ilerleme callback'i (opsiyonel)
 */
export async function r2Upload(
  dosya: File,
  onProgress?: (yuzde: number) => void,
  kategori: 'personel' | 'etiket-zemin' = 'personel',
): Promise<R2UploadSonucu> {
  const uploadUrl = import.meta.env.VITE_R2_UPLOAD_URL as string | undefined
  const secret    = import.meta.env.VITE_R2_UPLOAD_SECRET as string | undefined

  if (!uploadUrl) {
    throw new R2UploadHata(
      '.env.local dosyasında VITE_R2_UPLOAD_URL tanımlı değil.',
    )
  }

  // Dosya boyutu kontrolü: max 5 MB
  const MAX_BOYUT = 5 * 1024 * 1024
  if (dosya.size > MAX_BOYUT) {
    throw new R2UploadHata('Dosya boyutu 5 MB sınırını aşıyor.')
  }

  // Sadece görsel dosyalarına izin ver
  if (!dosya.type.startsWith('image/')) {
    throw new R2UploadHata('Yalnızca görsel dosyası yükleyebilirsiniz (jpg, png, webp…).')
  }

  // Benzersiz dosya adı: timestamp + orijinal uzantı
  const uzanti = dosya.name.split('.').pop() ?? 'jpg'
  const dosyaAdi = `${kategori}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${uzanti}`

  const form = new FormData()
  form.append('file', dosya, dosyaAdi)
  form.append('kategori', kategori)

  onProgress?.(10)

  const headers: HeadersInit = {}
  if (secret) headers['X-Upload-Secret'] = secret

  let response: Response
  try {
    response = await fetch(uploadUrl, {
      method: 'POST',
      headers,
      body: form,
      mode: 'cors',
      credentials: 'omit',
    })
  } catch (err) {
    console.error('🔴 R2 Upload Network Hatası:', err)
    throw new R2UploadHata('Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.')
  }

  onProgress?.(80)

  if (!response.ok) {
    const hataMetni = await response.text().catch(() => `HTTP ${response.status}`)
    throw new R2UploadHata(`Yükleme başarısız: ${hataMetni}`)
  }

  let json: { url?: string; key?: string }
  try {
    json = await response.json()
  } catch {
    throw new R2UploadHata('Sunucudan geçersiz yanıt alındı.')
  }

  onProgress?.(100)

  const key = json.key ?? dosyaAdi

  // VITE_R2_PUBLIC_BASE_URL ayarlıysa frontend URL'i kendisi oluşturur.
  // Bu, Worker'da PUBLIC_BASE_URL binding eksikliğini telafi eder.
  const publicBaseUrl = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string | undefined
  if (publicBaseUrl) {
    const finalUrl = `${publicBaseUrl.replace(/\/$/, '')}/${key}`
    return { url: finalUrl, key }
  }

  if (!json.url || json.url.includes('pub-placeholder')) {
    throw new R2UploadHata(
      'Resim URL\'i alınamadı. .env.local dosyasına VITE_R2_PUBLIC_BASE_URL ekleyin: ' +
      'R2 bucket → Settings → R2.dev subdomain değerini kullanın (https://pub-xxxx.r2.dev).',
    )
  }

  return { url: json.url, key }
}
