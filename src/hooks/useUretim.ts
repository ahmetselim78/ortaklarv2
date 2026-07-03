import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { generateBatchNo } from '@/lib/idGenerator'
import type { UretimEmri, UretimEmriDetay, UretimEmriDurum } from '@/types/uretim'

/* ===== Durum geçiş matrisi ===== */
const GECERLI_GECISLER: Record<UretimEmriDurum, UretimEmriDurum[]> = {
  hazirlaniyor: ['export_edildi', 'iptal'],
  export_edildi: ['yikamada', 'hazirlaniyor'],
  yikamada: ['tamamlandi', 'eksik_var'],
  tamamlandi: [],
  eksik_var: ['yikamada', 'export_edildi'],
  iptal: [],
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
      .select(`
        *,
        uretim_emri_detaylari(
          siparis_detaylari(
            adet,
            siparisler(id, siparis_no, alt_musteri, notlar, cari(ad))
          )
        )
      `)
      .order('olusturulma_tarihi', { ascending: false })

    if (error) {
      setHata(error.message)
    } else {
      const enriched = (data as any[]).map((emir) => {
        const detaylar: any[] = emir.uretim_emri_detaylari ?? []
        // cam_sayisi = satır değil, adet toplamı
        const cam_sayisi = detaylar.reduce((sum, d) => sum + (d.siparis_detaylari?.adet ?? 1), 0)
        const siparisMap = new Map<string, { id: string; siparis_no: string; musteri_ad: string; alt_musteri: string | null; ref_no: string | null }>()
        for (const d of detaylar) {
          const sip = d.siparis_detaylari?.siparisler
          if (sip && !siparisMap.has(sip.id)) {
            const refMatch = (sip.notlar as string | null)?.match(/Sipari\u015f No:\s*([^\s/]+)/)
            siparisMap.set(sip.id, {
              id: sip.id,
              siparis_no: sip.siparis_no,
              musteri_ad: sip.cari?.ad ?? '—',
              alt_musteri: sip.alt_musteri ?? null,
              ref_no: refMatch ? refMatch[1] : null,
            })
          }
        }
        const { uretim_emri_detaylari: _, ...rest } = emir
        return { ...rest, cam_sayisi, siparis_listesi: Array.from(siparisMap.values()) } as UretimEmri
      })
      setEmirler(enriched)
    }
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

    // Seçilen siparişlerin cam parçalarını getir — sadece bekliyor/kesildi olanları al
    const { data: detaylar, error: detayHata } = await supabase
      .from('siparis_detaylari')
      .select('id')
      .in('siparis_id', siparisIds)
      .or('uretim_durumu.in.(bekliyor,kesildi),uretim_durumu.is.null')
      .order('created_at')

    if (detayHata) throw new Error(detayHata.message)
    if ((detaylar ?? []).length === 0) {
      await supabase.from('uretim_emirleri').delete().eq('id', uretimEmriId)
      throw new Error('Seçilen siparişlerde üretime alınacak cam detayı bulunamadı.')
    }

    // Aynı cam başka bir aktif batch'e zaten eklenmiş olabilir
    // (örn. eksik_var senaryosu). Bu detayları hariç tut — bir cam yalnızca tek batch'te bulunabilir.
    let eklenecekDetaylar = detaylar ?? []
    if (eklenecekDetaylar.length > 0) {
      const detayIdleri = eklenecekDetaylar.map(d => d.id)
      const { data: zatenBatchte, error: kontrolHata } = await supabase
        .from('uretim_emri_detaylari')
        .select('siparis_detay_id, uretim_emirleri!inner(durum)')
        .in('siparis_detay_id', detayIdleri)
        .neq('uretim_emirleri.durum', 'iptal')
      if (kontrolHata) throw new Error(kontrolHata.message)
      const batchtekiSet = new Set((zatenBatchte ?? []).map(d => d.siparis_detay_id))
      eklenecekDetaylar = eklenecekDetaylar.filter(d => !batchtekiSet.has(d.id))
    }

    if (eklenecekDetaylar.length === 0) {
      // Hiç eklenecek cam yok — boş batch'i geri al, kullanıcıyı bilgilendir
      await supabase.from('uretim_emirleri').delete().eq('id', uretimEmriId)
      throw new Error('Seçilen siparişlerdeki tüm camlar zaten başka bir batch\'te. Yeni batch oluşturulmadı.')
    }

    // Toplu olarak batch'e ekle
    const satirlar = eklenecekDetaylar.map((d, i) => ({
      uretim_emri_id: uretimEmriId,
      siparis_detay_id: d.id,
      sira_no: i + 1,
    }))
    const { error: eklemeHata } = await supabase
      .from('uretim_emri_detaylari')
      .insert(satirlar)
    if (eklemeHata) throw new Error(eklemeHata.message)

    // Sadece bu batch'e gerçekten cam eklenen siparişlerin durumunu 'batchte' yap.
    // (Tüm camları zaten başka batch'te olan siparişlerin durumunu değiştirme.)
    const eklenenDetayIds = eklenecekDetaylar.map(d => d.id)
    const { data: eklenenSipDetaylari, error: sipDetayHata } = await supabase
      .from('siparis_detaylari')
      .select('siparis_id')
      .in('id', eklenenDetayIds)
    if (sipDetayHata) throw new Error(sipDetayHata.message)
    const guncellenecekSipIds = [...new Set((eklenenSipDetaylari ?? []).map(d => d.siparis_id))]
    if (guncellenecekSipIds.length > 0) {
      const { error: siparisGuncelleHata } = await supabase
        .from('siparisler')
        .update({ durum: 'batchte' })
        .in('id', guncellenecekSipIds)
        .or('durum.eq.beklemede,durum.eq.eksik_var,durum.is.null')
      if (siparisGuncelleHata) throw new Error(siparisGuncelleHata.message)
    }

    await getir()
    return uretimEmriId
  }

  const durumGuncelle = async (id: string, durum: UretimEmriDurum) => {
    // Durum geçiş kontrolü
    let mevcut = emirler.find(e => e.id === id)
    if (!mevcut) {
      const { data, error } = await supabase
        .from('uretim_emirleri')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Üretim emri bulunamadı.')
      mevcut = data as UretimEmri
    }
    const gecerli = GECERLI_GECISLER[mevcut.durum]
    if (!gecerli.includes(durum)) {
      throw new Error(`Geçersiz durum geçişi: ${mevcut.durum} → ${durum}`)
    }
    const { error } = await supabase.from('uretim_emirleri').update({ durum }).eq('id', id)
    if (error) throw new Error(error.message)
    await getir()
  }

  const sil = async (id: string) => {
    // 1. Batch'teki sipariş ID'lerini bul
    const { data: batchDetaylar, error: batchDetayHata } = await supabase
      .from('uretim_emri_detaylari')
      .select('siparis_detay_id')
      .eq('uretim_emri_id', id)
    if (batchDetayHata) throw new Error(batchDetayHata.message)

    const detayIds = (batchDetaylar ?? []).map(d => d.siparis_detay_id)

    // Sipariş ID'lerini bul
    let siparisIds: string[] = []
    if (detayIds.length > 0) {
      const { data: sipDetaylar, error: sipDetayHata } = await supabase
        .from('siparis_detaylari')
        .select('siparis_id')
        .in('id', detayIds)
      if (sipDetayHata) throw new Error(sipDetayHata.message)
      siparisIds = [...new Set((sipDetaylar ?? []).map(d => d.siparis_id))]
    }

    // 2. Batch'i sil (CASCADE ile detaylar da silinir)
    const { error } = await supabase.from('uretim_emirleri').delete().eq('id', id)
    if (error) throw new Error(error.message)

    // 3. Artık başka batch'te olmayan siparişleri 'beklemede'ye döndür
    if (siparisIds.length > 0) {
      // Tüm siparis_detaylari al
      const { data: tumDetaylar, error: tumDetayHata } = await supabase
        .from('siparis_detaylari')
        .select('id, siparis_id')
        .in('siparis_id', siparisIds)
      if (tumDetayHata) throw new Error(tumDetayHata.message)

      const tumDetayIds = (tumDetaylar ?? []).map(d => d.id)

      // Hâlâ başka batch'te olan detayları bul
      const { data: halaBatchte, error: halaBatchHata } = tumDetayIds.length > 0
        ? await supabase
            .from('uretim_emri_detaylari')
            .select('siparis_detay_id, uretim_emirleri!inner(durum)')
            .in('siparis_detay_id', tumDetayIds)
            .neq('uretim_emirleri.durum', 'iptal')
        : { data: [] }
      if (halaBatchHata) throw new Error(halaBatchHata.message)

      const halaBatchDetayIds = new Set((halaBatchte ?? []).map(d => d.siparis_detay_id))

      // Hiçbir camı batch'te olmayan siparişleri resetle
      const resetSiparisIds = siparisIds.filter(sipId => {
        const sipDetaylar = (tumDetaylar ?? []).filter(d => d.siparis_id === sipId)
        return !sipDetaylar.some(d => halaBatchDetayIds.has(d.id))
      })

      if (resetSiparisIds.length > 0) {
        const { error: resetHata } = await supabase
          .from('siparisler')
          .update({ durum: 'beklemede' })
          .in('id', resetSiparisIds)
          .eq('durum', 'batchte')
        if (resetHata) throw new Error(resetHata.message)
      }
    }

    await getir()
  }

  const iptalEt = async (id: string) => {
    let mevcut = emirler.find(e => e.id === id)
    if (!mevcut) {
      const { data, error } = await supabase
        .from('uretim_emirleri')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Üretim emri bulunamadı.')
      mevcut = data as UretimEmri
    }
    const gecerli = GECERLI_GECISLER[mevcut.durum]
    if (!gecerli.includes('iptal')) {
      throw new Error(`Geçersiz durum geçişi: ${mevcut.durum} → iptal`)
    }

    // 1. Batch'teki sipariş ID'lerini bul
    const { data: batchDetaylar, error: batchDetayHata } = await supabase
      .from('uretim_emri_detaylari')
      .select('siparis_detay_id')
      .eq('uretim_emri_id', id)
    if (batchDetayHata) throw new Error(batchDetayHata.message)

    const detayIds = (batchDetaylar ?? []).map(d => d.siparis_detay_id)

    let siparisIds: string[] = []
    if (detayIds.length > 0) {
      const { data: sipDetaylar, error: sipDetayHata } = await supabase
        .from('siparis_detaylari')
        .select('siparis_id')
        .in('id', detayIds)
      if (sipDetayHata) throw new Error(sipDetayHata.message)
      siparisIds = [...new Set((sipDetaylar ?? []).map(d => d.siparis_id))]
    }

    // 2. Batch durumunu 'iptal' yap
    const { error } = await supabase.from('uretim_emirleri').update({ durum: 'iptal' }).eq('id', id)
    if (error) throw new Error(error.message)

    // 3. Siparişleri 'beklemede'ye döndür
    if (siparisIds.length > 0) {
      const { error: siparisGuncelleHata } = await supabase
        .from('siparisler')
        .update({ durum: 'beklemede' })
        .in('id', siparisIds)
        .eq('durum', 'batchte')
      if (siparisGuncelleHata) throw new Error(siparisGuncelleHata.message)
    }

    await getir()
  }

  return { emirler, yukleniyor, hata, yeniBatch, durumGuncelle, sil, iptalEt, yenile: getir }
}

/** Bir batch'in detaylarını (cam listesi) getirir */
export async function getBatchDetaylari(uretimEmriId: string): Promise<UretimEmriDetay[]> {
  const { data, error } = await supabase
    .from('uretim_emri_detaylari')
    .select(`
      id, uretim_emri_id, siparis_detay_id, sira_no,
      siparis_detaylari (
        cam_kodu, genislik_mm, yukseklik_mm, adet, katman_yapisi, kenar_islemi, notlar, poz, cita_stok_id,
        stok!stok_id ( ad, kalinlik_mm ),
        cita_stok:stok!cita_stok_id ( ad, kalinlik_mm ),
        siparisler ( id, siparis_no, alt_musteri, cari ( ad ) )
      )
    `)
    .eq('uretim_emri_id', uretimEmriId)
    .order('sira_no')

  if (error) throw new Error(error.message)
  return data as unknown as UretimEmriDetay[]
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
