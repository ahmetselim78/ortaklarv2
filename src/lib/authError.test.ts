import { describe, expect, it } from 'vitest'
import { getSignInErrorMessage } from './authError'

describe('getSignInErrorMessage', () => {
  it('yalnız geçersiz kimlik bilgisinde parola hatası gösterir', () => {
    expect(getSignInErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
      .toBe('E-posta veya parola hatalı.')
  })

  it('bağlantı hatasını parola hatası gibi göstermez', () => {
    expect(getSignInErrorMessage({ message: 'Failed to fetch' }))
      .toContain('Giriş sunucusuna ulaşılamadı')
  })

  it('sunucu hatasını geçici hizmet hatası olarak gösterir', () => {
    expect(getSignInErrorMessage({ status: 503, message: 'Service unavailable' }))
      .toContain('Giriş hizmeti şu anda yanıt vermiyor')
  })
})
