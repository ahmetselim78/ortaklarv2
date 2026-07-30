import { teklifRevizyonDetayiniGetir } from '@/services/ticariService'
import type { Teklif, TeklifRevizyonu } from '@/types/ticari'

function html(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function numeric(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function para(value: unknown, paraBirimi: string) {
  return `${numeric(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${html(paraBirimi)}`
}

function tarih(value: unknown) {
  if (!value) return '—'
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime())
    ? html(value)
    : parsed.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export async function teklifYazdir(
  teklif: Teklif,
  revizyon: TeklifRevizyonu,
  musteriAdi: string,
) {
  const pencere = window.open('', '_blank')
  if (!pencere) throw new Error('Yazdırma penceresi açılamadı. Tarayıcı açılır pencere iznini kontrol edin.')
  pencere.opener = null
  pencere.document.write('<!doctype html><title>Teklif hazırlanıyor…</title><p style="font-family:sans-serif;padding:24px">Teklif hazırlanıyor…</p>')

  try {
    const { detaylar, kdvOzetleri } = await teklifRevizyonDetayiniGetir(revizyon.id)
    const snapshot = record(revizyon.belge_snapshot)
    const base = window.location.origin
    const satirlar = detaylar.map((detay) => {
      const satir = record(detay.satir_snapshot)
      const aciklama = detay.stok ? `${detay.stok.kod} · ${detay.stok.ad}` : detay.stok_id
      const ozellikler = [
        satir.kenar_islemi,
        satir.menfez_cap_mm ? `Menfez Ø${satir.menfez_cap_mm}` : null,
        satir.kucuk_cam === true ? 'Küçük cam' : null,
      ].filter(Boolean).join(', ')
      return `
        <tr>
          <td>${detay.satir_no}</td>
          <td>${html(satir.poz || '—')}</td>
          <td class="left"><strong>${html(aciklama)}</strong>${ozellikler ? `<small>${html(ozellikler)}</small>` : ''}</td>
          <td>${numeric(detay.genislik_mm).toLocaleString('tr-TR')} × ${numeric(detay.yukseklik_mm).toLocaleString('tr-TR')}</td>
          <td>${numeric(detay.adet).toLocaleString('tr-TR')}</td>
          <td>${numeric(detay.faturalanabilir_m2).toLocaleString('tr-TR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
          <td>${para(detay.birim_fiyat, revizyon.para_birimi)}</td>
          <td>${para(detay.net_tutar, revizyon.para_birimi)}</td>
        </tr>`
    }).join('')
    const kdvSatirlari = kdvOzetleri.map((ozet) => `
      <tr>
        <td class="left">${html(ozet.kdv_grubu?.ad || ozet.kdv_grubu?.kod || `KDV %${ozet.kdv_orani}`)}</td>
        <td>${numeric(ozet.kdv_orani).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}%</td>
        <td>${para(ozet.matrah, revizyon.para_birimi)}</td>
        <td>${para(ozet.kdv_tutari, revizyon.para_birimi)}</td>
      </tr>`).join('')

    const belge = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>${html(teklif.teklif_no)} R${String(revizyon.revizyon_no).padStart(2, '0')}</title>
  <style>
    @font-face { font-family: "Liberation Sans"; src: url("${base}/standard_fonts/LiberationSans-Regular.ttf") format("truetype"); font-weight: 400; }
    @font-face { font-family: "Liberation Sans"; src: url("${base}/standard_fonts/LiberationSans-Bold.ttf") format("truetype"); font-weight: 700; }
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: white; font: 12px/1.45 "Liberation Sans", Arial, sans-serif; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 15mm; }
    header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 3px solid #2563eb; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { width: 52px; height: 52px; object-fit: contain; }
    h1 { margin: 0; color: #0f2b54; font-size: 22px; }
    .subtitle { margin-top: 2px; color: #64748b; font-size: 11px; }
    .doc-title { text-align: right; }
    .doc-title strong { display: block; color: #2563eb; font-size: 18px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0; }
    .card { border: 1px solid #dbe3ef; border-radius: 8px; padding: 10px 12px; }
    .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    .value { margin-top: 3px; font-size: 13px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 7px 6px; color: #475569; background: #eff6ff; border: 1px solid #dbeafe; font-size: 9px; text-align: right; text-transform: uppercase; }
    td { padding: 7px 6px; border: 1px solid #e2e8f0; text-align: right; vertical-align: top; }
    th.left, td.left { text-align: left; }
    td small { display: block; margin-top: 2px; color: #64748b; font-weight: 400; }
    .bottom { display: grid; grid-template-columns: 1fr 75mm; gap: 16px; margin-top: 16px; align-items: start; }
    .summary td { border: 0; border-bottom: 1px solid #e2e8f0; }
    .summary .grand td { padding-top: 10px; color: #0f2b54; border-top: 2px solid #2563eb; border-bottom: 0; font-size: 15px; font-weight: 700; }
    .notes { min-height: 72px; white-space: pre-wrap; }
    footer { margin-top: 24px; padding-top: 9px; color: #64748b; border-top: 1px solid #dbe3ef; font-size: 9px; text-align: center; }
    .screen-actions { position: fixed; top: 14px; right: 14px; display: flex; gap: 8px; }
    .screen-actions button { padding: 9px 14px; color: white; background: #2563eb; border: 0; border-radius: 7px; cursor: pointer; font: 700 12px "Liberation Sans"; }
    @page { size: A4; margin: 0; }
    @media print {
      .screen-actions { display: none; }
      .page { margin: 0; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="screen-actions"><button onclick="window.print()">PDF / Yazdır</button></div>
  <main class="page">
    <header>
      <div class="brand">
        <img src="${base}/glassflow-logo.png" alt="Ortaklar Cam">
        <div><h1>ORTAKLAR CAM</h1><div class="subtitle">Cam üretim ve ticari çözümler</div></div>
      </div>
      <div class="doc-title"><span class="label">Bağımsız teklif</span><strong>${html(teklif.teklif_no)}</strong><span>R${String(revizyon.revizyon_no).padStart(2, '0')}</span></div>
    </header>
    <section class="meta">
      <div class="card"><div class="label">Müşteri</div><div class="value">${html(musteriAdi)}</div></div>
      <div class="card">
        <div><span class="label">Teklif tarihi</span> <strong>${tarih(revizyon.teklif_tarihi)}</strong></div>
        <div style="margin-top:5px"><span class="label">Geçerlilik</span> <strong>${tarih(revizyon.gecerlilik_tarihi)}</strong></div>
      </div>
    </section>
    <table>
      <thead><tr><th>#</th><th>Poz</th><th class="left">Ürün / açıklama</th><th>Ölçü (mm)</th><th>Adet</th><th>m²</th><th>Birim fiyat</th><th>Net tutar</th></tr></thead>
      <tbody>${satirlar || '<tr><td colspan="8">Satır bulunamadı.</td></tr>'}</tbody>
    </table>
    <section class="bottom">
      <div>
        <div class="card notes"><div class="label">Teklif notu</div><div style="margin-top:6px">${html(snapshot.notlar || '—')}</div></div>
        <table style="margin-top:12px">
          <thead><tr><th class="left">KDV grubu</th><th>Oran</th><th>Matrah</th><th>KDV</th></tr></thead>
          <tbody>${kdvSatirlari || '<tr><td colspan="4">KDV özeti bulunamadı.</td></tr>'}</tbody>
        </table>
      </div>
      <table class="summary">
        <tbody>
          <tr><td class="left">KDV hariç</td><td>${para(revizyon.kdv_haric_tutar, revizyon.para_birimi)}</td></tr>
          <tr><td class="left">KDV</td><td>${para(revizyon.kdv_tutari, revizyon.para_birimi)}</td></tr>
          <tr class="grand"><td class="left">Genel toplam</td><td>${para(revizyon.genel_toplam, revizyon.para_birimi)}</td></tr>
        </tbody>
      </table>
    </section>
    <footer>Bu teklif bağımsız bir ticari belgedir ve sipariş oluşturmaz. Teklif numarası: ${html(teklif.teklif_no)} · R${String(revizyon.revizyon_no).padStart(2, '0')}</footer>
  </main>
</body>
</html>`

    pencere.document.open()
    pencere.document.write(belge)
    pencere.document.close()
    pencere.focus()
  } catch (error) {
    pencere.close()
    throw error
  }
}
