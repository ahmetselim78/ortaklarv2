import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useUretim } from '@/hooks/useUretim'
import { useStok } from '@/hooks/useStok'
import { supabase } from '@/lib/supabase'
import UretimListesi from '@/components/uretim/UretimListesi'
import UretimDetayModal from '@/components/uretim/UretimDetayModal'
import YeniBatchModal from '@/components/uretim/YeniBatchModal'
import SiparisDetayModal from '@/components/siparis/SiparisDetayModal'
import type { UretimEmri, UretimEmriDurum } from '@/types/uretim'
import type { Siparis } from '@/types/siparis'

export default function UretimPage() {
  const { emirler, yukleniyor, hata, yeniBatch, durumGuncelle, sil, yenile } = useUretim()
  const { stoklar } = useStok()
  const [seciliEmir, setSeciliEmir] = useState<UretimEmri | null>(null)
  const [seciliSiparis, setSeciliSiparis] = useState<Siparis | null>(null)
  const [silinecek, setSilinecek] = useState<UretimEmri | null>(null)
  const [modalAcik, setModalAcik] = useState(false)
  const [siliniyorId, setSiliniyorId] = useState<string | null>(null)

  const handleSiparisAc = async (siparisId: string) => {
    const { data, error } = await supabase
      .from('siparisler')
      .select('*, cari(ad, kod)')
      .eq('id', siparisId)
      .single()
    if (!error && data) setSeciliSiparis(data as Siparis)
  }

  const handleBatchOlustur = async (siparisIds: string[]) => {
    await yeniBatch(siparisIds)
    setModalAcik(false)
  }

  const handleDurumDegisti = async (id: string, durum: UretimEmriDurum) => {
    await durumGuncelle(id, durum)
    // Açık modal'ın emirini güncelle
    if (seciliEmir?.id === id) {
      setSeciliEmir((prev) => prev ? { ...prev, durum } : prev)
    }
  }

  const handleSil = async () => {
    if (!silinecek) return
    setSiliniyorId(silinecek.id)
    try {
      await sil(silinecek.id)
    } finally {
      setSiliniyorId(null)
      setSilinecek(null)
      if (seciliEmir?.id === silinecek.id) setSeciliEmir(null)
    }
  }

  return (
    <div className="p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Üretim Emirleri</h1>
          <p className="text-sm text-gray-500 mt-0.5">Üretim partileri (batch) oluşturun ve PerfectCut'a export edin.</p>
        </div>
        <button
          onClick={() => setModalAcik(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Plus size={16} />
          Yeni Batch
        </button>
      </div>

      {/* Hata */}
      {hata && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
          {hata}
        </div>
      )}

      {/* Tablo */}
      <UretimListesi
        emirler={emirler}
        yukleniyor={yukleniyor}
        onGoruntule={setSeciliEmir}
        onSil={setSilinecek}
        onSiparisAc={handleSiparisAc}
      />

      {/* Detay Modalı */}
      {seciliEmir && (
        <UretimDetayModal
          emir={seciliEmir}
          onDurumDegisti={handleDurumDegisti}
          onKapat={() => setSeciliEmir(null)}
          onGuncellendi={yenile}
        />
      )}

      {/* Silme onay modalı */}
      {silinecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Batch'i Sil</h2>
            <p className="text-sm text-gray-600 mb-5">
              <span className="font-medium text-gray-800">{silinecek.batch_no}</span> silinecek. Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSilinecek(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSil}
                disabled={siliniyorId === silinecek.id}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                <Trash2 size={14} />
                {siliniyorId ? 'Siliniyor...' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Yeni Batch Modalı */}
      {modalAcik && (
        <YeniBatchModal
          onOlustur={handleBatchOlustur}
          onKapat={() => setModalAcik(false)}
        />
      )}

      {/* Sipariş Detay Modalı */}
      {seciliSiparis && (
        <SiparisDetayModal
          siparis={seciliSiparis}
          stoklar={stoklar}
          onKapat={() => setSeciliSiparis(null)}
        />
      )}
    </div>
  )
}
