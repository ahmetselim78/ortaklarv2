import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind sınıflarını birleştirmek için yardımcı fonksiyon */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Tarihi Türkçe formatında gösterir: 16.04.2026 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('tr-TR')
}

/**
 * Stok adından cam tipi kısmını döndürür.
 * "4mm Düz Cam" → "Düz Cam"
 * "Sinerji Cam" → "Sinerji Cam"
 * Kalınlık prefix'i (örn. "4mm ", "6 mm ") başta varsa atılır.
 */
export function camTipiAd(stokAd: string | null | undefined): string {
  if (!stokAd) return ''
  return stokAd.replace(/^\s*\d+\s*mm\s*/i, '').trim()
}
