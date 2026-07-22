import { useCallback, useEffect, useRef, useState } from 'react'
import { Layers, Menu, ShieldCheck } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { readSidebarCollapsed, writeSidebarCollapsed } from './sidebarState'

export default function AppLayout() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed())
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const adminContext = location.pathname === '/admin' || location.pathname.startsWith('/admin/')

  useEffect(() => {
    writeSidebarCollapsed(collapsed)
  }, [collapsed])

  const closeMobileMenu = useCallback((restoreFocus = false) => {
    setMobileOpen(false)
    if (restoreFocus) window.setTimeout(() => mobileTriggerRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileMenu(true)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeMobileMenu, mobileOpen])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <button
        type="button"
        aria-label="Navigasyon menüsünü kapat"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => closeMobileMenu(true)}
        className={`fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none xl:hidden ${mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapsedChange={setCollapsed}
        onMobileClose={() => closeMobileMenu(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 xl:hidden">
          <button
            ref={mobileTriggerRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Navigasyon menüsünü aç"
            aria-controls="application-sidebar"
            aria-expanded={mobileOpen}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm outline-none transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Menu size={20} strokeWidth={2} />
          </button>

          <div className="pointer-events-none absolute inset-x-14 flex items-center justify-center gap-2 text-sm font-bold text-slate-900">
            {adminContext
              ? <ShieldCheck size={17} className="text-indigo-600" aria-hidden />
              : <Layers size={17} className="text-blue-600" aria-hidden />}
            <span className="truncate">{adminContext ? 'Admin Paneli' : 'Cam Yönetim'}</span>
          </div>

          <span className="h-10 w-10" aria-hidden />
        </header>

        <main
          data-app-scroll-container
          className={`app-scroll-area min-h-0 flex-1 touch-pan-y overscroll-y-contain ${mobileOpen ? 'overflow-hidden' : 'overflow-auto'}`}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
