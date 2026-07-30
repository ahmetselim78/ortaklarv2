import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  History,
  LayoutDashboard,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import {
  stokKategorisininTedarikKapsami,
  stokProfilininTedarikKapsami,
  tedarikKapsamiEtiketi,
  tedarikKapsamiOzetMetni,
} from '@/lib/tedarikKapsami'
import { ticariPara, ticariTarih } from '@/lib/ticariFormat'
import {
  sadeMaliyetYonetiminiGetir,
  tedarikciMaliyetDetayiniGetir,
} from '@/services/maliyetService'
import { tedarikciStokBaglantilariniGetir } from '@/services/tedarikciService'
import type { Cari, TedarikKapsami } from '@/types/cari'
import type {
  MaliyetAlisFiyatiTarihceKaydi,
  SadeMaliyetYonetimi,
  TedarikciMaliyetDetayi,
} from '@/types/maliyet'
import type { TedarikciStokBaglantiKatalogu } from '@/types/tedarikci'
import TedarikciFiyatYonetimi from './TedarikciFiyatYonetimi'
import TedarikciSiparisTakibi from './TedarikciSiparisTakibi'
import TedarikciUrunBaglantilari from './TedarikciUrunBaglantilari'

export type TedarikciCalismaSekmesi =
  | 'genel'
  | 'urunler'
  | 'fiyatlar'
  | 'siparisler'
  | 'gecmis'

const sekmeDegerleri: TedarikciCalismaSekmesi[] = [
  'genel',
  'urunler',
  'fiyatlar',
  'siparisler',
  'gecmis',
]

