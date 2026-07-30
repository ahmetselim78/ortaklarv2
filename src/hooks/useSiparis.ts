import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { generateSiparisNo } from '@/lib/idGenerator'
import { tekilSiparisDetayRows } from '@/lib/siparisDetay'
import { tumSatirlariGetir } from '@/lib/supabasePagination'
import { recordSessionAction } from '@/lib/deviceSession'
import {
  fiyatliSiparisIptal,
  fiyatliSiparisGuncelle,
  fiyatliSiparisOlustur,
  fiyatOnizle,
  yeniIdempotencyAnahtari,
  siparisRevizyonBelgesineDonustur,
  siparisRevizyonHazirliginiGetir,
  siparisTicariBelgesineDonustur,
  ticariModDurumunuGetir,
  TicariRpcError,
} from '@/services/ticariService'
import type { Siparis, SiparisDetay, SiparisDurum, YeniSiparisForm } from '@/types/siparis'
import type { FiyatOnizlemesi, TicariMod } from '@/types/ticari'

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
  const [ticariMod, setTicariMod] = useState<TicariMod | null>(null)
  const [ticariModYukleniyor, setTicariModYukleniyor] = useState(true)
  const [ticariModHata, setTicariModHata] = useState<string | null>(null)
  // Mutasyon sonrası (ekle/sil/durumGuncelle) aynı filtre+sayfa ile yeniden çekmek için.
  const sonFiltreRef = useRef<SiparisFiltre>(VARSAYILAN_FILTRE)
  const onizlemeIdempotencyRef = useRef<Map<string, string>>(new Map())

  const ticariModuYenile = useCallback(async () => {
    setTicariModYukleniyor(true)
    try {
      const durum = await ticariModDurumunuGetir()
      if (!durum) throw new Error('Ticari mod durumu bulunamadı.')
      setTicariMod(durum.mod)
      setTicariModHata(null)
      return durum.mod
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : 'Ticari mod okunamadı.'
      setTicariMod(null)
      setTicariModHata(mesaj)
      throw new Error(`Ticari mod doğrulanamadığı için sipariş işlemi güvenli biçimde durduruldu: ${mesaj}`)
    } finally {
      setTicariModYukleniyor(false)
    }
  }, [])

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
      .select('*, cari(ad, kod), siparis_detaylari(adet), sevkiyat_planlari(id, tarih), aktif_fiyat_revizyon:siparis_fiyat_revizyonlari!siparisler_aktif_fiyat_revizyon_fk(genel_toplam, para_birimi)', { count: 'exact' })
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

  useEffect(() => {
    void ticariModuYenile().catch(() => undefined)
    const kanal = supabase
      .channel('ticari-mod-siparis')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ticari_modul_durumu' },
        () => { void ticariModuYenile().catch(() => undefined) },
      )
      .subscribe()
    return () => { void supabase.removeChannel(kanal) }
  }, [ticariModuYenile])

  const legacySiparisEkle = async (form: YeniSiparisForm) => {
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
    recordSessionAction('order_create')
    return { id: siparisId, siparis_no: siparis.siparis_no as string, teslim_tarihi: siparis.teslim_tarihi as string | null }
  }

  const fiyatOnizlemesiOlustur = async (form: YeniSiparisForm): Promise<FiyatOnizlemesi> => {
    const mod = await ticariModuYenile()
    if (mod === 'bakim') {
      throw new TicariRpcError('FEATURE_MODE_ISLEME_KAPALI')
    }
    if (mod !== 'aktif') {
      throw new Error('Kesin fiyat önizlemesi yalnız ticari mod aktifken sipariş kaydı için kullanılır.')
    }
    return fiyatOnizle(siparisTicariBelgesineDonustur(form))
  }

  const ekle = async (form: YeniSiparisForm, onizleme?: FiyatOnizlemesi | null) => {
    const mod = await ticariModuYenile()
    if (mod === 'bakim') {
      throw new TicariRpcError('FEATURE_MODE_ISLEME_KAPALI')
    }
    if (mod === 'hazirlik' || mod === 'golge') {
      return legacySiparisEkle(form)
    }
    if (!onizleme) {
      throw new Error('Aktif ticari modda sipariş, kullanıcı tarafından onaylanmış kesin fiyat önizlemesi olmadan kaydedilemez.')
    }
    if (!onizleme.sonuc.gecerli) {
      throw new Error('Hatalı fiyat önizlemesiyle sipariş kaydedilemez.')
    }

    const belge = siparisTicariBelgesineDonustur(form)
    const idempotencyKey = onizlemeIdempotencyRef.current.get(onizleme.onizleme_id)
      ?? yeniIdempotencyAnahtari()
    onizlemeIdempotencyRef.current.set(onizleme.onizleme_id, idempotencyKey)
    const sonuc = await fiyatliSiparisOlustur(belge, onizleme, idempotencyKey)
    onizlemeIdempotencyRef.current.delete(onizleme.onizleme_id)
    await Promise.all([getir(), durumSayilariniYenile()])
    recordSessionAction('order_create')
    return {
      id: String(sonuc.siparis_id),
      siparis_no: String(sonuc.siparis_no),
      teslim_tarihi: form.teslim_tarihi || null,
    }
  }

  const fiyatRevizyonOnizlemesiOlustur = async (
    siparis: Siparis,
    form: YeniSiparisForm,
  ): Promise<FiyatOnizlemesi> => {
    const mod = await ticariModuYenile()
    if (mod !== 'aktif') throw new TicariRpcError('FEATURE_MODE_ISLEME_KAPALI')
    if (!Number.isInteger(siparis.revision_no)) {
      throw new TicariRpcError('REVISION_CONFLICT')
    }
    return fiyatOnizle(siparisRevizyonBelgesineDonustur(form, siparis))
  }

  const fiyatRevizyonuKaydet = async (
    siparis: Siparis,
    revizyonTuru: 'teknik' | 'ticari',
    form: YeniSiparisForm,
    onizleme?: FiyatOnizlemesi | null,
  ) => {
    const mod = await ticariModuYenile()
    if (mod !== 'aktif') throw new TicariRpcError('FEATURE_MODE_ISLEME_KAPALI')
    if (!Number.isInteger(siparis.revision_no)) {
      throw new TicariRpcError('REVISION_CONFLICT')
    }
    if (!onizleme?.sonuc.gecerli) {
      throw new Error('Fiyat revizyonu, incelenmiş geçerli kesin önizleme olmadan kaydedilemez.')
    }

    const belge = siparisRevizyonBelgesineDonustur(form, siparis)
    const idempotencyKey = onizlemeIdempotencyRef.current.get(onizleme.onizleme_id)
      ?? yeniIdempotencyAnahtari()
    onizlemeIdempotencyRef.current.set(onizleme.onizleme_id, idempotencyKey)
    const sonuc = await fiyatliSiparisGuncelle(
      siparis.id,
      siparis.revision_no as number,
      revizyonTuru,
      belge,
      onizleme,
      idempotencyKey,
    )
    onizlemeIdempotencyRef.current.delete(onizleme.onizleme_id)
    recordSessionAction('order_update')
    await Promise.all([getir(), durumSayilariniYenile()])
    return sonuc
  }

  const durumGuncelle = async (id: string, durum: SiparisDurum) => {
    // Durum geçiş kontrolü
    const mevcut = siparisler.find(s => s.id === id)
    if (durum === 'iptal' && mevcut?.fiyatlandirildi) {
      throw new Error('Fiyatlandırılmış siparişler yalnız finansal etkisini dengeleyen iptal işlemiyle iptal edilebilir.')
    }
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
    recordSessionAction('order_status_update')
    await Promise.all([getir(), durumSayilariniYenile()])
  }

  const iptal = async (siparis: Siparis, gerekce: string, idempotencyKey?: string) => {
    if (!siparis.fiyatlandirildi) {
      await durumGuncelle(siparis.id, 'iptal')
      return
    }

    let revisionNo = siparis.revision_no
    if (!Number.isInteger(revisionNo)) {
      const { data, error } = await supabase
        .from('siparisler')
        .select('revision_no, fiyatlandirildi')
        .eq('id', siparis.id)
        .single()
      if (error) throw new Error(error.message)
      if (!data?.fiyatlandirildi || !Number.isInteger(data.revision_no)) {
        throw new Error('Siparişin güncel fiyat revizyonu doğrulanamadı.')
      }
      revisionNo = data.revision_no as number
    }

    await fiyatliSiparisIptal(
      siparis.id,
      revisionNo as number,
      gerekce,
      idempotencyKey || yeniIdempotencyAnahtari(),
    )
    recordSessionAction('order_cancel')
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
    recordSessionAction('order_update')
    await getir()
  }

  const sil = async (id: string) => {
    const listed = siparisler.find((siparis) => siparis.id === id)
    let fiyatlandirildi = listed?.fiyatlandirildi
    if (fiyatlandirildi == null) {
      const { data, error: kontrolHatasi } = await supabase
        .from('siparisler')
        .select('fiyatlandirildi')
        .eq('id', id)
        .single()
      if (kontrolHatasi) throw new Error(kontrolHatasi.message)
      fiyatlandirildi = data?.fiyatlandirildi === true
    }
    if (fiyatlandirildi) {
      throw new TicariRpcError('FIYATLI_SIPARIS_SILINEMEZ')
    }
    // siparis_detaylari CASCADE ile otomatik silinir
    const { error } = await supabase.from('siparisler').delete().eq('id', id)
    if (error) throw new Error(error.message)
    recordSessionAction('order_delete')
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
    iptal,
    sil,
    yenile: getir,
    ekleIlerleme,
    fiyatOnizlemesiOlustur,
    fiyatRevizyonOnizlemesiOlustur,
    fiyatRevizyonuKaydet,
    siparisRevizyonHazirliginiGetir,
    ticariMod,
    ticariModYukleniyor,
    ticariModHata,
    ticariModuYenile,
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
        .eq('aktif', true)
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
