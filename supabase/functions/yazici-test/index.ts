// @ts-nocheck
// Deno Edge Function — Datamax yazıcısına TCP üzerinden DPL komutu gönderir
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { ip, port, dpl } = await req.json()

    if (!ip || typeof ip !== 'string' || ip.trim() === '') {
      return new Response(
        JSON.stringify({ hata: 'Yazıcı IP adresi girilmemiş.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const portNum = Number(port)
    if (!portNum || portNum < 1 || portNum > 65535) {
      return new Response(
        JSON.stringify({ hata: 'Geçersiz port numarası.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!dpl || typeof dpl !== 'string') {
      return new Response(
        JSON.stringify({ hata: 'DPL komutu eksik.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // TCP bağlantısı kur ve DPL komutunu gönder
    let conn: Deno.TcpConn | undefined
    try {
      conn = await Deno.connect({ hostname: ip.trim(), port: portNum, transport: 'tcp' })
      const encoder = new TextEncoder()
      await conn.write(encoder.encode(dpl))
    } finally {
      conn?.close()
    }

    return new Response(
      JSON.stringify({ basarili: true, mesaj: `${ip}:${portNum} adresine test etiketi gönderildi.` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : 'Bilinmeyen hata'
    return new Response(
      JSON.stringify({ hata: mesaj }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
