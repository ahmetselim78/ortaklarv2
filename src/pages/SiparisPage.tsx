import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, ClipboardList, FileUp, Wrench, Files, Search, X as XIcon } from 'lucide-react'
import Pagination from '@/components/ui/Pagination'
import EmptyState from '@/components/ui/EmptyState'
import { useSiparis } from '@/hooks/useSiparis'
import { useCari } from '@/hooks/useCari'
import { useStok } from '@/hooks/useStok'
import { useSiparisTaslaklari, taslakBosMu } from '@/hooks/useSiparisTaslaklari'
import { supabase } from '@/lib/supabase'
import SiparisListesi from '@/components/siparis/SiparisListesi'
import SiparisForm from '@/components/siparis/SiparisForm'
import SiparisDetayModal from '@/components/siparis/SiparisDetayModal'
import PDFImportModal from '@/components/siparis/PDFImportModal'
import SevkiyatPlanModal from '@/components/siparis/SevkiyatPlanModal'
import TaslaklarPanel from '@/components/siparis/TaslaklarPanel'
import type { Siparis, SiparisDurum } from '@/types/siparis'
import type { SiparisTaslakVerisi } from '@/types/taslak'
import { cn } from '@/lib/utils'

type DurumFiltre = 'hepsi' | 'tamirde' | SiparisDurum

const DURUM_FILTRELER: { deger: DurumFiltre; etiket: string }[] = [
  { deger: 'hepsi',       etiket: 'Hepsi' },
  { deger: 'beklemede',   etiket: 'Beklemede' },
  { deger: 'batchte',     etiket: 'Batch\'te' },
  { deger: 'yikamada',    etiket: 'Yıkamada' },
  { deger: 'tamamlandi',  etiket: 'Tamamlandı' },
  { deger: 'eksik_var',   etiket: 'Eksik Var' },
  { deger: 'iptal',       etiket: 'İptal' },
  { deger: 'tamirde',     etiket: 'Tamirde' },
]

const SAYFA_BOYUTU = 20
// Serbest metin aramasında her tuş vuruşunda sunucuya istek atmamak için debounce.
const ARAMA_DEBOUNCE_MS = 350

