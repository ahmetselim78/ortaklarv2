import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ShieldCheck, Settings, ClipboardCheck, Database, LayoutDashboard,
  Eye, ChevronRight, ChevronDown, ArrowLeft, Loader2, AlertCircle,
  RefreshCw, Calendar,
  User, Truck, Factory, FileDown, Trash2, StickyNote, X,
  Printer, Users, Target, MessageSquare, Send,
  Pencil, Check,
  ScrollText, Bug, UserCog, KeyRound, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { bugunTarih, formatSaatTr, formatTarihTr, tarihEkleTr } from '@/lib/tarih'
import { useAyarlar } from '@/hooks/useAyarlar'
import EtiketAyarlariPanel from '@/components/ayarlar/EtiketAyarlariPanel'
import AraclarPanel from '@/components/ayarlar/AraclarPanel'
import HedefVardiyaPanel from '@/components/ayarlar/HedefVardiyaPanel'
import AksiyonNotuPresetsPanel from '@/components/ayarlar/AksiyonNotuPresetsPanel'
import TelegramAyarlariPanel from '@/components/ayarlar/TelegramAyarlariPanel'
import IstasyonYonetimiPanel from '@/components/ayarlar/IstasyonYonetimiPanel'
import OptiExportAyarlariPanel from '@/components/ayarlar/OptiExportAyarlariPanel'
import VeriYonetimiPanel from '@/components/admin/VeriYonetimiPanel'
import AuditKayitlariPanel from '@/components/admin/AuditKayitlariPanel'
import HataKayitlariPanel from '@/components/admin/HataKayitlariPanel'
import RolYonetimiPanel from '@/components/admin/RolYonetimiPanel'
import KullaniciYonetimiPanel from '@/components/admin/KullaniciYonetimiPanel'
import AdminOverview from '@/components/admin/AdminOverview'
import type { EtiketAyarlari } from '@/types/ayarlar'

// ── Ayar görünürlük anahtarı ──────────────────────────────────────────────────
const GORUNUM_ANAHTAR = 'admin_ayarlar_gorunum'

type AyarKategori = 'etiket' | 'araclar' | 'hedef' | 'presets' | 'telegram' | 'istasyon' | 'opti'

interface GorunumAyarlari {
  etiket: boolean
  araclar: boolean
  hedef: boolean
  presets: boolean
  telegram: boolean
  istasyon: boolean
  opti: boolean
}

