import {
  AlertTriangle,
  CheckCircle2,
  Factory,
  History,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Truck,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  standartTemperUrunuMu,
  temperTedarikciKapsamiUygunMu,
} from '@/lib/temperMaliyet'
import { ticariBugun, ticariPara, ticariTarih } from '@/lib/ticariFormat'
import {
  stokTedarikciFiyatTeklifleriniKaydetV3,
  temperDisHizmetFiyatSecV4,
  temperMaliyetModuKaydetV4,
  temperMaliyetPaneliniGetirV4,
} from '@/services/maliyetService'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type {
  MaliyetTedarikcisi,
  StokMaliyetReceteOzeti,
  TemperIcUretimBileseni,
  TemperIcUretimKalemi,
  TemperMaliyetModu,
  TemperMaliyetPaneli,
} from '@/types/maliyet'

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100'

const IC_URETIM_BILESENLERI: Array<{
  tur: TemperIcUretimBileseni
  etiket: string
  varsayilanBirim: string
}> = [
  { tur: 'amortisman', etiket: 'Makine / amortisman', varsayilanBirim: 'saat' },
  { tur: 'enerji', etiket: 'Enerji', varsayilanBirim: 'kWh' },
  { tur: 'iscilik', etiket: 'İşçilik', varsayilanBirim: 'saat' },
]

type IcUretimFormu = {
  bilesen_turu: TemperIcUretimBileseni
  aciklama: string
  tuketim_birimi: string
  m2_basina_tuketim: string
  birim_maliyet_try: string
}

function varsayilanIcUretimFormu(): IcUretimFormu[] {
  return IC_URETIM_BILESENLERI.map(({ tur, etiket, varsayilanBirim }) => ({
    bilesen_turu: tur,
    aciklama: etiket,
    tuketim_birimi: varsayilanBirim,
    m2_basina_tuketim: '0',
    birim_maliyet_try: '0',
  }))
}

function icUretimFormunaDonustur(
  kalemler: TemperIcUretimKalemi[],
): IcUretimFormu[] {
  const kalemHaritasi = new Map(kalemler.map((kalem) => [kalem.bilesen_turu, kalem]))
  return IC_URETIM_BILESENLERI.map(({ tur, etiket, varsayilanBirim }) => {
    const kalem = kalemHaritasi.get(tur)
    return {
      bilesen_turu: tur,
      aciklama: kalem?.aciklama ?? etiket,
      tuketim_birimi: kalem?.tuketim_birimi ?? varsayilanBirim,
      m2_basina_tuketim: String(kalem?.m2_basina_tuketim ?? 0),
      birim_maliyet_try: String(kalem?.birim_maliyet_try ?? 0),
    }
  })
}

function baslangicZamani(tarih: string) {
  return new Date(`${tarih}T00:00:00+03:00`).toISOString()
}

function fiyatDonemi(
  baslangic: string,
  bitis: string | null,
) {
  return `${ticariTarih(baslangic)} – ${bitis ? ticariTarih(bitis) : 'devam ediyor'}`
}

function fiyatIdleri(value: Record<string, unknown>): string[] {
  return Array.isArray(value.fiyat_ids)
    ? value.fiyat_ids.filter((id): id is string => typeof id === 'string')
    : []
}

function modEtiketi(mod: TemperMaliyetModu | null | undefined) {
  if (mod === 'dis_hizmet') return 'Dış hizmet'
  if (mod === 'ic_uretim') return 'İç üretim'
  return 'Seçilmedi'
}

function kayitMesaji(value: Record<string, unknown>) {
  for (const alan of ['mesaj', 'aciklama', 'hata', 'hata_kodu', 'kod']) {
    if (
      alan !== 'kod'
      && typeof value[alan] === 'string'
      && value[alan]
    ) {
      return value[alan]
    }
  }
  if (Array.isArray(value.detaylar)) {
    const detayMesajlari = value.detaylar
      .map((detay) => {
        if (!detay || typeof detay !== 'object' || Array.isArray(detay)) return null
        const kayit = detay as Record<string, unknown>
        return typeof kayit.mesaj === 'string'
          ? kayit.mesaj
          : typeof kayit.kod === 'string'
            ? kayit.kod.replaceAll('_', ' ').toLocaleLowerCase('tr-TR')
            : null
      })
      .filter((mesaj): mesaj is string => mesaj != null)
    if (detayMesajlari.length > 0) {
      const urun = typeof value.stok_kodu === 'string' ? `${value.stok_kodu}: ` : ''
      return `${urun}${detayMesajlari.join(' · ')}`
    }
  }
  if (typeof value.kod === 'string' && value.kod) {
    return value.kod.replaceAll('_', ' ').toLocaleLowerCase('tr-TR')
  }
  return 'Temper maliyeti için tamamlanması gereken bir kayıt var.'
}

