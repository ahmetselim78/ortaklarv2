import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Calculator,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  Factory,
  FileText,
  GaugeCircle,
  Handshake,
  Landmark,
  LayoutDashboard,
  Link2,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import AccountDrawer from './AccountDrawer'
import {
  BOTTOM_SIDEBAR_NAVIGATION,
  canSeeSidebarItem,
  getActiveSidebarGroupId,
  getActiveSidebarItemId,
  getVisibleSidebarNavigation,
  MAIN_SIDEBAR_NAVIGATION,
  SIDEBAR_GROUP_IDS,
  type SidebarIconName,
  type SidebarNavGroup,
  type SidebarNavItem,
} from './sidebarNavigation'
import {
  getEffectiveSidebarExpandedGroups,
  readSidebarExpandedGroups,
  toggleSidebarExpandedGroup,
  writeSidebarExpandedGroups,
} from './sidebarState'

interface SidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onMobileClose: () => void
}

const iconByName: Record<SidebarIconName, typeof LayoutDashboard> = {
  bank: Landmark,
  calculator: Calculator,
  calendarClock: CalendarClock,
  clipboardCheck: ClipboardCheck,
  clipboardList: ClipboardList,
  factory: Factory,
  fileText: FileText,
  gauge: GaugeCircle,
  handshake: Handshake,
  home: LayoutDashboard,
  link: Link2,
  package: Package,
  radio: Radio,
  settings: Settings,
  shield: ShieldCheck,
  shoppingCart: ShoppingCart,
  trendingUp: TrendingUp,
  truck: Truck,
  user: UserRound,
  users: Users,
  wallet: WalletCards,
}

interface NavItemLinkProps {
  item: SidebarNavItem
  collapsed: boolean
  active: boolean
  onNavigate: () => void
  flyoutItem?: boolean
}

function ItemContents({
  item,
  collapsed,
  active = false,
}: {
  item: SidebarNavItem
  collapsed: boolean
  active?: boolean
}) {
  const Icon = iconByName[item.icon]

  return (
    <>
      <span
        className={cn(
          'absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-blue-400 transition-opacity duration-200',
          active ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />
      <Icon
        size={19}
        strokeWidth={active ? 2.2 : 1.85}
        className={cn(
          'shrink-0 transition-colors',
          active ? 'text-blue-300' : 'text-slate-400 group-hover:text-slate-100',
        )}
        aria-hidden
      />
      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'xl:sr-only')}>
        {item.label}
      </span>
      {item.newTab && (
        <ExternalLink
          size={13}
          strokeWidth={2}
          className={cn('shrink-0 text-slate-500', collapsed && 'xl:hidden')}
          aria-hidden
        />
      )}
    </>
  )
}

function NavItemLink({
  item,
  collapsed,
  active,
  onNavigate,
  flyoutItem = false,
}: NavItemLinkProps) {
  const baseClass = cn(
    'group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400',
    collapsed && 'xl:justify-center xl:px-0',
    active
      ? 'bg-blue-500/10 text-slate-50'
      : 'text-slate-400 hover:bg-white/[0.055] hover:text-slate-100',
  )
  const commonProps = {
    onClick: onNavigate,
    'aria-label': item.newTab ? `${item.label}, yeni sekmede açılır` : item.label,
    'aria-current': active ? 'page' as const : undefined,
    title: collapsed ? item.label : undefined,
    className: baseClass,
    ...(flyoutItem ? { role: 'menuitem' as const, 'data-flyout-link': true } : {}),
  }

  if (item.newTab) {
    return (
      <a
        href={item.to}
        target="_blank"
        rel="noopener noreferrer"
        {...commonProps}
      >
        <ItemContents item={item} collapsed={collapsed} active={active} />
      </a>
    )
  }

  return (
    <Link to={item.to} {...commonProps}>
      <ItemContents item={item} collapsed={collapsed} active={active} />
    </Link>
  )
}

