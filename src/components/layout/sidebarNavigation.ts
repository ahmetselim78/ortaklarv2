import type { PermissionAction } from '@/auth/AuthContext'

export type SidebarIconName =
  | 'bank'
  | 'calculator'
  | 'calendarClock'
  | 'clipboardCheck'
  | 'clipboardList'
  | 'factory'
  | 'fileText'
  | 'gauge'
  | 'handshake'
  | 'home'
  | 'link'
  | 'package'
  | 'radio'
  | 'settings'
  | 'shield'
  | 'shoppingCart'
  | 'trendingUp'
  | 'truck'
  | 'user'
  | 'users'
  | 'wallet'

export interface SidebarPermissionRequirement {
  module: string
  action?: PermissionAction
}

export interface SidebarNavItem {
  kind: 'item'
  id: string
  to: string
  label: string
  icon: SidebarIconName
  end?: boolean
  newTab?: boolean
  allOf: readonly SidebarPermissionRequirement[]
  activeQuery?: {
    required: Readonly<Record<string, string>>
    defaults?: Readonly<Record<string, string>>
    excluded?: Readonly<Record<string, readonly string[]>>
  }
}

export interface SidebarNavGroup {
  kind: 'group'
  id: string
  title: string
  icon: SidebarIconName
  children: readonly SidebarNavItem[]
}

export type SidebarNavEntry = SidebarNavItem | SidebarNavGroup
export type SidebarPermissionChecker = (module: string, action: PermissionAction) => boolean
export type SidebarLocation = Pick<Location, 'pathname' | 'search'>

const read = (module: string): SidebarPermissionRequirement => ({ module, action: 'read' })

export const MAIN_SIDEBAR_NAVIGATION: readonly SidebarNavEntry[] = [
  {
    kind: 'item',
    id: 'home',
    to: '/',
    label: 'Ana Sayfa',
    icon: 'home',
    end: true,
    allOf: [read('dashboard')],
  },
  {
    kind: 'group',
    id: 'partners',
    title: 'İş Ortakları',
    icon: 'handshake',
    children: [
      {
        kind: 'item',
        id: 'customers',
        to: '/cari?tur=musteri&sekme=genel',
        label: 'Müşteriler',
        icon: 'user',
        allOf: [read('cari')],
        activeQuery: {
          required: { tur: 'musteri' },
          defaults: { tur: 'musteri' },
          excluded: { sekme: ['baglantilar'] },
        },
      },
      {
        kind: 'item',
        id: 'suppliers',
        to: '/cari?tur=tedarikci&sekme=genel',
        label: 'Tedarikçiler',
        icon: 'truck',
        allOf: [read('cari')],
        activeQuery: {
          required: { tur: 'tedarikci' },
          excluded: { sekme: ['siparisler'] },
        },
      },
    ],
  },
  {
    kind: 'group',
    id: 'sales',
    title: 'Satış',
    icon: 'trendingUp',
    children: [
      {
        kind: 'item',
        id: 'sales-connections',
        to: '/cari?tur=musteri&sekme=baglantilar',
        label: 'Satış Bağlantıları',
        icon: 'link',
        allOf: [read('cari'), read('pricing')],
      },
      {
        kind: 'item',
        id: 'sales-account-transactions',
        to: '/cari-hesap?tur=musteri',
        label: 'Cari Hareketler',
        icon: 'wallet',
        allOf: [read('finance')],
      },
      {
        kind: 'item',
        id: 'quotes',
        to: '/teklifler',
        label: 'Teklifler',
        icon: 'fileText',
        allOf: [read('pricing')],
      },
    ],
  },
  {
    kind: 'group',
    id: 'purchasing',
    title: 'Satın Alım',
    icon: 'shoppingCart',
    children: [
      {
        kind: 'item',
        id: 'purchase-connections',
        to: '/cari?tur=tedarikci&sekme=siparisler',
        label: 'Alış Bağlantıları',
        icon: 'link',
        allOf: [read('cari'), read('costing')],
      },
      {
        kind: 'item',
        id: 'purchase-account-transactions',
        to: '/cari-hesap?tur=tedarikci',
        label: 'Cari Hareketler',
        icon: 'wallet',
        allOf: [read('finance')],
      },
    ],
  },
  {
    kind: 'group',
    id: 'operational-production',
    title: 'Operasyonel Üretim',
    icon: 'factory',
    children: [
      {
        kind: 'item',
        id: 'order-entry',
        to: '/siparisler',
        label: 'Sipariş Girişi',
        icon: 'clipboardList',
        allOf: [read('orders')],
      },
      {
        kind: 'item',
        id: 'production-orders',
        to: '/uretim',
        label: 'Üretim Emirleri',
        icon: 'factory',
        allOf: [read('production')],
      },
      {
        kind: 'item',
        id: 'production-planning',
        to: '/uretim-planlama',
        label: 'Üretim Planlama',
        icon: 'calendarClock',
        allOf: [read('production')],
      },
      {
        kind: 'item',
        id: 'production-stations',
        to: '/istasyonlar',
        label: 'Üretim İstasyonları',
        icon: 'radio',
        allOf: [{ module: 'production_stations', action: 'update' }],
      },
      {
        kind: 'item',
        id: 'hourly-tracking',
        to: '/saatlik-takip',
        label: 'Saatlik Takip',
        icon: 'gauge',
        allOf: [read('hourly_tracking')],
      },
    ],
  },
  {
    kind: 'group',
    id: 'finance',
    title: 'Finans',
    icon: 'bank',
    children: [
      {
        kind: 'item',
        id: 'payment-tracking',
        to: '/odeme-takibi',
        label: 'Ödeme Takibi',
        icon: 'calendarClock',
        allOf: [read('finance')],
      },
      {
        kind: 'item',
        id: 'banks',
        to: '/bankalar',
        label: 'Bankalar',
        icon: 'bank',
        allOf: [read('finance')],
      },
    ],
  },
  {
    kind: 'item',
    id: 'inventory',
    to: '/stok',
    label: 'Stok',
    icon: 'package',
    allOf: [read('inventory')],
  },
  {
    kind: 'item',
    id: 'costing',
    to: '/fiyatlandirma',
    label: 'Maliyet Hesaplama',
    icon: 'calculator',
    allOf: [read('costing')],
  },
  {
    kind: 'item',
    id: 'production-entry',
    to: '/istasyonlar/uretim-giris',
    label: 'Üretim Girişi',
    icon: 'clipboardCheck',
    newTab: true,
    allOf: [{ module: 'production_entry', action: 'create' }],
  },
]

