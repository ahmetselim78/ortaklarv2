import type { TicariTaslakTuru } from '@/services/ticariService'

type HucreTuru = 'metin' | 'sayi' | 'tam_sayi' | 'boolean'

interface SayfaTanimi {
  ad: string
  anahtar: string
  kolonlar: Array<{ alan: string; baslik: string; tur?: HucreTuru }>
}

export interface TicariExcelReferanslar {
  stoklar: Array<{ id: string; kod: string; ad: string }>
  kdvGruplari: Array<{ id: string; kod: string; ad: string }>
}

const ortakPara = [
  { alan: 'para_birimi', baslik: 'Para Birimi' },
  { alan: 'aktif', baslik: 'Aktif', tur: 'boolean' as const },
]

export const ticariExcelSayfalari: Record<TicariTaslakTuru, SayfaTanimi[]> = {
  fiyat: [
    {
      ad: 'Urun_Fiyatlari',
      anahtar: 'urun',
      kolonlar: [
        { alan: 'kapsam_tipi', baslik: 'Kapsam Tipi' },
        { alan: 'stok_id', baslik: 'Stok UUID' },
        { alan: 'stok_kodu', baslik: 'Stok Kodu' },
        { alan: 'stok_grubu', baslik: 'Stok Grubu' },
        { alan: 'birim_fiyat', baslik: 'Birim Fiyat', tur: 'sayi' },
        { alan: 'yuzde_fark', baslik: 'Yüzde Fark', tur: 'sayi' },
        ...ortakPara,
        { alan: 'kdv_grubu_id', baslik: 'KDV Grubu UUID' },
        { alan: 'kdv_kodu', baslik: 'KDV Kodu' },
        { alan: 'minimum_m2', baslik: 'Minimum m²', tur: 'sayi' },
        { alan: 'en_adimi_mm', baslik: 'En Adımı mm', tur: 'sayi' },
        { alan: 'boy_adimi_mm', baslik: 'Boy Adımı mm', tur: 'sayi' },
      ],
    },
    {
      ad: 'Kenar_Islemleri',
      anahtar: 'kenar',
      kolonlar: [
        { alan: 'islem_turu', baslik: 'İşlem Türü' },
        { alan: 'birim_fiyat', baslik: 'Birim Fiyat', tur: 'sayi' },
        ...ortakPara,
        { alan: 'kdv_grubu_id', baslik: 'KDV Grubu UUID' },
        { alan: 'kdv_kodu', baslik: 'KDV Kodu' },
      ],
    },
    {
      ad: 'Menfezler',
      anahtar: 'menfez',
      kolonlar: [
        { alan: 'menfez_turu', baslik: 'Menfez Türü' },
        { alan: 'cap_alt_mm', baslik: 'Çap Alt mm', tur: 'sayi' },
        { alan: 'cap_ust_mm', baslik: 'Çap Üst mm', tur: 'sayi' },
        { alan: 'birim_fiyat', baslik: 'Birim Fiyat', tur: 'sayi' },
        ...ortakPara,
        { alan: 'kdv_grubu_id', baslik: 'KDV Grubu UUID' },
        { alan: 'kdv_kodu', baslik: 'KDV Kodu' },
      ],
    },
    {
      ad: 'Kucuk_Cam',
      anahtar: 'kucuk_cam',
      kolonlar: [
        { alan: 'alan_ust_siniri_m2', baslik: 'Alan Üst Sınırı m²', tur: 'sayi' },
        { alan: 'sabit_ek_tutar', baslik: 'Sabit Ek Tutar', tur: 'sayi' },
        { alan: 'yuzde_ek_bedel', baslik: 'Yüzde Ek Bedel', tur: 'sayi' },
        ...ortakPara,
        { alan: 'kdv_grubu_id', baslik: 'KDV Grubu UUID' },
        { alan: 'kdv_kodu', baslik: 'KDV Kodu' },
      ],
    },
    {
      ad: 'Nakliye',
      anahtar: 'nakliye',
      kolonlar: [
        { alan: 'hesaplama_tipi', baslik: 'Hesaplama Tipi' },
        { alan: 'birim_fiyat', baslik: 'Birim Fiyat', tur: 'sayi' },
        { alan: 'minimum_tutar', baslik: 'Minimum Tutar', tur: 'sayi' },
        ...ortakPara,
        { alan: 'kdv_grubu_id', baslik: 'KDV Grubu UUID' },
        { alan: 'kdv_kodu', baslik: 'KDV Kodu' },
      ],
    },
    {
      ad: 'Diger_Kalemler',
      anahtar: 'diger',
      kolonlar: [
        { alan: 'kalem_kodu', baslik: 'Kalem Kodu' },
        { alan: 'kalem_adi', baslik: 'Kalem Adı' },
        { alan: 'hesaplama_birimi', baslik: 'Hesaplama Birimi' },
        { alan: 'birim_fiyat', baslik: 'Birim Fiyat', tur: 'sayi' },
        ...ortakPara,
        { alan: 'kdv_grubu_id', baslik: 'KDV Grubu UUID' },
        { alan: 'kdv_kodu', baslik: 'KDV Kodu' },
      ],
    },
  ],
  maliyet: [
    {
      ad: 'Stok_Maliyetleri',
      anahtar: 'stok',
      kolonlar: [
        { alan: 'stok_id', baslik: 'Stok UUID' },
        { alan: 'stok_kodu', baslik: 'Stok Kodu' },
        { alan: 'hesaplama_birimi', baslik: 'Hesaplama Birimi' },
        { alan: 'birim_maliyet', baslik: 'Birim Maliyet', tur: 'sayi' },
        ...ortakPara,
        { alan: 'fire_orani', baslik: 'Fire Oranı %', tur: 'sayi' },
      ],
    },
    {
      ad: 'Islem_Maliyetleri',
      anahtar: 'islem',
      kolonlar: [
        { alan: 'islem_kodu', baslik: 'İşlem Kodu' },
        { alan: 'islem_turu', baslik: 'İşlem Türü' },
        { alan: 'hesaplama_birimi', baslik: 'Hesaplama Birimi' },
        { alan: 'birim_maliyet', baslik: 'Birim Maliyet', tur: 'sayi' },
        ...ortakPara,
        { alan: 'fire_orani', baslik: 'Fire Oranı %', tur: 'sayi' },
      ],
    },
    {
      ad: 'Nakliye_Maliyeti',
      anahtar: 'nakliye',
      kolonlar: [
        { alan: 'hesaplama_tipi', baslik: 'Hesaplama Tipi' },
        { alan: 'birim_maliyet', baslik: 'Birim Maliyet', tur: 'sayi' },
        { alan: 'minimum_tutar', baslik: 'Minimum Tutar', tur: 'sayi' },
        ...ortakPara,
      ],
    },
    {
      ad: 'Genel_Giderler',
      anahtar: 'genel_gider',
      kolonlar: [
        { alan: 'kalem_kodu', baslik: 'Kalem Kodu' },
        { alan: 'kalem_adi', baslik: 'Kalem Adı' },
        { alan: 'hesaplama_birimi', baslik: 'Hesaplama Birimi' },
        { alan: 'birim_maliyet', baslik: 'Birim Maliyet', tur: 'sayi' },
        ...ortakPara,
      ],
    },
  ],
  recete: [
    {
      ad: 'Recete_Kalemleri',
      anahtar: 'kalemler',
      kolonlar: [
        { alan: 'sira_no', baslik: 'Sıra No', tur: 'tam_sayi' },
        { alan: 'bilesen_turu', baslik: 'Bileşen Türü' },
        { alan: 'ham_stok_id', baslik: 'Ham Stok UUID' },
        { alan: 'stok_kodu', baslik: 'Ham Stok Kodu' },
        { alan: 'referans_kodu', baslik: 'Referans Kodu' },
        { alan: 'hesaplama_birimi', baslik: 'Hesaplama Birimi' },
        { alan: 'miktar_katsayisi', baslik: 'Miktar Katsayısı', tur: 'sayi' },
        { alan: 'cevre_katsayisi', baslik: 'Çevre Katsayısı', tur: 'sayi' },
        { alan: 'fire_orani_override', baslik: 'Fire Override %', tur: 'sayi' },
        { alan: 'aciklama', baslik: 'Açıklama' },
      ],
    },
  ],
  vade: [
    {
      ad: 'Vade_Kademeleri',
      anahtar: 'kademeler',
      kolonlar: [
        { alan: 'sira_no', baslik: 'Sıra No', tur: 'tam_sayi' },
        { alan: 'gun_alt_siniri', baslik: 'Gün Alt Sınırı', tur: 'tam_sayi' },
        { alan: 'gun_ust_siniri', baslik: 'Gün Üst Sınırı', tur: 'tam_sayi' },
        { alan: 'vade_farki_yuzdesi', baslik: 'Vade Farkı %', tur: 'sayi' },
      ],
    },
  ],
}

