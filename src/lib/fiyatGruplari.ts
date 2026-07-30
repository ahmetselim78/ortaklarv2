import type { FiyatHesapSonucu, FiyatUrunGrubu } from '@/types/ticari'

const sayi = (deger: unknown) => {
  const sonuc = Number(deger)
  return Number.isFinite(sonuc) ? sonuc : 0
}

export function fiyatUrunGruplariniGetir(sonuc: FiyatHesapSonucu): FiyatUrunGrubu[] {
  if (sonuc.urun_gruplari?.length) return sonuc.urun_gruplari

  const gruplar = new Map<string, FiyatUrunGrubu>()
  for (const satir of sonuc.satirlar ?? []) {
    const mevcut = gruplar.get(satir.stok_id)
    const gercekM2 = sayi(satir.genislik_mm)
      * sayi(satir.yukseklik_mm)
      * sayi(satir.adet)
      / 1_000_000
    if (mevcut) {
      mevcut.adet += sayi(satir.adet)
      mevcut.gercek_m2 += gercekM2
      mevcut.faturalanabilir_m2 += sayi(satir.faturalanabilir_m2)
      mevcut.grup_toplami += sayi(satir.net_tutar)
      if (mevcut.birim_fiyat !== sayi(satir.birim_fiyat)) {
        mevcut.fiyat_durumu = 'birden_fazla_baglanti'
      }
      continue
    }

    gruplar.set(satir.stok_id, {
      stok_id: satir.stok_id,
      stok_kodu: '',
      stok_adi: `Ürün ${satir.stok_id.slice(0, 8)}`,
      adet: sayi(satir.adet),
      gercek_m2: gercekM2,
      faturalanabilir_m2: sayi(satir.faturalanabilir_m2),
      birim_fiyat: Number.isFinite(Number(satir.birim_fiyat))
        ? Number(satir.birim_fiyat)
        : null,
      grup_toplami: sayi(satir.net_tutar),
      baglanti_no: null,
      fiyat_durumu: Number.isFinite(Number(satir.birim_fiyat)) ? 'bulundu' : 'eksik',
    })
  }
  return [...gruplar.values()]
}
