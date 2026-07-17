import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { reportError } from '@/lib/errorReporter'

interface Props {
  children: ReactNode
}

interface State {
  hata: Error | null
}

/** Yakalanmayan render hatalarında beyaz ekran yerine bilgi + yenile butonu gösterir. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hata: null }

  static getDerivedStateFromError(hata: Error): State {
    return { hata }
  }

  componentDidCatch(hata: Error, info: { componentStack?: string | null }) {
    console.error('Uygulama hatası:', hata, info.componentStack)
    void reportError({
      source: 'react_boundary',
      error: hata,
      severity: 'critical',
      title: 'React Error Boundary',
      context: { componentStack: info.componentStack },
    })
  }

  render() {
    if (!this.state.hata) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 mb-4">
            <AlertTriangle size={26} className="text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-800 mb-1">Beklenmeyen bir hata oluştu</h1>
          <p className="text-sm text-gray-500 mb-4">
            Sayfayı yenileyerek devam edebilirsiniz. Sorun devam ederse yöneticinize bildirin.
          </p>
          <p className="mb-5 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-600">Hata güvenli biçimde merkezi sisteme bildirildi.</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RotateCcw size={14} />
            Sayfayı Yenile
          </button>
        </div>
      </div>
    )
  }
}
