import type { UretimDurumu } from '@/types/siparis'
import { generateCamKodulari } from '@/lib/idGenerator'

export interface TekilCamInput {
  stok_id?: string | null
  genislik_mm: number | string
  yukseklik_mm: number | string
  adet?: number | string
  cita_stok_id?: string | null
  kenar_islemi?: string | null
  notlar?: string | null
  poz?: string | null
  menfez_cap_mm?: number | string | null
  kucuk_cam?: boolean | null
  ara_bosluk_mm?: number | string | null
}

export interface TekilSiparisDetayRow {
  siparis_id: string
  stok_id: string | null
  cam_kodu: string
  genislik_mm: number
  yukseklik_mm: number
  adet: 1
  uretim_durumu: UretimDurumu
  cita_stok_id: string | null
  kenar_islemi: string | null
  notlar: string | null
  poz: string | null
  menfez_cap_mm: number | null
  kucuk_cam: boolean
}

function pozitifSayi(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function fizikselCamAdedi(adet: unknown): number {
  const n = Number(adet)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

export function normalizeBatchSiraInput(value: string): number | null {
  const temiz = value.trim().toUpperCase()
  if (!temiz) return null
  const match = temiz.match(/(\d+)$/)
  if (!match) return null
  const sira = Number(match[1])
  return Number.isInteger(sira) && sira > 0 ? sira : null
}

export function fizikselGlsKodu(siraNo: number | null | undefined, fallback?: string | null): string {
  return siraNo != null && siraNo > 0 ? String(siraNo) : (fallback ?? '')
}

/** Sipariş detay listesinde gösterilecek kod — batch sıra no veya stok kodu (GLS değil). */
export function siparisDetayGosterimKodu(
  siraNo: number | null | undefined,
  stokKod?: string | null,
): string {
  if (siraNo != null && siraNo > 0) return String(siraNo)
  const kod = stokKod?.trim()
  return kod || '—'
}

function menfezCap(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

export async function tekilSiparisDetayRows(
  siparisId: string,
  camlar: TekilCamInput[],
  uretimDurumu: UretimDurumu = 'bekliyor',
): Promise<TekilSiparisDetayRow[]> {
  const toplam = camlar.reduce((sum, cam) => sum + fizikselCamAdedi(cam.adet), 0)
  const kodlar = await generateCamKodulari(toplam)
  let kodIndex = 0

  return camlar.flatMap((cam) => {
    const adet = fizikselCamAdedi(cam.adet)
    return Array.from({ length: adet }, () => ({
      siparis_id: siparisId,
      stok_id: cam.stok_id || null,
      cam_kodu: kodlar[kodIndex++],
      genislik_mm: pozitifSayi(cam.genislik_mm),
      yukseklik_mm: pozitifSayi(cam.yukseklik_mm),
      adet: 1 as const,
      uretim_durumu: uretimDurumu,
      cita_stok_id: cam.cita_stok_id || null,
      kenar_islemi: cam.kenar_islemi || null,
      notlar: cam.notlar || null,
      poz: cam.poz || null,
      menfez_cap_mm: menfezCap(cam.menfez_cap_mm),
      kucuk_cam: cam.kucuk_cam ?? false,
    }))
  })
}
