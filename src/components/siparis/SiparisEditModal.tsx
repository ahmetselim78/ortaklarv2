import { useState } from 'react'
import { X, ChevronRight, Trash2, Plus, ChevronDown, ChevronUp, Truck, PackageCheck, AlertTriangle, Eye, EyeOff, Save } from 'lucide-react'
import type { Siparis, SiparisDetay } from '@/types/siparis'
import type { Cari } from '@/types/cari'
import type { Stok } from '@/types/stok'
import { supabase } from '@/lib/supabase'
import { generateCamKodulari } from '@/lib/idGenerator'
import { isValidKatmanYapisi, normalizeKatmanYapisi, getCamKompozisyon } from '@/lib/cam'
import { useKatmanYapilari } from '@/hooks/useKatmanYapilari'
import { useEscape } from '@/hooks/useEscape'
import KatmanCombobox from '@/components/ui/KatmanCombobox'
import { cn } from '@/lib/utils'

const KENAR_ISLEMLERI = ['Rodaj', 'Bizote'] as const
const NOT_ETIKETLERI = ['Menfez'] as const

interface CamSatiri {
  _key: string
  id?: string
  cam_kodu?: string
  stok_id: string
  genislik_mm: string
  yukseklik_mm: string
  adet: string
  katman_yapisi: string  // "4+16+4", "4+12+4+16+5", vb.
  kenar_islemi: string
  notlar: string
  poz: string
}

interface Hatalar {
  cari_id?: string
  tarih?: string
  camlar?: Record<number, { stok_id?: string; genislik_mm?: string; yukseklik_mm?: string; adet?: string }>
}

interface Props {
  siparis: Siparis
  detaylar: SiparisDetay[]
  cariler: Cari[]
  stoklar: Stok[]
  onKaydet: () => void
  onKapat: () => void
}

let _keyCounter = 0
const newKey = () => `k${++_keyCounter}`

/** Mevcut detaydan düzenleme için katman_yapisi türet (eski veri / yeni veri her ikisini destekler). */
function deriveKatmanYapisi(d: SiparisDetay, stoklar: Stok[]): string {
  const norm = normalizeKatmanYapisi(d.katman_yapisi)
  if (norm) return norm
  const stok = stoklar.find(s => s.id === d.stok_id)
  return getCamKompozisyon(d, stok ? { ad: stok.ad, kalinlik_mm: stok.kalinlik_mm } : null)
}

