import { ArrowRight, History, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useEscape } from '@/hooks/useEscape'
import {
  ticariKalemFarklariniHesapla,
  ticariSurumAlanFarklariniHesapla,
  type TicariKarsilastirmaTuru,
} from '@/lib/ticariSurumKarsilastirma'
import { ticariTarih } from '@/lib/ticariFormat'
import {
  ticariTaslakKalemleriniGetir,
  type TicariTaslakTuru,
} from '@/services/ticariService'
import type { SurumDurumu } from '@/types/ticari'
import { SurumRozeti } from './TicariOrtak'

interface SurumKaydi {
  id: string
  surum_no: number
  durum: SurumDurumu
  gecerli_baslangic?: string | null
  gecerli_bitis?: string | null
  yayinlanma_tarihi?: string | null
  revision_no: number
  created_at?: string | null
}

interface Props {
  tur: TicariKarsilastirmaTuru
  baslik: string
  surumler: SurumKaydi[]
  onKapat: () => void
}

const alanEtiketleri: Record<string, string> = {
  gecerli_baslangic: 'Geçerlilik başlangıcı',
  gecerli_bitis: 'Geçerlilik bitişi',
  durum: 'Durum',
  surum_no: 'Sürüm no',
  varsayilan_para_birimi: 'Varsayılan para birimi',
  ana_fiyat_listesi_id: 'Ana fiyat listesi',
  musteri_fiyat_listesi_id: 'Müşteri fiyat katmanı',
  varsayilan_kdv_grubu_id: 'Varsayılan KDV grubu',
  varsayilan_vade_gunu: 'Varsayılan vade günü',
  vade_profili_id: 'Vade profili',
  vade_profili_surumu_id: 'Vade profili sürümü',
  nakliye_hesaplama_tipi: 'Nakliye hesaplama tipi',
  sabit_nakliye_satis_tutari: 'Sabit nakliye satış tutarı',
  sabit_nakliye_maliyet_tutari: 'Sabit nakliye maliyeti',
  m2_nakliye_satis_tutari: 'm² nakliye satış tutarı',
  m2_nakliye_maliyet_tutari: 'm² nakliye maliyeti',
  minimum_marj_yuzdesi_override: 'Minimum marj override',
  varsayilan_belge_notu: 'Varsayılan belge notu',
  teklif_gecerlilik_gunu: 'Teklif geçerlilik günü',
  kdv_orani: 'KDV oranı',
}

const koleksiyonEtiketleri: Record<string, string> = {
  urun: 'Ürün fiyatları',
  kenar: 'Kenar işlemleri',
  menfez: 'Menfezler',
  kucuk_cam: 'Küçük cam kuralları',
  nakliye: 'Nakliye',
  diger: 'Diğer satış kalemleri',
  stok: 'Stok maliyetleri',
  islem: 'İşlem maliyetleri',
  genel_gider: 'Genel giderler',
  kalemler: 'Reçete kalemleri',
  kademeler: 'Vade kademeleri',
}

