import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface Arac {
  id: string
  plaka: string
  ad: string
  aktif: boolean
}

export function useAraclar() {
  const [araclar, setAraclar] = useState<Arac[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    const { data } = await supabase
      .from('araclar')
      .select('id, plaka, ad, aktif')
      .eq('aktif', true)
      .order('ad')
    setAraclar((data ?? []) as Arac[])
    setYukleniyor(false)
  }, [])

  useEffect(() => { getir() }, [getir])

  return { araclar, yukleniyor }
}

export async function sevkiyatKaydet(siparis_id: string, arac_id: string, tarih: string, notlar?: string) {
  const { error } = await supabase
    .from('sevkiyat_planlari')
    .upsert({ siparis_id, arac_id, tarih, notlar: notlar || null }, { onConflict: 'siparis_id,tarih' })
  if (error) throw new Error(error.message)
}
