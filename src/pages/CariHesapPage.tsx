import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleGauge,
  Clock3,
  DatabaseZap,
  FilterX,
  Plus,
  ReceiptText,
  RotateCcw,
  Scale,
  Search,
  Settings2,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import {
  TabloBos,
  TicariHata,
  YenileButonu,
} from '@/components/ticari/TicariOrtak'
import PageHeader from '@/components/ui/PageHeader'
import Pagination from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { useTicariKaynak } from '@/hooks/useTicariKaynak'
import {
  acilisBakiyesiYonEtiketleri,
  cariBakiyeDurumu as bakiyeDurumu,
} from '@/lib/cariHesapSemantics'
import {
  cariHesapDurumunuCoz,
  cariTurunuDogrula,
} from '@/lib/cariNavigation'
import { ticariBugun, ticariPara, ticariTarih } from '@/lib/ticariFormat'
import { cn } from '@/lib/utils'
import {
  cariAcilisBakiyesiKaydet,
  cariBakiyeOzetleriniYenidenOlustur,
  cariBakiyeTutarlilikKontrolu,
  cariHareketTersle,
  cariHesabiniGetir,
  tahsilatKaydet,
  TicariRpcError,
  yeniIdempotencyAnahtari,
} from '@/services/ticariService'
import type {
  CariAcilisBakiyesiPayload,
  CariBakiyeTutarsizligi,
  CariHareket,
  CariSecenegi,
  ParaBirimi,
  TahsilatPayload,
} from '@/types/ticari'

const paraBirimleri: ParaBirimi[] = ['TRY', 'USD', 'EUR']
const tahsilatYontemleri = ['nakit', 'havale', 'eft', 'kredi_karti', 'cek', 'diger']
const sayfaBoyutu = 25

type HareketFiltresi = '' | 'borc' | 'alacak' | 'manuel' | 'sistem'

const alanSinifi = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20'

const hareketEtiketleri: Record<string, string> = {
  acilis_bakiyesi: 'Açılış bakiyesi',
  fiyat_farki: 'Fiyat farkı',
  iptal: 'İptal',
  on_odeme: 'Ön ödeme',
  siparis_borcu: 'Sipariş borcu',
  tahsilat: 'Tahsilat',
  tedarikci_faturasi: 'Tedarikçi faturası',
  tedarikci_odemesi: 'Tedarikçi ödemesi',
  ters_kayit: 'Ters kayıt',
}

function hareketEtiketi(hareketTuru: string) {
  return hareketEtiketleri[hareketTuru]
    ?? hareketTuru
      .replaceAll('_', ' ')
      .replace(/^\p{L}/u, harf => harf.toLocaleUpperCase('tr-TR'))
}

function yontemEtiketi(yontem: string | null) {
  if (!yontem) return null
  return yontem
    .replaceAll('_', ' ')
    .replace(/^\p{L}/u, harf => harf.toLocaleUpperCase('tr-TR'))
}

function metniKisalt(metin: string | null, sinir = 52) {
  if (!metin) return '—'
  const temiz = metin.trim()
  return temiz.length > sinir ? temiz.slice(0, sinir).trimEnd() + '…' : temiz
}

function tarihAnahtari(hareket: CariHareket) {
  return [hareket.islem_tarihi, hareket.created_at ?? '', hareket.id].join('|')
}

function cariBasHarfleri(cari: CariSecenegi) {
  return cari.ad
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(kelime => kelime[0]?.toLocaleUpperCase('tr-TR'))
    .join('') || 'C'
}

function ModalKapatButonu({ onKapat }: { onKapat: () => void }) {
  return (
    <button
      type="button"
      onClick={onKapat}
      aria-label="Pencereyi kapat"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <X size={18} />
    </button>
  )
}

