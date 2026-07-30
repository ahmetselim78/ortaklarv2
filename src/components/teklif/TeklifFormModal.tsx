import { useMemo, useState } from 'react'
import { AlertTriangle, Calculator, Plus, Save, Trash2, X } from 'lucide-react'
import { useEscape } from '@/hooks/useEscape'
import {
  fiyatOnizle,
  yeniIdempotencyAnahtari,
  teklifRevizyonuOlustur,
  teklifTicariBelgesineDonustur,
  TicariRpcError,
} from '@/services/ticariService'
import type { YeniSiparisForm } from '@/types/siparis'
import type {
  CariSecenegi,
  FiyatHesapSonucu,
  FiyatOnizlemesi,
  Teklif,
  TeklifRevizyonu,
  TeklifStokSecenegi,
  TicariMod,
} from '@/types/ticari'
import { cn } from '@/lib/utils'
import { ticariBugun } from '@/lib/ticariFormat'

interface TeklifSatiri {
  yerel_id: string
  stok_id: string
  genislik_mm: string
  yukseklik_mm: string
  adet: string
  kenar_islemi: string
  menfez_cap_mm: string
  kucuk_cam: boolean
  satir_iskonto_yuzdesi: string
  satir_iskonto_tutari: string
  kenar_islemi_ucretsiz: boolean
  menfez_ucretsiz: boolean
  kucuk_cam_ucretsiz: boolean
  poz: string
  notlar: string
}

interface TeklifFormu {
  cari_id: string
  tarih: string
  notlar: string
  vade_gunu: string
  belge_iskonto_yuzdesi: string
  belge_iskonto_tutari: string
  manuel_fiyat_farki: string
  manuel_yuvarlama_farki: string
  nakliye_satis_override: string
  nakliye_maliyet_override: string
  ticari_mudahale_gerekcesi: string
  fiyat_baglamini_yenile: boolean
  satirlar: TeklifSatiri[]
}

interface Props {
  cariler: CariSecenegi[]
  stoklar: TeklifStokSecenegi[]
  ticariMod: TicariMod | null | undefined
  teklif?: Teklif | null
  revizyon?: TeklifRevizyonu | null
  onKaydedildi: () => Promise<void> | void
  onKapat: () => void
}

const yeniYerelId = () => crypto.randomUUID()

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function text(value: unknown, fallback = '') {
  return value == null ? fallback : String(value)
}

function boolean(value: unknown) {
  return value === true || value === 'true'
}

function bosSatir(): TeklifSatiri {
  return {
    yerel_id: yeniYerelId(),
    stok_id: '',
    genislik_mm: '',
    yukseklik_mm: '',
    adet: '1',
    kenar_islemi: '',
    menfez_cap_mm: '',
    kucuk_cam: false,
    satir_iskonto_yuzdesi: '',
    satir_iskonto_tutari: '',
    kenar_islemi_ucretsiz: false,
    menfez_ucretsiz: false,
    kucuk_cam_ucretsiz: false,
    poz: '',
    notlar: '',
  }
}

