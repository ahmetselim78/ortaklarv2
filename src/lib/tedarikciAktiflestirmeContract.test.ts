import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8')
const migration = read('supabase', 'migrations', '120_tedarikci_yeniden_aktiflestirme.sql')
const auditMigration = read('supabase', 'migrations', '121_cari_audit_trigger.sql')
const service = read('src', 'services', 'maliyetService.ts')
const adminPanel = read('src', 'components', 'admin', 'TedarikciKritikYonetimPaneli.tsx')
const cariPanel = read('src', 'components', 'cari', 'TedarikciCalismaPaneli.tsx')

describe('tedarikçi yeniden aktifleştirme sözleşmesi', () => {
  it('işlemi AAL2, maliyet yönetimi, gerekçe ve idempotency sınırına alır', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.tedarikci_aktiflestir(')
    expect(migration).toContain("stok_maliyet_yazma_yetkisini_dogrula('manage', true)")
    expect(migration).toContain('TEDARIKCI_AKTIFLESTIRME_GEREKCESI_ZORUNLU')
    expect(migration).toContain("'tedarikci_aktiflestir'")
    expect(migration).toContain('ticari_idempotency_basarili')
    expect(migration).toContain('stok_maliyet_audit_baglamini_ayarla')
    expect(auditMigration).toContain('CREATE TRIGGER audit_cari')
    expect(auditMigration).toContain('EXECUTE FUNCTION public.write_audit_event()')
  })

  it('yalnız tedarikçi kartını açar ve eski maliyet kayıtlarını yeniden etkinleştirmez', () => {
    expect(migration).toMatch(/UPDATE public\.cari\s+SET aktif = true/)
    expect(migration).toContain("'gecmis_kayitlar_yeniden_acildi', false")
  })

  it('servis ve admin panelinde onaylı yeniden aktifleştirme akışı sunar', () => {
    expect(service).toContain("kaydetmeRpc('tedarikci_aktiflestir'")
    expect(adminPanel).toContain('tedarikciAktiflestir')
    expect(adminPanel).toContain('Tedarikçiyi yeniden aktifleştir')
    expect(adminPanel).toContain('Tedarikçi yeniden aktifleştirilsin mi?')
    expect(cariPanel).not.toContain('tedarikciAktiflestir')
    expect(cariPanel).not.toContain('Tedarikçiyi yeniden aktifleştir')
  })
})
