import { describe, expect, it } from 'vitest'
import type { UretimEmri, UretimEmriDetay } from '@/types/uretim'
import { batchSiparisGruplariOlustur, batchYazdirmaHtml } from './batchYazdir'

const emir: UretimEmri = {
  id: 'batch-1',
  batch_no: 'BATCH-2026-0001',
  durum: 'hazirlaniyor',
  notlar: 'Öncelikli üretim',
  olusturulma_tarihi: '2026-08-11T07:30:00.000Z',
  export_tarihi: null,
}

function detay(
  id: string,
  siparisId: string,
  siparisNo: string,
  musteri: string,
  adet: number,
  teslimTarihi: string,
): UretimEmriDetay {
  return {
    id,
    uretim_emri_id: emir.id,
    siparis_detay_id: `siparis-detay-${id}`,
    sira_no: Number(id.replace(/\D/g, '')),
    siparis_detaylari: {
      cam_kodu: `GLS-${id}`,
      genislik_mm: 1000,
      yukseklik_mm: 800,
      adet,
      kenar_islemi: null,
      notlar: null,
      poz: `P-${id}`,
      cita_stok_id: null,
      stok: { ad: '4+16+4 Isıcam' },
      cita_stok: null,
      siparisler: {
        id: siparisId,
        siparis_no: siparisNo,
        harici_siparis_no: `REF-${siparisNo}`,
        tarih: '2026-08-10',
        teslim_tarihi: teslimTarihi,
        teslimat_tipi: 'sevkiyat',
        alt_musteri: 'Nihai Müşteri',
        cari: { ad: musteri },
      },
    },
  }
}

describe('batch yazdırma formu', () => {
  const detaylar = [
    detay('1', 'sip-1', 'SIP-001', 'Müşteri <A>', 2, '2026-08-20'),
    detay('2', 'sip-1', 'SIP-001', 'Müşteri <A>', 1, '2026-08-20'),
    detay('3', 'sip-2', 'SIP-002', 'Müşteri B', 3, '2026-08-22'),
  ]

  it('aynı siparişe ait cam satırlarını tek müşteri grubunda toplar', () => {
    const gruplar = batchSiparisGruplariOlustur(detaylar)

    expect(gruplar).toHaveLength(2)
    expect(gruplar[0].satirlar).toHaveLength(2)
    expect(gruplar[1].satirlar).toHaveLength(1)
  })

  it('batch, müşteri, adet ve teslim tarihi bilgilerini güvenli HTML olarak üretir', () => {
    const html = batchYazdirmaHtml(emir, detaylar, new Date('2026-08-11T09:00:00.000Z'))

    expect(html).toContain('BATCH-2026-0001')
    expect(html).toContain('Müşteri &lt;A&gt;')
    expect(html).not.toContain('Müşteri <A>')
    expect(html).toContain('20.08.2026')
    expect(html).toContain('22.08.2026')
    expect(html).not.toContain('Toplam Cam')
    expect(html).toContain('>6 adet<')
    expect(html).toContain('@page { size: A4 portrait;')
    expect(html).toContain('Cam Detayları')
    expect(html).toContain('<th>Sıra No</th>')
    expect(html).not.toContain('<th>#</th>')
    expect(html).not.toContain('<th>Çıta</th>')
    expect(html).not.toContain('<th>Kontrol</th>')
    expect(html).not.toContain('Üretim Kontrol / Tarih')
    expect(html).not.toContain('Cam Satırı')
    expect(html).not.toContain('Cam Adedi')
    expect(html.match(/class="info-label">Adet/g)).toHaveLength(2)
  })

  it('özet formda her liste için boş not alanı üretir, cam detaylarını gizler', () => {
    const html = batchYazdirmaHtml(
      emir,
      detaylar,
      new Date('2026-08-11T09:00:00.000Z'),
      'ozet',
    )

    expect(html).toContain('ÖZET')
    expect(html).toContain('Batch İçindeki Listeler (2)')
    expect(html.match(/Listeye Özel Not:/g)).toHaveLength(2)
    expect(html).not.toContain('Cam Detayları')
    expect(html).not.toContain('Cam Satırı')
    expect(html).not.toContain('Cam Adedi')
    expect(html.match(/class="info-label">Adet/g)).toHaveLength(2)
    expect(html).not.toContain('>Kesim<')
    expect(html).not.toContain('>Yıkama<')
    expect(html).not.toContain('>Kontrol<')
    expect(html).not.toContain('Üretim Kontrol / Tarih')
    expect(html).toContain('Üretime Veren / Tarih')
    expect(html).toContain('Teslim Alan / Tarih')
    expect(html).toContain('@page { size: A4 portrait;')
  })
})
