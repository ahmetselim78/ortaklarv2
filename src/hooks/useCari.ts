import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Cari, YeniCari } from '@/types/cari'

/** Sonraki cari kodunu üretir: C-0001, C-0002 ... */
async function generateCariKod(): Promise<string> {
  const { data } = await supabase
    .from('cari')
    .select('kod')
    .like('kod', 'C-%')
    .order('kod', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return 'C-0001'
  const last = parseInt((data[0].kod as string).replace('C-', ''), 10)
  return `C-${String(last + 1).padStart(4, '0')}`
}

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
