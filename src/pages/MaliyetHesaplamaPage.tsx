import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  History,
  ListChecks,
  Percent,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import FireOranlariPaneli from '@/components/maliyet/FireOranlariPaneli'
import MaliyetKaynakPaneli from '@/components/maliyet/MaliyetKaynakPaneli'
import MaliyetTarihceMerkezi from '@/components/maliyet/MaliyetTarihceMerkezi'
import TemperMaliyetYonetimi from '@/components/maliyet/TemperMaliyetYonetimi'
import CamStokPicker from '@/components/siparis/CamStokPicker'
import PageHeader from '@/components/ui/PageHeader'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { useTicariKaynak } from '@/hooks/useTicariKaynak'
import { useStok } from '@/hooks/useStok'
import { ticariBugun, ticariPara } from '@/lib/ticariFormat'
import { cn } from '@/lib/utils'
import {
  maliyetUrunMaliyetleriniHesapla,
  sadeMaliyetYonetiminiGetir,
} from '@/services/maliyetService'
import type {
  MaliyetHesapSonucu,
  MaliyetTarihceUrunu,
  MaliyetUrunSonucu,
} from '@/types/maliyet'
import type { Stok } from '@/types/stok'

type Sekme = 'kaynak' | 'fire' | 'temper' | 'sonuc' | 'tarihce'

const sekmeler: Array<{
  id: Sekme
  etiket: string
  aciklama: string
  icon: typeof Calculator
}> = [
  { id: 'kaynak', etiket: 'Aktif Kaynaklar', aciklama: 'Tedarikçi, vade, varyant', icon: ListChecks },
  { id: 'fire', etiket: 'Fire Oranları', aciklama: 'Ürün bazlı fire', icon: Percent },
  { id: 'temper', etiket: 'Temper', aciklama: 'Dış hizmet veya iç üretim', icon: Flame },
  { id: 'sonuc', etiket: 'Hesaplanan Maliyetler', aciklama: 'Ürün bazında sonuç', icon: Calculator },
  { id: 'tarihce', etiket: 'Maliyet Tarihçesi', aciklama: 'Kategori ve ürün bazında', icon: History },
]

function sayi(value: number, hane = 2) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: hane,
    maximumFractionDigits: hane,
  }).format(value)
}

function maliyetEksigiAciklamasi(eksik: MaliyetUrunSonucu['eksikler'][number]) {
  if (eksik.mesaj) return eksik.mesaj
  const detayMesajlari = (eksik.detaylar ?? [])
    .map((detay) => typeof detay.mesaj === 'string' ? detay.mesaj : null)
    .filter((mesaj): mesaj is string => mesaj != null)
  if (detayMesajlari.length > 0) return detayMesajlari.join(' · ')
  return eksik.kod.replaceAll('_', ' ').toLocaleLowerCase('tr-TR')
}

function temperModuEtiketi(mod: 'dis_hizmet' | 'ic_uretim' | null) {
  if (mod === 'dis_hizmet') return 'Dış hizmet'
  if (mod === 'ic_uretim') return 'İç üretim'
  return 'Çözülemedi'
}

