/**
 * Cloudflare Worker — Personel Fotoğraf Upload Endpoint
 *
 * Deploy talimatları:
 *   1. Cloudflare Dashboard → Workers & Pages → Create Worker
 *   2. Bu dosyanın içeriğini yapıştırın
 *   3. Worker → Settings → Bindings:
 *        - R2 Bucket → Variable name: "BUCKET" → personel-fotolar (bucket adınız)
 *        - Secret → Variable name: "UPLOAD_SECRET" → gizli_anahtar değeriniz
 *   4. Worker'ı deploy edin
 *   5. R2 bucket → Settings → Public Access → R2.dev subdomain aktif edin
 *   6. .env.local dosyasına ekleyin:
 *        VITE_R2_UPLOAD_URL=https://<worker-subdomain>.workers.dev/upload
 *        VITE_R2_UPLOAD_SECRET=gizli_anahtar
 *
 * Worker bağlamaları (wrangler.toml alternatif):
 *   [[r2_buckets]]
 *   binding = "BUCKET"
 *   bucket_name = "personel-fotolar"
 */

export default {
  async fetch(request, env) {
    // CORS — frontend domain'inize göre kısıtlayın
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Secret',
    }

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // Yalnızca /upload path'ini işle
    const url = new URL(request.url)
    if (url.pathname !== '/upload') {
      return new Response('Not found', { status: 404, headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders })
    }

    // Gizli anahtar doğrulama
    const secret = request.headers.get('X-Upload-Secret')
    if (env.UPLOAD_SECRET && secret !== env.UPLOAD_SECRET) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    // FormData'dan dosyayı al
    let formData
    try {
      formData = await request.formData()
    } catch {
      return new Response('Invalid form data', { status: 400, headers: corsHeaders })
    }

    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return new Response('"file" alanı eksik', { status: 400, headers: corsHeaders })
    }

    // Boyut kontrolü (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      return new Response('Dosya 5 MB sınırını aşıyor', { status: 413, headers: corsHeaders })
    }

    // Content-type kontrolü
    if (!file.type.startsWith('image/')) {
      return new Response('Yalnızca görsel dosyaları kabul edilir', { status: 415, headers: corsHeaders })
    }

    // Benzersiz key oluştur
    const ext = file.name.split('.').pop() ?? 'jpg'
    const key = `personel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // R2'ye yükle
    try {
      await env.BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
      })
    } catch (err) {
      console.error('R2 put error:', err)
      return new Response('Yükleme sırasında hata oluştu', { status: 500, headers: corsHeaders })
    }

    // Public URL — R2.dev subdomain aktifse bu format geçerlidir
    // Örn: https://pub-xxxx.r2.dev/personel-xxx.jpg
    //
    // PUBLIC_BASE_URL binding'ini Cloudflare Dashboard'dan ekleyin:
    //   Worker → Settings → Variables and Secrets → Plain text
    //   Adı: PUBLIC_BASE_URL
    //   Değer: https://pub-xxxx.r2.dev  (R2 bucket → Settings → R2.dev subdomain)
    //
    // Alternatif: .env.local'a VITE_R2_PUBLIC_BASE_URL ekleyin; frontend URL'i kendisi oluşturur.
    const baseUrl = env.PUBLIC_BASE_URL ?? null
    const publicUrl = baseUrl ? `${baseUrl}/${key}` : null

    return new Response(
      JSON.stringify({ url: publicUrl, key }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  },
}
