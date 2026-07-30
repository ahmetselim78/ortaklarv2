import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const maliyetDizini = join(process.cwd(), 'src', 'components', 'maliyet')
const sayfa = readFileSync(
  join(process.cwd(), 'src', 'pages', 'MaliyetHesaplamaPage.tsx'),
  'utf8',
)
const kaynakPaneli = readFileSync(join(maliyetDizini, 'MaliyetKaynakPaneli.tsx'), 'utf8')
const firePaneli = readFileSync(join(maliyetDizini, 'FireOranlariPaneli.tsx'), 'utf8')
const temperPaneli = readFileSync(join(maliyetDizini, 'TemperMaliyetYonetimi.tsx'), 'utf8')
const tarihcePaneli = readFileSync(join(maliyetDizini, 'MaliyetTarihcesiPaneli.tsx'), 'utf8')
const tarihceMerkezi = readFileSync(join(maliyetDizini, 'MaliyetTarihceMerkezi.tsx'), 'utf8')
const urunTarihcesiPaneli = readFileSync(
  join(maliyetDizini, 'UrunMaliyetTarihcesiPaneli.tsx'),
  'utf8',
)
const tarihceMigration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '116_maliyet_tarihcesi_kategori_ve_seri.sql',
  ),
  'utf8',
)

describe('maliyet ekranı kullanım kolaylığı sözleşmesi', () => {
  it('aktif kaynaklar panelini yalnız fiyat kaynağı seçimine ayırır', () => {
    expect(kaynakPaneli).not.toContain('stokFireOraniKaydetV3')
    expect(kaynakPaneli).not.toContain('standartUrunReceteleriniKurV3')
    expect(kaynakPaneli).toContain('Toplu aktif kaynak seçimi')
    expect(kaynakPaneli).toContain('Ürün bazında aktif kaynak seçimi')
    expect(kaynakPaneli).toContain('Stok özel fiyatı')
  })

  it('boş vade ile peşin fiyatı birbirinden ayırır ve yalnız mevcut vadeleri sunar', () => {
    expect(kaynakPaneli).toContain("const [vadeGunu, setVadeGunu] = useState('')")
    expect(kaynakPaneli).toContain("vadeGunu === ''")
    expect(kaynakPaneli).toContain('Vade girilmemiş / peşin')
    expect(kaynakPaneli).toContain('vadeSecenekleri.map')
  })

  it('fireyi ayrı panelde tüm maliyet kategorileri için ürün bazında yönetir', () => {
    for (const kategori of ['cam', 'cita', 'yan_malzeme']) {
      expect(firePaneli).toContain(`${kategori}: {`)
    }
    expect(firePaneli).toContain('stokFireOraniKaydetV3')
    expect(firePaneli).toContain("kaynak_ekran: 'maliyet_fire_oranlari'")
    expect(firePaneli).toContain('kaydedilenOranlar')
    expect(firePaneli).toContain('kaydedildi ancak güncel liste yeniden alınamadı')
    expect(sayfa).toContain("id: 'fire'")
  })

  it('hesaplanan maliyette ürün açıldığında toplam ve bileşen bazlı fireyi gösterir', () => {
    expect(sayfa).toContain('Toplam fire etkisi')
    expect(sayfa).toContain('bilesen.fire_orani')
    expect(sayfa).toContain('bilesen.firesiz_miktar')
    expect(sayfa).toContain('bilesen.fire_etkisi')
  })

  it('temperde vade ve elle bitiş tarihi istemez', () => {
    expect(temperPaneli).not.toContain('modBitis')
    expect(temperPaneli).not.toContain('secimBitis')
    expect(temperPaneli).not.toContain('Vade (gün)')
    expect(temperPaneli).toContain('vade_gunu: 0')
    expect(temperPaneli).not.toContain('Yeni fiyat geldiğinde eskisi otomatik kapanır')
  })

  it('bileşen yönetimi sekmesini ve ona özel modalları maliyet sayfasında tutmaz', () => {
    expect(sayfa).not.toContain("id: 'bilesenler'")
    expect(sayfa).not.toContain("sekme === 'bilesenler'")
    expect(sayfa).not.toContain('StoktanMaliyetBileseniModal')
    expect(sayfa).not.toContain('StokAlisFiyatiModal')
    for (const kalanSekme of ['kaynak', 'fire', 'temper', 'sonuc', 'tarihce']) {
      expect(sayfa).toContain(`id: '${kalanSekme}'`)
    }
  })

  it('gerçek ürün maliyetini kategori ve ürün bazında zaman çizelgesi olarak sunar', () => {
    expect(sayfa).toContain("id: 'tarihce'")
    expect(sayfa).toContain('<MaliyetTarihceMerkezi')
    expect(tarihceMerkezi).toContain("useState<TarihceGorunumu>('urun_maliyeti')")
    expect(tarihceMerkezi).toContain('Reçete, kaynak, fire ve temper dahil')
    expect(urunTarihcesiPaneli).toContain('maliyetUrunMaliyetTarihcesiniGetir')
    expect(urunTarihcesiPaneli).toContain('Ürün grubu filtresi')
    expect(urunTarihcesiPaneli).toContain('Seçilen ürünün 1 m² maliyeti')
    expect(urunTarihcesiPaneli).toContain('kayitBaglami === sorguBaglami')
    expect(urunTarihcesiPaneli).toContain('sonDegisimKaydi')
    expect(urunTarihcesiPaneli).toContain('Kayıt sınırı')
    expect(sayfa).toContain("kullanim.alan === 'recete'")
    for (const alan of ['cam_maliyeti', 'cita_maliyeti', 'sarf_maliyeti', 'islem_maliyeti']) {
      expect(urunTarihcesiPaneli).toContain(alan)
    }
  })

  it('alış fiyatı geçmişini ayrı görünümde kategori ve ürün filtresiyle sunar', () => {
    expect(tarihceMerkezi).toContain('Alış fiyatı geçmişi')
    expect(tarihcePaneli).toContain('kategoriSekmeleri')
    expect(tarihcePaneli).toContain('<option value="">Tüm ürünler</option>')
    expect(tarihcePaneli).toContain('fiyatDegisimleriniHesapla')
    expect(tarihcePaneli).toContain('son başarılı veri gösteriliyor')
    expect(tarihcePaneli).toContain('TARIHCE_KAYIT_LIMITI')
  })

  it('tarihçe RPCsi stok kategori fallbackini, fiyat serisini ve toplam kaydı döndürür', () => {
    expect(tarihceMigration).toContain('stok_alis_fiyati_tarihcesi_v3')
    expect(tarihceMigration).toContain('stok.kategori::text')
    expect(tarihceMigration).toContain('fiyat.fiyat_varyanti')
    expect(tarihceMigration).toContain('count(*) OVER ()')
    expect(tarihceMigration).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/)
  })
})
