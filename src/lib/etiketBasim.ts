import { dplUret } from '@/types/ayarlar'
import type { EtiketAyarlari, EtiketVeri } from '@/types/ayarlar'

const VARSAYILAN_KOPRU_PORT = 9876
const KOPRU_ZAMAN_ASIMI_MS = 8000

export type EtiketBasimDurumu = 'gonderiliyor' | 'yaziciya_gonderildi' | 'basarisiz' | 'devre_disi'

export interface EtiketBasimSonucu {
  durum: Exclude<EtiketBasimDurumu, 'gonderiliyor'>
  mesaj: string
}

export interface EtiketKopruSaglikSonucu {
  bagli: boolean
  mesaj: string
}

interface KopruYaniti {
  basarili?: boolean
  mesaj?: string
  hata?: string
}

function zamanAsimiSinyali(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }

  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

function zamanAsimiHatasi(error: unknown): boolean {
  return typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name === 'TimeoutError' || error.name === 'AbortError'
    : error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

export async function etiketKopruSaglikKontrolu(
  ayarlar: EtiketAyarlari,
  zamanAsimiMs = 3000,
): Promise<EtiketKopruSaglikSonucu> {
  const kopruAdresi = ayarlar.yazici.kopru_adresi.trim()
  if (!kopruAdresi) {
    return { bagli: false, mesaj: 'Köprü adresi ayarlı değil.' }
  }

  const url = `http://${kopruAdresi}:${ayarlar.yazici.kopru_port ?? VARSAYILAN_KOPRU_PORT}/`
  try {
    const response = await fetch(url, { signal: zamanAsimiSinyali(zamanAsimiMs) })
    if (!response.ok) {
      return { bagli: false, mesaj: `Köprü HTTP ${response.status} yanıtı verdi.` }
    }
    return { bagli: true, mesaj: `${kopruAdresi} yazıcı köprüsü erişilebilir.` }
  } catch (error) {
    return {
      bagli: false,
      mesaj: zamanAsimiHatasi(error)
        ? `Köprü ${zamanAsimiMs / 1000} saniye içinde yanıt vermedi.`
        : `Köprüye ulaşılamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
    }
  }
}

/**
 * Hazır DPL verisini köprüye gönderir.
 * Ayarlar ekranındaki test baskısı ve üretimdeki otomatik baskı aynı yolu kullanır.
 */
export async function etiketDplKopruyeGonder(
  ayarlar: EtiketAyarlari,
  dpl: string,
  zamanAsimiMs = KOPRU_ZAMAN_ASIMI_MS,
): Promise<EtiketBasimSonucu> {
  const kopruAdresi = ayarlar.yazici.kopru_adresi.trim()
  if (!kopruAdresi) {
    return { durum: 'devre_disi', mesaj: 'Yazıcı köprüsü adresi ayarlı değil.' }
  }
  if (!dpl.trim()) {
    return { durum: 'basarisiz', mesaj: 'Etiket için DPL verisi üretilemedi.' }
  }

  const usb = ayarlar.yazici.yazici_adi?.trim()
  const yaziciIp = ayarlar.yazici.ip_adresi.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
  if (!usb && !yaziciIp) {
    return {
      durum: 'devre_disi',
      mesaj: 'Windows Yazıcı Adı veya Yazıcı IP adresi ayarlı değil.',
    }
  }

  const kopruUrl = `http://${kopruAdresi}:${ayarlar.yazici.kopru_port ?? VARSAYILAN_KOPRU_PORT}/yazdir`
  const fetchBody = usb
    ? { yazici_adi: usb, dpl }
    : { ip: yaziciIp, port: ayarlar.yazici.port, dpl }

  try {
    const response = await fetch(kopruUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fetchBody),
      signal: zamanAsimiSinyali(zamanAsimiMs),
    })
    const yanit = await response.json().catch(() => ({})) as KopruYaniti

    if (!response.ok || yanit.basarili !== true) {
      return {
        durum: 'basarisiz',
        mesaj: yanit.hata || yanit.mesaj || `Yazıcı köprüsü HTTP ${response.status} hatası verdi.`,
      }
    }

    return {
      durum: 'yaziciya_gonderildi',
      mesaj: yanit.mesaj || 'Etiket verisi yazıcıya başarıyla gönderildi.',
    }
  } catch (error) {
    return {
      durum: 'basarisiz',
      mesaj: zamanAsimiHatasi(error)
        ? `Yazıcı köprüsü ${zamanAsimiMs / 1000} saniye içinde yanıt vermedi.`
        : `Yazıcı köprüsüne ulaşılamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
    }
  }
}

/**
 * DPL'yi yazıcı köprüsüne gönderir ve köprünün yazıcıya teslim sonucunu döndürür.
 * Bu onay fiziksel kâğıt sensörü değil, EXE'nin yazıcıya veriyi başarıyla yazdığı anlamına gelir.
 */
export async function etiketOtomatikYazdir(
  ayarlar: EtiketAyarlari,
  veri: EtiketVeri,
): Promise<EtiketBasimSonucu> {
  if (!ayarlar.yazici.kopru_adresi.trim()) {
    return { durum: 'devre_disi', mesaj: 'Yazıcı köprüsü adresi ayarlı değil.' }
  }
  if (ayarlar.yazdirma_kosulu !== 'otomatik') {
    return { durum: 'devre_disi', mesaj: 'Otomatik etiket baskısı kapalı.' }
  }

  try {
    return await etiketDplKopruyeGonder(ayarlar, dplUret(ayarlar, veri))
  } catch (error) {
    return {
      durum: 'basarisiz',
      mesaj: `Etiket DPL verisi üretilemedi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
    }
  }
}
