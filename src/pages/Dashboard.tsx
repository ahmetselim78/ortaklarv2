import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Factory, Package, Users, TrendingUp, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface Istatistikler {
  toplamSiparis: number
  beklemedeSiparis: number
  aktifBatch: number
  tamamlananBatch: number
  toplamCari: number
  toplamStok: number
}

interface SonSiparis {
  id: string
  siparis_no: string
  musteri: string
  tarih: string
  durum: string
}

export default function Dashboard() {
  const [istatistikler, setIstatistikler] = useState<Istatistikler | null>(null)
  const [sonSiparisler, setSonSiparisler] = useState<SonSiparis[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    async function yukle() {
      const [
        { count: toplamSiparis },
        { count: beklemedeSiparis },
        { count: aktifBatch },
        { count: tamamlananBatch },
        { count: toplamCari },
        { count: toplamStok },
        { data: sonSip },
      ] = await Promise.all([
        supabase.from('siparisler').select('*', { count: 'exact', head: true }),
        supabase.from('siparisler').select('*', { count: 'exact', head: true }).in('durum', ['beklemede', 'batchte', 'yikamada']),
        supabase.from('uretim_emirleri').select('*', { count: 'exact', head: true }).in('durum', ['hazirlaniyor', 'onaylandi', 'export_edildi', 'yikamada']),
        supabase.from('uretim_emirleri').select('*', { count: 'exact', head: true }).eq('durum', 'tamamlandi'),
        supabase.from('cari').select('*', { count: 'exact', head: true }),
        supabase.from('stok').select('*', { count: 'exact', head: true }),
        supabase.from('siparisler').select('id, siparis_no, tarih, durum, cari(ad)').order('created_at', { ascending: false }).limit(5),
      ])

      setIstatistikler({
        toplamSiparis: toplamSiparis ?? 0,
        beklemedeSiparis: beklemedeSiparis ?? 0,
        aktifBatch: aktifBatch ?? 0,
        tamamlananBatch: tamamlananBatch ?? 0,
        toplamCari: toplamCari ?? 0,
        toplamStok: toplamStok ?? 0,
      })

      setSonSiparisler(
        (sonSip ?? []).map((s: any) => ({
          id: s.id,
          siparis_no: s.siparis_no,
          musteri: s.cari?.ad ?? '—',
          tarih: s.tarih,
          durum: s.durum,
        }))
      )
      setYukleniyor(false)
    }
    yukle()
  }, [])

  if (yukleniyor) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-400">Yükleniyor...</div>
  }

  const kartlar = [
    { baslik: 'Toplam Sipariş', deger: istatistikler?.toplamSiparis ?? 0, icon: ClipboardList, renk: 'text-blue-600 bg-blue-50', link: '/siparisler' },
    { baslik: 'Aktif Sipariş', deger: istatistikler?.beklemedeSiparis ?? 0, icon: Clock, renk: 'text-amber-600 bg-amber-50', link: '/siparisler' },
    { baslik: 'Aktif Batch', deger: istatistikler?.aktifBatch ?? 0, icon: Factory, renk: 'text-purple-600 bg-purple-50', link: '/uretim' },
    { baslik: 'Tamamlanan Batch', deger: istatistikler?.tamamlananBatch ?? 0, icon: TrendingUp, renk: 'text-green-600 bg-green-50', link: '/uretim' },
    { baslik: 'Cari Kayıtları', deger: istatistikler?.toplamCari ?? 0, icon: Users, renk: 'text-cyan-600 bg-cyan-50', link: '/cari' },
    { baslik: 'Stok Kayıtları', deger: istatistikler?.toplamStok ?? 0, icon: Package, renk: 'text-orange-600 bg-orange-50', link: '/stok' },
  ]

  const DURUM_ETIKET: Record<string, string> = {
    beklemede: 'Beklemede', batchte: "Batch'te", yikamada: 'Yıkamada',
    tamamlandi: 'Tamamlandı', eksik_var: 'Eksik Var', iptal: 'İptal',
  }
  const DURUM_STIL: Record<string, string> = {
    beklemede: 'bg-gray-100 text-gray-600', batchte: 'bg-blue-50 text-blue-700',
    yikamada: 'bg-cyan-50 text-cyan-700', tamamlandi: 'bg-green-50 text-green-700',
    eksik_var: 'bg-red-50 text-red-600', iptal: 'bg-red-50 text-red-600',
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">Genel üretim özeti</p>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {kartlar.map((k) => {
          const Icon = k.icon
          return (
            <Link
              key={k.baslik}
              to={k.link}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${k.renk}`}>
                <Icon size={20} />
              </div>
              <p className="text-2xl font-bold text-gray-800">{k.deger}</p>
              <p className="text-xs text-gray-500 mt-0.5">{k.baslik}</p>
            </Link>
          )
        })}
      </div>

      {/* Son siparişler */}
      {sonSiparisler.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Son Siparişler</h2>
            <Link to="/siparisler" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Tümünü Gör →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500 font-medium text-xs">
                <th className="px-4 py-2">Sipariş No</th>
                <th className="px-4 py-2">Müşteri</th>
                <th className="px-4 py-2">Tarih</th>
                <th className="px-4 py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {sonSiparisler.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-mono font-medium text-gray-800">{s.siparis_no}</td>
                  <td className="px-4 py-2.5 text-gray-700">{s.musteri}</td>
                  <td className="px-4 py-2.5 text-gray-600">{formatDate(s.tarih)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${DURUM_STIL[s.durum] ?? 'bg-gray-100 text-gray-600'}`}>
                      {DURUM_ETIKET[s.durum] ?? s.durum}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