function hucreDegeri(value: unknown): unknown {
  if (value == null) return null
  if (typeof value !== 'object') return value
  const nesne = value as Record<string, unknown>
  if ('result' in nesne) return nesne.result
  if (Array.isArray(nesne.richText)) {
    return nesne.richText
      .map((parca) => String((parca as Record<string, unknown>).text ?? ''))
      .join('')
  }
  if ('text' in nesne) return nesne.text
  return String(value)
}

function donustur(value: unknown, tur: HucreTuru = 'metin') {
  const ham = hucreDegeri(value)
  if (ham == null || String(ham).trim() === '') return null
  if (tur === 'boolean') {
    const metin = String(ham).trim().toLocaleLowerCase('tr-TR')
    return ['true', '1', 'evet', 'aktif', 'x'].includes(metin)
  }
  if (tur === 'sayi' || tur === 'tam_sayi') {
    const sayi = typeof ham === 'number'
      ? ham
      : Number(String(ham).trim().replace(',', '.'))
    if (!Number.isFinite(sayi)) throw new Error(`Sayısal hücre geçersiz: ${String(ham)}`)
    return tur === 'tam_sayi' ? Math.trunc(sayi) : sayi
  }
  return String(ham).trim()
}

function referanslarlaZenginlestir(
  satir: Record<string, unknown>,
  referanslar: TicariExcelReferanslar,
) {
  const sonuc = { ...satir }
  const stokId = String(satir.stok_id ?? satir.ham_stok_id ?? '')
  if (stokId) sonuc.stok_kodu = referanslar.stoklar.find((stok) => stok.id === stokId)?.kod ?? ''
  const kdvId = String(satir.kdv_grubu_id ?? '')
  if (kdvId) sonuc.kdv_kodu = referanslar.kdvGruplari.find((kdv) => kdv.id === kdvId)?.kod ?? ''
  return sonuc
}

