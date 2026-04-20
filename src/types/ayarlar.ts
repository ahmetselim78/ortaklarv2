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
  ip_adresi: string       // Yazıcının ağ IP adresi
  port: number            // Ham yazıcı portu (varsayılan 9100)
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

/**
 * Verilen ayarlara ve etiket verisine göre DPL komutu üretir.
 * Datamax M-Serisi (203 DPI = ~8 dot/mm) için optimizedir.
 *
 * DPL temel yapısı:
 *   \x02L          → Etiket başlangıcı
 *   1A...          → Metin alanı (1=0°, A=font, hMult, wMult, row, col, data)
 *   1B...          → Barkod alanı (1=0°, B=barcode, tip, dar, geniş, yükseklik, row, col, data)
 *   E              → Etiket bitişi / yazdır
 */
export function dplUret(ayarlar: EtiketAyarlari, veri: EtiketVeri): string {
  if (ayarlar.dpl_sablonu.trim()) {
    // Özel şablon varsa değişkenleri yerleştir
    return dplSablonuUygula(ayarlar.dpl_sablonu, veri)
  }

  const dotsPerMm = 8 // 203 DPI ≈ 8 dot/mm
  const W = ayarlar.boyut.genislik_mm * dotsPerMm   // örn. 100mm → 800 dot
  const H = ayarlar.boyut.yukseklik_mm * dotsPerMm  // örn. 50mm  → 400 dot
  const ic = ayarlar.icerik

  // Satır konumları (üstten itibaren, dot)
  const margin   = 16   // sol kenar boşluğu
  const rowStart = 20   // ilk satır
  const rowStep  = 36   // satırlar arası mesafe

  let satir = rowStart
  const satirlar: string[] = []

  // Barkod — üstte geniş alan (Code 128, yükseklik 60 dot)
  if (ic.barkod) {
    satirlar.push(`1b2${margin.toString().padStart(4,'0')}${satir.toString().padStart(4,'0')}${veri.cam_kodu}\r\n`)
    satir += 80
  }

  // Cam Kodu metni (büyük font)
  if (ic.cam_kodu) {
    satirlar.push(`1A1200${satir.toString().padStart(4,'0')}${margin.toString().padStart(4,'0')}${veri.cam_kodu}\r\n`)
    satir += rowStep
  }

  // Boyut
  if (ic.boyut) {
    const boyutStr = `${veri.genislik_mm} x ${veri.yukseklik_mm} mm`
    satirlar.push(`1A1100${satir.toString().padStart(4,'0')}${margin.toString().padStart(4,'0')}${boyutStr}\r\n`)
    satir += rowStep
  }

  // Müşteri adı
  if (ic.musteri_adi) {
    satirlar.push(`1A1100${satir.toString().padStart(4,'0')}${margin.toString().padStart(4,'0')}${veri.musteri}\r\n`)
    satir += rowStep
  }

  // Sıra no
  if (ic.sira_no && veri.sira_no !== null) {
    satirlar.push(`1A1100${satir.toString().padStart(4,'0')}${margin.toString().padStart(4,'0')}SIRA: ${veri.sira_no}\r\n`)
    satir += rowStep
  }

  // Sipariş no
  if (ic.siparis_no) {
    satirlar.push(`1A1100${satir.toString().padStart(4,'0')}${margin.toString().padStart(4,'0')}${veri.siparis_no}\r\n`)
    satir += rowStep
  }

  // Tarih
  if (ic.tarih) {
    const bugun = new Date().toLocaleDateString('tr-TR')
    satirlar.push(`1A1100${satir.toString().padStart(4,'0')}${margin.toString().padStart(4,'0')}${bugun}\r\n`)
  }

  // W ve H kullanılmıştır — etiket boyut parametrelerini DPL'e yazabilirsiniz
  void W; void H

  return `\x02L\r\n${satirlar.join('')}E\r\n`
}

/** Değişkenleri DPL şablonuna yerleştirir ({cam_kodu}, {musteri} vb.) */
export function dplSablonuUygula(sablon: string, veri: EtiketVeri): string {
  const bugun = new Date().toLocaleDateString('tr-TR')
  return sablon
    .replace(/\{cam_kodu\}/g, veri.cam_kodu)
    .replace(/\{musteri\}/g, veri.musteri)
    .replace(/\{genislik_mm\}/g, String(veri.genislik_mm))
    .replace(/\{yukseklik_mm\}/g, String(veri.yukseklik_mm))
    .replace(/\{boyut\}/g, `${veri.genislik_mm} x ${veri.yukseklik_mm} mm`)
    .replace(/\{sira_no\}/g, String(veri.sira_no ?? ''))
    .replace(/\{siparis_no\}/g, veri.siparis_no)
    .replace(/\{tarih\}/g, bugun)
}
