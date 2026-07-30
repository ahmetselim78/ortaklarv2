import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  Save,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SISECAM_PDF_MANUEL_FIYAT_STOKLARI,
  sisecamFiyatListesiniCozumle,
  sisecamPdfMetniniOku,
  sisecamSatirlariniStoklarlaEslestir,
  sisecamVadeFiyati,
  type SisecamFiyatListesi,
  type SisecamFiyatSatiri,
} from '@/lib/sisecamFiyatListesi'
import { stokTeklifFiyatBiriminiCoz } from '@/lib/stokTeklifFiyatBirimi'
import {
  stokProfilininTedarikKapsami,
  tedarikKapsamiEtiketi,
  tedarikciStokKapsaminaUyar,
} from '@/lib/tedarikKapsami'
import { ticariBugun } from '@/lib/ticariFormat'
import {
  stokMaliyetStokOverrideUygulaV3,
  stokMaliyetTopluPolitikaUygulaV3,
  stokTedarikciFiyatTeklifleriniKaydetV3,
} from '@/services/maliyetService'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type { Cari, TedarikKapsami } from '@/types/cari'
import type {
  SadeMaliyetYonetimi,
  StokMaliyetFiyatVaryanti,
  StokMaliyetKapsami,
  StokTedarikciFiyatTeklifiKalemi,
} from '@/types/maliyet'

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

type FiyatlanabilirStok = {
  stok_id: string
  stok_kodu: string
  stok_adi: string
  profil_turu: 'cam' | 'cita' | 'sarf'
  birim: string
  fiyat_birimi: string
}

function kapsamProfili(profil: FiyatlanabilirStok): TedarikKapsami {
  return stokProfilininTedarikKapsami(profil)
}

function baslangicZamani(tarih: string) {
  return new Date(`${tarih}T00:00:00+03:00`).toISOString()
}

function fiyatIdleri(value: Record<string, unknown>): string[] {
  return Array.isArray(value.fiyat_ids)
    ? value.fiyat_ids.filter((id): id is string => typeof id === 'string')
    : []
}

function pdfVaryanti(satir: SisecamFiyatSatiri): StokMaliyetFiyatVaryanti {
  if (satir.ebatVaryanti === 'ME' || satir.ebatVaryanti === 'ME_K4') return 'me'
  if (satir.ebatVaryanti === 'JU') return 'ju'
  return 'genel'
}

