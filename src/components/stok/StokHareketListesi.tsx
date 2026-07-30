import { ArrowDownToLine, ArrowUpFromLine, History } from 'lucide-react'
import { STOK_HAREKET_ETIKETLERI, stokMiktari } from '@/lib/stokHareket'
import type { StokHareketi } from '@/types/stok'

export default function StokHareketListesi({
  hareketler,
  limit = 10,
}: {
  hareketler: StokHareketi[]
  limit?: number
}) {
  const gosterilen = hareketler.slice(0, limit)
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <History size={17} className="text-blue-600" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Son stok hareketleri</h2>
            <p className="text-[11px] text-gray-500">Giriş, çıkış, iade, fire ve sayım geçmişi</p>
          </div>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{hareketler.length} kayıt</span>
      </div>
      {gosterilen.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-gray-500">Henüz stok hareketi kaydedilmemiş.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Tarih</th>
                <th className="px-4 py-2.5">Stok</th>
                <th className="px-4 py-2.5">Hareket</th>
                <th className="px-4 py-2.5">Tedarikçi / belge</th>
                <th className="px-4 py-2.5 text-right">Miktar</th>
                <th className="px-4 py-2.5 text-right">Son bakiye</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {gosterilen.map((hareket) => {
                const giris = hareket.net_miktar > 0
                return (
                  <tr key={hareket.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(hareket.islem_tarihi))}</td>
                    <td className="px-4 py-3"><div className="font-medium text-gray-900">{hareket.stok_adi}</div><div className="font-mono text-[11px] text-gray-400">{hareket.stok_kodu}</div></td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${giris ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{giris ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}{STOK_HAREKET_ETIKETLERI[hareket.hareket_turu]}</span><div className="mt-1 max-w-60 truncate text-[11px] text-gray-500" title={hareket.aciklama}>{hareket.aciklama}</div></td>
                    <td className="px-4 py-3 text-xs text-gray-600"><div>{hareket.tedarikci_adi || '—'}</div><div className="mt-0.5 text-gray-400">{hareket.belge_no || 'Belge yok'}</div></td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${giris ? 'text-emerald-700' : 'text-amber-700'}`}>{giris ? '+' : '−'} {stokMiktari(hareket.miktar, hareket.birim)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-800">{stokMiktari(hareket.bakiye_sonrasi, hareket.birim)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
