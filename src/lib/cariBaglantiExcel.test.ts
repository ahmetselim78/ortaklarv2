import { describe, expect, it } from 'vitest'
import {
  cariBaglantiExcelOku,
  cariBaglantiExcelOlustur,
  cariCamFiyatlariniSirala,
  type CariBaglantiExcelBaglami,
} from './cariBaglantiExcel'

const baglam: CariBaglantiExcelBaglami = {
  cari_id: '00000000-0000-4000-8000-000000000001',
  cari_adi: 'Örnek Müşteri',
  para_birimi: 'TRY',
  kaynak_fiyat_listesi_surumu_id: '00000000-0000-4000-8000-000000000099',
  kdv_gruplari: [{
    id: '00000000-0000-4000-8000-000000000020',
    kod: 'KDV20',
    ad: 'KDV %20',
  }],
  fiyatlar: [
    {
      stok_id: '00000000-0000-4000-8000-000000000013',
      stok_kodu: 'UC-01',
      stok_adi: '4+12+4+12+4 Üçlü Cam',
      stok_grubu: 'ÜÇLÜ CAM',
      birim_fiyat: 420.25,
      kdv_grubu_id: '00000000-0000-4000-8000-000000000020',
      minimum_m2: 0.25,
      en_adimi_mm: 10,
      boy_adimi_mm: 10,
    },
    {
      stok_id: '00000000-0000-4000-8000-000000000011',
      stok_kodu: 'ISI-02',
      stok_adi: '4+16+4 Isıcam',
      stok_grubu: 'ISICAM',
      birim_fiyat: 125.5,
      kdv_grubu_id: '00000000-0000-4000-8000-000000000020',
      minimum_m2: null,
      en_adimi_mm: null,
      boy_adimi_mm: null,
    },
    {
      stok_id: '00000000-0000-4000-8000-000000000012',
      stok_kodu: 'KON-01',
      stok_adi: '4+16+4 Isıcam Konfor',
      stok_grubu: 'ISICAM-KONFOR',
      birim_fiyat: 210,
      kdv_grubu_id: '00000000-0000-4000-8000-000000000020',
      minimum_m2: null,
      en_adimi_mm: null,
      boy_adimi_mm: null,
    },
    {
      stok_id: '00000000-0000-4000-8000-000000000014',
      stok_kodu: 'DIG-01',
      stok_adi: 'Özel Cam',
      stok_grubu: null,
      birim_fiyat: 99,
      kdv_grubu_id: '00000000-0000-4000-8000-000000000020',
      minimum_m2: null,
      en_adimi_mm: null,
      boy_adimi_mm: null,
    },
  ],
}

