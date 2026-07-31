import { describe, expect, it } from 'vitest'
import type { PermissionAction } from '@/auth/AuthContext'
import { getDefaultAuthorizedPath } from './accessNavigation'

function checker(permissions: string[]) {
  const allowed = new Set(permissions)
  return (module: string, action: PermissionAction) => allowed.has(`${module}:${action}`)
}

describe('getDefaultAuthorizedPath', () => {
  it('sends a settings-only user to settings', () => {
    expect(getDefaultAuthorizedPath(checker(['settings:read']))).toBe('/ayarlar')
  })

  it('prefers the dashboard when it is permitted', () => {
    expect(getDefaultAuthorizedPath(checker(['settings:read', 'dashboard:read']))).toBe('/')
  })

  it('sends a production-stations-only user to the station screen', () => {
    expect(getDefaultAuthorizedPath(checker(['production_stations:update']))).toBe('/istasyonlar')
  })

  it('sends a finance-only user to the currency-aware current account', () => {
    expect(getDefaultAuthorizedPath(checker(['finance:read']))).toBe('/cari-hesap?tur=musteri')
  })

  it('includes independent offers in pricing navigation order', () => {
    expect(getDefaultAuthorizedPath(checker(['pricing:read']))).toBe('/teklifler')
  })

  it('sends a costing-only user to cost calculation', () => {
    expect(getDefaultAuthorizedPath(checker(['costing:read']))).toBe('/fiyatlandirma')
  })

  it('uses the first customer workspace as the cari landing page', () => {
    expect(getDefaultAuthorizedPath(checker(['cari:read']))).toBe('/cari?tur=musteri&sekme=genel')
  })

  it('follows the new menu order when several business modules are permitted', () => {
    expect(getDefaultAuthorizedPath(checker([
      'costing:read',
      'orders:read',
      'finance:read',
    ]))).toBe('/cari-hesap?tur=musteri')
  })

  it('returns null when no application page is permitted', () => {
    expect(getDefaultAuthorizedPath(checker([]))).toBeNull()
  })
})
