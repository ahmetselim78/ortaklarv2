// Deno Edge Function — TypeScript project config bu dosyayı kapsamaz

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type TelegramRaporTipi = 'saatlik' | 'uretim_giris' | 'her_ikisi'

interface TelegramSablon {
  baslik: boolean
  saatlik_detay: boolean
  saatlik_ozet: boolean
  istasyonlar: boolean
  araclar: boolean
  personel: boolean
  operator: boolean
  notlar: boolean
}

interface SaatlikSatir {
  saat_araligi: string
  hedef_adet: number
  gerceklesen_adet: number
  fire_adet: number
}

interface UretimRaporu {
  id: string
  toplam_personel: number
  notlar: string | null
  created_at: string
  operator: { ad_soyad: string } | null
  istasyon_kayitlari: Array<{
    adet: number
    fire_adet: number
    istasyon: { ad: string; sira_no: number } | null
  }>
  arac_yuklemeleri: Array<{
    adet: number
    dis_arac_plakasi: string | null
    dis_arac_adi: string | null
    arac: { plaka: string; ad: string } | null
  }>
}

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

const TR_AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']

function gunGoster(tarih: string): string {
  const [yil, ay, gun] = tarih.split('-')
  return `${parseInt(gun)} ${TR_AYLAR[parseInt(ay) - 1]} ${yil}`
}

function escMd(text: string): string {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, c => `\\${c}`)
}

function performansEmoji(oran: number): string {
  if (oran >= 95) return '🟢'
  if (oran >= 80) return '🟡'
  return '🔴'
}

function saatAraligiGoster(aralik: string): string {
  return aralik.replace(/\s*-\s*/g, ' – ')
}