function UrunSatiri({
  urun,
  acik,
  onToggle,
}: {
  urun: MaliyetUrunSonucu
  acik: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="px-4 py-3">
          <button type="button" onClick={onToggle} className="flex items-start gap-2 text-left">
            {acik
              ? <ChevronDown size={16} className="mt-0.5 text-gray-400" />
              : <ChevronRight size={16} className="mt-0.5 text-gray-400" />}
            <span>
              <span className="block font-medium text-gray-900">{urun.urun_adi}</span>
              <span className="mt-0.5 block text-xs text-gray-400">
                {urun.katman_yapisi} · {urun.urun_grubu || 'Cam ürünü'}
              </span>
            </span>
          </button>
        </td>
        <td className="px-4 py-3 text-right text-gray-600">{ticariPara(urun.cam_maliyeti, 'TRY')}</td>
        <td className="px-4 py-3 text-right text-gray-600">{ticariPara(urun.cita_maliyeti, 'TRY')}</td>
        <td className="px-4 py-3 text-right text-gray-600">{ticariPara(urun.sarf_maliyeti, 'TRY')}</td>
        <td className="px-4 py-3 text-right text-orange-700">
          {ticariPara(urun.islem_maliyeti, 'TRY')}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="font-semibold text-amber-700">
            +{ticariPara(urun.finansman_etkisi, 'TRY')}
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="font-bold text-gray-900">{ticariPara(urun.toplam_maliyet, 'TRY')}</div>
          <div className="text-[10px] text-gray-400">
            {ticariPara(urun.m2_maliyet, 'TRY')} / m²
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          {urun.gecerli ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
              <CheckCircle2 size={11} /> Hazır
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-700">
              <AlertTriangle size={11} /> {urun.eksikler.length} eksik
            </span>
          )}
        </td>
      </tr>
      {acik && (
        <tr className="border-b border-gray-100 bg-slate-50/80">
          <td colSpan={8} className="px-8 py-4">
            {urun.eksikler.length > 0 && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {urun.eksikler.map((eksik, index) => (
                  <div key={`${eksik.kod}-${eksik.bilesen}-${index}`}>
                    {eksik.islem_turu ? `${eksik.islem_turu} işlemi` : eksik.bilesen}:{' '}
                    {maliyetEksigiAciklamasi(eksik)}
                  </div>
                ))}
              </div>
            )}
            <div className="mb-3 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Percent size={17} className="shrink-0 text-amber-700" />
                <div>
                  <div className="text-xs font-semibold text-amber-900">Toplam fire etkisi</div>
                  <div className="text-[11px] text-amber-700">
                    Bileşenlerin fire oranlarından gelen ve toplam maliyete dahil olan tutar
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-base font-bold text-amber-900">
                +{ticariPara(urun.fire_etkisi, 'TRY')}
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full min-w-[900px] text-xs">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Bileşen</th>
                    <th className="px-3 py-2">Tedarikçi</th>
                    <th className="px-3 py-2 text-right">Tüketim</th>
                    <th className="px-3 py-2 text-right">Fire</th>
                    <th className="px-3 py-2 text-right">Fire öncesi</th>
                    <th className="px-3 py-2 text-right">Vade etkisi</th>
                    <th className="px-3 py-2 text-right">Toplam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {urun.bilesenler.map((bilesen, index) => (
                    <tr key={`${bilesen.tur}-${bilesen.ad}-${index}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800">{bilesen.ad}</div>
                        <div className="text-[10px] uppercase text-gray-400">{bilesen.tur}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{bilesen.tedarikci || '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        <div>
                          {bilesen.miktar == null ? '—' : `${sayi(bilesen.miktar, 4)} ${bilesen.birim}`}
                        </div>
                        {bilesen.firesiz_miktar != null && (
                          <div className="mt-0.5 text-[10px] text-gray-400">
                            Firesiz {sayi(bilesen.firesiz_miktar, 4)} {bilesen.birim}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="font-semibold text-amber-800">
                          {bilesen.fire_orani == null ? '—' : `%${sayi(bilesen.fire_orani)}`}
                        </div>
                        <div className="mt-0.5 text-[10px] text-amber-700">
                          +{ticariPara(bilesen.fire_etkisi, 'TRY')}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {bilesen.baz_maliyet == null ? '—' : ticariPara(bilesen.baz_maliyet, 'TRY')}
                      </td>
                      <td className="px-3 py-2 text-right text-amber-700">
                        {bilesen.finansman_etkisi == null ? '—' : ticariPara(bilesen.finansman_etkisi, 'TRY')}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {bilesen.toplam_maliyet == null ? '—' : ticariPara(bilesen.toplam_maliyet, 'TRY')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {urun.islemler.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-orange-200 bg-white">
                <div className="border-b border-orange-100 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900">
                  Üretim işlemleri
                </div>
                <table className="w-full min-w-[820px] text-xs">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-3 py-2">İşlem</th>
                      <th className="px-3 py-2">Model / kaynak</th>
                      <th className="px-3 py-2 text-right">İşlem alanı</th>
                      <th className="px-3 py-2 text-right">Birim maliyet</th>
                      <th className="px-3 py-2 text-right">Toplam</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {urun.islemler.map((islem) => {
                      const cozum = islem.temper_cozumu
                      const disFiyat = cozum?.dis_hizmet_fiyati
                      return (
                        <tr key={`${islem.sira_no}-${islem.islem_turu}`}>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-800">{islem.islem_turu}</div>
                            <div className="text-[10px] text-gray-400">
                              Cam katmanları: {islem.hedef_cam_sira_nolari.join(', ')}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            <div className="font-medium text-gray-800">
                              {temperModuEtiketi(cozum?.mod ?? null)}
                            </div>
                            {disFiyat && (
                              <div className="mt-0.5">
                                {disFiyat.tedarikci_adi}
                                {disFiyat.marka ? ` · ${disFiyat.marka}` : ''}
                              </div>
                            )}
                            {cozum?.mod === 'ic_uretim' && (
                              <div className="mt-1 space-y-0.5 text-[10px]">
                                {cozum.ic_uretim_kalemleri.map((kalem) => (
                                  <div key={`${islem.sira_no}-${kalem.bilesen_turu}`}>
                                    {kalem.aciklama}: {ticariPara(
                                      kalem.toplam_maliyet ?? 0,
                                      'TRY',
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {sayi(islem.maliyet_alan_m2, 4)} m²
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {cozum?.birim_maliyet_try == null
                              ? '—'
                              : `${ticariPara(cozum.birim_maliyet_try, 'TRY')}/m²`}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-orange-700">
                            {ticariPara(islem.toplam_maliyet, 'TRY')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function SonucPaneli({
  hesap,
  camStoklar,
}: {
  hesap: MaliyetHesapSonucu
  camStoklar: Stok[]
}) {
  const [seciliStokId, setSeciliStokId] = useState('')
  const [seciliGrup, setSeciliGrup] = useState('')
  const [acikSatirlar, setAcikSatirlar] = useState<Set<string>>(new Set())
  const urunler = useMemo(() => {
    if (!seciliStokId) return hesap.urunler
    return hesap.urunler.filter((urun) => urun.stok_id === seciliStokId)
  }, [seciliStokId, hesap.urunler])

  const filtrelenmisUrunler = useMemo(() => {
    if (seciliStokId || !seciliGrup) return urunler
    const grupStokIdleri = new Set(
      camStoklar.filter((stok) => stok.grup === seciliGrup).map((stok) => stok.id),
    )
    return urunler.filter((urun) => grupStokIdleri.has(urun.stok_id))
  }, [camStoklar, seciliGrup, seciliStokId, urunler])

  const filtreyiKapat = () => {
    setSeciliStokId('')
    setSeciliGrup('')
  }

  return (
    <div className="space-y-4">
      {!hesap.gecerli && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={20} />
            <div>
              <h2 className="font-semibold text-amber-900">
                {hesap.eksik_urun_sayisi ?? 0} ürünün maliyeti henüz tamamlanmadı
              </h2>
              <p className="mt-1 text-sm text-amber-700">
                Hazır ürünler aşağıda korunur. Eksik ürünü açarak fiyat, reçete veya temper işlemiyle ilgili gerçek nedeni görebilirsiniz.
              </p>
              {(hesap.hatalar?.length ?? 0) > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-800">
                  {hesap.hatalar?.map((hata, index) => (
                    <li key={`${hata.kod}-${index}`}>• {hata.mesaj}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-end gap-4 border-b border-gray-100 p-4">
          <div className="w-full sm:w-80">
            <div className="mb-1 text-xs font-medium text-gray-600">Cam Cinsi / Stok</div>
            <CamStokPicker
              stoklar={camStoklar}
              value={seciliStokId}
              onChange={setSeciliStokId}
              onGroupChange={(grup) => {
                setSeciliGrup(grup)
                setSeciliStokId('')
              }}
              placeholder="Cam cinsi / stok seçin..."
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900">Otomatik hesaplanan cam maliyetleri</h2>
            <p className="mt-1 text-xs text-gray-500">
              Katman yapısı çözülür; her bileşen için en düşük faiz dâhil güncel tedarikçi fiyatı kullanılır.
            </p>
          </div>
          {(seciliStokId || seciliGrup) && (
            <button
              type="button"
              onClick={filtreyiKapat}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Filtreyi kapat
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <tr>
                <th className="px-4 py-3">Ürün</th>
                <th className="px-4 py-3 text-right">Cam</th>
                <th className="px-4 py-3 text-right">Çıta</th>
                <th className="px-4 py-3 text-right">Sarf</th>
                <th className="px-4 py-3 text-right">Temper</th>
                <th className="px-4 py-3 text-right">Vade etkisi</th>
                <th className="px-4 py-3 text-right">Toplam</th>
                <th className="px-4 py-3 text-center">Durum</th>
              </tr>
            </thead>
            <tbody>
              {filtrelenmisUrunler.map((urun) => (
                <UrunSatiri
                  key={urun.stok_id}
                  urun={urun}
                  acik={acikSatirlar.has(urun.stok_id)}
                  onToggle={() => setAcikSatirlar((onceki) => {
                    const yeni = new Set(onceki)
                    if (yeni.has(urun.stok_id)) yeni.delete(urun.stok_id)
                    else yeni.add(urun.stok_id)
                    return yeni
                  })}
                />
              ))}
            </tbody>
          </table>
          {filtrelenmisUrunler.length === 0 && (
            <div className="p-10 text-center text-sm text-gray-500">
              Seçilen stok için hesaplanmış ürün bulunamadı.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

async function birMetrekareMaliyetYonetiminiGetir() {
  const tarih = ticariBugun()
  const [veri, hesap] = await Promise.all([
    sadeMaliyetYonetiminiGetir(tarih),
    maliyetUrunMaliyetleriniHesapla(tarih, 1000, 1000),
  ])
  return { ...veri, hesap }
}

export default function MaliyetHesaplamaPage() {
  const { access, hasPermission } = useAuth()
  const kaynak = useTicariKaynak(birMetrekareMaliyetYonetiminiGetir)
  const { stoklar: katalogStoklar, yenile: stokKatalogunuYenile } = useStok()
  const [sekme, setSekme] = useState<Sekme>('kaynak')
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null)
  const olusturabilir = hasPermission('costing', 'create')
  const guncelleyebilir = hasPermission('costing', 'update')
  const yonetebilir = hasPermission('costing', 'manage')
  const kritikYonetebilir = yonetebilir && access?.aal === 'aal2'
  const veri = kaynak.veri
  const tarihceUrunleri = useMemo<MaliyetTarihceUrunu[]>(() => {
    const urunHaritasi = new Map<string, MaliyetTarihceUrunu>()
    for (const stok of katalogStoklar) {
      const tarihselRecetesiVar = stok.kullanimlar.some((kullanim) => (
        kullanim.alan === 'recete' && kullanim.adet > 0
      ))
      if (
        !stok.aktif
        || stok.kategori !== 'cam'
        || (!stok.katman_yapisi?.trim() && !tarihselRecetesiVar)
      ) continue
      urunHaritasi.set(stok.id, {
        stok_id: stok.id,
        stok_kodu: stok.kod,
        urun_adi: stok.ad,
        urun_grubu: stok.grup,
      })
    }
    for (const urun of veri?.hesap.urunler ?? []) {
      urunHaritasi.set(urun.stok_id, {
        stok_id: urun.stok_id,
        stok_kodu: urun.stok_kodu,
        urun_adi: urun.urun_adi,
        urun_grubu: urun.urun_grubu,
      })
    }
    return [...urunHaritasi.values()]
  }, [katalogStoklar, veri?.hesap])

  const yenile = async () => {
    setIslemHatasi(null)
    await Promise.all([kaynak.yenile(), stokKatalogunuYenile()])
  }

  if (kaynak.yukleniyor && !veri) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <PageHeader
          baslik="Maliyet Hesaplama"
          aciklama="Tedarikçi alış fiyatlarından otomatik cam maliyeti"
          icon={Calculator}
        />
        <TableSkeleton satir={8} kolon={5} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10 sm:p-6 sm:pb-10">
      <PageHeader
        baslik="Maliyet Hesaplama"
        aciklama="Cam, çıta ve sarf fiyatlarını girin; ürün maliyetini sistem otomatik çıkarsın."
        icon={Calculator}
        aksiyon={(
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <div>
              <div className="text-xs font-medium text-gray-500">Hesabı tamamlanan ürün</div>
              <div className="text-lg font-bold leading-tight text-gray-900">
                {veri?.receteler.filter((recete) => recete.durum === 'hazir').length ?? 0}/{veri?.receteler.length ?? 0}
              </div>
            </div>
          </div>
        )}
      />

      {(kaynak.hata || islemHatasi) && (
        <div className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle size={18} className="shrink-0" />
          {kaynak.hata || islemHatasi}
        </div>
      )}
      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-1">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-5">
          {sekmeler.map((item) => {
            const Icon = item.icon
            const aktif = item.id === sekme
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSekme(item.id)}
                className={cn(
                  'flex min-w-0 items-center gap-3 rounded-lg px-4 py-3 text-left transition',
                  aktif
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                <Icon size={18} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.etiket}</span>
                  <span className={cn('hidden truncate text-[10px] sm:block', aktif ? 'text-blue-100' : 'text-gray-400')}>
                    {item.aciklama}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {veri && sekme === 'kaynak' && (
        <MaliyetKaynakPaneli
          tedarikciler={veri.tedarikciler}
          yonetebilir={kritikYonetebilir}
          onDegisti={yenile}
        />
      )}
      {veri && sekme === 'fire' && (
        <FireOranlariPaneli
          fireler={veri.fireler}
          duzenleyebilir={guncelleyebilir}
          onDegisti={yenile}
        />
      )}
      {veri && sekme === 'temper' && (
        <TemperMaliyetYonetimi
          tedarikciler={veri.tedarikciler}
          urunler={veri.receteler}
          fiyatOlusturabilir={olusturabilir}
          yonetebilir={kritikYonetebilir}
          onDegisti={yenile}
        />
      )}
      {veri && sekme === 'sonuc' && (
        <SonucPaneli
          hesap={veri.hesap}
          camStoklar={katalogStoklar.filter((stok) => stok.kategori === 'cam' && stok.aktif)}
        />
      )}
      {veri && sekme === 'tarihce' && (
        <MaliyetTarihceMerkezi urunler={tarihceUrunleri} />
      )}
    </div>
  )
}