function ilkForm(revizyon?: TeklifRevizyonu | null, teklif?: Teklif | null): TeklifFormu {
  const snapshot = record(revizyon?.belge_snapshot)
  const hamSatirlar = Array.isArray(snapshot.satirlar) ? snapshot.satirlar : []
  const satirlar = hamSatirlar.map((ham): TeklifSatiri => {
    const satir = record(ham)
    return {
      yerel_id: yeniYerelId(),
      stok_id: text(satir.stok_id),
      genislik_mm: text(satir.genislik_mm),
      yukseklik_mm: text(satir.yukseklik_mm),
      adet: text(satir.adet, '1'),
      kenar_islemi: text(satir.kenar_islemi),
      menfez_cap_mm: text(satir.menfez_cap_mm),
      kucuk_cam: boolean(satir.kucuk_cam),
      satir_iskonto_yuzdesi: text(satir.satir_iskonto_yuzdesi),
      satir_iskonto_tutari: text(satir.satir_iskonto_tutari),
      kenar_islemi_ucretsiz: boolean(satir.kenar_islemi_ucretsiz),
      menfez_ucretsiz: boolean(satir.menfez_ucretsiz),
      kucuk_cam_ucretsiz: boolean(satir.kucuk_cam_ucretsiz),
      poz: text(satir.poz),
      notlar: text(satir.notlar),
    }
  })
  return {
    cari_id: teklif?.cari_id ?? text(snapshot.cari_id),
    tarih: text(snapshot.tarih, revizyon?.teklif_tarihi ?? ticariBugun()),
    notlar: text(snapshot.notlar),
    vade_gunu: text(snapshot.vade_gunu),
    belge_iskonto_yuzdesi: text(snapshot.belge_iskonto_yuzdesi),
    belge_iskonto_tutari: text(snapshot.belge_iskonto_tutari),
    manuel_fiyat_farki: text(snapshot.manuel_fiyat_farki),
    manuel_yuvarlama_farki: text(snapshot.manuel_yuvarlama_farki),
    nakliye_satis_override: text(snapshot.nakliye_satis_override),
    nakliye_maliyet_override: text(snapshot.nakliye_maliyet_override),
    ticari_mudahale_gerekcesi: text(snapshot.ticari_mudahale_gerekcesi),
    fiyat_baglamini_yenile: false,
    satirlar: satirlar.length > 0 ? satirlar : [bosSatir()],
  }
}

function fiyat(value: number, paraBirimi: string) {
  return `${Number(value || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${paraBirimi}`
}

