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

  it('returns null when no application page is permitted', () => {
    expect(getDefaultAuthorizedPath(checker([]))).toBeNull()
  })
})
