import type { CariTipi } from '@/types/cari'

export const musteriCalismaSekmeleri = [
  'genel',
  'baglantilar',
  'siparisler',
  'hareketler',
] as const

export const tedarikciCalismaSekmeleri = [
  'genel',
  'urunler',
  'fiyatlar',
  'siparisler',
  'gecmis',
] as const

export type MusteriCalismaSekmesi = typeof musteriCalismaSekmeleri[number]
export type TedarikciCalismaSekmesi = typeof tedarikciCalismaSekmeleri[number]
export type CariCalismaSekmesi = MusteriCalismaSekmesi | TedarikciCalismaSekmesi

type CariKimligi = {
  id: string
  tipi: CariTipi
}

function cariTuruMu(deger: string | null): deger is CariTipi {
  return deger === 'musteri' || deger === 'tedarikci'
}

export function cariTurunuDogrula(deger: string | null): CariTipi {
  return cariTuruMu(deger) ? deger : 'musteri'
}

export function cariCalismaSekmesiniDogrula(
  tur: CariTipi,
  deger: string | null,
): CariCalismaSekmesi {
  const sekmeler: readonly string[] = tur === 'musteri'
    ? musteriCalismaSekmeleri
    : tedarikciCalismaSekmeleri
  return deger && sekmeler.includes(deger)
    ? deger as CariCalismaSekmesi
    : 'genel'
}

export function cariCalismaDurumunuCoz(
  search: string,
  cariler: readonly CariKimligi[],
) {
  const params = new URLSearchParams(search)
  const urlCarisi = cariler.find(cari => cari.id === params.get('cari'))
  const istenenTur = cariTurunuDogrula(params.get('tur'))
  const tur = urlCarisi?.tipi ?? istenenTur
  const secilenCari = urlCarisi ?? cariler.find(cari => cari.tipi === tur) ?? null
  const sekme = cariCalismaSekmesiniDogrula(tur, params.get('sekme'))

  params.set('tur', tur)
  params.set('sekme', sekme)
  if (secilenCari) params.set('cari', secilenCari.id)
  else params.delete('cari')

  return {
    tur,
    cariId: secilenCari?.id ?? '',
    sekme,
    normalizedSearch: params.toString(),
  }
}

export function cariHesapDurumunuCoz(
  search: string,
  cariler: readonly CariKimligi[] | null,
) {
  const params = new URLSearchParams(search)
  const hamTur = params.get('tur')
  const acikTur = cariTuruMu(hamTur) ? hamTur : null
  const urlCariId = params.get('cari') ?? ''
  const urlCarisi = cariler?.find(cari => cari.id === urlCariId)
  const tur = acikTur ?? urlCarisi?.tipi ?? 'musteri'

  // Eski yalnız-cari bağlantısında veri yüklenmeden türü tahmin edip kaydı
  // yanlış portföyden temizlemeyiz.
  if (cariler === null && urlCariId && !acikTur) {
    return {
      tur,
      cariId: urlCariId,
      normalizedSearch: null,
    }
  }

  const cariId = cariler !== null && urlCariId
    ? urlCarisi?.tipi === tur ? urlCariId : ''
    : urlCariId

  params.set('tur', tur)
  if (cariId) params.set('cari', cariId)
  else params.delete('cari')

  return {
    tur,
    cariId,
    normalizedSearch: params.toString(),
  }
}
