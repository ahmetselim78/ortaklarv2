import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleX,
  Clock3,
  FileText,
  History,
  Pencil,
  Plus,
  Printer,
  Send,
  Upload,
} from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import {
  OzetKarti,
  TabloBos,
  TicariHata,
  TicariModBanner,
  YenileButonu,
} from '@/components/ticari/TicariOrtak'
import PageHeader from '@/components/ui/PageHeader'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { useTicariKaynak } from '@/hooks/useTicariKaynak'
import { ticariPara, ticariTarih } from '@/lib/ticariFormat'
import { cn } from '@/lib/utils'
import {
  fiyatOnizle,
  yeniIdempotencyAnahtari,
  teklifDurumDegistir,
  teklifRevizyonuOlustur,
  teklifleriGetir,
  teklifTicariBelgesineDonustur,
  ticariModDurumunuGetir,
} from '@/services/ticariService'
import type { Teklif, TeklifRevizyonu } from '@/types/ticari'
import TeklifFormModal from '@/components/teklif/TeklifFormModal'
import { teklifYazdir } from '@/components/teklif/teklifYazdir'
import PDFImportModal from '@/components/siparis/PDFImportModal'

const durumlar: Array<Teklif['durum'] | 'tumu'> = ['tumu', 'taslak', 'gonderildi', 'kabul_edildi', 'reddedildi']

