import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  stokAktiflikAyarla,
  stokBaslangicKataloguDurumunuGetir,
  stokBaslangicKatalogunuKur,
  stokHareketiKaydet,
  stokHareketleriniGetir,
  stokKartiOlustur,
  stokKatalogunuGetir,
  stokSatisKapsamiAyarla,
} from './stokService'

describe('stokService', () => {
  beforeEach(() => supabaseMock.rpc.mockReset())

  it('katalogu tek RPC ile ve sayısal kullanım adetleriyle getirir', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ id: 'stok-1', kullaniliyor: true, kullanimlar: [{ alan: 'siparis', adet: '2' }] }],
      error: null,
    })
    const sonuc = await stokKatalogunuGetir()
    expect(supabaseMock.rpc).toHaveBeenCalledOnce()
    expect(supabaseMock.rpc).toHaveBeenCalledWith('stok_katalogu_getir')
    expect(sonuc[0].kullanimlar[0].adet).toBe(2)
  })

  it('stok kodunu veritabanının otomatik üretmesi için boş gönderir', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { id: 'stok-2' }, error: null })
    await stokKartiOlustur({
      kod: '',
      ad: 'Butil',
      kategori: 'yan_malzeme',
      grup: null,
      katman_yapisi: null,
      kalinlik_mm: null,
      birim: 'kg',
      marka: null,
      minimum_miktar: 5,
      stok_yeri: 'Raf 2',
    })
    expect(supabaseMock.rpc).toHaveBeenCalledWith('stok_karti_olustur', {
      p_payload: expect.objectContaining({ kod: '', minimum_miktar: 5, stok_yeri: 'Raf 2' }),
    })
  })

  it('stok hareketlerini sayısal alanlara dönüştürür', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ id: 'h-1', miktar: '12.5', net_miktar: '-12.5', bakiye_sonrasi: '7.5' }],
      error: null,
    })
    const sonuc = await stokHareketleriniGetir('stok-1', 25)
    expect(supabaseMock.rpc).toHaveBeenCalledWith('stok_hareketlerini_getir', {
      p_stok_id: 'stok-1',
      p_limit: 25,
    })
    expect(sonuc[0]).toEqual(expect.objectContaining({ miktar: 12.5, net_miktar: -12.5, bakiye_sonrasi: 7.5 }))
  })

  it('hareket kaydını idempotency anahtarıyla RPCye gönderir', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { id: 'h-2', miktar: '4', net_miktar: '4', bakiye_sonrasi: '4' }, error: null })
    await stokHareketiKaydet({
      stok_id: 'stok-1',
      hareket_turu: 'alis_girisi',
      miktar: 4,
      tedarikci_id: 'ted-1',
      islem_tarihi: '2026-07-27T12:00:00+03:00',
      aciklama: 'Mal kabul',
    }, 'stok-test-idem')
    expect(supabaseMock.rpc).toHaveBeenCalledWith('stok_hareketi_kaydet', {
      p_payload: expect.objectContaining({ stok_id: 'stok-1', miktar: 4 }),
      p_idempotency_key: 'stok-test-idem',
    })
  })

  it('aktiflik ve satış kapsamını ayrı RPC çağrılarıyla değiştirir', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'her_ikisi', error: null })
    await stokAktiflikAyarla('stok-1', false)
    await stokSatisKapsamiAyarla('stok-1', true)
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(1, 'stok_aktiflik_ayarla', { p_id: 'stok-1', p_aktif: false })
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(2, 'stok_satis_kapsami_ayarla', { p_id: 'stok-1', p_etkin: true })
  })

  it('kullanım kilidi sunucu hatasını anlaşılır mesaja çevirir', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'KULLANILAN_STOK_SILINEMEZ' } })
    await expect(stokAktiflikAyarla('stok-1', false)).rejects.toThrow('kullanımda')
  })

  it('105 katalog durumunu kurulu ve çakışma alanlarıyla birebir dönüştürür', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        katalog_surumu: '105',
        toplam: '128',
        mevcut: '115',
        uyumlu: '113',
        cakisan: '2',
        eksik: '13',
        kurulu: false,
        kategoriler: {
          cam: { toplam: '115', mevcut: '115', uyumlu: '113', cakisan: '2', eksik: '0' },
          cita: { toplam: '9', mevcut: '0', uyumlu: '0', cakisan: '0', eksik: '9' },
          yan_malzeme: { toplam: '4', mevcut: '0', uyumlu: '0', cakisan: '0', eksik: '4' },
        },
      },
      error: null,
    })

    const sonuc = await stokBaslangicKataloguDurumunuGetir()

    expect(supabaseMock.rpc).toHaveBeenCalledWith('stok_baslangic_katalogu_durumu')
    expect(sonuc).toEqual(expect.objectContaining({
      katalog_surumu: '105',
      toplam: 128,
      mevcut: 115,
      uyumlu: 113,
      cakisan: 2,
      eksik: 13,
      kurulu: false,
      tamamlandi: false,
    }))
    expect(sonuc.kategoriler.cam).toEqual(expect.objectContaining({
      kategori: 'cam',
      toplam: 115,
      mevcut: 115,
      uyumlu: 113,
      cakisan: 2,
      eksik: 0,
    }))
  })

  it('105 kurulum sonucunu idempotency anahtarıyla ve kategori dağılımıyla dönüştürür', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        basarili: true,
        katalog_surumu: '105',
        toplam: '128',
        mevcut: '115',
        eklenen: '13',
        eksik: '0',
        cakisan: '2',
        kurulu: true,
        kategori_dagilimi: {
          cam: { toplam: 115, mevcut: 115, uyumlu: 113, cakisan: 2, eksik: 0, eklenen: 0 },
          cita: { toplam: 9, mevcut: 0, uyumlu: 9, cakisan: 0, eksik: 0, eklenen: 9 },
          yan_malzeme: { toplam: 4, mevcut: 0, uyumlu: 4, cakisan: 0, eksik: 0, eklenen: 4 },
        },
      },
      error: null,
    })

    const sonuc = await stokBaslangicKatalogunuKur('katalog-idem-1')

    expect(supabaseMock.rpc).toHaveBeenCalledWith('stok_baslangic_katalogunu_kur', {
      p_idempotency_key: 'katalog-idem-1',
    })
    expect(sonuc).toEqual(expect.objectContaining({
      katalog_surumu: '105',
      toplam: 128,
      mevcut: 115,
      eksik: 0,
      eklenen: 13,
      cakisan: 2,
      kurulu: true,
      tamamlandi: true,
    }))
    expect(sonuc.kategoriler.cita).toEqual({
      kategori: 'cita',
      toplam: 9,
      mevcut: 0,
      uyumlu: 9,
      cakisan: 0,
      eksik: 0,
      eklenen: 9,
    })
  })
})
