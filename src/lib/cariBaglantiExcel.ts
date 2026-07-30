import type {
  CariBaglantiFiyati,
  ParaBirimi,
} from '@/types/ticari'

const SABLON_KODU = 'glassflow-cari-cam-fiyatlari'
const SABLON_SURUMU = 1
const TALIMAT_SAYFASI = 'Talimat'
const FIYAT_SAYFASI = 'Cam Fiyatları'
const META_SAYFASI = '_GLASSFLOW_META'
const BASLIK_SATIRI = 6
const ILK_VERI_SATIRI = BASLIK_SATIRI + 1
const FIYAT_KOLONU = 8
const STOK_ID_KOLONU = 9

const kolonBasliklari = [
  'Kategori',
  'Stok Kodu',
  'Cam Adı',
  'Birim',
  'KDV Grubu',
  'Para Birimi',
  'Mevcut Fiyat',
  'Yeni Fiyat',
  'Stok ID',
] as const

const kategoriSirasi = [
  'DÜZCAM',
  'BUZLUCAM',
  'AYNA',
  'LOW-E',
  'KONFOR',
  'ISICAM',
  'ISICAM-S',
  'ISICAM-KONFOR',
  'ÜÇLÜ CAM',
] as const

const kategoriRenkleri = [
  'FFEFF6FF',
  'FFF0FDF4',
  'FFFFF7ED',
  'FFF5F3FF',
  'FFFFF1F2',
] as const

export interface CariBaglantiExcelBaglami {
  cari_id: string
  cari_adi: string
  para_birimi: ParaBirimi
  kaynak_fiyat_listesi_surumu_id: string | null
  fiyatlar: CariBaglantiFiyati[]
  kdv_gruplari: Array<{ id: string; kod: string; ad: string }>
}

export interface CariBaglantiExcelFiyatDegisikligi {
  stok_id: string
  birim_fiyat: number
}

function temizMetin(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') {
    const nesne = value as Record<string, unknown>
    if ('formula' in nesne || 'sharedFormula' in nesne) {
      throw new Error('Excel formülleri kabul edilmez. Yalnız sarı fiyat hücrelerine sayı girin.')
    }
    if (Array.isArray(nesne.richText)) {
      return nesne.richText
        .map((parca) => String((parca as Record<string, unknown>).text ?? ''))
        .join('')
        .trim()
    }
    if ('text' in nesne) return String(nesne.text ?? '').trim()
    if ('result' in nesne) return String(nesne.result ?? '').trim()
  }
  return String(value).trim()
}

function metinFiyatiniSayiyaCevir(value: unknown): number {
  const metin = temizMetin(value).replace(/\s/g, '')
  if (!/^-?\d[\d.,]*$/.test(metin)) return Number.NaN

  const sonVirgul = metin.lastIndexOf(',')
  const sonNokta = metin.lastIndexOf('.')
  if (sonVirgul !== -1 && sonNokta !== -1) {
    const ondalikIsareti = sonVirgul > sonNokta ? ',' : '.'
    const binlikIsareti = ondalikIsareti === ',' ? '.' : ','
    const parcalar = metin.split(ondalikIsareti)
    if (parcalar.length !== 2) return Number.NaN
    const tamKisim = parcalar[0]
    const ondalikKisim = parcalar[1]
    const binlikDeseni = new RegExp(`^-?\\d{1,3}(?:\\${binlikIsareti}\\d{3})*$`)
    if (!binlikDeseni.test(tamKisim) || !/^\d+$/.test(ondalikKisim)) return Number.NaN
    return Number(`${tamKisim.replaceAll(binlikIsareti, '')}.${ondalikKisim}`)
  }

  if (sonVirgul !== -1) {
    if ((metin.match(/,/g) ?? []).length !== 1) return Number.NaN
    return Number(metin.replace(',', '.'))
  }

  if (sonNokta !== -1 && /^-?\d{1,3}(?:\.\d{3})+$/.test(metin)) {
    return Number(metin.replaceAll('.', ''))
  }

  return Number(metin)
}

