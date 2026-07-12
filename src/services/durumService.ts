import { supabase } from '@/lib/supabase'
import { tumSatirlariGetir } from '@/lib/supabasePagination'
import type { SiparisDurum } from '@/types/siparis'
import type { UretimEmriDurum } from '@/types/uretim'

/**
 * Sipariş ve üretim emri durumlarının TEK merkezi hesaplama noktası.
 *
 * Bu dosyadaki iki fonksiyon, siparis_detaylari.uretim_durumu ve
 * tamir_kayitlari.durum verisinden siparisler.durum / uretim_emirleri.durum
 * alanlarını türetir. Batch oluşturma, batch iptal/silme, cam okutma,
 * tamire gönderme, hurda yapma ve tamir tamamlama işlemlerinden SONRA
 * çağrılmalıdır — bu işlemler artık sipariş/batch durumunu doğrudan
 * set etmemeli, bu fonksiyonları çağırmalıdır.
 *
 * `iptal` durumu her iki tabloda da sadece manuel olarak (durumGuncelle /
 * iptalEt) set edilir; bu fonksiyonlar `iptal` durumundaki kayıtlara
 * dokunmaz.
 */

const IN_CHUNK_SIZE = 100

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

type BatchDurumJoin = { durum: string | null } | { durum: string | null }[] | null

function joinedDurum(joined: BatchDurumJoin): string | undefined {
  if (!joined) return undefined
  const row = Array.isArray(joined) ? joined[0] : joined
  return row?.durum ?? undefined
}

async function bekleyenTamirSayisiGetir(filtre: { siparisDetayIds?: string[]; uretimEmriId?: string }): Promise<number> {
  if (filtre.uretimEmriId) {
    const { count, error } = await supabase
      .from('tamir_kayitlari')
      .select('id', { count: 'exact', head: true })
      .eq('durum', 'bekliyor')
      .eq('uretim_emri_id', filtre.uretimEmriId)
    if (error) throw new Error(error.message)
    return count ?? 0
  }

  const detayIds = filtre.siparisDetayIds ?? []
  if (detayIds.length === 0) return 0

  let toplam = 0
  for (const chunk of chunkArray(detayIds, IN_CHUNK_SIZE)) {
    const { count, error } = await supabase
      .from('tamir_kayitlari')
      .select('id', { count: 'exact', head: true })
      .eq('durum', 'bekliyor')
      .in('siparis_detay_id', chunk)
    if (error) throw new Error(error.message)
    toplam += count ?? 0
  }
  return toplam
}

/**
 * Bir siparişin durumunu, kendi siparis_detaylari'nın uretim_durumu'ndan,
 * bağlı olduğu (iptal edilmemiş) üretim emirlerinin durumundan ve
 * bekleyen tamir kayıtlarından yeniden hesaplar ve gerekirse günceller.
 *
 * Karar sırası: tamamlandi > beklemede (hiç batch yok) > batchte
 * (batchlendi ama hiç tarama yok) > eksik_var / yikamada (kısmi).
 *
 * Not: Aynı batch'te birden fazla sipariş varsa, bir siparişin kendi
 * camları bitse de batch'in TAMAMI bitmeden o sipariş `tamamlandi`
 * olmaz — mevcut davranış korunuyor.
 */
