import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  Factory,
  GaugeCircle,
  Layers,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import type { PermissionAction } from '@/auth/AuthContext'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import AccountDrawer from './AccountDrawer'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  newTab?: boolean
  module: string
  action?: PermissionAction
}

type NavGroup = {
  baslik?: string
  items: NavItem[]
}

interface SidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onMobileClose: () => void
}

const navGroups: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Ana Sayfa', icon: LayoutDashboard, end: true, module: 'dashboard' },
      { to: '/saatlik-takip', label: 'Saatlik Takip', icon: GaugeCircle, module: 'hourly_tracking' },
    ],
  },
  {
    baslik: 'Kayıtlar',
    items: [
      { to: '/cari', label: 'Cari', icon: Users, module: 'cari' },
      { to: '/stok', label: 'Stok', icon: Package, module: 'inventory' },
    ],
  },
  {
    baslik: 'Operasyon',
    items: [
      { to: '/siparisler', label: 'Siparişler', icon: ClipboardList, module: 'orders' },
      { to: '/uretim', label: 'Üretim Emirleri', icon: Factory, module: 'production' },
      { to: '/istasyonlar', label: 'Üretim İstasyonları', icon: Radio, module: 'production_stations', action: 'update' },
    ],
  },
  {
    baslik: 'Girişler',
    items: [
      { to: '/istasyonlar/uretim-giris', label: 'Üretim Girişi', icon: ClipboardCheck, newTab: true, module: 'production_entry', action: 'create' },
    ],
  },
]

const altNavItems: NavItem[] = [
  { to: '/admin', label: 'Admin Paneli', icon: ShieldCheck, module: 'admin', action: 'manage' },
  { to: '/ayarlar', label: 'Ayarlar', icon: Settings, module: 'settings' },
]

interface NavItemLinkProps extends NavItem {
  collapsed: boolean
  onNavigate: () => void
}

function ItemContents({ label, icon: Icon, collapsed, active = false, external = false }: {
  label: string
  icon: NavItem['icon']
  collapsed: boolean
  active?: boolean
  external?: boolean
}) {
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
        className={cn('shrink-0 transition-colors', active ? 'text-blue-300' : 'text-slate-400 group-hover:text-slate-100')}
      />
      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'xl:sr-only')}>{label}</span>
      {external && (
        <ExternalLink size={13} strokeWidth={2} className={cn('shrink-0 text-slate-500', collapsed && 'xl:hidden')} aria-hidden />
      )}
    </>
  )
}

function NavItemLink({ to, label, icon, end, newTab, collapsed, onNavigate }: NavItemLinkProps) {
  const baseClass = cn(
    'group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400',
    collapsed && 'xl:justify-center xl:px-0',
  )

  if (newTab) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        aria-label={`${label}, yeni sekmede açılır`}
        title={collapsed ? `${label} · Yeni sekme` : undefined}
        className={cn(baseClass, 'text-slate-400 hover:bg-white/[0.055] hover:text-slate-100')}
      >
        <ItemContents label={label} icon={icon} collapsed={collapsed} external />
      </a>
    )
  }

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={({ isActive }) => cn(
        baseClass,
        isActive
          ? 'bg-blue-500/10 text-slate-50'
          : 'text-slate-400 hover:bg-white/[0.055] hover:text-slate-100',
      )}
    >
      {({ isActive }) => (
        <ItemContents label={label} icon={icon} collapsed={collapsed} active={isActive} />
      )}
    </NavLink>
  )
}

export default function Sidebar({ collapsed, mobileOpen, onCollapsedChange, onMobileClose }: SidebarProps) {
  const { access, session, hasPermission } = useAuth()
  const [accountOpen, setAccountOpen] = useState(false)
  const mobileCloseRef = useRef<HTMLButtonElement>(null)
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
  const canSee = (item: NavItem) => hasPermission(item.module, item.action ?? 'read')

  useEffect(() => {
    if (mobileOpen) window.setTimeout(() => mobileCloseRef.current?.focus(), 50)
  }, [mobileOpen])

  const openAccount = () => setAccountOpen(true)

  return (
    <>
      <aside
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
        <div className={cn('relative flex h-[72px] shrink-0 items-center border-b border-slate-800/80 px-4', collapsed && 'xl:justify-center xl:px-0')}>
          <div className={cn('flex min-w-0 items-center gap-3', collapsed && 'xl:justify-center')}>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-400/20 bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-[0_8px_24px_rgba(37,99,235,0.22)]">
              <Layers size={20} strokeWidth={2.2} />
            </div>
            <div className={cn('min-w-0', collapsed && 'xl:sr-only')}>
              <h2 className="truncate text-[14px] font-bold leading-tight tracking-[0.01em] text-slate-50">Cam Yönetim</h2>
              <p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Üretim Paneli</p>
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

        <nav className="sidebar-scrollbar flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-3 py-3">
          {navGroups
            .map(group => ({ ...group, items: group.items.filter(canSee) }))
            .filter(group => group.items.length > 0)
            .map((group, index) => (
              <div key={group.baslik ?? `primary-${index}`}>
                {group.baslik && (
                  <>
                    <div className={cn('mb-1 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600', collapsed && 'xl:sr-only')}>
                      {group.baslik}
                    </div>
                    {collapsed && <div className="mx-2 mb-2 hidden h-px bg-slate-800 xl:block" aria-hidden />}
                  </>
                )}
                <div className="space-y-0.5">
                  {group.items.map(item => (
                    <NavItemLink key={item.to} {...item} collapsed={collapsed} onNavigate={onMobileClose} />
                  ))}
                </div>
              </div>
            ))}
        </nav>

        <div className="shrink-0 border-t border-slate-800/80 px-3 pb-3 pt-2.5">
          <div className="space-y-0.5">
            {altNavItems.filter(canSee).map(item => (
              <NavItemLink key={item.to} {...item} collapsed={collapsed} onNavigate={onMobileClose} />
            ))}
          </div>

          <button
            type="button"
            onClick={openAccount}
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
              <span title={displayName} className="line-clamp-1 break-words text-[12px] font-semibold leading-4 text-slate-100">{displayName}</span>
              <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-[0.1em] text-blue-300">{roleName}</span>
            </span>
            <ChevronRight size={15} className={cn('shrink-0 text-slate-600 transition-colors group-hover:text-slate-300', collapsed && 'xl:hidden')} aria-hidden />
            {collapsed && (
              <span role="tooltip" className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-[60] hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-100 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 xl:block">
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