export default function SiparisEditModal({ siparis, detaylar, cariler, stoklar, onKaydet, onKapat }: Props) {
  const { yapilar: populerKatmanYapilari } = useKatmanYapilari()
  const beklemede = siparis.durum === 'beklemede'
  const ADIMLAR = beklemede
    ? [{ no: 1, etiket: 'Sipariş Bilgileri' }, { no: 2, etiket: 'Cam Listesi' }, { no: 3, etiket: 'Sevkiyat' }]
    : [{ no: 1, etiket: 'Sipariş Bilgileri' }, { no: 2, etiket: 'Sevkiyat' }]

  const [adim, setAdim] = useState<1 | 2 | 3>(1)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hatalar, setHatalar] = useState<Hatalar>({})

  // Step 1 state
  const [cariId, setCariId] = useState(siparis.cari_id ?? '')
  const [tarih, setTarih] = useState(siparis.tarih)
  const [teslimTarihi, setTeslimTarihi] = useState(siparis.teslim_tarihi ?? '')
  const [altMusteri, setAltMusteri] = useState(siparis.alt_musteri ?? '')
  const [notlar, setNotlar] = useState(siparis.notlar ?? '')

  // Sevkiyat state
  const mevcutSevkiyat = siparis.sevkiyat_planlari?.[0]
  const [teslimatTipi, setTeslimatTipi] = useState<'teslim_alacak' | 'sevkiyat'>(
    (siparis.teslimat_tipi as string) === 'sevkiyat' || !!mevcutSevkiyat ? 'sevkiyat' : 'teslim_alacak'
  )
  const [mevcutSevkiyatId] = useState<string | null>(mevcutSevkiyat?.id ?? null)
  const [teslimTarihiHata, setTeslimTarihiHata] = useState(false)

  // Step 2 state (cam - only for beklemede)
  const [camlar, setCamlar] = useState<CamSatiri[]>(() =>
    detaylar.map(d => ({
      _key: newKey(),
      id: d.id,
      cam_kodu: d.cam_kodu,
      stok_id: d.stok_id ?? '',
      genislik_mm: String(d.genislik_mm),
      yukseklik_mm: String(d.yukseklik_mm),
      adet: String(d.adet ?? 1),
      katman_yapisi: deriveKatmanYapisi(d, stoklar),
      kenar_islemi: d.kenar_islemi ?? '',
      notlar: d.notlar ?? '',
      poz: d.poz ?? '',
    }))
  )
  const [silinenIds, setSilinenIds] = useState<string[]>([])
  const [genisletilmis, setGenisletilmis] = useState<Set<number>>(new Set())
  const [ozelliklerGoster, setOzelliklerGoster] = useState(true)

  useEscape(onKapat, !kaydediliyor)

  const camStoklar = stoklar.filter(s => s.kategori === 'cam')
  const musteriCariler = cariler.filter(c => c.tipi === 'musteri')

  const updateCam = (idx: number, field: keyof CamSatiri, value: string) => {
    setCamlar(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  const toggleTag = (idx: number, field: 'kenar_islemi' | 'notlar', tag: string) => {
    const current = camlar[idx][field]
    const tags = current ? current.split(',').map(t => t.trim()).filter(Boolean) : []
    const has = tags.includes(tag)
    const next = has ? tags.filter(t => t !== tag) : [...tags, tag]
    updateCam(idx, field, next.join(', '))
  }

  const hasTag = (idx: number, field: 'kenar_islemi' | 'notlar', tag: string) => {
    return camlar[idx][field].split(',').map(t => t.trim()).includes(tag)
  }

  const toggleGenislet = (idx: number) => {
    setGenisletilmis(prev => {
      const s = new Set(prev)
      s.has(idx) ? s.delete(idx) : s.add(idx)
      return s
    })
  }

  const addCam = () => {
    const last = camlar[camlar.length - 1]
    setCamlar(prev => [...prev, {
      _key: newKey(),
      stok_id: last?.stok_id ?? '',
      genislik_mm: '',
      yukseklik_mm: '',
      adet: '1',
      katman_yapisi: last?.katman_yapisi ?? '',
      kenar_islemi: '',
      notlar: '',
      poz: '',
    }])
  }

  const removeCam = (idx: number) => {
    const row = camlar[idx]
    if (row.id) setSilinenIds(prev => [...prev, row.id!])
    setCamlar(prev => prev.filter((_, i) => i !== idx))
  }

  const handleEnterNav = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    fieldName: 'genislik_mm' | 'yukseklik_mm' | 'adet',
  ) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (fieldName === 'genislik_mm') {
      const val = e.currentTarget.value
      if (!val || Number(val) <= 0) return
    }
    const nextFieldMap: Record<string, string | null> = {
      genislik_mm: 'yukseklik_mm',
      yukseklik_mm: 'adet',
      adet: null,
    }
    const nextField = nextFieldMap[fieldName]
    if (nextField) {
      document.querySelector<HTMLElement>(`[data-edit-row="${rowIdx}"][data-edit-field="${nextField}"]`)?.focus()
    } else {
      const nextIdx = rowIdx + 1
      const existing = document.querySelector<HTMLElement>(`[data-edit-row="${nextIdx}"][data-edit-field="genislik_mm"]`)
      if (existing) {
        existing.focus()
      } else {
        addCam()
        setTimeout(() => {
          document.querySelector<HTMLElement>(`[data-edit-row="${nextIdx}"][data-edit-field="genislik_mm"]`)?.focus()
        }, 60)
      }
    }
  }

  const handlePozEnter = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    document.querySelector<HTMLElement>(`[data-edit-row="${rowIdx + 1}"][data-edit-field="poz"]`)?.focus()
  }

  const validateAdim1 = () => {
    const h: Hatalar = {}
    if (!cariId) h.cari_id = 'Müşteri seçiniz'
    if (!tarih) h.tarih = 'Tarih zorunludur'
    setHatalar(h)
    return Object.keys(h).length === 0
  }

  const validateAdim2 = () => {
    const h: Hatalar = { camlar: {} }
    camlar.forEach((c, i) => {
      const rowH: Record<string, string> = {}
      if (!c.stok_id) rowH.stok_id = 'Seçiniz'
      if (!c.genislik_mm || Number(c.genislik_mm) <= 0) rowH.genislik_mm = 'Gerekli'
      if (!c.yukseklik_mm || Number(c.yukseklik_mm) <= 0) rowH.yukseklik_mm = 'Gerekli'
      if (!c.adet || Number(c.adet) < 1) rowH.adet = 'Min 1'
      if (Object.keys(rowH).length > 0) h.camlar![i] = rowH
    })
    if (camlar.length === 0) h.camlar![-1] = { stok_id: 'En az 1 cam ekleyiniz' }
    const hasError = Object.keys(h.camlar!).length > 0
    setHatalar(hasError ? h : {})
    return !hasError
  }

  const ilerle = () => {
    if (adim === 1) {
      if (validateAdim1()) setAdim(2)
    } else if (adim === 2 && beklemede) {
      if (validateAdim2()) setAdim(3)
    }
  }

  const isLastStep = beklemede ? adim === 3 : adim === 2

  const doKaydet = async () => {
    // Direkt kaydet butonu erken adımlarda da çağrılabildiği için tüm adım
    // validasyonları burada da çalıştırılır.
    if (!validateAdim1()) {
      setAdim(1)
      return
    }
    if (beklemede && !validateAdim2()) {
      setAdim(2)
      return
    }
    if (teslimatTipi === 'sevkiyat' && !teslimTarihi) {
      setTeslimTarihiHata(true)
      // Sevkiyat adımına geç ki kullanıcı tarih girsin
      setAdim(beklemede ? 3 : 2)
      return
    }
    setKaydediliyor(true)
    try {
      // 1. Sipariş bilgilerini güncelle
      const { error: sipErr } = await supabase
        .from('siparisler')
        .update({
          cari_id: cariId,
          tarih,
          teslim_tarihi: teslimTarihi || null,
          alt_musteri: altMusteri || null,
          notlar: notlar || null,
          teslimat_tipi: teslimatTipi,
        })
        .eq('id', siparis.id)
      if (sipErr) throw new Error(sipErr.message)

      if (beklemede) {
        // 2. Silinen satırları kaldır (tek istek)
        if (silinenIds.length > 0) {
          const { error } = await supabase
            .from('siparis_detaylari')
            .delete()
            .in('id', silinenIds)
          if (error) throw new Error(error.message)
        }

        // 3. Mevcut satırları TEK upsert ile güncelle (N+1 round-trip yerine 1 istek)
        const mevcutlar = camlar.filter(c => c.id)
        if (mevcutlar.length > 0) {
          const updates = mevcutlar.map(c => ({
            id: c.id!,
            siparis_id: siparis.id,
            cam_kodu: c.cam_kodu,            // NOT NULL — upsert için zorunlu
            stok_id: c.stok_id || null,
            genislik_mm: Number(c.genislik_mm) || 0,
            yukseklik_mm: Number(c.yukseklik_mm) || 0,
            adet: Number(c.adet) || 1,
            katman_yapisi: normalizeKatmanYapisi(c.katman_yapisi) || null,
            kenar_islemi: c.kenar_islemi || null,
            notlar: c.notlar || null,
            poz: c.poz || null,
          }))
          const { error } = await supabase
            .from('siparis_detaylari')
            .upsert(updates, { onConflict: 'id' })
          if (error) throw new Error(error.message)
        }

        // 4. Yeni satırları ekle (tek istek)
        const yeniler = camlar.filter(c => !c.id)
        if (yeniler.length > 0) {
          const kodlar = await generateCamKodulari(yeniler.length)
          const rows = yeniler.map((c, i) => ({
            siparis_id: siparis.id,
            cam_kodu: kodlar[i],
            stok_id: c.stok_id || null,
            genislik_mm: Number(c.genislik_mm) || 0,
            yukseklik_mm: Number(c.yukseklik_mm) || 0,
            adet: Number(c.adet) || 1,
            katman_yapisi: normalizeKatmanYapisi(c.katman_yapisi) || null,
            kenar_islemi: c.kenar_islemi || null,
            notlar: c.notlar || null,
            poz: c.poz || null,
          }))
          const { error } = await supabase.from('siparis_detaylari').insert(rows)
          if (error) throw new Error(error.message)
        }
      }

      // 5. Sevkiyat planını güncelle
      if (mevcutSevkiyatId && teslimatTipi === 'teslim_alacak') {
        await supabase.from('sevkiyat_planlari').delete().eq('id', mevcutSevkiyatId)
      }

      onKaydet()
    } catch (e) {
      console.error(e)
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className={cn(
        'w-full bg-white rounded-2xl shadow-xl flex flex-col transition-all duration-300',
        adim === 2 && beklemede
          ? 'max-w-5xl max-h-[95vh]'
          : isLastStep && teslimatTipi === 'sevkiyat' && !teslimTarihi
            ? 'max-w-xl max-h-[90vh]'
            : 'max-w-lg max-h-[90vh]'
      )}>
        {/* Başlık + Adım göstergesi */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              Sipariş Düzenle — <span className="text-blue-600">{siparis.siparis_no}</span>
            </h2>
            <div className="flex items-center gap-2 mt-2">
              {ADIMLAR.map((a, i) => (
                <div key={a.no} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAdim(a.no as 1 | 2 | 3)}
                    className={cn(
                      'flex items-center gap-1.5 transition-opacity cursor-pointer',
                      adim === a.no ? 'text-blue-600' : adim > a.no ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'
                    )}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                      adim === a.no ? 'bg-blue-600 text-white' : adim > a.no ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                    )}>
                      {adim > a.no ? '✓' : a.no}
                    </div>
                    <span className="text-xs font-medium whitespace-nowrap">{a.etiket}</span>
                  </button>
                  {i < ADIMLAR.length - 1 && <ChevronRight size={11} className="text-gray-300 shrink-0" />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 ml-4 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── ADIM 1: Sipariş Bilgileri ── */}
          {adim === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri *</label>
                <select
                  value={cariId}
                  onChange={e => { setCariId(e.target.value); setHatalar(h => ({ ...h, cari_id: undefined })) }}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500',
                    hatalar.cari_id ? 'border-red-300' : 'border-gray-200'
                  )}
                >
                  <option value="">Müşteri seçiniz...</option>
                  {musteriCariler.map(c => (
                    <option key={c.id} value={c.id}>{c.kod} — {c.ad}</option>
                  ))}
                </select>
                {hatalar.cari_id && <p className="mt-1 text-xs text-red-500">{hatalar.cari_id}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sipariş Tarihi *</label>
                  <input
                    type="date"
                    value={tarih}
                    onChange={e => { setTarih(e.target.value); setHatalar(h => ({ ...h, tarih: undefined })) }}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                      hatalar.tarih ? 'border-red-300' : 'border-gray-200'
                    )}
                  />
                  {hatalar.tarih && <p className="mt-1 text-xs text-red-500">{hatalar.tarih}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teslim Tarihi</label>
                  <input
                    type="date"
                    value={teslimTarihi}
                    onChange={e => setTeslimTarihi(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alt Müşteri</label>
                <input
                  type="text"
                  value={altMusteri}
                  onChange={e => setAltMusteri(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nihai / alt müşteri adı (isteğe bağlı)..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
                <textarea
                  value={notlar}
                  onChange={e => setNotlar(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="İsteğe bağlı not..."
                />
              </div>
            </div>
          )}

          {/* ── ADIM 2: Cam Listesi (sadece beklemede) ── */}
          {adim === 2 && beklemede && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-700">Cam Listesi</h3>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-full">
                    {camlar.length} satır
                  </span>
                  {hatalar.camlar && hatalar.camlar[-1] && (
                    <span className="text-xs text-red-500">{hatalar.camlar[-1].stok_id}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOzelliklerGoster(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                    ozelliklerGoster
                      ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  )}
                  title={ozelliklerGoster ? 'Özellikler kolonunu gizle' : 'Özellikler kolonunu göster'}
                >
                  {ozelliklerGoster ? <Eye size={13} /> : <EyeOff size={13} />}
                  Özellikler
                </button>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(95vh - 280px)' }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-100 border-b-2 border-gray-200 text-left text-[11px] text-gray-600 font-semibold uppercase tracking-wide">
                        <th className="px-2 py-2.5 text-center text-gray-400 w-8">#</th>
                        <th className="px-2 py-2">
                          <span className="flex items-center gap-1 group relative cursor-default">
                            Poz
                            <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold flex items-center justify-center leading-none">?</span>
                            <span className="absolute left-0 top-5 z-20 hidden group-hover:block w-52 bg-gray-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 shadow-lg leading-relaxed">
                              Pozisyon numarası. Tüm ölçüler girildikten sonra toplu girilmesi tavsiye edilir.
                              <br />
                              <span className="text-gray-300">Poz seçiliyken </span>
                              <kbd className="px-1 py-0.5 bg-gray-700 rounded text-[9px] font-mono">Enter</kbd>
                              <span className="text-gray-300"> ile bir sonraki satırın Poz alanına geçilir.</span>
                            </span>
                          </span>
                        </th>
                        <th className="px-2 py-2">Cam Cinsi *</th>
                        <th className="px-2 py-2">Katman</th>
                        <th className="px-2 py-2">Gen. (mm)</th>
                        <th className="px-2 py-2">Yük. (mm)</th>
                        <th className="px-2 py-2">Adet</th>
                        {ozelliklerGoster && <th className="px-2 py-2 w-[210px]">Özellikler</th>}
                        <th className="px-2 py-2 w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {camlar.map((cam, index) => {
                        const rowH = hatalar.camlar?.[index]
                        return (
                          <tr key={cam._key} className={cn(
                            'border-b border-gray-100 last:border-0',
                            index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                          )}>
                            <td className="px-2 py-2 text-center text-[10px] text-gray-400 font-mono font-medium">{index + 1}</td>
                            <td className="px-1.5 py-1.5">
                              <input
                                type="text"
                                value={cam.poz}
                                onChange={e => updateCam(index, 'poz', e.target.value)}
                                data-edit-row={index}
                                data-edit-field="poz"
                                onKeyDown={e => handlePozEnter(e, index)}
                                onFocus={e => e.currentTarget.select()}
                                className="w-20 rounded border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="K1"
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <select
                                value={cam.stok_id}
                                onChange={e => updateCam(index, 'stok_id', e.target.value)}
                                className={cn(
                                  'w-40 rounded border px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
                                  rowH?.stok_id ? 'border-red-300' : 'border-gray-200'
                                )}
                              >
                                <option value="">Seçiniz...</option>
                                {camStoklar.map(s => (
                                  <option key={s.id} value={s.id}>{s.ad}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-1.5 py-1.5">
                              <KatmanCombobox
                                value={cam.katman_yapisi}
                                onChange={v => updateCam(index, 'katman_yapisi', v.replace(/\s+/g, ''))}
                                options={populerKatmanYapilari}
                                invalid={!!cam.katman_yapisi && !isValidKatmanYapisi(cam.katman_yapisi)}
                                placeholder="4+16+4"
                                className="w-28"
                                title="Katman yapısı (örn. 4+16+4 veya 4+12+4+16+5)."
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <input
                                type="number"
                                value={cam.genislik_mm}
                                onChange={e => updateCam(index, 'genislik_mm', e.target.value)}
                                data-edit-row={index}
                                data-edit-field="genislik_mm"
                                onKeyDown={e => handleEnterNav(e, index, 'genislik_mm')}
                                onFocus={e => e.currentTarget.select()}
                                className={cn(
                                  'w-20 rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                                  rowH?.genislik_mm ? 'border-red-300' : 'border-gray-200'
                                )}
                                placeholder="0"
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <input
                                type="number"
                                value={cam.yukseklik_mm}
                                onChange={e => updateCam(index, 'yukseklik_mm', e.target.value)}
                                data-edit-row={index}
                                data-edit-field="yukseklik_mm"
                                onKeyDown={e => handleEnterNav(e, index, 'yukseklik_mm')}
                                onFocus={e => e.currentTarget.select()}
                                className={cn(
                                  'w-20 rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                                  rowH?.yukseklik_mm ? 'border-red-300' : 'border-gray-200'
                                )}
                                placeholder="0"
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <input
                                type="number"
                                value={cam.adet}
                                onChange={e => updateCam(index, 'adet', e.target.value)}
                                data-edit-row={index}
                                data-edit-field="adet"
                                onKeyDown={e => handleEnterNav(e, index, 'adet')}
                                onFocus={e => e.currentTarget.select()}
                                className={cn(
                                  'w-16 rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                                  rowH?.adet ? 'border-red-300' : 'border-gray-200'
                                )}
                                placeholder="1"
                                min={1}
                              />
                            </td>
                            <td className="px-1.5 py-1.5 w-[210px]" hidden={!ozelliklerGoster}>
                              <div className="flex flex-wrap gap-1 items-center" style={{ maxWidth: '200px' }}>
                                {NOT_ETIKETLERI.map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => toggleTag(index, 'notlar', tag)}
                                    className={cn(
                                      'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                                      hasTag(index, 'notlar', tag)
                                        ? 'bg-amber-100 text-amber-700 border-amber-300'
                                        : 'bg-white text-gray-400 border-gray-200 hover:border-amber-300 hover:text-amber-600'
                                    )}
                                  >
                                    {tag}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => toggleGenislet(index)}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-gray-200 bg-white text-gray-400 hover:border-blue-300 hover:text-blue-600 transition-colors flex items-center gap-0.5"
                                >
                                  {genisletilmis.has(index)
                                    ? <><ChevronUp size={9} /> Az</>
                                    : <><ChevronDown size={9} /> Kenar</>}
                                </button>
                                {genisletilmis.has(index) && KENAR_ISLEMLERI.map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => toggleTag(index, 'kenar_islemi', tag)}
                                    className={cn(
                                      'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                                      hasTag(index, 'kenar_islemi', tag)
                                        ? 'bg-blue-100 text-blue-700 border-blue-300'
                                        : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                                    )}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="px-1.5 py-1.5">
                              <button
                                type="button"
                                onClick={() => removeCam(index)}
                                disabled={camlar.length <= 1}
                                className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400">{camlar.length} cam parçası</span>
                  <button
                    type="button"
                    onClick={addCam}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus size={13} />
                    Cam Ekle
                  </button>
                </div>
              </div>

              <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">Enter</kbd> ile Gen → Yük → Adet → bir sonraki satır.
                {' '}Poz sütununda <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">Enter</kbd> aşağıdaki Poz'a geçer.
              </p>
            </div>
          )}

          {/* ── Sevkiyat adımı ── */}
          {((adim === 3 && beklemede) || (adim === 2 && !beklemede)) && (
            <div className="space-y-5">
              <p className="text-sm text-gray-500">Bu sipariş nasıl teslim edilecek?</p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTeslimatTipi('teslim_alacak')}
                  className={cn(
                    'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all',
                    teslimatTipi === 'teslim_alacak'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  )}
                >
                  <PackageCheck size={30} className={teslimatTipi === 'teslim_alacak' ? 'text-blue-600' : 'text-gray-400'} />
                  <div className="text-center">
                    <div className={cn('text-sm font-semibold', teslimatTipi === 'teslim_alacak' ? 'text-blue-700' : 'text-gray-600')}>
                      Teslim Alacak
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Müşteri gelip alacak</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { setTeslimatTipi('sevkiyat'); setTeslimTarihiHata(false) }}
                  className={cn(
                    'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all',
                    teslimatTipi === 'sevkiyat'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  )}
                >
                  <Truck size={30} className={teslimatTipi === 'sevkiyat' ? 'text-blue-600' : 'text-gray-400'} />
                  <div className="text-center">
                    <div className={cn('text-sm font-semibold', teslimatTipi === 'sevkiyat' ? 'text-blue-700' : 'text-gray-600')}>
                      Sevkiyat
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Araçla teslim edilecek</div>
                  </div>
                </button>
              </div>

              {/* Teslim tarihi uyarısı — sadece sevkiyat seçiliyse */}
              {teslimatTipi === 'sevkiyat' && (
                <div className={cn(
                  'rounded-xl border-2 p-4 transition-all',
                  !teslimTarihi ? 'border-orange-300 bg-orange-50' : 'border-green-200 bg-green-50'
                )}>
                  {!teslimTarihi && (
                    <div className="flex items-center gap-2 text-orange-700 mb-3">
                      <AlertTriangle size={15} className="shrink-0" />
                      <span className="text-sm font-medium">Sevkiyat için teslim tarihi gereklidir</span>
                    </div>
                  )}
                  <label className={cn(
                    'block text-xs font-medium mb-1',
                    !teslimTarihi ? 'text-orange-700' : 'text-green-700'
                  )}>
                    Teslim Tarihi *
                  </label>
                  <input
                    type="date"
                    value={teslimTarihi}
                    onChange={e => { setTeslimTarihi(e.target.value); setTeslimTarihiHata(false) }}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
                      teslimTarihiHata
                        ? 'border-red-400 focus:ring-red-400'
                        : !teslimTarihi
                          ? 'border-orange-300 focus:ring-orange-400'
                          : 'border-green-300 focus:ring-green-400'
                    )}
                  />
                  {teslimTarihiHata && (
                    <p className="mt-1 text-xs text-red-500">Sevkiyat için teslim tarihi zorunludur.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alt Butonlar */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={adim === 1 ? onKapat : () => setAdim((adim - 1) as 1 | 2 | 3)}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {adim === 1 ? 'Vazgeç' : '← Geri'}
          </button>

          {(() => {
            if (isLastStep) return (
              <button
                onClick={doKaydet}
                disabled={kaydediliyor}
                className="px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            )
            const nextLabel = adim === 1
              ? (beklemede ? 'Cam Listesi' : 'Sevkiyat')
              : 'Sevkiyat'
            return (
              <div className="flex items-center gap-2">
                <button
                  onClick={ilerle}
                  className="flex items-center gap-1.5 px-5 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  {nextLabel}
                  <ChevronRight size={15} />
                </button>
                <button
                  onClick={doKaydet}
                  disabled={kaydediliyor}
                  title="Mevcut bilgilerle direkt kaydet (sevkiyat adımını atla)"
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} />
                  {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