const durumBilgisi: Record<Teklif['durum'], { label: string; className: string; icon: typeof Clock3 }> = {
  taslak: { label: 'Taslak', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
  gonderildi: { label: 'Gönderildi', className: 'bg-blue-50 text-blue-700', icon: Send },
  kabul_edildi: { label: 'Kabul edildi', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  reddedildi: { label: 'Reddedildi', className: 'bg-red-50 text-red-700', icon: CircleX },
}

function DurumRozeti({ durum }: { durum: Teklif['durum'] }) {
  const bilgi = durumBilgisi[durum] ?? durumBilgisi.taslak
  const Icon = bilgi.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold', bilgi.className)}>
      <Icon size={12} />
      {bilgi.label}
    </span>
  )
}

function revizyonNumarasi(revizyon: TeklifRevizyonu) {
  return revizyon.revizyon_kodu || `R${String(revizyon.revizyon_no).padStart(2, '0')}`
}

export default function TekliflerPage() {
  const kaynak = useTicariKaynak(teklifleriGetir)
  const modKaynak = useTicariKaynak(ticariModDurumunuGetir)
  const [durum, setDurum] = useState<Teklif['durum'] | 'tumu'>('tumu')
  const [arama, setArama] = useState('')
  const [acikTeklif, setAcikTeklif] = useState<string | null>(null)
  const [formDurumu, setFormDurumu] = useState<{
    teklif: Teklif | null
    revizyon: TeklifRevizyonu | null
  } | null>(null)
  const [aksiyonHata, setAksiyonHata] = useState<string | null>(null)
  const [islenenTeklif, setIslenenTeklif] = useState<string | null>(null)
  const [yazdirilanRevizyon, setYazdirilanRevizyon] = useState<string | null>(null)
  const [pdfImportAnahtari, setPdfImportAnahtari] = useState<string | null>(null)

  const cariler = useMemo(() => kaynak.veri?.cariler ?? [], [kaynak.veri?.cariler])
  const cariAdlari = useMemo(() => new Map(cariler.map(cari => [cari.id, `${cari.kod} · ${cari.ad}`])), [cariler])
  const revizyonlar = kaynak.veri?.revizyonlar ?? []
  const teklifler = useMemo(() => {
    const query = arama.toLocaleLowerCase('tr-TR')
    return [...(kaynak.veri?.teklifler ?? [])]
      .filter(teklif => durum === 'tumu' || teklif.durum === durum)
      .filter(teklif => !query || [
        teklif.teklif_no,
        teklif.cari_id ? cariAdlari.get(teklif.cari_id) : '',
      ].some(value => value?.toLocaleLowerCase('tr-TR').includes(query)))
      .sort((a, b) => (b.updated_at ?? b.created_at ?? '').localeCompare(a.updated_at ?? a.created_at ?? ''))
  }, [arama, cariAdlari, durum, kaynak.veri?.teklifler])

  const teklifRevizyonlari = (teklifId: string) => revizyonlar
    .filter(revizyon => revizyon.teklif_id === teklifId)
    .sort((a, b) => b.revizyon_no - a.revizyon_no)

  const sonRevizyon = (teklifId: string) => teklifRevizyonlari(teklifId)[0] ?? null

  const yeniTeklifAc = () => {
    if (modKaynak.veri?.mod !== 'aktif') {
      setAksiyonHata(
        modKaynak.veri?.mod === 'bakim'
          ? 'Bakım modunda yeni teklif oluşturulamaz.'
          : 'Yeni teklif oluşturmak için ticari modun aktif olması gerekir.',
      )
      return
    }
    setAksiyonHata(null)
    setFormDurumu({ teklif: null, revizyon: null })
  }

  const yeniRevizyonAc = (teklif: Teklif) => {
    if (modKaynak.veri?.mod !== 'aktif') {
      setAksiyonHata('Yeni teklif revizyonu yalnız aktif ticari modda oluşturulabilir.')
      return
    }
    const revizyon = sonRevizyon(teklif.id)
    if (!revizyon) {
      setAksiyonHata('Teklifin aktif revizyon snapshot’ı bulunamadı.')
      return
    }
    setAksiyonHata(null)
    setFormDurumu({ teklif, revizyon })
  }

  const durumDegistir = async (
    teklif: Teklif,
    yeniDurum: 'gonderildi' | 'kabul_edildi' | 'reddedildi',
  ) => {
    setIslenenTeklif(teklif.id)
    setAksiyonHata(null)
    try {
      await teklifDurumDegistir(
        teklif.id,
        teklif.revision_no,
        yeniDurum,
        yeniIdempotencyAnahtari(),
      )
      await kaynak.yenile()
    } catch (error) {
      setAksiyonHata(error instanceof Error ? error.message : 'Teklif durumu güncellenemedi.')
    } finally {
      setIslenenTeklif(null)
    }
  }

  const yazdir = async (teklif: Teklif, revizyon: TeklifRevizyonu) => {
    setYazdirilanRevizyon(revizyon.id)
    setAksiyonHata(null)
    try {
      await teklifYazdir(
        teklif,
        revizyon,
        teklif.cari_id ? cariAdlari.get(teklif.cari_id) ?? teklif.cari_id : 'Bağımsız müşteri',
      )
    } catch (error) {
      setAksiyonHata(error instanceof Error ? error.message : 'Teklif çıktısı hazırlanamadı.')
    } finally {
      setYazdirilanRevizyon(null)
    }
  }

  if (kaynak.yukleniyor && !kaynak.veri) {
    return <div className="mx-auto max-w-7xl p-6"><TableSkeleton satir={7} kolon={7} /></div>
  }

  const tumTeklifler = kaynak.veri?.teklifler ?? []

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader
        baslik="Bağımsız Teklifler"
        aciklama="Siparişe dönüşmeyen, sürümlü ve fiyat snapshot’ı taşıyan teklif belgeleri."
        icon={FileText}
        aksiyon={(
          <div className="flex items-center gap-2">
            <YenileButonu onClick={() => void kaynak.yenile()} yukleniyor={kaynak.yukleniyor} />
            <button
              type="button"
              onClick={() => setPdfImportAnahtari(yeniIdempotencyAnahtari())}
              disabled={modKaynak.yukleniyor || modKaynak.veri?.mod !== 'aktif'}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={16} /> PDF’den teklif
            </button>
            <button
              type="button"
              onClick={yeniTeklifAc}
              disabled={modKaynak.yukleniyor || modKaynak.veri?.mod !== 'aktif'}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} /> Yeni teklif
            </button>
          </div>
        )}
      />

      <TicariModBanner mod={modKaynak.veri?.mod} />
      {kaynak.hata && <TicariHata mesaj={kaynak.hata} />}
      {aksiyonHata && <TicariHata mesaj={aksiyonHata} />}
      {modKaynak.veri?.mod === 'bakim' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bakım modunda yeni teklif ve yeni revizyon kapalıdır. Mevcut teklifler görüntülenebilir, yazdırılabilir ve izin verilen durum geçişleri yapılabilir.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OzetKarti baslik="Toplam teklif" deger={tumTeklifler.length} icon={<FileText size={18} />} />
        <OzetKarti baslik="Taslak" deger={tumTeklifler.filter(teklif => teklif.durum === 'taslak').length} />
        <OzetKarti baslik="Gönderildi" deger={tumTeklifler.filter(teklif => teklif.durum === 'gonderildi').length} />
        <OzetKarti baslik="Kabul edildi" deger={tumTeklifler.filter(teklif => teklif.durum === 'kabul_edildi').length} />
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Bu listede gösterilen tutarlar sunucudaki teklif fiyat snapshot’larından gelir. Tarayıcı kesin toplam, KDV veya kâr hesabı yapmaz.
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap gap-3 border-b border-gray-100 p-3">
          <input
            type="search"
            value={arama}
            onChange={event => setArama(event.target.value)}
            placeholder="Teklif no veya müşteri ara…"
            className="min-w-[240px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex overflow-hidden rounded-lg border border-gray-200">
            {durumlar.map(secenek => (
              <button
                key={secenek}
                type="button"
                onClick={() => setDurum(secenek)}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors',
                  durum === secenek ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
                )}
              >
                {secenek === 'tumu' ? 'Tümü' : durumBilgisi[secenek].label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-12 px-4 py-3"><span className="sr-only">Revizyonlar</span></th>
                <th className="px-4 py-3">Teklif</th>
                <th className="px-4 py-3">Müşteri</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Son revizyon</th>
                <th className="px-4 py-3">Geçerlilik</th>
                <th className="px-4 py-3 text-right">Genel toplam</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {teklifler.map(teklif => {
                const teklifinRevizyonlari = teklifRevizyonlari(teklif.id)
                const son = sonRevizyon(teklif.id)
                const acik = acikTeklif === teklif.id
                return (
                  <Fragment key={teklif.id}>
                    <tr className="hover:bg-gray-50/70">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setAcikTeklif(acik ? null : teklif.id)}
                          aria-expanded={acik}
                          aria-label={`${teklif.teklif_no} revizyonlarını ${acik ? 'gizle' : 'göster'}`}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          {acik ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900">{teklif.teklif_no}</td>
                      <td className="px-4 py-3 text-gray-700">{teklif.cari_id ? cariAdlari.get(teklif.cari_id) ?? teklif.cari_id : 'Bağımsız müşteri'}</td>
                      <td className="px-4 py-3"><DurumRozeti durum={teklif.durum} /></td>
                      <td className="px-4 py-3 font-medium text-gray-700">{son ? revizyonNumarasi(son) : '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{ticariTarih(son?.gecerlilik_tarihi)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {son ? ticariPara(son.genel_toplam, son.para_birimi) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {son && (
                            <button
                              type="button"
                              onClick={() => void yazdir(teklif, son)}
                              disabled={yazdirilanRevizyon === son.id}
                              title="Markalı PDF / yazdır"
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                            >
                              <Printer size={15} />
                            </button>
                          )}
                          {son && (
                            <button
                              type="button"
                              onClick={() => yeniRevizyonAc(teklif)}
                              disabled={modKaynak.veri?.mod !== 'aktif' || islenenTeklif === teklif.id}
                              title={`Yeni R${String(son.revizyon_no + 1).padStart(2, '0')} taslağı`}
                              className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          {teklif.durum === 'taslak' && (
                            <button
                              type="button"
                              onClick={() => void durumDegistir(teklif, 'gonderildi')}
                              disabled={islenenTeklif === teklif.id}
                              title="Gönderildi olarak işaretle"
                              className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                            >
                              <Send size={15} />
                            </button>
                          )}
                          {teklif.durum === 'gonderildi' && (
                            <>
                              <button
                                type="button"
                                onClick={() => void durumDegistir(teklif, 'kabul_edildi')}
                                disabled={islenenTeklif === teklif.id}
                                title="Kabul edildi"
                                className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                              >
                                <CheckCircle2 size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void durumDegistir(teklif, 'reddedildi')}
                                disabled={islenenTeklif === teklif.id}
                                title="Reddedildi"
                                className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                              >
                                <CircleX size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {acik && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="rounded-xl border border-gray-200 bg-white">
                            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                              <History size={14} />
                              Revizyon geçmişi
                            </div>
                            <div className="divide-y divide-gray-100">
                              {teklifinRevizyonlari.map(revizyon => (
                                <div key={revizyon.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[90px_1fr_160px_180px_44px] sm:items-center">
                                  <span className="font-mono text-sm font-semibold text-gray-800">{revizyonNumarasi(revizyon)}</span>
                                  <span className="text-sm text-gray-600">{ticariTarih(revizyon.created_at, true)}</span>
                                  <span className="text-sm text-gray-600">Geçerlilik: {ticariTarih(revizyon.gecerlilik_tarihi)}</span>
                                  <span className="text-right text-sm font-semibold text-gray-900">{ticariPara(revizyon.genel_toplam, revizyon.para_birimi)}</span>
                                  <button
                                    type="button"
                                    onClick={() => void yazdir(teklif, revizyon)}
                                    disabled={yazdirilanRevizyon === revizyon.id}
                                    title={`${revizyonNumarasi(revizyon)} PDF / yazdır`}
                                    className="justify-self-end rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                                  >
                                    <Printer size={15} />
                                  </button>
                                </div>
                              ))}
                              {teklifinRevizyonlari.length === 0 && <TabloBos>Bu teklife ait revizyon yok.</TabloBos>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {teklifler.length === 0 && (
                <tr><td colSpan={8}><TabloBos>Filtreye uygun bağımsız teklif yok.</TabloBos></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formDurumu && (
        <TeklifFormModal
          cariler={cariler}
          stoklar={kaynak.veri?.stoklar ?? []}
          ticariMod={modKaynak.veri?.mod}
          teklif={formDurumu.teklif}
          revizyon={formDurumu.revizyon}
          onKaydedildi={async () => {
            await kaynak.yenile()
            setAksiyonHata(null)
          }}
          onKapat={() => setFormDurumu(null)}
        />
      )}
      {pdfImportAnahtari && (
        <PDFImportModal
          belgeTuru="teklif"
          cariler={cariler}
          stoklar={kaynak.veri?.stoklar ?? []}
          ticariMod={modKaynak.veri?.mod}
          onStokYenile={() => kaynak.yenile()}
          onFiyatOnizle={(form) => fiyatOnizle(teklifTicariBelgesineDonustur(form))}
          onIceAktar={async (form, onizleme) => {
            if (!onizleme?.sonuc.gecerli) {
              throw new Error('Geçerli kesin fiyat önizlemesi olmadan teklif kaydedilemez.')
            }
            const sonuc = await teklifRevizyonuOlustur({
              teklifId: null,
              beklenenRevisionNo: null,
              belge: teklifTicariBelgesineDonustur(form),
              onizlemeId: onizleme.onizleme_id,
              onizlemeHash: onizleme.sonuc_hash,
              idempotencyKey: pdfImportAnahtari,
            })
            await kaynak.yenile()
            return {
              id: String(sonuc.teklif_id),
              teklif_no: String(sonuc.teklif_no),
            }
          }}
          onKapat={() => setPdfImportAnahtari(null)}
        />
      )}
    </div>
  )
}
