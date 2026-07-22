import { useState, useEffect, useMemo } from 'react'
import {
  Save, Printer, Wifi, RefreshCw, ChevronDown, ChevronUp,
  Info, Settings2, Crosshair, MousePointer2,
  Send, CheckCircle2, AlertCircle, FlaskConical, Ruler,
} from 'lucide-react'
import type { EtiketAlanAnahtari, EtiketAyarlari } from '@/types/ayarlar'
import {
  dplKonumKalibrasyonUret,
  dplMetinOlcekTestiUret,
  dplUret,
  etiketAyarlariBirlestir,
  etiketYerlesimUyarilari,
} from '@/types/ayarlar'
import EtiketYerlesimEditor from '@/components/ayarlar/EtiketYerlesimEditor'
import { ETIKET_ALAN_META } from '@/lib/etiketAlanlari'
import { ORNEK_ETIKET_VERI } from '@/lib/etiketOrnek'
import { etiketDplKopruyeGonder } from '@/lib/etiketBasim'

const VARSAYILAN_KOPRU_PORT = 9876

const BOLUMLER_STORAGE_KEY = 'etiket-ayarlari-bolumler'

const VARSAYILAN_BOLUMLER = {
  yazici: true,
  yerlesim: true,
  yazdirma: false,
  gelismis: false,
  test: true,
} as const

type BolumlerState = typeof VARSAYILAN_BOLUMLER

function bolumlerOku(): BolumlerState {
  try {
    const raw = localStorage.getItem(BOLUMLER_STORAGE_KEY)
    if (!raw) return { ...VARSAYILAN_BOLUMLER }
    const parsed = JSON.parse(raw) as Partial<BolumlerState>
    return {
      yazici: typeof parsed.yazici === 'boolean' ? parsed.yazici : VARSAYILAN_BOLUMLER.yazici,
      yerlesim: typeof parsed.yerlesim === 'boolean' ? parsed.yerlesim : VARSAYILAN_BOLUMLER.yerlesim,
      yazdirma: typeof parsed.yazdirma === 'boolean' ? parsed.yazdirma : VARSAYILAN_BOLUMLER.yazdirma,
      gelismis: typeof parsed.gelismis === 'boolean' ? parsed.gelismis : VARSAYILAN_BOLUMLER.gelismis,
      test: typeof parsed.test === 'boolean' ? parsed.test : VARSAYILAN_BOLUMLER.test,
    }
  } catch {
    return { ...VARSAYILAN_BOLUMLER }
  }
}

function bolumlerKaydet(state: BolumlerState) {
  try {
    localStorage.setItem(BOLUMLER_STORAGE_KEY, JSON.stringify(state))
  } catch { /* localStorage kullanılamıyor */ }
}

interface Props {
  ayarlar: EtiketAyarlari
  kaydediyor: boolean
  hata: string | null
  onKaydet: (yeni: EtiketAyarlari) => Promise<boolean>
  onFormChange?: (f: EtiketAyarlari) => void
}

/* ── Bölüm başlığı ───────────────────────────────────────────────────────── */

