import { useState, useEffect } from 'react'
import { Plus, ClipboardList, FileUp } from 'lucide-react'
import Pagination from '@/components/ui/Pagination'
import { useSiparis } from '@/hooks/useSiparis'
import { useCari } from '@/hooks/useCari'
import { useStok } from '@/hooks/useStok'
import SiparisListesi from '@/components/siparis/SiparisListesi'
import SiparisForm from '@/components/siparis/SiparisForm'
import SiparisDetayModal from '@/components/siparis/SiparisDetayModal'
import PDFImportModal from '@/components/siparis/PDFImportModal'
import type { Siparis, SiparisDurum } from '@/types/siparis'
import { cn } from '@/lib/utils'

const DURUM_FILTRELER: { deger: 'hepsi' | SiparisDurum; etiket: string }[] = [
  { deger: 'hepsi', etiket: 'Hepsi' },
  { deger: 'beklemede', etiket: 'Beklemede' },
  { deger: 'batchte', etiket: 'Batch\'te' },
  { deger: 'yikamada', etiket: 'Yıkamada' },
  { deger: 'tamamlandi', etiket: 'Tamamlandı' },
  { deger: 'eksik_var', etiket: 'Eksik Var' },
  { deger: 'iptal', etiket: 'İptal' },
]

export default function SiparisPage() {
  const { siparisler, yukleniyor, hata, ekle, guncelle, sil, yenile } = useSiparis()
  const { cariler } = useCari()
  const { stoklar } = useStok()

  const [formAcik, setFormAcik] = useState(false)
  const [pdfModalAcik, setPdfModalAcik] = useState(false)
  const [gorunenSiparis, setGorunenSiparis] = useState<Siparis | null>(null)
  const [silinecek, setSilinecek] = useState<Siparis | null>(null)
  const [siliniyor, setSiliniyor] = useState(false)
  const [durumFiltre, setDurumFiltre] = useState<'hepsi' | SiparisDurum>('hepsi')
  const [sayfa, setSayfa] = useState(1)
  const SAYFA_BOYUTU = 20

  const filtrelenmis = durumFiltre === 'hepsi'
    ? siparisler
    : siparisler.filter((s) => s.durum === durumFiltre)

  const sayfali = filtrelenmis.slice((sayfa - 1) * SAYFA_BOYUTU, sayfa * SAYFA_BOYUTU)

  useEffect(() => { setSayfa(1) }, [durumFiltre])

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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Üst başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Siparişler</h1>
          <p className="text-sm text-gray-500 mt-0.5">{siparisler.length} sipariş</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setPdfModalAcik(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <FileUp size={16} />
            PDF'den İçe Aktar
          </button>
          <button
            onClick={() => setFormAcik(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Yeni Sipariş
          </button>
        </div>
      </div>

      {/* Durum Filtresi */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {DURUM_FILTRELER.map(({ deger, etiket }) => (
          <button
            key={deger}
            onClick={() => setDurumFiltre(deger)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              durumFiltre === deger
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            )}
          >
            {etiket}
          </button>
        ))}
      </div>

      {hata && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{hata}</div>
      )}

      {!yukleniyor && siparisler.length === 0 && !hata ? (
        <div className="text-center py-24 text-gray-400">
          <ClipboardList size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Henüz sipariş yok</p>
          <p className="text-sm mt-1">Sağ üstteki "Yeni Sipariş" butonuyla ekleyin.</p>
        </div>
      ) : (
        <>
          <SiparisListesi
            siparisler={sayfali}
            yukleniyor={yukleniyor}
            onGoruntule={setGorunenSiparis}
            onSil={setSilinecek}
          />
          <Pagination
            toplamKayit={filtrelenmis.length}
            sayfaBoyutu={SAYFA_BOYUTU}
            mevcutSayfa={sayfa}
            onSayfaDegistir={setSayfa}
          />
        </>
      )}

      {/* Yeni Sipariş Formu */}
      {formAcik && (
        <SiparisForm
          cariler={cariler}
          stoklar={stoklar}
          onKaydet={ekle}
          onKapat={() => setFormAcik(false)}
        />
      )}

      {/* Detay Modalı */}
      {gorunenSiparis && (
        <SiparisDetayModal
          siparis={gorunenSiparis}
          onGuncelle={guncelle}
          onKapat={() => { setGorunenSiparis(null); yenile() }}
        />
      )}

      {/* PDF Import */}
      {pdfModalAcik && (
        <PDFImportModal
          cariler={cariler.filter((c) => c.tipi === 'musteri')}
          stoklar={stoklar}
          onIceAktar={async (form) => { await ekle(form); yenile(); return '' }}
          onKapat={() => { setPdfModalAcik(false); yenile() }}
        />
      )}

      {/* Silme Onayı */}
      {silinecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Sipariş Silinsin mi?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{silinecek.siparis_no}</span> ve
              tüm cam parçaları kalıcı olarak silinecek.
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
