import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '112_ticari_mod_durumu_kendini_onarma.sql'),
  'utf8',
)

describe('ticari mod singleton onarimi', () => {
  it('eksik mod satirini hazirlik modunda geri getirir', () => {
    expect(sql).toMatch(
      /INSERT INTO public\.ticari_modul_durumu\(singleton, mod\)[\s\S]*?VALUES \(true, 'hazirlik'\)[\s\S]*?ON CONFLICT \(singleton\) DO NOTHING/i,
    )
  })

  it('getter eksik singleton satirini guvenli bicimde yeniden olusturur', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.ticari_modul_modu_getir\(\)/i)
    expect(sql).toMatch(/VOLATILE/i)
    expect(sql).toMatch(/SECURITY DEFINER/i)
    expect(sql).toMatch(/auth\.uid\(\) IS NULL/i)
    expect(sql).toMatch(/ON CONFLICT \(singleton\) DO NOTHING/i)
  })
})
