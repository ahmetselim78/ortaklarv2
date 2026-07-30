import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react'
import { useEscape } from '@/hooks/useEscape'
import {
  STOK_HAREKET_ETIKETLERI,
  stokHareketiGirisMi,
  stokMiktari,
  yerelTarihSaatDegeri,
} from '@/lib/stokHareket'
import type {
  StokHareketPayload,
  StokHareketTuru,
  StokKatalogKaydi,
  StokTedarikcisi,
} from '@/types/stok'

const HAREKET_TURLERI = Object.keys(STOK_HAREKET_ETIKETLERI) as StokHareketTuru[]

export default function StokHareketModal({
  stoklar,
  tedarikciler,
  baslangicStokId,
  onKaydet,
  onKapat,
}: {
  stoklar: StokKatalogKaydi[]
  tedarikciler: StokTedarikcisi[]
  baslangicStokId?: string | null
  onKaydet: (payload: StokHareketPayload) => Promise<void>
  onKapat: () => void
}) {
  useEscape(onKapat)
  const aktifStoklar = useMemo(() => stoklar.filter((stok) => stok.aktif), [stoklar])
  const [stokId, setStokId] = useState(baslangicStokId ?? '')
  const [hareketTuru, setHareketTuru] = useState<StokHareketTuru>('alis_girisi')
  const [miktar, setMiktar] = useState('')
  const [tedarikciId, setTedarikciId] = useState('')
  const [islemTarihi, setIslemTarihi] = useState(yerelTarihSaatDegeri)
  const [belgeNo, setBelgeNo] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => setStokId(baslangicStokId ?? ''), [baslangicStokId])
  const seciliStok = aktifStoklar.find((stok) => stok.id === stokId) ?? null
  const giris = stokHareketiGirisMi(hareketTuru)
  const tedarikciZorunlu = hareketTuru === 'alis_girisi' || hareketTuru === 'iade_cikisi'
  const uygunTedarikciler = useMemo(() => {
    if (!seciliStok) return tedarikciler
    return tedarikciler.filter((tedarikci) => (
      tedarikci.tedarik_kapsamlari.length === 0
      || tedarikci.tedarik_kapsamlari.includes(seciliStok.kategori)
    ))
  }, [seciliStok, tedarikciler])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setHata(null)
    const sayisalMiktar = Number(miktar)
    if (!seciliStok || !Number.isFinite(sayisalMiktar) || sayisalMiktar <= 0) {
      setHata('Stok kartını ve sıfırdan büyük miktarı girin.')
      return
    }
    if (!giris && sayisalMiktar > Number(seciliStok.mevcut_miktar ?? 0)) {
      setHata(`Çıkış miktarı mevcut ${stokMiktari(Number(seciliStok.mevcut_miktar ?? 0), seciliStok.birim)} bakiyeyi aşamaz.`)
      return
    }
    if (tedarikciZorunlu && !tedarikciId) {
      setHata('Bu hareket için tedarikçi seçmelisiniz.')
      return
    }
    if (aciklama.trim().length < 3) {
      setHata('Hareket açıklaması en az 3 karakter olmalıdır.')
      return
    }
    const islemAni = new Date(islemTarihi)
    if (!islemTarihi || Number.isNaN(islemAni.getTime())) {
      setHata('Geçerli bir işlem tarihi seçmelisiniz.')
      return
    }

    setKaydediliyor(true)
    try {
      await onKaydet({
        stok_id: seciliStok.id,
        hareket_turu: hareketTuru,
        miktar: sayisalMiktar,
        tedarikci_id: tedarikciId || null,
        islem_tarihi: islemAni.toISOString(),
        belge_no: belgeNo.trim() || null,
        aciklama: aciklama.trim(),
      })
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Stok hareketi kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget && !kaydediliyor) onKapat() }}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Stok hareketi kaydet</h2>
            <p className="mt-0.5 text-xs text-gray-500">Miktar, bu değişmez hareket kaydından otomatik hesaplanır.</p>
          </div>
          <button type="button" onClick={onKapat} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Kapat"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
              Stok kartı *
              <select value={stokId} onChange={(event) => setStokId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Stok seçin</option>
                {aktifStoklar.map((stok) => <option key={stok.id} value={stok.id}>{stok.kod} · {stok.ad}</option>)}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Hareket türü *
              <select value={hareketTuru} onChange={(event) => setHareketTuru(event.target.value as StokHareketTuru)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <optgroup label="Girişler">
                  {HAREKET_TURLERI.filter(stokHareketiGirisMi).map((tur) => <option key={tur} value={tur}>{STOK_HAREKET_ETIKETLERI[tur]}</option>)}
                </optgroup>
                <optgroup label="Çıkışlar">
                  {HAREKET_TURLERI.filter((tur) => !stokHareketiGirisMi(tur)).map((tur) => <option key={tur} value={tur}>{STOK_HAREKET_ETIKETLERI[tur]}</option>)}
                </optgroup>
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Miktar {seciliStok ? `(${seciliStok.birim})` : ''} *
              <input value={miktar} onChange={(event) => setMiktar(event.target.value)} type="number" min="0.000001" step="0.001" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>

          {seciliStok && (
            <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${giris ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                {giris ? <ArrowDownToLine size={17} className="text-emerald-700" /> : <ArrowUpFromLine size={17} className="text-amber-700" />}
                {giris ? 'Stok artacak' : 'Stok azalacak'}
              </div>
              <div className="text-right text-xs text-gray-600">
                <div>Mevcut bakiye</div>
                <div className="mt-0.5 text-sm font-bold text-gray-900">{stokMiktari(Number(seciliStok.mevcut_miktar ?? 0), seciliStok.birim)}</div>
              </div>
            </div>
          )}

          {(tedarikciZorunlu || hareketTuru === 'iade_girisi') && (
            <label className="block text-sm font-medium text-gray-700">
              Tedarikçi {tedarikciZorunlu ? '*' : ''}
              <select value={tedarikciId} onChange={(event) => setTedarikciId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tedarikçi seçin</option>
                {uygunTedarikciler.map((tedarikci) => <option key={tedarikci.id} value={tedarikci.id}>{tedarikci.kod} · {tedarikci.ad}</option>)}
              </select>
              {uygunTedarikciler.length === 0 && <p className="mt-1 text-xs text-amber-600">Bu stok kategorisine uygun aktif tedarikçi bulunamadı.</p>}
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              İşlem tarihi *
              <input value={islemTarihi} onChange={(event) => setIslemTarihi(event.target.value)} type="datetime-local" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Belge / irsaliye no
              <input value={belgeNo} onChange={(event) => setBelgeNo(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            Açıklama *
            <textarea value={aciklama} onChange={(event) => setAciklama(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Hareketin nedeni veya teslim alan bilgisi" />
          </label>

          {hata && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</div>}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" disabled={kaydediliyor} onClick={onKapat} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">Vazgeç</button>
            <button type="submit" disabled={kaydediliyor || aktifStoklar.length === 0} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{kaydediliyor ? 'Kaydediliyor…' : 'Hareketi Kaydet'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
