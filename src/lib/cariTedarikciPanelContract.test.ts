import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const cariSayfasi = readFileSync(join(root, 'src', 'pages', 'CariPage.tsx'), 'utf8')
const calismaAlani = readFileSync(
  join(root, 'src', 'components', 'cari', 'CariCalismaAlani.tsx'),
  'utf8',
)
const tedarikciPaneli = readFileSync(
  join(root, 'src', 'components', 'cari', 'TedarikciCalismaPaneli.tsx'),
  'utf8',
)
const urunBaglantilari = readFileSync(
  join(root, 'src', 'components', 'cari', 'TedarikciUrunBaglantilari.tsx'),
  'utf8',
)
const fiyatYonetimi = readFileSync(
  join(root, 'src', 'components', 'cari', 'TedarikciFiyatYonetimi.tsx'),
  'utf8',
)

describe('cari müşteri ve tedarikçi çalışma alanı sözleşmesi', () => {
  it('karışık tedarikçi modalı yerine seçili carinin içinde ayrı çalışma paneli kullanır', () => {
    expect(cariSayfasi).not.toContain('TedarikciMaliyetModal')
    expect(calismaAlani).toContain('<TedarikciCalismaPaneli')
    expect(tedarikciPaneli).toContain("etiket: 'Ürün Bağlantıları'")
    expect(tedarikciPaneli).toContain("etiket: 'Alış Fiyatı Gir'")
    expect(tedarikciPaneli).toContain("etiket: 'Fiyat Geçmişi'")
  })

  it('müşterinin satış/hesap işlemlerini tedarikçinin satın alma akışına taşımaz', () => {
    expect(calismaAlani).toContain("secilen.tipi === 'musteri'")
    expect(calismaAlani).toContain('Müşteri işlemleri')
    expect(tedarikciPaneli).toContain('sipariş–fatura–ödeme yaşam döngüsü')
    expect(tedarikciPaneli).toContain("etiket: 'Alış Bağlantıları'")
  })

  it('alış fiyatı seçimlerini yalnız aktif tedarikçi–stok bağlantılarıyla sınırlar', () => {
    expect(tedarikciPaneli).toContain('bagliStokIdleri={aktifUrunBaglantilari.map')
    expect(fiyatYonetimi).toContain('bagliStokIdleri?: string[]')
    expect(fiyatYonetimi).toContain('Bu tedarikçiye bağlı')
    expect(fiyatYonetimi).toContain('Ürün bağlantılarına git')
    expect(fiyatYonetimi).toContain('Toplu fiyat girişi')
    expect(fiyatYonetimi).toContain('Girilen fiyatları topluca kaydet')
  })

  it('pasif ürün bağlantısını geçmişi silmeden yeniden etkinleştirebilir', () => {
    expect(urunBaglantilari).toContain('Pasif bağlantılar')
    expect(urunBaglantilari).toContain('Yeniden bağla')
    expect(urunBaglantilari).toContain('Fiyat geçmişi korunuyor')
  })

  it('çoklu ürün seçimini ayrı çağrılar yerine tek atomik payloadla gönderir', () => {
    expect(urunBaglantilari).toContain('{ stok_ids: stokIdleri }')
    expect(urunBaglantilari).not.toContain('Promise.all(stokIdleri.map')
  })

  it('Şişecam PDF aktarımını portal modeli ve cam kapsamıyla birlikte sınırlar', () => {
    expect(fiyatYonetimi).toContain("tedarikci.tedarikci_calisma_modeli === 'sisecam_portal'")
    expect(fiyatYonetimi).toContain("tedarikci.tedarik_kapsamlari.includes('cam')")
  })

  it('tedarikçi pasifleştirme ve eski bağlantı yönetimini cari çalışma alanında göstermez', () => {
    expect(tedarikciPaneli).not.toContain("etiket: 'Yönetim'")
    expect(tedarikciPaneli).not.toContain('Tedarikçiyi pasifleştir')
    expect(tedarikciPaneli).not.toContain('camBaglantisiKapat')
    expect(tedarikciPaneli).not.toContain('camBaglantisiAktiflestir')
  })
})
