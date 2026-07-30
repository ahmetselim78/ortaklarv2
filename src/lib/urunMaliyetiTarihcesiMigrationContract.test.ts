import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '117_urun_maliyeti_tarihcesi.sql',
  ),
  'utf8',
)

describe('ürün maliyeti tarihçesi migration sözleşmesi', () => {
  it('salt okunur, tarih aralıklı ve sınırlı RPC sınırını kurar', () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.urun_maliyeti_tarihcesi_v1\(\s*p_stok_id uuid,\s*p_baslangic date DEFAULT NULL,\s*p_bitis date DEFAULT NULL,\s*p_limit integer DEFAULT 200\s*\)/,
    )
    expect(migration).toContain('RETURNS TABLE')
    expect(migration).toContain('LANGUAGE plpgsql')
    expect(migration).toContain('STABLE')
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('MALIYET_TARIH_ARALIGI_GECERSIZ')
    expect(migration).toContain(
      'LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500)',
    )
    expect(migration).toContain('LIMIT v_limit + 1')
    expect(migration).toContain('sonuc.gosterim_sirasi <= v_limit')
  })

  it('yalnız seçili ürünle ilişkili reçete, fire ve kesin kaynak olaylarını toplar', () => {
    expect(migration).toContain('public.stok_urun_maliyet_recete_surmleri')
    expect(migration).toContain('public.stok_urun_maliyet_recete_kalemleri')
    expect(migration).toContain('public.stok_fire_orani_surmleri')
    expect(migration).toContain('public.stok_maliyet_fiyat_secim_surmleri')
    expect(migration).toContain('recete.urun_stok_id = p_stok_id')
    expect(migration).toContain(
      'secim.stok_id = bilesen.bilesen_stok_id',
    )
    expect(migration).toContain('bilesen.recete_donemi @>')
    expect(migration).toContain('bilesen_kaynak_baslangici')
    expect(migration).toContain('bilesen_kaynak_bitisi')
  })

  it('temper olaylarında yalnız genel ve seçili ürün kapsamını kullanır', () => {
    expect(migration).toContain('public.stok_urun_maliyet_recete_islemleri')
    expect(migration).toContain('public.temper_maliyet_modu_surmleri')
    expect(migration).toContain(
      'public.temper_dis_hizmet_fiyat_secim_surmleri',
    )
    expect(migration).toContain(
      'secim.urun_stok_id IS NULL OR secim.urun_stok_id = p_stok_id',
    )
    expect(migration).toContain("islem.islem_turu = 'temper'")
  })

  it('olay günlerini mevcut motorla sabit 1 m2 için yeniden hesaplar', () => {
    expect(migration).toMatch(
      /public\.urun_maliyeti_detayli_hesapla_v3\(\s*p_stok_id,\s*olay\.olay_tarihi,\s*1000,\s*1000\s*\)/,
    )
    for (const alan of [
      'toplam_maliyet numeric',
      'm2_maliyet numeric',
      'cam_maliyeti numeric',
      'cita_maliyeti numeric',
      'sarf_maliyeti numeric',
      'islem_maliyeti numeric',
      'fire_etkisi numeric',
      'finansman_etkisi numeric',
      'kur_etkisi numeric',
      'maliyet_farki numeric',
      'maliyet_farki_yuzde numeric',
      'toplam_kayit bigint',
      'detay jsonb',
    ]) {
      expect(migration).toContain(alan)
    }
  })

  it('mevcut TRY-only V3 sözleşmesinde kur ve finansman olayları üretmez', () => {
    expect(migration).toContain('V3_PARA_BIRIMI_DESTEKLENMIYOR')
    expect(migration).not.toMatch(/\bFROM public\.doviz_kurlari\b/)
    expect(migration).not.toMatch(
      /\bFROM public\.maliyet_hesaplama_ayar_surmleri\b/,
    )
    expect(migration).toContain("sonuc.detay ->> 'finansman_etkisi'")
    expect(migration).toContain("sonuc.detay ->> 'vade_etkisi'")
    expect(migration).toContain("sonuc.detay ->> 'kur_etkisi'")
  })

  it('costing.read denetimi ile yalnız authenticated rolüne açılır', () => {
    expect(migration).toContain(
      "auth.uid() IS NULL OR NOT public.has_permission('costing', 'read')",
    )
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.urun_maliyeti_tarihcesi_v1\([\s\S]*?\) FROM PUBLIC, anon, authenticated;/,
    )
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.urun_maliyeti_tarihcesi_v1\([\s\S]*?\) TO authenticated;/,
    )
  })
})
