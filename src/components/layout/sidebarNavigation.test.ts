import { describe, expect, it } from 'vitest'
import {
  BOTTOM_SIDEBAR_NAVIGATION,
  getActiveSidebarGroupId,
  getActiveSidebarItemId,
  getVisibleSidebarNavigation,
  MAIN_SIDEBAR_NAVIGATION,
  SIDEBAR_GROUP_IDS,
  type SidebarPermissionChecker,
} from './sidebarNavigation'

function checker(...permissions: string[]): SidebarPermissionChecker {
  const allowed = new Set(permissions)
  return (module, action) => allowed.has(`${module}:${action}`)
}

describe('sidebarNavigation', () => {
  it('menüyü kararlaştırılan sırada tanımlar', () => {
    expect(MAIN_SIDEBAR_NAVIGATION.map(entry => (
      entry.kind === 'group'
        ? [entry.title, ...entry.children.map(child => child.label)]
        : entry.label
    ))).toEqual([
      'Ana Sayfa',
      ['İş Ortakları', 'Müşteriler', 'Tedarikçiler'],
      ['Satış', 'Satış Bağlantıları', 'Cari Hareketler', 'Teklifler'],
      ['Satın Alım', 'Alış Bağlantıları', 'Cari Hareketler'],
      ['Operasyonel Üretim', 'Sipariş Girişi', 'Üretim Emirleri', 'Üretim Planlama', 'Üretim İstasyonları', 'Saatlik Takip'],
      ['Finans', 'Ödeme Takibi', 'Bankalar'],
      'Stok',
      'Maliyet Hesaplama',
      'Üretim Girişi',
    ])
    expect(BOTTOM_SIDEBAR_NAVIGATION.map(item => item.label))
      .toEqual(['Admin Paneli', 'Ayarlar'])
    expect(SIDEBAR_GROUP_IDS)
      .toEqual(['partners', 'sales', 'purchasing', 'operational-production', 'finance'])
  })

  it('allOf izinlerinin tamamını arar ve görünür çocuğu kalmayan grubu gizler', () => {
    const onlyCari = getVisibleSidebarNavigation(
      MAIN_SIDEBAR_NAVIGATION,
      checker('cari:read'),
    )

    expect(onlyCari.map(entry => entry.kind === 'group' ? entry.id : entry.id))
      .toEqual(['partners'])
    expect(onlyCari[0]?.kind === 'group' ? onlyCari[0].children.map(child => child.id) : [])
      .toEqual(['customers', 'suppliers'])

    const cariAndPricing = getVisibleSidebarNavigation(
      MAIN_SIDEBAR_NAVIGATION,
      checker('cari:read', 'pricing:read'),
    )
    const sales = cariAndPricing.find(entry => entry.id === 'sales')
    expect(sales?.kind === 'group' ? sales.children.map(child => child.id) : [])
      .toEqual(['sales-connections', 'quotes'])
  })

  it('Maliyet Hesaplama görünürlüğünü pricing yerine costing iznine bağlar', () => {
    const withPricing = getVisibleSidebarNavigation(
      MAIN_SIDEBAR_NAVIGATION,
      checker('pricing:read'),
    )
    const withCosting = getVisibleSidebarNavigation(
      MAIN_SIDEBAR_NAVIGATION,
      checker('costing:read'),
    )

    expect(withPricing.some(entry => entry.id === 'costing')).toBe(false)
    expect(withCosting.some(entry => entry.id === 'costing')).toBe(true)
  })

  it('query kardeşlerinden yalnız tam bağlama uyan öğeyi aktif yapar ve cari kimliğini yok sayar', () => {
    const location = {
      pathname: '/cari',
      search: '?tur=tedarikci&sekme=siparisler&cari=cari-42',
    }

    expect(getActiveSidebarItemId(MAIN_SIDEBAR_NAVIGATION, location))
      .toBe('purchase-connections')
    expect(getActiveSidebarGroupId(MAIN_SIDEBAR_NAVIGATION, location))
      .toBe('purchasing')
  })

  it.each([
    ['?tur=musteri&sekme=genel', 'customers'],
    ['?tur=musteri&sekme=siparisler', 'customers'],
    ['?tur=musteri&sekme=hareketler', 'customers'],
    ['?tur=musteri&sekme=baglantilar', 'sales-connections'],
    ['?tur=tedarikci&sekme=genel', 'suppliers'],
    ['?tur=tedarikci&sekme=urunler', 'suppliers'],
    ['?tur=tedarikci&sekme=fiyatlar', 'suppliers'],
    ['?tur=tedarikci&sekme=gecmis', 'suppliers'],
    ['?tur=tedarikci&sekme=siparisler', 'purchase-connections'],
  ])('%s çalışma alanını doğru menü bağlamında tutar', (search, expectedItemId) => {
    expect(getActiveSidebarItemId(MAIN_SIDEBAR_NAVIGATION, {
      pathname: '/cari',
      search,
    })).toBe(expectedItemId)
  })

  it('eski query içermeyen cari rotasını varsayılan müşteri çalışma alanı sayar', () => {
    expect(getActiveSidebarItemId(MAIN_SIDEBAR_NAVIGATION, {
      pathname: '/cari',
      search: '',
    })).toBe('customers')
  })

  it('müşteri ve tedarikçi cari hareketlerini tur parametresiyle ayırır', () => {
    expect(getActiveSidebarItemId(MAIN_SIDEBAR_NAVIGATION, {
      pathname: '/cari-hesap',
      search: '?tur=musteri',
    })).toBe('sales-account-transactions')

    expect(getActiveSidebarItemId(MAIN_SIDEBAR_NAVIGATION, {
      pathname: '/cari-hesap',
      search: '?tur=tedarikci',
    })).toBe('purchase-account-transactions')
  })

  it('alt rotalarda ana öğeyi aktif tutar, benzer path öneklerini karıştırmaz', () => {
    expect(getActiveSidebarItemId(BOTTOM_SIDEBAR_NAVIGATION, {
      pathname: '/admin/roller',
      search: '',
    })).toBe('admin')

    expect(getActiveSidebarItemId(MAIN_SIDEBAR_NAVIGATION, {
      pathname: '/cari-hesap',
      search: '',
    })).toBeNull()
  })
})
