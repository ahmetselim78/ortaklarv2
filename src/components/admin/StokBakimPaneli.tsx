import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Wrench } from 'lucide-react'
import { useStok } from '@/hooks/useStok'
import { citaStokAdi, eksikCitaBoyutlari } from '@/lib/cam'
import {
  detayStokReferansiGuncelle,
  eskiStokReferanslariniMigrate,
  eskiStokReferansSayisi,
  pasifCitaReferanslariniMigrate,
  pasifCitaReferansSayisi,
  type MigrasyonKayit,
} from '@/lib/stokMigrasyon'

type BakimTuru = 'cam' | 'cita'

export default function StokBakimPaneli() {
  const { stoklar, ekle } = useStok()
  const [camSayisi, setCamSayisi] = useState<number | null>(null)
  const [citaSayisi, setCitaSayisi] = useState<number | null>(null)
  const [calisan, setCalisan] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [eslesmeyenler, setEslesmeyenler] = useState<MigrasyonKayit[]>([])
  const [eslesmeyenTuru, setEslesmeyenTuru] = useState<BakimTuru>('cam')
  const [secimler, setSecimler] = useState<Record<string, string>>({})
  const eksikCitalar = useMemo(() => eksikCitaBoyutlari(stoklar), [stoklar])
  const aktifHedefler = stoklar.filter((stok) => (
    stok.aktif && stok.kategori === (eslesmeyenTuru === 'cam' ? 'cam' : 'cita')
  ))

  const sayaclariYenile = async () => {
    const [cam, cita] = await Promise.all([eskiStokReferansSayisi(), pasifCitaReferansSayisi()])
    setCamSayisi(cam)
    setCitaSayisi(cita)
  }

  useEffect(() => {
    void sayaclariYenile().catch((error) => setHata(error instanceof Error ? error.message : 'Bakım sayaçları yüklenemedi.'))
  }, [])

  const migrate = async (tur: BakimTuru) => {
    setCalisan(tur)
    setHata(null)
    setMesaj(null)
    try {
      const sonuc = tur === 'cam'
        ? await eskiStokReferanslariniMigrate()
        : await pasifCitaReferanslariniMigrate()
      setEslesmeyenTuru(tur)
      setEslesmeyenler(sonuc.eslesmeyen)
      setSecimler({})
      setMesaj(`${sonuc.guncellenen} referans otomatik düzeltildi; ${sonuc.eslesmeyen.length} kayıt manuel seçim bekliyor.`)
      await sayaclariYenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Stok referansları düzeltilemedi.')
    } finally {
      setCalisan(null)
    }
  }

  const eksikleriEkle = async () => {
    setCalisan('eksik-cita')
    setHata(null)
    setMesaj(null)
    try {
      for (const mm of eksikCitalar) {
        await ekle({
          kod: '',
          ad: citaStokAdi(mm),
          kategori: 'cita',
          grup: null,
          katman_yapisi: null,
          kalinlik_mm: mm,
          birim: 'm',
          marka: null,
          minimum_miktar: 0,
          stok_yeri: null,
        })
      }
      setMesaj(`${eksikCitalar.length} standart çıta kartı eklendi.`)
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Eksik çıta kartları eklenemedi.')
    } finally {
      setCalisan(null)
    }
  }

  const manuelKaydet = async (kayit: MigrasyonKayit) => {
    const hedef = secimler[kayit.detay_id]
    if (!hedef) return
    setCalisan(kayit.detay_id)
    setHata(null)
    try {
      await detayStokReferansiGuncelle(
        kayit.detay_id,
        eslesmeyenTuru === 'cam' ? 'stok_id' : 'cita_stok_id',
        hedef,
      )
      setEslesmeyenler((onceki) => onceki.filter((satir) => satir.detay_id !== kayit.detay_id))
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Manuel eşleştirme kaydedilemedi.')
    } finally {
      setCalisan(null)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900"><Wrench size={18} /> Stok Bakımı</h3>
          <p className="mt-1 text-sm text-gray-500">Eski/pasif sipariş referanslarını düzeltin ve eksik standart çıta kartlarını tamamlayın.</p>
        </div>

        {hata && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={16} /> {hata}</div>}
        {mesaj && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={16} /> {mesaj}</div>}

        <div className="grid gap-4 lg:grid-cols-3">
          {([
            ['cam', 'Eski cam referansları', camSayisi, 'Aktif kombinasyon kartlarına otomatik eşleştir.'],
            ['cita', 'Pasif çıta referansları', citaSayisi, 'Aynı ölçüdeki aktif çıta kartına taşı.'],
          ] as const).map(([tur, baslik, adet, aciklama]) => (
            <div key={tur} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-semibold text-gray-900">{baslik}</div>
              <div className="mt-2 text-3xl font-bold text-gray-900">{adet ?? '—'}</div>
              <p className="mt-1 min-h-10 text-xs leading-5 text-gray-500">{aciklama}</p>
              <button type="button" disabled={!adet || Boolean(calisan)} onClick={() => void migrate(tur)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                {calisan === tur ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Düzeltmeyi Çalıştır
              </button>
            </div>
          ))}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">Eksik standart çıtalar</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{eksikCitalar.length}</div>
            <p className="mt-1 min-h-10 text-xs leading-5 text-gray-500">{eksikCitalar.length ? `${eksikCitalar.join(', ')} mm` : 'Tüm standart boyutlar mevcut.'}</p>
            <button type="button" disabled={!eksikCitalar.length || Boolean(calisan)} onClick={() => void eksikleriEkle()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              {calisan === 'eksik-cita' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Eksikleri Ekle
            </button>
          </div>
        </div>

        {eslesmeyenler.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-amber-200 bg-white">
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
              <h4 className="text-sm font-semibold text-amber-900">Manuel eşleştirme gerekenler</h4>
            </div>
            <div className="divide-y divide-gray-100">
              {eslesmeyenler.map((kayit) => (
                <div key={kayit.detay_id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,1fr)_auto] md:items-center">
                  <div>
                    <div className="font-mono text-xs text-gray-500">{kayit.eski_stok_kod}</div>
                    <div className="text-sm font-medium text-gray-900">{kayit.eski_stok_ad}</div>
                    {kayit.katman_yapisi && <div className="text-xs text-gray-500">{kayit.katman_yapisi}</div>}
                  </div>
                  <select value={secimler[kayit.detay_id] ?? ''} onChange={(event) => setSecimler((onceki) => ({ ...onceki, [kayit.detay_id]: event.target.value }))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Aktif hedef stok seçin…</option>
                    {aktifHedefler.map((stok) => <option key={stok.id} value={stok.id}>{stok.kod} — {stok.ad}</option>)}
                  </select>
                  <button type="button" disabled={!secimler[kayit.detay_id] || calisan === kayit.detay_id} onClick={() => void manuelKaydet(kayit)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                    {calisan === kayit.detay_id ? 'Kaydediliyor…' : 'Eşleştir'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
