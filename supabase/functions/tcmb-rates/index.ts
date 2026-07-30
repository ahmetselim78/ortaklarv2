// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.103.3'
import {
  errorResponse,
  handleOptions,
  json,
  requirePermission,
  requireServiceSecret,
  ResponseError,
} from '../_shared/security.ts'
import {
  TCMB_KUR_TIPLERI,
  tcmbArsivUrl,
  tcmbXmlKurlariniCoz,
} from '../_shared/tcmbRates.ts'

const ISO_TARIH = /^\d{4}-\d{2}-\d{2}$/
const EN_FAZLA_GERI_GIDILECEK_GUN = 14

function istanbulBugunu() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function tarihDogrula(value: unknown) {
  const tarih = String(value ?? istanbulBugunu())
  if (!ISO_TARIH.test(tarih)) throw new ResponseError(400, 'kur_tarihi YYYY-MM-DD biçiminde olmalı')

  const parsed = new Date(`${tarih}T12:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== tarih) {
    throw new ResponseError(400, 'Geçersiz kur tarihi')
  }
  if (tarih > istanbulBugunu()) throw new ResponseError(400, 'Gelecek tarihli TCMB kuru istenemez')
  return tarih
}

function oncekiGun(tarih: string, gunSayisi: number) {
  const value = new Date(`${tarih}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() - gunSayisi)
  return value.toISOString().slice(0, 10)
}

async function yayinlanmisKuruBul(istenenTarih: string) {
  for (let gunFarki = 0; gunFarki <= EN_FAZLA_GERI_GIDILECEK_GUN; gunFarki += 1) {
    const kaynakTarihi = oncekiGun(istenenTarih, gunFarki)
    let response: Response
    try {
      response = await fetch(tcmbArsivUrl(kaynakTarihi), {
        headers: { Accept: 'application/xml,text/xml' },
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new ResponseError(502, 'TCMB servisine erişilemedi')
    }

    if (response.status === 404) continue
    if (!response.ok) {
      throw new ResponseError(502, `TCMB servisi ${response.status} yanıtı döndürdü`)
    }

    const xml = await response.text()
    const kurlar = tcmbXmlKurlariniCoz(xml)
    // TCMB arşivi bazı yayınlanmamış günlerde 404 yerine içeriksiz/HTML 200
    // döndürebilir. Hiç kur yoksa hafta sonu/tatil geri aramasına devam edilir.
    if (kurlar.length === 0) continue
    const beklenenSatirSayisi = 2 * TCMB_KUR_TIPLERI.length
    if (kurlar.length !== beklenenSatirSayisi) {
      throw new ResponseError(502, 'TCMB yanıtında zorunlu USD/EUR kurları eksik')
    }

    return { kaynakTarihi, kurlar, gunFarki }
  }

  throw new ResponseError(424, 'İstenen tarih için yayımlanmış TCMB kuru bulunamadı')
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { error: 'Yalnızca POST desteklenir' }, 405)

  try {
    if (req.headers.get('x-cron-secret')) {
      requireServiceSecret(req, 'x-cron-secret', 'TCMB_CRON_SECRET')
    } else {
      await requirePermission(req, 'pricing', 'manage', true)
    }

    const body = await req.json().catch(() => ({}))
    const kurTarihi = tarihDogrula(body.kur_tarihi)
    const { kaynakTarihi, kurlar, gunFarki } = await yayinlanmisKuruBul(kurTarihi)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      throw new ResponseError(500, 'Supabase servis yapılandırması eksik')
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await admin.rpc('tcmb_doviz_kurlarini_kaydet', {
      p_kur_tarihi: kurTarihi,
      p_tcmb_kaynak_tarihi: kaynakTarihi,
      p_kurlar: kurlar,
    })
    if (error) {
      console.error('TCMB kur cache RPC hatası', { code: error.code })
      throw new ResponseError(500, 'TCMB kur cache kaydı başarısız')
    }

    return json(req, {
      ok: true,
      istenen_kur_tarihi: kurTarihi,
      tcmb_kaynak_tarihi: kaynakTarihi,
      onceki_gun_farki: gunFarki,
      kaydedilen_kur_sayisi: kurlar.length,
      kaynak: 'otomatik',
      sonuc: data ?? null,
    })
  } catch (error) {
    return errorResponse(req, error)
  }
})
