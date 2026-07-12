import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search, Trash2, Loader2, AlertCircle, RefreshCw, Factory, Package,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useUretim } from '@/hooks/useUretim'
import { formatDate } from '@/lib/utils'
import StatusBadge from '@/components/ui/StatusBadge'
import Pagination from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import type { UretimEmri } from '@/types/uretim'
import type { Siparis, SiparisDurum } from '@/types/siparis'

type AltSekme = 'batch' | 'siparis'

const SIPARIS_DURUMLARI: { deger: string; etiket: string }[] = [
  { deger: 'hepsi', etiket: 'Hepsi' },
  { deger: 'beklemede', etiket: 'Beklemede' },
  { deger: 'batchte', etiket: "Batch'te" },
  { deger: 'yikamada', etiket: 'Yıkamada' },
  { deger: 'tamamlandi', etiket: 'Tamamlandı' },
  { deger: 'eksik_var', etiket: 'Eksik Var' },
  { deger: 'iptal', etiket: 'İptal' },
]

const SAYFA_BOYUTU = 25

function SilmeOnayModal({
  baslik,
  aciklama,
  uyari,
  siliniyor,
  onKapat,
  onOnayla,
}: {
  baslik: string
  aciklama: React.ReactNode
  uyari?: string
  siliniyor: boolean
  onKapat: () => void
  onOnayla: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget && !siliniyor) onKapat() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">{baslik}</h3>
          <p className="text-sm text-gray-600 mt-2">{aciklama}</p>
          {uyari && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{uyari}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50">
          <button
            type="button"
            onClick={onKapat}
            disabled={siliniyor}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onOnayla}
            disabled={siliniyor}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {siliniyor ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {siliniyor ? 'Siliniyor…' : 'Evet, Sil'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BatchSekmesi({
  emirler,
  yukleniyor,
  hata,
  onYenile,
  onSil,
}: {
  emirler: UretimEmri[]
  yukleniyor: boolean
  hata: string | null
  onYenile: () => void
  onSil: (emir: UretimEmri) => Promise<void>
}) {
  const [arama, setArama] = useState('')
  const [silinecek, setSilinecek] = useState<UretimEmri | null>(null)
  const [siliniyor, setSiliniyor] = useState(false)

  const filtrelenmis = useMemo(() => {
    const q = arama.trim().toLowerCase()
    if (!q) return emirler
    return emirler.filter(e =>
      e.batch_no.toLowerCase().includes(q)
      || (e.siparis_listesi ?? []).some(s =>
        s.siparis_no.toLowerCase().includes(q)
        || s.musteri_ad.toLowerCase().includes(q)
        || (s.alt_musteri ?? '').toLowerCase().includes(q),
      ),
    )
  }, [emirler, arama])

  const handleSil = async () => {
    if (!silinecek) return
    setSiliniyor(true)
    try {
      await onSil(silinecek)
      setSilinecek(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Silme başarısız.')
    } finally {
      setSiliniyor(false)
    }
  }

  return (
    <>
      {silinecek && (
        <SilmeOnayModal
          baslik="Batch'i Sil"
          aciklama={(
            <>
              <span className="font-mono font-semibold text-gray-900">{silinecek.batch_no}</span>
              {' '}batch'i ve içindeki {silinecek.cam_sayisi ?? 0} cam kaydı kalıcı olarak silinecek.
              Bağlı siparişlerin durumu yeniden hesaplanacak.
            </>
          )}
          uyari="Bu işlem geri alınamaz."
          siliniyor={siliniyor}
          onKapat={() => !siliniyor && setSilinecek(null)}
          onOnayla={handleSil}
        />
      )}

      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={arama}
              onChange={e => setArama(e.target.value)}
              placeholder="Batch no, sipariş no veya müşteri ara…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            type="button"
            onClick={onYenile}
            disabled={yukleniyor}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={yukleniyor ? 'animate-spin' : ''} />
            Yenile
          </button>
          {!yukleniyor && (
            <span className="text-xs text-gray-500 ml-auto">{filtrelenmis.length} batch</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {hata && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl mx-6 mt-6 px-4 py-3">
            <AlertCircle size={15} /> {hata}
          </div>
        )}
        {yukleniyor ? (
          <div className="p-6"><TableSkeleton satir={8} kolon={6} /></div>
        ) : filtrelenmis.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Factory size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Batch bulunamadı.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Batch No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Durum</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cam</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Siparişler</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Oluşturulma</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtrelenmis.map(emir => (
                  <tr key={emir.id} className="border-b border-gray-100 hover:bg-red-50/20 align-top">
                    <td className="px-4 py-3 font-mono font-bold text-gray-900">{emir.batch_no}</td>
                    <td className="px-4 py-3">
                      <StatusBadge durum={emir.durum} tip="uretim" />
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 font-medium">{emir.cam_sayisi ?? '—'}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {(emir.siparis_listesi ?? []).map(s => (
                          <span key={s.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                            {s.siparis_no}
                          </span>
                        ))}
                        {(emir.siparis_listesi ?? []).length === 0 && <span className="text-gray-300">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(emir.olusturulma_tarihi)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setSilinecek(emir)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-xs font-medium"
                      >
                        <Trash2 size={12} /> Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function SiparisSekmesi() {
  const [siparisler, setSiparisler] = useState<Siparis[]>([])
  const [toplamKayit, setToplamKayit] = useState(0)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [arama, setArama] = useState('')
  const [aramaGirdi, setAramaGirdi] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('hepsi')
  const [sayfa, setSayfa] = useState(1)
  const [silinecek, setSilinecek] = useState<Siparis | null>(null)
  const [siliniyor, setSiliniyor] = useState(false)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      let query = supabase
        .from('siparisler')
        .select('*, cari(ad, kod), siparis_detaylari(adet)', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (durumFiltre !== 'hepsi') {
        query = query.eq('durum', durumFiltre as SiparisDurum)
      }

      const q = arama.trim()
      if (q) {
        query = query.or(`siparis_no.ilike.%${q}%,alt_musteri.ilike.%${q}%,harici_siparis_no.ilike.%${q}%`)
      }

      const from = (sayfa - 1) * SAYFA_BOYUTU
      const to = from + SAYFA_BOYUTU - 1
      const { data, error, count } = await query.range(from, to)

      if (error) throw error
      setSiparisler((data ?? []) as Siparis[])
      setToplamKayit(count ?? 0)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Siparişler yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }, [arama, durumFiltre, sayfa])

  useEffect(() => { getir() }, [getir])

  const handleAra = (e: React.FormEvent) => {
    e.preventDefault()
    setSayfa(1)
    setArama(aramaGirdi)
  }

  const siparisUyari = (s: Siparis) => {
    if (['batchte', 'yikamada', 'eksik_var'].includes(s.durum)) {
      return 'Bu sipariş aktif bir batch\'e bağlı olabilir. Silmeden önce ilgili batch\'i silmeniz gerekebilir.'
    }
    return undefined
  }

  const handleSil = async () => {
    if (!silinecek) return
    setSiliniyor(true)
    try {
      const { error } = await supabase.from('siparisler').delete().eq('id', silinecek.id)
      if (error) throw error
      setSilinecek(null)
      await getir()
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : 'Silme başarısız.'
      alert(
        mesaj.includes('violates foreign key') || mesaj.includes('restrict')
          ? 'Bu sipariş bir batch\'e bağlı olduğu için silinemiyor. Önce ilgili batch\'i silin.'
          : mesaj,
      )
    } finally {
      setSiliniyor(false)
    }
  }

  return (
    <>
      {silinecek && (
        <SilmeOnayModal
          baslik="Siparişi Sil"
          aciklama={(
            <>
              <span className="font-mono font-semibold text-gray-900">{silinecek.siparis_no}</span>
              {' '}siparişi ve tüm cam detayları kalıcı olarak silinecek.
              {silinecek.cari?.ad && (
                <span className="block mt-1 text-gray-500">Müşteri: {silinecek.cari.ad}</span>
              )}
            </>
          )}
          uyari={siparisUyari(silinecek) ?? 'Bu işlem geri alınamaz.'}
          siliniyor={siliniyor}
          onKapat={() => !siliniyor && setSilinecek(null)}
          onOnayla={handleSil}
        />
      )}

      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0 space-y-3">
        <form onSubmit={handleAra} className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={aramaGirdi}
              onChange={e => setAramaGirdi(e.target.value)}
              placeholder="Sipariş no, ref no veya müşteri ara…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Ara
          </button>
          <button
            type="button"
            onClick={() => { setAramaGirdi(''); setArama(''); setSayfa(1) }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Temizle
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {SIPARIS_DURUMLARI.map(f => (
            <button
              key={f.deger}
              type="button"
              onClick={() => { setDurumFiltre(f.deger); setSayfa(1) }}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                durumFiltre === f.deger
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {f.etiket}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto flex flex-col min-h-0">
        {hata && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl mx-6 mt-6 px-4 py-3">
            <AlertCircle size={15} /> {hata}
          </div>
        )}
        {yukleniyor ? (
          <div className="p-6"><TableSkeleton satir={8} kolon={7} /></div>
        ) : siparisler.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Package size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Sipariş bulunamadı.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sipariş No</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Müşteri</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Adet</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tarih</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Durum</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {siparisler.map(s => {
                    const adet = s.siparis_detaylari?.reduce(
                      (sum, d) => sum + (d.adet ?? 0),
                      0,
                    ) ?? 0
                    return (
                      <tr key={s.id} className="border-b border-gray-100 hover:bg-red-50/20">
                        <td className="px-4 py-3 font-mono font-medium text-gray-800">{s.siparis_no}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-700">{s.cari?.ad ?? '—'}</div>
                          {s.alt_musteri && (
                            <div className="text-xs text-blue-600 mt-0.5">{s.alt_musteri}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{adet}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(s.tarih)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge durum={s.durum} tip="siparis" />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSilinecek(s)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-xs font-medium"
                          >
                            <Trash2 size={12} /> Sil
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              toplamKayit={toplamKayit}
              sayfaBoyutu={SAYFA_BOYUTU}
              mevcutSayfa={sayfa}
              onSayfaDegistir={setSayfa}
            />
          </>
        )}
      </div>
    </>
  )
}

export default function VeriYonetimiPanel() {
  const [altSekme, setAltSekme] = useState<AltSekme>('batch')
  const { emirler, yukleniyor, hata, sil, yenile } = useUretim()

  const handleBatchSil = async (emir: UretimEmri) => {
    await sil(emir.id)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Veri Yönetimi</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Batch ve sipariş kayıtlarını kalıcı olarak silin. Dikkatli kullanın.
            </p>
          </div>
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setAltSekme('batch')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              altSekme === 'batch' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Factory size={15} />
            Batch'ler
          </button>
          <button
            type="button"
            onClick={() => setAltSekme('siparis')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              altSekme === 'siparis' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Package size={15} />
            Siparişler
          </button>
        </div>
      </div>

      {altSekme === 'batch' ? (
        <BatchSekmesi
          emirler={emirler}
          yukleniyor={yukleniyor}
          hata={hata}
          onYenile={yenile}
          onSil={handleBatchSil}
        />
      ) : (
        <SiparisSekmesi />
      )}
    </div>
  )
}
