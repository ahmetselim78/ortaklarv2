import { AlertTriangle, Calculator, Loader2, Save, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useEscape } from '@/hooks/useEscape'
import {
  CAM_TURU_ETIKETLERI,
  CITA_TURU_ETIKETLERI,
  SARF_HESAPLAMA_ETIKETLERI,
  maliyetVadeFinansmanEtkisi,
} from '@/lib/maliyetFormat'
import { ticariBugun, ticariPara } from '@/lib/ticariFormat'
import {
  maliyetAlisFiyatiKaydet,
  maliyetHesaplamaAyariKaydet,
  maliyetMalzemeKaydet,
  maliyetSarfKatsayisiKaydet,
} from '@/services/maliyetService'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type {
  MaliyetCamTuru,
  MaliyetCitaTuru,
  MaliyetHesaplamaAyarSurumu,
  MaliyetMalzemeTuru,
  MaliyetSarfBirimi,
  MaliyetSarfHesaplamaTipi,
  MaliyetSarfKatsayiSurumu,
  MaliyetSarfMalzemesi,
  MaliyetTedarikcisi,
} from '@/types/maliyet'
import type { ParaBirimi } from '@/types/ticari'

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

function useIdempotentKayitAnahtari() {
  const sonIstek = useRef<{ payload: string; anahtar: string } | null>(null)
  return (payload: unknown) => {
    const normalized = JSON.stringify(payload)
    if (sonIstek.current?.payload !== normalized) {
      sonIstek.current = {
        payload: normalized,
        anahtar: yeniIdempotencyAnahtari(),
      }
    }
    return sonIstek.current.anahtar
  }
}

function ModalKabugu({
  baslik,
  aciklama,
  kaydediliyor,
  onKapat,
  onSubmit,
  children,
}: {
  baslik: string
  aciklama: string
  kaydediliyor: boolean
  onKapat: () => void
  onSubmit: (event: React.FormEvent) => void
  children: React.ReactNode
}) {
  useEscape(onKapat, !kaydediliyor)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <form
        onSubmit={onSubmit}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1 pr-3">
            <h2 className="text-lg font-semibold text-gray-900">{baslik}</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">{aciklama}</p>
          </div>
          <button
            type="button"
            onClick={onKapat}
            disabled={kaydediliyor}
            className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </form>
    </div>
  )
}

