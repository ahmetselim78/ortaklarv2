import { useState, useEffect } from 'react'
import { Plus, Package, AlertTriangle, RefreshCw } from 'lucide-react'
import { useStok } from '@/hooks/useStok'
import { useCari } from '@/hooks/useCari'
import EmptyState from '@/components/ui/EmptyState'
import StokListesi from '@/components/stok/StokListesi'
import StokForm, { type StokFormOnDegerleri, type StokPayload } from '@/components/stok/StokForm'
import { supabase } from '@/lib/supabase'
import { eskiStokReferanslariniMigrate, eskiStokReferansSayisi, pasifCitaReferanslariniMigrate, pasifCitaReferansSayisi } from '@/lib/stokMigrasyon'
import { citaKodOnerisi, citaStokAdi, eksikCitaBoyutlari } from '@/lib/cam'
import type { Stok, StokKategori } from '@/types/stok'

const SEKMELER: { key: StokKategori; label: string }[] = [
  { key: 'cam', label: 'Cam Stokları' },
  { key: 'cita', label: 'Çıta' },
  { key: 'yan_malzeme', label: 'Yan Malzemeler' },
]

async function stokKullanimSayisi(stokId: string): Promise<{ stok: number; cita: number }> {
  const [stokRes, citaRes] = await Promise.all([
    supabase.from('siparis_detaylari').select('id', { count: 'exact', head: true }).eq('stok_id', stokId),
    supabase.from('siparis_detaylari').select('id', { count: 'exact', head: true }).eq('cita_stok_id', stokId),
  ])
  return { stok: stokRes.count ?? 0, cita: citaRes.count ?? 0 }
}

