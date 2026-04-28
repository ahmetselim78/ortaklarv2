import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, ClipboardList, FileUp, Wrench } from 'lucide-react'
import Pagination from '@/components/ui/Pagination'
import EmptyState from '@/components/ui/EmptyState'
import { useSiparis } from '@/hooks/useSiparis'
import { useCari } from '@/hooks/useCari'
import { useStok } from '@/hooks/useStok'
import { supabase } from '@/lib/supabase'
import SiparisListesi from '@/components/siparis/SiparisListesi'
import SiparisForm from '@/components/siparis/SiparisForm'
import SiparisDetayModal from '@/components/siparis/SiparisDetayModal'
import PDFImportModal from '@/components/siparis/PDFImportModal'
import SevkiyatPlanModal from '@/components/siparis/SevkiyatPlanModal'
import type { Siparis, SiparisDurum } from '@/types/siparis'
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

export default function SiparisPage() {
  const { siparisler, yukleniyor, hata, ekle, guncelle, durumGuncelle, sil, yenile } = useSiparis()
  const { cariler } = useCari()
  const { stoklar, yenile: yenileStok } = useStok()
  const location = useLocation()

  const [formAcik, setFormAcik] = useState(false)
  const [pdfModalAcik, setPdfModalAcik] = useState(false)
  const [gorunenSiparis, setGorunenSiparis] = useState<Siparis | null>(null)
  const [iptalEdilecek, setIptalEdilecek] = useState<Siparis | null>(null)
  const [iptalEdiliyor, setIptalEdiliyor] = useState(false)
  const [silEdilecek, setSilEdilecek] = useState<Siparis | null>(null)
  const [silEdiliyor, setSilEdiliyor] = useState(false)
  const [pendingSevkiyat, setPendingSevkiyat] = useState<{ siparis_id: string; siparis_no: string; teslim_tarihi: string | null } | null>(null)
  const [durumFiltre, setDurumFiltre] = useState<DurumFiltre>('hepsi')
  const [sayfa, setSayfa] = useState(1)
  const SAYFA_BOYUTU = 20

  // Üretim emirleri panelinden gelen sipariş açma isteği — ref ile tek seferlik
  const pendingOpenId = useRef<string | null>((location.state as any)?.openSiparisId ?? null)

  useEffect(() => {
    if (pendingOpenId.current && siparisler.length > 0) {
      const found = siparisler.find((s) => s.id === pendingOpenId.current)
      if (found) {
        setGorunenSiparis(found)
        pendingOpenId.current = null
      }
    }
  }, [siparisler])

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

  const filtrelenmis = (() => {
    if (durumFiltre === 'hepsi') return siparisler
    if (durumFiltre === 'tamirde') return siparisler.filter(s => tamirdeSiparisIds.has(s.id))
    return siparisler.filter(s => s.durum === durumFiltre)
  })()

  const sayfali = filtrelenmis.slice((sayfa - 1) * SAYFA_BOYUTU, sayfa * SAYFA_BOYUTU)

  useEffect(() => { setSayfa(1) }, [durumFiltre])

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
      yenile()
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
          <p className="text-sm text-gray-500 mt-0.5">{siparisler.length} sipariş</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setPdfModalAcik(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <FileUp size={16} />
            PDF'den İçe Aktar
          </button>
          <button
            onClick={() => setFormAcik(true)}
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
          const count = isTamir
            ? tamirdeSiparisIds.size
            : deger === 'hepsi'
              ? siparisler.length
              : siparisler.filter(s => s.durum === deger).length
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

      {hata && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{hata}</div>
      )}

      {!yukleniyor && siparisler.length === 0 && !hata ? (
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
      ) : (
        <>
          <SiparisListesi
            siparisler={sayfali}
            yukleniyor={yukleniyor}
            tamirdeSiparisIds={tamirdeSiparisIds}
            onGoruntule={setGorunenSiparis}
            onIptal={setIptalEdilecek}
            onSil={setSilEdilecek}
            silGoster={durumFiltre === 'iptal'}
          />
          <Pagination
            toplamKayit={filtrelenmis.length}
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
          onKaydet={ekle}
          onKapat={() => setFormAcik(false)}
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
