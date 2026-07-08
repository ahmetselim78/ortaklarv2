import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, Send, AlertCircle, Loader2, CheckCircle2,
  Eye, EyeOff, Clock, LayoutTemplate, Bot, CalendarClock,
  BarChart3, Factory, Layers, MessageSquare, Users, Truck,
  StickyNote, User, FileText, ChevronRight, Info, Zap,
  Pencil, X, Pause, Play,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type {
  TelegramAyarlari,
  TelegramRaporSaati,
  TelegramRaporTipi,
  TelegramSablonAyarlari,
} from '@/types/saatlikUretim'
import {
  TELEGRAM_RAPOR_TIPI_ETIKETLERI,
  VARSAYILAN_TELEGRAM_SABLON,
} from '@/types/saatlikUretim'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

type Sekme = 'baglanti' | 'zamanlama' | 'mesaj'

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function saatGecerliMi(saat: string): boolean {
  return /^\d{2}:\d{2}$/.test(saat) && (() => {
    const [h, m] = saat.split(':').map(Number)
    return h >= 0 && h <= 23 && m >= 0 && m <= 59
  })()
}

function saatNormalize(saat: string): string {
  const parcalar = saat.trim().split(':')
  if (parcalar.length < 2) return saat.trim()
  const [h = '', m = ''] = parcalar
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

function saatDakikaya(saat: string): number {
  const [h, m] = saatNormalize(saat).split(':').map(Number)
  return h * 60 + m
}

const GONDERIM_ICERIK: Record<TelegramRaporTipi, string[]> = {
  saatlik: ['Saatlik hedef & gerçekleşen', 'Fire adetleri', 'Performans özeti'],
  uretim_giris: ['İstasyon adetleri', 'Araç yüklemeleri', 'Personel & notlar'],
  her_ikisi: ['Saatlik takip verileri', 'Üretim giriş verileri'],
}

function sablonFromAyar(ayar: TelegramAyarlari | null): TelegramSablonAyarlari {
  if (!ayar) return { ...VARSAYILAN_TELEGRAM_SABLON }
  return {
    sablon_baslik: ayar.sablon_baslik ?? true,
    sablon_saatlik_detay: ayar.sablon_saatlik_detay ?? true,
    sablon_saatlik_ozet: ayar.sablon_saatlik_ozet ?? true,
    sablon_istasyonlar: ayar.sablon_istasyonlar ?? true,
    sablon_araclar: ayar.sablon_araclar ?? true,
    sablon_personel: ayar.sablon_personel ?? true,
    sablon_operator: ayar.sablon_operator ?? true,
    sablon_notlar: ayar.sablon_notlar ?? true,
  }
}

interface SablonBolumTanim {
  key: keyof TelegramSablonAyarlari
  label: string
  aciklama: string
  grup: 'genel' | 'saatlik' | 'uretim'
  icon: React.ElementType
}

const SABLON_BOLUMLERI: SablonBolumTanim[] = [
  { key: 'sablon_baslik', label: 'Başlık', aciklama: 'Tarih ve rapor başlığı', grup: 'genel', icon: FileText },
  { key: 'sablon_saatlik_detay', label: 'Saatlik Tablo', aciklama: 'Saat dilimi hedef/gerçekleşen', grup: 'saatlik', icon: BarChart3 },
  { key: 'sablon_saatlik_ozet', label: 'Saatlik Özet', aciklama: 'Toplam ve performans', grup: 'saatlik', icon: Zap },
  { key: 'sablon_operator', label: 'Operatör', aciklama: 'Giriş yapan kişi', grup: 'uretim', icon: User },
  { key: 'sablon_personel', label: 'Personel', aciklama: 'Toplam personel sayısı', grup: 'uretim', icon: Users },
  { key: 'sablon_istasyonlar', label: 'İstasyonlar', aciklama: 'Adet ve fire bilgisi', grup: 'uretim', icon: Factory },
  { key: 'sablon_araclar', label: 'Araçlar', aciklama: 'Yükleme kayıtları', grup: 'uretim', icon: Truck },
  { key: 'sablon_notlar', label: 'Notlar', aciklama: 'Operatör notları', grup: 'uretim', icon: StickyNote },
]

const RAPOR_TIPI_SECENEKLERI: TelegramRaporTipi[] = ['saatlik', 'uretim_giris', 'her_ikisi']

const RAPOR_TIPI_STIL: Record<TelegramRaporTipi, {
  icon: React.ElementType
  renk: string
  bg: string
  border: string
  badge: string
  ring: string
  aciklama: string
}> = {
  saatlik: {
    icon: BarChart3,
    renk: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
    ring: 'ring-blue-300',
    aciklama: 'Saatlik takip panosu verileri',
  },
  uretim_giris: {
    icon: Factory,
    renk: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    ring: 'ring-amber-300',
    aciklama: 'Operatör giriş paneli verileri',
  },
  her_ikisi: {
    icon: Layers,
    renk: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    badge: 'bg-violet-100 text-violet-700',
    ring: 'ring-violet-300',
    aciklama: 'Her iki kaynak birlikte',
  },
}

const SEKMELER: { id: Sekme; label: string; icon: React.ElementType }[] = [
  { id: 'baglanti', label: 'Bağlantı', icon: Bot },
  { id: 'zamanlama', label: 'Zamanlama', icon: CalendarClock },
  { id: 'mesaj', label: 'Mesaj', icon: MessageSquare },
]

function onizlemeMetni(sablon: TelegramSablonAyarlari): string {
  const satirlar: string[] = [
    '📋 Günlük Üretim Raporu',
    '━━━━━━━━━━━━━━━━━━',
    '📅 8 Temmuz 2026 · 12:00',
  ]

  if (sablon.sablon_saatlik_detay || sablon.sablon_saatlik_ozet) {
    satirlar.push('', '📊 Saatlik Takip', '──────────────────')
    if (sablon.sablon_saatlik_detay) {
      satirlar.push(
        '',
        '🕐 08:00 – 09:00',
        '🟢 Gerçekleşen: 95 / 100 (%95)',
        '🔥 Fire: 2',
        '',
        '🕐 09:00 – 10:00',
        '🟢 Gerçekleşen: 102 / 100 (%102)',
        '🔥 Fire: 1',
      )
    }
    if (sablon.sablon_saatlik_ozet) {
      satirlar.push(
        '',
        '📌 Gün Özeti',
        '✅ Gerçekleşen: 197 adet',
        '🎯 Hedef: 200 adet',
        '🔥 Fire: 3 adet',
        '🟢 Performans: %98.5',
      )
    }
  }

  if (
    sablon.sablon_operator || sablon.sablon_personel ||
    sablon.sablon_istasyonlar || sablon.sablon_araclar || sablon.sablon_notlar
  ) {
    satirlar.push('', '🏭 Üretim Girişi', '──────────────────')
    if (sablon.sablon_operator || sablon.sablon_personel) {
      const bilgi: string[] = []
      if (sablon.sablon_operator) bilgi.push('👤 Ahmet Yılmaz')
      if (sablon.sablon_personel) bilgi.push('👥 42 personel')
      satirlar.push('', bilgi.join(' · '))
    }
    if (sablon.sablon_istasyonlar) {
      satirlar.push('', 'İstasyonlar', '• Kesim — 120 adet (fire: 3)', '• Isıcam Hattı — 85 adet (fire: 1)')
    }
    if (sablon.sablon_araclar) {
      satirlar.push('', 'Araç Yüklemeleri', '• 34 ABC 123 (Kamyon) — 50 adet')
    }
    if (sablon.sablon_notlar) {
      satirlar.push('', '📝 Not: Vardiya sorunsuz tamamlandı.')
    }
  }

  return satirlar.join('\n')
}

// ── Alt bileşenler ────────────────────────────────────────────────────────────

function Bildirim({
  tip, mesaj,
}: { tip: 'basari' | 'hata'; mesaj: string }) {
  return (
    <div className={cn(
      'flex items-start gap-2.5 text-sm rounded-xl px-4 py-3 border animate-in fade-in slide-in-from-top-1 duration-200',
      tip === 'basari'
        ? 'text-green-800 bg-green-50 border-green-200'
        : 'text-red-700 bg-red-50 border-red-200',
    )}>
      {tip === 'basari'
        ? <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-green-600" />
        : <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />}
      <span className="leading-relaxed">{mesaj}</span>
    </div>
  )
}

function RaporTipiSecici({
  secili, onSec, dikey,
}: {
  secili: TelegramRaporTipi
  onSec: (t: TelegramRaporTipi) => void
  dikey?: boolean
}) {
  return (
    <div className={cn('grid gap-2', dikey ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3')}>
      {RAPOR_TIPI_SECENEKLERI.map(tip => {
        const stil = RAPOR_TIPI_STIL[tip]
        const Icon = stil.icon
        const aktif = secili === tip
        return (
          <button
            key={tip}
            type="button"
            onClick={() => onSec(tip)}
            className={cn(
              'flex items-center gap-3 rounded-xl border text-left transition-all px-3.5 py-3',
              aktif
                ? cn(stil.bg, stil.border, 'ring-2 ring-offset-1', stil.ring)
                : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50',
            )}
          >
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              aktif ? stil.badge : 'bg-gray-100 text-gray-500',
            )}>
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-semibold', aktif ? stil.renk : 'text-gray-800')}>
                {TELEGRAM_RAPOR_TIPI_ETIKETLERI[tip]}
              </p>
              <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{stil.aciklama}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ZamanlamaKarti({
  kayit,
  duzenlemeModu,
  duzenlemeSaat,
  duzenlemeTip,
  duzenlemeHata,
  kaydediyor,
  onDuzenleBaslat,
  onDuzenleIptal,
  onDuzenleKaydet,
  onSaatDegistir,
  onTipDegistir,
  onToggle,
  onSil,
}: {
  kayit: TelegramRaporSaati
  duzenlemeModu: boolean
  duzenlemeSaat: string
  duzenlemeTip: TelegramRaporTipi
  duzenlemeHata: string | null
  kaydediyor: boolean
  onDuzenleBaslat: () => void
  onDuzenleIptal: () => void
  onDuzenleKaydet: () => void
  onSaatDegistir: (v: string) => void
  onTipDegistir: (t: TelegramRaporTipi) => void
  onToggle: () => void
  onSil: () => void
}) {
  const tip = kayit.rapor_tipi ?? 'saatlik'
  const stil = RAPOR_TIPI_STIL[tip]
  const TipIcon = stil.icon
  const gosterilenSaat = saatNormalize(kayit.saat)

  if (duzenlemeModu) {
    return (
      <div className="bg-white rounded-2xl border-2 border-teal-300 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-teal-50 border-b border-teal-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-teal-800">Zamanlama Düzenle</p>
          <button
            type="button"
            onClick={onDuzenleIptal}
            className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div className="max-w-[200px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Gönderim Saati</label>
            <input
              type="time"
              value={duzenlemeSaat}
              onChange={e => onSaatDegistir(e.target.value)}
              className="w-full px-4 py-2.5 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 bg-gray-50/50 font-mono font-semibold tracking-wide"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Gönderilecek Veriler</label>
            <RaporTipiSecici secili={duzenlemeTip} onSec={onTipDegistir} dikey />
          </div>

          {duzenlemeHata && (
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <AlertCircle size={12} />
              {duzenlemeHata}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onDuzenleKaydet}
              disabled={kaydediyor}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors"
            >
              {kaydediyor ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Kaydet
            </button>
            <button
              type="button"
              onClick={onDuzenleIptal}
              disabled={kaydediyor}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              İptal
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'bg-white rounded-2xl border transition-all',
      kayit.aktif ? 'border-gray-200 shadow-sm' : 'border-gray-100 opacity-60',
    )}>
      <div className="flex items-stretch gap-0">
        {/* Saat bloğu */}
        <div className={cn(
          'w-[80px] shrink-0 flex items-center justify-center py-4 border-r',
          kayit.aktif ? cn(stil.bg, stil.border) : 'bg-gray-50 border-gray-100',
        )}>
          <span className={cn(
            'text-2xl font-bold font-mono tracking-tight leading-none text-center',
            kayit.aktif ? stil.renk : 'text-gray-400',
          )}>
            {gosterilenSaat}
          </span>
        </div>

        {/* İçerik */}
        <div className="flex-1 min-w-0 px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg',
                  kayit.aktif ? stil.badge : 'bg-gray-100 text-gray-500',
                )}>
                  <TipIcon size={12} />
                  {TELEGRAM_RAPOR_TIPI_ETIKETLERI[tip]}
                </span>
                {!kayit.aktif && (
                  <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                    Durduruldu
                  </span>
                )}
              </div>

              <p className="text-[11px] font-medium text-gray-400 mt-2 mb-1.5">Gönderilecekler</p>
              <ul className="space-y-0.5">
                {GONDERIM_ICERIK[tip].map(madde => (
                  <li key={madde} className="text-xs text-gray-600 flex items-center gap-1.5">
                    <span className={cn('w-1 h-1 rounded-full shrink-0', kayit.aktif ? 'bg-teal-400' : 'bg-gray-300')} />
                    {madde}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onDuzenleBaslat}
                title="Düzenle"
                className="p-2 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={onToggle}
                title={kayit.aktif ? 'Durdur' : 'Aktif et'}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  kayit.aktif
                    ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                    : 'text-teal-600 hover:bg-teal-50',
                )}
              >
                {kayit.aktif ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button
                type="button"
                onClick={onSil}
                title="Sil"
                className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Ana Panel ─────────────────────────────────────────────────────────────────

export default function TelegramAyarlariPanel() {
  const [sekme, setSekme] = useState<Sekme>('baglanti')
  const [ayar, setAyar] = useState<TelegramAyarlari | null>(null)
  const [saatler, setSaatler] = useState<TelegramRaporSaati[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediyor, setKaydediyor] = useState(false)
  const [testGonderiyor, setTestGonderiyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [basari, setBasari] = useState<string | null>(null)

  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [aktif, setAktif] = useState(false)
  const [tokenGoster, setTokenGoster] = useState(false)
  const [sablon, setSablon] = useState<TelegramSablonAyarlari>({ ...VARSAYILAN_TELEGRAM_SABLON })
  const [kayitliSablon, setKayitliSablon] = useState<TelegramSablonAyarlari>({ ...VARSAYILAN_TELEGRAM_SABLON })

  const [yeniSaat, setYeniSaat] = useState('')
  const [yeniRaporTipi, setYeniRaporTipi] = useState<TelegramRaporTipi>('saatlik')
  const [saatHata, setSaatHata] = useState<string | null>(null)
  const [silinecekSaat, setSilinecekSaat] = useState<TelegramRaporSaati | null>(null)
  const [saatSiliniyor, setSaatSiliniyor] = useState(false)
  const [yardimAcik, setYardimAcik] = useState(false)

  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null)
  const [editSaat, setEditSaat] = useState('')
  const [editTip, setEditTip] = useState<TelegramRaporTipi>('saatlik')
  const [editHata, setEditHata] = useState<string | null>(null)
  const [editKaydediyor, setEditKaydediyor] = useState(false)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      const [ayarRes, saatRes] = await Promise.all([
        supabase.from('telegram_ayarlari').select('*').limit(1).maybeSingle(),
        supabase.from('telegram_rapor_saatleri').select('*').order('saat'),
      ])

      if (ayarRes.error) throw ayarRes.error
      if (saatRes.error) throw saatRes.error

      if (ayarRes.data) {
        const ayarData = ayarRes.data as TelegramAyarlari
        setAyar(ayarData)
        setBotToken(ayarData.bot_token ?? '')
        setChatId(ayarData.chat_id ?? '')
        setAktif(ayarData.aktif ?? false)
        const s = sablonFromAyar(ayarData)
        setSablon(s)
        setKayitliSablon(s)
      }
      setSaatler((saatRes.data ?? []).map(s => ({
        ...s,
        rapor_tipi: (s.rapor_tipi ?? 'saatlik') as TelegramRaporTipi,
      })) as TelegramRaporSaati[])
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Veriler yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => { getir() }, [getir])

  const basariGoster = (mesaj: string) => {
    setBasari(mesaj)
    setTimeout(() => setBasari(null), 3500)
  }

  const sablonDegisti = useMemo(
    () => JSON.stringify(sablon) !== JSON.stringify(kayitliSablon),
    [sablon, kayitliSablon],
  )

  const baglantiHazir = Boolean(botToken.trim() && chatId.trim())
  const aktifSaatSayisi = saatler.filter(s => s.aktif).length

  const siraliSaatler = useMemo(
    () => [...saatler].sort((a, b) => saatDakikaya(a.saat) - saatDakikaya(b.saat)),
    [saatler],
  )

  const kaydet = async (kapsam: 'baglanti' | 'mesaj' | 'hepsi' = 'hepsi') => {
    setKaydediyor(true)
    setHata(null)
    setBasari(null)
    try {
      const payload: Record<string, unknown> = {}
      if (kapsam === 'baglanti' || kapsam === 'hepsi') {
        payload.bot_token = botToken.trim()
        payload.chat_id = chatId.trim()
        payload.aktif = aktif
      }
      if (kapsam === 'mesaj' || kapsam === 'hepsi') {
        Object.assign(payload, sablon)
      }

      if (!ayar) {
        const { error } = await supabase.from('telegram_ayarlari').insert([{
          bot_token: botToken.trim(),
          chat_id: chatId.trim(),
          aktif,
          ...sablon,
        }])
        if (error) throw error
      } else {
        const { error } = await supabase.from('telegram_ayarlari').update(payload).eq('id', ayar.id)
        if (error) throw error
      }

      basariGoster(
        kapsam === 'baglanti' ? 'Bağlantı ayarları kaydedildi.'
          : kapsam === 'mesaj' ? 'Mesaj bölümleri kaydedildi.'
            : 'Tüm ayarlar kaydedildi.',
      )
      await getir()
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kayıt hatası')
    } finally {
      setKaydediyor(false)
    }
  }

  const sablonToggle = (key: keyof TelegramSablonAyarlari) => {
    setSablon(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const grupTopluToggle = (grup: 'saatlik' | 'uretim', deger: boolean) => {
    const anahtarlar = SABLON_BOLUMLERI.filter(b => b.grup === grup).map(b => b.key)
    setSablon(prev => {
      const guncel = { ...prev }
      anahtarlar.forEach(k => { guncel[k] = deger })
      return guncel
    })
  }

  const saatEkle = async () => {
    setSaatHata(null)
    const normalizedSaat = saatNormalize(yeniSaat)
    if (!saatGecerliMi(normalizedSaat)) {
      setSaatHata('Geçerli bir saat girin (ör. 12:00)')
      return
    }
    if (saatler.some(s => saatNormalize(s.saat) === normalizedSaat)) {
      setSaatHata('Bu saat zaten eklenmiş.')
      return
    }
    const { error } = await supabase
      .from('telegram_rapor_saatleri')
      .insert([{ saat: normalizedSaat, aktif: true, rapor_tipi: yeniRaporTipi }])
    if (error) { setSaatHata(error.message); return }
    setYeniSaat('')
    setYeniRaporTipi('saatlik')
    basariGoster(`${normalizedSaat} zamanlaması eklendi.`)
    await getir()
  }

  const saatSil = async () => {
    if (!silinecekSaat) return
    setSaatSiliniyor(true)
    try {
      const { error } = await supabase.from('telegram_rapor_saatleri').delete().eq('id', silinecekSaat.id)
      if (error) throw error
      setSaatler(prev => prev.filter(s => s.id !== silinecekSaat.id))
      setSilinecekSaat(null)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Saat silinemedi')
    } finally {
      setSaatSiliniyor(false)
    }
  }

  const saatToggle = async (s: TelegramRaporSaati) => {
    await supabase.from('telegram_rapor_saatleri').update({ aktif: !s.aktif }).eq('id', s.id)
    setSaatler(prev => prev.map(x => x.id === s.id ? { ...x, aktif: !x.aktif } : x))
  }

  const duzenlemeBaslat = (s: TelegramRaporSaati) => {
    setDuzenlenenId(s.id)
    setEditSaat(saatNormalize(s.saat))
    setEditTip(s.rapor_tipi ?? 'saatlik')
    setEditHata(null)
  }

  const duzenlemeIptal = () => {
    setDuzenlenenId(null)
    setEditSaat('')
    setEditTip('saatlik')
    setEditHata(null)
  }

  const duzenlemeKaydet = async () => {
    if (!duzenlenenId) return
    setEditHata(null)
    const normalized = saatNormalize(editSaat)
    if (!saatGecerliMi(normalized)) {
      setEditHata('Geçerli bir saat girin (ör. 12:00)')
      return
    }
    if (saatler.some(s => s.id !== duzenlenenId && saatNormalize(s.saat) === normalized)) {
      setEditHata('Bu saat zaten tanımlı.')
      return
    }
    setEditKaydediyor(true)
    try {
      const { error } = await supabase
        .from('telegram_rapor_saatleri')
        .update({ saat: normalized, rapor_tipi: editTip })
        .eq('id', duzenlenenId)
      if (error) throw error
      setSaatler(prev => prev.map(s =>
        s.id === duzenlenenId ? { ...s, saat: normalized, rapor_tipi: editTip } : s,
      ))
      duzenlemeIptal()
      basariGoster(`${normalized} zamanlaması güncellendi.`)
    } catch (e) {
      setEditHata(e instanceof Error ? e.message : 'Güncelleme başarısız')
    } finally {
      setEditKaydediyor(false)
    }
  }

  const testGonder = async () => {
    setTestGonderiyor(true)
    setHata(null)
    setBasari(null)
    try {
      const { data, error } = await supabase.functions.invoke('check-and-send-report', {
        body: { force: true },
      })
      if (error) throw error
      if (data?.ok === false) {
        setHata(`Gönderim başarısız: ${data?.mesaj ?? 'Bilinmeyen hata'}`)
      } else {
        setBasari('Test raporu Telegram\'a gönderildi!')
        setTimeout(() => setBasari(null), 4000)
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Test gönderimi başarısız')
    } finally {
      setTestGonderiyor(false)
    }
  }

  if (yukleniyor) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <Loader2 size={28} className="animate-spin text-teal-500" />
        <p className="text-sm">Telegram ayarları yükleniyor…</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-5">

      {/* ── Durum kartı ── */}
      <div className={cn(
        'rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4',
        aktif && baglantiHazir
          ? 'bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-200'
          : 'bg-gray-50 border-gray-200',
      )}>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
            aktif && baglantiHazir ? 'bg-teal-500 text-white shadow-lg shadow-teal-200' : 'bg-gray-200 text-gray-500',
          )}>
            <Send size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-gray-900">Telegram Raporları</h2>
              <span className={cn(
                'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                aktif && baglantiHazir ? 'bg-teal-100 text-teal-700' : 'bg-gray-200 text-gray-600',
              )}>
                {aktif && baglantiHazir ? 'Aktif' : aktif ? 'Eksik ayar' : 'Pasif'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {aktifSaatSayisi > 0
                ? `${aktifSaatSayisi} otomatik gönderim saati tanımlı`
                : 'Henüz otomatik saat eklenmemiş'}
              {baglantiHazir ? ' · Bağlantı hazır' : ' · Bot bilgileri eksik'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAktif(v => !v)}
          className={cn(
            'relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
            aktif ? 'bg-teal-500' : 'bg-gray-300',
          )}
          aria-label={aktif ? 'Raporları pasife al' : 'Raporları aktif et'}
        >
          <span className={cn(
            'pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-200',
            aktif ? 'translate-x-6' : 'translate-x-0',
          )} />
        </button>
      </div>

      {/* ── Bildirimler ── */}
      {basari && <Bildirim tip="basari" mesaj={basari} />}
      {hata && <Bildirim tip="hata" mesaj={hata} />}

      {/* ── Sekmeler ── */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        {SEKMELER.map(s => {
          const Icon = s.icon
          const aktifSekme = sekme === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSekme(s.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                aktifSekme
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon size={15} className={aktifSekme ? 'text-teal-600' : ''} />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* ══════════ BAĞLANTI SEKMESİ ══════════ */}
      {sekme === 'baglanti' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-semibold text-gray-800">Bot Bağlantısı</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                @BotFather üzerinden oluşturduğunuz bot bilgilerini girin.
              </p>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Bot size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">@BotFather</p>
                    <p className="text-[11px] text-gray-500">Bot token al</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-teal-500" />
                </a>
                <a
                  href="https://t.me/userinfobot"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                    <MessageSquare size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">@userinfobot</p>
                    <p className="text-[11px] text-gray-500">Chat ID öğren</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-teal-500" />
                </a>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Bot Token</label>
                  <div className="relative">
                    <input
                      type={tokenGoster ? 'text' : 'password'}
                      value={botToken}
                      onChange={e => setBotToken(e.target.value)}
                      placeholder="123456789:AAFxxxxxxxx..."
                      autoComplete="off"
                      className="w-full px-4 py-2.5 pr-10 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 font-mono bg-gray-50/50"
                    />
                    <button
                      type="button"
                      onClick={() => setTokenGoster(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                      tabIndex={-1}
                    >
                      {tokenGoster ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Chat ID</label>
                  <input
                    type="text"
                    value={chatId}
                    onChange={e => setChatId(e.target.value)}
                    placeholder="-1001234567890"
                    autoComplete="off"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 font-mono bg-gray-50/50"
                  />
                  <p className="mt-1.5 text-[11px] text-gray-400">Grup sohbetleri için genellikle negatif sayıdır.</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/30 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => kaydet('baglanti')}
                disabled={kaydediyor}
                className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors shadow-sm"
              >
                {kaydediyor ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Kaydet
              </button>
              <button
                type="button"
                onClick={testGonder}
                disabled={testGonderiyor || !baglantiHazir}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {testGonderiyor ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Test Gönder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ZAMANLAMA SEKMESİ ══════════ */}
      {sekme === 'zamanlama' && (
        <div className="space-y-5">
          {/* Günlük program özeti */}
          {siraliSaatler.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Günlük Program</p>
              <div className="flex flex-wrap gap-2">
                {siraliSaatler.map(s => {
                  const tip = s.rapor_tipi ?? 'saatlik'
                  const stil = RAPOR_TIPI_STIL[tip]
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm',
                        s.aktif ? cn(stil.bg, stil.border) : 'bg-gray-50 border-gray-200 opacity-50',
                      )}
                    >
                      <span className={cn('font-mono font-bold', s.aktif ? stil.renk : 'text-gray-400')}>
                        {saatNormalize(s.saat)}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className={cn('text-xs font-medium', s.aktif ? 'text-gray-600' : 'text-gray-400')}>
                        {TELEGRAM_RAPOR_TIPI_ETIKETLERI[tip]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Yeni Zamanlama</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Hangi saatte, hangi verilerin gönderileceğini belirleyin.
              </p>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid sm:grid-cols-[140px_1fr] gap-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Saat</label>
                  <input
                    type="time"
                    value={yeniSaat}
                    onChange={e => { setYeniSaat(e.target.value); setSaatHata(null) }}
                    onKeyDown={e => e.key === 'Enter' && saatEkle()}
                    className="w-full px-4 py-2.5 text-lg border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 bg-gray-50/50 font-mono font-bold tracking-wide"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Gönderilecek Veriler</label>
                  <RaporTipiSecici secili={yeniRaporTipi} onSec={setYeniRaporTipi} />
                </div>
              </div>

              {saatHata && (
                <p className="text-xs text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={12} />
                  {saatHata}
                </p>
              )}

              <button
                type="button"
                onClick={saatEkle}
                disabled={!yeniSaat}
                className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors"
              >
                <Plus size={16} />
                Zamanlama Ekle
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Clock size={15} className="text-gray-400" />
              Zamanlamalar
              <span className="text-gray-400 font-normal">({saatler.length})</span>
            </h3>

            {saatler.length === 0 ? (
              <div className="text-center py-14 bg-white border border-dashed border-gray-200 rounded-2xl">
                <CalendarClock size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-500">Henüz zamanlama yok</p>
                <p className="text-xs text-gray-400 mt-1">Örneğin 12:00 öğle — saatlik, 18:00 akşam — ikisi birden.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {siraliSaatler.map(s => (
                  <ZamanlamaKarti
                    key={s.id}
                    kayit={s}
                    duzenlemeModu={duzenlenenId === s.id}
                    duzenlemeSaat={editSaat}
                    duzenlemeTip={editTip}
                    duzenlemeHata={duzenlenenId === s.id ? editHata : null}
                    kaydediyor={editKaydediyor}
                    onDuzenleBaslat={() => duzenlemeBaslat(s)}
                    onDuzenleIptal={duzenlemeIptal}
                    onDuzenleKaydet={duzenlemeKaydet}
                    onSaatDegistir={v => { setEditSaat(v); setEditHata(null) }}
                    onTipDegistir={setEditTip}
                    onToggle={() => saatToggle(s)}
                    onSil={() => setSilinecekSaat(s)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ MESAJ SEKMESİ ══════════ */}
      {sekme === 'mesaj' && (
        <div className="grid lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 space-y-4">
            {(['genel', 'saatlik', 'uretim'] as const).map(grup => {
              const bolumler = SABLON_BOLUMLERI.filter(b => b.grup === grup)
              const grupEtiket = grup === 'genel' ? 'Genel' : grup === 'saatlik' ? 'Saatlik Takip' : 'Üretim Girişi'
              const grupRenk = grup === 'genel' ? 'teal' : grup === 'saatlik' ? 'blue' : 'amber'
              const hepsiAcik = bolumler.every(b => sablon[b.key])
              const hepsiKapali = bolumler.every(b => !sablon[b.key])

              return (
                <div key={grup} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        grupRenk === 'teal' ? 'bg-teal-500' : grupRenk === 'blue' ? 'bg-blue-500' : 'bg-amber-500',
                      )} />
                      <h4 className="text-sm font-semibold text-gray-800">{grupEtiket}</h4>
                    </div>
                    {grup !== 'genel' && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => grupTopluToggle(grup, true)}
                          disabled={hepsiAcik}
                          className="text-[10px] font-semibold px-2 py-1 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        >
                          Tümü
                        </button>
                        <button
                          type="button"
                          onClick={() => grupTopluToggle(grup, false)}
                          disabled={hepsiKapali}
                          className="text-[10px] font-semibold px-2 py-1 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        >
                          Hiçbiri
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {bolumler.map(b => {
                      const Icon = b.icon
                      const acik = sablon[b.key]
                      return (
                        <button
                          key={b.key}
                          type="button"
                          onClick={() => sablonToggle(b.key)}
                          className={cn(
                            'flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all',
                            acik
                              ? 'bg-teal-50/80 border-teal-200 ring-1 ring-teal-100'
                              : 'bg-gray-50/50 border-gray-100 hover:border-gray-200',
                          )}
                        >
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                            acik ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-400',
                          )}>
                            <Icon size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-sm font-medium', acik ? 'text-teal-900' : 'text-gray-600')}>
                              {b.label}
                            </p>
                            <p className="text-[11px] text-gray-400 truncate">{b.aciklama}</p>
                          </div>
                          <div className={cn(
                            'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
                            acik ? 'bg-teal-500 border-teal-500' : 'border-gray-300 bg-white',
                          )}>
                            {acik && <CheckCircle2 size={12} className="text-white" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => kaydet('mesaj')}
                disabled={kaydediyor || !ayar || !sablonDegisti}
                className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors shadow-sm"
              >
                {kaydediyor ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Bölümleri Kaydet
              </button>
              {sablonDegisti && (
                <span className="text-xs text-amber-600 font-medium">Kaydedilmemiş değişiklikler var</span>
              )}
            </div>
          </div>

          {/* Önizleme */}
          <div className="lg:col-span-2">
            <div className="sticky top-4">
              <div className="flex items-center gap-2 mb-3">
                <LayoutTemplate size={15} className="text-gray-400" />
                <h4 className="text-sm font-semibold text-gray-800">Mesaj Önizlemesi</h4>
              </div>
              <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
                <div className="bg-[#17212b] px-4 py-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
                    <Send size={14} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold leading-tight">Üretim Botu</p>
                    <p className="text-[#6c7a89] text-[11px]">bot</p>
                  </div>
                </div>
                <div className="bg-[#0e1621] p-4 min-h-[280px]">
                  <div className="bg-[#182533] rounded-2xl rounded-tl-sm px-4 py-3 max-w-full">
                    <pre className="text-[#e4ecf2] text-[11px] leading-relaxed whitespace-pre-wrap font-sans">
                      {onizlemeMetni(sablon) || 'Hiçbir bölüm seçilmedi.'}
                    </pre>
                    <p className="text-[#6c7a89] text-[10px] text-right mt-2">12:00 ✓✓</p>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-2 text-center">
                Örnek verilerle gösterim — gerçek rapor güncel verileri içerir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Yardım (gizlenebilir) ── */}
      <button
        type="button"
        onClick={() => setYardimAcik(v => !v)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors w-full justify-center py-2"
      >
        <Info size={13} />
        {yardimAcik ? 'Teknik bilgiyi gizle' : 'Otomatik gönderim nasıl çalışır?'}
      </button>
      {yardimAcik && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 leading-relaxed">
          Otomatik gönderim Supabase <strong>pg_cron</strong> ile her dakika kontrol edilir.
          Tanımlı saatlerde (Türkiye saati) ilgili rapor tipi Telegram'a iletilir.
          Aynı saat için günde yalnızca bir kez gönderim yapılır.
        </div>
      )}

      {silinecekSaat && (
        <ConfirmDialog
          baslik="Zamanlama silinsin mi?"
          mesaj={`${silinecekSaat.saat} saatindeki otomatik gönderim kaldırılacak.`}
          onayButon="Sil"
          onayRenk="red"
          yukleniyor={saatSiliniyor}
          onOnayla={saatSil}
          onKapat={() => !saatSiliniyor && setSilinecekSaat(null)}
        />
      )}
    </div>
  )
}