function arrayBuffer(value: unknown) {
  const bytes = Buffer.from(value as Uint8Array)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

async function workbookOlustur() {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const dosya = await cariBaglantiExcelOlustur(baglam)
  await workbook.xlsx.load(Buffer.from(dosya as Uint8Array))
  return workbook
}

describe('cari bağlantı cam fiyat Excel sözleşmesi', () => {
  it('tüm camları kategori sırasıyla getirir ve yalnız yeni fiyat hücrelerini açık bırakır', async () => {
    const workbook = await workbookOlustur()
    const fiyatSayfasi = workbook.getWorksheet('Cam Fiyatları')!
    const meta = workbook.getWorksheet('_GLASSFLOW_META')!
    const sirali = cariCamFiyatlariniSirala(baglam.fiyatlar)

    expect(workbook.getWorksheet('Talimat')).toBeDefined()
    expect(meta.state).toBe('veryHidden')
    expect(meta.getCell('B3').value).toBe(baglam.cari_id)
    expect(meta.getCell('B4').value).toBe('TRY')
    expect(meta.getCell('B6').value).toBe(baglam.fiyatlar.length)
    expect(fiyatSayfasi.getColumn(9).hidden).toBe(true)
    expect(fiyatSayfasi.views[0]).toMatchObject({ state: 'frozen', ySplit: 6 })
    expect(fiyatSayfasi.autoFilter).toBe('A6:I10')

    sirali.forEach((fiyat, index) => {
      const satir = fiyatSayfasi.getRow(7 + index)
      expect(satir.getCell(2).value).toBe(fiyat.stok_kodu)
      expect(satir.getCell(3).value).toBe(fiyat.stok_adi)
      expect(satir.getCell(7).value).toBe(fiyat.birim_fiyat)
      expect(satir.getCell(8).value).toBe(fiyat.birim_fiyat)
      expect(satir.getCell(9).value).toBe(fiyat.stok_id)
      expect(satir.getCell(1).protection?.locked ?? true).toBe(true)
      expect(satir.getCell(7).protection?.locked ?? true).toBe(true)
      expect(satir.getCell(8).protection.locked).toBe(false)
    })
  })

  it('Türkçe ondalık fiyatları stok kimliğiyle kayıpsız okur ve diğer kuralları Excel’den almaz', async () => {
    const workbook = await workbookOlustur()
    const fiyatSayfasi = workbook.getWorksheet('Cam Fiyatları')!
    for (let satirNo = 7; satirNo <= fiyatSayfasi.rowCount; satirNo += 1) {
      const stokId = String(fiyatSayfasi.getRow(satirNo).getCell(9).value)
      fiyatSayfasi.getRow(satirNo).getCell(8).value = stokId.endsWith('11') ? '145,75' : 300
    }
    const dosya = await workbook.xlsx.writeBuffer()

    await expect(cariBaglantiExcelOku(arrayBuffer(dosya), baglam)).resolves.toEqual(
      baglam.fiyatlar.map((fiyat) => ({
        stok_id: fiyat.stok_id,
        birim_fiyat: fiyat.stok_id.endsWith('11') ? 145.75 : 300,
      })),
    )
  })

  it('Türkçe ve İngilizce binlik/ondalık ayraçlı metin fiyatlarını açık biçimde okur', async () => {
    const workbook = await workbookOlustur()
    const fiyatSayfasi = workbook.getWorksheet('Cam Fiyatları')!
    const metinler = ['1.234,56', '1,234.56', '1.234', '12,345678']
    const beklenenFiyatlar = new Map<string, number>()
    const sayisalDegerler = [1234.56, 1234.56, 1234, 12.345678]
    for (let index = 0; index < metinler.length; index += 1) {
      const satir = fiyatSayfasi.getRow(7 + index)
      satir.getCell(8).value = metinler[index]
      beklenenFiyatlar.set(String(satir.getCell(9).value), sayisalDegerler[index])
    }

    await expect(cariBaglantiExcelOku(
      arrayBuffer(await workbook.xlsx.writeBuffer()),
      baglam,
    )).resolves.toEqual(baglam.fiyatlar.map((fiyat) => ({
      stok_id: fiyat.stok_id,
      birim_fiyat: beklenenFiyatlar.get(fiyat.stok_id),
    })))
  })

  it('başka müşteri veya para birimine ait şablonu reddeder', async () => {
    const dosya = await cariBaglantiExcelOlustur(baglam)
    await expect(cariBaglantiExcelOku(arrayBuffer(dosya), {
      ...baglam,
      cari_id: '00000000-0000-4000-8000-000000000777',
    })).rejects.toThrow('başka bir müşteriye ait')
    await expect(cariBaglantiExcelOku(arrayBuffer(dosya), {
      ...baglam,
      para_birimi: 'EUR',
    })).rejects.toThrow('para birimi')
  })

  it('kilitli alan değişikliğini, eksik ve mükerrer cam satırlarını reddeder', async () => {
    const degisenWorkbook = await workbookOlustur()
    degisenWorkbook.getWorksheet('Cam Fiyatları')!.getCell('C7').value = 'Değiştirilen cam'
    await expect(cariBaglantiExcelOku(
      arrayBuffer(await degisenWorkbook.xlsx.writeBuffer()),
      baglam,
    )).rejects.toThrow('cam adı değiştirilmiş')

    const eksikWorkbook = await workbookOlustur()
    eksikWorkbook.getWorksheet('Cam Fiyatları')!.spliceRows(7, 1)
    await expect(cariBaglantiExcelOku(
      arrayBuffer(await eksikWorkbook.xlsx.writeBuffer()),
      baglam,
    )).rejects.toThrow('tüm camları içermiyor')

    const tekrarWorkbook = await workbookOlustur()
    const tekrarSayfasi = tekrarWorkbook.getWorksheet('Cam Fiyatları')!
    tekrarSayfasi.getRow(8).getCell(9).value = tekrarSayfasi.getRow(7).getCell(9).value
    await expect(cariBaglantiExcelOku(
      arrayBuffer(await tekrarWorkbook.xlsx.writeBuffer()),
      baglam,
    )).rejects.toThrow('birden fazla kez')
  })

  it('boş, negatif veya formüllü yeni fiyatı reddeder', async () => {
    const bosWorkbook = await workbookOlustur()
    bosWorkbook.getWorksheet('Cam Fiyatları')!.getCell('H7').value = null
    await expect(cariBaglantiExcelOku(
      arrayBuffer(await bosWorkbook.xlsx.writeBuffer()),
      baglam,
    )).rejects.toThrow('boş bırakılamaz')

    const negatifWorkbook = await workbookOlustur()
    negatifWorkbook.getWorksheet('Cam Fiyatları')!.getCell('H7').value = -1
    await expect(cariBaglantiExcelOku(
      arrayBuffer(await negatifWorkbook.xlsx.writeBuffer()),
      baglam,
    )).rejects.toThrow('geçersiz')

    const formulWorkbook = await workbookOlustur()
    formulWorkbook.getWorksheet('Cam Fiyatları')!.getCell('H7').value = {
      formula: '=1+1',
      result: 2,
    }
    await expect(cariBaglantiExcelOku(
      arrayBuffer(await formulWorkbook.xlsx.writeBuffer()),
      baglam,
    )).rejects.toThrow('formül olamaz')
  })

  it('altı ondalık haneyi aşan küçük farkları sessizce yuvarlamaz', async () => {
    const cokKucukWorkbook = await workbookOlustur()
    cokKucukWorkbook.getWorksheet('Cam Fiyatları')!.getCell('H7').value = 0.0000000009
    await expect(cariBaglantiExcelOku(
      arrayBuffer(await cokKucukWorkbook.xlsx.writeBuffer()),
      baglam,
    )).rejects.toThrow('en fazla 6 ondalık')

    const yediHaneWorkbook = await workbookOlustur()
    yediHaneWorkbook.getWorksheet('Cam Fiyatları')!.getCell('H7').value = 1.0000001
    await expect(cariBaglantiExcelOku(
      arrayBuffer(await yediHaneWorkbook.xlsx.writeBuffer()),
      baglam,
    )).rejects.toThrow('en fazla 6 ondalık')
  })
})