function HareketDetayPaneli({
  hareket,
  cariAdi,
  cariKodu,
  cariTuru,
  bakiye,
}: {
  hareket: CariHareket
  cariAdi: string
  cariKodu?: string
  cariTuru: CariSecenegi['tipi']
  bakiye: number
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
          <ReceiptText size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Hareket detayı</p>
          <p className="mt-1 break-words text-sm leading-6 text-slate-600">{hareket.aciklama ?? 'Açıklama girilmemiş.'}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cari sahibi</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-800">{cariAdi}</dd>
          {cariKodu && <dd className="mt-0.5 text-xs text-slate-400">{cariKodu}</dd>}
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">İşlem tarihi</dt>
          <dd className="mt-1 text-sm font-medium text-slate-800">{ticariTarih(hareket.islem_tarihi)}</dd>
          {hareket.created_at && <dd className="mt-0.5 text-xs text-slate-400">Kayıt: {ticariTarih(hareket.created_at, true)}</dd>}
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">İşlem türü</dt>
          <dd className="mt-1 text-sm font-medium text-slate-800">{hareketEtiketi(hareket.hareket_turu)}</dd>
          <dd className="mt-0.5 text-xs text-slate-400">{hareket.yon === 'borc' ? 'Borç hareketi' : 'Alacak hareketi'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ödeme yöntemi</dt>
          <dd className="mt-1 text-sm font-medium text-slate-800">{yontemEtiketi(hareket.tahsilat_yontemi) ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Kaynak</dt>
          <dd className="mt-1 text-sm font-medium text-slate-800">{hareket.kaynak_sinifi === 'sistem' ? 'Sistem kaydı' : 'Manuel kayıt'}</dd>
          {hareket.kaynak_turu && <dd className="mt-0.5 text-xs text-slate-400">{hareketEtiketi(hareket.kaynak_turu)}</dd>}
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Para birimi</dt>
          <dd className="mt-1 text-sm font-medium text-slate-800">{hareket.para_birimi}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Hareket tutarı</dt>
          <dd className={cn('mt-1 text-sm font-semibold', hareket.yon === 'borc' ? 'text-rose-700' : 'text-emerald-700')}>
            {hareket.yon === 'borc' ? '+' : '−'} {ticariPara(hareket.tutar, hareket.para_birimi)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">İşlem sonrası bakiye</dt>
          <dd className={cn('mt-1 text-sm font-semibold', bakiyeDurumu(bakiye, cariTuru).renk)}>{ticariPara(bakiye, hareket.para_birimi)}</dd>
        </div>
      </dl>
    </div>
  )
}

function TahsilatFormu({
  cariler,
  varsayilanCariId,
  onKapat,
  onKaydedildi,
}: {
  cariler: CariSecenegi[]
  varsayilanCariId?: string
  onKapat: () => void
  onKaydedildi: () => Promise<void>
}) {
  const musteriler = cariler.filter(
    cari => cari.aktif !== false && cari.tipi === 'musteri',
  )
  const varsayilanCari = musteriler.find(cari => cari.id === varsayilanCariId)
  const [form, setForm] = useState<TahsilatPayload>({
    cari_id: varsayilanCari?.id ?? '',
    para_birimi: 'TRY',
    tutar: '',
    hareket_turu: 'tahsilat',
    tahsilat_yontemi: 'havale',
    islem_tarihi: ticariBugun(),
    aciklama: '',
  })
  const idempotencyKeyRef = useRef(yeniIdempotencyAnahtari())
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const seciliCari = musteriler.find(cari => cari.id === form.cari_id)

  const formuGuncelle = (degisiklik: Partial<TahsilatPayload>) => {
    idempotencyKeyRef.current = yeniIdempotencyAnahtari()
    setForm(deger => ({ ...deger, ...degisiklik }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const tutar = Number(form.tutar.replace(',', '.'))
    if (
      !seciliCari
      || !form.islem_tarihi
      || !Number.isFinite(tutar)
      || tutar <= 0
      || form.aciklama.trim().length < 3
    ) {
      setHata('Müşteri, işlem tarihi, sıfırdan büyük tutar ve en az 3 karakterlik açıklama zorunludur.')
      return
    }

    setKaydediliyor(true)
    setHata(null)
    try {
      await tahsilatKaydet(
        { ...form, tutar: String(tutar), aciklama: form.aciklama.trim() },
        idempotencyKeyRef.current,
      )
      await onKaydedildi()
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Tahsilat kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-[2px]">
      <form
        onSubmit={submit}
        className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tahsilat-baslik"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 id="tahsilat-baslik" className="text-lg font-semibold text-slate-900">
              Yeni tahsilat
            </h2>
            <p className="mt-1 text-sm text-slate-500">Müşteriyi seçin, ödeme bilgilerini girin ve işlemi tamamlayın.</p>
          </div>
          <ModalKapatButonu onKapat={onKapat} />
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
              <h3 className="text-sm font-semibold text-slate-900">Müşteriyi seçin</h3>
            </div>

            <label className="block">
              <span className="sr-only">Müşteri seçin</span>
              <select
                autoFocus={!varsayilanCari}
                required
                value={form.cari_id}
                onChange={event => formuGuncelle({ cari_id: event.target.value })}
                className={alanSinifi}
              >
                <option value="">Müşteri seçin</option>
                {musteriler.map(cari => (
                  <option key={cari.id} value={cari.id}>{cari.kod} · {cari.ad}</option>
                ))}
              </select>
            </label>

            {seciliCari && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-3">
                <span className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold text-white',
                  'bg-blue-600',
                )}>
                  {cariBasHarfleri(seciliCari)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{seciliCari.ad}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {seciliCari.kod} · Müşteri
                  </span>
                </span>
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
              <h3 className="text-sm font-semibold text-slate-900">Ödeme bilgilerini girin</h3>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => formuGuncelle({ hareket_turu: 'tahsilat' })}
                aria-pressed={form.hareket_turu === 'tahsilat'}
                className={cn(
                  'rounded-xl border px-3 py-3 text-left transition',
                  form.hareket_turu === 'tahsilat'
                    ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400'
                    : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <span className="block text-sm font-semibold text-slate-900">Tahsilat</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">Açık bakiyeye alınan ödeme</span>
              </button>
              <button
                type="button"
                onClick={() => formuGuncelle({ hareket_turu: 'on_odeme' })}
                aria-pressed={form.hareket_turu === 'on_odeme'}
                className={cn(
                  'rounded-xl border px-3 py-3 text-left transition',
                  form.hareket_turu === 'on_odeme'
                    ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400'
                    : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <span className="block text-sm font-semibold text-slate-900">Ön ödeme</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">Gelecek işlemler için kredi</span>
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Tutar</span>
                <input
                  required
                  inputMode="decimal"
                  value={form.tutar}
                  onChange={event => formuGuncelle({ tutar: event.target.value })}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold tabular-nums text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Para birimi</span>
                <select
                  value={form.para_birimi}
                  onChange={event => formuGuncelle({ para_birimi: event.target.value as ParaBirimi })}
                  className={cn(alanSinifi, 'py-3 font-semibold')}
                >
                  <option value="TRY">TL</option>
                  <option value="USD">Dolar</option>
                  <option value="EUR">Euro</option>
                </select>
              </label>
            </div>

            <fieldset className="mt-4">
              <legend className="mb-1.5 text-sm font-medium text-slate-700">Ödeme yöntemi</legend>
              <div className="grid grid-cols-3 gap-2">
                {tahsilatYontemleri.map(yontem => (
                  <button
                    key={yontem}
                    type="button"
                    onClick={() => formuGuncelle({ tahsilat_yontemi: yontem })}
                    aria-pressed={form.tahsilat_yontemi === yontem}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-semibold transition',
                      form.tahsilat_yontemi === yontem
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {yontemEtiketi(yontem)}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-4 grid gap-4 sm:grid-cols-[170px_minmax(0,1fr)]">
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">İşlem tarihi</span>
                <input
                  required
                  type="date"
                  value={form.islem_tarihi}
                  onChange={event => formuGuncelle({ islem_tarihi: event.target.value })}
                  className={alanSinifi}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Açıklama</span>
                <input
                  required
                  minLength={3}
                  value={form.aciklama}
                  onChange={event => formuGuncelle({ aciklama: event.target.value })}
                  placeholder="Örn. Temmuz ayı ödemesi"
                  className={alanSinifi}
                />
              </label>
            </div>
          </section>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3 text-xs leading-5 text-blue-800">
            Ödeme aynı para birimindeki en eski açık satıştan başlayarak otomatik dağıtılır.
            Sipariş seçmeniz gerekmez.
          </div>
          {hata && <TicariHata mesaj={hata} />}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
          <button type="button" onClick={onKapat} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={kaydediliyor}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {kaydediliyor
              ? 'Kaydediliyor…'
              : form.hareket_turu === 'on_odeme' ? 'Ön ödemeyi kaydet' : 'Tahsilatı kaydet'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AcilisBakiyesiFormu({
  cariler,
  varsayilanCariId,
  onKapat,
  onKaydedildi,
  onAal2Gerekli,
}: {
  cariler: CariSecenegi[]
  varsayilanCariId?: string
  onKapat: () => void
  onKaydedildi: () => Promise<void>
  onAal2Gerekli: () => void
}) {
  const [form, setForm] = useState<CariAcilisBakiyesiPayload>({
    cari_id: varsayilanCariId ?? '',
    para_birimi: 'TRY',
    yon: 'borc',
    tutar: '',
    islem_tarihi: ticariBugun(),
    gerekce: '',
  })
  const idempotencyKeyRef = useRef(yeniIdempotencyAnahtari())
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const seciliCari = cariler.find(cari => cari.id === form.cari_id)
  const yonEtiketleri = acilisBakiyesiYonEtiketleri(seciliCari?.tipi ?? null)

  const formuGuncelle = (degisiklik: Partial<CariAcilisBakiyesiPayload>) => {
    idempotencyKeyRef.current = yeniIdempotencyAnahtari()
    setForm(deger => ({ ...deger, ...degisiklik }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const tutar = Number(form.tutar.replace(',', '.'))
    if (!form.cari_id || !Number.isFinite(tutar) || tutar <= 0 || form.gerekce.trim().length < 3) {
      setHata('Cari, sıfırdan büyük tutar ve en az 3 karakterlik gerekçe zorunludur.')
      return
    }

    setKaydediliyor(true)
    setHata(null)
    try {
      await cariAcilisBakiyesiKaydet(
        { ...form, tutar: String(tutar), gerekce: form.gerekce.trim() },
        idempotencyKeyRef.current,
      )
      await onKaydedildi()
      onKapat()
    } catch (error) {
      if (error instanceof TicariRpcError && error.kod === 'AAL2_GEREKLI') {
        onAal2Gerekli()
        return
      }
      setHata(error instanceof Error ? error.message : 'Açılış bakiyesi kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-[2px]">
      <form
        onSubmit={submit}
        className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acilis-baslik"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 id="acilis-baslik" className="text-lg font-semibold text-slate-900">Açılış bakiyesi kaydet</h2>
            <p className="mt-1 text-sm text-slate-500">
              {seciliCari?.tipi === 'tedarikci'
                ? 'Tedarikçiye borcumuzu veya tedarikçiden alacağımızı başlangıç bakiyesi olarak girin.'
                : seciliCari?.tipi === 'musteri'
                  ? 'Müşterinin mevcut borcunu veya kredisini başlangıç bakiyesi olarak girin.'
                  : 'Mevcut borç veya alacağı carinin başlangıç bakiyesi olarak girin.'}
            </p>
          </div>
          <ModalKapatButonu onKapat={onKapat} />
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Cari</span>
            <select
              autoFocus={!varsayilanCariId}
              required
              value={form.cari_id}
              onChange={event => formuGuncelle({ cari_id: event.target.value })}
              className={alanSinifi}
            >
              <option value="">Cari seçin</option>
              {cariler.filter(cari => cari.aktif !== false).map(cari => (
                <option key={cari.id} value={cari.id}>{cari.kod} · {cari.ad}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Bakiye yönü</span>
            <select
              value={form.yon}
              onChange={event => formuGuncelle({ yon: event.target.value as CariAcilisBakiyesiPayload['yon'] })}
              className={alanSinifi}
            >
              <option value="borc">{yonEtiketleri.borc}</option>
              <option value="alacak">{yonEtiketleri.alacak}</option>
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Para birimi</span>
            <select
              value={form.para_birimi}
              onChange={event => formuGuncelle({ para_birimi: event.target.value as ParaBirimi })}
              className={alanSinifi}
            >
              {paraBirimleri.map(para => <option key={para} value={para}>{para}</option>)}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Tutar</span>
            <input
              required
              inputMode="decimal"
              value={form.tutar}
              onChange={event => formuGuncelle({ tutar: event.target.value })}
              placeholder="0,00"
              className={alanSinifi}
            />
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">İşlem tarihi</span>
            <input
              required
              type="date"
              value={form.islem_tarihi}
              onChange={event => formuGuncelle({ islem_tarihi: event.target.value })}
              className={alanSinifi}
            />
          </label>

          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Gerekçe</span>
            <textarea
              required
              minLength={3}
              value={form.gerekce}
              onChange={event => formuGuncelle({ gerekce: event.target.value })}
              rows={3}
              placeholder="Açılış bakiyesinin dayanağını yazın"
              className={cn(alanSinifi, 'resize-none')}
            />
          </label>

          <div className="sm:col-span-2 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            Bu işlem kalıcı bir cari hareketi oluşturur ve iki adımlı doğrulama gerektirir.
          </div>
          {hata && <div className="sm:col-span-2"><TicariHata mesaj={hata} /></div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
          <button type="button" onClick={onKapat} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={kaydediliyor}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {kaydediliyor ? 'Kaydediliyor…' : 'Bakiyeyi kaydet'}
          </button>
        </div>
      </form>
    </div>
  )
}

function TerslemeFormu({
  hareket,
  cariAdi,
  isleniyor,
  onKapat,
  onTersle,
}: {
  hareket: CariHareket
  cariAdi: string
  isleniyor: boolean
  onKapat: () => void
  onTersle: (gerekce: string) => Promise<boolean>
}) {
  const [gerekce, setGerekce] = useState('')
  const [hata, setHata] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (gerekce.trim().length < 3) {
      setHata('Tersleme için en az 3 karakterlik bir gerekçe yazın.')
      return
    }
    setHata(null)
    if (await onTersle(gerekce.trim())) onKapat()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-[2px]">
      <form
        onSubmit={submit}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tersleme-baslik"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="tersleme-baslik" className="text-lg font-semibold text-slate-900">Cari hareketini tersle</h2>
            <p className="mt-1 text-sm text-slate-500">{cariAdi} · {ticariPara(hareket.tutar, hareket.para_birimi)}</p>
          </div>
          <ModalKapatButonu onKapat={onKapat} />
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            Orijinal kayıt silinmez. Aynı tutarda ve ters yönde yeni bir dengeleme hareketi oluşturulur.
          </div>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Tersleme gerekçesi</span>
            <textarea
              autoFocus
              required
              minLength={3}
              value={gerekce}
              onChange={event => setGerekce(event.target.value)}
              rows={4}
              placeholder="Örn. Mükerrer tahsilat kaydı"
              className={cn(alanSinifi, 'resize-none')}
            />
          </label>
          {hata && <TicariHata mesaj={hata} />}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4">
          <button type="button" onClick={onKapat} disabled={isleniyor} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Vazgeç
          </button>
          <button type="submit" disabled={isleniyor} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
            <RotateCcw size={15} />
            {isleniyor ? 'Tersleniyor…' : 'Ters kaydı oluştur'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function CariHesapPage() {
  const kaynak = useTicariKaynak(cariHesabiniGetir)
  const { access, hasPermission } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [tahsilatAcik, setTahsilatAcik] = useState(false)
  const [acilisBakiyesiAcik, setAcilisBakiyesiAcik] = useState(false)
  const [terslenecekHareket, setTerslenecekHareket] = useState<CariHareket | null>(null)
  const [seciliCariId, setSeciliCariId] = useState(
    () => new URLSearchParams(location.search).get('cari') ?? '',
  )
  const [portfoyCariTuru, setPortfoyCariTuru] = useState<CariSecenegi['tipi']>(
    () => cariTurunuDogrula(new URLSearchParams(location.search).get('tur')),
  )
  const [cariArama, setCariArama] = useState('')
  const [yalnizAcikBakiyeler, setYalnizAcikBakiyeler] = useState(false)
  const [hareketArama, setHareketArama] = useState('')
  const [paraFiltresi, setParaFiltresi] = useState<ParaBirimi | ''>('')
  const [hareketFiltresi, setHareketFiltresi] = useState<HareketFiltresi>('')
  const [baslangicTarihi, setBaslangicTarihi] = useState('')
  const [bitisTarihi, setBitisTarihi] = useState('')
  const [tarihFiltreleriAcik, setTarihFiltreleriAcik] = useState(false)
  const [sayfa, setSayfa] = useState(1)
  const [acikHareketId, setAcikHareketId] = useState<string | null>(null)
  const [finansAraclariAcik, setFinansAraclariAcik] = useState(false)
  const [islenen, setIslenen] = useState<string | null>(null)
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null)
  const [islemBasarisi, setIslemBasarisi] = useState<string | null>(null)
  const [tutarsizliklar, setTutarsizliklar] = useState<CariBakiyeTutarsizligi[] | null>(null)
  const terslemeAnahtarlariRef = useRef(new Map<string, string>())
  const otomatikParaCariRef = useRef('')

  useEffect(() => {
    setSayfa(1)
    setAcikHareketId(null)
  }, [
    baslangicTarihi,
    bitisTarihi,
    hareketArama,
    hareketFiltresi,
    paraFiltresi,
    portfoyCariTuru,
    seciliCariId,
  ])

  const cariler = useMemo(() => kaynak.veri?.cariler ?? [], [kaynak.veri?.cariler])
  const ozetler = useMemo(() => kaynak.veri?.ozetler ?? [], [kaynak.veri?.ozetler])
  const tumHareketler = useMemo(() => kaynak.veri?.hareketler ?? [], [kaynak.veri?.hareketler])
  const cariAdlari = useMemo(
    () => new Map(cariler.map(cari => [cari.id, cari.ad])),
    [cariler],
  )
  const cariKodlari = useMemo(
    () => new Map(cariler.map(cari => [cari.id, cari.kod])),
    [cariler],
  )
  const cariTipleri = useMemo(
    () => new Map(cariler.map(cari => [cari.id, cari.tipi])),
    [cariler],
  )

  useEffect(() => {
    const durum = cariHesapDurumunuCoz(
      location.search,
      kaynak.veri ? cariler : null,
    )
    setPortfoyCariTuru(mevcut => mevcut === durum.tur ? mevcut : durum.tur)
    setSeciliCariId(mevcut => mevcut === durum.cariId ? mevcut : durum.cariId)

    const mevcutArama = new URLSearchParams(location.search).toString()
    if (
      durum.normalizedSearch !== null
      && durum.normalizedSearch !== mevcutArama
    ) {
      navigate(
        {
          pathname: location.pathname,
          search: durum.normalizedSearch ? `?${durum.normalizedSearch}` : '',
        },
        { replace: true },
      )
    }
  }, [cariler, kaynak.veri, location.pathname, location.search, navigate])

  const seciliCari = cariler.find(
    cari => cari.id === seciliCariId && cari.tipi === portfoyCariTuru,
  ) ?? null
  const gecerliSeciliCariId = seciliCari?.id ?? ''

  useEffect(() => {
    if (!gecerliSeciliCariId || otomatikParaCariRef.current === gecerliSeciliCariId) return
    const cariOzetleri = ozetler.filter(ozet => ozet.cari_id === gecerliSeciliCariId)
    const tercih = paraBirimleri.find(para => (
      cariOzetleri.some(ozet => ozet.para_birimi === para && Math.abs(Number(ozet.net_bakiye)) > 0.0001)
    )) ?? 'TRY'
    setParaFiltresi(tercih)
    otomatikParaCariRef.current = gecerliSeciliCariId
  }, [gecerliSeciliCariId, ozetler])

  const cariSatirlari = useMemo(() => cariler.map(cari => {
    const bakiyeler = ozetler.filter(ozet => ozet.cari_id === cari.id)
    const acikBakiyeVar = bakiyeler.some(ozet => Math.abs(Number(ozet.net_bakiye)) > 0.0001)
    const sonHareketTarihi = bakiyeler
      .map(ozet => ozet.son_hareket_tarihi)
      .filter((tarih): tarih is string => Boolean(tarih))
      .sort((a, b) => b.localeCompare(a))[0] ?? null
    return { cari, bakiyeler, acikBakiyeVar, sonHareketTarihi }
  }), [cariler, ozetler])

  const gorunenCariSatirlari = useMemo(() => {
    const query = cariArama.trim().toLocaleLowerCase('tr-TR')
    return cariSatirlari
      .filter(satir => satir.cari.tipi === portfoyCariTuru)
      .filter(satir => !yalnizAcikBakiyeler || satir.acikBakiyeVar)
      .filter(satir => !query || (satir.cari.kod + ' ' + satir.cari.ad).toLocaleLowerCase('tr-TR').includes(query))
      .sort((a, b) => {
        if (a.acikBakiyeVar !== b.acikBakiyeVar) return a.acikBakiyeVar ? -1 : 1
        if (a.cari.aktif !== b.cari.aktif) return a.cari.aktif ? -1 : 1
        return a.cari.ad.localeCompare(b.cari.ad, 'tr-TR')
      })
  }, [cariArama, cariSatirlari, portfoyCariTuru, yalnizAcikBakiyeler])

  const portfoyCariIdleri = useMemo(
    () => new Set(cariler.filter(cari => cari.tipi === portfoyCariTuru).map(cari => cari.id)),
    [cariler, portfoyCariTuru],
  )

  const hareketSonrasiBakiyeler = useMemo(() => {
    const bakiyeler = new Map<string, number>()
    const anlik = new Map<string, number>()
    const sirali = [...tumHareketler].sort((a, b) => tarihAnahtari(a).localeCompare(tarihAnahtari(b)))
    sirali.forEach(hareket => {
      const anahtar = hareket.cari_id + ':' + hareket.para_birimi
      const onceki = anlik.get(anahtar) ?? 0
      const yeni = onceki + (hareket.yon === 'borc' ? Number(hareket.tutar) : -Number(hareket.tutar))
      anlik.set(anahtar, yeni)
      bakiyeler.set(hareket.id, yeni)
    })
    return bakiyeler
  }, [tumHareketler])

  const terslenmisHareketler = useMemo(
    () => new Set(tumHareketler
      .map(hareket => hareket.terslenen_hareket_id)
      .filter((id): id is string => Boolean(id))),
    [tumHareketler],
  )

  const hareketler = useMemo(() => {
    const query = hareketArama.trim().toLocaleLowerCase('tr-TR')
    return [...tumHareketler]
      .filter(hareket => gecerliSeciliCariId
        ? hareket.cari_id === gecerliSeciliCariId
        : portfoyCariIdleri.has(hareket.cari_id))
      .filter(hareket => !paraFiltresi || hareket.para_birimi === paraFiltresi)
      .filter(hareket => {
        if (!hareketFiltresi) return true
        if (hareketFiltresi === 'borc' || hareketFiltresi === 'alacak') return hareket.yon === hareketFiltresi
        return hareket.kaynak_sinifi === hareketFiltresi
      })
      .filter(hareket => !baslangicTarihi || hareket.islem_tarihi.slice(0, 10) >= baslangicTarihi)
      .filter(hareket => !bitisTarihi || hareket.islem_tarihi.slice(0, 10) <= bitisTarihi)
      .filter(hareket => !query || [
        cariAdlari.get(hareket.cari_id),
        cariKodlari.get(hareket.cari_id),
        hareketEtiketi(hareket.hareket_turu),
        hareket.aciklama,
        hareket.tahsilat_yontemi,
        hareket.para_birimi,
      ].some(value => value?.toLocaleLowerCase('tr-TR').includes(query)))
      .sort((a, b) => tarihAnahtari(b).localeCompare(tarihAnahtari(a)))
  }, [
    baslangicTarihi,
    bitisTarihi,
    cariAdlari,
    cariKodlari,
    gecerliSeciliCariId,
    hareketArama,
    hareketFiltresi,
    paraFiltresi,
    portfoyCariIdleri,
    tumHareketler,
  ])

  const toplamSayfa = Math.max(1, Math.ceil(hareketler.length / sayfaBoyutu))
  const mevcutSayfa = Math.min(sayfa, toplamSayfa)
  const sayfadakiHareketler = hareketler.slice(
    (mevcutSayfa - 1) * sayfaBoyutu,
    mevcutSayfa * sayfaBoyutu,
  )

  const gorunenOzetler = useMemo(
    () => gecerliSeciliCariId
      ? ozetler.filter(ozet => ozet.cari_id === gecerliSeciliCariId)
      : ozetler.filter(ozet => portfoyCariIdleri.has(ozet.cari_id)),
    [gecerliSeciliCariId, ozetler, portfoyCariIdleri],
  )

  const paraOzeti = (paraBirimi: ParaBirimi) => {
    const satirlar = gorunenOzetler.filter(ozet => ozet.para_birimi === paraBirimi)
    return {
      borc: satirlar.reduce((toplam, ozet) => toplam + Number(ozet.borc_toplami), 0),
      alacak: satirlar.reduce((toplam, ozet) => toplam + Number(ozet.alacak_toplami), 0),
      net: satirlar.reduce((toplam, ozet) => toplam + Number(ozet.net_bakiye), 0),
      borcluSayisi: satirlar.filter(ozet => Number(ozet.net_bakiye) > 0).length,
      alacakliSayisi: satirlar.filter(ozet => Number(ozet.net_bakiye) < 0).length,
      sonHareket: satirlar
        .map(ozet => ozet.son_hareket_tarihi)
        .filter((tarih): tarih is string => Boolean(tarih))
        .sort((a, b) => b.localeCompare(a))[0] ?? null,
    }
  }
  const ozetParaBirimi: ParaBirimi = paraFiltresi || 'TRY'
  const seciliParaOzeti = paraOzeti(ozetParaBirimi)
  const seciliParaDurumu = bakiyeDurumu(
    seciliParaOzeti.net,
    seciliCari?.tipi ?? portfoyCariTuru,
  )

  const aktifHareketFiltresiSayisi = [
    paraFiltresi,
    hareketFiltresi,
    baslangicTarihi,
    bitisTarihi,
  ].filter(Boolean).length

  const cariSec = (cariId: string) => {
    setSeciliCariId(cariId)
    if (!cariId) {
      setParaFiltresi('')
      otomatikParaCariRef.current = ''
    }
    const params = new URLSearchParams(location.search)
    params.set('tur', portfoyCariTuru)
    if (cariId) params.set('cari', cariId)
    else params.delete('cari')
    const yeniArama = params.toString()
    navigate(
      { pathname: location.pathname, search: yeniArama ? '?' + yeniArama : '' },
    )
  }

  const portfoyTurunuSec = (yeniTur: CariSecenegi['tipi']) => {
    setPortfoyCariTuru(yeniTur)
    setSeciliCariId('')
    setCariArama('')
    setParaFiltresi('')
    setTahsilatAcik(false)
    otomatikParaCariRef.current = ''
    const params = new URLSearchParams(location.search)
    params.set('tur', yeniTur)
    params.delete('cari')
    navigate(
      { pathname: location.pathname, search: `?${params.toString()}` },
    )
  }

  const hareketFiltreleriniTemizle = () => {
    setHareketArama('')
    setParaFiltresi('')
    setHareketFiltresi('')
    setBaslangicTarihi('')
    setBitisTarihi('')
  }

  const mfaYonlendir = () => {
    navigate('/mfa', { state: { from: location.pathname + location.search } })
  }

  const aal2Dogrula = () => {
    if (access?.aal === 'aal2') return true
    mfaYonlendir()
    return false
  }

  const aal2HatasiMi = (error: unknown) => (
    error instanceof TicariRpcError
      ? error.kod === 'AAL2_GEREKLI'
      : error instanceof Error && /AAL2_GEREKLI|iki adımlı doğrulama/i.test(error.message)
  )

  const tersle = async (hareket: CariHareket, gerekce: string) => {
    const denemeKimligi = hareket.id + ':' + gerekce
    const idempotencyKey = terslemeAnahtarlariRef.current.get(denemeKimligi)
      ?? yeniIdempotencyAnahtari()
    terslemeAnahtarlariRef.current.set(denemeKimligi, idempotencyKey)
    setIslenen(hareket.id)
    setIslemHatasi(null)
    setIslemBasarisi(null)
    try {
      await cariHareketTersle(hareket.id, gerekce, idempotencyKey)
      await kaynak.yenile()
      setIslemBasarisi('Cari hareketi ters kayıtla dengelendi.')
      return true
    } catch (error) {
      if (aal2HatasiMi(error)) {
        mfaYonlendir()
        return false
      }
      setIslemHatasi(error instanceof Error ? error.message : 'Cari hareket terslenemedi.')
      return false
    } finally {
      setIslenen(null)
    }
  }

  const tutarliligiKontrolEt = async () => {
    if (!aal2Dogrula()) return
    setIslenen('bakiye-kontrol')
    setIslemHatasi(null)
    setIslemBasarisi(null)
    try {
      const sonuc = await cariBakiyeTutarlilikKontrolu()
      setTutarsizliklar(sonuc)
      if (sonuc.length === 0) setIslemBasarisi('Cari bakiye özetleri hareketlerle tamamen tutarlı.')
    } catch (error) {
      if (aal2HatasiMi(error)) {
        mfaYonlendir()
        return
      }
      setIslemHatasi(error instanceof Error ? error.message : 'Bakiye tutarlılığı kontrol edilemedi.')
    } finally {
      setIslenen(null)
    }
  }

  const bakiyeOzetleriniYenidenOlustur = async () => {
    if (!aal2Dogrula()) return
    if (!window.confirm('Bakiye özetleri cari hareketlerinden yeniden oluşturulsun mu? Cari hareketler değiştirilmeyecektir.')) return
    setIslenen('bakiye-yeniden-olustur')
    setIslemHatasi(null)
    setIslemBasarisi(null)
    try {
      const sonuc = await cariBakiyeOzetleriniYenidenOlustur()
      const [yeniTutarsizliklar] = await Promise.all([
        cariBakiyeTutarlilikKontrolu(),
        kaynak.yenile(),
      ])
      setTutarsizliklar(yeniTutarsizliklar)
      setIslemBasarisi(
        yeniTutarsizliklar.length === 0
          ? sonuc.satir_sayisi + ' bakiye özeti yeniden üretildi ve doğrulandı.'
          : 'Özetler yeniden üretildi; ' + yeniTutarsizliklar.length + ' tutarsızlık devam ediyor.',
      )
    } catch (error) {
      if (aal2HatasiMi(error)) {
        mfaYonlendir()
        return
      }
      setIslemHatasi(error instanceof Error ? error.message : 'Bakiye özetleri yeniden oluşturulamadı.')
    } finally {
      setIslenen(null)
    }
  }

  const terslenebilir = (hareket: CariHareket) => (
    hareket.kaynak_sinifi === 'manuel'
    && !hareket.terslenen_hareket_id
    && !terslenmisHareketler.has(hareket.id)
    && hasPermission('finance', 'manage')
  )

  const terslemePenceresiniAc = (hareket: CariHareket) => {
    if (!aal2Dogrula()) return
    setTerslenecekHareket(hareket)
  }

  if (kaynak.yukleniyor && !kaynak.veri) {
    return <div className="mx-auto max-w-[1480px] p-4 sm:p-6"><TableSkeleton satir={8} kolon={7} /></div>
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        baslik="Cari Hesaplar"
        aciklama={portfoyCariTuru === 'musteri'
          ? 'Müşteri bakiyelerini izleyin, tahsilatları kaydedin ve hesap hareketlerini yönetin.'
          : 'Tedarikçiye borçlarımızı, ödemelerimizi ve hesap hareketlerini izleyin.'}
        icon={WalletCards}
        className="mb-0"
        aksiyon={(
          <>
            <YenileButonu onClick={() => void kaynak.yenile()} yukleniyor={kaynak.yukleniyor} />
            {portfoyCariTuru === 'musteri' && hasPermission('finance', 'create') && (
              <button
                type="button"
                onClick={() => setTahsilatAcik(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <Plus size={16} />
                Yeni tahsilat
              </button>
            )}
          </>
        )}
      />

      {kaynak.hata && <TicariHata mesaj={kaynak.hata} />}
      {islemHatasi && <TicariHata mesaj={islemHatasi} />}
      {islemBasarisi && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CircleCheck size={18} className="shrink-0" />
          {islemBasarisi}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex h-[520px] min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.02] lg:sticky lg:top-4 lg:h-[680px]">
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Cari portföyü</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {cariler.filter(cari => cari.tipi === portfoyCariTuru).length} kayıtlı {portfoyCariTuru === 'musteri' ? 'müşteri' : 'tedarikçi'}
                </p>
              </div>
              {portfoyCariTuru === 'musteri'
                ? <UsersRound size={19} className="text-slate-400" />
                : <Building2 size={19} className="text-slate-400" />}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => portfoyTurunuSec('musteri')}
                aria-pressed={portfoyCariTuru === 'musteri'}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition',
                  portfoyCariTuru === 'musteri'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                <UsersRound size={14} />
                Müşteriler
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">
                  {cariler.filter(cari => cari.tipi === 'musteri').length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => portfoyTurunuSec('tedarikci')}
                aria-pressed={portfoyCariTuru === 'tedarikci'}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition',
                  portfoyCariTuru === 'tedarikci'
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                <Building2 size={14} />
                Tedarikçiler
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">
                  {cariler.filter(cari => cari.tipi === 'tedarikci').length}
                </span>
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <span className="sr-only">Cari ara</span>
                <input
                  type="search"
                  value={cariArama}
                  onChange={event => setCariArama(event.target.value)}
                  placeholder={portfoyCariTuru === 'musteri' ? 'Müşteri ara' : 'Tedarikçi ara'}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <button
                type="button"
                onClick={() => setYalnizAcikBakiyeler(acik => !acik)}
                aria-pressed={yalnizAcikBakiyeler}
                aria-label={yalnizAcikBakiyeler ? 'Tüm carileri göster' : 'Yalnız açık bakiyesi olan carileri göster'}
                title={yalnizAcikBakiyeler ? 'Tüm carileri göster' : 'Yalnız açık bakiyeliler'}
                className={cn(
                  'relative grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  yalnizAcikBakiyeler
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                )}
              >
                <WalletCards size={17} />
                {yalnizAcikBakiyeler && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-blue-50" />}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => cariSec('')}
              aria-pressed={!gecerliSeciliCariId}
              className={cn(
                'mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                !gecerliSeciliCariId
                  ? portfoyCariTuru === 'musteri' ? 'bg-blue-50 text-blue-900' : 'bg-violet-50 text-violet-900'
                  : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              <span className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                !gecerliSeciliCariId
                  ? portfoyCariTuru === 'musteri' ? 'bg-blue-600 text-white' : 'bg-violet-600 text-white'
                  : 'bg-slate-100 text-slate-500',
              )}>
                {portfoyCariTuru === 'musteri' ? <UsersRound size={19} /> : <Building2 size={19} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {portfoyCariTuru === 'musteri' ? 'Tüm müşteriler' : 'Tüm tedarikçiler'}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {tumHareketler.filter(hareket => portfoyCariIdleri.has(hareket.cari_id)).length} hesap hareketi
                </span>
              </span>
              <ChevronRight size={16} className="shrink-0 opacity-40" />
            </button>

            {gorunenCariSatirlari.map(({ cari, bakiyeler, sonHareketTarihi }) => (
              <button
                key={cari.id}
                type="button"
                onClick={() => cariSec(cari.id)}
                aria-pressed={gecerliSeciliCariId === cari.id}
                className={cn(
                  'mb-1 w-full rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  gecerliSeciliCariId === cari.id
                    ? portfoyCariTuru === 'musteri'
                      ? 'bg-blue-50 ring-1 ring-inset ring-blue-100'
                      : 'bg-violet-50 ring-1 ring-inset ring-violet-100'
                    : 'hover:bg-slate-50',
                )}
              >
                <span className="flex items-start gap-3">
                  <span className={cn(
                    'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold',
                    gecerliSeciliCariId === cari.id
                      ? portfoyCariTuru === 'musteri' ? 'bg-blue-600 text-white' : 'bg-violet-600 text-white'
                      : 'bg-slate-100 text-slate-600',
                  )}>
                    {cariBasHarfleri(cari)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{cari.ad}</span>
                      </span>
                      {!cari.aktif && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Pasif</span>}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {paraBirimleri.map(para => {
                        const net = Number(bakiyeler.find(ozet => ozet.para_birimi === para)?.net_bakiye ?? 0)
                        if (Math.abs(net) < 0.0001) return null
                        const durum = bakiyeDurumu(net, cari.tipi)
                        return (
                          <span key={para} className={cn('rounded-md px-1.5 py-1 text-[10px] font-bold', durum.zemin, durum.renk)}>
                            {ticariPara(net, para)}
                          </span>
                        )
                      })}
                      {!bakiyeler.some(ozet => Math.abs(Number(ozet.net_bakiye)) > 0.0001) && (
                        <span className="text-[11px] text-slate-400">Bakiye yok</span>
                      )}
                    </span>
                    {sonHareketTarihi && (
                      <span className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock3 size={11} />
                        Son hareket {ticariTarih(sonHareketTarihi)}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))}

            {gorunenCariSatirlari.length === 0 && (
              <div className="px-3 py-12 text-center text-sm text-slate-500">Aramanıza uygun cari bulunamadı.</div>
            )}
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.02]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn(
                  'grid h-11 w-11 shrink-0 place-items-center rounded-xl font-bold',
                  seciliCari
                    ? seciliCari.tipi === 'musteri' ? 'bg-blue-600 text-sm text-white' : 'bg-violet-600 text-sm text-white'
                    : 'bg-slate-100 text-slate-600',
                )}>
                  {seciliCari
                    ? cariBasHarfleri(seciliCari)
                    : portfoyCariTuru === 'musteri' ? <UsersRound size={21} /> : <Building2 size={21} />}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-slate-900">
                    {seciliCari?.ad ?? (portfoyCariTuru === 'musteri' ? 'Tüm müşteri hesapları' : 'Tüm tedarikçi hesapları')}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {seciliCari
                      ? seciliCari.kod + (seciliCari.aktif ? ' · Aktif cari' : ' · Pasif cari')
                      : portfoyCariTuru === 'musteri'
                        ? 'Müşteri bakiyeleri ve hesap hareketleri'
                        : 'Tedarikçi bakiyeleri ve hesap hareketleri'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {seciliCari && hasPermission('finance', 'manage') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!aal2Dogrula()) return
                      setAcilisBakiyesiAcik(true)
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <DatabaseZap size={14} />
                    Açılış bakiyesi
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-4 bg-slate-50/70 px-4 py-4 sm:px-5">
              <label className="min-w-[150px]">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hesap para birimi</span>
                <select
                  value={ozetParaBirimi}
                  onChange={event => setParaFiltresi(event.target.value as ParaBirimi)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="TRY">TL hesabı</option>
                  <option value="USD">Dolar hesabı</option>
                  <option value="EUR">Euro hesabı</option>
                </select>
              </label>

              <div className="min-w-[190px]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Güncel bakiye</p>
                <p className={cn('mt-1 text-xl font-bold tracking-tight', seciliParaDurumu.renk)}>
                  {ticariPara(seciliParaOzeti.net, ozetParaBirimi)}
                </p>
              </div>

              <div className="grid min-w-[260px] flex-1 grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <span className="text-slate-500">
                  {(seciliCari?.tipi ?? portfoyCariTuru) === 'tedarikci'
                    ? 'Tedarikçiden alacağımız'
                    : 'Toplam borç'}
                </span>
                <span className="text-right font-semibold text-slate-800">{ticariPara(seciliParaOzeti.borc, ozetParaBirimi)}</span>
                <span className="text-slate-500">
                  {(seciliCari?.tipi ?? portfoyCariTuru) === 'tedarikci'
                    ? 'Tedarikçiye borcumuz'
                    : 'Toplam alacak'}
                </span>
                <span className="text-right font-semibold text-slate-800">{ticariPara(seciliParaOzeti.alacak, ozetParaBirimi)}</span>
              </div>

              <div className="ml-auto text-right">
                <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', seciliParaDurumu.zemin, seciliParaDurumu.renk)}>
                  {seciliParaDurumu.etiket}
                </span>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {seciliParaOzeti.sonHareket ? 'Son hareket ' + ticariTarih(seciliParaOzeti.sonHareket) : 'Henüz hareket yok'}
                </p>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.02]">
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">Hesap hareketleri</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{hareketler.length} hareket gösteriliyor</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTarihFiltreleriAcik(acik => !acik)}
                  aria-expanded={tarihFiltreleriAcik}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition',
                    tarihFiltreleriAcik || baslangicTarihi || bitisTarihi
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <Settings2 size={14} />
                  Tarih aralığı
                  {(baslangicTarihi || bitisTarihi) && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[10px] text-white">1</span>}
                  <ChevronDown size={13} className={cn('transition-transform', tarihFiltreleriAcik && 'rotate-180')} />
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_150px_170px_auto]">
                <label className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <span className="sr-only">Hareketlerde ara</span>
                  <input
                    type="search"
                    value={hareketArama}
                    onChange={event => setHareketArama(event.target.value)}
                    placeholder="Açıklama, hareket veya cari ara"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                  />
                </label>
                <label>
                  <span className="sr-only">Para birimi</span>
                  <select
                    value={paraFiltresi}
                    onChange={event => setParaFiltresi(event.target.value as ParaBirimi | '')}
                    className={alanSinifi}
                  >
                    <option value="">Tüm para birimleri</option>
                    {paraBirimleri.map(para => <option key={para} value={para}>{para}</option>)}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Hareket filtresi</span>
                  <select
                    value={hareketFiltresi}
                    onChange={event => setHareketFiltresi(event.target.value as HareketFiltresi)}
                    className={alanSinifi}
                  >
                    <option value="">Tüm hareketler</option>
                    <option value="borc">Borç hareketleri</option>
                    <option value="alacak">Alacak hareketleri</option>
                    <option value="manuel">Manuel kayıtlar</option>
                    <option value="sistem">Sistem kayıtları</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={hareketFiltreleriniTemizle}
                  disabled={!hareketArama && aktifHareketFiltresiSayisi === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FilterX size={14} />
                  Temizle
                </button>
              </div>

              {tarihFiltreleriAcik && (
                <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">Başlangıç tarihi</span>
                    <input
                      type="date"
                      value={baslangicTarihi}
                      max={bitisTarihi || undefined}
                      onChange={event => setBaslangicTarihi(event.target.value)}
                      className={alanSinifi}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">Bitiş tarihi</span>
                    <input
                      type="date"
                      value={bitisTarihi}
                      min={baslangicTarihi || undefined}
                      onChange={event => setBitisTarihi(event.target.value)}
                      className={alanSinifi}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="divide-y divide-slate-100 2xl:hidden">
              {sayfadakiHareketler.map(hareket => {
                const net = hareketSonrasiBakiyeler.get(hareket.id) ?? 0
                const detayAcik = acikHareketId === hareket.id
                return (
                  <article key={hareket.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold',
                            hareket.yon === 'borc' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700',
                          )}>
                            {hareket.yon === 'borc' ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}
                            {hareketEtiketi(hareket.hareket_turu)}
                          </span>
                          <span className="text-xs text-slate-400">{ticariTarih(hareket.islem_tarihi)}</span>
                        </div>
                        {!seciliCari && (
                          <p className="mt-2 truncate text-sm font-semibold text-slate-900">{cariAdlari.get(hareket.cari_id) ?? hareket.cari_id}</p>
                        )}
                        <p className="mt-1 text-sm text-slate-600" title={hareket.aciklama ?? undefined}>
                          {metniKisalt(hareket.aciklama, 64)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn('text-sm font-bold', hareket.yon === 'borc' ? 'text-rose-700' : 'text-emerald-700')}>
                          {hareket.yon === 'borc' ? '+' : '−'} {ticariPara(hareket.tutar, hareket.para_birimi)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">Bakiye {ticariPara(net, hareket.para_birimi)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => setAcikHareketId(detayAcik ? null : hareket.id)}
                        aria-expanded={detayAcik}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <ChevronRight size={12} className={cn('transition-transform', detayAcik && 'rotate-90')} />
                        {detayAcik ? 'Detayı kapat' : 'Detay'}
                      </button>
                      {terslenebilir(hareket) && (
                        <button type="button" onClick={() => terslemePenceresiniAc(hareket)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600">
                          <RotateCcw size={12} />
                          Tersle
                        </button>
                      )}
                    </div>
                    {detayAcik && (
                      <div className="mt-3">
                        <HareketDetayPaneli
                          hareket={hareket}
                          cariAdi={cariAdlari.get(hareket.cari_id) ?? hareket.cari_id}
                          cariKodu={cariKodlari.get(hareket.cari_id)}
                          cariTuru={cariTipleri.get(hareket.cari_id) ?? portfoyCariTuru}
                          bakiye={net}
                        />
                      </div>
                    )}
                  </article>
                )
              })}
              {sayfadakiHareketler.length === 0 && <TabloBos>Filtrelere uygun hesap hareketi bulunamadı.</TabloBos>}
            </div>

            <div className="hidden overflow-hidden 2xl:block">
              <table className="w-full table-fixed text-[13px]">
                <colgroup>
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '9%' }} />
                  {!seciliCari && <col style={{ width: '15%' }} />}
                  <col style={{ width: '13%' }} />
                  <col />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '7%' }} />
                </colgroup>
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-1 py-3 text-center">Detay</th>
                    <th className="px-2 py-3">Tarih</th>
                    {!seciliCari && <th className="px-2 py-3">Cari sahibi</th>}
                    <th className="px-2 py-3">Hareket</th>
                    <th className="px-2 py-3">Açıklama</th>
                    <th className="px-2 py-3 text-right">Borç</th>
                    <th className="px-2 py-3 text-right">Alacak</th>
                    <th className="px-2 py-3 text-right leading-4">İşlem sonrası bakiye</th>
                    <th className="px-2 py-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sayfadakiHareketler.map(hareket => {
                    const net = hareketSonrasiBakiyeler.get(hareket.id) ?? 0
                    const durum = bakiyeDurumu(
                      net,
                      cariTipleri.get(hareket.cari_id) ?? portfoyCariTuru,
                    )
                    const detayAcik = acikHareketId === hareket.id
                    return (
                      <Fragment key={hareket.id}>
                        <tr className={cn('transition hover:bg-slate-50/80', detayAcik && 'bg-blue-50/30')}>
                          <td className="px-1 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => setAcikHareketId(detayAcik ? null : hareket.id)}
                              aria-label={detayAcik ? 'Hareket detayını kapat' : 'Hareket detayını aç'}
                              aria-expanded={detayAcik}
                              className={cn(
                                'inline-grid h-8 w-8 place-items-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                                detayAcik
                                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                              )}
                            >
                              <ChevronRight size={15} className={cn('transition-transform', detayAcik && 'rotate-90')} />
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-2 py-3 text-slate-600">{ticariTarih(hareket.islem_tarihi)}</td>
                          {!seciliCari && (
                            <td className="truncate px-2 py-3 font-semibold text-slate-900" title={cariAdlari.get(hareket.cari_id)}>
                              {cariAdlari.get(hareket.cari_id) ?? hareket.cari_id}
                            </td>
                          )}
                          <td className="overflow-hidden px-2 py-3">
                            <span className={cn(
                              'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold',
                              hareket.yon === 'borc' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700',
                            )}>
                              {hareket.yon === 'borc' ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}
                              {hareketEtiketi(hareket.hareket_turu)}
                            </span>
                          </td>
                          <td className="overflow-hidden px-2 py-3">
                            <p className="truncate text-slate-700" title={hareket.aciklama ?? undefined}>
                              {metniKisalt(hareket.aciklama)}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-2 py-3 text-right text-xs font-semibold tabular-nums text-rose-700">
                            {hareket.yon === 'borc' ? ticariPara(hareket.tutar, hareket.para_birimi) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-3 text-right text-xs font-semibold tabular-nums text-emerald-700">
                            {hareket.yon === 'alacak' ? ticariPara(hareket.tutar, hareket.para_birimi) : '—'}
                          </td>
                          <td className={cn('whitespace-nowrap px-2 py-3 text-right text-xs font-semibold tabular-nums', durum.renk)}>
                            {ticariPara(net, hareket.para_birimi)}
                          </td>
                          <td className="px-2 py-3 text-right">
                            {terslenebilir(hareket) ? (
                              <button
                                type="button"
                                disabled={islenen === hareket.id}
                                onClick={() => terslemePenceresiniAc(hareket)}
                                className="inline-grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                title="Hareketi tersle"
                                aria-label="Hareketi tersle"
                              >
                                <RotateCcw size={13} />
                              </button>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                        {detayAcik && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={seciliCari ? 8 : 9} className="px-3 py-4">
                              <HareketDetayPaneli
                                hareket={hareket}
                                cariAdi={cariAdlari.get(hareket.cari_id) ?? hareket.cari_id}
                                cariKodu={cariKodlari.get(hareket.cari_id)}
                                cariTuru={cariTipleri.get(hareket.cari_id) ?? portfoyCariTuru}
                                bakiye={net}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  {sayfadakiHareketler.length === 0 && (
                    <tr><td colSpan={seciliCari ? 8 : 9}><TabloBos>Filtrelere uygun hesap hareketi bulunamadı.</TabloBos></td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              toplamKayit={hareketler.length}
              sayfaBoyutu={sayfaBoyutu}
              mevcutSayfa={mevcutSayfa}
              onSayfaDegistir={yeniSayfa => {
                setSayfa(yeniSayfa)
                setAcikHareketId(null)
              }}
            />
          </section>
        </main>
      </div>

      {hasPermission('finance', 'manage') && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setFinansAraclariAcik(acik => !acik)}
            aria-expanded={finansAraclariAcik}
            className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-slate-50 sm:px-5"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Scale size={17} /></span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">Finans yönetim araçları</span>
                <span className="mt-0.5 block text-xs text-slate-500">Bakiye doğrulama ve bakım işlemleri</span>
              </span>
            </span>
            <ChevronDown size={17} className={cn('text-slate-400 transition-transform', finansAraclariAcik && 'rotate-180')} />
          </button>

          {finansAraclariAcik && (
            <div className="border-t border-slate-100 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-2xl text-xs leading-5 text-slate-500">
                  Bu bölümdeki işlemler finans yöneticisi yetkisi ve iki adımlı doğrulama gerektirir.
                  Cari hareketleri doğruluğun ana kaynağıdır.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!aal2Dogrula()) return
                      setAcilisBakiyesiAcik(true)
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                  >
                    <DatabaseZap size={14} />
                    Açılış bakiyesi
                  </button>
                  <button
                    type="button"
                    disabled={islenen === 'bakiye-kontrol' || islenen === 'bakiye-yeniden-olustur'}
                    onClick={() => void tutarliligiKontrolEt()}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <CircleGauge size={14} />
                    {islenen === 'bakiye-kontrol' ? 'Kontrol ediliyor…' : 'Bakiyeleri doğrula'}
                  </button>
                </div>
              </div>

              {tutarsizliklar !== null && (
                <div className="mt-4">
                  {tutarsizliklar.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                      <CircleCheck size={17} />
                      Hareket toplamları ile bakiye özetleri tutarlı.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="flex items-start gap-2 text-sm text-amber-900">
                          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                          <span><strong>{tutarsizliklar.length} tutarsız bakiye</strong> bulundu.</span>
                        </div>
                        <button
                          type="button"
                          disabled={islenen === 'bakiye-yeniden-olustur'}
                          onClick={() => void bakiyeOzetleriniYenidenOlustur()}
                          className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <DatabaseZap size={14} />
                          {islenen === 'bakiye-yeniden-olustur' ? 'Yeniden oluşturuluyor…' : 'Özetleri yeniden oluştur'}
                        </button>
                      </div>
                      <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[850px] text-xs">
                          <thead className="sticky top-0 bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-2">Cari</th>
                              <th className="px-3 py-2">Para</th>
                              <th className="px-3 py-2 text-right">Hareket borç</th>
                              <th className="px-3 py-2 text-right">Özet borç</th>
                              <th className="px-3 py-2 text-right">Hareket alacak</th>
                              <th className="px-3 py-2 text-right">Özet alacak</th>
                              <th className="px-3 py-2 text-right">Net fark</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {tutarsizliklar.map(tutarsizlik => {
                              const netFark = Number(tutarsizlik.hareket_net_bakiye) - Number(tutarsizlik.ozet_net_bakiye)
                              return (
                                <tr key={tutarsizlik.cari_id + ':' + tutarsizlik.para_birimi}>
                                  <td className="px-3 py-2 font-medium text-slate-800">{cariAdlari.get(tutarsizlik.cari_id) ?? tutarsizlik.cari_id}</td>
                                  <td className="px-3 py-2 text-slate-600">{tutarsizlik.para_birimi}</td>
                                  <td className="px-3 py-2 text-right">{ticariPara(tutarsizlik.hareket_borc_toplami, tutarsizlik.para_birimi)}</td>
                                  <td className="px-3 py-2 text-right">{ticariPara(tutarsizlik.ozet_borc_toplami, tutarsizlik.para_birimi)}</td>
                                  <td className="px-3 py-2 text-right">{ticariPara(tutarsizlik.hareket_alacak_toplami, tutarsizlik.para_birimi)}</td>
                                  <td className="px-3 py-2 text-right">{ticariPara(tutarsizlik.ozet_alacak_toplami, tutarsizlik.para_birimi)}</td>
                                  <td className={cn('px-3 py-2 text-right font-semibold', netFark === 0 ? 'text-slate-600' : 'text-amber-700')}>
                                    {ticariPara(netFark, tutarsizlik.para_birimi)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600">
        <ReceiptText size={16} className="mt-0.5 shrink-0 text-slate-400" />
        <span>
          Para birimleri birbirinden bağımsız izlenir. Sistem kaynaklı sipariş hareketleri bu ekrandan değil,
          ilgili sipariş güncelleme veya iptal akışından düzeltilir.
        </span>
      </div>

      {tahsilatAcik && portfoyCariTuru === 'musteri' && (
        <TahsilatFormu
          cariler={cariler}
          varsayilanCariId={seciliCari?.tipi === 'musteri' ? seciliCari.id : undefined}
          onKapat={() => setTahsilatAcik(false)}
          onKaydedildi={async () => {
            await kaynak.yenile()
            setIslemHatasi(null)
            setIslemBasarisi('Tahsilat / ön ödeme cari hesaba kaydedildi.')
          }}
        />
      )}
      {acilisBakiyesiAcik && (
        <AcilisBakiyesiFormu
          cariler={cariler}
          varsayilanCariId={seciliCari?.id}
          onKapat={() => setAcilisBakiyesiAcik(false)}
          onAal2Gerekli={mfaYonlendir}
          onKaydedildi={async () => {
            await kaynak.yenile()
            setIslemHatasi(null)
            setIslemBasarisi('Açılış bakiyesi cari hareketi olarak kaydedildi.')
          }}
        />
      )}
      {terslenecekHareket && (
        <TerslemeFormu
          hareket={terslenecekHareket}
          cariAdi={cariAdlari.get(terslenecekHareket.cari_id) ?? terslenecekHareket.cari_id}
          isleniyor={islenen === terslenecekHareket.id}
          onKapat={() => setTerslenecekHareket(null)}
          onTersle={gerekce => tersle(terslenecekHareket, gerekce)}
        />
      )}
    </div>
  )
}
