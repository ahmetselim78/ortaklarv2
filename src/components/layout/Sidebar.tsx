import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, ClipboardList, Factory, Radio, Settings, Layers, GaugeCircle, ClipboardCheck, ShieldCheck, LogOut, UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  newTab?: boolean
}

type NavGroup = {
  baslik?: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Ana Sayfa', icon: LayoutDashboard, end: true },
      { to: '/saatlik-takip', label: 'Saatlik Takip', icon: GaugeCircle },
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
  {
    baslik: 'Girişler',
    items: [
      { to: '/istasyonlar/uretim-giris', label: 'Üretim Girişi', icon: ClipboardCheck, newTab: true },
    ],
  },
]

const altNavItems: NavItem[] = [
  { to: '/admin', label: 'Admin Paneli', icon: ShieldCheck },
  { to: '/ayarlar', label: 'Ayarlar', icon: Settings },
]

function NavItemLink({ to, label, icon: Icon, end, newTab }: NavItem) {
  if (newTab) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all text-gray-400 hover:bg-gray-800 hover:text-white"
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
  const { access, session, signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const displayName = access?.user.display_name || session?.user.email || 'Oturum sahibi'
  const accountType = access?.user.account_type === 'device' ? 'Cihaz hesabı' : access?.user.account_type === 'canary' ? 'Canary hesabı' : 'Kişisel hesap'

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/giris', { replace: true })
  }

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
        <div className="mt-3 rounded-xl border border-gray-800 bg-gray-950/50 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-blue-300"><UserRound size={16} /></div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{displayName}</p>
              <p className="truncate text-[10px] text-gray-500">{access?.role?.name_tr ?? accountType}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
            <span>{access?.aal === 'aal2' ? 'AAL2 doğrulandı' : 'AAL1 oturumu'}</span>
            <span className="truncate pl-2">{session?.user.email}</span>
          </div>
          <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:border-red-900 hover:bg-red-950/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60">
            <LogOut size={14} />{signingOut ? 'Çıkış yapılıyor…' : 'Çıkış yap'}
          </button>
        </div>
      </div>
    </aside>
  )
}