export default function TedarikciCalismaPaneli({
  tedarikci,
}: {
  tedarikci: Cari
}) {
  const { access, hasPermission } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sekme, setSekme] = useState<TedarikciCalismaSekmesi>(() => {
    const deger = new URLSearchParams(location.search).get('sekme') as TedarikciCalismaSekmesi | null
    return deger && sekmeDegerleri.includes(deger) ? deger : 'genel'
  })
  const [detay, setDetay] = useState<TedarikciMaliyetDetayi | null>(null)
  const [katalog, setKatalog] = useState<SadeMaliyetYonetimi | null>(null)
  const [urunKatalogu, setUrunKatalogu] = useState<TedarikciStokBaglantiKatalogu | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const yuklemeNo = useRef(0)
  const goruntuleyebilir = hasPermission('costing', 'read')
  const olusturabilir = hasPermission('costing', 'create')
  const guncelleyebilir = hasPermission('costing', 'update')
  const yonetebilir = hasPermission('costing', 'manage')
  const adminYonetebilir = hasPermission('admin', 'manage')
  const aal2 = access?.aal === 'aal2'
  const aktifUrunBaglantilari = useMemo(
    () => urunKatalogu?.baglantilar.filter((baglanti) => baglanti.aktif) ?? [],
    [urunKatalogu?.baglantilar],
  )
  const baglantiVarsayilanlari = useMemo(
    () => Object.fromEntries(aktifUrunBaglantilari.map((baglanti) => [
      baglanti.stok_id,
      { marka: baglanti.marka, vade_gunu: baglanti.varsayilan_vade_gunu },
    ])),
    [aktifUrunBaglantilari],
  )

  const yukle = useCallback(async () => {
    if (!goruntuleyebilir) {
      setYukleniyor(false)
      return
    }
    const buYukleme = ++yuklemeNo.current
    setYukleniyor(true)
    setHata(null)
    try {
      const [detaySonucu, katalogSonucu, urunSonucu] = await Promise.all([
        tedarikciMaliyetDetayiniGetir(tedarikci.id),
        sadeMaliyetYonetiminiGetir(),
        tedarikciStokBaglantilariniGetir(tedarikci.id),
      ])
      if (buYukleme !== yuklemeNo.current) return
      setDetay(detaySonucu)
      setKatalog(katalogSonucu)
      setUrunKatalogu(urunSonucu)
    } catch (error) {
      if (buYukleme !== yuklemeNo.current) return
      setHata(error instanceof Error ? error.message : 'Tedarikçi çalışma alanı yüklenemedi.')
      setDetay(null)
      setKatalog(null)
      setUrunKatalogu(null)
    } finally {
      if (buYukleme === yuklemeNo.current) setYukleniyor(false)
    }
  }, [goruntuleyebilir, tedarikci.id])

  useEffect(() => {
    void yukle()
    return () => { yuklemeNo.current += 1 }
  }, [tedarikci.id, yukle])

  useEffect(() => {
    const deger = new URLSearchParams(location.search).get('sekme') as TedarikciCalismaSekmesi | null
    const gecerli = deger
      && sekmeDegerleri.includes(deger)
    setSekme(gecerli ? deger : 'genel')
    if (!gecerli && deger !== 'genel') {
      const params = new URLSearchParams(location.search)
      params.set('sekme', 'genel')
      navigate(`${location.pathname}?${params.toString()}`, { replace: true })
    }
  }, [location.pathname, location.search, navigate])

  const sekmeyiSec = (yeniSekme: TedarikciCalismaSekmesi) => {
    setSekme(yeniSekme)
    const params = new URLSearchParams(location.search)
    params.set('sekme', yeniSekme)
    navigate(`${location.pathname}?${params.toString()}`, { replace: true })
  }

  if (!goruntuleyebilir) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Bu tedarikçinin ürün ve alış fiyatlarını görmek için maliyet okuma yetkisi gerekir.
      </div>
    )
  }

  const portalModeli = tedarikci.tedarikci_calisma_modeli === 'sisecam_portal'
  const sekmeler = [
    { id: 'genel' as const, etiket: 'Genel Bakış', icon: LayoutDashboard },
    { id: 'urunler' as const, etiket: 'Ürün Bağlantıları', icon: Boxes },
    { id: 'fiyatlar' as const, etiket: 'Alış Fiyatı Gir', icon: CircleDollarSign },
    { id: 'siparisler' as const, etiket: 'Satın Alma / Fatura', icon: ClipboardList },
    { id: 'gecmis' as const, etiket: 'Fiyat Geçmişi', icon: History },
  ]

  return (
    <div className="space-y-4" data-testid="tedarikci-calisma-paneli">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/80 via-white to-white p-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-600">Tedarikçi çalışma alanı</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">Yalnız {tedarikKapsamiOzetMetni(tedarikci.tedarik_kapsamlari)} ürünleri</div>
          <p className="mt-0.5 text-xs text-gray-500">Ürün bağlantıları, fiyatlar ve satın alma kayıtları bu firmaya özel tutulur.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {adminYonetebilir && (
            <button
              type="button"
              onClick={() => navigate('/admin/stok-cari-maliyet')}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
            >
              <ShieldCheck size={14} />
              Kritik yönetime git
            </button>
          )}
          <button type="button" onClick={() => void yukle()} disabled={yukleniyor} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><RefreshCw size={14} className={yukleniyor ? 'animate-spin' : ''} /> Yenile</button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-1" role="tablist" aria-label="Tedarikçi işlemleri">
        {sekmeler.map(({ id, etiket, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={sekme === id} onClick={() => sekmeyiSec(id)} className={`inline-flex whitespace-nowrap items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${sekme === id ? 'bg-white text-violet-700 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}><Icon size={14} />{etiket}</button>
        ))}
      </div>

      {hata && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{hata}</div>}
      {!tedarikci.aktif && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          Bu tedarikçi pasif. Ürün, fiyat ve satın alma geçmişi görüntülenebilir; yeni kayıt oluşturulamaz.
        </div>
      )}
      {!aal2 && (guncelleyebilir || yonetebilir) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>Ürün bağlantısı ekleme, yeniden etkinleştirme ve kritik işlemler için iki adımlı doğrulama gerekir.</span>
          <button type="button" onClick={() => navigate('/mfa', { state: { from: `${location.pathname}${location.search}` } })} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100">Doğrulamayı aç</button>
        </div>
      )}

      {yukleniyor ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-20 text-sm text-gray-500"><Loader2 size={18} className="animate-spin" /> Tedarikçi bilgileri yükleniyor…</div>
      ) : detay && katalog && urunKatalogu ? (
        <>
          {sekme === 'genel' && (
            <GenelBakis
              tedarikci={tedarikci}
              detay={detay}
              urunKatalogu={urunKatalogu}
              onSekmeSec={sekmeyiSec}
            />
          )}
          {sekme === 'urunler' && (
            <TedarikciUrunBaglantilari
              key={`${tedarikci.id}:${tedarikci.tedarik_kapsamlari.join(',')}`}
              tedarikci={tedarikci}
              katalog={urunKatalogu}
              kaydedebilir={guncelleyebilir && aal2}
              pasiflestirebilir={yonetebilir && aal2}
              onDegisti={yukle}
            />
          )}
          {sekme === 'fiyatlar' && (
            <TedarikciFiyatYonetimi
              key={tedarikci.id}
              tedarikci={tedarikci}
              katalog={katalog}
              olusturabilir={olusturabilir && tedarikci.aktif}
              aktiflestirebilir={yonetebilir && aal2 && tedarikci.aktif}
              bagliStokIdleri={aktifUrunBaglantilari.map((baglanti) => baglanti.stok_id)}
              baglantiVarsayilanlari={baglantiVarsayilanlari}
              onUrunlereGit={() => sekmeyiSec('urunler')}
              onDegisti={yukle}
            />
          )}
          {sekme === 'siparisler' && (
            <TedarikciSiparisTakibi
              tedarikciId={tedarikci.id}
              portalModeli={portalModeli}
              olusturabilir={olusturabilir && tedarikci.aktif}
              guncelleyebilir={guncelleyebilir && tedarikci.aktif}
            />
          )}
          {sekme === 'gecmis' && (
            <FiyatGecmisi
              key={`${tedarikci.id}:${tedarikci.tedarik_kapsamlari.join(',')}`}
              tedarikci={tedarikci}
              fiyatlar={detay.fiyatlar}
              urunKatalogu={urunKatalogu}
            />
          )}
        </>
      ) : null}
    </div>
  )
}

function GenelBakis({
  tedarikci,
  detay,
  urunKatalogu,
  onSekmeSec,
}: {
  tedarikci: Cari
  detay: TedarikciMaliyetDetayi
  urunKatalogu: TedarikciStokBaglantiKatalogu
  onSekmeSec: (sekme: TedarikciCalismaSekmesi) => void
}) {
  const portalModeli = tedarikci.tedarikci_calisma_modeli === 'sisecam_portal'
  const aktifBaglantilar = urunKatalogu.baglantilar.filter((baglanti) => baglanti.aktif)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OzetKarti baslik="Bağlı ürün" deger={aktifBaglantilar.length} alt={`${urunKatalogu.ozet.aday_sayisi} kapsam içi ürün bağlanabilir`} icon={<Boxes size={18} />} />
        <OzetKarti baslik="Fiyat kaydı" deger={detay.fiyatlar.length} alt={`${detay.engeller.aktif_stok_fiyati_sayisi} aktif fiyat`} icon={<CircleDollarSign size={18} />} />
        <OzetKarti baslik="Gelecek dönem" deger={detay.engeller.gelecek_fiyat_donemi_sayisi} alt="İleri tarihli fiyat seçimi" icon={<History size={18} />} />
        <OzetKarti baslik="Çalışma modeli" deger={portalModeli ? 'Portal' : 'Manuel'} alt={portalModeli ? 'Sirküler + sipariş/fatura' : 'Ürün bazında fiyat'} icon={<PackageCheck size={18} />} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <HizliIslem baslik="Ürün bağlantıları" aciklama={`Bu firmadan alınan ${tedarikKapsamiOzetMetni(tedarikci.tedarik_kapsamlari)} ürünlerini seçin.`} buton="Ürünleri yönet" onClick={() => onSekmeSec('urunler')} />
        <HizliIslem baslik="Alış fiyatları" aciklama="Bağlı ürün için marka, vade ve geçerlilik bilgisiyle fiyat girin." buton="Fiyat girişi aç" onClick={() => onSekmeSec('fiyatlar')} />
        <HizliIslem baslik="Satın alma ve fatura" aciklama={portalModeli ? 'Portal siparişini, faturayı ve ödeme vadesini birlikte izleyin.' : 'Sipariş, fatura, farklı vade ve ödeme tarihlerini bu tedarikçiye özel izleyin.'} buton="Satın alma takibini aç" onClick={() => onSekmeSec('siparisler')} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Tedarik kapsamı</h3>
        <p className="mt-0.5 text-xs text-gray-500">Kapsam dışındaki stoklar fiyat ve bağlantı seçimlerinde gösterilmez.</p>
        <div className="mt-3 flex flex-wrap gap-2">{tedarikci.tedarik_kapsamlari.map((kapsam) => <span key={kapsam} className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">{tedarikKapsamiEtiketi(kapsam)}</span>)}</div>
      </div>
    </div>
  )
}

function FiyatGecmisi({
  tedarikci,
  fiyatlar,
  urunKatalogu,
}: {
  tedarikci: Cari
  fiyatlar: MaliyetAlisFiyatiTarihceKaydi[]
  urunKatalogu: TedarikciStokBaglantiKatalogu
}) {
  const [kapsam, setKapsam] = useState<TedarikKapsami>(tedarikci.tedarik_kapsamlari[0] ?? 'cam')
  const stokKapsamlari = useMemo(() => new Map([
    ...urunKatalogu.baglantilar.map((baglanti) => [
      baglanti.stok_id,
      stokKategorisininTedarikKapsami(baglanti.kategori, baglanti.hizmet_turu),
    ] as const),
    ...urunKatalogu.adaylar.map((aday) => [
      aday.stok_id,
      stokKategorisininTedarikKapsami(aday.kategori, aday.hizmet_turu),
    ] as const),
  ]), [urunKatalogu.adaylar, urunKatalogu.baglantilar])
  const fiyatKapsami = (fiyat: MaliyetAlisFiyatiTarihceKaydi): TedarikKapsami | null => {
    const katalogKapsami = stokKapsamlari.get(fiyat.stok_id)
    if (katalogKapsami) return katalogKapsami
    if (fiyat.stok_kodu === 'HIZMET-TEMPER-DIS') return 'temper_hizmeti'
    if (fiyat.profil_turu) return stokProfilininTedarikKapsami({
      stok_kodu: fiyat.stok_kodu,
      profil_turu: fiyat.profil_turu,
    })
    return null
  }
  const gorunenler = fiyatlar
    .filter((fiyat) => fiyatKapsami(fiyat) === kapsam)
    .sort((a, b) => b.fiyat_tarihi.localeCompare(a.fiyat_tarihi))
  return (
    <div className="space-y-4" data-testid="tedarikci-fiyat-gecmisi">
      <div>
        <h3 className="text-base font-semibold text-gray-950">Fiyat geçmişi</h3>
        <p className="mt-1 text-sm text-gray-500">Yalnız bu tedarikçiye ve seçili ürün kapsamına ait kayıtlar gösterilir.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Fiyat geçmişi kapsamı">{tedarikci.tedarik_kapsamlari.map((deger) => <button key={deger} type="button" role="tab" aria-selected={kapsam === deger} onClick={() => setKapsam(deger)} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${kapsam === deger ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-gray-200 bg-white text-gray-600'}`}>{tedarikKapsamiEtiketi(deger)} · {fiyatlar.filter((fiyat) => fiyatKapsami(fiyat) === deger).length}</button>)}</div>
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-3">Ürün</th><th className="px-4 py-3">Kaynak / vade</th><th className="px-4 py-3">Tarih</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3 text-right">Birim fiyat</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{gorunenler.map((fiyat) => <tr key={fiyat.fiyat_id}><td className="px-4 py-3"><div className="font-semibold text-gray-900">{fiyat.stok_kodu}</div><div className="mt-0.5 text-xs text-gray-500">{fiyat.stok_adi}</div></td><td className="px-4 py-3 text-gray-600"><div>{fiyat.kaynak_referansi || 'Kaynak belirtilmemiş'}</div><div className="mt-0.5 text-xs text-gray-400">{fiyat.vade_gunu === 0 ? 'Peşin' : `${fiyat.vade_gunu} gün`}</div></td><td className="px-4 py-3 text-gray-600">{ticariTarih(fiyat.fiyat_tarihi)}</td><td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{fiyat.durum.replaceAll('_', ' ')}</span></td><td className="px-4 py-3 text-right font-semibold text-gray-900">{ticariPara(fiyat.birim_fiyat, fiyat.para_birimi)} / {fiyat.fiyat_birimi}</td></tr>)}</tbody>
        </table>
        {gorunenler.length === 0 && <div className="p-10 text-center text-sm text-gray-500">Bu kapsamda fiyat geçmişi yok.</div>}
      </div>
    </div>
  )
}

function OzetKarti({ baslik, deger, alt, icon }: { baslik: string; deger: string | number; alt: string; icon: ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-medium uppercase tracking-wide text-gray-500">{baslik}</div><div className="mt-2 text-xl font-semibold text-gray-950">{deger}</div><div className="mt-1 text-xs text-gray-500">{alt}</div></div><span className="rounded-lg bg-violet-50 p-2 text-violet-700">{icon}</span></div></div>
}

function HizliIslem({ baslik, aciklama, buton, onClick }: { baslik: string; aciklama: string; buton: string; onClick: () => void }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-4"><h3 className="text-sm font-semibold text-gray-900">{baslik}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-gray-500">{aciklama}</p><button type="button" onClick={onClick} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900">{buton}<ChevronRight size={14} /></button></div>
}
