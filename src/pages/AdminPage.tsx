import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck, Settings, ClipboardCheck, Database,
  Eye, ChevronRight, ArrowLeft, Loader2, AlertCircle,
  RefreshCw, Calendar,
  User, Truck, Factory, FileDown, Trash2, StickyNote, X,
  Printer, Users, Target, MessageSquare, Send,
  Pencil, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { bugunTarih, formatSaatTr, formatTarihTr, tarihEkleTr } from '@/lib/tarih'
import { useAyarlar } from '@/hooks/useAyarlar'
import EtiketAyarlariPanel from '@/components/ayarlar/EtiketAyarlariPanel'
import AraclarPanel from '@/components/ayarlar/AraclarPanel'
import PersonelYonetimiPanel from '@/components/ayarlar/PersonelYonetimiPanel'
import HedefVardiyaPanel from '@/components/ayarlar/HedefVardiyaPanel'
import AksiyonNotuPresetsPanel from '@/components/ayarlar/AksiyonNotuPresetsPanel'
import TelegramAyarlariPanel from '@/components/ayarlar/TelegramAyarlariPanel'
import IstasyonYonetimiPanel from '@/components/ayarlar/IstasyonYonetimiPanel'
import OptiExportAyarlariPanel from '@/components/ayarlar/OptiExportAyarlariPanel'
import VeriYonetimiPanel from '@/components/admin/VeriYonetimiPanel'
import type { EtiketAyarlari } from '@/types/ayarlar'

// ── Ayar görünürlük anahtarı ──────────────────────────────────────────────────
const GORUNUM_ANAHTAR = 'admin_ayarlar_gorunum'

type AyarKategori = 'etiket' | 'araclar' | 'personel' | 'hedef' | 'presets' | 'telegram' | 'istasyon' | 'opti'
type AdminTab = 'ayarlar' | 'uretim-giris' | 'veri-yonetimi'

interface GorunumAyarlari {
  etiket: boolean
  araclar: boolean
  personel: boolean
  hedef: boolean
  presets: boolean
  telegram: boolean
  istasyon: boolean
  opti: boolean
}

const VARSAYILAN_GORUNUM: GorunumAyarlari = {
  etiket: true, araclar: true, personel: true,
  hedef: true, presets: true, telegram: true, istasyon: true, opti: true,
}

interface AyarKategoriTanim {
  id: AyarKategori
  label: string
  aciklama: string
  icon: React.ElementType
  renk: string
  ikonRenk: string
  ikonRenkRaw: string
}

const KATEGORILER: AyarKategoriTanim[] = [
  { id: 'etiket',   label: 'Etiket Basım',              aciklama: 'Yazıcı bağlantısı, etiket boyutu ve DPL şablonu ayarları.', icon: Printer,       renk: 'bg-blue-50 border-blue-200',   ikonRenk: 'text-blue-600 bg-blue-100',    ikonRenkRaw: 'text-blue-600' },
  { id: 'araclar',  label: 'Araçlar',                   aciklama: 'Sevkiyat planlamada kullanılan şirket araçlarını yönet.',    icon: Truck,         renk: 'bg-orange-50 border-orange-200', ikonRenk: 'text-orange-600 bg-orange-100', ikonRenkRaw: 'text-orange-600' },
  { id: 'personel', label: 'Personel Yönetimi',         aciklama: 'Üretim personelini ekle, düzenle, aktif/pasif yap.',        icon: Users,         renk: 'bg-violet-50 border-violet-200', ikonRenk: 'text-violet-600 bg-violet-100', ikonRenkRaw: 'text-violet-600' },
  { id: 'hedef',    label: 'Hedef & Vardiya',            aciklama: 'Vardiya şablonları ve saatlik üretim hedefleri.',           icon: Target,        renk: 'bg-rose-50 border-rose-200',   ikonRenk: 'text-rose-600 bg-rose-100',    ikonRenkRaw: 'text-rose-600' },
  { id: 'presets',  label: 'Aksiyon Notu Hazır Cevaplar', aciklama: 'Saatlik takipte hızlı not eklemek için hazır cevaplar.', icon: MessageSquare, renk: 'bg-sky-50 border-sky-200',     ikonRenk: 'text-sky-600 bg-sky-100',      ikonRenkRaw: 'text-sky-600' },
  { id: 'telegram', label: 'Telegram Raporu',            aciklama: 'Bot token, rapor saatleri, mesaj bölümleri ve rapor tipi.', icon: Send,          renk: 'bg-teal-50 border-teal-200',   ikonRenk: 'text-teal-600 bg-teal-100',    ikonRenkRaw: 'text-teal-600' },
  { id: 'istasyon', label: 'Üretim İstasyonları',        aciklama: 'Operatör giriş formundaki istasyonları düzenle.',           icon: Factory,       renk: 'bg-amber-50 border-amber-200', ikonRenk: 'text-amber-600 bg-amber-100',  ikonRenkRaw: 'text-amber-600' },
  { id: 'opti',     label: 'Opti Export',                aciklama: 'PerfectCut IMP sayacı, çıta düşme ve stok FAM kodları.', icon: FileDown,      renk: 'bg-lime-50 border-lime-200',   ikonRenk: 'text-lime-700 bg-lime-100',    ikonRenkRaw: 'text-lime-700' },
]

