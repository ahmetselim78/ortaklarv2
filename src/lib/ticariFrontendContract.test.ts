import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}))

import { ticariBugun, ticariPara, ticariTarih } from './ticariFormat'
import {
  cariHareketTersle,
  fiyatliSiparisIptal,
  fiyatliSiparisOlustur,
  fiyatOnizle,
  readinessRaporunuGetir,
  siparisTicariBelgesineDonustur,
  surumYayinla,
  tahsilatKaydet,
  teklifDurumDegistir,
  teklifRevizyonuOlustur,
  teklifTicariBelgesineDonustur,
  ticariEksikKayitRaporunuGetir,
  TicariRpcError,
  yeniIdempotencyAnahtari,
} from '@/services/ticariService'

describe('ticari formatter sözleşmesi', () => {
  it.each([
    ['TRY', '₺'],
    ['USD', '$'],
    ['EUR', '€'],
  ] as const)('%s tutarını iki hane ve Türkçe sayı düzeniyle gösterir', (paraBirimi, sembol) => {
    const sonuc = ticariPara(1234.5, paraBirimi)
    expect(sonuc).toContain(sembol)
    expect(sonuc).toContain('1.234,50')
  })

  it('numeric string kabul eder; geçersiz veya boş tutarı güvenli sıfır gösterir', () => {
    expect(ticariPara('19.9', 'TRY')).toContain('19,90')
    expect(ticariPara('geçersiz', 'TRY')).toContain('0,00')
    expect(ticariPara(null, 'EUR')).toContain('0,00')
  })

  it('tarihi Europe/Istanbul gün sınırında biçimlendirir', () => {
    expect(ticariTarih('2026-07-24T22:30:00.000Z')).toContain('25')
    expect(ticariTarih('2026-07-24T22:30:00.000Z', true)).toContain('01:30')
    expect(ticariTarih(null)).toBe('—')
    expect(ticariTarih('geçersiz-tarih')).toBe('geçersiz-tarih')
  })

  it('ticari varsayılan günü UTC yerine Europe/Istanbul takviminden üretir', () => {
    expect(ticariBugun(new Date('2026-07-24T21:30:00.000Z'))).toBe('2026-07-25')
  })
})

