import {
  BadgeDollarSign,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  Copy,
  FileSpreadsheet,
  History,
  ListChecks,
  PackageSearch,
  Percent,
  Plus,
  Send,
  Settings2,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import {
  OzetKarti,
  SurumRozeti,
  TabloBos,
  TicariHata,
  TicariModBanner,
  YenileButonu,
} from '@/components/ticari/TicariOrtak'
import PageHeader from '@/components/ui/PageHeader'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { useTicariKaynak } from '@/hooks/useTicariKaynak'
import { cn } from '@/lib/utils'
import { ticariTarih } from '@/lib/ticariFormat'
import TicariTaslakExcelModal from '@/components/ticari/TicariTaslakExcelModal'
import TicariTaslakOlusturModal from '@/components/ticari/TicariTaslakOlusturModal'
import TicariEksikKayitRaporuModal from '@/components/ticari/TicariEksikKayitRaporuModal'
import TicariSurumKarsilastirmaModal from '@/components/ticari/TicariSurumKarsilastirmaModal'
import VergiVadeKurPaneli from '@/components/ticari/VergiVadeKurPaneli'
import {
  fiyatListesiSurumuKopyala,
  fiyatYonetiminiGetir,
  maliyetYonetiminiGetir,
  musteriProfilleriniGetir,
  readinessKontroluOnayla,
  readinessRaporunuGetir,
  surumKopyala,
  surumYayinla,
  ticariModuDegistir,
  ticariModDurumunuGetir,
  yeniIdempotencyAnahtari,
  type TicariEksikKayitRaporTuru,
} from '@/services/ticariService'
import type {
  FiyatListesiSurumu,
  MaliyetReceteSurumu,
  MaliyetTarifeSurumu,
  MusteriTicariProfilSurumu,
  SurumDurumu,
  TicariMod,
} from '@/types/ticari'

type Sekme = 'fiyat' | 'maliyet' | 'recete' | 'profil' | 'ayarlar' | 'hazirlik'

const sekmeler: Array<{ id: Sekme; label: string; icon: typeof BadgeDollarSign }> = [
  { id: 'fiyat', label: 'Satış Fiyatları', icon: BadgeDollarSign },
  { id: 'maliyet', label: 'Maliyet Tarifeleri', icon: Percent },
  { id: 'recete', label: 'Maliyet Reçeteleri', icon: BookOpenCheck },
  { id: 'profil', label: 'Müşteri Profilleri', icon: UsersRound },
  { id: 'ayarlar', label: 'KDV, Vade ve Kur', icon: Settings2 },
  { id: 'hazirlik', label: 'Readiness', icon: ListChecks },
]

const readinessEksikRaporlari: Partial<Record<string, TicariEksikKayitRaporTuru>> = {
  satis_fiyati_kapsami: 'satis_fiyati',
  recete_kapsami: 'recete',
  recete_bileseni_maliyetleri: 'maliyet',
  yayinda_maliyet_tarifesi: 'maliyet',
  musteri_ticari_profilleri: 'profil',
}

type OrtakSurum = {
  id: string
  surum_no: number
  durum: SurumDurumu
  gecerli_baslangic: string | null
  gecerli_bitis: string | null
  yayinlanma_tarihi: string | null
  revision_no: number
  created_at: string | null
}

function hamAlan(kayit: object, alanlar: string[]) {
  const ham = kayit as Record<string, unknown>
  for (const alan of alanlar) {
    const value = ham[alan]
    if (typeof value === 'string') return value
  }
  return ''
}

function sonSurum<T extends OrtakSurum>(surumler: T[]) {
  return [...surumler].sort((a, b) => {
    if (a.surum_no !== b.surum_no) return b.surum_no - a.surum_no
    return (b.created_at ?? '').localeCompare(a.created_at ?? '')
  })[0] ?? null
}

function SurumTarihleri({ surum }: { surum: OrtakSurum }) {
  return (
    <span>
      {ticariTarih(surum.gecerli_baslangic)}
      <span className="px-1 text-gray-400">–</span>
      {surum.gecerli_bitis ? ticariTarih(surum.gecerli_bitis) : 'Süresiz'}
    </span>
  )
}

function IslemMesaji({ hata, basari }: { hata: string | null; basari: string | null }) {
  return (
    <>
      {hata && <TicariHata mesaj={hata} />}
      {basari && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} />
          {basari}
        </div>
      )}
    </>
  )
}

