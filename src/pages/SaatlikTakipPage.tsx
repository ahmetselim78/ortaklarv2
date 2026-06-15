import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import SaatlikTakipPanosu from '@/components/uretim/SaatlikTakipPanosu'

/**
 * Sidebar layout içinde görünen sayfa.
 * Bileşen varsayılan modda çalışır (tamEkran=false).
 * Sağ üstte "TV Ekranı" linki ile tam ekran rotasına yönlendirir.
 */
export default function SaatlikTakipPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Sayfa başlık barı */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Saatlik Üretim Takip Panosu</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Isıcam üretim hattı — gerçek zamanlı saatlik takip
          </p>
        </div>
        <Link
          to="/istasyonlar/uretim-panosu"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
        >
          <ExternalLink size={15} />
          TV Ekranı (Tam Ekran)
        </Link>
      </div>

      {/* Pano — tam yükseklik */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <SaatlikTakipPanosu tamEkran={false} />
      </div>
    </div>
  )
}