export default function StokPage() {
  const { stoklar, yukleniyor, hata, ekle, guncelle, sil } = useStok()
  const { cariler } = useCari()
  const [aktifSekme, setAktifSekme] = useState<StokKategori>('cam')
  const [formAcik, setFormAcik] = useState(false)
  const [duzenlenecek, setDuzenlenecek] = useState<Stok | null>(null)
  const [formOnDegerler, setFormOnDegerler] = useState<StokFormOnDegerleri | null>(null)
  const [silinecek, setSilinecek] = useState<Stok | null>(null)
  const [siliniyor, setSiliniyor] = useState(false)
  const [silHatasi, setSilHatasi] = useState<string | null>(null)
  const [migrasyonModu, setMigrasyonModu] = useState(false)
  const [migrasyonHedefId, setMigrasyonHedefId] = useState('')
  const [migrasyonOnaylandi, setMigrasyonOnaylandi] = useState(false)
  const [kullanimSayisi, setKullanimSayisi] = useState<{ stok: number; cita: number } | null>(null)
  const [pasifOnay, setPasifOnay] = useState<Stok | null>(null)
  const [migrasyonSayisi, setMigrasyonSayisi] = useState<number | null>(null)
  const [citaMigrasyonSayisi, setCitaMigrasyonSayisi] = useState<number | null>(null)
  const [migrasyonCalisiyor, setMigrasyonCalisiyor] = useState(false)
  const [citaMigrasyonCalisiyor, setCitaMigrasyonCalisiyor] = useState(false)
  const [eksikCitaEkleniyor, setEksikCitaEkleniyor] = useState(false)
  const [migrasyonSonuc, setMigrasyonSonuc] = useState<string | null>(null)
  const [citaMigrasyonSonuc, setCitaMigrasyonSonuc] = useState<string | null>(null)

  useEffect(() => {
    if (aktifSekme === 'cam') {
      eskiStokReferansSayisi()
        .then(setMigrasyonSayisi)
        .catch(() => setMigrasyonSayisi(null))
      return
    }
    if (aktifSekme === 'cita') {
      pasifCitaReferansSayisi()
        .then(setCitaMigrasyonSayisi)
        .catch(() => setCitaMigrasyonSayisi(null))
    }
  }, [aktifSekme, stoklar])

  const handleDuzenle = (stok: Stok) => {
    setDuzenlenecek(stok)
    setFormOnDegerler(null)
    setFormAcik(true)
  }

  const handleFormKapat = () => {
    setFormAcik(false)
    setDuzenlenecek(null)
    setFormOnDegerler(null)
  }

  const handleKaydet = async (veri: StokPayload) => {
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

  const handlePasifleştir = async (stok: Stok) => {
    const kullanim = await stokKullanimSayisi(stok.id)
    if (kullanim.stok + kullanim.cita > 0) {
      setPasifOnay(stok)
      return
    }
    await guncelle(stok.id, { aktif: false })
  }

  const handlePasifOnayla = async () => {
    if (!pasifOnay) return
    await guncelle(pasifOnay.id, { aktif: false })
    setPasifOnay(null)
  }

  const handleAktifleştir = async (stok: Stok) => {
    await guncelle(stok.id, { aktif: true })
  }

  const handleReferansAktar = async (stok: Stok) => {
    const kullanim = await stokKullanimSayisi(stok.id)
    setKullanimSayisi(kullanim)
    setSilinecek(stok)
    setMigrasyonModu(true)
  }

  const handleSil = async (stok: Stok) => {
    setSilHatasi(null)
    const kullanim = await stokKullanimSayisi(stok.id)
    if (kullanim.stok + kullanim.cita > 0) {
      setKullanimSayisi(kullanim)
      setSilinecek(stok)
      setMigrasyonModu(true)
      return
    }
    setSilinecek(stok)
    setMigrasyonModu(false)
  }

  const handleSilOnayla = async () => {
    if (!silinecek) return
    setSiliniyor(true)
    setSilHatasi(null)
    try {
      await sil(silinecek.id)
      handleSilKapat()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('siparis_detaylari')) {
        const kullanim = await stokKullanimSayisi(silinecek.id)
        setKullanimSayisi(kullanim)
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
    } catch (err: unknown) {
      setSilHatasi(err instanceof Error ? err.message : 'Aktarım sırasında hata oluştu.')
    } finally {
      setSiliniyor(false)
    }
  }

  const handleTopluMigrasyon = async () => {
    setMigrasyonCalisiyor(true)
    setMigrasyonSonuc(null)
    try {
      const sonuc = await eskiStokReferanslariniMigrate()
      setMigrasyonSonuc(
        `${sonuc.guncellenen} kayıt güncellendi.` +
        (sonuc.eslesmeyen.length > 0 ? ` ${sonuc.eslesmeyen.length} kayıt manuel müdahale gerektiriyor.` : '')
      )
      const kalan = await eskiStokReferansSayisi()
      setMigrasyonSayisi(kalan)
    } catch (err: unknown) {
      setMigrasyonSonuc(err instanceof Error ? err.message : 'Migrasyon başarısız')
    } finally {
      setMigrasyonCalisiyor(false)
    }
  }

  const handleCitaMigrasyon = async () => {
    setCitaMigrasyonCalisiyor(true)
    setCitaMigrasyonSonuc(null)
    try {
      const sonuc = await pasifCitaReferanslariniMigrate()
      setCitaMigrasyonSonuc(
        `${sonuc.guncellenen} kayıt güncellendi.` +
        (sonuc.eslesmeyen.length > 0 ? ` ${sonuc.eslesmeyen.length} kayıt manuel müdahale gerektiriyor.` : '')
      )
      const kalan = await pasifCitaReferansSayisi()
      setCitaMigrasyonSayisi(kalan)
    } catch (err: unknown) {
      setCitaMigrasyonSonuc(err instanceof Error ? err.message : 'Migrasyon başarısız')
    } finally {
      setCitaMigrasyonCalisiyor(false)
    }
  }

  const handleEksikCitalariEkle = async () => {
    const eksik = eksikCitaBoyutlari(stoklar)
    if (eksik.length === 0) return
    setEksikCitaEkleniyor(true)
    try {
      for (const mm of eksik) {
        const onerilenKod = citaKodOnerisi(mm)
        const kodVar = stoklar.some((s) => s.kod === onerilenKod)
        await ekle({
          kod: kodVar ? '' : onerilenKod,
          ad: citaStokAdi(mm),
          kategori: 'cita',
          kalinlik_mm: mm,
          birim: 'm',
          grup: null,
          katman_yapisi: null,
          birim_fiyat: null,
          tedarikci_id: null,
          marka: null,
          aktif: true,
        })
      }
    } finally {
      setEksikCitaEkleniyor(false)
    }
  }

  const kategoriStoklar = stoklar.filter((s) => s.kategori === aktifSekme)
  const aktifSayisi = kategoriStoklar.filter((s) => s.aktif !== false).length
  const pasifSayisi = kategoriStoklar.filter((s) => s.aktif === false).length
  const stokAd = (stok: Stok | null | undefined) => stok?.ad ?? ''
  const yeniStokEtiketi = aktifSekme === 'cam'
    ? 'Yeni Cam Stoğu'
    : aktifSekme === 'cita'
      ? 'Yeni Çıta'
      : 'Yeni Stok'
  const eksikCitaBoyut = aktifSekme === 'cita' ? eksikCitaBoyutlari(stoklar) : []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Stok / Ürün Kataloğu</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {aktifSayisi} aktif
            {pasifSayisi > 0 && <> · {pasifSayisi} pasif</>}
          </p>
        </div>
        <button
          onClick={() => {
            setDuzenlenecek(null)
            setFormOnDegerler(null)
            setFormAcik(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          {yeniStokEtiketi}
        </button>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {SEKMELER.map((s) => {
          const kategoriKayitlar = stoklar.filter((x) => x.kategori === s.key)
          const aktif = kategoriKayitlar.filter((x) => x.aktif !== false).length
          const secili = aktifSekme === s.key
          return (
            <button
              key={s.key}
              onClick={() => setAktifSekme(s.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                secili
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {s.label}
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums ${
                  secili ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {aktif}
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

      {aktifSekme === 'cita' && eksikCitaBoyut.length > 0 && (
        <div className="mb-4 p-4 rounded-xl border border-blue-200 bg-blue-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-blue-900">
              Eksik standart çıta boyutları: {eksikCitaBoyut.map((mm) => `${mm}mm`).join(', ')}
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              PDF içe aktarma ve sipariş eşleştirmesi için bu boyutların aktif stok kartı olması gerekir.
            </p>
          </div>
          <button
            type="button"
            onClick={handleEksikCitalariEkle}
            disabled={eksikCitaEkleniyor}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            <Plus size={14} />
            {eksikCitaEkleniyor ? 'Ekleniyor...' : 'Eksik Boyutları Ekle'}
          </button>
        </div>
      )}

      {aktifSekme === 'cita' && citaMigrasyonSayisi != null && citaMigrasyonSayisi > 0 && (
        <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-900">
              {citaMigrasyonSayisi} sipariş satırı pasif çıta stok kartına referans veriyor
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Aynı mm değerine sahip aktif çıta kartlarına otomatik taşıyabilirsiniz.
            </p>
            {citaMigrasyonSonuc && (
              <p className="text-xs text-amber-800 mt-1">{citaMigrasyonSonuc}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleCitaMigrasyon}
            disabled={citaMigrasyonCalisiyor}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={14} className={citaMigrasyonCalisiyor ? 'animate-spin' : ''} />
            {citaMigrasyonCalisiyor ? 'Aktarılıyor...' : 'Referansları Düzelt'}
          </button>
        </div>
      )}

      {aktifSekme === 'cam' && migrasyonSayisi != null && migrasyonSayisi > 0 && (
        <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-900">
              {migrasyonSayisi} sipariş satırı eski/pasif cam stok kartına referans veriyor
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Kombinasyon kartlarına otomatik taşıyabilirsiniz.
            </p>
            {migrasyonSonuc && (
              <p className="text-xs text-amber-800 mt-1">{migrasyonSonuc}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleTopluMigrasyon}
            disabled={migrasyonCalisiyor}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={14} className={migrasyonCalisiyor ? 'animate-spin' : ''} />
            {migrasyonCalisiyor ? 'Aktarılıyor...' : 'Referansları Düzelt'}
          </button>
        </div>
      )}

      {!yukleniyor && stoklar.length === 0 && !hata ? (
        <EmptyState
          icon={Package}
          baslik="Henüz stok kaydı yok"
          aciklama="Cam stokları, çıta ve yan malzemelerinizi ekleyerek katalogları oluşturun."
          aksiyon={
            <button
              onClick={() => setFormAcik(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              {yeniStokEtiketi}
            </button>
          }
        />
      ) : (
        <StokListesi
          stoklar={stoklar}
          kategori={aktifSekme}
          yukleniyor={yukleniyor}
          onDuzenle={handleDuzenle}
          onSil={handleSil}
          onPasifleştir={handlePasifleştir}
          onAktifleştir={handleAktifleştir}
          onReferansAktar={handleReferansAktar}
        />
      )}

      {formAcik && (
        <StokForm
          duzenlenecek={duzenlenecek}
          cariler={cariler}
          defaultKategori={aktifSekme}
          onDegerler={formOnDegerler}
          onKaydet={handleKaydet}
          onKapat={handleFormKapat}
        />
      )}

      {pasifOnay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Pasifleştirilsin mi?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{stokAd(pasifOnay)}</span> önceki siparişlerde
              kullanılıyor. Pasifleştirildiğinde yeni siparişlerde görünmez; mevcut kayıtlar korunur.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPasifOnay(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handlePasifOnayla}
                className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700"
              >
                Pasifleştir
              </button>
            </div>
          </div>
        </div>
      )}

      {silinecek && !migrasyonModu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Stok Silinsin mi?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{stokAd(silinecek)}</span> adlı stok
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
                  <span className="font-medium text-gray-700">{stokAd(silinecek)}</span> adlı stok
                  önceki siparişlerde kullanılıyor
                  {kullanimSayisi && (
                    <>
                      {' '}({kullanimSayisi.stok + kullanimSayisi.cita} kayıt
                      {kullanimSayisi.stok > 0 && kullanimSayisi.cita > 0
                        ? `: ${kullanimSayisi.stok} cam, ${kullanimSayisi.cita} çıta`
                        : kullanimSayisi.cita > 0
                          ? ', çıta referansı'
                          : ''}
                      )
                    </>
                  )}.
                  Silmek için referansları başka bir stoğa aktarmanız veya pasifleştirmeniz önerilir.
                </p>
              </div>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await guncelle(silinecek.id, { aktif: false })
                  handleSilKapat()
                }}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                Pasifleştir (önerilen)
              </button>
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
                  .filter((s) => {
                    if (s.id === silinecek.id || s.kategori !== silinecek.kategori || s.aktif === false) {
                      return false
                    }
                    if (silinecek.kategori === 'cita' && silinecek.kalinlik_mm != null) {
                      return Math.round(s.kalinlik_mm ?? 0) === Math.round(silinecek.kalinlik_mm)
                    }
                    return true
                  })
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.kod} — {stokAd(s)}
                      {s.kategori === 'cita' && s.kalinlik_mm != null ? ` (${s.kalinlik_mm} mm)` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {migrasyonHedefId && !migrasyonOnaylandi && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  Tüm referanslar{' '}
                  <span className="font-semibold">
                    {stokAd(stoklar.find((s) => s.id === migrasyonHedefId))}
                  </span>{' '}
                  stoğuna aktarılacak ve{' '}
                  <span className="font-semibold">{stokAd(silinecek)}</span> silinecek.
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
