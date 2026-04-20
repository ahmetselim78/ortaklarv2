import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { EtiketAyarlari } from '@/types/ayarlar'
import { VARSAYILAN_ETIKET_AYARLARI } from '@/types/ayarlar'

const ANAHTAR = 'etiket_ayarlari'

interface UseAyarlarReturn {
  etiketAyarlari: EtiketAyarlari
  yukleniyor: boolean
  kaydediyor: boolean
  hata: string | null
  etiketAyarlariGuncelle: (yeni: EtiketAyarlari) => Promise<boolean>
  yenile: () => Promise<void>
}

export function useAyarlar(): UseAyarlarReturn {
  const [etiketAyarlari, setEtiketAyarlari] = useState<EtiketAyarlari>(VARSAYILAN_ETIKET_AYARLARI)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediyor, setKaydediyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      const { data, error } = await supabase
        .from('ayarlar')
        .select('deger')
        .eq('anahtar', ANAHTAR)
        .maybeSingle()

      if (error) throw error

      if (data?.deger) {
        // Varsayılan ile birleştir — eksik anahtarları tamamla
        const merged: EtiketAyarlari = {
          ...VARSAYILAN_ETIKET_AYARLARI,
          ...(data.deger as Partial<EtiketAyarlari>),
          yazici: {
            ...VARSAYILAN_ETIKET_AYARLARI.yazici,
            ...((data.deger as Partial<EtiketAyarlari>).yazici ?? {}),
          },
          boyut: {
            ...VARSAYILAN_ETIKET_AYARLARI.boyut,
            ...((data.deger as Partial<EtiketAyarlari>).boyut ?? {}),
          },
          icerik: {
            ...VARSAYILAN_ETIKET_AYARLARI.icerik,
            ...((data.deger as Partial<EtiketAyarlari>).icerik ?? {}),
          },
        }
        setEtiketAyarlari(merged)
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Ayarlar yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => {
    getir()
  }, [getir])

  const etiketAyarlariGuncelle = useCallback(async (yeni: EtiketAyarlari): Promise<boolean> => {
    setKaydediyor(true)
    setHata(null)
    try {
      const { error } = await supabase
        .from('ayarlar')
        .upsert(
          { anahtar: ANAHTAR, deger: yeni as unknown as Record<string, unknown>, guncelleme: new Date().toISOString() },
          { onConflict: 'anahtar' }
        )

      if (error) throw error

      setEtiketAyarlari(yeni)
      return true
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Ayarlar kaydedilemedi')
      return false
    } finally {
      setKaydediyor(false)
    }
  }, [])

  return {
    etiketAyarlari,
    yukleniyor,
    kaydediyor,
    hata,
    etiketAyarlariGuncelle,
    yenile: getir,
  }
}
