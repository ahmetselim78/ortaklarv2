import { useState, useEffect, useCallback } from 'react'
import { recordSessionAction } from '@/lib/deviceSession'
import {
  stokAktiflikAyarla,
  stokHareketiKaydet,
  stokHareketleriniGetir,
  stokKartiGuncelle,
  stokKartiOlustur,
  stokKartiSil,
  stokKatalogunuGetir,
  stokMaliyetKapsamiAyarla,
  stokOperasyonAyarlariGuncelle,
  stokPanelOzetiniGetir,
  stokSatisKapsamiAyarla,
  stokTedarikcileriniGetir,
} from '@/services/stokService'
import type {
  StokHareketi,
  StokHareketPayload,
  StokKatalogKaydi,
  StokKartPayload,
  StokPanelOzeti,
  StokTedarikcisi,
} from '@/types/stok'

export function useStok({
  yonetimVerileriniYukle = true,
}: {
  yonetimVerileriniYukle?: boolean
} = {}) {
  const [stoklar, setStoklar] = useState<StokKatalogKaydi[]>([])
  const [hareketler, setHareketler] = useState<StokHareketi[]>([])
  const [tedarikciler, setTedarikciler] = useState<StokTedarikcisi[]>([])
  const [ozet, setOzet] = useState<StokPanelOzeti>({
    aktif_kart_sayisi: 0,
    kritik_stok_sayisi: 0,
    stoksuz_kart_sayisi: 0,
    bugunku_hareket_sayisi: 0,
  })
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      const [stokVerisi, hareketVerisi, tedarikciVerisi, ozetVerisi] = await Promise.all([
        stokKatalogunuGetir(),
        yonetimVerileriniYukle ? stokHareketleriniGetir(null, 200) : Promise.resolve([]),
        yonetimVerileriniYukle ? stokTedarikcileriniGetir() : Promise.resolve([]),
        stokPanelOzetiniGetir(),
      ])
      setStoklar(stokVerisi)
      setHareketler(hareketVerisi)
      setTedarikciler(tedarikciVerisi)
      setOzet(ozetVerisi)
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Stok kataloğu yüklenemedi.')
    }
    setYukleniyor(false)
  }, [yonetimVerileriniYukle])

  useEffect(() => { getir() }, [getir])

  const ekle = async (form: StokKartPayload) => {
    await stokKartiOlustur(form)
    recordSessionAction('inventory_create')
    await getir()
  }

  const guncelle = async (id: string, form: StokKartPayload) => {
    await stokKartiGuncelle(id, form)
    recordSessionAction('inventory_update')
    await getir()
  }

  const sil = async (id: string) => {
    await stokKartiSil(id)
    recordSessionAction('inventory_delete')
    await getir()
  }

  const aktiflikAyarla = async (id: string, aktif: boolean) => {
    await stokAktiflikAyarla(id, aktif)
    recordSessionAction('inventory_update')
    await getir()
  }

  const hareketKaydet = async (payload: StokHareketPayload) => {
    await stokHareketiKaydet(payload)
    recordSessionAction('inventory_update')
    await getir()
  }

  const operasyonAyarlariGuncelle = async (
    id: string,
    minimumMiktar: number,
    stokYeri: string,
  ) => {
    await stokOperasyonAyarlariGuncelle(id, minimumMiktar, stokYeri)
    recordSessionAction('inventory_update')
    await getir()
  }

  const satisKapsamiAyarla = async (id: string, etkin: boolean) => {
    await stokSatisKapsamiAyarla(id, etkin)
    recordSessionAction('pricing_update')
    await getir()
  }

  const maliyetKapsamiAyarla = async (id: string, etkin: boolean) => {
    await stokMaliyetKapsamiAyarla(id, etkin)
    recordSessionAction('costing_update')
    await getir()
  }

  return {
    stoklar,
    hareketler,
    tedarikciler,
    ozet,
    yukleniyor,
    hata,
    ekle,
    guncelle,
    sil,
    aktiflikAyarla,
    hareketKaydet,
    operasyonAyarlariGuncelle,
    satisKapsamiAyarla,
    maliyetKapsamiAyarla,
    yenile: getir,
  }
}
