import { useMemo, useState } from 'react'
import { Check, CheckCheck, Package, Printer, X } from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useEscape } from '@/hooks/useEscape'
import { kalanEtiketListeleriniOlustur } from '@/lib/kalanEtiketler'
import type { EtiketBasimSonucu } from '@/lib/etiketBasim'
import type { KalanEtiketCami } from '@/lib/kalanEtiketler'

interface Props {
  batchNo: string
  camlar: KalanEtiketCami[]
  onYazdir: (seciliListeAnahtarlari: ReadonlySet<string>) => Promise<EtiketBasimSonucu>
  onKapat: () => void
}

function listeMusterisi(musteri: string, nihaiMusteri: string): string {
  return nihaiMusteri ? `${musteri} — ${nihaiMusteri}` : musteri
}

export default function KalanEtiketlerModal({ batchNo, camlar, onYazdir, onKapat }: Props) {
  const listeler = useMemo(() => kalanEtiketListeleriniOlustur(camlar), [camlar])
  const basilabilirListeAnahtarlari = useMemo(
    () => listeler.filter(liste => liste.kalan > 0).map(liste => liste.key),
    [listeler],
  )
  const [seciliAnahtarlar, setSeciliAnahtarlar] = useState<Set<string>>(new Set())
  const [onayAcik, setOnayAcik] = useState(false)
  const [yazdiriliyor, setYazdiriliyor] = useState(false)
  const [sonuc, setSonuc] = useState<EtiketBasimSonucu | null>(null)

  const seciliListeler = useMemo(
    () => listeler.filter(liste => seciliAnahtarlar.has(liste.key) && liste.kalan > 0),
    [listeler, seciliAnahtarlar],
  )
  const seciliEtiketToplami = useMemo(
    () => seciliListeler.reduce((toplam, liste) => toplam + liste.kalan, 0),
    [seciliListeler],
  )
  const tumuSecili = basilabilirListeAnahtarlari.length > 0
    && basilabilirListeAnahtarlari.every(key => seciliAnahtarlar.has(key))

  useEscape(onKapat, !onayAcik && !yazdiriliyor)

  const toggleListe = (key: string) => {
    setSonuc(null)
    setSeciliAnahtarlar(mevcut => {
      const sonraki = new Set(mevcut)
      if (sonraki.has(key)) sonraki.delete(key)
      else sonraki.add(key)
      return sonraki
    })
  }

  const toggleTumu = () => {
    setSonuc(null)
    setSeciliAnahtarlar(tumuSecili ? new Set() : new Set(basilabilirListeAnahtarlari))
  }

  const handleOnayla = async () => {
    if (seciliEtiketToplami <= 0) return
    setYazdiriliyor(true)
    setSonuc(null)
    try {
      const baskiSonucu = await onYazdir(seciliAnahtarlar)
      setSonuc(baskiSonucu)
      if (baskiSonucu.durum === 'yaziciya_gonderildi') {
        setSeciliAnahtarlar(new Set())
      }
    } catch (error) {
      setSonuc({
        durum: 'basarisiz',
        mesaj: error instanceof Error ? error.message : 'Toplu etiket baskısı tamamlanamadı.',
      })
    } finally {
      setYazdiriliyor(false)
      setOnayAcik(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-950 text-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-gray-800 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Printer size={22} className="text-blue-400" />
              <h2 className="text-xl font-black">Geri Kalan Etiketleri Yazdır</h2>
            </div>
            <p className="mt-1 text-sm text-gray-400">
              <span className="font-mono font-bold text-blue-300">{batchNo}</span> içindeki sipariş listelerini seçin.
            </p>
          </div>
          <button
            type="button"
            onClick={onKapat}
            disabled={yazdiriliyor}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-800 hover:text-white disabled:opacity-40"
            aria-label="Kapat"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-800 bg-gray-900/70 px-6 py-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400">
              <strong className="text-white">{listeler.length}</strong> liste
            </span>
            <span className="text-gray-400">
              <strong className="text-amber-300">{listeler.reduce((toplam, liste) => toplam + liste.kalan, 0)}</strong> basılmayan etiket
            </span>
          </div>
          <button
            type="button"
            onClick={toggleTumu}
            disabled={basilabilirListeAnahtarlari.length === 0 || yazdiriliyor}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-xs font-bold text-gray-300 hover:bg-gray-800 disabled:opacity-40"
          >
            <CheckCheck size={15} />
            {tumuSecili ? 'Tüm Seçimi Kaldır' : 'Tüm Kalanları Seç'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto kumanda-scroll">
          {listeler.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center text-gray-500">
              <Package size={36} className="mb-3" />
              <p>Bu batch içinde sipariş listesi bulunamadı.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {listeler.map(liste => {
                const secili = seciliAnahtarlar.has(liste.key)
                const tamamlandi = liste.kalan === 0
                return (
                  <button
                    type="button"
                    key={liste.key}
                    onClick={() => !tamamlandi && toggleListe(liste.key)}
                    disabled={tamamlandi || yazdiriliyor}
                    className={`flex w-full items-center gap-4 px-6 py-4 text-left transition-colors ${
                      tamamlandi
                        ? 'cursor-not-allowed opacity-45'
                        : secili
                          ? 'bg-blue-950/60 hover:bg-blue-950/80'
                          : 'hover:bg-gray-900'
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                      secili ? 'border-blue-500 bg-blue-600' : tamamlandi ? 'border-emerald-800 bg-emerald-950' : 'border-gray-600'
                    }`}>
                      {(secili || tamamlandi) && <Check size={15} className={tamamlandi ? 'text-emerald-400' : 'text-white'} />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-base font-black text-white">{liste.siparis_no || '—'}</span>
                        {tamamlandi && (
                          <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                            Tamamlandı
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-gray-400">
                        {listeMusterisi(liste.musteri, liste.nihai_musteri) || '—'}
                      </span>
                    </span>

                    <span className="grid shrink-0 grid-cols-3 gap-5 text-right">
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-600">Toplam</span>
                        <span className="font-mono text-base font-bold text-gray-300">{liste.toplam}</span>
                      </span>
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-600">İşlendi</span>
                        <span className="font-mono text-base font-bold text-emerald-400">{liste.islenen}</span>
                      </span>
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-600">Basılmayan</span>
                        <span className="font-mono text-lg font-black text-amber-300">{liste.kalan}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {sonuc && (
          <div className={`mx-6 mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            sonuc.durum === 'yaziciya_gonderildi'
              ? 'border-emerald-800 bg-emerald-950/70 text-emerald-300'
              : 'border-red-800 bg-red-950/70 text-red-300'
          }`}>
            {sonuc.mesaj}
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-gray-800 bg-gray-900/70 px-6 py-4">
          <div className="text-sm text-gray-400">
            {seciliEtiketToplami > 0 ? (
              <>
                <strong className="text-white">{seciliListeler.length}</strong> liste seçili ·{' '}
                <strong className="text-amber-300">{seciliEtiketToplami} etiket</strong> basılacak
              </>
            ) : 'Yazdırılacak listeleri seçin'}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onKapat}
              disabled={yazdiriliyor}
              className="rounded-xl border border-gray-700 px-4 py-2.5 text-sm font-bold text-gray-300 hover:bg-gray-800 disabled:opacity-40"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={() => setOnayAcik(true)}
              disabled={seciliEtiketToplami === 0 || yazdiriliyor}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Printer size={17} />
              Etiketleri Bas
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        acik={onayAcik}
        baslik="Etiketleri Yazdır"
        mesaj={`Seçtiğiniz ${seciliListeler.length} listede toplam ${seciliEtiketToplami} etiket basılacak. Emin misiniz?`}
        onayButon="Evet, Etiketleri Bas"
        onayRenk="green"
        onOnayla={() => void handleOnayla()}
        onKapat={() => { if (!yazdiriliyor) setOnayAcik(false) }}
        yukleniyor={yazdiriliyor}
      />
    </div>
  )
}
