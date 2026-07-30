import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = (name: string) => readFileSync(
  join(root, 'supabase', 'migrations', name),
  'utf8',
)
const sql = [
  migration('086_stok_maliyet_temel_tablolar.sql'),
  migration('087_stok_alis_fiyatlari.sql'),
  migration('088_stok_maliyet_kaynagi_atamalari.sql'),
  migration('089_cam_tedarik_baglantilari.sql'),
  migration('090_cam_tedarik_baglanti_kalemleri.sql'),
  migration('091_constraints_and_exclusion_rules.sql'),
  migration('092_audit_and_idempotency.sql'),
  migration('094_cost_resolution_functions.sql'),
  migration('095_rpc_write_operations.sql'),
  migration('096_legacy_migration_staging.sql'),
  migration('097_legacy_match_reports.sql'),
  migration('098_rls_and_permissions.sql'),
  migration('099_disable_legacy_writes.sql'),
  migration('100_stok_katalogu_guvenligi.sql'),
].join('\n')

describe('stok-cari-maliyet entegrasyon sözleşmesi', () => {
  it('maliyet profili, alış fiyatı ve kaynak atamasını stok_id ile kurar', () => {
    for (const table of [
      'stok_maliyet_profilleri',
      'stok_alis_fiyatlari',
      'stok_maliyet_kaynagi_atamalari',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`))
    }
    expect(sql).toMatch(/stok_id uuid NOT NULL REFERENCES public\.stok/)
  })

  it('parasal ve katsayı alanlarında float kullanmaz', () => {
    expect(sql).not.toMatch(/\b(double precision|real|float[48]?)\b/i)
    expect(sql).toMatch(/birim_fiyat numeric\(20,8\)/)
    expect(sql).toMatch(/donusum_katsayisi numeric\(20,10\)/)
  })

  it('fiyat tarihçesini UPDATE ve DELETE işlemlerine kapatır', () => {
    expect(sql).toContain('STOK_ALIS_FIYATI_DEGISTIRILEMEZ')
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.stok_alis_fiyatlari/)
  })

  it('dönem çakışmasını PostgreSQL GiST exclusion ile engeller', () => {
    expect(sql).toMatch(/stok_maliyet_kaynagi_donem_cakismasi[\s\S]*?EXCLUDE USING gist/)
    expect(sql).toMatch(/stok_id WITH =,[\s\S]*?gecerlilik_donemi WITH &&/)
  })

  it('tarih aralıklarını yarı açık [başlangıç, bitiş) tutar', () => {
    expect(sql).toContain('lower_inc(gecerlilik_donemi) AND NOT upper_inc(gecerlilik_donemi)')
    expect(sql).toContain("tstzrange(p_baslangic, v_sonraki_baslangic, '[)')")
  })

  it('kritik yazımları idempotency ve AAL2 ile korur', () => {
    for (const rpc of [
      'stok_alis_fiyati_aktiflestir',
      'cam_baglantisi_aktiflestir',
      'cam_baglantisi_kapat',
      'legacy_fiyat_dogrula',
      'tedarikci_pasiflestir',
    ]) {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${rpc}`)
      expect(start).toBeGreaterThan(-1)
      const body = sql.slice(start, start + 9000)
      expect(body).toContain('ticari_idempotency_baslat')
      expect(body).toContain("'manage', true")
    }
  })

  it('eşzamanlı aktivasyonu stok bazlı transaction lock ile serileştirir', () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('stok_maliyet:'")
  })

  it('cam bağlantısında yalnız izin verilen durum geçişlerini kabul eder', () => {
    expect(sql).toContain("OLD.durum = 'taslak' AND NEW.durum NOT IN ('taslak', 'aktif', 'iptal')")
    expect(sql).toContain("OLD.durum = 'aktif' AND NEW.durum NOT IN ('aktif', 'kapali')")
    expect(sql).toContain("OLD.durum IN ('kapali', 'iptal')")
  })

  it('cam fiyat gruplarını kontrollü katalogda tutar', () => {
    expect(sql).toContain('CREATE TABLE public.cam_fiyat_gruplari')
    for (const kod of ['duz', 'konfor', 'sinerji']) {
      expect(sql).toContain(`('${kod}'`)
    }
  })

  it('tarihsel maliyet motoru stok, fiyat, kur, vade, fire ve sürüm izini döndürür', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.urun_maliyeti_detayli_hesapla')
    const body = sql.slice(start, start + 32000)
    for (const alan of [
      "'stok_yapi_surumu'",
      "'fiyat_id'",
      "'kaynak_turu'",
      "'kur_id'",
      "'vade_parametre_id'",
      "'fire_etkisi'",
      "'vade_etkisi'",
      "'kur_etkisi'",
      "'hesaplama_surumu'",
    ]) {
      expect(body).toContain(alan)
    }
  })

  it('legacy stok fiyatını doğrulanmadan aktif maliyet yapmaz', () => {
    expect(sql).toContain("'legacy_unverified'")
    expect(sql).toContain("'dogrulama_bekliyor'")
    expect(sql).toContain("v_fiyat.kaynak_turu = 'legacy_unverified'")
  })

  it('legacy eşleşmelerini güven ve hata sınıflarıyla stagingde tutar', () => {
    for (const sonuc of [
      'kesin_eslesme',
      'yuksek_guvenli_eslesme',
      'birden_fazla_aday',
      'birim_uyusmazligi',
      'kategori_uyusmazligi',
      'tedarikci_eksik',
      'stok_bulunamadi',
    ]) {
      expect(sql).toContain(`'${sonuc}'`)
    }
  })

  it('stok kartındaki eski fiyat alanlarını yeni yazıma kapatır', () => {
    expect(sql).toContain('STOK_LEGACY_FIYAT_ALANLARI_YENI_YAZIMA_KAPALI')
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.maliyet_alis_fiyati_kaydet/)
  })

  it('alış fiyatı tarihçesini stok kataloğundan çıkarıp admin yönetiminde tutar', () => {
    const service = readFileSync(join(root, 'src', 'services', 'maliyetService.ts'), 'utf8')
    const stockPage = readFileSync(join(root, 'src', 'pages', 'StokPage.tsx'), 'utf8')
    const adminPanel = readFileSync(
      join(root, 'src', 'components', 'admin', 'MaliyetFiyatYonetimiSekmesi.tsx'),
      'utf8',
    )
    expect(service).toContain("'stok_alis_fiyati_kaydet_ve_aktiflestir'")
    expect(stockPage).not.toContain('StokAlisFiyatiModal')
    expect(adminPanel).toContain('maliyetAlisFiyatiTarihcesiniGetir')
  })
})