const VARSAYILAN_GORUNUM: GorunumAyarlari = {
  etiket: true, araclar: true,
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

function operatorlerGun(g: GunRaporu): { ad: string; count: number; saatler: string[] }[] {
  const map = new Map<string, { count: number; saatler: string[] }>()
  const siraliKayitlar = [...g.kayitlar]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  siraliKayitlar.forEach(k => {
    const ad = k.operator?.ad_soyad ?? 'Bilinmiyor'
    const mevcut = map.get(ad) ?? { count: 0, saatler: [] }
    map.set(ad, {
      count: mevcut.count + 1,
      saatler: [...mevcut.saatler, formatSaat(k.created_at)],
    })
  })
  return Array.from(map.entries()).map(([ad, { count, saatler }]) => ({ ad, count, saatler }))
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

// ── Excel (.xlsx) ─────────────────────────────────────────────────────────────
// Testte üretilen dosyayı tekrar açıp gerçek XLSX yapısını doğrulamak için dışa aktarılır.
// eslint-disable-next-line react-refresh/only-export-components
export async function xlsxIndir(
  gunler: GunRaporu[],
  istasyonlar: { ad: string; sira: number }[],
  mod: 'birlesik' | 'ayri',
  baslangic: string,
  bitis: string,
) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ortaklar Cam Yönetim Sistemi'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(mod === 'birlesik' ? 'Günlük Toplamlar' : 'Operatör Girişleri', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  function tarihDegeri(tarih: string): Date {
    const [yil, ay, gun] = tarih.split('-').map(Number)
    return new Date(Date.UTC(yil, ay - 1, gun))
  }

  function saatDegeri(zaman: string): Date {
    const [saat, dakika] = formatSaat(zaman).split(':').map(Number)
    return new Date(Date.UTC(2000, 0, 1, saat, dakika))
  }

  const istAdlar = istasyonlar.map(s => s.ad)
  const basliklar = mod === 'birlesik'
    ? ['Tarih', 'Operatörler', 'Personel', ...istAdlar.flatMap(a => [a, `${a} Fire`]), 'Araçlar', 'Notlar']
    : ['Tarih', 'Saat', 'Operatör', 'Giriş No', 'Personel', ...istAdlar.flatMap(a => [a, `${a} Fire`]), 'Araçlar', 'Not']
  const satirlar: Array<Array<string | number | Date | null>> = []

  if (mod === 'birlesik') {
    gunler.forEach(g => {
      const ops = operatorlerGun(g).map(o => o.count > 1 ? `${o.ad} (x${o.count})` : o.ad).join(', ')
      const istasyonDegerleri = istAdlar.flatMap(ad => {
        const { adet, fire } = istasyonGun(g, ad)
        return [adet || null, fire || null]
      })
      satirlar.push([
        tarihDegeri(g.tarih),
        ops,
        toplamPersonelGun(g),
        ...istasyonDegerleri,
        araclarGun(g),
        g.kayitlar.map(k => k.notlar ?? '').filter(Boolean).join(' | '),
      ])
    })
  } else {
    gunler.forEach(g => {
      ;[...g.kayitlar]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .forEach((k, i) => {
        const istasyonDegerleri = istAdlar.flatMap(ad => {
          const s = k.istasyon_kayitlari.find(x => x.istasyon?.ad === ad)
          return [s?.adet || null, s?.fire_adet || null]
        })
        const aracStr = k.arac_yuklemeleri.map(y => `${y.arac?.plaka ?? y.dis_arac_plakasi ?? '?'}: ${y.adet}`).join(', ')
        satirlar.push([
          tarihDegeri(g.tarih),
          saatDegeri(k.created_at),
          k.operator?.ad_soyad ?? 'Bilinmiyor',
          i + 1,
          k.toplam_personel,
          ...istasyonDegerleri,
          aracStr,
          k.notlar ?? '',
        ])
      })
    })
  }

  worksheet.addRow(basliklar)
  worksheet.addRows(satirlar)
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, satirlar.length + 1), column: basliklar.length },
  }

  const baslikSatiri = worksheet.getRow(1)
  baslikSatiri.height = 26
  baslikSatiri.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFD97706' } } }
  })

  worksheet.getColumn(1).width = 14
  worksheet.getColumn(1).numFmt = 'dd.mm.yyyy'
  const veriBaslangicKolonu = mod === 'ayri' ? 6 : 4
  if (mod === 'ayri') {
    worksheet.getColumn(2).width = 10
    worksheet.getColumn(2).numFmt = 'hh:mm'
    worksheet.getColumn(3).width = 24
    worksheet.getColumn(4).width = 11
    worksheet.getColumn(5).width = 12
  } else {
    worksheet.getColumn(2).width = 30
    worksheet.getColumn(3).width = 12
  }
  istAdlar.forEach((_, index) => {
    worksheet.getColumn(veriBaslangicKolonu + index * 2).width = 16
    worksheet.getColumn(veriBaslangicKolonu + index * 2 + 1).width = 12
  })
  worksheet.getColumn(basliklar.length - 1).width = 26
  worksheet.getColumn(basliklar.length).width = 42
  worksheet.getColumn(basliklar.length).alignment = { vertical: 'top', wrapText: true }

  for (let rowIndex = 2; rowIndex <= satirlar.length + 1; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex)
    row.alignment = { vertical: 'top' }
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
      if (rowIndex % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
      }
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `uretim_giris_${baslangic}_${bitis}_${mod}.xlsx`
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

