import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8')
const migration034 = read('supabase', 'migrations', '034_cam_aile_katalogu.sql')
const migration036 = read('supabase', 'migrations', '036_kombinasyon_stok_sistemi.sql')
const migration105 = read('supabase', 'migrations', '105_stok_baslangic_katalogu.sql')
const stokPage = read('src', 'pages', 'StokPage.tsx')
const kurulumAkisi = read('src', 'lib', 'stokBaslangicKurulumAkisi.ts')

const valuesBlock = (sql: string, start: string, end: string) => {
  const startIndex = sql.indexOf(start)
  const endIndex = sql.indexOf(end, startIndex)
  expect(startIndex).toBeGreaterThan(-1)
  expect(endIndex).toBeGreaterThan(startIndex)
  return sql.slice(startIndex, endIndex)
}

const camCodes = (sql: string) => [
  ...sql.matchAll(/^\s*\('([^']+)',\s*'[^']+',\s*'cam',/gm),
].map((match) => match[1])

describe('stok başlangıç kataloğu sözleşmesi', () => {
  it('tarihsel 034/036 seed migrationlarını değiştirmek yerine 105 sınırında çalışır', () => {
    expect(migration034).toContain('-- 034 - Cam aile katalogu')
    expect(migration036).toContain('-- 036 - Kombinasyon bazli stok sistemi')
    expect(migration105).toContain('Tarihsel 034/036 migrationlari degistirilmez')
  })

  it('migration uygulanırken stok eklemez; stok yazımı yalnız açık kurulum RPCsindedir', () => {
    const rpcStart = migration105.indexOf(
      'CREATE OR REPLACE FUNCTION public.stok_baslangic_katalogunu_kur',
    )
    expect(rpcStart).toBeGreaterThan(-1)
    expect(migration105.slice(0, rpcStart)).not.toMatch(
      /INSERT INTO public\.stok\s*\(/,
    )
    expect(migration105.slice(rpcStart)).toMatch(/INSERT INTO public\.stok\s*\(/)
  })

  it('036 cam kodlarının tamamını ve yalnız onları cam şablonuna taşır', () => {
    const legacy = valuesBlock(
      migration036,
      'insert into stok',
      'on conflict (kod)',
    )
    const template = valuesBlock(
      migration105,
      'INSERT INTO public.stok_baslangic_katalogu_sablonu',
      'ALTER TABLE public.stok_baslangic_katalogu_sablonu',
    )
    const legacyCodes = camCodes(legacy).sort()
    const templateCodes = camCodes(template).sort()
    expect(legacyCodes).toHaveLength(115)
    expect(templateCodes).toEqual(legacyCodes)
    expect(new Set(templateCodes).size).toBe(115)
  })

  it('kullanıcı kararındaki cam, çıta ve sarf varsayılanlarını sabitler', () => {
    expect(migration105).toContain(
      "('01008', 'Buzlu Cam', 'cam', 'BUZLUCAM', null, 4, 'm2'",
    )
    expect(migration105).toContain(
      "('01009', 'Renkli Cam', 'cam', 'BUZLUCAM', null, null, 'm2'",
    )
    for (const olcu of ['009', '011', '012', '014', '015', '016', '018', '020', '022']) {
      expect(migration105).toContain(`'CITA-AL-${olcu}'`)
    }
    for (const kod of ['SARF-BUTIL', 'SARF-PU', 'SARF-NEM-ALICI', 'SARF-THIOKOL']) {
      expect(migration105).toContain(`'${kod}'`)
    }
    expect(migration105).toContain(
      "('SARF-THIOKOL', 'Thiokol (Polisülfid)', 'yan_malzeme', 'SARF', null, null, 'kg', null, false)",
    )
  })

  it('legacy seed temizliğini açık pristine ve iş verisi yokluğu korumasına bağlar', () => {
    const cleanup = valuesBlock(
      migration105,
      'DO $migration_cleanup$',
      '$migration_cleanup$;',
    )
    for (const guard of [
      'v_pristine',
      'NOT EXISTS (SELECT 1 FROM auth.users)',
      'NOT EXISTS (SELECT 1 FROM public.app_users)',
      'NOT EXISTS (SELECT 1 FROM public.cari)',
      'NOT EXISTS (SELECT 1 FROM public.siparisler)',
      'NOT EXISTS (SELECT 1 FROM public.stok_hareketleri)',
      'NOT EXISTS (SELECT 1 FROM public.stok_alis_fiyatlari)',
      'NOT EXISTS (SELECT 1 FROM public.islem_idempotency)',
    ]) {
      expect(cleanup).toContain(guard)
    }
    expect(cleanup).toMatch(
      /IF v_pristine THEN[\s\S]*?DELETE FROM public\.stok[\s\S]*?ELSE/,
    )
    expect(cleanup).not.toContain('TRUNCATE')
  })

  it('temizlikte yalnız seçilmiş legacy kimlikleri ve otomatik 096 kayıtlarını hedefler', () => {
    const cleanup = valuesBlock(
      migration105,
      'DO $migration_cleanup$',
      '$migration_cleanup$;',
    )
    expect(cleanup).toContain('v_legacy_stok_ids')
    expect(cleanup).toContain('WHERE id = ANY(v_legacy_stok_ids)')
    expect(cleanup).toContain("'096 kesin legacy cam eşleşmesi'")
    expect(cleanup).toContain("'096 legacy stok katman yapısı başlangıç sürümü'")
    expect(cleanup).toMatch(
      /DELETE FROM public\.maliyet_legacy_eslestirmeleri[\s\S]*?WHERE otomatik/,
    )
  })

  it('durum ve kurulum sonuçlarında sayıları ve kategori dağılımını döndürür', () => {
    const requiredKeys = [
      "'katalog_surumu'",
      "'toplam'",
      "'mevcut'",
      "'uyumlu'",
      "'cakisan'",
      "'eksik'",
      "'kurulu'",
      "'kategoriler'",
      "'eklenen'",
      "'kategori_dagilimi'",
      "'eklenen_kategori_dagilimi'",
    ]
    for (const key of requiredKeys) expect(migration105).toContain(key)
  })

  it('kurulumu inventory:create, idempotency ve transaction lock ile korur', () => {
    const install = migration105.slice(
      migration105.indexOf(
        'CREATE OR REPLACE FUNCTION public.stok_baslangic_katalogunu_kur',
      ),
    )
    expect(install).toContain("public.has_permission('inventory', 'create')")
    expect(install).toContain('ticari_idempotency_baslat')
    expect(install).toContain('ticari_idempotency_basarili')
    expect(install).toContain("pg_advisory_xact_lock")
    expect(install).toContain('stok_baslangic_katalogu:105')
  })

  it('mevcut kodu güncellemez ve yalnız eksik kodları ekler', () => {
    const install = migration105.slice(
      migration105.indexOf(
        'CREATE OR REPLACE FUNCTION public.stok_baslangic_katalogunu_kur',
      ),
    )
    expect(install).toMatch(
      /INSERT INTO public\.stok[\s\S]*?WHERE NOT EXISTS[\s\S]*?lower\(btrim\(stok_row\.kod\)\)/,
    )
    expect(install).not.toMatch(/ON CONFLICT[\s\S]*?DO UPDATE SET/)
    expect(install).not.toMatch(/UPDATE public\.stok SET/)
  })

  it('iç şablonu kapatır ve yalnız yetkili RPCleri authenticated role açar', () => {
    expect(migration105).toContain(
      'REVOKE ALL ON public.stok_baslangic_katalogu_sablonu FROM PUBLIC, anon, authenticated',
    )
    expect(migration105).toContain(
      'REVOKE ALL ON FUNCTION public.stok_baslangic_katalogu_durumu_internal()',
    )
    expect(migration105).toContain(
      'GRANT EXECUTE ON FUNCTION public.stok_baslangic_katalogu_durumu()',
    )
    expect(migration105).toContain(
      'GRANT EXECUTE ON FUNCTION public.stok_baslangic_katalogunu_kur(text)',
    )
  })

  it('reçete hatasını başarılı katalog kurulumundan ayırır ve yeniden deneme sunar', () => {
    expect(kurulumAkisi).toMatch(
      /const katalog = await kataloguKur\(\)[\s\S]*?try[\s\S]*?await receteleriKur\(\)[\s\S]*?catch/,
    )
    expect(stokPage).toContain('stokKataloguVeReceteleriKur')
    expect(stokPage).toContain('Stok kataloğu başarıyla hazırlandı')
    expect(stokPage).toContain('Reçeteleri Yeniden Dene')
    expect(stokPage).toContain('handleReceteKurulumTekrar')
    expect(stokPage).toContain('Promise.allSettled([yenile(), katalogDurumunuYenile()])')
  })
})
