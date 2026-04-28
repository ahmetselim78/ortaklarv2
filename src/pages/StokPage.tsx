import { useState } from 'react'
import { Plus, Package, AlertTriangle } from 'lucide-react'
import { useStok } from '@/hooks/useStok'
import { useCari } from '@/hooks/useCari'
import EmptyState from '@/components/ui/EmptyState'
import StokListesi from '@/components/stok/StokListesi'
import StokForm from '@/components/stok/StokForm'
import { supabase } from '@/lib/supabase'
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
  const [silHatasi, setSilHatasi] = useState<string | null>(null)
  const [migrasyonModu, setMigrasyonModu] = useState(false)
  const [migrasyonHedefId, setMigrasyonHedefId] = useState('')
  const [migrasyonOnaylandi, setMigrasyonOnaylandi] = useState(false)
  const [kullanimSayisi, setKullanimSayisi] = useState<{ stok: number; cita: number } | null>(null)

  const handleDuzenle = (stok: Stok) => {
    setDuzenlenecek(stok)
    setFormAcik(true)
  }

  const handleFormKapat = () => {
    setFormAcik(false)
    setDuzenlenecek(null)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleKaydet = async (veri: any) => {
    if (duzenlenecek) {
      await guncelle(duzenlenecek.id, veri)
    } else {
      await ekle(veri)
    }
  }

  const handleSilKapat = () => {
    setSilinecek(null)
    setSilHatasi(null)
    setMigrasyonModu(false)
    setMigrasyonHedefId('')
    setMigrasyonOnaylandi(false)
    setKullanimSayisi(null)
  }

  const handleSilOnayla = async () => {
    if (!silinecek) return
    setSiliniyor(true)
    setSilHatasi(null)
    try {
      await sil(silinecek.id)
      handleSilKapat()
    } catch (err: any) {
      const msg: string = err?.message ?? ''
      if (msg.includes('siparis_detaylari')) {
        const [stokRes, citaRes] = await Promise.all([
          supabase.from('siparis_detaylari').select('id', { count: 'exact', head: true }).eq('stok_id', silinecek.id),
          supabase.from('siparis_detaylari').select('id', { count: 'exact', head: true }).eq('cita_stok_id', silinecek.id),
        ])
        setKullanimSayisi({ stok: stokRes.count ?? 0, cita: citaRes.count ?? 0 })
        setMigrasyonModu(true)
      } else {
        setSilHatasi(msg || 'Silme işlemi başarısız oldu.')
      }
    } finally {
      setSiliniyor(false)
    }
  }

  const handleMigrasyon = async () => {
    if (!silinecek || !migrasyonHedefId) return
    setSiliniyor(true)
    setSilHatasi(null)
    try {
      if (kullanimSayisi?.stok) {
        const { error } = await supabase
          .from('siparis_detaylari')
          .update({ stok_id: migrasyonHedefId })
          .eq('stok_id', silinecek.id)
        if (error) throw new Error(error.message)
      }
      if (kullanimSayisi?.cita) {
        const { error } = await supabase
          .from('siparis_detaylari')
          .update({ cita_stok_id: migrasyonHedefId })
          .eq('cita_stok_id', silinecek.id)
        if (error) throw new Error(error.message)
      }
      await sil(silinecek.id)
      handleSilKapat()
    } catch (err: any) {
      setSilHatasi(err?.message ?? 'Aktarım sırasında hata oluştu.')
    } finally {
      setSiliniyor(false)
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
        {SEKMELER.map((s) => {
          const count = stoklar.filter((x) => x.kategori === s.key).length
          const aktif = aktifSekme === s.key
          return (
            <button
              key={s.key}
              onClick={() => setAktifSekme(s.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                aktif
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {s.label}
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums ${
                  aktif ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {hata && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {hata}
        </div>
      )}

      {!yukleniyor && stoklar.length === 0 && !hata ? (
        <EmptyState
          icon={Package}
          baslik="Henüz stok kaydı yok"
          aciklama={'Cam, çıta ve yan malzemelerinizi ekleyerek katalogları oluşturun.'}
          aksiyon={
            <button
              onClick={() => setFormAcik(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              Yeni Stok
            </button>
          }
        />
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

      {silinecek && !migrasyonModu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Stok Silinsin mi?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{silinecek.ad}</span> adlı stok
              kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>
            {silHatasi && (
              <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {silHatasi}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleSilKapat}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSilOnayla}
                disabled={siliniyor}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {siliniyor ? 'Kontrol ediliyor...' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {silinecek && migrasyonModu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Stok Kullanımda</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className="font-medium text-gray-700">{silinecek.ad}</span> adlı stok
                  önceki siparişlerde kullanılıyor
                  {kullanimSayisi && (
                    <> ({(kullanimSayisi.stok + kullanimSayisi.cita)} kayıt)</>
                  )}.
                  Silmek için tüm referansları başka bir stoğa aktarmanız gerekiyor.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Aktarılacak Stok
              </label>
              <select
                value={migrasyonHedefId}
                onChange={(e) => { setMigrasyonHedefId(e.target.value); setMigrasyonOnaylandi(false) }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Stok seçin...</option>
                {stoklar
                  .filter((s) => s.id !== silinecek.id && s.kategori === silinecek.kategori)
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.kod} — {s.ad}</option>
                  ))}
              </select>
            </div>

            {migrasyonHedefId && !migrasyonOnaylandi && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  Tüm referanslar{' '}
                  <span className="font-semibold">
                    {stoklar.find((s) => s.id === migrasyonHedefId)?.ad}
                  </span>{' '}
                  stoğuna aktarılacak ve{' '}
                  <span className="font-semibold">{silinecek.ad}</span> silinecek.
                  Bu işlem <span className="font-semibold">geri alınamaz</span>. Emin misiniz?
                </p>
                <button
                  onClick={() => setMigrasyonOnaylandi(true)}
                  className="mt-3 px-4 py-1.5 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700"
                >
                  Evet, Eminim
                </button>
              </div>
            )}

            {silHatasi && (
              <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {silHatasi}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleSilKapat}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleMigrasyon}
                disabled={!migrasyonHedefId || !migrasyonOnaylandi || siliniyor}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {siliniyor ? 'Aktarılıyor...' : 'Aktar ve Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
