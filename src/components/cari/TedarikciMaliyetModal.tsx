import { AlertTriangle, Loader2, Power, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useEscape } from '@/hooks/useEscape'
import { ticariPara } from '@/lib/ticariFormat'
import TedarikciFiyatYonetimi from '@/components/cari/TedarikciFiyatYonetimi'
import TedarikciSiparisTakibi from '@/components/cari/TedarikciSiparisTakibi'
import {
  camBaglantisiAktiflestir,
  camBaglantisiKapat,
  sadeMaliyetYonetiminiGetir,
  tedarikciMaliyetDetayiniGetir,
  tedarikciPasiflestir,
} from '@/services/maliyetService'
import { yeniIdempotencyAnahtari } from '@/services/ticariService'
import type { Cari } from '@/types/cari'
import type {
  CamTedarikBaglantisi,
  SadeMaliyetYonetimi,
  TedarikciMaliyetDetayi,
} from '@/types/maliyet'

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

export default function TedarikciMaliyetModal({
  tedarikci,
  onDegisti,
  onKapat,
}: {
  tedarikci: Cari
  onDegisti: () => Promise<void> | void
  onKapat: () => void
}) {
  useEscape(onKapat)
  const { access, hasPermission } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [detay, setDetay] = useState<TedarikciMaliyetDetayi | null>(null)
  const [katalog, setKatalog] = useState<SadeMaliyetYonetimi | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [islem, setIslem] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [gerekce, setGerekce] = useState('Yetkili kullanıcı tarafından işlem yapıldı.')
  const istekAnahtari = useRef<string | null>(null)
  const yonetebilir = hasPermission('costing', 'manage')
  const olusturabilir = hasPermission('costing', 'create')
  const guncelleyebilir = hasPermission('costing', 'update')

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      const [detaySonucu, katalogSonucu] = await Promise.all([
        tedarikciMaliyetDetayiniGetir(tedarikci.id),
        sadeMaliyetYonetiminiGetir(),
      ])
      setDetay(detaySonucu)
      setKatalog(katalogSonucu)
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Tedarikçi maliyet detayı yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }, [tedarikci.id])

  useEffect(() => {
    void yukle()
  }, [yukle])

  const kritikYetki = () => {
    if (!yonetebilir) {
      setHata('Bu işlem için maliyet yönetme yetkisi gerekir.')
      return false
    }
    if (access?.aal !== 'aal2') {
      navigate('/mfa', { state: { from: `${location.pathname}${location.search}` } })
      return false
    }
    if (gerekce.trim().length < 5) {
      setHata('Kritik işlem için en az 5 karakterlik gerekçe yazın.')
      return false
    }
    return true
  }

  const baglantiyiAktiflestir = async (baglanti: CamTedarikBaglantisi) => {
    if (!kritikYetki()) return
    setIslem(baglanti.id)
    try {
      await camBaglantisiAktiflestir(
        baglanti.id,
        baglanti.revision_no,
        gerekce,
        yeniIdempotencyAnahtari(),
      )
      await yukle()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Bağlantı aktifleştirilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const baglantiyiKapat = async (baglanti: CamTedarikBaglantisi) => {
    if (!kritikYetki()) return
    setIslem(baglanti.id)
    try {
      await camBaglantisiKapat(
        baglanti.id,
        new Date().toISOString(),
        gerekce,
        yeniIdempotencyAnahtari(),
      )
      await yukle()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Bağlantı kapatılamadı.')
    } finally {
      setIslem(null)
    }
  }

  const pasiflestir = async () => {
    if (!kritikYetki()) return
    setIslem('pasiflestir')
    if (!istekAnahtari.current) istekAnahtari.current = yeniIdempotencyAnahtari()
    try {
      await tedarikciPasiflestir(tedarikci.id, gerekce, istekAnahtari.current)
      await onDegisti()
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Tedarikçi pasifleştirilemedi.')
    } finally {
      setIslem(null)
    }
  }

  const aktifBaglantilar = detay?.baglantilar.filter((baglanti) => baglanti.durum === 'aktif') ?? []
  const kapaliBaglantilar = detay?.baglantilar.filter((baglanti) => (
    baglanti.durum === 'kapali' || baglanti.durum === 'iptal'
  )) ?? []
  const taslakBaglantilar = detay?.baglantilar.filter((baglanti) => baglanti.durum === 'taslak') ?? []
  const citaFiyatlari = detay?.fiyatlar.filter((fiyat) => fiyat.profil_turu === 'cita') ?? []
  const sarfFiyatlari = detay?.fiyatlar.filter((fiyat) => fiyat.profil_turu === 'sarf') ?? []
  const gelecekFiyatlar = detay?.fiyatlar.filter((fiyat) => (
    fiyat.aktif_donem_baslangici
    && new Date(fiyat.aktif_donem_baslangici).getTime() > Date.now()
  )) ?? []
  const bagliStoklar = new Map(
    detay?.fiyatlar.map((fiyat) => [
      fiyat.stok_id,
      { kod: fiyat.stok_kodu, ad: fiyat.stok_adi },
    ]) ?? [],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{tedarikci.ad}</h2>
            <p className="mt-1 text-xs text-gray-500">
              {tedarikci.tedarikci_calisma_modeli === 'sisecam_portal'
                ? 'Şişecam PDF fiyatları, aktif maliyet kaynağı ve sipariş/fatura takibi'
                : 'Ürün, marka ve vadeye göre stok bazlı tedarikçi fiyatları'}
            </p>
          </div>
          <button type="button" onClick={onKapat} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {hata && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle size={17} className="shrink-0" />
              {hata}
            </div>
          )}
          {yukleniyor ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-500">
              <Loader2 size={18} className="animate-spin" /> Yükleniyor…
            </div>
          ) : detay && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Mini baslik="Eski aktif bağlantı" deger={detay.engeller.aktif_cam_baglantisi_sayisi} />
                <Mini baslik="Aktif stok fiyatı" deger={detay.engeller.aktif_stok_fiyati_sayisi} />
                <Mini baslik="Gelecek dönem" deger={detay.engeller.gelecek_fiyat_donemi_sayisi} />
                <Mini baslik="Bağlı stok" deger={detay.engeller.bagli_stok_sayisi} />
                <Mini baslik="Toplam fiyat kaydı" deger={detay.fiyatlar.length} />
              </div>

              {tedarikci.tedarikci_calisma_modeli === 'sisecam_portal' && (
                <TedarikciSiparisTakibi
                  tedarikciId={tedarikci.id}
                  olusturabilir={olusturabilir}
                  guncelleyebilir={guncelleyebilir}
                />
              )}

              {katalog && (
                <TedarikciFiyatYonetimi
                  tedarikci={tedarikci}
                  katalog={katalog}
                  olusturabilir={olusturabilir}
                  aktiflestirebilir={yonetebilir && access?.aal === 'aal2'}
                  onDegisti={yukle}
                />
              )}

              {detay.baglantilar.length > 0 && (
                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900">Eski cam maliyet bağlantıları</h3>
                  <p className="mt-1 text-xs text-gray-500">Mevcut kayıtlar korunur; yeni siparişler yukarıdaki portal akışından açılır.</p>
                  <BaglantiListesi baslik="Taslaklar" baglantilar={taslakBaglantilar} islem={islem} onAktiflestir={yonetebilir ? baglantiyiAktiflestir : undefined} />
                  <BaglantiListesi baslik="Aktif bağlantılar" baglantilar={aktifBaglantilar} islem={islem} onKapat={yonetebilir ? baglantiyiKapat : undefined} />
                  <BaglantiListesi baslik="Kapalı / iptal bağlantılar" baglantilar={kapaliBaglantilar} islem={islem} />
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <FiyatListesi baslik="Çıta sabit fiyatları" fiyatlar={citaFiyatlari} />
                <FiyatListesi baslik="Sarf sabit fiyatları" fiyatlar={sarfFiyatlari} />
                <FiyatListesi baslik="Gelecek tarihli fiyatlar" fiyatlar={gelecekFiyatlar} />
                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900">Bağlı stoklar</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...bagliStoklar.entries()].map(([id, stok]) => (
                      <span key={id} className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-700">{stok.kod} · {stok.ad}</span>
                    ))}
                    {bagliStoklar.size === 0 && <span className="text-xs text-gray-500">Bağlı stok yok.</span>}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <label className="block text-xs font-medium text-amber-900">
                  Kritik işlem gerekçesi
                  <input value={gerekce} onChange={(e) => setGerekce(e.target.value)} className={inputClass} />
                </label>
                {tedarikci.aktif && yonetebilir && (
                  <button type="button" onClick={() => void pasiflestir()} disabled={islem === 'pasiflestir'} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                    <Power size={14} /> Tedarikçiyi pasifleştir
                  </button>
                )}
                <p className="mt-2 text-xs text-amber-800">
                  Aktif bağlantı, aktif/açık fiyat veya gelecek dönem varsa PostgreSQL işlemi ayrıntılı engel sayılarıyla reddeder.
                </p>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button type="button" onClick={() => void yukle()} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700">
            <RefreshCw size={14} /> Yenile
          </button>
        </div>
      </div>
    </div>
  )
}

