import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { EtiketAyarlari } from '@/types/ayarlar'
import { etiketAyarlariBirlestir, VARSAYILAN_ETIKET_AYARLARI } from '@/types/ayarlar'

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

  const getir = useCallback(async (sessiz = false) => {
    if (!sessiz) {
      setYukleniyor(true)
      setHata(null)
    }
    try {
      const { data, error } = await supabase
        .from('ayarlar')
        .select('deger')
        .eq('anahtar', ANAHTAR)
        .maybeSingle()

      if (error) throw error

      if (data?.deger) {
        setEtiketAyarlari(etiketAyarlariBirlestir(data.deger))
      }
    } catch (e) {
      if (!sessiz) setHata(e instanceof Error ? e.message : 'Ayarlar yüklenemedi')
    } finally {
      if (!sessiz) setYukleniyor(false)
    }
  }, [])

  useEffect(() => {
    getir()
  }, [getir])

  useEffect(() => {
    const channel = supabase
      .channel('etiket-ayarlari-canli')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ayarlar', filter: `anahtar=eq.${ANAHTAR}` },
        payload => {
          const yeni = payload.new as { deger?: unknown }
          if (yeni?.deger) setEtiketAyarlari(etiketAyarlariBirlestir(yeni.deger))
        },
      )
      .subscribe()

    const sessizYenile = () => {
      if (document.visibilityState === 'visible') void getir(true)
    }
    window.addEventListener('focus', sessizYenile)
    document.addEventListener('visibilitychange', sessizYenile)
    const intervalId = window.setInterval(sessizYenile, 30000)

    return () => {
      window.removeEventListener('focus', sessizYenile)
      document.removeEventListener('visibilitychange', sessizYenile)
      window.clearInterval(intervalId)
      void supabase.removeChannel(channel)
    }
  }, [getir])

  const etiketAyarlariGuncelle = useCallback(async (yeni: EtiketAyarlari): Promise<boolean> => {
    setKaydediyor(true)
    setHata(null)
    try {
      const normalizeEdilmis = etiketAyarlariBirlestir(yeni)
      const { error } = await supabase
        .from('ayarlar')
        .upsert(
          { anahtar: ANAHTAR, deger: normalizeEdilmis as unknown as Record<string, unknown>, guncelleme: new Date().toISOString() },
          { onConflict: 'anahtar' }
        )

      if (error) throw error

      setEtiketAyarlari(normalizeEdilmis)
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
    yenile: () => getir(false),
  }
}
