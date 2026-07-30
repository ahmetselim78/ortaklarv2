import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ticariPanel = readFileSync(
  join(process.cwd(), 'src', 'components', 'admin', 'StokCariMaliyetPaneli.tsx'),
  'utf8',
)
const veriPaneli = readFileSync(
  join(process.cwd(), 'src', 'components', 'admin', 'VeriYonetimiPanel.tsx'),
  'utf8',
)
const tedarikciPaneli = readFileSync(
  join(process.cwd(), 'src', 'components', 'admin', 'TedarikciKritikYonetimPaneli.tsx'),
  'utf8',
)
const cariTedarikciPaneli = readFileSync(
  join(process.cwd(), 'src', 'components', 'cari', 'TedarikciCalismaPaneli.tsx'),
  'utf8',
)
const adminSayfasi = readFileSync(
  join(process.cwd(), 'src', 'pages', 'AdminPage.tsx'),
  'utf8',
)
const fiyatSekmesi = readFileSync(
  join(
    process.cwd(),
    'src',
    'components',
    'admin',
    'MaliyetFiyatYonetimiSekmesi.tsx',
  ),
  'utf8',
)

describe('admin maliyet alış fiyatı yönetimi', () => {
  it('kritik stok, cari ve maliyet işlemlerini ayrı admin katmanında toplar', () => {
    expect(adminSayfasi).toContain("to: '/admin/stok-cari-maliyet'")
    expect(adminSayfasi).toContain('<StokCariMaliyetPaneli />')
    expect(ticariPanel).toContain("'maliyet-fiyatlari'")
    expect(ticariPanel).toContain('Maliyet Alış Fiyatları')
    expect(ticariPanel).toContain('<MaliyetFiyatYonetimiSekmesi />')
    expect(ticariPanel).toContain('<TicariKatalogPaneli />')
    expect(ticariPanel).toContain('<StokBakimPaneli />')
  })

  it('ticari ve stok ayarlarını Veri Yönetimi bölümünde göstermez', () => {
    expect(veriPaneli).not.toContain("'maliyet-fiyatlari'")
    expect(veriPaneli).not.toContain("'ticari-katalog'")
    expect(veriPaneli).not.toContain("'stok-bakimi'")
    expect(veriPaneli).not.toContain('MaliyetFiyatYonetimiSekmesi')
    expect(veriPaneli).not.toContain('TicariKatalogPaneli')
    expect(veriPaneli).not.toContain('StokBakimPaneli')
  })

  it('tedarikçi pasifleştirmeyi yalnız admin kritik yönetim panelinde sunar', () => {
    expect(ticariPanel).toContain('<TedarikciKritikYonetimPaneli />')
    expect(tedarikciPaneli).toContain('tedarikciPasiflestir')
    expect(tedarikciPaneli).toContain('Tedarikçiyi pasifleştir')
    expect(cariTedarikciPaneli).not.toContain('tedarikciPasiflestir')
    expect(cariTedarikciPaneli).not.toContain('Tedarikçiyi pasifleştir')
  })

  it('fiziksel silme yerine gerekçeli geçersiz kılma akışı gösterir', () => {
    expect(fiyatSekmesi).toContain('Kayıt silinmez; tarihçede gerekçesiyle korunur.')
    expect(fiyatSekmesi).toContain('Geçersiz kılma gerekçesi')
    expect(fiyatSekmesi).toContain('maliyetAlisFiyatiGecersizKil')
    expect(fiyatSekmesi).toContain('önceki geçerli fiyatı varsa otomatik')
  })
})
