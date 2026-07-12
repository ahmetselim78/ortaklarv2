import iconv from 'iconv-lite'

export interface ImpPieceParsed {
  lineNo: number
  n: number
  b: number
  h: number
  fam: string
  ord: string
  cl: string
  nota3: string
  raw: string
}

export interface ImpParseResult {
  header: string
  pieces: ImpPieceParsed[]
  sumN: number
  totalAreaM2: number
}

export interface ImpBinaryMeta {
  hasBom: boolean
  hasCrlf: boolean
  hasLfOnly: boolean
  isUtf8Blob: boolean
  turkishCp1254Ok: boolean
}

export interface ImpPieceDiff {
  lineNo: number
  field: 'n' | 'b' | 'h' | 'fam' | 'ord' | 'sira' | 'nota3'
  expected: string | number
  actual: string | number
}

const PIECE_RE =
  /^N(\d+)=;N=(\d+);B=(\d+);H=(\d+);CL=([^;]*);ORD=([^;]*);FAM=([^;]*);.*;NOTA1=;NOTA2=;NOTA3=([^;\s]*)/

export function parseImpContent(text: string): ImpParseResult {
  const lines = text.split(/\r?\n/)
  const header = lines[0] ?? ''
  const pieces: ImpPieceParsed[] = []

  for (const line of lines) {
    const m = line.match(PIECE_RE)
    if (!m) continue
    pieces.push({
      lineNo: parseInt(m[1], 10),
      n: parseInt(m[2], 10),
      b: parseInt(m[3], 10),
      h: parseInt(m[4], 10),
      cl: m[5],
      ord: m[6],
      fam: m[7],
      nota3: m[8],
      raw: line,
    })
  }

  const sumN = pieces.reduce((s, p) => s + p.n, 0)
  const totalAreaM2 = pieces.reduce((s, p) => s + (p.n * p.b * p.h) / 1_000_000, 0)

  return { header, pieces, sumN, totalAreaM2 }
}

export function parseImpBytes(bytes: Uint8Array): ImpParseResult {
  const text = iconv.decode(bytes, 'win1254')
  return parseImpContent(text)
}

export function impEncodeCp1254(content: string): Uint8Array {
  return Uint8Array.from(iconv.encode(content, 'win1254'))
}

/** cp1254 olarak encode edilmiş bytes meta kontrolleri (encoding tahmini yok). */
export function inspectImpBinary(bytes: Uint8Array, utf8ReferenceContent?: string): ImpBinaryMeta {
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const hasCrlf = bytesIncludes(bytes, 0x0d) && bytesIncludes(bytes, 0x0a)
  const hasLfOnly = bytesIncludes(bytes, 0x0a) && !bytesIncludes(bytes, 0x0d)

  let isUtf8Blob = false
  if (utf8ReferenceContent) {
    const utf8Buf = new TextEncoder().encode(utf8ReferenceContent)
    isUtf8Blob = bytesEqual(bytes, utf8Buf)
  }

  const reEncoded = impEncodeCp1254(iconv.decode(bytes, 'win1254'))
  const turkishCp1254Ok = bytesEqual(bytes, reEncoded)

  return { hasBom, hasCrlf, hasLfOnly, isUtf8Blob, turkishCp1254Ok }
}

function bytesIncludes(bytes: Uint8Array, val: number): boolean {
  for (const b of bytes) if (b === val) return true
  return false
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function compareImpPieces(
  actual: ImpPieceParsed[],
  expected: ImpPieceParsed[],
): ImpPieceDiff[] {
  const diffs: ImpPieceDiff[] = []
  const max = Math.max(actual.length, expected.length)

  for (let i = 0; i < max; i++) {
    const a = actual[i]
    const e = expected[i]
    const sira = i + 1

    if (!a && e) {
      diffs.push({ lineNo: sira, field: 'sira', expected: sira, actual: 'EKSIK' })
      continue
    }
    if (a && !e) {
      diffs.push({ lineNo: sira, field: 'sira', expected: 'YOK', actual: sira })
      continue
    }
    if (!a || !e) continue

    if (a.lineNo !== e.lineNo) {
      diffs.push({ lineNo: sira, field: 'sira', expected: e.lineNo, actual: a.lineNo })
    }
    if (a.n !== e.n) diffs.push({ lineNo: sira, field: 'n', expected: e.n, actual: a.n })
    if (a.b !== e.b) diffs.push({ lineNo: sira, field: 'b', expected: e.b, actual: a.b })
    if (a.h !== e.h) diffs.push({ lineNo: sira, field: 'h', expected: e.h, actual: a.h })
    if (a.fam !== e.fam) diffs.push({ lineNo: sira, field: 'fam', expected: e.fam, actual: a.fam })
    if (a.ord !== e.ord) diffs.push({ lineNo: sira, field: 'ord', expected: e.ord, actual: a.ord })
    if (a.nota3 !== e.nota3) diffs.push({ lineNo: sira, field: 'nota3', expected: e.nota3, actual: a.nota3 })
  }

  return diffs
}

/** N/B/H/FAM/ORD/sıra numarası karşılaştırır; NOTA3 hariç (gerçek.IMP referans testi). */
export function compareImpPiecesCore(
  actual: ImpPieceParsed[],
  expected: ImpPieceParsed[],
): ImpPieceDiff[] {
  const diffs: ImpPieceDiff[] = []
  const max = Math.max(actual.length, expected.length)

  for (let i = 0; i < max; i++) {
    const a = actual[i]
    const e = expected[i]
    const sira = i + 1

    if (!a && e) {
      diffs.push({ lineNo: sira, field: 'sira', expected: sira, actual: 'EKSIK' })
      continue
    }
    if (a && !e) {
      diffs.push({ lineNo: sira, field: 'sira', expected: 'YOK', actual: sira })
      continue
    }
    if (!a || !e) continue

    if (a.lineNo !== e.lineNo) {
      diffs.push({ lineNo: sira, field: 'sira', expected: e.lineNo, actual: a.lineNo })
    }
    if (a.n !== e.n) diffs.push({ lineNo: sira, field: 'n', expected: e.n, actual: a.n })
    if (a.b !== e.b) diffs.push({ lineNo: sira, field: 'b', expected: e.b, actual: a.b })
    if (a.h !== e.h) diffs.push({ lineNo: sira, field: 'h', expected: e.h, actual: a.h })
    if (a.fam !== e.fam) diffs.push({ lineNo: sira, field: 'fam', expected: e.fam, actual: a.fam })
    if (a.ord !== e.ord) diffs.push({ lineNo: sira, field: 'ord', expected: e.ord, actual: a.ord })
  }

  return diffs
}

export function impNDagilimi(pieces: ImpPieceParsed[]): Record<number, number> {
  const dag: Record<number, number> = {}
  for (const p of pieces) {
    dag[p.n] = (dag[p.n] ?? 0) + 1
  }
  return dag
}
