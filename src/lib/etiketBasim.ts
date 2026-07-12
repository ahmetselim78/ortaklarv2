import { dplUret } from '@/types/ayarlar'
import type { EtiketAyarlari, EtiketVeri } from '@/types/ayarlar'

const VARSAYILAN_KOPRU_PORT = 9876

/** Otomatik yazdırma koşulu sağlanıyorsa DPL'yi yazıcı köprüsüne gönderir. */
export async function etiketOtomatikYazdir(
  ayarlar: EtiketAyarlari,
  veri: EtiketVeri,
): Promise<void> {
  if (!ayarlar.yazici.kopru_adresi.trim()) return
  if (ayarlar.yazdirma_kosulu !== 'otomatik') return

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

  await fetch(kopruUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fetchBody),
  }).catch(() => { /* sessiz hata — istasyon akışını bozma */ })
}