function degerMetni(value: unknown) {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function kalemliTur(tur: TicariKarsilastirmaTuru): tur is TicariTaslakTuru {
  return tur === 'fiyat' || tur === 'maliyet' || tur === 'recete' || tur === 'vade'
}

export default function TicariSurumKarsilastirmaModal({
  tur,
  baslik,
  surumler,
  onKapat,
}: Props) {
  const sirali = useMemo(
    () => [...surumler].sort((a, b) => b.surum_no - a.surum_no),
    [surumler],
  )
  const [eskiId, setEskiId] = useState(() => sirali[1]?.id ?? sirali[0]?.id ?? '')
  const [yeniId, setYeniId] = useState(() => sirali[0]?.id ?? '')
  const kalemIstekAnahtari = `${tur}:${eskiId}:${yeniId}`
  const [kalemIstekSonucu, setKalemIstekSonucu] = useState<{
    anahtar: string
    kalemler: {
      eski: Record<string, Array<Record<string, unknown>>>
      yeni: Record<string, Array<Record<string, unknown>>>
    } | null
    hata: string | null
  }>({ anahtar: '', kalemler: null, hata: null })
  useEscape(onKapat)

  const eskiSurum = sirali.find((surum) => surum.id === eskiId) ?? null
  const yeniSurum = sirali.find((surum) => surum.id === yeniId) ?? null

  useEffect(() => {
    if (!kalemliTur(tur) || !eskiId || !yeniId) return
    let aktif = true
    Promise.all([
      ticariTaslakKalemleriniGetir(tur, eskiId),
      ticariTaslakKalemleriniGetir(tur, yeniId),
    ])
      .then(([eski, yeni]) => {
        if (aktif) {
          setKalemIstekSonucu({
            anahtar: kalemIstekAnahtari,
            kalemler: { eski, yeni },
            hata: null,
          })
        }
      })
      .catch((error) => {
        if (aktif) {
          setKalemIstekSonucu({
            anahtar: kalemIstekAnahtari,
            kalemler: null,
            hata: error instanceof Error ? error.message : 'Sürüm kalemleri yüklenemedi.',
          })
        }
      })
    return () => { aktif = false }
  }, [eskiId, kalemIstekAnahtari, yeniId, tur])

  const kalemIstekGerekli = kalemliTur(tur) && Boolean(eskiId) && Boolean(yeniId)
  const yukleniyor = kalemIstekGerekli && kalemIstekSonucu.anahtar !== kalemIstekAnahtari
  const kalemler = kalemIstekSonucu.anahtar === kalemIstekAnahtari
    ? kalemIstekSonucu.kalemler
    : null
  const hata = kalemIstekSonucu.anahtar === kalemIstekAnahtari
    ? kalemIstekSonucu.hata
    : null

  const alanFarklari = useMemo(() => (
    eskiSurum && yeniSurum
      ? ticariSurumAlanFarklariniHesapla(
        eskiSurum as unknown as Record<string, unknown>,
        yeniSurum as unknown as Record<string, unknown>,
      )
      : []
  ), [eskiSurum, yeniSurum])

  const kalemFarklari = useMemo(() => (
    kalemliTur(tur) && kalemler
      ? ticariKalemFarklariniHesapla(tur, kalemler.eski, kalemler.yeni)
      : []
  ), [kalemler, tur])

  const toplamKalemFarki = kalemFarklari.reduce(
    (toplam, fark) => toplam + fark.degisiklikler.length,
    0,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <History size={19} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">{baslik} · sürüm geçmişi</h2>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Yayınlanmış sürümler değişmez; seçilen iki sürümün üst verisi ve ticari kalemleri karşılaştırılır.
            </p>
          </div>
          <button type="button" onClick={onKapat} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {hata && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {hata}
            </div>
          )}

          <div className="grid items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-[1fr_auto_1fr]">
            <label className="text-xs font-semibold text-gray-700">
              Eski sürüm
              <select
                value={eskiId}
                onChange={(event) => setEskiId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                {sirali.map((surum) => (
                  <option key={surum.id} value={surum.id}>
                    S{surum.surum_no} · {surum.durum} · {ticariTarih(surum.gecerli_baslangic)}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight size={18} className="mb-2 hidden text-gray-400 sm:block" />
            <label className="text-xs font-semibold text-gray-700">
              Yeni sürüm
              <select
                value={yeniId}
                onChange={(event) => setYeniId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                {sirali.map((surum) => (
                  <option key={surum.id} value={surum.id}>
                    S{surum.surum_no} · {surum.durum} · {ticariTarih(surum.gecerli_baslangic)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[eskiSurum, yeniSurum].map((surum, index) => (
              <div key={surum?.id ?? index} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900">{surum ? `S${surum.surum_no}` : '—'}</p>
                  {surum && <SurumRozeti durum={surum.durum} />}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {surum?.gecerli_baslangic ? ticariTarih(surum.gecerli_baslangic) : '—'}
                  {' – '}
                  {surum?.gecerli_bitis ? ticariTarih(surum.gecerli_bitis) : 'Süresiz'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Yayın: {surum?.yayinlanma_tarihi ? ticariTarih(surum.yayinlanma_tarihi, true) : 'Henüz yayınlanmadı'}
                </p>
              </div>
            ))}
          </div>

          <section className="overflow-hidden rounded-xl border border-gray-200">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Sürüm alanları</h3>
              <p className="mt-0.5 text-xs text-gray-500">{alanFarklari.length} değişen alan</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="bg-white text-left font-semibold text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Alan</th>
                    <th className="px-4 py-2">Eski</th>
                    <th className="px-4 py-2">Yeni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {alanFarklari.map((fark) => (
                    <tr key={fark.alan}>
                      <td className="px-4 py-2 font-medium text-gray-800">{alanEtiketleri[fark.alan] ?? fark.alan}</td>
                      <td className="max-w-80 break-words px-4 py-2 text-red-700">{degerMetni(fark.eski)}</td>
                      <td className="max-w-80 break-words px-4 py-2 text-emerald-700">{degerMetni(fark.yeni)}</td>
                    </tr>
                  ))}
                  {alanFarklari.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Sürüm üst verilerinde fark yok.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {kalemliTur(tur) && (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Ticari kalem farkları</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {yukleniyor ? 'Kalemler yükleniyor…' : `${toplamKalemFarki} eklenen, kaldırılan veya değişen kalem`}
                </p>
              </div>
              {yukleniyor ? (
                <div className="flex min-h-32 items-center justify-center gap-2 rounded-xl border border-gray-200 text-sm text-gray-500">
                  <Loader2 size={17} className="animate-spin" /> Sürüm kalemleri karşılaştırılıyor…
                </div>
              ) : (
                kalemFarklari.map((fark) => (
                  <div key={fark.koleksiyon} className="overflow-hidden rounded-xl border border-gray-200">
                    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="mr-auto text-sm font-semibold text-gray-900">
                        {koleksiyonEtiketleri[fark.koleksiyon] ?? fark.koleksiyon}
                      </p>
                      <span className="rounded-full bg-gray-200 px-2 py-1 text-[11px] text-gray-700">
                        {fark.eskiSayisi} → {fark.yeniSayisi}
                      </span>
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] text-blue-700">
                        {fark.degisiklikler.length} fark
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {fark.degisiklikler.slice(0, 50).map((degisiklik) => (
                        <div key={`${degisiklik.tur}:${degisiklik.anahtar}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[160px_1fr]">
                          <span className={
                            degisiklik.tur === 'eklendi'
                              ? 'text-xs font-semibold text-emerald-700'
                              : degisiklik.tur === 'kaldirildi'
                                ? 'text-xs font-semibold text-red-700'
                                : 'text-xs font-semibold text-amber-700'
                          }>
                            {degisiklik.tur === 'eklendi' ? 'Eklendi' : degisiklik.tur === 'kaldirildi' ? 'Kaldırıldı' : 'Değişti'}
                          </span>
                          <div className="min-w-0">
                            <p className="break-all text-xs font-medium text-gray-800">{degisiklik.anahtar}</p>
                            <p className="mt-1 text-[11px] text-gray-500">
                              Alanlar: {degisiklik.degisenAlanlar.join(', ') || '—'}
                            </p>
                          </div>
                        </div>
                      ))}
                      {fark.degisiklikler.length === 0 && (
                        <div className="px-4 py-5 text-center text-xs text-gray-400">
                          {fark.degismeyenSayisi} kalemin tamamı aynı.
                        </div>
                      )}
                      {fark.degisiklikler.length > 50 && (
                        <div className="px-4 py-3 text-center text-xs text-gray-500">
                          İlk 50 fark gösteriliyor; toplam {fark.degisiklikler.length}.
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onKapat} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
