/**
 * Aksiyon Notu hazır cevap (preset) yönetimi.
 * localStorage üzerinde saklanır — Supabase bağlantısı gerektirmez.
 */

export interface AksiyonPreset {
  id: string
  metin: string
  /** '1'–'9' arasında kısayol tuşu. '' ise kısayol yok. */
  kisayol: string
}

const STORAGE_KEY = 'saatlik-aksiyon-presets'

const VARSAYILAN_PRESETLER: AksiyonPreset[] = [
  { id: 'p1', metin: 'Makine arızası', kisayol: '1' },
  { id: 'p2', metin: 'Hammadde bekleniyor', kisayol: '2' },
  { id: 'p3', metin: 'Ekip değişimi / mola', kisayol: '3' },
  { id: 'p4', metin: 'Kalite kontrolü', kisayol: '4' },
  { id: 'p5', metin: 'Temizlik / bakım', kisayol: '5' },
]

export function presetsOku(): AksiyonPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // İlk kullanımda varsayılanları yaz
      presetleriYaz(VARSAYILAN_PRESETLER)
      return VARSAYILAN_PRESETLER
    }
    return JSON.parse(raw) as AksiyonPreset[]
  } catch {
    return VARSAYILAN_PRESETLER
  }
}

export function presetleriYaz(presets: AksiyonPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch { /* ignore */ }
}

export function yeniPresetId(): string {
  return `p${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}
