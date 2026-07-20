import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ClipboardCheck,
  ClipboardList,
  Factory,
  GaugeCircle,
  Info,
  Layers,
  LayoutDashboard,
  Package,
  Radio,
  Settings,
  ShieldCheck,
  Users,
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

function NavItemLink({ to, label, icon: Icon, end, newTab }: NavItem) {
  if (newTab) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-all hover:bg-gray-800 hover:text-white"
      >
        <Icon size={18} strokeWidth={1.9} />
        <span className="truncate">{label}</span>
      </a>
    )
  }

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
          isActive
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/30'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-white transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden
          />
          <Icon size={18} strokeWidth={isActive ? 2.2 : 1.9} />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { access, session, hasPermission } = useAuth()
  const [accountOpen, setAccountOpen] = useState(false)
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

  return (
    <aside className="flex min-h-screen w-56 flex-col bg-gray-900 text-white">
      <div className="flex items-center gap-2.5 border-b border-gray-800 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-inner">
          <Layers size={18} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold leading-tight tracking-wide text-white">Cam Yönetim</h2>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Üretim Paneli</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navGroups
          .map(grup => ({ ...grup, items: grup.items.filter(canSee) }))
          .filter(grup => grup.items.length > 0)
          .map((grup, index) => (
          <div key={index}>
            {grup.baslik && (
              <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                {grup.baslik}
              </div>
            )}
            <div className="space-y-1">
              {grup.items.map(item => <NavItemLink key={item.to} {...item} />)}
            </div>
          </div>
          ))}
      </nav>

      <div className="space-y-1 border-t border-gray-800 px-3 pb-4 pt-3">
        {altNavItems.filter(canSee).map(item => <NavItemLink key={item.to} {...item} />)}
        <div className="mt-3 flex w-full items-center gap-2.5 rounded-xl border border-gray-800 bg-gray-950/50 p-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-600 text-xs font-bold text-white ring-2 ring-blue-400/20">
            {avatarUrl
              ? <img src={avatarUrl} alt="Profil fotoğrafı" className="h-full w-full object-cover" />
              : initials}
          </span>
          <span className="min-w-0 flex-1">
            <span title={displayName} className="line-clamp-2 break-words text-[12px] font-semibold leading-4 text-gray-100">{displayName}</span>
            <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.08em] text-blue-300">{roleName}</span>
          </span>
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={accountOpen}
            aria-label="Hesap bilgilerini aç"
            title="Hesap bilgileri"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gray-700 bg-gray-900 text-gray-400 transition-all hover:border-blue-500 hover:bg-blue-500/10 hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Info size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <AccountDrawer open={accountOpen} onClose={() => setAccountOpen(false)} />
    </aside>
  )
}
