import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Save, Loader2, GripVertical, RotateCcw } from 'lucide-react'
import { useKatmanYapilari } from '@/hooks/useKatmanYapilari'
import { isValidKatmanYapisi, normalizeKatmanYapisi } from '@/lib/cam'
import { cn } from '@/lib/utils'

const VARSAYILAN: string[] = [
  '4+12+4',
  '4+16+4',
  '4+20+4',
  '4+12+4+16+4',
  '4+16+4+16+4',
  '4+14+5',
  '4+12+5',
  '5+16+5',
]

/**
 * "Popüler Katman Yapıları" — sipariş satırlarının Katman input'unda
 * öneri olarak çıkacak listenin yönetimi. Sürükle-bırak destekli.
 *
 * Saklama: ayarlar tablosu, anahtar='populer_katman_yapilari', deger.liste = string[].
 */
export default function KatmanYapilariPanel() {
  const { yapilar, yukleniyor, kaydediyor, hata, guncelle } = useKatmanYapilari()
  const [taslak, setTaslak] = useState<string[]>([])
  const [yeni, setYeni] = useState('')
  const [yeniHata, setYeniHata] = useState('')
  const [bilgi, setBilgi] = useState<string | null>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTaslak(yapilar) }, [yapilar])

  const degisti = JSON.stringify(taslak) !== JSON.stringify(yapilar)

  const ekle = () => {
    if (!yeni.trim()) return
    const v = normalizeKatmanYapisi(yeni)
    if (!isValidKatmanYapisi(v)) {
      setYeniHata('Geçersiz format. Örn: 4+16+4')
      return
    }
    if (taslak.includes(v)) {
      setYeniHata('Bu kombinasyon zaten listede.')
      return
    }
    setTaslak([...taslak, v])
    setYeni('')
    setYeniHata('')
    setBilgi(null)
    inputRef.current?.focus()
  }

  const sil = (idx: number) => {
    setTaslak(taslak.filter((_, i) => i !== idx))
    setBilgi(null)
  }

  const varsayilanaDon = () => {
    setTaslak(VARSAYILAN)
    setBilgi(null)
  }

  const kaydet = async () => {
    setBilgi(null)
    const ok = await guncelle(taslak)
    if (ok) setBilgi('Kaydedildi.')
  }

  /* ── Drag & Drop (HTML5 native) ──────────────────────────────── */
  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDraggingIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overIdx !== idx) setOverIdx(idx)
  }
  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (draggingIdx === null || draggingIdx === idx) {
      setDraggingIdx(null); setOverIdx(null)
      return
    }
    const yeniListe = [...taslak]
    const [tasinan] = yeniListe.splice(draggingIdx, 1)
    yeniListe.splice(idx, 0, tasinan)
    setTaslak(yeniListe)
    setDraggingIdx(null)
    setOverIdx(null)
    setBilgi(null)
  }
  const handleDragEnd = () => {
    setDraggingIdx(null)
    setOverIdx(null)
  }

  if (yukleniyor) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Loader2 size={14} className="animate-spin" /> Yükleniyor…
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      {/* Açıklama kartı */}
      <div className="mb-5 p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
        <p className="text-sm text-gray-700 leading-relaxed">
          Sipariş düzenleme ekranında <strong>Katman</strong> sütununun otomatik tamamlama
          listesinde görünecek kombinasyonlar. Üstteki öğeler en sık kullanılanlar olmalı —
          sıralamayı sürükle‑bırak ile değiştirebilirsin.
        </p>
      </div>

      {/* Liste kartı */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Liste</span>
            <span className="text-xs text-gray-400">({taslak.length})</span>
          </div>
          <button
            type="button"
            onClick={varsayilanaDon}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 transition-colors"
            title="Varsayılan listeye dön"
          >
            <RotateCcw size={11} />
            Varsayılan
          </button>
        </div>

        {taslak.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-400 text-center">
            Henüz öğe yok. Aşağıdan ekleyin.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {taslak.map((y, i) => {
              const aktif = draggingIdx === i
              const hedef = overIdx === i && draggingIdx !== null && draggingIdx !== i
              return (
                <li
                  key={`${y}-${i}`}
                  draggable
                  onDragStart={handleDragStart(i)}
                  onDragOver={handleDragOver(i)}
                  onDrop={handleDrop(i)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'group flex items-center gap-3 px-4 py-2.5 transition-all cursor-grab active:cursor-grabbing select-none border-l-4',
                    aktif && 'opacity-40',
                    hedef ? 'bg-emerald-50 border-emerald-500' : 'border-transparent hover:bg-gray-50',
                  )}
                >
                  <GripVertical
                    size={16}
                    className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0"
                  />
                  <span className="w-6 text-[11px] text-gray-400 font-medium tabular-nums">
                    {i + 1}.
                  </span>
                  <span className="font-mono text-sm text-gray-800 flex-1">{y}</span>
                  <button
                    type="button"
                    onClick={() => sil(i)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                    title="Sil"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* Yeni ekle satırı */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/30">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={yeni}
              onChange={e => { setYeni(e.target.value.replace(/\s+/g, '')); setYeniHata('') }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ekle() } }}
              placeholder="Yeni kombinasyon — örn. 4+16+4"
              className={cn(
                'flex-1 px-3 py-2 text-sm font-mono bg-white border rounded-lg focus:outline-none focus:ring-2 transition-shadow',
                yeniHata
                  ? 'border-red-300 focus:ring-red-400'
                  : 'border-gray-200 focus:ring-emerald-400 focus:border-emerald-300',
              )}
            />
            <button
              type="button"
              onClick={ekle}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <Plus size={14} />
              Ekle
            </button>
          </div>
          {yeniHata ? (
            <p className="mt-1.5 text-[11px] text-red-500">{yeniHata}</p>
          ) : (
            <p className="mt-1.5 text-[11px] text-gray-400">
              En az 2, en fazla 5 sayı (örn. <code className="font-mono">4+16+4</code> veya{' '}
              <code className="font-mono">4+12+4+16+5</code>).{' '}
              <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded font-mono text-[10px]">Enter</kbd> ile ekle.
            </p>
          )}
        </div>
      </div>

      {/* Kaydet barı */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs">
          {hata && <span className="text-red-500">{hata}</span>}
          {!hata && bilgi && <span className="text-emerald-600 font-medium">✓ {bilgi}</span>}
          {!hata && !bilgi && degisti && (
            <span className="text-amber-600">● Kaydedilmemiş değişiklikler var</span>
          )}
          {!hata && !bilgi && !degisti && (
            <span className="text-gray-400">Tüm değişiklikler kayıtlı</span>
          )}
        </div>
        <button
          type="button"
          onClick={kaydet}
          disabled={kaydediyor || !degisti}
          className={cn(
            'flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-lg transition-all',
            kaydediyor || !degisti
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow',
          )}
        >
          {kaydediyor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Kaydet
        </button>
      </div>
    </div>
  )
}
