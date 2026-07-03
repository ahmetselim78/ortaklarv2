import { useState, useEffect } from 'react'
import {
  Plus, Trash2, ChevronUp, ChevronDown, Loader2,
  AlertCircle, CheckCircle2, Pencil, Check, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface Istasyon {
  id: string
  ad: string
  sira_no: number
  aktif: boolean
  fire_var: boolean
}

export default function IstasyonYonetimiPanel() {
  const [istasyonlar, setIstasyonlar] = useState<Istasyon[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [basari, setBasari] = useState<string | null>(null)

  // Yeni istasyon formu
  const [yeniAd, setYeniAd] = useState('')
  const [yeniFireVar, setYeniFireVar] = useState(true)
  const [ekleniyor, setEkleniyor] = useState(false)

  // Satır içi düzenleme
  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null)
  const [duzenlenenAd, setDuzenlenenAd] = useState('')
  const [silinecek, setSilinecek] = useState<Istasyon | null>(null)
  const [siliniyor, setSiliniyor] = useState(false)

  async function yukle() {
    setYukleniyor(true)
    setHata(null)
    try {
      const { data, error } = await supabase
        .from('uretim_istasyonlari')
        .select('*')
        .order('sira_no')
      if (error) throw error
      setIstasyonlar((data ?? []) as Istasyon[])
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Yükleme hatası oluştu.')
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [])

  function flash(msg: string) {
    setBasari(msg)
    setTimeout(() => setBasari(null), 3000)
  }

  async function ekle() {
    if (!yeniAd.trim()) return
    setEkleniyor(true)
    setHata(null)
    try {
      const maxSira = istasyonlar.length > 0
        ? Math.max(...istasyonlar.map(i => i.sira_no))
        : 0
      const { error } = await supabase.from('uretim_istasyonlari').insert({
        ad: yeniAd.trim(),
        sira_no: maxSira + 1,
        aktif: true,
        fire_var: yeniFireVar,
      })
      if (error) throw error
      setYeniAd('')
      setYeniFireVar(true)
      await yukle()
      flash('İstasyon eklendi.')
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Ekleme hatası oluştu.')
    } finally {
      setEkleniyor(false)
    }
  }

  async function aktifToggle(id: string, aktif: boolean) {
    setHata(null)
    try {
      const { error } = await supabase
        .from('uretim_istasyonlari')
        .update({ aktif: !aktif })
        .eq('id', id)
      if (error) throw error
      setIstasyonlar(prev => prev.map(i => i.id === id ? { ...i, aktif: !aktif } : i))
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Güncelleme hatası.')
    }
  }

  async function sil() {
    if (!silinecek) return
    setSiliniyor(true)
    setHata(null)
    try {
      const { error } = await supabase.from('uretim_istasyonlari').delete().eq('id', silinecek.id)
      if (error) throw error
      setIstasyonlar(prev => prev.filter(i => i.id !== silinecek.id))
      setSilinecek(null)
      flash('İstasyon silindi.')
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Silme hatası.')
    } finally {
      setSiliniyor(false)
    }
  }

  async function siraDegistir(id: string, yon: 'yukari' | 'asagi') {
    const idx = istasyonlar.findIndex(i => i.id === id)
    if (idx === -1) return
    const yeniIdx = yon === 'yukari' ? idx - 1 : idx + 1
    if (yeniIdx < 0 || yeniIdx >= istasyonlar.length) return

    const yeni = [...istasyonlar]
    const tmp = yeni[idx]
    yeni[idx] = yeni[yeniIdx]
    yeni[yeniIdx] = tmp

    const guncellenmis = yeni.map((ist, i) => ({ ...ist, sira_no: i + 1 }))
    setIstasyonlar(guncellenmis)

    try {
      await supabase
        .from('uretim_istasyonlari')
        .update({ sira_no: guncellenmis[idx].sira_no })
        .eq('id', guncellenmis[idx].id)
      await supabase
        .from('uretim_istasyonlari')
        .update({ sira_no: guncellenmis[yeniIdx].sira_no })
        .eq('id', guncellenmis[yeniIdx].id)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Sıralama hatası.')
      await yukle()
    }
  }

  async function duzenlemeyiKaydet(id: string) {
    if (!duzenlenenAd.trim()) return
    setHata(null)
    try {
      const { error } = await supabase
        .from('uretim_istasyonlari')
        .update({ ad: duzenlenenAd.trim() })
        .eq('id', id)
      if (error) throw error
      setIstasyonlar(prev => prev.map(i => i.id === id ? { ...i, ad: duzenlenenAd.trim() } : i))
      setDuzenlenenId(null)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Güncelleme hatası.')
    }
  }

  if (yukleniyor) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-10">
        <Loader2 size={16} className="animate-spin" /> Yükleniyor…
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-600 mb-6">
        Operatör günlük rapor formunda görünecek üretim istasyonlarını yönetin.
        Sıra değiştirmek için ▲▼ düğmelerini, adı düzenlemek için ✏ ikonunu kullanın.
      </p>

      {hata && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />{hata}
        </div>
      )}
      {basari && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
          <CheckCircle2 size={14} className="shrink-0" />{basari}
        </div>
      )}

      {/* İstasyon Listesi */}
      <div className="space-y-2 mb-6">
        {istasyonlar.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-300 rounded-xl">
            Henüz istasyon eklenmemiş.
          </div>
        )}
        {istasyonlar.map((ist, idx) => (
          <div
            key={ist.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              ist.aktif ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'
            }`}
          >
            {/* Sıra No */}
            <span className="text-xs text-gray-400 w-5 text-center font-mono shrink-0">
              {ist.sira_no}
            </span>

            {/* Ad veya düzenleme inputu */}
            <div className="flex-1 min-w-0">
              {duzenlenenId === ist.id ? (
                <input
                  type="text"
                  value={duzenlenenAd}
                  onChange={e => setDuzenlenenAd(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') duzenlemeyiKaydet(ist.id)
                    if (e.key === 'Escape') setDuzenlenenId(null)
                  }}
                  autoFocus
                  className="w-full px-2 py-1 text-sm border border-amber-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              ) : (
                <span className="text-sm font-medium text-gray-800">{ist.ad}</span>
              )}
            </div>

            {/* Fire Rozeti */}
            {ist.fire_var && (
              <span className="text-xs text-red-500 bg-red-50 border border-red-100 rounded px-1.5 py-0.5 shrink-0">
                Fire
              </span>
            )}

            {/* Kontroller */}
            <div className="flex items-center gap-1 shrink-0">
              {duzenlenenId === ist.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => duzenlemeyiKaydet(ist.id)}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Kaydet"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuzenlenenId(null)}
                    className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    title="İptal"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setDuzenlenenId(ist.id); setDuzenlenenAd(ist.ad) }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Adı düzenle"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => siraDegistir(ist.id, 'yukari')}
                    disabled={idx === 0}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
                    title="Yukarı taşı"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => siraDegistir(ist.id, 'asagi')}
                    disabled={idx === istasyonlar.length - 1}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
                    title="Aşağı taşı"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => aktifToggle(ist.id, ist.aktif)}
                    className={`px-2 py-0.5 text-xs font-medium rounded-full transition-colors ${
                      ist.aktif
                        ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600'
                        : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'
                    }`}
                    title={ist.aktif ? 'Pasife al' : 'Aktife al'}
                  >
                    {ist.aktif ? 'Aktif' : 'Pasif'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSilinecek(ist)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Sil"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Yeni İstasyon Ekleme Formu */}
      <div className="border border-dashed border-gray-300 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-700 mb-4">Yeni İstasyon Ekle</p>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-gray-500 mb-1">İstasyon Adı *</label>
            <input
              type="text"
              value={yeniAd}
              onChange={e => setYeniAd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ekle()}
              placeholder="Örn: Yükleme, Paketleme…"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fire/Hurda Var mı?</label>
            <button
              type="button"
              onClick={() => setYeniFireVar(v => !v)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                yeniFireVar
                  ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {yeniFireVar ? 'Evet' : 'Hayır'}
            </button>
          </div>
          <button
            type="button"
            onClick={ekle}
            disabled={!yeniAd.trim() || ekleniyor}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold text-sm rounded-xl transition-colors"
          >
            {ekleniyor ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Ekle
          </button>
        </div>
      </div>

      {silinecek && (
        <ConfirmDialog
          baslik="Istasyon silinsin mi?"
          mesaj={`${silinecek.ad} kalici olarak silinecek.`}
          onayButon="Sil"
          onayRenk="red"
          yukleniyor={siliniyor}
          onOnayla={sil}
          onKapat={() => !siliniyor && setSilinecek(null)}
        />
      )}
    </div>
  )
}
