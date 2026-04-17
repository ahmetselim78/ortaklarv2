import { useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
      <h1 className="text-8xl font-black text-gray-200">404</h1>
      <p className="text-xl font-semibold text-gray-700 mt-4">Sayfa bulunamadı</p>
      <p className="text-sm text-gray-400 mt-2">Aradığınız sayfa mevcut değil veya taşınmış olabilir.</p>
      <button
        onClick={() => navigate('/')}
        className="mt-8 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Home size={16} />
        Ana Sayfaya Dön
      </button>
    </div>
  )
}
