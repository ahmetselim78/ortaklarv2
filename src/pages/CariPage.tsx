import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Landmark,
  Plus,
  Users,
  WalletCards,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import CariCalismaAlani from '@/components/cari/CariCalismaAlani'
import CariForm from '@/components/cari/CariForm'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { useCari } from '@/hooks/useCari'
import { tedarikKapsamlariniTemizle } from '@/lib/tedarikKapsami'
import { ticariBugun, ticariPara } from '@/lib/ticariFormat'
import {
  cariPanelOzetleriniGetir,
  cariPanelProfilleriniGetir,
} from '@/services/ticariService'
import type { Cari, TedarikKapsami, TedarikciCalismaModeli } from '@/types/cari'
import type {
  CariOzet,
  MusteriTicariProfili,
  MusteriTicariProfilSurumu,
} from '@/types/ticari'

type CariFormVeri = {
  ad: string
  tipi: Cari['tipi']
  telefon?: string
  email?: string
  adres?: string
  notlar?: string
  aktif: boolean
  tedarik_kapsamlari: TedarikKapsami[]
  tedarikci_calisma_modeli: TedarikciCalismaModeli
}

function BorcOzetKarti({
  toplam,
}: {
  toplam: number
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-slate-500">Toplam müşteri borcu</p>
          <p className="mt-0.5 truncate text-xl font-semibold tabular-nums text-slate-900">
            {ticariPara(toplam, 'TRY')}
          </p>
          <p className="truncate text-[11px] text-slate-400">TL bakiyeleri</p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100">
          <CircleDollarSign size={17} />
        </span>
      </div>
    </div>
  )
}

