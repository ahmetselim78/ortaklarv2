/** Türkiye saat dilimi — tüm operatör/üretim ekranlarında tutarlı kullanım */
export const TR_TIMEZONE = 'Europe/Istanbul' as const

/** Bugünün tarihi: YYYY-MM-DD (İstanbul) */
export function bugunTarih(d = new Date()): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TR_TIMEZONE })
}

/** Bugünün tarihi uzun Türkçe format */
export function bugunGoster(d = new Date()): string {
  return d.toLocaleDateString('tr-TR', {
    timeZone: TR_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  })
}

/** Canlı saat: HH:mm:ss (İstanbul) */
export function trSaatStr(d = new Date()): string {
  return d.toLocaleTimeString('sv-SE', {
    timeZone: TR_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** Saat:dakika — aktif saat dilimi eşleştirmesi için */
export function trSaatDkStr(d = new Date()): string {
  return d.toLocaleTimeString('sv-SE', {
    timeZone: TR_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** ISO veya YYYY-MM-DD tarihini Türkçe gösterir */
export function formatTarihTr(dateStr: string): string {
  const tarih = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? `${dateStr}T12:00:00`
    : dateStr
  return new Date(tarih).toLocaleDateString('tr-TR', {
    timeZone: TR_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** ISO zaman damgasını Türkiye saatinde gösterir */
export function formatSaatTr(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('tr-TR', {
    timeZone: TR_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Tarih string'ine gün ekler (İstanbul takvimine göre) */
export function tarihEkleTr(gunSayisi: number, fromDate?: string): string {
  const base = fromDate ?? bugunTarih()
  const [y, m, d] = base.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d + gunSayisi))
  return utc.toLocaleDateString('sv-SE', { timeZone: TR_TIMEZONE })
}

/** YYYY-MM-DD tarihini uzun Türkçe etiket olarak gösterir */
export function tarihEtiketTr(t: string): string {
  return new Date(`${t}T12:00:00`).toLocaleDateString('tr-TR', {
    timeZone: TR_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'short',
  })
}

/** İstanbul saatine göre günün selamlaması */
export function gunlukSelamlama(d = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: TR_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  }).format(d))

  if (hour >= 5 && hour < 12) return 'Günaydın'
  if (hour >= 12 && hour < 18) return 'Tünaydın'
  if (hour >= 18 && hour < 22) return 'İyi akşamlar'
  return 'İyi geceler'
}