// ── Üretim girişi tipleri ──────────────────────────────────────────────────────
interface GunlukRapor {
  id: string
  tarih: string
  toplam_personel: number
  notlar: string | null
  created_at: string
  updated_at: string
  operator: { ad_soyad: string } | null
  istasyon_kayitlari: {
    id: string
    adet: number
    fire_adet: number
    istasyon: { ad: string; sira_no: number } | null
  }[]
  arac_yuklemeleri: {
    id: string
    adet: number
    dis_arac_plakasi: string | null
    dis_arac_adi: string | null
    arac: { plaka: string; ad: string } | null
  }[]
}

// ── Yardımcı ──────────────────────────────────────────────────────────────────
const formatTarih = formatTarihTr
const formatSaat = formatSaatTr
const bugunStr = bugunTarih
const tarihEkle = tarihEkleTr

// ── Gruplama yardımcıları ──────────────────────────────────────────────────────
interface GunRaporu {
  tarih: string
  kayitlar: GunlukRapor[]
}

function grupla(data: GunlukRapor[]): GunRaporu[] {
  const map = new Map<string, GunlukRapor[]>()
  data.forEach(r => {
    if (!map.has(r.tarih)) map.set(r.tarih, [])
    map.get(r.tarih)!.push(r)
  })
  return Array.from(map.entries())
    .map(([tarih, kayitlar]) => ({ tarih, kayitlar }))
    .sort((a, b) => b.tarih.localeCompare(a.tarih))
}

function istasyonlariGetir(gunler: GunRaporu[]): { ad: string; sira: number }[] {
  const map = new Map<string, number>()
  gunler.forEach(g =>
    g.kayitlar.forEach(k =>
      k.istasyon_kayitlari.forEach(s => {
        if (s.istasyon && !map.has(s.istasyon.ad))
          map.set(s.istasyon.ad, s.istasyon.sira_no)
      })
    )
  )
  return Array.from(map.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([ad, sira]) => ({ ad, sira }))
}

function istasyonGun(g: GunRaporu, ad: string) {
  let adet = 0, fire = 0
  g.kayitlar.forEach(k =>
    k.istasyon_kayitlari.forEach(s => {
      if (s.istasyon?.ad === ad) { adet += s.adet; fire += s.fire_adet }
    })
  )
  return { adet, fire }
}

function operatorlerGun(g: GunRaporu): { ad: string; count: number }[] {
  const map = new Map<string, number>()
  g.kayitlar.forEach(k => {
    const ad = k.operator?.ad_soyad ?? 'Bilinmiyor'
    map.set(ad, (map.get(ad) ?? 0) + 1)
  })
  return Array.from(map.entries()).map(([ad, count]) => ({ ad, count }))
}

function toplamPersonelGun(g: GunRaporu) {
  return g.kayitlar.reduce((s, k) => Math.max(s, k.toplam_personel), 0)
}

function araclarGun(g: GunRaporu): string {
  const map = new Map<string, number>()
  g.kayitlar.forEach(k =>
    k.arac_yuklemeleri.forEach(y => {
      const ad = y.arac?.plaka ?? y.dis_arac_plakasi ?? '?'
      map.set(ad, (map.get(ad) ?? 0) + y.adet)
    })
  )
  return Array.from(map.entries()).map(([p, a]) => `${p}: ${a}`).join(', ')
}