function fiyatDegeri(value: unknown, satirNo: number): number {
  if (value != null && typeof value === 'object') {
    const nesne = value as Record<string, unknown>
    if ('formula' in nesne || 'sharedFormula' in nesne) {
      throw new Error(`${satirNo}. satırdaki fiyat formül olamaz.`)
    }
    if ('result' in nesne) value = nesne.result
  }

  if (value == null || temizMetin(value) === '') {
    throw new Error(`${satirNo}. satırdaki yeni fiyat boş bırakılamaz.`)
  }

  const sayi = typeof value === 'number' ? value : metinFiyatiniSayiyaCevir(value)
  if (!Number.isFinite(sayi) || sayi < 0) {
    throw new Error(`${satirNo}. satırdaki yeni fiyat geçersiz. Sıfır veya pozitif bir sayı girin.`)
  }
  if (sayi >= 1_000_000_000_000) {
    throw new Error(`${satirNo}. satırdaki yeni fiyat izin verilen üst sınırı aşıyor.`)
  }
  const olcekli = sayi * 1_000_000
  const yuvarlanmisOlcekli = Math.round(olcekli)
  const kayanNoktaToleransi = Number.EPSILON * Math.max(1, Math.abs(olcekli)) * 8
  if (Math.abs(olcekli - yuvarlanmisOlcekli) > kayanNoktaToleransi) {
    throw new Error(`${satirNo}. satırdaki yeni fiyat en fazla 6 ondalık hane içerebilir.`)
  }
  return yuvarlanmisOlcekli / 1_000_000
}

