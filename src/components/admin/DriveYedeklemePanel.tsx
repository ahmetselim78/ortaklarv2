import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, CalendarClock, CheckCircle2, CloudUpload, DatabaseBackup,
  HardDrive, Loader2, Play, RefreshCw, ShieldCheck, UserRoundCog, XCircle,
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short',
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

export default function DriveYedeklemePanel() {
  const [runs, setRuns] = useState<BackupRun[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [switchingAccount, setSwitchingAccount] = useState(false)
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
        serviceName: 'Google Drive yedekleme servisi', localEdgeRuntimeHint: import.meta.env.DEV,
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
        serviceName: 'Google Drive hesap değiştirme servisi', localEdgeRuntimeHint: import.meta.env.DEV,
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

  return (
    <div className="min-h-full bg-slate-50/70 p-4 sm:p-6 xl:p-8">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-indigo-600"><ShieldCheck size={15} /> Şifreli dış yedek</div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Google Drive yedekleri</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Veritabanı, Auth/Storage bilgileri ve migration dosyaları Drive’a yüklenmeden önce şifrelenir.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile</button>
            <button type="button" onClick={() => void changeBackupAccount()} disabled={switchingAccount || automationState !== 'active'} title={automationState === 'active' ? 'Google Drive yedek hesabını değiştir' : 'Google Cloud yedekleme kurulumu tamamlandıktan sonra kullanılabilir'} className="inline-flex h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60">{switchingAccount ? <Loader2 size={16} className="animate-spin" /> : <UserRoundCog size={16} />} Google hesabını değiştir</button>
            <button type="button" onClick={() => void startBackup()} disabled={starting || latest?.status === 'running'} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Şimdi yedek al</button>
          </div>
        </header>

        {error && <div role="alert" className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={19} className="shrink-0" /><span>{error}</span></div>}
        {notice && <div role="status" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={19} className="shrink-0" /><span>{notice}</span></div>}

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: CalendarClock,
              title: automationState === 'active' ? 'Otomatik aktif · Her gece 02:00' : automationState === 'checking' ? 'Otomatik durum kontrol ediliyor' : 'Otomatik kurulum bekliyor',
              text: automationState === 'active' ? 'Bilgisayarınız kapalı olsa bile Google Cloud, Europe/Istanbul saatine göre kendisi çalıştırır.' : 'Google Cloud dağıtımı tamamlanınca her gece 02:00’de kendiliğinden çalışacak.',
              tone: automationState === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
            },
            { icon: HardDrive, title: '7 günlük yedek', text: 'Yeni yükleme doğrulandıktan sonra en eski kayıt silinir.', tone: 'bg-blue-50 text-blue-700' },
            { icon: DatabaseBackup, title: '12 aylık yedek', text: 'Her ayın ilk başarılı yedeği aylık arşive kopyalanır.', tone: 'bg-emerald-50 text-emerald-700' },
          ].map(card => <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className={`grid h-10 w-10 place-items-center rounded-xl ${card.tone}`}><card.icon size={19} /></span><p className="mt-4 text-sm font-bold text-slate-900">{card.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{card.text}</p></div>)}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><CloudUpload size={18} /></span><div><h2 className="font-bold text-slate-900">Son yedekleme çalışmaları</h2><p className="text-xs text-slate-500">Son 20 otomatik ve manuel çalışma</p></div></div>
          {loading && runs.length === 0 ? <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-400"><Loader2 size={18} className="animate-spin" /> Kayıtlar yükleniyor…</div>
            : runs.length === 0 ? <p className="px-5 py-14 text-center text-sm text-slate-400">Henüz yedekleme çalışması yok.</p>
              : <div className="divide-y divide-slate-100">{runs.map(item => {
                const info = statusInfo[item.status]
                const StatusIcon = info.icon
                return <div key={item.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${info.classes}`}><StatusIcon size={13} className={item.status === 'running' ? 'animate-spin' : ''} />{info.label}</span><span className="text-xs font-semibold text-slate-500">{item.trigger_source === 'manual' ? 'Manuel' : 'Otomatik'}</span>{item.monthly_drive_file_id && <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700">Aylık kopya</span>}</div><p className="mt-2 truncate text-sm font-semibold text-slate-800">{item.drive_file_name ?? (item.status === 'running' ? 'Arşiv hazırlanıyor…' : 'Dosya oluşturulamadı')}</p>{item.error_message && <p className="mt-1 line-clamp-2 text-xs text-red-600">{item.error_message}</p>}</div>
                  <div className="text-xs text-slate-500 sm:text-right"><p>{formatDate(item.started_at)}</p><p className="mt-1">{item.duration_seconds ? `${item.duration_seconds} sn` : '—'}</p></div>
                  <div className="text-sm font-bold tabular-nums text-slate-700 sm:w-24 sm:text-right">{formatSize(item.size_bytes)}</div>
                </div>
              })}</div>}
        </section>
      </div>
    </div>
  )
}
