import { AlertTriangle, CheckCircle2, Loader2, Plus, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ticariBugun, ticariPara } from '@/lib/ticariFormat'
import {
  stokAlisFiyatiAktiflestir,
  stokAlisFiyatiKaydet,
  stokAlisFiyatiKaydetVeAktiflestir,
} from '@/services/maliyetService'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type { Cari } from '@/types/cari'
import type { SadeMaliyetYonetimi, TedarikciMaliyetDetayi } from '@/types/maliyet'
import type { ParaBirimi } from '@/types/ticari'

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

export default function TedarikciManuelCamFiyati({
  tedarikci,
  katalog,
  detay,
  olusturabilir,
  aktiflestirebilir,
  onDegisti,
}: {
  tedarikci: Cari
  katalog: SadeMaliyetYonetimi
  detay: TedarikciMaliyetDetayi
  olusturabilir: boolean
  aktiflestirebilir: boolean
  onDegisti: () => Promise<void> | void
}) {
  const camProfilleri = useMemo(() => katalog.profiller
    .filter((profil) => profil.profil_turu === 'cam')
    .sort((a, b) => a.stok_adi.localeCompare(b.stok_adi, 'tr-TR')), [katalog.profiller])
  const camFiyatlari = useMemo(() => detay.fiyatlar
    .filter((fiyat) => fiyat.profil_turu === 'cam')
    .sort((a, b) => new Date(b.fiyat_tarihi).getTime() - new Date(a.fiyat_tarihi).getTime()), [detay.fiyatlar])
  const [formAcik, setFormAcik] = useState(false)
  const [stokId, setStokId] = useState(camProfilleri[0]?.stok_id ?? '')
  const [fiyat, setFiyat] = useState('')
  const [paraBirimi, setParaBirimi] = useState<ParaBirimi>('TRY')
  const [vadeGunu, setVadeGunu] = useState('0')
  const [baslangic, setBaslangic] = useState(ticariBugun())
  const [gerekce, setGerekce] = useState('Tedarikçiden alınan manuel cam fiyatı kaydedildi.')
  const [islem, setIslem] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)

  const kaydet = async (event: React.FormEvent) => {
    event.preventDefault()
    setHata(null)
    setBilgi(null)
    const profil = camProfilleri.find((aday) => aday.stok_id === stokId)
    if (!profil || Number(fiyat) <= 0 || Number(vadeGunu) < 0 || gerekce.trim().length < 5) {
      setHata('Cam stoğu, pozitif fiyat, geçerli vade ve açıklama zorunludur.')
      return
    }
    const baslangicZamani = new Date(`${baslangic}T00:00:00+03:00`).toISOString()
    const payload = {
      stok_id: profil.stok_id,
      tedarikci_id: tedarikci.id,
      birim_fiyat: fiyat,
      para_birimi: paraBirimi,
      fiyat_birimi: profil.fiyat_birimi || profil.birim,
      stok_ana_birimi: profil.stok_ana_birimi || profil.birim,
      donusum_katsayisi: String(profil.donusum_katsayisi || 1),
      vade_gunu: vadeGunu || '0',
      fiyat_tarihi: baslangicZamani,
      gecerlilik_baslangici: baslangicZamani,
      kaynak_referansi: gerekce.trim(),
      kaynak_ekran: 'cari_tedarikci_detayi' as const,
    }
    setIslem('kaydet')
    try {
      if (aktiflestirebilir) {
        await stokAlisFiyatiKaydetVeAktiflestir(
          payload,
          gerekce,
          yeniIdempotencyAnahtari(),
        )
      } else {
        await stokAlisFiyatiKaydet(payload, yeniIdempotencyAnahtari())
        setBilgi('Fiyat kaydedildi. Aktif maliyet olması için yetkili kullanıcının onayı bekleniyor.')
      }
      setFiyat('')
      setFormAcik(false)
      await onDegisti()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Manuel cam fiyatı kaydedilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const aktiflestir = async (fiyatId: string, fiyatTarihi: string) => {
    setHata(null)
    setBilgi(null)
    setIslem(fiyatId)
    try {
      await stokAlisFiyatiAktiflestir(
        fiyatId,
        fiyatTarihi,
        gerekce,
        yeniIdempotencyAnahtari(),
      )
      await onDegisti()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Fiyat aktifleştirilemedi.')
    } finally {
      setIslem(null)
    }
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Manuel özel cam fiyatları</h3>
          <p className="mt-1 text-xs text-gray-500">Örneğin 6 mm düz cam gibi az kullanılan ürünleri doğrudan stok kartına fiyatlayın.</p>
        </div>
        {olusturabilir && (
          <button type="button" onClick={() => setFormAcik((onceki) => !onceki)} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">
            <Plus size={14} /> Cam fiyatı ekle
          </button>
        )}
      </div>

      {hata && <div className="mt-3 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={17} className="shrink-0" />{hata}</div>}
      {bilgi && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{bilgi}</div>}

      {formAcik && (
        <form onSubmit={kaydet} className="mt-4 rounded-xl border border-violet-100 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-medium text-gray-700 lg:col-span-2">Cam stoğu<select value={stokId} onChange={(event) => setStokId(event.target.value)} className={inputClass}><option value="">Cam stoğu seçin</option>{camProfilleri.map((profil) => <option key={profil.stok_id} value={profil.stok_id}>{profil.stok_kodu} · {profil.stok_adi}</option>)}</select></label>
            <label className="text-xs font-medium text-gray-700">Birim fiyat<input type="number" min="0.000001" step="0.000001" value={fiyat} onChange={(event) => setFiyat(event.target.value)} className={inputClass} /></label>
            <label className="text-xs font-medium text-gray-700">Para birimi<select value={paraBirimi} onChange={(event) => setParaBirimi(event.target.value as ParaBirimi)} className={inputClass}><option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
            <label className="text-xs font-medium text-gray-700">Vade (gün)<input type="number" min="0" max="3650" value={vadeGunu} onChange={(event) => setVadeGunu(event.target.value)} className={inputClass} /></label>
            <label className="text-xs font-medium text-gray-700">Başlangıç tarihi<input type="date" value={baslangic} onChange={(event) => setBaslangic(event.target.value)} className={inputClass} /></label>
            <label className="text-xs font-medium text-gray-700 sm:col-span-2 lg:col-span-4">Açıklama<input value={gerekce} onChange={(event) => setGerekce(event.target.value)} className={inputClass} /></label>
          </div>
          {camProfilleri.length === 0 && <p className="mt-3 text-xs text-amber-700">Önce Maliyet Hesaplama ekranından bir cam stok profili oluşturun.</p>}
          <button type="submit" disabled={islem === 'kaydet' || camProfilleri.length === 0} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {islem === 'kaydet' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {aktiflestirebilir ? 'Kaydet ve aktifleştir' : 'Fiyatı kaydet'}
          </button>
        </form>
      )}

      <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white px-3">
        {camFiyatlari.map((kayit) => (
          <div key={kayit.fiyat_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
            <div>
              <div className="font-semibold text-gray-900">{kayit.stok_kodu} · {kayit.stok_adi}</div>
              <div className="mt-1 text-gray-500">{new Date(kayit.fiyat_tarihi).toLocaleDateString('tr-TR')} · {kayit.vade_gunu} gün · {kayit.atama_id ? 'Aktif fiyat' : 'Onay bekliyor'}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-900">{ticariPara(kayit.birim_fiyat, kayit.para_birimi)} / {kayit.fiyat_birimi}</span>
              {!kayit.atama_id && aktiflestirebilir && (
                <button type="button" onClick={() => void aktiflestir(kayit.fiyat_id, kayit.fiyat_tarihi)} disabled={islem === kayit.fiyat_id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">
                  <CheckCircle2 size={13} /> Aktifleştir
                </button>
              )}
            </div>
          </div>
        ))}
        {camFiyatlari.length === 0 && <div className="py-8 text-center text-xs text-gray-500">Bu tedarikçi için manuel cam fiyatı yok.</div>}
      </div>
    </div>
  )
}
