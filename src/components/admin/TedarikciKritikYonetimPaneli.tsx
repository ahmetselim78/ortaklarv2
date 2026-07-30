import {
  AlertTriangle,
  CheckCircle2,
  History,
  Link2,
  Loader2,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  UserCheck,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { useCari } from '@/hooks/useCari'
import { tedarikKapsamiOzetMetni } from '@/lib/tedarikKapsami'
import { ticariPara } from '@/lib/ticariFormat'
import {
  camBaglantisiAktiflestir,
  camBaglantisiKapat,
  tedarikciAktiflestir,
  tedarikciMaliyetDetayiniGetir,
  tedarikciPasiflestir,
} from '@/services/maliyetService'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type { Cari } from '@/types/cari'
import type { CamTedarikBaglantisi, TedarikciMaliyetDetayi } from '@/types/maliyet'

type DurumFiltresi = 'aktif' | 'pasif' | 'tumu'
type DurumOnayi = 'pasiflestir' | 'aktiflestir'

const inputClass =
  'mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100'

function EngelKarti({
  etiket,
  deger,
  aciklama,
}: {
  etiket: string
  deger: number
  aciklama: string
}) {
  return (
    <div className={`rounded-xl border p-3 ${deger > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-100 bg-emerald-50/60'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-gray-700">{etiket}</span>
        <span className={`text-lg font-bold ${deger > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>{deger}</span>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-gray-500">{aciklama}</p>
    </div>
  )
}

function BaglantiListesi({
  baslik,
  baglantilar,
  islem,
  onAktiflestir,
  onKapat,
}: {
  baslik: string
  baglantilar: CamTedarikBaglantisi[]
  islem: string | null
  onAktiflestir?: (baglanti: CamTedarikBaglantisi) => Promise<void>
  onKapat?: (baglanti: CamTedarikBaglantisi) => Promise<void>
}) {
  if (baglantilar.length === 0) return null
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{baslik}</h4>
      <div className="mt-2 space-y-2">
        {baglantilar.map((baglanti) => (
          <div
            key={baglanti.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 p-3 text-xs"
          >
            <div>
              <div className="font-semibold text-gray-900">{baglanti.baglanti_no}</div>
              <div className="mt-1 text-gray-500">
                {ticariPara(Number(baglanti.toplam_tutar), baglanti.para_birimi)}
                {' · '}
                {baglanti.baslangic_tarihi}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">
                {baglanti.durum}
              </span>
              {onAktiflestir && (
                <button
                  type="button"
                  onClick={() => void onAktiflestir(baglanti)}
                  disabled={islem === baglanti.id}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50"
                >
                  Aktifleştir
                </button>
              )}
              {onKapat && (
                <button
                  type="button"
                  onClick={() => void onKapat(baglanti)}
                  disabled={islem === baglanti.id}
                  className="rounded-lg bg-amber-700 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50"
                >
                  Kapat
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TedarikciDurumOnayi({
  tedarikci,
  tur,
  yukleniyor,
  onKapat,
  onOnayla,
}: {
  tedarikci: Cari
  tur: DurumOnayi
  yukleniyor: boolean
  onKapat: () => void
  onOnayla: () => void
}) {
  const aktiflestirme = tur === 'aktiflestir'
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !yukleniyor) onKapat()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tedarikci-durum-onayi-baslik"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 id="tedarikci-durum-onayi-baslik" className="text-lg font-bold text-gray-900">
              {aktiflestirme
                ? 'Tedarikçi yeniden aktifleştirilsin mi?'
                : 'Tedarikçi pasifleştirilsin mi?'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {aktiflestirme
                ? 'Tedarikçi yeni fiyat ve satın alma işlemlerinde yeniden kullanılabilir.'
                : 'Bu işlem yeni fiyat ve satın alma girişlerini durdurur.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Kapat"
            disabled={yukleniyor}
            onClick={onKapat}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div className={`rounded-xl border p-4 ${aktiflestirme ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className={aktiflestirme ? 'font-semibold text-emerald-950' : 'font-semibold text-amber-950'}>{tedarikci.ad}</div>
            <div className={`mt-1 font-mono text-xs ${aktiflestirme ? 'text-emerald-800' : 'text-amber-800'}`}>{tedarikci.kod}</div>
          </div>
          <p className="text-sm leading-6 text-gray-600">
            {aktiflestirme
              ? 'Geçmiş kayıtlar korunur; eski fiyatlar ve kapatılmış bağlantılar otomatik olarak yeniden açılmaz.'
              : 'Geçmiş ürün, fiyat, sipariş, fatura ve cari hareketleri korunur. Veritabanı son anda aktif maliyet kaynaklarını yeniden kontrol eder.'}
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button
            type="button"
            onClick={onKapat}
            disabled={yukleniyor}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onOnayla}
            disabled={yukleniyor}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${aktiflestirme ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-amber-700 hover:bg-amber-800'}`}
          >
            {yukleniyor
              ? <Loader2 size={15} className="animate-spin" />
              : aktiflestirme ? <UserCheck size={15} /> : <Power size={15} />}
            {aktiflestirme ? 'Yeniden aktifleştir' : 'Pasifleştir'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TedarikciKritikYonetimPaneli() {
  const { access, hasPermission } = useAuth()
  const { cariler, yukleniyor: carilerYukleniyor, hata: cariHatasi, yenile } = useCari()
  const [arama, setArama] = useState('')
  const [durum, setDurum] = useState<DurumFiltresi>('aktif')
  const [secilenId, setSecilenId] = useState<string | null>(null)
  const [detay, setDetay] = useState<TedarikciMaliyetDetayi | null>(null)
  const [detayYukleniyor, setDetayYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [islem, setIslem] = useState<string | null>(null)
  const [gerekce, setGerekce] = useState('Admin panelinden yetkili kullanıcı işlemi.')
  const [onayTuru, setOnayTuru] = useState<DurumOnayi | null>(null)

  const tedarikciler = useMemo(
    () => cariler
      .filter((cari) => cari.tipi === 'tedarikci')
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr')),
    [cariler],
  )
  const filtrelenmis = useMemo(() => {
    const query = arama.trim().toLocaleLowerCase('tr-TR')
    return tedarikciler.filter((tedarikci) => {
      if (durum === 'aktif' && !tedarikci.aktif) return false
      if (durum === 'pasif' && tedarikci.aktif) return false
      return !query || [tedarikci.ad, tedarikci.kod, tedarikci.telefon, tedarikci.email]
        .some((deger) => deger?.toLocaleLowerCase('tr-TR').includes(query))
    })
  }, [arama, durum, tedarikciler])
  const secilen = tedarikciler.find((tedarikci) => tedarikci.id === secilenId) ?? null
  const yetkili = hasPermission('admin', 'manage') && hasPermission('costing', 'manage')
  const aal2 = access?.aal === 'aal2'

  useEffect(() => {
    if (secilenId && tedarikciler.some((tedarikci) => tedarikci.id === secilenId)) return
    setSecilenId(tedarikciler.find((tedarikci) => tedarikci.aktif)?.id ?? tedarikciler[0]?.id ?? null)
  }, [secilenId, tedarikciler])

  const detayiYukle = useCallback(async () => {
    if (!secilenId) {
      setDetay(null)
      return
    }
    setDetayYukleniyor(true)
    setHata(null)
    try {
      setDetay(await tedarikciMaliyetDetayiniGetir(secilenId))
    } catch (error) {
      setDetay(null)
      setHata(error instanceof Error ? error.message : 'Tedarikçi kontrol bilgileri yüklenemedi.')
    } finally {
      setDetayYukleniyor(false)
    }
  }, [secilenId])

  useEffect(() => {
    void detayiYukle()
  }, [detayiYukle])

  const kritikYetkiyiDogrula = () => {
    if (!yetkili) {
      setHata('Bu alan için admin ve maliyet tam yönetim yetkileri gerekir.')
      return false
    }
    if (!aal2) {
      setHata('Kritik işlem için iki adımlı doğrulama gerekir.')
      return false
    }
    if (gerekce.trim().length < 5) {
      setHata('Kritik işlem için en az 5 karakterlik gerekçe yazın.')
      return false
    }
    return true
  }

  const baglantiyiAktiflestir = async (baglanti: CamTedarikBaglantisi) => {
    if (!kritikYetkiyiDogrula()) return
    setIslem(baglanti.id)
    setHata(null)
    try {
      await camBaglantisiAktiflestir(
        baglanti.id,
        baglanti.revision_no,
        gerekce,
        yeniIdempotencyAnahtari(),
      )
      await detayiYukle()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Bağlantı aktifleştirilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const baglantiyiKapat = async (baglanti: CamTedarikBaglantisi) => {
    if (!kritikYetkiyiDogrula()) return
    setIslem(baglanti.id)
    setHata(null)
    try {
      await camBaglantisiKapat(
        baglanti.id,
        new Date().toISOString(),
        gerekce,
        yeniIdempotencyAnahtari(),
      )
      await detayiYukle()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Bağlantı kapatılamadı.')
    } finally {
      setIslem(null)
    }
  }

  const pasiflestir = async () => {
    if (!secilen || !kritikYetkiyiDogrula()) return
    setIslem('pasiflestir')
    setHata(null)
    try {
      await tedarikciPasiflestir(secilen.id, gerekce, yeniIdempotencyAnahtari())
      setOnayTuru(null)
      await yenile()
      await detayiYukle()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Tedarikçi pasifleştirilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const aktiflestir = async () => {
    if (!secilen || !kritikYetkiyiDogrula()) return
    setIslem('aktiflestir')
    setHata(null)
    try {
      await tedarikciAktiflestir(secilen.id, gerekce, yeniIdempotencyAnahtari())
      setOnayTuru(null)
      await yenile()
      await detayiYukle()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Tedarikçi yeniden aktifleştirilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const engelToplami = detay
    ? detay.engeller.aktif_cam_baglantisi_sayisi
      + detay.engeller.aktif_stok_fiyati_sayisi
      + detay.engeller.gelecek_fiyat_donemi_sayisi
    : 0
  const taslaklar = detay?.baglantilar.filter((baglanti) => baglanti.durum === 'taslak') ?? []
  const aktifBaglantilar = detay?.baglantilar.filter((baglanti) => baglanti.durum === 'aktif') ?? []
  const kapananlar = detay?.baglantilar.filter((baglanti) => ['kapali', 'iptal'].includes(baglanti.durum)) ?? []

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6" data-testid="tedarikci-kritik-yonetim-paneli">
      {onayTuru && secilen && (
        <TedarikciDurumOnayi
          tedarikci={secilen}
          tur={onayTuru}
          yukleniyor={islem === onayTuru}
          onKapat={() => setOnayTuru(null)}
          onOnayla={() => void (onayTuru === 'aktiflestir' ? aktiflestir() : pasiflestir())}
        />
      )}

      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <ShieldCheck size={19} className="text-amber-700" />
              Tedarikçi Kritik İşlemleri
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
              Tedarikçi durumunu ve eski maliyet bağlantılarını burada yönetin. Pasifleştirme,
              aktif ve gelecek tarihli maliyet kaynakları kontrol edilmeden çalışmaz.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void Promise.all([yenile(), detayiYukle()])}
            disabled={carilerYukleniyor || detayYukleniyor}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={carilerYukleniyor || detayYukleniyor ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>

        {(cariHatasi || hata) && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            {hata || cariHatasi}
          </div>
        )}

        <div className="grid min-h-[560px] overflow-hidden rounded-2xl border border-gray-200 bg-white lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b border-gray-200 bg-gray-50/70 lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b border-gray-200 p-4">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={arama}
                  onChange={(event) => setArama(event.target.value)}
                  placeholder="Tedarikçi ara…"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-200/70 p-1">
                {([
                  ['aktif', 'Aktif'],
                  ['pasif', 'Pasif'],
                  ['tumu', 'Tümü'],
                ] as const).map(([deger, etiket]) => (
                  <button
                    key={deger}
                    type="button"
                    onClick={() => setDurum(deger)}
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold ${durum === deger ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                  >
                    {etiket}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[470px] overflow-y-auto p-2">
              {carilerYukleniyor ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                  <Loader2 size={16} className="animate-spin" />
                  Tedarikçiler yükleniyor…
                </div>
              ) : filtrelenmis.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">Tedarikçi bulunamadı.</div>
              ) : filtrelenmis.map((tedarikci) => (
                <button
                  key={tedarikci.id}
                  type="button"
                  onClick={() => setSecilenId(tedarikci.id)}
                  className={`mb-1 w-full rounded-xl border px-3 py-3 text-left transition ${secilenId === tedarikci.id ? 'border-amber-200 bg-amber-50 shadow-sm' : 'border-transparent hover:border-gray-200 hover:bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{tedarikci.ad}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-gray-500">{tedarikci.kod}</div>
                    </div>
                    <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${tedarikci.aktif ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 p-4 sm:p-6">
            {!secilen ? (
              <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-gray-400">
                <Truck size={36} className="mb-3 opacity-40" />
                <p className="text-sm">İşlem yapmak için bir tedarikçi seçin.</p>
              </div>
            ) : detayYukleniyor ? (
              <div className="flex h-full min-h-80 items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 size={18} className="animate-spin" />
                Kontroller yükleniyor…
              </div>
            ) : detay ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xl font-bold text-gray-950">{secilen.ad}</h4>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${secilen.aktif ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                        {secilen.aktif ? 'Aktif' : 'Pasif'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {secilen.kod}
                      {' · '}
                      {tedarikKapsamiOzetMetni(secilen.tedarik_kapsamlari)}
                    </div>
                  </div>
                  {engelToplami === 0 && secilen.aktif ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 size={14} />
                      Pasifleştirme kontrolü uygun
                    </span>
                  ) : secilen.aktif ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      <AlertTriangle size={14} />
                      {engelToplami} aktif engel var
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <EngelKarti etiket="Aktif cam bağlantısı" deger={detay.engeller.aktif_cam_baglantisi_sayisi} aciklama="Kapatılmadan tedarikçi pasifleşmez." />
                  <EngelKarti etiket="Aktif alış fiyatı" deger={detay.engeller.aktif_stok_fiyati_sayisi} aciklama="Hesapta kullanılan güncel fiyatlar." />
                  <EngelKarti etiket="Gelecek fiyat dönemi" deger={detay.engeller.gelecek_fiyat_donemi_sayisi} aciklama="İleri tarihli kaynak atamaları." />
                  <EngelKarti etiket="Bağlı stok" deger={detay.engeller.bagli_stok_sayisi} aciklama="Geçmişi korunacak stok ilişkileri." />
                </div>

                {detay.baglantilar.length > 0 && (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex items-center gap-2">
                      <Link2 size={16} className="text-violet-700" />
                      <h3 className="text-sm font-semibold text-gray-900">Eski cam maliyet bağlantıları</h3>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Geçmiş kayıtlar silinmez; kritik aktifleştirme ve kapatma işlemleri bu admin alanından yapılır.
                    </p>
                    <BaglantiListesi baslik="Taslaklar" baglantilar={taslaklar} islem={islem} onAktiflestir={yetkili && aal2 ? baglantiyiAktiflestir : undefined} />
                    <BaglantiListesi baslik="Aktif bağlantılar" baglantilar={aktifBaglantilar} islem={islem} onKapat={yetkili && aal2 ? baglantiyiKapat : undefined} />
                    <BaglantiListesi baslik="Kapalı / iptal" baglantilar={kapananlar} islem={islem} />
                  </div>
                )}

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 text-amber-950">
                    <ShieldCheck size={17} />
                    <h3 className="text-sm font-semibold">Kritik işlem onayı</h3>
                  </div>
                  <label className="mt-3 block text-xs font-medium text-amber-900">
                    İşlem gerekçesi
                    <input value={gerekce} onChange={(event) => setGerekce(event.target.value)} className={inputClass} />
                  </label>
                  {secilen.aktif ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (kritikYetkiyiDogrula()) setOnayTuru('pasiflestir')
                      }}
                      disabled={engelToplami > 0 || islem === 'pasiflestir'}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-3.5 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Power size={14} />
                      Tedarikçiyi pasifleştir
                    </button>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (kritikYetkiyiDogrula()) setOnayTuru('aktiflestir')
                        }}
                        disabled={islem === 'aktiflestir'}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        <UserCheck size={14} />
                        Tedarikçiyi yeniden aktifleştir
                      </button>
                      <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600">
                        <History size={14} />
                        Geçmiş kayıtlar korunuyor
                      </div>
                    </div>
                  )}
                  <p className="mt-2 text-xs leading-5 text-amber-800">
                    {secilen.aktif
                      ? 'Aktif bağlantı, fiyat veya gelecek dönem varsa pasifleştirme engellenir; hiçbir geçmiş kayıt silinmez.'
                      : 'Yeniden aktifleştirme yalnız tedarikçi kartını açar; eski fiyat ve bağlantılar kapalı kalır.'}
                  </p>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
