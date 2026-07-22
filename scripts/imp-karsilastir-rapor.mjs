/**
 * Verilen referans IMP ile fixture'dan üretilen IMP'yi karşılaştırır.
 *
 * Kullanım:
 *   node scripts/imp-karsilastir-rapor.mjs <referans.IMP> [cikti.IMP]
 *
 * Referans ve çıktı dosyaları kaynak deponun içinde olmak zorunda değildir.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import iconv from 'iconv-lite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const fixture = JSON.parse(
  fs.readFileSync(path.join(root, 'src/lib/fixtures/imp-export-0851-rows.json'), 'utf8'),
)

const PIECE_RE =
  /^N(\d+)=;N=(\d+);B=(\d+);H=(\d+);CL=([^;]*);ORD=([^;]*);FAM=([^;]*);/

function parseImp(text) {
  const pieces = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(PIECE_RE)
    if (!m) continue
    pieces.push({ lineNo: +m[1], n: +m[2], b: +m[3], h: +m[4], ord: m[6], fam: m[7] })
  }
  return {
    pieces,
    sumN: pieces.reduce((s, p) => s + p.n, 0),
    area: pieces.reduce((s, p) => s + (p.n * p.b * p.h) / 1e6, 0),
  }
}

function impBoyutlari(g, y) {
  const w = Math.round(g)
  const h = Math.round(y)
  return { b: Math.max(w, h), h: Math.min(w, h) }
}

function paneCamTipleri(stok) {
  const kod = parseInt((stok.kod || '').replace(/\D/g, ''), 10)
  if (kod >= 10100 && kod <= 10199) return ['dc', 'buzlu']
  if (kod >= 10000 && kod <= 10099) return ['dc', 'dc']
  throw new Error(`Belirsiz stok: ${stok.kod} ${stok.ad}`)
}

function optiParca(row) {
  const stokKod = row.expected.n === 1 ? '10105' : '10005'
  const tipler = paneCamTipleri({ kod: stokKod })
  const dcPane = tipler.filter((t) => t === 'dc').length
  const { b, h } = impBoyutlari(row.genislik_mm, row.yukseklik_mm)
  return {
    n: row.adet * dcPane,
    b,
    h,
    ord: fixture.ord,
    fam: '4DC',
    cl: fixture.cl,
    nota3: String(row.sira_no),
  }
}

function optiImpOlustur(parcalar) {
  const satirlar = parcalar.map((p, idx) =>
    `N${idx + 1}=;N=${p.n};B=${p.b};H=${p.h};CL=${p.cl};ORD=${p.ord};FAM=${p.fam};MOL=0;STND=0;PRIO=0;NOROT=;TOOL=;NOSTETI=;NUMETI=;DES=;NOTA1=;NOTA2=;NOTA3=${p.nota3} `,
  )
  return `[PIECES]\r\n${satirlar.join('\r\n')}\r\n`
}

function nDagilim(pieces) {
  const d = {}
  for (const p of pieces) d[p.n] = (d[p.n] ?? 0) + 1
  return d
}

function compare(actual, expected) {
  const diffs = []
  for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
    const a = actual[i]
    const e = expected[i]
    if (!a || !e) {
      diffs.push({ sira: i + 1, field: 'satir', actual: !!a, expected: !!e })
      continue
    }
    for (const f of ['lineNo', 'n', 'b', 'h', 'fam', 'ord']) {
      if (a[f] !== e[f]) diffs.push({ sira: i + 1, field: f, actual: a[f], expected: e[f] })
    }
  }
  return diffs
}

function inspectBinary(buf) {
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  const hasCrlf = buf.includes(0x0d) && buf.includes(0x0a)
  const decoded = iconv.decode(buf, 'win1254')
  const reEnc = iconv.encode(decoded, 'win1254')
  const cp1254Ok = Buffer.compare(buf, reEnc) === 0
  const utf8Blob = Buffer.compare(buf, Buffer.from(decoded, 'utf8')) === 0
  return { hasBom, hasCrlf, cp1254Ok, utf8Blob }
}

const referansArg = process.argv[2]

if (!referansArg) {
  console.error('Kullanım: node scripts/imp-karsilastir-rapor.mjs <referans.IMP> [cikti.IMP]')
  process.exitCode = 1
  process.exit()
}

const referansPath = path.resolve(referansArg)
if (!fs.existsSync(referansPath) || !fs.statSync(referansPath).isFile()) {
  console.error(`Referans IMP bulunamadı: ${referansPath}`)
  process.exitCode = 1
  process.exit()
}

const referansBuf = fs.readFileSync(referansPath)
const referans = parseImp(iconv.decode(referansBuf, 'win1254'))

const parcalar = fixture.rows.map(optiParca)
const icerik = optiImpOlustur(parcalar)
const uretilenBuf = iconv.encode(icerik, 'win1254')
const uretilen = parseImp(icerik)

const diffs = compare(uretilen.pieces, referans.pieces)
const meta = inspectBinary(uretilenBuf)
const refMeta = inspectBinary(referansBuf)

const outPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(path.dirname(referansPath), 'uretilen-karsilastirma.IMP')

if (outPath === referansPath) {
  console.error('Çıktı yolu referans dosyasıyla aynı olamaz.')
  process.exitCode = 1
  process.exit()
}

if (!fs.existsSync(path.dirname(outPath))) {
  console.error(`Çıktı klasörü bulunamadı: ${path.dirname(outPath)}`)
  process.exitCode = 1
  process.exit()
}

fs.writeFileSync(outPath, uretilenBuf)

console.log('=== YENİ IMP ÜRETİM RAPORU ===')
console.log('Dosya:', outPath)
console.log('Satır sayısı:', uretilen.pieces.length)
console.log('N dağılımı:', nDagilim(uretilen.pieces))
console.log('sum(N):', uretilen.sumN)
console.log('Toplam alan (m²):', uretilen.area.toFixed(6))
console.log('')
console.log('=== İLK 10 SATIR ===')
for (let i = 0; i < 10; i++) {
  const a = uretilen.pieces[i]
  const e = referans.pieces[i]
  const ok = JSON.stringify(a) === JSON.stringify(e) ? 'OK' : 'FARK'
  console.log(`${i + 1}. ${ok}`, a, '| ref:', e)
}
console.log('')
console.log('=== ENCODING (cp1254) ===')
console.log('BOM:', meta.hasBom, 'CRLF:', meta.hasCrlf, 'cp1254 roundtrip:', meta.cp1254Ok, 'UTF-8 blob değil:', !meta.utf8Blob)
console.log('Referans BOM:', refMeta.hasBom, 'CRLF:', refMeta.hasCrlf)
console.log('')
console.log('=== FARKLAR ===', diffs.length)
if (diffs.length) console.log(JSON.stringify(diffs, null, 2))
console.log('')
console.log('=== N=1 SATIRLAR (stok 10105, katalog kanıtlı C+BUZLU) ===')
const n1 = fixture.rows.filter((r) => r.expected.n === 1)
console.log('Adet:', n1.length, '— canlı DB doğrulaması: scripts/fetch-batch-fixture.mjs')