export async function recalculateSiparisDurumu(siparisId: string): Promise<SiparisDurum | null> {
  const { data: siparis, error: siparisHata } = await supabase
    .from('siparisler')
    .select('durum')
    .eq('id', siparisId)
    .maybeSingle()
  if (siparisHata) throw new Error(siparisHata.message)
  if (!siparis) return null

  const mevcutDurum = siparis.durum as SiparisDurum
  if (mevcutDurum === 'iptal') return mevcutDurum

  // 1000+ satırlı siparişlerde sessiz veri kesilmesini önlemek için sayfalı okunur —
  // aksi halde durum hesaplaması büyük siparişlerde yanlış sonuç üretir (KANITLANMIŞ, bkz. plan Aşama 0).
  const detayListesi = await tumSatirlariGetir<{ id: string; uretim_durumu: string | null }>(
    (from, to) =>
      supabase
        .from('siparis_detaylari')
        .select('id, uretim_durumu', { count: 'exact' })
        .eq('siparis_id', siparisId)
        .range(from, to),
    { baglam: `sipariş ${siparisId} durum hesaplama` },
  )
  if (detayListesi.length === 0) return mevcutDurum

  const detayIds = detayListesi.map(d => d.id)
  const toplam = detayListesi.length
  const yikandiSayisi = detayListesi.filter(d => d.uretim_durumu === 'yikandi').length

  const batchBaglantilari: { siparis_detay_id: string; uretim_emirleri: BatchDurumJoin }[] = []
  for (const chunk of chunkArray(detayIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('uretim_emri_detaylari')
      .select('siparis_detay_id, uretim_emirleri(durum)')
      .in('siparis_detay_id', chunk)
    if (error) throw new Error(error.message)
    batchBaglantilari.push(...((data ?? []) as typeof batchBaglantilari))
  }

  const aktifBatchDurumlari = batchBaglantilari
    .map(row => joinedDurum(row.uretim_emirleri))
    .filter((durum): durum is string => !!durum && durum !== 'iptal')

  const bekleyenTamir = await bekleyenTamirSayisiGetir({ siparisDetayIds: detayIds })

  const tumBatchlerTamamlandi = aktifBatchDurumlari.length === 0
    || aktifBatchDurumlari.every(d => d === 'tamamlandi')

  let yeniDurum: SiparisDurum
  if (yikandiSayisi === toplam && tumBatchlerTamamlandi && bekleyenTamir === 0) {
    yeniDurum = 'tamamlandi'
  } else if (aktifBatchDurumlari.length === 0) {
    yeniDurum = 'beklemede'
  } else if (yikandiSayisi === 0 && aktifBatchDurumlari.every(d => d === 'hazirlaniyor' || d === 'export_edildi')) {
    yeniDurum = 'batchte'
  } else if (aktifBatchDurumlari.some(d => d === 'eksik_var')) {
    yeniDurum = 'eksik_var'
  } else if (aktifBatchDurumlari.some(d => d === 'yikamada')) {
    yeniDurum = 'yikamada'
  } else {
    yeniDurum = 'eksik_var'
  }

  if (yeniDurum === mevcutDurum) return mevcutDurum

  const patch: Record<string, unknown> = { durum: yeniDurum }
  if (yeniDurum === 'tamamlandi') patch.tamamlandi_tarihi = new Date().toISOString()
  else if (mevcutDurum === 'tamamlandi') patch.tamamlandi_tarihi = null

  const { error: guncelleHata } = await supabase.from('siparisler').update(patch).eq('id', siparisId)
  if (guncelleHata) throw new Error(guncelleHata.message)

  return yeniDurum
}

/**
 * Bir üretim emrinin (batch) durumunu, kendi uretim_emri_detaylari'nın
 * bağlı olduğu siparis_detaylari.uretim_durumu'ndan ve bu batch'e ait
 * bekleyen tamir kayıtlarından yeniden hesaplar ve gerekirse günceller.
 *
 * Bu fonksiyon SADECE `tamamlandi` / `eksik_var` kararını verir.
 * `hazirlaniyor` → `export_edildi` → `yikamada` geçişleri kullanıcı
 * etkileşimine (export, batch'e girme/çıkma) bağlı olduğu için burada
 * belirlenmez; hiç tarama yoksa mevcut durum korunur.
 */
export async function recalculateUretimEmriDurumu(uretimEmriId: string): Promise<UretimEmriDurum | null> {
  const { data: batch, error: batchHata } = await supabase
    .from('uretim_emirleri')
    .select('durum')
    .eq('id', uretimEmriId)
    .maybeSingle()
  if (batchHata) throw new Error(batchHata.message)
  if (!batch) return null

  const mevcutDurum = batch.durum as UretimEmriDurum
  if (mevcutDurum === 'iptal') return mevcutDurum

  // 1000+ camlı büyük batch'lerde sessiz veri kesilmesini önlemek için sayfalı okunur.
  type DetayRow = { siparis_detaylari: { uretim_durumu: string } | { uretim_durumu: string }[] | null }
  const detayListesi = await tumSatirlariGetir<DetayRow>(
    (from, to) =>
      supabase
        .from('uretim_emri_detaylari')
        .select('siparis_detaylari(uretim_durumu)', { count: 'exact' })
        .eq('uretim_emri_id', uretimEmriId)
        .range(from, to),
    { baglam: `batch ${uretimEmriId} durum hesaplama` },
  )
  if (detayListesi.length === 0) return mevcutDurum

  const toplam = detayListesi.length
  const yikandiSayisi = detayListesi.filter(d => {
    const detay = Array.isArray(d.siparis_detaylari) ? d.siparis_detaylari[0] : d.siparis_detaylari
    return detay?.uretim_durumu === 'yikandi'
  }).length

  const bekleyenTamir = await bekleyenTamirSayisiGetir({ uretimEmriId })

  let yeniDurum: UretimEmriDurum = mevcutDurum
  if (yikandiSayisi === toplam && bekleyenTamir === 0) {
    yeniDurum = 'tamamlandi'
  } else if (yikandiSayisi > 0 || bekleyenTamir > 0) {
    yeniDurum = 'eksik_var'
  }

  if (yeniDurum === mevcutDurum) return mevcutDurum

  const { error: guncelleHata } = await supabase
    .from('uretim_emirleri')
    .update({ durum: yeniDurum })
    .eq('id', uretimEmriId)
  if (guncelleHata) throw new Error(guncelleHata.message)

  return yeniDurum
}
