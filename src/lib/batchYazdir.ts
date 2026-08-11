import type { UretimEmri, UretimEmriDetay } from '@/types/uretim'
import { fizikselGlsKodu } from '@/lib/siparisDetay'

type BatchSiparisGrup = {
  key: string
  siparisNo: string
  hariciSiparisNo: string | null
  siparisTarihi: string | null
  teslimTarihi: string | null
  teslimatTipi: string | null
  musteriAd: string
  altMusteri: string | null
  satirlar: UretimEmriDetay[]
}

export type BatchFormDetayi = 'ozet' | 'detayli'

const URETIM_DURUM_ETIKET: Record<string, string> = {
  hazirlaniyor: 'Hazırlanıyor',
  export_edildi: 'Export Edildi',
  yikamada: 'Yıkamada',
  tamamlandi: 'Tamamlandı',
  eksik_var: 'Eksik Var',
  iptal: 'İptal',
}

const TESLIMAT_TIPI_ETIKET: Record<string, string> = {
  teslim_alacak: 'Müşteri Teslim Alacak',
  sevkiyat: 'Sevkiyat',
}

function htmlKacis(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function tarihYaz(value: string | null | undefined, saat = false): string {
  if (!value) return '—'
  const yalnizcaTarih = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (yalnizcaTarih) return `${yalnizcaTarih[3]}.${yalnizcaTarih[2]}.${yalnizcaTarih[1]}`
  const tarih = new Date(value)
  if (Number.isNaN(tarih.getTime())) return htmlKacis(value)
  return new Intl.DateTimeFormat('tr-TR', saat
    ? { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }
    : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(tarih)
}

function sayiYaz(value: number, basamak = 2): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: basamak,
    maximumFractionDigits: basamak,
  }).format(value)
}

function camAdedi(detay: UretimEmriDetay): number {
  return detay.siparis_detaylari?.adet ?? 1
}

function camM2(detay: UretimEmriDetay): number {
  const cam = detay.siparis_detaylari
  if (!cam) return 0
  return (camAdedi(detay) * cam.genislik_mm * cam.yukseklik_mm) / 1_000_000
}

export function batchSiparisGruplariOlustur(detaylar: UretimEmriDetay[]): BatchSiparisGrup[] {
  const gruplar = new Map<string, BatchSiparisGrup>()

  for (const detay of detaylar) {
    const siparis = detay.siparis_detaylari?.siparisler
    const key = siparis?.id ?? 'siparis-bilgisi-yok'
    const mevcut = gruplar.get(key)
    if (mevcut) {
      mevcut.satirlar.push(detay)
      continue
    }

    gruplar.set(key, {
      key,
      siparisNo: siparis?.siparis_no ?? '—',
      hariciSiparisNo: siparis?.harici_siparis_no ?? null,
      siparisTarihi: siparis?.tarih ?? null,
      teslimTarihi: siparis?.teslim_tarihi ?? null,
      teslimatTipi: siparis?.teslimat_tipi ?? null,
      musteriAd: siparis?.cari?.ad ?? '—',
      altMusteri: siparis?.alt_musteri ?? null,
      satirlar: [detay],
    })
  }

  return [...gruplar.values()]
}

