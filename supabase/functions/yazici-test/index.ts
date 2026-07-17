// @ts-nocheck
import { errorResponse, handleOptions, json, requirePermission, ResponseError } from '../_shared/security.ts'

function privateIpv4(value: string): boolean {
  const parts = value.split('.').map(Number)
  if (parts.length !== 4 || parts.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return false
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options
  if (req.method !== 'POST') return json(req, { hata: 'Yalnızca POST desteklenir' }, 405)
  try {
    await requirePermission(req, 'settings', 'manage', true)
    const { ip, port, dpl } = await req.json()
    if (typeof ip !== 'string' || !privateIpv4(ip.trim())) throw new ResponseError(400, 'Yalnızca özel ağ yazıcı IPv4 adresleri kabul edilir')
    const portNum = Number(port)
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) throw new ResponseError(400, 'Geçersiz port')
    if (typeof dpl !== 'string' || !dpl || dpl.length > 65_536) throw new ResponseError(400, 'DPL komutu eksik veya çok uzun')
    let conn: Deno.TcpConn | undefined
    try {
      conn = await Deno.connect({ hostname: ip.trim(), port: portNum, transport: 'tcp' })
      await conn.write(new TextEncoder().encode(dpl))
    } finally { conn?.close() }
    return json(req, { basarili: true, mesaj: `${ip}:${portNum} adresine test etiketi gönderildi.` })
  } catch (error) {
    return errorResponse(req, error)
  }
})
