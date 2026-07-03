import { useState } from 'react'
import { Plus, Trash2, GripVertical, Keyboard } from 'lucide-react'
import { presetsOku, presetleriYaz, yeniPresetId } from '@/lib/aksiyonPresets'
import type { AksiyonPreset } from '@/lib/aksiyonPresets'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const KISAYOLLAR = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function AksiyonNotuPresetsPanel() {
  const [presets, setPresets] = useState<AksiyonPreset[]>(() => presetsOku())
  const [yeniMetin, setYeniMetin] = useState('')
  const [yeniKisayol, setYeniKisayol] = useState('')
  const [duzenlemeId, setDuzenlemeId] = useState<string | null>(null)
  const [duzenlemeMetin, setDuzenlemeMetin] = useState('')
  const [duzenlemeKisayol, setDuzenlemeKisayol] = useState('')
  const [silinecekPreset, setSilinecekPreset] = useState<AksiyonPreset | null>(null)

  const kaydet = (guncellenmis: AksiyonPreset[]) => {
    setPresets(guncellenmis)
    presetleriYaz(guncellenmis)
  }

  const ekle = () => {
    if (!yeniMetin.trim()) return
    const yeni: AksiyonPreset = {
      id: yeniPresetId(),
      metin: yeniMetin.trim(),
      kisayol: yeniKisayol,
    }
    kaydet([...presets, yeni])
    setYeniMetin('')
    setYeniKisayol('')
  }

  const sil = () => {
    if (!silinecekPreset) return
    kaydet(presets.filter(p => p.id !== silinecekPreset.id))
    setSilinecekPreset(null)
  }

  const duzenlemeBaslat = (p: AksiyonPreset) => {
    setDuzenlemeId(p.id)
    setDuzenlemeMetin(p.metin)
    setDuzenlemeKisayol(p.kisayol)
  }

  const duzenlemeKaydet = () => {
    if (!duzenlemeId || !duzenlemeMetin.trim()) return
    kaydet(presets.map(p =>
      p.id === duzenlemeId
        ? { ...p, metin: duzenlemeMetin.trim(), kisayol: duzenlemeKisayol }
        : p
    ))
    setDuzenlemeId(null)
  }

  // Kullanılan kısayollar (düzenleme hariç)
  const kullanilanKisayollar = presets
    .filter(p => p.id !== duzenlemeId && p.kisayol)
    .map(p => p.kisayol)
  const kullanilanEkleKisayollar = presets
    .filter(p => p.kisayol)
    .map(p => p.kisayol)

  return (
    <div className="max-w-2xl space-y-8">

      {/* Açıklama */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
        <Keyboard size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 leading-relaxed">
          <p className="font-semibold mb-1">Aksiyon Notu Hazır Cevaplar</p>
          <p>Saatlik takip panosunda bir satıra tıkladığınızda açılan not modalından bu hazır cevapları seçebilirsiniz. Kısayol tuşu atarsanız (1–9), modal açıkken o tuşa basmak notu otomatik seçer.</p>
        </div>
      </div>

      {/* Mevcut presetler */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Hazır Cevaplar
          <span className="ml-2 text-gray-400 font-normal">({presets.length})</span>
        </h3>

        {presets.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            Henüz hazır cevap eklenmemiş.
          </div>
        ) : (
          <div className="space-y-2">
            {presets.map((p, idx) => (
              <div key={p.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
                <GripVertical size={14} className="text-gray-300 shrink-0 cursor-grab" />

                {duzenlemeId === p.id ? (
                  /* Düzenleme satırı */
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={duzenlemeMetin}
                      onChange={e => setDuzenlemeMetin(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') duzenlemeKaydet() }}
                      className="flex-1 px-3 py-1.5 text-sm border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <select
                      value={duzenlemeKisayol}
                      onChange={e => setDuzenlemeKisayol(e.target.value)}
                      className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {KISAYOLLAR.filter(k => k === '' || k === duzenlemeKisayol || !kullanilanKisayollar.includes(k)).map(k => (
                        <option key={k} value={k}>{k === '' ? 'Yok' : `Tuş: ${k}`}</option>
                      ))}
                    </select>
                    <button onClick={duzenlemeKaydet} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      Kaydet
                    </button>
                    <button onClick={() => setDuzenlemeId(null)} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                      İptal
                    </button>
                  </div>
                ) : (
                  /* Normal satır */
                  <>
                    <span className="w-6 h-6 text-xs font-bold text-gray-400 text-center">{idx + 1}.</span>
                    <span className="flex-1 text-sm text-gray-800">{p.metin}</span>
                    {p.kisayol && (
                      <kbd className="px-2 py-0.5 text-xs font-mono bg-gray-100 border border-gray-300 rounded text-gray-600">
                        {p.kisayol}
                      </kbd>
                    )}
                    <button
                      type="button"
                      onClick={() => duzenlemeBaslat(p)}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors text-xs"
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => setSilinecekPreset(p)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Yeni preset formu */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Yeni Hazır Cevap Ekle</h4>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Cevap Metni <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={yeniMetin}
              onChange={e => setYeniMetin(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') ekle() }}
              placeholder="Örn: Makine arızası, bant durduruldu"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="w-32 shrink-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Kısayol Tuşu</label>
            <select
              value={yeniKisayol}
              onChange={e => setYeniKisayol(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {KISAYOLLAR.filter(k => k === '' || !kullanilanEkleKisayollar.includes(k)).map(k => (
                <option key={k} value={k}>{k === '' ? 'Kısayol yok' : `Tuş: ${k}`}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={ekle}
            disabled={!yeniMetin.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
          >
            <Plus size={14} />
            Ekle
          </button>
        </div>
      </div>

      {silinecekPreset && (
        <ConfirmDialog
          baslik="Hazir cevap silinsin mi?"
          mesaj={`"${silinecekPreset.metin}" hazir cevabi silinecek.`}
          onayButon="Sil"
          onayRenk="red"
          onOnayla={sil}
          onKapat={() => setSilinecekPreset(null)}
        />
      )}
    </div>
  )
}
