import { useState } from 'react'
import {
  BookOpen,
  CircleDollarSign,
  DatabaseZap,
  Package,
  ShieldCheck,
  Truck,
  Wrench,
} from 'lucide-react'
import MaliyetFiyatYonetimiSekmesi from './MaliyetFiyatYonetimiSekmesi'
import StokBakimPaneli from './StokBakimPaneli'
import TedarikciKritikYonetimPaneli from './TedarikciKritikYonetimPaneli'
import TicariKatalogPaneli from './TicariKatalogPaneli'
import StokPage from '@/pages/StokPage'

type AltSekme = 'stok-yonetimi' | 'tedarikciler' | 'maliyet-fiyatlari' | 'ticari-katalog' | 'stok-bakimi'

const SEKMELER = [
  {
    id: 'stok-yonetimi',
    etiket: 'Stok Yönetimi',
    aciklama: 'Kart, hareket, durum ve silme işlemleri',
    icon: Package,
  },
  {
    id: 'tedarikciler',
    etiket: 'Tedarikçi Durumu',
    aciklama: 'Pasifleştirme ve kritik bağlantılar',
    icon: Truck,
  },
  {
    id: 'maliyet-fiyatlari',
    etiket: 'Maliyet Alış Fiyatları',
    aciklama: 'Tarihçeli fiyat düzeltmeleri',
    icon: CircleDollarSign,
  },
  {
    id: 'ticari-katalog',
    etiket: 'Ticari Katalog',
    aciklama: 'Satış ve maliyet kapsamı',
    icon: BookOpen,
  },
  {
    id: 'stok-bakimi',
    etiket: 'Stok Bakımı',
    aciklama: 'Referans ve katalog onarımı',
    icon: Wrench,
  },
] as const

export default function StokCariMaliyetPaneli() {
  const [altSekme, setAltSekme] = useState<AltSekme>('stok-yonetimi')

  return (
    <div className="flex min-h-full flex-col bg-slate-50/60">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-5 sm:px-6 xl:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-100">
              <DatabaseZap size={21} />
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-950">Stok, Cari ve Maliyet</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                Stok kataloğunu, maliyet alış fiyatlarını ve tedarikçi durumunu etkileyen
                kritik yönetim işlemlerini tek alanda kontrol edin.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <ShieldCheck size={15} />
            Admin + iki adımlı doğrulama
          </span>
        </div>

        <div className="mt-5 max-w-full overflow-x-auto">
          <div className="flex w-max min-w-full gap-2" role="tablist" aria-label="Stok, cari ve maliyet yönetimi">
            {SEKMELER.map(({ id, etiket, aciklama, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={altSekme === id}
                onClick={() => setAltSekme(id)}
                className={`min-w-[190px] flex-1 rounded-xl border px-4 py-3 text-left transition ${
                  altSekme === id
                    ? 'border-violet-200 bg-violet-50 text-violet-950 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50/40'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Icon size={16} />
                  {etiket}
                </span>
                <span className="mt-1 block text-[11px] leading-4 opacity-75">{aciklama}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {altSekme === 'stok-yonetimi' ? (
        <StokPage yonetimModu />
      ) : altSekme === 'tedarikciler' ? (
        <TedarikciKritikYonetimPaneli />
      ) : altSekme === 'maliyet-fiyatlari' ? (
        <MaliyetFiyatYonetimiSekmesi />
      ) : altSekme === 'ticari-katalog' ? (
        <TicariKatalogPaneli />
      ) : (
        <StokBakimPaneli />
      )}
    </div>
  )
}
