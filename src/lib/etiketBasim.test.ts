import { afterEach, describe, expect, it, vi } from 'vitest'
import { etiketOtomatikYazdir } from './etiketBasim'
import { ORNEK_ETIKET_VERI } from './etiketOrnek'
import { VARSAYILAN_ETIKET_AYARLARI } from '@/types/ayarlar'

describe('etiketOtomatikYazdir', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('köprü yazıcıya teslimi onayladığında başarılı sonucu döndürür', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      basarili: true,
      mesaj: 'Yazıcıya gönderildi.',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await expect(etiketOtomatikYazdir(VARSAYILAN_ETIKET_AYARLARI, ORNEK_ETIKET_VERI)).resolves.toEqual({
      durum: 'yaziciya_gonderildi',
      mesaj: 'Yazıcıya gönderildi.',
    })
  })

  it('köprü hatasını baskı başarısız olarak bildirir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      hata: 'Yazıcı çevrimdışı.',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })))

    await expect(etiketOtomatikYazdir(VARSAYILAN_ETIKET_AYARLARI, ORNEK_ETIKET_VERI)).resolves.toEqual({
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
})
