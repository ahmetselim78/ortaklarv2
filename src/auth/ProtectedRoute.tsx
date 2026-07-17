import { Navigate, useLocation } from 'react-router-dom'
import type { PermissionAction } from '@/auth/AuthContext'
import { useAuth } from '@/auth/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  module?: string
  action?: PermissionAction
  requireAal2?: boolean
}

export default function ProtectedRoute({
  children,
  module,
  action = 'read',
  requireAal2 = false,
}: ProtectedRouteProps) {
  const { session, access, loading, error, hasPermission, signOut } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-gray-500">Oturum doğrulanıyor…</div>
  }
  if (!session) return <Navigate to="/giris" replace state={{ from: location.pathname }} />
  if (error || !access?.user?.is_active) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50 p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-sm text-red-700">
          <p>{error ?? 'Hesabınız pasif. Yöneticinizle görüşün.'}</p>
          <button type="button" onClick={() => void signOut()} className="mt-4 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold">Başka hesapla giriş yap</button>
        </div>
      </div>
    )
  }
  if (access.user.must_change_password && location.pathname !== '/parola-degistir') {
    return <Navigate to="/parola-degistir" replace />
  }
  if (requireAal2 && access.aal !== 'aal2') return <Navigate to="/mfa" replace state={{ from: location.pathname }} />
  if (module && !hasPermission(module, action)) return <Navigate to="/yetkisiz" replace />
  return children
}