function tedarikciKapsamEtiketi(tedarikci: MaliyetTedarikcisi) {
  const etiketler = (tedarikci.tedarik_kapsamlari ?? []).map((kapsam) => {
    if (kapsam === 'cam') return 'cam'
    if (kapsam === 'cita') return 'çıta'
    if (kapsam === 'yan_malzeme') return 'yan malzeme'
    return 'temper hizmeti'
  })
  return etiketler.length > 0 ? etiketler.join(', ') : 'genel tedarikçi'
}

export default function TemperMaliyetYonetimi({
  tedarikciler,
  urunler,
  fiyatOlusturabilir,
  yonetebilir,
  onDegisti,
}: {
  tedarikciler: MaliyetTedarikcisi[]
  urunler: StokMaliyetReceteOzeti[]
  fiyatOlusturabilir: boolean
  yonetebilir: boolean
  onDegisti: () => Promise<void> | void
}) {
  const [tarih, setTarih] = useState(ticariBugun())
  const [panel, setPanel] = useState<TemperMaliyetPaneli | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [islem, setIslem] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const yuklemeSirasi = useRef(0)
  const icUretimFormuKirli = useRef(false)

  const [mod, setMod] = useState<TemperMaliyetModu>('dis_hizmet')
  const [modBaslangic, setModBaslangic] = useState(ticariBugun())
  const [modGerekce, setModGerekce] = useState(
    'Temper maliyet yöntemi yetkili kullanıcı tarafından güncellendi.',
  )
  const [icUretimKalemleri, setIcUretimKalemleri] = useState<IcUretimFormu[]>(
    varsayilanIcUretimFormu,
  )

  const uygunTedarikciler = useMemo(
    () => tedarikciler.filter((tedarikci) => (
      temperTedarikciKapsamiUygunMu(tedarikci.tedarik_kapsamlari)
    )),
    [tedarikciler],
  )
  const [tedarikciId, setTedarikciId] = useState('')
  const [birimFiyat, setBirimFiyat] = useState('')
  const [marka, setMarka] = useState('')
  const [fiyatTarihi, setFiyatTarihi] = useState(ticariBugun())
  const [kaynakReferansi, setKaynakReferansi] = useState('Temper dış hizmet fiyatı')

  const [seciliFiyatId, setSeciliFiyatId] = useState('')
  const [secimKapsami, setSecimKapsami] = useState<'genel' | 'urun'>('genel')
  const [seciliUrunler, setSeciliUrunler] = useState<Set<string>>(new Set())
  const [urunArama, setUrunArama] = useState('')
  const [secimBaslangic, setSecimBaslangic] = useState(ticariBugun())
  const [secimGerekce, setSecimGerekce] = useState(
    'Temper dış hizmet fiyatı maliyet hesabında kullanılmak üzere seçildi.',
  )

  useEffect(() => {
    setTedarikciId((mevcut) => (
      uygunTedarikciler.some(({ id }) => id === mevcut)
        ? mevcut
        : uygunTedarikciler[0]?.id ?? ''
    ))
  }, [uygunTedarikciler])

  const yukle = useCallback(async () => {
    const istekSirasi = ++yuklemeSirasi.current
    setYukleniyor(true)
    setHata(null)
    try {
      const sonuc = await temperMaliyetPaneliniGetirV4(tarih)
      if (istekSirasi !== yuklemeSirasi.current) return true
      setPanel(sonuc)
      setMod(sonuc.aktif_cozum?.mod ?? 'dis_hizmet')
      if (
        sonuc.aktif_cozum?.mod === 'ic_uretim'
        && sonuc.aktif_cozum.ic_uretim_kalemleri.length > 0
        && !icUretimFormuKirli.current
      ) {
        setIcUretimKalemleri(
          icUretimFormunaDonustur(sonuc.aktif_cozum.ic_uretim_kalemleri),
        )
      }
      setSeciliFiyatId((mevcut) => (
        sonuc.hizmet_stogu?.alternatifler.some(({ fiyat_id }) => fiyat_id === mevcut)
          ? mevcut
          : sonuc.hizmet_stogu?.alternatifler[0]?.fiyat_id ?? ''
      ))
      return true
    } catch (error) {
      if (istekSirasi !== yuklemeSirasi.current) return true
      setPanel(null)
      setHata(error instanceof Error ? error.message : 'Temper maliyet paneli yüklenemedi.')
      return false
    } finally {
      if (istekSirasi === yuklemeSirasi.current) setYukleniyor(false)
    }
  }, [tarih])

  useEffect(() => {
    icUretimFormuKirli.current = false
    void yukle()
    return () => {
      yuklemeSirasi.current += 1
    }
  }, [yukle])

  const kayittanSonraYenile = async () => {
    const [panelSonucu, anaEkranSonucu] = await Promise.allSettled([
      yukle(),
      Promise.resolve().then(() => onDegisti()),
    ])
    const panelYenilendi = panelSonucu.status === 'fulfilled' && panelSonucu.value
    const anaEkranYenilendi = anaEkranSonucu.status === 'fulfilled'
    if (!panelYenilendi || !anaEkranYenilendi) {
      setHata(
        'Kayıt başarıyla tamamlandı; ancak güncel verilerin bir bölümü yenilenemedi. Yenile düğmesini kullanın.',
      )
    }
  }

  const temperUrunler = useMemo(
    () => urunler.filter((urun) => standartTemperUrunuMu(urun.stok_kodu)),
    [urunler],
  )

  const gorunenUrunler = useMemo(() => {
    const terim = urunArama.trim().toLocaleLowerCase('tr-TR')
    return temperUrunler.filter((urun) => (
      !terim
      || `${urun.stok_kodu} ${urun.urun_adi}`.toLocaleLowerCase('tr-TR').includes(terim)
    ))
  }, [temperUrunler, urunArama])

  const icUretimKaleminiGuncelle = (
    index: number,
    degisiklik: Partial<IcUretimFormu>,
  ) => {
    icUretimFormuKirli.current = true
    setIcUretimKalemleri((onceki) => onceki.map(
      (satir, satirIndex) => satirIndex === index
        ? { ...satir, ...degisiklik }
        : satir,
    ))
  }

  const icUretimBirimMaliyeti = icUretimKalemleri.reduce((toplam, kalem) => (
    toplam
    + (Number(kalem.m2_basina_tuketim) || 0) * (Number(kalem.birim_maliyet_try) || 0)
  ), 0)

  const moduKaydet = async (event: React.FormEvent) => {
    event.preventDefault()
    if (
      modGerekce.trim().length < 5
      || !modBaslangic
      || (mod === 'dis_hizmet' && !panel?.hizmet_stogu)
    ) {
      setHata('Başlangıç tarihi, en az 5 karakterlik gerekçe ve dış hizmet modeli için hizmet stoğu zorunludur.')
      return
    }

    const sayisalKalemler = icUretimKalemleri.map((kalem, index) => ({
      sira_no: index + 1,
      bilesen_turu: kalem.bilesen_turu,
      aciklama: kalem.aciklama.trim(),
      tuketim_birimi: kalem.tuketim_birimi.trim(),
      m2_basina_tuketim: Number(kalem.m2_basina_tuketim),
      birim_maliyet_try: Number(kalem.birim_maliyet_try),
    }))
    if (
      mod === 'ic_uretim'
      && (
        sayisalKalemler.some((kalem) => (
          !kalem.aciklama
          || !kalem.tuketim_birimi
          || !Number.isFinite(kalem.m2_basina_tuketim)
          || kalem.m2_basina_tuketim <= 0
          || !Number.isFinite(kalem.birim_maliyet_try)
          || kalem.birim_maliyet_try < 0
        ))
        || !Number.isFinite(icUretimBirimMaliyeti)
      )
    ) {
      setHata('İç üretimde üç bileşenin açıklaması, tüketim birimi, pozitif tüketimi ve sıfırdan küçük olmayan sonlu birim maliyeti zorunludur.')
      return
    }

    setHata(null)
    setBilgi(null)
    setIslem('mod')
    const kaydedilenMod = mod
    try {
      await temperMaliyetModuKaydetV4({
        mod,
        baslangic: modBaslangic,
        gerekce: modGerekce.trim(),
        ...(mod === 'dis_hizmet'
          ? { dis_hizmet_stok_id: panel?.hizmet_stogu?.stok_id }
          : { ic_uretim_kalemleri: sayisalKalemler }),
      }, yeniIdempotencyAnahtari())
      setBilgi(`${modEtiketi(kaydedilenMod)} modeli yeni bir tarihsel sürüm olarak kaydedildi.`)
      icUretimFormuKirli.current = false
      await kayittanSonraYenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Temper maliyet modeli kaydedilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const fiyatiKaydet = async (event: React.FormEvent) => {
    event.preventDefault()
    const fiyat = Number(birimFiyat)
    if (
      !panel?.hizmet_stogu
      || !tedarikciId
      || !Number.isFinite(fiyat)
      || fiyat <= 0
      || !fiyatTarihi
    ) {
      setHata('Tedarikçi, pozitif TL/m² fiyatı ve fiyat tarihi zorunludur.')
      return
    }

    setHata(null)
    setBilgi(null)
    setIslem('fiyat')
    try {
      const sonuc = await stokTedarikciFiyatTeklifleriniKaydetV3({
        tedarikci_id: tedarikciId,
        fiyat_tarihi: baslangicZamani(fiyatTarihi),
        gecerlilik_baslangici: baslangicZamani(fiyatTarihi),
        kaynak_referansi: kaynakReferansi.trim() || 'Temper dış hizmet fiyatı',
        kalemler: [{
          stok_id: panel.hizmet_stogu.stok_id,
          birim_fiyat: fiyat,
          para_birimi: 'TRY',
          fiyat_birimi: 'm2',
          varyant: 'genel',
          vade_gunu: 0,
          marka: marka.trim() || undefined,
        }],
      }, yeniIdempotencyAnahtari())
      const [fiyatId] = fiyatIdleri(sonuc)
      if (fiyatId) setSeciliFiyatId(fiyatId)
      setBirimFiyat('')
      setBilgi('Temper dış hizmet fiyat alternatifi kaydedildi. Kullanılacağı kapsamı aşağıdan seçebilirsiniz.')
      await kayittanSonraYenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Temper dış hizmet fiyatı kaydedilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const fiyatiSec = async (event: React.FormEvent) => {
    event.preventDefault()
    if (
      !seciliFiyatId
      || !secimBaslangic
      || secimGerekce.trim().length < 5
      || (secimKapsami === 'urun' && seciliUrunler.size === 0)
    ) {
      setHata('Fiyat, başlangıç tarihi, en az 5 karakterlik gerekçe ve ürün kapsamı zorunludur.')
      return
    }

    const urunStokIdleri = [...seciliUrunler]
    const kaydedilenKapsam = secimKapsami
    setHata(null)
    setBilgi(null)
    setIslem('secim')
    try {
      await temperDisHizmetFiyatSecV4({
        fiyat_id: seciliFiyatId,
        baslangic: baslangicZamani(secimBaslangic),
        gerekce: secimGerekce.trim(),
        ...(secimKapsami === 'urun' && urunStokIdleri.length === 1
          ? { urun_stok_id: urunStokIdleri[0] }
          : {}),
        ...(secimKapsami === 'urun' && urunStokIdleri.length > 1
          ? { urun_stok_ids: urunStokIdleri }
          : {}),
      }, yeniIdempotencyAnahtari())
      setBilgi(kaydedilenKapsam === 'genel'
        ? 'Genel temper dış hizmet fiyatı etkinleştirildi.'
        : `${urunStokIdleri.length} ürün için özel temper fiyatı etkinleştirildi.`)
      await kayittanSonraYenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Temper dış hizmet fiyatı seçilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const aktifCozum = panel?.aktif_cozum
  const aktifMod = aktifCozum?.mod ?? null
  const alternatifler = panel?.hizmet_stogu?.alternatifler ?? []
  const urunCozumleri = panel?.urun_cozumleri ?? []
  const gecerliUrunCozumleri = urunCozumleri.filter((cozum) => cozum.gecerli)
  const urunBirimMaliyetleri = gecerliUrunCozumleri
    .map((cozum) => cozum.birim_maliyet_try)
    .filter((maliyet): maliyet is number => maliyet != null)
  const enDusukTemperMaliyeti = urunBirimMaliyetleri.length > 0
    ? Math.min(...urunBirimMaliyetleri)
    : null
  const enYuksekTemperMaliyeti = urunBirimMaliyetleri.length > 0
    ? Math.max(...urunBirimMaliyetleri)
    : null
  const urunMaliyetOzeti = enDusukTemperMaliyeti == null || enYuksekTemperMaliyeti == null
    ? 'Hesaplanamadı'
    : enDusukTemperMaliyeti === enYuksekTemperMaliyeti
      ? ticariPara(enDusukTemperMaliyeti, 'TRY')
      : `${ticariPara(enDusukTemperMaliyeti, 'TRY')} – ${ticariPara(enYuksekTemperMaliyeti, 'TRY')}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Temper maliyet yönetimi</h2>
          <p className="mt-1 text-sm text-gray-500">Temper modelini ve hesapta kullanılacak fiyatı yönetin.</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs font-medium text-gray-600">
            Görüntüleme tarihi
            <input
              type="date"
              value={tarih}
              onChange={(event) => setTarih(event.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            disabled={yukleniyor}
            onClick={() => void yukle()}
            className="mb-0.5 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={yukleniyor ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>
      </div>

      {hata && (
        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" /> {hata}
        </div>
      )}
      {bilgi && (
        <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> {bilgi}
        </div>
      )}

      {yukleniyor && !panel ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-12 text-sm text-gray-500">
          <Loader2 size={18} className="animate-spin" /> Temper maliyeti yükleniyor…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="order-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Ozet
              etiket="Aktif model"
              deger={modEtiketi(aktifMod)}
              aciklama="Seçilen tarihte yalnız bu model hesaplanır"
              ton={aktifMod ? 'text-orange-700' : 'text-red-700'}
            />
            <Ozet
              etiket="Ürünlerde 1 m² temper"
              deger={urunMaliyetOzeti}
              aciklama={`${gecerliUrunCozumleri.length}/${urunCozumleri.length} temper reçetesi hazır`}
              ton={panel?.hazir ? 'text-emerald-700' : 'text-red-700'}
            />
            <Ozet
              etiket="Dış hizmet alternatifi"
              deger={String(alternatifler.length)}
              aciklama={panel?.hizmet_stogu
                ? `${panel.hizmet_stogu.stok_kodu} · ${panel.hizmet_stogu.stok_adi}`
                : 'Başlangıç kataloğundan hizmet stoğunu kurun'}
              ton="text-blue-700"
            />
            <Ozet
              etiket="Ürün özel fiyat"
              deger={String(panel?.urun_fiyat_secimleri.filter((secim) => secim.urun_stok_id).length ?? 0)}
              aciklama="Genel fiyatın önüne geçen tarihsel seçimler"
              ton="text-violet-700"
            />
          </div>

          {(panel?.eksikler.length ?? 0) > 0 && (
            <div className="order-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle size={17} /> Tamamlanması gerekenler
              </div>
              <ul className="mt-2 space-y-1 text-xs text-amber-800">
                {panel?.eksikler.map((eksik, index) => (
                  <li key={`${kayitMesaji(eksik)}-${index}`}>• {kayitMesaji(eksik)}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="order-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-4">
              <div>
                <h3 className="font-semibold text-gray-900">Ürün bazlı temper çözümü</h3>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                panel?.hazir
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {panel?.hazir ? 'Tüm temper reçeteleri hazır' : 'Eksik temper reçeteleri var'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="bg-gray-50 text-left font-semibold text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Ürün</th>
                    <th className="px-4 py-3">Model / kaynak</th>
                    <th className="px-4 py-3 text-right">1 m² maliyet</th>
                    <th className="px-4 py-3 text-center">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {urunCozumleri.map((urun) => {
                    const disFiyat = urun.cozum?.dis_hizmet_fiyati
                    return (
                      <tr key={urun.stok_id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{urun.stok_kodu}</div>
                          <div className="mt-0.5 text-gray-500">{urun.stok_adi}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <div className="font-medium text-gray-800">{modEtiketi(urun.mod)}</div>
                          {disFiyat && (
                            <div className="mt-0.5">
                              {disFiyat.tedarikci_adi}
                              {disFiyat.marka ? ` · ${disFiyat.marka}` : ''}
                            </div>
                          )}
                          {urun.mod === 'ic_uretim' && (
                            <div className="mt-0.5">Amortisman + enerji + işçilik</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {urun.birim_maliyet_try == null
                            ? '—'
                            : `${ticariPara(urun.birim_maliyet_try, 'TRY')}/m²`}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {urun.gecerli ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                              Hazır
                            </span>
                          ) : (
                            <div>
                              <span className="rounded-full bg-red-100 px-2 py-1 font-semibold text-red-700">
                                Eksik
                              </span>
                              <div className="mt-1 max-w-72 text-left text-[10px] text-red-600">
                                {urun.hatalar.map(kayitMesaji).join(' · ')}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {urunCozumleri.length === 0 && (
                <div className="p-8 text-center text-xs text-gray-500">
                  Aktif temper işlemi içeren reçete bulunamadı.
                </div>
              )}
            </div>
          </section>

          <form onSubmit={moduKaydet} className="order-3 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-orange-950">Maliyet modelini sürümle</h3>
              </div>
              {aktifMod && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-700 shadow-sm">
                  Şu an: {modEtiketi(aktifMod)}
                </span>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-gray-700">
                Model
                <select
                  value={mod}
                  disabled={!yonetebilir}
                  onChange={(event) => setMod(event.target.value as TemperMaliyetModu)}
                  className={inputClass}
                >
                  <option value="dis_hizmet">Dış hizmet (TL/m²)</option>
                  <option value="ic_uretim">İç üretim</option>
                </select>
              </label>
              <label className="text-xs font-medium text-gray-700">
                Başlangıç
                <input type="date" value={modBaslangic} disabled={!yonetebilir} onChange={(event) => setModBaslangic(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-gray-700">
                Gerekçe
                <input value={modGerekce} disabled={!yonetebilir} onChange={(event) => setModGerekce(event.target.value)} className={inputClass} />
              </label>
            </div>

            {mod === 'ic_uretim' && (
              <div className="mt-4 rounded-lg border border-orange-100 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <Factory size={16} className="text-orange-600" /> İç üretim bileşenleri
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-orange-700">
                    Toplam {ticariPara(icUretimBirimMaliyeti, 'TRY')}/m²
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {icUretimKalemleri.map((kalem, index) => (
                    <div key={kalem.bilesen_turu} className="grid gap-2 rounded-lg bg-gray-50 p-2 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_9rem]">
                      <label className="text-[11px] font-medium text-gray-600">
                        {IC_URETIM_BILESENLERI[index]?.etiket}
                        <input
                          value={kalem.aciklama}
                          disabled={!yonetebilir}
                          onChange={(event) => icUretimKaleminiGuncelle(index, {
                            aciklama: event.target.value,
                          })}
                          className={inputClass}
                        />
                      </label>
                      <label className="text-[11px] font-medium text-gray-600">
                        Tüketim birimi
                        <input
                          value={kalem.tuketim_birimi}
                          disabled={!yonetebilir}
                          onChange={(event) => icUretimKaleminiGuncelle(index, {
                            tuketim_birimi: event.target.value,
                          })}
                          className={inputClass}
                        />
                      </label>
                      <label className="text-[11px] font-medium text-gray-600">
                        m² başına tüketim
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={kalem.m2_basina_tuketim}
                          disabled={!yonetebilir}
                          onChange={(event) => icUretimKaleminiGuncelle(index, {
                            m2_basina_tuketim: event.target.value,
                          })}
                          className={inputClass}
                        />
                      </label>
                      <label className="text-[11px] font-medium text-gray-600">
                        Birim maliyet (TL)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={kalem.birim_maliyet_try}
                          disabled={!yonetebilir}
                          onChange={(event) => icUretimKaleminiGuncelle(index, {
                            birim_maliyet_try: event.target.value,
                          })}
                          className={inputClass}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {yonetebilir && (
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={islem != null || (mod === 'dis_hizmet' && !panel?.hizmet_stogu)}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {islem === 'mod' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Model sürümünü kaydet
                </button>
              </div>
            )}
          </form>

          <div className="order-4 grid gap-4 xl:grid-cols-2">
            <form onSubmit={fiyatiKaydet} className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">
              <div className="flex items-start gap-2">
                <span className="rounded-lg bg-blue-100 p-2 text-blue-700"><Truck size={17} /></span>
                <div>
                  <h3 className="font-semibold text-blue-950">Dış hizmet fiyatı ekle</h3>
                  <p className="mt-0.5 text-xs text-blue-700">Yeni fiyatı kaydedin; hesapta kullanılacağı kapsamı yan panelden seçin.</p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-gray-700">
                  Tedarikçi
                  <select value={tedarikciId} disabled={!fiyatOlusturabilir} onChange={(event) => setTedarikciId(event.target.value)} className={inputClass}>
                    <option value="">Tedarikçi seçin</option>
                    {uygunTedarikciler.map((tedarikci) => (
                      <option key={tedarikci.id} value={tedarikci.id}>
                        {tedarikci.ad} · {tedarikciKapsamEtiketi(tedarikci)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-700">
                  Fiyat (TL/m²)
                  <input type="number" min="0.01" step="0.01" value={birimFiyat} disabled={!fiyatOlusturabilir} onChange={(event) => setBirimFiyat(event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-medium text-gray-700">
                  Marka / hizmet adı
                  <input value={marka} disabled={!fiyatOlusturabilir} onChange={(event) => setMarka(event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-medium text-gray-700">
                  Fiyat tarihi
                  <input type="date" value={fiyatTarihi} disabled={!fiyatOlusturabilir} onChange={(event) => setFiyatTarihi(event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-medium text-gray-700">
                  Kaynak / açıklama
                  <input value={kaynakReferansi} disabled={!fiyatOlusturabilir} onChange={(event) => setKaynakReferansi(event.target.value)} className={inputClass} />
                </label>
              </div>
              {fiyatOlusturabilir && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={islem != null || !panel?.hizmet_stogu || !tedarikciId}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {islem === 'fiyat' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Fiyat alternatifini kaydet
                  </button>
                </div>
              )}
            </form>

            <form onSubmit={fiyatiSec} className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
              <h3 className="font-semibold text-violet-950">Hesapta kullanılacak fiyatı seç</h3>
              <label className="mt-3 block text-xs font-medium text-gray-700">
                Fiyat alternatifi
                <select value={seciliFiyatId} disabled={!yonetebilir} onChange={(event) => setSeciliFiyatId(event.target.value)} className={inputClass}>
                  <option value="">Fiyat seçin</option>
                  {alternatifler.map((fiyat) => (
                    <option key={fiyat.fiyat_id} value={fiyat.fiyat_id}>
                      {fiyat.tedarikci_adi}
                      {fiyat.marka ? ` · ${fiyat.marka}` : ' · markasız'}
                      {' · '}
                      {ticariPara(fiyat.birim_fiyat, fiyat.para_birimi)}/{fiyat.fiyat_birimi}
                      {' · '}
                      {fiyatDonemi(fiyat.gecerlilik_baslangici, fiyat.gecerlilik_bitisi)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!yonetebilir}
                  onClick={() => setSecimKapsami('genel')}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                    secimKapsami === 'genel'
                      ? 'border-violet-500 bg-violet-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  Genel varsayılan
                </button>
                <button
                  type="button"
                  disabled={!yonetebilir}
                  onClick={() => setSecimKapsami('urun')}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                    secimKapsami === 'urun'
                      ? 'border-violet-500 bg-violet-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  Ürün özel
                </button>
              </div>

              {secimKapsami === 'urun' && (
                <div className="mt-3 rounded-lg border border-violet-100 bg-white">
                  <label className="relative block">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      value={urunArama}
                      onChange={(event) => setUrunArama(event.target.value)}
                      placeholder="Ürün kodu veya adı ara…"
                      className="w-full rounded-t-lg border-b border-gray-100 py-2 pl-9 pr-3 text-xs outline-none"
                    />
                  </label>
                  <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-[11px]">
                    <span>{seciliUrunler.size} ürün seçili</span>
                    <span className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setSeciliUrunler((onceki) => new Set([
                          ...onceki,
                          ...gorunenUrunler.map((urun) => urun.urun_stok_id),
                        ]))}
                        className="font-semibold text-violet-700"
                      >
                        Görünenleri seç
                      </button>
                      <button type="button" onClick={() => setSeciliUrunler(new Set())} className="font-semibold text-gray-500">
                        Temizle
                      </button>
                    </span>
                  </div>
                  <div className="max-h-36 divide-y divide-gray-50 overflow-y-auto">
                    {gorunenUrunler.map((urun) => (
                      <label key={urun.urun_stok_id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-violet-50">
                        <input
                          type="checkbox"
                          checked={seciliUrunler.has(urun.urun_stok_id)}
                          onChange={() => setSeciliUrunler((onceki) => {
                            const yeni = new Set(onceki)
                            if (yeni.has(urun.urun_stok_id)) yeni.delete(urun.urun_stok_id)
                            else yeni.add(urun.urun_stok_id)
                            return yeni
                          })}
                        />
                        <span className="font-semibold text-gray-800">{urun.stok_kodu}</span>
                        <span className="truncate text-gray-500">{urun.urun_adi}</span>
                      </label>
                    ))}
                    {gorunenUrunler.length === 0 && (
                      <div className="p-4 text-center text-xs text-gray-500">Ürün bulunamadı.</div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3">
                <label className="text-xs font-medium text-gray-700">
                  Başlangıç
                  <input type="date" value={secimBaslangic} disabled={!yonetebilir} onChange={(event) => setSecimBaslangic(event.target.value)} className={inputClass} />
                </label>
              </div>
              <label className="mt-3 block text-xs font-medium text-gray-700">
                Gerekçe
                <input value={secimGerekce} disabled={!yonetebilir} onChange={(event) => setSecimGerekce(event.target.value)} className={inputClass} />
              </label>
              {aktifMod !== 'dis_hizmet' && (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  Fiyat seçmeden önce dış hizmet modelini etkinleştirin.
                </p>
              )}
              {yonetebilir && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={islem != null || !seciliFiyatId || aktifMod !== 'dis_hizmet'}
                    className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {islem === 'secim' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    {secimKapsami === 'genel' ? 'Genel fiyatı etkinleştir' : 'Seçili ürünlere uygula'}
                  </button>
                </div>
              )}
            </form>
          </div>

          <section className="order-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center gap-2 border-b border-gray-100 p-4">
              <History size={17} className="text-gray-500" />
              <div>
                <h3 className="font-semibold text-gray-900">Temper maliyet tarihçesi</h3>
              </div>
            </div>
            <div className="grid divide-y divide-gray-100 xl:grid-cols-2 xl:divide-x xl:divide-y-0">
              <div className="p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Model sürümleri</h4>
                <div className="mt-2 space-y-2">
                  {(panel?.mod_surumleri ?? []).map((surum) => (
                    <div key={surum.mod_surumu_id} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-gray-900">
                          Sürüm {surum.revision_no} · {modEtiketi(surum.mod)}
                        </span>
                        <span className="text-gray-500">
                          {ticariTarih(surum.gecerlilik_baslangici)}
                          {' – '}
                          {surum.gecerlilik_bitisi ? ticariTarih(surum.gecerlilik_bitisi) : 'Devam ediyor'}
                        </span>
                      </div>
                      <p className="mt-1 text-gray-500">{surum.gerekce || 'Gerekçe girilmedi.'}</p>
                      {surum.mod === 'ic_uretim' && (
                        <div className="mt-2 space-y-1 rounded-md bg-white p-2 text-[11px] text-gray-600">
                          {surum.ic_uretim_kalemleri.map((kalem) => (
                            <div
                              key={`${surum.mod_surumu_id}-${kalem.bilesen_turu}`}
                              className="flex items-start justify-between gap-3"
                            >
                              <span>
                                {kalem.aciklama} · {kalem.m2_basina_tuketim}{' '}
                                {kalem.tuketim_birimi}/m² ×{' '}
                                {ticariPara(kalem.birim_maliyet_try, 'TRY')}
                              </span>
                              <span className="shrink-0 font-semibold text-orange-700">
                                {ticariPara(
                                  kalem.m2_basina_tuketim * kalem.birim_maliyet_try,
                                  'TRY',
                                )}/m²
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t border-gray-100 pt-1 font-semibold text-gray-900">
                            <span>Toplam iç üretim</span>
                            <span>
                              {ticariPara(
                                surum.ic_uretim_kalemleri.reduce(
                                  (toplam, kalem) => toplam
                                    + kalem.m2_basina_tuketim * kalem.birim_maliyet_try,
                                  0,
                                ),
                                'TRY',
                              )}/m²
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {(panel?.mod_surumleri.length ?? 0) === 0 && (
                    <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">Henüz temper maliyet modeli seçilmedi.</p>
                  )}
                </div>
              </div>
              <div className="p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fiyat seçimleri</h4>
                <div className="mt-2 space-y-2">
                  {(panel?.urun_fiyat_secimleri ?? []).map((secim) => (
                    <div key={secim.secim_id} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-gray-900">
                          {secim.urun_stok_kodu ?? 'Genel varsayılan'} · {secim.tedarikci_adi}
                        </span>
                        <span className="font-semibold text-violet-700">
                          {ticariPara(secim.birim_fiyat, secim.para_birimi)}/{secim.fiyat_birimi}
                        </span>
                      </div>
                      <p className="mt-1 text-gray-500">
                        {ticariTarih(secim.gecerlilik_baslangici)}
                        {' – '}
                        {secim.gecerlilik_bitisi ? ticariTarih(secim.gecerlilik_bitisi) : 'Devam ediyor'}
                        {' · '}
                        {secim.marka || 'markasız'} · {secim.gerekce}
                      </p>
                    </div>
                  ))}
                  {(panel?.urun_fiyat_secimleri.length ?? 0) === 0 && (
                    <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">Henüz aktif dış hizmet fiyat seçimi yok.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Ozet({
  etiket,
  deger,
  aciklama,
  ton,
}: {
  etiket: string
  deger: string
  aciklama: string
  ton: string
}) {
  return (
    <div className="flex min-h-28 flex-col rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-500">{etiket}</div>
      <div className={`mt-2 text-lg font-bold ${ton}`}>{deger}</div>
      <div className="mt-auto pt-1 text-[11px] text-gray-400">{aciklama}</div>
    </div>
  )
}
