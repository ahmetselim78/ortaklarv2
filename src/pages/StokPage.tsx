import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  CircleOff,
  Database,
  LoaderCircle,
  PackageCheck,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import StokDetayPaneli from '@/components/stok/StokDetayPaneli'
import StokForm, { type StokPayload } from '@/components/stok/StokForm'
import StokHareketListesi from '@/components/stok/StokHareketListesi'
import StokHareketModal from '@/components/stok/StokHareketModal'
import StokListesi from '@/components/stok/StokListesi'
import PageHeader from '@/components/ui/PageHeader'
import { useStok } from '@/hooks/useStok'
import { stokKataloguVeReceteleriKur } from '@/lib/stokBaslangicKurulumAkisi'
import { ticariBugun } from '@/lib/ticariFormat'
import { cn } from '@/lib/utils'
import { standartUrunReceteleriniKurV3 } from '@/services/maliyetService'
import {
  stokBaslangicKataloguDurumunuGetir,
  stokBaslangicKatalogunuKur,
} from '@/services/stokService'
import type {
  StokBaslangicKatalogDurumu,
  StokKatalogKaydi,
  StokKategori,
} from '@/types/stok'

const SEKMELER: Array<{ key: StokKategori; label: string }> = [
  { key: 'cam', label: 'Cam' },
  { key: 'cita', label: 'Çıta' },
  { key: 'yan_malzeme', label: 'Yan Malzeme' },
]

function OzetKarti({ baslik, deger, alt, icon, ton }: {
  baslik: string
  deger: number
  alt: string
  icon: React.ReactNode
  ton: 'blue' | 'red' | 'amber' | 'emerald'
}) {
  const tonlar = {
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }
  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-950/[0.02]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{baslik}</p><p className="mt-2 text-2xl font-semibold text-gray-900">{deger}</p><p className="mt-1 text-xs text-gray-500">{alt}</p></div><span className={`rounded-lg p-2 ${tonlar[ton]}`}>{icon}</span></div></div>
}

