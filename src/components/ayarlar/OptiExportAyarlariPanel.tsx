import { useState, useEffect, useMemo } from 'react'
import { Save, Loader2, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react'
import { useStok } from '@/hooks/useStok'
import { useOptiExportAyarlari } from '@/hooks/useOptiExportAyarlari'
import { optiFamKodu, optiFamKoduOtomatik } from '@/lib/optiExport'
import { stokKodSira } from '@/lib/cam'
import type { OptiExportAyarlari } from '@/types/ayarlar'

export default function OptiExportAyarlariPanel() {
  const { stoklar, yukleniyor: stokYukleniyor } = useStok()
  const { ayarlar, yukleniyor, kaydediyor, hata, kaydet } = useOptiExportAyarlari()

  const [form, setForm] = useState<OptiExportAyarlari>(ayarlar)
  const [basari, setBasari] = useState<string | null>(null)

  useEffect(() => {
    if (!yukleniyor) setForm(ayarlar)
  }, [ayarlar, yukleniyor])

  const camStoklari = useMemo(
    () =>
      stoklar
        .filter((s) => s.kategori === 'cam' && s.aktif !== false)
        .sort((a, b) => {
          const ga = a.grup ?? ''
          const gb = b.grup ?? ''
          if (ga !== gb) return ga.localeCompare(gb, 'tr')
          return stokKodSira(a.kod) - stokKodSira(b.kod)
        }),
    [stoklar],
  )

  const famHaritasiMap = useMemo(() => {
    const m = new Map(form.fam_haritasi.map((e) => [e.stok_kod, e.fam_kodu]))
    return m
  }, [form.fam_haritasi])

  const gosterilenFam = (stokKod: string, stok: (typeof camStoklari)[0]) => {
    return famHaritasiMap.get(stokKod) ?? optiFamKodu(stok, form.fam_haritasi)
  }

  const otomatikFam = (stok: (typeof camStoklari)[0]) => optiFamKoduOtomatik(stok)

  const famGuncelle = (stokKod: string, famKodu: string) => {
    setForm((prev) => {
      const diger = prev.fam_haritasi.filter((e) => e.stok_kod !== stokKod)
      const trimmed = famKodu.trim().toUpperCase()
      if (!trimmed) return prev
      return {
        ...prev,
        fam_haritasi: [...diger, { stok_kod: stokKod, fam_kodu: trimmed }],
      }
    })
    setBasari(null)
  }

  const varsayilanaDon = (stokKod: string, stok: (typeof camStoklari)[0]) => {
    const otomatik = otomatikFam(stok)
    setForm((prev) => ({
      ...prev,
      fam_haritasi: [
        ...prev.fam_haritasi.filter((e) => e.stok_kod !== stokKod),
        { stok_kod: stokKod, fam_kodu: otomatik },
      ],
    }))
    setBasari(null)
  }

  const handleKaydet = async () => {
    setBasari(null)
    const ok = await kaydet(form)
    if (ok) setBasari('Ayarlar kaydedildi.')
  }

  if (yukleniyor || stokYukleniyor) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2" />
        Yükleniyor...
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Opti / PerfectCut Export</h2>
        <p className="text-sm text-gray-500 mt-1">
          IMP dosya sayacı, çıta düşme ve stok kartlarına karşılık gelen FAM kodları.
        </p>
      </div>

      {(hata || basari) && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
            hata ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'
          }`}
        >
          {hata ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {hata ?? basari}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Export Sayaç</label>
          <input
            type="number"
            min={1}
            value={form.sayac}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (Number.isFinite(n) && n > 0) setForm((p) => ({ ...p, sayac: n }))
            }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <p className="text-xs text-gray-400 mt-1">Sonraki dosya: OP_{String(form.sayac).padStart(5, '0')}.IMP</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Çıta Düşme (mm)</label>
          <input
            type="number"
            min={0}
            value={form.cita_dusme}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (Number.isFinite(n) && n >= 0) setForm((p) => ({ ...p, cita_dusme: n }))
            }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <p className="text-xs text-gray-400 mt-1">Ercom uyumu için saklanır; boyut hesabına şimdilik uygulanmaz.</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">FAM Kodları</h3>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[100px_1fr_120px_140px_40px] bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 px-3 py-2">
            <div>Stok Kodu</div>
            <div>Stok Adı</div>
            <div>Grup</div>
            <div>FAM Kodu</div>
            <div />
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {camStoklari.map((s) => {
              const mevcut = gosterilenFam(s.kod, s)
              const otomatik = otomatikFam(s)
              const ozel = famHaritasiMap.has(s.kod) && famHaritasiMap.get(s.kod) !== otomatik
              return (
                <div
                  key={s.id}
                  className="grid grid-cols-[100px_1fr_120px_140px_40px] items-center border-b border-gray-50 last:border-0 px-3 py-2 hover:bg-gray-50/50"
                >
                  <div className="font-mono text-xs text-gray-600">{s.kod}</div>
                  <div className="text-xs text-gray-700 truncate pr-2" title={s.ad}>{s.ad}</div>
                  <div className="text-xs text-gray-500 truncate">{s.grup ?? '—'}</div>
                  <input
                    type="text"
                    value={mevcut}
                    onChange={(e) => famGuncelle(s.kod, e.target.value)}
                    className={`w-full border rounded px-2 py-1 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-orange-200 ${
                      ozel ? 'border-orange-300 bg-orange-50' : 'border-gray-200'
                    }`}
                    placeholder={otomatik}
                  />
                  <button
                    type="button"
                    onClick={() => varsayilanaDon(s.kod, s)}
                    title="Varsayılana dön"
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
        {camStoklari.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Aktif cam stoku bulunamadı.</p>
        )}
      </div>

      <button
        type="button"
        onClick={handleKaydet}
        disabled={kaydediyor}
        className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 disabled:opacity-50 transition-colors"
      >
        {kaydediyor ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Kaydet
      </button>
    </div>
  )
}
