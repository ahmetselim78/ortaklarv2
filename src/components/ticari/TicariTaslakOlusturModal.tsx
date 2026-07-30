import { CalendarPlus, Loader2, Save, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useEscape } from '@/hooks/useEscape'
import { kdvGrubuOtomatikAlanlariniOlustur } from '@/lib/kdvGrubu'
import {
  musteriTicariProfilTaslaginiGuncelle,
  ticariTaslakAnaKaydiOlustur,
  ticariTaslakOlusturmaReferanslariniGetir,
  type TicariTaslakAnaKayitTuru,
} from '@/services/ticariService'
import type { MusteriTicariProfilSurumu } from '@/types/ticari'
import { ticariBugun } from '@/lib/ticariFormat'

interface Props {
  tur: TicariTaslakAnaKayitTuru
  profilTaslagi?: (MusteriTicariProfilSurumu & { cari_id: string }) | null
  onKaydedildi: () => Promise<void> | void
  onKapat: () => void
}

const turBasligi: Record<TicariTaslakAnaKayitTuru, string> = {
  fiyat: 'Fiyat listesi',
  maliyet: 'Maliyet tarifesi',
  recete: 'Maliyet reçetesi',
  kdv: 'KDV grubu',
  vade: 'Vade profili',
  profil: 'Müşteri ticari profili',
}

function bosForm() {
  return {
    kod: '',
    ad: '',
    gecerli_baslangic: ticariBugun(),
    gecerli_bitis: '',
    aciklama: '',
    tur: 'ana',
    miras_ana_fiyat_listesi_id: '',
    cari_id: '',
    varsayilan: false,
    stok_id: '',
    kdv_orani: '20',
    ana_fiyat_listesi_id: '',
    musteri_fiyat_listesi_id: '',
    varsayilan_para_birimi: 'TRY',
    varsayilan_kdv_grubu_id: '',
    varsayilan_vade_gunu: '0',
    vade_profili_id: '',
    vade_profili_surumu_id: '',
    nakliye_hesaplama_tipi: '',
    sabit_nakliye_satis_tutari: '',
    sabit_nakliye_maliyet_tutari: '',
    m2_nakliye_satis_tutari: '',
    m2_nakliye_maliyet_tutari: '',
    minimum_marj_yuzdesi_override: '',
    varsayilan_belge_notu: '',
    teklif_gecerlilik_gunu: '15',
  }
}

type Form = ReturnType<typeof bosForm>

function profilFormu(profil?: Props['profilTaslagi']): Form {
  if (!profil) return bosForm()
  const metin = (value: unknown) => value == null ? '' : String(value)
  return {
    ...bosForm(),
    cari_id: profil.cari_id,
    gecerli_baslangic: profil.gecerli_baslangic ?? ticariBugun(),
    gecerli_bitis: profil.gecerli_bitis ?? '',
    ana_fiyat_listesi_id: profil.ana_fiyat_listesi_id,
    musteri_fiyat_listesi_id: profil.musteri_fiyat_listesi_id ?? '',
    varsayilan_para_birimi: profil.varsayilan_para_birimi,
    varsayilan_kdv_grubu_id: profil.varsayilan_kdv_grubu_id,
    varsayilan_vade_gunu: metin(profil.varsayilan_vade_gunu),
    vade_profili_id: profil.vade_profili_id ?? '',
    vade_profili_surumu_id: profil.vade_profili_surumu_id ?? '',
    nakliye_hesaplama_tipi: profil.nakliye_hesaplama_tipi ?? '',
    sabit_nakliye_satis_tutari: metin(profil.sabit_nakliye_satis_tutari),
    sabit_nakliye_maliyet_tutari: metin(profil.sabit_nakliye_maliyet_tutari),
    m2_nakliye_satis_tutari: metin(profil.m2_nakliye_satis_tutari),
    m2_nakliye_maliyet_tutari: metin(profil.m2_nakliye_maliyet_tutari),
    minimum_marj_yuzdesi_override: metin(profil.minimum_marj_yuzdesi_override),
    varsayilan_belge_notu: profil.varsayilan_belge_notu ?? '',
    teklif_gecerlilik_gunu: metin(profil.teklif_gecerlilik_gunu),
  }
}

