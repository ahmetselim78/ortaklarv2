import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Pencil, Wrench, Plus, Trash2, Replace } from 'lucide-react'
import type { Siparis, SiparisDetay, SiparisDurum, UretimDurumu } from '@/types/siparis'
import type { Cari } from '@/types/cari'
import type { Stok } from '@/types/stok'
import { getSiparisDetaylari } from '@/hooks/useSiparis'
import { supabase } from '@/lib/supabase'
import { generateCamKodulari } from '@/lib/idGenerator'
import { cn, formatDate, camTipiAd } from '@/lib/utils'
import { getCamKompozisyon, getKompozisyonKey, isValidKatmanYapisi, normalizeKatmanYapisi } from '@/lib/cam'
import { useKatmanYapilari } from '@/hooks/useKatmanYapilari'
import { useEscape } from '@/hooks/useEscape'
import { SORUN_ETIKETLERI } from '@/types/tamir'
import SiparisEditModal from './SiparisEditModal'

interface Props {
  siparis: Siparis
  stoklar: Stok[]
  cariler: Cari[]
  onKapat: () => void
  onStokYenile?: () => Promise<void> | void
  onGuncelle?: (id: string, form: { tarih?: string; teslim_tarihi?: string | null; alt_musteri?: string | null; notlar?: string | null }) => Promise<void>
}

const SIPARIS_DURUM_STIL: Record<SiparisDurum, string> = {
  beklemede: 'bg-gray-100 text-gray-600',
  batchte: 'bg-blue-50 text-blue-700',
  yikamada: 'bg-cyan-50 text-cyan-700',
  tamamlandi: 'bg-green-50 text-green-700',
  eksik_var: 'bg-red-50 text-red-600',
  iptal: 'bg-red-50 text-red-600',
}

const SIPARIS_DURUM_ETIKET: Record<SiparisDurum, string> = {
  beklemede: 'Beklemede',
  batchte: 'Batch\'te',
  yikamada: 'Yıkamada',
  tamamlandi: 'Tamamlandı',
  eksik_var: 'Eksik Var',
  iptal: 'İptal',
}

const URETIM_DURUM_STIL: Record<UretimDurumu, string> = {
  bekliyor: 'bg-gray-100 text-gray-500',
  kesildi: 'bg-yellow-50 text-yellow-700',
  yikandi: 'bg-blue-50 text-blue-600',
  etiketlendi: 'bg-purple-50 text-purple-700',
  tamamlandi: 'bg-green-50 text-green-700',
}

const URETIM_DURUM_ETIKET: Record<UretimDurumu, string> = {
  bekliyor: 'Bekliyor',
  kesildi: 'Kesildi',
  yikandi: 'Yıkandı',
  etiketlendi: 'Etiketlendi',
  tamamlandi: 'Tamamlandı',
}

/* ========== Tamir badge yardımcısı ========== */

const TAMIR_DURUM_STIL: Record<string, string> = {
  bekliyor:   'bg-red-50 text-red-700 border border-red-200',
  tamamlandi: 'bg-gray-100 text-gray-500 border border-gray-200',
  hurda:      'bg-gray-100 text-gray-400 border border-gray-200 line-through',
}

const TAMIR_DURUM_ETIKET: Record<string, string> = {
  bekliyor:   'Tamirde',
  tamamlandi: 'Tamir Tamamlandı',
  hurda:      'Hurda',
}

function TamirBadge({ tamir }: { tamir: { durum: string; sorun_tipi: string } }) {
  const sorunEtiket = SORUN_ETIKETLERI[tamir.sorun_tipi as keyof typeof SORUN_ETIKETLERI] ?? tamir.sorun_tipi
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', TAMIR_DURUM_STIL[tamir.durum] ?? 'bg-gray-100 text-gray-500')}>
        <Wrench size={9} />
        {TAMIR_DURUM_ETIKET[tamir.durum] ?? tamir.durum}
      </span>
      <span className="text-[10px] text-gray-400 pl-1">{sorunEtiket}</span>
    </div>
  )
}

interface TamirBilgi {
  durum: string
  sorun_tipi: string
}

interface DetayWithBatch extends SiparisDetay {
  batch_no?: string | null
  aktif_tamir?: TamirBilgi | null
}

