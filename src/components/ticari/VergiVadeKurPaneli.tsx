import { Banknote, Copy, FileSpreadsheet, History, Plus, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useTicariKaynak } from '@/hooks/useTicariKaynak'
import {
  kdvTaslakOraniniGuncelle,
  manuelDovizKuruKaydet,
  surumKopyala,
  surumYayinla,
  vergiVadeKurYonetiminiGetir,
  yeniIdempotencyAnahtari,
} from '@/services/ticariService'
import { ticariBugun, ticariTarih } from '@/lib/ticariFormat'
import { OzetKarti, SurumRozeti, TabloBos, TicariHata, YenileButonu } from './TicariOrtak'
import TicariTaslakExcelModal from './TicariTaslakExcelModal'
import TicariTaslakOlusturModal from './TicariTaslakOlusturModal'
import TicariSurumKarsilastirmaModal from './TicariSurumKarsilastirmaModal'

type Veri = Awaited<ReturnType<typeof vergiVadeKurYonetiminiGetir>>
type KdvSurumu = Veri['kdvSurumleri'][number]
type VadeSurumu = Veri['vadeSurumleri'][number]

function sonSurum<T extends { surum_no: number; created_at: string }>(surumler: T[]) {
  return [...surumler].sort((a, b) =>
    b.surum_no - a.surum_no || b.created_at.localeCompare(a.created_at))[0] ?? null
}