/** A4 dikey batch takip formunun tam HTML belgesini üretir. */
export function batchYazdirmaHtml(
  emir: UretimEmri,
  detaylar: UretimEmriDetay[],
  yazdirmaTarihi = new Date(),
  formDetayi: BatchFormDetayi = 'detayli',
): string {
  const gruplar = batchSiparisGruplariOlustur(detaylar)
  const toplamAdet = detaylar.reduce((toplam, detay) => toplam + camAdedi(detay), 0)
  const toplamM2 = detaylar.reduce((toplam, detay) => toplam + camM2(detay), 0)
  const durum = URETIM_DURUM_ETIKET[emir.durum] ?? emir.durum
  const detayli = formDetayi === 'detayli'

  const siparisKartlari = gruplar.map((grup, index) => {
    const adet = grup.satirlar.reduce((toplam, detay) => toplam + camAdedi(detay), 0)
    const m2 = grup.satirlar.reduce((toplam, detay) => toplam + camM2(detay), 0)
    const teslimat = grup.teslimatTipi
      ? TESLIMAT_TIPI_ETIKET[grup.teslimatTipi] ?? grup.teslimatTipi
      : '—'
    const detayTablosu = detayli
      ? `<div class="detail-wrap">
          <div class="detail-title">Cam Detayları</div>
          <table class="detail-table">
            <colgroup>
              <col class="col-sira"><col class="col-poz"><col class="col-cam">
              <col class="col-size"><col class="col-count"><col class="col-note">
            </colgroup>
            <thead>
              <tr>
                <th>Sıra No</th><th>Poz</th><th>Cam Cinsi</th><th>Boyut</th>
                <th>Adet</th><th>İşlem / Not</th>
              </tr>
            </thead>
            <tbody>${grup.satirlar.map((detay) => {
              const cam = detay.siparis_detaylari
              const notlar = [cam?.kenar_islemi, cam?.notlar].filter(Boolean).join(' · ')
              return `<tr>
                <td class="center mono">${htmlKacis(fizikselGlsKodu(detay.sira_no, cam?.cam_kodu) || '—')}</td>
                <td>${htmlKacis(cam?.poz || '—')}</td>
                <td>${htmlKacis(cam?.stok?.ad ?? '—')}</td>
                <td class="center mono">${htmlKacis(cam ? `${cam.genislik_mm}×${cam.yukseklik_mm}` : '—')}</td>
                <td class="number"><strong>${camAdedi(detay)}</strong></td>
                <td>${htmlKacis(notlar || '—')}</td>
              </tr>`
            }).join('')}</tbody>
          </table>
        </div>`
      : ''

    return `
      <section class="order-card ${detayli ? 'detail-mode' : 'summary-mode'}">
        <div class="order-heading">
          <div class="order-title">LİSTE ${index + 1} · <span>${htmlKacis(grup.siparisNo)}</span></div>
          <div class="order-count"><strong>${adet} CAM</strong> · ${sayiYaz(m2)} m²</div>
        </div>
        <div class="order-info">
          <div><span class="info-label">Müşteri</span><strong>${htmlKacis(grup.musteriAd)}</strong></div>
          <div><span class="info-label">Nihai Müşteri</span><strong>${htmlKacis(grup.altMusteri ?? '—')}</strong></div>
          <div><span class="info-label">Sipariş / Ref</span><strong>${htmlKacis(grup.siparisNo)}</strong>${grup.hariciSiparisNo ? ` · ${htmlKacis(grup.hariciSiparisNo)}` : ''}</div>
          <div><span class="info-label">Sipariş Tarihi</span><strong>${tarihYaz(grup.siparisTarihi)}</strong></div>
          <div><span class="info-label">Teslim Tarihi</span><strong>${tarihYaz(grup.teslimTarihi)}</strong></div>
          <div><span class="info-label">Teslim Şekli</span><strong>${htmlKacis(teslimat)}</strong></div>
          <div class="info-wide"><span class="info-label">Adet</span><strong>${adet}</strong></div>
        </div>
        ${detayTablosu}
        <div class="list-note">
          <strong>Listeye Özel Not:</strong>
          <div class="note-line"></div>
          <div class="note-line"></div>
        </div>
      </section>`
  }).join('')

  const batchNotu = emir.notlar
    ? `<div class="batch-note"><strong>Batch Notu:</strong> ${htmlKacis(emir.notlar).replaceAll('\n', '<br>')}</div>`
    : ''

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlKacis(emir.batch_no)} - ${detayli ? 'Detaylı' : 'Özet'} Üretim Takip Formu</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 8.5px; line-height: 1.3; }
    h1, h2, p { margin: 0; }
    .header { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 7px; border-bottom: 2px solid #111827; }
    .title { font-size: 16px; letter-spacing: .2px; }
    .form-type { margin-left: 5px; color: #4b5563; font-size: 10px; font-weight: 400; }
    .batch-no { margin-top: 2px; font: 700 12px Consolas, monospace; }
    .print-meta { text-align: right; color: #4b5563; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 7px 0; }
    .summary-item { min-height: 34px; padding: 4px 6px; border: 1px solid #9ca3af; border-radius: 3px; }
    .summary-label { color: #6b7280; font-size: 7px; text-transform: uppercase; letter-spacing: .3px; }
    .summary-value { margin-top: 1px; font-size: 10.5px; font-weight: 700; }
    .batch-note { margin-bottom: 7px; padding: 5px 7px; border: 1px solid #9ca3af; background: #f9fafb; }
    h2 { margin: 8px 0 5px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 3px; border: 1px solid #9ca3af; vertical-align: top; overflow-wrap: anywhere; }
    th { color: #111827; background: #e5e7eb; font-size: 6.5px; text-align: left; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .center { text-align: center; }
    .number { text-align: right; font-variant-numeric: tabular-nums; }
    .mono { font-family: Consolas, monospace; }
    .order-card { margin-top: 7px; border: 1.2px solid #4b5563; border-radius: 3px; }
    .summary-mode { break-inside: avoid; page-break-inside: avoid; }
    .detail-mode { break-inside: auto; page-break-inside: auto; }
    .order-heading { display: flex; justify-content: space-between; gap: 8px; padding: 5px 7px; background: #d1d5db; break-after: avoid; page-break-after: avoid; }
    .order-title { font-size: 10px; font-weight: 700; }
    .order-title span { font-family: Consolas, monospace; }
    .order-count { white-space: nowrap; }
    .order-info { display: grid; grid-template-columns: repeat(2, 1fr); border-top: 1px solid #9ca3af; }
    .order-info > div { min-height: 29px; padding: 4px 6px; border-right: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; }
    .order-info > div:nth-child(2n) { border-right: 0; }
    .order-info > .info-wide { grid-column: 1 / -1; border-right: 0; }
    .info-label { display: block; margin-bottom: 1px; color: #6b7280; font-size: 6.7px; text-transform: uppercase; letter-spacing: .25px; }
    .detail-wrap { padding: 5px 6px 0; }
    .detail-title { margin-bottom: 3px; font-size: 8px; font-weight: 700; }
    .detail-table { table-layout: fixed; font-size: 6.7px; }
    .col-sira { width: 9%; } .col-poz { width: 10%; } .col-cam { width: 38%; }
    .col-size { width: 20%; } .col-count { width: 8%; } .col-note { width: 15%; }
    .list-note { min-height: 24mm; margin: 5px 6px 6px; padding: 5px 6px; border: 1px solid #6b7280; break-inside: avoid; page-break-inside: avoid; }
    .note-line { height: 9mm; border-bottom: 1px dotted #9ca3af; }
    .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; margin-top: 18px; break-inside: avoid; page-break-inside: avoid; }
    .signature { min-height: 42px; padding-top: 4px; border-top: 1px solid #4b5563; color: #4b5563; text-align: center; }
    .footer-note { margin-top: 6px; color: #6b7280; font-size: 7.5px; }
    @media screen {
      body { max-width: 794px; margin: 18px auto; padding: 24px; background: white; box-shadow: 0 8px 30px rgba(0,0,0,.12); }
      html { background: #e5e7eb; }
      .order-card { overflow: hidden; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <h1 class="title">ÜRETİM BATCH TAKİP FORMU <span class="form-type">${detayli ? 'DETAYLI' : 'ÖZET'}</span></h1>
      <div class="batch-no">${htmlKacis(emir.batch_no)}</div>
    </div>
    <div class="print-meta">
      <div><strong>Oluşturulma:</strong> ${tarihYaz(emir.olusturulma_tarihi, true)}</div>
      <div><strong>Çıktı:</strong> ${tarihYaz(yazdirmaTarihi.toISOString(), true)}</div>
    </div>
  </header>

  <div class="summary-grid">
    <div class="summary-item"><div class="summary-label">Durum</div><div class="summary-value">${htmlKacis(durum)}</div></div>
    <div class="summary-item"><div class="summary-label">Sipariş</div><div class="summary-value">${gruplar.length}</div></div>
    <div class="summary-item"><div class="summary-label">Adet</div><div class="summary-value">${toplamAdet} adet</div></div>
    <div class="summary-item"><div class="summary-label">Toplam Alan</div><div class="summary-value">${sayiYaz(toplamM2)} m²</div></div>
    <div class="summary-item"><div class="summary-label">Export Tarihi</div><div class="summary-value">${tarihYaz(emir.export_tarihi)}</div></div>
  </div>

  ${batchNotu}

  <h2>Batch İçindeki Listeler (${gruplar.length})</h2>
  ${siparisKartlari}

  <div class="signatures">
    <div class="signature">Üretime Veren / Tarih</div>
    <div class="signature">Teslim Alan / Tarih</div>
  </div>
  <div class="footer-note">Bu form ${htmlKacis(emir.batch_no)} batch kaydındaki bilgilerden otomatik oluşturulmuştur.</div>
</body>
</html>`
}

/** Yazdırma penceresini açar. Popup engellenirse false döner. */
export function batchTakipFormuYazdir(
  emir: UretimEmri,
  detaylar: UretimEmriDetay[],
  formDetayi: BatchFormDetayi = 'detayli',
): boolean {
  const yazdirmaPenceresi = window.open('', '_blank', 'width=1200,height=850')
  if (!yazdirmaPenceresi) return false

  yazdirmaPenceresi.opener = null
  yazdirmaPenceresi.document.open()
  yazdirmaPenceresi.document.write(batchYazdirmaHtml(emir, detaylar, new Date(), formDetayi))
  yazdirmaPenceresi.document.close()

  window.setTimeout(() => {
    yazdirmaPenceresi.focus()
    yazdirmaPenceresi.print()
  }, 250)

  return true
}
