import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const sql = readFileSync(
  join(root, 'supabase', 'migrations', '101_tedarikci_siparis_fatura_takibi.sql'),
  'utf8',
)

describe('tedarikçi sipariş ve fatura takip sözleşmesi', () => {
  it('tedarikçileri portal ve manuel fiyat modeline ayırır', () => {
    expect(sql).toContain('tedarikci_calisma_modeli')
    expect(sql).toContain("'sisecam_portal'")
    expect(sql).toContain("'manuel_fiyat'")
  })

  it('portal siparişini fatura ve ödeme alanlarıyla saklar', () => {
    expect(sql).toContain('CREATE TABLE public.tedarikci_siparisleri')
    for (const alan of [
      'portal_siparis_no',
      'siparis_tarihi',
      'vade_gunu',
      'fatura_no',
      'fatura_tarihi',
      'odeme_tarihi',
    ]) expect(sql).toContain(alan)
  })

  it('fatura gelmeden bekler ve vadeyi fatura tarihinden hesaplar', () => {
    expect(sql).toContain("WHEN siparis.fatura_no IS NULL THEN 'fatura_bekliyor'")
    expect(sql).toContain('siparis.fatura_tarihi + siparis.vade_gunu')
    expect(sql).toContain("THEN 'gecikti'")
  })

  it('yazma işlemlerini yetki, idempotency ve optimistic revision ile korur', () => {
    for (const rpc of [
      'tedarikci_siparisi_olustur',
      'tedarikci_siparisine_fatura_isle',
      'tedarikci_siparisini_odendi_isaretle',
    ]) {
      const baslangic = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${rpc}`)
      expect(baslangic).toBeGreaterThan(-1)
      expect(sql.slice(baslangic, baslangic + 10000)).toContain('ticari_idempotency_baslat')
    }
    expect(sql).toContain('TEDARIKCI_SIPARISI_REVIZYON_CAKISMASI')
  })

  it('manuel modeldeki cam fiyatının doğrudan aktifleştirilmesine izin verir', () => {
    expect(sql).toContain("COALESCE(v_tedarikci_modeli, 'manuel_fiyat') <> 'manuel_fiyat'")
  })

  it('arayüzde portal siparişi, fatura bekleme ve manuel fiyat akışını gösterir', () => {
    const takip = readFileSync(join(root, 'src', 'components', 'cari', 'TedarikciSiparisTakibi.tsx'), 'utf8')
    const manuel = readFileSync(join(root, 'src', 'components', 'cari', 'TedarikciManuelCamFiyati.tsx'), 'utf8')
    expect(takip).toContain('Portal siparişi ekle')
    expect(takip).toContain('Fatura bekliyor')
    expect(takip).toContain('fatura tarihine')
    expect(manuel).toContain('Manuel özel cam fiyatları')
  })
})
