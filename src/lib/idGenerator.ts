import { supabase } from './supabase'

/**
 * Atomic sayaç kullanarak belirtilen adet kadar sıralı GLS-XXXX kodu üretir.
 * PostgreSQL UPSERT ile race condition önlenir.
 */
export async function generateCamKodulari(adet: number): Promise<string[]> {
  const { data, error } = await supabase.rpc('sonraki_sayac', { p_anahtar: 'cam_kodu', p_adet: adet })
  if (error) throw new Error(`Cam kodu üretim hatası: ${error.message}`)
  const sonDeger = data as number
  return Array.from({ length: adet }, (_, i) => `GLS-${sonDeger - adet + 1 + i}`)
}

/** Yeni sipariş numarası: SIP-YYYY-NNNN */
export async function generateSiparisNo(): Promise<string> {
  const yil = new Date().getFullYear()
  const { data, error } = await supabase.rpc('sonraki_sayac', { p_anahtar: `siparis_no_${yil}`, p_adet: 1 })
  if (error) throw new Error(`Sipariş no üretim hatası: ${error.message}`)
  return `SIP-${yil}-${String(data as number).padStart(4, '0')}`
}

/** Yeni cari kodu: C-XXXX */
export async function generateCariKod(): Promise<string> {
  const { data, error } = await supabase.rpc('sonraki_sayac', { p_anahtar: 'cari_kod', p_adet: 1 })
  if (error) throw new Error(`Cari kod üretim hatası: ${error.message}`)
  return `C-${String(data as number).padStart(4, '0')}`
}

/** Yeni stok kodu: S-XXXX */
export async function generateStokKod(): Promise<string> {
  const { data, error } = await supabase.rpc('sonraki_sayac', { p_anahtar: 'stok_kod', p_adet: 1 })
  if (error) throw new Error(`Stok kod üretim hatası: ${error.message}`)
  return `S-${String(data as number).padStart(4, '0')}`
}

/** Yeni batch numarası: BATCH-YYYY-NNNN */
export async function generateBatchNo(): Promise<string> {
  const yil = new Date().getFullYear()
  const { data, error } = await supabase.rpc('sonraki_sayac', { p_anahtar: `batch_no_${yil}`, p_adet: 1 })
  if (error) throw new Error(`Batch no üretim hatası: ${error.message}`)
  return `BATCH-${yil}-${String(data as number).padStart(4, '0')}`
}
