import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Pencil, Wrench, Plus, Trash2, Replace } from 'lucide-react'
import type { Siparis, SiparisDetay, UretimDurumu } from '@/types/siparis'
import type { Cari } from '@/types/cari'
import type { Stok } from '@/types/stok'
import { getSiparisDetaylari } from '@/hooks/useSiparis'
import { supabase } from '@/lib/supabase'
import { fizikselGlsKodu, tekilSiparisDetayRows } from '@/lib/siparisDetay'
import { cn, formatDate } from '@/lib/utils'
import { getStokGosterimAciklamasi } from '@/lib/cam'
import CamStokPicker from '@/components/siparis/CamStokPicker'
import { useEscape } from '@/hooks/useEscape'
import { SORUN_ETIKETLERI } from '@/types/tamir'
import SiparisEditModal from './SiparisEditModal'
import StatusBadge from '@/components/ui/StatusBadge'

interface Props {
  siparis: Siparis
  stoklar: Stok[]
  cariler: Cari[]
  onKapat: () => void
  batchKonteksti?: { uretimEmriId: string }
  onStokYenile?: () => Promise<void> | void
  onGuncelle?: (id: string, form: { tarih?: string; teslim_tarihi?: string | null; alt_musteri?: string | null; notlar?: string | null }) => Promise<void>
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
  sira_no?: number | null
  aktif_tamir?: TamirBilgi | null
}

type BatchJoinRow = {
  siparis_detay_id: string
  sira_no: number | null
  uretim_emirleri?: { batch_no?: string | null } | { batch_no?: string | null }[] | null
}

