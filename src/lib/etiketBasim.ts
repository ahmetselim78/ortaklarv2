import { dplUret } from '@/types/ayarlar'
import type { EtiketAyarlari, EtiketVeri } from '@/types/ayarlar'

const VARSAYILAN_KOPRU_PORT = 9876
const KOPRU_ZAMAN_ASIMI_MS = 8000

export type EtiketBasimDurumu = 'gonderiliyor' | 'yaziciya_gonderildi' | 'basarisiz' | 'devre_disi'

export interface EtiketBasimSonucu {
  durum: Exclude<EtiketBasimDurumu, 'gonderiliyor'>
  mesaj: string
}

interface KopruYaniti {
  basarili?: boolean
  mesaj?: string
  hata?: string
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

  const dpl = dplUret(ayarlar, veri)
  const kopruUrl = `http://${ayarlar.yazici.kopru_adresi.trim()}:${ayarlar.yazici.kopru_port ?? VARSAYILAN_KOPRU_PORT}/yazdir`
  const usb = ayarlar.yazici.yazici_adi?.trim()
  const fetchBody = usb
    ? { yazici_adi: usb, dpl }
    : {
        ip: (ayarlar.yazici.ip_adresi.trim()
          .replace(/^https?:\/\//i, '').replace(/\/+$/, '') || 'localhost'),
        port: ayarlar.yazici.port,
        dpl,
      }

  try {
    const response = await fetch(kopruUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fetchBody),
      signal: AbortSignal.timeout(KOPRU_ZAMAN_ASIMI_MS),
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
    const zamanAsimi = error instanceof DOMException && error.name === 'TimeoutError'
    return {
      durum: 'basarisiz',
      mesaj: zamanAsimi
        ? `Yazıcı köprüsü ${KOPRU_ZAMAN_ASIMI_MS / 1000} saniye içinde yanıt vermedi.`
        : `Yazıcı köprüsüne ulaşılamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
    }
  }
}
