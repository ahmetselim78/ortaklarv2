import { supabase } from '@/lib/supabase'
import {
  citaEslestir,
  getStokKatmanYapisi,
  stokKartEslestir,
  type CitaStokLite,
  type StokKartLite,
} from '@/lib/cam'

export interface MigrasyonKayit {
  detay_id: string
  eski_stok_kod: string
  eski_stok_ad: string
  yeni_stok_kod?: string
  yeni_stok_ad?: string
  katman_yapisi: string | null
}

export interface MigrasyonSonuc {
  guncellenen: number
  eslesmeyen: MigrasyonKayit[]
}

type StokJoin = StokKartLite & { kategori?: string | null }

function eskiAileStokMu(stok: StokJoin | null | undefined): boolean {
  if (!stok || stok.kategori !== 'cam') return false
  if (stok.aktif === false) return true
  if (!stok.katman_yapisi && stok.kod?.startsWith('S-')) return true
  return false
}

function stokFromJoin(raw: unknown): StokJoin | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as StokJoin
}

/** Pasif / aile stoklarına referans veren sipariş detaylarını kombinasyon kartlarına taşır. */
export async function eskiStokReferanslariniMigrate(): Promise<MigrasyonSonuc> {
  const [{ data: detaylar, error: detayErr }, { data: aktifStoklar, error: stokErr }] = await Promise.all([
    supabase
      .from('siparis_detaylari')
      .select(`
        id,
        stok_id,
        stok:stok_id ( id, kod, ad, grup, katman_yapisi, aktif, kategori )
      `)
      .not('stok_id', 'is', null),
    supabase
      .from('stok')
      .select('id, kod, ad, grup, katman_yapisi, aktif, kategori')
      .eq('kategori', 'cam')
      .eq('aktif', true),
  ])

  if (detayErr) throw new Error(detayErr.message)
  if (stokErr) throw new Error(stokErr.message)

  const kartlar = (aktifStoklar ?? []) as StokKartLite[]
  const eslesmeyen: MigrasyonKayit[] = []
  let guncellenen = 0

  for (const row of detaylar ?? []) {
    const stok = stokFromJoin(row.stok)
    if (!stok || !eskiAileStokMu(stok)) continue

    const katman = getStokKatmanYapisi(stok)
    const aciklama = [katman, stok.ad].filter(Boolean).join(' ')
    const eslesme = stokKartEslestir(aciklama, kartlar, 0.45)

    if (!eslesme) {
      eslesmeyen.push({
        detay_id: row.id,
        eski_stok_kod: stok.kod ?? '',
        eski_stok_ad: stok.ad,
        katman_yapisi: katman || null,
      })
      continue
    }

    const { error } = await supabase
      .from('siparis_detaylari')
      .update({
        stok_id: eslesme.id,
      })
      .eq('id', row.id)

    if (error) {
      eslesmeyen.push({
        detay_id: row.id,
        eski_stok_kod: stok.kod ?? '',
        eski_stok_ad: stok.ad,
        katman_yapisi: katman || null,
      })
      continue
    }

    guncellenen++
  }

  return { guncellenen, eslesmeyen }
}

function pasifCitaStokMu(stok: StokJoin | null | undefined): boolean {
  if (!stok || stok.kategori !== 'cita') return false
  return stok.aktif === false
}

/** Pasif çıta kartına referans veren sipariş detaylarını aynı mm'li aktif karta taşır. */
export async function pasifCitaReferanslariniMigrate(): Promise<MigrasyonSonuc> {
  const [{ data: detaylar, error: detayErr }, { data: aktifCitalar, error: stokErr }] = await Promise.all([
    supabase
      .from('siparis_detaylari')
      .select(`
        id,
        cita_stok_id,
        cita_stok:cita_stok_id ( id, kod, ad, kalinlik_mm, aktif, kategori )
      `)
      .not('cita_stok_id', 'is', null),
    supabase
      .from('stok')
      .select('id, kod, ad, kalinlik_mm, aktif, kategori')
      .eq('kategori', 'cita')
      .eq('aktif', true),
  ])

  if (detayErr) throw new Error(detayErr.message)
  if (stokErr) throw new Error(stokErr.message)

  const kartlar = (aktifCitalar ?? []) as CitaStokLite[]
  const eslesmeyen: MigrasyonKayit[] = []
  let guncellenen = 0

  for (const row of detaylar ?? []) {
    const stok = stokFromJoin(row.cita_stok)
    if (!stok || !pasifCitaStokMu(stok)) continue

    const mm = stok.kalinlik_mm != null ? Math.round(stok.kalinlik_mm) : null
    const eslesme = mm != null ? citaEslestir(mm, kartlar) : null

    if (!eslesme || eslesme.id === stok.id) {
      eslesmeyen.push({
        detay_id: row.id,
        eski_stok_kod: stok.kod ?? '',
        eski_stok_ad: stok.ad ?? '',
        katman_yapisi: mm != null ? `${mm}mm` : null,
      })
      continue
    }

    const { error } = await supabase
      .from('siparis_detaylari')
      .update({ cita_stok_id: eslesme.id })
      .eq('id', row.id)

    if (error) {
      eslesmeyen.push({
        detay_id: row.id,
        eski_stok_kod: stok.kod ?? '',
        eski_stok_ad: stok.ad ?? '',
        katman_yapisi: mm != null ? `${mm}mm` : null,
      })
      continue
    }

    guncellenen++
  }

  return { guncellenen, eslesmeyen }
}

/** Pasif çıta referansı sayısı. */
export async function pasifCitaReferansSayisi(): Promise<number> {
  const { data, error } = await supabase
    .from('siparis_detaylari')
    .select('id, cita_stok:cita_stok_id ( kod, kalinlik_mm, aktif, kategori )')
    .not('cita_stok_id', 'is', null)

  if (error) throw new Error(error.message)

  return (data ?? []).filter((row) => pasifCitaStokMu(stokFromJoin(row.cita_stok))).length
}

/** Migrasyon öncesi kaç kayıt etkilenecek — dry-run sayacı. */
export async function eskiStokReferansSayisi(): Promise<number> {
  const { data, error } = await supabase
    .from('siparis_detaylari')
    .select('id, stok:stok_id ( kod, katman_yapisi, aktif, kategori )')
    .not('stok_id', 'is', null)

  if (error) throw new Error(error.message)

  return (data ?? []).filter((row) => eskiAileStokMu(stokFromJoin(row.stok))).length
}

/** Tek sipariş detay satırının stok / çıta referansını manuel günceller. */
export async function detayStokReferansiGuncelle(
  detayId: string,
  alan: 'stok_id' | 'cita_stok_id',
  yeniStokId: string,
): Promise<void> {
  const { error } = await supabase
    .from('siparis_detaylari')
    .update({ [alan]: yeniStokId })
    .eq('id', detayId)

  if (error) throw new Error(error.message)
}
