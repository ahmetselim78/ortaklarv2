// @ts-nocheck
import { errorResponse, handleOptions, json, requirePermission, ResponseError } from '../_shared/security.ts'

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { error: 'Yalnızca POST desteklenir' }, 405)
  try {
    await requirePermission(req, 'files', 'create')
    const workerUrl = Deno.env.get('R2_INTERNAL_UPLOAD_URL')
    const workerSecret = Deno.env.get('R2_INTERNAL_UPLOAD_SECRET')
    if (!workerUrl || !workerSecret) throw new ResponseError(500, 'Dosya yükleme servisi yapılandırılmamış')
    const form = await req.formData()
    const file = form.get('file')
    const category = String(form.get('category') ?? 'personel')
    if (!['personel', 'etiket-zemin'].includes(category)) throw new ResponseError(400, 'Geçersiz dosya kategorisi')
    if (!(file instanceof File)) throw new ResponseError(400, 'Dosya alanı eksik')
    if (!file.type.startsWith('image/')) throw new ResponseError(415, 'Yalnızca görsel dosyaları kabul edilir')
    if (file.size > 5 * 1024 * 1024) throw new ResponseError(413, 'Dosya 5 MB sınırını aşıyor')

    const upstream = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'X-Internal-Upload-Secret': workerSecret },
      body: form,
      signal: AbortSignal.timeout(30_000),
    })
    if (!upstream.ok) throw new ResponseError(502, 'Dosya depolama servisi isteği tamamlayamadı')
    const result = await upstream.json()
    if (typeof result?.url !== 'string' || !result.url.startsWith('https://')) throw new ResponseError(502, 'Geçersiz dosya URL’si')
    return json(req, { url: result.url, key: result.key })
  } catch (error) {
    return errorResponse(req, error)
  }
})
