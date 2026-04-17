import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Package, ClipboardList, Factory, Waves, Tag, Ruler } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/cari', label: 'Cari', icon: Users },
  { to: '/stok', label: 'Stok', icon: Package },
  { to: '/siparisler', label: 'Siparişler', icon: ClipboardList },
  { to: '/uretim', label: 'Üretim Emirleri', icon: Factory },
  { to: '/yikama', label: 'Yıkama İstasyonu', icon: Waves },
  { to: '/etiket', label: 'Etiket Yazıcı', icon: Tag },
  { to: '/cita', label: 'Çıta İstasyonu', icon: Ruler },
]

export default function Sidebar() {
  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="px-6 py-5 border-b border-gray-700">
        <h2 className="text-lg font-bold text-white tracking-wide">Cam Yönetim</h2>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
