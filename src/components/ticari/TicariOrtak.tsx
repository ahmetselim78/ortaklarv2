import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Clock3,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { SurumDurumu, TicariMod } from '@/types/ticari'

export function TicariHata({ mesaj }: { mesaj: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertCircle size={18} className="mt-0.5 shrink-0" />
      <span>{mesaj}</span>
    </div>
  )
}

export function YenileButonu({ onClick, yukleniyor }: { onClick: () => void; yukleniyor: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={yukleniyor}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
    >
      <RefreshCw size={15} className={cn(yukleniyor && 'animate-spin')} />
      Yenile
    </button>
  )
}

const surumStilleri: Record<SurumDurumu, string> = {
  taslak: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  yayinda: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  arsiv: 'bg-gray-100 text-gray-600 ring-gray-500/20',
}

export function SurumRozeti({ durum }: { durum: SurumDurumu }) {
  return (
    <span className={cn('inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset', surumStilleri[durum] ?? surumStilleri.arsiv)}>
      {durum === 'yayinda' ? 'Yayında' : durum === 'taslak' ? 'Taslak' : 'Arşiv'}
    </span>
  )
}

const modBilgisi: Record<TicariMod, { label: string; aciklama: string; className: string; icon: typeof CircleDot }> = {
  hazirlik: {
    label: 'Hazırlık',
    aciklama: 'Ticari veriler hazırlanıyor; yeni motor henüz sipariş kaydetmiyor.',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
    icon: Clock3,
  },
  golge: {
    label: 'Gölge çalışma',
    aciklama: 'Kanonik motor sonuçları ölçüyor; fiyat revizyonu veya cari hareket oluşturmuyor.',
    className: 'border-violet-200 bg-violet-50 text-violet-800',
    icon: CircleDot,
  },
  aktif: {
    label: 'Aktif',
    aciklama: 'Fiyatlı sipariş ve cari transaction akışı etkin.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  bakim: {
    label: 'Bakım',
    aciklama: 'Yeni ticari belge ve fiyat revizyonları kapalı; legacy akışa dönüş yapılmaz.',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: ShieldAlert,
  },
}

export function TicariModBanner({ mod }: { mod: TicariMod | null | undefined }) {
  if (!mod) return null
  const bilgi = modBilgisi[mod]
  const Icon = bilgi.icon
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', bilgi.className)}>
      <Icon size={19} className="mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">Ticari mod: {bilgi.label}</p>
        <p className="mt-0.5 text-xs opacity-80">{bilgi.aciklama}</p>
      </div>
    </div>
  )
}

export function OzetKarti({
  baslik,
  deger,
  alt,
  icon,
}: {
  baslik: string
  deger: string | number
  alt?: string
  icon?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-950/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{baslik}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{deger}</p>
          {alt && <p className="mt-1 text-xs text-gray-500">{alt}</p>}
        </div>
        {icon && <span className="rounded-lg bg-blue-50 p-2 text-blue-600">{icon}</span>}
      </div>
    </div>
  )
}

export function TabloBos({ children }: { children: ReactNode }) {
  return <div className="px-4 py-12 text-center text-sm text-gray-500">{children}</div>
}

