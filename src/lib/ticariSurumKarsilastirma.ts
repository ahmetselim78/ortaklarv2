import type { TicariTaslakTuru } from '@/services/ticariService'

export type TicariKarsilastirmaTuru = TicariTaslakTuru | 'profil' | 'kdv'

export interface TicariSatirDegisikligi {
  anahtar: string
  tur: 'eklendi' | 'kaldirildi' | 'degisti'
  degisenAlanlar: string[]
  eski: Record<string, unknown> | null
  yeni: Record<string, unknown> | null
}

export interface TicariKoleksiyonFarki {
  koleksiyon: string
  eskiSayisi: number
  yeniSayisi: number
  degismeyenSayisi: number
  degisiklikler: TicariSatirDegisikligi[]
}

const anahtarAlanlari: Partial<
  Record<TicariTaslakTuru, Record<string, string[]>>
> = {
  fiyat: {
    urun: ['kapsam_tipi', 'stok_id', 'stok_grubu'],
    kenar: ['islem_turu'],
    menfez: ['menfez_turu', 'cap_alt_mm', 'cap_ust_mm'],
    kucuk_cam: ['alan_ust_siniri_m2'],
    nakliye: ['hesaplama_tipi'],
    diger: ['kalem_kodu'],
  },
  maliyet: {
    stok: ['stok_id', 'hesaplama_birimi'],
    islem: ['islem_kodu', 'islem_turu', 'hesaplama_birimi'],
    nakliye: ['hesaplama_tipi'],
    genel_gider: ['kalem_kodu'],
  },
  recete: {
    kalemler: ['sira_no'],
  },
  vade: {
    kademeler: ['sira_no'],
  },
}

const teknikAlanlar = new Set([
  'id',
  'created_at',
  'updated_at',
  'olusturan_kullanici_id',
  'yayinlayan_kullanici_id',
  'yayinlanma_tarihi',
  'revision_no',
])

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([alan]) => !teknikAlanlar.has(alan))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([alan, deger]) => [alan, normalize(deger)]),
    )
  }
  return value ?? null
}

function esit(a: unknown, b: unknown) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

function satirAnahtari(
  tur: TicariTaslakTuru,
  koleksiyon: string,
  satir: Record<string, unknown>,
) {
  const alanlar = anahtarAlanlari[tur]?.[koleksiyon] ?? []
  const parcalar = alanlar.map((alan) => String(satir[alan] ?? '').trim())
  if (parcalar.some(Boolean)) return parcalar.join(' · ')
  return JSON.stringify(normalize(satir))
}

function anahtarliHarita(
  tur: TicariTaslakTuru,
  koleksiyon: string,
  satirlar: Array<Record<string, unknown>>,
) {
  const sonuc = new Map<string, Record<string, unknown>>()
  const tekrarSayilari = new Map<string, number>()
  for (const satir of satirlar) {
    const temel = satirAnahtari(tur, koleksiyon, satir)
    const tekrar = tekrarSayilari.get(temel) ?? 0
    tekrarSayilari.set(temel, tekrar + 1)
    sonuc.set(tekrar === 0 ? temel : `${temel} #${tekrar + 1}`, satir)
  }
  return sonuc
}

export function ticariKalemFarklariniHesapla(
  tur: TicariTaslakTuru,
  eski: Record<string, Array<Record<string, unknown>>>,
  yeni: Record<string, Array<Record<string, unknown>>>,
): TicariKoleksiyonFarki[] {
  const koleksiyonlar = [...new Set([...Object.keys(eski), ...Object.keys(yeni)])].sort()
  return koleksiyonlar.map((koleksiyon) => {
    const eskiSatirlar = eski[koleksiyon] ?? []
    const yeniSatirlar = yeni[koleksiyon] ?? []
    const eskiHarita = anahtarliHarita(tur, koleksiyon, eskiSatirlar)
    const yeniHarita = anahtarliHarita(tur, koleksiyon, yeniSatirlar)
    const anahtarlar = [...new Set([...eskiHarita.keys(), ...yeniHarita.keys()])].sort()
    let degismeyenSayisi = 0
    const degisiklikler: TicariSatirDegisikligi[] = []

    for (const anahtar of anahtarlar) {
      const eskiSatir = eskiHarita.get(anahtar) ?? null
      const yeniSatir = yeniHarita.get(anahtar) ?? null
      if (!eskiSatir) {
        degisiklikler.push({
          anahtar,
          tur: 'eklendi',
          degisenAlanlar: Object.keys(yeniSatir ?? {}).sort(),
          eski: null,
          yeni: yeniSatir,
        })
        continue
      }
      if (!yeniSatir) {
        degisiklikler.push({
          anahtar,
          tur: 'kaldirildi',
          degisenAlanlar: Object.keys(eskiSatir).sort(),
          eski: eskiSatir,
          yeni: null,
        })
        continue
      }
      if (esit(eskiSatir, yeniSatir)) {
        degismeyenSayisi += 1
        continue
      }
      const alanlar = [...new Set([...Object.keys(eskiSatir), ...Object.keys(yeniSatir)])]
        .filter((alan) => !teknikAlanlar.has(alan) && !esit(eskiSatir[alan], yeniSatir[alan]))
        .sort()
      degisiklikler.push({
        anahtar,
        tur: 'degisti',
        degisenAlanlar: alanlar,
        eski: eskiSatir,
        yeni: yeniSatir,
      })
    }

    return {
      koleksiyon,
      eskiSayisi: eskiSatirlar.length,
      yeniSayisi: yeniSatirlar.length,
      degismeyenSayisi,
      degisiklikler,
    }
  })
}

export function ticariSurumAlanFarklariniHesapla(
  eski: Record<string, unknown>,
  yeni: Record<string, unknown>,
) {
  return [...new Set([...Object.keys(eski), ...Object.keys(yeni)])]
    .filter((alan) => (
      !teknikAlanlar.has(alan)
      && !esit(eski[alan], yeni[alan])
    ))
    .sort()
    .map((alan) => ({
      alan,
      eski: eski[alan] ?? null,
      yeni: yeni[alan] ?? null,
    }))
}
