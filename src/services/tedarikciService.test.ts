import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  tedarikciSiparisineFaturaIsle,
  tedarikciSiparisiniOdendiIsaretle,
  tedarikciSiparisleriniGetir,
  tedarikciSiparisiOlustur,
  tedarikciStokBaglantilariniGetir,
  tedarikciStokBaglantisiKaydet,
  tedarikciStokBaglantisiPasiflestir,
} from './tedarikciService'

describe('tedarikçi sipariş takip servisi', () => {
  beforeEach(() => {
    supabaseMock.rpc.mockReset()
  })

  it('siparişleri sunucunun hesapladığı takip durumuyla getirir', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{
        id: '10000000-0000-4000-8000-000000000001',
        vade_gunu: 60,
        siparis_tutari: '125000.50',
        fatura_tutari: null,
        kalan_gun: null,
        revision_no: 1,
        durum: 'fatura_bekliyor',
      }],
      error: null,
    })

    await expect(tedarikciSiparisleriniGetir('10000000-0000-4000-8000-000000000002'))
      .resolves.toEqual([expect.objectContaining({
        durum: 'fatura_bekliyor',
        siparis_tutari: 125000.5,
        vade_gunu: 60,
      })])
    expect(supabaseMock.rpc).toHaveBeenCalledWith('tedarikci_siparislerini_getir', {
      p_tedarikci_id: '10000000-0000-4000-8000-000000000002',
    })
  })

  it('portal siparişini idempotency anahtarıyla oluşturur', async () => {
    const payload = {
      tedarikci_id: '10000000-0000-4000-8000-000000000002',
      portal_siparis_no: 'SC-2026-1001',
      siparis_tarihi: '2026-07-27',
      vade_gunu: 90,
      para_birimi: 'TRY' as const,
    }
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await tedarikciSiparisiOlustur(payload, 'siparis-idempotency')

    expect(supabaseMock.rpc).toHaveBeenCalledWith('tedarikci_siparisi_olustur', {
      p_payload: payload,
      p_idempotency_key: 'siparis-idempotency',
    })
  })

  it('faturayı revision kontrolüyle siparişe işler', async () => {
    const payload = {
      fatura_no: 'FAT-2026-77',
      fatura_tarihi: '2026-07-30',
      fatura_tutari: '135000',
    }
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await tedarikciSiparisineFaturaIsle(
      '10000000-0000-4000-8000-000000000001',
      1,
      payload,
      'fatura-idempotency',
    )

    expect(supabaseMock.rpc).toHaveBeenCalledWith('tedarikci_siparisine_fatura_isle', {
      p_siparis_id: '10000000-0000-4000-8000-000000000001',
      p_revision_no: 1,
      p_payload: payload,
      p_idempotency_key: 'fatura-idempotency',
    })
  })

  it.each(['', '0', '-10', 'geçersiz'])(
    'pozitif olmayan veya boş fatura tutarını RPC çağırmadan reddeder: %s',
    async (faturaTutari) => {
      await expect(tedarikciSiparisineFaturaIsle(
        '10000000-0000-4000-8000-000000000001',
        1,
        {
          fatura_no: 'FAT-2026-77',
          fatura_tarihi: '2026-07-30',
          fatura_tutari: faturaTutari,
        },
        'fatura-gecersiz-idempotency',
      )).rejects.toThrow('Fatura numarası, tarihi ve tutarını kontrol edin.')

      expect(supabaseMock.rpc).not.toHaveBeenCalled()
    },
  )

  it('ödeme tarihini ayrı işlem olarak kaydeder', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await tedarikciSiparisiniOdendiIsaretle(
      '10000000-0000-4000-8000-000000000001',
      2,
      '2026-09-28',
      'odeme-idempotency',
    )

    expect(supabaseMock.rpc).toHaveBeenCalledWith('tedarikci_siparisini_odendi_isaretle', {
      p_siparis_id: '10000000-0000-4000-8000-000000000001',
      p_revision_no: 2,
      p_odeme_tarihi: '2026-09-28',
      p_idempotency_key: 'odeme-idempotency',
    })
  })

  it('tedarikçiye özel ürün kataloğunu yalnız seçili cari kimliğiyle getirir', async () => {
    const katalog = {
      tedarikci: { id: 'tedarikci-1', kod: 'C-0008', ad: 'MHM Profil', aktif: true, tedarik_kapsamlari: ['cita'] },
      baglantilar: [],
      adaylar: [{ stok_id: 'stok-1', stok_kodu: 'CITA-AL-009', stok_adi: '9 mm Alüminyum Çıta', kategori: 'cita', birim: 'metre', hizmet_turu: null }],
      ozet: { aktif_baglanti_sayisi: 0, pasif_baglanti_sayisi: 0, aday_sayisi: 1 },
    }
    supabaseMock.rpc.mockResolvedValue({ data: katalog, error: null })

    await expect(tedarikciStokBaglantilariniGetir('tedarikci-1')).resolves.toEqual(katalog)
    expect(supabaseMock.rpc).toHaveBeenCalledWith('tedarikci_stok_baglantilarini_getir', {
      p_tedarikci_id: 'tedarikci-1',
    })
  })

  it('ürün bağlantısını payload ve idempotency anahtarıyla kaydeder', async () => {
    const payload = {
      tedarikci_id: 'tedarikci-1',
      stok_id: 'stok-1',
      marka: 'MHM',
      varsayilan_vade_gunu: 60,
      kaynak_ekran: 'cari_tedarikci_detayi',
    }
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await tedarikciStokBaglantisiKaydet(payload, 'baglanti-idempotency')

    expect(supabaseMock.rpc).toHaveBeenCalledWith('tedarikci_stok_baglantisi_kaydet', {
      p_payload: payload,
      p_idempotency_key: 'baglanti-idempotency',
    })
  })

  it('birden fazla ürünü tek atomik RPC payloadıyla bağlar', async () => {
    const payload = {
      tedarikci_id: 'tedarikci-1',
      stok_ids: ['stok-1', 'stok-2', 'stok-3'],
      marka: 'Ortak marka',
      varsayilan_vade_gunu: 30,
      kaynak_ekran: 'cari_tedarikci_detayi',
    }
    supabaseMock.rpc.mockResolvedValue({
      data: { basarili: true, islem: 'toplu_olusturuldu', adet: 3 },
      error: null,
    })

    await tedarikciStokBaglantisiKaydet(payload, 'toplu-baglanti-idempotency')

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1)
    expect(supabaseMock.rpc).toHaveBeenCalledWith('tedarikci_stok_baglantisi_kaydet', {
      p_payload: payload,
      p_idempotency_key: 'toplu-baglanti-idempotency',
    })
  })

  it('ürün bağlantısını revision ve gerekçe korumasıyla pasife alır', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await tedarikciStokBaglantisiPasiflestir(
      'baglanti-1',
      3,
      'Bu tedarikçiden artık alınmıyor.',
      'pasif-idempotency',
    )

    expect(supabaseMock.rpc).toHaveBeenCalledWith('tedarikci_stok_baglantisi_pasiflestir', {
      p_baglanti_id: 'baglanti-1',
      p_beklenen_revision_no: 3,
      p_gerekce: 'Bu tedarikçiden artık alınmıyor.',
      p_idempotency_key: 'pasif-idempotency',
    })
  })
})
