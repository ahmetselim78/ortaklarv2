import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { useCari } from '@/hooks/useCari'
import CariListesi from '@/components/cari/CariListesi'
import CariForm from '@/components/cari/CariForm'
import type { Cari } from '@/types/cari'

export default function CariPage() {
  const { cariler, yukleniyor, hata, ekle, guncelle, sil } = useCari()
  const [formAcik, setFormAcik] = useState(false)
  const [duzenlenecek, setDuzenlenecek] = useState<Cari | null>(null)
  const [silinecek, setSilinecek] = useState<Cari | null>(null)
  const [siliniyor, setSiliniyor] = useState(false)

  const handleDuzenle = (cari: Cari) => {
    setDuzenlenecek(cari)
    setFormAcik(true)
  }

  const handleFormKapat = () => {
    setFormAcik(false)
    setDuzenlenecek(null)
  }

  const handleKaydet = async (veri: Parameters<typeof ekle>[0]) => {
    if (duzenlenecek) {
      await guncelle(duzenlenecek.id, veri)
    } else {
      await ekle(veri)
    }
  }

  const handleSilOnayla = async () => {
    if (!silinecek) return
    setSiliniyor(true)
    try {
      await sil(silinecek.id)
    } finally {
      setSiliniyor(false)
      setSilinecek(null)
    }
  }

  const musteriSayisi = cariler.filter((c) => c.tipi === 'musteri').length
  const tedarikciSayisi = cariler.filter((c) => c.tipi === 'tedarikci').length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Üst başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Cari Yönetimi</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {musteriSayisi} müşteri · {tedarikciSayisi} tedarikçi
          </p>
        </div>
        <button
          onClick={() => setFormAcik(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Yeni Cari
        </button>
      </div>

      {/* Hata */}
      {hata && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {hata}
        </div>
      )}

      {/* İçerik */}
      {!yukleniyor && cariler.length === 0 && !hata ? (
        <div className="text-center py-24 text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Henüz cari kaydı yok</p>
          <p className="text-sm mt-1">Sağ üstteki "Yeni Cari" butonuyla ekleyin.</p>
        </div>
      ) : (
        <CariListesi
          cariler={cariler}
          yukleniyor={yukleniyor}
          onDuzenle={handleDuzenle}
          onSil={setSilinecek}
        />
      )}

      {/* Ekle / Düzenle Formu */}
      {formAcik && (
        <CariForm
          duzenlenecek={duzenlenecek}
          onKaydet={handleKaydet}
          onKapat={handleFormKapat}
        />
      )}

      {/* Silme Onay Modalı */}
      {silinecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Cari Silinsin mi?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{silinecek.ad}</span> adlı cari
              kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSilinecek(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSilOnayla}
                disabled={siliniyor}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {siliniyor ? 'Siliniyor...' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
