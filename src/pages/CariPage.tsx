import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import CariCalismaAlani from '@/components/cari/CariCalismaAlani'
import CariForm from '@/components/cari/CariForm'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { useCari } from '@/hooks/useCari'
import { tedarikKapsamlariniTemizle } from '@/lib/tedarikKapsami'
import type { Cari, TedarikKapsami, TedarikciCalismaModeli } from '@/types/cari'

type CariFormVeri = {
  ad: string
  tipi: Cari['tipi']
  telefon?: string
  email?: string
  adres?: string
  notlar?: string
  tedarik_kapsamlari: TedarikKapsami[]
  tedarikci_calisma_modeli: TedarikciCalismaModeli
}

export default function CariPage() {
  const { cariler, yukleniyor, hata, ekle, guncelle, sil } = useCari()
  const { hasPermission } = useAuth()
  const navigate = useNavigate()
  const cariOlusturabilir = hasPermission('cari', 'create')
  const cariGuncelleyebilir = hasPermission('cari', 'update')
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

  const handleKaydet = async (veri: CariFormVeri) => {
    const payload: Parameters<typeof ekle>[0] = {
      ad: veri.ad,
      tipi: veri.tipi,
      telefon: veri.telefon || null,
      email: veri.email || null,
      adres: veri.adres || null,
      notlar: veri.notlar || null,
      aktif: veri.tipi === 'musteri'
        ? true
        : (duzenlenecek?.aktif ?? true),
      tedarik_kapsamlari: tedarikKapsamlariniTemizle(
        veri.tipi,
        veri.tedarik_kapsamlari,
      ),
      tedarikci_calisma_modeli: veri.tipi === 'tedarikci'
        ? veri.tedarikci_calisma_modeli
        : null,
    }
    if (duzenlenecek) {
      await guncelle(duzenlenecek.id, payload)
    } else {
      await ekle(payload)
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

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] space-y-3 p-4 sm:p-5">
      <PageHeader
        baslik="Cari Merkezi"
        aciklama="Müşteri ve tedarikçi kayıtlarını ayrı çalışma alanlarında yönetin."
        icon={Users}
        className="mb-0"
        aksiyon={cariOlusturabilir ? (
          <button
            type="button"
            onClick={() => setFormAcik(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            Yeni cari ekle
          </button>
        ) : undefined}
      />

      {hata && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata}
        </div>
      )}

      {!yukleniyor && cariler.length === 0 && !hata ? (
        <EmptyState
          icon={Users}
          baslik="Henüz cari kaydı yok"
          aciklama="Müşteri ve tedarikçilerinizi ekleyerek cari merkezini oluşturmaya başlayın."
          aksiyon={cariOlusturabilir ? (
            <button
              type="button"
              onClick={() => setFormAcik(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus size={16} />
              Yeni cari
            </button>
          ) : undefined}
        />
      ) : (
        <CariCalismaAlani
          cariler={cariler}
          onDuzenle={handleDuzenle}
          duzenleyebilir={cariGuncelleyebilir}
          onCariHesapAc={(cari) => navigate(
            `/cari-hesap?tur=${cari.tipi}&cari=${encodeURIComponent(cari.id)}`,
          )}
        />
      )}

      {formAcik && (duzenlenecek ? cariGuncelleyebilir : cariOlusturabilir) && (
        <CariForm
          duzenlenecek={duzenlenecek}
          onKaydet={handleKaydet}
          onKapat={handleFormKapat}
        />
      )}

      {silinecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Cari silinsin mi?</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              <span className="font-medium text-gray-800">{silinecek.ad}</span> kalıcı olarak silinecek.
              Ticari profili veya hesap hareketi bulunan cariler silinemez; bu durumda kartı pasife alın.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSilinecek(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSilOnayla}
                disabled={siliniyor}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {siliniyor ? 'Siliniyor…' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
