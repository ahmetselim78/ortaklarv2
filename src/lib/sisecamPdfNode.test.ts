import { describe, expect, it } from 'vitest'
import { sisecamPdfMetniniOku } from '@/lib/sisecamFiyatListesi'

function basitPdfOlustur() {
  const akis = 'BT\n/F1 12 Tf\n72 720 Td\n(SISECAM TEST) Tj\nET\n'
  const nesneler = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${akis.length} >>\nstream\n${akis}endstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const konumlar = [0]
  nesneler.forEach((nesne, index) => {
    konumlar.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${nesne}\nendobj\n`
  })
  const xrefKonumu = pdf.length
  pdf += `xref\n0 ${nesneler.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  pdf += konumlar
    .slice(1)
    .map((konum) => `${String(konum).padStart(10, '0')} 00000 n \n`)
    .join('')
  pdf += `trailer\n<< /Size ${nesneler.length + 1} /Root 1 0 R >>\n`
  pdf += `startxref\n${xrefKonumu}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

describe('Sisecam PDF Node uyumlulugu', () => {
  it('DOMMatrix olmayan ortamda legacy PDF motoruyla metni okur', async () => {
    const metin = await sisecamPdfMetniniOku(
      new File([basitPdfOlustur()], 'sisecam-test.pdf', { type: 'application/pdf' }),
    )

    expect(metin).toContain('SISECAM TEST')
  })
})
