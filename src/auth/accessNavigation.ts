import type { PermissionAction } from '@/auth/AuthContext'

export interface AppDestination {
  path: string
  module: string
  action: PermissionAction
}

// Birden fazla izni olan hesaplarda ana menü sırası açılış önceliğidir.
export const APP_DESTINATIONS: AppDestination[] = [
  { path: '/', module: 'dashboard', action: 'read' },
  { path: '/saatlik-takip', module: 'hourly_tracking', action: 'read' },
  { path: '/cari', module: 'cari', action: 'read' },
  { path: '/stok', module: 'inventory', action: 'read' },
  { path: '/siparisler', module: 'orders', action: 'read' },
  { path: '/uretim', module: 'production', action: 'read' },
  { path: '/istasyonlar', module: 'production_stations', action: 'update' },
  { path: '/istasyonlar/uretim-giris', module: 'production_entry', action: 'create' },
  { path: '/ayarlar', module: 'settings', action: 'read' },
  { path: '/admin', module: 'admin', action: 'manage' },
]

type PermissionChecker = (module: string, action: PermissionAction) => boolean

export function getDefaultAuthorizedPath(hasPermission: PermissionChecker) {
  return APP_DESTINATIONS.find(destination =>
    hasPermission(destination.module, destination.action),
  )?.path ?? null
}
