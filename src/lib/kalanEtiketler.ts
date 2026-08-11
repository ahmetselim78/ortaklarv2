import { camTarananSayisi } from '@/lib/yikamaLoglari'

export interface KalanEtiketCami {
  uretim_emri_detay_id: string
  siparis_id: string
  siparis_no: string
  musteri: string
  nihai_musteri: string
  adet: number
  taranan_adet: number
  uretim_durumu: string
}

export interface KalanEtiketListesi {
  key: string
  siparis_id: string
  siparis_no: string
  musteri: string
  nihai_musteri: string
  toplam: number
  islenen: number
  kalan: number
}

export interface KalanEtiketKalemi<T extends KalanEtiketCami = KalanEtiketCami> {
  cam: T
  adet: number
}

function listeAnahtari(cam: KalanEtiketCami): string {
  return cam.siparis_id || `${cam.siparis_no}||${cam.musteri}||${cam.nihai_musteri}`
}

/** Otomatik baskı taramayla tetiklendiği için basılmayı bekleyen adet, taranmayan adettir. */
export function kalanEtiketAdedi(cam: KalanEtiketCami): number {
  const toplam = Math.max(0, cam.adet ?? 0)
  return Math.max(0, toplam - camTarananSayisi(cam))
}

/** Batch camlarını seçim ekranında gösterilecek sipariş listelerine dönüştürür. */
export function kalanEtiketListeleriniOlustur<T extends KalanEtiketCami>(
  camlar: T[],
): KalanEtiketListesi[] {
  const map = new Map<string, KalanEtiketListesi>()

  for (const cam of camlar) {
    const key = listeAnahtari(cam)
    const toplam = Math.max(0, cam.adet ?? 0)
    const islenen = camTarananSayisi(cam)
    const mevcut = map.get(key) ?? {
      key,
      siparis_id: cam.siparis_id,
      siparis_no: cam.siparis_no,
      musteri: cam.musteri,
      nihai_musteri: cam.nihai_musteri,
      toplam: 0,
      islenen: 0,
      kalan: 0,
    }

    mevcut.toplam += toplam
    mevcut.islenen += islenen
    mevcut.kalan += Math.max(0, toplam - islenen)
    map.set(key, mevcut)
  }

  return Array.from(map.values()).sort((a, b) =>
    a.siparis_no.localeCompare(b.siparis_no, 'tr', { numeric: true })
    || a.musteri.localeCompare(b.musteri, 'tr'),
  )
}

/** Seçili sipariş listelerindeki camları, basılacak kalan adetleriyle döndürür. */
export function seciliKalanEtiketKalemleri<T extends KalanEtiketCami>(
  camlar: T[],
  seciliListeAnahtarlari: ReadonlySet<string>,
): KalanEtiketKalemi<T>[] {
  return camlar
    .filter(cam => seciliListeAnahtarlari.has(listeAnahtari(cam)))
    .map(cam => ({ cam, adet: kalanEtiketAdedi(cam) }))
    .filter(kalem => kalem.adet > 0)
}

export function kalanEtiketToplami<T extends KalanEtiketCami>(
  kalemler: KalanEtiketKalemi<T>[],
): number {
  return kalemler.reduce((toplam, kalem) => toplam + kalem.adet, 0)
}
