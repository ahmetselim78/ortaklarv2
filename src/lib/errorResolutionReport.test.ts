import { describe, expect, it } from 'vitest'
import { parseErrorResolutionReport } from './errorResolutionReport'

const VALID_ID = 'a3a5444f-f621-4f65-98ce-8dc782d81d7b'

describe('parseErrorResolutionReport', () => {
  it('geçerli çözüm raporundaki hata kimliklerini döndürür', () => {
    const report = parseErrorResolutionReport(JSON.stringify({
      schema_version: 1,
      report_type: 'ortaklar_hata_cozum_raporu',
      resolved_error_ids: [VALID_ID],
    }))
    expect(report.resolvedErrorIds).toEqual([VALID_ID])
  })

  it('yanlış rapor türünü reddeder', () => {
    expect(() => parseErrorResolutionReport(JSON.stringify({
      schema_version: 1,
      report_type: 'farkli_rapor',
      resolved_error_ids: [VALID_ID],
    }))).toThrow(/desteklenen AI çözüm raporu/)
  })

  it('yinelenen hata kimliklerini reddeder', () => {
    expect(() => parseErrorResolutionReport(JSON.stringify({
      schema_version: 1,
      report_type: 'ortaklar_hata_cozum_raporu',
      resolved_error_ids: [VALID_ID, VALID_ID],
    }))).toThrow(/birden fazla kez/)
  })
})