function KatalogKurulumKarti({
  durum,
  yukleniyor,
  kuruluyor,
  olusturabilir,
  mesaj,
  receteTekrariGerekli,
  onKur,
  onReceteTekrar,
}: {
  durum: StokBaslangicKatalogDurumu | null
  yukleniyor: boolean
  kuruluyor: boolean
  olusturabilir: boolean
  mesaj: string | null
  receteTekrariGerekli: boolean
  onKur: () => void
  onReceteTekrar: () => void
}) {
  if (yukleniyor && !durum) {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-4 text-sm text-gray-600">
        <LoaderCircle size={18} className="animate-spin text-blue-600" />
        Başlangıç stok kataloğu kontrol ediliyor…
      </div>
    )
  }
  if (!durum) return null

  const temizKurulum = durum.mevcut === 0
  const butonMetni = temizKurulum ? 'Başlangıç Stok Kataloğunu Kur' : 'Eksikleri Tamamla'
  const kategoriEtiketleri: Record<StokKategori, string> = {
    cam: 'Cam',
    cita: 'Çıta',
    yan_malzeme: 'Yan malzeme',
  }

  if (durum.kurulu) {
    const cakismaVar = durum.cakisan > 0
    const uyariVar = receteTekrariGerekli || cakismaVar
    return (
      <div className={cn(
        'mb-5 rounded-xl border px-4 py-3',
        uyariVar
          ? 'border-amber-200 bg-amber-50'
          : 'border-emerald-200 bg-emerald-50',
      )}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            {uyariVar
              ? <TriangleAlert size={20} className="mt-0.5 shrink-0 text-amber-600" />
              : <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />}
            <div>
              <p className={cn(
                'text-sm font-semibold',
                uyariVar ? 'text-amber-900' : 'text-emerald-900',
              )}>
                {receteTekrariGerekli
                  ? 'Stok kataloğu hazır; maliyet reçeteleri bekliyor'
                  : cakismaVar
                    ? 'Stok kataloğu hazır; mevcut kart farklılıkları var'
                    : 'Başlangıç stok kataloğu hazır'}
              </p>
              <p className={cn(
                'mt-0.5 text-xs',
                uyariVar ? 'text-amber-700' : 'text-emerald-700',
              )}>
                {durum.toplam} standart kartın tamamı mevcut. Kurulum işlemi mevcut kartları değiştirmez.
              </p>
              {cakismaVar && (
                <p className="mt-1 text-xs font-medium text-amber-800">
                  {durum.cakisan} mevcut kartın teknik tanımı standart şablondan farklı; kullanıcı kartları korundu.
                </p>
              )}
              {mesaj && (
                <p className={cn(
                  'mt-1 text-xs font-medium',
                  uyariVar ? 'text-amber-800' : 'text-emerald-800',
                )}>
                  {mesaj}
                </p>
              )}
            </div>
          </div>
          {uyariVar && olusturabilir && (
            <button
              type="button"
              onClick={onReceteTekrar}
              disabled={kuruluyor}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {kuruluyor
                ? <><LoaderCircle size={16} className="animate-spin" /> Reçeteler hazırlanıyor…</>
                : <><PackageCheck size={16} /> Reçeteleri Yeniden Dene</>}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'mb-5 rounded-2xl border p-5 shadow-sm',
      temizKurulum ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50',
    )}>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="flex items-start gap-3">
          <span className={cn(
            'rounded-xl p-2.5',
            temizKurulum ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700',
          )}>
            <Database size={21} />
          </span>
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {temizKurulum ? 'Başlangıç stok kataloğunu kurun' : 'Başlangıç stok kataloğunda eksikler var'}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-gray-600">
              {temizKurulum
                ? 'Standart cam, alüminyum çıta ve yan malzeme kartlarını tek işlemle oluşturun.'
                : `${durum.eksik} standart kart eksik. Yalnızca eksik kartlar oluşturulacak; mevcut kartlar ve veriler korunacak.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SEKMELER.map(({ key }) => {
                const ozet = durum.kategoriler[key]
                return (
                  <span key={key} className="rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-xs font-medium text-gray-700">
                    {kategoriEtiketleri[key]}: {ozet.mevcut}/{ozet.toplam}
                    {ozet.eksik > 0 && <span className="ml-1 text-amber-700">({ozet.eksik} eksik)</span>}
                  </span>
                )
              })}
            </div>
            {!olusturabilir && (
              <p className="mt-3 text-xs font-medium text-gray-600">
                Kurulum için stok oluşturma yetkisi gereklidir.
              </p>
            )}
          </div>
        </div>
        {olusturabilir && (
          <button
            type="button"
            onClick={onKur}
            disabled={kuruluyor || yukleniyor || durum.eksik === 0}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {kuruluyor
              ? <><LoaderCircle size={17} className="animate-spin" /> Katalog hazırlanıyor…</>
              : <><Database size={17} /> {butonMetni}</>}
          </button>
        )}
      </div>
    </div>
  )
}

export default function StokPage({ yonetimModu = false }: { yonetimModu?: boolean }) {
  const {
    stoklar,
    hareketler,
    tedarikciler,
    ozet,
    yukleniyor,
    hata,
    ekle,
    guncelle,
    sil,
    aktiflikAyarla,
    hareketKaydet,
    operasyonAyarlariGuncelle,
    yenile,
  } = useStok({ yonetimVerileriniYukle: yonetimModu })
  const { hasPermission } = useAuth()
  const olusturabilir = yonetimModu && hasPermission('inventory', 'create')
  const duzenleyebilir = yonetimModu && hasPermission('inventory', 'update')
  const silebilir = yonetimModu && hasPermission('inventory', 'delete')

  const [aktifSekme, setAktifSekme] = useState<StokKategori>('cam')
  const [formAcik, setFormAcik] = useState(false)
  const [duzenlenecek, setDuzenlenecek] = useState<StokKatalogKaydi | null>(null)
  const [detayId, setDetayId] = useState<string | null>(null)
  const [silinecek, setSilinecek] = useState<StokKatalogKaydi | null>(null)
  const [hareketStokId, setHareketStokId] = useState<string | null | undefined>(undefined)
  const [siliniyor, setSiliniyor] = useState(false)
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null)
  const [katalogDurumu, setKatalogDurumu] = useState<StokBaslangicKatalogDurumu | null>(null)
  const [katalogDurumuYukleniyor, setKatalogDurumuYukleniyor] = useState(true)
  const [katalogKuruluyor, setKatalogKuruluyor] = useState(false)
  const [katalogMesaji, setKatalogMesaji] = useState<string | null>(null)
  const [receteTekrariGerekli, setReceteTekrariGerekli] = useState(false)
  const katalogKurulumKilidi = useRef(false)

  const adetler = useMemo(() => Object.fromEntries(SEKMELER.map(({ key }) => [
    key,
    stoklar.filter((stok) => stok.kategori === key).length,
  ])) as Record<StokKategori, number>, [stoklar])
  const detay = detayId ? stoklar.find((stok) => stok.id === detayId) ?? null : null

  const katalogDurumunuYenile = useCallback(async () => {
    setKatalogDurumuYukleniyor(true)
    try {
      const durum = await stokBaslangicKataloguDurumunuGetir()
      setKatalogDurumu(durum)
    } catch (error) {
      setIslemHatasi(error instanceof Error
        ? error.message
        : 'Başlangıç stok kataloğu durumu alınamadı.')
    } finally {
      setKatalogDurumuYukleniyor(false)
    }
  }, [])

  useEffect(() => {
    if (!yonetimModu) {
      setKatalogDurumuYukleniyor(false)
      return
    }
    void katalogDurumunuYenile()
  }, [katalogDurumunuYenile, yonetimModu])

  const formuKapat = () => {
    setFormAcik(false)
    setDuzenlenecek(null)
  }

  const handleKaydet = async (payload: StokPayload) => {
    if (duzenlenecek) await guncelle(duzenlenecek.id, payload)
    else await ekle(payload)
    setAktifSekme(payload.kategori)
  }

  const handleDuzenle = (stok: StokKatalogKaydi) => {
    if (stok.kullaniliyor) return
    setDetayId(null)
    setDuzenlenecek(stok)
    setFormAcik(true)
  }

  const handleAktiflik = async (stok: StokKatalogKaydi, aktif: boolean) => {
    setIslemHatasi(null)
    try {
      await aktiflikAyarla(stok.id, aktif)
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : 'Stok durumu değiştirilemedi.')
    }
  }

  const handleSil = async () => {
    if (!silinecek || silinecek.kullaniliyor) return
    setSiliniyor(true)
    setIslemHatasi(null)
    try {
      await sil(silinecek.id)
      setSilinecek(null)
      if (detayId === silinecek.id) setDetayId(null)
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : 'Stok kartı silinemedi.')
    } finally {
      setSiliniyor(false)
    }
  }

  const handleKatalogKur = async () => {
    if (
      katalogKurulumKilidi.current
      || katalogKuruluyor
      || !olusturabilir
      || !katalogDurumu
      || katalogDurumu.kurulu
    ) return

    const temizKurulum = katalogDurumu.mevcut === 0
    const onaylandi = window.confirm(
      temizKurulum
        ? 'Standart cam, çıta ve yan malzeme kartları oluşturulsun mu? Mevcut verilere dokunulmayacak.'
        : `${katalogDurumu.eksik} eksik standart stok kartı tamamlansın mı? Mevcut kartlar değiştirilmeyecek.`,
    )
    if (!onaylandi) return

    katalogKurulumKilidi.current = true
    setKatalogKuruluyor(true)
    setKatalogMesaji(null)
    setIslemHatasi(null)
    try {
      const { katalog: sonuc, recete: receteSonucu, receteHatasi } = await stokKataloguVeReceteleriKur(
        () => stokBaslangicKatalogunuKur(),
        () => standartUrunReceteleriniKurV3(
          ticariBugun(),
          undefined,
          true,
        ),
      )
      setKatalogDurumu(sonuc)
      if (receteHatasi || !receteSonucu) {
        setReceteTekrariGerekli(true)
        setKatalogMesaji(
          `Stok kataloğu başarıyla hazırlandı${sonuc.eklenen > 0
            ? `; ${sonuc.eklenen} eksik kart oluşturuldu`
            : ''}. Standart maliyet reçeteleri tamamlanamadı; yeniden deneyin. ${receteHatasi?.message ?? ''}`.trim(),
        )
      } else {
        setReceteTekrariGerekli(false)
        setKatalogMesaji(
          sonuc.eklenen > 0
            ? `${sonuc.eklenen} eksik stok kartı oluşturuldu; ${receteSonucu.kurulanlar.length} standart maliyet reçetesi hazırlandı.`
            : `Başlangıç stok kataloğu kontrol edildi; mevcut kartlar korundu. ${receteSonucu.kurulanlar.length} standart maliyet reçetesi hazırlandı.`,
        )
      }
    } catch (error) {
      setIslemHatasi(
        `Başlangıç stok kataloğu kurulamadı: ${
          error instanceof Error ? error.message : 'Bilinmeyen hata'
        }`,
      )
    } finally {
      await Promise.allSettled([yenile(), katalogDurumunuYenile()])
      katalogKurulumKilidi.current = false
      setKatalogKuruluyor(false)
    }
  }

  const handleReceteKurulumTekrar = async () => {
    if (
      katalogKurulumKilidi.current
      || katalogKuruluyor
      || !olusturabilir
      || !receteTekrariGerekli
    ) return

    katalogKurulumKilidi.current = true
    setKatalogKuruluyor(true)
    setIslemHatasi(null)
    try {
      const receteSonucu = await standartUrunReceteleriniKurV3(
        ticariBugun(),
        undefined,
        true,
      )
      setReceteTekrariGerekli(false)
      setKatalogMesaji(
        `Stok kataloğu hazır; ${receteSonucu.kurulanlar.length} standart maliyet reçetesi hazırlandı.`,
      )
    } catch (error) {
      setReceteTekrariGerekli(true)
      setKatalogMesaji(
        `Stok kataloğu hazır. Standart maliyet reçeteleri yine tamamlanamadı; yeniden deneyebilirsiniz. ${
          error instanceof Error ? error.message : ''
        }`.trim(),
      )
    } finally {
      await Promise.allSettled([yenile(), katalogDurumunuYenile()])
      katalogKurulumKilidi.current = false
      setKatalogKuruluyor(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        baslik={yonetimModu ? 'Stok Yönetimi' : 'Stok Kataloğu'}
        aciklama={yonetimModu
          ? 'Stok kartlarını ve hareketlerini yönetin; silme ve aktiflik işlemlerini kontrollü biçimde uygulayın.'
          : 'Cam, çıta ve yan malzeme stoklarını görüntüleyin.'}
        icon={Boxes}
        aksiyon={olusturabilir
          ? <button type="button" onClick={() => { setDuzenlenecek(null); setFormAcik(true) }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Plus size={16} /> Yeni {SEKMELER.find((sekme) => sekme.key === aktifSekme)?.label}</button>
          : undefined}
      />

      {(hata || islemHatasi) && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{islemHatasi || hata}</span>
        </div>
      )}

      {yonetimModu && (
        <KatalogKurulumKarti
          durum={katalogDurumu}
          yukleniyor={katalogDurumuYukleniyor}
          kuruluyor={katalogKuruluyor}
          olusturabilir={olusturabilir}
          mesaj={katalogMesaji}
          receteTekrariGerekli={receteTekrariGerekli}
          onKur={() => void handleKatalogKur()}
          onReceteTekrar={() => void handleReceteKurulumTekrar()}
        />
      )}

      <div className={cn('mb-5 grid gap-3 sm:grid-cols-2', yonetimModu ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
        <OzetKarti baslik="Aktif stok kartı" deger={ozet.aktif_kart_sayisi} alt="Cam, çıta ve yan malzeme" icon={<PackageCheck size={19} />} ton="blue" />
        <OzetKarti baslik="Kritik stok" deger={ozet.kritik_stok_sayisi} alt="Minimum seviyede veya altında" icon={<TriangleAlert size={19} />} ton={ozet.kritik_stok_sayisi > 0 ? 'red' : 'emerald'} />
        <OzetKarti baslik="Stoksuz kart" deger={ozet.stoksuz_kart_sayisi} alt="Bakiyesi sıfır aktif kart" icon={<CircleOff size={19} />} ton={ozet.stoksuz_kart_sayisi > 0 ? 'amber' : 'emerald'} />
        {yonetimModu && <OzetKarti baslik="Bugünkü hareket" deger={ozet.bugunku_hareket_sayisi} alt="Giriş ve çıkış toplamı" icon={<ArrowLeftRight size={19} />} ton="emerald" />}
      </div>

      <div className="mb-5 overflow-x-auto border-b border-gray-200">
        <div className="flex min-w-max gap-1">
          {SEKMELER.map((sekme) => (
            <button
              key={sekme.key}
              type="button"
              onClick={() => { setAktifSekme(sekme.key); setIslemHatasi(null) }}
              className={cn(
                'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                aktifSekme === sekme.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800',
              )}
            >
              {sekme.label}
              <span className={cn(
                'ml-2 rounded-full px-2 py-0.5 text-xs',
                aktifSekme === sekme.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
              )}>
                {adetler[sekme.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <StokListesi
        key={aktifSekme}
        stoklar={stoklar}
        yukleniyor={yukleniyor}
        kategori={aktifSekme}
        yonetimModu={yonetimModu}
        duzenleyebilir={duzenleyebilir}
        silebilir={silebilir}
        durumDegistirebilir={duzenleyebilir}
        onDetay={(stok) => setDetayId(stok.id)}
        onDuzenle={handleDuzenle}
        onSil={setSilinecek}
        onPasiflestir={(stok) => void handleAktiflik(stok, false)}
        onAktiflestir={(stok) => void handleAktiflik(stok, true)}
        onHareket={(stok) => setHareketStokId(stok.id)}
      />

      {yonetimModu && <div className="mt-5"><StokHareketListesi hareketler={hareketler} limit={12} /></div>}

      {yonetimModu && formAcik && (
        <StokForm
          duzenlenecek={duzenlenecek}
          defaultKategori={aktifSekme}
          onKaydet={handleKaydet}
          onKapat={formuKapat}
        />
      )}

      {detay && <StokDetayPaneli key={detay.id} stok={detay} hareketler={hareketler} yonetimModu={yonetimModu} duzenleyebilir={duzenleyebilir} onHareket={() => setHareketStokId(detay.id)} onOperasyonKaydet={(minimum, yer) => operasyonAyarlariGuncelle(detay.id, minimum, yer)} onKapat={() => setDetayId(null)} />}

      {yonetimModu && hareketStokId !== undefined && (
        <StokHareketModal
          stoklar={stoklar}
          tedarikciler={tedarikciler}
          baslangicStokId={hareketStokId}
          onKaydet={hareketKaydet}
          onKapat={() => setHareketStokId(undefined)}
        />
      )}

      {yonetimModu && silinecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-600"><Trash2 size={18} /></div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Stok kartı silinsin mi?</h2>
                <p className="mt-2 text-sm leading-5 text-gray-600">
                  <strong>{silinecek.kod} — {silinecek.ad}</strong> kalıcı olarak silinecek.
                  Bu işlem yalnız kullanılmamış kartlarda ve AAL2 doğrulamasıyla yapılabilir.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={siliniyor} onClick={() => setSilinecek(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Vazgeç
              </button>
              <button type="button" disabled={siliniyor} onClick={() => void handleSil()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {siliniyor ? 'Siliniyor…' : 'Kalıcı Olarak Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
