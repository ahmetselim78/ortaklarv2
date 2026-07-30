import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ticariBugun, ticariPara } from '@/lib/ticariFormat'
import {
  tedarikciSiparisineFaturaIsle,
  tedarikciSiparisiniOdendiIsaretle,
  tedarikciSiparisleriniGetir,
  tedarikciSiparisiOlustur,
} from '@/services/tedarikciService'
import type { ParaBirimi } from '@/types/ticari'
import type { TedarikciSiparisi, TedarikciSiparisDurumu } from '@/types/tedarikci'

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

const durumGorunumu: Record<TedarikciSiparisDurumu, { etiket: string; sinif: string }> = {
  fatura_bekliyor: { etiket: 'Fatura bekliyor', sinif: 'bg-amber-100 text-amber-800' },
  odeme_bekliyor: { etiket: 'Ödeme bekliyor', sinif: 'bg-blue-100 text-blue-800' },
  gecikti: { etiket: 'Ödeme gecikti', sinif: 'bg-red-100 text-red-800' },
  odendi: { etiket: 'Ödendi', sinif: 'bg-emerald-100 text-emerald-800' },
}

export default function TedarikciSiparisTakibi({
  tedarikciId,
  portalModeli = true,
  olusturabilir,
  guncelleyebilir,
}: {
  tedarikciId: string
  portalModeli?: boolean
  olusturabilir: boolean
  guncelleyebilir: boolean
}) {
  const [siparisler, setSiparisler] = useState<TedarikciSiparisi[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [islem, setIslem] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [formAcik, setFormAcik] = useState(false)
  const [portalNo, setPortalNo] = useState('')
  const [siparisTarihi, setSiparisTarihi] = useState(ticariBugun())
  const [vadeGunu, setVadeGunu] = useState('60')
  const [paraBirimi, setParaBirimi] = useState<ParaBirimi>('TRY')
  const [siparisTutari, setSiparisTutari] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [faturaSiparisi, setFaturaSiparisi] = useState<TedarikciSiparisi | null>(null)
  const [faturaNo, setFaturaNo] = useState('')
  const [faturaTarihi, setFaturaTarihi] = useState(ticariBugun())
  const [faturaTutari, setFaturaTutari] = useState('')
  const [odemeSiparisi, setOdemeSiparisi] = useState<TedarikciSiparisi | null>(null)
  const [odemeTarihi, setOdemeTarihi] = useState(ticariBugun())

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      setSiparisler(await tedarikciSiparisleriniGetir(tedarikciId))
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Tedarikçi siparişleri yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }, [tedarikciId])

  useEffect(() => {
    void yukle()
  }, [yukle])

  const ozet = useMemo(() => ({
    fatura: siparisler.filter((siparis) => siparis.durum === 'fatura_bekliyor').length,
    odeme: siparisler.filter((siparis) => siparis.durum === 'odeme_bekliyor').length,
    geciken: siparisler.filter((siparis) => siparis.durum === 'gecikti').length,
    odendi: siparisler.filter((siparis) => siparis.durum === 'odendi').length,
  }), [siparisler])

  const formuTemizle = () => {
    setPortalNo('')
    setSiparisTarihi(ticariBugun())
    setVadeGunu('60')
    setParaBirimi('TRY')
    setSiparisTutari('')
    setAciklama('')
  }

  const siparisOlustur = async (event: React.FormEvent) => {
    event.preventDefault()
    setHata(null)
    if (!portalNo.trim() || !siparisTarihi || Number(vadeGunu) < 0) {
      setHata('Sipariş / referans numarası, sipariş tarihi ve vade zorunludur.')
      return
    }
    if (siparisTutari && Number(siparisTutari) <= 0) {
      setHata('Sipariş tutarı girildiyse sıfırdan büyük olmalıdır.')
      return
    }
    setIslem('siparis-olustur')
    try {
      await tedarikciSiparisiOlustur({
        tedarikci_id: tedarikciId,
        portal_siparis_no: portalNo.trim(),
        siparis_tarihi: siparisTarihi,
        vade_gunu: Number(vadeGunu),
        para_birimi: paraBirimi,
        siparis_tutari: siparisTutari || undefined,
        aciklama: aciklama.trim() || undefined,
      })
      formuTemizle()
      setFormAcik(false)
      await yukle()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Tedarikçi siparişi kaydedilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const faturaFormunuAc = (siparis: TedarikciSiparisi) => {
    setFaturaSiparisi(siparis)
    setOdemeSiparisi(null)
    setFaturaNo('')
    setFaturaTarihi(ticariBugun())
    setFaturaTutari(siparis.siparis_tutari == null ? '' : String(siparis.siparis_tutari))
  }

  const faturaKaydet = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!faturaSiparisi) return
    setHata(null)
    if (!faturaNo.trim() || !faturaTarihi) {
      setHata('Fatura numarası ve fatura tarihi zorunludur.')
      return
    }
    const sayisalFaturaTutari = Number(faturaTutari)
    if (
      !faturaTutari.trim()
      || !Number.isFinite(sayisalFaturaTutari)
      || sayisalFaturaTutari <= 0
    ) {
      setHata('Fatura tutarı zorunludur ve sıfırdan büyük olmalıdır.')
      return
    }
    setIslem(`fatura-${faturaSiparisi.id}`)
    try {
      await tedarikciSiparisineFaturaIsle(
        faturaSiparisi.id,
        faturaSiparisi.revision_no,
        {
          fatura_no: faturaNo.trim(),
          fatura_tarihi: faturaTarihi,
          fatura_tutari: faturaTutari,
        },
      )
      setFaturaSiparisi(null)
      await yukle()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Fatura siparişe işlenemedi.')
    } finally {
      setIslem(null)
    }
  }

  const odemeFormunuAc = (siparis: TedarikciSiparisi) => {
    setOdemeSiparisi(siparis)
    setFaturaSiparisi(null)
    setOdemeTarihi(ticariBugun())
  }

  const odendiIsaretle = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!odemeSiparisi || !odemeTarihi) return
    setHata(null)
    setIslem(`odeme-${odemeSiparisi.id}`)
    try {
      await tedarikciSiparisiniOdendiIsaretle(
        odemeSiparisi.id,
        odemeSiparisi.revision_no,
        odemeTarihi,
      )
      setOdemeSiparisi(null)
      await yukle()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Ödeme durumu güncellenemedi.')
    } finally {
      setIslem(null)
    }
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText size={18} className="text-violet-700" />
            <h3 className="font-semibold text-gray-900">
              {portalModeli ? 'Şişecam portal siparişleri' : 'Tedarikçi satın alma takibi'}
            </h3>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Sipariş fatura numarası girilene kadar “Fatura bekliyor” durumunda kalır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void yukle()} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50" aria-label="Siparişleri yenile">
            <RefreshCw size={15} />
          </button>
          {olusturabilir && (
            <button type="button" onClick={() => setFormAcik((onceki) => !onceki)} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">
              <Plus size={14} /> {portalModeli ? 'Portal siparişi ekle' : 'Satın alma kaydı ekle'}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Ozet baslik="Fatura bekliyor" deger={ozet.fatura} ton="amber" />
        <Ozet baslik="Ödeme bekliyor" deger={ozet.odeme} ton="blue" />
        <Ozet baslik="Geciken" deger={ozet.geciken} ton="red" />
        <Ozet baslik="Ödendi" deger={ozet.odendi} ton="emerald" />
      </div>

      {hata && (
        <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={17} className="shrink-0" /> {hata}
        </div>
      )}
      {formAcik && (
        <form onSubmit={siparisOlustur} className="mt-4 rounded-xl border border-violet-100 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-medium text-gray-700">{portalModeli ? 'Portal sipariş no' : 'Sipariş / referans no'}<input value={portalNo} onChange={(event) => setPortalNo(event.target.value)} className={inputClass} autoFocus /></label>
            <label className="text-xs font-medium text-gray-700">Sipariş tarihi<input type="date" value={siparisTarihi} onChange={(event) => setSiparisTarihi(event.target.value)} className={inputClass} /></label>
            <label className="text-xs font-medium text-gray-700">Vade (gün)<input type="number" min="0" max="3650" step="1" value={vadeGunu} onChange={(event) => setVadeGunu(event.target.value)} className={inputClass} /></label>
            <label className="text-xs font-medium text-gray-700">Para birimi<select value={paraBirimi} onChange={(event) => setParaBirimi(event.target.value as ParaBirimi)} className={inputClass}><option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
            <label className="text-xs font-medium text-gray-700">Sipariş tutarı<input type="number" min="0.01" step="0.01" value={siparisTutari} onChange={(event) => setSiparisTutari(event.target.value)} className={inputClass} placeholder="İsteğe bağlı" /></label>
          </div>
          <label className="mt-3 block text-xs font-medium text-gray-700">Açıklama<input value={aciklama} onChange={(event) => setAciklama(event.target.value)} className={inputClass} placeholder="Tır, teslimat veya portal notu" /></label>
          <button type="submit" disabled={islem === 'siparis-olustur'} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {islem === 'siparis-olustur' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Siparişi kaydet
          </button>
        </form>
      )}

      {yukleniyor ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500"><Loader2 size={17} className="animate-spin" /> Siparişler yükleniyor…</div>
      ) : (
        <div className="mt-4 space-y-3">
          {siparisler.map((siparis) => {
            const gorunum = durumGorunumu[siparis.durum]
            return (
              <div key={siparis.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{siparis.portal_siparis_no}</span>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${gorunum.sinif}`}>{gorunum.etiket}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Sipariş: {tarih(siparis.siparis_tarihi)} · {siparis.vade_gunu === 0 ? 'Peşin' : `${siparis.vade_gunu} gün vade`}
                      {siparis.siparis_tutari != null ? ` · ${ticariPara(siparis.siparis_tutari, siparis.para_birimi)}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {siparis.durum === 'fatura_bekliyor' && guncelleyebilir && (
                      <button type="button" onClick={() => faturaFormunuAc(siparis)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
                        <FileText size={13} /> Fatura gir
                      </button>
                    )}
                    {['odeme_bekliyor', 'gecikti'].includes(siparis.durum) && guncelleyebilir && (
                      <button type="button" onClick={() => odemeFormunuAc(siparis)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                        <CheckCircle2 size={13} /> Ödendi işaretle
                      </button>
                    )}
                  </div>
                </div>

                {siparis.fatura_no ? (
                  <div className="mt-3 grid gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 sm:grid-cols-3">
                    <div><span className="block text-[10px] uppercase tracking-wide text-gray-400">Fatura</span><strong className="text-gray-800">{siparis.fatura_no}</strong> · {tarih(siparis.fatura_tarihi)}</div>
                    <div><span className="block text-[10px] uppercase tracking-wide text-gray-400">Son ödeme</span><strong className={siparis.durum === 'gecikti' ? 'text-red-700' : 'text-gray-800'}>{tarih(siparis.son_odeme_tarihi)}</strong>{siparis.kalan_gun != null && siparis.durum !== 'odendi' ? ` · ${siparis.kalan_gun < 0 ? `${Math.abs(siparis.kalan_gun)} gün gecikti` : `${siparis.kalan_gun} gün kaldı`}` : ''}</div>
                    <div><span className="block text-[10px] uppercase tracking-wide text-gray-400">Fatura tutarı</span><strong className="text-gray-800">{siparis.fatura_tutari == null ? '—' : ticariPara(siparis.fatura_tutari, siparis.para_birimi)}</strong>{siparis.odeme_tarihi ? ` · Ödeme ${tarih(siparis.odeme_tarihi)}` : ''}</div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <CalendarClock size={14} /> Fatura numarası ve tarihi bekleniyor; son ödeme tarihi henüz başlamadı.
                  </div>
                )}

                {faturaSiparisi?.id === siparis.id && (
                  <form onSubmit={faturaKaydet} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="text-xs font-medium text-amber-900">Fatura numarası<input value={faturaNo} onChange={(event) => setFaturaNo(event.target.value)} className={inputClass} autoFocus /></label>
                      <label className="text-xs font-medium text-amber-900">Fatura tarihi<input type="date" value={faturaTarihi} onChange={(event) => setFaturaTarihi(event.target.value)} className={inputClass} /></label>
                      <label className="text-xs font-medium text-amber-900">Fatura tutarı *<input type="number" min="0.01" step="0.01" required value={faturaTutari} onChange={(event) => setFaturaTutari(event.target.value)} className={inputClass} placeholder="0,00" /></label>
                    </div>
                    <p className="mt-2 text-xs text-amber-800">Son ödeme tarihi, fatura tarihine {siparis.vade_gunu} gün eklenerek hesaplanır.</p>
                    <div className="mt-3 flex gap-2">
                      <button type="submit" disabled={islem === `fatura-${siparis.id}`} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Faturayı kaydet</button>
                      <button type="button" onClick={() => setFaturaSiparisi(null)} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800">Vazgeç</button>
                    </div>
                  </form>
                )}

                {odemeSiparisi?.id === siparis.id && (
                  <form onSubmit={odendiIsaretle} className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <label className="text-xs font-medium text-emerald-900">Ödeme tarihi<input type="date" value={odemeTarihi} onChange={(event) => setOdemeTarihi(event.target.value)} className={inputClass} /></label>
                    <button type="submit" disabled={islem === `odeme-${siparis.id}`} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Ödemeyi onayla</button>
                    <button type="button" onClick={() => setOdemeSiparisi(null)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800">Vazgeç</button>
                  </form>
                )}
              </div>
            )
          })}
          {siparisler.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center text-sm text-gray-500">
              Henüz satın alma kaydı oluşturulmadı.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Ozet({ baslik, deger, ton }: { baslik: string; deger: number; ton: 'amber' | 'blue' | 'red' | 'emerald' }) {
  const siniflar = {
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    red: 'border-red-100 bg-red-50 text-red-800',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800',
  }
  return <div className={`rounded-lg border px-3 py-2 ${siniflar[ton]}`}><div className="text-[10px] uppercase tracking-wide opacity-70">{baslik}</div><div className="mt-0.5 text-lg font-bold">{deger}</div></div>
}

function tarih(value: string | null) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR')
}