export async function ticariTaslakExcelOlustur(
  tur: TicariTaslakTuru,
  kalemler: Record<string, Array<Record<string, unknown>>>,
  referanslar: TicariExcelReferanslar,
) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OrtaklarV2'
  workbook.created = new Date()

  for (const sayfa of ticariExcelSayfalari[tur]) {
    const worksheet = workbook.addWorksheet(sayfa.ad)
    worksheet.columns = sayfa.kolonlar.map((kolon) => ({
      header: kolon.baslik,
      key: kolon.alan,
      width: Math.max(14, kolon.baslik.length + 3),
    }))
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1D4ED8' },
    }
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sayfa.kolonlar.length },
    }
    for (const satir of kalemler[sayfa.anahtar] ?? []) {
      worksheet.addRow(referanslarlaZenginlestir(satir, referanslar))
    }
  }

  const stokSayfasi = workbook.addWorksheet('REF_Stoklar')
  stokSayfasi.columns = [
    { header: 'Stok UUID', key: 'id', width: 38 },
    { header: 'Stok Kodu', key: 'kod', width: 18 },
    { header: 'Stok Adı', key: 'ad', width: 42 },
  ]
  referanslar.stoklar.forEach((stok) => stokSayfasi.addRow(stok))
  stokSayfasi.state = 'hidden'

  const kdvSayfasi = workbook.addWorksheet('REF_KDV')
  kdvSayfasi.columns = [
    { header: 'KDV Grubu UUID', key: 'id', width: 38 },
    { header: 'KDV Kodu', key: 'kod', width: 18 },
    { header: 'KDV Adı', key: 'ad', width: 32 },
  ]
  referanslar.kdvGruplari.forEach((kdv) => kdvSayfasi.addRow(kdv))
  kdvSayfasi.state = 'hidden'

  return workbook.xlsx.writeBuffer()
}

