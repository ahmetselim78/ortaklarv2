import { useState } from 'react'
import { ArrowLeftRight, LockKeyhole, MapPin, Save, TriangleAlert, X } from 'lucide-react'
import { useEscape } from '@/hooks/useEscape'
import { STOK_HAREKET_ETIKETLERI, stokMiktari } from '@/lib/stokHareket'
import type { StokHareketi, StokKatalogKaydi, StokKullanimAlani } from '@/types/stok'

const KULLANIM_ETIKETLERI: Record<StokKullanimAlani, string> = {
  siparis: 'Sipariş',
  cita_referansi: 'Sipariş çıta referansı',
  siparis_fiyat_snapshoti: 'Sipariş fiyat kaydı',
  teklif: 'Teklif',
  satis_fiyati: 'Satış fiyatı',
  recete: 'Ürün reçetesi',
  recete_bileseni: 'Reçete bileşeni',
  maliyet_tarifesi: 'Maliyet tarifesi',
  maliyet_profili: 'Maliyet profili',
  maliyet_kaynagi: 'Maliyet kaynak ataması',
  tedarik_baglantisi: 'Tedarik bağlantısı',
  alis_fiyati: 'Alış fiyatı',
  stok_hareketi: 'Stok hareketi',
  legacy_eslestirme: 'Eski veri eşleştirmesi',
}

function Bilgi({ etiket, deger }: { etiket: string; deger: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{etiket}</div>
      <div className="mt-1 break-words text-sm font-medium text-gray-800">{deger || '—'}</div>
    </div>
  )
}