function useAal2Aksiyon() {
  const { access } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  return () => {
    if (access?.aal === 'aal2') return true
    navigate('/mfa', { state: { from: `${location.pathname}${location.search}` } })
    return false
  }
}

function FiyatListeleriPaneli() {
  const kaynak = useTicariKaynak(fiyatYonetiminiGetir)
  const { hasPermission } = useAuth()
  const aal2Dogrula = useAal2Aksiyon()
  const [islenen, setIslenen] = useState<string | null>(null)
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null)
  const [basari, setBasari] = useState<string | null>(null)
  const [yeniAcik, setYeniAcik] = useState(false)
  const [duzenlenen, setDuzenlenen] = useState<{
    surum: FiyatListesiSurumu
    baslik: string
  } | null>(null)
  const [gecmis, setGecmis] = useState<{
    baslik: string
    surumler: FiyatListesiSurumu[]
  } | null>(null)
  const listeler = kaynak.veri?.listeler ?? []
  const surumler = kaynak.veri?.surumler ?? []

  const yayinla = async (surum: FiyatListesiSurumu) => {
    if (!aal2Dogrula()) return
    if (!window.confirm(`Fiyat listesi S${surum.surum_no} yayınlansın mı? Yayınlanan sürüm değiştirilemez.`)) return
    setIslenen(surum.id)
    setIslemHatasi(null)
    setBasari(null)
    try {
      await surumYayinla('fiyat_listesi_surumu_yayinla', surum.id, surum.revision_no, yeniIdempotencyAnahtari())
      setBasari(`S${surum.surum_no} fiyat sürümü yayınlandı.`)
      await kaynak.yenile()
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : 'Fiyat sürümü yayınlanamadı.')
    } finally {
      setIslenen(null)
    }
  }

  const kopyala = async (surum: FiyatListesiSurumu) => {
    setIslenen(surum.id)
    setIslemHatasi(null)
    setBasari(null)
    try {
      await fiyatListesiSurumuKopyala(surum.id)
      setBasari(`S${surum.surum_no} sürümünden yeni taslak oluşturuldu.`)
      await kaynak.yenile()
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : 'Taslak sürüm oluşturulamadı.')
    } finally {
      setIslenen(null)
    }
  }

  if (kaynak.yukleniyor && !kaynak.veri) return <TableSkeleton satir={6} kolon={6} />

  const yayinSayisi = surumler.filter(surum => surum.durum === 'yayinda').length
  const taslakSayisi = surumler.filter(surum => surum.durum === 'taslak').length

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <OzetKarti baslik="Fiyat listesi" deger={listeler.length} icon={<BadgeDollarSign size={18} />} />
        <OzetKarti baslik="Yayındaki sürüm" deger={yayinSayisi} />
        <OzetKarti baslik="Taslak" deger={taslakSayisi} />
      </div>
      {kaynak.hata && <TicariHata mesaj={kaynak.hata} />}
      <IslemMesaji hata={islemHatasi} basari={basari} />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Tarihçeli satış fiyat listeleri</h2>
            <p className="mt-0.5 text-xs text-gray-500">Kesin fiyatlar sürüm snapshot’larından çözülür; stok kartı fiyatı burada kullanılmaz.</p>
          </div>
          <div className="flex items-center gap-2">
            {hasPermission('pricing', 'create') && (
              <button type="button" onClick={() => setYeniAcik(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                <Plus size={14} /> Yeni liste
              </button>
            )}
            <YenileButonu onClick={() => void kaynak.yenile()} yukleniyor={kaynak.yukleniyor} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Liste</th>
                <th className="px-4 py-3">Tür</th>
                <th className="px-4 py-3">Son sürüm</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Geçerlilik</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listeler.map(liste => {
                const listeSurumleri = surumler.filter(surum => surum.fiyat_listesi_id === liste.id)
                const surum = sonSurum(listeSurumleri)
                return (
                  <tr key={liste.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{liste.ad}</p>
                      <p className="text-xs text-gray-500">{liste.kod ?? liste.id}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{liste.tur === 'musteri' ? 'Müşteri katmanı' : 'Ana liste'}</td>
                    <td className="px-4 py-3 font-medium text-gray-700">{surum ? `S${surum.surum_no}` : '—'}</td>
                    <td className="px-4 py-3">{surum ? <SurumRozeti durum={surum.durum} /> : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{surum ? <SurumTarihleri surum={surum} /> : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {listeSurumleri.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setGecmis({ baslik: liste.ad, surumler: listeSurumleri })}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <History size={13} />
                            Sürümler
                          </button>
                        )}
                        {surum?.durum === 'taslak' && hasPermission('pricing', 'update') && (
                          <button
                            type="button"
                            onClick={() => setDuzenlenen({ surum, baslik: liste.ad })}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          >
                            <FileSpreadsheet size={13} />
                            Kalemler / Excel
                          </button>
                        )}
                        {surum?.durum === 'yayinda' && hasPermission('pricing', 'update') && (
                          <button
                            type="button"
                            disabled={islenen === surum.id}
                            onClick={() => void kopyala(surum)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Copy size={13} />
                            Taslak kopyala
                          </button>
                        )}
                        {surum?.durum === 'taslak' && hasPermission('pricing', 'manage') && (
                          <button
                            type="button"
                            disabled={islenen === surum.id}
                            onClick={() => void yayinla(surum)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            <Send size={13} />
                            Yayınla
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {listeler.length === 0 && (
                <tr><td colSpan={6}><TabloBos>Henüz fiyat listesi oluşturulmamış.</TabloBos></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {duzenlenen && (
        <TicariTaslakExcelModal
          tur="fiyat"
          surumId={duzenlenen.surum.id}
          surumNo={duzenlenen.surum.surum_no}
          revisionNo={duzenlenen.surum.revision_no}
          baslik={duzenlenen.baslik}
          onKaydedildi={kaynak.yenile}
          onKapat={() => setDuzenlenen(null)}
        />
      )}
      {yeniAcik && (
        <TicariTaslakOlusturModal
          tur="fiyat"
          onKaydedildi={kaynak.yenile}
          onKapat={() => setYeniAcik(false)}
        />
      )}
      {gecmis && (
        <TicariSurumKarsilastirmaModal
          tur="fiyat"
          baslik={gecmis.baslik}
          surumler={gecmis.surumler}
          onKapat={() => setGecmis(null)}
        />
      )}
    </div>
  )
}

function MaliyetPaneli({ recete }: { recete: boolean }) {
  const kaynak = useTicariKaynak(maliyetYonetiminiGetir)
  const { hasPermission } = useAuth()
  const aal2Dogrula = useAal2Aksiyon()
  const [islenen, setIslenen] = useState<string | null>(null)
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null)
  const [basari, setBasari] = useState<string | null>(null)
  const [duzenlenen, setDuzenlenen] = useState<{
    surum: MaliyetTarifeSurumu | MaliyetReceteSurumu
    baslik: string
  } | null>(null)
  const [gecmis, setGecmis] = useState<{
    baslik: string
    surumler: Array<MaliyetTarifeSurumu | MaliyetReceteSurumu>
  } | null>(null)
  const [yeniAcik, setYeniAcik] = useState(false)

  if (kaynak.yukleniyor && !kaynak.veri) return <TableSkeleton satir={6} kolon={6} />

  const anaKayitlar = recete ? kaynak.veri?.receteler ?? [] : kaynak.veri?.tarifeler ?? []
  const surumler = recete ? kaynak.veri?.receteSurumleri ?? [] : kaynak.veri?.tarifeSurumleri ?? []

  const parentId = (surum: MaliyetTarifeSurumu | MaliyetReceteSurumu) => (
    recete
      ? hamAlan(surum, ['recete_id', 'urun_maliyet_recetesi_id'])
      : hamAlan(surum, ['maliyet_tarifesi_id'])
  )

  const yayinla = async (surum: MaliyetTarifeSurumu | MaliyetReceteSurumu) => {
    if (!aal2Dogrula()) return
    const tur = recete ? 'reçete' : 'maliyet tarifesi'
    if (!window.confirm(`S${surum.surum_no} ${tur} sürümü yayınlansın mı? Yayınlanan kayıt değiştirilemez.`)) return
    setIslenen(surum.id)
    setIslemHatasi(null)
    setBasari(null)
    try {
      await surumYayinla(
        recete ? 'maliyet_recete_surumu_yayinla' : 'maliyet_tarife_surumu_yayinla',
        surum.id,
        surum.revision_no,
        yeniIdempotencyAnahtari(),
      )
      setBasari(`S${surum.surum_no} ${tur} sürümü yayınlandı.`)
      await kaynak.yenile()
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : `${tur} yayınlanamadı.`)
    } finally {
      setIslenen(null)
    }
  }

  const kopyala = async (surum: MaliyetTarifeSurumu | MaliyetReceteSurumu) => {
    setIslenen(surum.id)
    setIslemHatasi(null)
    setBasari(null)
    try {
      await surumKopyala(
        recete ? 'maliyet_recete_surumu_kopyala' : 'maliyet_tarife_surumu_kopyala',
        surum.id,
      )
      setBasari(`S${surum.surum_no} sürümünden yeni taslak oluşturuldu.`)
      await kaynak.yenile()
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : 'Taslak sürüm oluşturulamadı.')
    } finally {
      setIslenen(null)
    }
  }

  const yayindaki = surumler.filter(surum => surum.durum === 'yayinda').length
  const taslak = surumler.filter(surum => surum.durum === 'taslak').length

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <OzetKarti baslik={recete ? 'Ürün reçetesi' : 'Maliyet tarifesi'} deger={anaKayitlar.length} icon={recete ? <BookOpenCheck size={18} /> : <Percent size={18} />} />
        <OzetKarti baslik="Yayındaki sürüm" deger={yayindaki} />
        <OzetKarti baslik="Taslak" deger={taslak} />
      </div>
      {kaynak.hata && <TicariHata mesaj={kaynak.hata} />}
      <IslemMesaji hata={islemHatasi} basari={basari} />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{recete ? 'Sürümlü ürün maliyet reçeteleri' : 'Sürümlü maliyet tarifeleri'}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {recete ? 'Sipariş snapshot’ı mantıksal reçeteyi ve kullanılan reçete sürümünü birlikte saklar.' : 'Fire yalnız ilgili maliyet bileşeninin tüketimine uygulanır.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasPermission('pricing', 'create') && (
              <button type="button" onClick={() => setYeniAcik(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                <Plus size={14} /> Yeni {recete ? 'reçete' : 'tarife'}
              </button>
            )}
            <YenileButonu onClick={() => void kaynak.yenile()} yukleniyor={kaynak.yukleniyor} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">{recete ? 'Reçete' : 'Tarife'}</th>
                <th className="px-4 py-3">Son sürüm</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Geçerlilik</th>
                <th className="px-4 py-3">Yayın</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {anaKayitlar.map(kayit => {
                const ilgiliSurumler = surumler.filter(surum => parentId(surum) === kayit.id)
                const surum = sonSurum(ilgiliSurumler)
                return (
                  <tr key={kayit.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{kayit.ad}</p>
                      <p className="text-xs text-gray-500">{kayit.kod ?? kayit.id}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-700">{surum ? `S${surum.surum_no}` : '—'}</td>
                    <td className="px-4 py-3">{surum ? <SurumRozeti durum={surum.durum} /> : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{surum ? <SurumTarihleri surum={surum} /> : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{surum ? ticariTarih(surum.yayinlanma_tarihi, true) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                      {ilgiliSurumler.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setGecmis({ baslik: kayit.ad, surumler: ilgiliSurumler })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <History size={13} />
                          Sürümler
                        </button>
                      )}
                      {surum?.durum === 'taslak' && hasPermission('pricing', 'update') && (
                        <button
                          type="button"
                          onClick={() => setDuzenlenen({ surum, baslik: kayit.ad })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <FileSpreadsheet size={13} />
                          Kalemler / Excel
                        </button>
                      )}
                      {surum?.durum === 'yayinda' && hasPermission('pricing', 'update') && (
                        <button
                          type="button"
                          disabled={islenen === surum.id}
                          onClick={() => void kopyala(surum)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Copy size={13} />
                          Taslak kopyala
                        </button>
                      )}
                      {surum?.durum === 'taslak' && hasPermission('pricing', 'manage') && (
                        <button
                          type="button"
                          disabled={islenen === surum.id}
                          onClick={() => void yayinla(surum)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Send size={13} />
                          Yayınla
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {anaKayitlar.length === 0 && (
                <tr><td colSpan={6}><TabloBos>Henüz {recete ? 'maliyet reçetesi' : 'maliyet tarifesi'} oluşturulmamış.</TabloBos></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {duzenlenen && (
        <TicariTaslakExcelModal
          tur={recete ? 'recete' : 'maliyet'}
          surumId={duzenlenen.surum.id}
          surumNo={duzenlenen.surum.surum_no}
          revisionNo={duzenlenen.surum.revision_no}
          baslik={duzenlenen.baslik}
          onKaydedildi={kaynak.yenile}
          onKapat={() => setDuzenlenen(null)}
        />
      )}
      {yeniAcik && (
        <TicariTaslakOlusturModal
          tur={recete ? 'recete' : 'maliyet'}
          onKaydedildi={kaynak.yenile}
          onKapat={() => setYeniAcik(false)}
        />
      )}
      {gecmis && (
        <TicariSurumKarsilastirmaModal
          tur={recete ? 'recete' : 'maliyet'}
          baslik={gecmis.baslik}
          surumler={gecmis.surumler}
          onKapat={() => setGecmis(null)}
        />
      )}
    </div>
  )
}

function ProfillerPaneli() {
  const kaynak = useTicariKaynak(musteriProfilleriniGetir)
  const { hasPermission } = useAuth()
  const aal2Dogrula = useAal2Aksiyon()
  const [islenen, setIslenen] = useState<string | null>(null)
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null)
  const [basari, setBasari] = useState<string | null>(null)
  const [yeniAcik, setYeniAcik] = useState(false)
  const [duzenlenenProfil, setDuzenlenenProfil] = useState<
    (MusteriTicariProfilSurumu & { cari_id: string }) | null
  >(null)
  const [gecmis, setGecmis] = useState<{
    baslik: string
    surumler: MusteriTicariProfilSurumu[]
  } | null>(null)

  if (kaynak.yukleniyor && !kaynak.veri) return <TableSkeleton satir={6} kolon={7} />

  const profiller = kaynak.veri?.profiller ?? []
  const surumler = kaynak.veri?.surumler ?? []
  const cariAdlari = new Map((kaynak.veri?.cariler ?? []).map(cari => [cari.id, `${cari.kod} · ${cari.ad}`]))
  const parentId = (surum: MusteriTicariProfilSurumu) => hamAlan(surum, ['musteri_ticari_profili_id', 'profil_id'])

  const yayinla = async (surum: MusteriTicariProfilSurumu) => {
    if (!aal2Dogrula()) return
    if (!window.confirm(`Müşteri profili S${surum.surum_no} yayınlansın mı?`)) return
    setIslenen(surum.id)
    setIslemHatasi(null)
    setBasari(null)
    try {
      await surumYayinla('musteri_ticari_profil_surumu_yayinla', surum.id, surum.revision_no, yeniIdempotencyAnahtari())
      setBasari(`S${surum.surum_no} müşteri profili yayınlandı.`)
      await kaynak.yenile()
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : 'Müşteri profili yayınlanamadı.')
    } finally {
      setIslenen(null)
    }
  }

  const kopyala = async (surum: MusteriTicariProfilSurumu) => {
    setIslenen(surum.id)
    setIslemHatasi(null)
    setBasari(null)
    try {
      await surumKopyala('musteri_ticari_profil_surumu_kopyala', surum.id)
      setBasari(`S${surum.surum_no} müşteri profilinden yeni taslak oluşturuldu.`)
      await kaynak.yenile()
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : 'Müşteri profili taslağı oluşturulamadı.')
    } finally {
      setIslenen(null)
    }
  }

  return (
    <div className="space-y-4">
      {kaynak.hata && <TicariHata mesaj={kaynak.hata} />}
      <IslemMesaji hata={islemHatasi} basari={basari} />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Müşteri ticari profilleri</h2>
            <p className="mt-0.5 text-xs text-gray-500">Para birimi, vade, fiyat katmanı ve minimum marj varsayımları sürümlü tutulur.</p>
          </div>
          <div className="flex items-center gap-2">
            {hasPermission('pricing', 'create') && (
              <button type="button" onClick={() => setYeniAcik(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                <Plus size={14} /> Yeni profil
              </button>
            )}
            <YenileButonu onClick={() => void kaynak.yenile()} yukleniyor={kaynak.yukleniyor} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Müşteri</th>
                <th className="px-4 py-3">Sürüm</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Para birimi</th>
                <th className="px-4 py-3">Vade</th>
                <th className="px-4 py-3">Minimum marj</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {profiller.map(profil => {
                const profilSurumleri = surumler.filter(item => parentId(item) === profil.id)
                const surum = sonSurum(profilSurumleri)
                return (
                  <tr key={profil.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 font-medium text-gray-900">{cariAdlari.get(profil.cari_id) ?? profil.cari_id}</td>
                    <td className="px-4 py-3 text-gray-700">{surum ? `S${surum.surum_no}` : '—'}</td>
                    <td className="px-4 py-3">{surum ? <SurumRozeti durum={surum.durum} /> : '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-700">{surum?.varsayilan_para_birimi ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{surum ? `${surum.varsayilan_vade_gunu} gün` : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{surum?.minimum_marj_yuzdesi_override == null ? 'Varsayılan' : `%${surum.minimum_marj_yuzdesi_override}`}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                      {profilSurumleri.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setGecmis({
                            baslik: cariAdlari.get(profil.cari_id) ?? profil.cari_id,
                            surumler: profilSurumleri,
                          })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <History size={13} />
                          Sürümler
                        </button>
                      )}
                      {surum?.durum === 'taslak' && hasPermission('pricing', 'update') && (
                        <button
                          type="button"
                          onClick={() => setDuzenlenenProfil({ ...surum, cari_id: profil.cari_id })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <Settings2 size={13} />
                          Düzenle
                        </button>
                      )}
                      {surum?.durum === 'yayinda' && hasPermission('pricing', 'update') && (
                        <button
                          type="button"
                          disabled={islenen === surum.id}
                          onClick={() => void kopyala(surum)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Copy size={13} />
                          Taslak kopyala
                        </button>
                      )}
                      {surum?.durum === 'taslak' && hasPermission('pricing', 'manage') && (
                        <button
                          type="button"
                          disabled={islenen === surum.id}
                          onClick={() => void yayinla(surum)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Send size={13} />
                          Yayınla
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {profiller.length === 0 && (
                <tr><td colSpan={7}><TabloBos>Henüz müşteri ticari profili oluşturulmamış.</TabloBos></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {yeniAcik && (
        <TicariTaslakOlusturModal
          tur="profil"
          onKaydedildi={kaynak.yenile}
          onKapat={() => setYeniAcik(false)}
        />
      )}
      {duzenlenenProfil && (
        <TicariTaslakOlusturModal
          tur="profil"
          profilTaslagi={duzenlenenProfil}
          onKaydedildi={kaynak.yenile}
          onKapat={() => setDuzenlenenProfil(null)}
        />
      )}
      {gecmis && (
        <TicariSurumKarsilastirmaModal
          tur="profil"
          baslik={gecmis.baslik}
          surumler={gecmis.surumler}
          onKapat={() => setGecmis(null)}
        />
      )}
    </div>
  )
}

function ReadinessPaneli() {
  const kaynak = useTicariKaynak(readinessRaporunuGetir)
  const modKaynak = useTicariKaynak(ticariModDurumunuGetir)
  const { hasPermission } = useAuth()
  const aal2Dogrula = useAal2Aksiyon()
  const [islenen, setIslenen] = useState<string | null>(null)
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null)
  const [basari, setBasari] = useState<string | null>(null)
  const [eksikRaporu, setEksikRaporu] = useState<TicariEksikKayitRaporTuru | null>(null)
  const kontroller = kaynak.veri?.kontroller ?? []
  const mod = modKaynak.veri?.mod ?? kaynak.veri?.mod ?? null

  const hedefModlar = useMemo((): TicariMod[] => {
    if (mod === 'hazirlik') return ['golge']
    if (mod === 'golge') return ['hazirlik', 'aktif']
    if (mod === 'aktif') return ['bakim']
    if (mod === 'bakim') return ['aktif']
    return []
  }, [mod])

  const kontroluOnayla = async (kod: string, revisionNo: number | null) => {
    if (revisionNo == null || !aal2Dogrula()) return
    const gerekce = window.prompt('Manuel readiness onay gerekçesini yazın:')
    if (!gerekce?.trim()) return
    setIslenen(`kontrol:${kod}`)
    setIslemHatasi(null)
    setBasari(null)
    try {
      await readinessKontroluOnayla(kod, revisionNo, gerekce.trim(), yeniIdempotencyAnahtari())
      setBasari(`${kod} readiness kontrolü onaylandı.`)
      await kaynak.yenile()
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : 'Readiness kontrolü onaylanamadı.')
    } finally {
      setIslenen(null)
    }
  }

  const moduDegistir = async (hedef: TicariMod) => {
    const revisionNo = modKaynak.veri?.revision_no
    if (revisionNo == null || !aal2Dogrula()) return
    const gerekce = window.prompt(`Ticari mod ${hedef} olarak değiştirilecek. Gerekçeyi yazın:`)
    if (!gerekce?.trim()) return
    setIslenen(`mod:${hedef}`)
    setIslemHatasi(null)
    setBasari(null)
    try {
      await ticariModuDegistir(hedef, revisionNo, gerekce.trim(), yeniIdempotencyAnahtari())
      setBasari(`Ticari mod ${hedef} olarak değiştirildi.`)
      await Promise.all([kaynak.yenile(), modKaynak.yenile()])
    } catch (error) {
      setIslemHatasi(error instanceof Error ? error.message : 'Ticari mod değiştirilemedi.')
    } finally {
      setIslenen(null)
    }
  }

  if (kaynak.yukleniyor && !kaynak.veri) return <TableSkeleton satir={8} kolon={3} />

  return (
    <div className="space-y-4">
      {kaynak.hata && <TicariHata mesaj={kaynak.hata} />}
      {modKaynak.hata && <TicariHata mesaj={modKaynak.hata} />}
      <IslemMesaji hata={islemHatasi} basari={basari} />
      {kaynak.veri && (
        <div className={cn(
          'flex items-start gap-3 rounded-xl border p-4',
          kaynak.veri.uygun
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-800',
        )}>
          {kaynak.veri.uygun ? <CheckCircle2 size={21} /> : <CircleAlert size={21} />}
          <div>
            <p className="font-semibold">{kaynak.veri.uygun ? 'Aktivasyon için kritik engel yok' : 'Ticari mod aktive edilemez'}</p>
            <p className="mt-1 text-sm opacity-80">
              Bu rapor yalnız veritabanı readiness RPC’sinden gelir; ekran kontrolleri feature gate’i tek başına açamaz.
            </p>
          </div>
        </div>
      )}
      {hasPermission('admin', 'manage') && mod && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <p className="text-sm font-semibold text-gray-900">Feature mode geçişi</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Mevcut mod: <span className="font-semibold">{mod}</span>. Geçişler AAL2, optimistic locking ve readiness ile korunur.
              </p>
            </div>
            {hedefModlar.map(hedef => (
              <button
                key={hedef}
                type="button"
                disabled={
                  islenen != null
                  || (hedef === 'aktif' && kaynak.veri?.uygun !== true)
                }
                onClick={() => void moduDegistir(hedef)}
                className={cn(
                  'rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
                  hedef === 'bakim' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700',
                )}
              >
                {hedef} moduna geç
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Canlıya geçiş kontrolleri</h2>
            <p className="mt-0.5 text-xs text-gray-500">Fiyat, maliyet, reçete, KDV, kur, profil, bakiye, güvenlik ve test uygunluğu.</p>
          </div>
          <YenileButonu onClick={() => void kaynak.yenile()} yukleniyor={kaynak.yukleniyor} />
        </div>
        <div className="divide-y divide-gray-100">
          {kontroller.map(kontrol => {
            const raporTuru = readinessEksikRaporlari[kontrol.kod]
            return (
            <div key={kontrol.kod} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className={cn(
                'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full',
                kontrol.durum === 'basarili'
                  ? 'bg-emerald-100 text-emerald-700'
                  : kontrol.durum === 'uyari'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700',
              )}>
                {kontrol.durum === 'basarili' ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{kontrol.baslik}</p>
                <p className="mt-0.5 text-xs text-gray-500">{kontrol.mesaj ?? kontrol.kod}</p>
              </div>
              {kontrol.eksik_sayisi != null && (
                <span className="ml-auto rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">{kontrol.eksik_sayisi}</span>
              )}
              {raporTuru && (
                <button
                  type="button"
                  onClick={() => setEksikRaporu(raporTuru)}
                  className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <FileSpreadsheet size={13} />
                  Eksik kayıtları aç
                </button>
              )}
              {kontrol.kontrol_turu === 'manuel'
                && kontrol.durum !== 'basarili'
                && hasPermission('admin', 'manage') && (
                  <button
                    type="button"
                    disabled={islenen != null || kontrol.revision_no == null}
                    onClick={() => void kontroluOnayla(kontrol.kod, kontrol.revision_no)}
                    className="ml-2 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    AAL2 ile onayla
                  </button>
                )}
            </div>
            )
          })}
          {kontroller.length === 0 && !kaynak.hata && <TabloBos>Readiness RPC’si henüz kontrol sonucu döndürmedi.</TabloBos>}
        </div>
      </div>
      {eksikRaporu && (
        <TicariEksikKayitRaporuModal
          tur={eksikRaporu}
          onKapat={() => setEksikRaporu(null)}
        />
      )}
    </div>
  )
}

export default function FiyatlandirmaPage() {
  const [arama, setArama] = useSearchParams()
  const seciliParametre = arama.get('sekme')
  const aktifSekme: Sekme = sekmeler.some(sekme => sekme.id === seciliParametre)
    ? seciliParametre as Sekme
    : 'fiyat'
  const modKaynak = useTicariKaynak(ticariModDurumunuGetir)

  const icerik = useMemo(() => {
    if (aktifSekme === 'maliyet') return <MaliyetPaneli recete={false} />
    if (aktifSekme === 'recete') return <MaliyetPaneli recete />
    if (aktifSekme === 'profil') return <ProfillerPaneli />
    if (aktifSekme === 'ayarlar') return <VergiVadeKurPaneli />
    if (aktifSekme === 'hazirlik') return <ReadinessPaneli />
    return <FiyatListeleriPaneli />
  }, [aktifSekme])

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader
        baslik="Fiyatlandırma Yönetimi"
        aciklama="Satış fiyatı, maliyet, reçete ve müşteri ticari varsayımlarının tarihçeli yönetimi."
        icon={PackageSearch}
      />

      <TicariModBanner mod={modKaynak.veri?.mod} />
      {modKaynak.hata && <TicariHata mesaj={`Ticari mod okunamadı: ${modKaynak.hata}`} />}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
        <div role="tablist" aria-label="Fiyatlandırma bölümleri" className="flex min-w-max gap-1">
          {sekmeler.map(sekme => {
            const Icon = sekme.icon
            const aktif = aktifSekme === sekme.id
            return (
              <button
                key={sekme.id}
                type="button"
                role="tab"
                aria-selected={aktif}
                onClick={() => setArama({ sekme: sekme.id }, { replace: true })}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  aktif ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <Icon size={15} />
                {sekme.label}
              </button>
            )
          })}
        </div>
      </div>

      {icerik}
    </div>
  )
}
