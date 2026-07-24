/**
 * R2 iç yükleme worker'ı. Tarayıcı tarafından çağrılmaz; yalnızca Supabase
 * `r2-upload` Edge Function, `X-Internal-Upload-Secret` ile çağırabilir.
 */
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Not found', { status: 404 })
    const expected = env.INTERNAL_UPLOAD_SECRET ?? env.UPLOAD_SECRET
    const actual = request.headers.get('X-Internal-Upload-Secret') ?? request.headers.get('X-Upload-Secret')
    if (!expected || !actual || actual !== expected) return new Response('Unauthorized', { status: 401 })

    let form
    try { form = await request.formData() } catch { return new Response('Invalid form data', { status: 400 }) }
    const file = form.get('file')
    if (!(file instanceof File)) return new Response('Missing file', { status: 400 })
    if (file.size > 5 * 1024 * 1024) return new Response('File too large', { status: 413 })
    if (!file.type.startsWith('image/')) return new Response('Unsupported type', { status: 415 })

    const category = String(form.get('category') ?? form.get('kategori') ?? 'personel')
    if (!['personel', 'etiket-zemin'].includes(category)) return new Response('Invalid category', { status: 400 })
    const ext = (file.name.split('.').pop() ?? 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5)
    const key = `${category}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
    if (!env.BUCKET) return new Response('Bucket binding missing', { status: 500 })
    try {
      await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
    } catch (error) {
      console.error('R2 put failed', error)
      return new Response('Upload failed', { status: 500 })
    }
    const base = String(env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
    if (!base.startsWith('https://')) return new Response('Public URL missing', { status: 500 })
    return Response.json({ url: `${base}/${key}`, key }, { headers: { 'Cache-Control': 'no-store' } })
  },
}
