import type {
  MaliyetCamHammaddesi,
  MaliyetCamTuru,
  MaliyetCitasi,
  MaliyetCitaTuru,
  MaliyetSarfHesaplamaTipi,
  MaliyetSarfKatsayiSurumu,
} from '@/types/maliyet'

export const CAM_TURU_ETIKETLERI: Record<MaliyetCamTuru, string> = {
  duz: 'Düz',
  konfor: 'Konfor',
  sinerji: 'Sinerji',
  buzlu: 'Buzlu',
  fume: 'Füme',
  bronz: 'Bronz',
  reflekte: 'Reflekte',
  satina: 'Satina',
  lamine: 'Lamine',
  diger: 'Diğer',
}

export const CITA_TURU_ETIKETLERI: Record<MaliyetCitaTuru, string> = {
  aluminyum: 'Alüminyum',
  sicak_kenar: 'Sıcak Kenar',
  paslanmaz: 'Paslanmaz',
  diger: 'Diğer',
}

export const SARF_HESAPLAMA_ETIKETLERI: Record<MaliyetSarfHesaplamaTipi, string> = {
  cevre_m: 'Çevre metresi başına',
  m2: 'm² başına',
  adet: 'Cam adedi başına',
  sabit: 'Cam başına sabit',
}

function sadeSayi(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    maximumFractionDigits: 4,
  }).format(value)
}

export function maliyetCamAdi(cam: Pick<
  MaliyetCamHammaddesi,
  'kalinlik_mm' | 'cam_turu' | 'ozel_tur_adi'
>) {
  const tur = cam.cam_turu === 'diger'
    ? cam.ozel_tur_adi || CAM_TURU_ETIKETLERI.diger
    : CAM_TURU_ETIKETLERI[cam.cam_turu]
  return `${sadeSayi(cam.kalinlik_mm)} mm ${tur} Cam`
}

export function maliyetCitaAdi(cita: Pick<
  MaliyetCitasi,
  'genislik_mm' | 'malzeme_turu' | 'ozel_malzeme_adi'
>) {
  const tur = cita.malzeme_turu === 'diger'
    ? cita.ozel_malzeme_adi || CITA_TURU_ETIKETLERI.diger
    : CITA_TURU_ETIKETLERI[cita.malzeme_turu]
  return `${sadeSayi(cita.genislik_mm)} mm ${tur} Çıta`
}

export function maliyetSarfKatsayiMetni(
  katsayi: Pick<
    MaliyetSarfKatsayiSurumu,
    'hesaplama_tipi' | 'tuketim_katsayisi' | 'bosluk_basi' | 'fire_orani'
  >,
  birim: string,
) {
  const kapsam = SARF_HESAPLAMA_ETIKETLERI[katsayi.hesaplama_tipi]
  const bosluk = katsayi.bosluk_basi ? ' · her cam boşluğu için' : ''
  const fire = katsayi.fire_orani > 0 ? ` · %${sadeSayi(katsayi.fire_orani)} fire` : ''
  return `${sadeSayi(katsayi.tuketim_katsayisi)} ${birim} · ${kapsam}${bosluk}${fire}`
}

export function maliyetVadeFinansmanEtkisi(
  bazFiyat: number,
  yillikOran: number,
  vadeGunu: number,
) {
  if (![bazFiyat, yillikOran, vadeGunu].every(Number.isFinite)) return 0
  return bazFiyat * (yillikOran / 100) * (vadeGunu / 365)
}