// ── Excel (SpreadsheetML → .xls) ──────────────────────────────────────────────
function xlsIndir(
  gunler: GunRaporu[],
  istasyonlar: { ad: string; sira: number }[],
  mod: 'birlesik' | 'ayri',
  baslangic: string,
  bitis: string,
) {
  function cell(v: string | number, bold = false) {
    const tip = typeof v === 'number' ? 'Number' : 'String'
    const bold_s = bold ? ' ss:StyleID="bold"' : ''
    return `<Cell${bold_s}><Data ss:Type="${tip}">${String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Data></Cell>`
  }
  function row(...cells: string[]) { return `<Row>${cells.join('')}</Row>` }

  const istAdlar = istasyonlar.map(s => s.ad)
  const basliklar = mod === 'birlesik'
    ? ['Tarih', 'Operatörler', 'Personel', ...istAdlar.flatMap(a => [a, `${a} Fire`]), 'Araçlar', 'Notlar']
    : ['Tarih', 'Operatör', 'Giriş No', 'Personel', ...istAdlar.flatMap(a => [a, `${a} Fire`]), 'Araçlar', 'Not']

  let rows = row(...basliklar.map(h => cell(h, true)))

  if (mod === 'birlesik') {
    gunler.forEach(g => {
      const ops = operatorlerGun(g).map(o => o.count > 1 ? `${o.ad} (x${o.count})` : o.ad).join(', ')
      const istCells = istAdlar.flatMap(ad => {
        const { adet, fire } = istasyonGun(g, ad)
        return [cell(adet || ''), cell(fire || '')]
      })
      rows += row(cell(formatTarih(g.tarih)), cell(ops), cell(toplamPersonelGun(g)), ...istCells,
        cell(araclarGun(g)), cell(g.kayitlar.map(k => k.notlar ?? '').filter(Boolean).join(' | ')))
    })
  } else {
    gunler.forEach(g => {
      g.kayitlar.forEach((k, i) => {
        const istCells = istAdlar.flatMap(ad => {
          const s = k.istasyon_kayitlari.find(x => x.istasyon?.ad === ad)
          return [cell(s?.adet ?? ''), cell(s?.fire_adet ?? '')]
        })
        const aracStr = k.arac_yuklemeleri.map(y => `${y.arac?.plaka ?? y.dis_arac_plakasi ?? '?'}: ${y.adet}`).join(', ')
        rows += row(cell(i === 0 ? formatTarih(g.tarih) : ''), cell(k.operator?.ad_soyad ?? 'Bilinmiyor'),
          cell(i + 1), cell(k.toplam_personel), ...istCells, cell(aracStr), cell(k.notlar ?? ''))
      })
    })
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>\
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\
<Styles><Style ss:ID="bold"><Font ss:Bold="1"/></Style></Styles>\
<Worksheet ss:Name="Üretim Girişleri ${baslangic} - ${bitis}"><Table>${rows}</Table></Worksheet></Workbook>`

  const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `uretim_giris_${baslangic}_${bitis}.xls`
  a.click()
  URL.revokeObjectURL(url)
}

// ╔══════════════════════════════════════════════════════════════════════════════
// ║ TAB 1: Ayarlar Yönetimi
// ╚══════════════════════════════════════════════════════════════════════════════

function GorunurlukModal({
  gorunum,
  kaydediyor,
  onToggle,
  onKapat,
}: {
  gorunum: GorunumAyarlari
  kaydediyor: boolean
  onToggle: (id: AyarKategori) => void
  onKapat: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onKapat() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Eye size={15} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Ayarlar Sayfası Görünürlük</h3>
              <p className="text-xs text-gray-500">Seçili olanlar <strong>/ayarlar</strong> sayfasında gösterilir</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onKapat}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <ChevronRight size={16} className="rotate-180" />
          </button>
        </div>

        {/* Liste */}
        <div className="px-4 py-3 space-y-1 max-h-[60vh] overflow-y-auto">
          {KATEGORILER.map(({ id, label, icon: Icon, ikonRenk }) => {
            const aktif = gorunum[id]
            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggle(id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left ${
                  aktif ? 'hover:bg-gray-50' : 'opacity-50 hover:bg-gray-50 hover:opacity-80'
                }`}
              >
                {/* Checkbox */}
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                  aktif ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'
                }`}>
                  {aktif && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ikonRenk}`}>
                  <Icon size={14} />
                </div>
                <span className="text-sm font-medium text-gray-800">{label}</span>
              </button>
            )
          })}
        </div>

        {/* Altta kayıt durumu + kapat */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            {kaydediyor
              ? <><Loader2 size={12} className="animate-spin" /> Kaydediliyor…</>
              : <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Otomatik kaydediliyor</>
            }
          </div>
          <button
            type="button"
            onClick={onKapat}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  )
}

