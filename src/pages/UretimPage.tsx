import { useState, useMemo } from 'react'
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

const FILTRELER: { deger: string; etiket: string }[] = [
  { deger: 'hepsi',        etiket: 'Hepsi' },
  { deger: 'hazirlaniyor', etiket: 'Hazırlanıyor' },
  { deger: 'export_edildi',etiket: 'Export Edildi' },
  { deger: 'yikamada',     etiket: 'Yıkamada' },
  { deger: 'tamamlandi',   etiket: 'Tamamlandı' },
  { deger: 'eksik_var',    etiket: 'Eksik Var' },
  { deger: 'iptal',        etiket: 'İptal' },
]

export default function UretimPage() {
  const { emirler, yukleniyor, hata, yeniBatch, durumGuncelle, sil, iptalEt, yenile } = useUretim()
  const { stoklar } = useStok()
  const [aktifFiltre, setAktifFiltre] = useState('hepsi')
  const [seciliEmir, setSeciliEmir] = useState<UretimEmri | null>(null)
  const [seciliSiparis, setSeciliSiparis] = useState<Siparis | null>(null)
  const [silinecek, setSilinecek] = useState<UretimEmri | null>(null)
  const [iptalEdilecek, setIptalEdilecek] = useState<UretimEmri | null>(null)
  const [modalAcik, setModalAcik] = useState(false)
  const [siliniyorId, setSiliniyorId] = useState<string | null>(null)
  const [iptaleYapiliyor, setIptaleYapiliyor] = useState(false)

  const filtrelenmis = useMemo(
    () => aktifFiltre === 'hepsi' ? emirler : emirler.filter(e => e.durum === aktifFiltre),
    [emirler, aktifFiltre]
  )

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

  const handleIptal = async () => {
    if (!iptalEdilecek) return
    setIptaleYapiliyor(true)
    try {
      await iptalEt(iptalEdilecek.id)
      setIptalEdilecek(null)
      if (seciliEmir?.id === iptalEdilecek.id) setSeciliEmir(null)
    } finally {
      setIptaleYapiliyor(false)
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

      {/* Filtreler */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTRELER.map((f) => {
          const sayi = f.deger === 'hepsi' ? emirler.length : emirler.filter(e => e.durum === f.deger).length
          return (
            <button
              key={f.deger}
              onClick={() => setAktifFiltre(f.deger)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                aktifFiltre === f.deger
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {f.etiket}
              {sayi > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${aktifFiltre === f.deger ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {sayi}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Hata */}
      {hata && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
          {hata}
        </div>
      )}

      {/* Tablo */}
      <UretimListesi
        emirler={filtrelenmis}
        yukleniyor={yukleniyor}
        aktifFiltre={aktifFiltre}
        onGoruntule={setSeciliEmir}
        onSil={setSilinecek}
        onIptal={setIptalEdilecek}
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

      {/* İptal onay modalı */}
      {iptalEdilecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Batch'i İptal Et</h2>
            <p className="text-sm text-gray-600 mb-5">
              <span className="font-medium text-gray-800">{iptalEdilecek.batch_no}</span> iptal edilecek.
              İçindeki siparişler <span className="font-medium">Beklemede</span> durumuna döndürülecek.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIptalEdilecek(null)}
                disabled={iptaleYapiliyor}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={handleIptal}
                disabled={iptaleYapiliyor}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {iptaleYapiliyor ? 'İptal ediliyor...' : 'İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Silme onay modalı */}
      {silinecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Batch'i Sil</h2>
            <p className="text-sm text-gray-600 mb-5">
              <span className="font-medium text-gray-800">{silinecek.batch_no}</span> kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSilinecek(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Vazgeç
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
