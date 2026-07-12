import { supabase } from '@/lib/supabase'
import { tumSatirlariGetir } from '@/lib/supabasePagination'

/** Yıkama log sayılarını yalnızca uretim_emri_detay_id anahtarıyla döndürür. */
export async function yikamaLogSayilariGetir(uretimEmriIds: string[]): Promise<Map<string, number>> {
  if (uretimEmriIds.length === 0) return new Map()

  const loglar = await tumSatirlariGetir(
    (from, to) =>
      supabase
        .from('yikama_loglari')
        .select('uretim_emri_detay_id, uretim_emri_detaylari!inner(uretim_emri_id)', { count: 'exact' })
        .in('uretim_emri_detaylari.uretim_emri_id', uretimEmriIds)
        .not('uretim_emri_detay_id', 'is', null)
        .range(from, to),
    { baglam: `yıkama logları (${uretimEmriIds.length} batch)` },
  )

  const map = new Map<string, number>()
  for (const log of loglar) {
    const key = log.uretim_emri_detay_id
    if (key) map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

/** Kısmi veya tam tarama sonrası taranan adet sayısı (uretim_emri_detaylari.id bazında). */
export function tarananAdetHesapla(
  uretimDurumu: string | null | undefined,
  adet: number,
  uretimEmriDetayId: string,
  logMap: Map<string, number>,
): number {
  const guvenliAdet = Math.max(0, adet)
  if (uretimDurumu === 'yikandi') return guvenliAdet
  const logSayisi = Math.max(0, logMap.get(uretimEmriDetayId) ?? 0)
  return Math.min(logSayisi, guvenliAdet)
}

/** Cam satırından toplam ilerleme sayısına katkı. */
export function camTarananSayisi(c: {
  uretim_durumu?: string | null
  adet: number
  taranan_adet: number
}): number {
  const guvenliAdet = Math.max(0, c.adet)
  const guvenliTaranan = Math.max(0, c.taranan_adet)

  if (c.uretim_durumu === 'yikandi') {
    return guvenliAdet
  }

  return Math.min(guvenliTaranan, guvenliAdet)
}

export interface BatchYikamaDetaySatiri {
  /** uretim_emri_detaylari.id */
  id: string
  siparis_detay_id: string
  uretim_durumu?: string | null
  /** siparis_detaylari.adet — uretim_emri_detaylari tablosunda adet kolonu yok */
  adet: number
}

/** Batch veya sipariş detayı satırlarından toplam yıkama özeti. */
export function batchYikamaOzetiHesapla(
  detaylar: BatchYikamaDetaySatiri[],
  logMap: Map<string, number>,
): { taranan: number; toplam: number } {
  let taranan = 0
  let toplam = 0

  for (const d of detaylar) {
    const guvenliAdet = Math.max(0, d.adet)
    toplam += guvenliAdet
    const tarananAdet = tarananAdetHesapla(d.uretim_durumu, guvenliAdet, d.id, logMap)
    taranan += camTarananSayisi({
      uretim_durumu: d.uretim_durumu,
      adet: guvenliAdet,
      taranan_adet: tarananAdet,
    })
  }

  return { taranan, toplam }
}
