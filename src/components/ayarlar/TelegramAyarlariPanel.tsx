import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Send, AlertCircle, Loader2, CheckCircle2, Eye, EyeOff, Clock, ToggleLeft, ToggleRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { TelegramAyarlari, TelegramRaporSaati } from '@/types/saatlikUretim'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function saatGecerliMi(saat: string): boolean {
  return /^\d{2}:\d{2}$/.test(saat) && (() => {
    const [h, m] = saat.split(':').map(Number)
    return h >= 0 && h <= 23 && m >= 0 && m <= 59
  })()
}

// ── Ana Panel ─────────────────────────────────────────────────────────────────

export default function TelegramAyarlariPanel() {
  const [ayar, setAyar] = useState<TelegramAyarlari | null>(null)
  const [saatler, setSaatler] = useState<TelegramRaporSaati[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediyor, setKaydediyor] = useState(false)
  const [testGonderiyor, setTestGonderiyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [basari, setBasari] = useState<string | null>(null)

  // Form state
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [aktif, setAktif] = useState(false)
  const [tokenGoster, setTokenGoster] = useState(false)

  // Yeni saat ekleme
  const [yeniSaat, setYeniSaat] = useState('')
  const [saatHata, setSaatHata] = useState<string | null>(null)
  const [silinecekSaat, setSilinecekSaat] = useState<TelegramRaporSaati | null>(null)
  const [saatSiliniyor, setSaatSiliniyor] = useState(false)

  // ── Veri yükle ───────────────────────────────────────────────────────────
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
        setAyar(ayarRes.data as TelegramAyarlari)
        setBotToken(ayarRes.data.bot_token ?? '')
        setChatId(ayarRes.data.chat_id ?? '')
        setAktif(ayarRes.data.aktif ?? false)
      }
      setSaatler((saatRes.data ?? []) as TelegramRaporSaati[])
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Veriler yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => { getir() }, [getir])

  // ── Ayarları kaydet ──────────────────────────────────────────────────────
  const kaydet = async () => {
    setKaydediyor(true)
    setHata(null)
    setBasari(null)
    try {
      if (!ayar) {
        // Kayıt yok — insert
        const { error } = await supabase
          .from('telegram_ayarlari')
          .insert([{ bot_token: botToken.trim(), chat_id: chatId.trim(), aktif }])
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('telegram_ayarlari')
          .update({ bot_token: botToken.trim(), chat_id: chatId.trim(), aktif })
          .eq('id', ayar.id)
        if (error) throw error
      }
      setBasari('Telegram ayarları kaydedildi.')
      setTimeout(() => setBasari(null), 3000)
      await getir()
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kayıt hatası')
    } finally {
      setKaydediyor(false)
    }
  }

  // ── Saat ekle ────────────────────────────────────────────────────────────
  const saatEkle = async () => {
    setSaatHata(null)
    if (!saatGecerliMi(yeniSaat)) {
      setSaatHata('Geçerli bir saat girin (ÖR: 08:00)')
      return
    }
    if (saatler.some(s => s.saat === yeniSaat)) {
      setSaatHata('Bu saat zaten eklenmiş.')
      return
    }
    const { error } = await supabase
      .from('telegram_rapor_saatleri')
      .insert([{ saat: yeniSaat, aktif: true }])
    if (error) { setSaatHata(error.message); return }
    setYeniSaat('')
    await getir()
  }

  // ── Saat sil ─────────────────────────────────────────────────────────────
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

  // ── Saat aktiflik toggle ─────────────────────────────────────────────────
  const saatToggle = async (s: TelegramRaporSaati) => {
    await supabase.from('telegram_rapor_saatleri').update({ aktif: !s.aktif }).eq('id', s.id)
    setSaatler(prev => prev.map(x => x.id === s.id ? { ...x, aktif: !x.aktif } : x))
  }

  // ── Test raporu gönder ───────────────────────────────────────────────────
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
        setBasari('Test raporu başarıyla gönderildi!')
        setTimeout(() => setBasari(null), 4000)
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Test gönderimi başarısız')
    } finally {
      setTestGonderiyor(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (yukleniyor) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
        <Loader2 size={16} className="animate-spin" />
        Yükleniyor…
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* ── Bildirimler ── */}
      {basari && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={15} className="shrink-0" />
          {basari}
        </div>
      )}
      {hata && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          {hata}
        </div>
      )}

      {/* ── Bot Ayarları ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Bot Bağlantısı</h3>
          {/* Aktif / Pasif toggle */}
          <button
            type="button"
            onClick={() => setAktif(v => !v)}
            className={`flex items-center gap-2 text-sm font-medium transition-colors ${aktif ? 'text-teal-600' : 'text-gray-400'}`}
          >
            {aktif
              ? <ToggleRight size={24} className="text-teal-500" />
              : <ToggleLeft size={24} />}
            {aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Telegram Bot Token'ı ve Chat ID'yi girin. Bot'u oluşturmak için{' '}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="text-teal-600 hover:underline"
          >
            @BotFather
          </a>
          'ı kullanın. Chat ID için{' '}
          <a
            href="https://t.me/userinfobot"
            target="_blank"
            rel="noreferrer"
            className="text-teal-600 hover:underline"
          >
            @userinfobot
          </a>
          'tan alabilirsiniz.
        </p>

        {/* Bot Token */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bot Token</label>
          <div className="relative">
            <input
              type={tokenGoster ? 'text' : 'password'}
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="123456789:ABCDEFghijklmno..."
              autoComplete="off"
              className="w-full px-3 py-2 pr-9 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono"
            />
            <button
              type="button"
              onClick={() => setTokenGoster(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {tokenGoster ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            Bu değeri aynı zamanda Supabase → Edge Functions → Secrets'a{' '}
            <code className="bg-gray-100 px-1 rounded text-gray-600">TELEGRAM_BOT_TOKEN</code> olarak eklemeyi unutmayın.
          </p>
        </div>

        {/* Chat ID */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Chat ID</label>
          <input
            type="text"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder="-100123456789"
            autoComplete="off"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Grup chat ID'si genellikle negatif bir sayıdır (örn: -100123456789).
          </p>
        </div>

        {/* Kaydet + Test */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={kaydet}
            disabled={kaydediyor}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {kaydediyor ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {kaydediyor ? 'Kaydediliyor…' : 'Kaydet'}
          </button>

          <button
            type="button"
            onClick={testGonder}
            disabled={testGonderiyor || !botToken.trim() || !chatId.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testGonderiyor ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {testGonderiyor ? 'Gönderiliyor…' : 'Test Raporu Gönder'}
          </button>
        </div>
      </div>

      {/* ── Rapor Saatleri ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Otomatik Rapor Saatleri</h3>
          <p className="text-xs text-gray-500">
            Bu saatlerde (Türkiye saatiyle) Telegram'a otomatik rapor gönderilir.
            pg_cron her dakika Edge Function'ı çalıştırır; saat eşleştiğinde rapor iletilir.
          </p>
        </div>

        {/* Yeni saat ekle */}
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <input
              type="time"
              value={yeniSaat}
              onChange={e => { setYeniSaat(e.target.value); setSaatHata(null) }}
              onKeyDown={e => e.key === 'Enter' && saatEkle()}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            {saatHata && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle size={11} />
                {saatHata}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={saatEkle}
            disabled={!yeniSaat}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            <Plus size={14} />
            Ekle
          </button>
        </div>

        {/* Saat listesi */}
        {saatler.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            Henüz rapor saati eklenmemiş.
          </div>
        ) : (
          <div className="space-y-2">
            {saatler.map(s => (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  s.aktif ? 'bg-teal-50 border-teal-200' : 'bg-gray-50 border-gray-200 opacity-60'
                }`}
              >
                <Clock size={15} className={s.aktif ? 'text-teal-600' : 'text-gray-400'} />
                <span className={`font-mono font-semibold text-sm flex-1 ${s.aktif ? 'text-teal-800' : 'text-gray-500'}`}>
                  {s.saat}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.aktif ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.aktif ? 'Aktif' : 'Pasif'}
                </span>
                <button
                  type="button"
                  onClick={() => saatToggle(s)}
                  title={s.aktif ? 'Pasife al' : 'Aktif et'}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                >
                  {s.aktif ? <ToggleRight size={16} className="text-teal-500" /> : <ToggleLeft size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => setSilinecekSaat(s)}
                  title="Sil"
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {silinecekSaat && (
        <ConfirmDialog
          baslik="Rapor saati silinsin mi?"
          mesaj={`${silinecekSaat.saat} rapor saati silinecek.`}
          onayButon="Sil"
          onayRenk="red"
          yukleniyor={saatSiliniyor}
          onOnayla={saatSil}
          onKapat={() => !saatSiliniyor && setSilinecekSaat(null)}
        />
      )}

      {/* ── Kurulum Notu ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-xs text-amber-800 space-y-2">
        <p className="font-semibold flex items-center gap-1.5">
          <AlertCircle size={13} />
          pg_cron Kurulum Hatırlatıcısı
        </p>
        <p>
          Otomatik gönderim için Supabase Dashboard → Database → Extensions bölümünden{' '}
          <strong>pg_net</strong> ve <strong>pg_cron</strong> aktif olmalı; ardından{' '}
          migration dosyasındaki SQL'i SQL Editor'da çalıştırmanız gerekiyor.
        </p>
        <p>
          Edge Function secret:{' '}
          <code className="bg-amber-100 px-1 rounded">TELEGRAM_BOT_TOKEN</code> →{' '}
          Dashboard → Edge Functions → check-and-send-report → Secrets
        </p>
      </div>
    </div>
  )
}
