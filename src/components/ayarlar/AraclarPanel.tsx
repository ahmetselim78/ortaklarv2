import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Check, X, Loader2, Truck, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Arac {
  id: string
  plaka: string
  ad: string
  kapasite_m2: number | null
  aktif: boolean
  notlar: string | null
}

const BOŞ_FORM = { plaka: '', ad: '', kapasite_m2: '', notlar: '' }

export default function AraclarPanel() {
  const [araclar, setAraclar] = useState<Arac[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydiyor, setKaydiyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  // Ekleme formu
  const [eklemeAcik, setEklemeAcik] = useState(false)
  const [yeniForm, setYeniForm] = useState(BOŞ_FORM)

  // Düzenleme
  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null)
  const [duzenlemeForm, setDuzenlemeForm] = useState(BOŞ_FORM)

  // Silme onayı
  const [silOnayId, setSilOnayId] = useState<string | null>(null)
  const [siliyor, setSiliyor] = useState(false)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    const { data, error } = await supabase
      .from('araclar')
      .select('id, plaka, ad, kapasite_m2, aktif, notlar')
      .order('aktif', { ascending: false })
      .order('ad')
    if (error) setHata(error.message)
    else setAraclar((data ?? []) as Arac[])
    setYukleniyor(false)
  }, [])

  useEffect(() => { getir() }, [getir])

  async function aracEkle() {
    if (!yeniForm.plaka.trim() || !yeniForm.ad.trim()) return
    setKaydiyor(true)
    setHata(null)
    const { error } = await supabase.from('araclar').insert({
      plaka: yeniForm.plaka.trim().toUpperCase(),
      ad: yeniForm.ad.trim(),
      kapasite_m2: yeniForm.kapasite_m2 ? Number(yeniForm.kapasite_m2) : null,
      notlar: yeniForm.notlar.trim() || null,
    })
    setKaydiyor(false)
    if (error) { setHata(error.message); return }
    setYeniForm(BOŞ_FORM)
    setEklemeAcik(false)
    getir()
  }

  async function aracGuncelle(id: string) {
    if (!duzenlemeForm.plaka.trim() || !duzenlemeForm.ad.trim()) return
    setKaydiyor(true)
    setHata(null)
    const { error } = await supabase.from('araclar').update({
      plaka: duzenlemeForm.plaka.trim().toUpperCase(),
      ad: duzenlemeForm.ad.trim(),
      kapasite_m2: duzenlemeForm.kapasite_m2 ? Number(duzenlemeForm.kapasite_m2) : null,
      notlar: duzenlemeForm.notlar.trim() || null,
    }).eq('id', id)
    setKaydiyor(false)
    if (error) { setHata(error.message); return }
    setDuzenlenenId(null)
    getir()
  }

  async function aracSil(id: string) {
    setSiliyor(true)
    setHata(null)
    const { error } = await supabase.from('araclar').delete().eq('id', id)
    setSiliyor(false)
    if (error) { setHata(error.message); return }
    setSilOnayId(null)
    setAraclar(prev => prev.filter(a => a.id !== id))
  }

  async function aktifToggle(arac: Arac) {
    const { error } = await supabase.from('araclar').update({ aktif: !arac.aktif }).eq('id', arac.id)
    if (error) setHata(error.message)
    else setAraclar(prev => prev.map(a => a.id === arac.id ? { ...a, aktif: !a.aktif } : a))
  }

  function duzenlemeBaslat(arac: Arac) {
    setDuzenlenenId(arac.id)
    setSilOnayId(null)
    setDuzenlemeForm({
      plaka: arac.plaka,
      ad: arac.ad,
      kapasite_m2: arac.kapasite_m2 != null ? String(arac.kapasite_m2) : '',
      notlar: arac.notlar ?? '',
    })
  }

  if (yukleniyor) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-10">
        <Loader2 size={18} className="animate-spin" /> Yükleniyor…
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Araç Yönetimi</h2>
        <p className="text-sm text-gray-500">
          Sevkiyat planlamasında kullanılan şirket araçlarını buradan ekleyebilir, düzenleyebilir, pasife alabilir veya silebilirsiniz.
        </p>
      </div>

      {hata && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{hata}</div>
      )}

      {/* Araç listesi */}
      <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden bg-white shadow-sm">
        {araclar.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Truck size={36} className="mb-3 opacity-20" />
            <p className="text-sm font-medium">Henüz araç eklenmemiş</p>
            <p className="text-xs mt-1 opacity-70">Aşağıdaki butona tıklayarak ilk aracı ekleyin</p>
          </div>
        )}

        {araclar.map(arac => (
          <div key={arac.id}>
            {duzenlenenId === arac.id ? (
              /* Düzenleme satırı */
              <div className="px-5 py-4 space-y-3 bg-blue-50/20">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Düzenleniyor</p>
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Plaka *</label>
                    <input
                      value={duzenlemeForm.plaka}
                      onChange={e => setDuzenlemeForm(f => ({ ...f, plaka: e.target.value }))}
                      placeholder="34 ABC 001"
                      className="w-36 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 font-mono uppercase"
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-gray-500">Araç Adı *</label>
                    <input
                      value={duzenlemeForm.ad}
                      onChange={e => setDuzenlemeForm(f => ({ ...f, ad: e.target.value }))}
                      placeholder="Ford Transit Beyaz"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-32">
                    <label className="text-xs text-gray-500">Kapasite m²</label>
                    <input
                      type="number"
                      value={duzenlemeForm.kapasite_m2}
                      onChange={e => setDuzenlemeForm(f => ({ ...f, kapasite_m2: e.target.value }))}
                      placeholder="–"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-gray-500">Not</label>
                    <input
                      value={duzenlemeForm.notlar}
                      onChange={e => setDuzenlemeForm(f => ({ ...f, notlar: e.target.value }))}
                      placeholder="Opsiyonel not…"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => aracGuncelle(arac.id)}
                      disabled={kaydiyor}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {kaydiyor ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Kaydet
                    </button>
                    <button
                      onClick={() => setDuzenlenenId(null)}
                      className="px-3 py-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ) : silOnayId === arac.id ? (
              /* Silme onayı */
              <div className="px-5 py-4 flex items-center gap-4 bg-red-50/60">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-700">Bu aracı silmek istediğinizden emin misiniz?</p>
                  <p className="text-xs text-red-500 mt-0.5">
                    <span className="font-mono font-bold">{arac.plaka}</span> — {arac.ad} kalıcı olarak silinecek.
                  </p>
                </div>
                <button
                  onClick={() => aracSil(arac.id)}
                  disabled={siliyor}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {siliyor ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Sil
                </button>
                <button
                  onClick={() => setSilOnayId(null)}
                  className="px-3 py-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              /* Normal satır */
              <div className={`px-5 py-4 flex items-center gap-4 ${!arac.aktif ? 'opacity-50' : ''}`}>
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                  <Truck size={18} className="text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-gray-800">{arac.plaka}</span>
                    <span className="text-sm text-gray-600">{arac.ad}</span>
                    {arac.kapasite_m2 != null && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{arac.kapasite_m2} m²</span>
                    )}
                    {!arac.aktif && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Pasif</span>
                    )}
                  </div>
                  {arac.notlar && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{arac.notlar}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => duzenlemeBaslat(arac)}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    title="Düzenle"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => aktifToggle(arac)}
                    className={`p-2 rounded-lg transition-colors ${arac.aktif ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
                    title={arac.aktif ? 'Pasife al' : 'Aktife al'}
                  >
                    {arac.aktif ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button
                    onClick={() => { setSilOnayId(arac.id); setDuzenlenenId(null) }}
                    className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Sil"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Yeni araç ekleme */}
      {eklemeAcik ? (
        <div className="border border-blue-200 bg-blue-50/30 rounded-2xl px-5 py-5 space-y-3 shadow-sm">
          <p className="text-sm font-semibold text-gray-700">Yeni Araç Ekle</p>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Plaka *</label>
              <input
                value={yeniForm.plaka}
                onChange={e => setYeniForm(f => ({ ...f, plaka: e.target.value }))}
                placeholder="34 ABC 001"
                className="w-36 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 font-mono uppercase bg-white"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-500">Araç Adı *</label>
              <input
                value={yeniForm.ad}
                onChange={e => setYeniForm(f => ({ ...f, ad: e.target.value }))}
                placeholder="Ford Transit Beyaz"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
              />
            </div>
            <div className="flex flex-col gap-1 w-32">
              <label className="text-xs text-gray-500">Kapasite m²</label>
              <input
                type="number"
                value={yeniForm.kapasite_m2}
                onChange={e => setYeniForm(f => ({ ...f, kapasite_m2: e.target.value }))}
                placeholder="–"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-500">Not</label>
              <input
                value={yeniForm.notlar}
                onChange={e => setYeniForm(f => ({ ...f, notlar: e.target.value }))}
                placeholder="Opsiyonel not…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={aracEkle}
                disabled={kaydiyor || !yeniForm.plaka.trim() || !yeniForm.ad.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {kaydiyor ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Ekle
              </button>
              <button
                onClick={() => { setEklemeAcik(false); setYeniForm(BOŞ_FORM) }}
                className="px-3 py-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEklemeAcik(true)}
          className="flex items-center gap-2 px-5 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/30 transition-all w-full justify-center font-medium"
        >
          <Plus size={17} />
          Yeni Araç Ekle
        </button>
      )}
    </div>
  )
}
