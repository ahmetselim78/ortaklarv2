import { X } from 'lucide-react'
import { useEscape } from '@/hooks/useEscape'

interface Props {
  acik?: boolean
  baslik: string
  mesaj: string
  onayButon?: string
  onayRenk?: 'red' | 'blue' | 'green'
  onOnayla: () => void
  onKapat: () => void
  yukleniyor?: boolean
}

const RENK_MAP = {
  red: 'bg-red-600 hover:bg-red-700',
  blue: 'bg-blue-600 hover:bg-blue-700',
  green: 'bg-green-600 hover:bg-green-700',
}

export default function ConfirmDialog({
  acik = true,
  baslik,
  mesaj,
  onayButon = 'Onayla',
  onayRenk = 'blue',
  onOnayla,
  onKapat,
  yukleniyor = false,
}: Props) {
  useEscape(onKapat, acik && !yukleniyor)
  if (!acik) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-800">{baslik}</h3>
          <button onClick={onKapat} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-5">{mesaj}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onKapat}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            İptal
          </button>
          <button
            onClick={onOnayla}
            disabled={yukleniyor}
            className={`px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50 ${RENK_MAP[onayRenk]}`}
          >
            {yukleniyor ? 'İşleniyor...' : onayButon}
          </button>
        </div>
      </div>
    </div>
  )
}
