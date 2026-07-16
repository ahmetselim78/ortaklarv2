import { afterEach, describe, expect, it, vi } from 'vitest'
import { etiketKopruSaglikKontrolu, etiketOtomatikYazdir } from './etiketBasim'
import { ORNEK_ETIKET_VERI } from './etiketOrnek'
import { VARSAYILAN_ETIKET_AYARLARI } from '@/types/ayarlar'

function yaziciAyarli() {
  const ayarlar = structuredClone(VARSAYILAN_ETIKET_AYARLARI)
  ayarlar.yazici.yazici_adi = 'Datamax M-4206'
  return ayarlar
}

describe('etiketOtomatikYazdir', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('köprü yazıcıya teslimi onayladığında başarılı sonucu döndürür', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      basarili: true,
      mesaj: 'Yazıcıya gönderildi.',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await expect(etiketOtomatikYazdir(yaziciAyarli(), ORNEK_ETIKET_VERI)).resolves.toEqual({
      durum: 'yaziciya_gonderildi',
      mesaj: 'Yazıcıya gönderildi.',
    })
  })

  it('köprü hatasını baskı başarısız olarak bildirir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      hata: 'Yazıcı çevrimdışı.',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })))

    await expect(etiketOtomatikYazdir(yaziciAyarli(), ORNEK_ETIKET_VERI)).resolves.toEqual({
      durum: 'basarisiz',
      mesaj: 'Yazıcı çevrimdışı.',
    })
  })

  it('otomatik baskı kapalıysa köprüye istek göndermeden devre dışı sonucunu döndürür', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const ayarlar = {
      ...VARSAYILAN_ETIKET_AYARLARI,
      yazdirma_kosulu: 'manuel' as const,
    }

    await expect(etiketOtomatikYazdir(ayarlar, ORNEK_ETIKET_VERI)).resolves.toEqual({
      durum: 'devre_disi',
      mesaj: 'Otomatik etiket baskısı kapalı.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('yazıcı adı ve IP boşsa localhost:9100 hedefine sessizce göndermez', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const ayarlar = structuredClone(VARSAYILAN_ETIKET_AYARLARI)

    await expect(etiketOtomatikYazdir(ayarlar, ORNEK_ETIKET_VERI)).resolves.toEqual({
      durum: 'devre_disi',
      mesaj: 'Windows Yazıcı Adı veya Yazıcı IP adresi ayarlı değil.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('etiketKopruSaglikKontrolu', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('köprü HTTP yanıtı veriyorsa bağlı sonucunu döndürür', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      durum: 'çalışıyor',
    }), { status: 200 })))

    await expect(etiketKopruSaglikKontrolu(yaziciAyarli())).resolves.toEqual({
      bagli: true,
      mesaj: 'localhost yazıcı köprüsü erişilebilir.',
    })
  })

  it('köprü adresi boşsa ağ isteği yapmaz', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const ayarlar = yaziciAyarli()
    ayarlar.yazici.kopru_adresi = ''

    await expect(etiketKopruSaglikKontrolu(ayarlar)).resolves.toEqual({
      bagli: false,
      mesaj: 'Köprü adresi ayarlı değil.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
