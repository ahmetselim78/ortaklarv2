import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CloudUpload,
  DatabaseBackup,
  Download,
  FileCheck2,
  FolderOpen,
  HardDrive,
  KeyRound,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserRoundCog,
  X,
  XCircle,
} from 'lucide-react'
import { functionErrorMessage } from '@/lib/edgeFunctionError'
import { supabase } from '@/lib/supabase'

interface BackupRun {
  id: string
  trigger_source: 'scheduled' | 'manual'
  status: 'running' | 'succeeded' | 'failed'
  started_at: string
  drive_file_name: string | null
  monthly_drive_file_id: string | null
  size_bytes: number | null
  duration_seconds: number | null
  error_message: string | null
}

interface AutomationStatus {
  configured?: boolean
  automatic?: boolean
  schedule?: string | null
  time_zone?: string | null
}

interface GuideProps {
  open: boolean
  onClose: () => void
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatSize(value: number | null) {
  if (value === null) return '—'
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value / 1024 / 1024)} MB`
}

const statusInfo = {
  running: { label: 'Çalışıyor', icon: Loader2, classes: 'bg-blue-50 text-blue-700 ring-blue-100' },
  succeeded: { label: 'Başarılı', icon: CheckCircle2, classes: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  failed: { label: 'Başarısız', icon: XCircle, classes: 'bg-red-50 text-red-700 ring-red-100' },
} as const

const guideSections = [
  {
    icon: CalendarClock,
    title: 'Normal kullanım',
    tone: 'bg-emerald-50 text-emerald-700',
    items: [
      'Sistem her gece saat 02:00’de otomatik olarak yedek alır.',
      'Bilgisayarınızın veya tarayıcınızın açık olması gerekmez.',
      'Sonuç başarılı olduğunda bu ekranda yeşil durum etiketi görünür.',
    ],
  },
  {
    icon: Play,
    title: 'Hemen yedek almak',
    tone: 'bg-blue-50 text-blue-700',
    items: [
      'Önemli bir işlemden önce “Şimdi yedek al” düğmesine basın.',
      'Durum önce “Çalışıyor”, tamamlandığında “Başarılı” olur.',
      'Yeni yedek doğrulanmadan eski yedekler silinmez.',
    ],
  },
  {
    icon: RotateCcw,
    title: 'Eski bir yedeğe dönmek',
    tone: 'bg-violet-50 text-violet-700',
    items: [
      'Google Drive’daki Yedekler > Günlük Yedekler klasöründen istediğiniz tarihli dosyayı seçin.',
      'Önce mevcut sistemin yeni bir yedeğini alın.',
      'Eski yedeği doğrudan canlı sisteme yazmayın; boş ve geçici bir Supabase projesinde doğrulayın.',
      'Kontroller tamamlandıktan sonra hangi verilerin canlı sisteme taşınacağına karar verin.',
    ],
  },
  {
    icon: UserRoundCog,
    title: 'Google hesabını değiştirmek',
    tone: 'bg-amber-50 text-amber-700',
    items: [
      '“Google hesabını değiştir” düğmesine basın ve yeni hesabı seçin.',
      'Sonraki yedekler yeni hesaba gönderilir; eski hesaptaki dosyalar taşınmaz.',
      'Hesap değişikliğinden sonra mutlaka manuel bir deneme yedeği alın.',
    ],
  },
]

function BackupGuideModal({ open, onClose }: GuideProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => closeButtonRef.current?.focus(), 50)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Kullanım kılavuzunu kapat"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-guide-title"
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-5 sm:px-7">
          <div className="flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white shadow-sm">
              <BookOpen size={21} />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-indigo-600">Yardım merkezi</p>
              <h2 id="backup-guide-title" className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                Google Drive yedekleri kullanım kılavuzu
              </h2>
              <p className="mt-1 text-sm text-slate-500">Günlük kullanım ve geri dönüş adımları</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-4 md:grid-cols-2">
            {guideSections.map(section => (
              <article key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${section.tone}`}>
                    <section.icon size={19} />
                  </span>
                  <h3 className="font-bold text-slate-900">{section.title}</h3>
                </div>
                <ol className="mt-4 space-y-3">
                  {section.items.map((item, index) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                        {index + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <KeyRound size={21} className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <h3 className="font-bold text-amber-950">Private anahtarı koruyun</h3>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  Yedek dosyaları şifrelidir ve yalnızca size ait <strong>age private anahtarı</strong> ile açılabilir.
                  Anahtarı Drive’a, e-postaya veya uygulama içine yüklemeyin. Ayrı ve güvenli bir konumda saklayın.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-800">
            <AlertCircle size={20} className="mt-0.5 shrink-0" />
            <p>
              Canlı sisteme geri dönüş veri kaybına yol açabilir. Restore işlemine başlamadan önce güncel yedek alın ve
              eski arşivi mutlaka izole bir test projesinde doğrulayın.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-100 bg-white px-5 py-4 sm:px-7">
          <p className="hidden text-xs text-slate-400 sm:block">Kılavuzu istediğiniz zaman yeniden açabilirsiniz.</p>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Anladım, kapat
          </button>
        </div>
      </section>
    </div>
  )
}

export default function DriveYedeklemePanel() {
  const [runs, setRuns] = useState<BackupRun[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [automationState, setAutomationState] = useState<'checking' | 'active' | 'pending'>('checking')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(() => {
    const changed = new URL(window.location.href).searchParams.get('driveAccountChanged')
    if (changed === '1') return 'Google Drive yedek hesabı değiştirildi. Sonraki yedekler yeni hesaba gönderilecek.'
    if (changed === '0') return 'Google hesap değiştirme işlemi tamamlanmadı.'
    return null
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await supabase
      .from('drive_backup_runs')
      .select('id, trigger_source, status, started_at, drive_file_name, monthly_drive_file_id, size_bytes, duration_seconds, error_message')
      .order('started_at', { ascending: false })
      .limit(20)
    if (loadError) setError(loadError.message)
    else setRuns((data ?? []) as BackupRun[])
    const { data: automation } = await supabase.functions.invoke<AutomationStatus>('drive-backup-admin', {
      body: { operation: 'status' },
    })
    setAutomationState(automation?.configured && automation?.automatic ? 'active' : 'pending')
    setLoading(false)
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  useEffect(() => {
    const url = new URL(window.location.href)
    const changed = url.searchParams.get('driveAccountChanged')
    if (!changed) return
    url.searchParams.delete('driveAccountChanged')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  const startBackup = async () => {
    setStarting(true)
    setError(null)
    setNotice(null)
    const { error: invokeError } = await supabase.functions.invoke('drive-backup-admin', {
      body: { operation: 'run' },
    })
    if (invokeError) {
      setError(await functionErrorMessage(invokeError, {
        serviceName: 'Google Drive yedekleme servisi',
        localEdgeRuntimeHint: import.meta.env.DEV,
      }))
    } else {
      setNotice('Yedekleme işi başlatıldı. Durum birkaç saniye içinde listede görünecek.')
      window.setTimeout(() => void load(), 3000)
    }
    setStarting(false)
  }

  const changeBackupAccount = async () => {
    const approved = window.confirm(
      'Google Drive yedek hesabını değiştirmek üzeresiniz. Sonraki yedekler seçeceğiniz yeni hesaba gönderilecek. Devam edilsin mi?',
    )
    if (!approved) return

    setSwitchingAccount(true)
    setError(null)
    setNotice(null)
    const returnUrl = new URL('/admin/yedekleme', window.location.origin).toString()
    const { data, error: invokeError } = await supabase.functions.invoke<{ auth_url?: string }>('drive-backup-admin', {
      body: { operation: 'change_account', return_url: returnUrl },
    })
    if (invokeError) {
      setError(await functionErrorMessage(invokeError, {
        serviceName: 'Google Drive hesap değiştirme servisi',
        localEdgeRuntimeHint: import.meta.env.DEV,
      }))
      setSwitchingAccount(false)
      return
    }
    if (!data?.auth_url?.startsWith('https://accounts.google.com/')) {
      setError('Google hesap seçim ekranı açılamadı.')
      setSwitchingAccount(false)
      return
    }
    window.location.assign(data.auth_url)
  }

  const latest = runs[0]
  const latestSuccessful = runs.find(run => run.status === 'succeeded')
  const LatestIcon = latest ? statusInfo[latest.status].icon : CloudUpload
  const latestTone = latest?.status === 'failed'
    ? 'border-red-200 bg-gradient-to-br from-red-950 to-slate-950'
    : latest?.status === 'running'
      ? 'border-blue-200 bg-gradient-to-br from-blue-950 to-slate-950'
      : 'border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950'

  return (
    <div className="min-h-full bg-slate-50/70 p-4 sm:p-6 xl:p-8">
      <BackupGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />

      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
              <ShieldCheck size={15} /> Şifreli dış yedek
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Google Drive yedekleri</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Yedekleme durumunu kontrol edin, gerektiğinde hemen yedek alın ve geçmiş çalışmaları inceleyin.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100"
            >
              <BookOpen size={17} /> Kullanım kılavuzu
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Yedekleme kayıtlarını yenile"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
            <button
              type="button"
              onClick={() => void startBackup()}
              disabled={starting || latest?.status === 'running' || automationState !== 'active'}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Şimdi yedek al
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle size={19} className="shrink-0" /><span>{error}</span>
          </div>
        )}
        {notice && (
          <div role="status" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 size={19} className="shrink-0" /><span>{notice}</span>
          </div>
        )}

        <section className={`overflow-hidden rounded-3xl border p-5 text-white shadow-lg sm:p-7 ${latestTone}`}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <LatestIcon size={23} className={latest?.status === 'running' ? 'animate-spin' : ''} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/55">Son durum</p>
                <h2 className="mt-1 text-xl font-bold sm:text-2xl">
                  {loading && !latest
                    ? 'Yedek durumu kontrol ediliyor'
                    : latest?.status === 'succeeded'
                      ? 'Son yedek başarıyla tamamlandı'
                      : latest?.status === 'running'
                        ? 'Yedekleme şu anda devam ediyor'
                        : latest?.status === 'failed'
                          ? 'Son yedekleme tamamlanamadı'
                          : 'Henüz yedek alınmadı'}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
                  {latest?.status === 'failed'
                    ? 'Hata ayrıntısını aşağıdaki geçmiş listesinden inceleyin ve tekrar denemeden önce nedeni giderin.'
                    : automationState === 'active'
                      ? 'Otomatik yedekleme etkin. Sistem her gece 02:00’de kendiliğinden çalışır.'
                      : 'Otomatik yedekleme yapılandırması henüz hazır görünmüyor.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[430px]">
              <div className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Son başarılı</p>
                <p className="mt-2 text-sm font-semibold">{latestSuccessful ? formatDate(latestSuccessful.started_at) : '—'}</p>
              </div>
              <div className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Dosya boyutu</p>
                <p className="mt-2 text-sm font-semibold">{formatSize(latestSuccessful?.size_bytes ?? null)}</p>
              </div>
              <div className="col-span-2 rounded-2xl bg-white/8 p-4 ring-1 ring-white/10 sm:col-span-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Sonraki otomatik</p>
                <p className="mt-2 text-sm font-semibold">{automationState === 'active' ? 'Bu gece 02:00' : 'Bekliyor'}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <CalendarClock size={19} />
            </span>
            <p className="mt-4 text-sm font-bold text-emerald-950">
              {automationState === 'active' ? 'Otomatik yedekleme açık' : 'Otomatik kurulum bekliyor'}
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-800/75">Her gece 02:00 · Europe/Istanbul</p>
          </article>

          <article className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-700">
              <HardDrive size={19} />
            </span>
            <p className="mt-4 text-sm font-bold text-blue-950">7 günlük yedek korunur</p>
            <p className="mt-1 text-xs leading-5 text-blue-800/75">Yeni dosya doğrulandıktan sonra en eski günlük kayıt kaldırılır.</p>
          </article>

          <article className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700">
              <DatabaseBackup size={19} />
            </span>
            <p className="mt-4 text-sm font-bold text-violet-950">12 aylık arşiv korunur</p>
            <p className="mt-1 text-xs leading-5 text-violet-800/75">Her ayın ilk başarılı yedeği ayrıca aylık klasöre kopyalanır.</p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600">
                  <CloudUpload size={18} />
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">Yedekleme geçmişi</h2>
                  <p className="text-xs text-slate-500">Son 20 otomatik ve manuel çalışma</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800"
              >
                Bir yedeği nasıl geri yüklerim? <ArrowRight size={14} />
              </button>
            </div>

            {loading && runs.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-400">
                <Loader2 size={18} className="animate-spin" /> Kayıtlar yükleniyor…
              </div>
            ) : runs.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <CloudUpload size={28} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-600">Henüz yedekleme çalışması yok</p>
                <p className="mt-1 text-xs text-slate-400">İlk yedeği üstteki düğmeyle başlatabilirsiniz.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {runs.map(item => {
                  const info = statusInfo[item.status]
                  const StatusIcon = info.icon
                  return (
                    <div key={item.id} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50/70 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${info.classes}`}>
                            <StatusIcon size={13} className={item.status === 'running' ? 'animate-spin' : ''} />
                            {info.label}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            {item.trigger_source === 'manual' ? 'Manuel' : 'Otomatik'}
                          </span>
                          {item.monthly_drive_file_id && (
                            <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700">Aylık kopya</span>
                          )}
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold text-slate-800">
                          {item.drive_file_name ?? (item.status === 'running' ? 'Arşiv hazırlanıyor…' : 'Dosya oluşturulamadı')}
                        </p>
                        {item.error_message && <p className="mt-1 line-clamp-2 text-xs text-red-600">{item.error_message}</p>}
                      </div>
                      <div className="text-xs text-slate-500 sm:text-right">
                        <p>{formatDate(item.started_at)}</p>
                        <p className="mt-1">{item.duration_seconds !== null ? `${item.duration_seconds} sn` : '—'}</p>
                      </div>
                      <div className="text-sm font-bold tabular-nums text-slate-700 sm:w-24 sm:text-right">
                        {formatSize(item.size_bytes)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                  <LockKeyhole size={19} />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Yedekler şifreli</h2>
                  <p className="text-xs text-slate-500">Drive’a açık veri gönderilmez</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-2.5 text-xs leading-5 text-slate-600">
                  <FileCheck2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                  Boyut ve SHA-256 bütünlük kontrolü yapılır.
                </div>
                <div className="flex items-start gap-2.5 text-xs leading-5 text-slate-600">
                  <KeyRound size={15} className="mt-0.5 shrink-0 text-amber-600" />
                  Dosyalar yalnız size ait private anahtarla açılır.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900">Yedek hesabı</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Yedeklerin gönderildiği Google hesabını değiştirebilirsiniz.
              </p>
              <button
                type="button"
                onClick={() => void changeBackupAccount()}
                disabled={switchingAccount || automationState !== 'active'}
                title={automationState === 'active' ? 'Google Drive yedek hesabını değiştir' : 'Yedekleme kurulumu tamamlandıktan sonra kullanılabilir'}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {switchingAccount ? <Loader2 size={15} className="animate-spin" /> : <UserRoundCog size={15} />}
                Google hesabını değiştir
              </button>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
              <div className="flex items-start gap-3">
                <FolderOpen size={19} className="mt-0.5 shrink-0 text-indigo-700" />
                <div>
                  <p className="text-sm font-bold text-indigo-950">Dosyaları nerede bulurum?</p>
                  <p className="mt-1 text-xs leading-5 text-indigo-800/75">Google Drive → Yedekler → Günlük Yedekler</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-indigo-700 hover:text-indigo-900"
              >
                <Download size={14} /> İndirme ve geri dönüş adımları
              </button>
            </div>
          </aside>
        </section>
      </div>
    </div>
  )
}
