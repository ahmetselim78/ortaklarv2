import { useCallback, useEffect, useState } from 'react'
import { X, Pencil, Wrench, Plus, Trash2 } from 'lucide-react'
import type { Siparis, SiparisDetay, SiparisDurum, UretimDurumu } from '@/types/siparis'
import type { Cari } from '@/types/cari'
import type { Stok } from '@/types/stok'
import { getSiparisDetaylari } from '@/hooks/useSiparis'
import { supabase } from '@/lib/supabase'
import { generateCamKodulari } from '@/lib/idGenerator'
import { cn, formatDate } from '@/lib/utils'
import { SORUN_ETIKETLERI } from '@/types/tamir'
import SiparisEditModal from './SiparisEditModal'

interface Props {
  siparis: Siparis
  stoklar: Stok[]
  cariler: Cari[]
  onKapat: () => void
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

export default function SiparisDetayModal({ siparis, stoklar, cariler, onKapat }: Props) {
  const [detaylar, setDetaylar] = useState<DetayWithBatch[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [editModalAcik, setEditModalAcik] = useState(false)

  // Beklemede satır düzenleme durumu
  const [editingDetayId, setEditingDetayId] = useState<string | null>(null)
  const [editRowForm, setEditRowForm] = useState({
    stok_id: '', genislik_mm: '', yukseklik_mm: '', adet: '1',
    ara_bosluk_mm: '', poz: '', cita_stok_id: '', kenar_islemi: '', notlar: '',
  })
  const [rowSaving, setRowSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [rowDeleting, setRowDeleting] = useState(false)
  const [camEkleniyor, setCamEkleniyor] = useState(false)

  const camStoklar = stoklar.filter(s => s.kategori === 'cam')
  const citaStoklar = stoklar.filter(s => s.kategori === 'cita')

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
      ara_bosluk_mm: d.ara_bosluk_mm != null ? String(d.ara_bosluk_mm) : '',
      poz: d.poz ?? '',
      cita_stok_id: d.cita_stok_id ?? '',
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
          ara_bosluk_mm: editRowForm.ara_bosluk_mm ? Number(editRowForm.ara_bosluk_mm) : null,
          poz: editRowForm.poz || null,
          cita_stok_id: editRowForm.cita_stok_id || null,
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
        ara_bosluk_mm: '', poz: '', cita_stok_id: '', kenar_islemi: '', notlar: '',
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
          <div className="flex items-start gap-3">
            {/* Düzenle butonu */}
            <button
              onClick={() => setEditModalAcik(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Pencil size={14} />
              Düzenle
            </button>
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
                    <th className="px-3 py-2.5">Cam Cinsi</th>
                    <th className="px-3 py-2.5">Çita</th>
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
                          <select
                            value={editRowForm.cita_stok_id}
                            onChange={e => setEditRowForm(p => ({ ...p, cita_stok_id: e.target.value }))}
                            className="w-28 rounded border border-gray-200 px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">—</option>
                            {citaStoklar.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
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
                        <td className="px-3 py-2.5 text-gray-700">{d.stok?.ad ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{d.cita_stok?.ad ? (d.cita_stok.ad.match(/\d+\s*mm/i)?.[0] ?? d.cita_stok.ad) : <span className="text-gray-300">—</span>}</td>
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
