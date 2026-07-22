import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { generateBatchNo } from '@/lib/idGenerator'
import { recalculateSiparisDurumu, recalculateUretimEmriDurumu } from '@/services/durumService'
import { tumSatirlariGetir } from '@/lib/supabasePagination'
import { batchYikamaOzetiHesapla, yikamaLogSayilariGetir } from '@/lib/yikamaLoglari'
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

type UretimEmriDurumJoin = {
  siparis_detay_id: string
  uretim_emirleri?: { durum?: string | null } | { durum?: string | null }[] | null
}

const IN_FILTER_CHUNK_SIZE = 100
const INSERT_CHUNK_SIZE = 300

function joinDurum(row: UretimEmriDurumJoin) {
  const joined = row.uretim_emirleri
  return Array.isArray(joined) ? joined[0]?.durum : joined?.durum
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function batchtekiDetaylariGetir(detayIds: string[]) {
  const rows: UretimEmriDurumJoin[] = []
  for (const chunk of chunkArray(detayIds, IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('uretim_emri_detaylari')
      .select('siparis_detay_id, uretim_emirleri(durum)')
      .in('siparis_detay_id', chunk)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as UretimEmriDurumJoin[]))
  }
  return rows
}

async function siparisIdleriDetaylardanGetir(detayIds: string[]) {
  const siparisIds = new Set<string>()
  for (const chunk of chunkArray(detayIds, IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('siparis_detaylari')
      .select('siparis_id')
      .in('id', chunk)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      if (row.siparis_id) siparisIds.add(row.siparis_id)
    }
  }
  return [...siparisIds]
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
          id,
          siparis_detay_id,
          siparis_detaylari(
            adet,
            uretim_durumu,
            siparisler(id, siparis_no, alt_musteri, notlar, cari(ad))
          )
        )
      `)
      .order('olusturulma_tarihi', { ascending: false })

    if (error) {
      setHata(error.message)
    } else {
      const rawEmirler = data as any[]
      const emirIds = rawEmirler.map((e) => e.id as string)

      let logMap = new Map<string, number>()
      if (emirIds.length > 0) {
        try {
          logMap = await yikamaLogSayilariGetir(emirIds)
        } catch (err) {
          console.error('Yıkama logları alınamadı:', err)
        }
      }

      const enriched = rawEmirler.map((emir) => {
        const detaylar: any[] = emir.uretim_emri_detaylari ?? []
        const cam_sayisi = detaylar.reduce((sum, d) => sum + (d.siparis_detaylari?.adet ?? 1), 0)
        const { taranan: taranan_cam } = batchYikamaOzetiHesapla(
          detaylar.map((d) => ({
            id: d.id as string,
            siparis_detay_id: d.siparis_detay_id as string,
            uretim_durumu: d.siparis_detaylari?.uretim_durumu,
            adet: d.siparis_detaylari?.adet ?? 1,
          })),
          logMap,
        )
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
        const { uretim_emri_detaylari: kullanilanDetaylar, ...rest } = emir
        void kullanilanDetaylar
        return { ...rest, cam_sayisi, taranan_cam, siparis_listesi: Array.from(siparisMap.values()) } as UretimEmri
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

    // Seçilen siparişlerin cam parçalarını getir — sadece bekliyor/kesildi olanları al.
    // 1000+ satırlı siparişlerde Supabase'in varsayılan max_rows sınırını aşmamak için
    // sayfalı okunur (bkz. tumSatirlariGetir) — aksi halde büyük siparişlerden eksik batch oluşur.
    let detaylar: { id: string; siparis_id: string }[]
    try {
      detaylar = await tumSatirlariGetir<{ id: string; siparis_id: string }>(
        (from, to) =>
          supabase
            .from('siparis_detaylari')
            .select('id, siparis_id', { count: 'exact' })
            .in('siparis_id', siparisIds)
            .or('uretim_durumu.in.(bekliyor,kesildi),uretim_durumu.is.null')
            .order('created_at')
            .range(from, to),
        { baglam: 'yeni batch - uygun cam detayları' },
      )
    } catch (e) {
      await supabase.from('uretim_emirleri').delete().eq('id', uretimEmriId)
      throw e
    }
    if (detaylar.length === 0) {
      await supabase.from('uretim_emirleri').delete().eq('id', uretimEmriId)
      throw new Error('Seçilen siparişlerde üretime alınacak cam detayı bulunamadı.')
    }

    // Aynı cam başka bir aktif batch'e zaten eklenmiş olabilir
    // (örn. eksik_var senaryosu). Bu detayları hariç tut — bir cam yalnızca tek batch'te bulunabilir.
    let eklenecekDetaylar = detaylar
    if (eklenecekDetaylar.length > 0) {
      const detayIdleri = eklenecekDetaylar.map(d => d.id)
      const zatenBatchte = await batchtekiDetaylariGetir(detayIdleri)
      const batchtekiSet = new Set(
        zatenBatchte
          .filter(d => joinDurum(d) !== 'iptal')
          .map(d => d.siparis_detay_id)
      )
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
    for (const chunk of chunkArray(satirlar, INSERT_CHUNK_SIZE)) {
      const { error: eklemeHata } = await supabase
        .from('uretim_emri_detaylari')
        .insert(chunk)
      if (eklemeHata) {
        await supabase.from('uretim_emirleri').delete().eq('id', uretimEmriId)
        throw new Error(eklemeHata.message)
      }
    }

    // Sadece bu batch'e gerçekten cam eklenen siparişlerin durumunu yeniden hesapla.
    // (Tüm camları zaten başka batch'te olan siparişlerin durumunu değiştirme.)
    const guncellenecekSipIds = [...new Set(eklenecekDetaylar.map(d => d.siparis_id))]
    for (const sipId of guncellenecekSipIds) {
      await recalculateSiparisDurumu(sipId)
    }
    await recalculateUretimEmriDurumu(uretimEmriId)

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
      siparisIds = await siparisIdleriDetaylardanGetir(detayIds)
    }

    // 2. Batch'i sil (CASCADE ile detaylar da silinir)
    const { error } = await supabase.from('uretim_emirleri').delete().eq('id', id)
    if (error) throw new Error(error.message)

    // 3. Etkilenen siparişlerin durumunu yeniden hesapla
    // (hâlâ başka aktif batch'te camı varsa doğru duruma düşer, yoksa 'beklemede'ye döner)
    for (const sipId of siparisIds) {
      await recalculateSiparisDurumu(sipId)
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
      siparisIds = await siparisIdleriDetaylardanGetir(detayIds)
    }

    // 2. Batch durumunu 'iptal' yap
    const { error } = await supabase.from('uretim_emirleri').update({ durum: 'iptal' }).eq('id', id)
    if (error) throw new Error(error.message)

    // 3. Etkilenen siparişlerin durumunu yeniden hesapla
    // (hâlâ başka aktif batch'te camı varsa doğru duruma düşer, yoksa 'beklemede'ye döner)
    for (const sipId of siparisIds) {
      await recalculateSiparisDurumu(sipId)
    }

    await getir()
  }

  return { emirler, yukleniyor, hata, yeniBatch, durumGuncelle, sil, iptalEt, yenile: getir }
}

/** Bir batch'in detaylarını (cam listesi) getirir */
export async function getBatchDetaylari(uretimEmriId: string): Promise<UretimEmriDetay[]> {
  // 1000+ camlı büyük batch'lerde satır kesilmesin diye sayfalı okunur.
  const data = await tumSatirlariGetir(
    (from, to) =>
      supabase
        .from('uretim_emri_detaylari')
        .select(`
          id, uretim_emri_id, siparis_detay_id, sira_no,
          siparis_detaylari (
            cam_kodu, genislik_mm, yukseklik_mm, adet, uretim_durumu, kenar_islemi, notlar, poz, cita_stok_id,
            stok!stok_id ( kod, ad, grup, kalinlik_mm, katman_yapisi, birim_fiyat ),
            cita_stok:stok!cita_stok_id ( ad, kalinlik_mm ),
            siparisler ( id, siparis_no, harici_siparis_no, alt_musteri, cari ( ad ) )
          )
        `, { count: 'exact' })
        .eq('uretim_emri_id', uretimEmriId)
        .order('sira_no')
        .range(from, to),
    { baglam: `batch ${uretimEmriId} detayları` },
  )

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
