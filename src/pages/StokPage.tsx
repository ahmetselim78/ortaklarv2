import { useState } from 'react'
import { Plus, Package } from 'lucide-react'
import { useStok } from '@/hooks/useStok'
import { useCari } from '@/hooks/useCari'
import StokListesi from '@/components/stok/StokListesi'
import StokForm from '@/components/stok/StokForm'
import type { Stok, StokKategori } from '@/types/stok'

const SEKMELER: { key: StokKategori; label: string }[] = [
  { key: 'cam', label: 'Cam' },
  { key: 'cita', label: 'Çıta' },
  { key: 'yan_malzeme', label: 'Yan Malzemeler' },
]

export default function StokPage() {
  const { stoklar, yukleniyor, hata, ekle, guncelle, sil } = useStok()
  const { cariler } = useCari()
  const [aktifSekme, setAktifSekme] = useState<StokKategori>('cam')
  const [formAcik, setFormAcik] = useState(false)
  const [duzenlenecek, setDuzenlenecek] = useState<Stok | null>(null)
  const [silinecek, setSilinecek] = useState<Stok | null>(null)
  const [siliniyor, setSiliniyor] = useState(false)

  const handleDuzenle = (stok: Stok) => {
    setDuzenlenecek(stok)
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

  const aktifStokSayisi = stoklar.filter((s) => s.kategori === aktifSekme).length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Stok / Ürün Kataloğu</h1>
          <p className="text-sm text-gray-500 mt-0.5">{aktifStokSayisi} kayıt</p>
        </div>
        <button
          onClick={() => setFormAcik(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Yeni Stok
        </button>
      </div>

      {/* Kategori sekmeleri */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {SEKMELER.map((s) => (
          <button
            key={s.key}
            onClick={() => setAktifSekme(s.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              aktifSekme === s.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {hata && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {hata}
        </div>
      )}

      {!yukleniyor && stoklar.length === 0 && !hata ? (
        <div className="text-center py-24 text-gray-400">
          <Package size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Henüz stok kaydı yok</p>
          <p className="text-sm mt-1">Sağ üstteki "Yeni Stok" butonuyla ekleyin.</p>
        </div>
      ) : (
        <StokListesi
          stoklar={stoklar}
          kategori={aktifSekme}
          yukleniyor={yukleniyor}
          onDuzenle={handleDuzenle}
          onSil={setSilinecek}
        />
      )}

      {formAcik && (
        <StokForm
          duzenlenecek={duzenlenecek}
          cariler={cariler}
          defaultKategori={aktifSekme}
          onKaydet={handleKaydet}
          onKapat={handleFormKapat}
        />
      )}

      {silinecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Stok Silinsin mi?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{silinecek.ad}</span> adlı stok
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