export default function SiparisDetayModal({ siparis, stoklar, cariler, onKapat, batchKonteksti }: Props) {
  useEscape(onKapat)
  const [detaylar, setDetaylar] = useState<DetayWithBatch[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [editModalAcik, setEditModalAcik] = useState(false)
  const [topluModalAcik, setTopluModalAcik] = useState(false)
  const [topluKaynakKey, setTopluKaynakKey] = useState('')
  const [topluHedefStokId, setTopluHedefStokId] = useState('')
  const [topluUygulaniyor, setTopluUygulaniyor] = useState(false)

  // Beklemede satır düzenleme durumu
  const [editingDetayId, setEditingDetayId] = useState<string | null>(null)
  const [editRowForm, setEditRowForm] = useState({
    stok_id: '', genislik_mm: '', yukseklik_mm: '', adet: '1',
    poz: '', kenar_islemi: '', notlar: '',
  })
  const [rowSaving, setRowSaving] = useState(false)
  const [rowHata, setRowHata] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [rowDeleting, setRowDeleting] = useState(false)
  const [camEkleniyor, setCamEkleniyor] = useState(false)

  const camStoklar = stoklar.filter(s => s.kategori === 'cam')
  const aktifCamStoklar = camStoklar.filter(s => s.aktif !== false)

  // Siparişteki mevcut cam türleri (toplu düzenle kaynağı için).
  // Kombinasyon stok kartı tek kaynak olduğu için gruplama yalnızca stok_id ile yapılır.
  const siparistekiCamTurleri = useMemo(() => {
    const map = new Map<string, {
      key: string
      stok_id: string
      aciklama: string
      detayIds: string[]
      sayi: number
      toplamAdet: number
    }>()
    for (const d of detaylar) {
      if (!d.stok_id) continue
      const stok = camStoklar.find(s => s.id === d.stok_id)
      if (!stok) continue
      const key = d.stok_id
      const mevcut = map.get(key)
      if (mevcut) {
        mevcut.sayi += 1
        mevcut.toplamAdet += d.adet ?? 1
        mevcut.detayIds.push(d.id)
      } else {
        map.set(key, {
          key,
          stok_id: d.stok_id,
          aciklama: getStokGosterimAciklamasi(stok),
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
    setTopluModalAcik(true)
  }

  const topluUygula = async () => {
    const kaynak = siparistekiCamTurleri.find(t => t.key === topluKaynakKey)
    if (!kaynak) return
    if (kaynak.detayIds.length === 0) return

    const hedefStok = topluHedefStokId ? camStoklar.find(s => s.id === topluHedefStokId) : null
    const stokDegisti = !!topluHedefStokId && kaynak.stok_id !== topluHedefStokId
    if (!stokDegisti || !hedefStok) return

    setTopluUygulaniyor(true)
    try {
      const { error } = await supabase
        .from('siparis_detaylari')
        .update({
          stok_id: topluHedefStokId,
        })
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

    if (batchKonteksti) {
      const { data: batchRows } = await supabase
        .from('uretim_emri_detaylari')
        .select('siparis_detay_id, sira_no')
        .eq('uretim_emri_id', batchKonteksti.uretimEmriId)

      const siraMap = new Map<string, number | null>()
      for (const b of batchRows ?? []) {
        siraMap.set(b.siparis_detay_id, b.sira_no ?? null)
      }

      const batchCamlar = camlar
        .filter((c) => siraMap.has(c.id))
        .sort((a, b) => (siraMap.get(a.id) ?? 0) - (siraMap.get(b.id) ?? 0))

      if (batchCamlar.length > 0) {
        const camIds = batchCamlar.map((c) => c.id)
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

        setDetaylar(batchCamlar.map((c) => ({
          ...c,
          batch_no: null,
          sira_no: siraMap.get(c.id) ?? null,
          aktif_tamir: tamirMap.get(c.id) ?? null,
        })))
      } else {
        setDetaylar([])
      }
    } else if (camlar.length > 0) {
      const camIds = camlar.map(c => c.id)

      const { data: batchData } = await supabase
        .from('uretim_emri_detaylari')
        .select('siparis_detay_id, sira_no, uretim_emirleri(batch_no)')
        .in('siparis_detay_id', camIds)

      const batchMap = new Map<string, { batch_no: string; sira_no: number | null }>()
      for (const b of (batchData ?? []) as BatchJoinRow[]) {
        const emir = Array.isArray(b.uretim_emirleri) ? b.uretim_emirleri[0] : b.uretim_emirleri
        batchMap.set(b.siparis_detay_id, {
          batch_no: emir?.batch_no ?? '',
          sira_no: b.sira_no ?? null,
        })
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
        batch_no: batchMap.get(c.id)?.batch_no || null,
        sira_no: batchMap.get(c.id)?.sira_no ?? null,
        aktif_tamir: tamirMap.get(c.id) ?? null,
      })))
    } else {
      setDetaylar([])
    }
    setYukleniyor(false)
  }, [siparis.id, batchKonteksti])

  useEffect(() => { yukleDetaylar() }, [yukleDetaylar])

  const yikanmis = detaylar.reduce((sum, d) => sum + (d.uretim_durumu === 'yikandi' ? (d.adet ?? 1) : 0), 0)
  const toplam = detaylar.reduce((sum, d) => sum + (d.adet ?? 1), 0)


  const startEditRow = (d: DetayWithBatch) => {
    setEditingDetayId(d.id)
    setRowHata(null)
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
    const genislik = Number(editRowForm.genislik_mm)
    const yukseklik = Number(editRowForm.yukseklik_mm)
    const adet = Number(editRowForm.adet)
    if (!Number.isFinite(genislik) || genislik <= 0 || !Number.isFinite(yukseklik) || yukseklik <= 0 || !Number.isFinite(adet) || adet <= 0) {
      setRowHata('Genislik, yukseklik ve adet 0dan buyuk olmali.')
      return
    }
    setRowSaving(true)
    setRowHata(null)
    try {
      const mevcut = detaylar.find(d => d.id === editingDetayId)
      const { error } = await supabase
        .from('siparis_detaylari')
        .update({
          stok_id: editRowForm.stok_id || null,
          genislik_mm: genislik,
          yukseklik_mm: yukseklik,
          adet: 1,
          poz: editRowForm.poz || null,
          kenar_islemi: editRowForm.kenar_islemi || null,
          notlar: editRowForm.notlar || null,
        })
        .eq('id', editingDetayId)
      if (error) throw error
      if (adet > 1) {
        const rows = await tekilSiparisDetayRows(siparis.id, [{
          stok_id: editRowForm.stok_id || null,
          genislik_mm: genislik,
          yukseklik_mm: yukseklik,
          adet: adet - 1,
          poz: editRowForm.poz || null,
          kenar_islemi: editRowForm.kenar_islemi || null,
          notlar: editRowForm.notlar || null,
          cita_stok_id: mevcut?.cita_stok_id ?? null,
          menfez_cap_mm: mevcut?.menfez_cap_mm ?? null,
          kucuk_cam: mevcut?.kucuk_cam ?? false,
        }])
        const { error: ekHata } = await supabase.from('siparis_detaylari').insert(rows)
        if (ekHata) throw ekHata
      }
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
    setRowHata(null)
    try {
      const rows = await tekilSiparisDetayRows(siparis.id, [{
        stok_id: null,
        genislik_mm: 1,
        yukseklik_mm: 1,
        adet: 1,
      }])
      const { data, error } = await supabase
        .from('siparis_detaylari')
        .insert(rows[0])
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
              <StatusBadge durum={siparis.durum} boyut="sm" className="rounded-lg" />
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
                  Seçtiğiniz cam türündeki <strong>tüm satırların</strong> stok kartı toplu güncellenir.
                  Ölçü, adet, poz gibi diğer bilgiler korunur.
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
                    {siparistekiCamTurleri.map(t => (
                        <option key={t.key} value={t.key}>
                          {t.aciklama} ({t.sayi} satır / {t.toplamAdet} adet)
                        </option>
                      ))}
                  </select>
                </div>

                {/* Hedef Stok (opsiyonel) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Yeni Cam Türü <span className="text-gray-400 font-normal">(opsiyonel)</span>
                  </label>
                  <CamStokPicker
                    stoklar={(() => {
                      const kaynakStokId = siparistekiCamTurleri.find(t => t.key === topluKaynakKey)?.stok_id
                      return aktifCamStoklar.filter(s => s.id !== kaynakStokId)
                    })()}
                    value={topluHedefStokId}
                    onChange={setTopluHedefStokId}
                    placeholder="— Aynı kalsın —"
                    className="max-w-none"
                    disabled={topluUygulaniyor || !topluKaynakKey}
                  />
                </div>

                {/* Önizleme */}
                {topluKaynakKey && (() => {
                  const kaynak = siparistekiCamTurleri.find(t => t.key === topluKaynakKey)
                  if (!kaynak) return null
                  const hedefStok = topluHedefStokId
                    ? camStoklar.find(s => s.id === topluHedefStokId)
                    : null
                  const stokDegisti = !!topluHedefStokId && kaynak.stok_id !== topluHedefStokId
                  if (!stokDegisti || !hedefStok) return null
                  return (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 leading-relaxed">
                      <div>
                        <strong>{kaynak.sayi}</strong> satır
                        {' ('}<strong>{kaynak.toplamAdet}</strong> adet{') '}
                        güncellenecek:
                      </div>
                      <div className="mt-1 font-mono">
                        {kaynak.aciklama}
                        {' → '}
                        <strong>{getStokGosterimAciklamasi(hedefStok)}</strong>
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
                    return !topluHedefStokId || kaynak.stok_id === topluHedefStokId
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
                    <th className="px-3 py-2.5">Açıklama</th>
                    <th className="px-3 py-2.5">Boyut (mm)</th>
                    <th className="px-3 py-2.5">Adet</th>
                    <th className="px-3 py-2.5">Poz</th>
                    {siparis.durum !== 'beklemede' && (
                      <>
                        <th className="px-3 py-2.5">{batchKonteksti ? 'Sıra' : 'Batch'}</th>
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
                        <td className="px-2 py-2">
                          <CamStokPicker
                            stoklar={camStoklar.filter(s => s.aktif !== false || s.id === editRowForm.stok_id)}
                            value={editRowForm.stok_id}
                            onChange={v => setEditRowForm(p => ({ ...p, stok_id: v }))}
                            pasifEtiketi
                            className="max-w-none min-w-[12rem]"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              value={editRowForm.genislik_mm}
                              onChange={e => setEditRowForm(p => ({ ...p, genislik_mm: e.target.value }))}
                              className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Gen"
                            />
                            <span className="text-gray-400 text-xs">×</span>
                            <input
                              type="number"
                              min={1}
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
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={editRowForm.poz}
                            onChange={e => setEditRowForm(p => ({ ...p, poz: e.target.value }))}
                            className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="—"
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
                              onClick={() => { setEditingDetayId(null); setRowHata(null) }}
                              className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                            >
                              Vazgeç
                            </button>
                          </div>
                          {rowHata && <p className="mt-1 text-xs text-red-600">{rowHata}</p>}
                        </td>
                      </tr>
                    ) : (
                      /* ── Normal görüntüleme satırı ── */
                      <tr key={d.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2.5 text-gray-700">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{d.stok ? getStokGosterimAciklamasi(d.stok) : '—'}</span>
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
                        <td className="px-3 py-2.5 text-gray-500 text-xs">
                          {d.poz || <span className="text-gray-300">—</span>}
                        </td>
                        {siparis.durum !== 'beklemede' && (
                          <>
                            <td className="px-3 py-2.5">
                              {batchKonteksti ? (
                                d.sira_no != null ? (
                                  <span className="font-mono text-xs font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
                                    {fizikselGlsKodu(d.sira_no, d.cam_kodu)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )
                              ) : d.batch_no ? (
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