function SayiKarti({
  baslik,
  deger,
  alt,
  icon,
  ton = 'blue',
}: {
  baslik: string
  deger: string | number
  alt: string
  icon: React.ReactNode
  ton?: 'blue' | 'emerald' | 'amber'
}) {
  const tonlar = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  }
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-slate-500">{baslik}</p>
          <p className="mt-0.5 truncate text-xl font-semibold tabular-nums text-slate-900">{deger}</p>
          <p className="truncate text-[11px] text-slate-400">{alt}</p>
        </div>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${tonlar[ton]}`}>
          {icon}
        </span>
      </div>
    </div>
  )
}

export default function CariPage() {
  const { cariler, yukleniyor, hata, ekle, guncelle, sil } = useCari()
  const { hasPermission } = useAuth()
  const navigate = useNavigate()
  const finansGorunur = hasPermission('finance', 'read')
  const profilGorunur = hasPermission('pricing', 'read')
  const cariOlusturabilir = hasPermission('cari', 'create')
  const cariGuncelleyebilir = hasPermission('cari', 'update')
  const [formAcik, setFormAcik] = useState(false)
  const [duzenlenecek, setDuzenlenecek] = useState<Cari | null>(null)
  const [silinecek, setSilinecek] = useState<Cari | null>(null)
  const [siliniyor, setSiliniyor] = useState(false)
  const [ozetler, setOzetler] = useState<CariOzet[]>([])
  const [profiller, setProfiller] = useState<MusteriTicariProfili[]>([])
  const [profilSurumleri, setProfilSurumleri] = useState<MusteriTicariProfilSurumu[]>([])
  const [ticariHata, setTicariHata] = useState<string | null>(null)
  const [ozetlerAcik, setOzetlerAcik] = useState(() => {
    try {
      return window.localStorage.getItem('cari-paneli-ozetler-acik') === 'true'
    } catch {
      return false
    }
  })

  const ozetleriDegistir = () => {
    setOzetlerAcik((acik) => {
      const yeniDeger = !acik
      try {
        window.localStorage.setItem('cari-paneli-ozetler-acik', String(yeniDeger))
      } catch {
        // Depolama kullanılamıyorsa tercih yalnızca bu oturum için korunur.
      }
      return yeniDeger
    })
  }

  const ticariVerileriYukle = useCallback(async () => {
    setTicariHata(null)
    const istekler: Promise<void>[] = []
    if (finansGorunur) {
      istekler.push(
        cariPanelOzetleriniGetir()
          .then(setOzetler)
          .catch((error) => {
            setOzetler([])
            throw error
          }),
      )
    } else {
      setOzetler([])
    }
    if (profilGorunur) {
      istekler.push(
        cariPanelProfilleriniGetir()
          .then((veri) => {
            setProfiller(veri.profiller)
            setProfilSurumleri(veri.surumler)
          })
          .catch((error) => {
            setProfiller([])
            setProfilSurumleri([])
            throw error
          }),
      )
    } else {
      setProfiller([])
      setProfilSurumleri([])
    }
    try {
      await Promise.all(istekler)
    } catch (error) {
      setTicariHata(error instanceof Error ? error.message : 'Ticari özetler yüklenemedi.')
    }
  }, [finansGorunur, profilGorunur])

  useEffect(() => {
    void ticariVerileriYukle()
  }, [ticariVerileriYukle])

  const handleDuzenle = (cari: Cari) => {
    setDuzenlenecek(cari)
    setFormAcik(true)
  }

  const handleFormKapat = () => {
    setFormAcik(false)
    setDuzenlenecek(null)
  }

  const handleKaydet = async (veri: CariFormVeri) => {
    const payload: Parameters<typeof ekle>[0] = {
      ad: veri.ad,
      tipi: veri.tipi,
      telefon: veri.telefon || null,
      email: veri.email || null,
      adres: veri.adres || null,
      notlar: veri.notlar || null,
      aktif: duzenlenecek?.tipi === 'tedarikci'
        ? (duzenlenecek.aktif ?? true)
        : veri.aktif,
      tedarik_kapsamlari: tedarikKapsamlariniTemizle(
        veri.tipi,
        veri.tedarik_kapsamlari,
      ),
      tedarikci_calisma_modeli: veri.tipi === 'tedarikci'
        ? veri.tedarikci_calisma_modeli
        : null,
    }
    if (duzenlenecek) {
      await guncelle(duzenlenecek.id, payload)
    } else {
      await ekle(payload)
    }
    await ticariVerileriYukle()
  }

  const handleSilOnayla = async () => {
    if (!silinecek) return
    setSiliniyor(true)
    try {
      await sil(silinecek.id)
    } finally {
      setSiliniyor(false)
      setSilinecek(null)
    }
  }

  const aktifMusteriler = useMemo(
    () => cariler.filter((cari) => cari.tipi === 'musteri' && cari.aktif !== false),
    [cariler],
  )
  const aktifMusteriIdleri = useMemo(
    () => new Set(aktifMusteriler.map((cari) => cari.id)),
    [aktifMusteriler],
  )
  const borcToplami = useMemo(
    () => ozetler
      .filter((ozet) => (
        aktifMusteriIdleri.has(ozet.cari_id)
        && ozet.para_birimi === 'TRY'
        && Number(ozet.net_bakiye) > 0
      ))
      .reduce((toplam, ozet) => toplam + Number(ozet.net_bakiye), 0),
    [aktifMusteriIdleri, ozetler],
  )
  const borcluMusteriSayisi = useMemo(() => new Set(
    ozetler
      .filter((ozet) => aktifMusteriIdleri.has(ozet.cari_id) && Number(ozet.net_bakiye) > 0)
      .map((ozet) => ozet.cari_id),
  ).size, [aktifMusteriIdleri, ozetler])
  const krediliMusteriSayisi = useMemo(() => new Set(
    ozetler
      .filter((ozet) => aktifMusteriIdleri.has(ozet.cari_id) && Number(ozet.net_bakiye) < 0)
      .map((ozet) => ozet.cari_id),
  ).size, [aktifMusteriIdleri, ozetler])
  const hazirProfilSayisi = useMemo(() => {
    const bugun = ticariBugun()
    const hazirProfilIdleri = new Set(
      profilSurumleri
        .filter((surum) => (
          surum.durum === 'yayinda'
          && (!surum.gecerli_baslangic || surum.gecerli_baslangic <= bugun)
          && (!surum.gecerli_bitis || surum.gecerli_bitis >= bugun)
        ))
        .map((surum) => surum.musteri_ticari_profili_id),
    )
    return profiller.filter((profil) => (
      profil.aktif
      && aktifMusteriIdleri.has(profil.cari_id)
      && hazirProfilIdleri.has(profil.id)
    )).length
  }, [aktifMusteriIdleri, profilSurumleri, profiller])

  return (
    <div className="mx-auto min-w-0 max-w-[1600px] space-y-3 p-4 sm:p-5">
      <PageHeader
        baslik="Cari Merkezi"
        aciklama="Müşteri ve tedarikçi kayıtlarını ayrı çalışma alanlarında yönetin."
        icon={Users}
        className="mb-0"
        aksiyon={(
          <>
            <button
              type="button"
              onClick={ozetleriDegistir}
              aria-expanded={ozetlerAcik}
              aria-controls="cari-ozet-kartlari"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              {ozetlerAcik ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {ozetlerAcik ? 'Özetleri gizle' : 'Özetleri göster'}
            </button>
            {finansGorunur && (
              <button
                type="button"
                onClick={() => navigate('/cari-hesap')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <WalletCards size={16} />
                Tüm cari hareketleri
              </button>
            )}
            {cariOlusturabilir && (
              <button
                type="button"
                onClick={() => setFormAcik(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus size={16} />
                Yeni cari ekle
              </button>
            )}
          </>
        )}
      />

      {ozetlerAcik && (
        <div id="cari-ozet-kartlari" className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {finansGorunur ? (
            <BorcOzetKarti toplam={borcToplami} />
          ) : (
            <SayiKarti
              baslik="Finans görünümü"
              deger="—"
              alt="Borç özeti için finans yetkisi gerekir"
              icon={<Landmark size={19} />}
            />
          )}
          <SayiKarti
            baslik="Aktif müşteri"
            deger={aktifMusteriler.length}
            alt={`${cariler.filter((cari) => cari.tipi === 'tedarikci' && cari.aktif !== false).length} aktif tedarikçi`}
            icon={<Users size={19} />}
          />
          <SayiKarti
            baslik="Borç durumu"
            deger={finansGorunur ? borcluMusteriSayisi : '—'}
            alt={finansGorunur ? `${krediliMusteriSayisi} müşterinin kredisi / ön ödemesi var` : 'Finans yetkisi gerekli'}
            icon={<WalletCards size={19} />}
            ton={borcluMusteriSayisi > 0 ? 'amber' : 'emerald'}
          />
          <SayiKarti
            baslik="Ticari profili hazır"
            deger={profilGorunur ? `${hazirProfilSayisi}/${aktifMusteriler.length}` : '—'}
            alt={profilGorunur ? 'Yayındaki fiyat, KDV, vade ve döviz profili' : 'Fiyatlandırma yetkisi gerekli'}
            icon={<BadgeCheck size={19} />}
            ton={hazirProfilSayisi === aktifMusteriler.length ? 'emerald' : 'blue'}
          />
        </div>
      )}

      {(hata || ticariHata) && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata || ticariHata}
        </div>
      )}

      {!yukleniyor && cariler.length === 0 && !hata ? (
        <EmptyState
          icon={Users}
          baslik="Henüz cari kaydı yok"
          aciklama="Müşteri ve tedarikçilerinizi ekleyerek cari merkezini oluşturmaya başlayın."
          aksiyon={cariOlusturabilir ? (
            <button
              type="button"
              onClick={() => setFormAcik(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus size={16} />
              Yeni cari
            </button>
          ) : undefined}
        />
      ) : (
        <CariCalismaAlani
          cariler={cariler}
          onDuzenle={handleDuzenle}
          duzenleyebilir={cariGuncelleyebilir}
          onCariHesapAc={(cari) => navigate(`/cari-hesap?cari=${encodeURIComponent(cari.id)}`)}
        />
      )}

      {formAcik && (duzenlenecek ? cariGuncelleyebilir : cariOlusturabilir) && (
        <CariForm
          duzenlenecek={duzenlenecek}
          onKaydet={handleKaydet}
          onKapat={handleFormKapat}
        />
      )}

      {silinecek && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Cari silinsin mi?</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              <span className="font-medium text-gray-800">{silinecek.ad}</span> kalıcı olarak silinecek.
              Ticari profili veya hesap hareketi bulunan cariler silinemez; bu durumda kartı pasife alın.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSilinecek(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSilOnayla}
                disabled={siliniyor}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {siliniyor ? 'Siliniyor…' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
