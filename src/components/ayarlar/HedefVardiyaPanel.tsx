import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Save, Play, ChevronDown, ChevronRight, AlertCircle, Loader2, Clock, CalendarDays, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type {
  UretimSaatSablonu,
  UretimSaatlikHedef,
  YeniSablon,
  YeniHedef,
} from '@/types/saatlikUretim'

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 0=Paz, 1=Pzt, 2=Sal, 3=Çar, 4=Per, 5=Cum, 6=Cmt */
const GUN_ETIKETLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const GUN_TAM = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

/** Şablon günlerini localStorage'da saklar */
const GUNLER_KEY = 'saatlik-sablon-gunler'
function gunleriOku(): Record<string, number[]> {
  try { return JSON.parse(localStorage.getItem(GUNLER_KEY) ?? '{}') } catch { return {} }
}
function gunleriYaz(g: Record<string, number[]>) {
  try { localStorage.setItem(GUNLER_KEY, JSON.stringify(g)) } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

/** İki "HH:MM - HH:MM" aralığının çakışıp çakışmadığını kontrol eder */
function saatCakismaVar(aralik1: string, aralik2: string): boolean {
  const parse = (a: string) => a.split(' - ').map(s => s.trim())
  const [b1, e1] = parse(aralik1)
  const [b2, e2] = parse(aralik2)
  return b1 < e2 && b2 < e1
}

/** Saat aralığı geçerlilik kontrolü: "HH:MM - HH:MM" */
function saatAralikiGecerli(aralik: string): boolean {
  const m = aralik.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/)
  if (!m) return false
  return m[1] < m[2]
}

// ── Boş slot ──────────────────────────────────────────────────────────────────

