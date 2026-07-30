import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const cariSayfasi = readFileSync(join(root, 'src', 'pages', 'CariPage.tsx'), 'utf8')
const cariFormu = readFileSync(
  join(root, 'src', 'components', 'cari', 'CariForm.tsx'),
  'utf8',
)
const tedarikciPaneli = readFileSync(
  join(root, 'src', 'components', 'cari', 'TedarikciCalismaPaneli.tsx'),
  'utf8',
)
const musteriAktiflikMigrasyonu = readFileSync(
  join(root, 'supabase', 'migrations', '122_musteriler_daima_aktif.sql'),
  'utf8',
)

describe('cari merkezi sadeleştirme sözleşmesi', () => {
  it('üst özetleri ve tüm hareketler kısayolunu göstermez', () => {
    expect(cariSayfasi).not.toContain('Özetleri gizle')
    expect(cariSayfasi).not.toContain('Özetleri göster')
    expect(cariSayfasi).not.toContain('Tüm cari hareketleri')
  })

  it('tedarikçi genel bakışında yalnız ürün ve fiyat kısayollarını bırakır', () => {
    expect(tedarikciPaneli).not.toContain('<OzetKarti')
    expect(tedarikciPaneli).not.toContain('baslik="Satın alma ve fatura"')
    expect(tedarikciPaneli).not.toContain('>Tedarik kapsamı</h3>')
    expect(tedarikciPaneli).toContain('baslik="Ürün bağlantıları"')
    expect(tedarikciPaneli).toContain('baslik="Alış fiyatları"')
  })

  it('yeni cari formunu geniş ve masaüstünde üç sütunlu açar', () => {
    expect(cariFormu).toContain('max-w-[1400px]')
    expect(cariFormu).toContain('xl:grid-cols-3')
  })

  it('müşteri aktifliğini formdan değiştirmez ve veritabanında daima aktif tutar', () => {
    expect(cariFormu).not.toContain("register('aktif')")
    expect(cariFormu).not.toContain('Aktif müşteri')
    expect(cariSayfasi).toContain("aktif: veri.tipi === 'musteri'")
    expect(musteriAktiflikMigrasyonu).toContain("WHERE tipi = 'musteri'")
    expect(musteriAktiflikMigrasyonu).toContain("CHECK (tipi <> 'musteri' OR aktif)")
  })
})
