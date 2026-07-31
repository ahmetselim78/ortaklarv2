import { describe, expect, it, vi } from 'vitest'
import {
  getEffectiveSidebarExpandedGroups,
  readSidebarCollapsed,
  readSidebarExpandedGroups,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_EXPANDED_GROUPS_STORAGE_KEY,
  toggleSidebarExpandedGroup,
  writeSidebarCollapsed,
  writeSidebarExpandedGroups,
} from './sidebarState'

describe('sidebarState', () => {
  it('yalnızca kaydedilmiş true değerini daraltılmış kabul eder', () => {
    expect(readSidebarCollapsed({ getItem: () => 'true' })).toBe(true)
    expect(readSidebarCollapsed({ getItem: () => 'false' })).toBe(false)
    expect(readSidebarCollapsed({ getItem: () => null })).toBe(false)
    expect(readSidebarCollapsed({ getItem: () => 'invalid' })).toBe(false)
  })

  it('daraltma tercihini beklenen anahtarla kaydeder', () => {
    const setItem = vi.fn()

    writeSidebarCollapsed(true, { setItem })

    expect(setItem).toHaveBeenCalledWith(SIDEBAR_COLLAPSED_STORAGE_KEY, 'true')
  })

  it('depolama erişimi engellendiğinde açık görünümle devam eder', () => {
    const blockedStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }

    expect(readSidebarCollapsed(blockedStorage)).toBe(false)
    expect(() => writeSidebarCollapsed(true, blockedStorage)).not.toThrow()
    expect(readSidebarExpandedGroups(['sales', 'finance'], blockedStorage)).toEqual(['sales', 'finance'])
    expect(() => writeSidebarExpandedGroups(['sales'], blockedStorage)).not.toThrow()
  })

  it('ilk kullanımda tüm menü gruplarını açık başlatır', () => {
    const groups = ['partners', 'sales', 'finance']

    expect(readSidebarExpandedGroups(groups, { getItem: () => null })).toEqual(groups)
  })

  it('yalnızca bilinen ve benzersiz grup kimliklerini geri yükler', () => {
    const getItem = () => JSON.stringify(['sales', 'removed-group', 'sales', 'finance'])

    expect(readSidebarExpandedGroups(['partners', 'sales', 'finance'], { getItem }))
      .toEqual(['sales', 'finance'])
  })

  it('bozuk grup tercihlerinde tüm grupları açık başlatır', () => {
    expect(readSidebarExpandedGroups(['sales'], { getItem: () => '{broken' })).toEqual(['sales'])
    expect(readSidebarExpandedGroups(['sales'], { getItem: () => JSON.stringify([42]) })).toEqual(['sales'])
  })

  it('açık grup kimliklerini beklenen anahtarla JSON olarak kaydeder', () => {
    const setItem = vi.fn()

    writeSidebarExpandedGroups(['partners', 'sales'], { setItem })

    expect(setItem).toHaveBeenCalledWith(
      SIDEBAR_EXPANDED_GROUPS_STORAGE_KEY,
      JSON.stringify(['partners', 'sales']),
    )
  })

  it('accordion gruplarını birbirinden bağımsız açıp kapatır', () => {
    expect(toggleSidebarExpandedGroup(['partners', 'sales'], 'partners'))
      .toEqual(['sales'])
    expect(toggleSidebarExpandedGroup(['sales'], 'finance'))
      .toEqual(['sales', 'finance'])
  })

  it('aktif sayfanın grubunu kayıtlı tercih kapalı olsa bile açık tutar', () => {
    expect([...getEffectiveSidebarExpandedGroups(['partners'], 'sales')])
      .toEqual(['partners', 'sales'])
  })
})
