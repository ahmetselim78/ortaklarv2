import { describe, expect, it, vi } from 'vitest'
import {
  readSidebarCollapsed,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  writeSidebarCollapsed,
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
  })
})