function GroupButtonContents({
  group,
  collapsed,
  expanded,
  active,
}: {
  group: SidebarNavGroup
  collapsed: boolean
  expanded: boolean
  active: boolean
}) {
  const Icon = iconByName[group.icon]

  return (
    <>
      <Icon
        size={19}
        strokeWidth={active ? 2.2 : 1.85}
        className={cn(
          'shrink-0 transition-colors',
          active ? 'text-blue-300' : 'text-slate-400 group-hover:text-slate-100',
        )}
        aria-hidden
      />
      <span className={cn('min-w-0 flex-1 truncate text-left', collapsed && 'xl:sr-only')}>
        {group.title}
      </span>
      <ChevronDown
        size={15}
        className={cn(
          'shrink-0 text-slate-500 transition-transform duration-200',
          expanded && 'rotate-180',
          collapsed && 'xl:hidden',
        )}
        aria-hidden
      />
    </>
  )
}

type FlyoutState = {
  groupId: string
  top: number
}

export default function Sidebar({
  collapsed,
  mobileOpen,
  onCollapsedChange,
  onMobileClose,
}: SidebarProps) {
  const { access, session, hasPermission } = useAuth()
  const location = useLocation()
  const [accountOpen, setAccountOpen] = useState(false)
  const [expandedGroupIds, setExpandedGroupIds] = useState(
    () => readSidebarExpandedGroups(SIDEBAR_GROUP_IDS),
  )
  const [flyout, setFlyout] = useState<FlyoutState | null>(null)
  const asideRef = useRef<HTMLElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const mobileCloseRef = useRef<HTMLButtonElement>(null)
  const groupTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const focusFlyoutOnOpenRef = useRef(false)
  const flyoutHoverCloseTimerRef = useRef<number | null>(null)
  const desktopCollapsed = collapsed && !mobileOpen
  const displayName = access?.user.display_name || session?.user.email || 'Oturum sahibi'
  const roleName = access?.role?.name_tr
    ?? (access?.user.account_type === 'device'
      ? 'Cihaz hesabı'
      : access?.user.account_type === 'canary'
        ? 'Canary hesabı'
        : 'Kişisel hesap')
  const avatarUrl = session?.user.user_metadata?.avatar_url || session?.user.user_metadata?.picture
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toLocaleUpperCase('tr-TR'))
    .join('') || 'K'

  const visibleNavigation = useMemo(
    () => getVisibleSidebarNavigation(MAIN_SIDEBAR_NAVIGATION, hasPermission),
    [hasPermission],
  )
  const visibleBottomNavigation = useMemo(
    () => BOTTOM_SIDEBAR_NAVIGATION.filter(item => canSeeSidebarItem(item, hasPermission)),
    [hasPermission],
  )
  const activeItemId = getActiveSidebarItemId(visibleNavigation, location)
    ?? getActiveSidebarItemId(visibleBottomNavigation, location)
  const activeGroupId = getActiveSidebarGroupId(visibleNavigation, location)
  const expandedGroups = useMemo(
    () => getEffectiveSidebarExpandedGroups(expandedGroupIds, activeGroupId),
    [activeGroupId, expandedGroupIds],
  )
  const flyoutGroup = flyout
    ? visibleNavigation.find((entry): entry is SidebarNavGroup => (
        entry.kind === 'group' && entry.id === flyout.groupId
      ))
    : undefined

  useEffect(() => {
    if (mobileOpen) window.setTimeout(() => mobileCloseRef.current?.focus(), 50)
  }, [mobileOpen])

  useEffect(() => {
    writeSidebarExpandedGroups(expandedGroupIds)
  }, [expandedGroupIds])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setFlyout(null), 0)
    return () => window.clearTimeout(timeoutId)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (desktopCollapsed) return
    const timeoutId = window.setTimeout(() => setFlyout(null), 0)
    return () => window.clearTimeout(timeoutId)
  }, [desktopCollapsed])

  useEffect(() => {
    if (!flyout || !desktopCollapsed) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      const trigger = groupTriggerRefs.current.get(flyout.groupId)
      if (flyoutRef.current?.contains(target) || trigger?.contains(target)) return
      setFlyout(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      const trigger = groupTriggerRefs.current.get(flyout.groupId)
      setFlyout(null)
      window.requestAnimationFrame(() => trigger?.focus())
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [desktopCollapsed, flyout])

  useEffect(() => {
    if (!flyout || !focusFlyoutOnOpenRef.current) return
    focusFlyoutOnOpenRef.current = false
    window.requestAnimationFrame(() => (
      flyoutRef.current?.querySelector<HTMLElement>('[data-flyout-link]')?.focus()
    ))
  }, [flyout])

  const toggleExpandedGroup = useCallback((groupId: string) => {
    setExpandedGroupIds(current => toggleSidebarExpandedGroup(current, groupId))
  }, [])

  const cancelFlyoutHoverClose = useCallback(() => {
    if (flyoutHoverCloseTimerRef.current === null) return
    window.clearTimeout(flyoutHoverCloseTimerRef.current)
    flyoutHoverCloseTimerRef.current = null
  }, [])

  const scheduleFlyoutHoverClose = useCallback((groupId: string) => {
    cancelFlyoutHoverClose()
    flyoutHoverCloseTimerRef.current = window.setTimeout(() => {
      setFlyout(current => current?.groupId === groupId ? null : current)
      flyoutHoverCloseTimerRef.current = null
    }, 140)
  }, [cancelFlyoutHoverClose])

  useEffect(() => cancelFlyoutHoverClose, [cancelFlyoutHoverClose])

  const openFlyout = useCallback((
    group: SidebarNavGroup,
    trigger: HTMLButtonElement,
    focusFirstItem: boolean,
  ) => {
    cancelFlyoutHoverClose()
    setFlyout(() => {
      const asideRect = asideRef.current?.getBoundingClientRect()
      const triggerRect = trigger.getBoundingClientRect()
      const flyoutHeight = 58 + (group.children.length * 42)
      const sidebarHeight = asideRef.current?.clientHeight ?? window.innerHeight
      const top = Math.min(
        Math.max(8, triggerRect.top - (asideRect?.top ?? 0)),
        Math.max(8, sidebarHeight - flyoutHeight - 8),
      )
      focusFlyoutOnOpenRef.current = focusFirstItem
      return { groupId: group.id, top }
    })
  }, [cancelFlyoutHoverClose])

  const handleGroupClick = useCallback((
    group: SidebarNavGroup,
    trigger: HTMLButtonElement,
    keyboardTriggered: boolean,
  ) => {
    if (desktopCollapsed) {
      openFlyout(group, trigger, keyboardTriggered)
      return
    }
    toggleExpandedGroup(group.id)
  }, [desktopCollapsed, openFlyout, toggleExpandedGroup])

  const handleGroupMouseEnter = useCallback((
    group: SidebarNavGroup,
    trigger: HTMLButtonElement,
  ) => {
    if (!desktopCollapsed) return
    openFlyout(group, trigger, false)
  }, [desktopCollapsed, openFlyout])

  const handleGroupMouseLeave = useCallback((groupId: string) => {
    if (!desktopCollapsed) return
    scheduleFlyoutHoverClose(groupId)
  }, [desktopCollapsed, scheduleFlyoutHoverClose])

  const handleGroupKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLButtonElement>,
    group: SidebarNavGroup,
  ) => {
    if (!desktopCollapsed || (event.key !== 'ArrowRight' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    if (flyout?.groupId === group.id) {
      flyoutRef.current?.querySelector<HTMLElement>('[data-flyout-link]')?.focus()
      return
    }
    openFlyout(group, event.currentTarget, true)
  }, [desktopCollapsed, flyout?.groupId, openFlyout])

  const handleFlyoutKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const links = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[data-flyout-link]'),
    )
    if (links.length === 0) return

    event.preventDefault()
    const currentIndex = links.indexOf(document.activeElement as HTMLElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? links.length - 1
        : event.key === 'ArrowUp'
          ? (currentIndex <= 0 ? links.length - 1 : currentIndex - 1)
          : (currentIndex + 1) % links.length
    links[nextIndex]?.focus()
  }, [])

  const handleFlyoutBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null
    const trigger = flyout ? groupTriggerRefs.current.get(flyout.groupId) : undefined
    if (nextTarget && (event.currentTarget.contains(nextTarget) || trigger?.contains(nextTarget))) return
    setFlyout(null)
  }, [flyout])

  const handleNavigate = useCallback(() => {
    cancelFlyoutHoverClose()
    setFlyout(null)
    onMobileClose()
  }, [cancelFlyoutHoverClose, onMobileClose])

  return (
    <>
      <aside
        ref={asideRef}
        id="application-sidebar"
        aria-label="Ana navigasyon"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-slate-800/90 bg-slate-950 text-white shadow-2xl shadow-slate-950/25',
          'transition-[width,transform] duration-200 ease-out motion-reduce:transition-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'xl:relative xl:z-20 xl:translate-x-0 xl:shadow-none',
          collapsed ? 'xl:w-[72px]' : 'xl:w-[248px]',
        )}
      >
        <div className={cn(
          'relative flex h-[72px] shrink-0 items-center border-b border-slate-800/80 px-4',
          collapsed && 'xl:justify-center xl:px-0',
        )}>
          <div className={cn('flex min-w-0 items-center gap-3', collapsed && 'xl:justify-center')}>
            <img
              src="/glassflow-logo.png"
              alt="GlassFlow"
              className="h-10 w-10 shrink-0 object-contain"
            />
            <div className={cn('min-w-0', collapsed && 'xl:sr-only')}>
              <h2 className="truncate text-[14px] font-bold leading-tight tracking-[0.01em] text-slate-50">
                GlassFlow
              </h2>
              <p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                MES &amp; ERP SYSTEM
              </p>
            </div>
          </div>

          <button
            ref={mobileCloseRef}
            type="button"
            onClick={onMobileClose}
            aria-label="Menüyü kapat"
            className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-slate-400 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-400 xl:hidden"
          >
            <X size={19} />
          </button>

          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            aria-pressed={collapsed}
            className="absolute -right-3 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-slate-700 bg-slate-900 text-slate-400 shadow-lg outline-none transition-colors hover:border-blue-500 hover:text-blue-300 focus-visible:ring-2 focus-visible:ring-blue-400 xl:grid"
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>

        <nav className="sidebar-scrollbar flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto px-3 py-3">
          {visibleNavigation.map(entry => {
            if (entry.kind === 'item') {
              return (
                <NavItemLink
                  key={entry.id}
                  item={entry}
                  collapsed={collapsed}
                  active={activeItemId === entry.id}
                  onNavigate={handleNavigate}
                />
              )
            }

            const isExpanded = expandedGroups.has(entry.id)
            const isActiveGroup = activeGroupId === entry.id
            const isFlyoutOpen = desktopCollapsed && flyout?.groupId === entry.id
            const controlsId = desktopCollapsed
              ? `sidebar-flyout-${entry.id}`
              : `sidebar-group-${entry.id}`

            return (
              <div key={entry.id}>
                <button
                  ref={node => {
                    if (node) groupTriggerRefs.current.set(entry.id, node)
                    else groupTriggerRefs.current.delete(entry.id)
                  }}
                  id={`sidebar-group-trigger-${entry.id}`}
                  type="button"
                  onClick={event => handleGroupClick(entry, event.currentTarget, event.detail === 0)}
                  onKeyDown={event => handleGroupKeyDown(event, entry)}
                  onMouseEnter={event => handleGroupMouseEnter(entry, event.currentTarget)}
                  onMouseLeave={() => handleGroupMouseLeave(entry.id)}
                  aria-controls={controlsId}
                  aria-expanded={desktopCollapsed ? isFlyoutOpen : isExpanded}
                  aria-haspopup={desktopCollapsed ? 'menu' : undefined}
                  title={desktopCollapsed ? entry.title : undefined}
                  className={cn(
                    'group flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold outline-none transition-colors duration-150',
                    'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400',
                    collapsed && 'xl:justify-center xl:px-0',
                    isActiveGroup
                      ? 'bg-white/[0.045] text-slate-50'
                      : 'text-slate-300 hover:bg-white/[0.055] hover:text-slate-100',
                  )}
                >
                  <GroupButtonContents
                    group={entry}
                    collapsed={collapsed}
                    expanded={desktopCollapsed ? isFlyoutOpen : isExpanded}
                    active={isActiveGroup}
                  />
                </button>

                {!desktopCollapsed && isExpanded && (
                  <div
                    id={`sidebar-group-${entry.id}`}
                    className="ml-[21px] mt-0.5 space-y-0.5 border-l border-slate-800/90 pl-2"
                  >
                    {entry.children.map(child => (
                      <NavItemLink
                        key={child.id}
                        item={child}
                        collapsed={false}
                        active={activeItemId === child.id}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {desktopCollapsed && flyout && flyoutGroup && (
          <div
            ref={flyoutRef}
            id={`sidebar-flyout-${flyoutGroup.id}`}
            aria-labelledby={`sidebar-group-trigger-${flyoutGroup.id}`}
            onKeyDown={handleFlyoutKeyDown}
            onBlur={handleFlyoutBlur}
            onMouseEnter={cancelFlyoutHoverClose}
            onMouseLeave={() => scheduleFlyoutHoverClose(flyoutGroup.id)}
            className="absolute left-full z-[70] ml-2 hidden w-60 rounded-xl border border-slate-700/90 bg-slate-950 p-2 shadow-2xl shadow-slate-950/50 xl:block"
            style={{ top: flyout.top }}
          >
            <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
              {flyoutGroup.title}
            </div>
            <div role="menu" className="space-y-0.5">
              {flyoutGroup.children.map(child => (
                <NavItemLink
                  key={child.id}
                  item={child}
                  collapsed={false}
                  active={activeItemId === child.id}
                  onNavigate={handleNavigate}
                  flyoutItem
                />
              ))}
            </div>
          </div>
        )}

        <div className="shrink-0 border-t border-slate-800/80 px-3 pb-3 pt-2.5">
          <div className="space-y-0.5">
            {visibleBottomNavigation.map(item => (
              <NavItemLink
                key={item.id}
                item={item}
                collapsed={collapsed}
                active={activeItemId === item.id}
                onNavigate={handleNavigate}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={accountOpen}
            aria-label={`Hesap bilgileri: ${displayName}`}
            className={cn(
              'group relative mt-2.5 flex w-full items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/55 p-2 text-left outline-none transition-colors',
              'hover:border-slate-700 hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-blue-400',
              collapsed && 'xl:justify-center xl:border-transparent xl:bg-transparent xl:p-1.5',
            )}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-600 text-xs font-bold text-white ring-2 ring-blue-400/20">
              {avatarUrl
                ? <img src={avatarUrl} alt="Profil fotoğrafı" className="h-full w-full object-cover" />
                : initials}
            </span>
            <span className={cn('min-w-0 flex-1', collapsed && 'xl:sr-only')}>
              <span
                title={displayName}
                className="line-clamp-1 break-words text-[12px] font-semibold leading-4 text-slate-100"
              >
                {displayName}
              </span>
              <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-[0.1em] text-blue-300">
                {roleName}
              </span>
            </span>
            <ChevronRight
              size={15}
              className={cn(
                'shrink-0 text-slate-600 transition-colors group-hover:text-slate-300',
                collapsed && 'xl:hidden',
              )}
              aria-hidden
            />
            {collapsed && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-[60] hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-100 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 xl:block"
              >
                {displayName} · Hesap bilgileri
              </span>
            )}
          </button>
        </div>
      </aside>

      <AccountDrawer open={accountOpen} onClose={() => setAccountOpen(false)} />
    </>
  )
}
