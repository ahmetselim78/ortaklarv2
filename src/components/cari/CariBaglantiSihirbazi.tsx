import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useEscape } from '@/hooks/useEscape'
import {
  cariBaglantiExcelIndir,
  cariBaglantiExcelOku,
  cariCamFiyatlariniSirala,
  cariCamKategorisi,
  type CariBaglantiExcelBaglami,
} from '@/lib/cariBaglantiExcel'
import {
  cariBaglantiAcikDonemFarkiniGetir,
  cariBaglantiHazirliginiGetir,
  cariBaglantiOnayla,
  cariBaglantiTaslakKaydet,
  yeniIdempotencyAnahtari,
} from '@/services/ticariService'
import { ticariBugun, ticariPara } from '@/lib/ticariFormat'
import type { Cari } from '@/types/cari'
import type {
  CariBaglantiFiyati,
  CariBaglantiHazirlik,
  CariBaglantiTaslakPayload,
  ParaBirimi,
} from '@/types/ticari'

type Taslak = {
  baglanti_id: string
  baglanti_no: string
  revision_no: number
}

type FarkOnizlemesi = Awaited<ReturnType<typeof cariBaglantiAcikDonemFarkiniGetir>>

const adimlar = ['Ödeme', 'Cam fiyatları', 'Etki önizlemesi', 'Yetkili onayı']

function dosyaAdinaUygun(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLocaleLowerCase('tr-TR') || 'musteri'
}