function ModalAlt({
  kaydediliyor,
  onKapat,
}: {
  kaydediliyor: boolean
  onKapat: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex sm:justify-end">
      <button
        type="button"
        onClick={onKapat}
        disabled={kaydediliyor}
        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        Vazgeç
      </button>
      <button
        type="submit"
        disabled={kaydediliyor}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {kaydediliyor ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Kaydet
      </button>
    </div>
  )
}

function FormHatasi({ mesaj }: { mesaj: string | null }) {
  if (!mesaj) return null
  return (
    <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertTriangle size={17} className="mt-0.5 shrink-0" />
      <span>{mesaj}</span>
    </div>
  )
}

export function MaliyetMalzemeModal({
  tur,
  onKaydedildi,
  onKapat,
}: {
  tur: MaliyetMalzemeTuru
  onKaydedildi: () => Promise<void> | void
  onKapat: () => void
}) {
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [kalinlik, setKalinlik] = useState('4')
  const [camTuru, setCamTuru] = useState<MaliyetCamTuru>('duz')
  const [camOzelAdi, setCamOzelAdi] = useState('')
  const [genislik, setGenislik] = useState('16')
  const [citaTuru, setCitaTuru] = useState<MaliyetCitaTuru>('aluminyum')
  const [citaOzelAdi, setCitaOzelAdi] = useState('')
  const [sarfAdi, setSarfAdi] = useState('')
  const [sarfBirimi, setSarfBirimi] = useState<MaliyetSarfBirimi>('kg')
  const [hesaplamaTipi, setHesaplamaTipi] =
    useState<MaliyetSarfHesaplamaTipi>('cevre_m')
  const [katsayi, setKatsayi] = useState('')
  const [boslukBasi, setBoslukBasi] = useState(true)
  const [fire, setFire] = useState('0')
  const [baslangic, setBaslangic] = useState(ticariBugun())
  const idempotencyAnahtari = useIdempotentKayitAnahtari()

  const baslik = tur === 'cam'
    ? 'Yeni cam türü'
    : tur === 'cita'
      ? 'Yeni çıta'
      : 'Yeni sarf malzemesi'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setHata(null)
    if (tur === 'cam' && (!Number(kalinlik) || (camTuru === 'diger' && !camOzelAdi.trim()))) {
      setHata('Cam kalınlığı ve seçilen türe ait bilgiler zorunludur.')
      return
    }
    if (tur === 'cita' && (!Number(genislik) || (citaTuru === 'diger' && !citaOzelAdi.trim()))) {
      setHata('Çıta genişliği ve seçilen malzeme bilgisi zorunludur.')
      return
    }
    if (tur === 'sarf' && (!sarfAdi.trim() || katsayi === '' || Number(katsayi) < 0)) {
      setHata('Sarf adı ve tüketim katsayısı zorunludur.')
      return
    }

    setKaydediliyor(true)
    try {
      const payload = tur === 'cam'
        ? {
              malzeme_turu: 'cam',
              kalinlik_mm: kalinlik,
              cam_turu: camTuru,
              ozel_tur_adi: camTuru === 'diger' ? camOzelAdi.trim() : null,
            }
        : tur === 'cita'
          ? {
                malzeme_turu: 'cita',
                genislik_mm: genislik,
                cita_malzeme_turu: citaTuru,
                ozel_malzeme_adi: citaTuru === 'diger' ? citaOzelAdi.trim() : null,
              }
          : {
                malzeme_turu: 'sarf',
                ad: sarfAdi.trim(),
                alis_birimi: sarfBirimi,
                hesaplama_tipi: hesaplamaTipi,
                tuketim_katsayisi: katsayi,
                bosluk_basi: boslukBasi,
                fire_orani: fire || '0',
                gecerli_baslangic: baslangic,
              }
      await maliyetMalzemeKaydet(payload, idempotencyAnahtari(payload))
      await onKaydedildi()
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Malzeme kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <ModalKabugu
      baslik={baslik}
      aciklama="Kod veya genel kayıt adı istemiyoruz; görünen isim bu alandaki seçimlerden otomatik oluşur."
      kaydediliyor={kaydediliyor}
      onKapat={onKapat}
      onSubmit={submit}
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <FormHatasi mesaj={hata} />
        {tur === 'cam' && (
          <>
            <label className="block text-sm font-medium text-gray-700">
              Kalınlık (mm)
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={kalinlik}
                onChange={(event) => setKalinlik(event.target.value)}
                className={inputClass}
                autoFocus
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Cam türü
              <select
                value={camTuru}
                onChange={(event) => setCamTuru(event.target.value as MaliyetCamTuru)}
                className={inputClass}
              >
                {Object.entries(CAM_TURU_ETIKETLERI).map(([deger, etiket]) => (
                  <option key={deger} value={deger}>{etiket}</option>
                ))}
              </select>
            </label>
            {camTuru === 'diger' && (
              <label className="block text-sm font-medium text-gray-700">
                Özel cam türü
                <input
                  value={camOzelAdi}
                  onChange={(event) => setCamOzelAdi(event.target.value)}
                  className={inputClass}
                  placeholder="Örn. Akustik"
                />
              </label>
            )}
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              Görünen isim: <strong>{kalinlik || '?'} mm {camTuru === 'diger' ? camOzelAdi || 'Diğer' : CAM_TURU_ETIKETLERI[camTuru]} Cam</strong>
            </div>
          </>
        )}
        {tur === 'cita' && (
          <>
            <label className="block text-sm font-medium text-gray-700">
              Genişlik (mm)
              <input
                type="number"
                min="1"
                step="0.1"
                value={genislik}
                onChange={(event) => setGenislik(event.target.value)}
                className={inputClass}
                autoFocus
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Çıta malzemesi
              <select
                value={citaTuru}
                onChange={(event) => setCitaTuru(event.target.value as MaliyetCitaTuru)}
                className={inputClass}
              >
                {Object.entries(CITA_TURU_ETIKETLERI).map(([deger, etiket]) => (
                  <option key={deger} value={deger}>{etiket}</option>
                ))}
              </select>
            </label>
            {citaTuru === 'diger' && (
              <label className="block text-sm font-medium text-gray-700">
                Özel malzeme
                <input
                  value={citaOzelAdi}
                  onChange={(event) => setCitaOzelAdi(event.target.value)}
                  className={inputClass}
                />
              </label>
            )}
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              Görünen isim: <strong>{genislik || '?'} mm {citaTuru === 'diger' ? citaOzelAdi || 'Diğer' : CITA_TURU_ETIKETLERI[citaTuru]} Çıta</strong>
            </div>
          </>
        )}
        {tur === 'sarf' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
                Sarf malzemesi
                <input
                  value={sarfAdi}
                  onChange={(event) => setSarfAdi(event.target.value)}
                  className={inputClass}
                  placeholder="Butil, poliüretan, nem alıcı…"
                  autoFocus
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Alış birimi
                <select
                  value={sarfBirimi}
                  onChange={(event) => setSarfBirimi(event.target.value as MaliyetSarfBirimi)}
                  className={inputClass}
                >
                  <option value="kg">Kilogram</option>
                  <option value="litre">Litre</option>
                  <option value="adet">Adet</option>
                  <option value="metre">Metre</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Hesaplama
                <select
                  value={hesaplamaTipi}
                  onChange={(event) => setHesaplamaTipi(event.target.value as MaliyetSarfHesaplamaTipi)}
                  className={inputClass}
                >
                  {Object.entries(SARF_HESAPLAMA_ETIKETLERI).map(([deger, etiket]) => (
                    <option key={deger} value={deger}>{etiket}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Tüketim katsayısı ({sarfBirimi})
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={katsayi}
                  onChange={(event) => setKatsayi(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Fire (%)
                <input
                  type="number"
                  min="0"
                  max="99.999"
                  step="0.01"
                  value={fire}
                  onChange={(event) => setFire(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={boslukBasi}
                  onChange={(event) => setBoslukBasi(event.target.checked)}
                />
                Tüketimi her cam boşluğu için ayrı uygula
              </label>
              <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
                Bu değer hangi tarihten itibaren geçerli?
                <input
                  type="date"
                  value={baslangic}
                  onChange={(event) => setBaslangic(event.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            <p className="text-xs text-gray-500">
              Bitiş tarihi yoktur. Yeni katsayı kaydedilene kadar bu değer kullanılır.
            </p>
          </>
        )}
      </div>
      <ModalAlt kaydediliyor={kaydediliyor} onKapat={onKapat} />
    </ModalKabugu>
  )
}

export function MaliyetAlisFiyatiModal({
  malzemeTuru,
  malzemeId,
  malzemeAdi,
  alisBirimi,
  tedarikciler,
  yillikFinansmanOrani,
  onKaydedildi,
  onKapat,
}: {
  malzemeTuru: MaliyetMalzemeTuru
  malzemeId: string
  malzemeAdi: string
  alisBirimi: string
  tedarikciler: MaliyetTedarikcisi[]
  yillikFinansmanOrani: number | null
  onKaydedildi: () => Promise<void> | void
  onKapat: () => void
}) {
  const [tedarikciId, setTedarikciId] = useState(tedarikciler[0]?.id ?? '')
  const [fiyat, setFiyat] = useState('')
  const [paraBirimi, setParaBirimi] = useState<ParaBirimi>('TRY')
  const [vadeGunu, setVadeGunu] = useState('0')
  const [baslangic, setBaslangic] = useState(ticariBugun())
  const [aciklama, setAciklama] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const idempotencyAnahtari = useIdempotentKayitAnahtari()
  const finansmanEtkisi = useMemo(
    () => maliyetVadeFinansmanEtkisi(
      Number(fiyat || 0),
      yillikFinansmanOrani ?? 0,
      Number(vadeGunu || 0),
    ),
    [fiyat, vadeGunu, yillikFinansmanOrani],
  )

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setHata(null)
    if (!tedarikciId || !Number(fiyat) || Number(fiyat) <= 0) {
      setHata('Tedarikçi ve sıfırdan büyük alış fiyatı zorunludur.')
      return
    }
    if (Number(vadeGunu) < 0) {
      setHata('Vade günü negatif olamaz.')
      return
    }
    setKaydediliyor(true)
    try {
      const payload = {
        malzeme_turu: malzemeTuru,
        malzeme_id: malzemeId,
        tedarikci_id: tedarikciId,
        birim_fiyat: fiyat,
        para_birimi: paraBirimi,
        vade_gunu: vadeGunu || '0',
        gecerli_baslangic: baslangic,
        aciklama: aciklama.trim() || undefined,
      }
      await maliyetAlisFiyatiKaydet(payload, idempotencyAnahtari(payload))
      await onKaydedildi()
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Alış fiyatı kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <ModalKabugu
      baslik={`${malzemeAdi} alış fiyatı`}
      aciklama={`Tedarikçi bazlı ${alisBirimi} fiyatını girin. Yeni fiyat girilene kadar geçerli kalır.`}
      kaydediliyor={kaydediliyor}
      onKapat={onKapat}
      onSubmit={submit}
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <FormHatasi mesaj={hata} />
        {tedarikciler.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Önce Cari ekranında en az bir aktif tedarikçi oluşturun.
          </div>
        )}
        <label className="block text-sm font-medium text-gray-700">
          Tedarikçi
          <select
            value={tedarikciId}
            onChange={(event) => setTedarikciId(event.target.value)}
            className={inputClass}
            autoFocus
          >
            <option value="">Tedarikçi seçin</option>
            {tedarikciler.map((tedarikci) => (
              <option key={tedarikci.id} value={tedarikci.id}>{tedarikci.ad}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Baz alış fiyatı / {alisBirimi}
            <input
              type="number"
              min="0.000001"
              step="0.000001"
              value={fiyat}
              onChange={(event) => setFiyat(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Para birimi
            <select
              value={paraBirimi}
              onChange={(event) => setParaBirimi(event.target.value as ParaBirimi)}
              className={inputClass}
            >
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Satın alma vadesi (gün)
            <input
              type="number"
              min="0"
              max="3650"
              step="1"
              value={vadeGunu}
              onChange={(event) => setVadeGunu(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Fiyat tarihi
            <input
              type="date"
              value={baslangic}
              onChange={(event) => setBaslangic(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
            <Calculator size={17} />
            Vade etkisi
          </div>
          {yillikFinansmanOrani == null ? (
            <p className="mt-2 text-xs text-amber-700">
              Güncel yıllık finansman oranı tanımlı değil. Fiyat kaydedilebilir ancak faiz dâhil maliyet, ayar girilene kadar hesaplanmaz.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-white p-2">
                <div className="text-gray-500">Yıllık oran</div>
                <div className="mt-1 font-semibold">%{yillikFinansmanOrani}</div>
              </div>
              <div className="rounded-lg bg-white p-2">
                <div className="text-gray-500">Finansman etkisi</div>
                <div className="mt-1 font-semibold">
                  {ticariPara(finansmanEtkisi, paraBirimi)}
                </div>
              </div>
              <div className="rounded-lg bg-white p-2">
                <div className="text-gray-500">Faiz dâhil</div>
                <div className="mt-1 font-bold text-blue-800">
                  {ticariPara(Number(fiyat || 0) + finansmanEtkisi, paraBirimi)}
                </div>
              </div>
            </div>
          )}
          <p className="mt-2 text-[11px] text-blue-700">
            Formül: baz fiyat × yıllık oran × vade günü / 365. Kesin TRY sonucu PostgreSQL tarafından hesaplanır.
          </p>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          Açıklama <span className="font-normal text-gray-400">(isteğe bağlı)</span>
          <input
            value={aciklama}
            onChange={(event) => setAciklama(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <ModalAlt kaydediliyor={kaydediliyor} onKapat={onKapat} />
    </ModalKabugu>
  )
}

export function MaliyetAyarModal({
  mevcut,
  onKaydedildi,
  onKapat,
}: {
  mevcut: MaliyetHesaplamaAyarSurumu | null
  onKaydedildi: () => Promise<void> | void
  onKapat: () => void
}) {
  const [oran, setOran] = useState(mevcut ? String(mevcut.yillik_finansman_orani) : '')
  const camFire = mevcut ? String(mevcut.cam_fire_orani) : '0'
  const citaFire = mevcut ? String(mevcut.cita_fire_orani) : '0'
  const [en, setEn] = useState(mevcut ? String(mevcut.referans_en_mm) : '1000')
  const [boy, setBoy] = useState(mevcut ? String(mevcut.referans_boy_mm) : '1000')
  const [baslangic, setBaslangic] = useState(ticariBugun())
  const [aciklama, setAciklama] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const idempotencyAnahtari = useIdempotentKayitAnahtari()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setHata(null)
    if (oran === '' || Number(oran) < 0 || Number(en) <= 0 || Number(boy) <= 0) {
      setHata('Yıllık faiz oranını ve sıfırdan büyük referans ölçülerini girin.')
      return
    }
    setKaydediliyor(true)
    try {
      const payload = {
        yillik_finansman_orani: oran,
        cam_fire_orani: camFire || '0',
        cita_fire_orani: citaFire || '0',
        referans_en_mm: en,
        referans_boy_mm: boy,
        gecerli_baslangic: baslangic,
        aciklama: aciklama.trim() || null,
      }
      await maliyetHesaplamaAyariKaydet(payload, idempotencyAnahtari(payload))
      await onKaydedildi()
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Maliyet ayarları kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <ModalKabugu
      baslik="Maliyet hesaplama ayarları"
      aciklama="Yeni değerler seçilen tarihten itibaren geçerli olur; önceki kayıt değiştirilmez ve bitiş tarihi istenmez."
      kaydediliyor={kaydediliyor}
      onKapat={onKapat}
      onSubmit={submit}
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <FormHatasi mesaj={hata} />
        <label className="block text-sm font-medium text-gray-700">
          Güncel yıllık finansman oranı (%)
          <input
            type="number"
            min="0"
            max="1000"
            step="0.01"
            value={oran}
            onChange={(event) => setOran(event.target.value)}
            className={inputClass}
            autoFocus
          />
          <span className="mt-1 block text-xs font-normal text-gray-500">
            Satın alma vadesinin maliyet etkisi bu oranla hesaplanır.
          </span>
        </label>
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
          Cam ve çıta firesi artık genel profil oranından hesaplanmaz. Her stok kartının
          tarihçeli fire oranını <strong>Aktif Kaynaklar → Cama özel fire oranları</strong>{' '}
          bölümünden yönetin; alüminyum çıtaların başlangıç firesi %5’tir.
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            Referans en (mm)
            <input
              type="number"
              min="1"
              value={en}
              onChange={(event) => setEn(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Referans boy (mm)
            <input
              type="number"
              min="1"
              value={boy}
              onChange={(event) => setBoy(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          Geçerlilik başlangıcı
          <input
            type="date"
            value={baslangic}
            onChange={(event) => setBaslangic(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Açıklama <span className="font-normal text-gray-400">(isteğe bağlı)</span>
          <input
            value={aciklama}
            onChange={(event) => setAciklama(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <ModalAlt kaydediliyor={kaydediliyor} onKapat={onKapat} />
    </ModalKabugu>
  )
}

export function MaliyetSarfKatsayiModal({
  sarf,
  mevcut,
  onKaydedildi,
  onKapat,
}: {
  sarf: MaliyetSarfMalzemesi
  mevcut: MaliyetSarfKatsayiSurumu | null
  onKaydedildi: () => Promise<void> | void
  onKapat: () => void
}) {
  const [hesaplamaTipi, setHesaplamaTipi] = useState<MaliyetSarfHesaplamaTipi>(
    mevcut?.hesaplama_tipi ?? 'cevre_m',
  )
  const [katsayi, setKatsayi] = useState(mevcut ? String(mevcut.tuketim_katsayisi) : '')
  const [boslukBasi, setBoslukBasi] = useState(mevcut?.bosluk_basi ?? true)
  const [fire, setFire] = useState(mevcut ? String(mevcut.fire_orani) : '0')
  const [baslangic, setBaslangic] = useState(ticariBugun())
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const idempotencyAnahtari = useIdempotentKayitAnahtari()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (katsayi === '' || Number(katsayi) < 0) {
      setHata('Tüketim katsayısı zorunludur.')
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      const payload = {
        hesaplama_tipi: hesaplamaTipi,
        tuketim_katsayisi: katsayi,
        bosluk_basi: boslukBasi,
        fire_orani: fire || '0',
        gecerli_baslangic: baslangic,
      }
      await maliyetSarfKatsayisiKaydet(
        sarf.id,
        payload,
        idempotencyAnahtari({ sarf_malzeme_id: sarf.id, payload }),
      )
      await onKaydedildi()
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Tüketim katsayısı kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <ModalKabugu
      baslik={`${sarf.ad} tüketimi`}
      aciklama="Yeni katsayı seçilen tarihten itibaren kullanılır; önceki değer tarihçede kalır."
      kaydediliyor={kaydediliyor}
      onKapat={onKapat}
      onSubmit={submit}
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <FormHatasi mesaj={hata} />
        <label className="block text-sm font-medium text-gray-700">
          Hesaplama
          <select
            value={hesaplamaTipi}
            onChange={(event) => setHesaplamaTipi(event.target.value as MaliyetSarfHesaplamaTipi)}
            className={inputClass}
          >
            {Object.entries(SARF_HESAPLAMA_ETIKETLERI).map(([deger, etiket]) => (
              <option key={deger} value={deger}>{etiket}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            Tüketim ({sarf.alis_birimi})
            <input
              type="number"
              min="0"
              step="0.000001"
              value={katsayi}
              onChange={(event) => setKatsayi(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Fire (%)
            <input
              type="number"
              min="0"
              max="99.999"
              step="0.01"
              value={fire}
              onChange={(event) => setFire(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={boslukBasi}
            onChange={(event) => setBoslukBasi(event.target.checked)}
          />
          Her cam boşluğu için ayrı uygula
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Geçerlilik başlangıcı
          <input
            type="date"
            value={baslangic}
            onChange={(event) => setBaslangic(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <ModalAlt kaydediliyor={kaydediliyor} onKapat={onKapat} />
    </ModalKabugu>
  )
}
