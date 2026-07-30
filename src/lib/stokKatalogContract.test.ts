import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8')
const migration = read('supabase', 'migrations', '100_stok_katalogu_guvenligi.sql')
const page = read('src', 'pages', 'StokPage.tsx')
const list = read('src', 'components', 'stok', 'StokListesi.tsx')
const form = read('src', 'components', 'stok', 'StokForm.tsx')
const detail = read('src', 'components', 'stok', 'StokDetayPaneli.tsx')
const admin = read('src', 'components', 'admin', 'StokCariMaliyetPaneli.tsx')

describe('stok kataloğu sözleşmesi', () => {
  it('tek katalog RPC çağrısında kullanım özetini döndürür ve N+1 sorgu yapmaz', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.stok_katalogu_getir()')
    expect(migration).toContain("'kullaniliyor'")
    expect(migration).toContain("'kullanimlar'")
    expect(migration).toContain('stok_kullanim_ozeti_internal(stok_row.id)')
    expect(page).not.toContain("from('siparis_detaylari')")
  })

  it('kullanımı katman tarihçesinden değil dış referanslardan hesaplar', () => {
    const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.stok_kullanim_ozeti_internal')
    const end = migration.indexOf('CREATE OR REPLACE FUNCTION public.stok_kullanim_ozeti(', start)
    const body = migration.slice(start, end)
    for (const kaynak of [
      'siparis_detaylari',
      'teklif_detaylari',
      'fiyat_listesi_urun_kalemleri',
      'urun_maliyet_receteleri',
      'stok_maliyet_profilleri',
      'stok_alis_fiyatlari',
    ]) expect(body).toContain(kaynak)
    expect(body).not.toContain('stok_maliyet_yapi_surmleri')
  })

  it('stok tablosuna doğrudan yazmayı kaldırır ve mutasyonları izinli RPC sınırına alır', () => {
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON public.stok FROM authenticated')
    for (const rpc of [
      'stok_karti_olustur',
      'stok_karti_guncelle',
      'stok_aktiflik_ayarla',
      'stok_karti_sil',
      'stok_satis_kapsami_ayarla',
      'stok_maliyet_kapsami_ayarla',
    ]) expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${rpc}`)
    expect(migration).toMatch(/stok_karti_sil[\s\S]*?current_aal2\(\)/)
  })

  it('kullanılan kartın teknik kimliğini ve silinmesini trigger ile kilitler', () => {
    expect(migration).toContain('CREATE TRIGGER stok_kullanilan_karti_koru_trigger')
    expect(migration).toContain('KULLANILAN_STOK_KIMLIGI_DEGISTIRILEMEZ')
    expect(migration).toContain('KULLANILAN_STOK_SILINEMEZ')
    expect(migration).not.toMatch(/OLD\.aktif IS DISTINCT FROM NEW\.aktif/)
    expect(migration).not.toMatch(/OLD\.ticari_kapsam IS DISTINCT FROM NEW\.ticari_kapsam/)
  })

  it('stok ekranını sade katalog olarak sunar', () => {
    expect(page).toContain(": 'Stok Kataloğu'")
    for (const kategori of ['Cam', 'Çıta', 'Yan Malzeme']) expect(page).toContain(kategori)
    expect(page).not.toContain('Ticari kapsam')
    expect(page).not.toContain('StokAlisFiyatiModal')
    expect(list).toContain('Kullanımda')
    expect(list).toContain('Teknik tanım')
    expect(detail).toContain('Kullanım özeti')
  })

  it('kategoriye özel yeni kayıt kurallarını istemcide uygular', () => {
    expect(form).toContain("z.enum(['tek_cam', 'kombinasyon'])")
    expect(form).toContain('Tek cam kalınlığı zorunludur')
    expect(form).toContain('Geçerli bir katman yapısı girin')
    expect(form).toContain('Çıta boyutu zorunludur')
    expect(form).not.toContain('Ticari kapsam')
    expect(form).not.toContain('birim_fiyat')
  })

  it('ticari katalog ve stok bakımını ayrı Stok, Cari ve Maliyet admin katmanına taşır', () => {
    expect(admin).toContain("'ticari-katalog'")
    expect(admin).toContain("'stok-bakimi'")
    expect(admin).toContain('<TicariKatalogPaneli />')
    expect(admin).toContain('<StokBakimPaneli />')
  })

  it('satış ve maliyet kapsam bitlerini birbirini koruyarak dönüştürür', () => {
    const satis = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.stok_satis_kapsami_ayarla'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.stok_maliyet_kapsami_ayarla'),
    )
    const maliyet = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.stok_maliyet_kapsami_ayarla'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.stok_kullanilan_karti_koru'),
    )
    for (const kapsam of ['satilabilir', 'maliyet_bileseni', 'her_ikisi', 'kapsam_disi']) {
      expect(`${satis}\n${maliyet}`).toContain(`'${kapsam}'`)
    }
    expect(satis).toContain('v_maliyet')
    expect(maliyet).toContain('v_satis')
  })
})
