/** Etiket üzerinde basılacak içerik alanları */
export interface EtiketIcerik {
  barkod: boolean         // Cam kodu barkodu (Code 128)
  cam_kodu: boolean       // Cam kodu metni (GLS-XXXX)
  musteri_adi: boolean    // Müşteri / nihai müşteri adı
  boyut: boolean          // Genişlik x Yükseklik (mm)
  sira_no: boolean        // Batch sıra numarası
  siparis_no: boolean     // Sipariş numarası
  tarih: boolean          // Baskı tarihi
}

/** Yazıcı bağlantı bilgileri */
export interface YaziciBaglanti {
  kopru_adresi: string    // yazici-kopru.exe'nin çalıştığı bilgisayarın IP'si (varsayılan localhost)
  yazici_adi: string      // Windows yazıcı adı (örn. "Datamax M-4206") — USB mod, boşsa TCP kullanılır
  ip_adresi: string       // TCP mod: köprüden görülen yazıcı IP'si
  port: number            // TCP mod: ham yazıcı portu (varsayılan 9100)
}

/** Etiket kağıt boyutu */
export interface EtiketBoyutu {
  genislik_mm: number     // Genişlik (mm)
  yukseklik_mm: number    // Yükseklik (mm)
}

/** Etiket basım ayarlarının tamamı */
export interface EtiketAyarlari {
  yazici: YaziciBaglanti
  boyut: EtiketBoyutu
  icerik: EtiketIcerik
  yazdirma_kosulu: 'otomatik' | 'manuel'
  dpl_sablonu: string     // Özel DPL şablonu (boşsa otomatik üretilir)
}

/** Supabase ayarlar tablosundaki bir satır */
export interface AyarlarRow {
  id: string
  anahtar: string
  deger: Record<string, unknown>
  guncelleme: string
}

// ── Varsayılan değerler ──────────────────────────────────────────────────────

export const VARSAYILAN_ETIKET_AYARLARI: EtiketAyarlari = {
  yazici: {
    kopru_adresi: 'localhost',
    yazici_adi: '',
    ip_adresi: '',
    port: 9100,
  },
  boyut: {
    genislik_mm: 100,
    yukseklik_mm: 50,
  },
  icerik: {
    barkod: true,
    cam_kodu: true,
    musteri_adi: true,
    boyut: true,
    sira_no: true,
    siparis_no: false,
    tarih: false,
  },
  yazdirma_kosulu: 'otomatik',
  dpl_sablonu: '',
}

// ── DPL Şablon Üretici (Datamax M-Serisi, 203 DPI) ──────────────────────────

/** Etiket üzerindeki örnek veri (önizleme için) */
export interface EtiketVeri {
  cam_kodu: string
  musteri: string
  genislik_mm: number
  yukseklik_mm: number
  sira_no: number | null
  siparis_no: string
}

/** Türkçe karakterleri ASCII karşılıklarına çevirir (DPL ASCII akışını bozmamak için) */
function ascii(str: string): string {
  return str
    .replace(/[şŞ]/g, s => s === 'ş' ? 's' : 'S')
    .replace(/[ğĞ]/g, g => g === 'ğ' ? 'g' : 'G')
    .replace(/[üÜ]/g, u => u === 'ü' ? 'u' : 'U')
    .replace(/[öÖ]/g, o => o === 'ö' ? 'o' : 'O')
    .replace(/[ıİ]/g, i => i === 'ı' ? 'i' : 'I')
    .replace(/[çÇ]/g, c => c === 'ç' ? 'c' : 'C')
    .replace(/[^\x20-\x7E]/g, '?')
}