export default function SiparisDetayModal({ siparis, stoklar, cariler, onKapat, onStokYenile }: Props) {
  useEscape(onKapat)
  const { yapilar: populerKatmanYapilari } = useKatmanYapilari()
  const [detaylar, setDetaylar] = useState<DetayWithBatch[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [editModalAcik, setEditModalAcik] = useState(false)
  const [topluModalAcik, setTopluModalAcik] = useState(false)
  const [topluKaynakKey, setTopluKaynakKey] = useState('')
  const [topluHedefStokId, setTopluHedefStokId] = useState('')
  // Boş = katman yapısını koru. Dolu + valid format = tüm gruba yeni katman_yapisi yaz.
  const [topluHedefKatmanYapisi, setTopluHedefKatmanYapisi] = useState('')
  const [topluUygulaniyor, setTopluUygulaniyor] = useState(false)

  // Beklemede satır düzenleme durumu
  const [editingDetayId, setEditingDetayId] = useState<string | null>(null)
  const [editRowForm, setEditRowForm] = useState({
    stok_id: '', genislik_mm: '', yukseklik_mm: '', adet: '1',
    poz: '', kenar_islemi: '', notlar: '',
  })
  const [rowSaving, setRowSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [rowDeleting, setRowDeleting] = useState(false)
  const [camEkleniyor, setCamEkleniyor] = useState(false)

  const camStoklar = stoklar.filter(s => s.kategori === 'cam')

  // Siparişteki mevcut cam türleri (toplu düzenle kaynağı için)
  // Group key: stok_id + katman_yapisi → aynı stok ama farklı kompozisyon ayrı tür.
  // ÖNEMLI: kaynak detayların orijinal id'lerini de tutuyoruz çünkü artık DB-side
  // kompozisyon eşleşmesi katman_yapisi TEXT alanı üzerinden yapılıyor; eski veride
  // bu alan NULL olabilir, o yüzden in('id', ...) ile filtreliyoruz (deterministik).
  const siparistekiCamTurleri = useMemo(() => {
    const map = new Map<string, {
      key: string
      stok_id: string
      ad: string
      kompozisyon: string
      detayIds: string[]
      sayi: number
      toplamAdet: number
    }>()
    for (const d of detaylar) {
      if (!d.stok_id) continue
      const stok = camStoklar.find(s => s.id === d.stok_id)
      if (!stok) continue
      const kompozisyon = getCamKompozisyon(d, { ad: stok.ad, kalinlik_mm: stok.kalinlik_mm })
      const key = getKompozisyonKey(d, d.stok_id)
      const mevcut = map.get(key)
      if (mevcut) {
        mevcut.sayi += 1
        mevcut.toplamAdet += d.adet ?? 1
        mevcut.detayIds.push(d.id)
      } else {
        map.set(key, {
          key,
          stok_id: d.stok_id,
          ad: stok.ad,
          kompozisyon,
          detayIds: [d.id],
          sayi: 1,
          toplamAdet: d.adet ?? 1,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.sayi - a.sayi)
  }, [detaylar, camStoklar])

  const topluModalAc = () => {
    setTopluKaynakKey('')
    setTopluHedefStokId('')
    setTopluHedefKatmanYapisi('')
    setTopluModalAcik(true)
  }

  const topluUygula = async () => {
    const kaynak = siparistekiCamTurleri.find(t => t.key === topluKaynakKey)
    if (!kaynak) return
    if (kaynak.detayIds.length === 0) return

    const stokDegisti = !!topluHedefStokId && kaynak.stok_id !== topluHedefStokId
    const yeniKatman = normalizeKatmanYapisi(topluHedefKatmanYapisi)
    const katmanDegisti = topluHedefKatmanYapisi.trim() !== '' && yeniKatman !== '' && yeniKatman !== kaynak.kompozisyon

    // Hiçbir alan değişmediyse no-op
    if (!stokDegisti && !katmanDegisti) return
    // Katman alanı dolu ama format geçersizse bırak
    if (topluHedefKatmanYapisi.trim() !== '' && yeniKatman === '') return

    setTopluUygulaniyor(true)
    try {
      const patch: Record<string, unknown> = {}
      if (stokDegisti) patch.stok_id = topluHedefStokId
      if (katmanDegisti) patch.katman_yapisi = yeniKatman

      const { error } = await supabase
        .from('siparis_detaylari')
        .update(patch)
        .in('id', kaynak.detayIds)
      if (error) throw error
      setTopluModalAcik(false)
      await yukleDetaylar()
    } finally {
      setTopluUygulaniyor(false)
    }
  }

  const yukleDetaylar = useCallback(async () => {
    setYukleniyor(true)
    const camlar = await getSiparisDetaylari(siparis.id)

    if (camlar.length > 0) {
      const camIds = camlar.map(c => c.id)

      const { data: batchData } = await supabase
        .from('uretim_emri_detaylari')
        .select('siparis_detay_id, uretim_emirleri(batch_no)')
        .in('siparis_detay_id', camIds)

      const batchMap = new Map<string, string>()
      for (const b of batchData ?? []) {
        batchMap.set(b.siparis_detay_id, (b as any).uretim_emirleri?.batch_no ?? '')
      }

      const { data: tamirData } = await supabase
        .from('tamir_kayitlari')
        .select('siparis_detay_id, durum, sorun_tipi, created_at')
        .in('siparis_detay_id', camIds)
        .order('created_at', { ascending: false })

      const tamirMap = new Map<string, TamirBilgi>()
      for (const t of tamirData ?? []) {
        if (!tamirMap.has(t.siparis_detay_id)) {
          tamirMap.set(t.siparis_detay_id, { durum: t.durum, sorun_tipi: t.sorun_tipi })
        }
      }

      setDetaylar(camlar.map(c => ({
        ...c,
        batch_no: batchMap.get(c.id) || null,
        aktif_tamir: tamirMap.get(c.id) ?? null,
      })))
    } else {
      setDetaylar([])
    }
    setYukleniyor(false)
  }, [siparis.id])

  useEffect(() => { yukleDetaylar() }, [yukleDetaylar])

  const yikanmis = detaylar.reduce((sum, d) => sum + (d.uretim_durumu === 'yikandi' ? (d.adet ?? 1) : 0), 0)
  const toplam = detaylar.reduce((sum, d) => sum + (d.adet ?? 1), 0)


  const startEditRow = (d: DetayWithBatch) => {
    setEditingDetayId(d.id)
    setEditRowForm({
      stok_id: d.stok_id ?? '',
      genislik_mm: String(d.genislik_mm),
      yukseklik_mm: String(d.yukseklik_mm),
      adet: String(d.adet),
      poz: d.poz ?? '',
      kenar_islemi: d.kenar_islemi ?? '',
      notlar: d.notlar ?? '',
    })
  }

  const saveEditRow = async () => {
    if (!editingDetayId) return
    setRowSaving(true)
    try {
      const { error } = await supabase
        .from('siparis_detaylari')
        .update({
          stok_id: editRowForm.stok_id || null,
          genislik_mm: Number(editRowForm.genislik_mm) || 0,
          yukseklik_mm: Number(editRowForm.yukseklik_mm) || 0,
          adet: Number(editRowForm.adet) || 1,
          poz: editRowForm.poz || null,
          kenar_islemi: editRowForm.kenar_islemi || null,
          notlar: editRowForm.notlar || null,
        })
        .eq('id', editingDetayId)
      if (error) throw error
      setEditingDetayId(null)
      await yukleDetaylar()
    } finally {
      setRowSaving(false)
    }
  }

  const deleteRow = async () => {
    if (!confirmDeleteId) return
    setRowDeleting(true)
    try {
      const { error } = await supabase
        .from('siparis_detaylari')
        .delete()
        .eq('id', confirmDeleteId)
      if (error) throw error
      setConfirmDeleteId(null)
      await yukleDetaylar()
    } finally {
      setRowDeleting(false)
    }
  }

  const addNewRow = async () => {
    setCamEkleniyor(true)
    try {
      const kodlar = await generateCamKodulari(1)
      const { data, error } = await supabase
        .from('siparis_detaylari')
        .insert({
          siparis_id: siparis.id,
          cam_kodu: kodlar[0],
          stok_id: null,
          genislik_mm: 0,
          yukseklik_mm: 0,
          adet: 1,
        })
        .select()
        .single()
      if (error) throw error
      await yukleDetaylar()
      // Immediately open edit for the new row
      setEditingDetayId(data.id)
      setEditRowForm({
        stok_id: '', genislik_mm: '', yukseklik_mm: '', adet: '1',
        poz: '', kenar_islemi: '', notlar: '',
      })
    } finally {
      setCamEkleniyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={cn(
        'w-full bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] transition-all duration-300 ease-out',
        'max-w-4xl'
      )}>
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{siparis.siparis_no}</h2>
            <p className="text-sm text-gray-500">
              {siparis.cari?.ad}
              {siparis.alt_musteri && (
                <span className="text-gray-400"> › {siparis.alt_musteri}</span>
              )}
              {' · '}{formatDate(siparis.tarih)}
              {siparis.teslim_tarihi && ` · Teslim: ${formatDate(siparis.teslim_tarihi)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Düzenle butonu — yeşil */}
            <button
              onClick={() => setEditModalAcik(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap"
            >
              <Pencil size={14} />
              Düzenle
            </button>
            {/* Toplu Düzenle butonu — sadece beklemede iken */}
            {siparis.durum === 'beklemede' && (
              <button
                onClick={topluModalAc}
                disabled={yukleniyor || siparistekiCamTurleri.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                title="Bir cam türünü başka bir cam türüyle topluca değiştir"
              >
                <Replace size={14} />
                Toplu Düzenle
              </button>
            )}
            {/* Durum badge (readonly) */}
            <div className="flex flex-col items-end gap-0.5">
              <span className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                SIPARIS_DURUM_STIL[siparis.durum]
              )}>
                {SIPARIS_DURUM_ETIKET[siparis.durum]}
              </span>
              {siparis.durum === 'tamamlandi' && (
                <span className="text-xs font-medium text-gray-700 pr-1">
                  {siparis.tamamlandi_tarihi
                    ? formatDate(siparis.tamamlandi_tarihi)
                    : formatDate(siparis.created_at)}
                </span>
              )}
            </div>
            <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 mt-0.5">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Yıkama progress */}
        {toplam > 0 && siparis.durum !== 'beklemede' && (
          <div className="px-6 pt-4 shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs text-gray-500 font-medium">Yıkama İlerlemesi</span>
              <span className="text-xs text-gray-400 tabular-nums ml-auto">
                {yikanmis} / {toplam} cam
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all',
                  yikanmis >= toplam ? 'bg-green-500' : 'bg-cyan-500'
                )}
                style={{ width: `${toplam > 0 ? (yikanmis / toplam) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Düzenleme modalı ── */}
        {editModalAcik && (
          <SiparisEditModal
            siparis={siparis}
            detaylar={detaylar}
            cariler={cariler}
            stoklar={stoklar}
            onKapat={() => setEditModalAcik(false)}
            onKaydet={async () => {
              setEditModalAcik(false)
              await yukleDetaylar()
            }}
          />
        )}

        {/* ── Toplu Düzenle modalı ── */}
        {topluModalAcik && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => !topluUygulaniyor && setTopluModalAcik(false)}>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Replace size={18} className="text-blue-600" />
                  <h3 className="text-base font-semibold text-gray-800">Toplu Cam Türü Değiştir</h3>
                </div>
                <button
                  onClick={() => setTopluModalAcik(false)}
                  disabled={topluUygulaniyor}
                  className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                >
                  <X size={18} className="text-gray-500" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Seçtiğiniz cam türündeki <strong>tüm satırların</strong> stok ürünü ve/veya katman
                  yapısı toplu güncellenir. Ölçü, adet, poz gibi diğer bilgiler korunur.
                </p>

                {/* Kaynak */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Değiştirilecek Cam Türü</label>
                  <select
                    value={topluKaynakKey}
                    onChange={e => setTopluKaynakKey(e.target.value)}
                    disabled={topluUygulaniyor}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  >
                    <option value="">— Seçiniz —</option>
                    {siparistekiCamTurleri.map(t => {
                      const prefix = t.kompozisyon ? `${t.kompozisyon} ` : ''
                      return (
                        <option key={t.key} value={t.key}>
                          {prefix}{camTipiAd(t.ad)} ({t.sayi} satır / {t.toplamAdet} adet)
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* Hedef Stok (opsiyonel) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Yeni Cam Türü <span className="text-gray-400 font-normal">(opsiyonel)</span>
                  </label>
                  <select
                    value={topluHedefStokId}
                    onChange={e => setTopluHedefStokId(e.target.value)}
                    disabled={topluUygulaniyor || !topluKaynakKey}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  >
                    <option value="">— Aynı kalsın —</option>
                    {(() => {
                      const kaynakStokId = siparistekiCamTurleri.find(t => t.key === topluKaynakKey)?.stok_id
                      return camStoklar
                        .filter(s => s.id !== kaynakStokId)
                        .map(s => (
                          <option key={s.id} value={s.id}>{camTipiAd(s.ad)}</option>
                        ))
                    })()}
                  </select>
                </div>

                {/* Hedef Katman Yapısı (opsiyonel) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Yeni Katman Yapısı <span className="text-gray-400 font-normal">(opsiyonel)</span>
                  </label>
                  <input
                    type="text"
                    value={topluHedefKatmanYapisi}
                    onChange={e => setTopluHedefKatmanYapisi(e.target.value.replace(/\s+/g, ''))}
                    onFocus={e => e.currentTarget.select()}
                    disabled={topluUygulaniyor || !topluKaynakKey}
                    placeholder={
                      topluKaynakKey
                        ? (siparistekiCamTurleri.find(t => t.key === topluKaynakKey)?.kompozisyon || '4+16+4')
                        : '4+16+4'
                    }
                    className={cn(
                      'w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 disabled:bg-gray-50',
                      topluHedefKatmanYapisi && !isValidKatmanYapisi(topluHedefKatmanYapisi)
                        ? 'border-red-300 focus:ring-red-400 bg-red-50'
                        : 'border-gray-200 focus:ring-blue-500',
                    )}
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {populerKatmanYapilari.slice(0, 6).map(p => (
                      <button
                        key={p}
                        type="button"
                        disabled={topluUygulaniyor || !topluKaynakKey}
                        onClick={() => setTopluHedefKatmanYapisi(p)}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors disabled:opacity-50',
                          topluHedefKatmanYapisi === p
                            ? 'bg-blue-100 text-blue-700 border-blue-300'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600',
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Boş bırakırsanız mevcut katman yapısı korunur.
                  </p>
                </div>

                {/* Önizleme */}
                {topluKaynakKey && (() => {
                  const kaynak = siparistekiCamTurleri.find(t => t.key === topluKaynakKey)
                  if (!kaynak) return null
                  const hedefAd = topluHedefStokId
                    ? camStoklar.find(s => s.id === topluHedefStokId)?.ad
                    : kaynak.ad
                  const yeniKatman = normalizeKatmanYapisi(topluHedefKatmanYapisi)
                  const hedefKatman = yeniKatman || kaynak.kompozisyon
                  const stokDegisti = !!topluHedefStokId && kaynak.stok_id !== topluHedefStokId
                  const katmanDegisti = yeniKatman !== '' && yeniKatman !== kaynak.kompozisyon
                  if (!stokDegisti && !katmanDegisti) return null
                  return (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 leading-relaxed">
                      <div>
                        <strong>{kaynak.sayi}</strong> satır
                        {' ('}<strong>{kaynak.toplamAdet}</strong> adet{') '}
                        güncellenecek:
                      </div>
                      <div className="mt-1 font-mono">
                        {kaynak.kompozisyon} {camTipiAd(kaynak.ad)}
                        {' → '}
                        <strong>{hedefKatman} {camTipiAd(hedefAd)}</strong>
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                <button
                  onClick={() => setTopluModalAcik(false)}
                  disabled={topluUygulaniyor}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  onClick={topluUygula}
                  disabled={(() => {
                    if (topluUygulaniyor || !topluKaynakKey) return true
                    const kaynak = siparistekiCamTurleri.find(t => t.key === topluKaynakKey)
                    if (!kaynak) return true
                    const yeniKatman = normalizeKatmanYapisi(topluHedefKatmanYapisi)
                    // Katman input'u dolu ama geçersiz format → engelle
                    if (topluHedefKatmanYapisi.trim() !== '' && yeniKatman === '') return true
                    const stokDegisti = !!topluHedefStokId && kaynak.stok_id !== topluHedefStokId
                    const katmanDegisti = yeniKatman !== '' && yeniKatman !== kaynak.kompozisyon
                    return !stokDegisti && !katmanDegisti
                  })()}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {topluUygulaniyor ? 'Uygulanıyor...' : 'Uygula'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {yukleniyor ? (
            <div className="py-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : detaylar.length === 0 && siparis.durum !== 'beklemede' ? (
            <div className="text-center py-10 text-gray-400">Cam parçası bulunamadı.</div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                    <th className="px-3 py-2.5">Cam Kodu</th>
                    <th className="px-3 py-2.5">Poz</th>
                    <th className="px-3 py-2.5">Açıklama</th>
                    <th className="px-3 py-2.5">Boyut (mm)</th>
                    <th className="px-3 py-2.5">Adet</th>
                    {siparis.durum !== 'beklemede' && (
                      <>
                        <th className="px-3 py-2.5">Batch</th>
                        <th className="px-3 py-2.5">Yıkama</th>
                        <th className="px-3 py-2.5">Tamir</th>
                      </>
                    )}
                    {siparis.durum === 'beklemede' && (
                      <th className="px-3 py-2.5">İşlem</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {detaylar.map((d) =>
                    editingDetayId === d.id ? (
                      /* ── Düzenleme satırı ── */
                      <tr key={d.id} className="border-b border-blue-100 bg-blue-50/40">
                        <td className="px-3 py-2">
                          <span className="font-mono text-[10px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                            {d.cam_kodu}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={editRowForm.poz}
                            onChange={e => setEditRowForm(p => ({ ...p, poz: e.target.value }))}
                            className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={editRowForm.stok_id}
                            onChange={e => setEditRowForm(p => ({ ...p, stok_id: e.target.value }))}
                            className="w-32 rounded border border-gray-200 px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">—</option>
                            {camStoklar.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editRowForm.genislik_mm}
                              onChange={e => setEditRowForm(p => ({ ...p, genislik_mm: e.target.value }))}
                              className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Gen"
                            />
                            <span className="text-gray-400 text-xs">×</span>
                            <input
                              type="number"
                              value={editRowForm.yukseklik_mm}
                              onChange={e => setEditRowForm(p => ({ ...p, yukseklik_mm: e.target.value }))}
                              className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Yük"
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={editRowForm.adet}
                            onChange={e => setEditRowForm(p => ({ ...p, adet: e.target.value }))}
                            className="w-12 rounded border border-gray-200 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            min={1}
                          />
                        </td>
                        <td className="px-2 py-2" colSpan={siparis.durum !== 'beklemede' ? 3 : 0}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={saveEditRow}
                              disabled={rowSaving}
                              className="px-2 py-1 text-xs rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                              {rowSaving ? '...' : 'Kaydet'}
                            </button>
                            <button
                              onClick={() => setEditingDetayId(null)}
                              className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                            >
                              Vazgeç
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      /* ── Normal görüntüleme satırı ── */
                      <tr key={d.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2.5">
                          <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">
                            {d.cam_kodu}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">
                          {d.poz || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>
                              {(() => {
                                const komp = getCamKompozisyon(d, d.stok)
                                return (
                                  <>
                                    {komp && (
                                      <span className="text-gray-700 font-mono text-xs mr-1">{komp}</span>
                                    )}
                                    {camTipiAd(d.stok?.ad) || '—'}
                                  </>
                                )
                              })()}
                            </span>
                            {d.notlar && d.notlar.split(',').map(t => t.trim()).filter(Boolean).map((tag, i) => {
                              const isMenfez = /menfez/i.test(tag)
                              const isKucuk = /%20|küçük/i.test(tag)
                              return (
                                <span
                                  key={i}
                                  className={cn(
                                    'inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                    isMenfez ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                      : isKucuk ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                                  )}
                                >
                                  {tag}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">
                          {d.genislik_mm} × {d.yukseklik_mm}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{d.adet}</td>
                        {siparis.durum !== 'beklemede' && (
                          <>
                            <td className="px-3 py-2.5">
                              {d.batch_no ? (
                                <span className="font-mono text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded">
                                  {d.batch_no}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={cn(
                                'inline-block rounded px-2 py-0.5 text-xs font-medium',
                                URETIM_DURUM_STIL[d.uretim_durumu]
                              )}>
                                {URETIM_DURUM_ETIKET[d.uretim_durumu]}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              {d.aktif_tamir ? (
                                <TamirBadge tamir={d.aktif_tamir} />
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                          </>
                        )}
                        {siparis.durum === 'beklemede' && (
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEditRow(d)}
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Düzenle"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(d.id)}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Sil"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">{detaylar.length} cam parçası</span>
                {siparis.durum === 'beklemede' && (
                  <button
                    onClick={addNewRow}
                    disabled={camEkleniyor}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                  >
                    <Plus size={13} />
                    {camEkleniyor ? 'Ekleniyor...' : 'Cam Ekle'}
                  </button>
                )}
              </div>
            </div>
          )}
          {siparis.notlar && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <span className="font-medium text-gray-700">Not: </span>{siparis.notlar}
            </div>
          )}
        </div>

        {/* Satır silme onayı */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-2">Cam parçası silinsin mi?</h3>
              <p className="text-sm text-gray-500 mb-5">Bu cam parçası kalıcı olarak silinecek.</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Vazgeç
                </button>
                <button
                  onClick={deleteRow}
                  disabled={rowDeleting}
                  className="px-4 py-1.5 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {rowDeleting ? 'Siliniyor...' : 'Sil'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
