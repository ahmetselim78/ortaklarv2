import { Link } from 'react-router-dom'

export default function UnauthorizedPage() {
  return <main className="min-h-screen grid place-items-center bg-gray-50"><div className="text-center"><h1 className="text-xl font-bold text-gray-900">Bu işlem için yetkiniz yok</h1><Link to="/" className="mt-3 inline-block text-sm text-blue-600">Ana sayfaya dön</Link></div></main>
}
