import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  Link2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ReceiptText,
  Search,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import {
  cariBaglantiOnayla,
  cariDetayOzetiniGetir,
  yeniIdempotencyAnahtari,
} from '@/services/ticariService'
import { ticariPara } from '@/lib/ticariFormat'
import {
  cariCalismaDurumunuCoz,
  cariCalismaSekmesiniDogrula,
  type MusteriCalismaSekmesi,
} from '@/lib/cariNavigation'
import { tedarikKapsamiOzetMetni } from '@/lib/tedarikKapsami'
import type { Cari } from '@/types/cari'
import type { CariBaglantisi, CariDetayOzeti, ParaBirimi } from '@/types/ticari'
import CariBaglantiSihirbazi from './CariBaglantiSihirbazi'
import TedarikciCalismaPaneli from './TedarikciCalismaPaneli'

type Sekme = MusteriCalismaSekmesi

export default function CariCalismaAlani({
  cariler,
  onDuzenle,
  duzenleyebilir,
  onCariHesapAc,
}: {
  cariler: Cari[]
  onDuzenle: (cari: Cari) => void
  duzenleyebilir: boolean
  onCariHesapAc: (cari: Cari) => void
}) {
  const { access, hasPermission } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const ilkUrlParametreleri = new URLSearchParams(location.search)
  const ilkUrlCarisi = cariler.find((cari) => cari.id === ilkUrlParametreleri.get('cari'))
  const ilkUrlTuru = ilkUrlParametreleri.get('tur')
  const [tur, setTur] = useState<Cari['tipi']>(
    ilkUrlCarisi?.tipi
      ?? (ilkUrlTuru === 'tedarikci' ? 'tedarikci' : 'musteri'),
  )
  const turCarileri = useMemo(
    () => cariler.filter((cari) => cari.tipi === tur),
    [cariler, tur],
  )
  const [arama, setArama] = useState('')
  const [secilenId, setSecilenId] = useState(ilkUrlCarisi?.id ?? '')
  const ilkUrlSekmesi = ilkUrlParametreleri.get('sekme')
  const [sekme, setSekme] = useState<Sekme>(
    cariCalismaSekmesiniDogrula('musteri', ilkUrlSekmesi) as Sekme,
  )
  const [detay, setDetay] = useState<CariDetayOzeti | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [baglantiAcik, setBaglantiAcik] = useState(false)
  const [islemMenusuAcik, setIslemMenusuAcik] = useState(false)
  const [onaylananId, setOnaylananId] = useState<string | null>(null)
  const islemMenusuRef = useRef<HTMLDivElement>(null)
  const secilen = cariler.find((cari) => cari.id === secilenId)
    ?? turCarileri[0]
  const baglantiOlusturabilir = hasPermission('pricing', 'read')
    && hasPermission('pricing', 'create')
    && hasPermission('pricing', 'update')

  const urlSeciminiGuncelle = useCallback((cari: Cari, yeniSekme: string) => {
    const params = new URLSearchParams(location.search)
    const gecerliSekme = cariCalismaSekmesiniDogrula(cari.tipi, yeniSekme)
    params.set('tur', cari.tipi)
    params.set('cari', cari.id)
    params.set('sekme', gecerliSekme)
    navigate(`${location.pathname}?${params.toString()}`)
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    if (cariler.length === 0) return
    const durum = cariCalismaDurumunuCoz(location.search, cariler)

    setTur(mevcut => mevcut === durum.tur ? mevcut : durum.tur)
    setSecilenId(mevcut => mevcut === durum.cariId ? mevcut : durum.cariId)
    if (durum.tur === 'musteri') {
      setSekme(mevcut => mevcut === durum.sekme ? mevcut : durum.sekme as Sekme)
    }

    if (durum.normalizedSearch !== new URLSearchParams(location.search).toString()) {
      navigate(
        {
          pathname: location.pathname,
          search: durum.normalizedSearch ? `?${durum.normalizedSearch}` : '',
        },
        { replace: true },
      )
    }
  }, [cariler, location.pathname, location.search, navigate])

  useEffect(() => {
    if (!islemMenusuAcik) return
    const disariyaTiklandi = (event: PointerEvent) => {
      if (!islemMenusuRef.current?.contains(event.target as Node)) {
        setIslemMenusuAcik(false)
      }
    }
    const escapeBasildi = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIslemMenusuAcik(false)
    }
    document.addEventListener('pointerdown', disariyaTiklandi)
    document.addEventListener('keydown', escapeBasildi)
    return () => {
      document.removeEventListener('pointerdown', disariyaTiklandi)
      document.removeEventListener('keydown', escapeBasildi)
    }
  }, [islemMenusuAcik])

  const detayiYukle = useCallback(async () => {
    if (!secilen?.id) return
    if (secilen.tipi === 'tedarikci') {
      setDetay(null)
      setHata(null)
      setYukleniyor(false)
      return
    }
    setYukleniyor(true)
    setHata(null)
    try {
      setDetay(await cariDetayOzetiniGetir(secilen.id))
    } catch (error) {
      setDetay(null)
      setHata(error instanceof Error ? error.message : 'Cari detayı yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }, [secilen?.id, secilen?.tipi])

  useEffect(() => { void detayiYukle() }, [detayiYukle])

  const taslagiOnayla = async (baglanti: CariBaglantisi) => {
    if (!hasPermission('pricing', 'manage') || !hasPermission('finance', 'create')) return
    if (access?.aal !== 'aal2') {
      navigate('/mfa', { state: { from: `${location.pathname}${location.search}` } })
      return
    }
    setOnaylananId(baglanti.id)
    setHata(null)
    try {
      await cariBaglantiOnayla(
        baglanti.id,
        baglanti.revision_no,
        yeniIdempotencyAnahtari(),
      )
      await detayiYukle()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Bağlantı onaylanamadı.')
    } finally {
      setOnaylananId(null)
    }
  }

  const gorunenler = useMemo(() => {
    const aranan = arama.trim().toLocaleLowerCase('tr-TR')
    return aranan
      ? turCarileri.filter((cari) => (
        `${cari.ad} ${cari.telefon ?? ''} ${cari.email ?? ''}`
          .toLocaleLowerCase('tr-TR')
          .includes(aranan)
      ))
      : turCarileri
  }, [arama, turCarileri])

  const turuSec = (yeniTur: Cari['tipi']) => {
    setTur(yeniTur)
    setArama('')
    setSekme('genel')
    setIslemMenusuAcik(false)
    const ilkKayit = cariler.find((cari) => cari.tipi === yeniTur)
    setSecilenId(ilkKayit?.id ?? '')
    if (ilkKayit) {
      urlSeciminiGuncelle(ilkKayit, 'genel')
      return
    }
    const params = new URLSearchParams(location.search)
    params.set('tur', yeniTur)
    params.set('sekme', 'genel')
    params.delete('cari')
    navigate(`${location.pathname}?${params.toString()}`)
  }

  const musteriSekmesiniSec = (yeniSekme: Sekme) => {
    setSekme(yeniSekme)
    if (secilen?.tipi === 'musteri') urlSeciminiGuncelle(secilen, yeniSekme)
  }

  return (
    <div className="grid min-h-[560px] min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-[288px_minmax(0,1fr)]">
      <aside className="min-w-0 border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-200 p-3">
          <div className="mb-3 grid min-w-0 grid-cols-2 gap-1 rounded-xl bg-slate-100/80 p-1">
            <button
              type="button"
              onClick={() => turuSec('musteri')}
              className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                tur === 'musteri'
                  ? 'bg-white text-blue-700 ring-1 ring-inset ring-slate-200'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <UserRound size={15} />
              Müşteriler
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                tur === 'musteri' ? 'bg-blue-50 text-blue-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {cariler.filter((cari) => cari.tipi === 'musteri').length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => turuSec('tedarikci')}
              className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                tur === 'tedarikci'
                  ? 'bg-white text-violet-700 ring-1 ring-inset ring-slate-200'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Building2 size={15} />
              Tedarikçiler
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                tur === 'tedarikci' ? 'bg-violet-50 text-violet-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {cariler.filter((cari) => cari.tipi === 'tedarikci').length}
              </span>
            </button>
          </div>
          <label className="relative block">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              value={arama}
              onChange={(event) => setArama(event.target.value)}
              placeholder={tur === 'musteri' ? 'Müşteri ara' : 'Tedarikçi ara'}
              className={`w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 ${
                tur === 'musteri' ? 'focus:ring-blue-500' : 'focus:ring-violet-500'
              }`}
            />
          </label>
        </div>
        <div className="max-h-60 min-w-0 overflow-y-auto overscroll-contain p-2 lg:max-h-[532px]">
          {gorunenler.map((cari) => (
            <button
              key={cari.id}
              type="button"
              onClick={() => {
                setSecilenId(cari.id)
                setSekme('genel')
                setIslemMenusuAcik(false)
                urlSeciminiGuncelle(cari, 'genel')
              }}
              className={`mb-1 flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition ${
                secilen?.id === cari.id
                  ? tur === 'musteri'
                    ? 'border-blue-200 border-l-[3px] border-l-blue-500 bg-blue-50/70 text-slate-900 ring-1 ring-inset ring-blue-100'
                    : 'border-violet-200 border-l-[3px] border-l-violet-500 bg-violet-50/70 text-slate-900 ring-1 ring-inset ring-violet-100'
                  : 'text-gray-700 hover:border-slate-200 hover:bg-white'
              }`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                secilen?.id === cari.id
                  ? tur === 'musteri'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-violet-100 text-violet-700'
                  : tur === 'musteri'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-violet-50 text-violet-700'
              }`}>
                {cari.ad.trim().slice(0, 1).toLocaleUpperCase('tr-TR')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{cari.ad}</span>
                <span className={`mt-0.5 block truncate text-[11px] ${
                  secilen?.id === cari.id
                    ? tur === 'musteri' ? 'text-blue-600' : 'text-violet-600'
                    : 'text-gray-400'
                }`}>
                  {cari.aktif === false
                    ? 'Pasif kayıt'
                    : cari.tipi === 'tedarikci'
                      ? tedarikKapsamiOzetMetni(cari.tedarik_kapsamlari)
                      : cari.telefon || cari.email || 'Aktif müşteri'}
                </span>
              </span>
              <ChevronRight
                size={14}
                className={secilen?.id === cari.id
                  ? tur === 'musteri' ? 'text-blue-500' : 'text-violet-500'
                  : 'text-gray-300'}
              />
            </button>
          ))}
          {gorunenler.length === 0 && (
            <div className="px-3 py-10 text-center text-xs leading-5 text-gray-500">
              {arama
                ? 'Aramanızla eşleşen kayıt bulunamadı.'
                : tur === 'musteri'
                  ? 'Henüz müşteri kaydı yok.'
                  : 'Henüz tedarikçi kaydı yok.'}
            </div>
          )}
        </div>
      </aside>

      <section className="min-w-0 overflow-hidden">
        {!secilen ? (
          <div className="grid h-full place-items-center p-8 text-sm text-gray-500">Görüntülenecek cari bulunamadı.</div>
        ) : (
          <>
            {secilen.tipi === 'musteri' && (
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                    secilen.tipi === 'musteri'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-violet-100 text-violet-700'
                  }`}>
                    {secilen.tipi === 'musteri' ? <UserRound size={12} /> : <Building2 size={12} />}
                    {secilen.tipi === 'musteri' ? 'Müşteri' : 'Tedarikçi'}
                  </span>
                  {secilen.aktif === false && (
                    <span className="rounded-full bg-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600">
                      Pasif
                    </span>
                  )}
                </div>
                <h2 className="mt-1.5 truncate text-xl font-semibold text-gray-900">{secilen.ad}</h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500">
                  {secilen.telefon && (
                    <a href={`tel:${secilen.telefon}`} className="inline-flex items-center gap-1.5 hover:text-gray-900">
                      <Phone size={13} />
                      {secilen.telefon}
                    </a>
                  )}
                  {secilen.email && (
                    <a href={`mailto:${secilen.email}`} className="inline-flex items-center gap-1.5 hover:text-gray-900">
                      <Mail size={13} />
                      {secilen.email}
                    </a>
                  )}
                  {secilen.adres && (
                    <span className="inline-flex max-w-md items-center gap-1.5 truncate">
                      <MapPin size={13} className="shrink-0" />
                      {secilen.adres}
                    </span>
                  )}
                  {!secilen.telefon && !secilen.email && !secilen.adres && (
                    <span>İletişim bilgisi eklenmemiş</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {duzenleyebilir && (
                  <button
                    type="button"
                    onClick={() => onDuzenle(secilen)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil size={14} />
                    Bilgileri düzenle
                  </button>
                )}
                {secilen.tipi === 'musteri'
                  && (hasPermission('finance', 'read') || baglantiOlusturabilir) && (
                  <div ref={islemMenusuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setIslemMenusuAcik((acik) => !acik)}
                      aria-expanded={islemMenusuAcik}
                      aria-controls="cari-musteri-islemleri"
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      Müşteri işlemleri
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${islemMenusuAcik ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {islemMenusuAcik && (
                      <div
                        id="cari-musteri-islemleri"
                        className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl shadow-slate-950/10"
                      >
                        <div className="px-3 pb-2 pt-1.5">
                          <p className="text-xs font-semibold text-gray-900">Seçili müşteri için işlem yap</p>
                          <p className="mt-0.5 text-[11px] text-gray-500">{secilen.ad}</p>
                        </div>
                        {hasPermission('finance', 'read') && (
                          <button
                            type="button"
                            onClick={() => {
                              setIslemMenusuAcik(false)
                              onCariHesapAc(secilen)
                            }}
                            className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50"
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                              <WalletCards size={16} />
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-gray-800">Tahsilat veya ödeme kaydet</span>
                              <span className="mt-0.5 block text-xs leading-4 text-gray-500">
                                Cari bakiyesine yeni bir finans hareketi ekleyin.
                              </span>
                            </span>
                          </button>
                        )}
                        {baglantiOlusturabilir && (
                          <button
                            type="button"
                            onClick={() => {
                              setIslemMenusuAcik(false)
                              setBaglantiAcik(true)
                            }}
                            className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50"
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
                              <Link2 size={16} />
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-gray-800">Satış bağlantısı oluştur</span>
                              <span className="mt-0.5 block text-xs leading-4 text-gray-500">
                                Fiyat, vade ve ön ödeme koşullarını tanımlayın.
                              </span>
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>
            )}

            {secilen.tipi === 'musteri' && (
              <div className="min-w-0 border-b border-slate-100 px-3 py-2 sm:px-4">
                <div
                  role="tablist"
                  aria-label="Müşteri çalışma alanı"
                  className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1"
                >
                  {([
                    ['genel', 'Genel Bakış'],
                    ['baglantilar', 'Bağlantılar ve Fiyatlar'],
                    ['siparisler', 'Siparişler'],
                    ['hareketler', 'Hesap Hareketleri'],
                  ] as Array<[Sekme, string]>).map(([anahtar, baslik]) => (
                    <button
                      key={anahtar}
                      type="button"
                      role="tab"
                      aria-selected={sekme === anahtar}
                      onClick={() => musteriSekmesiniSec(anahtar)}
                      className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                        sekme === anahtar
                          ? 'bg-white text-blue-700 ring-1 ring-inset ring-slate-200'
                          : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
                      }`}
                    >
                      {baslik}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {secilen.tipi === 'tedarikci' ? (
              <TedarikciCalismaPaneli
                key={secilen.id}
                tedarikci={secilen}
                onDuzenle={onDuzenle}
                duzenleyebilir={duzenleyebilir}
              />
            ) : (
              <div className="min-w-0 p-3 sm:p-4">
                {hata && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{hata}</div>}
                {yukleniyor ? <div className="py-16 text-center text-sm text-gray-500">Cari özeti yükleniyor…</div> : detay && (
                <>
                  {sekme === 'genel' && (
                    <GenelBakis detay={detay} finansGorunur={hasPermission('finance', 'read')} />
                  )}
                  {sekme === 'baglantilar' && (
                    <Baglantilar
                      baglantilar={detay.baglantilar}
                      onOnayla={hasPermission('pricing', 'manage') && hasPermission('finance', 'create')
                        ? taslagiOnayla
                        : undefined}
                      onaylananId={onaylananId}
                    />
                  )}
                  {sekme === 'siparisler' && <Siparisler detay={detay} />}
                  {sekme === 'hareketler' && <Hareketler detay={detay} />}
                </>
              )}
              </div>
            )}
          </>
        )}
      </section>

      {baglantiAcik && secilen?.tipi === 'musteri' && (
        <CariBaglantiSihirbazi cari={secilen} onKapat={() => setBaglantiAcik(false)} onTamamlandi={detayiYukle} />
      )}
    </div>
  )
}

function GenelBakis({
  detay,
  finansGorunur,
}: {
  detay: CariDetayOzeti
  finansGorunur: boolean
}) {
  const bakiyeler = new Map(detay.bakiyeler.map((ozet) => [ozet.para_birimi, Number(ozet.net_bakiye)]))
  const siradaki = detay.baglantilar.find((baglanti) => baglanti.operasyon_durumu === 'sirada')
  const etkin = detay.baglantilar.find((baglanti) => ['aktif_kredi', 'acik_donem'].includes(baglanti.operasyon_durumu))
  const finansBaglantisi = etkin
    ?? siradaki
    ?? detay.baglantilar.find((baglanti) => baglanti.durum !== 'iptal')
  const gosterilenParaBirimi: ParaBirimi = finansBaglantisi?.para_birimi ?? 'TRY'
  const netBakiye = bakiyeler.get(gosterilenParaBirimi) ?? 0
  return (
    <div className="min-w-0 space-y-3">
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="min-w-0 rounded-xl bg-slate-50/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Finansal durum</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {finansBaglantisi ? 'Müşteri bağlantısının para birimi' : 'Bağlantı bulunmadığı için varsayılan TL'}
              </p>
            </div>
            <WalletCards size={18} className="text-gray-400" />
          </div>
          {finansGorunur ? (
            <div className="rounded-lg bg-white/90 px-3 py-3 ring-1 ring-inset ring-slate-200/70">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-gray-500">
                <span>{netBakiye < 0 ? 'Müşteri kredisi' : netBakiye > 0 ? 'Müşteri borcu' : 'Bakiye yok'}</span>
                <span className="rounded-md bg-white px-2 py-1 font-semibold text-gray-700">
                  {gosterilenParaBirimi}
                </span>
              </div>
              <div className={`mt-1 text-xl font-semibold tabular-nums ${
                netBakiye < 0 ? 'text-emerald-700' : netBakiye > 0 ? 'text-rose-700' : 'text-gray-600'
              }`}>
                {ticariPara(Math.abs(netBakiye), gosterilenParaBirimi)}
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-white/90 px-3 py-4 text-sm text-gray-600 ring-1 ring-inset ring-slate-200/70">
              Bakiye bilgilerini görmek için finans okuma yetkisi gerekir.
            </div>
          )}
        </div>
        <div className="min-w-0 rounded-xl bg-slate-50/70 p-4">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Bağlantı durumu</h3>
              <p className="mt-0.5 text-xs text-gray-500">{detay.baglantilar.length} toplam bağlantı</p>
            </div>
            <Link2 size={18} className="text-gray-400" />
          </div>
          <div className="divide-y divide-gray-100">
            <div className="py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500"><Link2 size={13} /> Etkin</div>
              {etkin ? <BaglantiSatiri baglanti={etkin} /> : <p className="mt-1.5 text-xs text-gray-500">Onaylı bağlantı yok.</p>}
            </div>
            <div className="py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500"><ReceiptText size={13} /> Sıradaki</div>
              {siradaki ? <BaglantiSatiri baglanti={siradaki} /> : <p className="mt-1.5 text-xs text-gray-500">Kuyrukta bekleyen bağlantı yok.</p>}
            </div>
          </div>
        </div>
      </div>
      <div className="min-w-0 border-t border-slate-100 pt-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-900">Son siparişler</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{detay.siparis_toplami} kayıt</span></div><SiparisTablosu siparisler={detay.siparisler.slice(0, 5)} /></div>
    </div>
  )
}

function Baglantilar({
  baglantilar,
  onOnayla,
  onaylananId,
}: {
  baglantilar: CariBaglantisi[]
  onOnayla?: (baglanti: CariBaglantisi) => Promise<void>
  onaylananId: string | null
}) {
  if (!baglantilar.length) return <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">Henüz bağlantı yok. İlk bağlantıda mevcut cam fiyatları kopyalanır.</div>
  return <div className="min-w-0 space-y-3">{baglantilar.map((baglanti) => <div key={baglanti.id} className="rounded-xl bg-slate-50/70 p-4 ring-1 ring-inset ring-slate-200/70"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-gray-900">{baglanti.baglanti_no}</div><div className="mt-1 text-xs text-gray-500">{baglanti.odeme_tarihi} · {baglanti.odeme_yontemi.replaceAll('_', ' ')}</div></div><div className="flex items-center gap-2"><Durum durum={baglanti.operasyon_durumu} />{baglanti.durum === 'taslak' && onOnayla && <button type="button" onClick={() => void onOnayla(baglanti)} disabled={onaylananId === baglanti.id} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{onaylananId === baglanti.id ? 'Onaylanıyor…' : 'Yetkili onayı'}</button>}</div></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><Mini baslik="Ön ödeme" deger={ticariPara(baglanti.on_odeme_tutari, baglanti.para_birimi)} /><Mini baslik="Kalan bağlantı kredisi" deger={ticariPara(baglanti.kalan_tutar, baglanti.para_birimi)} /><Mini baslik="Sıra" deger={baglanti.sira_no ? String(baglanti.sira_no) : 'Taslak'} /></div>{(baglanti.fiyatlar?.length ?? 0) > 0 && <details className="mt-3 rounded-lg border border-slate-200/70 bg-white"><summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-blue-700">Cam fiyatlarını göster ({baglanti.fiyatlar?.length})</summary><div className="max-h-64 overflow-auto border-t border-slate-100 bg-white"><table className="w-full min-w-[520px] text-xs"><thead className="sticky top-0 bg-slate-50 text-left text-gray-500"><tr><th className="px-3 py-2">Cam</th><th className="px-3 py-2 text-right">KDV hariç m² fiyatı</th></tr></thead><tbody className="divide-y divide-gray-100">{baglanti.fiyatlar?.map((fiyat) => <tr key={fiyat.stok_id}><td className="px-3 py-2"><span className="font-medium text-gray-800">{fiyat.stok_adi}</span><span className="ml-2 text-gray-400">{fiyat.stok_kodu}</span></td><td className="px-3 py-2 text-right font-medium">{fiyat.birim_fiyat == null ? 'Yüzde / ana liste' : `${ticariPara(fiyat.birim_fiyat, baglanti.para_birimi)}/m²`}</td></tr>)}</tbody></table></div></details>}</div>)}</div>
}

function Siparisler({ detay }: { detay: CariDetayOzeti }) {
  return <div className="min-w-0 rounded-xl bg-slate-50/70 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-gray-900">Siparişler</h3><span className="text-xs text-gray-500">{detay.siparis_toplami} kayıt</span></div><SiparisTablosu siparisler={detay.siparisler} /><p className="mt-3 text-xs text-gray-500">Siparişlerde liste toplamı gösterilir; tahsilatlar genel cari bakiyesine yapıldığı için sipariş bazlı “ödendi/kalan” üretilmez.</p></div>
}

function SiparisTablosu({ siparisler }: { siparisler: CariDetayOzeti['siparisler'] }) {
  if (!siparisler.length) return <p className="py-6 text-center text-sm text-gray-500">Sipariş bulunamadı.</p>
  return <div className="mt-3 min-w-0 overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="py-2">Sipariş</th><th className="py-2">Tarih</th><th className="py-2 text-right">Adet / m²</th><th className="py-2 text-right">Liste toplamı</th></tr></thead><tbody className="divide-y divide-gray-100">{siparisler.map((siparis) => <tr key={siparis.id}><td className="py-2"><div className="font-medium text-gray-900">{siparis.siparis_no}</div><div className="text-xs text-gray-400">{siparis.alt_musteri || siparis.harici_siparis_no || siparis.kaynak}</div></td><td className="py-2 text-gray-600">{siparis.tarih}</td><td className="py-2 text-right tabular-nums">{siparis.adet} / {Number(siparis.m2).toFixed(3)}</td><td className="py-2 text-right font-medium">{siparis.genel_toplam == null ? '—' : ticariPara(siparis.genel_toplam, siparis.para_birimi)}</td></tr>)}</tbody></table></div>
}

function Hareketler({ detay }: { detay: CariDetayOzeti }) {
  return <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-200/80"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Tarih</th><th className="px-3 py-2">İşlem</th><th className="px-3 py-2">Açıklama</th><th className="px-3 py-2 text-right">Tutar</th></tr></thead><tbody className="divide-y divide-gray-100">{detay.hareketler.map((hareket) => <tr key={hareket.id}><td className="px-3 py-2 text-gray-500">{new Date(hareket.islem_tarihi).toLocaleDateString('tr-TR')}</td><td className="px-3 py-2"><span className={`inline-flex items-center gap-1 ${hareket.yon === 'borc' ? 'text-rose-700' : 'text-emerald-700'}`}>{hareket.yon === 'borc' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}{hareket.hareket_turu.replaceAll('_', ' ')}</span></td><td className="px-3 py-2 text-gray-600">{hareket.aciklama || '—'}</td><td className={`px-3 py-2 text-right font-medium ${hareket.yon === 'borc' ? 'text-rose-700' : 'text-emerald-700'}`}>{hareket.yon === 'borc' ? '+' : '−'} {ticariPara(hareket.tutar, hareket.para_birimi)}</td></tr>)}</tbody></table>{!detay.hareketler.length && <div className="p-8 text-center text-sm text-gray-500">Hesap hareketi yok.</div>}</div>
}

function BaglantiSatiri({ baglanti }: { baglanti: CariBaglantisi }) {
  return <div className="mt-3 flex items-center justify-between gap-3"><div><div className="text-sm font-medium text-gray-800">{baglanti.baglanti_no}</div><div className="text-xs text-gray-500">{baglanti.odeme_tarihi}</div></div><div className="text-right"><div className="text-sm font-semibold text-gray-900">{ticariPara(baglanti.kalan_tutar, baglanti.para_birimi)}</div><Durum durum={baglanti.operasyon_durumu} /></div></div>
}

function Durum({ durum }: { durum: CariBaglantisi['operasyon_durumu'] }) {
  const etiket: Record<CariBaglantisi['operasyon_durumu'], string> = { taslak: 'Taslak', sirada: 'Sırada', aktif_kredi: 'Aktif kredi', acik_donem: 'Açık dönem', tukendi: 'Tükendi', iptal: 'İptal' }
  return <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">{etiket[durum]}</span>
}

function Mini({ baslik, deger }: { baslik: string; deger: string }) {
  return <div className="rounded-lg bg-white/90 p-3 ring-1 ring-inset ring-slate-200/70"><div className="text-xs text-gray-500">{baslik}</div><div className="mt-1 text-sm font-semibold text-gray-900">{deger}</div></div>
}
