export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'cam-yonetim:sidebar-collapsed'
export const SIDEBAR_EXPANDED_GROUPS_STORAGE_KEY = 'cam-yonetim:sidebar-expanded-groups'

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

export function readSidebarExpandedGroups(
  availableGroupIds: readonly string[],
  storage: StorageReader | null = browserStorage(),
): string[] {
  try {
    const savedValue = storage?.getItem(SIDEBAR_EXPANDED_GROUPS_STORAGE_KEY)
    if (savedValue === null || savedValue === undefined) return [...availableGroupIds]

    const parsedValue: unknown = JSON.parse(savedValue)
    if (!Array.isArray(parsedValue) || parsedValue.some(value => typeof value !== 'string')) {
      return [...availableGroupIds]
    }

    const available = new Set(availableGroupIds)
    return [...new Set(parsedValue)].filter(groupId => available.has(groupId))
  } catch {
    return [...availableGroupIds]
  }
}

export function writeSidebarExpandedGroups(
  expandedGroupIds: readonly string[],
  storage: StorageWriter | null = browserStorage(),
): void {
  try {
    storage?.setItem(SIDEBAR_EXPANDED_GROUPS_STORAGE_KEY, JSON.stringify(expandedGroupIds))
  } catch {
    // Kısıtlı tarayıcı bağlamlarında kalıcı tercih olmadan devam et.
  }
}

export function toggleSidebarExpandedGroup(
  expandedGroupIds: readonly string[],
  groupId: string,
): string[] {
  return expandedGroupIds.includes(groupId)
    ? expandedGroupIds.filter(id => id !== groupId)
    : [...expandedGroupIds, groupId]
}

export function getEffectiveSidebarExpandedGroups(
  expandedGroupIds: readonly string[],
  activeGroupId: string | null,
): Set<string> {
  const groups = new Set(expandedGroupIds)
  if (activeGroupId) groups.add(activeGroupId)
  return groups
}
