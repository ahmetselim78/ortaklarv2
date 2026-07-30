import { useCallback, useEffect, useState } from 'react'

export interface TicariKaynakDurumu<T> {
  veri: T | null
  yukleniyor: boolean
  hata: string | null
  yenile: () => Promise<void>
}

export function useTicariKaynak<T>(yukleyici: () => Promise<T>): TicariKaynakDurumu<T> {
  const [veri, setVeri] = useState<T | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  const yenile = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      setVeri(await yukleyici())
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Ticari veriler yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }, [yukleyici])

  useEffect(() => {
    void yenile()
  }, [yenile])

  return { veri, yukleniyor, hata, yenile }
}