export default function StokDetayPaneli({
  stok,
  hareketler,
  yonetimModu,
  duzenleyebilir,
  onHareket,
  onOperasyonKaydet,
  onKapat,
}: {
  stok: StokKatalogKaydi
  hareketler: StokHareketi[]
  yonetimModu: boolean
  duzenleyebilir: boolean
  onHareket: () => void
  onOperasyonKaydet: (minimumMiktar: number, stokYeri: string) => Promise<void>
  onKapat: () => void
}) {
  useEscape(onKapat)
  const [ayarAcik, setAyarAcik] = useState(false)
  const [minimumMiktar, setMinimumMiktar] = useState(String(stok.minimum_miktar ?? 0))
  const [stokYeri, setStokYeri] = useState(stok.stok_yeri ?? '')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [ayarHatasi, setAyarHatasi] = useState<string | null>(null)
  const olusturulma = new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(stok.created_at))
  const gosterilenKullanimlar = yonetimModu
    ? stok.kullanimlar
    : stok.kullanimlar.filter((kullanim) => kullanim.alan !== 'stok_hareketi')
  const toplamKullanim = gosterilenKullanimlar.reduce((toplam, kullanim) => toplam + kullanim.adet, 0)
  const sonHareketler = hareketler.filter((hareket) => hareket.stok_id === stok.id).slice(0, 8)

  const operasyonuKaydet = async () => {
    const minimum = Number(minimumMiktar)
    if (!Number.isFinite(minimum) || minimum < 0) {
      setAyarHatasi('Kritik stok seviyesi negatif olamaz.')
      return
    }
    setKaydediliyor(true)
    setAyarHatasi(null)
    try {
      await onOperasyonKaydet(minimum, stokYeri)
      setAyarAcik(false)
    } catch (error) {
      setAyarHatasi(error instanceof Error ? error.message : 'Stok ayarları kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onKapat}>
      <aside
        className="ml-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        aria-label="Stok kartı ayrıntıları"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div className="min-w-0">
            <div className="font-mono text-xs font-semibold text-blue-700">{stok.kod}</div>
            <h2 className="mt-1 break-words text-xl font-bold text-gray-900">{stok.ad}</h2>
          </div>
          <div className="ml-3 flex items-center gap-1">
            {yonetimModu && stok.aktif && duzenleyebilir && <button type="button" onClick={onHareket} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" title="Stok hareketi kaydet"><ArrowLeftRight size={18} /></button>}
            <button type="button" onClick={onKapat} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={19} /></button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {yonetimModu && stok.kullaniliyor && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-semibold">
                <LockKeyhole size={16} /> Kullanımda
              </div>
              <p className="mt-1.5 leading-5 text-amber-800">
                Bu kart dış kayıtlara bağlandığı için kodu, adı, kategorisi ve teknik alanları
                değiştirilemez; kart silinemez. Aktiflik durumu değiştirilebilir.
              </p>
            </div>
          )}

          <section className={`rounded-xl border p-4 ${stok.kritik_stok ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${stok.kritik_stok ? 'text-red-600' : 'text-emerald-700'}`}>
                  {stok.kritik_stok && <TriangleAlert size={14} />}
                  Güncel stok bakiyesi
                </div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{stokMiktari(Number(stok.mevcut_miktar ?? 0), stok.birim)}</div>
                <div className="mt-1 text-xs text-gray-600">Kritik seviye: {stok.minimum_miktar > 0 ? stokMiktari(stok.minimum_miktar, stok.birim) : 'Tanımlanmadı'}</div>
              </div>
              {yonetimModu && duzenleyebilir && <button type="button" onClick={() => setAyarAcik((acik) => !acik)} className="rounded-lg border border-white/80 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50">{ayarAcik ? 'Kapat' : 'Stok ayarları'}</button>}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-600"><MapPin size={13} /> {stok.stok_yeri || 'Stok yeri tanımlanmadı'}</div>
            {yonetimModu && ayarAcik && (
              <div className="mt-4 space-y-3 border-t border-black/5 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-700">Kritik seviye<input value={minimumMiktar} onChange={(event) => setMinimumMiktar(event.target.value)} type="number" min="0" step="0.001" className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /></label>
                  <label className="text-xs font-medium text-gray-700">Stok yeri<input value={stokYeri} onChange={(event) => setStokYeri(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /></label>
                </div>
                {ayarHatasi && <div className="text-xs text-red-700">{ayarHatasi}</div>}
                <button type="button" disabled={kaydediliyor} onClick={() => void operasyonuKaydet()} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save size={13} />{kaydediliyor ? 'Kaydediliyor…' : 'Ayarları kaydet'}</button>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Teknik bilgiler</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <Bilgi etiket="Kategori" deger={stok.kategori === 'cam' ? 'Cam' : stok.kategori === 'cita' ? 'Çıta' : 'Yan Malzeme'} />
              <Bilgi etiket="Durum" deger={stok.aktif ? 'Aktif' : 'Pasif'} />
              <Bilgi etiket="Grup" deger={stok.grup} />
              <Bilgi etiket="Katman yapısı" deger={stok.katman_yapisi} />
              <Bilgi etiket="Kalınlık / ölçü" deger={stok.kalinlik_mm != null ? `${stok.kalinlik_mm} mm` : null} />
              <Bilgi etiket="Birim" deger={stok.birim} />
              <Bilgi etiket="Marka" deger={stok.marka} />
              <Bilgi etiket="Oluşturulma" deger={olusturulma} />
            </div>
          </section>

          {yonetimModu && <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Son hareketler</h3>
              <span className="text-xs text-gray-500">{sonHareketler.length} gösteriliyor</span>
            </div>
            {sonHareketler.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">Bu kart için hareket bulunmuyor.</div>
            ) : (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                {sonHareketler.map((hareket) => (
                  <div key={hareket.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0"><div className="font-medium text-gray-800">{STOK_HAREKET_ETIKETLERI[hareket.hareket_turu]}</div><div className="mt-0.5 truncate text-xs text-gray-500">{hareket.aciklama}</div><div className="mt-0.5 text-[11px] text-gray-400">{new Date(hareket.islem_tarihi).toLocaleString('tr-TR')}</div></div>
                    <div className={`shrink-0 text-right font-semibold ${hareket.net_miktar > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{hareket.net_miktar > 0 ? '+' : '−'} {stokMiktari(hareket.miktar, hareket.birim)}<div className="mt-0.5 text-[11px] font-normal text-gray-400">Bakiye {stokMiktari(hareket.bakiye_sonrasi, hareket.birim)}</div></div>
                  </div>
                ))}
              </div>
            )}
          </section>}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Kullanım özeti</h3>
              <span className="text-xs text-gray-500">{toplamKullanim} bağlantı</span>
            </div>
            {gosterilenKullanimlar.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">
                Kart henüz sipariş, teklif, fiyat, reçete veya maliyet kaydında kullanılmamış.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                {gosterilenKullanimlar.map((kullanim) => (
                  <div key={kullanim.alan} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-gray-700">{KULLANIM_ETIKETLERI[kullanim.alan]}</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                      {kullanim.adet}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}
