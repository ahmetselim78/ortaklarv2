export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'cam-yonetim:sidebar-collapsed'

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function readSidebarCollapsed(storage: StorageReader | null = browserStorage()): boolean {
  try {
    return storage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeSidebarCollapsed(collapsed: boolean, storage: StorageWriter | null = browserStorage()): void {
  try {
    storage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
  } catch {
    // Kısıtlı tarayıcı bağlamlarında kalıcı tercih olmadan devam et.
  }
}