describe('ticari servis RPC sözleşmesi', () => {
  beforeEach(() => {
    supabaseMock.rpc.mockReset()
    supabaseMock.from.mockReset()
  })

  it('SQL readiness yanıtını UI modeline kayıpsız dönüştürür', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        hazir: false,
        kritik_eksik_sayisi: 1,
        readiness_hash: 'a'.repeat(64),
        kontrol_tarihi: '2026-07-26T12:00:00.000Z',
        kontroller: [
          {
            kontrol_kodu: 'aktif_urun_fiyatlari',
            kontrol_turu: 'dinamik',
            aciklama: 'Aktif ürün satış fiyatları',
            kritik: true,
            durum: 'basarisiz',
            sonuc_detayi: { eksik_sayisi: 2 },
          },
          {
            kontrol_kodu: 'golge_kapsami',
            kontrol_turu: 'manuel',
            aciklama: 'Gölge çalışma kabulü',
            kritik: false,
            durum: 'basarisiz',
            sonuc_detayi: {},
          },
          {
            kontrol_kodu: 'rls',
            aciklama: 'RLS kontrolleri',
            kritik: true,
            durum: 'basarili',
            sonuc_detayi: {},
          },
        ],
      },
      error: null,
    })

    await expect(readinessRaporunuGetir()).resolves.toEqual({
      uygun: false,
      mod: null,
      kontroller: [
        {
          kod: 'aktif_urun_fiyatlari',
          baslik: 'Aktif ürün satış fiyatları',
          kontrol_turu: 'dinamik',
          durum: 'kritik',
          mesaj: null,
          eksik_sayisi: 2,
          revision_no: null,
          onaylayan_kullanici_id: null,
          onay_gerekcesi: null,
        },
        {
          kod: 'golge_kapsami',
          baslik: 'Gölge çalışma kabulü',
          kontrol_turu: 'manuel',
          durum: 'uyari',
          mesaj: null,
          eksik_sayisi: null,
          revision_no: null,
          onaylayan_kullanici_id: null,
          onay_gerekcesi: null,
        },
        {
          kod: 'rls',
          baslik: 'RLS kontrolleri',
          kontrol_turu: 'dinamik',
          durum: 'basarili',
          mesaj: null,
          eksik_sayisi: null,
          revision_no: null,
          onaylayan_kullanici_id: null,
          onay_gerekcesi: null,
        },
      ],
      olusturulma_tarihi: '2026-07-26T12:00:00.000Z',
    })
    expect(supabaseMock.rpc).toHaveBeenCalledWith('ticari_modul_readiness')
  })

  it('tahsilat para birimini değiştirmeden tek idempotent RPC’ye iletir', async () => {
    const payload = {
      cari_id: '00000000-0000-4000-8000-000000000001',
      para_birimi: 'USD' as const,
      tutar: '125.50',
      tahsilat_yontemi: 'havale',
      islem_tarihi: '2026-07-26',
      aciklama: 'USD tahsilat',
      siparis_id: '00000000-0000-4000-8000-000000000002',
    }
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await tahsilatKaydet(payload, 'tahsilat-tekil-anahtar')

    expect(supabaseMock.rpc).toHaveBeenCalledOnce()
    expect(supabaseMock.rpc).toHaveBeenCalledWith('tahsilat_kaydet', {
      p_payload: payload,
      p_idempotency_key: 'tahsilat-tekil-anahtar',
    })
  })

  it('sipariş formunu normalize edip önizlemeye tek belge payload’ı olarak yollar', async () => {
    const belge = siparisTicariBelgesineDonustur({
      cari_id: '00000000-0000-4000-8000-000000000010',
      tarih: '2026-07-26',
      teslim_tarihi: '',
      kaynak: 'pdf',
      camlar: [{
        stok_id: '00000000-0000-4000-8000-000000000011',
        genislik_mm: '1234.5',
        yukseklik_mm: '987',
        adet: '2',
        cita_stok_id: '',
        menfez_cap_mm: '',
        kucuk_cam: true,
      }],
    })
    expect(belge).toMatchObject({
      belge_turu: 'siparis',
      tarih: '2026-07-26',
      teslim_tarihi: null,
      kaynak: 'pdf',
      satirlar: [{
        genislik_mm: 1234.5,
        yukseklik_mm: 987,
        adet: 2,
        cita_stok_id: null,
        menfez_cap_mm: null,
        kucuk_cam: true,
      }],
    })

    const onizleme = {
      onizleme_id: '00000000-0000-4000-8000-000000000012',
      sona_erme_tarihi: '2026-07-26T12:30:00.000Z',
      girdi_hash: 'a'.repeat(64),
      fiyat_baglam_hash: 'b'.repeat(64),
      sonuc_hash: 'c'.repeat(64),
      sonuc: {
        sonuc_hash: 'c'.repeat(64),
        gecerli: true,
      },
    }
    supabaseMock.rpc.mockResolvedValue({ data: onizleme, error: null })

    await expect(fiyatOnizle(belge)).resolves.toBe(onizleme)
    expect(supabaseMock.rpc).toHaveBeenCalledWith('fiyat_onizle', { p_belge: belge })
  })

  it('teklif revizyon önizlemesine belge kimliği, optimistic revision ve ticari alanları ekler', () => {
    const belge = teklifTicariBelgesineDonustur({
      cari_id: '00000000-0000-4000-8000-000000000020',
      tarih: '2026-07-26',
      belge_iskonto_yuzdesi: '5',
      belge_iskonto_tutari: '',
      manuel_fiyat_farki: '-2.50',
      manuel_yuvarlama_farki: '0.01',
      nakliye_satis_override: '90',
      nakliye_maliyet_override: '60',
      vade_gunu: '30',
      ticari_mudahale_gerekcesi: 'Kampanya',
      camlar: [{
        stok_id: '00000000-0000-4000-8000-000000000021',
        genislik_mm: '1000',
        yukseklik_mm: '1200',
        adet: '2',
        satir_iskonto_yuzdesi: '3',
        satir_iskonto_tutari: '',
        kenar_islemi_ucretsiz: true,
        menfez_ucretsiz: false,
        kucuk_cam_ucretsiz: true,
      }],
    }, {
      id: '00000000-0000-4000-8000-000000000022',
      revisionNo: 4,
    })

    expect(belge).toMatchObject({
      belge_turu: 'teklif',
      belge_id: '00000000-0000-4000-8000-000000000022',
      beklenen_revision_no: 4,
      belge_iskonto_yuzdesi: 5,
      belge_iskonto_tutari: null,
      manuel_fiyat_farki: -2.5,
      manuel_yuvarlama_farki: 0.01,
      nakliye_satis_override: 90,
      nakliye_maliyet_override: 60,
      vade_gunu: 30,
      ticari_mudahale_gerekcesi: 'Kampanya',
      satirlar: [{
        satir_iskonto_yuzdesi: 3,
        satir_iskonto_tutari: null,
        kenar_islemi_ucretsiz: true,
        menfez_ucretsiz: false,
        kucuk_cam_ucretsiz: true,
      }],
    })
  })

  it('eksik ticari kayıt raporunu tür ve tarih ile tek güvenli RPC’den ister', async () => {
    const satirlar = [{
      kaynak_turu: 'stok',
      kaynak_id: '00000000-0000-4000-8000-000000000024',
      kod: 'CAM-01',
      ad: 'Cam 01',
      detay: { neden: 'yayinda_ana_liste_stok_fiyati_yok' },
    }]
    supabaseMock.rpc.mockResolvedValue({ data: satirlar, error: null })

    await expect(
      ticariEksikKayitRaporunuGetir('satis_fiyati', '2026-07-26'),
    ).resolves.toEqual(satirlar)
    expect(supabaseMock.rpc).toHaveBeenCalledWith('ticari_eksik_kayit_raporu', {
      p_rapor_turu: 'satis_fiyati',
      p_tarih: '2026-07-26',
    })
  })

  it('sipariş kaydında preview kimliği/hash’i ve idempotency anahtarını aynen taşır', async () => {
    const onizleme = {
      onizleme_id: '00000000-0000-4000-8000-000000000013',
      sona_erme_tarihi: '2026-07-26T12:30:00.000Z',
      girdi_hash: 'a'.repeat(64),
      fiyat_baglam_hash: 'b'.repeat(64),
      sonuc_hash: 'c'.repeat(64),
      sonuc: {
        gecerli: true,
        hatalar: [],
        girdi_hash: 'a'.repeat(64),
        fiyat_baglam_hash: 'b'.repeat(64),
        sonuc_hash: 'c'.repeat(64),
        hesaplama_surumu: 'v1',
        para_birimi: 'TRY' as const,
        fiyatlandirma_tarihi: '2026-07-26',
        kdv_haric_tutar: 100,
        kdv_tutari: 20,
        genel_toplam: 120,
        satir_iskonto_tutari: 0,
        belge_iskonto_tutari: 0,
        manuel_fiyat_farki: 0,
        manuel_yuvarlama_farki: 0,
        hesaplama_yuvarlama_farki: 0,
        nakliye_override_farki: 0,
        vade_farki: 0,
        satirlar: [],
        bilesenler: [],
        kdv_ozetleri: [],
      },
    }
    const belge = { belge_turu: 'siparis', satirlar: [] }
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true, siparis_id: 'siparis' }, error: null })

    await fiyatliSiparisOlustur(belge, onizleme, 'siparis-tekil-anahtar')

    expect(supabaseMock.rpc).toHaveBeenCalledWith('siparis_fiyatli_olustur', {
      p_belge: belge,
      p_onizleme_id: onizleme.onizleme_id,
      p_onizleme_hash: onizleme.sonuc_hash,
      p_idempotency_key: 'siparis-tekil-anahtar',
    })
  })

  it('önizleme/kayıt bağlam çakışmasını kodu ve yeni sonucu ile typed hataya çevirir', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        gecerli: false,
        hata_kodu: 'FIYAT_ONIZLEME_CAKISMASI',
        degisen_kaynaklar: ['fiyat_listesi_surumu_id'],
        yeni_sonuc: { genel_toplam: 125 },
      },
      error: null,
    })

    const promise = fiyatliSiparisOlustur(
      {},
      {
        onizleme_id: '00000000-0000-4000-8000-000000000014',
        sona_erme_tarihi: '2026-07-26T12:30:00.000Z',
        girdi_hash: 'a'.repeat(64),
        fiyat_baglam_hash: 'b'.repeat(64),
        sonuc_hash: 'c'.repeat(64),
        sonuc: {} as never,
      },
      'cakisma-tekil-anahtar',
    )

    await expect(promise).rejects.toMatchObject({
      name: 'TicariRpcError',
      kod: 'FIYAT_ONIZLEME_CAKISMASI',
      detay: expect.objectContaining({
        degisen_kaynaklar: ['fiyat_listesi_surumu_id'],
        yeni_sonuc: { genel_toplam: 125 },
      }),
    } satisfies Partial<TicariRpcError>)
  })

  it('sipariş iptalinde beklenen revision, gerekçe ve idempotency anahtarını birlikte taşır', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await fiyatliSiparisIptal(
      '00000000-0000-4000-8000-000000000015',
      9,
      'Müşteri talebi',
      'iptal-tekil-anahtar',
    )

    expect(supabaseMock.rpc).toHaveBeenCalledWith('siparis_fiyatli_iptal', {
      p_siparis_id: '00000000-0000-4000-8000-000000000015',
      p_beklenen_revision_no: 9,
      p_gerekce: 'Müşteri talebi',
      p_idempotency_key: 'iptal-tekil-anahtar',
    })
  })

  it('cari tersleme gerekçesi ve idempotency anahtarını exact RPC parametreleriyle taşır', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await cariHareketTersle(
      '00000000-0000-4000-8000-000000000003',
      'Mükerrer tahsilat',
      'tersleme-tekil-anahtar',
    )

    expect(supabaseMock.rpc).toHaveBeenCalledWith('cari_hareket_tersle', {
      p_hareket_id: '00000000-0000-4000-8000-000000000003',
      p_gerekce: 'Mükerrer tahsilat',
      p_idempotency_key: 'tersleme-tekil-anahtar',
    })
  })

  it('yayınlama ve teklif revizyonunda revision/hash/idempotency alanlarını korur', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { basarili: true }, error: null })

    await surumYayinla(
      'maliyet_recete_surumu_yayinla',
      '00000000-0000-4000-8000-000000000004',
      7,
      'yayin-tekil-anahtar',
    )
    expect(supabaseMock.rpc).toHaveBeenLastCalledWith('maliyet_recete_surumu_yayinla', {
      p_surum_id: '00000000-0000-4000-8000-000000000004',
      p_beklenen_revision_no: 7,
      p_idempotency_key: 'yayin-tekil-anahtar',
    })

    const belge = { cari_id: '00000000-0000-4000-8000-000000000005', satirlar: [] }
    await teklifRevizyonuOlustur({
      teklifId: '00000000-0000-4000-8000-000000000006',
      beklenenRevisionNo: 3,
      belge,
      onizlemeId: '00000000-0000-4000-8000-000000000007',
      onizlemeHash: 'b'.repeat(64),
      idempotencyKey: 'teklif-tekil-anahtar',
    })
    expect(supabaseMock.rpc).toHaveBeenLastCalledWith('teklif_revizyonu_olustur', {
      p_teklif_id: '00000000-0000-4000-8000-000000000006',
      p_beklenen_revision_no: 3,
      p_belge: belge,
      p_onizleme_id: '00000000-0000-4000-8000-000000000007',
      p_onizleme_hash: 'b'.repeat(64),
      p_idempotency_key: 'teklif-tekil-anahtar',
    })
  })

  it('teklif durum geçişinde optimistic revision ve idempotency alanlarını birlikte taşır', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { basarili: true, durum: 'gonderildi', revision_no: 6 },
      error: null,
    })

    await teklifDurumDegistir(
      '00000000-0000-4000-8000-000000000023',
      5,
      'gonderildi',
      'teklif-durum-tekil-anahtar',
    )

    expect(supabaseMock.rpc).toHaveBeenCalledWith('teklif_durum_degistir', {
      p_teklif_id: '00000000-0000-4000-8000-000000000023',
      p_beklenen_revision_no: 5,
      p_yeni_durum: 'gonderildi',
      p_idempotency_key: 'teklif-durum-tekil-anahtar',
    })
  })

  it('RPC hatasını sessizce yutmaz ve her işlem için yeni UUID üretir', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { message: 'SISTEM_HAREKETI_MANUEL_TERSLENEMEZ' },
    })

    await expect(
      cariHareketTersle('hareket', 'gerekçe', 'anahtar-123'),
    ).rejects.toMatchObject({ kod: 'SISTEM_HAREKETI_MANUEL_TERSLENEMEZ' })

    const ilk = yeniIdempotencyAnahtari()
    const ikinci = yeniIdempotencyAnahtari()
    expect(ilk).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(ikinci).not.toBe(ilk)
  })
})
