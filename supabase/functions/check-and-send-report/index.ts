// @ts-nocheck
// Deno Edge Function — TypeScript project config bu dosyayı kapsamaz

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Türkiye saatini al (UTC+3) ────────────────────────────────────────────────
function turkiyeSaati(): { tarih: string; saat: string } {
  const now = new Date()
  // UTC+3 offset
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const yil = tr.getUTCFullYear()
  const ay = String(tr.getUTCMonth() + 1).padStart(2, '0')
  const gun = String(tr.getUTCDate()).padStart(2, '0')
  const saat = String(tr.getUTCHours()).padStart(2, '0')
  const dakika = String(tr.getUTCMinutes()).padStart(2, '0')
  return {
    tarih: `${yil}-${ay}-${gun}`,
    saat: `${saat}:${dakika}`,
  }
}

// ── Türkçe ay adları ──────────────────────────────────────────────────────────
const TR_AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']

function gunGoster(tarih: string): string {
  const [yil, ay, gun] = tarih.split('-')
  return `${parseInt(gun)} ${TR_AYLAR[parseInt(ay) - 1]} ${yil}`
}

// ── MarkdownV2 escape ─────────────────────────────────────────────────────────
function escMd(text: string): string {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, c => `\\${c}`)
}

// ── Rapor metni oluştur ───────────────────────────────────────────────────────
function raporOlustur(
  tarih: string,
  saat: string,
  satirlar: Array<{
    saat_araligi: string
    hedef_adet: number
    gerceklesen_adet: number
    fire_adet: number
  }>,
): string {
  const toplamHedef = satirlar.reduce((s, r) => s + (r.hedef_adet ?? 0), 0)
  const toplamGercek = satirlar.reduce((s, r) => s + (r.gerceklesen_adet ?? 0), 0)
  const toplamFire = satirlar.reduce((s, r) => s + (r.fire_adet ?? 0), 0)
  const performans = toplamHedef > 0
    ? ((toplamGercek / toplamHedef) * 100).toFixed(1)
    : '0.0'

  const performansEmoji = parseFloat(performans) >= 95
    ? '🟢' : parseFloat(performans) >= 80 ? '🟡' : '🔴'

  const baslik = `📊 *Günlük Üretim Raporu*\n📅 ${escMd(gunGoster(tarih))} — ${escMd(saat)} Raporu`

  const satirMetinleri = satirlar.map(s => {
    const saatKisa = s.saat_araligi.replace(' ', '').replace(' ', '')
    const oran = s.hedef_adet > 0
      ? Math.round((s.gerceklesen_adet / s.hedef_adet) * 100)
      : 0
    return `  ${escMd(saatKisa)} │ ${escMd(String(s.hedef_adet))} → ${escMd(String(s.gerceklesen_adet))} \\(${escMd(String(oran))}%\\) 🔥${escMd(String(s.fire_adet))}`
  })

  const tablo = satirMetinleri.length > 0
    ? `*Saat Dilimi Detayı:*\n${satirMetinleri.join('\n')}`
    : '_Henüz veri girilmemiş\\._'

  const ozet = [
    `✅ *Toplam Gerçekleşen:* ${escMd(String(toplamGercek))} adet`,
    `🎯 *Toplam Hedef:* ${escMd(String(toplamHedef))} adet`,
    `🔥 *Toplam Fire:* ${escMd(String(toplamFire))} adet`,
    `${performansEmoji} *Performans:* %${escMd(performans)}`,
  ].join('\n')

  return `${baslik}\n\n${tablo}\n\n─────────────────────\n${ozet}`
}

// ── Ana işleyici ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // TELEGRAM_BOT_TOKEN env var'a gerek yok — token DB'den okunuyor (telegram_ayarlari.bot_token)
  // SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik inject edilir
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Eksik ortam değişkeni: SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabaseHeaders = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }

  // Body'de force: true gelirse saat kontrolü atla (test gönderimi)
  let force = false
  try {
    const body = await req.json()
    force = body?.force === true
  } catch { /* body yok veya JSON değil */ }

  try {
    const { tarih, saat } = turkiyeSaati()

    // ── 1. Telegram ayarlarını çek ───────────────────────────────────────────
    const ayarRes = await fetch(
      `${SUPABASE_URL}/rest/v1/telegram_ayarlari?select=*&limit=1`,
      { headers: supabaseHeaders },
    )
    const ayarlar = await ayarRes.json()
    const ayar = ayarlar?.[0]

    if (!ayar) {
      return new Response(
        JSON.stringify({ ok: false, mesaj: 'telegram_ayarlari kaydı bulunamadı' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!force && !ayar.aktif) {
      return new Response(
        JSON.stringify({ ok: false, mesaj: 'Telegram raporu pasif' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!ayar.bot_token || !ayar.chat_id) {
      return new Response(
        JSON.stringify({ ok: false, mesaj: 'bot_token veya chat_id tanımlı değil' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 2. Saat eşleşme kontrolü (force modunda atlanır) ────────────────────
    if (!force) {
      const saatRes = await fetch(
        `${SUPABASE_URL}/rest/v1/telegram_rapor_saatleri?aktif=eq.true&select=saat`,
        { headers: supabaseHeaders },
      )
      const saatler: Array<{ saat: string }> = await saatRes.json()
      const eslesme = saatler.some(s => s.saat === saat)

      if (!eslesme) {
        return new Response(
          JSON.stringify({ ok: false, mesaj: `${saat} saati için rapor zamanı değil` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // ── 3. Çift gönderim koruması ──────────────────────────────────────────
      // PostgREST + ignore-duplicates: yeni insert → 201, duplicate → 200 (boş body)
      const logInsertRes = await fetch(
        `${SUPABASE_URL}/rest/v1/telegram_rapor_log`,
        {
          method: 'POST',
          headers: {
            ...supabaseHeaders,
            'Prefer': 'resolution=ignore-duplicates,return=minimal',
          },
          body: JSON.stringify({ tarih, saat }),
        },
      )

      // 201 = yeni kayıt (gönderime devam), 200 = zaten gönderilmiş (dur)
      if (logInsertRes.status !== 201) {
        return new Response(
          JSON.stringify({ ok: false, mesaj: `${tarih} ${saat} raporu zaten gönderildi` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // ── 4. Bugünün üretim verilerini çek ────────────────────────────────────
    const uretimRes = await fetch(
      `${SUPABASE_URL}/rest/v1/gunluk_uretim_takip?tarih=eq.${tarih}&select=saat_araligi,hedef_adet,gerceklesen_adet,fire_adet,sira_no&order=sira_no.asc`,
      { headers: supabaseHeaders },
    )
    const uretimVerisi = await uretimRes.json()

    // ── 5. Rapor mesajını oluştur ────────────────────────────────────────────
    const mesaj = raporOlustur(tarih, saat, Array.isArray(uretimVerisi) ? uretimVerisi : [])

    // ── 6. Telegram'a gönder ────────────────────────────────────────────────
    const tgRes = await fetch(
      `https://api.telegram.org/bot${ayar.bot_token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ayar.chat_id,
          text: mesaj,
          parse_mode: 'MarkdownV2',
        }),
      },
    )

    const tgData = await tgRes.json()

    if (!tgData.ok) {
      return new Response(
        JSON.stringify({ ok: false, mesaj: 'Telegram API hatası', detay: tgData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ ok: true, mesaj: `Rapor gönderildi: ${tarih} ${saat}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