interface HedefSlot {
  /** uuid — kaydedilmiş ise dolu, taslak ise boş */
  id?: string
  saat_araligi: string
  hedef_adet: number
  sira_no: number
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function HedefVardiyaPanel() {
  const [sablonlar, setSablonlar] = useState<UretimSaatSablonu[]>([])
  const [seciliSablonId, setSeciliSablonId] = useState<string | null>(null)
  const [slotlar, setSlotlar] = useState<HedefSlot[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [slotYukleniyor, setSlotYukleniyor] = useState(false)
  const [kaydediyor, setKaydediyor] = useState(false)
  const [uyguluyor, setUyguluyor] = useState(false)
  const [otoUyguluyor, setOtoUyguluyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [basariMesaji, setBasariMesaji] = useState<string | null>(null)
  const [yeniSablonAdi, setYeniSablonAdi] = useState('')
  const [yeniSablonAraligi, setYeniSablonAraligi] = useState('08:00 - 18:00')
  const [sablonFormAcik, setSablonFormAcik] = useState(false)
  const [sablonGunler, setSablonGunler] = useState<Record<string, number[]>>(() => gunleriOku())
  const [silinecekSablon, setSilinecekSablon] = useState<UretimSaatSablonu | null>(null)
  const [sablonSiliniyor, setSablonSiliniyor] = useState(false)

  const bugun = toDateStr()
  const bugunGunNo = new Date().getDay() // 0=Paz … 6=Cmt

  // ── Şablonları getir ──────────────────────────────────────────────────────
  const sablonlariGetir = useCallback(async () => {
    setYukleniyor(true)
    try {
      const { data, error } = await supabase
        .from('uretim_saat_sablonlari')
        .select('*')
        .order('sira_no')
      if (error) throw error
      setSablonlar((data ?? []) as UretimSaatSablonu[])
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Şablonlar yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => { sablonlariGetir() }, [sablonlariGetir])

  // ── Şablon seç → hedefleri getir ─────────────────────────────────────────
  const sablonSec = useCallback(async (sablonId: string) => {
    setSeciliSablonId(sablonId)
    setSlotYukleniyor(true)
    setHata(null)
    try {
      const { data, error } = await supabase
        .from('uretim_saatlik_hedefler')
        .select('*')
        .eq('sablon_id', sablonId)
        .order('sira_no')
      if (error) throw error
      const hedefler = (data ?? []) as UretimSaatlikHedef[]
      setSlotlar(
        hedefler.map(h => ({
          id: h.id,
          saat_araligi: h.saat_araligi,
          hedef_adet: h.hedef_adet,
          sira_no: h.sira_no,
        })),
      )
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Hedefler yüklenemedi')
    } finally {
      setSlotYukleniyor(false)
    }
  }, [])

  // ── Yeni şablon oluştur ───────────────────────────────────────────────────
  const sablonOlustur = async () => {
    if (!yeniSablonAdi.trim()) return
    setHata(null)
    try {
      const yeni: YeniSablon = {
        sablon_adi: yeniSablonAdi.trim(),
        saat_araligi: yeniSablonAraligi.trim(),
        sira_no: sablonlar.length,
      }
      const { data, error } = await supabase
        .from('uretim_saat_sablonlari')
        .insert([yeni])
        .select()
        .single()
      if (error) throw error
      const yeniSablon = data as UretimSaatSablonu
      setSablonlar(prev => [...prev, yeniSablon])
      setYeniSablonAdi('')
      setYeniSablonAraligi('08:00 - 18:00')
      setSablonFormAcik(false)
      sablonSec(yeniSablon.id)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Şablon oluşturulamadı')
    }
  }

  // ── Şablon sil ───────────────────────────────────────────────────────────
  const sablonSil = async () => {
    if (!silinecekSablon) return
    setSablonSiliniyor(true)
    try {
      const { error } = await supabase.from('uretim_saat_sablonlari').delete().eq('id', silinecekSablon.id)
      if (error) throw error
      setSablonlar(prev => prev.filter(s => s.id !== silinecekSablon.id))
      if (seciliSablonId === silinecekSablon.id) {
        setSeciliSablonId(null)
        setSlotlar([])
      }
      setSilinecekSablon(null)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Sablon silinemedi')
    } finally {
      setSablonSiliniyor(false)
    }
  }

  // ── Slot yönetimi ─────────────────────────────────────────────────────────
  const slotEkle = () => {
    const sonSlot = slotlar[slotlar.length - 1]
    let baslangic = '08:00'

    if (sonSlot) {
      const bitisStr = sonSlot.saat_araligi.split(' - ')[1]?.trim() ?? '08:00'
      baslangic = bitisStr
    }

    const [h, m] = baslangic.split(':').map(Number)
    const bitisH = h + 1 > 23 ? 23 : h + 1
    const bitis = `${String(bitisH).padStart(2, '0')}:${String(m).padStart(2, '0')}`

    setSlotlar(prev => [
      ...prev,
      { saat_araligi: `${baslangic} - ${bitis}`, hedef_adet: 50, sira_no: prev.length },
    ])
  }

  const slotGuncelle = (idx: number, alan: 'saat_araligi' | 'hedef_adet', deger: string | number) => {
    setSlotlar(prev =>
      prev.map((s, i) => (i === idx ? { ...s, [alan]: deger } : s)),
    )
  }

  const slotSil = (idx: number) => {
    setSlotlar(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sira_no: i })))
  }

  // ── Hedefleri kaydet ──────────────────────────────────────────────────────
  const hedefleriKaydet = async () => {
    if (!seciliSablonId) return

    const gecersizSlotlar = slotlar.filter(s => !saatAralikiGecerli(s.saat_araligi))
    if (gecersizSlotlar.length > 0) {
      setHata('Saat formatı geçersiz. "HH:MM - HH:MM" formatında girin ve başlangıç < bitiş olmalı.')
      return
    }

    setKaydediyor(true)
    setHata(null)
    try {
      // Mevcut hedefleri sil
      await supabase
        .from('uretim_saatlik_hedefler')
        .delete()
        .eq('sablon_id', seciliSablonId)

      // Yeniden ekle
      if (slotlar.length > 0) {
        const yeniHedefler: YeniHedef[] = slotlar.map((s, i) => ({
          sablon_id: seciliSablonId,
          saat_araligi: s.saat_araligi.trim(),
          hedef_adet: Number(s.hedef_adet) || 0,
          sira_no: i,
        }))
        const { error } = await supabase.from('uretim_saatlik_hedefler').insert(yeniHedefler)
        if (error) throw error
      }

      setBasariMesaji('Hedefler kaydedildi!')
      setTimeout(() => setBasariMesaji(null), 3000)

      // Güncellenmiş hedefleri tekrar getir
      await sablonSec(seciliSablonId)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Hedefler kaydedilemedi')
    } finally {
      setKaydediyor(false)
    }
  }

  // ── Bugüne uygula ─────────────────────────────────────────────────────────
  const bugunUygula = async () => {
    if (!seciliSablonId || slotlar.length === 0) return

    setUyguluyor(true)
    setHata(null)
    try {
      // Önce bugünkü mevcut kayıtları sil
      await supabase.from('gunluk_uretim_takip').delete().eq('tarih', bugun)

      // Şablon satırlarını bugün için ekle
      const satirlar = slotlar.map((s, i) => ({
        tarih: bugun,
        saat_araligi: s.saat_araligi.trim(),
        hedef_adet: Number(s.hedef_adet) || 0,
        gerceklesen_adet: 0,
        fire_adet: 0,
        aksiyon_notu: null,
        npt_orani: 0,
        sira_no: i,
      }))

      const { error } = await supabase.from('gunluk_uretim_takip').insert(satirlar)
      if (error) throw error

      setBasariMesaji(`${slotlar.length} saat dilimi bugün (${bugun}) için oluşturuldu!`)
      setTimeout(() => setBasariMesaji(null), 4000)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Bugüne uygulanamadı')
    } finally {
      setUyguluyor(false)
    }
  }

  // ── Gün seçimi toggle ─────────────────────────────────────────────────────
  const gunToggle = (sablonId: string, gunNo: number) => {
    setSablonGunler(prev => {
      const mevcutlar = prev[sablonId] ?? [1, 2, 3, 4, 5]
      const yeni = mevcutlar.includes(gunNo)
        ? mevcutlar.filter(g => g !== gunNo)
        : [...mevcutlar, gunNo].sort((a, b) => a - b)
      const guncellenmis = { ...prev, [sablonId]: yeni }
      gunleriYaz(guncellenmis)
      return guncellenmis
    })
  }

  // ── Otomatik bugünkü vardiyaları uygula ───────────────────────────────────
  const otomatikBugunUygula = async () => {
    // Bugün için seçilmiş şablonları bul
    const bugunSablonlari = sablonlar.filter(s => {
      const gunler = sablonGunler[s.id] ?? [1, 2, 3, 4, 5]
      return gunler.includes(bugunGunNo)
    })

    if (bugunSablonlari.length === 0) {
      setHata(`Bugün (${GUN_TAM[bugunGunNo]}) için seçili şablon yok. Şablonların gün ayarlarını kontrol edin.`)
      return
    }

    // Her şablon için hedefleri al
    setOtoUyguluyor(true)
    setHata(null)
    try {
      const sablonSlotMap: { sablon: UretimSaatSablonu; slots: HedefSlot[] }[] = []

      for (const sablon of bugunSablonlari) {
        const { data, error } = await supabase
          .from('uretim_saatlik_hedefler')
          .select('*')
          .eq('sablon_id', sablon.id)
          .order('sira_no')
        if (error) throw error
        const slots: HedefSlot[] = ((data ?? []) as UretimSaatlikHedef[]).map(h => ({
          id: h.id, saat_araligi: h.saat_araligi, hedef_adet: h.hedef_adet, sira_no: h.sira_no,
        }))
        sablonSlotMap.push({ sablon, slots })
      }

      // Çakışma kontrolü
      const tumSlotlar: HedefSlot[] = []
      for (const { sablon, slots } of sablonSlotMap) {
        for (const slot of slots) {
          const cakisan = tumSlotlar.find(s => saatCakismaVar(s.saat_araligi, slot.saat_araligi))
          if (cakisan) {
            setHata(
              `Saat çakışması: "${sablon.sablon_adi}" şablonundaki "${slot.saat_araligi}" aralığı mevcut bir aralıkla (${cakisan.saat_araligi}) çakışıyor. Şablon saatlerini düzenleyin.`
            )
            setOtoUyguluyor(false)
            return
          }
          tumSlotlar.push(slot)
        }
      }

      // Çakışma yok — sırayla uygula
      tumSlotlar.sort((a, b) => a.saat_araligi.localeCompare(b.saat_araligi))

      await supabase.from('gunluk_uretim_takip').delete().eq('tarih', bugun)

      const satirlar = tumSlotlar.map((s, i) => ({
        tarih: bugun,
        saat_araligi: s.saat_araligi.trim(),
        hedef_adet: Number(s.hedef_adet) || 0,
        gerceklesen_adet: 0,
        fire_adet: 0,
        aksiyon_notu: null,
        npt_orani: 0,
        sira_no: i,
      }))

      const { error } = await supabase.from('gunluk_uretim_takip').insert(satirlar)
      if (error) throw error

      const sablonAdlari = bugunSablonlari.map(s => s.sablon_adi).join(' + ')
      setBasariMesaji(`${satirlar.length} saat dilimi oluşturuldu! (${sablonAdlari})`)
      setTimeout(() => setBasariMesaji(null), 5000)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Otomatik uygulama başarısız')
    } finally {
      setOtoUyguluyor(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl space-y-8">

      {/* ── Şablon Seçimi ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Vardiya Şablonları</h3>
          <button
            type="button"
            onClick={() => setSablonFormAcik(v => !v)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus size={14} />
            Yeni Şablon
            {sablonFormAcik ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>

        {/* Yeni şablon formu */}
        {sablonFormAcik && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Şablon Adı</label>
                <input
                  value={yeniSablonAdi}
                  onChange={e => setYeniSablonAdi(e.target.value)}
                  placeholder="Örn: Gündüz Vardiyası 10S"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Genel Saat Aralığı</label>
                <input
                  value={yeniSablonAraligi}
                  onChange={e => setYeniSablonAraligi(e.target.value)}
                  placeholder="08:00 - 18:00"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={sablonOlustur}
              disabled={!yeniSablonAdi.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Plus size={12} />
              Oluştur
            </button>
          </div>
        )}

        {/* Şablon listesi */}
        {yukleniyor ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
            <Loader2 size={14} className="animate-spin" />
            Yükleniyor…
          </div>
        ) : sablonlar.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Henüz şablon yok. "Yeni Şablon" ile başlayın.
          </p>
        ) : (
          <div className="space-y-3">
            {sablonlar.map(s => {
              const gunler = sablonGunler[s.id] ?? [1, 2, 3, 4, 5]
              const bugunIcin = gunler.includes(bugunGunNo)
              return (
                <div
                  key={s.id}
                  className={`rounded-lg border transition-all ${
                    seciliSablonId === s.id
                      ? 'bg-blue-50 border-blue-200 shadow-sm'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {/* Üst satır: seç + sil */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => sablonSec(s.id)}
                  >
                    <Clock size={16} className={seciliSablonId === s.id ? 'text-blue-600' : 'text-gray-400'} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{s.sablon_adi}</p>
                      <p className="text-xs text-gray-400">{s.saat_araligi}</p>
                    </div>
                    {bugunIcin && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                        Bugün aktif
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setSilinecekSablon(s) }}
                      className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Alt satır: gün seçimi */}
                  <div className="px-4 pb-3 flex items-center gap-2 border-t border-gray-100 pt-2.5">
                    <CalendarDays size={13} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-500 mr-1">Günler:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5, 6, 0].map(g => (
                        <button
                          key={g}
                          type="button"
                          onClick={e => { e.stopPropagation(); gunToggle(s.id, g) }}
                          title={GUN_TAM[g]}
                          className={`w-8 h-7 text-[11px] font-semibold rounded transition-all ${
                            gunler.includes(g)
                              ? g === 0 || g === 6
                                ? 'bg-orange-500 text-white'
                                : 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          } ${g === bugunGunNo ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`}
                        >
                          {GUN_ETIKETLER[g]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Otomatik Günlük Uygulama ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <Zap size={16} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Otomatik Bugünkü Vardiyaları Uygula</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              Bugün <strong className="text-gray-700">{GUN_TAM[bugunGunNo]}</strong> günü için seçilmiş tüm şablonları birleştirerek uygular.
              Birden fazla şablon (gündüz + gece) saat çakışması yoksa otomatik birleştirilir.
            </p>

            {/* Bugün için aktif şablonlar */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {sablonlar.length === 0 ? (
                <span className="text-xs text-gray-400 italic">Şablon yok</span>
              ) : sablonlar.filter(s => (sablonGunler[s.id] ?? [1,2,3,4,5]).includes(bugunGunNo)).length === 0 ? (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                  Bugün için seçili şablon yok
                </span>
              ) : (
                sablonlar
                  .filter(s => (sablonGunler[s.id] ?? [1,2,3,4,5]).includes(bugunGunNo))
                  .map(s => (
                    <span key={s.id} className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                      ✓ {s.sablon_adi}
                    </span>
                  ))
              )}
            </div>

            {hata && !seciliSablonId && (
              <div className="mb-3 flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {hata}
              </div>
            )}
            {basariMesaji && !seciliSablonId && (
              <div className="mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                ✓ {basariMesaji}
              </div>
            )}

            <button
              type="button"
              onClick={otomatikBugunUygula}
              disabled={otoUyguluyor}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {otoUyguluyor ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {otoUyguluyor ? 'Uygulanıyor…' : `Bugünü Otomatik Kur (${bugun})`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Saat Dilimi Hedefleri ── */}
      {seciliSablonId && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">
              Saatlik Hedefler
              <span className="ml-2 text-gray-400 font-normal text-xs">
                ({sablonlar.find(s => s.id === seciliSablonId)?.sablon_adi})
              </span>
            </h3>
            <button
              type="button"
              onClick={slotEkle}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={13} />
              Saat Dilimi Ekle
            </button>
          </div>

          {slotYukleniyor ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <Loader2 size={14} className="animate-spin" />
              Yükleniyor…
            </div>
          ) : (
            <>
              {/* Tablo başlık */}
              {slotlar.length > 0 && (
                <div className="grid grid-cols-[1fr_120px_36px] gap-2 px-2 mb-2">
                  <span className="text-xs text-gray-500 font-medium">Saat Aralığı</span>
                  <span className="text-xs text-gray-500 font-medium text-center">Hedef (adet)</span>
                  <span />
                </div>
              )}

              {/* Slot satırları */}
              <div className="space-y-2">
                {slotlar.map((slot, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_120px_36px] gap-2 items-center">
                    <input
                      value={slot.saat_araligi}
                      onChange={e => slotGuncelle(idx, 'saat_araligi', e.target.value)}
                      placeholder="08:00 - 09:00"
                      className={`px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                        !saatAralikiGecerli(slot.saat_araligi) && slot.saat_araligi
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-300'
                      }`}
                    />
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={slot.hedef_adet}
                      onChange={e => slotGuncelle(idx, 'hedef_adet', Number(e.target.value))}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => slotSil(idx)}
                      className="flex items-center justify-center w-9 h-9 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {slotlar.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  Saat dilimi yok. "Saat Dilimi Ekle" ile başlayın.
                </p>
              )}

              {/* Toplam */}
              {slotlar.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end text-sm text-gray-600">
                  Günlük Toplam Hedef:&nbsp;
                  <strong className="text-gray-900">
                    {slotlar.reduce((acc, s) => acc + (Number(s.hedef_adet) || 0), 0)} adet
                  </strong>
                </div>
              )}
            </>
          )}

          {/* Hata / Başarı */}
          {hata && (
            <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {hata}
            </div>
          )}
          {basariMesaji && (
            <div className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ {basariMesaji}
            </div>
          )}

          {/* Aksiyon butonları */}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={hedefleriKaydet}
              disabled={kaydediyor || slotlar.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {kaydediyor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {kaydediyor ? 'Kaydediliyor…' : 'Hedefleri Kaydet'}
            </button>

            <button
              type="button"
              onClick={bugunUygula}
              disabled={uyguluyor || slotlar.length === 0}
              title={
                seciliSablonId && !(sablonGunler[seciliSablonId] ?? [1,2,3,4,5]).includes(bugunGunNo)
                  ? `Dikkat: Bu şablon bugün (${GUN_TAM[bugunGunNo]}) için seçili değil`
                  : undefined
              }
              className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors ${
                seciliSablonId && !(sablonGunler[seciliSablonId] ?? [1,2,3,4,5]).includes(bugunGunNo)
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {uyguluyor ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {uyguluyor ? 'Uygulanıyor…' : `Bu Şablonu Bugüne Uygula`}
            </button>
          </div>

          <p className="mt-2 text-[11px] text-gray-400">
            "Bu Şablonu Bugüne Uygula" — Yalnızca seçili şablonu bugün için uygular. Mevcut kayıtlar silinir.
          </p>
        </div>
      )}

      {silinecekSablon && (
        <ConfirmDialog
          baslik="Sablon silinsin mi?"
          mesaj={`${silinecekSablon.sablon_adi} sablonu ve hedefleri silinecek.`}
          onayButon="Sil"
          onayRenk="red"
          yukleniyor={sablonSiliniyor}
          onOnayla={sablonSil}
          onKapat={() => !sablonSiliniyor && setSilinecekSablon(null)}
        />
      )}
    </div>
  )
}
