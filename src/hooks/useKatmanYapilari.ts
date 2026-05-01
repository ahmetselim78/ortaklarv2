import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { isValidKatmanYapisi, normalizeKatmanYapisi } from '@/lib/cam'

const ANAHTAR = 'populer_katman_yapilari'

const VARSAYILAN: string[] = [
  '4+12+4',
  '4+16+4',
  '4+20+4',
  '4+12+4+16+4',
  '4+16+4+16+4',
  '4+14+5',
  '4+12+5',
  '5+16+5',
]

interface UseKatmanYapilariReturn {
  yapilar: string[]
  yukleniyor: boolean
  kaydediyor: boolean
  hata: string | null
  guncelle: (yeni: string[]) => Promise<boolean>
  yenile: () => Promise<void>
}

/**
 * `ayarlar` tablosundaki `populer_katman_yapilari` anahtarından
 * sıralı string[] döner. Boş/yok ise VARSAYILAN listeye düşer.
 */
export function useKatmanYapilari(): UseKatmanYapilariReturn {
  const [yapilar, setYapilar] = useState<string[]>(VARSAYILAN)
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
      const liste = (data?.deger as { liste?: unknown })?.liste
      if (Array.isArray(liste)) {
        const filtreli = liste
          .map(v => normalizeKatmanYapisi(typeof v === 'string' ? v : ''))
          .filter(v => v !== '')
        setYapilar(filtreli.length > 0 ? Array.from(new Set(filtreli)) : VARSAYILAN)
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Katman yapıları yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => { getir() }, [getir])

  const guncelle = useCallback(async (yeni: string[]): Promise<boolean> => {
    setKaydediyor(true)
    setHata(null)
    try {
      const temiz = Array.from(
        new Set(
          yeni
            .map(v => normalizeKatmanYapisi(v))
            .filter(v => v !== '' && isValidKatmanYapisi(v)),
        ),
      )
      const { error } = await supabase
        .from('ayarlar')
        .upsert(
          {
            anahtar: ANAHTAR,
            deger: { liste: temiz } as unknown as Record<string, unknown>,
            guncelleme: new Date().toISOString(),
          },
          { onConflict: 'anahtar' },
        )
      if (error) throw error
      setYapilar(temiz.length > 0 ? temiz : VARSAYILAN)
      return true
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Katman yapıları kaydedilemedi')
      return false
    } finally {
      setKaydediyor(false)
    }
  }, [])

  return { yapilar, yukleniyor, kaydediyor, hata, guncelle, yenile: getir }
}
