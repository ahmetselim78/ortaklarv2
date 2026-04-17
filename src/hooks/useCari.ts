import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { generateCariKod } from '@/lib/idGenerator'
import type { Cari, YeniCari } from '@/types/cari'

export function useCari() {
  const [cariler, setCariler] = useState<Cari[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    const { data, error } = await supabase
      .from('cari')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) setHata(error.message)
    else setCariler(data as Cari[])
    setYukleniyor(false)
  }, [])

  useEffect(() => { getir() }, [getir])

  const ekle = async (form: Omit<YeniCari, 'kod'>) => {
    const kod = await generateCariKod()
    const { error } = await supabase.from('cari').insert({ ...form, kod })
    if (error) throw new Error(error.message)
    await getir()
  }

  const guncelle = async (id: string, form: Partial<YeniCari>) => {
    const { error } = await supabase.from('cari').update(form).eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  const sil = async (id: string) => {
    const { error } = await supabase.from('cari').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  return { cariler, yukleniyor, hata, ekle, guncelle, sil, yenile: getir }
}