function AyarlarYonetimiTab() {
  const [gorunum, setGorunum] = useState<GorunumAyarlari>(VARSAYILAN_GORUNUM)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediyor, setKaydediyor] = useState(false)
  const [modalAcik, setModalAcik] = useState(false)
  const [aktifPanel, setAktifPanel] = useState<AyarKategori | null>(null)
  const { etiketAyarlari, kaydediyor: etiketKaydediyor, hata: etiketHata, etiketAyarlariGuncelle } = useAyarlar()

  // Görünürlük ayarlarını yükle
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('ayarlar')
          .select('deger')
          .eq('anahtar', GORUNUM_ANAHTAR)
          .maybeSingle()
        if (data?.deger) setGorunum({ ...VARSAYILAN_GORUNUM, ...(data.deger as Partial<GorunumAyarlari>) })
      } catch (err) {
        console.error('Görünürlük ayarları yüklenmedi:', err)
      } finally {
        setYukleniyor(false)
      }
    })()
  }, [])

  const toggle = useCallback(async (id: AyarKategori) => {
    const yeni = { ...gorunum, [id]: !gorunum[id] }
    setGorunum(yeni)
    setKaydediyor(true)
    await supabase
      .from('ayarlar')
      .upsert({ anahtar: GORUNUM_ANAHTAR, deger: yeni as unknown as Record<string, unknown> }, { onConflict: 'anahtar' })
    setKaydediyor(false)
  }, [gorunum])

  // Panel görünümü
  if (aktifPanel) {
    return (
      <AyarlarPanelGorunum
        kategori={aktifPanel}
        etiketAyarlari={etiketAyarlari}
        etiketKaydediyor={etiketKaydediyor}
        etiketHata={etiketHata}
        etiketAyarlariGuncelle={etiketAyarlariGuncelle}
        onGeri={() => setAktifPanel(null)}
      />
    )
  }

  // Görünürlük ayarları yüklenene kadar grid'i gösterme
  if (yukleniyor) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Yükleniyor…
      </div>
    )
  }

  const gizliSayisi = KATEGORILER.filter(k => !gorunum[k.id]).length

  return (
    <>
      {modalAcik && (
        <GorunurlukModal
          gorunum={gorunum}
          kaydediyor={kaydediyor}
          onToggle={toggle}
          onKapat={() => setModalAcik(false)}
        />
      )}

      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Ayar Panelleri</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Bir paneli düzenlemek için kartına tıklayın.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalAcik(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Eye size={15} />
            Ayarlarda Görünürlük
            {gizliSayisi > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                {gizliSayisi} gizli
              </span>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {KATEGORILER.map(({ id, label, aciklama, icon: Icon, renk, ikonRenk }) => {
            return (
              <button
                key={id}
                type="button"
                onClick={() => setAktifPanel(id)}
                className={`relative flex items-start gap-3 p-5 rounded-xl border text-left transition-all group hover:shadow-sm ${renk}`}
              >
                <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${ikonRenk}`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm leading-tight">{label}</div>
                  <div className="text-xs text-gray-500 mt-1 leading-snug line-clamp-2">{aciklama}</div>
                </div>
                <ChevronRight size={15} className="shrink-0 text-gray-400 mt-0.5 group-hover:text-gray-600 transition-colors" />
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// Ayarlar panel router
function AyarlarPanelGorunum({
  kategori,
  etiketAyarlari,
  etiketKaydediyor,
  etiketHata,
  etiketAyarlariGuncelle,
  onGeri,
}: {
  kategori: AyarKategori
  etiketAyarlari: EtiketAyarlari
  etiketKaydediyor: boolean
  etiketHata: string | null
  etiketAyarlariGuncelle: (v: EtiketAyarlari) => Promise<boolean>
  onGeri: () => void
}) {
  const kat = KATEGORILER.find(k => k.id === kategori)!
  const Icon = kat.icon

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 px-8 py-4 border-b border-gray-200 bg-white shrink-0">
        <button
          type="button"
          onClick={onGeri}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Admin / Ayarlar
        </button>
        <span className="text-gray-300">/</span>
        <div className="flex items-center gap-2">
          <Icon size={16} className={kat.ikonRenkRaw} />
          <span className="text-sm font-semibold text-gray-900">{kat.label}</span>
        </div>
      </div>

      {/* İçerik */}
      {kategori === 'etiket' && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-8">
            <EtiketAyarlariPanel
              ayarlar={etiketAyarlari}
              kaydediyor={etiketKaydediyor}
              hata={etiketHata}
              onKaydet={etiketAyarlariGuncelle}
            />
          </div>
        </div>
      )}
      {kategori === 'araclar'  && <div className="flex-1 overflow-auto p-8"><AraclarPanel /></div>}
      {kategori === 'personel' && <div className="flex-1 overflow-auto p-8"><PersonelYonetimiPanel /></div>}
      {kategori === 'hedef'    && <div className="flex-1 overflow-auto p-8"><HedefVardiyaPanel /></div>}
      {kategori === 'presets'  && <div className="flex-1 overflow-auto p-8"><AksiyonNotuPresetsPanel /></div>}
      {kategori === 'telegram' && <div className="flex-1 overflow-auto p-8"><TelegramAyarlariPanel /></div>}
      {kategori === 'istasyon' && <div className="flex-1 overflow-auto p-8"><IstasyonYonetimiPanel /></div>}
      {kategori === 'opti'     && <div className="flex-1 overflow-auto p-8"><OptiExportAyarlariPanel /></div>}
    </div>
  )
}

// ╔══════════════════════════════════════════════════════════════════════════════
// ║ TAB 2: Üretim Girişi Kayıtları
// ╚══════════════════════════════════════════════════════════════════════════════

// ── Excel mod seçim modalı ────────────────────────────────────────────────────
function ExcelModModal({
  gunler, istasyonlar, baslangic, bitis, onKapat,
}: {
  gunler: GunRaporu[]
  istasyonlar: { ad: string; sira: number }[]
  baslangic: string
  bitis: string
  onKapat: () => void
}) {
  const [mod, setMod] = useState<'birlesik' | 'ayri'>('birlesik')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onKapat() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Excel'e Aktar</h3>
            <p className="text-xs text-gray-500 mt-0.5">{formatTarih(baslangic)} — {formatTarih(bitis)}</p>
          </div>
          <button type="button" onClick={onKapat} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-gray-600 mb-1">Birden fazla operatör aynı gün giriş yaptığında:</p>
          <button type="button" onClick={() => setMod('birlesik')}
            className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${mod === 'birlesik' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 ${mod === 'birlesik' ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'}`} />
            <div>
              <div className="font-semibold text-gray-900 text-sm">Günlük Toplam (Birleştirilmiş)</div>
              <div className="text-xs text-gray-500 mt-0.5">Aynı günün tüm girişleri toplanır. Bir satır = bir gün.</div>
            </div>
          </button>
          <button type="button" onClick={() => setMod('ayri')}
            className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${mod === 'ayri' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 ${mod === 'ayri' ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'}`} />
            <div>
              <div className="font-semibold text-gray-900 text-sm">Operatör Bazlı (Ayrı Satırlar)</div>
              <div className="text-xs text-gray-500 mt-0.5">Her giriş ayrı satır. Kimin ne girdiği görünür.</div>
            </div>
          </button>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button type="button" onClick={onKapat}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">İptal</button>
          <button type="button"
            onClick={() => { xlsIndir(gunler, istasyonlar, mod, baslangic, bitis); onKapat() }}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors">
            <FileDown size={14} /> İndir
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Gün Detay Modalı ─────────────────────────────────────────────────────────
interface EditForm {
  personel: number
  notlar: string
  istasyonlar: { id: string; ad: string; adet: number; fire_adet: number }[]
}

function GunDetayModal({
  gunRaporu,
  silinenId,
  onKapat,
  onSil,
  onGuncelle,
}: {
  gunRaporu: GunRaporu
  silinenId: string | null
  onKapat: () => void
  onSil: (id: string) => void
  onGuncelle: (rapor: GunlukRapor) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [kaydediyor, setKaydediyor] = useState(false)

  const editBaslat = (rapor: GunlukRapor) => {
    const sirali = [...rapor.istasyon_kayitlari].sort(
      (a, b) => (a.istasyon?.sira_no ?? 0) - (b.istasyon?.sira_no ?? 0),
    )
    setEditingId(rapor.id)
    setEditForm({
      personel: rapor.toplam_personel,
      notlar: rapor.notlar ?? '',
      istasyonlar: sirali.map(k => ({
        id: k.id,
        ad: k.istasyon?.ad ?? '—',
        adet: k.adet,
        fire_adet: k.fire_adet,
      })),
    })
  }

  const editIptal = () => { setEditingId(null); setEditForm(null) }

  const editKaydet = async (raporId: string) => {
    if (!editForm) return
    setKaydediyor(true)
    try {
      const { error: e1 } = await supabase
        .from('gunluk_uretim_raporlari')
        .update({ toplam_personel: editForm.personel, notlar: editForm.notlar || null })
        .eq('id', raporId)
      if (e1) throw e1

      for (const ist of editForm.istasyonlar) {
        const { error } = await supabase
          .from('gunluk_uretim_istasyon_kayitlari')
          .update({ adet: ist.adet, fire_adet: ist.fire_adet })
          .eq('id', ist.id)
        if (error) throw error
      }

      const { data, error: e2 } = await supabase
        .from('gunluk_uretim_raporlari')
        .select(`
          id, tarih, toplam_personel, notlar, created_at, updated_at,
          operator:operator_id ( ad_soyad ),
          istasyon_kayitlari:gunluk_uretim_istasyon_kayitlari (
            id, adet, fire_adet,
            istasyon:istasyon_id ( ad, sira_no )
          ),
          arac_yuklemeleri:gunluk_uretim_arac_yuklemeleri (
            id, adet, dis_arac_plakasi, dis_arac_adi,
            arac:arac_id ( plaka, ad )
          )
        `)
        .eq('id', raporId)
        .single()
      if (e2) throw e2

      onGuncelle(data as unknown as GunlukRapor)
      setEditingId(null)
      setEditForm(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Güncelleme başarısız.')
    } finally {
      setKaydediyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onKapat() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">{formatTarih(gunRaporu.tarih)} — Giriş Kayıtları</h3>
            <p className="text-xs text-gray-500 mt-0.5">{gunRaporu.kayitlar.length} giriş kaydı</p>
          </div>
          <button type="button" onClick={onKapat}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Kayıt listesi */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {gunRaporu.kayitlar.map((rapor, idx) => {
            const isEditing = editingId === rapor.id
            const sirali = [...rapor.istasyon_kayitlari].sort(
              (a, b) => (a.istasyon?.sira_no ?? 0) - (b.istasyon?.sira_no ?? 0),
            )
            return (
              <div key={rapor.id} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Kayıt başlığı */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-teal-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900 text-sm">
                        {rapor.operator?.ad_soyad ?? 'Bilinmiyor'}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {formatSaat(rapor.created_at)} · {rapor.toplam_personel} personel
                      </span>
                    </div>
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-1.5">
                      <button type="button"
                        onClick={() => editBaslat(rapor)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-xs font-medium">
                        <Pencil size={11} /> Düzenle
                      </button>
                      <button type="button"
                        disabled={silinenId === rapor.id}
                        onClick={() => {
                          const label = gunRaporu.kayitlar.length > 1
                            ? `${rapor.operator?.ad_soyad ?? 'bu kayıt'} girişini`
                            : `${formatTarih(rapor.tarih)} tarihli kaydı`
                          if (window.confirm(`${label} silmek istediğinize emin misiniz?`)) onSil(rapor.id)
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors text-xs font-medium disabled:opacity-40">
                        {silinenId === rapor.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Trash2 size={11} />} Sil
                      </button>
                    </div>
                  )}
                </div>

                {/* Kayıt içeriği */}
                <div className="px-4 py-3">
                  {isEditing && editForm ? (
                    <div className="space-y-4">
                      {/* Personel */}
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-medium text-gray-500 w-28 shrink-0">Toplam Personel</label>
                        <input
                          type="number" min={0}
                          value={editForm.personel}
                          onChange={e => setEditForm(f => f ? { ...f, personel: Number(e.target.value) } : f)}
                          className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      {/* İstasyon verileri */}
                      {editForm.istasyonlar.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Factory size={10} /> İstasyon Verileri
                          </p>
                          <div className="space-y-2">
                            {editForm.istasyonlar.map((ist, i) => (
                              <div key={ist.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                                <span className="text-sm font-medium text-gray-700 w-32 shrink-0 truncate">{ist.ad}</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <label className="text-xs text-gray-400">Adet</label>
                                  <input
                                    type="number" min={0}
                                    value={ist.adet}
                                    onChange={e => setEditForm(f => {
                                      if (!f) return f
                                      const ists = [...f.istasyonlar]
                                      ists[i] = { ...ists[i], adet: Number(e.target.value) }
                                      return { ...f, istasyonlar: ists }
                                    })}
                                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                                  />
                                  <label className="text-xs text-gray-400">Fire</label>
                                  <input
                                    type="number" min={0}
                                    value={ist.fire_adet}
                                    onChange={e => setEditForm(f => {
                                      if (!f) return f
                                      const ists = [...f.istasyonlar]
                                      ists[i] = { ...ists[i], fire_adet: Number(e.target.value) }
                                      return { ...f, istasyonlar: ists }
                                    })}
                                    className="w-20 px-2 py-1 text-sm border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Notlar */}
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Notlar</label>
                        <textarea
                          value={editForm.notlar}
                          onChange={e => setEditForm(f => f ? { ...f, notlar: e.target.value } : f)}
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                          placeholder="Not ekleyin…"
                        />
                      </div>
                      {/* Düzenleme butonları */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button type="button" onClick={editIptal}
                          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                          İptal
                        </button>
                        <button type="button"
                          disabled={kaydediyor}
                          onClick={() => editKaydet(rapor.id)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors">
                          {kaydediyor ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          Kaydet
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* İstasyon görünümü */}
                      {sirali.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Factory size={10} /> İstasyon Verileri
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {sirali.map(k => (
                              <div key={k.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                                <span className="text-xs font-medium text-gray-700 truncate mr-2">{k.istasyon?.ad ?? '—'}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-md px-2 py-0.5 text-xs">{k.adet}</span>
                                  {k.fire_adet > 0 && (
                                    <span className="font-bold text-red-600 bg-red-50 border border-red-200 rounded-md px-1.5 py-0.5 text-[10px]">🔥{k.fire_adet}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Araç görünümü */}
                      {rapor.arac_yuklemeleri.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Truck size={10} /> Araç Yükleme
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {rapor.arac_yuklemeleri.map(y => (
                              <span key={y.id} className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg">
                                <Truck size={9} /> {y.arac?.plaka ?? y.dis_arac_plakasi ?? '?'}: <strong className="ml-0.5">{y.adet}</strong>
                                {!y.arac && <span className="text-amber-500 ml-1">(Harici)</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Not görünümü */}
                      {rapor.notlar && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                            <StickyNote size={10} /> Not
                          </p>
                          <p className="text-xs text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            {rapor.notlar}
                          </p>
                        </div>
                      )}
                      {sirali.length === 0 && rapor.arac_yuklemeleri.length === 0 && !rapor.notlar && (
                        <p className="text-xs text-gray-400 text-center py-2">Detay bilgisi yok.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Alt buton */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 shrink-0 flex justify-end">
          <button type="button" onClick={onKapat}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}

const KISAYOLLAR = [
  { label: 'Son 1 Hafta', gun: 7 },
  { label: 'Son 1 Ay', gun: 30 },
  { label: 'Son 2 Ay', gun: 60 },
]

function UretimGirisiTab() {
  const [tumRaporlar, setTumRaporlar] = useState<GunlukRapor[]>([])
  const [gunler, setGunler] = useState<GunRaporu[]>([])
  const [istasyonlar, setIstasyonlar] = useState<{ ad: string; sira: number }[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [detayGunTarih, setDetayGunTarih] = useState<string | null>(null)
  const [excelModal, setExcelModal] = useState(false)
  const [silinenId, setSilinenId] = useState<string | null>(null)

  // Seçili günü güncel veriden türet — silme/güncelleme sonrası otomatik yenilenir
  const detayGun = detayGunTarih ? (gunler.find(g => g.tarih === detayGunTarih) ?? null) : null

  const [baslangic, setBaslangic] = useState<string>(tarihEkle(-14))
  const [bitis, setBitis] = useState<string>(bugunStr())

  const getir = useCallback(async (bas?: string, bit?: string) => {
    const b = bas ?? baslangic
    const e = bit ?? bitis
    setYukleniyor(true)
    setHata(null)
    try {
      const { data, error } = await supabase
        .from('gunluk_uretim_raporlari')
        .select(`
          id, tarih, toplam_personel, notlar, created_at, updated_at,
          operator:operator_id ( ad_soyad ),
          istasyon_kayitlari:gunluk_uretim_istasyon_kayitlari (
            id, adet, fire_adet,
            istasyon:istasyon_id ( ad, sira_no )
          ),
          arac_yuklemeleri:gunluk_uretim_arac_yuklemeleri (
            id, adet, dis_arac_plakasi, dis_arac_adi,
            arac:arac_id ( plaka, ad )
          )
        `)
        .gte('tarih', b)
        .lte('tarih', e)
        .order('tarih', { ascending: false })
      if (error) throw error
      const veri = (data ?? []) as unknown as GunlukRapor[]
      setTumRaporlar(veri)
      const gruplanmis = grupla(veri)
      setGunler(gruplanmis)
      setIstasyonlar(istasyonlariGetir(gruplanmis))
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Veriler yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }, [baslangic, bitis])

  // Sayfa açılınca son 2 haftayı otomatik yükle
  useEffect(() => { getir() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const kisayolSec = (gun: number) => {
    const yeniBas = tarihEkle(-gun)
    const yeniBit = bugunStr()
    setBaslangic(yeniBas)
    setBitis(yeniBit)
    getir(yeniBas, yeniBit)
  }

  const sil = useCallback(async (id: string) => {
    setSilinenId(id)
    try {
      const { error } = await supabase.from('gunluk_uretim_raporlari').delete().eq('id', id)
      if (error) throw error
      const yeni = tumRaporlar.filter(r => r.id !== id)
      setTumRaporlar(yeni)
      const gruplanmis = grupla(yeni)
      setGunler(gruplanmis)
      setIstasyonlar(istasyonlariGetir(gruplanmis))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Silme başarısız.')
    } finally {
      setSilinenId(null)
    }
  }, [tumRaporlar])

  const guncelleRapor = useCallback((guncelRapor: GunlukRapor) => {
    const yeni = tumRaporlar.map(r => r.id === guncelRapor.id ? guncelRapor : r)
    setTumRaporlar(yeni)
    const gruplanmis = grupla(yeni)
    setGunler(gruplanmis)
    setIstasyonlar(istasyonlariGetir(gruplanmis))
  }, [tumRaporlar])

  return (
    <div className="flex flex-col h-full">
      {detayGun && (
        <GunDetayModal
          gunRaporu={detayGun}
          silinenId={silinenId}
          onKapat={() => setDetayGunTarih(null)}
          onSil={sil}
          onGuncelle={guncelleRapor}
        />
      )}
      {excelModal && (
        <ExcelModModal gunler={gunler} istasyonlar={istasyonlar}
          baslangic={baslangic} bitis={bitis} onKapat={() => setExcelModal(false)} />
      )}

      {/* Filtre çubuğu */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Başlangıç Tarihi</label>
            <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Bitiş Tarihi</label>
            <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <button type="button" onClick={() => getir()} disabled={yukleniyor}
            className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors">
            {yukleniyor ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Raporları Getir
          </button>
          <div className="ml-auto flex items-center gap-2">
            {!yukleniyor && gunler.length > 0 && (
              <span className="text-xs text-gray-500">{gunler.length} gün · {tumRaporlar.length} giriş</span>
            )}
            {gunler.length > 0 && (
              <button type="button" onClick={() => setExcelModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors">
                <FileDown size={14} /> Excel İndir
              </button>
            )}
          </div>
        </div>
        {/* Kısayollar */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Hızlı seçim:</span>
          {KISAYOLLAR.map(k => (
            <button key={k.gun} type="button" onClick={() => kisayolSec(k.gun)}
              className="px-3 py-1 text-xs font-medium border border-gray-300 rounded-full text-gray-600 hover:bg-gray-100 hover:border-gray-400 transition-colors">
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tablo */}
      <div className="flex-1 overflow-auto">
        {yukleniyor && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Yükleniyor…
          </div>
        )}
        {hata && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl mx-6 mt-6 px-4 py-3">
            <AlertCircle size={15} /> {hata}
          </div>
        )}
        {!yukleniyor && !hata && gunler.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <Calendar size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Kayıt bulunamadı.</p>
            <p className="text-xs mt-1 text-gray-400">Tarihleri seçip "Raporları Getir"e basın.</p>
          </div>
        )}
        {!yukleniyor && !hata && gunler.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Tarih</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Operatör(ler)</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Pers.</th>
                  {istasyonlar.map(s => (
                    <th key={s.ad} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{s.ad}</th>
                  ))}
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Araçlar</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notlar</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {gunler.map(g => {
                  const ops = operatorlerGun(g)
                  const pers = toplamPersonelGun(g)
                  const tumNotlar = g.kayitlar.map(k => k.notlar).filter(Boolean)
                  const tumAraclar = g.kayitlar.flatMap(k => k.arac_yuklemeleri)

                  return (
                    <tr key={g.tarih} className="border-b border-gray-100 hover:bg-amber-50/30 align-top">
                      {/* Tarih */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-bold text-amber-600">{formatTarih(g.tarih)}</span>
                        {g.kayitlar.length > 1 && (
                          <div className="text-[10px] text-gray-400 mt-0.5">{g.kayitlar.length} giriş</div>
                        )}
                      </td>
                      {/* Operatörler */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ops.map(op => (
                            <span key={op.ad}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-800 text-xs font-semibold rounded-full whitespace-nowrap">
                              <User size={9} /> {op.ad}
                              {op.count > 1 && <span className="bg-teal-600 text-white text-[9px] font-bold rounded-full px-1 leading-tight">x{op.count}</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                      {/* Personel */}
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 font-bold text-xs">{pers}</span>
                      </td>
                      {/* Dinamik istasyon sütunları */}
                      {istasyonlar.map(s => {
                        const { adet, fire } = istasyonGun(g, s.ad)
                        return (
                          <td key={s.ad} className="px-3 py-3 text-center">
                            {adet > 0 ? (
                              <div className="inline-flex flex-col items-center gap-1">
                                <span className="font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-lg px-3 py-1 text-sm min-w-[2.5rem] text-center leading-tight">{adet}</span>
                                {fire > 0 && <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-0.5 leading-tight">🔥 {fire}</span>}
                              </div>
                            ) : <span className="text-gray-300 text-sm">—</span>}
                          </td>
                        )
                      })}
                      {/* Araçlar */}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {tumAraclar.length === 0
                            ? <span className="text-gray-300 text-xs">—</span>
                            : tumAraclar.map(y => (
                              <span key={y.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg whitespace-nowrap">
                                <Truck size={9} /> {y.arac?.plaka ?? y.dis_arac_plakasi ?? '?'}: {y.adet}
                              </span>
                            ))
                          }
                        </div>
                      </td>
                      {/* Notlar */}
                      <td className="px-3 py-3 max-w-[160px]">
                        {tumNotlar.length === 0
                          ? <span className="text-gray-300 text-xs">—</span>
                          : <span className="inline-flex items-start gap-1 text-xs text-gray-600">
                              <StickyNote size={11} className="text-amber-400 shrink-0 mt-0.5" />
                              <span className="truncate" title={tumNotlar.join(' | ')}>{tumNotlar.join(' | ')}</span>
                            </span>
                        }
                      </td>
                      {/* İşlemler */}
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center">
                          <button type="button"
                            title={`${formatTarih(g.tarih)} — ${g.kayitlar.length} giriş kaydı`}
                            onClick={() => setDetayGunTarih(g.tarih)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-xs font-medium">
                            <Eye size={13} />
                            {g.kayitlar.length > 1 && (
                              <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 leading-tight">
                                {g.kayitlar.length}
                              </span>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
// ╔══════════════════════════════════════════════════════════════════════════════
// ║ ANA SAYFA
// ╚══════════════════════════════════════════════════════════════════════════════

const TABS: { id: AdminTab; label: string; icon: React.ElementType; aciklama: string }[] = [
  { id: 'ayarlar',       label: 'Ayarlar Yönetimi',        icon: Settings,       aciklama: 'Tüm ayar panelleri ve /ayarlar sayfası görünürlük kontrolü' },
  { id: 'uretim-giris',  label: 'Üretim Girişi Kayıtları', icon: ClipboardCheck, aciklama: 'Operatörler tarafından girilen günlük üretim raporları' },
  { id: 'veri-yonetimi', label: 'Veri Yönetimi',           icon: Database,       aciklama: 'Batch ve sipariş kayıtlarını kalıcı silme' },
]

interface AdminGirisModalProps {
  onGirisBasarili: () => void
  onCikis: () => void
}

function AdminGirisModal({ onGirisBasarili, onCikis }: AdminGirisModalProps) {
  const [sifre, setSifre] = useState('')
  const [hata, setHata] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)

  const dogru_sifre = 'xxx'

  const handleSifreKontrol = async (e: React.FormEvent) => {
    e.preventDefault()
    setHata('')
    setYukleniyor(true)

    setTimeout(() => {
      if (sifre === dogru_sifre) {
        onGirisBasarili()
        setSifre('')
      } else {
        setHata('Hatalı şifre. Lütfen tekrar deneyin.')
        setSifre('')
      }
      setYukleniyor(false)
    }, 300)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Başlık */}
        <div className="px-6 py-6 border-b border-gray-200 bg-gradient-to-r from-indigo-500 to-purple-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Admin Paneli</h2>
              <p className="text-xs text-white/80">Giriş yapabilmek için şifre gereklidir</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSifreKontrol} className="px-6 py-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Şifre
            </label>
            <input
              type="password"
              value={sifre}
              onChange={e => {
                setSifre(e.target.value)
                if (hata) setHata('')
              }}
              placeholder="Şifrenizi girin"
              disabled={yukleniyor}
              autoFocus
              className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                hata
                  ? 'border-red-300 bg-red-50 focus:ring-red-400'
                  : 'border-gray-300 focus:ring-indigo-400'
              }`}
            />
          </div>

          {hata && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <p className="text-sm text-red-700">{hata}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!sifre || yukleniyor}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-all"
          >
            {yukleniyor ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Kontrol ediliyor…
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                Giriş Yap
              </>
            )}
          </button>
        </form>

        {/* Kapat butonu */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            type="button"
            onClick={onCikis}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [aktifTab, setAktifTab] = useState<AdminTab>('ayarlar')
  const [girisYapildi, setGirisYapildi] = useState(false)

  if (!girisYapildi) {
    return (
      <AdminGirisModal
        onGirisBasarili={() => setGirisYapildi(true)}
        onCikis={() => {
          window.history.back()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sayfa başlığı */}
      <div className="px-8 py-5 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Admin Paneli</h1>
            <p className="text-xs text-gray-500">Sistem yönetimi ve raporlama merkezi</p>
          </div>
        </div>

        {/* Tab navigasyonu */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAktifTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                aktifTab === id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab içeriği */}
      <div className="flex-1 overflow-auto flex flex-col min-h-0">
        {aktifTab === 'ayarlar'        && <AyarlarYonetimiTab />}
        {aktifTab === 'uretim-giris'   && <UretimGirisiTab />}
        {aktifTab === 'veri-yonetimi'  && <VeriYonetimiPanel />}
      </div>
    </div>
  )
}
