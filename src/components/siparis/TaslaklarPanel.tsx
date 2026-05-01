import { useState } from 'react'
import { X, Trash2, FileEdit, Inbox, AlertTriangle } from 'lucide-react'
import type { SiparisTaslak } from '@/types/taslak'
import type { Cari } from '@/types/cari'
import { useEscape } from '@/hooks/useEscape'
import { cn } from '@/lib/utils'

interface Props {
  taslaklar: SiparisTaslak[]
  cariler: Cari[]
  onSec: (taslak: SiparisTaslak) => void
  onSil: (id: string) => void
  onKapat: () => void
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const fark = Date.now() - d.getTime()
  const dk = Math.floor(fark / 60000)
  if (dk < 1) return 'az önce'
  if (dk < 60) return `${dk} dk önce`
  const sa = Math.floor(dk / 60)
  if (sa < 24) return `${sa} sa önce`
  const gun = Math.floor(sa / 24)
  if (gun < 7) return `${gun} gün önce`
  return d.toLocaleDateString('tr-TR')
}

export default function TaslaklarPanel({ taslaklar, cariler, onSec, onSil, onKapat }: Props) {
  useEscape(onKapat)
  const [silOnayId, setSilOnayId] = useState<string | null>(null)

  // En yeni üstte
  const sirali = [...taslaklar].sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onKapat}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Taslaklar</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Yarım kalmış sipariş girişleri burada saklanır.
            </p>
          </div>
          <button onClick={onKapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sirali.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <Inbox size={36} className="text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-600">Henüz taslak yok</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs leading-relaxed">
                Yeni Sipariş ekranını yarıda kapatırsan girilenler burada otomatik saklanır.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sirali.map(t => {
                const cariAd = t.veri.cari_id
                  ? cariler.find(c => c.id === t.veri.cari_id)?.ad ?? 'Bilinmeyen müşteri'
                  : '— Müşteri seçilmemiş —'
                const camSayisi = t.veri.camlar?.filter(c => c.stok_id || c.genislik_mm || c.yukseklik_mm).length ?? 0
                return (
                  <li
                    key={t.id}
                    className="group flex items-stretch hover:bg-blue-50/30 transition-colors"
                  >
                    {silOnayId === t.id ? (
                      /* ── Silme onay satırı ── */
                      <div className="flex-1 flex items-center gap-3 px-5 py-3">
                        <div className="shrink-0 w-9 h-9 rounded-lg bg-red-50 text-red-400 flex items-center justify-center">
                          <AlertTriangle size={16} />
                        </div>
                        <span className="flex-1 text-sm text-gray-700">
                          Bu taslak silinsin mi?
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { onSil(t.id); setSilOnayId(null) }}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
                          >
                            Sil
                          </button>
                          <button
                            type="button"
                            onClick={() => setSilOnayId(null)}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Vazgeç
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSec(t)}
                          className="flex-1 flex items-center gap-3 px-5 py-3 text-left min-w-0"
                        >
                          <div className={cn(
                            'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
                            camSayisi > 0 ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400',
                          )}>
                            <FileEdit size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={cn(
                              'text-sm font-medium truncate',
                              t.veri.cari_id ? 'text-gray-800' : 'text-gray-400 italic',
                            )}>
                              {cariAd}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                              <span>{camSayisi} cam parçası</span>
                              <span className="text-gray-300">·</span>
                              <span>{formatRelative(t.updated_at)}</span>
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSilOnayId(t.id)}
                          className="opacity-0 group-hover:opacity-100 px-3 text-gray-300 hover:text-red-500 transition-all"
                          title="Taslağı sil"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {sirali.length > 0 && (
          <div className="px-5 py-2.5 border-t border-gray-100 text-[11px] text-gray-400 bg-gray-50/50 rounded-b-2xl">
            Bir taslağa tıklayarak kaldığın yerden devam edebilirsin.
          </div>
        )}
      </div>
    </div>
  )
}
