import type { TedarikKapsami } from '@/types/cari'

export type TedarikStokProfilTuru = 'cam' | 'cita' | 'sarf'

export interface TedarikStokKapsamiAdayi {
  stok_kodu: string
  profil_turu: TedarikStokProfilTuru
}

export const TEDARIK_KAPSAMI_SECENEKLERI: Array<{
  deger: TedarikKapsami
  etiket: string
  aciklama: string
}> = [
  {
    deger: 'cam',
    etiket: 'Cam',
    aciklama: 'Düz cam ve cam hammaddeleri',
  },
  {
    deger: 'cita',
    etiket: 'Çıta',
    aciklama: 'Alüminyum ve diğer ara boşluk çıtaları',
  },
  {
    deger: 'yan_malzeme',
    etiket: 'Yan malzeme / sarf',
    aciklama: 'Butil, silikon, kimyasal ve diğer sarflar',
  },
  {
    deger: 'temper_hizmeti',
    etiket: 'Temper hizmeti',
    aciklama: 'Dışarıdan alınan temperleme hizmeti',
  },
]

const kapsamEtiketleri = new Map(
  TEDARIK_KAPSAMI_SECENEKLERI.map((secenek) => [secenek.deger, secenek.etiket]),
)

export function tedarikKapsamiEtiketi(kapsam: TedarikKapsami) {
  return kapsamEtiketleri.get(kapsam) ?? kapsam
}

export function stokProfilininTedarikKapsami({
  stok_kodu,
  profil_turu,
}: TedarikStokKapsamiAdayi): TedarikKapsami {
  if (stok_kodu === 'HIZMET-TEMPER-DIS') return 'temper_hizmeti'
  return profil_turu === 'sarf' ? 'yan_malzeme' : profil_turu
}

export function stokKategorisininTedarikKapsami(
  kategori: 'cam' | 'cita' | 'yan_malzeme',
  hizmetTuru?: string | null,
): TedarikKapsami {
  if (hizmetTuru === 'temper_dis_hizmet') return 'temper_hizmeti'
  return kategori
}

export function tedarikciStokKapsaminaUyar(
  kapsamlar: TedarikKapsami[] | null | undefined,
  stok: TedarikStokKapsamiAdayi,
) {
  return (kapsamlar ?? []).includes(stokProfilininTedarikKapsami(stok))
}

export function tedarikKapsamiOzetMetni(
  kapsamlar: TedarikKapsami[] | null | undefined,
) {
  const etiketler = (kapsamlar ?? []).map(tedarikKapsamiEtiketi)
  if (etiketler.length === 0) return 'Ürün kapsamı tanımlanmamış'
  if (etiketler.length === 1) return etiketler[0]
  if (etiketler.length === 2) return `${etiketler[0]} ve ${etiketler[1]}`
  return `${etiketler.slice(0, -1).join(', ')} ve ${etiketler.at(-1)}`
}

export function tedarikKapsamlariniTemizle(
  tipi: 'musteri' | 'tedarikci',
  kapsamlar: TedarikKapsami[] | null | undefined,
) {
  if (tipi !== 'tedarikci') return []
  const izinli = new Set(TEDARIK_KAPSAMI_SECENEKLERI.map((secenek) => secenek.deger))
  return [...new Set((kapsamlar ?? []).filter((kapsam) => izinli.has(kapsam)))]
}
