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
} from '@/lib/optiExport'

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

/**
 * PerfectCut-6 uyumlu IMP dosyası oluşturur ve tarayıcıya indirir.
 */
export function exportOptiIMP(
  detaylar: UretimEmriDetay[],
  hedefFam: string,
  sayac: number,
  famHaritasi: OptiFamEsleme[] = [],
) {
  const parcalar = optiTumParcalar(detaylar, hedefFam, famHaritasi)
  if (parcalar.length === 0) {
    throw new Error('Seçilen cam türü için export edilecek parça bulunamadı.')
  }
  const icerik = optiImpOlustur(parcalar)
  dosyaIndir(icerik, optiDosyaAdi(sayac))
}

/** Export sonrası batch'in durumunu ve export tarihini günceller. */
export async function exportTarihiGuncelle(uretimEmriId: string) {
  const { data, error } = await supabase
    .from('uretim_emirleri')
    .update({ export_tarihi: new Date().toISOString(), durum: 'export_edildi' })
    .eq('id', uretimEmriId)
    .in('durum', ['hazirlaniyor', 'eksik_var'])
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

  const lines = detaylar.map((item, idx) => {
    const d = item.siparis_detaylari!
    const { kalinlik, malzeme } = citaBukumSutunlari(d, citaStoklar)
    const siraNo = fizikselGlsKodu(item.sira_no, '')
    const altMusteri = d.siparisler?.alt_musteri ?? ''
    const genislik = d.genislik_mm
    const yukseklik = d.yukseklik_mm
    const cevre = 2 * (genislik + yukseklik)
    const zeros = Array(28).fill('0.0').join(';')

    return `${idx + 1};3;4;1;0;0;${kalinlik};${malzeme};${siraNo};${altMusteri};4.0;${fmt1(cevre)};${fmt1(yukseklik)};${fmt1(genislik)};${zeros};;;;;;`
  })

  const content = lines.join('\r\n')
  dosyaIndir('\uFEFF' + content, `${batchNo}_CITA.csv`, 'text/csv;charset=utf-8;')
}
