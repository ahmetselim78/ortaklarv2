import { supabase } from '@/lib/supabase'

import type { UretimEmriDetay } from '@/types/uretim'

import type { OptiFamEsleme } from '@/types/ayarlar'

import {

  getAraBoslukMm,

  citaEslestir,

  citaStokAdi,

  citaBukumMalzemeEtiketi,

  type CitaStokLite,

} from '@/lib/cam'

import { fizikselGlsKodu } from '@/lib/siparisDetay'

import {

  optiTumParcalar,

  optiImpOlustur,

  optiDosyaAdi,

  optiExportAnalizEt,

  OptiPaneCozumlemeHatasi,

  OptiExportSiraNoHatasi,

  OptiExportKritikHatasi,

} from '@/lib/optiExport'

import { impEncodeCp1254 } from '@/lib/impParser'



function citaBukumSutunlari(

  d: NonNullable<UretimEmriDetay['siparis_detaylari']>,

  citaStoklar: CitaStokLite[],

): { kalinlik: string; malzeme: string } {

  const araBosluk =

    getAraBoslukMm(d.stok ?? null) ??

    (d.cita_stok?.kalinlik_mm != null ? Math.round(d.cita_stok.kalinlik_mm) : null)



  if (araBosluk == null) {

    return {

      kalinlik: d.cita_stok?.kalinlik_mm != null ? String(Math.round(d.cita_stok.kalinlik_mm)) : '',

      malzeme: d.cita_stok?.ad ? citaBukumMalzemeEtiketi(d.cita_stok.ad) : '',

    }

  }



  const eslesme = citaEslestir(araBosluk, citaStoklar)

  return {

    kalinlik: String(araBosluk),

    malzeme: citaBukumMalzemeEtiketi(eslesme?.ad ?? citaStokAdi(araBosluk)),

  }

}



function dosyaIndirBinary(bytes: Uint8Array, dosyaAdi: string) {

  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })

  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')

  link.href = url

  link.download = dosyaAdi

  document.body.appendChild(link)

  link.click()

  document.body.removeChild(link)

  setTimeout(() => URL.revokeObjectURL(url), 1000)

}



function dosyaIndir(icerik: string, dosyaAdi: string, mime = 'text/plain;charset=utf-8;') {

  const blob = new Blob([icerik], { type: mime })

  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')

  link.href = url

  link.download = dosyaAdi

  document.body.appendChild(link)

  link.click()

  document.body.removeChild(link)

  setTimeout(() => URL.revokeObjectURL(url), 1000)

}



/** IMP içeriğini Windows-1254 buffer olarak üretir. */

export function optiImpBufferOlustur(parcalar: Parameters<typeof optiImpOlustur>[0]): Uint8Array {

  const icerik = optiImpOlustur(parcalar)

  return impEncodeCp1254(icerik)

}



/**

 * PerfectCut-6 uyumlu IMP dosyası oluşturur ve tarayıcıya indirir.

 * Kritik çözümleme sorununda export durur.

 */

export function exportOptiIMP(

  detaylar: UretimEmriDetay[],

  hedefFam: string,

  sayac: number,

  famHaritasi: OptiFamEsleme[] = [],

) {

  const analiz = optiExportAnalizEt(detaylar, famHaritasi)

  if (analiz.kritikVar) {

    const kritikler = analiz.sorunlar.filter((s) => s.seviye === 'kritik')

    throw new OptiExportKritikHatasi(kritikler)

  }



  const parcalar = optiTumParcalar(detaylar, hedefFam, famHaritasi)

  if (parcalar.length === 0) {

    throw new Error('Seçilen cam türü için export edilecek parça bulunamadı.')

  }

  const buffer = optiImpBufferOlustur(parcalar)

  dosyaIndirBinary(buffer, optiDosyaAdi(sayac))

}



export { OptiPaneCozumlemeHatasi, OptiExportSiraNoHatasi, OptiExportKritikHatasi }



/** Export sonrası batch'in durumunu ve export tarihini günceller. */

export async function exportTarihiGuncelle(uretimEmriId: string) {

  const { data, error } = await supabase

    .from('uretim_emirleri')

    .update({ export_tarihi: new Date().toISOString(), durum: 'export_edildi' })

    .eq('id', uretimEmriId)

    .in('durum', ['hazirlaniyor', 'eksik_var', 'export_edildi'])

    .select('id')



  if (error) throw new Error(`Export tarihi güncellenemedi: ${error.message}`)

  if (!data || data.length === 0) {

    throw new Error('Batch durumu export icin uygun degil veya kayit guncellenemedi.')

  }

}



/**

 * Verilen Üretim Emri detay listesinden Çıta Büküm makinesine özgü

 * noktalı virgül (;) ayrımlı CSV oluşturur ve tarayıcıya indirir.

 */

export function exportCitaBukumCSV(

  detaylar: UretimEmriDetay[],

  batchNo: string,

  citaStoklar: CitaStokLite[] = [],

) {

  const fmt1 = (n: number) => n.toFixed(1)



  const satirVerileri = detaylar.flatMap((item) => {

    const d = item.siparis_detaylari

    if (!d) return []

    const { kalinlik, malzeme } = citaBukumSutunlari(d, citaStoklar)

    const siraNo = fizikselGlsKodu(item.sira_no, '')

    const altMusteri = d.siparisler?.alt_musteri ?? ''

    const genislik = d.genislik_mm

    const yukseklik = d.yukseklik_mm

    const cevre = 2 * (genislik + yukseklik)

    const adet = Math.max(1, d.adet ?? 1)



    return Array.from({ length: adet }, () => ({ kalinlik, malzeme, siraNo, altMusteri, cevre, yukseklik, genislik }))

  })



  const zeros = Array(28).fill('0.0').join(';')

  const lines = satirVerileri.map((s, idx) =>

    `${idx + 1};3;4;1;0;0;${s.kalinlik};${s.malzeme};${s.siraNo};${s.altMusteri};4.0;${fmt1(s.cevre)};${fmt1(s.yukseklik)};${fmt1(s.genislik)};${zeros};;;;;;`

  )



  const content = lines.join('\r\n')

  dosyaIndir('\uFEFF' + content, `${batchNo}_CITA.csv`, 'text/csv;charset=utf-8;')

}

