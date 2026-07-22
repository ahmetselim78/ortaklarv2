const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_RESOLVED_ERRORS = 500

export interface ErrorResolutionReport {
  resolvedErrorIds: string[]
}

export const ERROR_RESOLUTION_REPORT_CONTRACT = {
  schema_version: 1,
  report_type: 'ortaklar_hata_cozum_raporu',
  required_fields: ['schema_version', 'report_type', 'resolved_error_ids'],
  output_example: {
    schema_version: 1,
    report_type: 'ortaklar_hata_cozum_raporu',
    generated_at: '2026-07-23T12:00:00.000Z',
    resolved_error_ids: ['00000000-0000-4000-8000-000000000000'],
    resolution_summary: 'Hata düzeltildi ve doğrulandı.',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseErrorResolutionReport(content: string): ErrorResolutionReport {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Çözüm raporu geçerli bir JSON dosyası olmalıdır.')
  }

  if (!isRecord(parsed) || parsed.schema_version !== 1 || parsed.report_type !== ERROR_RESOLUTION_REPORT_CONTRACT.report_type) {
    throw new Error('Bu dosya desteklenen AI çözüm raporu formatında değil.')
  }

  const errorIds = parsed.resolved_error_ids
  if (!Array.isArray(errorIds) || errorIds.length === 0 || errorIds.length > MAX_RESOLVED_ERRORS) {
    throw new Error(`Çözüm raporu 1 ile ${MAX_RESOLVED_ERRORS} arasında hata kimliği içermelidir.`)
  }
  if (!errorIds.every(id => typeof id === 'string' && UUID_PATTERN.test(id))) {
    throw new Error('Çözüm raporunda geçersiz hata kimliği var.')
  }

  const resolvedErrorIds = Array.from(new Set(errorIds))
  if (resolvedErrorIds.length !== errorIds.length) {
    throw new Error('Çözüm raporunda aynı hata kimliği birden fazla kez bulunuyor.')
  }

  return { resolvedErrorIds }
}
