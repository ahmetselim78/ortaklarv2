import type { CariTipi } from '@/types/cari'

const borcGorunumu = {
  renk: 'text-rose-700',
  zemin: 'bg-rose-50',
}

const alacakGorunumu = {
  renk: 'text-emerald-700',
  zemin: 'bg-emerald-50',
}

const dengeliGorunum = {
  etiket: 'Hesap dengede',
  renk: 'text-slate-600',
  zemin: 'bg-slate-50',
}

export function cariBakiyeDurumu(net: number, tur: CariTipi) {
  if (tur === 'tedarikci') {
    if (net < 0) {
      return { etiket: 'Tedarikçiye borcumuz', ...borcGorunumu }
    }
    if (net > 0) {
      return { etiket: 'Tedarikçiden alacağımız', ...alacakGorunumu }
    }
    return dengeliGorunum
  }

  if (net > 0) return { etiket: 'Müşteri borcu', ...borcGorunumu }
  if (net < 0) return { etiket: 'Müşteri alacağı', ...alacakGorunumu }
  return dengeliGorunum
}

export function acilisBakiyesiYonEtiketleri(tur: CariTipi | null) {
  if (tur === 'tedarikci') {
    return {
      borc: 'Borç · tedarikçiden alacağımız',
      alacak: 'Alacak · tedarikçiye borcumuz',
    }
  }
  if (tur === 'musteri') {
    return {
      borc: 'Borç · müşteri borcu',
      alacak: 'Alacak · müşteri kredisi',
    }
  }
  return {
    borc: 'Borç',
    alacak: 'Alacak',
  }
}
