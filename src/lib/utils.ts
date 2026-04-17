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