export const BOTTOM_SIDEBAR_NAVIGATION: readonly SidebarNavItem[] = [
  {
    kind: 'item',
    id: 'admin',
    to: '/admin',
    label: 'Admin Paneli',
    icon: 'shield',
    allOf: [{ module: 'admin', action: 'manage' }],
  },
  {
    kind: 'item',
    id: 'settings',
    to: '/ayarlar',
    label: 'Ayarlar',
    icon: 'settings',
    allOf: [read('settings')],
  },
]

export const SIDEBAR_GROUP_IDS = MAIN_SIDEBAR_NAVIGATION
  .filter((entry): entry is SidebarNavGroup => entry.kind === 'group')
  .map(group => group.id)

export function canSeeSidebarItem(
  item: SidebarNavItem,
  hasPermission: SidebarPermissionChecker,
): boolean {
  return item.allOf.every(requirement => (
    hasPermission(requirement.module, requirement.action ?? 'read')
  ))
}

export function getVisibleSidebarNavigation(
  entries: readonly SidebarNavEntry[],
  hasPermission: SidebarPermissionChecker,
): SidebarNavEntry[] {
  return entries.flatMap<SidebarNavEntry>(entry => {
    if (entry.kind === 'item') {
      return canSeeSidebarItem(entry, hasPermission) ? [entry] : []
    }

    const children = entry.children.filter(child => canSeeSidebarItem(child, hasPermission))
    return children.length > 0 ? [{ ...entry, children }] : []
  })
}

function normalizedPathname(pathname: string): string {
  if (pathname === '/') return pathname
  return pathname.replace(/\/+$/, '')
}

export function isSidebarItemActive(
  item: SidebarNavItem,
  location: SidebarLocation,
): boolean {
  if (item.newTab) return false

  const target = new URL(item.to, 'https://sidebar.local')
  const currentPath = normalizedPathname(location.pathname)
  const targetPath = normalizedPathname(target.pathname)
  const matchesPath = item.end
    ? currentPath === targetPath
    : currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)

  if (!matchesPath) return false

  const currentSearch = new URLSearchParams(location.search)
  const requiredQuery = item.activeQuery?.required
    ?? Object.fromEntries(target.searchParams.entries())
  for (const [key, expectedValue] of Object.entries(requiredQuery)) {
    const actualValue = currentSearch.get(key) ?? item.activeQuery?.defaults?.[key] ?? null
    if (actualValue !== expectedValue) return false
  }

  for (const [key, excludedValues] of Object.entries(item.activeQuery?.excluded ?? {})) {
    const actualValue = currentSearch.get(key) ?? item.activeQuery?.defaults?.[key] ?? null
    if (actualValue !== null && excludedValues.includes(actualValue)) return false
  }

  return true
}

export function getActiveSidebarItemId(
  entries: readonly SidebarNavEntry[],
  location: SidebarLocation,
): string | null {
  for (const entry of entries) {
    if (entry.kind === 'item') {
      if (isSidebarItemActive(entry, location)) return entry.id
      continue
    }

    const activeChild = entry.children.find(child => isSidebarItemActive(child, location))
    if (activeChild) return activeChild.id
  }

  return null
}

export function getActiveSidebarGroupId(
  entries: readonly SidebarNavEntry[],
  location: SidebarLocation,
): string | null {
  const activeItemId = getActiveSidebarItemId(entries, location)
  if (!activeItemId) return null

  return entries.find(entry => (
    entry.kind === 'group' && entry.children.some(child => child.id === activeItemId)
  ))?.id ?? null
}