export default function SiparisPage() {
  const { siparisler, toplamKayit, durumSayilari, yukleniyor, hata, ekle, guncelle, durumGuncelle, sil, yenile, ekleIlerleme } = useSiparis()
  const { cariler } = useCari()
  const { stoklar, yenile: yenileStok } = useStok()
  const location = useLocation()

  const [formAcik, setFormAcik] = useState(false)
  const [pdfModalAcik, setPdfModalAcik] = useState(false)
  const [taslaklarAcik, setTaslaklarAcik] = useState(false)
  // Form taslaktan açıldıysa hangi taslak id güncellenmeli
  const [aktifTaslak, setAktifTaslak] = useState<{ id: string; veri: SiparisTaslakVerisi } | null>(null)
  const { taslaklar, upsert: taslakUpsert, sil: taslakSil } = useSiparisTaslaklari()
  const [gorunenSiparis, setGorunenSiparis] = useState<Siparis | null>(null)
  const [iptalEdilecek, setIptalEdilecek] = useState<Siparis | null>(null)
  const [iptalEdiliyor, setIptalEdiliyor] = useState(false)
  const [silEdilecek, setSilEdilecek] = useState<Siparis | null>(null)
  const [silEdiliyor, setSilEdiliyor] = useState(false)
  const [pendingSevkiyat, setPendingSevkiyat] = useState<{ siparis_id: string; siparis_no: string; teslim_tarihi: string | null } | null>(null)
  const [durumFiltre, setDurumFiltre] = useState<DurumFiltre>('hepsi')
  const [cariFiltre, setCariFiltre] = useState<string>('')
  const [altMusteriFiltre, setAltMusteriFiltre] = useState<string>('')
  const [altMusteriAramaDebounced, setAltMusteriAramaDebounced] = useState<string>('')
  const [sayfa, setSayfa] = useState(1)

  // Üretim emirleri panelinden gelen sipariş açma isteği — ref ile tek seferlik.
  // Liste artık sunucu tarafında sayfalandığı için hedef sipariş görünen sayfada
  // olmayabilir; bu yüzden listeden aranmaz, doğrudan id ile çekilir.
  const pendingOpenId = useRef<string | null>((location.state as any)?.openSiparisId ?? null)

  useEffect(() => {
    if (!pendingOpenId.current) return
    const id = pendingOpenId.current
    pendingOpenId.current = null
    ;(async () => {
      const { data } = await supabase
        .from('siparisler')
        .select('*, cari(ad, kod), siparis_detaylari(adet), sevkiyat_planlari(id, tarih)')
        .eq('id', id)
        .maybeSingle()
      if (data) setGorunenSiparis(data as Siparis)
    })()
  }, [])

  // Alt müşteri aramasını debounce'la (her tuş vuruşunda sunucu isteği atmasın)
  useEffect(() => {
    const t = setTimeout(() => setAltMusteriAramaDebounced(altMusteriFiltre), ARAMA_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [altMusteriFiltre])

  // Aktif tamir kaydı olan sipariş id'leri
  const [tamirdeSiparisIds, setTamirdeSiparisIds] = useState<Set<string>>(new Set())

  const tamirBilgisiGetir = useCallback(async () => {
    const { data } = await supabase
      .from('tamir_kayitlari')
      .select('siparis_detay_id, siparis_detaylari(siparis_id)')
      .in('durum', ['bekliyor'])
      .not('siparis_detay_id', 'is', null)

    const ids = new Set<string>()
    for (const row of data ?? []) {
      const sipId = (row as any).siparis_detaylari?.siparis_id
      if (sipId) ids.add(sipId)
    }
    setTamirdeSiparisIds(ids)
  }, [])

  useEffect(() => { tamirBilgisiGetir() }, [tamirBilgisiGetir])

  // Tamir değişimlerini realtime izle
  useEffect(() => {
    const ch = supabase
      .channel('tamir-siparis-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tamir_kayitlari' },
        () => tamirBilgisiGetir())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tamirBilgisiGetir])

  // Filtre/sayfa değiştiğinde sunucudan (yalnızca görünen sayfayı) yeniden çek.
  // "Tamirde" filtresi bir DB kolonu değil; tamirdeSiparisIds'ten türetilen id listesi
  // sunucuya .in('id', ...) olarak gönderilir (bkz. useSiparis.getir).
  useEffect(() => {
    yenile({
      durum: durumFiltre === 'hepsi' || durumFiltre === 'tamirde' ? undefined : durumFiltre,
      tamirdeIds: durumFiltre === 'tamirde' ? Array.from(tamirdeSiparisIds) : undefined,
      cariId: cariFiltre || undefined,
      altMusteri: altMusteriAramaDebounced || undefined,
      sayfa,
      sayfaBoyutu: SAYFA_BOYUTU,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durumFiltre, cariFiltre, altMusteriAramaDebounced, sayfa, tamirdeSiparisIds])

  useEffect(() => { setSayfa(1) }, [durumFiltre, cariFiltre, altMusteriAramaDebounced])

  const handleIptalOnayla = async () => {
    if (!iptalEdilecek) return
    setIptalEdiliyor(true)
    try {
      await durumGuncelle(iptalEdilecek.id, 'iptal')
    } finally {
      setIptalEdiliyor(false)
      setIptalEdilecek(null)
    }
  }

  const handleSilOnayla = async () => {
    if (!silEdilecek) return
    setSilEdiliyor(true)
    try {
      await sil(silEdilecek.id)
    } finally {
      setSilEdiliyor(false)
      setSilEdilecek(null)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Üst başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Siparişler</h1>
          <p className="text-sm text-gray-500 mt-0.5">{durumSayilari.hepsi} sipariş</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setTaslaklarAcik(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
              taslaklar.length > 0
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50',
            )}
            title="Yarım kalan sipariş girişlerine devam et"
          >
            <Files size={16} />
            Taslaklar
            {taslaklar.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none bg-amber-200 text-amber-800">
                {taslaklar.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setPdfModalAcik(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <FileUp size={16} />
            PDF'den İçe Aktar
          </button>
          <button
            onClick={() => { setAktifTaslak(null); setFormAcik(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Yeni Sipariş
          </button>
        </div>
      </div>

      {/* Durum Filtresi */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {DURUM_FILTRELER.map(({ deger, etiket }) => {
          const isTamir = deger === 'tamirde'
          // Rozet sayıları artık sunucudan gelir (durumSayilari) — sadece görünen
          // sayfadaki satırlardan değil, tüm tablodan doğru sayım.
          const count = isTamir ? tamirdeSiparisIds.size : (durumSayilari as Record<string, number>)[deger] ?? 0
          const aktif = durumFiltre === deger
          const hasCount = count > 0

          const NOKTA_RENK: Partial<Record<DurumFiltre, string>> = {
            beklemede: 'bg-gray-400',
            batchte:   'bg-blue-500',
            yikamada:  'bg-cyan-500',
            tamamlandi:'bg-green-500',
            eksik_var: 'bg-orange-500',
            iptal:     'bg-red-500',
            tamirde:   'bg-red-600',
          }

          return (
            <button
              key={deger}
              onClick={() => setDurumFiltre(deger)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                aktif
                  ? isTamir
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-blue-600 text-white border-blue-600'
                  : isTamir && hasCount
                    ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              )}
            >
              {isTamir && <Wrench size={11} />}
              {deger !== 'hepsi' && hasCount && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className={cn(
                    'animate-ping absolute inline-flex h-full w-full rounded-full opacity-60',
                    aktif ? 'bg-white' : NOKTA_RENK[deger] ?? 'bg-gray-400'
                  )} />
                  <span className={cn(
                    'relative inline-flex rounded-full h-1.5 w-1.5',
                    aktif ? 'bg-white' : NOKTA_RENK[deger] ?? 'bg-gray-400'
                  )} />
                </span>
              )}
              {etiket}
              {isTamir && hasCount && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-xs font-bold leading-none',
                  aktif ? 'bg-white/30 text-white' : 'bg-red-200 text-red-700'
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Müşteri / Alt Müşteri Filtresi */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <select
            value={cariFiltre}
            onChange={e => setCariFiltre(e.target.value)}
            className="w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Tüm müşteriler</option>
            {cariler
              .filter(c => c.tipi === 'musteri')
              .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
              .map(c => (
                <option key={c.id} value={c.id}>{c.ad}</option>
              ))}
          </select>
          {cariFiltre && (
            <button
              onClick={() => setCariFiltre('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={altMusteriFiltre}
            onChange={e => setAltMusteriFiltre(e.target.value)}
            placeholder="Alt müşteri ara..."
            className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {altMusteriFiltre && (
            <button
              onClick={() => setAltMusteriFiltre('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>
      </div>

      {hata && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{hata}</div>
      )}

      {/* Not: "hiç sipariş yok" boş durumu tüm tablo boşken gösterilir (durumSayilari.hepsi);
          bir filtreye takılıp görünen sayfada sonuç olmaması ayrı bir durumdur (aşağıda). */}
      {!yukleniyor && durumSayilari.hepsi === 0 && !hata ? (
        <EmptyState
          icon={ClipboardList}
          baslik="Henüz sipariş yok"
          aciklama={'Sağ üstteki "Yeni Sipariş" butonuyla ilk siparişinizi oluşturabilirsiniz.'}
          aksiyon={
            <button
              onClick={() => setFormAcik(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              Yeni Sipariş
            </button>
          }
        />
      ) : !yukleniyor && siparisler.length === 0 && !hata ? (
        <div className="py-16 text-center text-sm text-gray-400">
          Bu filtreye uyan sipariş bulunamadı.
        </div>
      ) : (
        <>
          <SiparisListesi
            siparisler={siparisler}
            yukleniyor={yukleniyor}
            tamirdeSiparisIds={tamirdeSiparisIds}
            onGoruntule={setGorunenSiparis}
            onIptal={setIptalEdilecek}
            onSil={setSilEdilecek}
            silGoster={durumFiltre === 'iptal'}
          />
          <Pagination
            toplamKayit={toplamKayit}
            sayfaBoyutu={SAYFA_BOYUTU}
            mevcutSayfa={sayfa}
            onSayfaDegistir={setSayfa}
          />
        </>
      )}

      {/* Yeni Sipariş Formu */}
      {formAcik && (
        <SiparisForm
          cariler={cariler}
          stoklar={stoklar}
          initialTaslak={aktifTaslak?.veri}
          ekleIlerleme={ekleIlerleme}
          onKaydet={async (form) => {
            const r = await ekle(form)
            // Başarılı kayıt → ilgili taslağı sil
            if (aktifTaslak) taslakSil(aktifTaslak.id)
            return r
          }}
          onTaslakKaydet={(veri) => {
            // Boş formu taslak olarak yazma
            if (taslakBosMu(veri)) {
              if (aktifTaslak) taslakSil(aktifTaslak.id)
              return
            }
            taslakUpsert(veri, aktifTaslak?.id)
          }}
          onKapat={() => { setFormAcik(false); setAktifTaslak(null) }}
        />
      )}

      {/* Taslaklar Listesi */}
      {taslaklarAcik && (
        <TaslaklarPanel
          taslaklar={taslaklar}
          cariler={cariler}
          onSec={(t) => {
            setAktifTaslak({ id: t.id, veri: t.veri })
            setTaslaklarAcik(false)
            setFormAcik(true)
          }}
          onSil={taslakSil}
          onKapat={() => setTaslaklarAcik(false)}
        />
      )}

      {/* Detay Modalı */}
      {gorunenSiparis && (
        <SiparisDetayModal
          siparis={gorunenSiparis}
          stoklar={stoklar}
          cariler={cariler}
          onGuncelle={guncelle}
          onStokYenile={yenileStok}
          onKapat={() => { setGorunenSiparis(null); yenile() }}
        />
      )}

      {/* PDF Import */}
      {pdfModalAcik && (
        <PDFImportModal
          cariler={cariler.filter((c) => c.tipi === 'musteri')}
          stoklar={stoklar}
          ekleIlerleme={ekleIlerleme}
          onIceAktar={async (form) => {
            const result = await ekle(form)
            yenile()
            return result
          }}
          onStokYenile={yenileStok}
          onKapat={() => { setPdfModalAcik(false); yenile() }}
        />
      )}

      {/* İptal Onayı */}
      {iptalEdilecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Sipariş İptal Edilsin mi?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{iptalEdilecek.siparis_no}</span> siparişi
              iptal durumuna alınacak. Bu işlem geri alınabilir.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIptalEdilecek(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Vazgeç
              </button>
              <button
                onClick={handleIptalOnayla}
                disabled={iptalEdiliyor}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {iptalEdiliyor ? 'İptal ediliyor...' : 'İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sevkiyat Planlama */}
      {pendingSevkiyat && (
        <SevkiyatPlanModal
          siparisId={pendingSevkiyat.siparis_id}
          siparisNo={pendingSevkiyat.siparis_no}
          teslimTarihi={pendingSevkiyat.teslim_tarihi}
          onKapat={() => setPendingSevkiyat(null)}
        />
      )}

      {/* Kalıcı Silme Onayı */}
      {silEdilecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Sipariş Kalıcı Silinsin mi?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{silEdilecek.siparis_no}</span> siparişi ve
              tüm detayları kalıcı olarak silinecek. Bu işlem <span className="font-semibold text-red-600">geri alınamaz</span>.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSilEdilecek(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Vazgeç
              </button>
              <button
                onClick={handleSilOnayla}
                disabled={silEdiliyor}
                className="px-4 py-2 text-sm rounded-lg bg-red-700 text-white font-medium hover:bg-red-800 disabled:opacity-50"
              >
                {silEdiliyor ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
