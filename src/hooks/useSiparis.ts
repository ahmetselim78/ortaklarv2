import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { generateCamKodulari, generateSiparisNo } from '@/lib/idGenerator'
import type { Siparis, SiparisDetay, CamFormSatiri, SiparisDurum } from '@/types/siparis'

/* ===== Durum geçiş matrisi ===== */
const GECERLI_GECISLER: Record<SiparisDurum, SiparisDurum[]> = {
  beklemede: ['batchte', 'iptal'],
  batchte: ['yikamada', 'beklemede', 'eksik_var'],
  yikamada: ['tamamlandi', 'eksik_var'],
  tamamlandi: [],
  eksik_var: ['batchte', 'beklemede', 'tamamlandi'],
  iptal: ['beklemede'],
}

interface YeniSiparisForm {
  cari_id: string
  tarih: string
  teslim_tarihi?: string
  notlar?: string
  camlar: CamFormSatiri[]
}

export function useSiparis() {
  const [siparisler, setSiparisler] = useState<Siparis[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  const getir = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    const { data, error } = await supabase
      .from('siparisler')
      .select('*, cari(ad, kod)')
      .order('created_at', { ascending: false })

    if (error) setHata(error.message)
    else setSiparisler(data as Siparis[])
    setYukleniyor(false)
  }, [])

  useEffect(() => { getir() }, [getir])

  const ekle = async (form: YeniSiparisForm) => {
    // 1. Sipariş numarası üret
    const siparis_no = await generateSiparisNo()

    // 2. Sipariş başlığını kaydet
    const { data: siparis, error: siparisHata } = await supabase
      .from('siparisler')
      .insert({
        siparis_no,
        cari_id: form.cari_id,
        tarih: form.tarih,
        teslim_tarihi: form.teslim_tarihi || null,
        notlar: form.notlar || null,
      })
      .select()
      .single()

    if (siparisHata) throw new Error(siparisHata.message)

    // 3. Tüm cam parçaları için toplu GLS kodu üret
    const kodlar = await generateCamKodulari(form.camlar.length)

    // 4. Cam parçalarını kaydet
    const detaylar = form.camlar.map((cam, i) => ({
      siparis_id: siparis.id,
      stok_id: cam.stok_id || null,
      cam_kodu: kodlar[i],
      genislik_mm: Number(cam.genislik_mm),
      yukseklik_mm: Number(cam.yukseklik_mm),
      adet: Number(cam.adet),
      ara_bosluk_mm: cam.ara_bosluk_mm ? Number(cam.ara_bosluk_mm) : null,
      kenar_islemi: cam.kenar_islemi || null,
      notlar: cam.notlar || null,
    }))

    const { error: detayHata } = await supabase
      .from('siparis_detaylari')
      .insert(detaylar)

    if (detayHata) throw new Error(detayHata.message)

    await getir()
    return siparis.id as string
  }

  const durumGuncelle = async (id: string, durum: SiparisDurum) => {
    // Durum geçiş kontrolü
    const mevcut = siparisler.find(s => s.id === id)
    if (mevcut) {
      const gecerli = GECERLI_GECISLER[mevcut.durum]
      if (!gecerli.includes(durum)) {
        throw new Error(`Geçersiz durum geçişi: ${mevcut.durum} → ${durum}`)
      }
    }
    const { error } = await supabase.from('siparisler').update({ durum }).eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  const guncelle = async (id: string, form: { tarih?: string; teslim_tarihi?: string | null; notlar?: string | null }) => {
    const { error } = await supabase.from('siparisler').update(form).eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  const sil = async (id: string) => {
    // siparis_detaylari CASCADE ile otomatik silinir
    const { error } = await supabase.from('siparisler').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  return { siparisler, yukleniyor, hata, ekle, guncelle, durumGuncelle, sil, yenile: getir }
}

export async function getSiparisDetaylari(siparisId: string): Promise<SiparisDetay[]> {
  const { data, error } = await supabase
    .from('siparis_detaylari')
    .select('*, stok!stok_id(ad)')
    .eq('siparis_id', siparisId)
    .order('created_at')

  if (error) throw new Error(error.message)
  return data as SiparisDetay[]
}
