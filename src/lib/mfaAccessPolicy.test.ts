import { describe, expect, it } from 'vitest'
import { canEnrollTotp, canOpenMfaFlow } from '@/lib/mfaAccessPolicy'

describe('MFA erişim politikası', () => {
  it('admin izni olan hesabın MFA akışını açar', () => {
    expect(canOpenMfaFlow({ hasAdminPermission: true, mustChangePassword: false })).toBe(true)
  })

  it('yetkisiz doğrudan MFA erişimini reddeder', () => {
    expect(canOpenMfaFlow({ hasAdminPermission: false, mustChangePassword: false })).toBe(false)
  })

  it('zorunlu parola değişiminden gelen doğrulama akışına izin verir', () => {
    expect(canOpenMfaFlow({ hasAdminPermission: false, mustChangePassword: true, requestedDestination: '/parola-degistir' })).toBe(true)
  })

  it('sahte parola hedefini zorunluluk yoksa kabul etmez', () => {
    expect(canOpenMfaFlow({ hasAdminPermission: false, mustChangePassword: false, requestedDestination: '/parola-degistir' })).toBe(false)
  })

  it('yalnız admin yetkisinin yeni QR kaydı açmasına izin verir', () => {
    expect(canEnrollTotp(true)).toBe(true)
    expect(canEnrollTotp(false)).toBe(false)
  })
})

