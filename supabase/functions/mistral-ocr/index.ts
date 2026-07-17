// @ts-nocheck
import { errorResponse, handleOptions, json, requirePermission, ResponseError } from '../_shared/security.ts'

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { error: 'Yalnızca POST desteklenir' }, 405)

  try {
    await requirePermission(req, 'ocr', 'create')
    const apiKey = Deno.env.get('MISTRAL_API_KEY')
    if (!apiKey) throw new ResponseError(500, 'OCR servisi yapılandırılmamış')
    const { document_base64, image_base64 } = await req.json()
    const content = image_base64 ?? document_base64
    if (typeof content !== 'string' || !content) throw new ResponseError(400, 'PDF veya görsel verisi gerekli')
    if (content.length > 22_000_000) throw new ResponseError(413, 'OCR girdisi boyut sınırını aşıyor')

    const document = image_base64
      ? { type: 'image_url', image_url: `data:image/png;base64,${image_base64}` }
      : { type: 'document_url', document_url: `data:application/pdf;base64,${document_base64}` }
    const response = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'mistral-ocr-latest', document }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) {
      console.error('Mistral OCR upstream status', response.status)
      throw new ResponseError(502, 'OCR sağlayıcısı isteği tamamlayamadı')
    }
    const data = await response.json()
    return json(req, { pages: data.pages ?? [] })
  } catch (error) {
    return errorResponse(req, error)
  }
})
