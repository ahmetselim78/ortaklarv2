import { Component, type ReactNode } from 'react'
import { AlertTriangle, LoaderCircle, LogOut, RotateCcw } from 'lucide-react'
import { endCurrentDeviceSession } from '@/lib/deviceSession'
import { reportError } from '@/lib/errorReporter'
import { supabase } from '@/lib/supabase'

interface Props {
  children: ReactNode
}

interface State {
  hata: Error | null
  cikisYapiliyor: boolean
}

/** Yakalanmayan render hatalarında beyaz ekran yerine bilgi + yenile butonu gösterir. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hata: null, cikisYapiliyor: false }

  static getDerivedStateFromError(hata: Error): Partial<State> {
    return { hata }
  }

  private oturumuKapat = async () => {
    this.setState({ cikisYapiliyor: true })
    try {
      try { await endCurrentDeviceSession() } catch { /* yerel çıkış engellenmez */ }
      await supabase.removeAllChannels()
      await supabase.auth.signOut({ scope: 'local' })
    } finally {
      window.location.replace('/giris')
    }
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
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              disabled={this.state.cikisYapiliyor}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw size={14} />
              Sayfayı Yenile
            </button>
            <button
              type="button"
              onClick={() => void this.oturumuKapat()}
              disabled={this.state.cikisYapiliyor}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {this.state.cikisYapiliyor
                ? <LoaderCircle size={14} className="animate-spin" />
                : <LogOut size={14} />}
              {this.state.cikisYapiliyor ? 'Çıkış Yapılıyor...' : 'Oturumu Kapat'}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
