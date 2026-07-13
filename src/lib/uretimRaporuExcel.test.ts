import { afterEach, describe, expect, it, vi } from 'vitest'
import { xlsxIndir } from '@/pages/AdminPage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Üretim raporu Excel aktarımı', () => {
  it('operatör bazlı dosyayı gerçek .xlsx olarak ve saat sütunuyla üretir', async () => {
    let indirilenBlob: Blob | null = null
    let indirilenDosyaAdi = ''
    const baglanti = {
      href: '',
      download: '',
      click() { indirilenDosyaAdi = this.download },
    }

    vi.stubGlobal('document', {
      createElement: () => baglanti,
    })
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      indirilenBlob = blob
      return 'blob:test-xlsx'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    const gunler: Parameters<typeof xlsxIndir>[0] = [{
      tarih: '2026-07-13',
      kayitlar: [{
        id: 'rapor-1',
        tarih: '2026-07-13',
        toplam_personel: 12,
        notlar: 'Uzun vardiya notu',
        created_at: '2026-07-13T08:15:00+03:00',
        updated_at: '2026-07-13T08:20:00+03:00',
        operator: { ad_soyad: 'Ayşe Kaya' },
        istasyon_kayitlari: [{
          id: 'istasyon-kaydi-1',
          adet: 125,
          fire_adet: 2,
          istasyon: { ad: 'Kesim', sira_no: 1 },
        }],
        arac_yuklemeleri: [{
          id: 'arac-kaydi-1',
          adet: 40,
          dis_arac_plakasi: null,
          dis_arac_adi: null,
          arac: { plaka: '34 ABC 123', ad: 'Kamyon' },
        }],
      }],
    }]

    await xlsxIndir(gunler, [{ ad: 'Kesim', sira: 1 }], 'ayri', '2026-07-13', '2026-07-13')

    expect(indirilenDosyaAdi).toBe('uretim_giris_2026-07-13_2026-07-13_ayri.xlsx')
    expect(indirilenBlob).not.toBeNull()
    expect(indirilenBlob!.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await indirilenBlob!.arrayBuffer()))
    const worksheet = workbook.getWorksheet('Operatör Girişleri')

    expect(worksheet).toBeDefined()
    expect(worksheet!.getCell('A1').value).toBe('Tarih')
    expect(worksheet!.getCell('B1').value).toBe('Saat')
    expect(worksheet!.getCell('C1').value).toBe('Operatör')
    expect(worksheet!.getCell('B2').value).toBeInstanceOf(Date)
    expect((worksheet!.getCell('B2').value as Date).getUTCHours()).toBe(8)
    expect((worksheet!.getCell('B2').value as Date).getUTCMinutes()).toBe(15)
    expect(worksheet!.getColumn(2).numFmt).toBe('hh:mm')
    expect(worksheet!.getCell('C2').value).toBe('Ayşe Kaya')
    expect(worksheet!.getCell('F2').value).toBe(125)
    expect(worksheet!.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
  })
})
