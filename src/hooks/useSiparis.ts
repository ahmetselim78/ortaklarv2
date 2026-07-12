import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { generateSiparisNo } from '@/lib/idGenerator'
import { tekilSiparisDetayRows } from '@/lib/siparisDetay'
import { tumSatirlariGetir } from '@/lib/supabasePagination'
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

const DETAY_INSERT_CHUNK_SIZE = 300

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
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

/** Büyük siparişlerde (300+ satır) parçalı ekleme ilerlemesi. */
export interface EkleIlerleme {
  eklenen: number
  toplam: number
}

/**
 * Sipariş listesi için sunucu tarafı (server-side) filtre/sayfalama parametreleri.
 * `tamirdeIds` verilmişse `durum` yok sayılır — "Tamirde" özel bir DB kolonu değil,
 * tamir_kayitlari tablosundan türetilen bir id listesidir (bkz. SiparisPage).
 */
export interface SiparisFiltre {
  durum?: SiparisDurum
  tamirdeIds?: string[]
  cariId?: string
  altMusteri?: string
  sayfa: number
  sayfaBoyutu: number
}

export type SiparisDurumSayilari = Record<SiparisDurum, number> & { hepsi: number }

const TUM_DURUMLAR: SiparisDurum[] = ['beklemede', 'batchte', 'yikamada', 'tamamlandi', 'eksik_var', 'iptal']

const BOS_DURUM_SAYILARI: SiparisDurumSayilari = {
  hepsi: 0, beklemede: 0, batchte: 0, yikamada: 0, tamamlandi: 0, eksik_var: 0, iptal: 0,
}

const VARSAYILAN_FILTRE: SiparisFiltre = { sayfa: 1, sayfaBoyutu: 20 }

