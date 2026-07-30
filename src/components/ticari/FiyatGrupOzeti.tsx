import { AlertTriangle, CheckCircle2, Split } from 'lucide-react'
import { fiyatUrunGruplariniGetir } from '@/lib/fiyatGruplari'
import { ticariPara } from '@/lib/ticariFormat'
import type { FiyatHesapSonucu } from '@/types/ticari'

export default function FiyatGrupOzeti({ sonuc }: { sonuc: FiyatHesapSonucu }) {
  const gruplar = fiyatUrunGruplariniGetir(sonuc)
  const indirimVeNakliye = Number(sonuc.satir_iskonto_tutari ?? 0)
    + Number(sonuc.belge_iskonto_tutari ?? 0)
    + Number(sonuc.nakliye_override_farki ?? 0)

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Cam türü</th>
                <th className="px-3 py-2 text-right">Adet</th>
                <th className="px-3 py-2 text-right">Gerçek m²</th>
                <th className="px-3 py-2 text-right">Faturalanabilir m²</th>
                <th className="px-3 py-2">Bağlantı</th>
                <th className="px-3 py-2 text-right">m² fiyatı</th>
                <th className="px-3 py-2 text-right">Grup toplamı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {gruplar.map((grup) => (
                <tr key={grup.stok_id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{grup.stok_adi}</div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      {grup.fiyat_durumu === 'eksik' ? (
                        <><AlertTriangle size={12} className="text-amber-600" /> Fiyat eksik</>
                      ) : grup.fiyat_durumu === 'birden_fazla_baglanti' ? (
                        <><Split size={12} className="text-blue-600" /> Birden fazla bağlantıya dağıldı</>
                      ) : (
                        <><CheckCircle2 size={12} className="text-emerald-600" /> Fiyat bulundu</>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{grup.adet}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(grup.gercek_m2).toFixed(3)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(grup.faturalanabilir_m2).toFixed(3)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{grup.baglanti_no || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {grup.birim_fiyat == null ? '—' : ticariPara(grup.birim_fiyat, sonuc.para_birimi)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {ticariPara(grup.grup_toplami, sonuc.para_birimi)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Ozet baslik="KDV hariç" deger={ticariPara(sonuc.kdv_haric_tutar, sonuc.para_birimi)} />
        <Ozet baslik="KDV" deger={ticariPara(sonuc.kdv_tutari, sonuc.para_birimi)} />
        <Ozet baslik="İndirim / nakliye" deger={ticariPara(indirimVeNakliye, sonuc.para_birimi)} />
        <Ozet baslik="Genel liste toplamı" deger={ticariPara(sonuc.genel_toplam, sonuc.para_birimi)} vurgu />
      </div>
    </div>
  )
}

function Ozet({ baslik, deger, vurgu = false }: { baslik: string; deger: string; vurgu?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${vurgu ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="text-xs text-gray-500">{baslik}</div>
      <div className={`mt-1 font-semibold ${vurgu ? 'text-blue-800' : 'text-gray-900'}`}>{deger}</div>
    </div>
  )
}
