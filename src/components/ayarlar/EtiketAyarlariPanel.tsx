import { useState, useEffect, useMemo } from 'react'
import {
  Save, Printer, Wifi, RefreshCw, ChevronDown, ChevronUp,
  Info, Tag, LayoutTemplate, Settings2, X, ZoomIn,
} from 'lucide-react'
import type { EtiketAyarlari, EtiketVeri } from '@/types/ayarlar'
import { dplUret } from '@/types/ayarlar'

interface Props {
  ayarlar: EtiketAyarlari
  kaydediyor: boolean
  hata: string | null
  onKaydet: (yeni: EtiketAyarlari) => Promise<boolean>
  onFormChange?: (f: EtiketAyarlari) => void
}

/* ── Örnek veri (dışarıdan da kullanılabilir) ────────────────────────────── */

export const ORNEK_VERI: EtiketVeri = {
  cam_kodu: 'GLS-0042',
  musteri: 'NOVEL — AKYOL LOUNGE',
  genislik_mm: 600,
  yukseklik_mm: 400,
  sira_no: 7,
  siparis_no: 'SIP-2026-0123',
}

/* ── Checkbox satırı ─────────────────────────────────────────────────────── */

function IcerikSatiri({
  label, kontrol, onChange,
}: { label: string; kontrol: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group py-1.5">
      <input
        type="checkbox"
        checked={kontrol}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
    </label>
  )
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

/* ── Etiket içerik render (paylaşımlı) ───────────────────────────────────── */

function EtiketIcerik({ ic, veri, scale }: {
  ic: EtiketAyarlari['icerik']
  veri: EtiketVeri
  scale: number
}) {
  return (
    <div
      className="absolute inset-0 p-2 flex flex-col gap-0.5"
      style={{ fontSize: Math.max(scale * 1.8, 7) }}
    >
      {ic.barkod && (
        <div className="flex gap-px mb-1" style={{ height: scale * 8 }}>
          {Array.from({ length: 48 }).map((_, i) => (
            <div
              key={i}
              className="bg-black"
              style={{ width: i % 3 === 0 ? 2 : 1, opacity: i % 5 === 0 ? 0.25 : 1 }}
            />
          ))}
        </div>
      )}
      {ic.cam_kodu && (
        <div className="font-bold leading-tight truncate" style={{ fontSize: Math.max(scale * 2.2, 8) }}>
          {veri.cam_kodu}
        </div>
      )}
      {ic.boyut && (
        <div className="leading-tight truncate text-gray-700">
          {veri.genislik_mm} × {veri.yukseklik_mm} mm
        </div>
      )}
      {ic.musteri_adi && (
        <div className="leading-tight truncate text-gray-600">
          {veri.musteri}
        </div>
      )}
      {ic.sira_no && veri.sira_no !== null && (
        <div className="leading-tight truncate text-gray-500">
          SIRA: {veri.sira_no}
        </div>
      )}
      {ic.siparis_no && (
        <div className="leading-tight truncate text-gray-500">
          {veri.siparis_no}
        </div>
      )}
      {ic.tarih && (
        <div className="leading-tight truncate text-gray-400">
          {new Date().toLocaleDateString('tr-TR')}
        </div>
      )}
    </div>
  )
}

/* ── Etiket Önizlemesi (dışa aktarılır) ──────────────────────────────────── */

export function EtiketOnizleme({ ayarlar, veri }: { ayarlar: EtiketAyarlari; veri: EtiketVeri }) {
  const [buyuk, setBuyuk] = useState(false)
  const ic = ayarlar.icerik

  const maxW = 280
  const scale = Math.min(maxW / ayarlar.boyut.genislik_mm, 7)
  const w = ayarlar.boyut.genislik_mm * scale
  const h = ayarlar.boyut.yukseklik_mm * scale

  const bigMaxW = 560
  const bigScale = Math.min(bigMaxW / ayarlar.boyut.genislik_mm, 14)
  const bigW = ayarlar.boyut.genislik_mm * bigScale
  const bigH = ayarlar.boyut.yukseklik_mm * bigScale

  return (
    <>
      <div className="flex flex-col items-center gap-3">
        <p className="text-xs font-medium text-gray-500 tracking-wide uppercase">Önizleme</p>
        <p className="text-xs text-gray-400">
          {ayarlar.boyut.genislik_mm} × {ayarlar.boyut.yukseklik_mm} mm
        </p>
        {/* Küçük önizleme — tıklanabilir */}
        <button
          type="button"
          onClick={() => setBuyuk(true)}
          title="Büyütmek için tıklayın"
          className="relative group border-2 border-gray-300 bg-white rounded shadow-md overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-400"
          style={{ width: w, height: h, fontFamily: 'monospace' }}
        >
          <EtiketIcerik ic={ic} veri={veri} scale={scale} />
          {/* hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 drop-shadow transition-opacity" />
          </div>
        </button>
        <p className="text-xs text-gray-400 italic">— tıklayarak büyütün —</p>
      </div>

      {/* Modal */}
      {buyuk && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
          onClick={() => setBuyuk(false)}
        >
          <div
            className="relative flex flex-col items-center gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <p className="text-white text-sm font-medium">
                {ayarlar.boyut.genislik_mm} × {ayarlar.boyut.yukseklik_mm} mm — örnek veri
              </p>
              <button
                type="button"
                onClick={() => setBuyuk(false)}
                className="text-white/70 hover:text-white transition-colors ml-6"
              >
                <X size={20} />
              </button>
            </div>
            <div
              className="border-2 border-white/30 bg-white rounded-lg shadow-2xl overflow-hidden relative"
              style={{ width: bigW, height: bigH, fontFamily: 'monospace' }}
            >
              <EtiketIcerik ic={ic} veri={veri} scale={bigScale} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── Ana bileşen ─────────────────────────────────────────────────────────── */

export default function EtiketAyarlariPanel({ ayarlar, kaydediyor, hata, onKaydet, onFormChange }: Props) {
  const [form, setForm] = useState<EtiketAyarlari>(ayarlar)
  const [bolumler, setBolumler] = useState({
    yazici: true,
    boyut: true,
    icerik: true,
    yazdirma: true,
    gelismis: false,
  })

  // Canlı form değişikliklerini üst bileşene bildir
  useEffect(() => {
    onFormChange?.(form)
  }, [form, onFormChange])
  const [basarili, setBasarili] = useState(false)

  function toggle(b: keyof typeof bolumler) {
    setBolumler(prev => ({ ...prev, [b]: !prev[b] }))
  }

  function setYazici(key: keyof typeof form.yazici, val: string | number) {
    setForm(f => ({ ...f, yazici: { ...f.yazici, [key]: val } }))
  }

  function setBoyut(key: keyof typeof form.boyut, val: number) {
    setForm(f => ({ ...f, boyut: { ...f.boyut, [key]: val } }))
  }

  function setIcerik(key: keyof typeof form.icerik, val: boolean) {
    setForm(f => ({ ...f, icerik: { ...f.icerik, [key]: val } }))
  }

  async function handleKaydet() {
    const ok = await onKaydet(form)
    if (ok) {
      setBasarili(true)
      setTimeout(() => setBasarili(false), 3000)
    }
  }

  const dplCiktisi = useMemo(() => dplUret(form, ORNEK_VERI), [form])

  return (
    <div className="space-y-3 max-w-xl">
      {/* Yazıcı Bağlantısı */}
      <Bolum icon={Wifi} baslik="Yazıcı Bağlantısı" acik={bolumler.yazici} onToggle={() => toggle('yazici')}>
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex gap-2 text-xs text-blue-700">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              Datamax M-Serisi yazıcınızın ağ IP adresini girin. Yazdırma işlemi için
              bilgisayarda <strong>QZ Tray</strong> veya benzeri bir yerel baskı köprüsü
              çalışıyor olmalıdır.
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">IP Adresi</label>
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
        </div>
      </Bolum>

      {/* Etiket Boyutu */}
      <Bolum icon={Tag} baslik="Etiket Boyutu" acik={bolumler.boyut} onToggle={() => toggle('boyut')}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Genişlik (mm)</label>
            <input
              type="number"
              value={form.boyut.genislik_mm}
              onChange={e => setBoyut('genislik_mm', Number(e.target.value))}
              min={20}
              max={300}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Yükseklik (mm)</label>
            <input
              type="number"
              value={form.boyut.yukseklik_mm}
              onChange={e => setBoyut('yukseklik_mm', Number(e.target.value))}
              min={20}
              max={300}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Yazıcınızdaki kağıt/etiket boyutuna göre ayarlayın (Datamax M-serisi için tipik: 100×50 mm).
        </p>
      </Bolum>

      {/* Etiket İçeriği */}
      <Bolum icon={LayoutTemplate} baslik="Etiket İçeriği" acik={bolumler.icerik} onToggle={() => toggle('icerik')}>
        <div className="space-y-0.5">
          <IcerikSatiri label="Barkod (Code 128 — cam kodu)" kontrol={form.icerik.barkod} onChange={v => setIcerik('barkod', v)} />
          <IcerikSatiri label="Cam Kodu (GLS-XXXX)" kontrol={form.icerik.cam_kodu} onChange={v => setIcerik('cam_kodu', v)} />
          <IcerikSatiri label="Boyut (Genişlik × Yükseklik mm)" kontrol={form.icerik.boyut} onChange={v => setIcerik('boyut', v)} />
          <IcerikSatiri label="Müşteri Adı" kontrol={form.icerik.musteri_adi} onChange={v => setIcerik('musteri_adi', v)} />
          <IcerikSatiri label="Sıra Numarası" kontrol={form.icerik.sira_no} onChange={v => setIcerik('sira_no', v)} />
          <IcerikSatiri label="Sipariş Numarası" kontrol={form.icerik.siparis_no} onChange={v => setIcerik('siparis_no', v)} />
          <IcerikSatiri label="Baskı Tarihi" kontrol={form.icerik.tarih} onChange={v => setIcerik('tarih', v)} />
        </div>
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
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2 text-xs text-amber-700">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              Boş bırakırsanız yukarıdaki ayarlardan otomatik DPL komutu üretilir.
              Değişkenler: <code className="bg-amber-100 px-0.5 rounded">{'{cam_kodu}'}</code>{' '}
              <code className="bg-amber-100 px-0.5 rounded">{'{musteri}'}</code>{' '}
              <code className="bg-amber-100 px-0.5 rounded">{'{boyut}'}</code>{' '}
              <code className="bg-amber-100 px-0.5 rounded">{'{sira_no}'}</code>{' '}
              <code className="bg-amber-100 px-0.5 rounded">{'{siparis_no}'}</code>{' '}
              <code className="bg-amber-100 px-0.5 rounded">{'{tarih}'}</code>
            </span>
          </div>
          <textarea
            rows={6}
            placeholder={"Özel DPL şablonu (boş = otomatik)"}
            value={form.dpl_sablonu}
            onChange={e => setForm(f => ({ ...f, dpl_sablonu: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <details className="group">
            <summary className="text-xs text-blue-600 cursor-pointer hover:underline flex items-center gap-1">
              <RefreshCw size={12} /> Otomatik üretilen DPL çıktısını göster
            </summary>
            <pre className="mt-2 p-3 bg-gray-900 text-green-400 text-xs rounded-lg overflow-x-auto whitespace-pre-wrap">
              {dplCiktisi
                .replace(/\x02/g, '<STX>')
                .replace(/\r\n/g, '↵\n')
              }
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