export function useSiparis() {
  const [siparisler, setSiparisler] = useState<Siparis[]>([])
  const [toplamKayit, setToplamKayit] = useState(0)
  const [durumSayilari, setDurumSayilari] = useState<SiparisDurumSayilari>(BOS_DURUM_SAYILARI)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [ekleIlerleme, setEkleIlerleme] = useState<EkleIlerleme | null>(null)
  // Mutasyon sonrası (ekle/sil/durumGuncelle) aynı filtre+sayfa ile yeniden çekmek için.
  const sonFiltreRef = useRef<SiparisFiltre>(VARSAYILAN_FILTRE)

  // Liste artık sunucu tarafında filtrelenip sayfalanıyor (bkz. plan Aşama 3.2) —
  // büyük sipariş sayısında tüm tabloyu çekmek yerine sadece görünen sayfa alınır.
  const getir = useCallback(async (filtre: SiparisFiltre = sonFiltreRef.current) => {
    sonFiltreRef.current = filtre
    setYukleniyor(true)
    setHata(null)

    // "Tamirde" filtresi siparisler tablosunda bir kolon değil; boş id listesi
    // "hiç sonuç yok" anlamına gelir — .in('id', []) PostgREST'te hataya düşer.
    if (filtre.tamirdeIds && filtre.tamirdeIds.length === 0) {
      setSiparisler([])
      setToplamKayit(0)
      setYukleniyor(false)
      return
    }

    let query = supabase
      .from('siparisler')
      .select('*, cari(ad, kod), siparis_detaylari(adet), sevkiyat_planlari(id, tarih)', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (filtre.tamirdeIds) query = query.in('id', filtre.tamirdeIds)
    else if (filtre.durum) query = query.eq('durum', filtre.durum)

    if (filtre.cariId) query = query.eq('cari_id', filtre.cariId)
    if (filtre.altMusteri?.trim()) query = query.ilike('alt_musteri', `%${filtre.altMusteri.trim()}%`)

    const from = (filtre.sayfa - 1) * filtre.sayfaBoyutu
    const to = from + filtre.sayfaBoyutu - 1
    const { data, error, count } = await query.range(from, to)

    if (error) {
      setHata(error.message)
    } else {
      setSiparisler((data ?? []) as Siparis[])
      setToplamKayit(count ?? 0)
    }
    setYukleniyor(false)
  }, [])

  // Durum sekmelerindeki rozet sayıları (Hepsi/Beklemede/.../İptal) — her biri
  // tek satırlık head:true count sorgusu, tüm tabloyu çekmez (idx_siparisler_durum kullanır).
  const durumSayilariniYenile = useCallback(async () => {
    const [hepsiRes, ...digerResults] = await Promise.all([
      supabase.from('siparisler').select('id', { count: 'exact', head: true }),
      ...TUM_DURUMLAR.map(d => supabase.from('siparisler').select('id', { count: 'exact', head: true }).eq('durum', d)),
    ])
    const sonuc: SiparisDurumSayilari = { ...BOS_DURUM_SAYILARI, hepsi: hepsiRes.count ?? 0 }
    TUM_DURUMLAR.forEach((d, i) => { sonuc[d] = digerResults[i].count ?? 0 })
    setDurumSayilari(sonuc)
  }, [])

  // Not: getir() burada otomatik çağrılmaz — filtre/sayfa durumu SiparisPage'de
  // yaşadığı için ilk yükleme de dahil tüm çağrılar page'in effect'inden gelir.
  useEffect(() => { durumSayilariniYenile() }, [durumSayilariniYenile])

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
        durum: 'beklemede',
      })
      .select()
      .single()

    if (siparisHata) throw new Error(siparisHata.message)

    // 3. Formdaki adetleri fiziksel cam satirlarina genislet.
    const siparisId = siparis.id as string
    const detaylar = await tekilSiparisDetayRows(siparisId, form.camlar)

    const toplamSatir = detaylar.length
    setEkleIlerleme({ eklenen: 0, toplam: toplamSatir })
    try {
      // Büyük siparişlerde (1000+ satır) tek istekte insert edilmemesi için parçalara bölünür.
      let eklenen = 0
      for (const chunk of chunkArray(detaylar, DETAY_INSERT_CHUNK_SIZE)) {
        const { error: detayHata } = await supabase.from('siparis_detaylari').insert(chunk)
        if (detayHata) throw new Error(detayHata.message)
        eklenen += chunk.length
        setEkleIlerleme({ eklenen, toplam: toplamSatir })
      }

      // Sessiz kısmi ekleme ihtimaline karşı son doğrulama: DB'deki gerçek satır
      // sayısı, eklenmesi istenen satır sayısıyla birebir uyuşmalı.
      const { count, error: sayimHata } = await supabase
        .from('siparis_detaylari')
        .select('id', { count: 'exact', head: true })
        .eq('siparis_id', siparisId)
      if (sayimHata) throw new Error(sayimHata.message)
      if ((count ?? 0) !== detaylar.length) {
        throw new Error(
          `Sipariş detayları eksik eklendi: beklenen ${detaylar.length} satır, ${count ?? 0} satır bulundu.`,
        )
      }
    } catch (e) {
      // Kısmi/başarısız ekleme durumunda yarım kalan siparişi geri al
      // (CASCADE ile o ana kadar eklenen detay satırları da silinir).
      await supabase.from('siparisler').delete().eq('id', siparisId)
      throw e
    } finally {
      setEkleIlerleme(null)
    }

    await Promise.all([getir(), durumSayilariniYenile()])
    return { id: siparisId, siparis_no: siparis.siparis_no as string, teslim_tarihi: siparis.teslim_tarihi as string | null }
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
    await Promise.all([getir(), durumSayilariniYenile()])
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
    await Promise.all([getir(), durumSayilariniYenile()])
  }

  return {
    siparisler,
    toplamKayit,
    durumSayilari,
    yukleniyor,
    hata,
    ekle,
    guncelle,
    durumGuncelle,
    sil,
    yenile: getir,
    ekleIlerleme,
  }
}

export async function getSiparisDetaylari(siparisId: string): Promise<SiparisDetay[]> {
  // 1000+ satırlı büyük siparişlerde Supabase'in varsayılan max_rows sınırını
  // aşmamak için sayfalı okunur (bkz. plan Aşama 0 — kanıtlanmış veri kesilmesi).
  const data = await tumSatirlariGetir(
    (from, to) =>
      supabase
        .from('siparis_detaylari')
        .select('*, stok:stok!stok_id(kod, ad, grup, kalinlik_mm, katman_yapisi, birim_fiyat), cita_stok:stok!cita_stok_id(ad, kalinlik_mm)', { count: 'exact' })
        .eq('siparis_id', siparisId)
        // İki seviyeli sıralama: önce created_at, sonra cam_kodu (tie-break).
        // PDF import gibi toplu insert'lerde aynı created_at'e sahip satırlar olabilir;
        // tek kolonlu order'da Postgres deterministik sıra garanti etmez ve update
        // sonrası satırların yeri "karışık" görünür.
        .order('created_at', { ascending: true })
        .order('cam_kodu', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, to),
    { baglam: `sipariş ${siparisId} detayları` },
  )

  return data as SiparisDetay[]
}
