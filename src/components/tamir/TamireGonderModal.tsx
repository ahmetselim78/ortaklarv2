import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useEscape } from '@/hooks/useEscape'
import { AlertTriangle, X, Wrench } from 'lucide-react'
import type { TamirKaynak, TamirSorun } from '@/types/tamir'
import { SORUN_ETIKETLERI } from '@/types/tamir'
import { recalculateSiparisDurumu, recalculateUretimEmriDurumu } from '@/services/durumService'

const SORUN_LIST: TamirSorun[] = ['kirik', 'cizik', 'olcum_hatasi', 'diger']

export interface TamireGonderCam {
  cam_kodu: string
  siparis_detay_id: string
  uretim_emri_id: string
  batch_no: string
  sira_no: number | null
  musteri: string
  nihai_musteri: string
  siparis_no: string
  genislik_mm: number
  yukseklik_mm: number
  stok_ad: string
  adet: number
}

interface Props {
  cam: TamireGonderCam
  kaynak: TamirKaynak
  onClose: () => void
  onSuccess: () => void
}

export default function TamireGonderModal({ cam, kaynak, onClose, onSuccess }: Props) {
  useEscape(onClose)
  const [sorunTipi, setSorunTipi] = useState<TamirSorun>('kirik')
  const [tamirAdeti, setTamirAdeti] = useState(1)
  const [adetGirisAktif, setAdetGirisAktif] = useState(false)
  const [manuelAdetMetin, setManuelAdetMetin] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const aciklamaRef = useRef<HTMLTextAreaElement>(null)
  const adetInputRef = useRef<HTMLInputElement>(null)

  const hizliAdetSecimi = cam.adet <= 2

  // cam değiştiğinde formu sıfırla
  useEffect(() => {
    setSorunTipi('kirik')
    setTamirAdeti(1)
    setAdetGirisAktif(false)
    setManuelAdetMetin('')
    setAciklama('')
    setHata('')
  }, [cam.siparis_detay_id])

  // Manuel adet alanı açıldığında odağı input'a ver
  useEffect(() => {
    if (adetGirisAktif) {
      setManuelAdetMetin('')
      const t = setTimeout(() => adetInputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [adetGirisAktif])

  // Klavye kısayolları
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isTextarea = document.activeElement === aciklamaRef.current
      const isAdetInput = document.activeElement === adetInputRef.current

      // Delete → iptal
      if (e.key === 'Delete') {
        e.preventDefault()
        onClose()
        return
      }

      // Textarea veya adet girişi odaktayken sadece Delete çalışır
      if (isTextarea || isAdetInput) return

      // 1-4 → sorun türü seçimi
      const idx = parseInt(e.key, 10) - 1
      if (idx >= 0 && idx <= 3) {
        e.preventDefault()
        setSorunTipi(SORUN_LIST[idx])
        return
      }

      // Enter → formu gönder
      if (e.key === 'Enter') {
        e.preventDefault()
        formRef.current?.requestSubmit()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const doSubmit = async () => {
    const gecerliAdet = cam.adet > 2 && adetGirisAktif
      ? parseInt(manuelAdetMetin, 10)
      : cam.adet > 2 && !adetGirisAktif
        ? 1
        : tamirAdeti
    if (!Number.isFinite(gecerliAdet) || gecerliAdet < 1 || gecerliAdet > cam.adet) {
      setHata(`Tamir adedi 1 ile ${cam.adet} arasında olmalıdır.`)
      return
    }
    if (adetGirisAktif && cam.adet > 2 && gecerliAdet < 2) {
      setHata('Farklı adet için 2 veya daha fazla bir değer girin.')
      return
    }

    setYukleniyor(true)
    setHata('')

    const { error } = await supabase.from('tamir_kayitlari').insert({
      cam_kodu: cam.cam_kodu,
      siparis_detay_id: cam.siparis_detay_id,
      uretim_emri_id: cam.uretim_emri_id,
      batch_no: cam.batch_no,
      sira_no: cam.sira_no,
      kaynak_istasyon: kaynak,
      sorun_tipi: sorunTipi,
      aciklama: aciklama.trim() || null,
      durum: 'bekliyor',
      adet: gecerliAdet,
      musteri: cam.musteri,
      nihai_musteri: cam.nihai_musteri,
      siparis_no: cam.siparis_no,
      genislik_mm: cam.genislik_mm,
      yukseklik_mm: cam.yukseklik_mm,
      stok_ad: cam.stok_ad,
    })

    if (error) {
      setYukleniyor(false)
      setHata('Kayıt oluşturulamadı: ' + error.message)
      return
    }

    // Bu cam daha önce "yikandi" olarak işaretlenmiş olabilir (tarama sonrası tamire gönderiliyor) —
    // artık bekleyen bir tamir kaydı olduğu için sipariş/batch durumu yeniden hesaplanmalı
    // (örn. son cam tarandığı anda 'tamamlandi' olan sipariş, tamir bekliyorsa 'eksik_var'a düşmeli).
    const { data: detay } = await supabase
      .from('siparis_detaylari')
      .select('siparis_id')
      .eq('id', cam.siparis_detay_id)
      .maybeSingle()
    const siparisId = detay?.siparis_id
    if (siparisId) await recalculateSiparisDurumu(siparisId)
    await recalculateUretimEmriDurumu(cam.uretim_emri_id)

    setYukleniyor(false)
    onSuccess()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await doSubmit()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-red-800 rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-900/60 border border-red-700 flex items-center justify-center">
              <Wrench size={18} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Tamire Gönder</h2>
              <p className="text-gray-500 text-xs">Sorunlu cam tamir istasyonuna yönlendirilecek</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cam Bilgileri */}
        <div className="px-6 py-4 bg-gray-950/60 border-b border-gray-800">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">CAM KODU</p>
              <p className="font-mono font-black text-white text-lg">{cam.cam_kodu}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">BOYUT</p>
              <p className="text-gray-200 font-medium">{cam.genislik_mm} × {cam.yukseklik_mm} mm</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">MÜŞTERİ</p>
              <p className="text-gray-200 font-medium truncate">{cam.musteri || '—'}</p>
            </div>
            {cam.nihai_musteri && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">ALT MÜŞTERİ</p>
                <p className="text-gray-200 font-medium truncate">{cam.nihai_musteri}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">SİPARİŞ</p>
              <p className="font-mono text-gray-300 text-sm">{cam.siparis_no || '—'}</p>
            </div>
            {cam.sira_no != null && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">POZ NO</p>
                <p className="font-mono font-bold text-amber-300 text-sm">#{cam.sira_no}</p>
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Adet seçimi */}
          {cam.adet > 1 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
                Kaç Adet Tamire Gönderiliyor? *
              </label>
              {hizliAdetSecimi ? (
                <div className="flex gap-2">
                  {Array.from({ length: cam.adet }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTamirAdeti(n)}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                        tamirAdeti === n
                          ? 'bg-red-900/50 border-red-600 text-red-200'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                      }`}
                    >
                      {n} Adet
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTamirAdeti(1)
                      setAdetGirisAktif(false)
                      setManuelAdetMetin('')
                    }}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                      tamirAdeti === 1 && !adetGirisAktif
                        ? 'bg-red-900/50 border-red-600 text-red-200'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                    }`}
                  >
                    1 Adet
                  </button>
                  {adetGirisAktif ? (
                    <div className="flex-1 flex items-center gap-1.5 bg-gray-800 border border-red-600/60 rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-red-600/30">
                      <input
                        ref={adetInputRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={manuelAdetMetin}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '')
                          setManuelAdetMetin(v)
                          const parsed = parseInt(v, 10)
                          if (!Number.isNaN(parsed)) setTamirAdeti(parsed)
                        }}
                        placeholder="2"
                        className="w-full min-w-0 bg-transparent text-white text-sm font-bold text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">/ {cam.adet}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAdetGirisAktif(true)}
                      className="flex-1 py-2.5 rounded-xl border border-dashed border-gray-600 bg-gray-800/50 text-gray-500 text-xs font-medium hover:border-gray-500 hover:text-gray-300 transition-colors px-2"
                    >
                      Farklı adet girmek için tıklayın
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sorun Türü */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
              Sorun Türü *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SORUN_LIST.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSorunTipi(s)}
                  className={`relative px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                    sorunTipi === s
                      ? 'bg-red-900/50 border-red-600 text-red-200'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                  }`}
                >
                  <span className="absolute top-1.5 left-2 text-[10px] font-mono font-bold opacity-50">{i + 1}</span>
                  {SORUN_ETIKETLERI[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
              Açıklama (isteğe bağlı)
            </label>
            <textarea
              ref={aciklamaRef}
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              placeholder="Sorun hakkında ek bilgi..."
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 resize-none"
            />
          </div>

          {hata && (
            <div className="flex items-center gap-2 bg-red-950/60 border border-red-800 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-red-400 shrink-0" />
              <p className="text-red-300 text-sm">{hata}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-gray-300 font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              İptal
              <kbd className="px-1.5 py-0.5 rounded bg-gray-700 border border-gray-600 text-gray-400 text-xs font-mono">Del</kbd>
            </button>
            <button
              type="submit"
              disabled={yukleniyor}
              className="flex-1 px-4 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Wrench size={15} />
              {yukleniyor ? 'Kaydediliyor...' : 'Tamire Gönder'}
              {!yukleniyor && <kbd className="px-1.5 py-0.5 rounded bg-red-800 border border-red-600 text-red-200 text-xs font-mono">↵</kbd>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
