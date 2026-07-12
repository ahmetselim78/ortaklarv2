/**
 * Supabase/PostgREST varsayılan olarak `.range()`/`.limit()` verilmeyen
 * sorguları `max_rows` (bu projede 1000, bkz. `supabase/config.toml`) satırda
 * SESSİZCE keser. Bu dosya, 1000+ satır dönebilecek her sorgu için ortak,
 * test edilmiş bir sayfalama yardımcısı sağlar.
 *
 * Kullanım:
 *   const satirlar = await tumSatirlariGetir(
 *     (from, to) =>
 *       supabase
 *         .from('siparis_detaylari')
 *         .select('id, adet', { count: 'exact' })
 *         .eq('siparis_id', siparisId)
 *         .range(from, to),
 *     { baglam: `siparis ${siparisId}` },
 *   )
 */

export interface SayfaSonucu<T> {
  data: T[] | null
  error: { message: string } | null
  count?: number | null
}

export interface TumSatirlariGetirOpsiyon {
  /** Her sayfada istenecek satır sayısı. Varsayılan 1000 (Supabase max_rows ile aynı). */
  pageSize?: number
  /** Hata mesajlarında gösterilecek bağlam bilgisi (örn. "batch BATCH-2026-0001"). */
  baglam?: string
}

/**
 * Sayfalama döngüsüyle TÜM satırları toplar. `sorguFn`, verilen `from`/`to`
 * aralığına `.range()` uygulanmış bir sorgu ÇALIŞTIRIP sonucunu döndürmelidir
 * (yeniden kullanılabilir bir builder değil — her çağrıda taze bir sorgu).
 *
 * Sorgu `{ count: 'exact' }` ile seçim yaparsa, toplanan satır sayısı sunucu
 * tarafındaki gerçek `count` ile karşılaştırılır; uyuşmazsa (sessiz veri kaybı
 * ihtimaline karşı) hata fırlatılır.
 */
export async function tumSatirlariGetir<T>(
  sorguFn: (from: number, to: number) => PromiseLike<SayfaSonucu<T>>,
  opsiyonlar: TumSatirlariGetirOpsiyon = {},
): Promise<T[]> {
  const pageSize = opsiyonlar.pageSize ?? 1000
  if (pageSize <= 0) throw new Error('pageSize 0dan buyuk olmali.')

  const sonuc: T[] = []
  let beklenenToplam: number | null = null
  let from = 0

  for (;;) {
    const { data, error, count } = await sorguFn(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (count != null) beklenenToplam = count

    const sayfa = data ?? []
    sonuc.push(...sayfa)

    // Normal bitiş: sayfa doluluğu pageSize'dan az geldiyse veri bitmiştir.
    // Ek güvenlik: count biliniyorsa ve beklenen sayıya ulaşıldıysa da dur —
    // `.range()`'i yanlış uygulayan bir sorgu fonksiyonu sonsuz döngüye girmesin.
    if (sayfa.length < pageSize) break
    if (beklenenToplam != null && sonuc.length >= beklenenToplam) break
    from += pageSize
  }

  if (beklenenToplam != null && sonuc.length !== beklenenToplam) {
    const baglam = opsiyonlar.baglam ? ` (${opsiyonlar.baglam})` : ''
    throw new Error(
      `Veri eksik okundu${baglam}: sunucuda ${beklenenToplam} satır var, ${sonuc.length} satır alındı. ` +
      'İşlem güvenlik için durduruldu.',
    )
  }

  return sonuc
}
