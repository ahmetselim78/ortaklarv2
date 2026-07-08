import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { OptiExportAyarlari } from '@/types/ayarlar'
import { VARSAYILAN_OPTI_EXPORT_AYARLARI } from '@/types/ayarlar'
import { VARSAYILAN_FAM_HARITASI } from '@/lib/optiExport'

const ANAHTAR = 'opti_export'

function birlestir(ham: Partial<OptiExportAyarlari> | null | undefined): OptiExportAyarlari {
  const kayitliHarita = ham?.fam_haritasi ?? []
  const varsayilanMap = new Map(VARSAYILAN_FAM_HARITASI.map((e) => [e.stok_kod, e.fam_kodu]))
  for (const e of kayitliHarita) {
    if (e.stok_kod && e.fam_kodu) varsayilanMap.set(e.stok_kod, e.fam_kodu)
  }
  const fam_haritasi = [...varsayilanMap.entries()].map(([stok_kod, fam_kodu]) => ({
    stok_kod,
    fam_kodu,
  }))

  return {
    sayac: typeof ham?.sayac === 'number' && ham.sayac > 0 ? ham.sayac : VARSAYILAN_OPTI_EXPORT_AYARLARI.sayac,
    cita_dusme:
      typeof ham?.cita_dusme === 'number' && ham.cita_dusme >= 0
        ? ham.cita_dusme
        : VARSAYILAN_OPTI_EXPORT_AYARLARI.cita_dusme,
    fam_haritasi,
  }
}

export function useOptiExportAyarlari() {
  const [ayarlar, setAyarlar] = useState<OptiExportAyarlari>(birlestir(null))
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
      setAyarlar(birlestir(data?.deger as Partial<OptiExportAyarlari> | undefined))
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Opti ayarları yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => {
    getir()
  }, [getir])

  const kaydet = useCallback(async (yeni: OptiExportAyarlari): Promise<boolean> => {
    setKaydediyor(true)
    setHata(null)
    try {
      const { error } = await supabase.from('ayarlar').upsert(
        {
          anahtar: ANAHTAR,
          deger: yeni as unknown as Record<string, unknown>,
          guncelleme: new Date().toISOString(),
        },
        { onConflict: 'anahtar' },
      )
      if (error) throw error
      setAyarlar(birlestir(yeni))
      return true
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Opti ayarları kaydedilemedi')
      return false
    } finally {
      setKaydediyor(false)
    }
  }, [])

  const sayacArttir = useCallback(async (): Promise<number> => {
    const mevcut = ayarlar.sayac
    const yeniSayac = mevcut + 1
    const ok = await kaydet({ ...ayarlar, sayac: yeniSayac })
    return ok ? yeniSayac : mevcut
  }, [ayarlar, kaydet])

  return {
    ayarlar,
    yukleniyor,
    kaydediyor,
    hata,
    kaydet,
    sayacArttir,
    yenile: getir,
  }
}