export default function TicariTaslakOlusturModal({ tur, profilTaslagi, onKaydedildi, onKapat }: Props) {
  const [form, setForm] = useState<Form>(() => profilFormu(profilTaslagi))
  const [bitisTarihiAcik, setBitisTarihiAcik] = useState(
    () => Boolean(profilTaslagi?.gecerli_bitis),
  )
  const [referanslar, setReferanslar] = useState<Awaited<ReturnType<typeof ticariTaslakOlusturmaReferanslariniGetir>> | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  useEscape(onKapat, !kaydediliyor)

  useEffect(() => {
    let aktif = true
    ticariTaslakOlusturmaReferanslariniGetir()
      .then((veri) => {
        if (aktif) setReferanslar(veri)
      })
      .catch((error) => {
        if (aktif) setHata(error instanceof Error ? error.message : 'Referanslar yüklenemedi.')
      })
      .finally(() => {
        if (aktif) setYukleniyor(false)
      })
    return () => { aktif = false }
  }, [])

  const degistir = <K extends keyof Form>(alan: K, deger: Form[K]) => {
    setForm((onceki) => ({ ...onceki, [alan]: deger }))
    setHata(null)
  }
  const aktifCariler = useMemo(
    () => (referanslar?.cariler ?? []).filter((cari) => cari.aktif),
    [referanslar?.cariler],
  )
  const anaListeler = (referanslar?.fiyatListeleri ?? []).filter((liste) => liste.aktif && liste.tur === 'ana')
  const musteriListeleri = (referanslar?.fiyatListeleri ?? []).filter(
    (liste) => liste.aktif && liste.tur === 'musteri' && (!form.cari_id || liste.cari_id === form.cari_id),
  )
  const aktifVadeSurumleri = (referanslar?.vadeSurumleri ?? []).filter(
    (surum) => surum.vade_profili_id === form.vade_profili_id && surum.durum === 'yayinda',
  )
  const kdvOtomatikAlanlari = useMemo(
    () => kdvGrubuOtomatikAlanlariniOlustur(form.kdv_orani),
    [form.kdv_orani],
  )

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (tur !== 'profil' && tur !== 'kdv' && (!form.kod.trim() || !form.ad.trim())) {
      setHata('Kod ve ad zorunludur.')
      return
    }
    if (tur === 'kdv' && !kdvOtomatikAlanlari) {
      setHata('KDV oranı 0 ile 100 arasında olmalıdır.')
      return
    }
    if (!form.gecerli_baslangic) {
      setHata('Geçerlilik başlangıç tarihi zorunludur.')
      return
    }
    if (bitisTarihiAcik && !form.gecerli_bitis) {
      setHata('Bitiş tarihi eklemek için bir tarih seçin.')
      return
    }
    if (bitisTarihiAcik && form.gecerli_bitis < form.gecerli_baslangic) {
      setHata('Bitiş tarihi başlangıç tarihinden önce olamaz.')
      return
    }

    const payload = {
      ...form,
      gecerli_bitis: bitisTarihiAcik ? form.gecerli_bitis : '',
      ...(tur === 'kdv' && kdvOtomatikAlanlari
        ? {
            kod: kdvOtomatikAlanlari.kod,
            ad: kdvOtomatikAlanlari.ad,
            kdv_orani: String(kdvOtomatikAlanlari.oran),
            aciklama: '',
          }
        : {}),
    }

    setKaydediliyor(true)
    setHata(null)
    try {
      if (profilDuzenleme && profilTaslagi) {
        await musteriTicariProfilTaslaginiGuncelle(
          profilTaslagi.id,
          profilTaslagi.revision_no,
          payload,
        )
      } else {
        await ticariTaslakAnaKaydiOlustur(tur, payload)
      }
      await onKaydedildi()
      onKapat()
    } catch (error) {
      setHata(error instanceof Error ? error.message : profilDuzenleme
        ? 'Profil taslağı güncellenemedi.'
        : 'Taslak oluşturulamadı.')
    } finally {
      setKaydediliyor(false)
    }
  }

  const input = 'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400'
  const profilDuzenleme = tur === 'profil' && Boolean(profilTaslagi)
  const bitisTarihiniKaldir = () => {
    setBitisTarihiAcik(false)
    degistir('gecerli_bitis', '')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <form
        onSubmit={submit}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${tur === 'kdv' ? 'max-w-lg' : 'max-w-3xl'}`}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {profilDuzenleme ? 'Müşteri ticari profili taslağını düzenle' : `Yeni ${turBasligi[tur]}`}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {profilDuzenleme
                ? 'Taslak, beklenen revizyon numarası doğrulanarak güncellenir.'
                : tur === 'kdv'
                  ? 'Yalnızca oranı girin; kod ve ad otomatik oluşturulur.'
                  : 'Mantıksal kayıt ve S1 taslağı aynı transaction içinde oluşturulur.'}
            </p>
          </div>
          <button type="button" aria-label="Kapat" onClick={onKapat} disabled={kaydediliyor} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {hata && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{hata}</div>}
          {yukleniyor ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-gray-500"><Loader2 size={18} className="animate-spin" /> Referanslar yükleniyor…</div>
          ) : (
            <>
              {tur !== 'profil' && tur !== 'kdv' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-700">Kod *<input value={form.kod} onChange={(e) => degistir('kod', e.target.value.toUpperCase())} className={input} /></label>
                  <label className="text-xs font-medium text-gray-700">Ad *<input value={form.ad} onChange={(e) => degistir('ad', e.target.value)} className={input} /></label>
                </div>
              )}

              {tur === 'kdv' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-700">
                    KDV oranı % *
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.0001"
                      value={form.kdv_orani}
                      onChange={(e) => degistir('kdv_orani', e.target.value)}
                      className={input}
                      autoFocus
                    />
                  </label>
                  {kdvOtomatikAlanlari && (
                    <p className="text-xs text-gray-500">
                      Otomatik oluşacak: <span className="font-medium text-gray-700">{kdvOtomatikAlanlari.ad}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-gray-700">Geçerlilik başlangıcı *<input type="date" value={form.gecerli_baslangic} onChange={(e) => degistir('gecerli_baslangic', e.target.value)} className={input} /></label>
                {bitisTarihiAcik ? (
                  <div>
                    <label className="text-xs font-medium text-gray-700">Geçerlilik bitişi *
                      <input type="date" value={form.gecerli_bitis} onChange={(e) => degistir('gecerli_bitis', e.target.value)} className={input} />
                    </label>
                    <button type="button" onClick={bitisTarihiniKaldir} className="mt-1 text-xs font-medium text-gray-500 hover:text-gray-700">
                      Bitiş tarihini kaldır
                    </button>
                  </div>
                ) : (
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setBitisTarihiAcik(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <CalendarPlus size={16} />
                      Bitiş tarihi ekle
                    </button>
                  </div>
                )}
              </div>

              {tur === 'fiyat' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-700">Liste türü
                    <select value={form.tur} onChange={(e) => degistir('tur', e.target.value)} className={input}>
                      <option value="ana">Ana liste</option><option value="musteri">Müşteri katmanı</option>
                    </select>
                  </label>
                  {form.tur === 'musteri' && (
                    <>
                      <label className="text-xs font-medium text-gray-700">Müşteri *
                        <select value={form.cari_id} onChange={(e) => degistir('cari_id', e.target.value)} className={input}>
                          <option value="">Seçin…</option>{aktifCariler.map((cari) => <option key={cari.id} value={cari.id}>{cari.kod} · {cari.ad}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-gray-700">Miras alınan ana liste *
                        <select value={form.miras_ana_fiyat_listesi_id} onChange={(e) => degistir('miras_ana_fiyat_listesi_id', e.target.value)} className={input}>
                          <option value="">Seçin…</option>{anaListeler.map((liste) => <option key={liste.id} value={liste.id}>{liste.kod} · {liste.ad}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              )}

              {tur === 'maliyet' && (
                <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.varsayilan} onChange={(e) => degistir('varsayilan', e.target.checked)} /> Varsayılan maliyet tarifesi</label>
              )}

              {tur === 'recete' && (
                <label className="text-xs font-medium text-gray-700">Bitmiş ürün stoğu *
                  <select value={form.stok_id} onChange={(e) => degistir('stok_id', e.target.value)} className={input}>
                    <option value="">Seçin…</option>{(referanslar?.stoklar ?? []).filter((stok) => stok.aktif).map((stok) => <option key={stok.id} value={stok.id}>{stok.kod} · {stok.ad}</option>)}
                  </select>
                </label>
              )}

              {tur === 'profil' && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-gray-700">Müşteri *
                      <select
                        value={form.cari_id}
                        disabled={profilDuzenleme}
                        onChange={(e) => degistir('cari_id', e.target.value)}
                        className={input}
                      >
                        <option value="">Seçin…</option>{aktifCariler.map((cari) => <option key={cari.id} value={cari.id}>{cari.kod} · {cari.ad}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-700">Ana fiyat listesi *
                      <select value={form.ana_fiyat_listesi_id} onChange={(e) => degistir('ana_fiyat_listesi_id', e.target.value)} className={input}>
                        <option value="">Seçin…</option>{anaListeler.map((liste) => <option key={liste.id} value={liste.id}>{liste.kod} · {liste.ad}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-700">Müşteri fiyat katmanı
                      <select value={form.musteri_fiyat_listesi_id} onChange={(e) => degistir('musteri_fiyat_listesi_id', e.target.value)} className={input}>
                        <option value="">Yok</option>{musteriListeleri.map((liste) => <option key={liste.id} value={liste.id}>{liste.kod} · {liste.ad}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-700">Varsayılan para birimi
                      <select value={form.varsayilan_para_birimi} onChange={(e) => degistir('varsayilan_para_birimi', e.target.value)} className={input}><option>TRY</option><option>USD</option><option>EUR</option></select>
                    </label>
                    <label className="text-xs font-medium text-gray-700">Varsayılan KDV grubu *
                      <select value={form.varsayilan_kdv_grubu_id} onChange={(e) => degistir('varsayilan_kdv_grubu_id', e.target.value)} className={input}>
                        <option value="">Seçin…</option>{(referanslar?.kdvGruplari ?? []).filter((kdv) => kdv.aktif).map((kdv) => <option key={kdv.id} value={kdv.id}>{kdv.kod} · {kdv.ad}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-700">Varsayılan vade günü<input type="number" min="0" value={form.varsayilan_vade_gunu} onChange={(e) => degistir('varsayilan_vade_gunu', e.target.value)} className={input} /></label>
                    <label className="text-xs font-medium text-gray-700">Vade profili
                      <select value={form.vade_profili_id} onChange={(e) => {
                        degistir('vade_profili_id', e.target.value)
                        setForm((onceki) => ({ ...onceki, vade_profili_surumu_id: '' }))
                      }} className={input}>
                        <option value="">Yok</option>{(referanslar?.vadeProfilleri ?? []).filter((profil) => profil.aktif).map((profil) => <option key={profil.id} value={profil.id}>{profil.kod} · {profil.ad}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-700">Vade profili sürümü
                      <select value={form.vade_profili_surumu_id} disabled={!form.vade_profili_id} onChange={(e) => degistir('vade_profili_surumu_id', e.target.value)} className={input}>
                        <option value="">Seçin…</option>{aktifVadeSurumleri.map((surum) => <option key={surum.id} value={surum.id}>S{surum.surum_no}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-700">Minimum marj override %<input type="number" min="0" max="100" step="0.01" value={form.minimum_marj_yuzdesi_override} onChange={(e) => degistir('minimum_marj_yuzdesi_override', e.target.value)} className={input} /></label>
                    <label className="text-xs font-medium text-gray-700">Teklif geçerlilik günü<input type="number" min="1" value={form.teklif_gecerlilik_gunu} onChange={(e) => degistir('teklif_gecerlilik_gunu', e.target.value)} className={input} /></label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-xs font-medium text-gray-700">Nakliye tipi
                      <select value={form.nakliye_hesaplama_tipi} onChange={(e) => degistir('nakliye_hesaplama_tipi', e.target.value)} className={input}><option value="">Yok</option><option value="siparis_sabiti">Sipariş sabiti</option><option value="m2">m²</option></select>
                    </label>
                    {form.nakliye_hesaplama_tipi === 'siparis_sabiti' && (
                      <>
                        <label className="text-xs font-medium text-gray-700">Sabit satış<input type="number" min="0" step="0.01" value={form.sabit_nakliye_satis_tutari} onChange={(e) => degistir('sabit_nakliye_satis_tutari', e.target.value)} className={input} /></label>
                        <label className="text-xs font-medium text-gray-700">Sabit maliyet<input type="number" min="0" step="0.01" value={form.sabit_nakliye_maliyet_tutari} onChange={(e) => degistir('sabit_nakliye_maliyet_tutari', e.target.value)} className={input} /></label>
                      </>
                    )}
                    {form.nakliye_hesaplama_tipi === 'm2' && (
                      <>
                        <label className="text-xs font-medium text-gray-700">m² satış<input type="number" min="0" step="0.01" value={form.m2_nakliye_satis_tutari} onChange={(e) => degistir('m2_nakliye_satis_tutari', e.target.value)} className={input} /></label>
                        <label className="text-xs font-medium text-gray-700">m² maliyet<input type="number" min="0" step="0.01" value={form.m2_nakliye_maliyet_tutari} onChange={(e) => degistir('m2_nakliye_maliyet_tutari', e.target.value)} className={input} /></label>
                      </>
                    )}
                  </div>
                  <label className="block text-xs font-medium text-gray-700">Varsayılan belge notu<textarea value={form.varsayilan_belge_notu} onChange={(e) => degistir('varsayilan_belge_notu', e.target.value)} rows={3} className={input} /></label>
                </div>
              )}

              {tur !== 'profil' && tur !== 'kdv' && (
                <label className="block text-xs font-medium text-gray-700">Açıklama<textarea value={form.aciklama} onChange={(e) => degistir('aciklama', e.target.value)} rows={2} className={input} /></label>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onKapat} disabled={kaydediliyor} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Vazgeç</button>
          <button type="submit" disabled={kaydediliyor || yukleniyor} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {kaydediliyor ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {profilDuzenleme
              ? 'Taslağı güncelle'
              : tur === 'kdv'
                ? 'KDV grubunu oluştur'
                : 'S1 taslağını oluştur'}
          </button>
        </div>
      </form>
    </div>
  )
}
