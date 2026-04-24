/**
 * Yazıcı Köprü Servisi — yazici-kopru.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Datamax M-Serisi (veya herhangi bir TCP/RAW yazıcı) için yerel HTTP köprüsü.
 *
 * KULLANIM:
 *   node yazici-kopru.js
 *
 * Varsayılan port: 9876  (değiştirmek için: node yazici-kopru.js --port 1234)
 *
 * Web uygulaması bu servise POST isteği atar:
 *   http://localhost:9876/yazdir
 *   Body: { "ip": "192.168.1.100", "port": 9100, "dpl": "<DPL komutu>" }
 *
 * Gereksinim: Node.js (ek paket gerekmez — sadece Node.js kurulu olmalı)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const http = require('http')
const net  = require('net')
const fs   = require('fs')
const os   = require('os')
const path = require('path')
const { exec } = require('child_process')

// ── Ayarlar ─────────────────────────────────────────────────────────────────
const KOPRU_PORT = (() => {
  const idx = process.argv.indexOf('--port')
  return idx !== -1 ? Number(process.argv[idx + 1]) || 9876 : 9876
})()

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ── TCP ile yazıcıya gönder ──────────────────────────────────────────────────
function yazicinaGonder(ip, port, dpl) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const TIMEOUT_MS = 5000

    socket.setTimeout(TIMEOUT_MS)

    socket.connect(port, ip, () => {
      socket.write(dpl, 'binary', () => {
        socket.end()
        resolve()
      })
    })

    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`Bağlantı zaman aşımı — ${ip}:${port} (${TIMEOUT_MS / 1000}s)`))
    })

    socket.on('error', (err) => {
      socket.destroy()
      reject(new Error(`TCP hatası: ${err.message}`))
    })
  })
}

// ── Windows yazıcı kuyruğuna doğrudan gönder (USB yazıcılar için) ────────────
function yazicinaDogrudenGonder(yaziciAdi, dpl) {
  return new Promise((resolve, reject) => {
    const tmpDir   = os.tmpdir()
    const dataFile = path.join(tmpDir, `etiket_${Date.now()}.bin`)
    const psFile   = path.join(tmpDir, `yazdir_${Date.now()}.ps1`)

    try {
      fs.writeFileSync(dataFile, Buffer.from(dpl, 'binary'))
    } catch (e) {
      return reject(new Error(`Geçici dosya yazılamadı: ${e.message}`))
    }

    const escapedData = dataFile.replace(/\\/g, '\\\\')

    let ps

    // ── Mod A: Doğrudan USB port yazma (USB001, USB002 ...) ──────────────────
    if (/^USB\d+$/i.test(yaziciAdi.trim())) {
      const portPath = `\\\\.\\${yaziciAdi.trim().toUpperCase()}`
      ps = `
$ErrorActionPreference = 'Stop'
$bytes = [System.IO.File]::ReadAllBytes('${escapedData}')
$stream = New-Object System.IO.FileStream('${portPath}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
try {
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Flush()
} finally {
  $stream.Close()
}`.trim()

    // ── Mod B: Windows print queue → port bul → direkt yaz ───────────────────
    } else {
      const escapedAdi = yaziciAdi.replace(/'/g, "''")
      ps = `
$ErrorActionPreference = 'Stop'
$bytes = [System.IO.File]::ReadAllBytes('${escapedData}')

# Yazici kuyrugundan fiziksel port adini bul
$portName = $null
try {
  $p = Get-Printer -Name '${escapedAdi}' -ErrorAction SilentlyContinue
  if ($p) { $portName = $p.PortName }
} catch {}

if ($portName -and ($portName -match '^USB' -or $portName -match '^COM' -or $portName -match '^LPT')) {
  # Surucu bypass: direkt USB/COM portuna yaz
  $devPath = '\\\\.\\\' + $portName
  $stream = New-Object System.IO.FileStream($devPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
  try {
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
  } finally {
    $stream.Close()
  }
  Write-Host "Direkt port: $portName ($($bytes.Length) byte)"
} else {
  # WinSpool fallback (ag yazicilar icin)
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinSpool {
    [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)]
    public static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
    [DllImport("winspool.drv",SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)]
    public static extern int StartDocPrinter(IntPtr h,int lv,ref DOCINFO di);
    [DllImport("winspool.drv",SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv",SetLastError=true)]
    public static extern bool WritePrinter(IntPtr h,byte[] b,int c,out int w);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Auto)]
    public struct DOCINFO {
        [MarshalAs(UnmanagedType.LPTStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPTStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPTStr)] public string pDataType;
    }
}
"@
  $h = [IntPtr]::Zero
  if (-not [WinSpool]::OpenPrinter('${escapedAdi}', [ref]$h, [IntPtr]::Zero)) {
      throw "Yazici acilamadi: ${escapedAdi} (port: $portName)"
  }
  $di = New-Object WinSpool+DOCINFO
  $di.pDocName = 'Etiket'
  $di.pOutputFile = $null
  $di.pDataType = 'RAW'
  [WinSpool]::StartDocPrinter($h, 1, [ref]$di) | Out-Null
  $w = 0
  [WinSpool]::WritePrinter($h, $bytes, $bytes.Length, [ref]$w) | Out-Null
  [WinSpool]::EndDocPrinter($h) | Out-Null
  [WinSpool]::ClosePrinter($h) | Out-Null
  Write-Host "WinSpool: $w byte yazildi"
}`.trim()
    }

    try {
      fs.writeFileSync(psFile, ps, 'utf8')
    } catch (e) {
      try { fs.unlinkSync(dataFile) } catch {}
      return reject(new Error(`PS dosyası yazılamadı: ${e.message}`))
    }

    exec(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${psFile}"`,
      { timeout: 15000 },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(dataFile) } catch {}
        try { fs.unlinkSync(psFile)   } catch {}
        if (err) {
          const mesaj = (stderr || err.message || '').trim()
          reject(new Error(`Doğrudan yazıcı hatası: ${mesaj}`))
        } else {
          const bilgi = (stdout || '').trim()
          console.log(`[${zaman()}]   ${bilgi}`)
          resolve()
        }
      }
    )
  })
}

// ── HTTP sunucu ──────────────────────────────────────────────────────────────
const sunucu = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/yazdir') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { ip: ipRaw, port, dpl, yazici_adi } = JSON.parse(body)

        if (!dpl || typeof dpl !== 'string') {
          res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ hata: 'dpl alanı zorunlu.' }))
          return
        }

        // ── Mod 1: Windows yazıcı adıyla doğrudan baskı (USB yazıcılar) ──
        if (yazici_adi && typeof yazici_adi === 'string' && yazici_adi.trim()) {
          const ad = yazici_adi.trim()
          console.log(`[${zaman()}] Gönderiliyor → "${ad}" (doğrudan)`)
          await yazicinaDogrudenGonder(ad, dpl)
          console.log(`[${zaman()}] ✓ Başarılı   → "${ad}"`)
          res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ basarili: true, mesaj: `"${ad}" yazıcısına gönderildi.` }))
          return
        }

        // ── Mod 2: TCP/IP (ağ yazıcılar) ──
        const ip = typeof ipRaw === 'string'
          ? ipRaw.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim()
          : ''
        const ipResolved = (ip === 'localhost' || ip === '') ? '127.0.0.1' : ip

        if (!ip) {
          res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ hata: 'yazici_adi veya ip alanı zorunlu.' }))
          return
        }

        const portNum = Number(port)
        if (!portNum || portNum < 1 || portNum > 65535) {
          res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ hata: 'Geçersiz port numarası.' }))
          return
        }

        console.log(`[${zaman()}] Gönderiliyor → ${ipResolved}:${portNum}`)
        await yazicinaGonder(ipResolved, portNum, dpl)
        console.log(`[${zaman()}] ✓ Başarılı   → ${ipResolved}:${portNum}`)

        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ basarili: true, mesaj: `${ip}:${portNum} adresine gönderildi.` }))

      } catch (err) {
        console.error(`[${zaman()}] ✗ Hata: ${err.message}`)
        res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ hata: err.message }))
      }
    })
    return
  }

  // ── Yazıcı listesi ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/yazicilar') {
    const ps = `
$result = [System.Collections.Generic.List[object]]::new()

# 1) Windows print queue listesi
try {
  Get-Printer | ForEach-Object {
    $result.Add([PSCustomObject]@{ Name=$_.Name; PortName=$_.PortName; Tip='Kuyruk' })
  }
} catch {}

# 2) USB Monitor registry'den USB printer portları
try {
  $regPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\USB Monitor\\Ports'
  if (Test-Path $regPath) {
    Get-ChildItem $regPath | ForEach-Object {
      $portName = $_.PSChildName
      $result.Add([PSCustomObject]@{ Name=$portName; PortName='USB Yazici Portu'; Tip='USB' })
    }
  }
} catch {}

# 3) Var olan USB00x portlarını registry'den (Print Ports)
try {
  $regPath2 = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\Local Port\\Ports'
  if (Test-Path $regPath2) {
    (Get-ItemProperty $regPath2).PSObject.Properties | Where-Object { $_.Name -match '^USB' } | ForEach-Object {
      if (-not ($result | Where-Object { $_.Name -eq $_.Name })) {
        $result.Add([PSCustomObject]@{ Name=$_.Name; PortName='Local USB'; Tip='USB' })
      }
    }
  }
} catch {}

if ($result.Count -gt 0) { $result | ConvertTo-Json -Compress } else { '[]' }
`.trim()
    const psFile = path.join(os.tmpdir(), `yazicilar_${Date.now()}.ps1`)
    try { fs.writeFileSync(psFile, ps, 'utf8') } catch {}
    exec(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${psFile}"`,
      { timeout: 12000, encoding: 'utf8' },
      (err, stdout) => {
        try { fs.unlinkSync(psFile) } catch {}
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' })
        try {
          const raw = (stdout || '').trim()
          const parsed = JSON.parse(raw || '[]')
          const arr = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : [])
          res.end(JSON.stringify({ yazicilar: arr }))
        } catch {
          res.end(JSON.stringify({ yazicilar: [], ham: (stdout || '').slice(0, 500) }))
        }
      }
    )
    return
  }

  // ── Debug: sistem durumu ─────────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/debug') {
    const ps = `
$out = @{}
try { $out['printers'] = @(Get-Printer | Select-Object Name,PortName,DriverName) } catch { $out['printers_err'] = $_.Exception.Message }
try { $out['ports'] = @(Get-PrinterPort | Select-Object Name,Description) } catch { $out['ports_err'] = $_.Exception.Message }
try {
  $usb = @(Get-WmiObject Win32_USBControllerDevice | ForEach-Object {
    $dep = [wmi]$_.Dependent
    [PSCustomObject]@{ Name=$dep.Name; Description=$dep.Description; DeviceID=$dep.DeviceID }
  } | Where-Object { $_.Name -match 'print|datamax|zebra|label|M-42|M42' -or $_.Description -match 'print' })
  $out['usb_printers'] = $usb
} catch { $out['usb_err'] = $_.Exception.Message }
try {
  $regPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors'
  $out['monitors'] = @(Get-ChildItem $regPath | Select-Object -ExpandProperty PSChildName)
} catch { $out['monitors_err'] = $_.Exception.Message }
$out | ConvertTo-Json -Depth 4 -Compress
`.trim()
    const psFile = path.join(os.tmpdir(), `debug_${Date.now()}.ps1`)
    try { fs.writeFileSync(psFile, ps, 'utf8') } catch {}
    exec(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${psFile}"`,
      { timeout: 15000, encoding: 'utf8' },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(psFile) } catch {}
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ stdout: (stdout || '').slice(0, 3000), stderr: (stderr || '').slice(0, 500) }))
      }
    )
    return
  }

  // Sağlık kontrolü
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ durum: 'çalışıyor', port: KOPRU_PORT }))
    return
  }

  res.writeHead(404, CORS)
  res.end()
})

function zaman() {
  return new Date().toLocaleTimeString('tr-TR')
}

sunucu.listen(KOPRU_PORT, '0.0.0.0', () => {
  console.log('─────────────────────────────────────────')
  console.log(' Yazıcı Köprü Servisi başlatıldı')
  console.log(`  Adres  : http://localhost:${KOPRU_PORT}`)
  console.log('  Durmak için Ctrl+C')
  console.log('─────────────────────────────────────────')
})
