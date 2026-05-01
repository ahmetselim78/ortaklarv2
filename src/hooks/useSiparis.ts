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
  alt_musteri?: string
  harici_siparis_no?: string
  teslimat_tipi?: string
  kaynak?: 'pdf' | 'manuel'
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
      .select('*, cari(ad, kod), siparis_detaylari(count), sevkiyat_planlari(id, tarih)')
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
        alt_musteri: form.alt_musteri || null,
        harici_siparis_no: form.harici_siparis_no || null,
        teslimat_tipi: form.teslimat_tipi || 'teslim_alacak',
        kaynak: form.kaynak || 'manuel',
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
      katman_yapisi: cam.katman_yapisi || null,
      cita_stok_id: cam.cita_stok_id || null,
      kenar_islemi: cam.kenar_islemi || null,
      notlar: cam.notlar || null,
      poz: cam.poz || null,
      menfez_cap_mm: cam.menfez_cap_mm ? Number(cam.menfez_cap_mm) : null,
      kucuk_cam: cam.kucuk_cam ?? false,
    }))

    const { error: detayHata } = await supabase
      .from('siparis_detaylari')
      .insert(detaylar)

    if (detayHata) throw new Error(detayHata.message)

    await getir()
    return { id: siparis.id as string, siparis_no: siparis.siparis_no as string, teslim_tarihi: siparis.teslim_tarihi as string | null }
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
    const updatePayload: Record<string, unknown> = { durum }
    if (durum === 'tamamlandi') updatePayload.tamamlandi_tarihi = new Date().toISOString()
    const { error } = await supabase.from('siparisler').update(updatePayload).eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  const guncelle = async (id: string, form: { tarih?: string; teslim_tarihi?: string | null; alt_musteri?: string | null; notlar?: string | null }) => {
    const { error } = await supabase.from('siparisler').update({
      tarih: form.tarih,
      teslim_tarihi: form.teslim_tarihi,
      alt_musteri: form.alt_musteri,
      notlar: form.notlar,
    }).eq('id', id)
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
    .select('*, stok:stok!stok_id(ad, kalinlik_mm), cita_stok:stok!cita_stok_id(ad)')
    .eq('siparis_id', siparisId)
    // İki seviyeli sıralama: önce created_at, sonra cam_kodu (tie-break).
    // PDF import gibi toplu insert'lerde aynı created_at'e sahip satırlar olabilir;
    // tek kolonlu order'da Postgres deterministik sıra garanti etmez ve update
    // sonrası satırların yeri "karışık" görünür.
    .order('created_at', { ascending: true })
    .order('cam_kodu', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })

  if (error) throw new Error(error.message)
  return data as SiparisDetay[]
}
