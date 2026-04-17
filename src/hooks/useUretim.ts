import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { UretimEmri, UretimEmriDetay, UretimEmriDurum } from '@/types/uretim'

async function generateBatchNo(): Promise<string> {
  const yil = new Date().getFullYear()
  const { data } = await supabase
    .from('uretim_emirleri')
    .select('batch_no')
    .like('batch_no', `BATCH-${yil}-%`)
    .order('batch_no', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return `BATCH-${yil}-0001`
  const last = parseInt((data[0].batch_no as string).split('-')[2], 10)
  return `BATCH-${yil}-${String(last + 1).padStart(4, '0')}`
}

export function useUretim() {
  const [emirler, setEmirler] = useState<UretimEmri[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    const { data, error } = await supabase
      .from('uretim_emirleri')
      .select('*')
      .order('olusturulma_tarihi', { ascending: false })

    if (error) setHata(error.message)
    else setEmirler(data as UretimEmri[])
    setYukleniyor(false)
  }, [])

  useEffect(() => { getir() }, [getir])

  const yeniBatch = async (siparisIds: string[], notlar?: string) => {
    const batch_no = await generateBatchNo()
    const { data, error } = await supabase
      .from('uretim_emirleri')
      .insert({ batch_no, notlar: notlar || null })
      .select()
      .single()
    if (error) throw new Error(error.message)

    const uretimEmriId = data.id as string

    // Seçilen siparişlerin cam parçalarını getir — zaten yıkananları atla
    const { data: detaylar, error: detayHata } = await supabase
      .from('siparis_detaylari')
      .select('id')
      .in('siparis_id', siparisIds)
      .neq('uretim_durumu', 'yikandi')
      .order('created_at')

    if (detayHata) throw new Error(detayHata.message)

    // Toplu olarak batch'e ekle
    if (detaylar && detaylar.length > 0) {
      const satirlar = detaylar.map((d, i) => ({
        uretim_emri_id: uretimEmriId,
        siparis_detay_id: d.id,
        sira_no: i + 1,
      }))
      const { error: eklemeHata } = await supabase
        .from('uretim_emri_detaylari')
        .insert(satirlar)
      if (eklemeHata) throw new Error(eklemeHata.message)
    }

    // Siparişlerin durumunu 'batchte' yap
    await supabase
      .from('siparisler')
      .update({ durum: 'batchte' })
      .in('id', siparisIds)

    await getir()
    return uretimEmriId
  }

  const durumGuncelle = async (id: string, durum: UretimEmriDurum) => {
    const { error } = await supabase.from('uretim_emirleri').update({ durum }).eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  const sil = async (id: string) => {
    const { error } = await supabase.from('uretim_emirleri').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  return { emirler, yukleniyor, hata, yeniBatch, durumGuncelle, sil, yenile: getir }
}

/** Bir batch'in detaylarını (cam listesi) getirir */
export async function getBatchDetaylari(uretimEmriId: string): Promise<UretimEmriDetay[]> {
  const { data, error } = await supabase
    .from('uretim_emri_detaylari')
    .select(`
      id, uretim_emri_id, siparis_detay_id, sira_no,
      siparis_detaylari (
        cam_kodu, genislik_mm, yukseklik_mm, adet, ara_bosluk_mm, kenar_islemi, notlar,
        stok!stok_id ( ad ),
        siparisler ( siparis_no, cari ( ad ) )
      )
    `)
    .eq('uretim_emri_id', uretimEmriId)
    .order('sira_no')

  if (error) throw new Error(error.message)
  return data as UretimEmriDetay[]
}

/** Batch'e sipariş_detay ekler */
export async function batcheCamEkle(uretimEmriId: string, siparisBatchId: string) {
  // Mevcut en yüksek sira_no'yu bul
  const { data: mevcut } = await supabase
    .from('uretim_emri_detaylari')
    .select('sira_no')
    .eq('uretim_emri_id', uretimEmriId)
    .order('sira_no', { ascending: false })
    .limit(1)

  const sira_no = mevcut && mevcut.length > 0 ? (mevcut[0].sira_no ?? 0) + 1 : 1

  const { error } = await supabase.from('uretim_emri_detaylari').insert({
    uretim_emri_id: uretimEmriId,
    siparis_detay_id: siparisBatchId,
    sira_no,
  })
  if (error) throw new Error(error.message)
}

/** Batch'ten cam çıkarır */
export async function batchtenCamCikar(uretimEmriDetayId: string) {
  const { error } = await supabase
    .from('uretim_emri_detaylari')
    .delete()
    .eq('id', uretimEmriDetayId)
  if (error) throw new Error(error.message)
}