export default function TeklifFormModal({
  cariler,
  stoklar,
  ticariMod,
  teklif,
  revizyon,
  onKaydedildi,
  onKapat,
}: Props) {
  const [form, setForm] = useState<TeklifFormu>(() => ilkForm(revizyon, teklif))
  const [onizleme, setOnizleme] = useState<FiyatOnizlemesi | null>(null)
  const [fiyatCakismasi, setFiyatCakismasi] = useState<{
    onceki: FiyatHesapSonucu
    yeni: FiyatHesapSonucu
    degisenKaynaklar: string[]
  } | null>(null)
  const [hesaplaniyor, setHesaplaniyor] = useState(false)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [idempotencyKey] = useState(yeniIdempotencyAnahtari)
  useEscape(onKapat, !hesaplaniyor && !kaydediliyor)

  const duzenleme = Boolean(teklif)
  const sonrakiRevizyon = (revizyon?.revizyon_no ?? 0) + 1
  const aktifCariler = useMemo(
    () => cariler.filter((cari) => cari.aktif).sort((a, b) => a.ad.localeCompare(b.ad, 'tr')),
    [cariler],
  )

  const degistir = <K extends keyof TeklifFormu>(alan: K, deger: TeklifFormu[K]) => {
    setForm((onceki) => ({ ...onceki, [alan]: deger }))
    setOnizleme(null)
    setFiyatCakismasi(null)
    setHata(null)
  }

  const satirDegistir = (yerelId: string, alan: keyof TeklifSatiri, deger: string | boolean) => {
    setForm((onceki) => ({
      ...onceki,
      satirlar: onceki.satirlar.map((satir) =>
        satir.yerel_id === yerelId ? { ...satir, [alan]: deger } : satir),
    }))
    setOnizleme(null)
    setFiyatCakismasi(null)
    setHata(null)
  }

  const satirSil = (yerelId: string) => {
    setForm((onceki) => {
      const kalan = onceki.satirlar.filter((satir) => satir.yerel_id !== yerelId)
      return { ...onceki, satirlar: kalan.length > 0 ? kalan : [bosSatir()] }
    })
    setOnizleme(null)
    setFiyatCakismasi(null)
  }

  const belgeOlustur = () => {
    if (!form.cari_id) throw new Error('Müşteri seçimi zorunludur.')
    if (!form.tarih) throw new Error('Teklif tarihi zorunludur.')
    if (form.satirlar.length === 0) throw new Error('En az bir teklif satırı gereklidir.')
    for (const [index, satir] of form.satirlar.entries()) {
      if (!satir.stok_id || Number(satir.genislik_mm) <= 0 || Number(satir.yukseklik_mm) <= 0 || Number(satir.adet) <= 0) {
        throw new Error(`${index + 1}. satırda stok, ölçü ve adet alanlarını kontrol edin.`)
      }
      if (satir.satir_iskonto_yuzdesi && (Number(satir.satir_iskonto_yuzdesi) < 0 || Number(satir.satir_iskonto_yuzdesi) > 100)) {
        throw new Error(`${index + 1}. satır iskontosu 0–100 arasında olmalıdır.`)
      }
      if (satir.satir_iskonto_tutari && Number(satir.satir_iskonto_tutari) < 0) {
        throw new Error(`${index + 1}. satır iskonto tutarı negatif olamaz.`)
      }
      if (satir.satir_iskonto_yuzdesi && satir.satir_iskonto_tutari) {
        throw new Error(`${index + 1}. satırda yüzde ve tutar iskontosu birlikte kullanılamaz.`)
      }
      if (satir.kenar_islemi_ucretsiz && !satir.kenar_islemi) {
        throw new Error(`${index + 1}. satırda ücretsiz kenar işlemi için önce kenar türünü seçin.`)
      }
      if (satir.menfez_ucretsiz && !satir.menfez_cap_mm) {
        throw new Error(`${index + 1}. satırda ücretsiz menfez için önce menfez çapını girin.`)
      }
      if (satir.kucuk_cam_ucretsiz && !satir.kucuk_cam) {
        throw new Error(`${index + 1}. satırda ücretsiz küçük cam için küçük cam seçimini işaretleyin.`)
      }
    }
    if (form.belge_iskonto_yuzdesi && (Number(form.belge_iskonto_yuzdesi) < 0 || Number(form.belge_iskonto_yuzdesi) > 100)) {
      throw new Error('Belge iskontosu 0–100 arasında olmalıdır.')
    }
    if (form.belge_iskonto_tutari && Number(form.belge_iskonto_tutari) < 0) {
      throw new Error('Belge iskonto tutarı negatif olamaz.')
    }
    if (form.belge_iskonto_yuzdesi && form.belge_iskonto_tutari) {
      throw new Error('Belge yüzde ve tutar iskontosu birlikte kullanılamaz.')
    }
    if (
      [form.nakliye_satis_override, form.nakliye_maliyet_override]
        .some((deger) => deger !== '' && Number(deger) < 0)
    ) {
      throw new Error('Nakliye override tutarları negatif olamaz.')
    }
    const manuelMudahaleVar = Boolean(
      form.belge_iskonto_yuzdesi
      || form.belge_iskonto_tutari
      || form.manuel_fiyat_farki
      || form.manuel_yuvarlama_farki
      || form.nakliye_satis_override
      || form.nakliye_maliyet_override
      || form.satirlar.some((satir) => (
        satir.satir_iskonto_yuzdesi
        || satir.satir_iskonto_tutari
        || satir.kenar_islemi_ucretsiz
        || satir.menfez_ucretsiz
        || satir.kucuk_cam_ucretsiz
      ))
    )
    if (manuelMudahaleVar && form.ticari_mudahale_gerekcesi.trim().length < 3) {
      throw new Error('İskonto, ücretsiz ekstra, manuel fark veya nakliye override için gerekçe zorunludur.')
    }

    const girdi: YeniSiparisForm = {
      cari_id: form.cari_id,
      tarih: form.tarih,
      notlar: form.notlar || undefined,
      kaynak: 'manuel',
      vade_gunu: form.vade_gunu || undefined,
      belge_iskonto_yuzdesi: form.belge_iskonto_yuzdesi || undefined,
      belge_iskonto_tutari: form.belge_iskonto_tutari || undefined,
      manuel_fiyat_farki: form.manuel_fiyat_farki || undefined,
      manuel_yuvarlama_farki: form.manuel_yuvarlama_farki || undefined,
      nakliye_satis_override: form.nakliye_satis_override || undefined,
      nakliye_maliyet_override: form.nakliye_maliyet_override || undefined,
      ticari_mudahale_gerekcesi: form.ticari_mudahale_gerekcesi || undefined,
      dusuk_marj_gerekcesi: form.ticari_mudahale_gerekcesi || undefined,
      camlar: form.satirlar.map((satir) => ({
        stok_id: satir.stok_id,
        genislik_mm: satir.genislik_mm,
        yukseklik_mm: satir.yukseklik_mm,
        adet: satir.adet,
        kenar_islemi: satir.kenar_islemi || undefined,
        menfez_cap_mm: satir.menfez_cap_mm || undefined,
        kucuk_cam: satir.kucuk_cam,
        satir_iskonto_yuzdesi: satir.satir_iskonto_yuzdesi || undefined,
        satir_iskonto_tutari: satir.satir_iskonto_tutari || undefined,
        kenar_islemi_ucretsiz: satir.kenar_islemi_ucretsiz,
        menfez_ucretsiz: satir.menfez_ucretsiz,
        kucuk_cam_ucretsiz: satir.kucuk_cam_ucretsiz,
        poz: satir.poz || undefined,
        notlar: satir.notlar || undefined,
      })),
    }
    return {
      ...teklifTicariBelgesineDonustur(
      girdi,
      teklif ? { id: teklif.id, revisionNo: teklif.revision_no } : null,
      ),
      fiyat_baglamini_yenile: duzenleme && form.fiyat_baglamini_yenile,
    }
  }

  const kesinFiyatiHesapla = async () => {
    if (ticariMod !== 'aktif') {
      setHata('Teklif önizleme ve kayıt işlemi yalnız aktif ticari modda kullanılabilir.')
      return
    }
    setHesaplaniyor(true)
    setHata(null)
    setFiyatCakismasi(null)
    try {
      const sonuc = await fiyatOnizle(belgeOlustur())
      setOnizleme(sonuc)
    } catch (error) {
      setOnizleme(null)
      setHata(error instanceof Error ? error.message : 'Kesin fiyat hesaplanamadı.')
    } finally {
      setHesaplaniyor(false)
    }
  }

  const kaydet = async () => {
    if (!onizleme?.sonuc.gecerli) {
      setHata('Geçerli kesin fiyat önizlemesini incelemeden teklif kaydedilemez.')
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      await teklifRevizyonuOlustur({
        teklifId: teklif?.id ?? null,
        beklenenRevisionNo: teklif?.revision_no ?? null,
        belge: belgeOlustur(),
        onizlemeId: onizleme.onizleme_id,
        onizlemeHash: onizleme.sonuc_hash,
        idempotencyKey,
      })
      await onKaydedildi()
      onKapat()
    } catch (error) {
      const mesaj = error instanceof Error ? error.message : 'Teklif kaydedilemedi.'
      if (
        error instanceof TicariRpcError
        && error.kod === 'FIYAT_ONIZLEME_CAKISMASI'
        && onizleme
        && error.detay?.yeni_sonuc
        && typeof error.detay.yeni_sonuc === 'object'
      ) {
        setFiyatCakismasi({
          onceki: onizleme.sonuc,
          yeni: error.detay.yeni_sonuc as unknown as FiyatHesapSonucu,
          degisenKaynaklar: Array.isArray(error.detay.degisen_kaynaklar)
            ? error.detay.degisen_kaynaklar.map(String)
            : [],
        })
      }
      if (/FIYAT_ONIZLEME|önizleme|Fiyatlandırma verileri|REVISION/i.test(mesaj)) setOnizleme(null)
      setHata(mesaj)
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {duzenleme ? `${teklif?.teklif_no} · R${String(sonrakiRevizyon).padStart(2, '0')}` : 'Yeni Bağımsız Teklif'}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Teklif siparişten bağımsızdır. Kesin tutar yalnız PostgreSQL önizlemesi onaylandıktan sonra kaydedilir.
            </p>
          </div>
          <button type="button" onClick={onKapat} disabled={hesaplaniyor || kaydediliyor} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-medium text-gray-700 sm:col-span-2">
                  Müşteri *
                  <select
                    value={form.cari_id}
                    disabled={duzenleme}
                    onChange={(event) => degistir('cari_id', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                  >
                    <option value="">Müşteri seçin…</option>
                    {aktifCariler.map((cari) => <option key={cari.id} value={cari.id}>{cari.kod} · {cari.ad}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-700">
                  Teklif tarihi *
                  <input type="date" value={form.tarih} onChange={(event) => degistir('tarih', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-700">
                  Vade günü
                  <input type="number" min="0" value={form.vade_gunu} onChange={(event) => degistir('vade_gunu', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="Profil varsayılanı" />
                </label>
                <label className="text-xs font-medium text-gray-700">
                  Genel iskonto %
                  <input type="number" min="0" max="100" step="0.01" value={form.belge_iskonto_yuzdesi} onChange={(event) => degistir('belge_iskonto_yuzdesi', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-700 sm:col-span-2 lg:col-span-3">
                  Belge notu
                  <input value={form.notlar} onChange={(event) => degistir('notlar', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="Müşteriye gösterilecek teklif notu…" />
                </label>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Ticari müdahaleler</h3>
                  <p className="mt-0.5 text-[11px] text-gray-600">
                    Bu değerler birim fiyatın içine gizlenmez; ayrı fiyat bileşeni ve audit kaydı olarak saklanır.
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <label className="text-xs font-medium text-gray-700">
                    Genel iskonto tutarı
                    <input type="number" min="0" step="0.01" value={form.belge_iskonto_tutari} onChange={(event) => degistir('belge_iskonto_tutari', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs font-medium text-gray-700">
                    Manuel fiyat farkı
                    <input type="number" step="0.01" value={form.manuel_fiyat_farki} onChange={(event) => degistir('manuel_fiyat_farki', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs font-medium text-gray-700">
                    Ticari küsurat farkı
                    <input type="number" step="0.01" value={form.manuel_yuvarlama_farki} onChange={(event) => degistir('manuel_yuvarlama_farki', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs font-medium text-gray-700">
                    Nakliye satış override
                    <input type="number" min="0" step="0.01" value={form.nakliye_satis_override} onChange={(event) => degistir('nakliye_satis_override', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs font-medium text-gray-700">
                    Nakliye maliyet override
                    <input type="number" min="0" step="0.01" value={form.nakliye_maliyet_override} onChange={(event) => degistir('nakliye_maliyet_override', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                  </label>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">Teklif satırları</h3>
                    <p className="text-[11px] text-gray-500">{form.satirlar.length} satır</p>
                  </div>
                  <button type="button" onClick={() => degistir('satirlar', [...form.satirlar, bosSatir()])} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                    <Plus size={13} /> Satır ekle
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1320px] text-xs">
                    <thead className="bg-white text-left text-gray-500">
                      <tr>
                        <th className="px-2 py-2">#</th>
                        <th className="min-w-56 px-2 py-2">Stok *</th>
                        <th className="px-2 py-2">En mm *</th>
                        <th className="px-2 py-2">Boy mm *</th>
                        <th className="px-2 py-2">Adet *</th>
                        <th className="px-2 py-2">Kenar</th>
                        <th className="px-2 py-2">Menfez Ø</th>
                        <th className="px-2 py-2">Küçük cam</th>
                        <th className="px-2 py-2">İskonto %</th>
                        <th className="px-2 py-2">İskonto tutarı</th>
                        <th className="px-2 py-2">Ücretsiz ekstralar</th>
                        <th className="px-2 py-2">Poz</th>
                        <th className="px-2 py-2"><span className="sr-only">Sil</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {form.satirlar.map((satir, index) => (
                        <tr key={satir.yerel_id}>
                          <td className="px-2 py-2 text-gray-400">{index + 1}</td>
                          <td className="px-2 py-2">
                            <select value={satir.stok_id} onChange={(event) => satirDegistir(satir.yerel_id, 'stok_id', event.target.value)} className="w-full rounded border border-gray-200 bg-white px-2 py-1.5">
                              <option value="">Seçin…</option>
                              {stoklar.map((stok) => <option key={stok.id} value={stok.id}>{stok.kod} · {stok.ad}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-2"><input type="number" min="1" value={satir.genislik_mm} onChange={(event) => satirDegistir(satir.yerel_id, 'genislik_mm', event.target.value)} className="w-20 rounded border border-gray-200 px-2 py-1.5" /></td>
                          <td className="px-2 py-2"><input type="number" min="1" value={satir.yukseklik_mm} onChange={(event) => satirDegistir(satir.yerel_id, 'yukseklik_mm', event.target.value)} className="w-20 rounded border border-gray-200 px-2 py-1.5" /></td>
                          <td className="px-2 py-2"><input type="number" min="1" value={satir.adet} onChange={(event) => satirDegistir(satir.yerel_id, 'adet', event.target.value)} className="w-16 rounded border border-gray-200 px-2 py-1.5" /></td>
                          <td className="px-2 py-2">
                            <select value={satir.kenar_islemi} onChange={(event) => satirDegistir(satir.yerel_id, 'kenar_islemi', event.target.value)} className="w-24 rounded border border-gray-200 bg-white px-2 py-1.5">
                              <option value="">Yok</option><option value="Rodaj">Rodaj</option><option value="Bizote">Bizote</option>
                            </select>
                          </td>
                          <td className="px-2 py-2"><input type="number" min="1" value={satir.menfez_cap_mm} onChange={(event) => satirDegistir(satir.yerel_id, 'menfez_cap_mm', event.target.value)} className="w-20 rounded border border-gray-200 px-2 py-1.5" /></td>
                          <td className="px-2 py-2 text-center">
                            <input type="checkbox" checked={satir.kucuk_cam} onChange={(event) => satirDegistir(satir.yerel_id, 'kucuk_cam', event.target.checked)} aria-label={`${index + 1}. satır küçük cam`} />
                          </td>
                          <td className="px-2 py-2"><input type="number" min="0" max="100" step="0.01" value={satir.satir_iskonto_yuzdesi} onChange={(event) => satirDegistir(satir.yerel_id, 'satir_iskonto_yuzdesi', event.target.value)} className="w-20 rounded border border-gray-200 px-2 py-1.5" /></td>
                          <td className="px-2 py-2"><input type="number" min="0" step="0.01" value={satir.satir_iskonto_tutari} onChange={(event) => satirDegistir(satir.yerel_id, 'satir_iskonto_tutari', event.target.value)} className="w-24 rounded border border-gray-200 px-2 py-1.5" /></td>
                          <td className="px-2 py-2">
                            <div className="flex min-w-44 flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
                              <label className="flex items-center gap-1"><input type="checkbox" checked={satir.kenar_islemi_ucretsiz} onChange={(event) => satirDegistir(satir.yerel_id, 'kenar_islemi_ucretsiz', event.target.checked)} /> Kenar</label>
                              <label className="flex items-center gap-1"><input type="checkbox" checked={satir.menfez_ucretsiz} onChange={(event) => satirDegistir(satir.yerel_id, 'menfez_ucretsiz', event.target.checked)} /> Menfez</label>
                              <label className="flex items-center gap-1"><input type="checkbox" checked={satir.kucuk_cam_ucretsiz} onChange={(event) => satirDegistir(satir.yerel_id, 'kucuk_cam_ucretsiz', event.target.checked)} /> Küçük cam</label>
                            </div>
                          </td>
                          <td className="px-2 py-2"><input value={satir.poz} onChange={(event) => satirDegistir(satir.yerel_id, 'poz', event.target.value)} className="w-20 rounded border border-gray-200 px-2 py-1.5" /></td>
                          <td className="px-2 py-2">
                            <button type="button" onClick={() => satirSil(satir.yerel_id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className={cn(
                'rounded-xl border p-4',
                onizleme?.sonuc.gecerli ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50',
              )}>
                <div className="flex items-center gap-2">
                  <Calculator size={17} className="text-blue-700" />
                  <h3 className="text-sm font-semibold text-gray-900">Kesin fiyat</h3>
                </div>
                {onizleme ? (
                  <>
                    <dl className="mt-4 space-y-2 text-xs">
                      {onizleme.sonuc.satir_iskonto_tutari !== 0 && <div className="flex justify-between"><dt className="text-gray-500">Satır iskontoları</dt><dd className="font-semibold text-red-700">−{fiyat(onizleme.sonuc.satir_iskonto_tutari, onizleme.sonuc.para_birimi)}</dd></div>}
                      {onizleme.sonuc.belge_iskonto_tutari !== 0 && <div className="flex justify-between"><dt className="text-gray-500">Belge iskontosu</dt><dd className="font-semibold text-red-700">−{fiyat(onizleme.sonuc.belge_iskonto_tutari, onizleme.sonuc.para_birimi)}</dd></div>}
                      {onizleme.sonuc.manuel_fiyat_farki !== 0 && <div className="flex justify-between"><dt className="text-gray-500">Manuel fiyat farkı</dt><dd className="font-semibold">{fiyat(onizleme.sonuc.manuel_fiyat_farki, onizleme.sonuc.para_birimi)}</dd></div>}
                      {onizleme.sonuc.manuel_yuvarlama_farki !== 0 && <div className="flex justify-between"><dt className="text-gray-500">Ticari küsurat farkı</dt><dd className="font-semibold">{fiyat(onizleme.sonuc.manuel_yuvarlama_farki, onizleme.sonuc.para_birimi)}</dd></div>}
                      {onizleme.sonuc.nakliye_override_farki !== 0 && <div className="flex justify-between"><dt className="text-gray-500">Nakliye override farkı</dt><dd className="font-semibold">{fiyat(onizleme.sonuc.nakliye_override_farki, onizleme.sonuc.para_birimi)}</dd></div>}
                      {onizleme.sonuc.vade_farki !== 0 && <div className="flex justify-between"><dt className="text-gray-500">Vade farkı</dt><dd className="font-semibold">{fiyat(onizleme.sonuc.vade_farki, onizleme.sonuc.para_birimi)}</dd></div>}
                      <div className="flex justify-between"><dt className="text-gray-500">KDV hariç</dt><dd className="font-semibold">{fiyat(onizleme.sonuc.kdv_haric_tutar, onizleme.sonuc.para_birimi)}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">KDV</dt><dd className="font-semibold">{fiyat(onizleme.sonuc.kdv_tutari, onizleme.sonuc.para_birimi)}</dd></div>
                      <div className="flex justify-between border-t border-blue-200 pt-2"><dt className="font-semibold text-gray-700">Genel toplam</dt><dd className="text-base font-bold text-blue-800">{fiyat(onizleme.sonuc.genel_toplam, onizleme.sonuc.para_birimi)}</dd></div>
                      {onizleme.sonuc.tahmini_maliyet != null && <div className="flex justify-between border-t border-blue-200 pt-2"><dt className="text-gray-500">Tahmini maliyet</dt><dd className="font-semibold">{fiyat(onizleme.sonuc.tahmini_maliyet, onizleme.sonuc.para_birimi)}</dd></div>}
                      {onizleme.sonuc.tahmini_kar != null && <div className="flex justify-between"><dt className="text-gray-500">Tahmini kâr</dt><dd className="font-semibold">{fiyat(onizleme.sonuc.tahmini_kar, onizleme.sonuc.para_birimi)}</dd></div>}
                      {onizleme.sonuc.marj_yuzdesi != null && <div className="flex justify-between"><dt className="text-gray-500">Marj</dt><dd className="font-semibold">%{Number(onizleme.sonuc.marj_yuzdesi).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</dd></div>}
                    </dl>
                    {onizleme.sonuc.dusuk_marj && (
                      <div className="mt-3 rounded-lg border border-red-300 bg-red-100 p-2.5 text-xs font-semibold text-red-800">
                        Minimum marjın altında. Kayda devam etmek için gerekçe zorunludur; bu fazda kayıt engellenmez.
                      </div>
                    )}
                    {!onizleme.sonuc.gecerli && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                        {onizleme.sonuc.hatalar.map((item, index) => (
                          <div key={`${item.kod}-${index}`}>{item.satir_no ? `${item.satir_no}. satır · ` : ''}{item.kod.replaceAll('_', ' ')}</div>
                        ))}
                      </div>
                    )}
                    <p className="mt-3 text-[11px] text-gray-500">
                      Son geçerlilik: {new Date(onizleme.sona_erme_tarihi).toLocaleString('tr-TR')}
                    </p>
                  </>
                ) : fiyatCakismasi ? (
                  <div className="mt-3 space-y-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-xs font-semibold text-red-800">
                      Fiyat bağlamı önizlemeden sonra değişti
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div className="rounded-lg bg-white p-2">
                        <div className="text-[10px] text-gray-500">Önceki</div>
                        <div className="text-xs font-semibold">
                          {fiyat(fiyatCakismasi.onceki.genel_toplam, fiyatCakismasi.onceki.para_birimi)}
                        </div>
                      </div>
                      <span className="text-red-400">→</span>
                      <div className="rounded-lg bg-white p-2 ring-1 ring-red-200">
                        <div className="text-[10px] text-red-600">Yeni</div>
                        <div className="text-xs font-bold text-red-800">
                          {fiyat(fiyatCakismasi.yeni.genel_toplam, fiyatCakismasi.yeni.para_birimi)}
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-red-700">
                      Yeni sonucu inceleyip kesin fiyatı yeniden hesaplayın; yeni önizleme alınmadan kayıt yapılmaz.
                    </p>
                    {fiyatCakismasi.degisenKaynaklar.length > 0 && (
                      <p className="break-words text-[10px] text-red-600">
                        Değişen: {fiyatCakismasi.degisenKaynaklar.join(', ')}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-blue-800">Satış, KDV ve toplamlar tarayıcıda hesaplanmaz. Sunucudan kesin önizleme alın.</p>
                )}
                <button type="button" onClick={kesinFiyatiHesapla} disabled={hesaplaniyor || kaydediliyor} className="mt-4 w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                  {hesaplaniyor ? 'Hesaplanıyor…' : onizleme ? 'Fiyatı yenile' : 'Kesin fiyatı hesapla'}
                </button>
              </div>

              <label className="block text-xs font-medium text-gray-700">
                Ticari müdahale / düşük marj gerekçesi
                <textarea value={form.ticari_mudahale_gerekcesi} onChange={(event) => degistir('ticari_mudahale_gerekcesi', event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="İskonto veya düşük marj varsa zorunludur…" />
              </label>

              {duzenleme && (
                <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.fiyat_baglamini_yenile}
                    onChange={(event) => degistir('fiyat_baglamini_yenile', event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <strong className="block text-gray-900">Güncel fiyatlarla yeniden hesapla</strong>
                    Kapalıyken önceki revizyonun fiyat, maliyet, reçete, KDV ve kur bağlamı korunur.
                  </span>
                </label>
              )}

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex gap-2"><AlertTriangle size={15} className="shrink-0" /><span>Önizleme sonrası fiyat, kur, reçete veya profil değişirse kayıt durur ve yeni fiyat onayı istenir.</span></div>
              </div>
            </aside>
          </div>
        </div>

        {hata && <div className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</div>}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onKapat} disabled={hesaplaniyor || kaydediliyor} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Vazgeç</button>
          <button type="button" onClick={kaydet} disabled={kaydediliyor || !onizleme?.sonuc.gecerli} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            <Save size={15} /> {kaydediliyor ? 'Kaydediliyor…' : `${duzenleme ? `R${String(sonrakiRevizyon).padStart(2, '0')}` : 'R01'} olarak kaydet`}
          </button>
        </div>
      </div>
    </div>
  )
}