export async function ticariTaslakExcelOku(
  tur: TicariTaslakTuru,
  veri: ArrayBuffer,
  referanslar: TicariExcelReferanslar,
) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(veri)
  const sonuc: Record<string, Array<Record<string, unknown>>> = {}

  for (const sayfa of ticariExcelSayfalari[tur]) {
    const worksheet = workbook.getWorksheet(sayfa.ad)
    if (!worksheet) throw new Error(`Excel sayfası eksik: ${sayfa.ad}`)
    const basliklar = new Map<string, number>()
    worksheet.getRow(1).eachCell((cell, kolonNo) => {
      basliklar.set(String(hucreDegeri(cell.value) ?? '').trim(), kolonNo)
    })
    for (const kolon of sayfa.kolonlar) {
      if (!basliklar.has(kolon.baslik)) {
        throw new Error(`${sayfa.ad} sayfasında kolon eksik: ${kolon.baslik}`)
      }
    }

    const satirlar: Array<Record<string, unknown>> = []
    for (let satirNo = 2; satirNo <= worksheet.rowCount; satirNo += 1) {
      const excelSatiri = worksheet.getRow(satirNo)
      const satir: Record<string, unknown> = {}
      let dolu = false
      for (const kolon of sayfa.kolonlar) {
        const kolonNo = basliklar.get(kolon.baslik)!
        const deger = donustur(excelSatiri.getCell(kolonNo).value, kolon.tur)
        satir[kolon.alan] = deger
        if (deger != null && deger !== '') dolu = true
      }
      if (!dolu) continue

      const stokKodu = String(satir.stok_kodu ?? '').trim()
      if (!satir.stok_id && stokKodu) {
        satir.stok_id = referanslar.stoklar.find((stok) => stok.kod === stokKodu)?.id ?? null
      }
      if (!satir.ham_stok_id && stokKodu) {
        satir.ham_stok_id = referanslar.stoklar.find((stok) => stok.kod === stokKodu)?.id ?? null
      }
      const kdvKodu = String(satir.kdv_kodu ?? '').trim()
      if (!satir.kdv_grubu_id && kdvKodu) {
        satir.kdv_grubu_id = referanslar.kdvGruplari.find((kdv) => kdv.kod === kdvKodu)?.id ?? null
      }
      delete satir.stok_kodu
      delete satir.kdv_kodu
      satirlar.push(satir)
    }
    sonuc[sayfa.anahtar] = satirlar
  }
  return sonuc
}

export async function ticariTaslakExcelIndir(
  dosyaAdi: string,
  tur: TicariTaslakTuru,
  kalemler: Record<string, Array<Record<string, unknown>>>,
  referanslar: TicariExcelReferanslar,
) {
  const buffer = await ticariTaslakExcelOlustur(tur, kalemler, referanslar)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const baglanti = document.createElement('a')
  baglanti.href = url
  baglanti.download = dosyaAdi.endsWith('.xlsx') ? dosyaAdi : `${dosyaAdi}.xlsx`
  baglanti.click()
  URL.revokeObjectURL(url)
}
