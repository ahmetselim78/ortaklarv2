import { describe, it, expect } from 'vitest'
import { tumSatirlariGetir } from './supabasePagination'

/** Verilen toplam satır sayısı için sahte, sayfalı bir Supabase sorgusu üretir. */
function mockSorgu(toplamSatir: number) {
  const tumSatirlar = Array.from({ length: toplamSatir }, (_, i) => ({ id: i + 1 }))
  return (from: number, to: number) => {
    const sayfa = tumSatirlar.slice(from, to + 1)
    return Promise.resolve({ data: sayfa, error: null, count: toplamSatir })
  }
}

describe('tumSatirlariGetir', () => {
  it('0 satır — boş sonuç döner', async () => {
    const sonuc = await tumSatirlariGetir(mockSorgu(0))
    expect(sonuc).toHaveLength(0)
  })

  it('999 satır — tek sayfada tam okunur (limit altında)', async () => {
    const sonuc = await tumSatirlariGetir(mockSorgu(999))
    expect(sonuc).toHaveLength(999)
    expect(sonuc[0]).toEqual({ id: 1 })
    expect(sonuc[998]).toEqual({ id: 999 })
  })

  it('1000 satır — tam sınırda, tek sayfa + boş ikinci sayfa kontrolü', async () => {
    const sonuc = await tumSatirlariGetir(mockSorgu(1000))
    expect(sonuc).toHaveLength(1000)
  })

  it('1001 satır — 2 sayfaya bölünüp eksiksiz toplanır (asıl regresyon senaryosu)', async () => {
    const sonuc = await tumSatirlariGetir(mockSorgu(1001))
    expect(sonuc).toHaveLength(1001)
    expect(sonuc[1000]).toEqual({ id: 1001 })
  })

  it('2500 satır — 3 sayfaya bölünüp eksiksiz toplanır', async () => {
    const sonuc = await tumSatirlariGetir(mockSorgu(2500))
    expect(sonuc).toHaveLength(2500)
    expect(sonuc[2499]).toEqual({ id: 2500 })
  })

  it('5000 satır — büyük veri seti (Kabul Kriteri: 5000 satır eksiksiz)', async () => {
    const sonuc = await tumSatirlariGetir(mockSorgu(5000))
    expect(sonuc).toHaveLength(5000)
  })

  it('özel pageSize ile de doğru çalışır', async () => {
    const sonuc = await tumSatirlariGetir(mockSorgu(250), { pageSize: 100 })
    expect(sonuc).toHaveLength(250)
  })

  it('sorgu hata döndürürse fırlatılır', async () => {
    const hatali = () => Promise.resolve({ data: null, error: { message: 'boom' }, count: null })
    await expect(tumSatirlariGetir(hatali)).rejects.toThrow('boom')
  })

  it('count ile toplanan satır sayısı uyuşmazsa hata fırlatır (sessiz veri kaybını engeller)', async () => {
    // Sunucu 1200 satır olduğunu söylüyor ama sorgu (örn. yanlış filtre/permission
    // yüzünden) sadece 999 satır döndürüp sayfayı bitiriyor — count/gerçek uyuşmazlığı.
    const yalanciSorgu = () =>
      Promise.resolve({
        data: Array.from({ length: 999 }, (_, i) => ({ id: i + 1 })),
        error: null,
        count: 1200,
      })
    await expect(tumSatirlariGetir(yalanciSorgu)).rejects.toThrow(/Veri eksik okundu/)
  })

  it('count verilmezse (head sorgusu yoksa) doğrulama atlanır ama veri eksiksiz döner', async () => {
    const tumSatirlar = Array.from({ length: 1500 }, (_, i) => ({ id: i + 1 }))
    const sorgu = (from: number, to: number) =>
      Promise.resolve({ data: tumSatirlar.slice(from, to + 1), error: null })
    const sonuc = await tumSatirlariGetir(sorgu)
    expect(sonuc).toHaveLength(1500)
  })
})
