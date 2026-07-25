const WINDOWS_1252_BYTES: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
}

const MOJIBAKE_MARKERS = /(?:Ã.|Ä.|Å.|Â.|â€|ðŸ)/

function windows1252Bytes(value: string): Uint8Array | null {
  const bytes: number[] = []
  for (const character of value) {
    const codePoint = character.codePointAt(0)!
    if (codePoint <= 0xff) {
      bytes.push(codePoint)
      continue
    }
    const mapped = WINDOWS_1252_BYTES[character]
    if (mapped === undefined) return null
    bytes.push(mapped)
  }
  return Uint8Array.from(bytes)
}

/** UTF-8 metnin Windows-1252 olarak okunmasıyla oluşan yaygın bozulmayı onarır. */
export function repairUtf8Mojibake(value: string): string {
  if (!MOJIBAKE_MARKERS.test(value)) return value

  let repaired = value
  for (let pass = 0; pass < 2 && MOJIBAKE_MARKERS.test(repaired); pass += 1) {
    const bytes = windows1252Bytes(repaired)
    if (!bytes) break
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (decoded === repaired) break
      repaired = decoded
    } catch {
      break
    }
  }
  return repaired
}

export function utf8JsonWithBom(value: unknown): string {
  return `\uFEFF${JSON.stringify(value, (_key, item) => (
    typeof item === 'string' ? repairUtf8Mojibake(item) : item
  ), 2)}`
}