function sayisalDeger(value: unknown): number | null {
  if (value == null || temizMetin(value) === '') return null
  const sayi = typeof value === 'number'
    ? value
    : Number(temizMetin(value).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(sayi) ? sayi : null
}

function ayniFiyat(sol: number | null, sag: number | null) {
  if (sol == null || sag == null) return sol == null && sag == null
  return Math.abs(sol - sag) < 0.000001
}

export function cariCamKategorisi(
  fiyat: Pick<CariBaglantiFiyati, 'stok_grubu'>,
) {
  const grup = fiyat.stok_grubu?.trim()
  return grup || 'DİĞER CAMLAR'
}

function kategoriKarsilastir(sol: string, sag: string) {
  const solSirasi = kategoriSirasi.indexOf(sol as typeof kategoriSirasi[number])
  const sagSirasi = kategoriSirasi.indexOf(sag as typeof kategoriSirasi[number])
  if (solSirasi !== -1 || sagSirasi !== -1) {
    if (solSirasi === -1) return 1
    if (sagSirasi === -1) return -1
    if (solSirasi !== sagSirasi) return solSirasi - sagSirasi
  }
  return sol.localeCompare(sag, 'tr')
}

export function cariCamFiyatlariniSirala(fiyatlar: CariBaglantiFiyati[]) {
  return [...fiyatlar].sort((sol, sag) => {
    const kategoriFarki = kategoriKarsilastir(
      cariCamKategorisi(sol),
      cariCamKategorisi(sag),
    )
    if (kategoriFarki !== 0) return kategoriFarki
    const kodFarki = sol.stok_kodu.localeCompare(sag.stok_kodu, 'tr', { numeric: true })
    return kodFarki || sol.stok_adi.localeCompare(sag.stok_adi, 'tr')
  })
}

function kdvEtiketi(
  fiyat: CariBaglantiFiyati,
  kdvGruplari: CariBaglantiExcelBaglami['kdv_gruplari'],
) {
  if (!fiyat.kdv_grubu_id) return 'Eksik'
  const grup = kdvGruplari.find((secenek) => secenek.id === fiyat.kdv_grubu_id)
  return grup ? `${grup.kod} · ${grup.ad}` : 'Tanımsız KDV grubu'
}

function kategoriRengi(kategori: string) {
  let toplam = 0
  for (const karakter of kategori) toplam += karakter.charCodeAt(0)
  return kategoriRenkleri[toplam % kategoriRenkleri.length]
}

function metaDegeri(meta: { getCell: (adres: string) => { value: unknown } }, adres: string) {
  return temizMetin(meta.getCell(adres).value)
}

export async function cariBaglantiExcelOlustur(baglam: CariBaglantiExcelBaglami) {
  if (baglam.fiyatlar.length === 0) {
    throw new Error('Excel şablonu oluşturulacak cam bulunamadı.')
  }

  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GlassFlow'
  workbook.company = 'Ortaklar Cam'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.subject = `${baglam.cari_adi} müşteri cam fiyatları`
  workbook.title = 'Müşteri Cam Fiyatları'

  const talimat = workbook.addWorksheet(TALIMAT_SAYFASI, {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: 'FF2563EB' } },
  })
  talimat.mergeCells('A1:E1')
  talimat.getCell('A1').value = 'GlassFlow · Müşteri Cam Fiyat Şablonu'
  talimat.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 }
  talimat.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  talimat.getCell('A1').alignment = { vertical: 'middle' }
  talimat.getRow(1).height = 34
  talimat.getColumn('A').width = 4
  talimat.getColumn('B').width = 24
  talimat.getColumn('C').width = 26
  talimat.getColumn('D').width = 26
  talimat.getColumn('E').width = 22
  talimat.getCell('B3').value = 'Müşteri'
  talimat.getCell('C3').value = baglam.cari_adi
  talimat.getCell('B4').value = 'Para birimi'
  talimat.getCell('C4').value = baglam.para_birimi
  talimat.getCell('B5').value = 'Cam sayısı'
  talimat.getCell('C5').value = baglam.fiyatlar.length
  for (const satirNo of [3, 4, 5]) {
    talimat.getCell(`B${satirNo}`).font = { bold: true, color: { argb: 'FF475569' } }
    talimat.getCell(`C${satirNo}`).font = { bold: true, color: { argb: 'FF0F172A' } }
  }
  const adimlar = [
    ['1', 'Cam Fiyatları sayfasını açın.', 'Tüm aktif ve satışa açık camlar kategori sırasıyla hazır gelir.'],
    ['2', 'Yalnız sarı “Yeni Fiyat” hücrelerini düzenleyin.', 'Kod, ad, kategori, KDV ve para birimi bağlantının güvenilir verileridir.'],
    ['3', 'Dosyayı .xlsx biçiminde kaydedin.', 'Satır eklemeyin, silmeyin veya başka müşterinin şablonunu kullanmayın.'],
    ['4', 'GlassFlow’da “Excel yükle” ile dosyayı seçin.', 'Yükleme yalnız fiyatları forma aktarır; bağlantı siz onaylamadan kaydedilmez.'],
  ]
  adimlar.forEach(([no, baslik, aciklama], index) => {
    const satirNo = 8 + index * 2
    talimat.getCell(`B${satirNo}`).value = no
    talimat.getCell(`B${satirNo}`).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    talimat.getCell(`B${satirNo}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    talimat.getCell(`B${satirNo}`).alignment = { horizontal: 'center', vertical: 'middle' }
    talimat.getCell(`C${satirNo}`).value = baslik
    talimat.getCell(`C${satirNo}`).font = { bold: true, color: { argb: 'FF0F172A' } }
    talimat.mergeCells(`C${satirNo}:E${satirNo}`)
    talimat.getCell(`C${satirNo + 1}`).value = aciklama
    talimat.getCell(`C${satirNo + 1}`).font = { color: { argb: 'FF64748B' }, size: 10 }
    talimat.getCell(`C${satirNo + 1}`).alignment = { wrapText: true, vertical: 'top' }
    talimat.mergeCells(`C${satirNo + 1}:E${satirNo + 1}`)
  })
  await talimat.protect('GlassFlow', {
    spinCount: 1_000,
    selectLockedCells: true,
    selectUnlockedCells: true,
  })

  const fiyatSayfasi = workbook.addWorksheet(FIYAT_SAYFASI, {
    views: [{ state: 'frozen', ySplit: BASLIK_SATIRI, showGridLines: false }],
    properties: { tabColor: { argb: 'FF0F766E' } },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })
  fiyatSayfasi.mergeCells('A1:H1')
  fiyatSayfasi.getCell('A1').value = `${baglam.cari_adi} · Cam Fiyatları`
  fiyatSayfasi.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 }
  fiyatSayfasi.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  fiyatSayfasi.getCell('A1').alignment = { vertical: 'middle' }
  fiyatSayfasi.getRow(1).height = 32
  fiyatSayfasi.mergeCells('A2:H2')
  fiyatSayfasi.getCell('A2').value = `Para birimi: ${baglam.para_birimi} · Fiyatlar KDV hariç m² fiyatıdır.`
  fiyatSayfasi.getCell('A2').font = { color: { argb: 'FF475569' }, size: 10 }
  fiyatSayfasi.mergeCells('A3:H3')
  fiyatSayfasi.getCell('A3').value = 'Yalnız sarı “Yeni Fiyat” hücrelerini değiştirin. Diğer alanlar bağlantı güvenliği için kilitlidir.'
  fiyatSayfasi.getCell('A3').font = { bold: true, color: { argb: 'FF92400E' }, size: 10 }
  fiyatSayfasi.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
  fiyatSayfasi.mergeCells('A4:H4')
  const kategoriler = new Set(baglam.fiyatlar.map(cariCamKategorisi))
  fiyatSayfasi.getCell('A4').value = `${baglam.fiyatlar.length} cam · ${kategoriler.size} kategori · Şablon sürümü ${SABLON_SURUMU}`
  fiyatSayfasi.getCell('A4').font = { color: { argb: 'FF64748B' }, size: 10 }

  const genislikler = [20, 16, 44, 11, 24, 14, 18, 18, 38]
  genislikler.forEach((genislik, index) => {
    fiyatSayfasi.getColumn(index + 1).width = genislik
  })
  fiyatSayfasi.getColumn(STOK_ID_KOLONU).hidden = true
  const baslikSatiri = fiyatSayfasi.getRow(BASLIK_SATIRI)
  baslikSatiri.values = [...kolonBasliklari]
  baslikSatiri.height = 26
  baslikSatiri.eachCell((hucre) => {
    hucre.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    hucre.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
    hucre.alignment = { vertical: 'middle' }
    hucre.border = { bottom: { style: 'medium', color: { argb: 'FF1E293B' } } }
  })

  const siraliFiyatlar = cariCamFiyatlariniSirala(baglam.fiyatlar)
  let oncekiKategori = ''
  siraliFiyatlar.forEach((fiyat, index) => {
    const satirNo = ILK_VERI_SATIRI + index
    const kategori = cariCamKategorisi(fiyat)
    const satir = fiyatSayfasi.getRow(satirNo)
    satir.values = [
      kategori,
      fiyat.stok_kodu,
      fiyat.stok_adi,
      'm²',
      kdvEtiketi(fiyat, baglam.kdv_gruplari),
      baglam.para_birimi,
      fiyat.birim_fiyat,
      fiyat.birim_fiyat,
      fiyat.stok_id,
    ]
    satir.height = 23
    satir.eachCell({ includeEmpty: true }, (hucre, kolonNo) => {
      hucre.font = { color: { argb: 'FF334155' }, size: 10 }
      hucre.alignment = {
        vertical: 'middle',
        horizontal: kolonNo >= 7 && kolonNo <= 8 ? 'right' : 'left',
      }
      hucre.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } }
      hucre.protection = { locked: true }
    })
    satir.getCell(1).font = { bold: true, color: { argb: 'FF334155' }, size: 10 }
    satir.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: kategoriRengi(kategori) },
    }
    satir.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }
    satir.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' }
    satir.getCell(7).numFmt = '#,##0.00####'
    satir.getCell(FIYAT_KOLONU).numFmt = '#,##0.00####'
    satir.getCell(FIYAT_KOLONU).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF2CC' },
    }
    satir.getCell(FIYAT_KOLONU).font = { bold: true, color: { argb: 'FF78350F' }, size: 10 }
    satir.getCell(FIYAT_KOLONU).protection = { locked: false }
    satir.getCell(FIYAT_KOLONU).dataValidation = {
      type: 'decimal',
      operator: 'between',
      allowBlank: false,
      formulae: [0, 999_999_999_999],
      showErrorMessage: true,
      errorTitle: 'Geçersiz fiyat',
      error: 'Sıfır veya pozitif sayısal bir fiyat girin.',
      showInputMessage: true,
      promptTitle: 'Yeni fiyat',
      prompt: `${baglam.para_birimi} cinsinden KDV hariç m² fiyatını girin.`,
    }
    if (kategori !== oncekiKategori) {
      satir.eachCell({ includeEmpty: true }, (hucre) => {
        hucre.border = {
          ...hucre.border,
          top: { style: 'medium', color: { argb: 'FF94A3B8' } },
        }
      })
      oncekiKategori = kategori
    }
  })

  const sonSatir = ILK_VERI_SATIRI + siraliFiyatlar.length - 1
  fiyatSayfasi.autoFilter = {
    from: { row: BASLIK_SATIRI, column: 1 },
    // Gizli stok kimliği de sıralama aralığında kalmalı; aksi halde Excel'de
    // sıralama yapıldığında görünen satır ile güvenilir kimlik birbirinden kopar.
    to: { row: sonSatir, column: STOK_ID_KOLONU },
  }
  fiyatSayfasi.pageSetup.printTitlesRow = `1:${BASLIK_SATIRI}`
  fiyatSayfasi.pageSetup.printArea = `A1:H${sonSatir}`
  await fiyatSayfasi.protect('GlassFlow', {
    spinCount: 1_000,
    selectLockedCells: false,
    selectUnlockedCells: true,
    autoFilter: true,
    sort: true,
  })

  const meta = workbook.addWorksheet(META_SAYFASI, {
    views: [{ showGridLines: false }],
  })
  meta.state = 'veryHidden'
  meta.getCell('A1').value = 'sablon_kodu'
  meta.getCell('B1').value = SABLON_KODU
  meta.getCell('A2').value = 'sablon_surumu'
  meta.getCell('B2').value = SABLON_SURUMU
  meta.getCell('A3').value = 'cari_id'
  meta.getCell('B3').value = baglam.cari_id
  meta.getCell('A4').value = 'para_birimi'
  meta.getCell('B4').value = baglam.para_birimi
  meta.getCell('A5').value = 'kaynak_fiyat_listesi_surumu_id'
  meta.getCell('B5').value = baglam.kaynak_fiyat_listesi_surumu_id ?? ''
  meta.getCell('A6').value = 'beklenen_satir_sayisi'
  meta.getCell('B6').value = baglam.fiyatlar.length
  meta.getCell('A7').value = 'fiyat_sayfasi'
  meta.getCell('B7').value = FIYAT_SAYFASI
  await meta.protect('GlassFlow', {
    spinCount: 1_000,
    selectLockedCells: false,
    selectUnlockedCells: false,
  })

  return workbook.xlsx.writeBuffer()
}

export async function cariBaglantiExcelOku(
  veri: ArrayBuffer,
  baglam: CariBaglantiExcelBaglami,
): Promise<CariBaglantiExcelFiyatDegisikligi[]> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(veri)
  } catch {
    throw new Error('Excel dosyası açılamadı. GlassFlow’dan indirilen .xlsx şablonunu kullanın.')
  }

  const meta = workbook.getWorksheet(META_SAYFASI)
  const fiyatSayfasi = workbook.getWorksheet(FIYAT_SAYFASI)
  if (!meta || !fiyatSayfasi) {
    throw new Error('Bu dosya GlassFlow müşteri cam fiyat şablonu değil.')
  }
  if (metaDegeri(meta, 'B1') !== SABLON_KODU || Number(metaDegeri(meta, 'B2')) !== SABLON_SURUMU) {
    throw new Error('Excel şablon sürümü uyumsuz. Güncel şablonu yeniden indirin.')
  }
  if (metaDegeri(meta, 'B3') !== baglam.cari_id) {
    throw new Error('Bu Excel başka bir müşteriye ait. Seçili müşteri için yeni şablon indirin.')
  }
  if (metaDegeri(meta, 'B4') !== baglam.para_birimi) {
    throw new Error(`Excel para birimi ${baglam.para_birimi} ile uyuşmuyor. Şablonu yeniden indirin.`)
  }
  if (metaDegeri(meta, 'B5') !== (baglam.kaynak_fiyat_listesi_surumu_id ?? '')) {
    throw new Error('Müşterinin fiyat kaynağı değişmiş. Güncel şablonu yeniden indirin.')
  }
  if (Number(metaDegeri(meta, 'B6')) !== baglam.fiyatlar.length) {
    throw new Error('Cam kataloğu şablon indirildikten sonra değişmiş. Güncel şablonu yeniden indirin.')
  }

  kolonBasliklari.forEach((baslik, index) => {
    const bulunan = temizMetin(fiyatSayfasi.getRow(BASLIK_SATIRI).getCell(index + 1).value)
    if (bulunan !== baslik) {
      throw new Error(`Excel kolon yapısı değişmiş: “${baslik}” kolonu bulunamadı.`)
    }
  })

  const beklenenler = new Map(baglam.fiyatlar.map((fiyat) => [fiyat.stok_id, fiyat]))
  const aktarılanlar = new Map<string, number>()
  for (let satirNo = ILK_VERI_SATIRI; satirNo <= fiyatSayfasi.rowCount; satirNo += 1) {
    const satir = fiyatSayfasi.getRow(satirNo)
    const stokId = temizMetin(satir.getCell(STOK_ID_KOLONU).value)
    const satirBos = kolonBasliklari.every((_, index) => temizMetin(satir.getCell(index + 1).value) === '')
    if (satirBos) continue
    if (!stokId) throw new Error(`${satirNo}. satırın stok kimliği eksik. Güncel şablonu yeniden indirin.`)
    if (aktarılanlar.has(stokId)) throw new Error(`${satirNo}. satırdaki cam Excel’de birden fazla kez yer alıyor.`)
    const beklenen = beklenenler.get(stokId)
    if (!beklenen) throw new Error(`${satirNo}. satırda seçili müşterinin güncel kataloğunda olmayan bir cam var.`)

    const kilitliAlanlar = [
      [1, cariCamKategorisi(beklenen), 'kategori'],
      [2, beklenen.stok_kodu, 'stok kodu'],
      [3, beklenen.stok_adi, 'cam adı'],
      [4, 'm²', 'birim'],
      [5, kdvEtiketi(beklenen, baglam.kdv_gruplari), 'KDV grubu'],
      [6, baglam.para_birimi, 'para birimi'],
    ] as const
    for (const [kolonNo, beklenenDeger, alan] of kilitliAlanlar) {
      if (temizMetin(satir.getCell(kolonNo).value) !== beklenenDeger) {
        throw new Error(`${satirNo}. satırdaki ${alan} değiştirilmiş. Yalnız “Yeni Fiyat” alanını düzenleyin.`)
      }
    }
    if (!ayniFiyat(sayisalDeger(satir.getCell(7).value), beklenen.birim_fiyat)) {
      throw new Error(`${satirNo}. satırdaki mevcut fiyat değiştirilmiş. Yalnız “Yeni Fiyat” alanını düzenleyin.`)
    }
    aktarılanlar.set(stokId, fiyatDegeri(satir.getCell(FIYAT_KOLONU).value, satirNo))
  }

  const eksikler = baglam.fiyatlar.filter((fiyat) => !aktarılanlar.has(fiyat.stok_id))
  if (eksikler.length > 0 || aktarılanlar.size !== baglam.fiyatlar.length) {
    const ornek = eksikler.slice(0, 3).map((fiyat) => fiyat.stok_kodu).join(', ')
    throw new Error(`Excel tüm camları içermiyor${ornek ? `: ${ornek}` : ''}. Güncel şablonu yeniden indirin.`)
  }

  return baglam.fiyatlar.map((fiyat) => ({
    stok_id: fiyat.stok_id,
    birim_fiyat: aktarılanlar.get(fiyat.stok_id)!,
  }))
}

export async function cariBaglantiExcelIndir(
  baglam: CariBaglantiExcelBaglami,
  dosyaAdi: string,
) {
  const buffer = await cariBaglantiExcelOlustur(baglam)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const baglanti = document.createElement('a')
  baglanti.href = url
  baglanti.download = dosyaAdi.toLocaleLowerCase('tr-TR').endsWith('.xlsx')
    ? dosyaAdi
    : `${dosyaAdi}.xlsx`
  document.body.appendChild(baglanti)
  baglanti.click()
  baglanti.remove()
  URL.revokeObjectURL(url)
}