function para(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export default function TedarikciFiyatYonetimi({
  tedarikci,
  katalog,
  olusturabilir,
  aktiflestirebilir,
  bagliStokIdleri,
  baglantiVarsayilanlari,
  onUrunlereGit,
  onDegisti,
}: {
  tedarikci: Cari
  katalog: SadeMaliyetYonetimi
  olusturabilir: boolean
  aktiflestirebilir: boolean
  bagliStokIdleri?: string[]
  baglantiVarsayilanlari?: Record<string, { marka: string | null; vade_gunu: number }>
  onUrunlereGit?: () => void
  onDegisti: () => Promise<void> | void
}) {
  const kapsamdakiTumProfiller = useMemo(() => {
    const profilliStoklar = new Set(katalog.profiller.map((profil) => profil.stok_id))
    const adaylar: FiyatlanabilirStok[] = katalog.adayStoklar
      .filter((aday) => !profilliStoklar.has(aday.id))
      .map((aday) => ({
        stok_id: aday.id,
        stok_kodu: aday.kod,
        stok_adi: aday.ad,
        profil_turu: aday.kategori === 'yan_malzeme' ? 'sarf' : aday.kategori,
        birim: aday.birim,
        fiyat_birimi: aday.birim,
      }))
    return ([...katalog.profiller, ...adaylar] as FiyatlanabilirStok[])
      .filter((profil) => tedarikciStokKapsaminaUyar(
        tedarikci.tedarik_kapsamlari,
        profil,
      ))
      .sort((a, b) => a.stok_kodu.localeCompare(b.stok_kodu, 'tr-TR'))
  }, [katalog.adayStoklar, katalog.profiller, tedarikci.tedarik_kapsamlari])
  const profiller = useMemo(() => {
    if (bagliStokIdleri == null) return kapsamdakiTumProfiller
    const bagliIdler = new Set(bagliStokIdleri)
    return kapsamdakiTumProfiller.filter((profil) => bagliIdler.has(profil.stok_id))
  }, [bagliStokIdleri, kapsamdakiTumProfiller])
  const camProfilleri = useMemo(
    () => profiller.filter((profil) => kapsamProfili(profil) === 'cam'),
    [profiller],
  )
  const ilkKapsam = tedarikci.tedarik_kapsamlari[0] ?? 'cam'
  const [kapsam, setKapsam] = useState<TedarikKapsami>(ilkKapsam)
  const kapsamdakiProfiller = useMemo(
    () => profiller.filter((profil) => kapsamProfili(profil) === kapsam),
    [kapsam, profiller],
  )
  const [stokId, setStokId] = useState('')
  const [girisModu, setGirisModu] = useState<'tek' | 'toplu'>('tek')
  const [fiyat, setFiyat] = useState('')
  const [topluFiyatlar, setTopluFiyatlar] = useState<Record<string, string>>({})
  const [vadeGunu, setVadeGunu] = useState('0')
  const [varyant, setVaryant] = useState<StokMaliyetFiyatVaryanti>('genel')
  const [marka, setMarka] = useState('')
  const [baslangic, setBaslangic] = useState(ticariBugun())
  const [kaynakReferansi, setKaynakReferansi] = useState('Tedarikçiden alınan güncel fiyat')
  const [tekFiyatiAktifEt, setTekFiyatiAktifEt] = useState(aktiflestirebilir)
  const [pdf, setPdf] = useState<SisecamFiyatListesi | null>(null)
  const [pdfDosyaAdi, setPdfDosyaAdi] = useState('')
  const [pdfSeciliStoklar, setPdfSeciliStoklar] = useState<Set<string>>(new Set())
  const [pdfVade, setPdfVade] = useState('60')
  const [pdfAktifVaryant, setPdfAktifVaryant] = useState<StokMaliyetFiyatVaryanti>('me')
  const [pdfFiyatlariAktifEt, setPdfFiyatlariAktifEt] = useState(aktiflestirebilir)
  const [islem, setIslem] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const dosyaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setKapsam((mevcut) => (
      tedarikci.tedarik_kapsamlari.includes(mevcut)
        ? mevcut
        : tedarikci.tedarik_kapsamlari[0] ?? 'cam'
    ))
    setStokId('')
    setTopluFiyatlar({})
  }, [tedarikci.id, tedarikci.tedarik_kapsamlari])

  useEffect(() => {
    setStokId((mevcut) => (
      kapsamdakiProfiller.some((profil) => profil.stok_id === mevcut)
        ? mevcut
        : kapsamdakiProfiller[0]?.stok_id ?? ''
    ))
    if (kapsam !== 'cam') setVaryant('genel')
    setTopluFiyatlar({})
  }, [kapsam, kapsamdakiProfiller])

  useEffect(() => {
    const varsayilan = baglantiVarsayilanlari?.[stokId]
    if (!varsayilan) return
    setMarka(varsayilan.marka ?? '')
    setVadeGunu(String(varsayilan.vade_gunu))
  }, [baglantiVarsayilanlari, stokId])

  const pdfEslesmeleri = useMemo(
    () => pdf
      ? sisecamSatirlariniStoklarlaEslestir(
        pdf.satirlar,
        camProfilleri.map((profil) => ({
          id: profil.stok_id,
          kod: profil.stok_kodu,
          ad: profil.stok_adi,
        })),
      )
      : [],
    [camProfilleri, pdf],
  )

  const pdfOku = async (file: File) => {
    setHata(null)
    setBilgi(null)
    setIslem('pdf-oku')
    try {
      const sonuc = sisecamFiyatListesiniCozumle(await sisecamPdfMetniniOku(file))
      if (sonuc.satirlar.length === 0) {
        throw new Error('PDF içinde Şişecam fiyat satırı bulunamadı. Dosyanın sabit fiyat listesi şablonunda olduğunu kontrol edin.')
      }
      setPdf(sonuc)
      setPdfDosyaAdi(file.name)
      const eslesmeler = sisecamSatirlariniStoklarlaEslestir(
        sonuc.satirlar,
        camProfilleri.map((profil) => ({
          id: profil.stok_id,
          kod: profil.stok_kodu,
          ad: profil.stok_adi,
        })),
      )
      setPdfSeciliStoklar(new Set(
        eslesmeler
          .filter((eslesme) => eslesme.satir != null)
          .map((eslesme) => eslesme.stok.id),
      ))
    } catch (error) {
      setPdf(null)
      setHata(error instanceof Error ? error.message : 'Şişecam PDF dosyası okunamadı.')
    } finally {
      setIslem(null)
    }
  }

  const pdfKalemleri = () => {
    const kalemler = new Map<string, StokTedarikciFiyatTeklifiKalemi>()
    const vadeler = [
      { gun: 0, alan: 'pesin' as const },
      { gun: 60, alan: '60_gun' as const },
      { gun: 75, alan: '75_gun' as const },
    ]
    for (const eslesme of pdfEslesmeleri) {
      if (!pdfSeciliStoklar.has(eslesme.stok.id)) continue
      for (const satir of eslesme.adaylar) {
        const satirVaryanti = pdfVaryanti(satir)
        for (const vadeSecenegi of vadeler) {
          const anahtar = `${eslesme.stok.id}:${satirVaryanti}:${vadeSecenegi.gun}`
          if (kalemler.has(anahtar)) continue
          kalemler.set(anahtar, {
            stok_id: eslesme.stok.id,
            birim_fiyat: sisecamVadeFiyati(satir, vadeSecenegi.alan),
            para_birimi: 'TRY',
            fiyat_birimi: 'm2',
            varyant: satirVaryanti,
            vade_gunu: vadeSecenegi.gun,
            marka: 'Şişecam',
          })
        }
      }
    }
    return [...kalemler.values()]
  }

  const degisiklikSonrasiYenile = async () => {
    try {
      await onDegisti()
      return true
    } catch (error) {
      const mesaj = error instanceof Error ? error.message : 'Bilinmeyen yenileme hatası.'
      setHata(`Kayıt tamamlandı ancak ekran yenilenemedi. Yenile düğmesini kullanın. ${mesaj}`)
      return false
    }
  }

  const pdfKaydet = async () => {
    if (!pdf) return
    const kalemler = pdfKalemleri()
    if (kalemler.length === 0) {
      setHata('Aktarılacak en az bir eşleşmiş cam stoğu seçin.')
      return
    }
    setHata(null)
    setBilgi(null)
    setIslem('pdf-kaydet')
    try {
      const tarih = pdf.revizyonTarihi ?? ticariBugun()
      await stokTedarikciFiyatTeklifleriniKaydetV3({
        tedarikci_id: tedarikci.id,
        fiyat_tarihi: baslangicZamani(tarih),
        gecerlilik_baslangici: baslangicZamani(tarih),
        kaynak_referansi: [
          pdfDosyaAdi,
          pdf.sirkulerNo ? `Şişecam sirküler no ${pdf.sirkulerNo}` : null,
        ].filter(Boolean).join(' · '),
        kalemler,
      }, yeniIdempotencyAnahtari())

      let secimBilgisi = ''
      if (pdfFiyatlariAktifEt && aktiflestirebilir) {
        try {
          const politika = await stokMaliyetTopluPolitikaUygulaV3({
            kapsam: 'cam',
            tedarikci_id: tedarikci.id,
            varyant: pdfAktifVaryant,
            vade_gunu: Number(pdfVade),
            stok_ids: [...pdfSeciliStoklar],
            genel_fallback: true,
            baslangic: baslangicZamani(tarih),
            gerekce: `${pdfDosyaAdi} listesindeki seçili Şişecam fiyatları aktifleştirildi.`,
          }, yeniIdempotencyAnahtari())
          const eksikSayisi = Array.isArray(politika.eksikler) ? politika.eksikler.length : 0
          secimBilgisi = eksikSayisi > 0
            ? ` ${eksikSayisi} stokta seçilen varyant/vade bulunamadı; kaynak panelinde gösteriliyor.`
            : ' Seçilen vade ve varyant aktif maliyet kaynağı yapıldı.'
        } catch (error) {
          const mesaj = error instanceof Error ? error.message : 'Aktif kaynak seçilemedi.'
          setBilgi(`${kalemler.length} Şişecam fiyat seçeneği kaydedildi.`)
          setHata(`Fiyatlar kaydedildi; ancak aktif maliyet kaynağı seçilemedi. Tekrar fiyat aktarmayın. ${mesaj}`)
          await degisiklikSonrasiYenile()
          return
        }
      }
      setBilgi(`${kalemler.length} Şişecam fiyat seçeneği kaydedildi.${secimBilgisi}`)
      await degisiklikSonrasiYenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Şişecam fiyat listesi kaydedilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const tekFiyatKaydet = async (event: React.FormEvent) => {
    event.preventDefault()
    const profil = profiller.find((aday) => aday.stok_id === stokId)
    const fiyatDegeri = Number(fiyat)
    const vadeDegeri = Number(vadeGunu)
    if (
      !profil
      || !Number.isFinite(fiyatDegeri)
      || fiyatDegeri <= 0
      || !Number.isInteger(vadeDegeri)
      || vadeDegeri < 0
      || vadeDegeri > 3650
    ) {
      setHata('Stok, pozitif fiyat ve 0–3650 arasında tam sayı vade günü zorunludur.')
      return
    }
    setHata(null)
    setBilgi(null)
    setIslem('tek-kaydet')
    try {
      const sonuc = await stokTedarikciFiyatTeklifleriniKaydetV3({
        tedarikci_id: tedarikci.id,
        fiyat_tarihi: baslangicZamani(baslangic),
        gecerlilik_baslangici: baslangicZamani(baslangic),
        kaynak_referansi: kaynakReferansi.trim() || undefined,
        kalemler: [{
          stok_id: profil.stok_id,
          birim_fiyat: fiyatDegeri,
          para_birimi: 'TRY',
          fiyat_birimi: stokTeklifFiyatBiriminiCoz(profil),
          varyant: profil.profil_turu === 'cam' ? varyant : 'genel',
          vade_gunu: vadeDegeri,
          marka: marka.trim() || undefined,
        }],
      }, yeniIdempotencyAnahtari())
      const [fiyatId] = fiyatIdleri(sonuc)
      if (tekFiyatiAktifEt && aktiflestirebilir) {
        try {
          if (!fiyatId) throw new Error('Etkinleştirilecek fiyat kimliği dönmedi.')
          await stokMaliyetStokOverrideUygulaV3({
            stok_id: profil.stok_id,
            fiyat_id: fiyatId,
            baslangic: baslangicZamani(baslangic),
            gerekce: kaynakReferansi.trim() || 'Stok bazında tedarikçi fiyatı seçildi.',
          }, yeniIdempotencyAnahtari())
        } catch (error) {
          const mesaj = error instanceof Error ? error.message : 'Aktif kaynak seçilemedi.'
          setFiyat('')
          setBilgi('Fiyat alternatifi kaydedildi.')
          setHata(`Fiyat kaydedildi; ancak aktif maliyet kaynağı seçilemedi. Tekrar fiyat girmeyin. ${mesaj}`)
          await degisiklikSonrasiYenile()
          return
        }
      }
      setFiyat('')
      setBilgi(tekFiyatiAktifEt && aktiflestirebilir
        ? 'Fiyat kaydedildi ve yalnız bu stok için aktif kaynak yapıldı.'
        : 'Fiyat alternatifi kaydedildi. Aktif kaynak seçimi maliyet panelinden yapılabilir.')
      await degisiklikSonrasiYenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Tedarikçi fiyatı kaydedilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const topluFiyatKaydet = async (event: React.FormEvent) => {
    event.preventDefault()
    if (kapsam === 'temper_hizmeti') return
    const vadeDegeri = Number(vadeGunu)
    const girilenProfiller = kapsamdakiProfiller.filter(
      (profil) => (topluFiyatlar[profil.stok_id] ?? '').trim() !== '',
    )
    const gecersizFiyat = girilenProfiller.some((profil) => {
      const deger = Number(topluFiyatlar[profil.stok_id])
      return !Number.isFinite(deger) || deger <= 0
    })
    if (
      girilenProfiller.length === 0
      || gecersizFiyat
      || !Number.isInteger(vadeDegeri)
      || vadeDegeri < 0
      || vadeDegeri > 3650
    ) {
      setHata('En az bir ürüne pozitif fiyat ve 0–3650 arasında tam sayı vade günü girin.')
      return
    }

    const kalemler: StokTedarikciFiyatTeklifiKalemi[] = girilenProfiller.map((profil) => ({
      stok_id: profil.stok_id,
      birim_fiyat: Number(topluFiyatlar[profil.stok_id]),
      para_birimi: 'TRY',
      fiyat_birimi: stokTeklifFiyatBiriminiCoz(profil),
      varyant: profil.profil_turu === 'cam' ? varyant : 'genel',
      vade_gunu: vadeDegeri,
      marka: marka.trim()
        || baglantiVarsayilanlari?.[profil.stok_id]?.marka
        || undefined,
    }))

    setHata(null)
    setBilgi(null)
    setIslem('toplu-kaydet')
    try {
      let aktivasyonEksigi = 0
      await stokTedarikciFiyatTeklifleriniKaydetV3({
        tedarikci_id: tedarikci.id,
        fiyat_tarihi: baslangicZamani(baslangic),
        gecerlilik_baslangici: baslangicZamani(baslangic),
        kaynak_referansi: kaynakReferansi.trim() || undefined,
        kalemler,
      }, yeniIdempotencyAnahtari())

      if (tekFiyatiAktifEt && aktiflestirebilir) {
        try {
          const politika = await stokMaliyetTopluPolitikaUygulaV3({
            kapsam: kapsam as StokMaliyetKapsami,
            tedarikci_id: tedarikci.id,
            varyant: kapsam === 'cam' ? varyant : 'genel',
            vade_gunu: vadeDegeri,
            stok_ids: girilenProfiller.map((profil) => profil.stok_id),
            genel_fallback: true,
            baslangic: baslangicZamani(baslangic),
            gerekce: kaynakReferansi.trim() || 'Toplu tedarikçi fiyatları aktif kaynak seçildi.',
          }, yeniIdempotencyAnahtari())
          aktivasyonEksigi = Array.isArray(politika.eksikler) ? politika.eksikler.length : 0
          if (aktivasyonEksigi > 0) {
            setHata(`${kalemler.length} fiyat kaydedildi; ${aktivasyonEksigi} üründe seçilen vade/varyant aktif kaynak yapılamadı.`)
          }
        } catch (error) {
          const mesaj = error instanceof Error ? error.message : 'Aktif kaynak seçilemedi.'
          setBilgi(`${kalemler.length} alış fiyatı kaydedildi.`)
          setHata(`Fiyatlar kaydedildi; ancak aktif maliyet kaynakları seçilemedi. Tekrar fiyat girmeyin. ${mesaj}`)
          setTopluFiyatlar({})
          await degisiklikSonrasiYenile()
          return
        }
      }

      setTopluFiyatlar({})
      setBilgi(tekFiyatiAktifEt && aktiflestirebilir
        ? aktivasyonEksigi > 0
          ? `${kalemler.length} alış fiyatı kaydedildi; eşleşen ürünler aktif kaynak yapıldı.`
          : `${kalemler.length} alış fiyatı kaydedildi ve topluca aktif kaynak yapıldı.`
        : `${kalemler.length} alış fiyatı kaydedildi.`)
      await degisiklikSonrasiYenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Toplu tedarikçi fiyatları kaydedilemedi.')
    } finally {
      setIslem(null)
    }
  }

  return (
    <div className="space-y-4">
      {hata && (
        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          {hata}
        </div>
      )}
      {bilgi && (
        <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          {bilgi}
        </div>
      )}

      {tedarikci.tedarikci_calisma_modeli === 'sisecam_portal'
        && tedarikci.tedarik_kapsamlari.includes('cam') && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">Şişecam fiyat listesini aktar</h3>
              <p className="mt-1 text-xs text-gray-600">
                Sabit PDF şablonundaki Peşin, 60 ve 75 gün fiyatları ile ME/JU seçenekleri ayrı ayrı saklanır.
              </p>
            </div>
            <input
              ref={dosyaRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void pdfOku(file)
                event.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={!olusturabilir || islem != null || camProfilleri.length === 0}
              onClick={() => dosyaRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {islem === 'pdf-oku'
                ? <Loader2 size={14} className="animate-spin" />
                : <FileUp size={14} />}
              PDF seç
            </button>
          </div>

          {camProfilleri.length === 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <p>PDF aktarımı için önce Şişecam’dan aldığınız camları Ürün Bağlantıları sekmesinde bağlayın.</p>
              {onUrunlereGit && (
                <button type="button" onClick={onUrunlereGit} className="mt-2 font-semibold underline underline-offset-2">
                  Ürün bağlantılarına git
                </button>
              )}
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <p>
              <span className="font-semibold">PDF dışında elle fiyatlanacak camlar: </span>
              {SISECAM_PDF_MANUEL_FIYAT_STOKLARI
                .map(({ kod, ad }) => `${kod} ${ad}`)
                .join(' ve ')}
              {' '}Şişecam PDF satırlarıyla otomatik eşleştirilmez. Bu ürünlerin fiyatını
              aşağıdaki manuel alış fiyatı bölümünden girin.
            </p>
          </div>

          {pdf && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 text-xs sm:grid-cols-4">
                <Ozet etiket="Dosya" deger={pdfDosyaAdi} />
                <Ozet etiket="Revizyon" deger={pdf.revizyonTarihi ?? 'Bulunamadı'} />
                <Ozet etiket="Sirküler" deger={pdf.sirkulerNo ?? 'Bulunamadı'} />
                <Ozet etiket="Okunan satır" deger={String(pdf.satirlar.length)} />
              </div>
              <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 bg-white px-3">
                {pdfEslesmeleri.map((eslesme) => (
                  <label
                    key={eslesme.stok.id}
                    className="flex cursor-pointer items-start gap-3 py-2.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={pdfSeciliStoklar.has(eslesme.stok.id)}
                      disabled={eslesme.satir == null}
                      onChange={(event) => setPdfSeciliStoklar((onceki) => {
                        const yeni = new Set(onceki)
                        if (event.target.checked) yeni.add(eslesme.stok.id)
                        else yeni.delete(eslesme.stok.id)
                        return yeni
                      })}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-gray-900">
                        {eslesme.stok.kod} · {eslesme.stok.ad}
                      </span>
                      <span className="mt-0.5 block text-gray-500">
                        {eslesme.satir
                          ? eslesme.adaylar.map((satir) => (
                            `${pdfVaryanti(satir)}: ${para(satir.pesin)} / ${para(satir.gun60)} / ${para(satir.gun75)} TL`
                          )).join(' · ')
                          : 'Bu PDF içinde güvenli eşleşme bulunamadı; manuel fiyat girilebilir.'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {pdf.taninmayanSatirlar.length > 0 && (
                <p className="text-xs text-amber-700">
                  {pdf.taninmayanSatirlar.length} satır otomatik çözümlenemedi ve aktarılmayacak.
                </p>
              )}
              <div className="grid gap-3 rounded-lg border border-blue-100 bg-white p-3 sm:grid-cols-3">
                <label className="text-xs font-medium text-gray-700">
                  Hesapta kullanılacak vade
                  <select value={pdfVade} onChange={(event) => setPdfVade(event.target.value)} className={inputClass}>
                    <option value="0">Peşin</option>
                    <option value="60">60 gün</option>
                    <option value="75">75 gün</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-700">
                  Varsayılan ebat
                  <select value={pdfAktifVaryant} onChange={(event) => setPdfAktifVaryant(event.target.value as StokMaliyetFiyatVaryanti)} className={inputClass}>
                    <option value="me">ME</option>
                    <option value="ju">JU</option>
                    <option value="genel">Genel / ME+JU</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end rounded-lg border border-gray-200 px-3 py-2.5 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={pdfFiyatlariAktifEt}
                    disabled={!aktiflestirebilir}
                    onChange={(event) => setPdfFiyatlariAktifEt(event.target.checked)}
                  />
                  Aktarımdan sonra topluca aktif et
                </label>
              </div>
              <button
                type="button"
                disabled={!olusturabilir || islem != null || pdfSeciliStoklar.size === 0}
                onClick={() => void pdfKaydet()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {islem === 'pdf-kaydet'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Save size={14} />}
                Seçili cam fiyatlarını kaydet
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">
              {tedarikKapsamiEtiketi(kapsam)} alış fiyatı
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Yalnızca {tedarikci.ad} ile ilişkilendirilmiş ürünlere fiyat girebilirsiniz.
            </p>
          </div>
          {tedarikci.tedarik_kapsamlari.length === 1 && (
            <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700">
              {tedarikKapsamiEtiketi(kapsam)}
            </span>
          )}
        </div>

        {tedarikci.tedarik_kapsamlari.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Tedarik kapsamı">
            {tedarikci.tedarik_kapsamlari.map((deger) => (
              <button
                key={deger}
                type="button"
                onClick={() => {
                  setKapsam(deger)
                  setStokId('')
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  kapsam === deger
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-violet-300'
                }`}
              >
                {tedarikKapsamiEtiketi(deger)}
              </button>
            ))}
          </div>
        )}

        {kapsam !== 'temper_hizmeti' && kapsamdakiProfiller.length > 0 && (
          <div className="mt-4 inline-flex rounded-lg border border-gray-200 bg-white p-1" role="tablist" aria-label="Fiyat giriş biçimi">
            <button
              type="button"
              role="tab"
              aria-selected={girisModu === 'tek'}
              onClick={() => {
                setGirisModu('tek')
                const varsayilan = baglantiVarsayilanlari?.[stokId]
                setMarka(varsayilan?.marka ?? '')
                if (varsayilan) setVadeGunu(String(varsayilan.vade_gunu))
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${girisModu === 'tek' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Tek ürün
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={girisModu === 'toplu'}
              onClick={() => {
                setGirisModu('toplu')
                setMarka('')
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${girisModu === 'toplu' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Toplu fiyat girişi
            </button>
          </div>
        )}

        {kapsam === 'temper_hizmeti' ? (
          <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
            Temper hizmeti fiyatını Maliyet Hesaplama › Temper sekmesinde TL/m², marka ve vade bilgileriyle yönetin.
          </p>
        ) : kapsamdakiProfiller.length === 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p>
              Bu tedarikçiye bağlı {tedarikKapsamiEtiketi(kapsam).toLocaleLowerCase('tr-TR')} ürünü yok.
              Önce Ürün Bağlantıları sekmesinden ürün bağlayın.
            </p>
            {onUrunlereGit && (
              <button
                type="button"
                onClick={onUrunlereGit}
                className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100"
              >
                Ürün bağlantılarına git
              </button>
            )}
          </div>
        ) : girisModu === 'tek' ? (
          <form onSubmit={tekFiyatKaydet} className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-gray-700 sm:col-span-2">
                Bağlı ürün
                <select value={stokId} onChange={(event) => setStokId(event.target.value)} className={inputClass}>
                  <option value="">Ürün seçin</option>
                  {kapsamdakiProfiller.map((profil) => (
                    <option key={profil.stok_id} value={profil.stok_id}>
                      {profil.stok_kodu} · {profil.stok_adi}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-gray-700">
                Marka
                <input value={marka} onChange={(event) => setMarka(event.target.value)} placeholder="İsteğe bağlı" className={inputClass} />
              </label>
              <label className="text-xs font-medium text-gray-700">
                Birim fiyat (TRY)
                <input type="number" min="0.000001" step="0.000001" value={fiyat} onChange={(event) => setFiyat(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-gray-700">
                Vade (gün)
                <input type="number" min="0" max="3650" step="1" value={vadeGunu} onChange={(event) => setVadeGunu(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-gray-700">
                Varyant
                <select value={varyant} disabled={kapsam !== 'cam'} onChange={(event) => setVaryant(event.target.value as StokMaliyetFiyatVaryanti)} className={inputClass}>
                  <option value="genel">Genel</option>
                  <option value="me">ME</option>
                  <option value="ju">JU</option>
                </select>
              </label>
              <label className="text-xs font-medium text-gray-700">
                Başlangıç tarihi
                <input type="date" value={baslangic} onChange={(event) => setBaslangic(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-gray-700 sm:col-span-2 lg:col-span-3">
                Kaynak / açıklama
                <input value={kaynakReferansi} onChange={(event) => setKaynakReferansi(event.target.value)} className={inputClass} />
              </label>
              <label className="flex items-center gap-2 self-end rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={tekFiyatiAktifEt}
                  disabled={!aktiflestirebilir}
                  onChange={(event) => setTekFiyatiAktifEt(event.target.checked)}
                />
                Bu üründe hemen aktif et
              </label>
            </div>
            <button
              type="submit"
              disabled={!olusturabilir || islem != null}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {islem === 'tek-kaydet'
                ? <Loader2 size={14} className="animate-spin" />
                : <Save size={14} />}
              Alış fiyatını kaydet
            </button>
          </form>
        ) : (
          <form onSubmit={topluFiyatKaydet} className="mt-4 space-y-4">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:grid-cols-[minmax(0,1fr)_6rem_10rem]">
                <span>Bağlı ürün</span>
                <span className="hidden sm:block">Birim</span>
                <span>Birim fiyat (TRY)</span>
              </div>
              <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
                {kapsamdakiProfiller.map((profil) => (
                  <label key={profil.stok_id} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_6rem_10rem]">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-gray-800">{profil.stok_kodu} · {profil.stok_adi}</span>
                      <span className="mt-0.5 block text-[11px] text-gray-400 sm:hidden">{profil.fiyat_birimi}</span>
                    </span>
                    <span className="hidden text-xs text-gray-500 sm:block">{profil.fiyat_birimi}</span>
                    <input
                      aria-label={`${profil.stok_kodu} birim fiyatı`}
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      value={topluFiyatlar[profil.stok_id] ?? ''}
                      onChange={(event) => setTopluFiyatlar((onceki) => ({
                        ...onceki,
                        [profil.stok_id]: event.target.value,
                      }))}
                      placeholder="0,00"
                      className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-right text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-gray-700">
                Ortak marka
                <input value={marka} onChange={(event) => setMarka(event.target.value)} placeholder="Boşsa ürün bağlantısındaki marka" className={inputClass} />
              </label>
              <label className="text-xs font-medium text-gray-700">
                Ortak vade (gün)
                <input type="number" min="0" max="3650" step="1" value={vadeGunu} onChange={(event) => setVadeGunu(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-gray-700">
                Varyant
                <select value={varyant} disabled={kapsam !== 'cam'} onChange={(event) => setVaryant(event.target.value as StokMaliyetFiyatVaryanti)} className={inputClass}>
                  <option value="genel">Genel</option>
                  <option value="me">ME</option>
                  <option value="ju">JU</option>
                </select>
              </label>
              <label className="text-xs font-medium text-gray-700">
                Başlangıç tarihi
                <input type="date" value={baslangic} onChange={(event) => setBaslangic(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-gray-700 sm:col-span-2 lg:col-span-3">
                Kaynak / açıklama
                <input value={kaynakReferansi} onChange={(event) => setKaynakReferansi(event.target.value)} className={inputClass} />
              </label>
              <label className="flex items-center gap-2 self-end rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-700">
                <input type="checkbox" checked={tekFiyatiAktifEt} disabled={!aktiflestirebilir} onChange={(event) => setTekFiyatiAktifEt(event.target.checked)} />
                Girilenleri topluca aktif et
              </label>
            </div>

            <button type="submit" disabled={!olusturabilir || islem != null} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {islem === 'toplu-kaydet' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Girilen fiyatları topluca kaydet
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

function Ozet({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-100 bg-white p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{etiket}</div>
      <div className="mt-1 truncate font-semibold text-gray-800" title={deger}>{deger}</div>
    </div>
  )
}
