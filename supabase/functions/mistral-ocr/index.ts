// @ts-nocheck
// Deno Edge Function — TypeScript project config bu dosyayı kapsamaz
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY')
  if (!MISTRAL_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'MISTRAL_API_KEY sunucuda tanımlı değil' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const { document_base64, image_base64 } = await req.json()

    if (
      (!document_base64 || typeof document_base64 !== 'string') &&
      (!image_base64 || typeof image_base64 !== 'string')
    ) {
      return new Response(
        JSON.stringify({ error: 'document_base64 veya image_base64 alanı gereklidir' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Image OCR (sayfa-sayfa) → image_url ; aksi halde PDF → document_url
    const documentPayload = image_base64
      ? {
          type: 'image_url',
          image_url: `data:image/png;base64,${image_base64}`,
        }
      : {
          type: 'document_url',
          document_url: `data:application/pdf;base64,${document_base64}`,
        }

    const res = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: documentPayload,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Mistral OCR hatası (${res.status})`, details: data }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
