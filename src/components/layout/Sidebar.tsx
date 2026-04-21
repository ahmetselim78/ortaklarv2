import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, ClipboardList, Factory, Radio, Settings, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

type NavGroup = {
  baslik?: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    baslik: 'Kayıtlar',
    items: [
      { to: '/cari', label: 'Cari', icon: Users },
      { to: '/stok', label: 'Stok', icon: Package },
    ],
  },
  {
    baslik: 'Operasyon',
    items: [
      { to: '/siparisler', label: 'Siparişler', icon: ClipboardList },
      { to: '/uretim', label: 'Üretim Emirleri', icon: Factory },
      { to: '/istasyonlar', label: 'Üretim İstasyonları', icon: Radio },
    ],
  },
]

const altNavItems: NavItem[] = [
  { to: '/ayarlar', label: 'Ayarlar', icon: Settings },
]

function NavItemLink({ to, label, icon: Icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
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
              'absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-white transition-opacity',
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
  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Logo / Üst kısım */}
      <div className="px-5 py-5 border-b border-gray-800 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-inner">
          <Layers size={18} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-wide text-white leading-tight">Cam Yönetim</h2>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Üretim Paneli</p>
        </div>
      </div>

      {/* Ana gezinme */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((grup, i) => (
          <div key={i}>
            {grup.baslik && (
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                {grup.baslik}
              </div>
            )}
            <div className="space-y-1">
              {grup.items.map((item) => (
                <NavItemLink key={item.to} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Alt bölüm */}
      <div className="px-3 pb-4 border-t border-gray-800 pt-3 space-y-1">
        {altNavItems.map((item) => (
          <NavItemLink key={item.to} {...item} />
        ))}
      </div>
    </aside>
  )
}