function Mini({ baslik, deger }: { baslik: string; deger: number }) {
  return <div className="rounded-xl border border-gray-200 bg-gray-50 p-3"><div className="text-[11px] text-gray-500">{baslik}</div><div className="mt-1 text-xl font-semibold text-gray-900">{deger}</div></div>
}

function BaglantiListesi({
  baslik,
  baglantilar,
  islem,
  onAktiflestir,
  onKapat,
}: {
  baslik: string
  baglantilar: CamTedarikBaglantisi[]
  islem: string | null
  onAktiflestir?: (baglanti: CamTedarikBaglantisi) => Promise<void>
  onKapat?: (baglanti: CamTedarikBaglantisi) => Promise<void>
}) {
  if (baglantilar.length === 0) return null
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{baslik}</h4>
      <div className="mt-2 space-y-2">
        {baglantilar.map((baglanti) => (
          <div key={baglanti.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 text-xs">
            <div>
              <div className="font-semibold text-gray-900">{baglanti.baglanti_no}</div>
              <div className="mt-1 text-gray-500">
                {ticariPara(Number(baglanti.toplam_tutar), baglanti.para_birimi)} · {baglanti.baslangic_tarihi} · {baglanti.kalemler.length} grup
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">{baglanti.durum}</span>
              {onAktiflestir && <button type="button" onClick={() => void onAktiflestir(baglanti)} disabled={islem === baglanti.id} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">Aktifleştir</button>}
              {onKapat && <button type="button" onClick={() => void onKapat(baglanti)} disabled={islem === baglanti.id} className="rounded-lg bg-amber-700 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">Kapat</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FiyatListesi({
  baslik,
  fiyatlar,
}: {
  baslik: string
  fiyatlar: TedarikciMaliyetDetayi['fiyatlar']
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900">{baslik}</h3>
      <div className="mt-3 max-h-64 divide-y divide-gray-100 overflow-y-auto">
        {fiyatlar.map((fiyat) => (
          <div key={fiyat.fiyat_id} className="flex items-start justify-between gap-3 py-2 text-xs">
            <div>
              <div className="font-medium text-gray-800">{fiyat.stok_kodu} · {fiyat.stok_adi}</div>
              <div className="mt-0.5 text-gray-500">{fiyat.kaynak_turu} · {fiyat.durum}</div>
            </div>
            <div className="text-right font-semibold text-gray-900">
              {ticariPara(fiyat.birim_fiyat, fiyat.para_birimi)} / {fiyat.fiyat_birimi}
            </div>
          </div>
        ))}
        {fiyatlar.length === 0 && <div className="py-5 text-center text-xs text-gray-500">Kayıt yok.</div>}
      </div>
    </div>
  )
}