function ayirici(char = '─', uzunluk = 18): string {
  return escMd(char.repeat(uzunluk))
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

function saatlikRaporMetni(satirlar: SaatlikSatir[], sablon: TelegramSablon): string {
  const parcalar: string[] = []

  if (sablon.baslik) {
    parcalar.push(`📊 *Saatlik Takip*`)
    parcalar.push(ayirici())
  }

  if (sablon.saatlik_detay) {
    if (satirlar.length === 0) {
      parcalar.push('_Henüz veri girilmemiş\\._')
    } else {
      for (const s of satirlar) {
        const oran = s.hedef_adet > 0
          ? Math.round((s.gerceklesen_adet / s.hedef_adet) * 100)
          : 0
        const emoji = performansEmoji(oran)
        parcalar.push([
          `🕐 *${escMd(saatAraligiGoster(s.saat_araligi))}*`,
          `${emoji} Gerçekleşen: *${escMd(String(s.gerceklesen_adet))}* / ${escMd(String(s.hedef_adet))} \\(%${escMd(String(oran))}\\)`,
          `🔥 Fire: *${escMd(String(s.fire_adet))}*`,
        ].join('\n'))
      }
    }
  }

  if (sablon.saatlik_ozet) {
    const toplamHedef = satirlar.reduce((s, r) => s + (r.hedef_adet ?? 0), 0)
    const toplamGercek = satirlar.reduce((s, r) => s + (r.gerceklesen_adet ?? 0), 0)
    const toplamFire = satirlar.reduce((s, r) => s + (r.fire_adet ?? 0), 0)
    const performans = toplamHedef > 0
      ? ((toplamGercek / toplamHedef) * 100).toFixed(1)
      : '0.0'
    const performansEmojiStr = performansEmoji(parseFloat(performans))

    parcalar.push([
      `📌 *Gün Özeti*`,
      `✅ Gerçekleşen: *${escMd(String(toplamGercek))}* adet`,
      `🎯 Hedef: *${escMd(String(toplamHedef))}* adet`,
      `🔥 Fire: *${escMd(String(toplamFire))}* adet`,
      `${performansEmojiStr} Performans: *%${escMd(performans)}*`,
    ].join('\n'))
  }

  return parcalar.join('\n\n')
}

function uretimGirisRaporMetni(raporlar: UretimRaporu[], sablon: TelegramSablon): string {
  const parcalar: string[] = []

  if (sablon.baslik) {
    parcalar.push(`🏭 *Üretim Girişi*`)
    parcalar.push(ayirici())
  }

  if (raporlar.length === 0) {
    parcalar.push('_Henüz giriş yapılmamış\\._')
    return parcalar.join('\n\n')
  }

  raporlar.forEach((rapor, idx) => {
    const blok: string[] = []
    const kayitNo = raporlar.length > 1 ? ` ${idx + 1}` : ''

    if (sablon.operator || sablon.personel) {
      const bilgiler: string[] = []
      if (sablon.operator) {
        bilgiler.push(`👤 ${escMd(rapor.operator?.ad_soyad ?? 'Bilinmiyor')}`)
      }
      if (sablon.personel) {
        bilgiler.push(`👥 ${escMd(String(rapor.toplam_personel))} personel`)
      }
      blok.push(`*Kayıt${escMd(kayitNo)}*\n${bilgiler.join(' · ')}`)
    }

    if (sablon.istasyonlar) {
      const sirali = [...rapor.istasyon_kayitlari].sort(
        (a, b) => (a.istasyon?.sira_no ?? 0) - (b.istasyon?.sira_no ?? 0),
      )
      if (sirali.length > 0) {
        const satirlar = sirali.map(k => {
          const ad = escMd(k.istasyon?.ad ?? '—')
          const fire = k.fire_adet > 0 ? ` \\(🔥 ${escMd(String(k.fire_adet))}\\)` : ''
          return `• ${ad} — *${escMd(String(k.adet))}* adet${fire}`
        })
        blok.push(`*İstasyonlar*\n${satirlar.join('\n')}`)
      }
    }

    if (sablon.araclar && rapor.arac_yuklemeleri.length > 0) {
      const satirlar = rapor.arac_yuklemeleri.map(y => {
        const plaka = escMd(y.arac?.plaka ?? y.dis_arac_plakasi ?? '—')
        const ad = escMd(y.arac?.ad ?? y.dis_arac_adi ?? 'Harici')
        return `• ${plaka} \\(${ad}\\) — *${escMd(String(y.adet))}* adet`
      })
      blok.push(`*Araç Yüklemeleri*\n${satirlar.join('\n')}`)
    }

    if (sablon.notlar && rapor.notlar?.trim()) {
      blok.push(`📝 *Not:* ${escMd(rapor.notlar.trim())}`)
    }

    if (blok.length > 0) {
      parcalar.push(blok.join('\n\n'))
      if (idx < raporlar.length - 1) parcalar.push(ayirici('·', 12))
    }
  })

  return parcalar.join('\n\n')
}

function raporOlustur(
  tarih: string,
  saat: string,
  raporTipi: TelegramRaporTipi,
  sablon: TelegramSablon,
  saatlikSatirlar: SaatlikSatir[],
  uretimRaporlari: UretimRaporu[],
): string {
  const baslik = [
    `📋 *Günlük Üretim Raporu*`,
    ayirici('━'),
    `📅 *${escMd(gunGoster(tarih))}* · *${escMd(saat)}*`,
  ].join('\n')

  const bolumler: string[] = [baslik]

  if (raporTipi === 'saatlik' || raporTipi === 'her_ikisi') {
    const metin = saatlikRaporMetni(saatlikSatirlar, sablon)
    if (metin) bolumler.push(metin)
  }

  if (raporTipi === 'uretim_giris' || raporTipi === 'her_ikisi') {
    const metin = uretimGirisRaporMetni(uretimRaporlari, sablon)
    if (metin) bolumler.push(metin)
  }

  return bolumler.join('\n\n')
}

// ── Ana işleyici ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

    if (!ayar.bot_token || !ayar.chat_id) {
      return new Response(
        JSON.stringify({ ok: false, mesaj: 'bot_token veya chat_id tanımlı değil' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
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
      await logKaydiniSil()
      return new Response(
        JSON.stringify({ ok: false, mesaj: 'Telegram API hatası', detay: tgData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ ok: true, mesaj: `Rapor gönderildi: ${tarih} ${saat}`, rapor_tipi: gonderilecekTip }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    await logKaydiniSil()
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
