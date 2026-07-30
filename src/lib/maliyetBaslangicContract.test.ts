import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationDizini = join(process.cwd(), 'supabase', 'migrations')
const modelSql = readFileSync(
  join(migrationDizini, '082_sade_maliyet_veri_modeli.sql'),
  'utf8',
)
const motorSql = readFileSync(
  join(migrationDizini, '083_sade_maliyet_rpc_ve_hesap_motoru.sql'),
  'utf8',
)

function sqlFonksiyonu(sql: string, ad: string) {
  const escaped = ad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const eslesme = sql.match(
    new RegExp(`CREATE OR REPLACE FUNCTION\\s+public\\.${escaped}\\s*\\([\\s\\S]*?\\n\\$\\$;`, 'i'),
  )
  if (!eslesme) throw new Error(`public.${ad} fonksiyonu bulunamadı`)
  return eslesme[0]
}

function tablo(sql: string, ad: string) {
  const escaped = ad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const eslesme = sql.match(
    new RegExp(`CREATE TABLE\\s+public\\.${escaped}\\s*\\([\\s\\S]*?\\n\\);`, 'i'),
  )
  if (!eslesme) throw new Error(`public.${ad} tablosu bulunamadı`)
  return eslesme[0]
}

describe('sade maliyet veri modeli', () => {
  it('cam ve çıtada kod/genel ad yerine alana özgü kimlik alanları kullanır', () => {
    const cam = tablo(modelSql, 'maliyet_cam_hammaddeleri')
    const cita = tablo(modelSql, 'maliyet_citalari')

    expect(cam).toContain('kalinlik_mm')
    expect(cam).toContain('cam_turu')
    expect(cam).not.toMatch(/\bkod\b/i)
    expect(cam).not.toMatch(/\bad\s+text\b/i)
    expect(cita).toContain('genislik_mm')
    expect(cita).toContain('malzeme_turu')
    expect(cita).not.toMatch(/\bkod\b/i)
    expect(cita).not.toMatch(/\bad\s+text\b/i)
  })

  it('yalnız sarf malzemesinde alanın gerektirdiği özel adı ister', () => {
    const sarf = tablo(modelSql, 'maliyet_sarf_malzemeleri')
    expect(sarf).toMatch(/\bad text NOT NULL/i)
    expect(sarf).not.toMatch(/\bkod\b/i)
    expect(sarf).toContain("alis_birimi IN ('kg', 'litre', 'adet', 'metre')")
  })

  it('tarihçeli maliyet tablolarında geçerlilik bitişi tutmaz', () => {
    for (const ad of [
      'maliyet_sarf_katsayi_surmleri',
      'maliyet_hesaplama_ayar_surmleri',
      'maliyet_alis_fiyatlari',
    ]) {
      const tanim = tablo(modelSql, ad)
      expect(tanim).toContain('gecerli_baslangic')
      expect(tanim).not.toContain('gecerli_bitis')
    }
  })

  it('alış fiyatını tedarikçi, vade, para birimi ve tek malzeme türüyle sınırlar', () => {
    const fiyat = tablo(modelSql, 'maliyet_alis_fiyatlari')
    expect(fiyat).toContain('tedarikci_id')
    expect(fiyat).toContain('vade_gunu')
    expect(fiyat).toContain('para_birimi')
    expect(fiyat).toMatch(/num_nonnulls\(cam_hammaddesi_id,\s*cita_id,\s*sarf_malzeme_id\) = 1/i)
    expect(modelSql).toMatch(/BEFORE UPDATE OR DELETE ON public\.maliyet_alis_fiyatlari/i)
  })

  it('başlangıç ekranını 4 mm türleri ve 16 mm çıtayla hazırlar', () => {
    for (const tur of ['duz', 'konfor', 'sinerji']) {
      expect(modelSql).toContain(`(4, '${tur}')`)
    }
    expect(modelSql).toContain("(16, 'aluminyum')")
  })

  it('yeni tablolarda RLS ve pricing read politikası uygular', () => {
    expect(modelSql).toContain("ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY")
    expect(modelSql).toContain("REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated")
    expect(modelSql).toContain("'pricing',")
    expect(modelSql).toContain("'read'")
  })
})

describe('sade maliyet RPC ve hesap motoru', () => {
  it.each([
    'maliyet_malzeme_kaydet',
    'maliyet_sarf_katsayisi_kaydet',
    'maliyet_hesaplama_ayari_kaydet',
    'maliyet_alis_fiyati_kaydet',
  ])('%s yazımını güvenli ve idempotent RPC sınırında yapar', (ad) => {
    const fonksiyon = sqlFonksiyonu(motorSql, ad)
    expect(fonksiyon).toMatch(/SECURITY DEFINER/i)
    expect(fonksiyon).toMatch(/SET search_path = pg_catalog,\s*public/i)
    expect(fonksiyon).toMatch(/auth\.uid\(\)/i)
    expect(fonksiyon).toMatch(/has_permission\('pricing',\s*'(create|update)'\)/i)
    expect(fonksiyon).toContain('ticari_idempotency_baslat')
    expect(fonksiyon).toContain('ticari_idempotency_basarili')
  })

  it('her tedarikçinin son başlangıç tarihli fiyatını seçer', () => {
    const fiyatlar = sqlFonksiyonu(motorSql, 'maliyet_guncel_alis_fiyatlari')
    expect(fiyatlar).toMatch(
      /PARTITION BY[\s\S]*?fiyat\.malzeme_turu[\s\S]*?fiyat\.tedarikci_id/i,
    )
    expect(fiyatlar).toMatch(
      /ORDER BY[\s\S]*?fiyat\.gecerli_baslangic DESC[\s\S]*?fiyat\.created_at DESC/i,
    )
    expect(fiyatlar).not.toContain('gecerli_bitis')
  })

  it('vade finansman etkisini açık basit faiz formülüyle hesaplar', () => {
    const fiyatlar = sqlFonksiyonu(motorSql, 'maliyet_guncel_alis_fiyatlari')
    expect(fiyatlar).toMatch(
      /fiyat\.birim_fiyat[\s\S]*?\(v_oran \/ 100\)[\s\S]*?\(fiyat\.vade_gunu::numeric \/ 365\)/i,
    )
    expect(fiyatlar).toContain("kur_satiri.kur_tipi::text = 'doviz_satis'")
  })

  it('ürün maliyetini cam, çıta ve panelden tanımlı sarflardan çözer', () => {
    const hesapla = sqlFonksiyonu(motorSql, 'maliyet_urun_maliyetlerini_hesapla')
    for (const parca of [
      'cam_bilesenleri',
      'cita_bilesenleri',
      'sarf_bilesenleri',
      'maliyet_guncel_alis_fiyatlari',
      'katman_yapisi',
      'tuketim_katsayisi',
    ]) {
      expect(hesapla).toContain(parca)
    }
    expect(hesapla).toMatch(
      /faiz_dahil_birim_maliyet_try ASC NULLS LAST/i,
    )
    expect(hesapla).toContain("'sade-maliyet-v1'")
  })
})

