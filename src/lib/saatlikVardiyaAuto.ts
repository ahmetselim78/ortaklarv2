import { supabase } from '@/lib/supabase'
import type { UretimSaatSablonu, UretimSaatlikHedef } from '@/types/saatlikUretim'

const GUNLER_KEY = 'saatlik-sablon-gunler'
const VARSAYILAN_GUNLER = [1, 2, 3, 4, 5]

interface HedefSlot {
  sablon_id: string
  saat_araligi: string
  hedef_adet: number
}

export interface OtomatikVardiyaSonucu {
  durum: 'uygulandi' | 'atlandi'
  satirSayisi: number
  sablonAdlari: string[]
}

function gunNoFromDateStr(tarih: string): number {
  const [yil, ay, gun] = tarih.split('-').map(Number)
  if (!yil || !ay || !gun) return new Date().getDay()
  return new Date(yil, ay - 1, gun).getDay()
}

function sablonGunleriniOku(): Record<string, number[]> {
  try {
    if (typeof localStorage === 'undefined') return {}

    const raw = localStorage.getItem(GUNLER_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.entries(parsed).reduce<Record<string, number[]>>((acc, [sablonId, gunler]) => {
      if (!Array.isArray(gunler)) return acc

      acc[sablonId] = gunler
        .map(Number)
        .filter(gun => Number.isInteger(gun) && gun >= 0 && gun <= 6)

      return acc
    }, {})
  } catch {
    return {}
  }
}

function saatCakismaVar(aralik1: string, aralik2: string): boolean {
  const parse = (aralik: string) => aralik.split(' - ').map(s => s.trim())
  const [baslangic1, bitis1] = parse(aralik1)
  const [baslangic2, bitis2] = parse(aralik2)
  return baslangic1 < bitis2 && baslangic2 < bitis1
}

async function bugununMevcutSatiriVar(tarih: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('gunluk_uretim_takip')
    .select('id', { count: 'exact', head: true })
    .eq('tarih', tarih)

  if (error) throw error
  return (count ?? 0) > 0
}

export async function bugununVardiyaSablonlariniUygula(tarih: string): Promise<OtomatikVardiyaSonucu> {
  if (await bugununMevcutSatiriVar(tarih)) {
    return { durum: 'atlandi', satirSayisi: 0, sablonAdlari: [] }
  }

  const gunNo = gunNoFromDateStr(tarih)
  const sablonGunleri = sablonGunleriniOku()

  const { data: sablonData, error: sablonError } = await supabase
    .from('uretim_saat_sablonlari')
    .select('*')
    .order('sira_no')

  if (sablonError) throw sablonError

  const sablonlar = (sablonData ?? []) as UretimSaatSablonu[]
  const bugununSablonlari = sablonlar.filter(sablon => {
    const gunler = sablonGunleri[sablon.id] ?? VARSAYILAN_GUNLER
    return gunler.includes(gunNo)
  })

  if (bugununSablonlari.length === 0) {
    return { durum: 'atlandi', satirSayisi: 0, sablonAdlari: [] }
  }

  const { data: hedefData, error: hedefError } = await supabase
    .from('uretim_saatlik_hedefler')
    .select('*')
    .in('sablon_id', bugununSablonlari.map(sablon => sablon.id))
    .order('sablon_id')
    .order('sira_no')

  if (hedefError) throw hedefError

  const hedefler = (hedefData ?? []) as UretimSaatlikHedef[]
  const hedeflerBySablon = new Map<string, HedefSlot[]>()

  for (const hedef of hedefler) {
    const slotlar = hedeflerBySablon.get(hedef.sablon_id) ?? []
    slotlar.push({
      sablon_id: hedef.sablon_id,
      saat_araligi: hedef.saat_araligi,
      hedef_adet: hedef.hedef_adet,
    })
    hedeflerBySablon.set(hedef.sablon_id, slotlar)
  }

  const tumSlotlar: HedefSlot[] = []

  for (const sablon of bugununSablonlari) {
    const slotlar = hedeflerBySablon.get(sablon.id) ?? []

    for (const slot of slotlar) {
      const cakisanSlot = tumSlotlar.find(mevcut => saatCakismaVar(mevcut.saat_araligi, slot.saat_araligi))

      if (cakisanSlot) {
        throw new Error(
          `Saat cakismasi: "${sablon.sablon_adi}" sablonundaki "${slot.saat_araligi}" araligi mevcut bir aralikla (${cakisanSlot.saat_araligi}) cakisir.`
        )
      }

      tumSlotlar.push(slot)
    }
  }

  if (tumSlotlar.length === 0) {
    return {
      durum: 'atlandi',
      satirSayisi: 0,
      sablonAdlari: bugununSablonlari.map(sablon => sablon.sablon_adi),
    }
  }

  tumSlotlar.sort((a, b) => a.saat_araligi.localeCompare(b.saat_araligi))

  const satirlar = tumSlotlar.map((slot, index) => ({
    tarih,
    saat_araligi: slot.saat_araligi.trim(),
    hedef_adet: Number(slot.hedef_adet) || 0,
    gerceklesen_adet: 0,
    fire_adet: 0,
    aksiyon_notu: null,
    npt_orani: 0,
    sira_no: index,
  }))

  const { error: insertError } = await supabase
    .from('gunluk_uretim_takip')
    .upsert(satirlar, {
      onConflict: 'tarih,saat_araligi',
      ignoreDuplicates: true,
    })

  if (insertError) throw insertError

  return {
    durum: 'uygulandi',
    satirSayisi: satirlar.length,
    sablonAdlari: bugununSablonlari.map(sablon => sablon.sablon_adi),
  }
}