function Bolum({
  icon: Icon, baslik, children, acik, onToggle,
}: {
  icon: React.ElementType
  baslik: string
  children: React.ReactNode
  acik: boolean
  onToggle: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2 font-medium text-gray-800">
          <Icon size={16} className="text-blue-600" />
          {baslik}
        </div>
        {acik ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
      </button>
      {acik && <div className="px-4 py-4 bg-white">{children}</div>}
    </div>
  )
}

/* ── Etiket Önizlemesi (dışa aktarılır) ──────────────────────────────────── */

/* ── Ana bileşen ─────────────────────────────────────────────────────────── */

export default function EtiketAyarlariPanel({ ayarlar, kaydediyor, hata, onKaydet, onFormChange }: Props) {
  const [form, setForm] = useState<EtiketAyarlari>(() => etiketAyarlariBirlestir(ayarlar))
  const [seciliAlan, setSeciliAlan] = useState<EtiketAlanAnahtari | null>(null)
  const [bolumler, setBolumler] = useState<BolumlerState>(bolumlerOku)

  const [testGonderiyor, setTestGonderiyor] = useState(false)
  const [testSonucu, setTestSonucu] = useState<{ basarili: boolean; mesaj: string } | null>(null)
  const [basarili, setBasarili] = useState(false)
  const [dogrulamaHatasi, setDogrulamaHatasi] = useState<string | null>(null)

  const [yazicilarYukleniyor, setYazicilarYukleniyor] = useState(false)
  const [yaziciListesi, setYaziciListesi] = useState<Array<{ Name: string; PortName: string; Tip?: string }> | null>(null)
  const [yaziciListeHata, setYaziciListeHata] = useState<string | null>(null)

  useEffect(() => {
    setForm(etiketAyarlariBirlestir(ayarlar))
  }, [ayarlar])

  async function handleYaziciListele() {
    if (!form.yazici.kopru_adresi.trim()) {
      setYaziciListeHata('Önce köprü sunucu adresini girin.')
      return
    }
    setYazicilarYukleniyor(true)
    setYaziciListesi(null)
    setYaziciListeHata(null)
    const kopruHost = form.yazici.kopru_adresi.trim()
    const kopruPort = form.yazici.kopru_port ?? VARSAYILAN_KOPRU_PORT
    try {
      const url = `http://${kopruHost}:${kopruPort}/yazicilar`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.hata ?? `Köprü HTTP ${res.status}`)
      }
      if (!data || !Array.isArray(data.yazicilar)) {
        throw new Error('Geçersiz yanıt — köprü dosyası güncel mi?')
      }
      if (data.hata) {
        throw new Error(String(data.hata))
      }
      if (data.yazicilar.length === 0) {
        const ek = [
          data.ham ? `PS: ${String(data.ham).slice(0, 120)}` : '',
          data.stderr ? `stderr: ${String(data.stderr).slice(0, 120)}` : '',
        ].filter(Boolean).join(' | ')
        setYaziciListeHata(
          `Hiç yazıcı/USB portu bulunamadı (${kopruHost}:${kopruPort}).`
          + (ek ? ` ${ek}` : '')
          + ' Datamax USB ise alana USB001 yazıp test edebilirsiniz.',
        )
      } else {
        setYaziciListesi(data.yazicilar)
      }
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : 'Listelenemiyor.'
      const ag = mesaj.includes('fetch') || mesaj.includes('Failed') || mesaj.includes('abort')
      setYaziciListeHata(
        ag
          ? `Köprüye ulaşılamıyor (${kopruHost}:${kopruPort}). Köprü o bilgisayarda çalışıyor mu? Ayarlarda IP yazıcı PC'nin adresi mi (localhost değil)?`
          : mesaj,
      )
    } finally {
      setYazicilarYukleniyor(false)
    }
  }

  async function kopruDplGonder(dpl: string, basariMesaji: string) {
    setTestGonderiyor(true)
    setTestSonucu(null)
    try {
      const sonuc = await etiketDplKopruyeGonder(form, dpl, 10000)
      setTestSonucu({
        basarili: sonuc.durum === 'yaziciya_gonderildi',
        mesaj: sonuc.durum === 'yaziciya_gonderildi' ? (sonuc.mesaj || basariMesaji) : sonuc.mesaj,
      })
    } finally {
      setTestGonderiyor(false)
    }
  }

  async function guvenliTestGonder(uret: () => string, basariMesaji: string) {
    try {
      await kopruDplGonder(uret(), basariMesaji)
    } catch (e) {
      setTestSonucu({ basarili: false, mesaj: e instanceof Error ? e.message : 'DPL üretilemedi.' })
    }
  }

  async function handleKalibrasyonTesti() {
    await guvenliTestGonder(() => dplKonumKalibrasyonUret(form), 'Konum kalibrasyon etiketi gönderildi.')
  }

  async function handleMetinTesti() {
    await guvenliTestGonder(() => dplMetinOlcekTestiUret(form), '1×1, 2×2 ve 3×3 metin testi gönderildi.')
  }

  async function handleBarkodTesti() {
    await guvenliTestGonder(
      () => dplUret(form, ORNEK_ETIKET_VERI, { sadece_alan: 'barkod', paneli_zorla: true }),
      'Paneldeki barkod ayarlarıyla test gönderildi.',
    )
  }

  async function handleSeciliAlanTesti() {
    if (!seciliAlan) return
    await guvenliTestGonder(
      () => dplUret(form, ORNEK_ETIKET_VERI, { sadece_alan: seciliAlan, paneli_zorla: true }),
      `${ETIKET_ALAN_META[seciliAlan].baslik} alan testi gönderildi.`,
    )
  }

  async function handleTestBaski() {
    if (dplSonucu.hata) {
      setTestSonucu({ basarili: false, mesaj: dplSonucu.hata })
      return
    }
    await kopruDplGonder(dplSonucu.dpl, 'Tam etiket testi başarıyla gönderildi.')
  }

  // Canlı form değişikliklerini üst bileşene bildir
  useEffect(() => {
    onFormChange?.(form)
  }, [form, onFormChange])

  function toggle(b: keyof BolumlerState) {
    setBolumler(prev => {
      const next = { ...prev, [b]: !prev[b] }
      bolumlerKaydet(next)
      return next
    })
  }

  function setYazici(key: keyof typeof form.yazici, val: string | number) {
    setForm(f => ({ ...f, yazici: { ...f.yazici, [key]: val } }))
  }

  async function handleKaydet() {
    const hatalar = etiketYerlesimUyarilari(form, ORNEK_ETIKET_VERI).filter(uyari => uyari.seviye === 'hata')
    if (hatalar.length) {
      setDogrulamaHatasi(hatalar.map(uyari => uyari.mesaj).join(' '))
      return
    }
    if (dplSonucu.hata) {
      setDogrulamaHatasi(dplSonucu.hata)
      return
    }
    setDogrulamaHatasi(null)
    const ok = await onKaydet(form)
    if (ok) {
      setBasarili(true)
      setTimeout(() => setBasarili(false), 3000)
    }
  }

  const dplSonucu = useMemo(() => {
    try {
      return { dpl: dplUret(form, ORNEK_ETIKET_VERI), hata: null as string | null }
    } catch (e) {
      return { dpl: '', hata: e instanceof Error ? e.message : 'DPL üretilemedi.' }
    }
  }, [form])

  return (
    <div className="max-w-6xl space-y-4">
      {/* Yazıcı Bağlantısı */}
      <Bolum icon={Wifi} baslik="Yazıcı Bağlantısı" acik={bolumler.yazici} onToggle={() => toggle('yazici')}>
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex gap-2 text-xs text-blue-700">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              Yazıcının bağlı olduğu bilgisayarda <strong>node yazici-kopru.js</strong> çalıştırın.<br />
              • <strong>USB yazıcı:</strong> Köprü Sunucu Adresi + Windows Yazıcı Adı yeterli.<br />
              • <strong>Ağ yazıcısı:</strong> Köprü Sunucu Adresi + Yazıcı IP + Port kullanın.
            </span>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Köprü Sunucu Adresi
              <span className="ml-1 font-normal text-gray-400">(yazici-kopru.js hangi bilgisayarda?)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="192.168.3.7 veya localhost"
                value={form.yazici.kopru_adresi}
                onChange={e => setYazici('kopru_adresi', e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                placeholder="Port"
                title="Köprü servisi portu (varsayılan 9876)"
                value={form.yazici.kopru_port ?? VARSAYILAN_KOPRU_PORT}
                onChange={e => setYazici('kopru_port', Number(e.target.value) || VARSAYILAN_KOPRU_PORT)}
                min={1}
                max={65535}
                className="w-24 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              yazici-kopru servisinin HTTP portu (varsayılan {VARSAYILAN_KOPRU_PORT}).
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Windows Yazıcı Adı
              <span className="ml-1 font-normal text-gray-400">(USB bağlı — önerilen)</span>
            </label>
            <input
              type="text"
              placeholder='Örn: USB001  veya  Kuyruk adı (aşağıdan listeleyin)'
              value={form.yazici.yazici_adi}
              onChange={e => setYazici('yazici_adi', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleYaziciListele}
                disabled={yazicilarYukleniyor}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={11} className={yazicilarYukleniyor ? 'animate-spin' : ''} />
                {yazicilarYukleniyor ? 'Yükleniyor…' : 'Yazıcıları Listele'}
              </button>
              <span className="text-xs text-gray-400">Köprüdeki yazıcı kuyrukları ve açık USB portları listelenir</span>
            </div>
            {yaziciListeHata && (
              <p className="mt-1 text-xs text-red-600">{yaziciListeHata}</p>
            )}
            {yaziciListesi && yaziciListesi.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium text-gray-600">Ad / Port</th>
                      <th className="text-left px-2 py-1.5 font-medium text-gray-600 w-16">Tür</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {yaziciListesi.map((y, i) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-blue-50">
                        <td className="px-2 py-1.5 text-gray-800">{y.Name}</td>
                        <td className="px-2 py-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${'Tip' in y && y.Tip === 'USB' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                            {'Tip' in y ? y.Tip : 'Kuyruk'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => { setYazici('yazici_adi', y.Name); setYaziciListesi(null) }}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Seç
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-1 text-xs text-gray-400">USB port (USB001 vb.) veya print queue adı girin — TCP/IP gerekmez.</p>
          </div>
          {!form.yazici.yazici_adi.trim() && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Yazıcı IP
                <span className="ml-1 font-normal text-gray-400">(köprüden görülen)</span>
              </label>
              <input
                type="text"
                placeholder="192.168.1.100"
                value={form.yazici.ip_adresi}
                onChange={e => setYazici('ip_adresi', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
              <input
                type="number"
                value={form.yazici.port}
                onChange={e => setYazici('port', Number(e.target.value))}
                min={1}
                max={65535}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          )}
        </div>
      </Bolum>

      {/* Hassas etiket yerleşimi */}
      <Bolum icon={Crosshair} baslik="Hassas Etiket Yerleşimi" acik={bolumler.yerlesim} onToggle={() => toggle('yerlesim')}>
        <EtiketYerlesimEditor
          ayarlar={form}
          veri={ORNEK_ETIKET_VERI}
          onChange={setForm}
          onKaliciDegistir={async yeniAyarlar => {
            setForm(yeniAyarlar)
            return onKaydet(yeniAyarlar)
          }}
          seciliAlan={seciliAlan}
          onSeciliAlanChange={setSeciliAlan}
        />
      </Bolum>

      {/* Yazdırma Koşulu */}
      <Bolum icon={Settings2} baslik="Yazdırma Koşulu" acik={bolumler.yazdirma} onToggle={() => toggle('yazdirma')}>
        <div className="space-y-2">
          {(
            [
              { val: 'otomatik', label: 'Otomatik', aciklama: 'Poz girişinde barkod okunduğunda etiket anında basılır' },
              { val: 'manuel', label: 'Manuel', aciklama: 'Her cam için ayrı "Yazdır" butonu ile tetiklenir' },
            ] as const
          ).map(({ val, label, aciklama }) => (
            <label key={val} className="flex items-start gap-3 cursor-pointer group">
              <input
                type="radio"
                name="yazdirma_kosulu"
                value={val}
                checked={form.yazdirma_kosulu === val}
                onChange={() => setForm(f => ({ ...f, yazdirma_kosulu: val }))}
                className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-800">{label}</span>
                <p className="text-xs text-gray-500">{aciklama}</p>
              </div>
            </label>
          ))}
        </div>
      </Bolum>

      {/* Gelişmiş: DPL Şablonu */}
      <Bolum icon={Printer} baslik="Gelişmiş — DPL Şablonu" acik={bolumler.gelismis} onToggle={() => toggle('gelismis')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setForm(current => ({ ...current, dpl_modu: 'panel' }))}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${form.dpl_modu === 'panel' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-800'}`}
            >
              Görsel paneli kullan
            </button>
            <button
              type="button"
              onClick={() => setForm(current => ({ ...current, dpl_modu: 'ozel' }))}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${form.dpl_modu === 'ozel' ? 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-200' : 'text-gray-500 hover:text-gray-800'}`}
            >
              Uzman DPL şablonu
            </button>
          </div>

          {form.dpl_modu === 'ozel' ? (
            <>
              <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span><strong>Görsel panel devre dışı.</strong> Tam etiket ve üretim baskısı aşağıdaki ham şablonu kullanır. Eski/bozuk bir şablon tam etiketin boş çıkmasına neden olabilir.</span>
              </div>
              <div className="text-xs text-gray-600">
                Değişkenler: <code className="rounded bg-gray-100 px-1">{'{cam_kodu}'}</code>{' '}
                <code className="rounded bg-gray-100 px-1">{'{cam_tipi}'}</code>{' '}
                <code className="rounded bg-gray-100 px-1">{'{cari_adi}'}</code>{' '}
                <code className="rounded bg-gray-100 px-1">{'{alt_musteri}'}</code>{' '}
                <code className="rounded bg-gray-100 px-1">{'{siparis_no}'}</code>{' '}
                <code className="rounded bg-gray-100 px-1">{'{poz}'}</code>{' '}
                <code className="rounded bg-gray-100 px-1">{'{liste_adedi}'}</code>{' '}
                <code className="rounded bg-gray-100 px-1">{'{batch_sira}'}</code>{' '}
                <code className="rounded bg-gray-100 px-1">{'{boyut}'}</code>{' '}
                <code className="rounded bg-gray-100 px-1">{'{tarih}'}</code>
              </div>
              <textarea
                rows={10}
                placeholder={"Örnek (Datamax M-4206):\n\\x02L\\r\nH10\\r\nD22\\r\nm\\r\n122200000500050{cam_kodu}\\r\nQ0001\\r\nE\\r"}
                value={form.dpl_sablonu}
                onChange={e => setForm(f => ({ ...f, dpl_sablonu: e.target.value }))}
                className="w-full rounded-lg border border-amber-300 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-amber-200"
              />
            </>
          ) : (
            <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              <span>Hassas yerleşim panelindeki X/Y, font, barkod ve kalibrasyon değerleri doğrudan DPL'ye dönüştürülüyor.</span>
            </div>
          )}

          <details className="group">
            <summary className="text-xs text-blue-600 cursor-pointer hover:underline flex items-center gap-1">
              <RefreshCw size={12} /> Şu anda gönderilecek DPL çıktısını göster
            </summary>
            <pre className="mt-2 p-3 bg-gray-900 text-green-400 text-xs rounded-lg overflow-x-auto whitespace-pre-wrap">
              {dplSonucu.hata
                ? `HATA: ${dplSonucu.hata}`
                : dplSonucu.dpl.split('\x02').join('<STX>').replace(/\r/g, '↵\n')}
            </pre>
          </details>
        </div>
      </Bolum>

      {/* Test Baskısı */}
      <Bolum icon={FlaskConical} baslik="Test Baskısı" acik={bolumler.test} onToggle={() => toggle('test')}>
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex gap-2 text-xs text-blue-700">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              Önerilen sıra: konum kalibrasyonu → metin ölçekleri → barkod → seçili alan → tam etiket.
              İlk dört test görsel paneli zorunlu kullanır; tam etiket seçili DPL modunu kullanır.<br />
              Köprü: <strong>{form.yazici.kopru_adresi || '—'}:{form.yazici.kopru_port ?? VARSAYILAN_KOPRU_PORT}</strong>
              {' → '}
              Yazıcı: <strong>{form.yazici.yazici_adi || form.yazici.ip_adresi || '—'}</strong>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleKalibrasyonTesti}
              disabled={testGonderiyor}
              className="flex items-center gap-2 rounded-lg border border-blue-400 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
            >
              <Ruler size={13} />
              {testGonderiyor ? 'Gönderiliyor…' : '1. Konum Kalibrasyonu'}
            </button>
            <button
              type="button"
              onClick={handleMetinTesti}
              disabled={testGonderiyor}
              className="flex items-center gap-2 px-3 py-2 border border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <FlaskConical size={13} />
              {testGonderiyor ? 'Gönderiliyor…' : '2. Metin Ölçekleri'}
            </button>
            <button
              type="button"
              onClick={handleBarkodTesti}
              disabled={testGonderiyor}
              className="flex items-center gap-2 px-3 py-2 border border-orange-400 text-orange-700 bg-orange-50 hover:bg-orange-100 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <FlaskConical size={13} />
              {testGonderiyor ? 'Gönderiliyor…' : '3. Barkod Testi'}
            </button>
            <button
              type="button"
              onClick={handleSeciliAlanTesti}
              disabled={testGonderiyor || !seciliAlan}
              className="flex items-center gap-2 rounded-lg border border-violet-400 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
            >
              <MousePointer2 size={13} />
              {testGonderiyor ? 'Gönderiliyor…' : seciliAlan ? `4. Seçili: ${ETIKET_ALAN_META[seciliAlan].kisa}` : '4. Seçili alan yok'}
            </button>
            <button
              type="button"
              onClick={handleTestBaski}
              disabled={testGonderiyor}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {testGonderiyor
                ? <RefreshCw size={15} className="animate-spin" />
                : <Send size={15} />}
              {testGonderiyor ? 'Gönderiliyor…' : `5. Tam Etiket (${form.dpl_modu === 'ozel' ? 'özel DPL' : 'panel'})`}
            </button>
          </div>

          {testSonucu && (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm border ${
              testSonucu.basarili
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {testSonucu.basarili
                ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
              <span>{testSonucu.mesaj}</span>
            </div>
          )}

          <details className="group">
            <summary className="text-xs text-blue-600 cursor-pointer hover:underline flex items-center gap-1">
              <RefreshCw size={12} /> Gönderilecek DPL komutunu göster
            </summary>
            <pre className="mt-2 p-3 bg-gray-900 text-green-400 text-xs rounded-lg overflow-x-auto whitespace-pre-wrap">
              {dplSonucu.hata
                ? `HATA: ${dplSonucu.hata}`
                : dplSonucu.dpl.split('\x02').join('<STX>').replace(/\r/g, '↵\n')}
            </pre>
          </details>
        </div>
      </Bolum>

      {/* Hata / Başarı */}
      {hata && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {hata}
        </div>
      )}
      {dogrulamaHatasi && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{dogrulamaHatasi}</span>
        </div>
      )}
      {basarili && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Ayarlar kaydedildi.
        </div>
      )}

      {/* Kaydet butonu */}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleKaydet}
          disabled={kaydediyor}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {kaydediyor ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          {kaydediyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  )
}