export default function VergiVadeKurPaneli({
  sadeceKdv = false,
}: {
  sadeceKdv?: boolean
}) {
  const kaynak = useTicariKaynak(vergiVadeKurYonetiminiGetir)
  const { hasPermission, access } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [islenen, setIslenen] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [basari, setBasari] = useState<string | null>(null)
  const [yeniTur, setYeniTur] = useState<'kdv' | 'vade' | null>(null)
  const [vadeDuzenlenen, setVadeDuzenlenen] = useState<{ surum: VadeSurumu; baslik: string } | null>(null)
  const [gecmis, setGecmis] = useState<{
    tur: 'kdv' | 'vade'
    baslik: string
    surumler: Array<KdvSurumu | VadeSurumu>
  } | null>(null)
  const [kurForm, setKurForm] = useState({
    kur_tarihi: ticariBugun(),
    para_birimi: 'USD' as 'USD' | 'EUR',
    kur_tipi: 'doviz_satis' as 'doviz_alis' | 'doviz_satis' | 'efektif_alis' | 'efektif_satis',
    try_karsiligi: '',
    gerekce: '',
  })

  const aal2Dogrula = () => {
    if (access?.aal === 'aal2') return true
    navigate('/mfa', { state: { from: `${location.pathname}${location.search}` } })
    return false
  }
  const veri = kaynak.veri
  const kurlar = useMemo(
    () => [...(veri?.kurlar ?? [])]
      .filter((kur) => kur.aktif)
      .sort((a, b) => b.kur_tarihi.localeCompare(a.kur_tarihi) || b.revision_no - a.revision_no)
      .slice(0, 40),
    [veri?.kurlar],
  )

  const yayinla = async (tur: 'kdv' | 'vade', surum: KdvSurumu | VadeSurumu) => {
    if (!aal2Dogrula()) return
    if (!window.confirm(`S${surum.surum_no} ${tur === 'kdv' ? 'KDV' : 'vade'} sürümü yayınlansın mı?`)) return
    setIslenen(surum.id)
    setHata(null)
    setBasari(null)
    try {
      await surumYayinla(
        tur === 'kdv' ? 'kdv_grup_surumu_yayinla' : 'vade_profili_surumu_yayinla',
        surum.id,
        surum.revision_no,
        yeniIdempotencyAnahtari(),
      )
      setBasari('Sürüm yayınlandı.')
      await kaynak.yenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Sürüm yayınlanamadı.')
    } finally {
      setIslenen(null)
    }
  }

  const kopyala = async (tur: 'kdv' | 'vade', surum: KdvSurumu | VadeSurumu) => {
    setIslenen(surum.id)
    setHata(null)
    try {
      await surumKopyala(
        tur === 'kdv' ? 'kdv_grup_surumu_kopyala' : 'vade_profili_surumu_kopyala',
        surum.id,
      )
      setBasari('Yeni taslak sürüm oluşturuldu.')
      await kaynak.yenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Taslak kopyalanamadı.')
    } finally {
      setIslenen(null)
    }
  }

  const kdvOraniniDegistir = async (surum: KdvSurumu) => {
    const ham = window.prompt('Yeni KDV oranını yüzde olarak yazın:', String(surum.kdv_orani))
    if (ham == null) return
    const oran = Number(ham.replace(',', '.'))
    if (!Number.isFinite(oran) || oran < 0 || oran > 100) {
      setHata('KDV oranı 0–100 arasında olmalıdır.')
      return
    }
    setIslenen(surum.id)
    setHata(null)
    try {
      await kdvTaslakOraniniGuncelle(surum.id, surum.revision_no, oran)
      setBasari('Taslak KDV oranı güncellendi.')
      await kaynak.yenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'KDV oranı güncellenemedi.')
    } finally {
      setIslenen(null)
    }
  }

  const manuelKurKaydet = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!aal2Dogrula()) return
    const kur = Number(kurForm.try_karsiligi.replace(',', '.'))
    if (!Number.isFinite(kur) || kur <= 0 || !kurForm.gerekce.trim()) {
      setHata('Pozitif kur değeri ve manuel giriş gerekçesi zorunludur.')
      return
    }
    setIslenen('manuel-kur')
    setHata(null)
    try {
      await manuelDovizKuruKaydet(
        kurForm.kur_tarihi,
        kurForm.para_birimi,
        kurForm.kur_tipi,
        kur,
        kurForm.gerekce.trim(),
        yeniIdempotencyAnahtari(),
      )
      setKurForm((onceki) => ({ ...onceki, try_karsiligi: '', gerekce: '' }))
      setBasari('Manuel kur append-only revizyon olarak kaydedildi.')
      await kaynak.yenile()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Manuel kur kaydedilemedi.')
    } finally {
      setIslenen(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className={`grid gap-3 ${sadeceKdv ? 'sm:max-w-sm' : 'sm:grid-cols-3'}`}>
        <OzetKarti baslik="KDV grubu" deger={veri?.kdvGruplari.length ?? 0} />
        {!sadeceKdv && (
          <>
            <OzetKarti baslik="Vade profili" deger={veri?.vadeProfilleri.length ?? 0} />
            <OzetKarti baslik="Aktif kur cache satırı" deger={(veri?.kurlar ?? []).filter((kur) => kur.aktif).length} icon={<Banknote size={18} />} />
          </>
        )}
      </div>
      {kaynak.hata && <TicariHata mesaj={kaynak.hata} />}
      {hata && <TicariHata mesaj={hata} />}
      {basari && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{basari}</div>}
      {sadeceKdv && (
        <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          Yeni KDV grubunu oluşturduktan sonra bağlantı ve satış hesaplarında kullanılabilmesi için taslak sürümü yayınlayın.
        </div>
      )}

      <div className={`grid gap-5 ${sadeceKdv ? '' : 'xl:grid-cols-2'}`}>
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div><h2 className="text-sm font-semibold text-gray-900">Tarihçeli KDV grupları</h2><p className="text-xs text-gray-500">Her satış bileşeni bir KDV grubuna bağlıdır.</p></div>
            <div className="flex gap-2">
              {hasPermission('pricing', 'create') && <button type="button" onClick={() => setYeniTur('kdv')} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white"><Plus size={13} /> Yeni</button>}
              <YenileButonu onClick={() => void kaynak.yenile()} yukleniyor={kaynak.yukleniyor} />
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {(veri?.kdvGruplari ?? []).map((grup) => {
              const grupSurumleri = (veri?.kdvSurumleri ?? []).filter((item) => item.kdv_grubu_id === grup.id)
              const surum = sonSurum(grupSurumleri)
              return <div key={grup.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1"><div className="font-medium text-gray-900">{grup.kod} · {grup.ad}</div><div className="text-xs text-gray-500">{surum ? `S${surum.surum_no} · %${surum.kdv_orani} · ${ticariTarih(surum.gecerli_baslangic)}` : 'Sürüm yok'}</div></div>
                {surum && <SurumRozeti durum={surum.durum} />}
                {grupSurumleri.length > 0 && <button type="button" onClick={() => setGecmis({ tur: 'kdv', baslik: grup.ad, surumler: grupSurumleri })} className="rounded-lg border border-gray-200 p-1.5" title="Sürüm geçmişi"><History size={13} /></button>}
                {surum?.durum === 'taslak' && hasPermission('pricing', 'update') && <button type="button" onClick={() => void kdvOraniniDegistir(surum)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs">Oranı düzenle</button>}
                {surum?.durum === 'yayinda' && hasPermission('pricing', 'update') && <button type="button" onClick={() => void kopyala('kdv', surum)} className="rounded-lg border border-gray-200 p-1.5" title="Taslak kopyala"><Copy size={13} /></button>}
                {surum?.durum === 'taslak' && hasPermission('pricing', 'manage') && <button type="button" disabled={islenen === surum.id} onClick={() => void yayinla('kdv', surum)} className="rounded-lg bg-blue-600 p-1.5 text-white" title="Yayınla"><Send size={13} /></button>}
              </div>
            })}
            {(veri?.kdvGruplari ?? []).length === 0 && <TabloBos>KDV grubu yok.</TabloBos>}
          </div>
        </section>

        {!sadeceKdv && <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div><h2 className="text-sm font-semibold text-gray-900">Vade profilleri</h2><p className="text-xs text-gray-500">Gün aralıkları ve vade farkları sürümlüdür.</p></div>
            {hasPermission('pricing', 'create') && <button type="button" onClick={() => setYeniTur('vade')} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white"><Plus size={13} /> Yeni</button>}
          </div>
          <div className="divide-y divide-gray-100">
            {(veri?.vadeProfilleri ?? []).map((profil) => {
              const profilSurumleri = (veri?.vadeSurumleri ?? []).filter((item) => item.vade_profili_id === profil.id)
              const surum = sonSurum(profilSurumleri)
              return <div key={profil.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1"><div className="font-medium text-gray-900">{profil.kod} · {profil.ad}</div><div className="text-xs text-gray-500">{surum ? `S${surum.surum_no} · ${ticariTarih(surum.gecerli_baslangic)}` : 'Sürüm yok'}</div></div>
                {surum && <SurumRozeti durum={surum.durum} />}
                {profilSurumleri.length > 0 && <button type="button" onClick={() => setGecmis({ tur: 'vade', baslik: profil.ad, surumler: profilSurumleri })} className="rounded-lg border border-gray-200 p-1.5" title="Sürüm geçmişi"><History size={13} /></button>}
                {surum?.durum === 'taslak' && hasPermission('pricing', 'update') && <button type="button" onClick={() => setVadeDuzenlenen({ surum, baslik: profil.ad })} className="rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-blue-700" title="Kademeler / Excel"><FileSpreadsheet size={13} /></button>}
                {surum?.durum === 'yayinda' && hasPermission('pricing', 'update') && <button type="button" onClick={() => void kopyala('vade', surum)} className="rounded-lg border border-gray-200 p-1.5" title="Taslak kopyala"><Copy size={13} /></button>}
                {surum?.durum === 'taslak' && hasPermission('pricing', 'manage') && <button type="button" disabled={islenen === surum.id} onClick={() => void yayinla('vade', surum)} className="rounded-lg bg-blue-600 p-1.5 text-white" title="Yayınla"><Send size={13} /></button>}
              </div>
            })}
            {(veri?.vadeProfilleri ?? []).length === 0 && <TabloBos>Vade profili yok.</TabloBos>}
          </div>
        </section>}
      </div>

      {!sadeceKdv && <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3"><h2 className="text-sm font-semibold text-gray-900">TCMB kur cache’i ve manuel revizyon</h2><p className="text-xs text-gray-500">Hesap motoru dış ağa çıkmaz; yalnız cache satırlarını kullanır. TRY daima 1’dir.</p></div>
        {hasPermission('pricing', 'manage') && (
          <form onSubmit={manuelKurKaydet} className="grid gap-2 border-b border-gray-100 bg-gray-50 p-3 sm:grid-cols-2 lg:grid-cols-6">
            <input type="date" value={kurForm.kur_tarihi} onChange={(e) => setKurForm((v) => ({ ...v, kur_tarihi: e.target.value }))} className="rounded-lg border border-gray-200 px-2 py-2 text-xs" />
            <select value={kurForm.para_birimi} onChange={(e) => setKurForm((v) => ({ ...v, para_birimi: e.target.value as 'USD' | 'EUR' }))} className="rounded-lg border border-gray-200 px-2 py-2 text-xs"><option>USD</option><option>EUR</option></select>
            <select value={kurForm.kur_tipi} onChange={(e) => setKurForm((v) => ({ ...v, kur_tipi: e.target.value as typeof v.kur_tipi }))} className="rounded-lg border border-gray-200 px-2 py-2 text-xs"><option value="doviz_alis">Döviz alış</option><option value="doviz_satis">Döviz satış</option><option value="efektif_alis">Efektif alış</option><option value="efektif_satis">Efektif satış</option></select>
            <input value={kurForm.try_karsiligi} onChange={(e) => setKurForm((v) => ({ ...v, try_karsiligi: e.target.value }))} placeholder="TRY karşılığı" className="rounded-lg border border-gray-200 px-2 py-2 text-xs" />
            <input value={kurForm.gerekce} onChange={(e) => setKurForm((v) => ({ ...v, gerekce: e.target.value }))} placeholder="Zorunlu gerekçe" className="rounded-lg border border-gray-200 px-2 py-2 text-xs" />
            <button type="submit" disabled={islenen === 'manuel-kur'} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">AAL2 ile kaydet</button>
          </form>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-gray-50 text-left text-gray-500"><tr><th className="px-3 py-2">İstenen tarih</th><th className="px-3 py-2">Kaynak tarih</th><th className="px-3 py-2">Döviz</th><th className="px-3 py-2">Kur tipi</th><th className="px-3 py-2">TRY karşılığı</th><th className="px-3 py-2">Kaynak</th><th className="px-3 py-2">Revizyon</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {kurlar.map((kur) => <tr key={kur.id}><td className="px-3 py-2">{ticariTarih(kur.kur_tarihi)}</td><td className="px-3 py-2">{ticariTarih(kur.tcmb_kaynak_tarihi)}</td><td className="px-3 py-2 font-semibold">{kur.para_birimi}</td><td className="px-3 py-2">{kur.kur_tipi.replaceAll('_', ' ')}</td><td className="px-3 py-2 font-mono">{Number(kur.try_karsiligi).toFixed(6)}</td><td className="px-3 py-2">{kur.kaynak}</td><td className="px-3 py-2">R{kur.revision_no}</td></tr>)}
              {kurlar.length === 0 && <tr><td colSpan={7}><TabloBos>Kur cache kaydı yok.</TabloBos></td></tr>}
            </tbody>
          </table>
        </div>
      </section>}

      {yeniTur && <TicariTaslakOlusturModal tur={yeniTur} onKaydedildi={kaynak.yenile} onKapat={() => setYeniTur(null)} />}
      {vadeDuzenlenen && <TicariTaslakExcelModal tur="vade" surumId={vadeDuzenlenen.surum.id} surumNo={vadeDuzenlenen.surum.surum_no} revisionNo={vadeDuzenlenen.surum.revision_no} baslik={vadeDuzenlenen.baslik} onKaydedildi={kaynak.yenile} onKapat={() => setVadeDuzenlenen(null)} />}
      {gecmis && <TicariSurumKarsilastirmaModal tur={gecmis.tur} baslik={gecmis.baslik} surumler={gecmis.surumler} onKapat={() => setGecmis(null)} />}
    </div>
  )
}
