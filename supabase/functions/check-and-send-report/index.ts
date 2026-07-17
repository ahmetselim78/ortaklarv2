// Deno Edge Function — TypeScript project config bu dosyayı kapsamaz

import {
  raporOlustur,
  type SaatlikSatir,
  type TelegramRaporTipi,
  type TelegramSablon,
  type UretimRaporu,
} from '../_shared/telegramMessage.ts'
import { corsHeaders as secureCorsHeaders, errorResponse, handleOptions, requirePermission, requireServiceSecret, ResponseError } from '../_shared/security.ts'

// ── Türkiye saatini al ────────────────────────────────────────────────────────
function turkiyeSaati(): { tarih: string; saat: string } {
  const now = new Date()
  return {
    tarih: now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }),
    saat: now.toLocaleTimeString('sv-SE', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  }
}

function normalizeSaatDegeri(deger: unknown): string | null {
  if (typeof deger !== 'string') return null
  const match = deger.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return null

  const saat = Number(match[1])
  const dakika = Number(match[2])
  if (saat < 0 || saat > 23 || dakika < 0 || dakika > 59) return null

  return `${String(saat).padStart(2, '0')}:${String(dakika).padStart(2, '0')}`
}

function sablonFromAyar(ayar: Record<string, unknown>): TelegramSablon {
  return {
    baslik: ayar.sablon_baslik !== false,
    saatlik_detay: ayar.sablon_saatlik_detay !== false,
    saatlik_ozet: ayar.sablon_saatlik_ozet !== false,
    istasyonlar: ayar.sablon_istasyonlar !== false,
    araclar: ayar.sablon_araclar !== false,
    personel: ayar.sablon_personel !== false,
    operator: ayar.sablon_operator !== false,
    notlar: ayar.sablon_notlar !== false,
  }
}

// ── Ana işleyici ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  const corsHeaders = secureCorsHeaders(req)
  try {
    if (req.headers.get('x-cron-secret')) requireServiceSecret(req, 'x-cron-secret', 'TELEGRAM_CRON_SECRET')
    else await requirePermission(req, 'telegram', 'manage', true)
  } catch (error) { return errorResponse(req, error) }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse(req, new ResponseError(500, 'Supabase servis yapılandırması eksik'))
  }

  const supabaseHeaders = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }

  let force = false
  try {
    const body = await req.json()
    force = body?.force === true
  } catch { /* body yok veya JSON değil */ }

  let logKaydiEklendi = false
  let logTarih = ''
  let logSaat = ''
  const logKaydiniSil = async () => {
    if (!logKaydiEklendi || !logTarih || !logSaat) return
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/telegram_rapor_log?tarih=eq.${encodeURIComponent(logTarih)}&saat=eq.${encodeURIComponent(logSaat)}`,
        { method: 'DELETE', headers: supabaseHeaders },
      )
    } catch { /* log temizleme hatasi rapor akisini bozmamali */ }
  }

  try {
    const { tarih, saat } = turkiyeSaati()
    logTarih = tarih
    logSaat = saat

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

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      throw new ResponseError(500, 'Telegram sırrı sunucuda tanımlı değil')
    }

    const sablon = sablonFromAyar(ayar)
    let raporTipi: TelegramRaporTipi = 'her_ikisi'

    if (!force) {
      const saatRes = await fetch(
        `${SUPABASE_URL}/rest/v1/telegram_rapor_saatleri?aktif=eq.true&select=saat,rapor_tipi`,
        { headers: supabaseHeaders },
      )
      const saatler: Array<{ saat: string; rapor_tipi?: TelegramRaporTipi }> = await saatRes.json()
      const eslesen = saatler.find(s => normalizeSaatDegeri(s.saat) === saat)

      if (!eslesen) {
        return new Response(
          JSON.stringify({ ok: false, mesaj: `${saat} saati için rapor zamanı değil` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      raporTipi = eslesen.rapor_tipi ?? 'saatlik'

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

      if (logInsertRes.status !== 201) {
        return new Response(
          JSON.stringify({ ok: false, mesaj: `${tarih} ${saat} raporu zaten gönderildi` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      logKaydiEklendi = true
    }

    const veriCekimleri: Promise<Response>[] = []

    if (raporTipi === 'saatlik' || raporTipi === 'her_ikisi' || force) {
      veriCekimleri.push(fetch(
        `${SUPABASE_URL}/rest/v1/gunluk_uretim_takip?tarih=eq.${tarih}&select=saat_araligi,hedef_adet,gerceklesen_adet,fire_adet,sira_no&order=sira_no.asc`,
        { headers: supabaseHeaders },
      ))
    }

    if (raporTipi === 'uretim_giris' || raporTipi === 'her_ikisi' || force) {
      veriCekimleri.push(fetch(
        `${SUPABASE_URL}/rest/v1/gunluk_uretim_raporlari?tarih=eq.${tarih}&select=id,toplam_personel,notlar,created_at,operator:operator_id(ad_soyad),istasyon_kayitlari:gunluk_uretim_istasyon_kayitlari(adet,fire_adet,istasyon:istasyon_id(ad,sira_no)),arac_yuklemeleri:gunluk_uretim_arac_yuklemeleri(adet,dis_arac_plakasi,dis_arac_adi,arac:arac_id(plaka,ad))&order=created_at.asc`,
        { headers: supabaseHeaders },
      ))
    }

    const yanitlar = await Promise.all(veriCekimleri)
    let saatlikSatirlar: SaatlikSatir[] = []
    let uretimRaporlari: UretimRaporu[] = []

    let idx = 0
    if (raporTipi === 'saatlik' || raporTipi === 'her_ikisi' || force) {
      const uretimVerisi = await yanitlar[idx++].json()
      saatlikSatirlar = Array.isArray(uretimVerisi) ? uretimVerisi : []
    }
    if (raporTipi === 'uretim_giris' || raporTipi === 'her_ikisi' || force) {
      const raporVerisi = await yanitlar[idx++].json()
      uretimRaporlari = Array.isArray(raporVerisi) ? raporVerisi : []
    }

    const gonderilecekTip: TelegramRaporTipi = force ? 'her_ikisi' : raporTipi
    const mesaj = raporOlustur(tarih, saat, gonderilecekTip, sablon, saatlikSatirlar, uretimRaporlari)

    const tgRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: mesaj,
          parse_mode: 'MarkdownV2',
        }),
      },
    )

    const tgData = await tgRes.json()

    if (!tgData.ok) {
      await logKaydiniSil()
      throw new ResponseError(502, 'Telegram API isteği başarısız')
    }

    return new Response(
      JSON.stringify({ ok: true, mesaj: `Rapor gönderildi: ${tarih} ${saat}`, rapor_tipi: gonderilecekTip }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    await logKaydiniSil()
    return errorResponse(req, err)
  }
})