export default function CariBaglantiSihirbazi({
  cari,
  onKapat,
  onTamamlandi,
}: {
  cari: Cari
  onKapat: () => void
  onTamamlandi: () => Promise<void> | void
}) {
  const { access, hasPermission } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [adim, setAdim] = useState(0)
  const [hazirlik, setHazirlik] = useState<CariBaglantiHazirlik | null>(null)
  const [fiyatlar, setFiyatlar] = useState<CariBaglantiFiyati[]>([])
  const [paraBirimi, setParaBirimi] = useState<ParaBirimi>('TRY')
  const [tutar, setTutar] = useState('')
  const [tarih, setTarih] = useState(ticariBugun())
  const [odemeYontemi, setOdemeYontemi] = useState('havale')
  const [aciklama, setAciklama] = useState('')
  const [arama, setArama] = useState('')
  const [kategori, setKategori] = useState('tumu')
  const [topluKdvId, setTopluKdvId] = useState('')
  const [excelIsleniyor, setExcelIsleniyor] = useState(false)
  const [excelBilgi, setExcelBilgi] = useState<string | null>(null)
  const [taslak, setTaslak] = useState<Taslak | null>(null)
  const [fark, setFark] = useState<FarkOnizlemesi | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [isleniyor, setIsleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const excelDosyaRef = useRef<HTMLInputElement>(null)
  const onayYetkili = hasPermission('pricing', 'manage') && hasPermission('finance', 'create')

  useEscape(onKapat, !isleniyor && !excelIsleniyor)

  useEffect(() => {
    const oncekiOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = oncekiOverflow
    }
  }, [])

  useEffect(() => {
    let aktif = true
    setYukleniyor(true)
    cariBaglantiHazirliginiGetir(cari.id)
      .then((veri) => {
        if (!aktif) return
        setHazirlik(veri)
        setFiyatlar(veri.fiyatlar)
        setParaBirimi(veri.para_birimi)
      })
      .catch((error) => aktif && setHata(error instanceof Error ? error.message : 'Fiyatlar yüklenemedi.'))
      .finally(() => aktif && setYukleniyor(false))
    return () => { aktif = false }
  }, [cari.id])

  const gorunenFiyatlar = useMemo(() => {
    const aranan = arama.trim().toLocaleLowerCase('tr-TR')
    return cariCamFiyatlariniSirala(fiyatlar).filter((fiyat) => (
      (kategori === 'tumu' || cariCamKategorisi(fiyat) === kategori)
      && (!aranan || `${fiyat.stok_kodu} ${fiyat.stok_adi} ${cariCamKategorisi(fiyat)}`
        .toLocaleLowerCase('tr-TR').includes(aranan))
    ))
  }, [arama, fiyatlar, kategori])

  const kategoriler = useMemo(() => Array.from(new Set(
    cariCamFiyatlariniSirala(fiyatlar).map(cariCamKategorisi),
  )), [fiyatlar])

  const fiyatGruplari = useMemo(() => {
    const gruplar = new Map<string, CariBaglantiFiyati[]>()
    gorunenFiyatlar.forEach((fiyat) => {
      const anahtar = cariCamKategorisi(fiyat)
      gruplar.set(anahtar, [...(gruplar.get(anahtar) ?? []), fiyat])
    })
    return Array.from(gruplar.entries())
  }, [gorunenFiyatlar])

  const eksikBirimFiyatSayisi = fiyatlar.filter((fiyat) => (
    fiyat.birim_fiyat == null
    || !Number.isFinite(Number(fiyat.birim_fiyat))
    || Number(fiyat.birim_fiyat) < 0
  )).length

  const eksikKdvSayisi = fiyatlar.filter((fiyat) => !fiyat.kdv_grubu_id).length

  const eksikFiyatSayisi = fiyatlar.filter((fiyat) => (
    fiyat.birim_fiyat == null
    || !Number.isFinite(Number(fiyat.birim_fiyat))
    || Number(fiyat.birim_fiyat) < 0
    || !fiyat.kdv_grubu_id
  )).length

  const odemeGecerli = Number(tutar.replace(',', '.')) > 0 && tarih && odemeYontemi.trim().length >= 2

  const fiyatGuncelle = (stokId: string, deger: string) => {
    setTaslak(null)
    setFark(null)
    setExcelBilgi(null)
    setFiyatlar((mevcut) => mevcut.map((fiyat) => (
      fiyat.stok_id === stokId
        ? { ...fiyat, birim_fiyat: deger === '' ? null : Number(deger.replace(',', '.')) }
        : fiyat
    )))
  }

  const kdvGuncelle = (stokId: string, kdvGrubuId: string) => {
    setTaslak(null)
    setFark(null)
    setFiyatlar((mevcut) => mevcut.map((fiyat) => (
      fiyat.stok_id === stokId
        ? { ...fiyat, kdv_grubu_id: kdvGrubuId || null }
        : fiyat
    )))
  }

  const eksikKdvleriUygula = () => {
    if (!topluKdvId) return
    setTaslak(null)
    setFark(null)
    setFiyatlar((mevcut) => mevcut.map((fiyat) => (
      fiyat.kdv_grubu_id ? fiyat : { ...fiyat, kdv_grubu_id: topluKdvId }
    )))
  }

  const paraBirimiGuncelle = (deger: ParaBirimi) => {
    setParaBirimi(deger)
    setTaslak(null)
    setFark(null)
    setFiyatlar((mevcut) => {
      if (!hazirlik) return mevcut
      const kaynakFiyatlar = new Map(
        hazirlik.fiyatlar.map((fiyat) => [fiyat.stok_id, fiyat.birim_fiyat]),
      )
      return mevcut.map((fiyat) => ({
        ...fiyat,
        birim_fiyat: deger === hazirlik.para_birimi
          ? kaynakFiyatlar.get(fiyat.stok_id) ?? null
          : null,
      }))
    })
    setExcelBilgi(deger === hazirlik?.para_birimi
      ? 'Kaynak para birimindeki mevcut cam fiyatları geri yüklendi.'
      : `${deger} için eski para birimindeki tutarlar kopyalanmadı. Yeni fiyatları girin veya Excel ile yükleyin.`)
  }

  const excelBaglami = (): CariBaglantiExcelBaglami | null => {
    if (!hazirlik) return null
    return {
      cari_id: cari.id,
      cari_adi: cari.ad,
      para_birimi: paraBirimi,
      kaynak_fiyat_listesi_surumu_id: hazirlik.fiyat_listesi_surumu_id,
      fiyatlar,
      kdv_gruplari: hazirlik.kdv_gruplari,
    }
  }

  const excelIndir = async () => {
    const baglam = excelBaglami()
    if (!baglam) return
    setExcelIsleniyor(true)
    setHata(null)
    try {
      await cariBaglantiExcelIndir(
        baglam,
        `${dosyaAdinaUygun(cari.ad)}-cam-fiyatlari-${paraBirimi}.xlsx`,
      )
      setExcelBilgi('Şablon indirildi. Sarı “Yeni Fiyat” hücrelerini doldurup aynı dosyayı yükleyin.')
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Excel şablonu oluşturulamadı.')
    } finally {
      setExcelIsleniyor(false)
    }
  }

  const excelYukle = async (file: File | undefined) => {
    if (!file) return
    const baglam = excelBaglami()
    if (!baglam) return
    if (!file.name.toLocaleLowerCase('tr-TR').endsWith('.xlsx')) {
      setHata('Yalnız .xlsx uzantılı GlassFlow fiyat şablonu yüklenebilir.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setHata('Excel dosyası 5 MB sınırını aşıyor.')
      return
    }
    setExcelIsleniyor(true)
    setHata(null)
    setExcelBilgi(null)
    try {
      const degisiklikler = await cariBaglantiExcelOku(await file.arrayBuffer(), baglam)
      const fiyatHaritasi = new Map(degisiklikler.map((fiyat) => [fiyat.stok_id, fiyat.birim_fiyat]))
      const degisenSayisi = fiyatlar.filter((fiyat) => (
        fiyatHaritasi.get(fiyat.stok_id) !== fiyat.birim_fiyat
      )).length
      setTaslak(null)
      setFark(null)
      setFiyatlar((mevcut) => mevcut.map((fiyat) => ({
        ...fiyat,
        birim_fiyat: fiyatHaritasi.get(fiyat.stok_id) ?? fiyat.birim_fiyat,
      })))
      setExcelBilgi(`${degisiklikler.length} cam doğrulandı; ${degisenSayisi} fiyat Excel’den aktarıldı.`)
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Excel fiyatları okunamadı.')
    } finally {
      setExcelIsleniyor(false)
    }
  }

  const taslakKaydet = async () => {
    if (!odemeGecerli || eksikFiyatSayisi > 0) return
    setIsleniyor(true)
    setHata(null)
    try {
      const payload: CariBaglantiTaslakPayload = {
        cari_id: cari.id,
        para_birimi: paraBirimi,
        on_odeme_tutari: String(Number(tutar.replace(',', '.'))),
        odeme_tarihi: tarih,
        odeme_yontemi: odemeYontemi,
        aciklama: aciklama.trim() || undefined,
        fiyatlar: fiyatlar.map((fiyat) => ({
          stok_id: fiyat.stok_id,
          birim_fiyat: Number(fiyat.birim_fiyat),
          kdv_grubu_id: String(fiyat.kdv_grubu_id),
          minimum_m2: fiyat.minimum_m2,
          en_adimi_mm: fiyat.en_adimi_mm,
          boy_adimi_mm: fiyat.boy_adimi_mm,
        })),
      }
      const kayit = await cariBaglantiTaslakKaydet(payload)
      const yeniTaslak = {
        baglanti_id: kayit.baglanti_id,
        baglanti_no: kayit.baglanti_no,
        revision_no: kayit.revision_no,
      }
      setTaslak(yeniTaslak)
      setFark(await cariBaglantiAcikDonemFarkiniGetir(kayit.baglanti_id))
      setAdim(2)
      await onTamamlandi()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Bağlantı taslağı kaydedilemedi.')
    } finally {
      setIsleniyor(false)
    }
  }

  const onayla = async () => {
    if (!taslak) return
    if (access?.aal !== 'aal2') {
      navigate('/mfa', { state: { from: `${location.pathname}${location.search}` } })
      return
    }
    setIsleniyor(true)
    setHata(null)
    try {
      await cariBaglantiOnayla(
        taslak.baglanti_id,
        taslak.revision_no,
        yeniIdempotencyAnahtari(),
      )
      await onTamamlandi()
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Bağlantı onaylanamadı.')
    } finally {
      setIsleniyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-2 backdrop-blur-[1px] sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isleniyor && !excelIsleniyor) onKapat()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cari-baglanti-basligi"
        className="flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/20 sm:max-h-[92vh]"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="cari-baglanti-basligi" className="text-lg font-semibold text-gray-900">Yeni bağlantı · {cari.ad}</h2>
            <p className="mt-1 text-xs text-gray-500">
              Ön ödeme ile cama özel KDV hariç m² fiyatları tek taslakta hazırlanır.
            </p>
          </div>
          <button
            type="button"
            onClick={onKapat}
            disabled={isleniyor || excelIsleniyor}
            aria-label="Bağlantı penceresini kapat"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-x-auto border-b border-gray-100 bg-slate-50/80 px-3 sm:px-5">
          <div className="grid min-w-[520px] grid-cols-4">
            {adimlar.map((baslik, index) => (
              <div key={baslik} className={`border-b-2 px-2 py-3 text-center text-xs font-semibold ${index === adim ? 'border-blue-600 text-blue-700' : index < adim ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-gray-400'}`}>
                {index + 1}. {baslik}
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {hata && (
            <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {hata}
            </div>
          )}
          {yukleniyor ? (
            <div className="py-16 text-center text-sm text-gray-500">Mevcut fiyatlar hazırlanıyor…</div>
          ) : adim === 0 ? (
            <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">
              {hazirlik?.ticari_profil_durumu !== 'yayinda' && (
                <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <div className="flex gap-2">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <div className="font-semibold">Ticari profil bağlantıyla birlikte hazırlanacak</div>
                      <p className="mt-1 text-xs leading-5">
                        {hazirlik?.ticari_profil_durumu === 'taslak'
                          ? 'Mevcut profil taslağınız korunur. Bağlantı yetkili tarafından onaylandığında müşteri fiyat listesi profile bağlanıp yayımlanır.'
                          : 'Bu cari için ayrıca profil oluşturmanız gerekmez. Girdiğiniz cam fiyatları taslakta saklanır; profil ve fiyat listesi yalnız yetkili onayında yayımlanır.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <label className="sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-gray-700">Fiilen alınan ön ödeme</span>
                <div className="flex">
                  <input value={tutar} onChange={(e) => { setTutar(e.target.value); setTaslak(null) }} inputMode="decimal" placeholder="0,00" className="min-w-0 flex-1 rounded-l-lg border border-gray-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
                  <select value={paraBirimi} onChange={(e) => paraBirimiGuncelle(e.target.value as ParaBirimi)} className="rounded-r-lg border border-l-0 border-gray-200 bg-gray-50 px-3">
                    <option>TRY</option><option>USD</option><option>EUR</option>
                  </select>
                </div>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-gray-700">Ödeme tarihi</span>
                <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-gray-700">Ödeme yöntemi</span>
                <select value={odemeYontemi} onChange={(e) => setOdemeYontemi(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <option value="havale">Havale</option>
                  <option value="eft">EFT</option>
                  <option value="nakit">Nakit</option>
                  <option value="kredi_karti">Kredi kartı</option>
                  <option value="cek">Çek</option>
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-gray-700">Açıklama</span>
                <textarea value={aciklama} onChange={(e) => setAciklama(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <div className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                Para birimleri ayrı yürütülür. Bu ödeme yalnız {paraBirimi} siparişlerini ve bakiyesini etkiler.
              </div>
            </div>
          ) : adim === 1 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Müşteriye özel cam fiyatları</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {fiyatlar.length} cam · {kategoriler.length} kategori · KDV hariç m² fiyatı
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={excelDosyaRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    aria-label="Doldurulmuş cam fiyat Excelini seç"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      void excelYukle(file)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void excelIndir()}
                    disabled={excelIsleniyor}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {excelIsleniyor ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    Excel indir
                  </button>
                  <button
                    type="button"
                    onClick={() => excelDosyaRef.current?.click()}
                    disabled={excelIsleniyor}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {excelIsleniyor ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    Excel yükle
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="flex items-start gap-2.5">
                  <FileSpreadsheet size={17} className="mt-0.5 shrink-0 text-emerald-700" />
                  <div className="min-w-0 text-xs leading-5 text-emerald-900">
                    <p className="font-semibold">Kategori bazlı güvenli Excel şablonu</p>
                    <p className="text-emerald-800">
                      Tüm camlar ve mevcut fiyatlar hazır gelir. Excel’de yalnız sarı “Yeni Fiyat” hücreleri düzenlenebilir;
                      KDV ve diğer kurallar değişmeden korunur.
                    </p>
                  </div>
                </div>
              </div>

              {excelBilgi && (
                <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <CheckCircle2 size={15} className="shrink-0" /> {excelBilgi}
                </div>
              )}

              <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-slate-50/70 p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                  <label className="relative min-w-0 flex-1">
                    <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                    <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Kod veya cam adı ara" className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <select
                    value={kategori}
                    onChange={(event) => setKategori(event.target.value)}
                    aria-label="Cam kategorisi"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  >
                    <option value="tumu">Tüm kategoriler ({fiyatlar.length})</option>
                    {kategoriler.map((deger) => (
                      <option key={deger} value={deger}>
                        {deger} ({fiyatlar.filter((fiyat) => cariCamKategorisi(fiyat) === deger).length})
                      </option>
                    ))}
                  </select>
                </div>
                <span className="whitespace-nowrap text-xs font-medium text-gray-500">
                  {gorunenFiyatlar.length} cam gösteriliyor
                </span>
              </div>

              {eksikKdvSayisi > 0 && (hazirlik?.kdv_gruplari.length ?? 0) === 0 && (
                <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                  <span className="inline-flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span>
                      <strong className="block">KDV grubu tanımlanmamış.</strong>
                      Bağlantıda KDV seçebilmek için önce Ayarlar Merkezi’nden en az bir KDV grubu oluşturun.
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate('/admin/ayarlar/kdv')}
                    className="shrink-0 rounded-lg bg-amber-700 px-3 py-2 font-semibold text-white hover:bg-amber-800"
                  >
                    KDV grubu ekle
                  </button>
                </div>
              )}

              {eksikKdvSayisi > 0 && (hazirlik?.kdv_gruplari.length ?? 0) > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                  <span className="inline-flex items-center gap-2">
                    <AlertTriangle size={15} className="shrink-0" />
                    {eksikBirimFiyatSayisi > 0 ? `${eksikBirimFiyatSayisi} camın fiyatı, ` : ''}
                    {eksikKdvSayisi} camın KDV grubu eksik. KDV grubunu eksiklerin tamamına uygulayabilirsiniz.
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <select value={topluKdvId} onChange={(event) => setTopluKdvId(event.target.value)} aria-label="Eksik camlara uygulanacak KDV grubu" className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs">
                      <option value="">KDV grubu seçin</option>
                      {hazirlik?.kdv_gruplari.map((kdv) => <option key={kdv.id} value={kdv.id}>{kdv.kod} · {kdv.ad}</option>)}
                    </select>
                    <button type="button" onClick={eksikKdvleriUygula} disabled={!topluKdvId} className="rounded-lg bg-amber-700 px-2.5 py-1.5 font-semibold text-white disabled:opacity-40">
                      Eksiklere uygula
                    </button>
                  </div>
                </div>
              )}

              {eksikKdvSayisi === 0 && eksikBirimFiyatSayisi > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle size={15} />
                  Kaydetmek için {eksikBirimFiyatSayisi} camın fiyatı tamamlanmalı.
                </div>
              )}
              <div className="max-h-[44vh] overflow-auto rounded-xl border border-gray-200 bg-white">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs font-semibold text-slate-600 shadow-[0_1px_0_rgba(148,163,184,0.35)]">
                    <tr><th className="px-4 py-2.5">Cam</th><th className="px-4 py-2.5">m² fiyatı</th><th className="px-4 py-2.5">KDV grubu</th></tr>
                  </thead>
                  {fiyatGruplari.map(([grup, grupFiyatlari]) => (
                    <tbody key={grup} className="divide-y divide-gray-100">
                      <tr className="bg-slate-50">
                        <th colSpan={3} scope="rowgroup" className="px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
                          {grup} <span className="ml-1 font-medium text-slate-400">· {grupFiyatlari.length} cam</span>
                        </th>
                      </tr>
                      {grupFiyatlari.map((fiyat) => (
                        <tr key={fiyat.stok_id} className="hover:bg-blue-50/30">
                          <td className="px-4 py-2.5"><div className="font-medium text-gray-900">{fiyat.stok_adi}</div><div className="mt-0.5 font-mono text-[11px] text-gray-400">{fiyat.stok_kodu}</div></td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center">
                              <input aria-label={`${fiyat.stok_adi} m² fiyatı`} value={fiyat.birim_fiyat ?? ''} onChange={(e) => fiyatGuncelle(fiyat.stok_id, e.target.value)} inputMode="decimal" className="w-32 rounded-l-lg border border-gray-200 px-2 py-1.5 text-right tabular-nums outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                              <span className="rounded-r-lg border border-l-0 border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-500">{paraBirimi}/m²</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              aria-label={`${fiyat.stok_adi} KDV grubu`}
                              value={fiyat.kdv_grubu_id ?? ''}
                              disabled={(hazirlik?.kdv_gruplari.length ?? 0) === 0}
                              onChange={(e) => kdvGuncelle(fiyat.stok_id, e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                            >
                              <option value="">{(hazirlik?.kdv_gruplari.length ?? 0) === 0 ? 'KDV grubu yok' : 'Seçin'}</option>
                              {hazirlik?.kdv_gruplari.map((kdv) => <option key={kdv.id} value={kdv.id}>{kdv.kod} · {kdv.ad}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
                {gorunenFiyatlar.length === 0 && (
                  <div className="p-10 text-center text-sm text-gray-500">Arama ve kategoriye uygun cam bulunamadı.</div>
                )}
              </div>
            </div>
          ) : adim === 2 ? (
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-emerald-800"><CheckCircle2 size={18} /> Taslak kaydedildi</div>
                <div className="mt-1 text-sm text-emerald-700">{taslak?.baglanti_no}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Ozet baslik="Ön ödeme" deger={ticariPara(Number(tutar.replace(',', '.')), paraBirimi)} />
                <Ozet baslik="Açık etkilenen m²" deger={`${Number(fark?.etkilenen_m2 ?? 0).toFixed(3)} m²`} />
                <Ozet baslik="Açık dönem fiyat farkı" deger={ticariPara(Number(fark?.fiyat_farki ?? 0), paraBirimi)} />
              </div>
              {(fark?.urun_gruplari.length ?? 0) > 0 ? (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Cam</th><th className="px-3 py-2 text-right">Açık m²</th><th className="px-3 py-2 text-right">Eski → yeni</th><th className="px-3 py-2 text-right">Fark</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {fark?.urun_gruplari.map((grup, index) => (
                        <tr key={`${grup.stok_id}-${index}`}><td className="px-3 py-2 font-medium">{grup.stok_adi}</td><td className="px-3 py-2 text-right">{Number(grup.acik_m2).toFixed(3)}</td><td className="px-3 py-2 text-right">{ticariPara(grup.onceki_birim_fiyat, paraBirimi)} → {ticariPara(grup.yeni_birim_fiyat, paraBirimi)}</td><td className="px-3 py-2 text-right font-medium">{ticariPara(grup.fark_tutari, paraBirimi)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  Ekonomik olarak açık sipariş/m² bulunmadığı için geçmiş satış fiyatı değişmeyecek.
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                Onay tek işlemde fiyat sürümünü yayımlar, ön ödemeyi müşteri kredisine yazar,
                açık dönem fiyat farkını kaydeder ve bağlantıyı kuyruğa alır. Eski bağlantıda
                kredi varsa bu bağlantı sırada bekler.
              </div>
              {!onayYetkili ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Taslak hazır. Onay için fiyat yönetimi ve finans yetkisi bulunan bir kullanıcı gerekir.
                </div>
              ) : access?.aal !== 'aal2' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Onaydan önce iki adımlı doğrulama tamamlanmalıdır.
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  Yetkiler ve AAL2 doğrulaması hazır. Bağlantı atomik olarak onaylanabilir.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button type="button" onClick={() => setAdim((mevcut) => Math.max(0, mevcut - 1))} disabled={adim === 0 || isleniyor || excelIsleniyor} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-40">
            <ChevronLeft size={15} /> Geri
          </button>
          {adim === 0 ? (
            <button type="button" onClick={() => setAdim(1)} disabled={!odemeGecerli} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Fiyatlara geç <ChevronRight size={15} /></button>
          ) : adim === 1 ? (
            <button type="button" onClick={() => void taslakKaydet()} disabled={eksikFiyatSayisi > 0 || isleniyor || excelIsleniyor} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{isleniyor ? 'Kaydediliyor…' : 'Taslağı kaydet ve etkiyi hesapla'}</button>
          ) : adim === 2 ? (
            <button type="button" onClick={() => setAdim(3)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Onaya geç <ChevronRight size={15} /></button>
          ) : onayYetkili ? (
            <button type="button" onClick={() => void onayla()} disabled={isleniyor} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{access?.aal === 'aal2' ? (isleniyor ? 'Onaylanıyor…' : 'Bağlantıyı onayla') : 'AAL2 doğrula ve onayla'}</button>
          ) : (
            <button type="button" onClick={onKapat} className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white">Taslağı kapat</button>
          )}
        </div>
      </div>
    </div>
  )
}

function Ozet({ baslik, deger }: { baslik: string; deger: string }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-3"><div className="text-xs text-gray-500">{baslik}</div><div className="mt-1 font-semibold text-gray-900">{deger}</div></div>
}
