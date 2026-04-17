import { supabase } from './supabase'

/**
 * Belirtilen adet kadar sıralı GLS-XXXX kodu üretir.
 * Tek sorguda tüm kodları üretir — eş zamanlı çakışmaları önler.
 * Örnek: adet=3 → ['GLS-1001', 'GLS-1002', 'GLS-1003']
 */
export async function generateCamKodulari(adet: number): Promise<string[]> {
  const { data } = await supabase
    .from('siparis_detaylari')
    .select('cam_kodu')
    .like('cam_kodu', 'GLS-%')
    .order('cam_kodu', { ascending: false })
    .limit(1)

  const baslangic = (!data || data.length === 0)
    ? 1001
    : parseInt((data[0].cam_kodu as string).replace('GLS-', ''), 10) + 1

  return Array.from({ length: adet }, (_, i) => `GLS-${baslangic + i}`)
}

/**
 * Yeni bir sipariş numarası üretir: SIP-YYYY-NNNN
 * Örnek: SIP-2026-0001
 */
export async function generateSiparisNo(): Promise<string> {
  const yil = new Date().getFullYear()
  const { data } = await supabase
    .from('siparisler')
    .select('siparis_no')
    .like('siparis_no', `SIP-${yil}-%`)
    .order('siparis_no', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return `SIP-${yil}-0001`

  const last = parseInt((data[0].siparis_no as string).split('-')[2], 10)
  return `SIP-${yil}-${String(last + 1).padStart(4, '0')}`
}
