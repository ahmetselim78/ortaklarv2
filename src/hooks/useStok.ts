import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { generateStokKod } from '@/lib/idGenerator'
import type { Stok, YeniStok } from '@/types/stok'

export function useStok() {
  const [stoklar, setStoklar] = useState<Stok[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    const { data, error } = await supabase
      .from('stok')
      .select('*, cari!tedarikci_id(ad)')
      .order('created_at', { ascending: false })

    if (error) setHata(error.message)
    else {
      const mapped = (data ?? []).map((d: any) => ({
        ...d,
        tedarikci_ad: d.cari?.ad ?? null,
        cari: undefined,
      })) as Stok[]
      setStoklar(mapped)
    }
    setYukleniyor(false)
  }, [])

  useEffect(() => { getir() }, [getir])

  const ekle = async (form: Omit<YeniStok, 'kod'>) => {
    const kod = await generateStokKod()
    const { error } = await supabase.from('stok').insert({ ...form, kod })
    if (error) throw new Error(error.message)
    await getir()
  }

  const guncelle = async (id: string, form: Partial<YeniStok>) => {
    const { error } = await supabase.from('stok').update(form).eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  const sil = async (id: string) => {
    const { error } = await supabase.from('stok').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  return { stoklar, yukleniyor, hata, ekle, guncelle, sil, yenile: getir }
}