/**
 * Datamax M-4206 (203 DPI) için DPL komutu üretir.
 *
 * Alan formatları (Datamax M-Class DPL Programming Reference):
 *   Metin : <dir>A<font><hmult><wmult><row4><col4><data>\r\n
 *   Barkod: <dir>B<id><narrow><height4><row4><col4><data>\r\n
 *     id=j → Code128 Auto (narrow sadece 1 char, wide parametresi YOK)
 *   dir=1 (0°), font=1-9, mult=1-9, row/col dot cinsinden 4 hane
 *
 * Header:
 *   \x02L\r\n   ← label başlangıcı
 *   D<h><s>\r\n ← heat(1-30), speed(1-3)  örn: D15  → orta yoğunluk
 *   Q1\r\n      ← adet = 1
 */
export function dplUret(ayarlar: EtiketAyarlari, veri: EtiketVeri): string {
  if (ayarlar.dpl_sablonu.trim()) {
    return dplSablonuUygula(ayarlar.dpl_sablonu, veri)
  }

  const ic = ayarlar.icerik
  const r  = (n: number) => n.toString().padStart(4, '0')

  const col     = 30    // sol kenar (dot)
  let   satir   = 25   // ilk satır (dot)
  const satirlar: string[] = []

  // Barkod — Code 128 Auto
  // Format: <dir>Bj<narrow1><height4><row4><col4><data>
  // NOT: Code128 için wide parametresi yok, sadece narrow
  if (ic.barkod) {
    satirlar.push(`1Bj2${r(80)}${r(satir)}${r(col)}${ascii(veri.cam_kodu)}\r\n`)
    satir += 105
  }

  // Cam Kodu — font=1, hmult=2, wmult=2
  if (ic.cam_kodu) {
    satirlar.push(`1A122${r(satir)}${r(col)}${ascii(veri.cam_kodu)}\r\n`)
    satir += 40
  }

  // Boyut — font=1, hmult=1, wmult=1
  if (ic.boyut) {
    satirlar.push(`1A111${r(satir)}${r(col)}${veri.genislik_mm}x${veri.yukseklik_mm}mm\r\n`)
    satir += 30
  }

  // Müşteri adı
  if (ic.musteri_adi) {
    satirlar.push(`1A111${r(satir)}${r(col)}${ascii(veri.musteri)}\r\n`)
    satir += 30
  }

  // Sıra no
  if (ic.sira_no && veri.sira_no !== null) {
    satirlar.push(`1A111${r(satir)}${r(col)}SIRA: ${veri.sira_no}\r\n`)
    satir += 30
  }

  // Sipariş no
  if (ic.siparis_no) {
    satirlar.push(`1A111${r(satir)}${r(col)}${ascii(veri.siparis_no)}\r\n`)
    satir += 30
  }

  // Tarih
  if (ic.tarih) {
    const tarih = new Date().toLocaleDateString('tr-TR')
    satirlar.push(`1A111${r(satir)}${r(col)}${tarih}\r\n`)
  }

  return `\x02L\r\nD15\r\n${satirlar.join('')}E\r\n`
}

/** Değişkenleri DPL şablonuna yerleştirir ({cam_kodu}, {musteri} vb.) */
export function dplSablonuUygula(sablon: string, veri: EtiketVeri): string {
  const bugun = new Date().toLocaleDateString('tr-TR')
  const icerik = sablon
    .replace(/\{cam_kodu\}/g, veri.cam_kodu)
    .replace(/\{musteri\}/g, ascii(veri.musteri))
    .replace(/\{genislik_mm\}/g, String(veri.genislik_mm))
    .replace(/\{yukseklik_mm\}/g, String(veri.yukseklik_mm))
    .replace(/\{boyut\}/g, `${veri.genislik_mm}x${veri.yukseklik_mm}mm`)
    .replace(/\{sira_no\}/g, String(veri.sira_no ?? ''))
    .replace(/\{siparis_no\}/g, veri.siparis_no)
    .replace(/\{tarih\}/g, bugun)
  // Escape dizilerini gerçek karakterlere çevir (template alanından girilen \x02, \r\n vb.)
  return icerik
    .replace(/\\x02/g, '\x02')
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
}
