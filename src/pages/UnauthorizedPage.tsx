import { Link } from 'react-router-dom'
import { getDefaultAuthorizedPath } from '@/auth/accessNavigation'
import { useAuth } from '@/auth/AuthContext'

export default function UnauthorizedPage() {
  const { session, hasPermission, signOut } = useAuth()
  const destination = getDefaultAuthorizedPath(hasPermission)

  async function hesapDegistir() {
    await signOut()
    window.location.replace('/giris')
  }

  return (
    <main className="min-h-screen grid place-items-center bg-gray-50 p-6">
      <div className="text-center">
        <h1 className="text-xl font-bold text-gray-900">Bu işlem için yetkiniz yok</h1>
        <p className="mt-2 text-sm text-gray-500">Rolünüze tanımlı başka bir sayfadan devam edebilirsiniz.</p>
        {destination ? (
          <Link to={destination} replace className="mt-4 inline-block text-sm font-medium text-blue-600">
            Erişebildiğim sayfaya git
          </Link>
        ) : session ? (
          <button type="button" onClick={() => void hesapDegistir()} className="mt-4 text-sm font-medium text-blue-600">
            Başka hesapla giriş yap
          </button>
        ) : (
          <Link to="/giris" replace className="mt-4 inline-block text-sm font-medium text-blue-600">Giriş sayfasına dön</Link>
        )}
        {session && destination && (
          <button
            type="button"
            onClick={() => void hesapDegistir()}
            className="mt-4 block w-full text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Başka hesapla giriş yap
          </button>
        )}
      </div>
    </main>
  )
}
