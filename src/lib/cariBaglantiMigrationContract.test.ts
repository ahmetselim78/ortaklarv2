import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '093_cari_baglantilari_ve_fiyat_dagitimlari.sql'),
  'utf8',
)

describe('cari bağlantı migration sözleşmesi', () => {
  it('bağlantı, sipariş ve tahsilat dağıtımlarını append-only kurar', () => {
    expect(sql).toContain('CREATE TABLE public.cari_baglantilari')
    expect(sql).toContain('CREATE TABLE public.siparis_baglanti_dagitimlari')
    expect(sql).toContain('CREATE TABLE public.cari_tahsilat_dagitimlari')
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.siparis_baglanti_dagitimlari/i)
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.cari_tahsilat_dagitimlari/i)
  })

  it('onayda AAL2, çift yetki, idempotency ve cari/döviz kilidi ister', () => {
    expect(sql).toMatch(/has_permission\('pricing', 'manage'\)/i)
    expect(sql).toMatch(/has_permission\('finance', 'create'\)/i)
    expect(sql).toContain('current_aal2()')
    expect(sql).toContain('ticari_idempotency_baslat')
    expect(sql).toContain("'cari_baglanti:' || v_baglanti.cari_id::text")
  })

  it('eski kredi kuyruğunu, satır bölünmesini ve FIFO tahsilatı açıkça uygular', () => {
    expect(sql).toMatch(/ORDER BY baglanti\.sira_no\s+LIMIT 1/i)
    expect(sql).toContain('LEAST(v_satir_kalan, v_baglanti.kalan)')
    expect(sql).toMatch(/ORDER BY dagitim\.created_at, dagitim\.id/i)
    expect(sql).toContain('kaynak_dagitim_id')
  })

  it('geçiş siparişinde bağlantı fiyatlarını oranlayıp doğrulama kilidini transaction boyunca tutar', () => {
    expect(sql).toContain('ticari_baglanti_fiyatlarini_uygula')
    expect(sql).toContain('ticari_baglanti_onizleme_oranlari')
    expect(sql).toContain('baglanti_fiyat_listesi_surumu_idleri')
    expect(sql).toMatch(
      /fiyat_onizlemesini_dogrula[\s\S]*?pg_advisory_xact_lock[\s\S]*?fiyat_hesapla_internal/i,
    )
  })

  it('yalnız açık m²yi yeni fiyat ve KDV ile fark hareketine dönüştürür', () => {
    expect(sql).toContain('cari_baglanti_acik_donem_fark_satirlari')
    expect(sql).toContain('dagitim.acik_tutar')
    expect(sql).toContain('cari_tahsilat_dagitimlari')
    expect(sql).toContain('baglanti_fiyat_farki_borc')
    expect(sql).toContain('baglanti_fiyat_farki_alacak')
  })

  it('fiyat önizleme sonucunu ürün grubu, bağlantı dağılımı ve cari etkisiyle genişletir', () => {
    expect(sql).toContain("'urun_gruplari'")
    expect(sql).toContain("'baglanti_dagilimlari'")
    expect(sql).toContain("'cari_etkisi'")
  })
})