function AyarlarYonetimiTab({ kategori }: { kategori: AyarKategori | null }) {
  const [gorunum, setGorunum] = useState<GorunumAyarlari>(VARSAYILAN_GORUNUM)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediyor, setKaydediyor] = useState(false)
  const [modalAcik, setModalAcik] = useState(false)
  const navigate = useNavigate()
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
  if (kategori) {
    return (
      <AyarlarPanelGorunum
        kategori={kategori}
        etiketAyarlari={etiketAyarlari}
        etiketKaydediyor={etiketKaydediyor}
        etiketHata={etiketHata}
        etiketAyarlariGuncelle={etiketAyarlariGuncelle}
        onGeri={() => navigate('/admin/ayarlar')}
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

      <div className="p-4 sm:p-6 xl:p-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Ayar Panelleri</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Bir paneli düzenlemek için kartına tıklayın.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalAcik(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {KATEGORILER.map(({ id, label, aciklama, icon: Icon }) => {
            return (
              <button
                key={id}
                type="button"
                onClick={() => navigate(`/admin/ayarlar/${id}`)}
                className="group relative flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
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
    <div className="flex min-h-full flex-col">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-4 sm:px-6 xl:px-8">
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
        <div className="flex flex-1">
          <div className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8">
            <EtiketAyarlariPanel
              ayarlar={etiketAyarlari}
              kaydediyor={etiketKaydediyor}
              hata={etiketHata}
              onKaydet={etiketAyarlariGuncelle}
            />
          </div>
        </div>
      )}
      {kategori === 'araclar'  && <div className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8"><AraclarPanel /></div>}
      {kategori === 'hedef'    && <div className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8"><HedefVardiyaPanel /></div>}
      {kategori === 'presets'  && <div className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8"><AksiyonNotuPresetsPanel /></div>}
      {kategori === 'telegram' && <div className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8"><TelegramAyarlariPanel /></div>}
      {kategori === 'istasyon' && <div className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8"><IstasyonYonetimiPanel /></div>}
      {kategori === 'opti'     && <div className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8"><OptiExportAyarlariPanel /></div>}
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
  const [indiriliyor, setIndiriliyor] = useState(false)

  const indir = async () => {
    setIndiriliyor(true)
    try {
      await xlsxIndir(gunler, istasyonlar, mod, baslangic, bitis)
      onKapat()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Excel dosyası oluşturulamadı.')
    } finally {
      setIndiriliyor(false)
    }
  }

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
              <div className="text-xs text-gray-500 mt-0.5">Her giriş tarih ve saatiyle ayrı satırda gösterilir.</div>
            </div>
          </button>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button type="button" onClick={onKapat} disabled={indiriliyor}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">İptal</button>
          <button type="button"
            onClick={indir}
            disabled={indiriliyor}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors">
            {indiriliyor ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {indiriliyor ? 'Hazırlanıyor…' : '.xlsx İndir'}
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
            const girilenIstasyonlar = sirali.filter(k => k.adet > 0 || k.fire_adet > 0)
            const girilenAraclar = rapor.arac_yuklemeleri.filter(y => y.adet > 0)
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
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-gray-400">{formatSaat(rapor.created_at)}</span>
                        {rapor.toplam_personel > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                            <Users size={10} /> {rapor.toplam_personel} Personel
                          </span>
                        )}
                      </div>
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
                      {girilenIstasyonlar.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Factory size={10} /> İstasyon Verileri
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {girilenIstasyonlar.map(k => (
                              <div key={k.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                                <span className="text-xs font-medium text-gray-700 truncate mr-2">{k.istasyon?.ad ?? '—'}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {k.adet > 0 && (
                                    <span className="font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-md px-2 py-0.5 text-xs">{k.adet}</span>
                                  )}
                                  {k.fire_adet > 0 && (
                                    <span className="font-bold text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-0.5 text-[10px]">Fire: {k.fire_adet}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Araç görünümü */}
                      {girilenAraclar.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Truck size={10} /> Araç Yükleme
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {girilenAraclar.map(y => (
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
                          <p className="text-xs text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                            {rapor.notlar}
                          </p>
                        </div>
                      )}
                      {girilenIstasyonlar.length === 0 && girilenAraclar.length === 0 && !rapor.notlar && (
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
    <div className="flex min-h-full flex-col">
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
      <div className="shrink-0 space-y-3 border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
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
          <div className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto">
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
        <div className="flex flex-wrap items-center gap-2">
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
      <div className="min-w-0 flex-1">
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
          <>
          <div className="space-y-3 p-4 md:hidden">
            {gunler.map(g => {
              const ops = operatorlerGun(g)
              const pers = toplamPersonelGun(g)
              const istasyonOzetleri = istasyonlar.map(s => ({ ad: s.ad, ...istasyonGun(g, s.ad) })).filter(s => s.adet > 0 || s.fire > 0)
              const toplamAdet = istasyonOzetleri.reduce((sum, item) => sum + item.adet, 0)
              const toplamFire = istasyonOzetleri.reduce((sum, item) => sum + item.fire, 0)
              return (
                <article key={g.tarih} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button type="button" onClick={() => setDetayGunTarih(g.tarih)} className="w-full p-4 text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-base font-bold text-slate-900">{formatTarih(g.tarih)}</p><p className="mt-1 text-xs text-slate-500">{g.kayitlar.length} giriş · {ops.map(op => op.ad).join(', ')}</p></div>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700"><Eye size={13} /> Detay</span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Personel</p><p className="mt-1 text-lg font-extrabold text-slate-900">{pers}</p></div>
                      <div className="rounded-xl bg-indigo-50 p-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400">Üretim</p><p className="mt-1 text-lg font-extrabold text-indigo-800">{toplamAdet}</p></div>
                      <div className={`rounded-xl p-2.5 ${toplamFire > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}><p className={`text-[10px] font-semibold uppercase tracking-wide ${toplamFire > 0 ? 'text-red-400' : 'text-emerald-500'}`}>Fire</p><p className={`mt-1 text-lg font-extrabold ${toplamFire > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{toplamFire}</p></div>
                    </div>
                    {istasyonOzetleri.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{istasyonOzetleri.slice(0, 4).map(item => <span key={item.ad} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">{item.ad}: <strong>{item.adet}</strong>{item.fire > 0 ? ` · ${item.fire} fire` : ''}</span>)}</div>}
                  </button>
                </article>
              )
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Tarih</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Operatör(ler)</th>
                  <th className="text-center px-3 py-3 text-xs font-bold text-violet-700 uppercase tracking-wide whitespace-nowrap min-w-[92px]">Personel</th>
                  {istasyonlar.map(s => (
                    <th key={s.ad} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{s.ad}</th>
                  ))}
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Araçlar</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-64 min-w-64 max-w-64">Notlar</th>
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
                              <User size={9} /> {op.ad} · {op.saatler.join(', ')}
                              {op.count > 1 && <span className="bg-teal-600 text-white text-[9px] font-bold rounded-full px-1 leading-tight">x{op.count}</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                      {/* Personel */}
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-violet-200 bg-violet-100 px-3 text-violet-800 font-extrabold text-sm shadow-sm">
                          <Users size={13} /> {pers}
                        </span>
                      </td>
                      {/* Dinamik istasyon sütunları */}
                      {istasyonlar.map(s => {
                        const { adet, fire } = istasyonGun(g, s.ad)
                        return (
                          <td key={s.ad} className="px-3 py-3 text-center">
                            {adet > 0 || fire > 0 ? (
                              <div className="inline-flex flex-col items-center gap-1">
                                {adet > 0 && (
                                  <span className="font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-lg px-3 py-1 text-sm min-w-[2.5rem] text-center leading-tight">{adet}</span>
                                )}
                                {fire > 0 && <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-0.5 leading-tight">Fire: {fire}</span>}
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
                      <td className="px-3 py-3 w-64 min-w-64 max-w-64">
                        {tumNotlar.length === 0
                          ? <span className="text-gray-300 text-xs">—</span>
                          : <span className="flex items-start gap-1 text-xs text-gray-600 min-w-0">
                              <StickyNote size={11} className="text-amber-400 shrink-0 mt-0.5" />
                              <span className="min-w-0 max-h-[3.75rem] overflow-hidden whitespace-normal break-words leading-5" title={tumNotlar.join(' | ')}>
                                {tumNotlar.join(' | ')}
                              </span>
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
          </>
        )}
      </div>
    </div>
  )
}
// ╔══════════════════════════════════════════════════════════════════════════════
// ║ ANA SAYFA
// ╚══════════════════════════════════════════════════════════════════════════════

const ADMIN_NAV_GROUPS: Array<{ label?: string; items: Array<{ to: string; label: string; icon: React.ElementType; end?: boolean }> }> = [
  { items: [{ to: '/admin', label: 'Genel Bakış', icon: LayoutDashboard, end: true }] },
  {
    label: 'Erişim Yönetimi',
    items: [
      { to: '/admin/kullanicilar', label: 'Kullanıcılar', icon: UserCog },
      { to: '/admin/roller', label: 'Roller ve Yetkiler', icon: KeyRound },
    ],
  },
  {
    label: 'Operasyon',
    items: [
      { to: '/admin/uretim-giris', label: 'Üretim Kayıtları', icon: ClipboardCheck },
      { to: '/admin/ayarlar', label: 'Ayarlar Merkezi', icon: Settings },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { to: '/admin/veri-yonetimi', label: 'Veri Yönetimi', icon: Database },
      { to: '/admin/islem-kayitlari', label: 'İşlem Kayıtları', icon: ScrollText },
      { to: '/admin/hatalar', label: 'Merkezi Hatalar', icon: Bug },
    ],
  },
]

function ayarKategorisiMi(value: string | undefined): value is AyarKategori {
  return Boolean(value && KATEGORILER.some(kategori => kategori.id === value))
}

export default function AdminPage() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem('admin_nav_collapsed') === '1')
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  const closeMobileMenu = useCallback((restoreFocus = false) => {
    setMobileMenuOpen(false)
    if (restoreFocus) window.setTimeout(() => mobileMenuTriggerRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileMenu(true)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeMobileMenu, mobileMenuOpen])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const scrollContainer = pageRef.current?.closest<HTMLElement>('[data-app-scroll-container]')
    if (!scrollContainer) return
    const previousOverflow = scrollContainer.style.overflow
    scrollContainer.style.overflow = 'hidden'
    return () => {
      scrollContainer.style.overflow = previousOverflow
    }
  }, [mobileMenuOpen])

  const toggleCollapsed = () => {
    setNavCollapsed(current => {
      const next = !current
      localStorage.setItem('admin_nav_collapsed', next ? '1' : '0')
      return next
    })
  }

  const relativePath = location.pathname.replace(/^\/admin\/?/, '')
  const [section, detail] = relativePath.split('/')
  let content: React.ReactNode

  if (!section) content = <AdminOverview />
  else if (section === 'ayarlar' && detail === 'personel') content = <Navigate to="/admin/kullanicilar" replace />
  else if (section === 'ayarlar' && (!detail || ayarKategorisiMi(detail))) content = <AyarlarYonetimiTab kategori={ayarKategorisiMi(detail) ? detail : null} />
  else if (section === 'uretim-giris' && !detail) content = <UretimGirisiTab />
  else if (section === 'veri-yonetimi' && !detail) content = <VeriYonetimiPanel />
  else if (section === 'kullanicilar' && !detail) content = <KullaniciYonetimiPanel />
  else if (section === 'roller' && !detail) content = <RolYonetimiPanel />
  else if (section === 'islem-kayitlari' && !detail) content = <AuditKayitlariPanel />
  else if (section === 'hatalar' && !detail) content = <HataKayitlariPanel />
  else if (section === 'audit' && !detail) content = <Navigate to="/admin/islem-kayitlari" replace />
  else content = <Navigate to="/admin" replace />

  const currentNavItem = ADMIN_NAV_GROUPS
    .flatMap(group => group.items)
    .find(item => item.end
      ? location.pathname === item.to
      : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))

  return (
    <div ref={pageRef} className="relative flex min-h-full min-w-0 bg-slate-50">
      {mobileMenuOpen && <button type="button" aria-label="Admin menüsünü kapat" onClick={() => closeMobileMenu(true)} className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" />}

      <aside id="admin-navigation" className={`fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] shrink-0 flex-col border-r border-slate-200 bg-white shadow-2xl transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-[calc(100dvh-3.5rem)] lg:translate-x-0 lg:shadow-none xl:h-dvh ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${navCollapsed ? 'lg:w-20' : 'lg:w-64'}`}>
        <div className={`flex h-[73px] items-center border-b border-slate-200 px-4 ${navCollapsed ? 'lg:justify-center' : 'justify-between'}`}>
          <div className={`flex min-w-0 items-center gap-3 ${navCollapsed ? 'lg:hidden' : ''}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm"><ShieldCheck size={20} /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-950">Admin Paneli</span><span className="block truncate text-[11px] text-slate-500">Sistem yönetimi</span></span>
          </div>
          <button type="button" aria-label="Admin menüsünü kapat" onClick={() => closeMobileMenu(true)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:hidden"><X size={19} /></button>
          <button type="button" aria-label={navCollapsed ? 'Admin menüsünü genişlet' : 'Admin menüsünü daralt'} onClick={toggleCollapsed} className="hidden rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 lg:grid">
            {navCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
        </div>

        <nav aria-label="Admin bölümleri" className="flex-1 touch-pan-y space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-5">
          {ADMIN_NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label ?? groupIndex}>
              {group.label && (navCollapsed
                ? <div className="mx-auto mb-2 hidden h-px w-7 bg-slate-200 lg:block" />
                : <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{group.label}</p>)}
              <div className="space-y-1">
                {group.items.map(item => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => closeMobileMenu(false)}
                      title={navCollapsed ? item.label : undefined}
                      className={({ isActive }) => `group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${navCollapsed ? 'lg:justify-center lg:px-2' : ''} ${isActive ? 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                    >
                      <Icon size={18} className="shrink-0" />
                      <span className={navCollapsed ? 'lg:hidden' : ''}>{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className={`border-t border-slate-200 p-3 ${navCollapsed ? 'lg:hidden' : ''}`}>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-500">Yönetim işlemleri güvenlik amacıyla kayıt altına alınır.</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur lg:hidden">
          <button
            ref={mobileMenuTriggerRef}
            type="button"
            aria-label={`Admin bölümünü değiştir. Seçili bölüm: ${currentNavItem?.label ?? 'Admin Paneli'}`}
            aria-controls="admin-navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left shadow-sm outline-none transition hover:border-indigo-200 hover:bg-indigo-50/40 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              <ShieldCheck size={17} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Admin bölümü</span>
              <span className="block truncate text-sm font-bold text-slate-900">{currentNavItem?.label ?? 'Admin Paneli'}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-indigo-700">
              Değiştir
              <ChevronDown size={16} aria-hidden />
            </span>
          </button>
        </div>
        <div className="min-w-0">{content}</div>
      </div>
    </div>
  )
}
